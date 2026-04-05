import Store from 'electron-store';
import net from 'net';
import { HostsManager } from './hosts-manager.js';
import { ProcessMonitor } from './process-monitor.js';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Notification, BrowserWindow, app } from 'electron';

interface SessionData {
    id: string;
    start_time: string;
    end_time: string;
    locked_mode: boolean;
    domains: string[];
    apps: string[];
}

const PIPE_NAME = '\\\\.\\pipe\\DistractionBlockerPipe';

export class SessionManager {
    private store = new Store();
    private hostsManager = new HostsManager();
    private processMonitor = new ProcessMonitor();
    private terminatorProcess: ChildProcess | null = null;
    private splashOverlay: BrowserWindow | null = null;
    private stdoutBuffer: string = '';
    private engineProcess: ChildProcess | null = null;

    private sendToNativeService(command: string, domains: string[], apps: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            const client = net.createConnection(PIPE_NAME, () => {
                console.log(`[NATIVE IPC] Connected. Sending command: ${command}`);
                const msg = JSON.stringify({ command, websites: domains, apps }) + '\r\n';
                client.write(msg);
            });

            client.on('data', (data) => {
                console.log('[NATIVE IPC] Received:', data.toString());
                client.end();
                resolve(true);
            });

            client.on('error', (err) => {
                console.error('[NATIVE IPC] Error connecting to native service (is it installed/running?):', err.message);
                resolve(false);
            });
        });
    }

    private async ensureNativeEngineRunning() {
        console.log('[SESSION] Verifying Native Engine availability...');
        
        // 1. Check if the engine is already active via pipe reachability
        const isAlreadyLive = await this.sendToNativeService('PING', [], []);
        if (isAlreadyLive) {
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
        const isSuccess = await this.sendToNativeService('START_BLOCK', data.domains, data.apps);
        return { nativeService: isSuccess };
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
                            body: `Focus Agent restricted access to "${domain}".`,
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

    public launchSplashOverlay() {
        if (this.splashOverlay) return;

        try {
            this.splashOverlay = new BrowserWindow({
                fullscreen: true,
                frame: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                resizable: false,
                transparent: false,
                backgroundColor: '#0f172a', // Slate-900 fallback
                webPreferences: { 
                    nodeIntegration: true, 
                    contextIsolation: false 
                }
            });
            
            this.splashOverlay.setMenu(null);
            this.splashOverlay.setAlwaysOnTop(true, 'screen-saver');

            let splashFile = path.join(app.getAppPath(), 'resources', 'splash.html');
            if (!fs.existsSync(splashFile)) {
                splashFile = path.join(process.cwd(), 'resources', 'splash.html');
            }
            if (!fs.existsSync(splashFile)) {
                splashFile = path.join(process.resourcesPath || '', 'resources', 'splash.html');
            }

            this.splashOverlay.loadFile(splashFile).catch(err => {
                console.error('[SPLASH] Load error:', err);
                this.splashOverlay?.destroy();
            });
            
            setTimeout(() => {
                if (this.splashOverlay && !this.splashOverlay.isDestroyed()) {
                    this.splashOverlay.close();
                }
                this.splashOverlay = null;
            }, 10000);
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

        if (session.locked_mode && new Date(session.end_time) > new Date()) {
            throw new Error('Locked session cannot be ended early.');
        }

        console.log('[SESSION] Ending session. Restoring systems...');
        try { this.processMonitor.stop(); } catch (e) {}
        try { this.terminatorProcess?.kill(); } catch (e) {}
        this.terminatorProcess = null;

        const success = await this.sendToNativeService('STOP_BLOCK', [], []);
        await this.hostsManager.restore();

        const history = this.getHistory();
        history.unshift({ ...session, ended_at: new Date().toISOString() });
        this.saveHistory(history.slice(0, 50));

        this.store.delete('currentSession');
    }

    public async forceDeepClean() {
        this.processMonitor.stop();
        try { this.terminatorProcess?.kill(); } catch (e) {}
        this.terminatorProcess = null;
        await this.hostsManager.restore();
        await this.sendToNativeService('STOP_BLOCK', [], []);
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
