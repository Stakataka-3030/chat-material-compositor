import type { Asset } from "./model.js";
export function assetName(asset: Asset) {
  if (asset.builtin && asset.name === "其他") {
    const kind =
      asset.kind === "icon"
        ? "图标"
        : asset.kind === "sticker"
          ? "贴纸"
          : "素材";
    return `${kind} · ${asset.id.slice(-6)}`;
  }
  return asset.name;
}
export function assetCategory(asset: Asset) {
  return asset.category ?? asset.kind;
}
