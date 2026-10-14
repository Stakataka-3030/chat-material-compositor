import type { AssetKind } from "./model.js";
export interface OnlineMaterial {
  path: string;
  name: string;
  url: string;
  kind: "image" | "sound";
}
export interface OnlineMaterialPage {
  files: OnlineMaterial[];
  nextOffset: number | null;
  total: number;
}
const names: Record<string, string> = {
  tomori: "灯",
  anon: "爱音",
  rana: "乐奈",
  soyo: "爽世",
  taki: "立希",
  uika: "初华",
  mutsumi: "睦",
  umiri: "海铃",
  nyamu: "若麦",
  sakiko: "祥子",
};
export const sourceKeywords: Partial<Record<AssetKind, string>> = {
  shell: "chatwindow_image",
  wallpaper: "back.png",
  avatar: "icon",
  sticker: "stamp",
  sound: "Cri/Sound/SE",
  icon: "Adv/Chat/UI",
  "bar-background": "Adv/Chat/UI",
};
export function materialUrl(
  filePath: string,
  base = "https://assets.bdon.moe/zh-Hans",
) {
  const relative = filePath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^Assets\/AddressableResources\//, "");
  const segments = relative.split("/");
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  if (/\.(png|webp)$/i.test(relative)) {
    let key = relative.replace(/\.(png|webp)$/i, "");
    if (/^MemberCard\/\d+\/[^/]+_atlas$/.test(key))
      key = key.replace(/_atlas$/, "");
    return {
      kind: "image" as const,
      url:
        base.replace(/\/$/, "") +
        "/" +
        [...key.split("/"), key.split("/").at(-1)! + ".webp"]
          .map(encodeURIComponent)
          .join("/"),
    };
  }
  if (/^Cri\/Sound\/.+\.(acb|awb)$/i.test(relative)) {
    const key = relative.replace(/\.(acb|awb)$/i, "");
    return {
      kind: "sound" as const,
      url:
        base.replace(/\/$/, "") +
        "/" +
        [...key.split("/"), key.split("/").at(-1)! + ".m4a"]
          .map(encodeURIComponent)
          .join("/"),
    };
  }
  return null;
}
export function materialName(path: string) {
  const actor = /\/\d+_([a-z]+)\//i.exec(path)?.[1],
    name = path.split("/").at(-1) ?? path;
  return actor
    ? `${names[actor] ?? actor} · ${name
        .replace(/^chatwindow_image\.png$/i, "手机皮肤")
        .replace(/^back\.png$/i, "聊天背景")
        .replace(/^lock\.png$/i, "锁屏背景")}`
    : name;
}
