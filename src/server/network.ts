import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProxyAgent } from "undici";
const run = promisify(execFile);
let proxy: Promise<ProxyAgent | null> | null = null;
async function localSystemProxy() {
  if (process.platform !== "win32") return null;
  try {
    const command = String.raw`$p=Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable,ProxyServer -ErrorAction Stop; @{enabled=$p.ProxyEnable;server=$p.ProxyServer}|ConvertTo-Json -Compress`;
    const { stdout } = await run(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-Command", command],
      { windowsHide: true, timeout: 3000 },
    );
    const value = JSON.parse(stdout);
    if (value.enabled !== 1 || typeof value.server !== "string") return null;
    const parts = value.server.split(";") as string[];
    const candidate = (
      parts.find((p) => p.startsWith("https=")) ??
      parts.find((p) => p.startsWith("http=")) ??
      parts[0]!
    )
      .replace(/^https?=/, "")
      .trim();
    if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(candidate)) return null;
    return new ProxyAgent(`http://${candidate}`);
  } catch {
    return null;
  }
}
/** Follow the local system proxy without changing process-wide fetch defaults. */
export const networkFetch: typeof fetch = async (input, init) => {
  proxy ??= localSystemProxy();
  const dispatcher = await proxy;
  return fetch(
    input,
    dispatcher ? ({ ...init, dispatcher } as RequestInit) : init,
  );
};
