import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  newProject,
  projectSchema,
  uid,
  usedAssetIds,
  type Project,
  type Asset,
  type FieldValue,
} from "../core/model.js";
import { builtinPlugins } from "../core/plugins.js";
import { DATA } from "./config.js";
import { atomicJson, readJson, safeId, SerialWriter } from "./storage.js";
import type { AssetStore } from "./assets.js";
export class ConflictError extends Error {
  status = 409;
}
export class ProjectStore {
  private writer = new SerialWriter();
  async init(assets: AssetStore) {
    await fs.mkdir(path.join(DATA, "projects"), { recursive: true });
    if (!(await this.list()).length) {
      const p = newProject();
      p.title = "放学以后";
      p.appearance.mode = "group";
      p.appearance.title = "练习室";
      p.appearance.showNames = true;
      const all = assets.list(),
        shell = all.find(
          (a) => a.kind === "shell" && a.tags.some((t) => t.includes("MyGO")),
        );
      p.appearance.shellId =
        shell?.id ?? all.find((a) => a.kind === "shell")?.id ?? null;
      p.appearance.wallpaperId =
        all.find(
          (a) =>
            a.kind === "wallpaper" && a.tags.some((t) => t.includes("MyGO")),
        )?.id ?? null;
      p.speakers[0]!.name = "灯";
      p.speakers[0]!.avatarId =
        all.find((a) => a.kind === "avatar" && a.name.includes("灯"))?.id ??
        null;
      p.speakers[1]!.name = "爱音";
      p.speakers[1]!.avatarId =
        all.find((a) => a.kind === "avatar" && a.name.includes("爱音"))?.id ??
        null;
      p.audio.receiveSoundId =
        all.find((a) => a.kind === "sound" && a.name.startsWith("receive1"))
          ?.id ?? null;
      p.audio.sendSoundId =
        all.find((a) => a.kind === "sound" && a.name.startsWith("send1"))?.id ??
        null;
      const messages: {
        who: number;
        kind: string;
        data: Record<string, FieldValue>;
        wait: number;
      }[] = [
        { who: 0, kind: "separator", data: { text: "今天 14:30" }, wait: 0 },
        {
          who: 0,
          kind: "text",
          data: { text: "今天几点到练习室？" },
          wait: 400,
        },
        {
          who: 1,
          kind: "text",
          data: { text: "三点！我先去买饮料。" },
          wait: 900,
        },
        {
          who: 0,
          kind: "text",
          data: { text: "那我把新曲带上。" },
          wait: 1000,
        },
        {
          who: 1,
          kind: "transfer",
          data: {
            amount: "24.00",
            currency: "¥",
            note: "今天的饮料",
            status: "已收款",
          },
          wait: 1000,
        },
      ];
      p.messages = messages.map((m) => ({
        id: uid(),
        speakerId: p.speakers[m.who]!.id,
        kind: m.kind,
        data: {
          ...Object.fromEntries(
            builtinPlugins
              .find((b) => b.id === m.kind)!
              .fields.map((f) => [f.key, f.default]),
          ),
          ...m.data,
        },
        waitMs: m.wait,
        typingMs: 0,
        read: true,
        soundId: null,
      }));
      await this.save(p);
    }
  }
  async list() {
    const names = await fs
      .readdir(path.join(DATA, "projects"))
      .catch(() => [] as string[]);
    const items = await Promise.all(
      names
        .filter((n) => n.endsWith(".json") && !n.endsWith(".bak.json"))
        .map(async (name) => {
          try {
            const p = await this.get(path.basename(name, ".json"));
            return {
              id: p.id,
              title: p.title,
              updatedAt: p.updatedAt,
              messages: p.messages.length,
              revision: p.revision,
            };
          } catch {
            return null;
          }
        }),
    );
    return items
      .filter((p) => p !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string) {
    const p = await readJson<unknown>(
      path.join(DATA, "projects", safeId(id) + ".json"),
      null,
    );
    if (!p) throw new Error("工程不存在");
    return projectSchema.parse(p);
  }
  save(input: Project, expectedRevision?: number) {
    return this.writer.run(async () => {
      const p = projectSchema.parse(input),
        file = path.join(DATA, "projects", safeId(p.id) + ".json");
      const current = await readJson<Project | null>(file, null);
      if (
        current &&
        expectedRevision !== undefined &&
        current.revision !== expectedRevision
      )
        throw new ConflictError("工程已在另一个窗口更新，请重新打开后继续编辑");
      p.revision = (current?.revision ?? 0) + 1;
      p.updatedAt = new Date().toISOString();
      if (current)
        await atomicJson(
          path.join(DATA, "projects", p.id + ".bak.json"),
          current,
        );
      await atomicJson(file, p);
      return p;
    });
  }
  async package(id: string, assets: AssetStore) {
    const p = await this.get(id),
      selected = usedAssetIds(p),
      zip = new AdmZip();
    for (const assetId of [...selected]) {
      const a = assets.get(assetId);
      if (a.maskId) selected.add(a.maskId);
    }
    const manifest: Asset[] = [];
    for (const assetId of selected) {
      const a = assets.get(assetId);
      manifest.push(a);
      zip.addFile(
        `assets/${a.id}${path.extname(a.file)}`,
        await fs.readFile(assets.resolve(a.id)),
      );
    }
    zip.addFile("project.json", Buffer.from(JSON.stringify(p, null, 2)));
    zip.addFile("assets.json", Buffer.from(JSON.stringify(manifest, null, 2)));
    return zip.toBuffer();
  }
  async importPackage(data: Buffer, assets: AssetStore) {
    const zip = new AdmZip(data),
      entries = zip.getEntries();
    if (
      entries.length > 2000 ||
      entries.reduce((n, e) => n + e.header.size, 0) > 256 * 1024 * 1024
    )
      throw new Error("工程包超过导入容量");
    if (
      entries.some(
        (e) =>
          e.entryName.startsWith("/") ||
          /(^|[\\/])\.\.([\\/]|$)|:/.test(e.entryName),
      )
    )
      throw new Error("工程包路径无效");
    const raw = zip.readAsText("project.json");
    if (!raw) throw new Error("工程包缺少 project.json");
    const p = projectSchema.parse(JSON.parse(raw));
    const manifest = JSON.parse(
      zip.readAsText("assets.json") || "[]",
    ) as Asset[];
    for (const a of manifest.filter((a) => a.kind !== "mask")) {
      const entry = entries.find((e) =>
        e.entryName.startsWith(`assets/${a.id}.`),
      );
      if (!entry) throw new Error(`工程包缺少素材：${a.name}`);
      const imported = await assets.ingest(
        entry.getData(),
        a.name,
        a.kind,
        false,
        a.tags,
      );
      if (imported.id !== a.id)
        throw new Error(`素材标识与文件不一致：${a.name}`);
    }
    p.id = uid();
    p.revision = 0;
    p.title += " · 导入";
    p.createdAt = new Date().toISOString();
    return this.save(p);
  }
}
