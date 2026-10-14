using System;
using System.IO;
using System.Net;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Threading;

class Launcher {
  static string root, data, url;
  static Process backend;
  static int servicePid;
  static bool opening;
  static readonly JavaScriptSerializer json = new JavaScriptSerializer();
  static readonly object logGate = new object();
  static Func<ProcessStartInfo, bool> browserStart = delegate(ProcessStartInfo start) {
    using (var process = Process.Start(start)) { return true; }
  };
  class LocalClient : WebClient {
    public LocalClient() { Proxy = null; Encoding = System.Text.Encoding.UTF8; }
    protected override WebRequest GetWebRequest(Uri address) {
      var request = base.GetWebRequest(address); request.Timeout = 2000;
      var http = request as HttpWebRequest; if (http != null) http.ReadWriteTimeout = 2000;
      return request;
    }
  }
  static void Log(string message) {
    try { lock (logGate) {
      Directory.CreateDirectory(data);
      File.AppendAllText(Path.Combine(data, "runner.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine, Encoding.UTF8);
    }} catch { }
  }
  static Dictionary<string, object> Read(string endpoint) {
    using (var client = new LocalClient()) { return json.Deserialize<Dictionary<string, object>>(client.DownloadString(endpoint)); }
  }
  static string NormalPath(string value) { return Path.GetFullPath(value).TrimEnd('\\', '/'); }
  static Dictionary<string, object> Running() {
    try {
      var state = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(data, "server.json"), Encoding.UTF8));
      var uri = new Uri((string)state["url"]);
      if (uri.Scheme != "http" || uri.Host != "127.0.0.1" || !String.Equals(NormalPath((string)state["root"]), NormalPath(root), StringComparison.OrdinalIgnoreCase)) return null;
      var origin = uri.ToString().TrimEnd('/');
      var boot = Read(origin + "/api/launcher");
      var matches = boot.ContainsKey("appId") ? (string)boot["appId"] == "chat-material-compositor" : (string)boot["app"] == "聊天素材合成器";
      if (!matches || !boot.ContainsKey("clientToken")) return null;
      url = origin;
      servicePid = state.ContainsKey("pid") ? Convert.ToInt32(state["pid"]) : 0;
      return boot;
    } catch { return null; }
  }
  static long BrowserStamp(Dictionary<string, object> info) { return info.ContainsKey("browserReadyAt") ? Convert.ToInt64(info["browserReadyAt"]) : 0; }
  static bool WaitForBrowser(long before) {
    var deadline = DateTime.UtcNow.AddSeconds(4);
    do {
      try { if (BrowserStamp(Read(url + "/api/launcher")) > before) return true; } catch { }
      Application.DoEvents(); Thread.Sleep(150);
    } while (DateTime.UtcNow < deadline);
    return false;
  }
  static IEnumerable<KeyValuePair<string, ProcessStartInfo>> BrowserChoices() {
    yield return new KeyValuePair<string, ProcessStartInfo>("系统默认浏览器", new ProcessStartInfo(url) { UseShellExecute = true });
    yield return new KeyValuePair<string, ProcessStartInfo>("Windows链接处理器", new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "rundll32.exe"), "url.dll,FileProtocolHandler " + url) { UseShellExecute = false, CreateNoWindow = true });
    var locations = new[] {
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mozilla Firefox", "firefox.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Mozilla Firefox", "firefox.exe"),
    };
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var file in locations) if (File.Exists(file) && seen.Add(file))
      yield return new KeyValuePair<string, ProcessStartInfo>(Path.GetFileName(file), new ProcessStartInfo(file, "\"" + url + "\"") { UseShellExecute = false, CreateNoWindow = true });
  }
  static bool TryOpen() {
    Dictionary<string, object> before = null;
    try { before = Read(url + "/api/launcher"); } catch { }
    var verify = before != null && before.ContainsKey("browserReadyAt");
    var stamp = before == null ? 0 : BrowserStamp(before);
    foreach (var choice in BrowserChoices()) {
      try {
        Log("尝试打开：" + choice.Key);
        if (!browserStart(choice.Value)) continue;
        if (!verify || WaitForBrowser(stamp)) { Log("工作台已在浏览器打开：" + url); return true; }
        Log("浏览器尚未连接工作台，尝试备用方式。");
      } catch (Exception error) { Log("打开浏览器失败：" + choice.Key + "（" + error.GetType().Name + "）"); }
    }
    Log("自动打开未完成，工作台仍在运行：" + url); return false;
  }
  static bool Open() {
    if (opening) return true;
    opening = true;
    try { return TryOpen(); } finally { opening = false; }
  }
  static Form BrowserHelp() {
    var form = new Form(); form.Text = "聊天素材合成器"; form.Width = 510; form.Height = 200;
    form.StartPosition = FormStartPosition.CenterScreen;
    var label = new Label(); label.Text = "工作台已启动，但浏览器未能自动打开。可重试或复制下方地址。"; label.AutoSize = true; label.Location = new Point(16, 18); form.Controls.Add(label);
    var address = new TextBox(); address.Text = url; address.ReadOnly = true; address.Location = new Point(16, 53); address.Width = 465; form.Controls.Add(address);
    var retry = new Button(); retry.Text = "打开浏览器"; retry.Location = new Point(16, 92); retry.Width = 110; retry.Click += (s, e) => { if (Open()) form.Close(); }; form.Controls.Add(retry);
    var copy = new Button(); copy.Text = "复制地址"; copy.Location = new Point(138, 92); copy.Width = 110; copy.Click += (s, e) => { Clipboard.SetText(url); copy.Text = "已复制"; }; form.Controls.Add(copy);
    return form;
  }
  static void OpenWorktable() { if (!Open()) BrowserHelp().Show(); }
  static bool AnotherBackendAlive() {
    try {
      var state = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(data, "instance.json"), Encoding.UTF8));
      var pid = Convert.ToInt32(state["pid"]);
      if (backend != null && pid == backend.Id) return false;
      using (var process = Process.GetProcessById(pid)) { return !process.HasExited; }
    } catch { return false; }
  }
  static void Stop() {
    try {
      var boot = Running(); if (boot == null) return;
      using (var client = new LocalClient()) {
        client.Headers["content-type"] = "application/json";
        client.Headers["x-liaomu-client"] = (string)boot["clientToken"];
        client.UploadString(url + "/api/shutdown", "POST", "{}");
      }
    } catch { }
  }
  [STAThread] static void Main(string[] args) {
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    root = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
    for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--root") root = Path.GetFullPath(args[i + 1]);
    data = Environment.GetEnvironmentVariable("LIAOMU_DATA_DIR"); if (String.IsNullOrEmpty(data)) data = Path.Combine(root, "data");
    try {
      if (Array.IndexOf(args, "--stop") >= 0) { Stop(); return; }
      bool noOpen = Array.IndexOf(args, "--no-open") >= 0;
      if (Running() != null) {
        Log("复用已运行的工作台：" + url);
        if (!noOpen && !Open()) using (var help = BrowserHelp()) { help.ShowDialog(); }
        return;
      }
      string node = Path.Combine(root, ".runtime", "node", "node.exe");
      if (!File.Exists(node) || !File.Exists(Path.Combine(root, "dist", "server", "index.js")))
        throw new Exception("运行组件缺失，请解压完整便携包后再打开软件。");
      Directory.CreateDirectory(data);
      var start = new ProcessStartInfo(node, "\"" + Path.Combine(root, "dist", "server", "index.js") + "\"");
      start.WorkingDirectory = root; start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.StandardOutputEncoding = Encoding.UTF8; start.StandardErrorEncoding = Encoding.UTF8;
      start.EnvironmentVariables["NODE_USE_SYSTEM_CA"] = "1";
      start.EnvironmentVariables["LIAOMU_DATA_DIR"] = data;
      start.EnvironmentVariables["PUPPETEER_CACHE_DIR"] = Path.Combine(root, ".runtime", "browser");
      backend = new Process(); backend.StartInfo = start;
      DataReceivedEventHandler log = (sender, e) => { if (e.Data != null) lock (logGate) { try { File.AppendAllText(Path.Combine(data, "server.log"), e.Data + Environment.NewLine, Encoding.UTF8); } catch { } } };
      backend.OutputDataReceived += log; backend.ErrorDataReceived += log;
      Log("正在启动后台。"); backend.Start(); backend.BeginOutputReadLine(); backend.BeginErrorReadLine();
      var splash = new Form(); splash.Text = "聊天素材合成器"; splash.Width = 340; splash.Height = 130;
      splash.StartPosition = FormStartPosition.CenterScreen; splash.FormBorderStyle = FormBorderStyle.FixedDialog; splash.ControlBox = false;
      var label = new Label(); label.Text = "正在打开工作台…"; label.AutoSize = true; label.Location = new Point(24, 25); splash.Controls.Add(label);
      if (!noOpen) splash.Show();
      for (int i = 0; i < 120; i++) {
        if (Running() != null) break;
        if (backend.HasExited && !AnotherBackendAlive()) throw new Exception("后台未能启动，详情见 data/server.log。");
        Application.DoEvents(); Thread.Sleep(150);
      }
      splash.Close();
      if (Running() == null) throw new Exception("工作台启动超时，详情见 data/server.log。");
      if (servicePid != backend.Id) {
        Log("另一个后台已就绪，复用工作台：" + url);
        if (!noOpen && !Open()) using (var help = BrowserHelp()) { help.ShowDialog(); }
        return;
      }
      var tray = new NotifyIcon(); tray.Text = "聊天素材合成器"; tray.Icon = SystemIcons.Application; tray.Visible = true;
      var menu = new ContextMenuStrip(); menu.Items.Add("打开工作台", null, (s, e) => OpenWorktable());
      menu.Items.Add("退出软件", null, (s, e) => { Stop(); tray.Visible = false; Application.Exit(); }); tray.ContextMenuStrip = menu;
      tray.DoubleClick += (s, e) => OpenWorktable();
      var timer = new System.Windows.Forms.Timer(); timer.Interval = 1500; timer.Tick += (s, e) => { if (backend.HasExited) { tray.Visible = false; Application.Exit(); } }; timer.Start();
      if (!noOpen) OpenWorktable();
      Application.Run(); tray.Dispose();
    } catch (Exception error) {
      Log("启动未完成：" + error.Message);
      try { if (backend != null && !backend.HasExited && Running() != null && servicePid == backend.Id) Stop(); } catch { }
      if (Array.IndexOf(args, "--no-open") < 0) MessageBox.Show(error.Message, "聊天素材合成器", MessageBoxButtons.OK, MessageBoxIcon.Error);
      else Environment.ExitCode = 1;
    }
  }
}
