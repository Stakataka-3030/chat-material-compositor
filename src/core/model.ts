import { z } from "zod";
import { phoneUISchema, type PhoneUI } from "./phone-ui.js";

export const assetKinds = [
  "shell",
  "wallpaper",
  "avatar",
  "sticker",
  "image",
  "sound",
  "icon",
  "mask",
  "font",
  "bar-background",
] as const;
export type AssetKind = (typeof assetKinds)[number];
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  category?: "icon" | "bar-background";
  file: string;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
  bytes: number;
  tags: string[];
  builtin?: boolean;
  screen?: Rect;
  maskId?: string;
  source?: { site: string; url: string; downloadedAt: string };
}
export interface Speaker {
  id: string;
  name: string;
  avatarId: string | null;
  soundId: string | null;
  color: string;
}
export type FieldValue = string | number | boolean | null;
export interface Message {
  id: string;
  speakerId: string;
  kind: string;
  data: Record<string, FieldValue>;
  waitMs: number;
  typingMs: number;
  read: boolean;
  soundId: string | null;
}
export interface PluginField {
  key: string;
  label: string;
  type: "text" | "multiline" | "number" | "asset" | "select" | "color";
  default: FieldValue;
  required?: boolean;
  options?: string[];
  assetKind?: AssetKind;
}
export interface LayoutNode {
  type: "text" | "image" | "column" | "row" | "space" | "line" | "wave";
  text?: string;
  css?: string;
  asset?: string;
  children?: LayoutNode[];
  size?: number;
  bold?: boolean;
  color?: string;
  height?: number;
  width?: number;
  gap?: number;
  fit?: "cover" | "contain";
  align?: "start" | "center" | "end";
}
export interface StylePlugin {
  id: string;
  version: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  builtin?: boolean;
  fields: PluginField[];
  layout: {
    variant: "bubble" | "card" | "media" | "separator";
    width?: number;
    background?: string;
    nodes: LayoutNode[];
  };
}
export interface Appearance {
  ui?: Partial<PhoneUI>;
  mode: "single" | "group";
  title: string;
  groupCount: number | null;
  theme: "light" | "dark";
  showStatusTime?: boolean;
  screenHeightRatio?: number;
  shellId: string | null;
  wallpaperId: string | null;
  showShell: boolean;
  showRead: boolean;
  showNames: boolean;
  shellColor: string;
  wallpaperFit: "cover" | "contain";
  fontSize: number;
  statusTime: string;
  battery: number;
  charging: boolean;
  nameColor?: string | null;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
}
export interface Project {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  meId: string;
  speakers: Speaker[];
  messages: Message[];
  appearance: Appearance;
  audio: {
    enabled: boolean;
    volume: number;
    sendSoundId: string | null;
    receiveSoundId: string | null;
    playSend: boolean;
  };
  playback: {
    leadMs: number;
    tailMs: number;
    fadeMs: number;
    loop: boolean;
    popMs: number;
    scrollMs: number;
  };
  output: {
    width: number;
    fps: number;
    background: "transparent" | "solid";
    backgroundColor: string;
    longShell?: boolean;
  };
  plugins: StylePlugin[];
}
export const uid = () => globalThis.crypto.randomUUID();
const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.-]+$/);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const value = z.union([
  z.string().max(30000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const nodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    type: z.enum(["text", "image", "column", "row", "space", "line", "wave"]),
    text: z.string().max(10000).optional(),
    css: z.string().max(4000).optional(),
    asset: z.string().max(120).optional(),
    children: z.array(nodeSchema).max(40).optional(),
    size: z.number().min(6).max(80).optional(),
    bold: z.boolean().optional(),
    color: z.string().max(40).optional(),
    height: z.number().min(0).max(2000).optional(),
    width: z.number().min(0).max(1000).optional(),
    gap: z.number().min(0).max(100).optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    align: z.enum(["start", "center", "end"]).optional(),
  }),
);
export const pluginSchema: z.ZodType<StylePlugin> = z.object({
  id,
  version: z.string().max(30),
  name: z.string().min(1).max(40),
  description: z.string().max(500),
  icon: z.string().max(30),
  enabled: z.boolean(),
  builtin: z.boolean().optional(),
  fields: z
    .array(
      z.object({
        key: id,
        label: z.string().max(40),
        type: z.enum([
          "text",
          "multiline",
          "number",
          "asset",
          "select",
          "color",
        ]),
        default: value,
        required: z.boolean().optional(),
        options: z.array(z.string().max(80)).max(100).optional(),
        assetKind: z.enum(assetKinds).optional(),
      }),
    )
    .max(40),
  layout: z.object({
    variant: z.enum(["bubble", "card", "media", "separator"]),
    width: z.number().min(40).max(1000).optional(),
    background: z.string().max(40).optional(),
    nodes: z.array(nodeSchema).min(1).max(40),
  }),
});
export const projectSchema: z.ZodType<Project> = z
  .object({
    schemaVersion: z.literal(1),
    id,
    title: z.string().min(1).max(120),
    createdAt: z.string(),
    updatedAt: z.string(),
    revision: z.number().int().nonnegative(),
    meId: id,
    speakers: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(80),
          avatarId: id.nullable(),
          soundId: id.nullable(),
          color,
        }),
      )
      .min(2)
      .max(256),
    messages: z
      .array(
        z.object({
          id,
          speakerId: id,
          kind: id,
          data: z.record(z.string(), value),
          waitMs: z.number().min(0).max(600000),
          typingMs: z.number().min(0).max(60000),
          read: z.boolean(),
          soundId: id.nullable(),
        }),
      )
      .max(10000),
    appearance: z.object({
      ui: phoneUISchema.optional(),
      mode: z.enum(["single", "group"]),
      title: z.string().max(120),
      groupCount: z.number().int().min(2).max(99999).nullable(),
      theme: z.enum(["light", "dark"]),
      showStatusTime: z.boolean().optional(),
      screenHeightRatio: z.number().min(0.35).max(1).optional(),
      shellId: id.nullable(),
      wallpaperId: id.nullable(),
      showShell: z.boolean(),
      showRead: z.boolean(),
      showNames: z.boolean(),
      shellColor: color,
      wallpaperFit: z.enum(["cover", "contain"]),
      fontSize: z.number().min(6).max(60),
      statusTime: z.string().max(20),
      battery: z.number().min(0).max(100),
      charging: z.boolean(),
      nameColor: color.nullable().optional(),
      transform: z.object({
        x: z.number().min(-2000).max(2000),
        y: z.number().min(-2000).max(2000),
        scaleX: z.number().min(0.2).max(3),
        scaleY: z.number().min(0.2).max(3),
        rotation: z.number().min(-180).max(180),
      }),
    }),
    audio: z.object({
      enabled: z.boolean(),
      volume: z.number().min(0).max(1),
      sendSoundId: id.nullable(),
      receiveSoundId: id.nullable(),
      playSend: z.boolean(),
    }),
    playback: z.object({
      leadMs: z.number().min(0).max(60000),
      tailMs: z.number().min(0).max(60000),
      fadeMs: z.number().min(0).max(10000),
      loop: z.boolean(),
      popMs: z.number().min(0).max(1000),
      scrollMs: z.number().min(0).max(2000),
    }),
    output: z.object({
      width: z.number().int().min(240).max(3840),
      fps: z.number().int().min(5).max(60),
      background: z.enum(["transparent", "solid"]),
      backgroundColor: color,
      longShell: z.boolean().optional(),
    }),
    plugins: z.array(pluginSchema).max(100),
  })
  .superRefine((p, ctx) => {
    const speakerIds = new Set(p.speakers.map((s) => s.id));
    if (speakerIds.size !== p.speakers.length)
      ctx.addIssue({
        code: "custom",
        message: "角色 ID 重复",
        path: ["speakers"],
      });
    if (!speakerIds.has(p.meId))
      ctx.addIssue({
        code: "custom",
        message: "请设置我方角色",
        path: ["meId"],
      });
    const messageIds = new Set<string>();
    for (const [i, m] of p.messages.entries()) {
      if (!speakerIds.has(m.speakerId))
        ctx.addIssue({
          code: "custom",
          message: "消息的发送者不存在",
          path: ["messages", i, "speakerId"],
        });
      if (messageIds.has(m.id))
        ctx.addIssue({
          code: "custom",
          message: "消息 ID 重复",
          path: ["messages", i, "id"],
        });
      messageIds.add(m.id);
    }
  });
export function newProject(): Project {
  const meId = uid(),
    otherId = uid(),
    now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    title: "未命名工程",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    meId,
    speakers: [
      {
        id: otherId,
        name: "对方",
        avatarId: null,
        soundId: null,
        color: "#8dafa6",
      },
      { id: meId, name: "我", avatarId: null, soundId: null, color: "#b4c994" },
    ],
    messages: [],
    appearance: {
      mode: "single",
      title: "对方",
      groupCount: null,
      theme: "light",
      shellId: null,
      wallpaperId: null,
      showShell: true,
      showRead: true,
      showNames: false,
      shellColor: "#202725",
      wallpaperFit: "cover",
      fontSize: 19,
      statusTime: "14:30",
      battery: 98,
      charging: false,
      nameColor: null,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    },
    audio: {
      enabled: true,
      volume: 0.7,
      sendSoundId: null,
      receiveSoundId: null,
      playSend: true,
    },
    playback: {
      leadMs: 300,
      tailMs: 1400,
      fadeMs: 0,
      loop: false,
      popMs: 180,
      scrollMs: 260,
    },
    output: {
      width: 1080,
      fps: 30,
      background: "transparent",
      backgroundColor: "#e7eee8",
      longShell: true,
    },
    plugins: [],
  };
}
export function createMessage(speakerId: string, plugin: StylePlugin): Message {
  return {
    id: uid(),
    speakerId,
    kind: plugin.id,
    data: Object.fromEntries(plugin.fields.map((f) => [f.key, f.default])),
    waitMs: 800,
    typingMs: 0,
    read: true,
    soundId: null,
  };
}
export function removeSpeaker(
  project: Project,
  speakerId: string,
  replacementId: string,
): Project {
  if (
    speakerId === project.meId ||
    project.speakers.length <= 2 ||
    !project.speakers.some((s) => s.id === replacementId && s.id !== speakerId)
  )
    throw new Error("请选择保留的角色作为接替发送者");
  return {
    ...project,
    speakers: project.speakers.filter((s) => s.id !== speakerId),
    messages: project.messages.map((m) =>
      m.speakerId === speakerId ? { ...m, speakerId: replacementId } : m,
    ),
  };
}
export function usedAssetIds(project: Project): Set<string> {
  const ids = new Set<string>();
  const add = (s: FieldValue | undefined) => {
    if (typeof s === "string" && s) ids.add(s);
  };
  add(project.appearance.shellId);
  add(project.appearance.wallpaperId);
  Object.entries(project.appearance.ui ?? {}).forEach(([key, value]) => {
    if (key.endsWith("AssetId")) add(value);
  });
  add(project.audio.sendSoundId);
  add(project.audio.receiveSoundId);
  project.speakers.forEach((s) => {
    add(s.avatarId);
    add(s.soundId);
  });
  project.messages.forEach((m) => {
    add(m.soundId);
    const custom = project.plugins.find((p) => p.id === m.kind);
    for (const field of custom?.fields ?? [])
      if (field.type === "asset") add(m.data[field.key]);
    Object.values(m.data).forEach((value) => {
      if (
        typeof value === "string" &&
        /^(shell|wallpaper|avatar|sticker|image|sound|icon|mask|font|bar-background)-[a-f0-9]{24}$/.test(
          value,
        )
      )
        add(value);
    });
  });
  return ids;
}
