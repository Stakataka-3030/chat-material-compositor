import { networkFetch } from "./network.js";
import type { AssetKind } from "../core/model.js";
import {
  materialName,
  materialUrl,
  type OnlineMaterialPage,
} from "../core/online-materials.js";
import { AssetStore } from "./assets.js";
const origin = "https://assets.bdon.moe";
const allowed = new Set([origin, "https://storage.bdon.moe"]);
export function validateMaterialUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("素材链接格式无效");
  }
  if (!allowed.has(url.origin) || url.username || url.password || url.hash)
    throw new Error("请使用 assets.bdon.moe 或 storage.bdon.moe 的素材直链");
  return url;
}
export class OnlineMaterialService {
  private snapshot: { value: string; at: number } | null = null;
  private imports = 0;
  constructor(
    private store: AssetStore,
    private fetcher: typeof fetch = networkFetch,
  ) {}
  private async json(url: URL) {
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(`素材目录暂不可用（HTTP ${response.status}）`);
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error("素材目录数据过大");
      return JSON.parse(text);
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
    if (!this.snapshot || Date.now() - this.snapshot.at > 10 * 60 * 1000) {
      const catalogs = await this.json(
        new URL("/catalogs?region=tw&locale=ja", origin),
      );
      if (!Array.isArray(catalogs)) throw new Error("素材目录格式无效");
      const candidates = catalogs.filter(
        (c) => c && /^[a-f0-9]{64}$/.test(c.snapshot),
      );
      const current = candidates.find((c) => c.current) ?? candidates[0];
      if (!current) throw new Error("当前没有可用素材目录");
      this.snapshot = { value: current.snapshot, at: Date.now() };
    }
    const url = new URL("/browse", origin);
    for (const [key, value] of Object.entries({
      snapshot: this.snapshot.value,
      directory: "",
      query,
      offset: String(offset),
      limit: "40",
    }))
      url.searchParams.set(key, value);
    const page = await this.json(url);
    if (
      !Array.isArray(page.files) ||
      page.snapshot !== this.snapshot.value ||
      !Number.isSafeInteger(page.total)
    )
      throw new Error("素材目录格式无效");
    const files = new Map<string, OnlineMaterialPage["files"][number]>();
    for (const file of page.files) {
      if (typeof file?.path !== "string" || file.path.length > 1200) continue;
      const preview = materialUrl(file.path);
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
      const type = response.headers.get("content-type") ?? "";
      if (!/^(image\/|audio\/|application\/octet-stream)/i.test(type)) {
        await response.body?.cancel();
        throw new Error("请使用图片或音频直链");
      }
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
      const filename = decodeURIComponent(
        url.pathname.split("/").at(-1) ?? "素材.webp",
      );
      const display =
        kind === "sound" ? filename : (name || filename).slice(0, 180);
      return await this.store.ingest(
        Buffer.concat(chunks.map((c) => Buffer.from(c))),
        display,
        kind,
        false,
        ["Moenotes", "在线"],
        {
          site: "Moenotes",
          url: url.href,
          downloadedAt: new Date().toISOString(),
        },
      );
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
