import { exec, ChildProcess, spawn } from 'child_process';
import { promisify } from 'util';
import { Notification } from 'electron';

const execAsync = promisify(exec);

export class ProcessMonitor {
    private interval: NodeJS.Timeout | null = null;
    private wmiProcess: ChildProcess | null = null;
    private blockedApps: string[] = [];
    private lastNotified: Map<string, number> = new Map();
    public onBlocked?: (name: string) => void;

    public start(apps: string[]) {
        // Ensure all apps have .exe extension for Windows Matching
        this.blockedApps = apps.map(app => {
            const lower = app.toLowerCase();
            return lower.endsWith('.exe') ? lower : `${lower}.exe`;
        });

        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.checkAndKill(), 1000); // Poll every 1s as fallback

        this.startWmiListener();
    }

    private startWmiListener() {
        if (this.wmiProcess) {
            try { this.wmiProcess.kill(); } catch (e) {}
        }

        // Win32_ProcessStartTrace is the most efficient real-time way to detect process creation
        const psCommand = `Get-WmiObject -Query "SELECT * FROM Win32_ProcessStartTrace" | ForEach-Object { Write-Host "[WMI_PROCESS_START] $($_.ProcessName)" }`;
        
        console.log('[PROCESS_MONITOR] Starting WMI Real-time Listener...');
        
        this.wmiProcess = spawn('powershell', ['-NoProfile', '-Command', psCommand]);

        this.wmiProcess.stdout?.on('data', (data) => {
            const output = data.toString().trim();
            const lines = output.split('\n');

            for (const line of lines) {
                if (line.includes('[WMI_PROCESS_START]')) {
                    const processName = line.split(']')[1].trim().toLowerCase();
                    const isBlocked = this.blockedApps.some(app => {
                        const baseName = app.replace('.exe', '');
                        return processName.includes(baseName);
                    });

                    if (isBlocked) {
                        console.log(`[PROCESS_MONITOR] Real-time detection: ${processName}`);
                        this.triggerFeedback(processName);
                    }
                }
            }
        });

        this.wmiProcess.on('error', (err) => {
            console.error('[PROCESS_MONITOR] WMI Listener Error:', err);
        });
    }

    private triggerFeedback(processName: string) {
        // Trigger the signal to launch the splash screen
        this.onBlocked?.(processName);

        // Notification, debounce by 15 seconds to avoid spamming
        const now = Date.now();
        const lastTime = this.lastNotified.get(processName) || 0;
        if (now - lastTime > 15000) {
            new Notification({
                title: '🚫 Blocked App Closed',
                body: `"${processName}" was terminated. Stay in focus!`,
                silent: false
            }).show();
            this.lastNotified.set(processName, now);
        }
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.wmiProcess) {
            this.wmiProcess.kill();
            this.wmiProcess = null;
        }
        this.lastNotified.clear();
    }

    private async checkAndKill() {
        try {
            const { stdout } = await execAsync('tasklist /NH /FO CSV');
            const lines = stdout.split('\n');
            const processesToKill = new Set<string>();

            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length < 1) continue;

                const processName = parts[0].replace(/"/g, '').trim().toLowerCase();
                if (!processName) continue;

                const isBlocked = this.blockedApps.some(app => {
                    const baseName = app.replace('.exe', '');
                    return processName.includes(baseName);
                });

                if (isBlocked) {
                    processesToKill.add(processName);
                }
            }

            for (const name of processesToKill) {
                // Perform the kill in a sub-try-catch to prevent one failure from stopping feedback
                try {
                    await execAsync(`taskkill /F /IM "${name}"`);
                    console.log(`[PROCESS_MONITOR] Executed kill for: ${name}`);
                    this.triggerFeedback(name);
                } catch (e) {
                    // Ignore kill failures (process might be gone), but we still want feedback
                }
            }
        } catch (err) {
            console.error('[PROCESS_MONITOR] Error in monitor loop:', err);
        }
    }
}
