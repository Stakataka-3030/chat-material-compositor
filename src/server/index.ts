import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assetKinds,
  newProject,
  projectSchema,
  type Project,
} from "../core/model.js";
import { exportFormats } from "../core/jobs.js";
import { AssetStore } from "./assets.js";
import { ProjectStore } from "./projects.js";
import { PluginStore } from "./plugins.js";
import { ExportQueue } from "./queue.js";
import { DATA, ROOT, config } from "./config.js";
import { atomicJson } from "./storage.js";
import { execute, ffmpegPath, ffprobePath } from "./media.js";
import { acquireInstance, releaseInstance } from "./instance.js";
import { UpdateService } from "./updates.js";
import { APP_VERSION } from "../core/version.js";
import { OnlineMaterialService } from "./online-materials.js";
import { exportMaterialPack, importMaterialPack } from "./material-packs.js";
const app = express(),
  server = http.createServer(app),
  clientToken = randomUUID();
const assets = new AssetStore(),
  projects = new ProjectStore(),
  plugins = new PluginStore();
const sessions = new Map<
  string,
  { project: Project; assets: ReturnType<AssetStore["list"]> }
>();
const sessionHost = {
  origin: `http://${config.host}:${config.port}`,
  create(project: Project) {
    const token = randomUUID(),
      value = { project, assets: assets.list() };
    sessions.set(token, value);
    return { token, ...value };
  },
  remove(token: string) {
    sessions.delete(token);
  },
};
const queue = new ExportQueue(assets, sessionHost);
const updates = new UpdateService();
const onlineMaterials = new OnlineMaterialService(assets);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});
const projectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxProjectBytes, files: 1 },
});
const streamClients = new Set<express.Response>();
let ready = false;
app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
app.use("/api", (req, res, next) => {
  if (!ready) return res.status(503).json({ error: "后台正在准备" });
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.get("x-liaomu-client") !== clientToken
  )
    return res.status(403).json({ error: "请从工作台发起操作" });
  next();
});
app.get("/api/bootstrap", async (_req, res) =>
  res.json({
    app: "聊天素材合成器",
    version: APP_VERSION,
    clientToken,
    assets: assets.list(),
    plugins: plugins.list(),
    projects: await projects.list(),
    jobs: queue.list(),
  }),
);
app.get("/api/updates", async (_req, res) => res.json(await updates.status()));
app.post("/api/updates/check", async (req, res) =>
  res.json(
    await updates.check(z.boolean().optional().parse(req.body.force) ?? false),
  ),
);
app.post("/api/updates/preferences", async (req, res) =>
  res.json(await updates.setAutoCheck(z.boolean().parse(req.body.autoCheck))),
);
app.get("/api/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  for (const [name, check] of [
    [
      "ffmpeg",
      () => execute(ffmpegPath, ["-version"], AbortSignal.timeout(10000)),
    ],
    [
      "ffprobe",
      () => execute(ffprobePath, ["-version"], AbortSignal.timeout(10000)),
    ],
    ["browser", () => queue.health()],
  ] as const) {
    try {
      await check();
      checks[name] = "ready";
    } catch (e) {
      checks[name] = (e as Error).message;
    }
  }
  const ok = Object.values(checks).every((v) => v === "ready");
  res.status(ok ? 200 : 503).json({ ok, checks });
});
app.get("/api/assets", (_req, res) => res.json(assets.list()));
app.get("/api/materials/online", async (req, res) =>
  res.json(
    await onlineMaterials.browse(
      z
        .string()
        .max(100)
        .parse(req.query.q ?? ""),
      z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(req.query.offset ?? 0),
    ),
  ),
);
app.post("/api/materials/online/import", async (req, res) =>
  res
    .status(201)
    .json(
      await onlineMaterials.import(
        z.string().max(2000).parse(req.body.url),
        z.enum(assetKinds).parse(req.body.kind),
        z.string().max(180).optional().parse(req.body.name),
      ),
    ),
);
app.post("/api/material-packs/export", async (req, res) =>
  exportMaterialPack(
    assets,
    z.array(z.string().max(120)).min(1).max(2000).parse(req.body.ids),
    res,
  ),
);
app.post(
  "/api/material-packs/import",
  projectUpload.single("file"),
  async (req, res) => {
    if (!req.file) throw new Error("请选择素材包ZIP");
    res.json(await importMaterialPack(assets, req.file.buffer));
  },
);
app.get("/api/assets/file/:id", async (req, res) => {
  const asset = assets.get(String(req.params.id));
  if (req.query.size && asset.kind !== "sound") {
    const file = await assets.thumbnail(asset.id, Number(req.query.size));
    res
      .type("image/webp")
      .set("Cache-Control", "public,max-age=31536000,immutable")
      .sendFile(file, { dotfiles: "allow" });
  } else
    res
      .type(asset.mime)
      .set("Cache-Control", "public,max-age=31536000,immutable")
      .sendFile(assets.resolve(asset.id), { dotfiles: "allow" });
});
app.post("/api/assets", upload.single("file"), async (req, res) => {
  if (!req.file) throw new Error("请选择素材文件");
  const kind = z.enum(assetKinds).parse(req.body.kind);
  const asset = await assets.ingest(
    req.file.buffer,
    String(req.body.name || req.file.originalname).slice(0, 180),
    kind,
    false,
    ["导入"],
  );
  res.status(201).json(asset);
});
app.post("/api/assets/:id/crop", async (req, res) => {
  const area = z
    .object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(1),
      height: z.number().min(1),
    })
    .parse(req.body);
  res.status(201).json(await assets.crop(String(req.params.id), area));
});
app.get("/api/plugins/example", (_req, res) =>
  res
    .type("application/json")
    .download(path.join(ROOT, "examples/order.style.json"), "订单.style.json"),
);
app.get("/api/projects", async (_req, res) => res.json(await projects.list()));
app.post("/api/projects", async (req, res) => {
  const p = newProject();
  if (req.body.title) p.title = String(req.body.title).slice(0, 120);
  res.status(201).json(await projects.save(p));
});
app.get("/api/projects/:id", async (req, res) =>
  res.json(await projects.get(String(req.params.id))),
);
app.put("/api/projects/:id", async (req, res) => {
  const p = projectSchema.parse(req.body.project);
  if (p.id !== req.params.id) throw new Error("工程标识不一致");
  res.json(
    await projects.save(
      p,
      z.number().int().nonnegative().parse(req.body.expectedRevision),
    ),
  );
});
app.get("/api/projects/:id/package", async (req, res) => {
  const p = await projects.get(String(req.params.id));
  res
    .type("application/zip")
    .attachment(`${p.title.replace(/[\\/:*?"<>|]/g, "_")}.chatproj`)
    .send(await projects.package(p.id, assets));
});
app.post(
  "/api/projects/import",
  projectUpload.single("file"),
  async (req, res) => {
    if (!req.file) throw new Error("请选择工程包");
    res.status(201).json(await projects.importPackage(req.file.buffer, assets));
  },
);
app.get("/api/plugins", (_req, res) => res.json(plugins.list()));
app.post("/api/plugins", async (req, res) =>
  res.status(201).json(await plugins.install(req.body)),
);
app.put("/api/plugins/:id", async (req, res) => {
  await plugins.setEnabled(
    String(req.params.id),
    z.boolean().parse(req.body.enabled),
  );
  res.json(plugins.list());
});
app.get("/api/jobs", (_req, res) => res.json(queue.list()));
app.post("/api/jobs", async (req, res) => {
  const formats = z
    .array(z.enum(exportFormats))
    .min(1)
    .max(8)
    .parse(req.body.formats);
  res
    .status(202)
    .json(await queue.submit(projectSchema.parse(req.body.project), formats));
});
app.post("/api/jobs/:id/cancel", async (req, res) =>
  res.json(await queue.cancel(String(req.params.id))),
);
app.post("/api/jobs/:id/retry", async (req, res) =>
  res.status(202).json(await queue.retry(String(req.params.id))),
);
app.get("/api/jobs/:id", (req, res) =>
  res.json(queue.get(String(req.params.id))),
);
app.get("/api/jobs/:id/files/:name", (req, res) => {
  const job = queue.get(String(req.params.id)),
    file = job.artifacts.find((a) => a.name === req.params.name);
  if (!file) return res.status(404).json({ error: "文件尚未生成" });
  res.download(path.join(DATA, "exports", job.id, file.name), file.name, {
    dotfiles: "allow",
  });
});
app.get("/api/render/session/:token", (req, res) => {
  const data = sessions.get(String(req.params.token));
  if (!data) return res.status(404).json({ error: "渲染会话已结束" });
  res.json(data);
});
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  streamClients.add(res);
  const listener = (job: unknown) =>
    res.write(`data: ${JSON.stringify(job)}\n\n`);
  queue.on("change", listener);
  const heartbeat = setInterval(() => res.write(": alive\n\n"), 20000);
  res.on("close", () => {
    clearInterval(heartbeat);
    queue.off("change", listener);
    streamClients.delete(res);
  });
});
app.post("/api/shutdown", (_req, res) => {
  res.json({ message: "后台已开始关闭" });
  setTimeout(() => void shutdown(), 100);
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  streamClients.forEach((res) => res.end());
  await queue.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(path.join(DATA, "server.json"), { force: true });
  await releaseInstance();
  process.exit(0);
}
async function start() {
  await acquireInstance();
  await fs.mkdir(DATA, { recursive: true });
  await assets.init();
  await plugins.init();
  await projects.init(assets);
  const built = await fs
    .access(path.join(ROOT, "dist/client/index.html"))
    .then(() => true)
    .catch(() => false);
  if (built && process.env.LIAOMU_DEV !== "1") {
    app.use(express.static(path.join(ROOT, "dist/client")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(ROOT, "dist/client/index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: path.join(ROOT, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.use(
    (
      error: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      const message =
        error instanceof z.ZodError
          ? error.issues.map((i) => i.message).join("；")
          : error.message;
      res.status(error.status || 400).json({ error: message || "操作未完成" });
    },
  );
  for (let offset = 0; offset < 10; offset++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port + offset, config.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || offset === 9)
        throw e;
    }
  }
  const address = server.address() as { port: number };
  sessionHost.origin = `http://${config.host}:${address.port}`;
  await atomicJson(path.join(DATA, "server.json"), {
    pid: process.pid,
    url: sessionHost.origin,
    root: ROOT,
  });
  await queue.init();
  ready = true;
  console.log(`聊天素材合成器已就绪：${sessionHost.origin}`);
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
start().catch(async (error) => {
  console.error(error.message);
  await releaseInstance();
  process.exit(1);
});
