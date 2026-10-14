import {
  type Asset,
  type Project,
  type Message,
  type LayoutNode,
  type StylePlugin,
  usedAssetIds,
} from "./model.js";
import { PluginRegistry, interpolate } from "./plugins.js";
import { shellCoverage } from "./shell-mask.js";
import {
  buildTimeline,
  easeOut,
  easeSmooth,
  messageAnimationMs,
  messageReadDelayMs,
  type Timeline,
} from "./timeline.js";

import { resolvePhoneUI, type PhoneUI } from "./phone-ui.js";
import { parseTextCSS, textFont, type TextStyle } from "./text-css.js";
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
interface Theme {
  face: string;
  bar: string;
  text: string;
  muted: string;
  incoming: string;
  outgoing: string;
  line: string;
  accent: string;
}
const light: Theme = {
  face: "#ecf1ed",
  bar: "#fafbf9",
  text: "#24352f",
  muted: "#7b8a82",
  incoming: "#ffffff",
  outgoing: "#bee29d",
  line: "#dce4df",
  accent: "#27775d",
};
const dark: Theme = {
  face: "#19231f",
  bar: "#26342d",
  text: "#f0f5f1",
  muted: "#9aaea1",
  incoming: "#34443b",
  outgoing: "#548854",
  line: "#46594d",
  accent: "#a6d4b8",
};
interface NodeBox {
  node: LayoutNode;
  x: number;
  y: number;
  width: number;
  height: number;
  lines?: string[];
  baselines?: number[];
  textStyle?: TextStyle;
  children?: NodeBox[];
}
interface Block {
  message: Message;
  plugin: StylePlugin;
  y: number;
  height: number;
  width: number;
  nodes: NodeBox[];
  bodyHeight: number;
  nameHeight: number;
  own: boolean;
}
interface Geometry {
  frameW: number;
  frameH: number;
  nativeFrameH: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  shell: Asset | null;
}
export interface HitBox {
  messageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
) {
  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    Math.max(1, w),
    Math.max(1, h),
    Math.min(r, w / 2, h / 2),
  );
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}
export class ChatRenderer {
  readonly registry: PluginRegistry;
  readonly timeline: Timeline;
  private assetMap: Map<string, Asset>;
  private images = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<void>>();
  private essential = new Set<string>();
  private measure = document.createElement("canvas").getContext("2d")!;
  private blocks: Block[] = [];
  private geometry: Geometry;
  private theme: Theme;
  private ui: PhoneUI;
  private nativeScreen = { y: 0, height: 0 };
  private embeddedFont = "";
  private embeddedStatusFont = "";
  private contentHeight = 0;
  private screenCanvas = document.createElement("canvas");
  private layerCanvas = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private shellMask: HTMLCanvasElement | null = null;
  hits: HitBox[] = [];
  constructor(
    readonly project: Project,
    assets: Asset[],
    private url: (id: string) => string = (id) => `/api/assets/file/${id}`,
  ) {
    this.assetMap = new Map(assets.map((a) => [a.id, a]));
    this.registry = new PluginRegistry(project.plugins);
    this.timeline = buildTimeline(project);
    this.ui = resolvePhoneUI(project.appearance.ui);
    const baseTheme = project.appearance.theme === "dark" ? dark : light;
    this.theme = {
      ...baseTheme,
      face: this.ui.background || baseTheme.face,
      text: this.ui.textColor || baseTheme.text,
      incoming: this.ui.incomingColor || baseTheme.incoming,
      outgoing: this.ui.outgoingColor || baseTheme.outgoing,
      muted: this.ui.mutedColor || baseTheme.muted,
      accent: this.ui.accentColor || baseTheme.accent,
      line: this.ui.lineColor || baseTheme.line,
    };
    const shell = this.assetMap.get(project.appearance.shellId || "") || null;
    const area = shell?.screen;
    if (shell && area && project.appearance.showShell) {
      const scale = 375 / area.width;
      this.geometry = {
        frameW: shell.width! * scale,
        frameH: shell.height! * scale,
        nativeFrameH: shell.height! * scale,
        screenX: area.x * scale,
        screenY: area.y * scale,
        screenW: 375,
        screenH: area.height * scale,
        shell,
      };
    } else if (project.appearance.showShell)
      this.geometry = {
        frameW: 375 + this.ui.shellPaddingX * 2,
        frameH: 812 + this.ui.shellPaddingTop + this.ui.shellPaddingBottom,
        nativeFrameH:
          812 + this.ui.shellPaddingTop + this.ui.shellPaddingBottom,
        screenX: this.ui.shellPaddingX,
        screenY: this.ui.shellPaddingTop,
        screenW: 375,
        screenH: 812,
        shell: null,
      };
    else
      this.geometry = {
        frameW: 375,
        frameH: 812,
        nativeFrameH: 812,
        screenX: 0,
        screenY: 0,
        screenW: 375,
        screenH: 812,
        shell: null,
      };
    const g = this.geometry;
    this.nativeScreen = { y: g.screenY, height: g.screenH };
    const fullHeight = this.ui.frameRatio
      ? g.frameW / this.ui.frameRatio
      : g.frameH;
    const fullScreen = Math.max(
      20,
      fullHeight - g.screenY - (g.frameH - g.screenY - g.screenH),
    );
    g.frameH = Math.max(
      80,
      fullHeight -
        fullScreen * (1 - (project.appearance.screenHeightRatio ?? 1)),
    );
    if (g.shell) {
      g.screenY = this.mapShellY(this.nativeScreen.y, g.frameH);
      g.screenH =
        this.mapShellY(
          this.nativeScreen.y + this.nativeScreen.height,
          g.frameH,
        ) - g.screenY;
    } else
      g.screenH = Math.max(
        20,
        g.frameH -
          g.screenY -
          (g.nativeFrameH - this.nativeScreen.y - this.nativeScreen.height),
      );
  }
  async prepare() {
    for (const [key, id] of [
      ["embeddedFont", this.ui.fontAssetId],
      ["embeddedStatusFont", this.ui.statusFontAssetId],
    ] as const) {
      if (!id) continue;
      const family = "chat-" + id;
      this[key] = family;
      if (
        !document.fonts.check(`12px "${family}"`) ||
        ![...document.fonts].some((f) => f.family === family)
      ) {
        const face = new FontFace(family, `url("${this.url(id)}")`);
        try {
          await face.load();
          document.fonts.add(face);
        } catch {
          throw new Error("字体未能读取，请更换字体文件");
        }
      }
    }
    await document.fonts.ready;
    const ids = usedAssetIds(this.project);
    if (this.geometry.shell?.maskId) ids.add(this.geometry.shell.maskId);
    for (const m of this.project.messages)
      for (const f of this.registry.get(m.kind).fields)
        if (f.type === "asset" && typeof m.data[f.key] === "string")
          ids.add(m.data[f.key] as string);
    for (const id of ids)
      if (!this.assetMap.has(id)) throw new Error(`素材未找到：${id}`);
    [
      this.geometry.shell?.id,
      this.geometry.shell?.maskId,
      this.project.appearance.wallpaperId,
      ...Object.entries(this.ui)
        .filter(([k]) => k.endsWith("AssetId"))
        .map(([, v]) => v as string | null),
      ...this.project.speakers.map((s) => s.avatarId),
    ].forEach((id) => {
      if (id) this.essential.add(id);
    });
    await Promise.all([...this.essential].map((id) => this.loadImage(id)));
    const skin = this.images.get(this.geometry.shell?.id ?? ""),
      mask = this.images.get(this.geometry.shell?.maskId ?? "");
    if (skin && mask)
      this.shellMask = shellCoverage(
        skin,
        mask,
        `${this.geometry.shell!.id}:${this.geometry.shell!.maskId}`,
      );
    this.buildBlocks();
    return this;
  }
  private async loadImage(id: string) {
    if (this.images.has(id)) {
      const image = this.images.get(id)!;
      this.images.delete(id);
      this.images.set(id, image);
      return;
    }
    if (this.loading.has(id)) return this.loading.get(id)!;
    const promise = (async () => {
      const asset = this.assetMap.get(id);
      if (!asset || asset.kind === "sound" || asset.kind === "font") return;
      const target =
        asset.kind === "avatar"
          ? 320
          : asset.kind === "wallpaper"
            ? 2400
            : ["image", "sticker"].includes(asset.kind)
              ? Math.min(2400, Math.max(768, this.project.output.width * 1.2))
              : null;
      const img = new Image();
      img.src = this.url(id) + (target ? `?size=${Math.ceil(target)}` : "");
      try {
        await img.decode();
      } catch {
        throw new Error(`图片未能读取：${asset.name}`);
      }
      this.images.set(id, img);
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, promise);
    return promise;
  }
  private blockImages(block: Block) {
    return this.registry
      .get(block.message.kind)
      .fields.filter((f) => f.type === "asset")
      .flatMap((f) => {
        const id = block.message.data[f.key];
        return typeof id === "string" && this.assetMap.get(id)?.kind !== "sound"
          ? [id]
          : [];
      });
  }
  private async loadBlocks(blocks: Block[]) {
    const needed = new Set(blocks.flatMap((b) => this.blockImages(b)));
    await Promise.all([...needed].map((id) => this.loadImage(id)));
    let count = [...this.images.keys()].filter(
      (id) => !this.essential.has(id),
    ).length;
    for (const id of this.images.keys())
      if (count > 24 && !needed.has(id) && !this.essential.has(id)) {
        this.images.delete(id);
        count--;
      }
  }
  async ensureFrame(atMs: number) {
    const h = this.chatBox().height;
    const visible = (time: number) => {
      const scroll = this.scroll(time, h);
      return this.blocks.filter(
        (b, i) =>
          this.timeline.events[i]!.atMs <= time &&
          b.y + b.height >= scroll &&
          b.y <= scroll + h,
      );
    };
    await this.loadBlocks([
      ...new Set([...visible(atMs), ...visible(atMs + 500)]),
    ]);
  }
  async ensureLongPage(offset = 0, height = this.longDimensions().height) {
    const framed =
      this.project.output.longShell !== false &&
      this.project.appearance.showShell;
    const scale =
      this.project.output.width / (framed ? this.geometry.frameW + 36 : 375);
    const base = (framed ? 18 + this.geometry.screenY : 0) + this.chatBox().y;
    const top = offset / scale - base,
      bottom = (offset + height) / scale - base;
    await this.loadBlocks(
      this.blocks.filter((b) => b.y + b.height >= top && b.y <= bottom),
    );
  }
  cacheInfo() {
    return {
      images: this.images.size,
      bodyImages: [...this.images.keys()].filter(
        (id) => !this.essential.has(id),
      ).length,
    };
  }
  private font(size: number, bold = false) {
    return `${bold ? this.ui.boldWeight : this.ui.fontWeight} ${size}px ${this.embeddedFont ? '"' + this.embeddedFont + '", ' : ""}${this.ui.fontFamily || FONT}`;
  }
  private wrap(
    text: string,
    width: number,
    size: number,
    bold = false,
    style?: TextStyle,
  ) {
    const ctx = this.measure;
    ctx.font = style ? textFont(style) : this.font(size, bold);
    ctx.letterSpacing = (style?.spacing || 0) + "px";
    const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
    const result: string[] = [];
    for (const paragraph of text.split("\n")) {
      const tokens: string[] = [];
      let ascii = "";
      for (const { segment } of segmenter.segment(paragraph)) {
        if (/^[!-~]+$/.test(segment)) {
          ascii += segment;
          continue;
        }
        if (ascii) {
          tokens.push(ascii);
          ascii = "";
        }
        if (/^[，。！？、：；）》」』】〕…]$/.test(segment) && tokens.length)
          tokens[tokens.length - 1] += segment;
        else tokens.push(segment);
      }
      if (ascii) tokens.push(ascii);
      let line = "";
      for (const token of tokens) {
        if (ctx.measureText(token).width <= width) {
          if (line && ctx.measureText(line + token).width > width) {
            result.push(line);
            line = "";
          }
          line += token;
        } else {
          for (const { segment } of segmenter.segment(token)) {
            if (line && ctx.measureText(line + segment).width > width) {
              result.push(line);
              line = "";
            }
            line += segment;
          }
        }
      }
      result.push(line);
    }
    return result;
  }
  private nodeBox(
    node: LayoutNode,
    data: Message["data"],
    width: number,
  ): NodeBox {
    const limit = Math.min(width, node.width ?? width),
      gap = node.gap ?? 5;
    if (node.type === "text") {
      let text = interpolate(node.text ?? "", data);
      if (!text) return { node, x: 0, y: 0, width: 0, height: 0, lines: [] };
      const baseSize = node.size ?? this.project.appearance.fontSize;
      const defaults: TextStyle = {
        size: baseSize,
        weight: node.bold ? this.ui.boldWeight : this.ui.fontWeight,
        family:
          (this.embeddedFont ? '"' + this.embeddedFont + '", ' : "") +
          (this.ui.fontFamily || FONT),
        italic: false,
        lineHeight: baseSize * this.ui.lineHeight,
        spacing: 0,
        align:
          node.align === "center"
            ? "center"
            : node.align === "end"
              ? "right"
              : "left",
        decoration: "",
        opacity: 1,
        transform: "",
        shadows: [],
      };
      const textStyle = parseTextCSS(
        this.ui.messageCSS + ";" + interpolate(node.css ?? "", data),
        defaults,
      );
      if (textStyle.transform === "uppercase") text = text.toLocaleUpperCase();
      else if (textStyle.transform === "lowercase")
        text = text.toLocaleLowerCase();
      else if (textStyle.transform === "capitalize")
        text = text.replace(/(^|\s)\S/g, (v) => v.toLocaleUpperCase());
      const size = textStyle.size,
        lines = this.wrap(text, limit, size, node.bold, textStyle),
        lineHeight = textStyle.lineHeight;
      this.measure.font = textFont(textStyle);
      this.measure.letterSpacing = textStyle.spacing + "px";
      const metrics = lines.map((line) => this.measure.measureText(line));
      return {
        node,
        x: 0,
        y: 0,
        width: node.width
          ? limit
          : Math.min(limit, Math.max(...metrics.map((m) => m.width), 1)),
        height: lines.length * lineHeight,
        lines,
        textStyle,
        baselines: metrics.map(
          (m, i) =>
            i * lineHeight +
            lineHeight / 2 +
            (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
        ),
      };
    }
    if (node.type === "image") {
      const image = this.assetMap.get(String(data[node.asset ?? ""] ?? ""));
      if (!image?.width || !image.height)
        return { node, x: 0, y: 0, width: 0, height: 0 };
      const h =
        node.fit === "cover" && node.height
          ? node.height
          : Math.min(node.height ?? 200, (limit * image.height) / image.width);
      return {
        node,
        x: 0,
        y: 0,
        width:
          node.fit === "cover"
            ? limit
            : Math.min(limit, (h * image.width) / image.height),
        height: h,
      };
    }
    if (node.type === "space")
      return { node, x: 0, y: 0, width: 0, height: node.height ?? 8 };
    if (node.type === "line")
      return { node, x: 0, y: 0, width: limit, height: 12 };
    if (node.type === "wave")
      return {
        node,
        x: 0,
        y: 0,
        width: node.width ?? 90,
        height: node.height ?? 22,
      };
    const nodes = node.children ?? [],
      horizontal = node.type === "row";
    const fixed = nodes.reduce((sum, n) => sum + (n.width ?? 0), 0);
    const flexible = nodes.filter((n) => !n.width).length || 1;
    const share = Math.max(
      20,
      (limit - gap * Math.max(0, nodes.length - 1) - fixed) / flexible,
    );
    const children = nodes.map((n) =>
      this.nodeBox(n, data, horizontal ? (n.width ?? share) : limit),
    );
    let cursor = 0;
    for (const child of children) {
      if (!child.height) continue;
      if (horizontal) child.x = cursor;
      else child.y = cursor;
      cursor += (horizontal ? child.width : child.height) + gap;
    }
    if (horizontal) {
      const h = Math.max(0, ...children.map((c) => c.height));
      children.forEach((c) => {
        c.y =
          (node.align ?? "center") === "center"
            ? (h - c.height) / 2
            : node.align === "end"
              ? h - c.height
              : 0;
      });
    } else
      children.forEach((c) => {
        c.x =
          node.align === "center"
            ? (limit - c.width) / 2
            : node.align === "end"
              ? limit - c.width
              : 0;
      });
    return {
      node,
      x: 0,
      y: 0,
      width: horizontal
        ? Math.max(0, cursor - gap)
        : node.align
          ? limit
          : Math.max(0, ...children.map((c) => c.width)),
      height: horizontal
        ? Math.max(0, ...children.map((c) => c.height))
        : Math.max(0, cursor - gap),
      children,
    };
  }
  private avatarVisible(own: boolean) {
    return (
      this.ui.avatarVisible &&
      (own ? this.ui.outgoingAvatarVisible : this.ui.incomingAvatarVisible)
    );
  }
  private buildBlocks() {
    let y = this.ui.chatTopPadding;
    this.blocks = this.project.messages.map((message) => {
      const plugin = this.registry.get(message.kind),
        own = message.speakerId === this.project.meId;
      const separator = plugin.layout.variant === "separator";
      const available =
        this.chatBox().width -
        this.ui.messageMargin * 2 -
        (this.avatarVisible(own) ? this.ui.avatarSize + this.ui.avatarGap : 0);
      const width = Math.max(
        20,
        Math.min(
          available,
          this.ui.bubbleMaxWidth,
          plugin.layout.width ?? this.ui.bubbleMaxWidth,
        ),
      );
      const nodes = plugin.layout.nodes.map((node) =>
        this.nodeBox(
          node,
          message.data,
          Math.max(
            10,
            width -
              (plugin.layout.variant === "media" || separator
                ? 0
                : this.ui.bubblePaddingX * 2),
          ),
        ),
      );
      let bodyHeight = 0;
      for (const node of nodes) {
        node.y = bodyHeight;
        if (node.height) bodyHeight += node.height + 5;
      }
      bodyHeight =
        Math.max(0, bodyHeight - 5) +
        (plugin.layout.variant === "media" || separator
          ? 0
          : this.ui.bubblePaddingY * 2);
      const nameHeight =
        !separator &&
        this.project.appearance.showNames &&
        (own ? this.ui.outgoingNameVisible : this.ui.incomingNameVisible)
          ? this.ui.nameHeight
          : 0;
      const bodyWidth =
        plugin.layout.width && plugin.layout.variant !== "media"
          ? width
          : Math.min(
              width,
              Math.max(34, ...nodes.map((n) => n.width)) +
                (separator
                  ? 18
                  : plugin.layout.variant === "media"
                    ? 0
                    : this.ui.bubblePaddingX * 2),
            );
      const height =
        Math.max(
          separator ? 28 : this.avatarVisible(own) ? this.ui.avatarSize : 0,
          bodyHeight + nameHeight,
        ) + this.ui.messageGap;
      const block = {
        message,
        plugin,
        y,
        height,
        width: bodyWidth,
        nodes,
        bodyHeight,
        nameHeight,
        own,
      };
      y += height;
      return block;
    });
    this.contentHeight = y + 12;
  }
  dimensions(width = this.project.output.width) {
    const g = this.geometry,
      t = this.project.appearance.transform,
      angle = (t.rotation * Math.PI) / 180;
    const baseW =
      Math.abs(g.frameW * t.scaleX * Math.cos(angle)) +
      Math.abs(g.frameH * t.scaleY * Math.sin(angle)) +
      36 +
      Math.abs(t.x) * 2;
    const baseH =
      Math.abs(g.frameH * t.scaleY * Math.cos(angle)) +
      Math.abs(g.frameW * t.scaleX * Math.sin(angle)) +
      36 +
      Math.abs(t.y) * 2;
    const W = width - (width % 2),
      H = Math.max(2, Math.ceil((baseH * W) / baseW / 2) * 2);
    return { width: W, height: H, scale: W / baseW, baseW, baseH };
  }
  private color(value: string | undefined, own: boolean) {
    if (!value)
      return (
        (own ? this.ui.outgoingText : this.ui.incomingText) || this.theme.text
      );
    return (
      (
        {
          $text:
            (own ? this.ui.outgoingText : this.ui.incomingText) ||
            this.theme.text,
          $muted: this.theme.muted,
          $accent: this.theme.accent,
          $bubble: own ? this.theme.outgoing : this.theme.incoming,
        } as Record<string, string>
      )[value] ?? value
    );
  }
  private image(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    fit: "cover" | "contain" = "cover",
  ) {
    const img = image as HTMLImageElement,
      ratio =
        fit === "contain"
          ? Math.min(w / img.width, h / img.height)
          : Math.max(w / img.width, h / img.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(
      image,
      x + (w - img.width * ratio) / 2,
      y + (h - img.height * ratio) / 2,
      img.width * ratio,
      img.height * ratio,
    );
    ctx.restore();
  }
  private drawNode(
    ctx: CanvasRenderingContext2D,
    box: NodeBox,
    x: number,
    y: number,
    block: Block,
  ) {
    const node = box.node;
    x += box.x;
    y += box.y;
    if (!box.height) return;
    if (node.type === "text") {
      const style = box.textStyle!,
        size = style.size;
      ctx.save();
      ctx.font = textFont(style);
      ctx.letterSpacing = style.spacing + "px";
      ctx.fillStyle =
        style.color ||
        this.color(
          node.color ? interpolate(node.color, block.message.data) : undefined,
          block.own,
        );
      ctx.textAlign = style.align;
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha *= style.opacity;
      const anchor =
        x +
        (style.align === "center"
          ? box.width / 2
          : ["right", "end"].includes(style.align)
            ? box.width
            : 0);
      box.lines?.forEach((line, i) => {
        const metrics = ctx.measureText(line),
          centered = block.plugin.layout.variant === "separator";
        const inkX = centered
          ? x +
            (box.width -
              metrics.actualBoundingBoxRight +
              metrics.actualBoundingBoxLeft) /
              2
          : anchor;
        const baseline = y + (box.baselines?.[i] ?? (i + 1) * style.lineHeight);
        if (centered) ctx.textAlign = "left";
        const scale = Math.abs(ctx.getTransform().a) || 1;
        const shadow = style.shadows[0];
        if (shadow) {
          ctx.shadowColor = shadow.color;
          ctx.shadowBlur = shadow.blur * scale;
          ctx.shadowOffsetX = shadow.x * scale;
          ctx.shadowOffsetY = shadow.y * scale;
        }
        ctx.fillText(line, inkX, baseline);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        const left = centered
          ? inkX
          : style.align === "center"
            ? anchor - metrics.width / 2
            : ["right", "end"].includes(style.align)
              ? anchor - metrics.width
              : anchor;
        ctx.strokeStyle = style.decorationColor || ctx.fillStyle;
        ctx.lineWidth = Math.max(0.7, size / 20);
        for (const [name, dy] of [
          ["underline", Math.max(2, size * 0.1)],
          ["line-through", -size * 0.3],
          ["overline", -metrics.actualBoundingBoxAscent],
        ] as const)
          if (style.decoration.includes(name)) {
            ctx.beginPath();
            ctx.moveTo(left, baseline + dy);
            ctx.lineTo(left + metrics.width, baseline + dy);
            ctx.stroke();
          }
        ctx.textAlign = style.align;
      });
      ctx.restore();
    } else if (node.type === "image") {
      const image = this.images.get(
        String(block.message.data[node.asset ?? ""] ?? ""),
      );
      if (image) {
        ctx.save();
        rect(ctx, x, y, box.width, box.height, 7);
        ctx.clip();
        this.image(ctx, image, x, y, box.width, box.height, node.fit);
        ctx.restore();
      }
    } else if (node.type === "line") {
      ctx.strokeStyle = this.theme.line;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x + box.width, y + 6);
      ctx.stroke();
    } else if (node.type === "wave") {
      ctx.strokeStyle = this.theme.text;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      for (let i = 0; i < 18; i++) {
        const h = 4 + ((i * 7 + block.message.id.charCodeAt(0)) % 13);
        ctx.beginPath();
        ctx.moveTo(x + i * 5, y + (box.height - h) / 2);
        ctx.lineTo(x + i * 5, y + (box.height + h) / 2);
        ctx.stroke();
      }
    } else
      box.children?.forEach((child) => this.drawNode(ctx, child, x, y, block));
  }
  private avatar(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
  ) {
    const speaker = this.project.speakers.find((s) => s.id === id)!;
    const image = this.images.get(speaker.avatarId ?? "");
    ctx.save();
    const size = this.ui.avatarSize;
    rect(
      ctx,
      x,
      y,
      size,
      size,
      Math.min(size / 2, this.ui.avatarRadius),
      speaker.color,
    );
    ctx.clip();
    if (image) this.image(ctx, image, x, y, size, size);
    else {
      ctx.font = this.font(14, true);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        [
          ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
            speaker.name,
          ),
        ][0]?.segment ?? "我",
        x + size / 2,
        y + size / 2,
      );
    }
    ctx.restore();
    ctx.textAlign = "left";
  }
  private bars(height = this.geometry.screenH) {
    const u = this.ui,
      status = u.statusVisible ? u.statusHeight : 0,
      header = u.headerVisible ? u.headerHeight : 0,
      footer = u.footerVisible ? u.footerHeight : 0,
      navigation = u.navigationMode !== "none" ? u.navigationHeight : 0,
      factor = Math.min(
        1,
        (height * 0.78) / Math.max(1, status + header + footer + navigation),
      );
    return {
      status: status * factor,
      header: header * factor,
      footer: footer * factor,
      navigation: navigation * factor,
      bottom: (footer + navigation) * factor,
      top: (status + header) * factor,
    };
  }
  private icon(
    ctx: CanvasRenderingContext2D,
    name: string,
    assetId: string | null,
    x: number,
    y: number,
    size: number,
    style = "outline",
    stroke = 1.8,
  ) {
    const asset = this.images.get(assetId ?? "");
    if (asset) {
      this.image(ctx, asset, x - size / 2, y - size / 2, size, size, "contain");
      return;
    }
    if (name === "none") return;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const paths: Record<string, string> = {
      signal: "M3 21V18 M8 21V13 M13 21V8 M18 21V3",
      wifi: "M2 7Q12 -1 22 7 M5 11Q12 5 19 11 M8 15Q12 12 16 15 M12 19h.1",
      clock: "M22 12A10 10 0 1 0 2 12A10 10 0 1 0 22 12 M12 6V12L16 15",
      location: "M3 9L21 3L15 21L11 13Z",
      back: "M16 3 L7 12 L16 21",
      menu: "M3 5H21 M3 12H21 M3 19H21",
      plus: "M12 3V21 M3 12H21",
      camera:
        "M3 6H7L9 3H15L17 6H21V21H3Z M16 13A4 4 0 1 0 8 13A4 4 0 1 0 16 13",
      image:
        "M3 3H21V21H3Z M3 18L9 11L15 18L18 14L21 17 M17 7A2 2 0 1 0 13 7A2 2 0 1 0 17 7",
      phone: "M5 3L9 3L10 8L7 10Q10 16 15 17L17 14L22 16L21 21Q5 22 3 5Z",
      mic: "M9 5Q9 1 15 5V12Q15 17 9 12Z M6 11Q6 21 18 11 M12 18V22 M8 22H16",
      smile:
        "M22 12A10 10 0 1 0 2 12A10 10 0 1 0 22 12 M8 9V10 M16 9V10 M7 15Q12 20 17 15",
      more: "M5 12h.1 M12 12h.1 M19 12h.1",
      "more-vertical": "M12 5h.1 M12 12h.1 M12 19h.1",
      voice: "M4 10Q8 12 4 14 M9 7Q16 12 9 17 M15 3Q25 12 15 21",
      video: "M2 5H15V19H2Z M15 9L22 5V19L15 15",
      send: "M2 3L22 12L2 21L6 12Z M6 12H22",
      search: "M17 10A7 7 0 1 0 3 10A7 7 0 1 0 17 10 M15 15L22 22",
    };
    const path = new Path2D(paths[name] ?? paths.more!);
    if (style === "filled") ctx.fill(path);
    ctx.stroke(path);
    ctx.restore();
  }
  private iconOptions(
    role: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const u = this.ui as unknown as Record<
      string,
      string | number | null | boolean
    >;
    const number = (key: string, fallback: number) =>
      typeof u[key] === "number" && Number(u[key]) >= 0
        ? Number(u[key])
        : fallback;
    return {
      x: number(role + "X", x),
      y: number(role + "Y", y),
      size: number(role + "Size", size),
      assetId: u[role + "AssetId"] as string | null,
      color: String(u[role + "Color"] || color),
      style: String(u[role + "Style"] || "outline"),
      stroke: number(role + "Stroke", 1.8),
      opacity: number(role + "Opacity", 1),
    };
  }
  private positionedIcon(
    ctx: CanvasRenderingContext2D,
    role: string,
    name: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    const p = this.iconOptions(role, x, y, size, color);
    if (p.size <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p.opacity;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    this.icon(ctx, name, p.assetId, p.x, p.y, p.size, p.style, p.stroke);
    ctx.restore();
  }
  private barBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    radius: number,
    assetId: string | null,
  ) {
    ctx.save();
    rect(ctx, 0, 0, w, h, radius, color);
    ctx.clip();
    const image = this.images.get(assetId ?? "");
    if (image) this.image(ctx, image, 0, 0, w, h);
    ctx.restore();
  }
  private header(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const u = this.ui,
      b = this.bars(height),
      base =
        this.project.appearance.theme === "light" ? "#fff0fa" : this.theme.bar;
    if (b.status) {
      ctx.save();
      ctx.translate(u.statusX, u.statusY);
      const w = u.statusWidth > 0 ? u.statusWidth : width;
      this.barBackground(
        ctx,
        w,
        b.status,
        u.statusBackground || base,
        u.statusRadius,
        u.statusBackgroundAssetId,
      );
      const cy = b.status / 2,
        color = u.statusColor || this.theme.text,
        size = Math.min(u.statusFontSize, Math.max(6, b.status - 4));
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.font = `${u.statusFontWeight} ${size}px ${this.embeddedStatusFont ? '"' + this.embeddedStatusFont + '", ' : ""}${u.statusFontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      let x = 18;
      if (this.project.appearance.showStatusTime) {
        ctx.fillText(
          this.project.appearance.statusTime,
          u.statusTimeX,
          u.statusTimeY < 0 ? cy : u.statusTimeY,
          80,
        );
        x += 55;
      }
      for (const [role, name, visible] of [
        ["statusSignal", u.statusSignalSymbol, u.signalVisible],
        ["statusWifi", u.statusWifiSymbol, u.wifiVisible],
        ["statusClock", u.statusClockSymbol, u.clockVisible],
        ["statusLocation", u.statusLocationSymbol, u.locationVisible],
      ] as const) {
        if (visible) {
          this.positionedIcon(ctx, role, name, x + 8, cy, 17, color);
          x += 23;
        }
      }
      if (u.batteryVisible) {
        const p = this.iconOptions("statusBattery", w - 35, cy, 28, color);
        ctx.save();
        ctx.globalAlpha *= p.size > 0 ? p.opacity : 0;
        if (p.assetId) this.icon(ctx, "none", p.assetId, p.x, p.y, p.size);
        else if (p.size > 0) {
          const k = p.size / 28;
          ctx.save();
          ctx.translate(p.x - p.size / 2, p.y - 6.5 * k);
          ctx.scale(k, k);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.stroke;
          rect(ctx, 0, 0, 28, 13, 1);
          if (p.style === "filled") {
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          ctx.stroke();
          ctx.fillStyle =
            u.batteryColor ||
            (this.project.appearance.battery <= 20 ? "#db6153" : "#a8e465");
          ctx.fillRect(2, 2, (24 * this.project.appearance.battery) / 100, 9);
          ctx.fillStyle = p.color;
          ctx.fillRect(29, 3, 2, 7);
          ctx.restore();
        }
        ctx.fillStyle = p.color;
        ctx.textAlign = "right";
        if (u.batteryPercentVisible)
          ctx.fillText(
            this.project.appearance.battery + "%",
            p.x - p.size / 2 - 4,
            p.y,
          );
        if (this.project.appearance.charging) {
          ctx.textAlign = "center";
          ctx.fillText("ϟ", p.x, p.y);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    if (b.header) {
      ctx.save();
      ctx.translate(u.headerX, u.headerY < 0 ? b.status : u.headerY);
      const w = u.headerWidth > 0 ? u.headerWidth : width;
      this.barBackground(
        ctx,
        w,
        b.header,
        u.headerBackground || base,
        u.headerRadius,
        u.headerBackgroundAssetId,
      );
      const cy = b.header / 2,
        size = Math.min(u.iconSize, Math.max(6, b.header - 6)),
        color = u.titleColor || this.theme.text;
      for (const [role, name, x] of [
        ["headerLeft", u.headerLeft, 22],
        ["headerRight1", u.headerRight1, w - 60],
        ["headerRight2", u.headerRight2, w - 23],
      ] as const)
        this.positionedIcon(ctx, role, name, x, cy, size, color);
      ctx.fillStyle = color;
      ctx.font = this.font(
        Math.min(u.titleSize, Math.max(6, b.header - 4)),
        true,
      );
      ctx.textBaseline = "middle";
      ctx.textAlign = u.titleAlign;
      const raw =
        this.project.appearance.mode === "group"
          ? this.project.appearance.title +
            " (" +
            (this.project.appearance.groupCount ??
              this.project.speakers.length) +
            ")"
          : this.project.appearance.title;
      const max = Math.max(20, w - 148),
        parts = [
          ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(raw),
        ].map((s) => s.segment);
      let text = raw;
      while (ctx.measureText(text).width > max && parts.length) {
        parts.pop();
        text = parts.join("") + "…";
      }
      const x =
        u.titleAlign === "center"
          ? w / 2
          : u.titleAlign === "left"
            ? 55
            : w - 95;
      ctx.fillText(text, x + u.titleOffsetX, cy + u.titleOffsetY, max);
      ctx.strokeStyle = this.theme.line;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, b.header - 0.5);
      ctx.lineTo(w, b.header - 0.5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = "left";
  }
  private footer(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const u = this.ui,
      h = this.bars(height).footer;
    if (!h) return;
    ctx.save();
    ctx.translate(
      u.footerX,
      u.footerY < 0 ? height - this.bars(height).navigation - h : u.footerY,
    );
    width = u.footerWidth > 0 ? u.footerWidth : width;
    const cy = h / 2,
      size = Math.min(u.footerIconSize, Math.max(6, h - 6));
    this.barBackground(
      ctx,
      width,
      h,
      u.footerBackground || this.theme.bar,
      u.footerRadius,
      u.footerBackgroundAssetId,
    );
    const color = u.footerIconColor || this.theme.muted;
    let left = 8,
      right = width - 8;
    for (const n of [1, 2, 3] as const) {
      const key = ("footerLeft" + n) as keyof PhoneUI,
        asset = (key + "AssetId") as keyof PhoneUI;
      if (u[key] !== "none" || u[asset]) {
        this.positionedIcon(
          ctx,
          String(key),
          String(u[key]),
          left + size / 2,
          cy,
          size,
          color,
        );
        left += size + 9;
      }
    }
    for (const n of [2, 1] as const) {
      const key = ("footerRight" + n) as keyof PhoneUI,
        asset = (key + "AssetId") as keyof PhoneUI;
      if (u[key] !== "none" || u[asset]) {
        this.positionedIcon(
          ctx,
          String(key),
          String(u[key]),
          right - size / 2,
          cy,
          size,
          color,
        );
        right -= size + 9;
      }
    }
    if (u.inputVisible) {
      const ih = Math.max(1, u.inputHeight),
        iw = Math.max(1, u.inputWidth < 0 ? right - left - 6 : u.inputWidth),
        ix = u.inputX < 0 ? left : u.inputX,
        iy = u.inputY < 0 ? (h - ih) / 2 : u.inputY;
      rect(
        ctx,
        ix,
        iy,
        iw,
        ih,
        u.inputRadius,
        u.inputColor ||
          (this.project.appearance.theme === "dark" ? "#3b4c41" : "#edf1ee"),
      );
      ctx.font = this.font(12);
      ctx.fillStyle = u.inputTextColor || this.theme.muted;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(u.inputText, ix + 8, iy + ih / 2, Math.max(1, iw - 16));
    }
    ctx.restore();
  }
  private chatBox(height = this.geometry.screenH, all = false) {
    const b = this.bars(height),
      u = this.ui,
      y = u.chatY < 0 ? b.top : u.chatY;
    return {
      x: u.chatX,
      y,
      width: Math.max(10, u.chatWidth),
      height: all
        ? Math.max(this.contentHeight, height - y - b.bottom)
        : Math.max(1, u.chatHeight < 0 ? height - y - b.bottom : u.chatHeight),
    };
  }
  private scroll(atMs: number, chatHeight: number) {
    let previous = 0,
      value = 0;
    for (const event of this.timeline.events) {
      if (event.atMs > atMs) break;
      const block = this.blocks[event.index]!;
      const target = Math.max(0, block.y + block.height + 8 - chatHeight);
      value =
        previous +
        (target - previous) *
          easeSmooth(
            this.project.playback.scrollMs
              ? (atMs - event.atMs) / this.project.playback.scrollMs
              : 1,
          );
      previous = target;
    }
    return value;
  }
  private screen(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    atMs: number,
    all = false,
  ) {
    const outerWidth = width,
      chat = this.chatBox(height, all),
      chatTop = chat.y,
      chatHeight = chat.height;
    ctx.fillStyle = this.theme.face;
    ctx.fillRect(0, 0, width, height);
    const wallpaper = this.images.get(
      this.project.appearance.wallpaperId ?? "",
    );
    if (wallpaper)
      this.image(
        ctx,
        wallpaper,
        chat.x,
        chatTop,
        chat.width,
        chatHeight,
        this.project.appearance.wallpaperFit,
      );
    const scroll = all ? 0 : this.scroll(atMs, chatHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(chat.x, chatTop, chat.width, chatHeight);
    ctx.clip();
    ctx.translate(chat.x, 0);
    width = chat.width;
    this.hits = [];
    for (const [index, block] of this.blocks.entries()) {
      const event = this.timeline.events[index]!;
      if (!all && event.atMs > atMs) continue;
      const y = chatTop + block.y - scroll;
      if (y + block.height < chatTop || y > chatTop + chatHeight) continue;
      const variant = block.plugin.layout.variant,
        separator = variant === "separator";
      const margin = this.ui.messageMargin,
        offset =
          margin +
          (this.avatarVisible(block.own)
            ? this.ui.avatarSize + this.ui.avatarGap
            : 0);
      const avatarX = block.own ? width - margin - this.ui.avatarSize : margin;
      const x = separator
        ? (width - block.width) / 2
        : block.own
          ? width - offset - block.width
          : offset;
      const popMs = messageAnimationMs(this.project, block.message);
      const progress = all || !popMs ? 1 : easeOut((atMs - event.atMs) / popMs);
      const scale = 0.82 + 0.18 * progress;
      const anchorX = separator ? width / 2 : block.own ? x + block.width : x,
        anchorY =
          y +
          (separator
            ? block.bodyHeight / 2
            : block.bodyHeight + block.nameHeight);
      ctx.save();
      ctx.translate(anchorX, anchorY);
      ctx.scale(scale, scale);
      ctx.translate(-anchorX, -anchorY);
      if (!separator) {
        if (this.avatarVisible(block.own))
          this.avatar(ctx, block.message.speakerId, avatarX, y);
        if (block.nameHeight) {
          ctx.font = this.font(this.ui.nameSize);
          ctx.fillStyle =
            this.project.appearance.nameColor ||
            (wallpaper ? "#ffffff" : this.theme.muted);
          ctx.shadowColor = wallpaper ? "#00000055" : "transparent";
          ctx.shadowBlur = wallpaper ? 2 : 0;
          ctx.textBaseline = "top";
          ctx.textAlign = block.own ? "right" : "left";
          ctx.fillText(
            this.project.speakers.find((s) => s.id === block.message.speakerId)!
              .name,
            block.own ? x + block.width : x,
            y,
          );
          ctx.shadowBlur = 0;
        }
      }
      const bodyY = y + block.nameHeight;
      if (variant === "bubble" || variant === "card") {
        const background = block.plugin.layout.background
          ? this.color(
              interpolate(block.plugin.layout.background, block.message.data),
              block.own,
            )
          : block.own
            ? this.theme.outgoing
            : this.theme.incoming;
        rect(
          ctx,
          x,
          bodyY,
          block.width,
          block.bodyHeight,
          variant === "card" ? this.ui.cardRadius : this.ui.bubbleRadius,
          background,
        );
        if (variant === "bubble" && this.ui.bubbleTail) {
          ctx.fillStyle = background;
          ctx.beginPath();
          if (block.own) {
            ctx.moveTo(x + block.width - 6, bodyY + 4);
            ctx.lineTo(x + block.width + 5, bodyY + 4);
            ctx.lineTo(x + block.width - 1, bodyY + 13);
          } else {
            ctx.moveTo(x + 6, bodyY + 4);
            ctx.lineTo(x - 5, bodyY + 4);
            ctx.lineTo(x + 1, bodyY + 13);
          }
          ctx.fill();
        }
      }
      if (separator) {
        ctx.save();
        ctx.globalAlpha *= this.ui.separatorOpacity;
        rect(
          ctx,
          x - 4,
          bodyY - 3,
          block.width + 8,
          block.bodyHeight + 6,
          this.ui.separatorRadius,
          this.ui.separatorColor ||
            (this.project.appearance.theme === "dark" ? "#2e3d34" : "#f8faf8"),
        );
      }
      if (separator) ctx.restore();
      const paddingY =
        variant === "media" || separator ? 0 : this.ui.bubblePaddingY;
      block.nodes.forEach((node) =>
        this.drawNode(
          ctx,
          node,
          x +
            (separator
              ? (block.width - node.width) / 2
              : variant === "media"
                ? block.own
                  ? block.width - node.width
                  : 0
                : this.ui.bubblePaddingX),
          bodyY + paddingY,
          block,
        ),
      );
      if (
        this.project.appearance.showRead &&
        block.own &&
        block.message.read &&
        (all || atMs >= event.atMs + messageReadDelayMs(block.message)) &&
        !separator
      ) {
        ctx.font = this.font(this.ui.readSize);
        ctx.fillStyle = this.theme.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.textAlign = "right";
        ctx.fillText(this.ui.readText, x - 5, bodyY + block.bodyHeight);
      }
      ctx.restore();
      this.hits.push({
        messageId: block.message.id,
        x: x + chat.x,
        y,
        width: block.width,
        height: block.height,
      });
    }
    const typing = this.timeline.events.find(
      (e) => e.typingStartMs <= atMs && atMs < e.atMs,
    );
    if (typing && !all) {
      ctx.font = this.font(12);
      ctx.fillStyle = this.theme.muted;
      ctx.fillText("正在输入…", 55, chatTop + chatHeight - 18);
    }
    ctx.restore();
    this.header(ctx, outerWidth, height);
    this.footer(ctx, outerWidth, height);
    this.systemOverlay(ctx, outerWidth, height);
  }

  private systemOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const u = this.ui,
      nav = this.bars(height).navigation;
    ctx.save();
    if (nav > 0) {
      rect(
        ctx,
        0,
        height - nav,
        width,
        nav,
        0,
        u.navigationBackground || u.footerBackground || this.theme.bar,
      );
      const color = u.navigationColor || this.theme.text,
        cy = height - nav / 2;
      if (u.navigationMode === "gesture")
        rect(
          ctx,
          (width - u.navigationWidth) / 2,
          cy - u.navigationThickness / 2,
          u.navigationWidth,
          u.navigationThickness,
          u.navigationThickness / 2,
          color,
        );
      else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(width * 0.25 + 5, cy - 6);
        ctx.lineTo(width * 0.25 - 5, cy);
        ctx.lineTo(width * 0.25 + 5, cy + 6);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(width / 2, cy, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(width * 0.75 - 5, cy - 5, 10, 10);
      }
    }
    if (u.cameraType !== "none" && u.cameraWidth > 0 && u.cameraHeight > 0) {
      const x = u.cameraX < 0 ? width / 2 : u.cameraX,
        y = u.cameraY;
      ctx.globalAlpha *= u.cameraOpacity;
      ctx.fillStyle = u.cameraColor || "#151515";
      if (u.cameraType === "hole") {
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          u.cameraWidth / 2,
          u.cameraHeight / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else
        rect(
          ctx,
          x - u.cameraWidth / 2,
          y - u.cameraHeight / 2,
          u.cameraWidth,
          u.cameraHeight,
          u.cameraRadius,
          u.cameraColor || "#151515",
        );
    }
    ctx.restore();
  }
  render(
    canvas: HTMLCanvasElement,
    atMs: number,
    width = this.project.output.width,
  ) {
    const d = this.dimensions(width),
      g = this.geometry,
      t = this.project.appearance.transform;
    if (canvas.width !== d.width) canvas.width = d.width;
    if (canvas.height !== d.height) canvas.height = d.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.project.output.background === "solid") {
      ctx.fillStyle = this.project.output.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.save();
    ctx.scale(d.scale, d.scale);
    const fadeStart = this.timeline.durationMs - this.project.playback.fadeMs;
    if (
      this.project.playback.loop &&
      this.project.playback.fadeMs &&
      atMs > fadeStart
    )
      ctx.globalAlpha = Math.max(
        0,
        1 - (atMs - fadeStart) / this.project.playback.fadeMs,
      );
    ctx.translate(d.baseW / 2 + t.x, d.baseH / 2 + t.y);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scaleX, t.scaleY);
    ctx.translate(-g.frameW / 2, -g.frameH / 2);
    const screen = this.screenCanvas,
      sw = Math.round(g.screenW * d.scale),
      sh = Math.round(g.screenH * d.scale);
    if (screen.width !== sw) screen.width = sw;
    if (screen.height !== sh) screen.height = sh;
    const sc = screen.getContext("2d")!;
    sc.setTransform(d.scale, 0, 0, d.scale, 0, 0);
    sc.clearRect(0, 0, g.screenW, g.screenH);
    this.screen(sc, g.screenW, g.screenH, atMs);
    if (g.shell) {
      const layer = this.layerCanvas,
        lw = Math.ceil(g.frameW * d.scale),
        lh = Math.ceil(g.frameH * d.scale);
      if (layer.width !== lw) layer.width = lw;
      if (layer.height !== lh) layer.height = lh;
      const lc = layer.getContext("2d")!;
      lc.globalCompositeOperation = "source-over";
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, layer.width, layer.height);
      lc.setTransform(d.scale, 0, 0, d.scale, 0, 0);
      lc.fillStyle = this.theme.bar;
      lc.fillRect(0, 0, g.frameW, g.frameH);
      lc.drawImage(screen, g.screenX, g.screenY, g.screenW, g.screenH);
      const mask = this.shellMask ?? this.images.get(g.shell.maskId ?? "");
      if (mask) this.applyShellMask(lc, mask, g.frameW, g.frameH);
      ctx.drawImage(layer, 0, 0, g.frameW, g.frameH);
      const shell = this.images.get(g.shell.id);
      if (shell) this.stretch(ctx, shell, g.frameW, g.frameH);
    } else {
      if (this.project.appearance.showShell)
        rect(
          ctx,
          0,
          0,
          g.frameW,
          g.frameH,
          this.ui.shellRadius,
          this.project.appearance.shellColor,
        );
      ctx.save();
      rect(
        ctx,
        g.screenX,
        g.screenY,
        g.screenW,
        g.screenH,
        this.project.appearance.showShell ? this.ui.screenRadius : 0,
      );
      ctx.clip();
      ctx.drawImage(screen, g.screenX, g.screenY, g.screenW, g.screenH);
      ctx.restore();
    }
    ctx.restore();
    return d;
  }
  hitTest(x: number, y: number, width = 720) {
    const d = this.dimensions(width),
      g = this.geometry,
      t = this.project.appearance.transform,
      a = (t.rotation * Math.PI) / 180;
    const dx = x / d.scale - d.baseW / 2 - t.x,
      dy = y / d.scale - d.baseH / 2 - t.y;
    const sx =
      (Math.cos(a) * dx + Math.sin(a) * dy) / t.scaleX +
      g.frameW / 2 -
      g.screenX;
    const sy =
      (-Math.sin(a) * dx + Math.cos(a) * dy) / t.scaleY +
      g.frameH / 2 -
      g.screenY;
    return (
      this.hits.find(
        (b) =>
          sx >= b.x && sx <= b.x + b.width && sy >= b.y && sy <= b.y + b.height,
      )?.messageId ?? null
    );
  }
  longDimensions(width = this.project.output.width) {
    const g = this.geometry,
      shell =
        this.project.output.longShell !== false &&
        this.project.appearance.showShell;
    const screenH = shell
      ? Math.max(
          g.screenH,
          this.contentHeight + this.bars().top + this.bars().bottom,
        )
      : this.contentHeight + this.bars().top + this.bars().bottom;
    return {
      width,
      height: Math.ceil(
        ((shell ? g.frameH + screenH - g.screenH + 36 : screenH) * width) /
          (shell ? g.frameW + 36 : 375),
      ),
    };
  }
  private caps(h: number) {
    const base = this.geometry.nativeFrameH;
    const bottom = Math.max(
      base * 0.12,
      base - this.nativeScreen.y - this.nativeScreen.height + 50,
    );
    const top = Math.min(
      base - bottom - 1,
      Math.max(this.nativeScreen.y + 86, base * 0.22),
    );
    const k = Math.min(1, Math.max(1, h - 20) / (top + bottom));
    return { base, top, bottom, dt: top * k, db: bottom * k };
  }
  private mapShellY(y: number, h: number) {
    const c = this.caps(h);
    if (y <= c.top) return (y * c.dt) / c.top;
    if (y >= c.base - c.bottom)
      return h - c.db + ((y - c.base + c.bottom) * c.db) / c.bottom;
    return (
      c.dt + ((y - c.top) * (h - c.dt - c.db)) / (c.base - c.top - c.bottom)
    );
  }
  private stretch(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | HTMLCanvasElement,
    w: number,
    h: number,
  ) {
    const c = this.caps(h),
      f = image.height / c.base;
    ctx.drawImage(image, 0, 0, image.width, c.top * f, 0, 0, w, c.dt);
    ctx.drawImage(
      image,
      0,
      c.top * f,
      image.width,
      image.height - (c.top + c.bottom) * f,
      0,
      c.dt,
      w,
      Math.max(1, h - c.dt - c.db),
    );
    ctx.drawImage(
      image,
      0,
      image.height - c.bottom * f,
      image.width,
      c.bottom * f,
      0,
      h - c.db,
      w,
      c.db,
    );
  }
  private applyShellMask(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | HTMLCanvasElement,
    w: number,
    h: number,
  ) {
    const canvas = this.maskCanvas;
    if (canvas.width !== ctx.canvas.width) canvas.width = ctx.canvas.width;
    if (canvas.height !== ctx.canvas.height) canvas.height = ctx.canvas.height;
    const mask = canvas.getContext("2d")!;
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.clearRect(0, 0, canvas.width, canvas.height);
    mask.setTransform(ctx.getTransform());
    this.stretch(mask, image, w, h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
  renderLong(
    canvas: HTMLCanvasElement,
    width = this.project.output.width,
    offset = 0,
    pageHeight?: number,
  ) {
    const d = this.longDimensions(width),
      g = this.geometry,
      framed =
        this.project.output.longShell !== false &&
        this.project.appearance.showShell;
    canvas.width = width;
    canvas.height = Math.min(pageHeight ?? d.height, d.height - offset);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, canvas.height);
    const scale = width / (framed ? g.frameW + 36 : 375);
    ctx.scale(scale, scale);
    ctx.translate(0, -offset / scale);
    if (!framed) this.screen(ctx, 375, d.height / scale, Infinity, true);
    else {
      const screenH = Math.max(
          g.screenH,
          this.contentHeight + this.bars().top + this.bars().bottom,
        ),
        frameH = g.frameH + screenH - g.screenH;
      ctx.translate(18, 18);
      if (g.shell) {
        ctx.fillStyle = this.theme.bar;
        ctx.fillRect(0, 0, g.frameW, frameH);
        ctx.save();
        ctx.translate(g.screenX, g.screenY);
        this.screen(ctx, 375, screenH, Infinity, true);
        ctx.restore();
        const mask = this.shellMask ?? this.images.get(g.shell.maskId ?? "");
        if (mask) this.applyShellMask(ctx, mask, g.frameW, frameH);
        const shell = this.images.get(g.shell.id);
        if (shell) this.stretch(ctx, shell, g.frameW, frameH);
      } else {
        rect(
          ctx,
          0,
          0,
          g.frameW,
          frameH,
          this.ui.shellRadius,
          this.project.appearance.shellColor,
        );
        ctx.save();
        rect(ctx, g.screenX, g.screenY, 375, screenH, this.ui.screenRadius);
        ctx.clip();
        ctx.translate(g.screenX, g.screenY);
        this.screen(ctx, 375, screenH, Infinity, true);
        ctx.restore();
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      totalHeight: d.height,
    };
  }
}
