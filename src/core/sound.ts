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
