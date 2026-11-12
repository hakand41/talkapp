using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TalkAppCompanion
{
    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Force modern TLS 1.2 / 1.3
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;
                ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
            }
            catch { }

            // Single instance check via mutex
            bool isNewInstance;
            using (Mutex mutex = new Mutex(true, "TalkAppCompanion_SingleInstance_Mutex", out isNewInstance))
            {
                if (!isNewInstance)
                {
                    // Ping local instance to bring to front or update token if passed
                    try
                    {
                        string tokenArg = "";
                        string serverArg = "";
                        foreach (string arg in args)
                        {
                            if (arg.StartsWith("--token=")) tokenArg = arg.Substring(8);
                            if (arg.StartsWith("--server=")) serverArg = arg.Substring(9);
                        }
                        if (!string.IsNullOrEmpty(tokenArg))
                        {
                            WebClient wc = new WebClient();
                            wc.DownloadString("http://127.0.0.1:39841/pair?server=" + Uri.EscapeDataString(serverArg) + "&token=" + Uri.EscapeDataString(tokenArg));
                        }
                    }
                    catch { }
                    return;
                }

                Application.Run(new CompanionAppContext(args));
            }
        }
    }

    public class CompanionConfig
    {
        public string ServerUrl = "http://localhost:3000";
        public string Token = "";
        public string PttKey = "Space";
        public string PtmKey = "V";
        public string MuteToggleKey = "M";
        public string DeafenKey = "D";
        public bool PttEnabled = true;
        public bool PtmEnabled = false;
        public bool MuteToggleEnabled = false;
        public bool DeafenEnabled = false;
        public bool RunOnStartup = false;

        private static string ConfigPath
        {
            get
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TalkAppCompanion");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                return Path.Combine(dir, "companion-config.json");
            }
        }

        public static CompanionConfig Load()
        {
            try
            {
                if (File.Exists(ConfigPath))
                {
                    string json = File.ReadAllText(ConfigPath, Encoding.UTF8);
                    return Parse(json);
                }
            }
            catch { }
            return new CompanionConfig();
        }

        public void Save()
        {
            try
            {
                string json = Serialize();
                File.WriteAllText(ConfigPath, json, Encoding.UTF8);

                // Update Registry for RunOnStartup
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                    {
                        if (key != null)
                        {
                            if (RunOnStartup)
                            {
                                key.SetValue("TalkAppCompanion", "\"" + Application.ExecutablePath + "\" --silent");
                            }
                            else
                            {
                                key.DeleteValue("TalkAppCompanion", false);
                            }
                        }
                    }
                }
                catch { }
            }
            catch { }
        }

        public string Serialize()
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine(string.Format("  \"serverUrl\": \"{0}\",", EscapeJson(ServerUrl)));
            sb.AppendLine(string.Format("  \"token\": \"{0}\",", EscapeJson(Token)));
            sb.AppendLine(string.Format("  \"pttKey\": \"{0}\",", EscapeJson(PttKey)));
            sb.AppendLine(string.Format("  \"ptmKey\": \"{0}\",", EscapeJson(PtmKey)));
            sb.AppendLine(string.Format("  \"muteToggleKey\": \"{0}\",", EscapeJson(MuteToggleKey)));
            sb.AppendLine(string.Format("  \"deafenKey\": \"{0}\",", EscapeJson(DeafenKey)));
            sb.AppendLine(string.Format("  \"pttEnabled\": {0},", PttEnabled ? "true" : "false"));
            sb.AppendLine(string.Format("  \"ptmEnabled\": {0},", PtmEnabled ? "true" : "false"));
            sb.AppendLine(string.Format("  \"muteToggleEnabled\": {0},", MuteToggleEnabled ? "true" : "false"));
            sb.AppendLine(string.Format("  \"deafenEnabled\": {0},", DeafenEnabled ? "true" : "false"));
            sb.AppendLine(string.Format("  \"runOnStartup\": {0}", RunOnStartup ? "true" : "false"));
            sb.AppendLine("}");
            return sb.ToString();
        }

        public static CompanionConfig Parse(string json)
        {
            CompanionConfig c = new CompanionConfig();
            c.ServerUrl = ExtractString(json, "serverUrl", c.ServerUrl);
            c.Token = ExtractString(json, "token", c.Token);
            c.PttKey = ExtractString(json, "pttKey", c.PttKey);
            c.PtmKey = ExtractString(json, "ptmKey", c.PtmKey);
            c.MuteToggleKey = ExtractString(json, "muteToggleKey", c.MuteToggleKey);
            c.DeafenKey = ExtractString(json, "deafenKey", c.DeafenKey);
            c.PttEnabled = ExtractBool(json, "pttEnabled", c.PttEnabled);
            c.PtmEnabled = ExtractBool(json, "ptmEnabled", c.PtmEnabled);
            c.MuteToggleEnabled = ExtractBool(json, "muteToggleEnabled", c.MuteToggleEnabled);
            c.DeafenEnabled = ExtractBool(json, "deafenEnabled", c.DeafenEnabled);
            c.RunOnStartup = ExtractBool(json, "runOnStartup", c.RunOnStartup);
            return c;
        }

        private static string EscapeJson(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
        }

        private static string ExtractString(string json, string key, string def)
        {
            try
            {
                string search = "\"" + key + "\":";
                int idx = json.IndexOf(search);
                if (idx < 0) return def;
                int startQuote = json.IndexOf('"', idx + search.Length);
                if (startQuote < 0) return def;
                int endQuote = json.IndexOf('"', startQuote + 1);
                if (endQuote < 0) return def;
                return json.Substring(startQuote + 1, endQuote - startQuote - 1).Replace("\\\"", "\"").Replace("\\\\", "\\");
            }
            catch { return def; }
        }

        private static bool ExtractBool(string json, string key, bool def)
        {
            try
            {
                string search = "\"" + key + "\":";
                int idx = json.IndexOf(search);
                if (idx < 0) return def;
                int end = json.IndexOfAny(new char[] { ',', '}', '\r', '\n' }, idx + search.Length);
                if (end < 0) end = json.Length;
                string val = json.Substring(idx + search.Length, end - idx - search.Length).Trim().ToLower();
                if (val.Contains("true")) return true;
                if (val.Contains("false")) return false;
            }
            catch { }
            return def;
        }
    }

    public class CompanionAppContext : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private ToolStripMenuItem statusMenuItem;
        private SettingsForm settingsForm;
        private CompanionConfig config;

        // Hooks
        private IntPtr keyboardHookId = IntPtr.Zero;
        private IntPtr mouseHookId = IntPtr.Zero;
        private LowLevelProc keyboardProc;
        private LowLevelProc mouseProc;

        // Local Server
        private HttpListener localListener;
        private Thread localServerThread;
        private bool isRunning = true;

        // Status
        public bool IsPaired = false;
        private System.Windows.Forms.Timer heartbeatTimer;

        // PTT state
        private bool isPttPressed = false;

        public CompanionAppContext(string[] args)
        {
            config = CompanionConfig.Load();

            // Parse command line args
            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.StartsWith("--token=")) config.Token = arg.Substring(8);
                if (arg.StartsWith("--server=")) config.ServerUrl = arg.Substring(9);
                if (arg == "--silent" || arg == "-s") silent = true;
            }
            config.Save();

            InitializeTray();
            StartLocalServer();
            InstallHooks();

            // Heartbeat timer (every 6 seconds)
            heartbeatTimer = new System.Windows.Forms.Timer();
            heartbeatTimer.Interval = 6000;
            heartbeatTimer.Tick += (s, e) => SendHeartbeat();
            heartbeatTimer.Start();

            // Initial heartbeat
            ThreadPool.QueueUserWorkItem((state) => SendHeartbeat());

            // If not silent and no token yet, show settings
            if (!silent && string.IsNullOrEmpty(config.Token))
            {
                ShowSettings();
            }
            else if (!silent)
            {
                trayIcon.ShowBalloonTip(3000, "TalkApp Companion", "Arka planda hazır! Oyun oynarken tuşlar dinleniyor.", ToolTipIcon.Info);
            }
        }

        private void InitializeTray()
        {
            trayMenu = new ContextMenuStrip();
            ToolStripMenuItem titleItem = new ToolStripMenuItem("TalkApp Companion v1.0");
            titleItem.Enabled = false;
            titleItem.Font = new Font(trayMenu.Font, FontStyle.Bold);
            trayMenu.Items.Add(titleItem);

            statusMenuItem = new ToolStripMenuItem("Durum: Bağlantı Bekleniyor...");
            statusMenuItem.Enabled = false;
            trayMenu.Items.Add(statusMenuItem);
            trayMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem settingsItem = new ToolStripMenuItem("⚙️ Ayarlar & Tuşlar...", null, (s, e) => ShowSettings());
            trayMenu.Items.Add(settingsItem);

            ToolStripMenuItem reconnectItem = new ToolStripMenuItem("🔄 Yeniden Bağlan", null, (s, e) => {
                ThreadPool.QueueUserWorkItem((st) => SendHeartbeat());
            });
            trayMenu.Items.Add(reconnectItem);

            trayMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("✕ Çıkış", null, (s, e) => Exit());
            trayMenu.Items.Add(exitItem);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "TalkApp Companion (Oyun İçi Tuş Yakalama)";
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Icon = GenerateTrayIcon(Color.FromArgb(237, 66, 69)); // Red initially
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => ShowSettings();
        }

        public void UpdateStatus(bool paired)
        {
            IsPaired = paired;
            if (trayIcon != null)
            {
                trayIcon.Icon = GenerateTrayIcon(paired ? Color.FromArgb(87, 242, 135) : Color.FromArgb(237, 66, 69));
                trayIcon.Text = paired ? "TalkApp Companion: 🟢 Bağlı & Aktif" : "TalkApp Companion: ⚪ Bağlantı Bekleniyor";
            }
            if (statusMenuItem != null)
            {
                statusMenuItem.Text = paired ? "Durum: 🟢 TalkApp Bağlı" : "Durum: ⚪ Bağlantı Bekleniyor...";
            }
            if (settingsForm != null && !settingsForm.IsDisposed)
            {
                settingsForm.UpdateStatusLabel(paired);
            }
        }

        private Icon GenerateTrayIcon(Color dotColor)
        {
            using (Bitmap bmp = new Bitmap(16, 16))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);

                    // Draw headset / mic icon
                    using (Pen p = new Pen(Color.FromArgb(88, 101, 242), 2f))
                    {
                        g.DrawArc(p, 2, 2, 11, 10, 180, 180);
                        g.DrawLine(p, 2, 7, 2, 11);
                        g.DrawLine(p, 13, 7, 13, 11);
                    }
                    // Status dot
                    using (SolidBrush b = new SolidBrush(dotColor))
                    {
                        g.FillEllipse(b, 9, 9, 6, 6);
                    }
                    using (Pen p = new Pen(Color.FromArgb(30, 31, 34), 1f))
                    {
                        g.DrawEllipse(p, 9, 9, 6, 6);
                    }
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        public void ShowSettings()
        {
            if (settingsForm == null || settingsForm.IsDisposed)
            {
                settingsForm = new SettingsForm(this, config);
            }
            settingsForm.Show();
            settingsForm.WindowState = FormWindowState.Normal;
            settingsForm.BringToFront();
            settingsForm.Activate();
        }

        public void SendAction(string action)
        {
            if (string.IsNullOrEmpty(config.Token) || string.IsNullOrEmpty(config.ServerUrl))
                return;

            ThreadPool.QueueUserWorkItem((state) =>
            {
                try
                {
                    string url = config.ServerUrl.TrimEnd('/') + "/api/companion/hotkey";
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                    req.Method = "POST";
                    req.ContentType = "application/json";
                    req.Timeout = 1500;
                    req.KeepAlive = true;

                    string payload = string.Format("{{\"token\":\"{0}\",\"action\":\"{1}\"}}", config.Token, action);
                    byte[] data = Encoding.UTF8.GetBytes(payload);
                    req.ContentLength = data.Length;

                    using (Stream stream = req.GetRequestStream())
                    {
                        stream.Write(data, 0, data.Length);
                    }

                    using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                    {
                        // Success
                    }
                }
                catch { }
            });
        }

        public void SendHeartbeat()
        {
            if (string.IsNullOrEmpty(config.Token) || string.IsNullOrEmpty(config.ServerUrl))
            {
                UpdateStatus(false);
                return;
            }

            try
            {
                string url = config.ServerUrl.TrimEnd('/') + "/api/companion/heartbeat";
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "POST";
                req.ContentType = "application/json";
                req.Timeout = 3000;

                string payload = string.Format("{{\"token\":\"{0}\"}}", config.Token);
                byte[] data = Encoding.UTF8.GetBytes(payload);
                req.ContentLength = data.Length;

                using (Stream stream = req.GetRequestStream())
                {
                    stream.Write(data, 0, data.Length);
                }

                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    using (StreamReader sr = new StreamReader(res.GetResponseStream()))
                    {
                        string respText = sr.ReadToEnd();
                        bool paired = respText.Contains("\"paired\":true") || respText.Contains("\"paired\": true");
                        UpdateStatus(paired);
                    }
                }
            }
            catch
            {
                UpdateStatus(false);
            }
        }

        // ========================================================
        // LOCAL HTTP SERVER FOR AUTO-DISCOVERY & PNA (127.0.0.1:39841)
        // ========================================================
        private void StartLocalServer()
        {
            try
            {
                localListener = new HttpListener();
                localListener.Prefixes.Add("http://127.0.0.1:39841/");
                localListener.Start();

                localServerThread = new Thread(LocalServerWorker);
                localServerThread.IsBackground = true;
                localServerThread.Start();
            }
            catch { }
        }

        private void LocalServerWorker()
        {
            while (isRunning && localListener != null && localListener.IsListening)
            {
                try
                {
                    HttpListenerContext ctx = localListener.GetContext();
                    ThreadPool.QueueUserWorkItem((state) => HandleLocalRequest(ctx));
                }
                catch { }
            }
        }

        private void HandleLocalRequest(HttpListenerContext ctx)
        {
            try
            {
                HttpListenerResponse resp = ctx.Response;
                resp.Headers.Add("Access-Control-Allow-Origin", "*");
                resp.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
                resp.Headers.Add("Access-Control-Allow-Private-Network", "true");

                if (ctx.Request.HttpMethod == "OPTIONS")
                {
                    resp.StatusCode = 204;
                    resp.Close();
                    return;
                }

                string path = ctx.Request.Url.AbsolutePath.ToLower();
                if (path == "/ping")
                {
                    byte[] buf = Encoding.UTF8.GetBytes(string.Format("{{\"status\":\"ok\",\"paired\":{0},\"version\":\"1.0\"}}", IsPaired ? "true" : "false"));
                    resp.ContentType = "application/json";
                    resp.OutputStream.Write(buf, 0, buf.Length);
                    resp.Close();
                    return;
                }

                if (path == "/pair")
                {
                    string server = ctx.Request.QueryString["server"];
                    string token = ctx.Request.QueryString["token"];
                    if (!string.IsNullOrEmpty(server)) config.ServerUrl = server;
                    if (!string.IsNullOrEmpty(token)) config.Token = token;
                    config.Save();

                    ThreadPool.QueueUserWorkItem((st) => SendHeartbeat());

                    trayIcon.ShowBalloonTip(3000, "TalkApp Eşleşti!", "TalkApp tarayıcı oturumunuzla otomatik bağlandı.", ToolTipIcon.Info);

                    byte[] buf = Encoding.UTF8.GetBytes("{\"status\":\"paired\",\"token\":\"" + config.Token + "\"}");
                    resp.ContentType = "application/json";
                    resp.OutputStream.Write(buf, 0, buf.Length);
                    resp.Close();
                    return;
                }

                if (path == "/hotkey" && ctx.Request.HttpMethod == "POST")
                {
                    using (StreamReader sr = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string body = sr.ReadToEnd();
                        string act = CompanionConfig.Parse(body).PttKey; // dummy
                    }
                    byte[] buf = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    resp.ContentType = "application/json";
                    resp.OutputStream.Write(buf, 0, buf.Length);
                    resp.Close();
                    return;
                }

                resp.StatusCode = 404;
                resp.Close();
            }
            catch { }
        }

        // ========================================================
        // WINDOWS GLOBAL HOOKS (LOW-LEVEL KEYBOARD & MOUSE)
        // ========================================================
        private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;

        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private const int WM_XBUTTONDOWN = 0x020B;
        private const int WM_XBUTTONUP = 0x020C;

        private void InstallHooks()
        {
            keyboardProc = HookCallbackKeyboard;
            mouseProc = HookCallbackMouse;

            using (System.Diagnostics.Process curProcess = System.Diagnostics.Process.GetCurrentProcess())
            using (System.Diagnostics.ProcessModule curModule = curProcess.MainModule)
            {
                keyboardHookId = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardProc, GetModuleHandle(curModule.ModuleName), 0);
                mouseHookId = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private void UninstallHooks()
        {
            if (keyboardHookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(keyboardHookId);
                keyboardHookId = IntPtr.Zero;
            }
            if (mouseHookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(mouseHookId);
                mouseHookId = IntPtr.Zero;
            }
        }

        private IntPtr HookCallbackKeyboard(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int vkCode = Marshal.ReadInt32(lParam);
                Keys key = (Keys)vkCode;
                bool isDown = (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN);
                bool isUp = (wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP);

                // PTT (Bas-Konuş)
                if (config.PttEnabled && MatchKey(config.PttKey, key))
                {
                    if (isDown && !isPttPressed)
                    {
                        isPttPressed = true;
                        SendAction("ptt_down");
                    }
                    else if (isUp && isPttPressed)
                    {
                        isPttPressed = false;
                        SendAction("ptt_up");
                    }
                }

                // PTM (Bas-Sustur)
                if (config.PtmEnabled && isDown && MatchKey(config.PtmKey, key))
                {
                    SendAction("ptm_toggle");
                }

                // Mute Toggle (Mikrofon Aç/Kapat)
                if (config.MuteToggleEnabled && isDown && MatchKey(config.MuteToggleKey, key))
                {
                    SendAction("mute_toggle");
                }

                // Deafen Toggle (Kulaklık Kapat)
                if (config.DeafenEnabled && isDown && MatchKey(config.DeafenKey, key))
                {
                    SendAction("deafen_toggle");
                }
            }
            return CallNextHookEx(keyboardHookId, nCode, wParam, lParam);
        }

        private IntPtr HookCallbackMouse(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_XBUTTONDOWN || msg == WM_XBUTTONUP)
                {
                    // High word of mouseData is button info
                    // Struct: POINT(8 bytes) + mouseData(4 bytes)
                    int mouseData = Marshal.ReadInt32(lParam, 8);
                    int xbutton = (mouseData >> 16) & 0xFFFF;
                    string btnName = (xbutton == 1) ? "Mouse4" : ((xbutton == 2) ? "Mouse5" : "");

                    bool isDown = (msg == WM_XBUTTONDOWN);
                    bool isUp = (msg == WM_XBUTTONUP);

                    if (!string.IsNullOrEmpty(btnName))
                    {
                        // PTT
                        if (config.PttEnabled && config.PttKey.Equals(btnName, StringComparison.OrdinalIgnoreCase))
                        {
                            if (isDown && !isPttPressed)
                            {
                                isPttPressed = true;
                                SendAction("ptt_down");
                            }
                            else if (isUp && isPttPressed)
                            {
                                isPttPressed = false;
                                SendAction("ptt_up");
                            }
                        }

                        // PTM
                        if (config.PtmEnabled && isDown && config.PtmKey.Equals(btnName, StringComparison.OrdinalIgnoreCase))
                        {
                            SendAction("ptm_toggle");
                        }

                        // Mute Toggle
                        if (config.MuteToggleEnabled && isDown && config.MuteToggleKey.Equals(btnName, StringComparison.OrdinalIgnoreCase))
                        {
                            SendAction("mute_toggle");
                        }

                        // Deafen Toggle
                        if (config.DeafenEnabled && isDown && config.DeafenKey.Equals(btnName, StringComparison.OrdinalIgnoreCase))
                        {
                            SendAction("deafen_toggle");
                        }
                    }
                }
            }
            return CallNextHookEx(mouseHookId, nCode, wParam, lParam);
        }

        private bool MatchKey(string configKey, Keys key)
        {
            if (string.IsNullOrEmpty(configKey)) return false;
            string ck = configKey.Trim();

            if (ck.Equals("Space", StringComparison.OrdinalIgnoreCase) && key == Keys.Space) return true;
            if (ck.Equals("CapsLock", StringComparison.OrdinalIgnoreCase) && key == Keys.Capital) return true;
            if (ck.Equals("Ctrl", StringComparison.OrdinalIgnoreCase) && (key == Keys.ControlKey || key == Keys.LControlKey || key == Keys.RControlKey)) return true;
            if (ck.Equals("Alt", StringComparison.OrdinalIgnoreCase) && (key == Keys.Menu || key == Keys.LMenu || key == Keys.RMenu)) return true;
            if (ck.Equals("Shift", StringComparison.OrdinalIgnoreCase) && (key == Keys.ShiftKey || key == Keys.LShiftKey || key == Keys.RShiftKey)) return true;
            if (ck.Equals("Tab", StringComparison.OrdinalIgnoreCase) && key == Keys.Tab) return true;

            // Direct Key Name match: "V", "M", "D", "F1", "F2", "NumPad0", etc.
            if (ck.Equals(key.ToString(), StringComparison.OrdinalIgnoreCase)) return true;
            if (("Key" + ck).Equals(key.ToString(), StringComparison.OrdinalIgnoreCase)) return true;

            return false;
        }

        public void Exit()
        {
            isRunning = false;
            UninstallHooks();

            if (heartbeatTimer != null)
            {
                heartbeatTimer.Stop();
                heartbeatTimer.Dispose();
            }

            if (localListener != null)
            {
                try { localListener.Stop(); } catch { }
            }

            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            Application.Exit();
        }
    }

    // ========================================================
    // MODERN DARK SETTINGS WINDOW
    // ========================================================
    public class SettingsForm : Form
    {
        private CompanionAppContext context;
        private CompanionConfig config;

        private Label lblStatus;
        private TextBox txtServerUrl;
        private TextBox txtToken;
        private ComboBox cmbPttKey;
        private ComboBox cmbPtmKey;
        private ComboBox cmbMuteKey;
        private ComboBox cmbDeafenKey;
        private CheckBox chkPtt;
        private CheckBox chkPtm;
        private CheckBox chkMute;
        private CheckBox chkDeafen;
        private CheckBox chkStartup;
        private Button btnSave;
        private Button btnTest;

        public SettingsForm(CompanionAppContext context, CompanionConfig config)
        {
            this.context = context;
            this.config = config;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "TalkApp Companion - Oyun İçi Tuş Yakalama";
            this.Size = new Size(480, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(43, 45, 49);
            this.ForeColor = Color.FromArgb(219, 222, 225);
            this.Font = new Font("Segoe UI", 9.25f);
            this.ShowInTaskbar = true;

            // Header Banner
            Panel pnlHeader = new Panel();
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Height = 70;
            pnlHeader.BackColor = Color.FromArgb(30, 31, 34);

            Label lblTitle = new Label();
            lblTitle.Text = "🎮 TalkApp Companion";
            lblTitle.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(16, 12);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            lblStatus = new Label();
            lblStatus.Text = context.IsPaired ? "🟢 TalkApp ile Eşleşti & Tuşlar Aktif" : "⚪ TalkApp Bekleniyor (Tarayıcıyı Açın)";
            lblStatus.Font = new Font("Segoe UI", 9f);
            lblStatus.ForeColor = context.IsPaired ? Color.FromArgb(87, 242, 135) : Color.FromArgb(180, 180, 180);
            lblStatus.Location = new Point(18, 38);
            lblStatus.AutoSize = true;
            pnlHeader.Controls.Add(lblStatus);

            this.Controls.Add(pnlHeader);

            int y = 84;

            // Server URL
            Label lblServer = new Label();
            lblServer.Text = "Sunucu Adresi (URL):";
            lblServer.Location = new Point(16, y);
            lblServer.AutoSize = true;
            this.Controls.Add(lblServer);
            y += 22;

            txtServerUrl = new TextBox();
            txtServerUrl.Text = config.ServerUrl;
            txtServerUrl.Location = new Point(16, y);
            txtServerUrl.Size = new Size(432, 26);
            txtServerUrl.BackColor = Color.FromArgb(30, 31, 34);
            txtServerUrl.ForeColor = Color.White;
            txtServerUrl.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(txtServerUrl);
            y += 34;

            // Token
            Label lblTok = new Label();
            lblTok.Text = "Eşleşme Kodu (TalkApp Ayarlar'dan Kopyalayın):";
            lblTok.Location = new Point(16, y);
            lblTok.AutoSize = true;
            this.Controls.Add(lblTok);
            y += 22;

            txtToken = new TextBox();
            txtToken.Text = config.Token;
            txtToken.Location = new Point(16, y);
            txtToken.Size = new Size(330, 26);
            txtToken.BackColor = Color.FromArgb(30, 31, 34);
            txtToken.ForeColor = Color.White;
            txtToken.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(txtToken);

            btnTest = new Button();
            btnTest.Text = "🔄 Bağlan";
            btnTest.Location = new Point(354, y - 1);
            btnTest.Size = new Size(94, 28);
            btnTest.BackColor = Color.FromArgb(88, 101, 242);
            btnTest.ForeColor = Color.White;
            btnTest.FlatStyle = FlatStyle.Flat;
            btnTest.FlatAppearance.BorderSize = 0;
            btnTest.Click += (s, e) => {
                config.ServerUrl = txtServerUrl.Text.Trim();
                config.Token = txtToken.Text.Trim();
                config.Save();
                context.SendHeartbeat();
            };
            this.Controls.Add(btnTest);
            y += 42;

            // Hotkeys Box
            GroupBox grpHotkeys = new GroupBox();
            grpHotkeys.Text = "⌨️ Oyun İçi Kısayol Tuşları (Mouse 4/5 ve Klavye)";
            grpHotkeys.Location = new Point(16, y);
            grpHotkeys.Size = new Size(432, 180);
            grpHotkeys.ForeColor = Color.FromArgb(219, 222, 225);

            int gy = 26;

            // PTT
            chkPtt = new CheckBox();
            chkPtt.Text = "🗣️ Bas-Konuş (PTT):";
            chkPtt.Checked = config.PttEnabled;
            chkPtt.Location = new Point(16, gy);
            chkPtt.Size = new Size(200, 24);
            grpHotkeys.Controls.Add(chkPtt);

            cmbPttKey = CreateKeyCombo(config.PttKey);
            cmbPttKey.Location = new Point(230, gy);
            grpHotkeys.Controls.Add(cmbPttKey);
            gy += 34;

            // PTM
            chkPtm = new CheckBox();
            chkPtm.Text = "🤫 Bas-Sustur (PTM):";
            chkPtm.Checked = config.PtmEnabled;
            chkPtm.Location = new Point(16, gy);
            chkPtm.Size = new Size(200, 24);
            grpHotkeys.Controls.Add(chkPtm);

            cmbPtmKey = CreateKeyCombo(config.PtmKey);
            cmbPtmKey.Location = new Point(230, gy);
            grpHotkeys.Controls.Add(cmbPtmKey);
            gy += 34;

            // Mute Toggle
            chkMute = new CheckBox();
            chkMute.Text = "🔇 Mikrofon Aç/Kapat:";
            chkMute.Checked = config.MuteToggleEnabled;
            chkMute.Location = new Point(16, gy);
            chkMute.Size = new Size(200, 24);
            grpHotkeys.Controls.Add(chkMute);

            cmbMuteKey = CreateKeyCombo(config.MuteToggleKey);
            cmbMuteKey.Location = new Point(230, gy);
            grpHotkeys.Controls.Add(cmbMuteKey);
            gy += 34;

            // Deafen Toggle
            chkDeafen = new CheckBox();
            chkDeafen.Text = "🎧 Kulaklık Kapat ('D'):";
            chkDeafen.Checked = config.DeafenEnabled;
            chkDeafen.Location = new Point(16, gy);
            chkDeafen.Size = new Size(200, 24);
            grpHotkeys.Controls.Add(chkDeafen);

            cmbDeafenKey = CreateKeyCombo(config.DeafenKey);
            cmbDeafenKey.Location = new Point(230, gy);
            grpHotkeys.Controls.Add(cmbDeafenKey);

            this.Controls.Add(grpHotkeys);
            y += 194;

            // Startup Checkbox
            chkStartup = new CheckBox();
            chkStartup.Text = "🚀 Bilgisayar açıldığında TalkApp Companion'ı otomatik başlat";
            chkStartup.Checked = config.RunOnStartup;
            chkStartup.Location = new Point(20, y);
            chkStartup.Size = new Size(428, 24);
            this.Controls.Add(chkStartup);
            y += 36;

            // Save & Hide Button
            btnSave = new Button();
            btnSave.Text = "💾 Kaydet & Arka Plana Küçült";
            btnSave.Location = new Point(16, y);
            btnSave.Size = new Size(432, 38);
            btnSave.BackColor = Color.FromArgb(88, 101, 242);
            btnSave.ForeColor = Color.White;
            btnSave.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnSave.FlatStyle = FlatStyle.Flat;
            btnSave.FlatAppearance.BorderSize = 0;
            btnSave.Click += (s, e) => SaveAndHide();
            this.Controls.Add(btnSave);

            // Form Closing Handler: minimize to tray instead of killing
            this.FormClosing += (s, e) => {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    SaveAndHide();
                }
            };
        }

        private ComboBox CreateKeyCombo(string selectedKey)
        {
            ComboBox cmb = new ComboBox();
            cmb.DropDownStyle = ComboBoxStyle.DropDownList;
            cmb.BackColor = Color.FromArgb(30, 31, 34);
            cmb.ForeColor = Color.White;
            cmb.Width = 180;

            string[] keys = new string[] {
                "Mouse4", "Mouse5",
                "Space", "CapsLock", "Tab",
                "V", "M", "D", "C", "X", "Z", "B", "N", "T", "Y", "G", "H",
                "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
                "NumPad0", "NumPad1", "NumPad2", "NumPad3", "NumPad4", "NumPad5",
                "Ctrl", "Alt", "Shift"
            };

            foreach (string k in keys) cmb.Items.Add(k);

            int idx = cmb.FindStringExact(selectedKey);
            if (idx >= 0) cmb.SelectedIndex = idx;
            else if (cmb.Items.Count > 0) cmb.SelectedIndex = 0;

            return cmb;
        }

        public void UpdateStatusLabel(bool paired)
        {
            if (lblStatus != null && !lblStatus.IsDisposed)
            {
                if (lblStatus.InvokeRequired)
                {
                    lblStatus.Invoke(new Action(() => UpdateStatusLabel(paired)));
                    return;
                }
                lblStatus.Text = paired ? "🟢 TalkApp ile Eşleşti & Tuşlar Aktif" : "⚪ TalkApp Bekleniyor (Tarayıcıyı Açın)";
                lblStatus.ForeColor = paired ? Color.FromArgb(87, 242, 135) : Color.FromArgb(180, 180, 180);
            }
        }

        private void SaveAndHide()
        {
            config.ServerUrl = txtServerUrl.Text.Trim();
            config.Token = txtToken.Text.Trim();
            config.PttEnabled = chkPtt.Checked;
            config.PtmEnabled = chkPtm.Checked;
            config.MuteToggleEnabled = chkMute.Checked;
            config.DeafenEnabled = chkDeafen.Checked;
            config.RunOnStartup = chkStartup.Checked;

            if (cmbPttKey.SelectedItem != null) config.PttKey = cmbPttKey.SelectedItem.ToString();
            if (cmbPtmKey.SelectedItem != null) config.PtmKey = cmbPtmKey.SelectedItem.ToString();
            if (cmbMuteKey.SelectedItem != null) config.MuteToggleKey = cmbMuteKey.SelectedItem.ToString();
            if (cmbDeafenKey.SelectedItem != null) config.DeafenKey = cmbDeafenKey.SelectedItem.ToString();

            config.Save();
            context.SendHeartbeat();

            this.Hide();
        }
    }
}
