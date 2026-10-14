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
function MaterialThumbnail({ item }: { item: OnlineMaterial }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="online-thumbnail checker">
      {failed ? (
        <span className="muted">预览加载失败，可打开直链查看</span>
      ) : (
        <img
          src={item.url}
          alt={item.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
export function OnlineMaterials({
  kind,
  imported,
  notify,
}: {
  kind: AssetKind;
  imported: () => Promise<void>;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [query, setQuery] = useState(sourceKeywords[kind] ?? ""),
    [page, setPage] = useState<OnlineMaterialPage | null>(null),
    [busy, setBusy] = useState(false),
    [downloading, setDownloading] = useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const generation = useRef(0);
  const [history, setHistory] = useState([0]),
    [pageIndex, setPageIndex] = useState(0),
    [searchedQuery, setSearchedQuery] = useState("");
  const [sources, setSources] = useState<MaterialSources>(defaultSources),
    [settingsOpen, setSettingsOpen] = useState(false);
  const source = sources.sources.find((s) => s.id === sources.selectedId)!;
  const canBrowse =
    kind !== "sound" ||
    source.type !== "moenotes" ||
    new URL(source.url).hostname !== "assets.bdon.moe";
  const pageFiles =
    page?.files.filter(
      (item) => item.kind === (kind === "sound" ? "sound" : "image"),
    ) ?? [];
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
    setHistory([0]);
    setPageIndex(0);
  }, [kind]);
  async function search(offset = 0, move: "reset" | "next" | "prev" = "reset") {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await request<OnlineMaterialPage>(
        `/api/materials/online?q=${encodeURIComponent(move === "reset" ? query : searchedQuery)}&offset=${offset}`,
      );
      if (current === generation.current) {
        setPage(result);
        if (move === "reset") {
          setHistory([offset]);
          setPageIndex(0);
          setSearchedQuery(query);
        } else if (move === "next") {
          setHistory([...history.slice(0, pageIndex + 1), offset]);
          setPageIndex(pageIndex + 1);
        } else setPageIndex(pageIndex - 1);
      }
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
  function sourceDialog() {
    return (
      settingsOpen && (
        <SourceSettings
          value={sources}
          close={() => setSettingsOpen(false)}
          saved={(v) => {
            generation.current++;
            setSources(v);
            setPage(null);
            setError("");
            setBusy(false);
            setHistory([0]);
            setPageIndex(0);
            if (v.sources.find((s) => s.id === v.selectedId)?.type === "json")
              setQuery("");
          }}
        />
      )
    );
  }
  if (!canBrowse)
    return (
      <details className="online-materials">
        <summary>导入在线音频</summary>
        <div className="online-search">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="HTTP(S) 音频文件地址"
            aria-label="素材直链"
          />
          <button
            className="button secondary"
            disabled={Boolean(downloading) || !url.trim()}
            onClick={() => void importFile({ url: url.trim(), name: "" })}
          >
            导入音频
          </button>
          <button className="text-button" onClick={() => setSettingsOpen(true)}>
            来源设置
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {sourceDialog()}
      </details>
    );
  return (
    <details className="online-materials">
      <summary>{kind === "sound" ? "在线音效" : "在线素材"}</summary>
      <p>
        您可以从在线素材源选择并导入素材。素材会保存到本机，也可以导出为素材包。
      </p>
      <p className="current-material-source">
        当前素材源：<strong>{source.name}</strong>
        {source.type === "moenotes" && (
          <span>
            {" "}
            ·{" "}
            {
              (
                {
                  "zh-Hans": "简体中文",
                  "zh-Hant": "繁体中文",
                  ja: "日文",
                  en: "英文",
                  ko: "韩文",
                } as const
              )[source.locale || "zh-Hans"]
            }
          </span>
        )}
      </p>
      <div className="online-search">
        {canBrowse && (
          <>
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
          </>
        )}
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
            {pageFiles.map((item) => (
              <article key={item.path}>
                {item.kind === "image" ? (
                  <MaterialThumbnail key={item.url} item={item} />
                ) : (
                  <audio controls preload="none" src={item.url} />
                )}
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
          {!pageFiles.length && (
            <p className="muted">
              当前页没有可直接下载的素材，可以换关键词或查看下一页。
            </p>
          )}
          <div className="online-pages">
            <button
              className="button secondary"
              disabled={busy || pageIndex === 0}
              onClick={() => void search(history[pageIndex - 1]!, "prev")}
            >
              上一页
            </button>
            <span>第 {pageIndex + 1} 页</span>
            <button
              className="button secondary"
              disabled={busy || page.nextOffset === null}
              onClick={() => void search(page.nextOffset!, "next")}
            >
              下一页
            </button>
          </div>
        </>
      )}
      <details className="online-direct">
        <summary>使用素材直链</summary>
        <div className="online-search">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="HTTP(S) 图片或音频文件地址"
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
      {sourceDialog()}
    </details>
  );
}
