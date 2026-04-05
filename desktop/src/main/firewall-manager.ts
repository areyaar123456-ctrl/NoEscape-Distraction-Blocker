import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';

const execAsync = promisify(exec);
const resolve4Async = promisify(dns.resolve4);

export class FirewallManager {
    private ruleName = 'FOCUS_AGENT_BLOCK_ENGINE';

    public async blockDomains(domains: string[]) {
        const ips = new Set<string>();
        const cleanDomains = domains.map(d => d.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().trim());

        // Parallelized DNS resolution
        await Promise.all(cleanDomains.map(async (domain) => {
            try {
                const resolved = await resolve4Async(domain);
                resolved.forEach(ip => ips.add(ip));
            } catch (err: any) {
                console.warn(`[FIREWALL] DNS: ${domain} not found: ${err.message}`);
            }
        }));

        if (ips.size === 0) {
            await this.restore();
            return;
        }

        const ipList = Array.from(ips).join(',');

        try {
            // Remove existing rule first
            await this.restore();

            // Add new block rule
            const cmd = `netsh advfirewall firewall add rule name="${this.ruleName}" dir=out action=block remoteip=${ipList}`;
            await execAsync(cmd);
            console.log(`[FIREWALL] Successfully blocked ${ips.size} IPs reaching ${domains.length} domains.`);
        } catch (err: any) {
            console.error('[FIREWALL_ERROR] Failed to inject rules. (Requires Admin Elevation):', err.message);
        }
    }

    public async restore() {
        try {
            await execAsync(`netsh advfirewall firewall delete rule name="${this.ruleName}"`);
            console.log('[FIREWALL] Rules restored.');
        } catch (err: any) {
            // Rule likely doesn't exist, which is fine
        }
    }
}
