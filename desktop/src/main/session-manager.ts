import Store from 'electron-store';
import net from 'net';
import { HostsManager } from './hosts-manager.js';
import { ProcessMonitor } from './process-monitor.js';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Notification, BrowserWindow, app, screen } from 'electron';

interface SessionData {
    id: string;
    start_time: string;
    end_time: string;
    locked_mode: boolean;
    domains: string[];
    apps: string[];
}

type NativeCommand = 'PING' | 'START_BLOCK' | 'STOP_BLOCK';

interface NativeServiceResponse {
    status: 'ok' | 'error';
    requestId?: string;
    command?: string;
    message?: string;
    warnings?: string[];
}

interface NativeServiceResult {
    ok: boolean;
    response?: NativeServiceResponse;
    message?: string;
    warnings: string[];
}

const PIPE_NAME = '\\\\.\\pipe\\DistractionBlockerPipe';
const NATIVE_IPC_TIMEOUT_MS = 5000;
const SPLASH_OVERLAY_DURATION_MS = 10000;

export class SessionManager {
    private store = new Store();
    private hostsManager = new HostsManager();
    private processMonitor = new ProcessMonitor();
    private terminatorProcess: ChildProcess | null = null;
    private splashOverlays: BrowserWindow[] = [];
    private stdoutBuffer: string = '';
    private engineProcess: ChildProcess | null = null;

    private sendToNativeService(command: NativeCommand, domains: string[], apps: string[]): Promise<NativeServiceResult> {
        return new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let settled = false;
            let responseBuffer = '';
            let client: net.Socket;
            let timeout: NodeJS.Timeout;

            const finish = (result: NativeServiceResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(result);
            };

            timeout = setTimeout(() => {
                client.destroy();
                finish({
                    ok: false,
                    message: `Native service timed out after ${NATIVE_IPC_TIMEOUT_MS}ms while handling ${command}.`,
                    warnings: [],
                });
            }, NATIVE_IPC_TIMEOUT_MS);

            client = net.createConnection(PIPE_NAME, () => {
                console.log(`[NATIVE IPC] Connected. Sending command: ${command}`);
                const msg = JSON.stringify({
                    protocolVersion: 1,
                    requestId,
                    command,
                    websites: domains,
                    apps,
                }) + '\r\n';
                client.write(msg);
            });

            client.on('data', (data) => {
                responseBuffer += data.toString();
                if (!responseBuffer.includes('\n')) return;

                const line = responseBuffer.split(/\r?\n/)[0];
                console.log('[NATIVE IPC] Received:', line);

                try {
                    const response = JSON.parse(line) as NativeServiceResponse;
                    const warnings = Array.isArray(response.warnings) ? response.warnings : [];
                    client.end();
                    finish({
                        ok: response.status === 'ok' && (!response.requestId || response.requestId === requestId),
                        response,
                        message: response.message,
                        warnings,
                    });
                } catch (err) {
                    client.destroy();
                    finish({
                        ok: false,
                        message: `Native service returned invalid JSON for ${command}.`,
                        warnings: [String(err)],
                    });
                }
            });

            client.on('error', (err) => {
                console.error('[NATIVE IPC] Error connecting to native service (is it installed/running?):', err.message);
                finish({ ok: false, message: err.message, warnings: [] });
            });
        });
    }

    private async ensureNativeEngineRunning() {
        console.log('[SESSION] Verifying Native Engine availability...');
        
        // 1. Check if the engine is already active via pipe reachability
        const isAlreadyLive = await this.sendToNativeService('PING', [], []);
        if (isAlreadyLive.ok) {
            console.log('[SESSION] Native Engine is already active (via Service or background process).');
            return;
        }

        // 2. Not responding? Let's spawn it from our local resources.
        // We'll search in the common production and dev locations.
        let enginePath = path.join(app.getAppPath(), 'resources', 'blocker-engine.exe');
        if (!fs.existsSync(enginePath)) {
            enginePath = path.join(process.cwd(), 'resources', 'blocker-engine.exe');
        }
        if (!fs.existsSync(enginePath)) {
            enginePath = path.join(process.resourcesPath || '', 'resources', 'blocker-engine.exe');
        }

        if (!fs.existsSync(enginePath)) {
            console.warn('[SESSION] CRITICAL_ERROR: blocker-engine.exe not found in resources. Blocking logic will fail.');
            return;
        }

        console.log(`[SESSION] Spawning Native Engine: ${enginePath}`);
        try {
            this.engineProcess = spawn(enginePath, ['--interactive'], {
                detached: true,
                windowsHide: true,
                shell: false
            });
            
            this.engineProcess.unref(); // Allow Electron to exit independently if needed
            
            this.engineProcess.on('error', (err) => {
                console.error('[SESSION] Native Engine failed to start:', err);
            });
            
            // Wait 1 second for the pipe to manifest
            await new Promise(r => setTimeout(r, 1000));
            console.log('[SESSION] Native Engine orchestration complete.');
        } catch (err) {
            console.error('[SESSION] Failed to bootstrap Native Engine:', err);
        }
    }

    public async initialize() {
        console.log('[SESSION] Initializing session manager and checking for active sessions...');
        
        // Connect ProcessMonitor to the Splash Overlay
        this.processMonitor.onBlocked = (name) => {
            console.log(`[SESSION] Blocked App Signal: ${name}. Launching Overlay.`);
            this.launchSplashOverlay();
        };

        // Bootstrap Native Core BEFORE applying blocking
        await this.ensureNativeEngineRunning();

        const status = await this.getStatus();
        if (status.active) {
            const session = this.store.get('currentSession') as SessionData | null;
            if (session) {
                await this.applyBlocking(session);
            }
        }

        this.startSignalWatcher();
    }

    private startSignalWatcher() {
        const signalDir = 'C:\\ProgramData\\FocusAgent';
        const signalPath = path.join(signalDir, 'signals.log');

        try {
            if (!fs.existsSync(signalDir)) {
                fs.mkdirSync(signalDir, { recursive: true });
            }
            if (!fs.existsSync(signalPath)) {
                fs.writeFileSync(signalPath, '');
            }

            console.log(`[SESSION] Starting Signal Watcher on: ${signalPath}`);
            
            // fs.watch can be finicky on Windows, so we watch the file for change events
            fs.watch(signalPath, (eventType) => {
                if (eventType === 'change') {
                    console.log('[SESSION] Real-time Service Signal detected. Launching Overlay.');
                    this.launchSplashOverlay();
                }
            });
        } catch (err) {
            console.error('[SESSION] Signal Watcher failed to start:', err);
        }
    }

    public async startSession(data: SessionData) {
        this.store.set('currentSession', data);
        const results = await this.applyBlocking(data);
        return { success: results.nativeService, results };
    }

    private async applyBlocking(data: SessionData) {
        console.log(`[SESSION] Applying NATIVE multi-level blocking for ${data.domains.length} domains and ${data.apps.length} apps.`);
        this.processMonitor.start(data.apps);
        this.startTabTerminator(data.domains);
        const nativeService = await this.sendToNativeService('START_BLOCK', data.domains, data.apps);
        if (!nativeService.ok) {
            console.warn('[SESSION] Native service reported blocking failure:', nativeService.message);
        }
        nativeService.warnings.forEach((warning) => console.warn('[SESSION] Native service warning:', warning));
        return { nativeService: nativeService.ok, nativeServiceDetail: nativeService };
    }

    private startTabTerminator(domains: string[]) {
        if (this.terminatorProcess) {
            try { this.terminatorProcess.kill(); } catch (e) {}
        }
        
        const enabled = this.store.get('enableTabTerminator') !== false;
        if (!enabled || domains.length === 0) return;

        console.log('[SESSION] Starting Active Tab Terminator...');
        
        // Find the .exe - search in resources, then app root
        let exePath = path.join(app.getAppPath(), 'resources', 'TabTerminator.exe');
        if (!fs.existsSync(exePath)) {
            exePath = path.join(process.cwd(), 'resources', 'TabTerminator.exe');
        }
        if (!fs.existsSync(exePath)) {
             // Fallback for production paths
             exePath = path.join(process.resourcesPath || '', 'resources', 'TabTerminator.exe');
        }

        console.log(`[SESSION] Spawning Terminator: ${exePath}`);

        try {
            this.terminatorProcess = spawn(exePath, domains, {
                windowsHide: false, // Changed to false + /target:exe for maximum reliability
                detached: false
            });
            
            this.terminatorProcess.stdout?.on('data', (d) => {
                this.stdoutBuffer += d.toString();
                const lines = this.stdoutBuffer.split('\n');
                this.stdoutBuffer = lines.pop() || ''; // Keep partial line in buffer

                for (let line of lines) {
                    const output = line.trim();
                    if (!output) continue;
                    console.log(`[TAB TERM] ${output}`);

                    if (output.includes('BLOCKING')) {
                        const match = output.match(/\[(.*?)\]/);
                        const domain = match ? match[1] : 'distracting site';
                        new Notification({
                            title: '🚫 Distraction Terminated',
                            body: `NoEscape restricted access to "${domain}".`,
                            silent: false,
                        }).show();
                    }

                    if (output.includes('[SPLASH]')) {
                        this.launchSplashOverlay();
                    }
                }
            });

            this.terminatorProcess.on('error', (err) => {
                console.error('[SESSION] TabTerminator Process Error:', err);
            });
        } catch (err) {
            console.error('[SESSION] Failed to spawn TabTerminator:', err);
        }
    }

    private splashTimeout: NodeJS.Timeout | null = null;

    private scheduleSplashOverlayClose() {
        if (this.splashTimeout) clearTimeout(this.splashTimeout);
        this.splashTimeout = setTimeout(() => {
            this.closeSplashOverlays();
        }, SPLASH_OVERLAY_DURATION_MS);
    }

    private closeSplashOverlays() {
        if (this.splashTimeout) {
            clearTimeout(this.splashTimeout);
            this.splashTimeout = null;
        }

        for (const overlay of this.splashOverlays) {
            if (!overlay.isDestroyed()) {
                overlay.close();
            }
        }
        this.splashOverlays = [];
    }

    private assertCurrentSessionCanBeEnded() {
        const session = this.store.get('currentSession') as SessionData | null;
        if (session?.locked_mode && new Date(session.end_time) > new Date()) {
            throw new Error('Locked session cannot be ended early.');
        }
    }

    public launchSplashOverlay() {
        const activeOverlays = this.splashOverlays.filter(overlay => !overlay.isDestroyed());
        if (activeOverlays.length > 0) {
            this.splashOverlays = activeOverlays;
            for (const overlay of activeOverlays) {
                overlay.show();
                overlay.setAlwaysOnTop(true, 'screen-saver');
                overlay.moveTop();
            }
            return;
        }

        try {
            let splashFile = path.join(app.getAppPath(), 'resources', 'splash.html');
            if (!fs.existsSync(splashFile)) {
                splashFile = path.join(process.cwd(), 'resources', 'splash.html');
            }
            if (!fs.existsSync(splashFile)) {
                splashFile = path.join(process.resourcesPath || '', 'resources', 'splash.html');
            }

            const displays = screen.getAllDisplays();
            this.splashOverlays = displays.map((display) => {
                const overlay = new BrowserWindow({
                    ...display.bounds,
                    frame: false,
                    fullscreen: true,
                    kiosk: true,
                    alwaysOnTop: true,
                    skipTaskbar: true,
                    resizable: false,
                    movable: false,
                    minimizable: false,
                    maximizable: false,
                    transparent: false,
                    backgroundColor: '#ffffff',
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });

                overlay.setMenu(null);
                overlay.setAlwaysOnTop(true, 'screen-saver');
                overlay.setVisibleOnAllWorkspaces(true);
                overlay.setBounds(display.bounds);
                overlay.setFullScreen(true);
                overlay.setKiosk(true);
                overlay.show();
                overlay.moveTop();
                overlay.once('ready-to-show', () => {
                    overlay.setBounds(display.bounds);
                    overlay.setFullScreen(true);
                    overlay.setKiosk(true);
                    overlay.show();
                    overlay.moveTop();
                });
                overlay.loadFile(splashFile).catch(err => {
                    console.error('[SPLASH] Load error:', err);
                    overlay.destroy();
                });
                overlay.once('closed', () => {
                    this.splashOverlays = this.splashOverlays.filter(item => item !== overlay);
                });

                return overlay;
            });

            this.scheduleSplashOverlayClose();
        } catch (e) {
            console.error('[SPLASH] Failed to create overlay:', e);
        }
    }

    public async getStatus() {
        try {
            const session = this.store.get('currentSession') as SessionData | null;
            if (!session) return { active: false };

            const now = new Date();
            const endTime = new Date(session.end_time);

            if (now > endTime) {
                console.log('[SESSION] Active session expired, ending automatically.');
                await this.endSession();
                return { active: false };
            }

            // Return with defaults to ensure UI doesn't break
            const status = {
                active: true,
                id: session.id,
                start_time: session.start_time,
                end_time: session.end_time,
                locked_mode: session.locked_mode,
                domains: session.domains || [],
                apps: session.apps || []
            };
            
            return status;
        } catch (err) {
            console.error('[SESSION] Error in getStatus:', err);
            return { active: false };
        }
    }

    public async endSession() {
        const session = this.store.get('currentSession') as SessionData | null;
        if (!session) return;

        this.assertCurrentSessionCanBeEnded();

        console.log('[SESSION] Ending session. Restoring systems...');
        try { this.processMonitor.stop(); } catch (e) {}
        try { this.terminatorProcess?.kill(); } catch (e) {}
        this.terminatorProcess = null;

        const success = await this.sendToNativeService('STOP_BLOCK', [], []);
        if (!success.ok) {
            console.warn('[SESSION] Native service reported cleanup failure:', success.message);
        }
        await this.hostsManager.restore();

        const history = this.getHistory();
        history.unshift({ ...session, ended_at: new Date().toISOString() });
        this.saveHistory(history.slice(0, 50));

        this.store.delete('currentSession');
    }

    public async forceDeepClean() {
        this.assertCurrentSessionCanBeEnded();

        this.processMonitor.stop();
        try { this.terminatorProcess?.kill(); } catch (e) {}
        this.terminatorProcess = null;
        await this.hostsManager.restore();
        const success = await this.sendToNativeService('STOP_BLOCK', [], []);
        if (!success.ok) {
            console.warn('[SESSION] Native service reported deep-clean failure:', success.message);
        }
        this.store.delete('currentSession');
    }

    public async syncBlocklist(data: { domains: string[], apps: string[] }) {
        const session = this.store.get('currentSession') as SessionData | null;
        if (session) {
            session.domains = data.domains;
            session.apps = data.apps;
            this.store.set('currentSession', session);
            await this.applyBlocking(session);
        }
    }

    public getBlocklists(): any[] {
        return (this.store.get('blocklists') as any[]) || [];
    }

    public saveBlocklists(lists: any[]) {
        this.store.set('blocklists', lists);
    }

    public getHistory(): any[] {
        return (this.store.get('history') as any[]) || [];
    }

    public saveHistory(history: any[]) {
        this.store.set('history', history);
    }
}
