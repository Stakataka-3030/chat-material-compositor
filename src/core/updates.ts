export type UpdateStatus =
  | "not_configured"
  | "not_checked"
  | "no_release"
  | "up_to_date"
  | "update_available"
  | "error";
export interface UpdateInfo {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  notes?: string;
  checkedAt?: string;
  message?: string;
  autoCheck: boolean;
  configured: boolean;
}
export function versionParts(value: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function compareVersions(a: string, b: string) {
  const left = versionParts(a),
    right = versionParts(b);
  if (!left || !right) throw new Error("版本号格式无效");
  for (let i = 0; i < 3; i++)
    if (left[i] !== right[i]) return left[i]! > right[i]! ? 1 : -1;
  return 0;
}
export function selectRelease(
  input: unknown,
  currentVersion: string,
  repository: string,
) {
  if (!Array.isArray(input)) throw new Error("更新信息格式无效");
  const candidates = input
    .filter((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        item.draft ||
        item.prerelease ||
        typeof item.tag_name !== "string" ||
        !versionParts(item.tag_name)
      )
        return false;
      if (typeof item.html_url !== "string") return false;
      let url: URL;
      try {
        url = new URL(item.html_url);
      } catch {
        return false;
      }
      if (
        url.origin !== "https://github.com" ||
        url.username ||
        url.password ||
        !url.pathname.startsWith(`/${repository}/releases/tag/`)
      )
        return false;
      return (
        Array.isArray(item.assets) &&
        item.assets.some((asset: unknown) => {
          if (
            !asset ||
            typeof asset !== "object" ||
            !("name" in asset) ||
            typeof asset.name !== "string"
          )
            return false;
          return (
            /^(聊天素材合成器-|chat-material-compositor-)/.test(asset.name) &&
            /\.(zip|exe|msi|dmg|AppImage|tar\.gz)$/i.test(asset.name) &&
            !/(源码与素材|本机备份|素材包|asset-pack|materials)/i.test(asset.name)
          );
        })
      );
    })
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  const latest = candidates[0];
  if (!latest) return { status: "no_release" as const, currentVersion };
  return {
    status:
      compareVersions(latest.tag_name, currentVersion) > 0
        ? ("update_available" as const)
        : ("up_to_date" as const),
    currentVersion,
    latestVersion: latest.tag_name,
    releaseUrl: latest.html_url as string,
    notes: typeof latest.body === "string" ? latest.body.slice(0, 16000) : "",
  };
}
