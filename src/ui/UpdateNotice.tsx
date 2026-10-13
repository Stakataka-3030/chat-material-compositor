import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { request, post } from "./api.js";
import { Modal } from "./components.js";
import { APP_VERSION } from "../core/version.js";
import type { UpdateInfo } from "../core/updates.js";
export function UpdateNotice() {
  const [info, setInfo] = useState<UpdateInfo | null>(null),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  async function check(force: boolean) {
    setBusy(true);
    try {
      setInfo(await post<UpdateInfo>("/api/updates/check", { force }));
    } catch {
      setInfo((old) => ({
        ...(old ?? { autoCheck: true, configured: false }),
        status: "error",
        currentVersion: APP_VERSION,
        message: "检查更新失败，点击重试",
      }));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void request<UpdateInfo>("/api/updates")
      .then((value) => {
        if (!active) return;
        setInfo(value);
        if (value.autoCheck && value.configured) void check(false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const available = info?.status === "update_available";
  const message =
    info?.status === "not_configured"
      ? "更新源将在 GitHub 发布时启用。"
      : info?.status === "up_to_date"
        ? "当前已是最新版本。"
        : info?.status === "no_release"
          ? "还没有可用的新版本。"
          : info?.status === "error"
            ? info.message
            : available
              ? `发现新版本 ${info.latestVersion}。`
              : "可以检查是否有新版本。";
  return (
    <>
      <button
        className={"update-entry " + (available ? "update-available" : "")}
        title={`当前版本 ${APP_VERSION}`}
        onClick={() => {
          setOpen(true);
          if (!info || info.status === "not_checked" || info.status === "error")
            void check(true);
        }}
      >
        <RefreshCw size={16} />
        <span>
          {busy
            ? "检查中"
            : available
              ? "有更新"
              : info?.status === "error"
                ? "重试更新"
                : "检查更新"}
        </span>
      </button>
      {open && (
        <Modal title="软件更新" close={() => setOpen(false)}>
          <p>当前版本 {APP_VERSION}</p>
          <p role="status">{message}</p>
          {available && info.releaseUrl && (
            <a
              className="button primary"
              href={info.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              查看新版
            </a>
          )}
          {available && info.notes && (
            <pre className="update-notes">{info.notes}</pre>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={info?.autoCheck ?? true}
              onChange={(e) => {
                void post<UpdateInfo>("/api/updates/preferences", {
                  autoCheck: e.target.checked,
                })
                  .then(setInfo)
                  .catch(() => {
                    setInfo((old) => ({
                      ...(old ?? { autoCheck: true, configured: false }),
                      status: "error",
                      currentVersion: APP_VERSION,
                      message: "设置保存失败，请稍后重试",
                    }));
                  });
              }}
            />
            启动时检查更新
          </label>
          <footer>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void check(true)}
            >
              <RefreshCw size={15} />
              {busy ? "检查中…" : "重新检查"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
