import { z } from "zod";
export const sourceSchema = z.object({
  id: z.string().regex(/^[\w-]{1,60}$/),
  name: z.string().min(1).max(80),
  type: z.enum(["moenotes", "json"]),
  url: z.string().min(1).max(2000),
  assetBase: z.string().max(2000).optional(),
  site: z.string().max(2000).optional(),
});
export const sourcesSchema = z
  .object({
    sources: z.array(sourceSchema).min(1).max(30),
    selectedId: z.string(),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.sources.map((s) => s.id)).size !== v.sources.length ||
      !v.sources.some((s) => s.id === v.selectedId)
    )
      c.addIssue({ code: "custom", message: "素材源标识或选择无效" });
    for (const s of v.sources)
      for (const value of [s.url, s.assetBase, s.site].filter(Boolean)) {
        try {
          const u = new URL(
            value!
              .replaceAll("{query}", "q")
              .replaceAll("{offset}", "0")
              .replaceAll("{limit}", "40"),
          );
          if (
            !["http:", "https:"].includes(u.protocol) ||
            u.username ||
            u.password
          )
            throw Error();
        } catch {
          c.addIssue({
            code: "custom",
            message: "素材源请填写有效的 HTTP(S) 地址",
          });
        }
      }
  });
export type MaterialSources = z.infer<typeof sourcesSchema>;
export const defaultSources: MaterialSources = {
  selectedId: "moenotes",
  sources: [
    {
      id: "moenotes",
      name: "Moenotes",
      type: "moenotes",
      url: "https://assets.bdon.moe",
      assetBase: "https://assets.bdon.moe/ja",
      site: "https://bdon.moe/tools/asset-viewer",
    },
  ],
};
