import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Asset, AssetKind, Rect } from "../core/model.js";
import { DATA, ROOT } from "./config.js";
import { atomicJson, readJson, SerialWriter } from "./storage.js";
import { probe } from "./media.js";

const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const imageMimes: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};
/** Find the enclosed transparent region of a shell, excluding the exterior. */
export async function screenMask(
  data: Buffer,
): Promise<{ mask: Buffer; screen: Rect }> {
  const meta = await sharp(data).metadata();
  const W = meta.width!,
    H = meta.height!,
    ratio = Math.min(1, 480 / Math.max(W, H));
  const { data: pixels, info } = await sharp(data)
    .resize(
      Math.max(1, Math.round(W * ratio)),
      Math.max(1, Math.round(H * ratio)),
    )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    seen = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let best: number[] = [],
    bestBox: Rect | null = null;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || pixels[start * 4 + 3]! > 25) continue;
    let read = 0,
      write = 1,
      edge = false,
      minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    queue[0] = start;
    seen[start] = 1;
    const component: number[] = [];
    while (read < write) {
      const cell = queue[read++]!,
        x = cell % w,
        y = Math.floor(cell / w);
      component.push(cell);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (!x || !y || x === w - 1 || y === h - 1) edge = true;
      const next = [
        x > 0 ? cell - 1 : -1,
        x < w - 1 ? cell + 1 : -1,
        y > 0 ? cell - w : -1,
        y < h - 1 ? cell + w : -1,
      ];
      for (const n of next)
        if (n >= 0 && !seen[n] && pixels[n * 4 + 3]! <= 25) {
          seen[n] = 1;
          queue[write++] = n;
        }
    }
    if (!edge && component.length > best.length) {
      best = component;
      bestBox = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
  }
  const mask = Buffer.alloc(w * h * 4);
  if (!bestBox || best.length < w * h * 0.02) {
    bestBox = {
      x: Math.round(w * 0.08),
      y: Math.round(h * 0.05),
      width: Math.round(w * 0.84),
      height: Math.round(h * 0.9),
    };
    for (let y = bestBox.y; y < bestBox.y + bestBox.height; y++)
      for (let x = bestBox.x; x < bestBox.x + bestBox.width; x++)
        best.push(y * w + x);
  }
  for (const cell of best) {
    const p = cell * 4;
    mask[p] = 255;
    mask[p + 1] = 255;
    mask[p + 2] = 255;
    mask[p + 3] = 255;
  }
  const full = await sharp(mask, { raw: { width: w, height: h, channels: 4 } })
    .resize(W, H, { kernel: "nearest" })
    .png()
    .toBuffer();
  return {
    mask: full,
    screen: {
      x: Math.round(bestBox.x / ratio),
      y: Math.round(bestBox.y / ratio),
      width: Math.round(bestBox.width / ratio),
      height: Math.round(bestBox.height / ratio),
    },
  };
}
export class AssetStore {
  constructor(private locations = { root: ROOT, data: DATA }) {}
  private assets = new Map<string, Asset>();
  private writer = new SerialWriter();
  private thumbnails = new Map<string, Promise<string>>();
  async init() {
    const builtins = await readJson<Asset[]>(
      path.join(this.locations.root, "resources", "manifest.json"),
      [],
    );
    const imported = await readJson<Asset[]>(
      path.join(this.locations.data, "assets.json"),
      [],
    );
    [...builtins, ...imported].forEach((a) => this.assets.set(a.id, a));
    await fs.mkdir(path.join(this.locations.data, "assets"), {
      recursive: true,
    });
  }
  list() {
    return [...this.assets.values()];
  }
  get(id: string) {
    const a = this.assets.get(id);
    if (!a) throw new Error(`素材不存在：${id}`);
    return a;
  }
  resolve(id: string) {
    const a = this.get(id),
      file = a.file.startsWith("data/assets/")
        ? path.join(this.locations.data, "assets", path.basename(a.file))
        : path.resolve(this.locations.root, a.file);
    const allowed = [
      path.join(this.locations.root, "resources", "assets"),
      path.join(this.locations.data, "assets"),
    ];
    if (!allowed.some((root) => file.startsWith(root + path.sep)))
      throw new Error("素材路径无效");
    return file;
  }
  async thumbnail(id: string, size: number) {
    const asset = this.get(id);
    if (asset.kind === "sound") throw new Error("音频没有图片预览");
    if (!Number.isFinite(size)) throw new Error("预览尺寸无效");
    const dimension = Math.max(64, Math.min(2400, Math.round(size / 64) * 64));
    const folder = path.join(this.locations.data, "tmp", "thumbnails"),
      file = path.join(folder, `${id}-${dimension}.webp`);
    if (this.thumbnails.has(file)) return this.thumbnails.get(file)!;
    const operation = (async () => {
      await fs.mkdir(folder, { recursive: true });
      if (
        !(await fs
          .access(file)
          .then(() => true)
          .catch(() => false))
      ) {
        const temporary = file + ".tmp";
        await sharp(this.resolve(id))
          .rotate()
          .resize(dimension, dimension, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ lossless: true })
          .toFile(temporary);
        await fs.rename(temporary, file);
      }
      return file;
    })().finally(() => this.thumbnails.delete(file));
    this.thumbnails.set(file, operation);
    return operation;
  }
  async ingest(
    data: Buffer,
    name: string,
    kind: AssetKind,
    builtin = false,
    tags: string[] = [],
    source?: Asset["source"],
  ): Promise<Asset> {
    return this.writer.run(async () => {
      const hash = digest(data),
        id = `${kind}-${hash.slice(0, 24)}`;
      const existing = this.assets.get(id);
      if (existing) return existing;
      let ext: string,
        mime: string,
        width: number | undefined,
        height: number | undefined;
      if (kind === "sound") {
        ext = path.extname(name).slice(1).toLowerCase();
        if (!["wav", "mp3", "ogg", "m4a", "flac", "aac"].includes(ext))
          throw new Error("音频支持 WAV、MP3、OGG、M4A、FLAC 和 AAC");
        mime = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
      } else {
        const meta = await sharp(data, {
          limitInputPixels: 64_000_000,
        }).metadata();
        if (
          !meta.width ||
          !meta.height ||
          !meta.format ||
          !imageMimes[meta.format]
        )
          throw new Error("请导入 PNG、JPEG、WebP 或 GIF 图片");
        ext = meta.format === "jpeg" ? "jpg" : meta.format;
        mime = imageMimes[meta.format]!;
        width = meta.width;
        height = meta.height;
      }
      const folder = builtin ? "resources/assets" : "data/assets";
      const actualFolder = builtin
        ? path.join(this.locations.root, folder)
        : path.join(this.locations.data, "assets");
      await fs.mkdir(actualFolder, { recursive: true });
      const file = `${folder}/${hash}.${ext}`,
        actualFile = path.join(actualFolder, `${hash}.${ext}`);
      await fs.writeFile(actualFile, data);
      const asset: Asset = {
        id,
        name,
        kind,
        file,
        mime,
        width,
        height,
        bytes: data.length,
        tags,
        builtin,
        ...(source ? { source } : {}),
      };
      if (kind === "sound") {
        try {
          const meta = await probe(actualFile);
          if (!meta.streams.some((s) => s.codec_type === "audio"))
            throw new Error("文件不含音轨");
          asset.durationMs = Math.round(
            Number(meta.format.duration || 0) * 1000,
          );
        } catch (e) {
          await fs.rm(actualFile, { force: true });
          throw new Error(`音频未能读取：${(e as Error).message}`);
        }
      }
      if (kind === "shell") {
        const geometry = await screenMask(data),
          maskHash = digest(geometry.mask),
          maskId = `mask-${maskHash.slice(0, 24)}`;
        const maskFile = `${folder}/${maskHash}.png`;
        await fs.writeFile(
          path.join(actualFolder, `${maskHash}.png`),
          geometry.mask,
        );
        this.assets.set(maskId, {
          id: maskId,
          name: name + " · 屏幕",
          kind: "mask",
          file: maskFile,
          mime: "image/png",
          width,
          height,
          bytes: geometry.mask.length,
          tags: [],
          builtin,
        });
        asset.screen = geometry.screen;
        asset.maskId = maskId;
      }
      this.assets.set(id, asset);
      await this.persist(builtin);
      return asset;
    });
  }
  async crop(id: string, area: Rect): Promise<Asset> {
    const source = this.get(id);
    if (!["avatar", "wallpaper", "image", "sticker"].includes(source.kind))
      throw new Error("请选择可以裁剪的图片");
    const image = await sharp(this.resolve(id))
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    const left = Math.max(0, Math.round(area.x)),
      top = Math.max(0, Math.round(area.y));
    const width = Math.min(Math.round(area.width), image.info.width - left),
      height = Math.min(Math.round(area.height), image.info.height - top);
    if (width < 1 || height < 1) throw new Error("裁剪范围无效");
    const cropped = await sharp(image.data)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    return this.ingest(cropped, source.name + " · 裁剪", source.kind, false, [
      "裁剪",
    ]);
  }
  async absorb(staged: AssetStore) {
    return this.writer.run(async () => {
      const added = staged.list().filter((a) => !this.assets.has(a.id));
      for (const asset of added) {
        const target = path.join(
            this.locations.data,
            "assets",
            path.basename(asset.file),
          ),
          temporary = target + "." + randomUUID() + ".tmp";
        try {
          await fs.copyFile(staged.resolve(asset.id), temporary);
          await fs.rename(temporary, target);
        } finally {
          await fs.rm(temporary, { force: true }).catch(() => {});
        }
      }
      await atomicJson(path.join(this.locations.data, "assets.json"), [
        ...this.list().filter((a) => !a.builtin),
        ...added,
      ]);
      added.forEach((a) => this.assets.set(a.id, a));
      return added.map((a) => a.id);
    });
  }
  private persist(builtin: boolean) {
    return atomicJson(
      builtin
        ? path.join(this.locations.root, "resources/manifest.json")
        : path.join(this.locations.data, "assets.json"),
      this.list().filter((a) => Boolean(a.builtin) === builtin),
    );
  }
}
