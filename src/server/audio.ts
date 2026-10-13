import fs from "node:fs/promises";
import { audioEvents, buildTimeline } from "../core/timeline.js";
import type { Project } from "../core/model.js";
import type { AssetStore } from "./assets.js";
import { execute, ffmpegPath } from "./media.js";
import { notificationSamples } from "../core/sound.js";
const RATE = 48000;
export async function makeAudio(
  project: Project,
  assets: AssetStore,
  file: string,
  signal: AbortSignal,
) {
  const timeline = buildTimeline(project),
    events = audioEvents(project, timeline);
  if (!events.length) return null;
  const track = new Float32Array(
      Math.ceil((timeline.durationMs / 1000) * RATE),
    ),
    cache = new Map<string, Float32Array>();
  for (const event of events) {
    signal.throwIfAborted();
    let sound: Float32Array;
    if (event.soundId) {
      if (!cache.has(event.soundId)) {
        const raw = await execute(
          ffmpegPath,
          [
            "-v",
            "error",
            "-i",
            assets.resolve(event.soundId),
            "-f",
            "f32le",
            "-ac",
            "1",
            "-ar",
            String(RATE),
            "pipe:1",
          ],
          signal,
        );
        cache.set(
          event.soundId,
          new Float32Array(
            raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
          ),
        );
      }
      sound = cache.get(event.soundId)!;
    } else sound = notificationSamples(event.messageId, RATE);
    const start = Math.round((event.atMs / 1000) * RATE),
      n = Math.min(sound.length, track.length - start);
    for (let i = 0; i < n; i++)
      track[start + i] = track[start + i]! + sound[i]!;
  }
  let peak = 1;
  for (const v of track) peak = Math.max(peak, Math.abs(v));
  const pcm = Buffer.alloc(track.length * 2);
  for (let i = 0; i < track.length; i++)
    pcm.writeInt16LE(
      Math.round(
        Math.max(-1, Math.min(1, (track[i]! / peak) * project.audio.volume)) *
          32767,
      ),
      i * 2,
    );
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  await fs.writeFile(file, Buffer.concat([header, pcm]));
  return file;
}
