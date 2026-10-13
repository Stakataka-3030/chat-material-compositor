const cache = new Map<string, HTMLCanvasElement>();

/** Cover the enclosed screen, including the skin's translucent inner rim. */
export function shellCoverage(
  image: HTMLImageElement,
  reference: HTMLImageElement,
  key: string,
) {
  const stored = cache.get(key);
  if (stored) {
    cache.delete(key);
    cache.set(key, stored);
    return stored;
  }
  const ratio = Math.min(1, 2048 / Math.max(image.width, image.height)),
    width = Math.max(1, Math.round(image.width * ratio)),
    height = Math.max(1, Math.round(image.height * ratio));
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const ctx = source.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const skin = ctx.getImageData(0, 0, width, height).data;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(reference, 0, 0, width, height);
  const original = ctx.getImageData(0, 0, width, height);
  let seed = Math.floor(height / 2) * width + Math.floor(width / 2);
  if (skin[seed * 4 + 3]! >= 250 || original.data[seed * 4 + 3]! < 128) {
    seed = -1;
    for (let i = 0; i < width * height; i++)
      if (original.data[i * 4 + 3]! > 128 && skin[i * 4 + 3]! < 250) {
        seed = i;
        break;
      }
  }
  const seen = new Uint8Array(width * height),
    queue = new Uint32Array(width * height),
    result = ctx.createImageData(width, height);
  let read = 0,
    write = 0,
    touchesOutside = false;
  if (seed >= 0) {
    queue[write++] = seed;
    seen[seed] = 1;
  }
  const add = (i: number) => {
    if (!seen[i] && skin[i * 4 + 3]! < 250) {
      seen[i] = 1;
      queue[write++] = i;
    }
  };
  while (read < write) {
    const i = queue[read++]!,
      x = i % width,
      y = Math.floor(i / width);
    result.data.fill(255, i * 4, i * 4 + 4);
    if (!x || !y || x === width - 1 || y === height - 1) touchesOutside = true;
    if (x > 0) add(i - 1);
    if (x + 1 < width) add(i + 1);
    if (y > 0) add(i - width);
    if (y + 1 < height) add(i + width);
  }
  ctx.putImageData(
    touchesOutside || write < width * height * 0.02 ? original : result,
    0,
    0,
  );
  const coverage = document.createElement("canvas");
  coverage.width = width;
  coverage.height = height;
  const paint = coverage.getContext("2d")!;
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) paint.drawImage(source, x, y);
  cache.set(key, coverage);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return coverage;
}
