import path from "node:path";
import { z } from "zod";
import { ROOT, DATA } from "./config.js";
import { atomicJson, readJson } from "./storage.js";
import { APP_VERSION } from "../core/version.js";
import { selectRelease, type UpdateInfo } from "../core/updates.js";
import { networkFetch } from "./network.js";
const releaseSchema = z.object({
  repository: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    .nullable(),
});
export class UpdateService {
  private pending: Promise<UpdateInfo> | null = null;
  private last: UpdateInfo | null = null;
  constructor(
    private fetcher: typeof fetch = networkFetch,
    private files = { root: ROOT, data: DATA },
  ) {}
  async status(): Promise<UpdateInfo> {
    const config = releaseSchema.parse(
      await readJson(path.join(this.files.root, "release.config.json"), {
        repository: null,
      }),
    );
    const prefs = await readJson<{ autoCheck: boolean }>(
      path.join(this.files.data, "update-preferences.json"),
      { autoCheck: true },
    );
    return {
      ...(this.last ?? {
        status: config.repository ? "not_checked" : "not_configured",
        currentVersion: APP_VERSION,
      }),
      configured: Boolean(config.repository),
      autoCheck: prefs.autoCheck,
    };
  }
  async setAutoCheck(autoCheck: boolean) {
    await atomicJson(path.join(this.files.data, "update-preferences.json"), {
      autoCheck,
    });
    return this.status();
  }
  async check(force = false): Promise<UpdateInfo> {
    if (this.pending) return this.pending;
    const status = await this.status();
    if (this.pending) return this.pending;
    if (!status.configured) return status;
    if (
      !force &&
      this.last?.checkedAt &&
      Date.now() - Date.parse(this.last.checkedAt) < 30 * 60 * 1000
    )
      return status;
    this.pending = (async () => {
      const config = releaseSchema.parse(
        await readJson(path.join(this.files.root, "release.config.json"), {
          repository: null,
        }),
      );
      try {
        const response = await this.fetcher(
          `https://api.github.com/repos/${config.repository}/releases?per_page=20`,
          {
            signal: AbortSignal.timeout(8000),
            redirect: "error",
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": "ChatMaterialCompositor-Updater",
            },
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 403 || response.status === 429
              ? "更新服务暂时限制访问，请稍后重试"
              : `更新服务返回 HTTP ${response.status}`,
          );
        const text = await response.text();
        if (text.length > 2_000_000) throw new Error("更新信息超出容量");
        this.last = {
          ...selectRelease(JSON.parse(text), APP_VERSION, config.repository!),
          autoCheck: status.autoCheck,
          configured: true,
          checkedAt: new Date().toISOString(),
        };
      } catch (e) {
        this.last = {
          ...status,
          status: "error",
          checkedAt: new Date().toISOString(),
          message:
            (e as Error).name === "TimeoutError"
              ? "连接超时，请稍后重试"
              : "无法检查更新，请稍后重试",
        };
      }
      return this.status();
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
}
