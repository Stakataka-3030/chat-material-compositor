import path from "node:path";
import { pluginSchema, type StylePlugin } from "../core/model.js";
import { PluginRegistry, builtinPlugins } from "../core/plugins.js";
import { DATA } from "./config.js";
import { atomicJson, readJson, SerialWriter } from "./storage.js";
export class PluginStore {
  private imported: StylePlugin[] = [];
  private flags: Record<string, boolean> = {};
  private writer = new SerialWriter();
  async init() {
    this.imported = await readJson(path.join(DATA, "plugins.json"), []);
    this.flags = await readJson(path.join(DATA, "plugin-flags.json"), {});
    new PluginRegistry(this.imported);
  }
  list() {
    return [...builtinPlugins, ...this.imported].map((p) => ({
      ...p,
      enabled: this.flags[p.id] ?? p.enabled,
    }));
  }
  async install(input: unknown) {
    const plugin = pluginSchema.parse(input);
    if (builtinPlugins.some((p) => p.id === plugin.id))
      throw new Error("请为新样式使用独立的标识");
    plugin.builtin = false;
    new PluginRegistry([plugin]);
    return this.writer.run(async () => {
      this.imported = [
        ...this.imported.filter((p) => p.id !== plugin.id),
        plugin,
      ];
      await atomicJson(path.join(DATA, "plugins.json"), this.imported);
      return plugin;
    });
  }
  async setEnabled(id: string, enabled: boolean) {
    if (!this.list().some((p) => p.id === id)) throw new Error("样式不存在");
    return this.writer.run(async () => {
      this.flags[id] = enabled;
      await atomicJson(path.join(DATA, "plugin-flags.json"), this.flags);
    });
  }
}
