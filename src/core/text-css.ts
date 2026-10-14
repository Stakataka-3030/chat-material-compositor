export const supportedTextCSS = [
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "color",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-color",
  "text-shadow",
  "text-transform",
  "opacity",
];
export const textCSSHelp =
  "填写CSS声明，例如 color: #d34b72; font-size: 20px; font-weight: 700; text-decoration: underline;。支持字体、字号、字重、斜体、颜色、行距、字距、对齐、装饰线、单个文字阴影、大小写和透明度，不支持选择器或网页布局。";
export interface TextStyle {
  size: number;
  family: string;
  weight: number;
  italic: boolean;
  color?: string;
  lineHeight: number;
  spacing: number;
  align: CanvasTextAlign;
  decoration: string;
  decorationColor?: string;
  opacity: number;
  transform: string;
  shadows: { x: number; y: number; blur: number; color: string }[];
}
function length(value: string, base: number) {
  const m = /^(-?[\d.]+)(px|pt|em|rem|%)?$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return (
    n *
    (m[2] === "pt"
      ? 4 / 3
      : m[2] === "em"
        ? base
        : m[2] === "rem"
          ? 16
          : m[2] === "%"
            ? base / 100
            : 1)
  );
}
export function parseTextCSS(css: string, defaults: TextStyle): TextStyle {
  const style = document.createElement("span").style;
  style.cssText = css;
  const result = { ...defaults, shadows: [...defaults.shadows] };
  const size = length(style.fontSize, defaults.size);
  if (size !== null) result.size = Math.max(6, Math.min(100, size));
  if (style.fontFamily) result.family = style.fontFamily;
  if (style.fontWeight) {
    const w =
      style.fontWeight === "bold" || style.fontWeight === "bolder"
        ? 700
        : style.fontWeight === "normal"
          ? 400
          : Number(style.fontWeight);
    if (Number.isFinite(w)) result.weight = Math.max(100, Math.min(900, w));
  }
  if (style.fontStyle) result.italic = style.fontStyle !== "normal";
  if (style.color && !style.color.includes("var(")) result.color = style.color;
  if (style.lineHeight && style.lineHeight !== "normal") {
    const bare = /^[\d.]+$/.test(style.lineHeight);
    const h = bare
      ? Number(style.lineHeight) * result.size
      : length(style.lineHeight, result.size);
    if (h !== null)
      result.lineHeight = Math.max(
        result.size * 0.8,
        Math.min(result.size * 4, h),
      );
  } else
    result.lineHeight = (defaults.lineHeight / defaults.size) * result.size;
  const spacing = length(style.letterSpacing, result.size);
  if (spacing !== null) result.spacing = Math.max(-2, Math.min(30, spacing));
  if (["left", "center", "right", "start", "end"].includes(style.textAlign))
    result.align = style.textAlign as CanvasTextAlign;
  if (style.textDecorationLine) result.decoration = style.textDecorationLine;
  if (style.textDecorationColor)
    result.decorationColor = style.textDecorationColor;
  if (style.opacity !== "")
    result.opacity = Math.max(0, Math.min(1, Number(style.opacity)));
  if (style.textTransform) result.transform = style.textTransform;
  if (style.textShadow && style.textShadow !== "none") {
    result.shadows = [];
    for (const shadow of style.textShadow.split(/,(?![^()]*\))/).slice(0, 1)) {
      const color =
        shadow.match(/rgba?\([^)]*\)|#[\da-f]+|\b[a-z]+\b(?![-\w])/i)?.[0] ||
        result.color ||
        "#000000";
      const numbers =
        shadow.match(/-?[\d.]+px/g)?.map((n) => parseFloat(n)) || [];
      if (numbers.length >= 2)
        result.shadows.push({
          x: Math.max(-50, Math.min(50, numbers[0]!)),
          y: Math.max(-50, Math.min(50, numbers[1]!)),
          blur: Math.max(0, Math.min(40, numbers[2] || 0)),
          color,
        });
    }
  }
  return result;
}
export function textFont(style: TextStyle) {
  return `${style.italic ? "italic " : ""}${style.weight} ${style.size}px ${style.family}`;
}
export function textCSSWarnings(css: string) {
  const declarations = document.createElement("span").style;
  declarations.cssText = css;
  return [...declarations].filter((key) => !supportedTextCSS.includes(key));
}
