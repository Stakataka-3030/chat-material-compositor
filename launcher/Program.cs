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
  static string root, data; static Process backend; static string url;
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static Dictionary<string,object> Read(string endpoint) {
    using (var client = new WebClient()) { client.Proxy=null; return json.Deserialize<Dictionary<string,object>>(client.DownloadString(endpoint)); }
  }
  static Dictionary<string,object> Running() {
    try {
      var state=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(data,"server.json")));
      var uri=new Uri((string)state["url"]);
      if(uri.Scheme!="http"||uri.Host!="127.0.0.1"||!String.Equals((string)state["root"],root,StringComparison.OrdinalIgnoreCase))return null;
      var boot=Read(uri.ToString().TrimEnd('/')+"/api/launcher");
      if((string)boot["app"]!="聊天素材合成器")return null;
      url=uri.ToString().TrimEnd('/'); return boot;
    }catch{return null;}
  }
  static void Open() { Process.Start(new ProcessStartInfo(url) { UseShellExecute=true }); }
  static void Stop() {
    try {
      var boot=Running();if(boot==null)return;
      using(var client=new WebClient()) {
        client.Proxy=null;client.Headers["content-type"]="application/json";
        client.Headers["x-liaomu-client"]=(string)boot["clientToken"];
        client.UploadString(url+"/api/shutdown","POST","{}");
      }
    }catch{}
  }
  [STAThread] static void Main(string[] args) {
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    root=Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
    for(int i=0;i<args.Length-1;i++)if(args[i]=="--root")root=Path.GetFullPath(args[i+1]);
    data=Environment.GetEnvironmentVariable("LIAOMU_DATA_DIR");if(String.IsNullOrEmpty(data))data=Path.Combine(root,"data");
    try {
      if(Array.IndexOf(args,"--stop")>=0){Stop();return;}
      bool noOpen=Array.IndexOf(args,"--no-open")>=0;
      if(Running()!=null){if(!noOpen)Open();return;}
      string node=Path.Combine(root,".runtime","node","node.exe");
      if(!File.Exists(node)||!File.Exists(Path.Combine(root,"dist","server","index.js")))
        throw new Exception("运行组件缺失，请解压完整便携包后再打开软件。");
      Directory.CreateDirectory(data);
      var start=new ProcessStartInfo(node,"\""+Path.Combine(root,"dist","server","index.js")+"\"");
      start.WorkingDirectory=root;start.UseShellExecute=false;start.CreateNoWindow=true;
      start.RedirectStandardOutput=true;start.RedirectStandardError=true;
      start.EnvironmentVariables["NODE_USE_SYSTEM_CA"]="1";
      start.EnvironmentVariables["LIAOMU_DATA_DIR"]=data;
      start.EnvironmentVariables["PUPPETEER_CACHE_DIR"]=Path.Combine(root,".runtime","browser");
      backend=new Process();backend.StartInfo=start;
      object gate=new object();
      DataReceivedEventHandler log=(sender,e)=>{if(e.Data!=null)lock(gate){try{File.AppendAllText(Path.Combine(data,"server.log"),e.Data+Environment.NewLine,Encoding.UTF8);}catch{}}};
      backend.OutputDataReceived+=log;backend.ErrorDataReceived+=log;
      backend.Start();backend.BeginOutputReadLine();backend.BeginErrorReadLine();
      var splash=new Form();splash.Text="聊天素材合成器";splash.Width=340;splash.Height=130;
      splash.StartPosition=FormStartPosition.CenterScreen;splash.FormBorderStyle=FormBorderStyle.FixedDialog;splash.ControlBox=false;
      var label=new Label();label.Text="正在打开工作台…";label.AutoSize=true;label.Location=new Point(24,25);splash.Controls.Add(label);
      if(!noOpen)splash.Show();
      for(int i=0;i<120;i++) {
        if(Running()!=null)break;
        if(backend.HasExited)throw new Exception("后台未能启动，详情见 data/server.log。");
        Application.DoEvents();Thread.Sleep(150);
      }
      splash.Close();
      if(Running()==null)throw new Exception("工作台启动超时，详情见 data/server.log。");
      if(!noOpen)Open();
      var tray=new NotifyIcon();tray.Text="聊天素材合成器";tray.Icon=SystemIcons.Application;tray.Visible=true;
      var menu=new ContextMenuStrip();menu.Items.Add("打开工作台",null,(s,e)=>{try{Open();}catch{MessageBox.Show("浏览器未能打开，工作台地址："+url,"聊天素材合成器");}});
      menu.Items.Add("退出软件",null,(s,e)=>{Stop();tray.Visible=false;Application.Exit();});tray.ContextMenuStrip=menu;
      tray.DoubleClick+=(s,e)=>Open();
      var timer=new System.Windows.Forms.Timer();timer.Interval=1500;timer.Tick+=(s,e)=>{if(backend.HasExited){tray.Visible=false;Application.Exit();}};timer.Start();
      Application.Run();tray.Dispose();
    }catch(Exception e){if(backend!=null&&!backend.HasExited)Stop();MessageBox.Show(e.Message,"聊天素材合成器",MessageBoxButtons.OK,MessageBoxIcon.Error);}
  }
}
