import { builtinSounds, builtinSoundSamples } from "../core/sound.js";
import type { AssetStore } from "./assets.js";
function wav(samples: Float32Array, rate: number) {
  const result = Buffer.alloc(44 + samples.length * 2);
  result.write("RIFF", 0);
  result.writeUInt32LE(result.length - 8, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) =>
    result.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      44 + i * 2,
    ),
  );
  return result;
}
export async function installBuiltinSounds(store: AssetStore) {
  for (const sound of builtinSounds) {
    const rate = 44100,
      samples = builtinSoundSamples(sound.id, rate);
    await store.registerGeneratedSound(
      wav(samples, rate),
      sound.name + ".wav",
      Math.round((samples.length / rate) * 1000),
      ["内置", "原创", "builtin-" + sound.id],
    );
  }
}
