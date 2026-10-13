import { useState } from "react";
import { Modal, Field } from "./components.js";
import { request, post } from "./api.js";
import {
  defaultSources,
  type MaterialSources,
} from "../core/material-sources.js";
export function SourceSettings({
  value,
  saved,
  close,
}: {
  value: MaterialSources;
  saved: (s: MaterialSources) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(structuredClone(value)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(reset = false) {
    setBusy(true);
    setError("");
    try {
      const next = await post<MaterialSources>(
        reset ? "/api/materials/sources/reset" : "/api/materials/sources",
        reset ? {} : draft,
      );
      saved(next);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = draft.sources.find((s) => s.id === draft.selectedId)!;
  const patch = (data: Partial<typeof current>) =>
    setDraft({
      ...draft,
      sources: draft.sources.map((s) =>
        s.id === current.id ? { ...s, ...data } : s,
      ),
    });
  return (
    <Modal title="素材源设置" close={close}>
      <Field label="素材源">
        <select
          value={draft.selectedId}
          onChange={(e) => setDraft({ ...draft, selectedId: e.target.value })}
        >
          {draft.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="phone-config-actions">
        <button
          className="button secondary"
          onClick={() => {
            const id = "source-" + Date.now();
            setDraft({
              ...draft,
              selectedId: id,
              sources: [
                ...draft.sources,
                { id, name: "自定义素材源", type: "json", url: "" },
              ],
            });
          }}
        >
          添加素材源
        </button>
        <button
          className="text-button"
          disabled={draft.sources.length === 1}
          onClick={() => {
            const list = draft.sources.filter((s) => s.id !== current.id);
            setDraft({ sources: list, selectedId: list[0]!.id });
          }}
        >
          删除当前源
        </button>
      </div>
      <Field label="显示名称">
        <input
          type="text"
          value={current.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </Field>
      <Field label="目录格式">
        <select
          value={current.type}
          onChange={(e) =>
            patch({ type: e.target.value as "json" | "moenotes" })
          }
        >
          <option value="moenotes">Moenotes 兼容接口</option>
          <option value="json">JSON素材目录</option>
        </select>
      </Field>
      <Field
        label={current.type === "json" ? "JSON目录地址" : "目录接口根地址"}
      >
        <input
          type="text"
          value={current.url}
          onChange={(e) => patch({ url: e.target.value })}
        />
      </Field>
      <Field label="素材根地址（可选）">
        <input
          type="text"
          value={current.assetBase ?? ""}
          onChange={(e) => patch({ assetBase: e.target.value })}
        />
      </Field>
      <Field label="来源网站（可选）">
        <input
          type="text"
          value={current.site ?? ""}
          onChange={(e) => patch({ site: e.target.value })}
        />
      </Field>
      {current.type === "json" && (
        <details className="import-guide">
          <summary>JSON目录说明</summary>
          <p>
            目录使用 files 数组，每项写 name 和
            url；相对地址按素材根地址解析。地址可用 {"{query}"}、{"{offset}"}、
            {"{limit}"} 表示搜索和分页参数。
          </p>
          <pre>
            {JSON.stringify(
              {
                files: [
                  { name: "头像", url: "avatar.png", kind: "image" },
                  { name: "提示音", url: "notify.wav", kind: "sound" },
                ],
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <footer>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void save(true)}
        >
          重置为默认
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void save()}
        >
          保存并使用
        </button>
      </footer>
    </Modal>
  );
}
