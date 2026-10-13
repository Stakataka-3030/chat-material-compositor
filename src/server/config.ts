import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const DATA = path.resolve(
  process.env.LIAOMU_DATA_DIR || path.join(ROOT, "data"),
);
export const config = {
  port: Number(process.env.LIAOMU_PORT || 4317),
  host: "127.0.0.1",
  maxUploadBytes: 64 * 1024 * 1024,
  maxProjectBytes: 256 * 1024 * 1024,
  queueLimit: 20,
  renderTimeoutMs: 30 * 60 * 1000,
};
export const assetUrl = (id: string) =>
  `/api/assets/file/${encodeURIComponent(id)}`;
