using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Diagnostics;
using Microsoft.Win32;
using System.Net;
using System.Collections.Generic;

namespace DistractionBlocker
{
    public class WebsiteBlocker
    {
        private static readonly string HostsFilePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"drivers\etc\hosts");
        private static readonly string HostsBackupPath = HostsFilePath + ".blockerbackup";
        private const string MarkerStart = "# --- DISTRACTION BLOCKER START ---";
        private const string MarkerEnd = "# --- DISTRACTION BLOCKER END ---";

        public void ApplyBlock(string[] websites)
        {
            try
            {
                UnlockHostsFile();
                
                if (!File.Exists(HostsBackupPath) && File.Exists(HostsFilePath))
                {
                    File.Copy(HostsFilePath, HostsBackupPath);
                }

                RemoveExistingBlocks();

                if (websites != null && websites.Length > 0)
                {
                    // Use UTF-8 without BOM (important for some Windows versions)
                    using (StreamWriter sw = new StreamWriter(HostsFilePath, true, new UTF8Encoding(false)))
                    {
                        sw.WriteLine(MarkerStart);
                        foreach (var site in websites)
                        {
                            string cleaned = site.Trim().ToLower();
                            sw.WriteLine(string.Format("127.0.0.1 {0}", cleaned));
                            sw.WriteLine(string.Format("127.0.0.1 www.{0}", cleaned));
                            
                            // Special case for Netflix regional subdomains
                            if (cleaned.Contains("netflix"))
                            {
                                sw.WriteLine("127.0.0.1 in.netflix.com");
                                sw.WriteLine("127.0.0.1 movies.netflix.com");
                            }
                        }
                        sw.WriteLine(MarkerEnd);
                    }
                    DisableSecureDns();
                    BlockQuicAndIPs(websites);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("ApplyBlock failed: " + ex.Message);
            }
            finally
            {
                LockHostsFile();
            }
        }

        public void RemoveBlock()
        {
            try
            {
                UnlockHostsFile();
                RemoveExistingBlocks();
                EnableSecureDns();
                UnblockQuicAndIPs();
                FlushDns();
            }
            catch (Exception ex)
            {
                Console.WriteLine("RemoveBlock failure: " + ex.Message);
                // Last ditch effort: if we have a backup, restore it
                if (File.Exists(HostsBackupPath))
                {
                    try { 
                        File.SetAttributes(HostsFilePath, FileAttributes.Normal);
                        File.Copy(HostsBackupPath, HostsFilePath, true); 
                    } catch { }
                }
            }
        }

        private void DisableSecureDns()
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Policies\Google\Chrome"))
                {
                    if (key != null) key.SetValue("DnsOverHttpsMode", "off", RegistryValueKind.String);
                }
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Policies\Microsoft\Edge"))
                {
                    if (key != null) key.SetValue("DnsOverHttpsMode", "off", RegistryValueKind.String);
                }
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Policies\BraveSoftware\Brave"))
                {
                    if (key != null) key.SetValue("DnsOverHttpsMode", "off", RegistryValueKind.String);
                }
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS"))
                {
                    if (key != null) key.SetValue("Enabled", 0, RegistryValueKind.DWord);
                }
                Console.WriteLine("Secure DNS disabled via Registry.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to disable Secure DNS: " + ex.Message);
            }
        }

        private void EnableSecureDns()
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Policies\Google\Chrome", true))
                {
                    if (key != null) key.DeleteValue("DnsOverHttpsMode", false);
                }
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Policies\Microsoft\Edge", true))
                {
                    if (key != null) key.DeleteValue("DnsOverHttpsMode", false);
                }
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Policies\BraveSoftware\Brave", true))
                {
                    if (key != null) key.DeleteValue("DnsOverHttpsMode", false);
                }
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS", true))
                {
                    if (key != null) key.DeleteValue("Enabled", false);
                }
                Console.WriteLine("Secure DNS policies removed.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to enable Secure DNS: " + ex.Message);
            }
        }

        private void FlushDns()
        {
            try
            {
                Process flush = new Process();
                flush.StartInfo.FileName = "ipconfig";
                flush.StartInfo.Arguments = "/flushdns";
                flush.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
                flush.StartInfo.CreateNoWindow = true;
                flush.Start();
                flush.WaitForExit();
                Console.WriteLine("DNS Cache flushed.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to flush DNS: " + ex.Message);
            }
        }

        private void BlockQuicAndIPs(string[] websites)
        {
            try
            {
                // 1. Block QUIC (UDP 443)
                ExecuteCommand("netsh", "advfirewall firewall delete rule name=\"FocusAgent_BlockQUIC\"");
                ExecuteCommand("netsh", "advfirewall firewall add rule name=\"FocusAgent_BlockQUIC\" dir=out action=block protocol=UDP remoteport=443");
                
                // 2. Block IPs dynamically
                ExecuteCommand("netsh", "advfirewall firewall delete rule name=\"FocusAgent_IPBlock\"");
                if (websites != null)
                {
                    List<string> ips = new List<string>();
                    foreach (var site in websites)
                    {
                        try {
                            string domain = site.Trim().Replace("www.", "").ToLower();
                            var addresses = Dns.GetHostAddresses(domain);
                            foreach (var ip in addresses) {
                                ips.Add(ip.ToString());
                            }
                        } catch { }
                    }
                    if (ips.Count > 0)
                    {
                        string ipList = string.Join(",", ips);
                        ExecuteCommand("netsh", string.Format("advfirewall firewall add rule name=\"FocusAgent_IPBlock\" dir=out action=block remoteip=\"{0}\"", ipList));
                    }
                }
                Console.WriteLine("Firewall QUIC and IP rules applied.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Firewall block failed: " + ex.Message);
            }
        }

        private void UnblockQuicAndIPs()
        {
            try
            {
                ExecuteCommand("netsh", "advfirewall firewall delete rule name=\"FocusAgent_BlockQUIC\"");
                ExecuteCommand("netsh", "advfirewall firewall delete rule name=\"FocusAgent_IPBlock\"");
                Console.WriteLine("Firewall rules removed.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to remove Firewall rules: " + ex.Message);
            }
        }

        private void ExecuteCommand(string filename, string arguments)
        {
            Process p = new Process();
            p.StartInfo.FileName = filename;
            p.StartInfo.Arguments = arguments;
            p.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
            p.StartInfo.CreateNoWindow = true;
            p.StartInfo.UseShellExecute = false;
            p.Start();
            p.WaitForExit();
        }

        private void RemoveExistingBlocks()
        {
            if (!File.Exists(HostsFilePath)) return;

            // Reading with UTF8 to be consistent
            string[] lines;
            using (StreamReader sr = new StreamReader(HostsFilePath, new UTF8Encoding(false)))
            {
                lines = sr.ReadToEnd().Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            }

            var sb = new StringBuilder();
            bool inBlock = false;

            foreach (var line in lines)
            {
                string trimmed = line.Trim();
                if (trimmed.Equals(MarkerStart, StringComparison.OrdinalIgnoreCase)) { inBlock = true; continue; }
                if (trimmed.Equals(MarkerEnd, StringComparison.OrdinalIgnoreCase)) { inBlock = false; continue; }
                
                if (!inBlock)
                {
                    sb.AppendLine(line);
                }
            }

            // Write back with NO BOM UTF8
            string finalContent = sb.ToString().TrimEnd() + Environment.NewLine;
            using (StreamWriter sw = new StreamWriter(HostsFilePath, false, new UTF8Encoding(false)))
            {
                sw.Write(finalContent);
            }
            Console.WriteLine("Host blocks removed.");
        }

        private void LockHostsFile()
        {
            try
            {
                if (!File.Exists(HostsFilePath)) return;
                
                var fileSecurity = File.GetAccessControl(HostsFilePath);
                var everyone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
                
                // Explicitly add Deny rule
                fileSecurity.AddAccessRule(new FileSystemAccessRule(everyone, FileSystemRights.Write, AccessControlType.Deny));
                File.SetAccessControl(HostsFilePath, fileSecurity);
                
                // Set ReadOnly attribute
                File.SetAttributes(HostsFilePath, File.GetAttributes(HostsFilePath) | FileAttributes.ReadOnly);
                Console.WriteLine("Hosts file locked.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Lock failure: " + ex.Message);
            }
        }

        private void UnlockHostsFile()
        {
            try
            {
                if (File.Exists(HostsFilePath))
                {
                    // 1. Remove ReadOnly and Hidden/System if any
                    File.SetAttributes(HostsFilePath, FileAttributes.Normal);
                    
                    // 2. Remove DENY rules aggressively
                    var fileSecurity = File.GetAccessControl(HostsFilePath);
                    var everyone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
                    
                    // This is more thorough than RemoveAccessRule
                    AuthorizationRuleCollection rules = fileSecurity.GetAccessRules(true, true, typeof(SecurityIdentifier));
                    foreach (FileSystemAccessRule rule in rules)
                    {
                        if (rule.IdentityReference == everyone && rule.AccessControlType == AccessControlType.Deny)
                        {
                            fileSecurity.RemoveAccessRuleSpecific(rule);
                        }
                    }
                    
                    // Also try the simple remove in case
                    fileSecurity.RemoveAccessRule(new FileSystemAccessRule(everyone, FileSystemRights.Write, AccessControlType.Deny));
                    
                    File.SetAccessControl(HostsFilePath, fileSecurity);
                    Console.WriteLine("Hosts file unlocked.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Unlock failure: " + ex.Message);
            }
        }
    }
}
