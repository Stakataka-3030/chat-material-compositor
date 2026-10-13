import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("便携包构建需要Windows x64环境");
const require = createRequire(path.join(root, "package.json")),
  archiver = require("archiver");
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const folder = path.resolve(
  root,
  "..",
  `聊天素材合成器-${pkg.version}-Windows-x64`,
);
try {
  if ((await fs.readdir(folder)).length)
    throw new Error("便携目录已存在，请使用新的输出目录");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await fs.mkdir(folder, { recursive: true });
const nodeArg = process.argv.indexOf("--node");
const nodeBinary = nodeArg >= 0 ? process.argv[nodeArg + 1] : process.execPath;
const browserCache =
  process.env.PUPPETEER_CACHE_DIR || path.join(root, ".runtime/browser");
const nodeLicense = process.env.NODE_LICENSE_FILE;
if (!nodeLicense)
  throw new Error("打包前请用 NODE_LICENSE_FILE 指定官方Node许可文本");
async function run(file, args) {
  await new Promise((ok, bad) => {
    const p = spawn(file, args, {
      cwd: root,
      windowsHide: true,
      stdio: "inherit",
    });
    p.on("error", bad);
    p.on("exit", (c) => (c === 0 ? ok() : bad(new Error("构建失败"))));
  });
}
const compiler = path.join(
  process.env.WINDIR || "C:\\Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
await run(compiler, [
  "/nologo",
  "/codepage:65001",
  "/target:winexe",
  "/platform:x64",
  "/out:" + path.join(folder, "聊天素材合成器.exe"),
  "/reference:System.Windows.Forms.dll",
  "/reference:System.Drawing.dll",
  "/reference:System.Web.Extensions.dll",
  path.join(root, "launcher/Program.cs"),
]);
for (const file of [
  "package.json",
  "release.config.json",
  ".puppeteerrc.cjs",
  "LICENSE",
  "README.md",
])
  await fs.copyFile(path.join(root, file), path.join(folder, file));
for (const dir of ["dist", "examples"])
  await fs.cp(path.join(root, dir), path.join(folder, dir), {
    recursive: true,
  });
await fs.mkdir(path.join(folder, ".runtime/node"), { recursive: true });
await fs.copyFile(nodeBinary, path.join(folder, ".runtime/node/node.exe"));
await fs.copyFile(nodeLicense, path.join(folder, ".runtime/node/LICENSE"));
await fs.cp(
  path.join(browserCache, "chrome-headless-shell"),
  path.join(folder, ".runtime/browser/chrome-headless-shell"),
  { recursive: true, filter: (file) => !file.endsWith(".log") },
);
// Resolve only the installed production dependency graph; no npm or downloads at runtime.
const included = new Map();
async function resolve(name, from) {
  let base = from;
  for (;;) {
    const dir = path.join(base, "node_modules", name);
    try {
      await fs.access(path.join(dir, "package.json"));
      return dir;
    } catch {}
    const parent = path.dirname(base);
    if (parent === base) return null;
    base = parent;
  }
}
async function collect(name, from) {
  const dir = await resolve(name, from);
  if (!dir || included.has(dir)) return;
  const info = JSON.parse(
    await fs.readFile(path.join(dir, "package.json"), "utf8"),
  );
  included.set(dir, info);
  for (const dep of Object.keys({
    ...info.dependencies,
    ...info.optionalDependencies,
  }))
    await collect(dep, dir);
}
for (const name of Object.keys(pkg.dependencies)) await collect(name, root);
for (const [dir] of included) {
  const rel = path.relative(root, dir);
  if (rel.startsWith("..")) throw new Error("依赖路径不属于项目");
  await fs.cp(dir, path.join(folder, rel), {
    recursive: true,
    filter: (source) =>
      !path.relative(dir, source).split(path.sep).includes("node_modules"),
  });
}
let notice =
  "第三方运行组件遵循各自许可。\nNode.js: https://github.com/nodejs/node\nChromium: https://chromium.googlesource.com/chromium/src\nFFmpeg: https://github.com/eugeneware/ffmpeg-static / https://ffmpeg.org\n\n";
for (const [dir, info] of included)
  for (const file of await fs.readdir(dir))
    if (/^(LICENSE|LICENCE|COPYING|NOTICE)/i.test(file)) {
      try {
        notice +=
          `\n=== ${info.name} ${info.version} / ${file} ===\n` +
          (await fs.readFile(path.join(dir, file), "utf8"));
      } catch {}
    }
await fs.writeFile(path.join(folder, "THIRD_PARTY_NOTICES.txt"), notice);
const manifest = {
  version: pkg.version,
  platform: "win32-x64",
  nodeSha256: createHash("sha256")
    .update(await fs.readFile(nodeBinary))
    .digest("hex"),
  modules: [...included.values()].map((p) => ({
    name: p.name,
    version: p.version,
  })),
};
await fs.writeFile(
  path.join(folder, "runtime-manifest.json"),
  JSON.stringify(manifest, null, 2),
);
const output = path.resolve(
    root,
    "..",
    `chat-material-compositor-${pkg.version}-windows-x64.zip`,
  ),
  archive = archiver("zip", { zlib: { level: 6 } }),
  stream = createWriteStream(output);
const done = new Promise((ok, bad) => {
  stream.on("close", ok);
  stream.on("error", bad);
  archive.on("error", bad);
});
archive.pipe(stream);
archive.directory(folder, "聊天素材合成器");
await archive.finalize();
await done;
console.log(
  JSON.stringify({
    folder: path.basename(folder),
    archive: path.basename(output),
    bytes: (await fs.stat(output)).size,
    modules: included.size,
  }),
);
