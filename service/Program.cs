using System;
using System.ServiceProcess;

namespace DistractionBlocker
{
    static class Program
    {
        static void Main(string[] args)
        {
            if (Environment.UserInteractive)
            {
                // Run as console app for easier debugging
                Console.WriteLine("Starting service in interactive mode...");
                var service = new BlockerService();
                service.TestStartupAndStop(args);
                Console.WriteLine("Press any key to stop...");
                Console.ReadKey();
                service.TestStop();
            }
            else
            {
                ServiceBase[] ServicesToRun;
                ServicesToRun = new ServiceBase[]
                {
                    new BlockerService()
                };
                ServiceBase.Run(ServicesToRun);
            }
        }
    }
}
