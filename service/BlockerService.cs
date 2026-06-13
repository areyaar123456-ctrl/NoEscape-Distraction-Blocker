using System;
using System.Collections.Generic;
using System.ServiceProcess;
using System.Threading;

namespace DistractionBlocker
{
    public class BlockerService : ServiceBase
    {
        private PipeServer _pipeServer;
        private WebsiteBlocker _websiteBlocker;
        private AppBlocker _appBlocker;
        
        private Thread _workerThread;
        private bool _isStopping = false;
        private bool _isBlocked = false;
        private string[] _blockedApps = new string[0];
        private string[] _blockedWebsites = new string[0];

        public BlockerService()
        {
            this.ServiceName = "DistractionBlockerService";
            this.CanStop = true;
            this.CanPauseAndContinue = false;
            this.AutoLog = true;
            
            _websiteBlocker = new WebsiteBlocker();
            _appBlocker = new AppBlocker();
        }

        public void TestStartupAndStop(string[] args)
        {
            OnStart(args);
        }

        public void TestStop()
        {
            OnStop();
        }

        protected override void OnStart(string[] args)
        {
            _isStopping = false;
            
            // Clear any stale blocks from a previous crash
            try { _websiteBlocker.RemoveBlock(); } catch (Exception ex) { Console.WriteLine("Startup unblock error: " + ex.Message); }
            try { ProcessProtector.Unprotect(); } catch (Exception ex) { Console.WriteLine("Startup unprotect error: " + ex.Message); }
            
            _pipeServer = new PipeServer();
            _pipeServer.OnMessageReceived += HandleMessage;
            _pipeServer.Start();
            
            _workerThread = new Thread(WorkerLoop);
            _workerThread.IsBackground = true;
            _workerThread.Start();
        }

        protected override void OnStop()
        {
            _isStopping = true;
            
            // Try to release blocks if the service is stopped gracefully
            if (_isBlocked)
            {
                _websiteBlocker.RemoveBlock();
                ProcessProtector.Unprotect();
            }

            if (_pipeServer != null)
            {
                _pipeServer.Stop();
            }
            
            if (_workerThread != null && _workerThread.IsAlive)
            {
                _workerThread.Join(2000);
            }
        }

        private void WorkerLoop()
        {
            while (!_isStopping)
            {
                if (_isBlocked)
                {
                    _appBlocker.EnforceBlocks(_blockedApps);
                }
                Thread.Sleep(500); // Check twice per second for secondary reinforcement
            }
        }

        private IpcResponse HandleMessage(IpcMessage msg)
        {
            if (msg == null)
            {
                return IpcResponse.Error(msg, "Request body was empty.", new string[0]);
            }

            var warnings = new List<string>();
            string command = (msg.command ?? string.Empty).Trim().ToUpperInvariant();
            Console.WriteLine("Command Received: " + command);

            if (command == "PING")
            {
                return IpcResponse.Ok(msg, "Native blocker service is available.", new string[0]);
            }

            string validationError = ValidateMessage(command, msg);
            if (validationError != null)
            {
                return IpcResponse.Error(msg, validationError, new string[0]);
            }
            
            if (command == "START_BLOCK")
            {
                _blockedApps = SanitizeList(msg.apps);
                _blockedWebsites = SanitizeList(msg.websites);
                _isBlocked = true;

                if (!ProcessProtector.Protect())
                {
                    warnings.Add("Process protection could not be enabled.");
                }

                bool websitesApplied = _websiteBlocker.ApplyBlock(_blockedWebsites);
                if (!websitesApplied)
                {
                    warnings.Add("Website blocking could not be fully applied.");
                }

                Console.WriteLine("Blocking started.");
                if (!websitesApplied)
                {
                    return IpcResponse.Error(msg, "Native service accepted the session, but website blocking failed.", warnings.ToArray());
                }

                return IpcResponse.Ok(msg, "Blocking started.", warnings.ToArray());
            }

            if (command == "STOP_BLOCK")
            {
                _isBlocked = false;
                _blockedApps = new string[0];
                _blockedWebsites = new string[0];

                bool websitesRemoved = _websiteBlocker.RemoveBlock();
                if (!websitesRemoved)
                {
                    warnings.Add("Website blocking cleanup could not be fully completed.");
                }

                if (!ProcessProtector.Unprotect())
                {
                    warnings.Add("Process protection cleanup could not be confirmed.");
                }

                Console.WriteLine("Blocking stopped.");
                if (!websitesRemoved)
                {
                    return IpcResponse.Error(msg, "Native service stopped app blocking, but website cleanup failed.", warnings.ToArray());
                }

                return IpcResponse.Ok(msg, "Blocking stopped.", warnings.ToArray());
            }

            return IpcResponse.Error(msg, "Unsupported native IPC command: " + command, new string[0]);
        }

        private static string ValidateMessage(string command, IpcMessage msg)
        {
            if (command != "START_BLOCK" && command != "STOP_BLOCK")
            {
                return "Unsupported native IPC command: " + command;
            }

            if (msg.protocolVersion != 0 && msg.protocolVersion != 1)
            {
                return "Unsupported native IPC protocol version.";
            }

            string listError = ValidateList(msg.websites, "websites");
            if (listError != null) return listError;

            return ValidateList(msg.apps, "apps");
        }

        private static string ValidateList(string[] items, string fieldName)
        {
            if (items == null) return null;
            if (items.Length > 500) return fieldName + " exceeds the maximum item count.";

            foreach (string item in items)
            {
                if (item == null) return fieldName + " contains an empty item.";
                string trimmed = item.Trim();
                if (trimmed.Length == 0) return fieldName + " contains an empty item.";
                if (trimmed.Length > 260) return fieldName + " contains an item that is too long.";
                if (ContainsControlCharacter(trimmed)) return fieldName + " contains an invalid control character.";
            }

            return null;
        }

        private static string[] SanitizeList(string[] items)
        {
            if (items == null) return new string[0];

            var sanitized = new List<string>();
            foreach (string item in items)
            {
                string trimmed = item.Trim();
                if (trimmed.Length > 0)
                {
                    sanitized.Add(trimmed);
                }
            }

            return sanitized.ToArray();
        }

        private static bool ContainsControlCharacter(string value)
        {
            foreach (char c in value)
            {
                if (char.IsControl(c)) return true;
            }

            return false;
        }
    }
}
