import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data"),
  stateFile = path.join(data, "server.json");
async function running() {
  try {
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    if (state.root !== root || new URL(state.url).hostname !== "127.0.0.1")
      return null;
    const response = await fetch(state.url + "/api/bootstrap", {
      signal: AbortSignal.timeout(2000),
    });
    const info = await response.json();
    return info.app === "聊天素材合成器" ? { ...state, info } : null;
  } catch {
    return null;
  }
}
function runNpm(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "cmd.exe" : "npm",
      process.platform === "win32"
        ? ["/d", "/s", "/c", `npm ${command}`]
        : command.split(" "),
      {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("组件准备未完成")),
    );
  });
}
function open(url) {
  if (process.argv.includes("--no-open")) return;
  const child =
    process.platform === "win32"
      ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
          windowsHide: true,
          stdio: "ignore",
        })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
          stdio: "ignore",
        });
  child.unref();
}
try {
  let service = await running();
  if (process.argv.includes("--stop")) {
    if (service)
      await fetch(service.url + "/api/shutdown", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-liaomu-client": service.info.clientToken,
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
    console.log("聊天素材合成器后台已关闭。");
  } else {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 12))
      throw new Error("请安装 Node.js 22.12 或更新版本。");
    if (!service) {
      if (
        !(await fs
          .access(path.join(root, "node_modules/puppeteer"))
          .then(() => true)
          .catch(() => false))
      )
        await runNpm("ci");
      if (
        !(await fs
          .access(path.join(root, "dist/server/index.js"))
          .then(() => true)
          .catch(() => false))
      )
        await runNpm("run build");
      await fs.mkdir(data, { recursive: true });
      const out = openSync(path.join(data, "server.log"), "a"),
        error = openSync(path.join(data, "server-error.log"), "a");
      const child = spawn(process.execPath, ["dist/server/index.js"], {
        cwd: root,
        detached: true,
        windowsHide: true,
        env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
        stdio: ["ignore", out, error],
      });
      child.unref();
      closeSync(out);
      closeSync(error);
      for (let i = 0; i < 80 && !service; i++) {
        await new Promise((r) => setTimeout(r, 250));
        service = await running();
      }
      if (!service)
        throw new Error("后台启动未完成，详情见 data/server-error.log。");
    }
    console.log(`聊天素材合成器已就绪：${service.url}`);
    open(service.url);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
