import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { projectSchema, uid, type Project } from "../core/model.js";
import { PluginRegistry } from "../core/plugins.js";
import type { ExportFormat, ExportJob } from "../core/jobs.js";
import { DATA, config } from "./config.js";
import { atomicJson, readJson, SerialWriter } from "./storage.js";
import {
  BrowserPool,
  renderExport,
  type RenderSessionHost,
} from "./encoder.js";
import type { AssetStore } from "./assets.js";
export class ExportQueue extends EventEmitter {
  private jobs = new Map<string, ExportJob>();
  private pending: string[] = [];
  private current: { id: string; abort: AbortController } | null = null;
  private writer = new SerialWriter();
  private pool = new BrowserPool();
  private stopped = false;
  constructor(
    private assets: AssetStore,
    private sessions: RenderSessionHost,
  ) {
    super();
  }
  async init() {
    await fs.mkdir(path.join(DATA, "jobs"), { recursive: true });
    await fs.mkdir(path.join(DATA, "tmp"), { recursive: true });
    for (const file of (await fs.readdir(path.join(DATA, "jobs"))).filter((n) =>
      n.endsWith(".job.json"),
    )) {
      const job = await readJson<ExportJob | null>(
        path.join(DATA, "jobs", file),
        null,
      );
      if (!job) continue;
      if (job.status === "running") {
        job.status = "queued";
        job.progress = 0;
        job.stage = "恢复任务";
      }
      this.jobs.set(job.id, job);
      if (job.status === "queued") this.pending.push(job.id);
    }
    setTimeout(() => void this.next(), 1000);
  }
  list() {
    return [...this.jobs.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("导出任务不存在");
    return job;
  }
  async submit(input: Project, formats: ExportFormat[]) {
    if (this.stopped) throw new Error("服务正在关闭");
    if (this.pending.length >= config.queueLimit)
      throw new Error("导出队列已满，请等待当前任务完成");
    const project = projectSchema.parse(structuredClone(input)),
      registry = new PluginRegistry(project.plugins);
    if (!project.messages.length) throw new Error("请先添加消息");
    project.messages.forEach((m) =>
      registry.validate(m, new Set(project.speakers.map((s) => s.id))),
    );
    const id = uid(),
      job: ExportJob = {
        id,
        projectId: project.id,
        title: project.title,
        formats: [...new Set(formats)],
        status: "queued",
        progress: 0,
        stage: "等待导出",
        createdAt: new Date().toISOString(),
        artifacts: [],
        width: project.output.width,
        fps: project.output.fps,
      };
    await atomicJson(path.join(DATA, "jobs", id + ".project.json"), project);
    this.jobs.set(id, job);
    await this.persist(job);
    this.pending.push(id);
    this.emit("change", job);
    void this.next();
    return job;
  }
  private persist(job: ExportJob) {
    const snapshot = structuredClone(job);
    return this.writer.run(() =>
      atomicJson(path.join(DATA, "jobs", job.id + ".job.json"), snapshot),
    );
  }
  private async patch(job: ExportJob, patch: Partial<ExportJob>) {
    Object.assign(job, patch);
    await this.persist(job);
    this.emit("change", structuredClone(job));
  }
  async cancel(id: string) {
    const job = this.get(id);
    if (job.status === "queued") {
      this.pending = this.pending.filter((i) => i !== id);
      await this.patch(job, {
        status: "cancelled",
        stage: "已取消",
        finishedAt: new Date().toISOString(),
      });
    }
    if (job.status === "running" && this.current?.id === id)
      this.current.abort.abort(new Error("导出已取消"));
    return job;
  }
  async retry(id: string) {
    const previous = this.get(id);
    if (["queued", "running"].includes(previous.status))
      throw new Error("任务仍在处理");
    const project = projectSchema.parse(
      await readJson(path.join(DATA, "jobs", id + ".project.json"), null),
    );
    return this.submit(project, previous.formats);
  }
  private async next() {
    if (this.current || this.stopped) return;
    const id = this.pending.shift();
    if (!id) return;
    const job = this.get(id),
      abort = new AbortController();
    this.current = { id, abort };
    const timer = setTimeout(
      () => abort.abort(new Error("导出超过处理时限")),
      config.renderTimeoutMs,
    );
    let lastWrite = 0;
    try {
      await this.patch(job, {
        status: "running",
        startedAt: new Date().toISOString(),
        stage: "准备画面",
        progress: 0,
      });
      const project = projectSchema.parse(
        await readJson(path.join(DATA, "jobs", id + ".project.json"), null),
      );
      await renderExport(
        id,
        project,
        job.formats,
        this.assets,
        this.pool,
        this.sessions,
        abort.signal,
        (progress, stage) => {
          job.progress = Math.round(progress);
          job.stage = stage;
          this.emit("change", structuredClone(job));
          if (Date.now() - lastWrite > 1000) {
            lastWrite = Date.now();
            void this.persist(job).catch(() => {});
          }
        },
        async (value) => {
          job.artifacts = [
            ...job.artifacts.filter((a) => a.name !== value.name),
            value,
          ];
          await this.persist(job);
          this.emit("change", structuredClone(job));
        },
      );
      await this.patch(job, {
        status: "done",
        progress: 100,
        stage: "完成",
        finishedAt: new Date().toISOString(),
      });
    } catch (e) {
      const reason =
        abort.signal.reason instanceof Error
          ? abort.signal.reason.message
          : (e as Error).message;
      if (this.stopped)
        await this.patch(job, {
          status: "queued",
          progress: 0,
          stage: "等待重新启动",
          error: undefined,
        });
      else
        await this.patch(job, {
          status:
            abort.signal.aborted && reason === "导出已取消"
              ? "cancelled"
              : "failed",
          error: reason,
          stage: reason === "导出已取消" ? "已取消" : "导出失败",
          finishedAt: new Date().toISOString(),
        });
    } finally {
      clearTimeout(timer);
      this.current = null;
      setImmediate(() => void this.next());
    }
  }
  async health() {
    return (await this.pool.get()).version();
  }
  async close() {
    this.stopped = true;
    if (this.current) this.current.abort.abort(new Error("服务关闭"));
    await this.pool.close();
    const end = Date.now() + 10000;
    while (this.current && Date.now() < end)
      await new Promise((r) => setTimeout(r, 50));
  }
}
