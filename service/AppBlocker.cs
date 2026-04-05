using System;
using System.Diagnostics;
using System.Linq;

namespace DistractionBlocker
{
    public class AppBlocker
    {
        public void EnforceBlocks(string[] blockedApps)
        {
            if (blockedApps == null || blockedApps.Length == 0) return;

            var processes = Process.GetProcesses();

            foreach (var process in processes)
            {
                try
                {
                    string processName = process.ProcessName.ToLowerInvariant();
                    string windowTitle = process.MainWindowTitle.ToLowerInvariant();

                    foreach (var blockedApp in blockedApps)
                    {
                        var lowerBlockedApp = blockedApp.ToLowerInvariant().Replace(".exe", "");
                        // Check if process name contains the blocked app name (substring match) or window title
                        if (processName.Contains(lowerBlockedApp) ||
                            (!string.IsNullOrEmpty(windowTitle) && windowTitle.Contains(lowerBlockedApp)))
                        {
                            Console.WriteLine("Terminating blocked app: " + process.ProcessName);
                            process.Kill();
                            LogSignal(process.ProcessName);
                        }
                    }
                }
                catch (Exception)
                {
                    // Ignore exceptions for system processes we don't have access to
                }
            }
        }

        private void LogSignal(string processName)
        {
            try
            {
                string dir = @"C:\ProgramData\FocusAgent";
                if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
                string path = System.IO.Path.Combine(dir, "signals.log");
                string logEntry = string.Format("{0}|KILL|{1}\n", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"), processName);
                System.IO.File.AppendAllText(path, logEntry);
            }
            catch { /* Best effort */ }
        }
    }
}
