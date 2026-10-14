import { pluginSchema, type StylePlugin, type Message } from "./model.js";

const field = (
  key: string,
  label: string,
  type: StylePlugin["fields"][number]["type"],
  value: string | number | null,
  extra = {},
) => ({ key, label, type, default: value, ...extra });
const define = (
  id: string,
  name: string,
  icon: string,
  fields: StylePlugin["fields"],
  layout: StylePlugin["layout"],
): StylePlugin => ({
  id,
  version: "1.0.0",
  name,
  icon,
  description: name + "消息",
  enabled: true,
  builtin: true,
  fields,
  layout,
});
export const builtinPlugins: StylePlugin[] = [
  define(
    "text",
    "文字",
    "message",
    [
      field("text", "内容", "multiline", ""),
      field("css", "文字CSS", "multiline", ""),
    ],
    {
      variant: "bubble",
      nodes: [
        { type: "text", text: "{{text}}", color: "$text", css: "{{css}}" },
      ],
    },
  ),
  define(
    "image",
    "图片",
    "image",
    [
      field("imageAsset", "图片", "asset", null, { assetKind: "image" }),
      field("caption", "说明", "text", ""),
    ],
    {
      variant: "media",
      width: 240,
      nodes: [
        { type: "image", asset: "imageAsset", height: 200, fit: "contain" },
        { type: "text", text: "{{caption}}", size: 13, color: "$muted" },
      ],
    },
  ),
  define(
    "voice",
    "语音",
    "audio",
    [
      field("seconds", "时长（秒）", "number", 12),
      field("audioAsset", "语音文件", "asset", null, { assetKind: "sound" }),
    ],
    {
      variant: "bubble",
      width: 170,
      nodes: [
        {
          type: "row",
          gap: 12,
          children: [
            { type: "wave", width: 90, height: 22 },
            { type: "text", text: "{{seconds}}″", size: 16, color: "$text" },
          ],
        },
      ],
    },
  ),
  define(
    "sticker",
    "贴纸",
    "smile",
    [field("imageAsset", "贴纸", "asset", null, { assetKind: "sticker" })],
    {
      variant: "media",
      width: 130,
      nodes: [
        { type: "image", asset: "imageAsset", height: 130, fit: "contain" },
      ],
    },
  ),
  define(
    "file",
    "文件",
    "file",
    [
      field("name", "文件名", "text", "排练安排.pdf"),
      field("size", "大小", "text", "128 KB"),
      field("extension", "文件类型", "text", "PDF"),
    ],
    {
      variant: "card",
      width: 245,
      nodes: [
        {
          type: "text",
          text: "{{extension}}",
          size: 12,
          bold: true,
          color: "$accent",
        },
        { type: "space", height: 7 },
        { type: "text", text: "{{name}}", size: 17, bold: true },
        { type: "text", text: "{{size}}", size: 12, color: "$muted" },
      ],
    },
  ),
  define(
    "separator",
    "时间分隔",
    "clock",
    [field("text", "时间或提示", "text", "今天 14:30")],
    {
      variant: "separator",
      nodes: [{ type: "text", text: "{{text}}", size: 12, color: "$muted" }],
    },
  ),
  define(
    "link",
    "链接",
    "link",
    [
      field("title", "标题", "text", "一起听这首歌"),
      field("url", "地址", "text", "https://example.com/music"),
      field("description", "介绍", "multiline", "下午的练习曲目"),
      field("thumbnailAsset", "封面", "asset", null, { assetKind: "image" }),
    ],
    {
      variant: "card",
      width: 245,
      nodes: [
        { type: "text", text: "{{title}}", bold: true, size: 17 },
        { type: "text", text: "{{description}}", size: 13, color: "$muted" },
        { type: "image", asset: "thumbnailAsset", height: 100, fit: "cover" },
        { type: "line" },
        { type: "text", text: "{{url}}", size: 11, color: "$accent" },
      ],
    },
  ),
  define(
    "transfer",
    "转账",
    "transfer",
    [
      field("amount", "金额", "text", "50.00"),
      field("currency", "货币符号", "text", "¥"),
      field("note", "备注", "text", "饮料钱"),
      field("status", "状态", "select", "待收款", {
        options: ["待收款", "已收款", "已退回"],
      }),
    ],
    {
      variant: "card",
      width: 230,
      background: "#f5cf88",
      nodes: [
        {
          type: "text",
          text: "{{currency}} {{amount}}",
          size: 27,
          bold: true,
          color: "#714518",
        },
        { type: "text", text: "{{note}}", size: 13, color: "#865c31" },
        { type: "space", height: 5 },
        { type: "line" },
        { type: "text", text: "{{status}}", size: 12, color: "#865c31" },
      ],
    },
  ),
];
export class PluginRegistry {
  private plugins = new Map<string, StylePlugin>();
  constructor(extra: StylePlugin[] = []) {
    [...builtinPlugins, ...extra].forEach((p) => this.register(p));
  }
  register(plugin: StylePlugin) {
    const p = pluginSchema.parse(plugin);
    let count = 0;
    const visit = (nodes: StylePlugin["layout"]["nodes"], depth: number) => {
      if (depth > 12) throw new Error("样式布局层级超过 12 层");
      nodes.forEach((n) => {
        count++;
        if (n.children) visit(n.children, depth + 1);
      });
    };
    visit(p.layout.nodes, 1);
    if (count > 200) throw new Error("样式布局最多包含 200 个元素");
    const keys = new Set<string>();
    for (const field of p.fields) {
      if (keys.has(field.key)) throw new Error(`样式字段重复：${field.key}`);
      keys.add(field.key);
      if (
        field.default !== null &&
        field.type === "number" &&
        typeof field.default !== "number"
      )
        throw new Error(`${field.label}的默认值应为数字`);
      if (
        field.default !== null &&
        field.type !== "number" &&
        typeof field.default !== "string"
      )
        throw new Error(`${field.label}的默认值应为文本`);
      if (
        field.type === "select" &&
        (!field.options?.length ||
          (field.default !== null &&
            !field.options.includes(String(field.default))))
      )
        throw new Error(`${field.label}需要有效选项`);
    }
    this.plugins.set(p.id, p);
  }
  get(id: string) {
    const p = this.plugins.get(id);
    if (!p) throw new Error(`缺少消息样式：${id}`);
    return p;
  }
  list() {
    return [...this.plugins.values()];
  }
  defaults(id: string) {
    return Object.fromEntries(
      this.get(id).fields.map((f) => [f.key, f.default]),
    );
  }
  validate(message: Message) {
    const p = this.get(message.kind);
    for (const f of p.fields) {
      const value = message.data[f.key];
      if (f.required && (value == null || value === ""))
        throw new Error(`${p.name}：请填写${f.label}`);
      if (
        value != null &&
        f.type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(`${f.label}应为数字`);
      if (value != null && f.type !== "number" && typeof value !== "string")
        throw new Error(`${f.label}应为文本`);
      if (value && f.options && !f.options.includes(String(value)))
        throw new Error(`${f.label}的选项不存在`);
    }
  }
}
export function interpolate(template: string, data: Message["data"]): string {
  return template.replace(/\{\{([\w.-]+)\}\}/g, (_, key: string) =>
    String(data[key] ?? ""),
  );
}
