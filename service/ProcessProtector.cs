using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DistractionBlocker
{
    public static class ProcessProtector
    {
        [DllImport("ntdll.dll", SetLastError = true)]
        private static extern void RtlSetProcessIsCritical(UInt32 SetAsCritical, ref UInt32 PreviousState, UInt32 NeedScb);

        public static bool Protect()
        {
            try
            {
                // Requires administrative privileges
                Process.EnterDebugMode();
                uint isCritical = 1;
                RtlSetProcessIsCritical(1, ref isCritical, 0);
                Console.WriteLine("Process is now CRITICAL. Task Manager termination will cause BSOD.");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to protect process: " + ex.Message);
                return false;
            }
        }

        public static bool Unprotect()
        {
            try
            {
                uint isCritical = 0;
                RtlSetProcessIsCritical(0, ref isCritical, 0);
                Console.WriteLine("Process critical status removed.");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to unprotect process: " + ex.Message);
                return false;
            }
        }
    }
}
