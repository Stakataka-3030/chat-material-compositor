import { useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import type { Asset, Rect } from "../core/model.js";
import { post } from "./api.js";
import { useDialogFocus } from "./components.js";
export function CropDialog({
  asset,
  done,
  close,
}: {
  asset: Asset;
  done(asset: Asset): void;
  close(): void;
}) {
  const [dimensions, setDimensions] = useState({
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  });
  const [area, setArea] = useState<Rect>({
    x: 0,
    y: 0,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  });
  const [ratio, setRatio] = useState(asset.kind === "avatar" ? 1 : 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const stage = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; area: Rect } | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, close);
  function preset(value: number, dims = dimensions) {
    setRatio(value);
    const w = value ? Math.min(dims.width, dims.height * value) : dims.width,
      h = value ? w / value : dims.height;
    setArea({
      x: (dims.width - w) / 2,
      y: (dims.height - h) / 2,
      width: w,
      height: h,
    });
  }
  function resize(w: number) {
    const width = Math.max(1, Math.min(dimensions.width, w)),
      height = ratio ? Math.min(dimensions.height, width / ratio) : area.height;
    const correctedWidth = ratio ? height * ratio : width;
    setArea({
      ...area,
      width: correctedWidth,
      height,
      x: Math.min(area.x, dimensions.width - correctedWidth),
      y: Math.min(area.y, dimensions.height - height),
    });
  }
  async function apply() {
    setBusy(true);
    try {
      const result = await post<Asset>(`/api/assets/${asset.id}/crop`, area);
      done(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <section
        ref={dialog}
        className="modal crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="裁剪素材"
      >
        <header>
          <h2>裁剪素材</h2>
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="crop-preview">
          <div className="crop-stage" ref={stage}>
            <img
              src={`/api/assets/file/${asset.id}`}
              onLoad={(e) => {
                const image = e.currentTarget,
                  dims = {
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  };
                setDimensions(dims);
                preset(ratio, dims);
              }}
            />
            <div
              className="crop-rect"
              style={{
                left: `${(area.x / dimensions.width) * 100}%`,
                top: `${(area.y / dimensions.height) * 100}%`,
                width: `${(area.width / dimensions.width) * 100}%`,
                height: `${(area.height / dimensions.height) * 100}%`,
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  area: { ...area },
                };
              }}
              onPointerMove={(e) => {
                if (!drag.current || !stage.current) return;
                const box = stage.current.getBoundingClientRect(),
                  start = drag.current;
                setArea({
                  ...start.area,
                  x: Math.max(
                    0,
                    Math.min(
                      dimensions.width - start.area.width,
                      start.area.x +
                        ((e.clientX - start.x) / box.width) * dimensions.width,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      dimensions.height - start.area.height,
                      start.area.y +
                        ((e.clientY - start.y) / box.height) *
                          dimensions.height,
                    ),
                  ),
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="field-pair">
          <label className="field">
            <span>比例</span>
            <select
              value={ratio}
              onChange={(e) => preset(Number(e.target.value))}
            >
              <option value={0}>自由</option>
              <option value={1}>1:1</option>
              <option value={4 / 3}>4:3</option>
              <option value={9 / 16}>9:16</option>
              <option value={375 / 812}>手机屏幕</option>
            </select>
          </label>
          <label className="field">
            <span>裁剪尺寸</span>
            <output>
              {Math.round(area.width)} × {Math.round(area.height)}
            </output>
          </label>
        </div>
        <label className="field">
          <span>宽度</span>
          <input
            type="range"
            min={Math.min(20, dimensions.width)}
            max={dimensions.width}
            value={area.width}
            onChange={(e) => resize(Number(e.target.value))}
          />
        </label>
        {!ratio && (
          <label className="field">
            <span>高度</span>
            <input
              type="range"
              min={Math.min(20, dimensions.height)}
              max={dimensions.height}
              value={area.height}
              onChange={(e) =>
                setArea({
                  ...area,
                  height: Number(e.target.value),
                  y: Math.min(
                    area.y,
                    dimensions.height - Number(e.target.value),
                  ),
                })
              }
            />
          </label>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span className="muted">拖动选框调整位置</span>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void apply()}
          >
            <Crop size={15} />
            {busy ? "裁剪中" : "保存裁剪"}
          </button>
        </footer>
      </section>
    </div>
  );
}
