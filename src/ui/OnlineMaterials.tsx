import { useEffect, useRef, useState } from "react";
import { Download, Search, ExternalLink } from "lucide-react";
import type { Asset, AssetKind } from "../core/model.js";
import {
  sourceKeywords,
  type OnlineMaterial,
  type OnlineMaterialPage,
} from "../core/online-materials.js";
import { request } from "./api.js";
import { SourceSettings } from "./SourceSettings.js";
import {
  defaultSources,
  type MaterialSources,
} from "../core/material-sources.js";
export function OnlineMaterials({
  kind,
  imported,
  notify,
}: {
  kind: AssetKind;
  imported: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState(sourceKeywords[kind] ?? ""),
    [page, setPage] = useState<OnlineMaterialPage | null>(null),
    [busy, setBusy] = useState(false),
    [downloading, setDownloading] = useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const generation = useRef(0);
  const [sources, setSources] = useState<MaterialSources>(defaultSources),
    [settingsOpen, setSettingsOpen] = useState(false);
  const source = sources.sources.find((s) => s.id === sources.selectedId)!;
  useEffect(() => {
    void request<MaterialSources>("/api/materials/sources")
      .then(setSources)
      .catch(() => {});
  }, []);
  useEffect(() => {
    generation.current++;
    setQuery(sourceKeywords[kind] ?? "");
    setPage(null);
    setError("");
    setBusy(false);
  }, [kind]);
  async function search(offset = 0) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await request<OnlineMaterialPage>(
        `/api/materials/online?q=${encodeURIComponent(query)}&offset=${offset}`,
      );
      if (current === generation.current) setPage(result);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function importFile(item: Pick<OnlineMaterial, "url" | "name">) {
    setDownloading(item.url);
    setError("");
    try {
      const asset = await request<Asset>("/api/materials/online/import", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          url: item.url,
          kind,
          name: item.name || undefined,
        }),
      });
      await imported();
      notify(`${asset.name} 已导入素材库`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading("");
    }
  }
  return (
    <details className="online-materials">
      <summary>在线素材</summary>
      <p>
        从 {source.name}{" "}
        的目录选择素材，按当前分类导入。下载后保存在本机，也可以打包保存。
      </p>
      <div className="online-search">
        <input
          type="text"
          aria-label="在线素材关键词"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="搜索角色英文名或文件名"
        />
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void search()}
        >
          <Search size={15} />
          {busy ? "查询中…" : "搜索"}
        </button>
        <a
          href={source.site || source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-button"
        >
          <ExternalLink size={14} />
          打开来源站
        </a>
        <button className="text-button" onClick={() => setSettingsOpen(true)}>
          设置素材源
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {page && (
        <>
          <div className="online-results">
            {page.files.map((item) => (
              <article key={item.path}>
                <strong>{item.name}</strong>
                <small>
                  {item.path.replace("Assets/AddressableResources/", "")}
                </small>
                <div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-button"
                  >
                    预览
                  </a>
                  <button
                    className="text-button"
                    disabled={Boolean(downloading)}
                    onClick={() => void importFile(item)}
                  >
                    <Download size={13} />
                    {downloading === item.url ? "下载中…" : "导入"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!page.files.length && (
            <p className="muted">
              当前页没有可直接下载的素材，可以换关键词或查看下一页。
            </p>
          )}
          {page.nextOffset !== null && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void search(page.nextOffset!)}
            >
              下一页
            </button>
          )}
        </>
      )}
      <details className="online-direct">
        <summary>使用素材直链</summary>
        <div className="online-search">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="HTTP(S) 图片、音频或字体文件地址"
            aria-label="素材直链"
          />
          <button
            className="button secondary"
            disabled={Boolean(downloading) || !url.trim()}
            onClick={() => void importFile({ url: url.trim(), name: "" })}
          >
            导入直链
          </button>
        </div>
      </details>
      {settingsOpen && (
        <SourceSettings
          value={sources}
          close={() => setSettingsOpen(false)}
          saved={(v) => {
            generation.current++;
            setSources(v);
            setPage(null);
            setError("");
            if (v.sources.find((s) => s.id === v.selectedId)?.type === "json")
              setQuery("");
          }}
        />
      )}
    </details>
  );
}
