import fs from "node:fs/promises";
import path from "node:path";
import { DATA } from "./config.js";
const lock = path.join(DATA, "instance.json");
export async function acquireInstance() {
  await fs.mkdir(DATA, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await fs.open(lock, "wx");
      await file.writeFile(JSON.stringify({ pid: process.pid }));
      await file.close();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const previous = JSON.parse(await fs.readFile(lock, "utf8")) as {
        pid: number;
      };
      let alive = true;
      try {
        process.kill(previous.pid, 0);
      } catch {
        alive = false;
      }
      if (alive) throw new Error("聊天素材合成器后台已在运行");
      await fs.rm(lock, { force: true });
    }
  }
  throw new Error("后台启动未完成");
}
export async function releaseInstance() {
  try {
    const value = JSON.parse(await fs.readFile(lock, "utf8"));
    if (value.pid === process.pid) await fs.rm(lock, { force: true });
  } catch {}
}
