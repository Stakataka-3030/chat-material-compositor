const rootFiles = new Set([
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "release.config.json",
  ".gitignore",
  ".gitattributes",
  ".puppeteerrc.cjs",
]);
export function isPublishableFile(file: string) {
  const name = file.replaceAll("\\", "/");
  if (name.split("/").some((part) => part === ".." || part.startsWith(".")))
    return rootFiles.has(name);
  if (rootFiles.has(name)) return true;
  if (/^(src|web)\//.test(name)) return /\.(ts|tsx|css|html)$/.test(name);
  if (name === "launcher/Program.cs") return true;
  return [
    "scripts/launcher.mjs",
    "scripts/package-delivery.ts",
    "scripts/build-portable.mjs",
    "examples/order.style.json",
  ].includes(name);
}
