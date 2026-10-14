import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import {
  newProject,
  projectSchema,
  usedAssetIds,
  type Appearance,
} from "../core/model.js";
import { AssetStore } from "./assets.js";
import { importMaterialPack } from "./material-packs.js";
import { DATA } from "./config.js";
import { z } from "zod";
import {
  extractAppearance,
  type ConfigScope,
} from "../core/appearance-config.js";
function appearance(input: unknown) {
  return projectSchema.parse({ ...newProject(), appearance: input }).appearance;
}
function referenced(value: Appearance) {
  return usedAssetIds({ ...newProject(), appearance: value });
}
export async function exportPhoneConfig(
  input: unknown,
  store: AssetStore,
  inputScope: unknown = "all",
) {
  const scope = z.enum(["system", "software", "all"]).parse(inputScope);
  const value = appearance(input),
    selected = extractAppearance(value, scope),
    zip = new AdmZip(),
    chosen = [
      ...referenced(appearance({ ...newProject().appearance, ...selected })),
    ].map((id) => store.get(id));
  if (chosen.reduce((n, a) => n + a.bytes, 0) > 256 * 1024 * 1024)
    throw new Error("配置素材超过256MB");
  zip.addFile(
    "phone-config.json",
    Buffer.from(
      JSON.stringify(
        scope === "all"
          ? { format: "chat-phone-config", version: 1, appearance: value }
          : {
              format: "chat-phone-config",
              version: 2,
              scope,
              appearance: selected,
            },
        null,
        2,
      ),
    ),
  );
  if (chosen.length) {
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
    zip.addFile(
      "materials.json",
      Buffer.from(
        JSON.stringify({ format: "chat-material-pack", version: 1, assets }),
      ),
    );
    for (const item of assets)
      zip.addFile(item.entry, await fs.readFile(store.resolve(item.id)));
  }
  return zip.toBuffer();
}
export async function importPhoneConfig(
  bytes: Buffer,
  store: AssetStore,
  inputScope: unknown = "all",
) {
  const targetScope = z.enum(["system", "software", "all"]).parse(inputScope);
  if (bytes.length > 256 * 1024 * 1024) throw new Error("配置包超过256MB");
  const zip = new AdmZip(bytes),
    entries = zip.getEntries();
  if (
    entries.length > 2002 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 256 * 1024 * 1024
  )
    throw new Error("配置包内容超出容量");
  const entry = zip.getEntry("phone-config.json");
  if (!entry || entry.header.size > 1_000_000)
    throw new Error("请选择手机界面配置包");
  const raw = JSON.parse(entry.getData().toString("utf8"));
  if (raw.format !== "chat-phone-config" || ![1, 2].includes(raw.version))
    throw new Error("手机配置格式不支持");
  const scope: ConfigScope =
    raw.version === 1 ? "all" : z.enum(["system", "software"]).parse(raw.scope);
  if (scope !== "all" && targetScope !== "all" && scope !== targetScope)
    throw new Error("配置包类型不匹配，请在对应的手机界面或聊天软件配置区导入");
  const validated = appearance({
      ...newProject().appearance,
      ...raw.appearance,
    }),
    selected = extractAppearance(
      validated,
      scope === "all" ? targetScope : scope,
    ),
    value = appearance({ ...newProject().appearance, ...selected }),
    base = path.resolve(DATA, "tmp/phone-config"),
    root = path.join(base, randomUUID());
  const staged = new AssetStore({ root, data: path.join(root, "data") });
  try {
    await staged.init();
    zip.deleteFile("phone-config.json");
    if (zip.getEntries().length)
      await importMaterialPack(staged, zip.toBuffer(), path.join(root, "data"));
    for (const id of referenced(value)) {
      const asset =
        staged.list().find((a) => a.id === id) ??
        store.list().find((a) => a.id === id);
      if (!asset) throw new Error("配置缺少素材：" + id);
      const expected =
        id === value.shellId
          ? "shell"
          : id === value.wallpaperId
            ? "wallpaper"
            : null;
      if (expected && asset.kind !== expected)
        throw new Error("配置素材分类不匹配");
    }
    await store.absorb(staged);
    const resultScope = scope === "all" ? targetScope : scope;
    return resultScope === "all"
      ? validated
      : { scope: resultScope, appearance: selected };
  } finally {
    const target = path.resolve(root);
    if (!target.startsWith(base + path.sep))
      throw new Error("临时配置目录无效");
    await fs.rm(target, { recursive: true, force: true });
  }
}
