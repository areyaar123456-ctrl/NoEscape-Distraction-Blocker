using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Web.Script.Serialization;

namespace DistractionBlocker
{
    public class IpcMessage
    {
        public int protocolVersion { get; set; }
        public string requestId { get; set; }
        public string command { get; set; }
        public string[] websites { get; set; }
        public string[] apps { get; set; }
    }

    public class IpcResponse
    {
        public string status { get; set; }
        public string requestId { get; set; }
        public string command { get; set; }
        public string message { get; set; }
        public string[] warnings { get; set; }

        public static IpcResponse Ok(IpcMessage msg, string message, string[] warnings)
        {
            return new IpcResponse
            {
                status = "ok",
                requestId = msg != null ? msg.requestId : null,
                command = msg != null ? msg.command : null,
                message = message,
                warnings = warnings ?? new string[0]
            };
        }

        public static IpcResponse Error(IpcMessage msg, string message, string[] warnings)
        {
            return new IpcResponse
            {
                status = "error",
                requestId = msg != null ? msg.requestId : null,
                command = msg != null ? msg.command : null,
                message = message,
                warnings = warnings ?? new string[0]
            };
        }
    }

    public class PipeServer
    {
        private Thread _serverThread;
        private bool _isRunning = false;
        private JavaScriptSerializer _serializer = new JavaScriptSerializer();

        public event Func<IpcMessage, IpcResponse> OnMessageReceived;

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
                                    IpcResponse response;
                                    if (msg != null && OnMessageReceived != null)
                                    {
                                        response = OnMessageReceived(msg);
                                    }
                                    else
                                    {
                                        response = IpcResponse.Error(msg, "No handler registered for native IPC message.", new string[0]);
                                    }
                                    writer.WriteLine(_serializer.Serialize(response));
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine("JSON Error: " + ex.Message);
                                    writer.WriteLine(_serializer.Serialize(IpcResponse.Error(null, "Invalid native IPC request.", new string[] { ex.Message })));
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
