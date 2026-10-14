import { textCSSHelp, textCSSWarnings } from "../core/text-css.js";
export function TextCSSInput({
  value,
  change,
}: {
  value: string;
  change: (s: string) => void;
}) {
  const warnings = textCSSWarnings(value);
  return (
    <>
      <textarea
        aria-label="文字CSS"
        rows={4}
        maxLength={4000}
        value={value}
        placeholder="color: #d34b72; font-weight: 700;"
        onChange={(e) => change(e.target.value)}
      />
      <small>{textCSSHelp}</small>
      {warnings.length > 0 && (
        <small className="error-text">暂不支持：{warnings.join("、")}</small>
      )}
    </>
  );
}
