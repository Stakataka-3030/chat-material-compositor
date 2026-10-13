import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import archiver from "archiver";
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { Project, Asset } from "../core/model.js";
import type { ExportFormat, ExportArtifact } from "../core/jobs.js";
import { buildTimeline, frameCount } from "../core/timeline.js";
import { DATA } from "./config.js";
import { ffmpegPath, execute, probe } from "./media.js";
import { makeAudio } from "./audio.js";
import type { AssetStore } from "./assets.js";
interface RenderSession {
  token: string;
  project: Project;
  assets: Asset[];
}
export interface RenderSessionHost {
  create(project: Project): RenderSession;
  remove(token: string): void;
  origin: string;
}
export class BrowserPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  async get() {
    if (this.browser?.connected) return this.browser;
    if (!this.launching)
      this.launching = puppeteer
        .launch({
          headless: "shell",
          args: ["--no-sandbox", "--force-color-profile=srgb"],
          protocolTimeout: 120000,
        })
        .then((browser) => {
          this.browser = browser;
          browser.on("disconnected", () => {
            this.browser = null;
          });
          return browser;
        })
        .finally(() => {
          this.launching = null;
        });
    return this.launching;
  }
  async close() {
    if (this.browser) await this.browser.close();
    this.browser = null;
  }
}
function codec(format: ExportFormat) {
  if (format === "webm")
    return [
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-b:v",
      "0",
      "-crf",
      "27",
      "-row-mt",
      "1",
      "-cpu-used",
      "4",
    ];
  if (format === "mov-prores")
    return [
      "-c:v",
      "prores_ks",
      "-profile:v",
      "4",
      "-pix_fmt",
      "yuva444p10le",
      "-alpha_bits",
      "16",
    ];
  if (format === "mov-animation") return ["-c:v", "qtrle", "-pix_fmt", "argb"];
  if (format === "mov-png") return ["-c:v", "png", "-pix_fmt", "rgba"];
  return [
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  ];
}
async function zipDirectory(
  folder: string,
  output: string,
  signal: AbortSignal,
) {
  const stream = createWriteStream(output),
    archive = archiver("zip", { zlib: { level: 1 } });
  const done = new Promise<void>((resolve, reject) => {
    stream.on("close", resolve);
    stream.on("error", reject);
    archive.on("error", reject);
  });
  const abort = () => {
    archive.abort();
    stream.destroy(new Error("导出已取消"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    archive.pipe(stream);
    archive.directory(folder, false);
    await archive.finalize();
    await done;
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
async function framePng(page: Page, atMs: number, long = false) {
  const text = await page.evaluate(
    ({ atMs, long }) => {
      const api = (
        window as unknown as {
          liaomuRender: {
            frame(t: number): Promise<string>;
            long(): Promise<string>;
          };
        }
      ).liaomuRender;
      return long ? api.long() : api.frame(atMs);
    },
    { atMs, long },
  );
  return Buffer.from(text.slice(text.indexOf(",") + 1), "base64");
}
export async function renderExport(
  jobId: string,
  project: Project,
  formats: ExportFormat[],
  assets: AssetStore,
  pool: BrowserPool,
  sessions: RenderSessionHost,
  signal: AbortSignal,
  progress: (percent: number, stage: string) => void,
  artifact: (value: ExportArtifact) => Promise<void>,
) {
  const timeline = buildTimeline(project),
    n = frameCount(timeline.durationMs, project.output.fps);
  if (timeline.durationMs > 30 * 60 * 1000)
    throw new Error("单次导出最长 30 分钟，可把较长内容拆成多个工程");
  const work = path.join(DATA, "tmp", jobId),
    output = path.join(DATA, "exports", jobId);
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  const browser = await pool.get(),
    context = await browser.createBrowserContext();
  const session = sessions.create(project);
  const page = await context.newPage();
  const abort = () => {
    void context.close().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (
        url.startsWith(sessions.origin + "/") ||
        url.startsWith("data:") ||
        url.startsWith("blob:")
      )
        void req.continue();
      else void req.abort();
    });
    await page.goto(`${sessions.origin}/render?session=${session.token}`, {
      waitUntil: "load",
      timeout: 45000,
    });
    await page.waitForFunction(
      () =>
        Boolean(
          (
            window as unknown as {
              liaomuRender?: unknown;
              liaomuRenderError?: string;
            }
          ).liaomuRender ||
            (window as unknown as { liaomuRenderError?: string })
              .liaomuRenderError,
        ),
      { timeout: 45000 },
    );
    const preparationError = await page.evaluate(
      () =>
        (window as unknown as { liaomuRenderError?: string }).liaomuRenderError,
    );
    if (preparationError) throw new Error(preparationError);
    const dims = await page.evaluate(() => {
      const api = (
        window as unknown as {
          liaomuRender: {
            dimensions: { width: number; height: number };
            longDimensions: { width: number; height: number };
          };
        }
      ).liaomuRender;
      return { dimensions: api.dimensions, longDimensions: api.longDimensions };
    });
    // Read only metadata; the rendering API functions are intentionally not serialized.
    const size = dims.dimensions;
    if (size.width * size.height > 32_000_000 || size.height > 16000)
      throw new Error("输出画布过大，请调整手机变换或输出宽度");
    progress(3, "准备音轨");
    const audio = await makeAudio(
      project,
      assets,
      path.join(work, "audio.wav"),
      signal,
    );
    const videoFormats = formats.filter(
      (f) => f !== "long-png" && f !== "png-sequence",
    );
    const cached =
      formats.includes("png-sequence") ||
      formats.includes("gif") ||
      videoFormats.length > 1;
    const frames = path.join(work, "frames");
    const publish = async (name: string, format: ExportFormat) => {
      const file = path.join(output, name),
        stat = await fs.stat(file);
      if (!stat.size) throw new Error("导出文件为空");
      await artifact({
        name,
        format,
        size: stat.size,
        url: `/api/jobs/${jobId}/files/${name}`,
      });
    };
    if (formats.includes("long-png")) {
      const pageHeight = Math.min(
          30000,
          Math.floor(40_000_000 / project.output.width),
        ),
        pages = Math.ceil(dims.longDimensions.height / pageHeight);
      const longFolder = path.join(work, "long");
      await fs.mkdir(longFolder, { recursive: true });
      for (let i = 0; i < pages; i++) {
        signal.throwIfAborted();
        const encoded = await page.evaluate(
          ({ offset, height }) =>
            (
              window as unknown as {
                liaomuRender: {
                  long(offset: number, height: number): Promise<string>;
                };
              }
            ).liaomuRender.long(offset, height),
          { offset: i * pageHeight, height: pageHeight },
        );
        await fs.writeFile(
          path.join(longFolder, `long_${String(i + 1).padStart(3, "0")}.png`),
          Buffer.from(encoded.split(",")[1]!, "base64"),
        );
      }
      if (pages === 1) {
        await fs.rename(
          path.join(longFolder, "long_001.png"),
          path.join(output, "chat-long.png"),
        );
        await publish("chat-long.png", "long-png");
      } else {
        await fs.writeFile(
          path.join(longFolder, "pages.json"),
          JSON.stringify(
            {
              width: project.output.width,
              totalHeight: dims.longDimensions.height,
              pages,
              pageHeight,
            },
            null,
            2,
          ),
        );
        await zipDirectory(
          longFolder,
          path.join(work, "chat-long-pages.zip"),
          signal,
        );
        await fs.rename(
          path.join(work, "chat-long-pages.zip"),
          path.join(output, "chat-long-pages.zip"),
        );
        await publish("chat-long-pages.zip", "long-png");
      }
    }
    if (cached) {
      await fs.mkdir(frames, { recursive: true });
      for (let i = 0; i < n; i++) {
        signal.throwIfAborted();
        const data = await framePng(page, (i * 1000) / project.output.fps);
        await fs.writeFile(
          path.join(frames, `frame_${String(i).padStart(6, "0")}.png`),
          data,
        );
        if (i % 5 === 0) progress(5 + (i / n) * 65, `绘制画面 ${i + 1} / ${n}`);
      }
      if (formats.includes("png-sequence")) {
        await fs.writeFile(
          path.join(frames, "sequence.json"),
          JSON.stringify(
            {
              fps: project.output.fps,
              frames: n,
              durationMs: timeline.durationMs,
              width: size.width,
              height: size.height,
              events: timeline.events,
            },
            null,
            2,
          ),
        );
        if (audio) await fs.copyFile(audio, path.join(frames, "audio.wav"));
        await zipDirectory(frames, path.join(work, "chat-frames.zip"), signal);
        await fs.rename(
          path.join(work, "chat-frames.zip"),
          path.join(output, "chat-frames.zip"),
        );
        await publish("chat-frames.zip", "png-sequence");
      }
    }
    for (const [index, format] of videoFormats.entries()) {
      signal.throwIfAborted();
      progress(
        cached ? 70 + (index / videoFormats.length) * 25 : 5,
        `编码 ${format}`,
      );
      const ext = format.startsWith("mov") ? "mov" : format;
      const name = `chat-${format}.${ext}`,
        final = path.join(output, name),
        temp = path.join(work, name);
      if (format === "gif") {
        const palette = path.join(work, "palette.png");
        await execute(
          ffmpegPath,
          [
            "-y",
            "-v",
            "error",
            "-framerate",
            String(project.output.fps),
            "-i",
            path.join(frames, "frame_%06d.png"),
            "-vf",
            "palettegen=reserve_transparent=1",
            "-frames:v",
            "1",
            palette,
          ],
          signal,
        );
        await execute(
          ffmpegPath,
          [
            "-y",
            "-v",
            "error",
            "-framerate",
            String(project.output.fps),
            "-i",
            path.join(frames, "frame_%06d.png"),
            "-i",
            palette,
            "-lavfi",
            "paletteuse=alpha_threshold=128",
            "-loop",
            project.playback.loop ? "0" : "-1",
            temp,
          ],
          signal,
        );
      } else {
        const args = ["-y", "-hide_banner", "-loglevel", "warning"];
        if (cached)
          args.push(
            "-framerate",
            String(project.output.fps),
            "-i",
            path.join(frames, "frame_%06d.png"),
          );
        else
          args.push(
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-framerate",
            String(project.output.fps),
            "-i",
            "pipe:0",
          );
        if (audio) args.push("-i", audio);
        if (format === "mp4" && project.output.background === "transparent") {
          const color = project.output.backgroundColor;
          args.push(
            "-filter_complex",
            `[0:v]format=rgba[fg];color=c=${color}:s=${size.width}x${size.height}:r=${project.output.fps}[bg];[bg][fg]overlay=shortest=1:format=auto[v]`,
            "-map",
            "[v]",
          );
          if (audio) args.push("-map", "1:a:0");
        }
        args.push(...codec(format), "-t", String(n / project.output.fps));
        if (audio)
          args.push(
            "-c:a",
            format === "webm"
              ? "libopus"
              : format.startsWith("mov")
                ? "pcm_s16le"
                : "aac",
          );
        else args.push("-an");
        args.push(temp);
        const process = spawn(ffmpegPath, args, {
          windowsHide: true,
          stdio: [cached ? "ignore" : "pipe", "ignore", "pipe"],
          signal,
        });
        let error = "";
        process.stderr?.on("data", (data) => {
          error = (error + data.toString()).slice(-8000);
        });
        process.stdin?.on("error", () => {});
        const completion = new Promise<void>((resolve, reject) => {
          process.on("error", reject);
          process.on("close", (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`编码失败：${error.slice(-1800)}`)),
          );
        });
        void completion.catch(() => {});
        try {
          if (!cached) {
            for (let i = 0; i < n; i++) {
              signal.throwIfAborted();
              const png = await framePng(page, (i * 1000) / project.output.fps);
              if (process.exitCode !== null || process.stdin!.destroyed)
                throw new Error(`编码器已退出：${error.slice(-1800)}`);
              if (!process.stdin!.write(png))
                await once(process.stdin!, "drain", { signal });
              if (i % 5 === 0)
                progress(5 + (i / n) * 85, `绘制画面 ${i + 1} / ${n}`);
            }
            process.stdin!.end();
          }
          await completion;
        } catch (e) {
          process.kill();
          await completion.catch(() => {});
          throw e;
        }
        const info = await probe(temp, signal),
          stream = info.streams.find((s) => s.codec_type === "video");
        if (
          !stream ||
          stream.width !== size.width ||
          stream.height !== size.height
        )
          throw new Error("编码结果的画面尺寸不一致");
      }
      await fs.rename(temp, final);
      await publish(name, format);
    }
    progress(100, "完成");
  } finally {
    signal.removeEventListener("abort", abort);
    sessions.remove(session.token);
    await context.close().catch(() => {});
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
