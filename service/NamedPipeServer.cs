using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;

namespace DistractionBlocker
{
    public class IpcMessage
    {
        public string command { get; set; }
        public string[] websites { get; set; }
        public string[] apps { get; set; }
    }

    public class PipeServer
    {
        private Thread _serverThread;
        private bool _isRunning = false;
        private JavaScriptSerializer _serializer = new JavaScriptSerializer();

        public event Action<IpcMessage> OnMessageReceived;

        public void Start()
        {
            _isRunning = true;
            _serverThread = new Thread(ServerLoop);
            _serverThread.IsBackground = true;
            _serverThread.Start();
        }

        public void Stop()
        {
            _isRunning = false;
        }

        private void ServerLoop()
        {
            while (_isRunning)
            {
                try
                {
                    using (var pipeServer = new NamedPipeServerStream(
                        "DistractionBlockerPipe",
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Message,
                        PipeOptions.Asynchronous))
                    {
                        Console.WriteLine("Waiting for pipe connection...");
                        pipeServer.WaitForConnection();
                        Console.WriteLine("Client connected.");

                        using (var reader = new StreamReader(pipeServer))
                        using (var writer = new StreamWriter(pipeServer) { AutoFlush = true })
                        {
                            while (pipeServer.IsConnected && _isRunning)
                            {
                                var line = reader.ReadLine();
                                if (string.IsNullOrEmpty(line)) break;

                                Console.WriteLine("Received: " + line);
                                try
                                {
                                    var msg = _serializer.Deserialize<IpcMessage>(line);
                                    if (msg != null && OnMessageReceived != null)
                                    {
                                        OnMessageReceived(msg);
                                    }
                                    writer.WriteLine("{\"status\":\"ok\"}");
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine("JSON Error: " + ex.Message);
                                    writer.WriteLine("{\"status\":\"error\"}");
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Pipe Server Error: " + ex.Message);
                    Thread.Sleep(2000); // Wait before retry
                }
            }
        }
    }
}
