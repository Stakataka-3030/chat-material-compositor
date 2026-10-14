import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { pluginSchema, type StylePlugin } from "../core/model.js";
import { PluginRegistry, builtinPlugins } from "../core/plugins.js";
import { AssetStore } from "./assets.js";
import { PluginStore } from "./plugins.js";
import { importMaterialPack } from "./material-packs.js";
import { DATA } from "./config.js";
function assetDefaults(plugin: StylePlugin) {
  return plugin.fields
    .filter(
      (f) => f.type === "asset" && typeof f.default === "string" && f.default,
    )
    .map((f) => ({ id: String(f.default), kind: f.assetKind }));
}
export async function exportComponent(plugin: StylePlugin, store: AssetStore) {
  const zip = new AdmZip();
  zip.addFile(
    "component.json",
    Buffer.from(
      JSON.stringify(
        { format: "chat-component", version: 1, component: plugin },
        null,
        2,
      ),
    ),
  );
  const assets = [...new Set(assetDefaults(plugin).map((a) => a.id))].map(
    (id) => store.get(id),
  );
  if (assets.reduce((n, a) => n + a.bytes, 0) > 256 * 1024 * 1024)
    throw Error("组件素材超过256MB");
  if (assets.length) {
    const metadata = assets.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      category: a.category,
      entry: `files/${a.id}${path.extname(a.file)}`,
      bytes: a.bytes,
      tags: a.tags,
      source: a.source,
    }));
    zip.addFile(
      "materials.json",
      Buffer.from(
        JSON.stringify({
          format: "chat-material-pack",
          version: 1,
          assets: metadata,
        }),
      ),
    );
    for (const item of metadata)
      zip.addFile(item.entry, await fs.readFile(store.resolve(item.id)));
  }
  return zip.toBuffer();
}
export async function importComponent(
  content: Buffer,
  store: AssetStore,
  plugins: PluginStore,
) {
  if (content.length > 256 * 1024 * 1024) throw Error("组件包超过256MB");
  const zip = new AdmZip(content),
    entries = zip.getEntries();
  if (
    entries.length > 2002 ||
    new Set(entries.map((e) => e.entryName)).size !== entries.length ||
    entries.reduce((n, e) => n + e.header.size, 0) > 256 * 1024 * 1024
  )
    throw Error("组件包内容无效或过大");
  const entry = zip.getEntry("component.json");
  if (!entry || entry.header.size > 1000000)
    throw Error("请选择包含component.json的组件包");
  const raw = JSON.parse(entry.getData().toString("utf8"));
  if (raw.format !== "chat-component" || raw.version !== 1)
    throw Error("组件包格式不支持");
  const plugin = pluginSchema.parse(raw.component);
  new PluginRegistry([plugin]);
  if (builtinPlugins.some((p) => p.id === plugin.id))
    throw Error("请为自定义组件使用独立id");
  plugin.builtin = false;
  const base = path.resolve(DATA, "tmp/component-imports"),
    stage = path.join(base, randomUUID()),
    staged = new AssetStore({ root: stage, data: path.join(stage, "data") });
  try {
    await staged.init();
    zip.deleteFile("component.json");
    if (zip.getEntries().length)
      await importMaterialPack(
        staged,
        zip.toBuffer(),
        path.join(stage, "data"),
      );
    for (const ref of assetDefaults(plugin)) {
      const asset =
        staged.list().find((a) => a.id === ref.id) ??
        store.list().find((a) => a.id === ref.id);
      if (!asset) throw Error("组件缺少素材：" + ref.id);
      if (ref.kind && asset.kind !== ref.kind)
        throw Error("组件素材分类不匹配");
    }
    await store.absorb(staged);
    await plugins.install(plugin);
    return plugins.list();
  } finally {
    const resolved = path.resolve(stage);
    if (!resolved.startsWith(base + path.sep)) throw Error("临时组件目录无效");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
export const interactionExample: StylePlugin = {
  id: "interactive-notice",
  version: "1.0.0",
  name: "邀请卡片",
  description: "点击按钮将目标角色加入群聊，并记录头像震动",
  icon: "file",
  enabled: true,
  fields: [
    {
      key: "target",
      label: "受邀角色",
      type: "speaker",
      default: null,
      required: true,
    },
    { key: "status", label: "状态", type: "text", default: "等待接受" },
  ],
  layout: {
    variant: "card",
    width: 240,
    nodes: [
      {
        type: "text",
        text: "邀请 {{target.name}} 加入群聊",
        bold: true,
        size: 17,
      },
      { type: "text", text: "{{status}}", size: 13, color: "$muted" },
      {
        type: "button",
        id: "accept",
        text: "接受邀请",
        actions: [
          { type: "set-field", field: "status", value: "已接受" },
          { type: "group-join", targetField: "target" },
          {
            type: "avatar-shake",
            targetField: "target",
            durationMs: 600,
            amplitude: 3,
          },
        ],
        disabledWhen: { field: "status", equals: "已接受" },
      },
    ],
  },
};
