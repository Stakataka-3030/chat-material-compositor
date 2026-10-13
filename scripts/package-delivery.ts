import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { ROOT } from "../src/server/config.js";
import { APP_VERSION } from "../src/core/version.js";
import { isPublishableFile } from "../src/server/release-policy.js";
const zip = new AdmZip();
async function add(folder = "") {
  for (const entry of await fs.readdir(path.join(ROOT, folder), {
    withFileTypes: true,
  })) {
    const name = folder ? folder + "/" + entry.name : entry.name;
    if (
      entry.isDirectory() &&
      ["src", "web", "scripts", "examples", "launcher"].some(
        (root) => name === root || name.startsWith(root + "/"),
      )
    )
      await add(name);
    else if (entry.isFile() && isPublishableFile(name))
      zip.addFile(
        "聊天素材合成器/" + name,
        await fs.readFile(path.join(ROOT, name)),
      );
  }
}
await add();
const output = path.resolve(
  ROOT,
  "..",
  "chat-material-compositor-" + APP_VERSION + "-source.zip",
);
await fs.writeFile(output, zip.toBuffer());
console.log(path.basename(output));
