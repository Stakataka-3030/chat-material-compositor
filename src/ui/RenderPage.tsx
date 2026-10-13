import { useEffect, useRef, useState } from "react";
import { ChatRenderer } from "../core/renderer.js";
import type { Asset, Project } from "../core/model.js";
export function RenderPage() {
  const ref = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("session");
    void (async () => {
      const preview = new URLSearchParams(location.search).get("preview");
      let data: { project: Project; assets: Asset[] };
      if (preview) {
        const [project, assets] = await Promise.all([
          fetch(`/api/projects/${encodeURIComponent(preview)}`).then((r) =>
            r.json(),
          ),
          fetch("/api/assets").then((r) => r.json()),
        ]);
        data = { project, assets };
      } else {
        const response = await fetch(
          `/api/render/session/${encodeURIComponent(token ?? "")}`,
        );
        if (!response.ok) throw new Error("渲染会话已结束");
        data = await response.json();
      }
      const renderer = await new ChatRenderer(
          data.project,
          data.assets,
        ).prepare(),
        canvas = ref.current!;
      await renderer.ensureFrame(0);
      renderer.render(canvas, 0);
      const api = {
        dimensions: renderer.dimensions(),
        longDimensions: renderer.longDimensions(),
        async frame(atMs: number) {
          await renderer.ensureFrame(atMs);
          renderer.render(canvas, atMs);
          return canvas.toDataURL("image/png");
        },
        async long(offset = 0, height?: number) {
          await renderer.ensureLongPage(offset, height);
          renderer.renderLong(
            canvas,
            data.project.output.width,
            offset,
            height,
          );
          return canvas.toDataURL("image/png");
        },
        cacheInfo: () => renderer.cacheInfo(),
      };
      (window as unknown as { liaomuRender: typeof api }).liaomuRender = api;
    })().catch((e) => {
      (window as unknown as { liaomuRenderError: string }).liaomuRenderError = (
        e as Error
      ).message;
      setError((e as Error).message);
    });
  }, []);
  return (
    <main className="render-page">
      <canvas ref={ref} />
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
