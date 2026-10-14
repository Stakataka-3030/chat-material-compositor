import path from "node:path";
import { DATA } from "./config.js";
import { readJson, atomicJson } from "./storage.js";
import {
  defaultSources,
  sourcesSchema,
  type MaterialSources,
} from "../core/material-sources.js";
import { networkFetch } from "./network.js";
import type { AssetKind } from "../core/model.js";
import {
  materialName,
  materialUrl,
  type OnlineMaterialPage,
} from "../core/online-materials.js";
import { AssetStore } from "./assets.js";

export function validateMaterialUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("素材链接格式无效");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("请使用有效的 HTTP(S) 素材直链");
  return url;
}
export class OnlineMaterialService {
  private snapshot: { value: string; at: number; key: string } | null = null;
  private imports = 0;
  constructor(
    private store: AssetStore,
    private fetcher: typeof fetch = networkFetch,
    private data = DATA,
  ) {}
  async settings(): Promise<MaterialSources> {
    const settings = sourcesSchema.parse(
      await readJson(
        path.join(this.data, "material-sources.json"),
        defaultSources,
      ),
    );
    let migrated = false;
    settings.sources = settings.sources.map((source) => {
      if (
        source.id === "moenotes" &&
        source.url === "https://assets.bdon.moe" &&
        source.assetBase === "https://assets.bdon.moe/ja" &&
        !source.locale
      ) {
        migrated = true;
        return {
          ...source,
          region: "tw",
          locale: "zh-Hans" as const,
          assetBase: "https://assets.bdon.moe/zh-Hans",
        };
      }
      return source;
    });
    if (migrated)
      await atomicJson(path.join(this.data, "material-sources.json"), settings);
    return settings;
  }
  async saveSettings(input: unknown) {
    const value = sourcesSchema.parse(input);
    await atomicJson(path.join(this.data, "material-sources.json"), value);
    this.snapshot = null;
    return value;
  }
  async resetSettings() {
    return this.saveSettings(structuredClone(defaultSources));
  }
  private async json(url: URL) {
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(`素材目录暂不可用（HTTP ${response.status}）`);
      if (!response.body) throw new Error("素材目录为空");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          total += item.value.byteLength;
          if (total > 2_000_000) {
            await reader.cancel();
            throw new Error("素材目录数据过大");
          }
          chunks.push(item.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(
        Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"),
      );
    } catch (error) {
      if ((error as Error).name === "TimeoutError")
        throw new Error("素材目录连接超时，请点击搜索重试");
      if (error instanceof TypeError)
        throw new Error("无法连接素材目录，请稍后重试");
      if (error instanceof SyntaxError)
        throw new Error("素材目录格式无效，请稍后重试");
      throw error;
    }
  }
  async browse(query: string, offset: number): Promise<OnlineMaterialPage> {
    const settings = await this.settings(),
      source = settings.sources.find((s) => s.id === settings.selectedId)!;
    const origin = source.url.replace(/\/$/, "");
    if (source.type === "json") {
      const target = new URL(
        source.url
          .replaceAll("{query}", encodeURIComponent(query))
          .replaceAll("{offset}", String(offset))
          .replaceAll("{limit}", "40"),
      );
      const raw = await this.json(target),
        list = Array.isArray(raw) ? raw : raw.files;
      if (!Array.isArray(list)) throw new Error("JSON目录需要 files 数组");
      const found = list
        .filter((item) => item && typeof item.url === "string")
        .map((item) => {
          const url = validateMaterialUrl(
            new URL(item.url, source.assetBase || target.href).href,
          );
          return {
            url: url.href,
            path: String(item.path || item.name || url.pathname),
            name: String(
              item.name ||
                decodeURIComponent(url.pathname.split("/").at(-1) || "素材"),
            ),
            kind:
              item.kind === "sound" ||
              item.kind === "audio" ||
              /\.(wav|mp3|ogg|m4a|flac|aac)$/i.test(url.pathname)
                ? ("sound" as const)
                : ("image" as const),
          };
        })
        .filter((item) =>
          (item.path + item.name).toLowerCase().includes(query.toLowerCase()),
        );
      if (source.url.includes("{offset}"))
        return {
          files: found,
          total: Number.isSafeInteger(raw.total) ? raw.total : found.length,
          nextOffset: Number.isSafeInteger(raw.nextOffset)
            ? raw.nextOffset
            : null,
        };
      return {
        files: found.slice(offset, offset + 40),
        total: found.length,
        nextOffset: offset + 40 < found.length ? offset + 40 : null,
      };
    }
    const region = source.region || "tw",
      locale = source.locale || "zh-Hans",
      key = origin + "/" + region + "/" + locale;
    if (
      !this.snapshot ||
      this.snapshot.key !== key ||
      Date.now() - this.snapshot.at > 10 * 60 * 1000
    ) {
      const catalogs = await this.json(
        new URL(
          origin +
            "/catalogs?region=" +
            encodeURIComponent(region) +
            "&locale=" +
            encodeURIComponent(locale),
        ),
      );
      if (!Array.isArray(catalogs)) throw new Error("素材目录格式无效");
      const candidates = catalogs.filter(
        (c) => c && /^[a-f0-9]{64}$/.test(c.snapshot),
      );
      const current = candidates.find((c) => c.current) ?? candidates[0];
      if (!current) throw new Error("当前没有可用素材目录");
      this.snapshot = { value: current.snapshot, at: Date.now(), key };
    }
    const snapshot = this.snapshot.value;
    const url = new URL(origin + "/browse");
    for (const [key, value] of Object.entries({
      snapshot,
      directory: "",
      query,
      offset: String(offset),
      limit: "40",
    }))
      url.searchParams.set(key, value);
    const page = await this.json(url);
    if (
      !Array.isArray(page.files) ||
      page.snapshot !== snapshot ||
      !Number.isSafeInteger(page.total)
    )
      throw new Error("素材目录格式无效");
    const files = new Map<string, OnlineMaterialPage["files"][number]>();
    for (const file of page.files) {
      if (typeof file?.path !== "string" || file.path.length > 1200) continue;
      const preview = materialUrl(
        file.path,
        source.assetBase ||
          origin + (region === "tw" ? "" : "/" + region) + "/" + locale,
      );
      if (!preview) continue;
      files.set(file.path, {
        path: file.path,
        name: materialName(file.path),
        ...preview,
      });
    }
    return {
      files: [...files.values()],
      total: page.total,
      nextOffset: offset + 40 < page.total ? offset + 40 : null,
    };
  }
  async import(urlString: string, kind: AssetKind, name?: string) {
    if (this.imports >= 2) throw new Error("已有素材正在下载，请稍候");
    this.imports++;
    try {
      let url = validateMaterialUrl(urlString),
        response: Response | null = null;
      for (let count = 0; count < 4; count++) {
        response = await this.fetcher(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(45000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error("素材地址已失效");
          await response.body?.cancel();
          url = validateMaterialUrl(new URL(location, url).href);
          continue;
        }
        break;
      }
      if (!response?.ok)
        throw new Error(
          response?.status === 404
            ? "此素材尚未在来源站点提供下载"
            : "素材下载失败，请稍后重试",
        );
      if (Number(response.headers.get("content-length")) > 64 * 1024 * 1024) {
        await response.body?.cancel();
        throw new Error("素材超过64MB");
      }
      if (!response.body) throw new Error("素材为空");
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          total += part.value.byteLength;
          if (total > 64 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("素材超过64MB");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const content = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      let filename = decodeURIComponent(
        url.pathname.split("/").at(-1) || "素材",
      );
      if (
        kind === "sound" &&
        !/\.(wav|mp3|ogg|m4a|flac|aac)$/i.test(filename)
      ) {
        const magic = content.subarray(0, 4).toString("latin1"),
          mime = response.headers.get("content-type") || "";
        const ext =
          magic === "RIFF"
            ? "wav"
            : magic === "OggS"
              ? "ogg"
              : magic === "fLaC"
                ? "flac"
                : content.subarray(4, 8).toString() === "ftyp"
                  ? "m4a"
                  : mime.includes("aac")
                    ? "aac"
                    : "mp3";
        filename += "." + ext;
      }
      const display =
        kind === "sound"
          ? name
            ? name.replace(/\.[a-z0-9]+$/i, "") + path.extname(filename)
            : filename
          : (name || filename).slice(0, 180);
      return await this.store.ingest(content, display, kind, false, ["在线"], {
        site: url.hostname,
        url: url.href,
        downloadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if ((error as Error).name === "TimeoutError")
        throw new Error("素材下载超时，请重试");
      if (error instanceof TypeError)
        throw new Error("无法下载素材，请检查链接后重试");
      throw error;
    } finally {
      this.imports--;
    }
  }
}
