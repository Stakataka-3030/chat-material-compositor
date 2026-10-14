import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import archiver from "archiver";
import { z } from "zod";
import type { Response } from "express";
import { AssetStore } from "./assets.js";
import { DATA } from "./config.js";
const maxBytes = 256 * 1024 * 1024;
const itemSchema = z.object({
  id: z
    .string()
    .regex(
      /^(shell|wallpaper|avatar|sticker|image|sound|icon|font|bar-background)-[a-f0-9]{24}$/,
    ),
  name: z.string().min(1).max(180),
  category: z.enum(["icon", "bar-background"]).optional(),
  kind: z.enum([
    "shell",
    "wallpaper",
    "avatar",
    "sticker",
    "image",
    "sound",
    "icon",
    "font",
    "bar-background",
  ]),
  entry: z.string().regex(/^files\/[a-z0-9.-]+$/i),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024),
  tags: z.array(z.string().max(80)).max(30),
  source: z
    .object({
      site: z.string().max(80),
      url: z
        .string()
        .max(2000)
        .refine((value) => {
          try {
            return ["http:", "https:"].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        }, "素材来源地址无效"),
      downloadedAt: z.string().max(80),
    })
    .optional(),
});
const manifestSchema = z.object({
  format: z.literal("chat-material-pack"),
  version: z.literal(1),
  assets: z.array(itemSchema).min(1).max(2000),
});
export async function exportMaterialPack(
  store: AssetStore,
  ids: string[],
  response: Response,
) {
  const chosen = [...new Set(ids)]
    .map((id) => store.get(id))
    .filter((a) => a.kind !== "mask");
  if (!chosen.length) throw new Error("请先选择素材");
  if (chosen.reduce((n, a) => n + a.bytes, 0) > maxBytes)
    throw new Error("素材包超过256MB，请分批导出");
  const assets = chosen.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    entry: `files/${a.id}${path.extname(a.file)}`,
    bytes: a.bytes,
    tags: a.tags,
    source: a.source,
    category: a.category,
  }));
  response.type("application/zip").attachment("聊天素材合成器-素材包.zip");
  const archive = archiver("zip", { store: true });
  archive.on("error", (error) => response.destroy(error));
  const abort = () => archive.abort();
  response.on("close", abort);
  archive.pipe(response);
  archive.append(
    JSON.stringify(
      { format: "chat-material-pack", version: 1, assets },
      null,
      2,
    ),
    { name: "materials.json" },
  );
  chosen.forEach((a, i) =>
    archive.file(store.resolve(a.id), { name: assets[i]!.entry }),
  );
  try {
    await archive.finalize();
  } finally {
    response.off("close", abort);
  }
}
export async function importMaterialPack(
  store: AssetStore,
  bytes: Buffer,
  data = DATA,
) {
  if (bytes.length > maxBytes) throw new Error("素材包超过256MB");
  const zip = new AdmZip(bytes),
    entries = zip.getEntries();
  if (
    entries.length > 2001 ||
    new Set(entries.map((e) => e.entryName)).size !== entries.length ||
    entries.reduce((n, e) => n + e.header.size, 0) > maxBytes
  )
    throw new Error("素材包内容无效或超过容量");
  const metadata = zip.getEntry("materials.json");
  if (!metadata || metadata.header.size > 2_000_000)
    throw new Error("请选择素材包ZIP，工程包请在工程页打开");
  const manifest = manifestSchema.parse(
    JSON.parse(metadata.getData().toString("utf8")),
  );
  if (new Set(manifest.assets.map((a) => a.id)).size !== manifest.assets.length)
    throw new Error("素材包包含重复素材");
  const allowed = new Set([
    "materials.json",
    ...manifest.assets.map((a) => a.entry),
  ]);
  if (entries.some((e) => !allowed.has(e.entryName)))
    throw new Error("素材包包含未列明的文件");
  const base = path.resolve(data, "tmp", "material-pack-imports"),
    stage = path.join(base, randomUUID());
  const staged = new AssetStore({
    root: stage,
    data: path.join(stage, "data"),
  });
  try {
    await staged.init();
    for (const asset of manifest.assets) {
      if (!asset.entry.startsWith(`files/${asset.id}.`))
        throw new Error("素材包文件名与标识不一致");
      const entry = zip.getEntry(asset.entry);
      if (!entry) throw new Error(`素材包缺少：${asset.name}`);
      const content = entry.getData();
      if (
        content.length !== asset.bytes ||
        `${asset.kind}-${createHash("sha256").update(content).digest("hex").slice(0, 24)}` !==
          asset.id
      )
        throw new Error(`素材包校验失败：${asset.name}`);
      await staged.ingest(
        content,
        asset.kind === "sound"
          ? asset.name.replace(/\.[a-z0-9]+$/i, "") + path.extname(asset.entry)
          : asset.name,
        asset.kind,
        false,
        asset.tags,
        asset.source,
        asset.category,
      );
    }
    const added = new Set(await store.absorb(staged));
    const imported = manifest.assets.filter((a) => added.has(a.id)).length;
    return {
      imported,
      existing: manifest.assets.length - imported,
      total: manifest.assets.length,
    };
  } finally {
    const target = path.resolve(stage);
    if (!target.startsWith(base + path.sep))
      throw new Error("临时素材目录无效");
    await fs.rm(target, { recursive: true, force: true });
  }
}
