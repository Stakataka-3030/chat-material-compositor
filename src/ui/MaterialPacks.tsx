import { useState } from "react";
import { Upload, Download } from "lucide-react";
import type { Asset, AssetKind } from "../core/model.js";
import { assetCategory } from "../core/asset-names.js";
import { Modal, Field } from "./components.js";
import { request, download } from "./api.js";
export function MaterialPacks({
  assets,
  kind,
  imported,
  notify,
}: {
  assets: Asset[];
  kind: AssetKind;
  imported: () => Promise<void>;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [open, setOpen] = useState(false),
    [scope, setScope] = useState<"category" | "all">("category"),
    [busy, setBusy] = useState(false);
  const chosen = assets.filter(
    (a) => a.kind !== "mask" && (scope === "all" || assetCategory(a) === kind),
  );
  async function importPack(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await request<{ imported: number; existing: number }>(
        "/api/material-packs/import",
        { method: "POST", body, signal: AbortSignal.timeout(120000) },
      );
      await imported();
      notify(
        `已导入 ${result.imported} 个素材${result.existing ? `，${result.existing} 个已在库中` : ""}`,
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label className={"button secondary " + (busy ? "disabled" : "")}>
        <Download size={16} />
        导入素材包
        <input
          type="file"
          hidden
          accept=".zip"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importPack(file);
            e.target.value = "";
          }}
        />
      </label>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Upload size={16} />
        导出素材包
      </button>
      {open && (
        <Modal
          title="导出素材包"
          close={() => {
            if (!busy) setOpen(false);
          }}
        >
          <Field label="导出范围">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "category" | "all")}
            >
              <option value="category">当前分类</option>
              <option value="all">全部素材</option>
            </select>
          </Field>
          <p>{chosen.length} 个素材。手机皮肤的屏幕遮罩会在导入时恢复。</p>
          <footer>
            <button
              className="button primary"
              disabled={busy || !chosen.length}
              onClick={() => {
                setBusy(true);
                void download(
                  "/api/material-packs/export",
                  { ids: chosen.map((a) => a.id) },
                  "聊天素材合成器-素材包.zip",
                )
                  .then(() => {
                    setOpen(false);
                    notify("素材包已导出");
                  })
                  .catch((e) => notify(e.message, "error"))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "正在打包…" : "导出 ZIP"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
