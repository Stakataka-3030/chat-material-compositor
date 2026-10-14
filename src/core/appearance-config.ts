import { phoneDefaults, type PhoneUI } from "./phone-ui.js";
import type { Appearance } from "./model.js";
export type ConfigScope = "system" | "software" | "all";
export const scopeLabels = {
  system: "手机界面",
  software: "聊天软件",
  all: "完整界面",
};
const systemKeys = new Set([
  "frameRatio",
  "shellRadius",
  "screenRadius",
  "signalVisible",
  "wifiVisible",
  "clockVisible",
  "locationVisible",
  "batteryVisible",
  "batteryColor",
]);
export function uiScope(key: string): Exclude<ConfigScope, "all"> {
  return systemKeys.has(key) || /^(status|camera|navigation|battery)/.test(key)
    ? "system"
    : "software";
}
export const appearanceKeys = {
  system: [
    "shellId",
    "showShell",
    "shellColor",
    "screenHeightRatio",
    "showStatusTime",
    "statusTime",
    "battery",
    "charging",
  ],
  software: [
    "theme",
    "wallpaperId",
    "wallpaperFit",
    "fontSize",
    "nameColor",
    "showRead",
    "showNames",
  ],
} as const;
export function extractAppearance(
  value: Appearance,
  scope: ConfigScope,
): Partial<Appearance> {
  if (scope === "all") return structuredClone(value);
  const fields = Object.fromEntries(
    appearanceKeys[scope]
      .filter((k) => value[k] !== undefined)
      .map((k) => [k, value[k]]),
  );
  const ui = Object.fromEntries(
    Object.entries(value.ui ?? {}).filter(([key]) => uiScope(key) === scope),
  );
  return { ...fields, ui } as Partial<Appearance>;
}
export function mergeAppearance(
  current: Appearance,
  patch: Partial<Appearance>,
): Appearance {
  return { ...current, ...patch, ui: { ...current.ui, ...patch.ui } };
}
export function scopeDefaults(
  scope: Exclude<ConfigScope, "all">,
): Partial<PhoneUI> {
  return Object.fromEntries(
    Object.entries(phoneDefaults).filter(([key]) => uiScope(key) === scope),
  );
}
export interface ScopedConfig {
  scope: Exclude<ConfigScope, "all">;
  appearance: Partial<Appearance>;
}
