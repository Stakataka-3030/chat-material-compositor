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
  type Timeline,
} from "./timeline.js";

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
    this.theme = project.appearance.theme === "dark" ? dark : light;
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
        frameW: 413,
        frameH: 860,
        nativeFrameH: 860,
        screenX: 19,
        screenY: 25,
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
    const ratio = project.appearance.screenHeightRatio ?? 1;
    this.geometry.frameH -= this.geometry.screenH * (1 - ratio);
    this.geometry.screenH *= ratio;
  }
  async prepare() {
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
      if (!asset || asset.kind === "sound") return;
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
    const h = this.geometry.screenH - 136;
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
    const base = (framed ? 18 + this.geometry.screenY : 0) + 86;
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
    return `${bold ? 600 : 400} ${size}px ${FONT}`;
  }
  private wrap(text: string, width: number, size: number, bold = false) {
    const ctx = this.measure;
    ctx.font = this.font(size, bold);
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
      const text = interpolate(node.text ?? "", data);
      if (!text) return { node, x: 0, y: 0, width: 0, height: 0, lines: [] };
      const size = node.size ?? this.project.appearance.fontSize,
        lines = this.wrap(text, limit, size, node.bold),
        lineHeight = size * 1.45;
      this.measure.font = this.font(size, node.bold);
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
  private buildBlocks() {
    let y = 12;
    this.blocks = this.project.messages.map((message) => {
      const plugin = this.registry.get(message.kind),
        own = message.speakerId === this.project.meId;
      const separator = plugin.layout.variant === "separator";
      const width = Math.min(250, plugin.layout.width ?? 248);
      const nodes = plugin.layout.nodes.map((node) =>
        this.nodeBox(
          node,
          message.data,
          width - (plugin.layout.variant === "media" ? 0 : 26),
        ),
      );
      let bodyHeight = 0;
      for (const node of nodes) {
        node.y = bodyHeight;
        if (node.height) bodyHeight += node.height + 5;
      }
      bodyHeight =
        Math.max(0, bodyHeight - 5) +
        (plugin.layout.variant === "media" || separator ? 0 : 20);
      const nameHeight =
        !separator && this.project.appearance.showNames ? 20 : 0;
      const bodyWidth =
        plugin.layout.width && plugin.layout.variant !== "media"
          ? width
          : Math.min(
              width,
              Math.max(34, ...nodes.map((n) => n.width)) +
                (separator ? 18 : plugin.layout.variant === "media" ? 0 : 26),
            );
      const height =
        Math.max(separator ? 28 : 38, bodyHeight + nameHeight) + 14;
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
    if (!value) return this.theme.text;
    return (
      (
        {
          $text: this.theme.text,
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
      const size = node.size ?? this.project.appearance.fontSize;
      ctx.font = this.font(size, node.bold);
      ctx.fillStyle = this.color(
        node.color ? interpolate(node.color, block.message.data) : undefined,
        block.own,
      );
      ctx.textAlign =
        node.align === "center"
          ? "center"
          : node.align === "end"
            ? "right"
            : "left";
      ctx.textBaseline = "alphabetic";
      const textX =
        x +
        (node.align === "center"
          ? box.width / 2
          : node.align === "end"
            ? box.width
            : 0);
      box.lines?.forEach((line, i) => {
        const metrics = ctx.measureText(line),
          inkX =
            block.plugin.layout.variant === "separator"
              ? x +
                (box.width -
                  metrics.actualBoundingBoxRight +
                  metrics.actualBoundingBoxLeft) /
                  2
              : textX;
        ctx.fillText(
          line,
          inkX,
          y + (box.baselines?.[i] ?? (i + 1) * size * 1.45),
        );
      });
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
    rect(ctx, x, y, 34, 34, 17, speaker.color);
    ctx.clip();
    if (image) this.image(ctx, image, x, y, 34, 34);
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
        x + 17,
        y + 17,
      );
    }
    ctx.restore();
    ctx.textAlign = "left";
  }
  private header(ctx: CanvasRenderingContext2D, width: number) {
    const showTime = this.project.appearance.showStatusTime ?? false;
    ctx.fillStyle =
      this.project.appearance.theme === "light" ? "#fff0fa" : this.theme.bar;
    ctx.fillRect(0, 0, width, 86);
    ctx.font = this.font(11, true);
    ctx.fillStyle = this.theme.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (showTime) ctx.fillText(this.project.appearance.statusTime, 18, 17, 40);
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = 1;
    rect(ctx, width - 49, 11, 28, 13, 1);
    ctx.stroke();
    ctx.fillStyle =
      this.project.appearance.battery <= 20
        ? "#db6153"
        : this.project.appearance.theme === "light"
          ? "#a8e465"
          : this.theme.accent;
    const battery = this.project.appearance.battery;
    ctx.fillRect(width - 47, 13, (24 * battery) / 100, 9);
    ctx.fillStyle = this.theme.text;
    ctx.fillRect(width - 20, 14, 2, 7);
    ctx.font = this.font(11);
    ctx.textAlign = "right";
    ctx.fillText(`${battery}%`, width - 53, 18);
    ctx.textAlign = "left";
    if (this.project.appearance.charging) {
      ctx.font = this.font(10, true);
      ctx.fillStyle = this.theme.bar;
      ctx.fillText("ϟ", width - 39, 18);
    }
    ctx.fillStyle = this.theme.text;
    const statusX = showTime ? 62 : 18;
    for (let i = 0; i < 4; i++)
      ctx.fillRect(statusX + i * 3.5, 22 - (i + 1) * 2.7, 2.4, (i + 1) * 2.7);
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = 1.6;
    for (const radius of [8, 4.5]) {
      ctx.beginPath();
      ctx.arc(statusX + 26, 22, radius, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(statusX + 26, 22, 1, 0, Math.PI * 2);
    ctx.fill();
    if (!showTime) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(statusX + 45, 17, 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(statusX + 45, 13);
      ctx.lineTo(statusX + 45, 17);
      ctx.lineTo(statusX + 48, 19);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(statusX + 39, 9);
      ctx.lineTo(statusX + 41, 8);
      ctx.moveTo(statusX + 49, 8);
      ctx.lineTo(statusX + 51, 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(statusX + 61, 10);
      ctx.lineTo(statusX + 75, 7);
      ctx.lineTo(statusX + 70, 22);
      ctx.lineTo(statusX + 67, 17);
      ctx.lineTo(statusX + 61, 10);
      ctx.fill();
    }
    ctx.font = this.font(19, true);
    ctx.textAlign = "center";
    const fullTitle =
      this.project.appearance.mode === "group"
        ? `${this.project.appearance.title} (${this.project.appearance.groupCount ?? this.project.speakers.length})`
        : this.project.appearance.title;
    let title = fullTitle;
    const letters = [
      ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
        fullTitle,
      ),
    ].map((s) => s.segment);
    while (ctx.measureText(title).width > width - 148 && letters.length) {
      letters.pop();
      title = letters.join("") + "…";
    }
    ctx.fillText(title, width / 2, 56);
    ctx.textAlign = "left";
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(23, 47);
    ctx.lineTo(15, 56);
    ctx.lineTo(23, 65);
    ctx.stroke();
    ctx.save();
    ctx.translate(width - 70, 46);
    ctx.scale(0.8, 0.8);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fill(
      new Path2D(
        "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
      ),
    );
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      rect(ctx, width - 33, 48 + i * 6, 20, 4, 0.7, this.theme.text);
    }
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 85.5);
    ctx.lineTo(width, 85.5);
    ctx.stroke();
  }
  private footer(ctx: CanvasRenderingContext2D, width: number, y: number) {
    ctx.fillStyle = this.theme.bar;
    ctx.fillRect(0, y, width, 50);
    ctx.strokeStyle = this.theme.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13, y + 25);
    ctx.lineTo(29, y + 25);
    ctx.moveTo(21, y + 17);
    ctx.lineTo(21, y + 33);
    ctx.stroke();
    rect(ctx, 42, y + 17, 19, 15, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(51.5, y + 24.5, 4, 0, Math.PI * 2);
    ctx.stroke();
    rect(ctx, 71, y + 16, 18, 16, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(74, y + 29);
    ctx.lineTo(80, y + 22);
    ctx.lineTo(87, y + 29);
    ctx.stroke();
    rect(
      ctx,
      101,
      y + 10,
      width - 170,
      31,
      16,
      this.project.appearance.theme === "dark" ? "#3b4c41" : "#edf1ee",
    );
    ctx.font = this.font(20);
    ctx.fillStyle = this.theme.muted;
    ctx.fillText("☺", width - 55, y + 27);
    rect(ctx, width - 25, y + 16, 7, 13, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width - 21.5, y + 23, 6, 0, Math.PI);
    ctx.moveTo(width - 21.5, y + 29);
    ctx.lineTo(width - 21.5, y + 34);
    ctx.stroke();
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
    const chatTop = 86,
      chatHeight = height - chatTop - 50;
    ctx.fillStyle = this.theme.face;
    ctx.fillRect(0, 0, width, height);
    const wallpaper = this.images.get(
      this.project.appearance.wallpaperId ?? "",
    );
    if (wallpaper)
      this.image(
        ctx,
        wallpaper,
        0,
        chatTop,
        width,
        chatHeight,
        this.project.appearance.wallpaperFit,
      );
    const scroll = all ? 0 : this.scroll(atMs, chatHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chatTop, width, chatHeight);
    ctx.clip();
    this.hits = [];
    for (const [index, block] of this.blocks.entries()) {
      const event = this.timeline.events[index]!;
      if (!all && event.atMs > atMs) continue;
      const y = chatTop + block.y - scroll;
      if (y + block.height < chatTop || y > chatTop + chatHeight) continue;
      const variant = block.plugin.layout.variant,
        separator = variant === "separator";
      const avatarX = block.own ? width - 47 : 13;
      const x = separator
        ? (width - block.width) / 2
        : block.own
          ? width - 55 - block.width
          : 55;
      const progress =
        all || !this.project.playback.popMs
          ? 1
          : easeOut((atMs - event.atMs) / this.project.playback.popMs);
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
        this.avatar(ctx, block.message.speakerId, avatarX, y);
        if (block.nameHeight) {
          ctx.font = this.font(12);
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
          variant === "card" ? 12 : 15,
          background,
        );
        if (variant === "bubble") {
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
        rect(
          ctx,
          x - 4,
          bodyY - 3,
          block.width + 8,
          block.bodyHeight + 6,
          12,
          this.project.appearance.theme === "dark" ? "#2e3d34cc" : "#f8faf8bd",
        );
      }
      const paddingY = variant === "media" || separator ? 0 : 10;
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
                : 13),
          bodyY + paddingY,
          block,
        ),
      );
      if (
        this.project.appearance.showRead &&
        block.own &&
        block.message.read &&
        !separator
      ) {
        ctx.font = this.font(9);
        ctx.fillStyle = this.theme.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("已读", x - 25, bodyY + block.bodyHeight);
      }
      ctx.restore();
      this.hits.push({
        messageId: block.message.id,
        x,
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
    this.header(ctx, width);
    this.footer(ctx, width, height - 50);
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
          45,
          this.project.appearance.shellColor,
        );
      ctx.save();
      rect(
        ctx,
        g.screenX,
        g.screenY,
        g.screenW,
        g.screenH,
        this.project.appearance.showShell ? 34 : 0,
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
      ? Math.max(g.screenH, this.contentHeight + 136)
      : this.contentHeight + 136;
    return {
      width,
      height: Math.ceil(
        ((shell ? g.frameH + screenH - g.screenH + 36 : screenH) * width) /
          (shell ? g.frameW + 36 : 375),
      ),
    };
  }
  private stretch(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | HTMLCanvasElement,
    w: number,
    h: number,
  ) {
    const base = this.geometry.nativeFrameH,
      nativeScreenH = base - this.geometry.frameH + this.geometry.screenH,
      bottom = Math.max(
        base * 0.12,
        base - this.geometry.screenY - nativeScreenH + 50,
      ),
      top = Math.min(
        base - bottom - 1,
        Math.max(this.geometry.screenY + 86, base * 0.22),
      );
    const factor = image.height / base;
    ctx.drawImage(image, 0, 0, image.width, top * factor, 0, 0, w, top);
    ctx.drawImage(
      image,
      0,
      top * factor,
      image.width,
      image.height - (top + bottom) * factor,
      0,
      top,
      w,
      Math.max(1, h - top - bottom),
    );
    ctx.drawImage(
      image,
      0,
      image.height - bottom * factor,
      image.width,
      bottom * factor,
      0,
      h - bottom,
      w,
      bottom,
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
      const screenH = Math.max(g.screenH, this.contentHeight + 136),
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
          45,
          this.project.appearance.shellColor,
        );
        ctx.save();
        rect(ctx, g.screenX, g.screenY, 375, screenH, 34);
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
