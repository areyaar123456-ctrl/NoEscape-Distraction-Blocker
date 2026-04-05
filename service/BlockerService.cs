using System;
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

        private void HandleMessage(IpcMessage msg)
        {
            Console.WriteLine("Command Received: " + msg.command);
            
            if (msg.command == "START_BLOCK")
            {
                _blockedApps = msg.apps ?? new string[0];
                _blockedWebsites = msg.websites ?? new string[0];
                _isBlocked = true;
                
                try { ProcessProtector.Protect(); } catch (Exception ex) { Console.WriteLine(ex.Message); }
                try { _websiteBlocker.ApplyBlock(_blockedWebsites); } catch (Exception ex) { Console.WriteLine(ex.Message); }
                Console.WriteLine("Blocking started.");
            }
            else if (msg.command == "STOP_BLOCK")
            {
                _isBlocked = false;
                _blockedApps = new string[0];
                _blockedWebsites = new string[0];
                
                try { _websiteBlocker.RemoveBlock(); } catch (Exception ex) { Console.WriteLine("Website unblock error: " + ex.Message); }
                try { ProcessProtector.Unprotect(); } catch (Exception ex) { Console.WriteLine("Unprotect error: " + ex.Message); }
                Console.WriteLine("Blocking stopped.");
            }
        }
    }
}
