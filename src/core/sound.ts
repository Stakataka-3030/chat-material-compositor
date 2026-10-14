export function notificationSamples(
  seed: string,
  rate: number,
): Float32Array<ArrayBuffer> {
  const data = new Float32Array(Math.round(rate * 0.13)),
    pitch = 620 + seed.charCodeAt(0) * 3;
  for (let i = 0; i < data.length; i++)
    data[i] =
      Math.sin((i * 2 * Math.PI * pitch) / rate) *
      Math.exp((-i / rate) * 30) *
      0.25;
  return data;
}
export const builtinSounds = [
  {
    id: "soft",
    name: "轻提示",
    duration: 0.18,
    tones: [{ at: 0, hz: 880, end: 880, length: 0.18, gain: 0.25 }],
  },
  {
    id: "send",
    name: "发送",
    duration: 0.14,
    tones: [{ at: 0, hz: 460, end: 920, length: 0.14, gain: 0.25 }],
  },
  {
    id: "receive",
    name: "接收双音",
    duration: 0.32,
    tones: [
      { at: 0, hz: 740, end: 740, length: 0.18, gain: 0.22 },
      { at: 0.12, hz: 1040, end: 1040, length: 0.2, gain: 0.23 },
    ],
  },
  {
    id: "bell",
    name: "清亮铃音",
    duration: 0.36,
    tones: [
      { at: 0, hz: 1175, end: 1175, length: 0.36, gain: 0.2 },
      { at: 0, hz: 1760, end: 1760, length: 0.3, gain: 0.08 },
    ],
  },
  {
    id: "drop",
    name: "水滴",
    duration: 0.22,
    tones: [{ at: 0, hz: 1280, end: 400, length: 0.22, gain: 0.26 }],
  },
  {
    id: "tap",
    name: "轻敲",
    duration: 0.08,
    tones: [
      { at: 0, hz: 520, end: 260, length: 0.08, gain: 0.22 },
      { at: 0, hz: 1900, end: 900, length: 0.04, gain: 0.06 },
    ],
  },
];
export function builtinSoundSamples(
  id: string,
  rate = 44100,
): Float32Array<ArrayBuffer> {
  const sound = builtinSounds.find((s) => s.id === id);
  if (!sound) throw new Error("未知音效");
  const data = new Float32Array(Math.round(rate * sound.duration));
  for (const tone of sound.tones)
    for (let i = 0; i < data.length; i++) {
      const t = i / rate - tone.at;
      if (t < 0 || t >= tone.length) continue;
      const phase =
        2 *
        Math.PI *
        (tone.hz * t + ((tone.end - tone.hz) * t * t) / (2 * tone.length));
      const envelope =
        Math.min(1, t / 0.006) *
        Math.exp((-t / tone.length) * 6) *
        Math.min(1, (tone.length - t) / 0.01);
      data[i]! +=
        (Math.sin(phase) + Math.sin(phase * 2) * 0.08) * envelope * tone.gain;
    }
  return data;
}
