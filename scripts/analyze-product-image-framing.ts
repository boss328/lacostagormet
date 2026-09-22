import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Read-only pixel analysis. No image pixels or original assets are changed.
const catalog = JSON.parse(
  readFileSync('/tmp/lcg-public-catalog.json', 'utf8'),
);
const images = new Map<string, { url: string; name: string }>();
for (const product of catalog.products)
  for (const image of product.product_images ?? [])
    images.set(image.url, { url: image.url, name: product.name });
const output: Record<string, number[]> = {};
const report: unknown[] = [];
const cache = '/tmp/lcg-original-product-images';
mkdirSync(cache, { recursive: true });
async function analyze({ url, name }: { url: string; name: string }) {
  const key = url.replace(
    /\.\d+\.\d+\.(jpg|jpeg|png|webp|gif)(\?|$)/i,
    '.$1$2',
  );
  const filename = `${cache}/${createHash('sha256').update(url).digest('hex').slice(0, 20)}`;
  if (!existsSync(filename)) {
    let response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    for (
      let retry = 0;
      retry < 3 && (response.status === 429 || response.status >= 500);
      retry++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 3000 * (retry + 1)));
      response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    }
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    writeFileSync(filename, Buffer.from(await response.arrayBuffer()));
  }
  const { data, info } = await sharp(filename)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBackground = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (
      data[i + 3] < 16 ||
      (data[i] >= 245 && data[i + 1] >= 245 && data[i + 2] >= 245)
    );
  };
  let edgeBackground = 0,
    edgeCount = 0;
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 100)))
    for (const y of [0, h - 1]) {
      edgeCount++;
      if (isBackground(x, y)) edgeBackground++;
    }
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 100)))
    for (const x of [0, w - 1]) {
      edgeCount++;
      if (isBackground(x, y)) edgeBackground++;
    }
  let left = 0,
    top = 0,
    right = w - 1,
    bottom = h - 1;
  // Only trim uniformly white/transparent edges; lifestyle photos keep full framing.
  if (edgeBackground / edgeCount >= 0.95) {
    left = w;
    top = h;
    right = 0;
    bottom = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!isBackground(x, y)) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    const pad = Math.ceil(Math.max(w, h) * 0.008);
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad);
    bottom = Math.min(h - 1, bottom + pad);
    if (
      right <= left ||
      bottom <= top ||
      (right - left) * (bottom - top) < w * h * 0.025
    ) {
      left = 0;
      top = 0;
      right = w - 1;
      bottom = h - 1;
    }
  }
  output[key] = [w, h, left, top, right - left + 1, bottom - top + 1];
  report.push({
    name,
    url,
    filename,
    frame: output[key],
    zoom: Math.max(w, h) / Math.max(right - left + 1, bottom - top + 1),
  });
}
async function main() {
  const rows = [...images.values()];
  for (let offset = 0; offset < rows.length; offset += 2) {
    await Promise.all(rows.slice(offset, offset + 2).map(analyze));
    if (offset % 60 === 0)
      console.log(
        `Analyzed ${Math.min(offset + 2, rows.length)}/${rows.length} product photos`,
      );
  }
  writeFileSync(
    'src/lib/product-image-frames.json',
    JSON.stringify(Object.fromEntries(Object.entries(output).sort()), null, 2) +
      '\n',
  );
  writeFileSync(
    '/tmp/lcg-image-framing-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Analyzed all ${rows.length} original photos for ${catalog.products.length} products.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
