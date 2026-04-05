using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Automation;
using System.Linq;

class TabTerminator
{
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    private const int INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint WM_KEYDOWN = 0x0100;
    private const uint WM_KEYUP = 0x0101;
    private const uint WM_CLOSE = 0x0010;
    private const uint WM_SYSCOMMAND = 0x0112;
    private const uint SC_CLOSE = 0xF060;

    private const int VK_CONTROL = 0x11;
    private const int VK_W = 0x57;
    private const int VK_F4 = 0x73;
    private const int VK_MENU = 0x12; // Alt

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT
    {
        public int type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT
    {
        public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    static void ForceCloseTab(IntPtr hWnd, string rawTitle)
    {
        bool success = false;
        
        // 0. Settle Delay: Give the browser a moment to finalize the tab switch/focus.
        // This prevents race conditions where the agent fires while the focus is still on the previous tab.
        Thread.Sleep(400);

        // LAYER 1: UI Automation (Direct TITLE-MATCH Tab Action)
        try
        {
            var window = AutomationElement.FromHandle(hWnd);
            if (window != null)
            {
                var tabCondition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem);
                var tabItems = window.FindAll(TreeScope.Descendants, tabCondition);
                
                foreach (AutomationElement tab in tabItems)
                {
                    string tabName = tab.Current.Name;
                    
                    // Match the title plus check selection if possible
                    if (tabName.Equals(rawTitle, StringComparison.OrdinalIgnoreCase) || rawTitle.Contains(tabName))
                    {
                        var closeBtn = tab.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.NameProperty, "Close"));
                        if (closeBtn != null)
                        {
                            var invoke = closeBtn.GetCurrentPattern(InvokePattern.Pattern) as InvokePattern;
                            if (invoke != null)
                            {
                                invoke.Invoke();
                                success = true;
                                Console.WriteLine("[TAB TERM] Layer 1.1: Precision Tab closure successful.");
                                break;
                            }
                        }
                    }
                }
            }
        }
        catch { }

        if (success) return;

        // LAYER 3: Virtual Keyboard Injection (Ctrl+W)
        try
        {
            SetForegroundWindow(hWnd);
            Thread.Sleep(200); // Wait longer for focus to settle
            PostMessage(hWnd, WM_KEYDOWN, (IntPtr)VK_CONTROL, IntPtr.Zero);
            PostMessage(hWnd, WM_KEYDOWN, (IntPtr)VK_W, IntPtr.Zero);
            PostMessage(hWnd, WM_KEYUP, (IntPtr)VK_W, (IntPtr)1);
            PostMessage(hWnd, WM_KEYUP, (IntPtr)VK_CONTROL, (IntPtr)1);
            Console.WriteLine("[TAB TERM] Layer 3 (Ctrl+W) fallback.");
            Thread.Sleep(400);
        }
        catch { }
    }

    static string CleanTitle(string title)
    {
        string cleaned = Regex.Replace(title, @"^\(\d+\)\s*", "");
        cleaned = cleaned.Replace(" - google chrome", "")
                         .Replace(" - microsoft edge", "")
                         .Replace(" - mozilla firefox", "")
                         .Replace(" - brave", "")
                         .Trim();
        return cleaned.ToLower();
    }

    static void Main(string[] args)
    {
        if (args.Length == 0) return;
        List<string> blocked = new List<string>();
        foreach (var arg in args)
        {
            string cleaned = arg.ToLower().Replace("www.", "").Trim();
            string[] parts = cleaned.Split('.');
            if (parts.Length > 1) 
            {
                string brand = parts[0].Length > 2 ? parts[0] : parts[1];
                if (!blocked.Contains(brand)) blocked.Add(brand);
            }
            if (!blocked.Contains(cleaned)) blocked.Add(cleaned);
        }

        Console.WriteLine("TabTerminator v3.1 [SAFE-TAB] Initialized.");
        Console.WriteLine("Active Keywords: " + string.Join(", ", blocked));
        Console.Out.Flush();

        IntPtr lastBlockedHWnd = IntPtr.Zero;
        string lastBlockedTitle = "";

        while (true)
        {
            try
            {
                IntPtr hWnd = GetForegroundWindow();
                if (hWnd != IntPtr.Zero)
                {
                    StringBuilder sb = new StringBuilder(512);
                    if (GetWindowText(hWnd, sb, 512) > 0)
                    {
                        string rawTitle = sb.ToString();
                        string title = CleanTitle(rawTitle);

                        // IMPROVED SEARCH ENGINE EXCEPTION (More robust pattern matching)
                        bool isSearch = title.Contains("google search") || 
                                        title.Contains("google maps") ||
                                        title.Contains("duckduckgo") || 
                                        Regex.IsMatch(title, @"\bsearch\b") ||
                                        Regex.IsMatch(title, @"\b(bing|yahoo|baidu|yandex)\b");

                        if (isSearch || title.Contains("focus agent"))
                        {
                            Thread.Sleep(500);
                            lastBlockedHWnd = IntPtr.Zero; // Reset on safe pages
                            lastBlockedTitle = "";
                            continue;
                        }

                        // STATE-BASED COOLDOWN (Replaces time-based)
                        // If we are still looking at the same window and it still has the same title, 
                        // we've already fired for this specific "view". Don't spam until the user switches away or reloads.
                        if (hWnd == lastBlockedHWnd && rawTitle == lastBlockedTitle)
                        {
                            Thread.Sleep(500);
                            continue;
                        }

                        foreach (var kw in blocked)
                        {
                            bool isKwMatch = Regex.IsMatch(title, @"\b" + Regex.Escape(kw) + @"\b");
                            if (!isKwMatch && title.Contains(kw)) isKwMatch = true;

                            if (isKwMatch)
                            {
                                Console.WriteLine(string.Format("BLOCKING [{0}]: {1}", kw, rawTitle));
                                Console.Out.Flush();

                                ForceCloseTab(hWnd, rawTitle);
                                
                                Thread.Sleep(500); 

                                Console.WriteLine("[SPLASH] " + kw);
                                Console.Out.Flush();

                                lastBlockedHWnd = hWnd;
                                lastBlockedTitle = rawTitle;
                                break;
                            }
                        }
                    }
                }
            }
            catch (Exception ex) 
            {
                Console.WriteLine("[ERROR] " + ex.Message);
                Console.Out.Flush();
                lastBlockedHWnd = IntPtr.Zero; // Reset on error
                lastBlockedTitle = "";
            }
            
            Thread.Sleep(500);
        }
    }
}
