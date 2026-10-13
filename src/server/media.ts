import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
export const ffmpegPath = process.env.LIAOMU_FFMPEG || ffmpegStatic!;
export const ffprobePath = process.env.LIAOMU_FFPROBE || ffprobeStatic.path;
export function execute(
  file: string,
  args: string[],
  signal?: AbortSignal,
  limit = 64 * 1024 * 1024,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const proc = spawn(file, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      error = "";
    proc.stdout.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > limit) proc.kill();
      else chunks.push(data);
    });
    proc.stderr.on("data", (data) => {
      error = (error + data.toString()).slice(-6000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 && bytes <= limit
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(
              bytes > limit
                ? "媒体数据超过处理容量"
                : `媒体处理失败：${error.slice(-1500)}`,
            ),
          ),
    );
  });
}
export async function probe(file: string, signal?: AbortSignal) {
  const timer = AbortSignal.timeout(15000),
    combined = signal ? AbortSignal.any([signal, timer]) : timer;
  return JSON.parse(
    (
      await execute(
        ffprobePath,
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
        combined,
      )
    ).toString(),
  ) as {
    format: { duration?: string; format_name?: string; size?: string };
    streams: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      tags?: Record<string, string>;
    }[];
  };
}
