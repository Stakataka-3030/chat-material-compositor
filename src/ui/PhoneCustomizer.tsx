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
import {
  extractAppearance,
  mergeAppearance,
  scopeLabels,
  uiScope,
  type ConfigScope,
  type ScopedConfig,
} from "../core/appearance-config.js";
import { appearancePresets } from "../core/appearance-presets.js";
import { TextCSSInput } from "./TextCSSInput.js";
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
  notify: (s: string, tone?: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false),
    u = resolvePhoneUI(appearance.ui);
  const set = (key: keyof PhoneUI, value: unknown) =>
    change({ ui: { ...appearance.ui, [key]: value } });
  async function importFile(
    file: File,
    font = false,
    scope: ConfigScope = "all",
  ) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (font) {
        body.append("kind", "font");
        body.append("name", file.name);
      }
      if (!font) body.append("scope", scope);
      const result = await request<Appearance | Asset | ScopedConfig>(
        font ? "/api/assets" : "/api/phone-config/import",
        { method: "POST", body, signal: AbortSignal.timeout(120000) },
      );
      await refresh();
      if (font)
        set(
          scope === "system" ? "statusFontAssetId" : "fontAssetId",
          (result as Asset).id,
        );
      else if ("scope" in result)
        change(mergeAppearance(appearance, result.appearance));
      else change(result as Appearance);
      notify(font ? "本机字体已导入" : scopeLabels[scope] + "配置及素材已导入");
    } catch (e) {
      notify((e as Error).message, "error");
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
    if (key === "messageCSS")
      control = (
        <TextCSSInput value={String(value)} change={(v) => set(key, v)} />
      );
    else if (key.endsWith("AssetId"))
      control = (
        <AssetSelect
          assets={assets}
          kind={
            /FontAssetId$/i.test(key)
              ? "font"
              : key.endsWith("BackgroundAssetId")
                ? "bar-background"
                : "icon"
          }
          value={value as string | null}
          onChange={(v) => set(key, v)}
          empty={/FontAssetId$/i.test(key) ? "使用系统字体" : "不使用素材"}
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
    else if (key === "cameraType" || key === "navigationMode") {
      const choices =
        key === "cameraType"
          ? [
              ["none", "不显示"],
              ["hole", "挖孔"],
              ["island", "胶囊"],
              ["notch", "刘海"],
            ]
          : [
              ["none", "不显示"],
              ["gesture", "手势条"],
              ["buttons", "三键导航"],
            ];
      control = (
        <select
          value={String(value)}
          onChange={(e) => set(key, e.target.value)}
        >
          {choices.map(([v, name]) => (
            <option key={v} value={v}>
              {name}
            </option>
          ))}
        </select>
      );
    } else if (key.endsWith("Style"))
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
    else if (
      /^header(Left|Right\d)$|^footer(Left|Right)\d$/.test(key) ||
      key.endsWith("Symbol")
    )
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
        {["字体", "状态栏"].includes(section.title) && (
          <>
            <label className="button secondary">
              {section.title === "状态栏" ? "导入状态栏字体" : "导入本机字体"}
              <input
                hidden
                type="file"
                accept=".ttf,.otf,.woff,.woff2,.ttc"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void importFile(
                      f,
                      true,
                      section.title === "状态栏" ? "system" : "software",
                    );
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

  function check(
    label: string,
    key: "showShell" | "showRead" | "showNames" | "showStatusTime" | "charging",
  ) {
    return (
      <label className="check-row">
        <input
          type="checkbox"
          checked={appearance[key] ?? false}
          onChange={(e) => change({ [key]: e.target.checked })}
        />
        {label}
      </label>
    );
  }
  function basic(scope: Exclude<ConfigScope, "all">) {
    return scope === "system" ? (
      <details>
        <summary>皮肤与显示</summary>
        <Field label="手机皮肤">
          <AssetSelect
            assets={assets}
            kind="shell"
            value={appearance.shellId}
            onChange={(id) => change({ shellId: id })}
            empty="通用手机"
          />
        </Field>
        {!appearance.shellId && (
          <Field label="通用外壳颜色">
            <input
              type="color"
              value={appearance.shellColor}
              onChange={(e) => change({ shellColor: e.target.value })}
            />
          </Field>
        )}
        {check("显示手机外壳", "showShell")}
        <Field label="屏幕高度">
          <select
            value={appearance.screenHeightRatio ?? 1}
            onChange={(e) =>
              change({ screenHeightRatio: Number(e.target.value) })
            }
          >
            <option value={1}>全高 · 100%</option>
            <option value={0.75}>四分之三 · 75%</option>
            <option value={0.5}>半高 · 50%</option>
            {![1, 0.75, 0.5].includes(appearance.screenHeightRatio ?? 1) && (
              <option value={appearance.screenHeightRatio}>
                {Math.round((appearance.screenHeightRatio ?? 1) * 100)}%
              </option>
            )}
          </select>
          <input
            aria-label="自定义屏幕高度"
            type="range"
            min={0.35}
            max={1}
            step={0.01}
            value={appearance.screenHeightRatio ?? 1}
            onChange={(e) =>
              change({ screenHeightRatio: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="状态栏时间">
          <input
            value={appearance.statusTime}
            onChange={(e) => change({ statusTime: e.target.value })}
          />
        </Field>
        <Field label="电量 %">
          <input
            type="number"
            min={0}
            max={100}
            value={appearance.battery}
            onChange={(e) =>
              change({
                battery: Math.max(0, Math.min(100, Number(e.target.value))),
              })
            }
          />
        </Field>
        {check("状态栏显示时间", "showStatusTime")}
        {check("充电状态", "charging")}
      </details>
    ) : (
      <details>
        <summary>背景与显示</summary>
        <Field label="聊天背景">
          <AssetSelect
            assets={assets}
            kind="wallpaper"
            value={appearance.wallpaperId}
            onChange={(id) => change({ wallpaperId: id })}
          />
        </Field>
        <Field label="背景适配">
          <select
            value={appearance.wallpaperFit}
            onChange={(e) =>
              change({ wallpaperFit: e.target.value as "cover" | "contain" })
            }
          >
            <option value="cover">填满屏幕</option>
            <option value="contain">显示完整图片</option>
          </select>
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={appearance.theme === "dark"}
            onChange={(e) =>
              change({ theme: e.target.checked ? "dark" : "light" })
            }
          />
          深色聊天界面
        </label>
        {check("显示已读", "showRead")}
        {check("显示发送者昵称", "showNames")}
        <Field label="昵称颜色">
          <input
            type="color"
            value={appearance.nameColor || "#ffffff"}
            onChange={(e) => change({ nameColor: e.target.value })}
          />
          <button
            className="text-button"
            onClick={() => change({ nameColor: null })}
          >
            自动选择颜色
          </button>
        </Field>
        <Field label="文字消息字号">
          <NumberControl
            value={appearance.fontSize}
            range={[6, 60, 1]}
            label="文字消息字号"
            change={(fontSize) => change({ fontSize })}
          />
        </Field>
      </details>
    );
  }
  function actions(scope: ConfigScope) {
    return (
      <div className="phone-config-actions">
        <label className="button secondary">
          导入配置
          <input
            hidden
            type="file"
            accept=".zip,.phonecfg,.chatcfg"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f, false, scope);
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
              { appearance, scope },
              scopeLabels[scope] + "配置.zip",
            )
              .catch((e) => notify(e.message, "error"))
              .finally(() => setBusy(false));
          }}
        >
          导出配置及素材
        </button>
      </div>
    );
  }
  function section(scope: Exclude<ConfigScope, "all">) {
    const groups = phoneGroups.filter(
      (g) => !g.parent && g.fields.some(([key]) => uiScope(key) === scope),
    );
    return (
      <details className={"phone-customizer customizer-" + scope}>
        <summary>
          {scope === "system" ? "自定义手机界面" : "自定义聊天软件"}
        </summary>
        <Field label="内置预设">
          <select
            aria-label={scopeLabels[scope] + "内置预设"}
            value=""
            disabled={busy}
            onChange={(e) => {
              const preset = appearancePresets.find(
                (p) => p.id === e.target.value,
              );
              if (preset) {
                change(mergeAppearance(appearance, preset.appearance));
                notify("已应用" + preset.name);
              }
            }}
          >
            <option value="" disabled>
              选择预设
            </option>
            {appearancePresets
              .filter((p) => p.scope === scope)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        {actions(scope)}
        <details className="builtin-config-downloads">
          <summary>下载内置配置包</summary>
          {appearancePresets
            .filter((p) => p.scope === scope)
            .map((p) => (
              <a
                key={p.id}
                className="text-button"
                href={"/api/phone-config/presets/" + p.id}
                download={p.name + ".zip"}
              >
                {p.name}
              </a>
            ))}
        </details>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            const preset = appearancePresets.find(
              (p) => p.id === scope + "-ournotes",
            )!;
            change(mergeAppearance(appearance, preset.appearance));
            notify("已恢复ournotes默认样式");
          }}
        >
          恢复默认值
        </button>
        <p className="muted">
          位置和尺寸以375宽的屏幕为基准。-1表示自动位置；配置包包含此部分使用的素材。
        </p>
        {basic(scope)}
        {groups.map((g) =>
          group({
            ...g,
            fields: g.fields.filter(([key]) => uiScope(key) === scope),
          }),
        )}
      </details>
    );
  }
  return (
    <>
      {section("system")}
      {section("software")}
      <details className="combined-config">
        <summary>完整界面配置</summary>
        {actions("all")}
      </details>
    </>
  );
}
