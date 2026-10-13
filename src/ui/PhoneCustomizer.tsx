import { useState, useEffect, type ReactNode } from "react";
import type { Appearance, Asset } from "../core/model.js";
import {
  phoneDefaults,
  phoneGroups,
  phoneRanges,
  iconNames,
  iconLabels,
  resolvePhoneUI,
  type PhoneUI,
} from "../core/phone-ui.js";
import { request, download } from "./api.js";
import { Field, AssetSelect } from "./components.js";
function NumberControl({
  value,
  range,
  label,
  change,
}: {
  value: number;
  range: [number, number, number];
  label: string;
  change: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    const next = Number.isFinite(n)
      ? Math.max(range[0], Math.min(range[1], n))
      : value;
    setDraft(String(next));
    change(next);
  };
  return (
    <input
      type="number"
      aria-label={label}
      min={range[0]}
      max={range[1]}
      step={range[2]}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (
          e.target.value !== "" &&
          Number.isFinite(n) &&
          n >= range[0] &&
          n <= range[1]
        )
          change(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
export function PhoneCustomizer({
  appearance,
  assets,
  change,
  refresh,
  notify,
}: {
  appearance: Appearance;
  assets: Asset[];
  change: (a: Partial<Appearance>) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    u = resolvePhoneUI(appearance.ui);
  const set = (key: keyof PhoneUI, value: unknown) =>
    change({ ui: { ...appearance.ui, [key]: value } });
  async function importFile(file: File, font = false) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (font) body.append("kind", "font");
      const result = await request<Appearance | Asset>(
        font ? "/api/assets" : "/api/phone-config/import",
        { method: "POST", body, signal: AbortSignal.timeout(120000) },
      );
      await refresh();
      if (font) set("fontAssetId", (result as Asset).id);
      else change(result as Appearance);
      notify(font ? "本机字体已导入" : "手机配置及素材已导入");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field([key, label]: [keyof PhoneUI, string]): ReactNode {
    const value = u[key],
      range = phoneRanges[key];
    let control: ReactNode;
    if (typeof value === "boolean")
      return (
        <label className="check-row" key={key}>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => set(key, e.target.checked)}
          />
          {label}
        </label>
      );
    if (key.endsWith("AssetId"))
      control = (
        <AssetSelect
          assets={assets}
          kind={key === "fontAssetId" ? "font" : ["icon", "image", "sticker"]}
          value={value as string | null}
          onChange={(v) => set(key, v)}
          empty={key === "fontAssetId" ? "使用系统字体" : "不使用素材"}
        />
      );
    else if (key === "frameRatio")
      control = (
        <>
          <select
            aria-label="手机比例预设"
            value={String(value)}
            onChange={(e) => set(key, Number(e.target.value))}
          >
            <option value="0">跟随手机皮肤</option>
            <option value={9 / 16}>9:16</option>
            <option value={9 / 19.5}>9:19.5</option>
            <option value={3 / 4}>3:4</option>
            <option value="1">1:1</option>
            <option value={16 / 9}>16:9</option>
            {![0, 9 / 16, 9 / 19.5, 3 / 4, 1, 16 / 9].includes(
              Number(value),
            ) && <option value={String(value)}>自定义 {String(value)}</option>}
          </select>
          <NumberControl
            value={Number(value)}
            range={range!}
            label="自定义手机宽高比"
            change={(v) => set(key, v)}
          />
        </>
      );
    else if (range)
      control = (
        <NumberControl
          value={Number(value)}
          range={range}
          label={label}
          change={(v) => set(key, v)}
        />
      );
    else if (key.endsWith("Style"))
      control = (
        <select
          value={String(value)}
          onChange={(e) => set(key, e.target.value)}
        >
          <option value="outline">描边</option>
          <option value="filled">填充</option>
        </select>
      );
    else if (key === "titleAlign")
      control = (
        <select
          value={String(value)}
          onChange={(e) => set(key, e.target.value)}
        >
          <option value="left">左侧</option>
          <option value="center">居中</option>
          <option value="right">右侧</option>
        </select>
      );
    else if (/^header(Left|Right\d)$|^footer(Left|Right)\d$/.test(key))
      control = (
        <select
          value={String(value)}
          onChange={(e) => set(key, e.target.value)}
        >
          {iconNames.map((n, i) => (
            <option key={n} value={n}>
              {iconLabels[i]}
            </option>
          ))}
        </select>
      );
    else if (phoneDefaults[key] === "" && key !== "inputText")
      control = (
        <div className="color-auto">
          <input
            type="color"
            aria-label={label}
            value={String(value || "#ffffff").slice(0, 7)}
            onChange={(e) => set(key, e.target.value)}
          />
          <button className="text-button" onClick={() => set(key, "")}>
            {value ? "恢复主题色" : "自动"}
          </button>
        </div>
      );
    else
      control = (
        <input
          type="text"
          value={String(value)}
          maxLength={200}
          onChange={(e) => set(key, e.target.value)}
        />
      );
    return (
      <Field key={key} label={label}>
        {control}
      </Field>
    );
  }
  function group(section: (typeof phoneGroups)[number]): ReactNode {
    return (
      <details key={section.title}>
        <summary>{section.title}</summary>
        {section.title === "字体" && (
          <>
            <p className="muted">字体仅从本机导入，不使用在线素材源。</p>
            <label className="button secondary">
              导入本机字体
              <input
                hidden
                type="file"
                accept=".ttf,.otf,.woff,.woff2,.ttc"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f, true);
                  e.target.value = "";
                }}
              />
            </label>
          </>
        )}
        <fieldset className="phone-fields" disabled={busy}>
          {section.fields.map(field)}
        </fieldset>
        {phoneGroups.filter((g) => g.parent === section.title).map(group)}
      </details>
    );
  }
  return (
    <details className="phone-customizer">
      <summary>自定义手机界面</summary>
      <p className="muted">
        位置和尺寸以375宽的屏幕为基准。-1表示自动位置；颜色留空时跟随主题。配置包包含皮肤、背景、图标和字体。
      </p>
      <div className="phone-config-actions">
        <label className="button secondary">
          导入配置
          <input
            hidden
            type="file"
            accept=".zip,.phonecfg"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void download(
              "/api/phone-config/export",
              { appearance },
              "手机界面配置.zip",
            )
              .catch((e) => notify(e.message))
              .finally(() => setBusy(false));
          }}
        >
          导出配置及素材
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => change({ ui: {} })}
        >
          恢复界面默认值
        </button>
      </div>
      {phoneGroups.filter((g) => !g.parent).map(group)}
    </details>
  );
}
