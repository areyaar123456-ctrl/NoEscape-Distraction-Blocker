import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { HostsManager } from './hosts-manager.js';
import { ProcessMonitor } from './process-monitor.js';
import { SessionManager } from './session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sessionManager: SessionManager;
let isQuitting = false;
let backendProcess: ChildProcess | null = null;

const SYSTEM_FILTER = new Set([
    'svchost', 'runtimebroker', 'explorer', 'lsass', 'wininit', 'services', 'winlogon', 
    'csrss', 'chrome', 'msedge', 'electron', 'focalagent', 'searchindexer', 'searchapp', 
    'shellexperiencehost', 'startmenuexperiencehost', 'fontdrvhost', 'dwm', 'ctfmon', 
    'conhost', 'taskhostw', 'spoolsv', 'sihost', 'smartscreen', 'securityhealthservice',
    'memory compression', 'registry', 'system', 'idle', 'smss', 'wininit', 'winlogon',
    'services', 'lsass', 'fontdrvhost', 'fontdrvhost', 'dwm', 'conhost', 'searchindexer',
    'audiodg', 'taskhostw', 'spoolsv', 'sihost', 'smartscreen', 'securityhealthservice'
].map(s => s.toLowerCase()));

// --- Backend Orchestration ---
function startBackend() {
    const backendPath = isDev
        ? path.join(__dirname, '../../../backend/src/server.ts')
        : path.join((process as any).resourcesPath, 'backend', 'dist', 'server.js');

    console.log(`[CORE] Starting backend from: ${backendPath}`);

    // In dev we use tsx, in prod we use node
    const cmd = isDev ? 'npx' : 'node';
    const args = isDev ? ['tsx', `"${backendPath}"`] : [`"${backendPath}"`];

    backendProcess = spawn(cmd, args, {
        cwd: isDev ? path.join(__dirname, '../../../backend') : path.join((process as any).resourcesPath, 'backend'),
        shell: true,
        env: { ...process.env, PORT: '3001' }
    });

    backendProcess.stdout?.on('data', (data) => console.log(`[BACKEND] ${data}`));
    backendProcess.stderr?.on('data', (data) => console.error(`[BACKEND_ERR] ${data}`));

    backendProcess.on('close', (code) => {
        console.log(`[BACKEND] Process exited with code ${code}`);
    });

    // Optionally launch the local web dashboard for the user
    if (!isDev) {
        setTimeout(() => {
            shell.openExternal('http://localhost:3001').catch(() => {
                console.log('[CORE] Web dashboard not reachable yet, skipping auto-open.');
            });
        }, 5000); // Give backend time to start
    }
}
// -----------------------------


function createTray() {
    const iconPath = path.join(__dirname, '../../resources/icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);

    const updateTrayMenu = async () => {
        const status = await sessionManager.getStatus();

        // Fetch Live Blocklists
        let customBlocklists: any[] = [];
        try {
            customBlocklists = sessionManager.getBlocklists();
        } catch (e) {
            console.log('[TRAY] Could not fetch local blocklists for menu:', e);
        }

        const startQuickSession = async (minutes: number, locked = false, list?: any) => {
            const endTime = new Date(Date.now() + minutes * 60000).toISOString();

            const domains = list ? (list.blocked_domains?.map((d: any) => d.domain) || []) : ['youtube.com', 'reddit.com', 'twitter.com', 'facebook.com', 'instagram.com'];
            const apps = list ? (list.blocked_apps?.map((a: any) => a.process_name) || []) : [];

            await sessionManager.startSession({
                id: 'tray-' + Date.now(),
                start_time: new Date().toISOString(),
                end_time: endTime,
                locked_mode: locked,
                domains: domains,
                apps: apps
            });
            updateTrayMenu();
            mainWindow?.webContents.send('force-sync');
        };

        const createTimeSubmenu = (list?: any) => [
            { label: '5 Minutes (Break)', click: () => startQuickSession(5, false, list) },
            { label: '15 Minutes (Sprint)', click: () => startQuickSession(15, false, list) },
            { label: '25 Minutes (Pomodoro)', click: () => startQuickSession(25, false, list) },
            { label: '60 Minutes (Deep Work)', click: () => startQuickSession(60, false, list) },
            { label: '2 Hours (Marathon)', click: () => startQuickSession(120, false, list) },
        ];

        const customProfileMenus = customBlocklists.length > 0 ? customBlocklists.map(list => ({
            label: `Start: ${list.name}`,
            submenu: createTimeSubmenu(list)
        })) : [{ label: 'No Custom Profiles Found', enabled: false }];

        const contextMenu = Menu.buildFromTemplate([
            { label: 'NoEscape v1.0', enabled: false },
            { label: status.active ? '● Enforcement Active' : '○ Standby Mode', enabled: false },
            { type: 'separator' },
            { label: 'Launch Dashboard', click: () => mainWindow?.show() },
            { type: 'separator' },
            {
                label: 'Quick Start (Default Social Media)',
                submenu: createTimeSubmenu()
            },
            {
                label: 'Use My Custom Profiles',
                submenu: customProfileMenus as any
            },
            {
                label: 'Panic Mode',
                enabled: !status.active,
                icon: nativeImage.createEmpty(), // You could load a red warning icon here
                submenu: [
                    { label: 'Lock Device Down (5m)', click: () => startQuickSession(5, true) }
                ]
            },
            {
                label: status.active ? 'Terminate Active Session' : 'Quick Actions...',
                enabled: status.active,
                click: status.active ? async () => {
                    await sessionManager.endSession();
                    updateTrayMenu();
                    mainWindow?.webContents.send('force-sync');
                } : undefined
            },
            { type: 'separator' },
            {
                label: 'Tools & Settings',
                submenu: [
                    {
                        label: 'Schedules (Coming Soon)', enabled: false
                    },
                    {
                        label: 'Reports (Coming Soon)', enabled: false
                    },
                    { type: 'separator' },
                    {
                        label: 'Sync Status', click: () => {
                            mainWindow?.webContents.send('force-sync');
                            mainWindow?.show();
                        }
                    },
                    {
                        label: 'Hard Reset Environment',
                        enabled: !status.active || !(status as any).locked_mode,
                        click: async () => {
                            try {
                                await sessionManager.forceDeepClean();
                                mainWindow?.webContents.reloadIgnoringCache();
                                mainWindow?.webContents.send('force-sync');
                            } catch (err: any) {
                                new Notification({
                                    title: 'NoEscape Locked Session Active',
                                    body: err?.message || 'Locked sessions cannot be reset early.',
                                    silent: false
                                }).show();
                            } finally {
                                updateTrayMenu();
                            }
                        }
                    }
                ]
            },
            { type: 'separator' },
            {
                label: 'Quit NoEscape',
                enabled: !status.active || !(status as any).locked_mode,
                click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);
        tray?.setContextMenu(contextMenu);
    };

    tray.setToolTip('NoEscape - Background Protection Active');
    updateTrayMenu();

    // Update tray menu periodically to reflect session status
    setInterval(updateTrayMenu, 5000);

    tray.on('double-click', () => mainWindow?.show());
}

async function createWindow() {
    const preloadPath = path.join(__dirname, '../preload/index.cjs');
    console.log('Main: Loading preload from:', preloadPath);

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false // Required for TypeScript's CommonJS 'exports' polyfill in the preload script
        },
        title: "NoEscape",
        backgroundColor: '#0f172a',
        show: !process.argv.includes('--minimized'),
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[RENDERER CONSOLE] ${message} (${sourceId}:${line})`);
    });

    const url = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../renderer/index.html')}`;

    mainWindow.loadURL(url);

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
        return false;
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {
    // startBackend(); // Sideline backend logic entirely for local-only app
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.focus.agent');
    }

    sessionManager = new SessionManager();
    await sessionManager.initialize();
    createWindow();
    createTray();

    // Enable Run at Startup
    if (!isDev) {
        app.setLoginItemSettings({
            openAtLogin: true,
            path: app.getPath('exe'),
            args: ['--minimized']
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin' && isQuitting) app.quit();
});

// IPC Handlers
ipcMain.handle('sys:trigger-splash', () => {
    sessionManager.launchSplashOverlay();
});
ipcMain.handle('session:start', async (_, data) => {
    const result = await sessionManager.startSession({
        id: data.id || Math.random().toString(36).substr(2, 9),
        start_time: data.start_time || new Date().toISOString(),
        end_time: data.end_time,
        locked_mode: data.locked_mode || false,
        domains: data.domains || [],
        apps: data.apps || []
    });

    new Notification({
        title: 'NoEscape Session Started',
        body: 'Multi-level blocking is now active.',
        silent: false
    }).show();

    return result;
});

ipcMain.handle('session:end', async () => {
    const result = await sessionManager.endSession();

    new Notification({
        title: 'NoEscape Session Ended',
        body: 'Systems restored. You can now access all apps and sites.',
        silent: false
    }).show();

    return result;
});

ipcMain.handle('session:status', async () => {
    try {
        return await sessionManager.getStatus();
    } catch (err) {
        return { active: false };
    }
});

ipcMain.handle('shell:open', async (_, url) => {
    return await shell.openExternal(url);
});

ipcMain.handle('blocklist:sync', async (_, data) => {
    return await sessionManager.syncBlocklist(data);
});

// --- Settings and Store IPC Handlers ---
ipcMain.handle('store:getBlocklists', async () => {
    return sessionManager.getBlocklists();
});

ipcMain.handle('store:saveBlocklists', async (_, lists) => {
    sessionManager.saveBlocklists(lists);
    return true;
});

ipcMain.handle('store:getHistory', async () => {
    return sessionManager.getHistory();
});

ipcMain.handle('store:saveHistory', async (_, history) => {
    sessionManager.saveHistory(history);
    return true;
});

ipcMain.handle('sys:check-admin', async () => {
    try {
        const fs = await import('fs');
        // Test write access to hosts file
        const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
        fs.accessSync(hostsPath, fs.constants.W_OK);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('sys:get-running-apps', async (_, showAll: boolean = false) => {
    try {
        const execAsync = promisify(exec);
        let processes: any[] = [];

        // 1. Get running apps via PowerShell (High precision / Window identification)
        try {
            const psRunning = `Get-Process | Where-Object { $_.Path } | Select-Object Name, Path | ConvertTo-Json -Compress`;
            const { stdout: stdoutRun } = await execAsync(`powershell -NoProfile -Command "${psRunning}"`, { maxBuffer: 1024 * 1024 * 10 });
            let runApps = JSON.parse(stdoutRun || "[]");
            if (!Array.isArray(runApps)) runApps = [runApps];
            processes.push(...runApps);
        } catch (e) { console.error('[CORE] Error fetching running apps'); }

        // 2. Get installed apps from Registry (Discovery of not-running apps)
        const psInstalled = `$paths = "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*", "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*", "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"; $apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayIcon -match '\\.exe' }; $result = @(); foreach ($app in $apps) { $path = $app.DisplayIcon -replace '",\\d+', '"' -replace ',\\d+', '' -replace '"', ''; if ($path -match '\\.exe$') { $result += [PSCustomObject]@{ Name = $app.DisplayName; Path = $path } } }; $result | Select-Object Name, Path | ConvertTo-Json -Compress`;
        try {
            const tmpScript = path.join(os.tmpdir(), `get-apps-${Date.now()}.ps1`);
            fs.writeFileSync(tmpScript, psInstalled);
            const { stdout: stdoutInst } = await execAsync(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`, { maxBuffer: 1024 * 1024 * 10 });
            fs.unlinkSync(tmpScript);
            let instApps = JSON.parse(stdoutInst || "[]");
            if (!Array.isArray(instApps)) instApps = [instApps];
            processes.push(...instApps);
        } catch (e) { console.error('[CORE] Error fetching registry apps'); }

        const uniqueApps = new Map<string, string>();
        for (const p of processes) {
            if (p.Name && p.Path && fs.existsSync(p.Path)) {
                const lowerName = p.Name.toLowerCase();
                
                // Advanced Mode Filter: Bypass if showAll is true
                if (!showAll && SYSTEM_FILTER.has(lowerName)) {
                    continue;
                }

                let processedName = p.Name;
                if (!processedName.toLowerCase().endsWith('.exe')) {
                    processedName = processedName.trim();
                }

                const key = p.Path.toLowerCase();
                if (!uniqueApps.has(key)) {
                    uniqueApps.set(key, JSON.stringify({ name: processedName, path: p.Path }));
                }
            }
        }

        return Array.from(uniqueApps.values())
            .map(s => JSON.parse(s))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
        console.error('[CORE] Critical Scanner Error:', err);
        return [];
    }
});

ipcMain.handle('sys:get-file-icon', async (_, filePath: string) => {
    try {
        const icon = await app.getFileIcon(filePath, { size: 'normal' });
        return icon.toDataURL();
    } catch (err) {
        console.error('[CORE] Failed to get file icon for', filePath, err);
        return null;
    }
});


