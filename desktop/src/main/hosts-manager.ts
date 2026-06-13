import * as fs from 'fs';
import * as path from 'path';

export class HostsManager {
    private hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    private backupPath = path.join(process.env.APPDATA || '', 'distraction-blocker', 'hosts.bak');
    private markerStart = '# DISTRACTION_BLOCKER_START';
    private markerEnd = '# DISTRACTION_BLOCKER_END';

    constructor() {
        const dir = path.dirname(this.backupPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    public async blockDomains(domains: string[]) {
        try {
            if (!fs.existsSync(this.backupPath)) {
                fs.copyFileSync(this.hostsPath, this.backupPath);
            }

            let content = fs.readFileSync(this.hostsPath, 'utf-8');

            // Remove existing block
            content = this.removeExistingBlock(content);

            const cleanDomains = domains.map(d => d.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().trim());

            const blockLines = [
                this.markerStart,
                ...cleanDomains.map(d => `127.0.0.1 ${d}`),
                ...cleanDomains.map(d => `127.0.0.1 www.${d}`),
                this.markerEnd
            ].join('\n');

            fs.writeFileSync(this.hostsPath, content + '\n' + blockLines);
        } catch (err) {
            console.error('Failed to modify hosts file:.', err);
        }
    }

    public async restore() {
        try {
            // Always sanitize the active hosts file directly. 
            // Avoid copying from backupPath because the backup might be poisoned if it was taken while a block was active.
            let content = fs.readFileSync(this.hostsPath, 'utf-8');
            content = this.removeExistingBlock(content);
            fs.writeFileSync(this.hostsPath, content);

            // Optionally, also flush DNS here via child_process
            const { exec } = require('child_process');
            exec('ipconfig /flushdns', () => { console.log('DNS flushed by desktop app.'); });
        } catch (err) {
            // Silently fail or log as a warning. The Native Service is the primary authority.
            console.log('[HOSTS] Desktop-level restore skipped (likely permission issue). Native Service will handle clean-up.');
        }
    }

    private removeExistingBlock(content: string): string {
        // Strip out the TypeScript marker blocks
        let regex = new RegExp(`${this.markerStart}[\\s\\S]*?${this.markerEnd}`, 'g');
        content = content.replace(regex, '');

        // Strip out the C# Native Service marker blocks as well
        regex = new RegExp(`# --- DISTRACTION BLOCKER START ---[\\s\\S]*?# --- DISTRACTION BLOCKER END ---`, 'g');
        content = content.replace(regex, '');

        return content.trim() + '\n';
    }
}
