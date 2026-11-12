using System;
using System.Diagnostics;
using System.IO;

namespace TalkAppLauncher
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string url = "http://localhost:3000";

            // If command line argument provided, use it
            if (args != null && args.Length > 0 && !string.IsNullOrEmpty(args[0]))
            {
                url = args[0].Trim();
            }
            else
            {
                // If server_url.txt exists in app directory, read URL from it
                string urlFile = Path.Combine(appDir, "server_url.txt");
                if (File.Exists(urlFile))
                {
                    try
                    {
                        string savedUrl = File.ReadAllText(urlFile).Trim();
                        if (!string.IsNullOrEmpty(savedUrl)) url = savedUrl;
                    }
                    catch { }
                }
            }

            // 1. Arka planda global tuş kısayol yardımcısını (Companion) başlat
            string companionPath = Path.Combine(appDir, "talkapp-companion.exe");
            if (!File.Exists(companionPath))
            {
                companionPath = Path.Combine(appDir, "public", "downloads", "talkapp-companion.exe");
            }
            if (File.Exists(companionPath))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = companionPath,
                        UseShellExecute = true,
                        WindowStyle = ProcessWindowStyle.Hidden
                    });
                }
                catch { }
            }

            // 2. Tarayıcı çubuğu olmadan tam bağımsız masaüstü uygulama penceresi olarak başlat
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }
            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            string targetBrowser = File.Exists(edgePath) ? edgePath : (File.Exists(chromePath) ? chromePath : null);

            if (targetBrowser != null)
            {
                string browserArgs = string.Format("--app=\"{0}\" --window-size=1280,820", url);
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetBrowser,
                    Arguments = browserArgs,
                    UseShellExecute = true
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
        }
    }
}
