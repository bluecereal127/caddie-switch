// Image I/O + pixel helpers for the ingestion tools.
// Pure JS decoders only (pngjs, jpeg-js) so nothing native to build on Windows.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

// -> { width, height, data: Buffer RGBA }
export function loadImage(path) {
  const buf = readFileSync(path);
  const ext = path.toLowerCase();
  if (ext.endsWith(".png")) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: Buffer.from(img.data) };
  }
  throw new Error("unsupported image type: " + path);
}

export function savePng(path, img) {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy ? img.data.copy(png.data) : png.data.set(img.data);
  writeFileSync(path, PNG.sync.write(png));
}

export function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

// rect = [fx, fy, fw, fh], all fractional 0-1 of the frame (project convention).
export function cropFrac(img, rect) {
  const x0 = Math.round(rect[0] * img.width), y0 = Math.round(rect[1] * img.height);
  const w = Math.round(rect[2] * img.width), h = Math.round(rect[3] * img.height);
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    img.data.copy(out.data, y * w * 4, src, src + w * 4);
  }
  return out;
}

export function toGray(img) {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4)
    g[i] = 0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2];
  return g;
}

// Otsu threshold on a grayscale Float32Array (0-255).
export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.min(255, Math.max(0, v | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thresh = t; }
  }
  return thresh;
}

// Binary mask: 1 where the glyph ink is. polarity "light" = ink brighter than bg.
export function binarize(img, polarity = "light") {
  const gray = toGray(img);
  const t = otsu(gray);
  const bin = new Uint8Array(gray.length);
  // compare on the same integer bins the Otsu histogram used, else values a
  // hair above the background bin (e.g. 19.1 vs t=19) misclassify as ink
  for (let i = 0; i < gray.length; i++) {
    const v = Math.min(255, Math.max(0, gray[i] | 0));
    bin[i] = (polarity === "light" ? v > t : v < t) ? 1 : 0;
  }
  return { bin, width: img.width, height: img.height };
}

export const colorDist = (a, b) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Binarizer tuned for the game's HUD text: white glyphs with a dark outline.
// A pixel is ink when it's near-white AND a dark outline pixel sits within
// 2px - clouds/sky are bright but have no dark edging, busy backgrounds
// don't fool it the way Otsu does.
export function binarizeText(img) {
  const w = img.width, h = img.height;
  const dark = new Uint8Array(w * h), bin = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const mx = Math.max(img.data[j], img.data[j + 1], img.data[j + 2]);
    if (mx < 130) dark[i] = 1;
  }
  const bright = new Uint8Array(w * h);
  const stack = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const mn = Math.min(img.data[j], img.data[j + 1], img.data[j + 2]);
      // floor keeps antialiasing halo pixels out so tight kerning gaps
      // survive and neighboring glyphs don't merge
      if (mn < 205) continue;
      bright[y * w + x] = 1;
      let edged = false;
      for (let dy = -2; dy <= 2 && !edged; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && dark[ny * w + nx]) { edged = true; break; }
        }
      if (edged) { bin[y * w + x] = 1; stack.push(y * w + x); }
    }
  // flood edge-seeded ink into connected bright pixels so thick glyph
  // interiors (further than 2px from the outline) still fill
  while (stack.length) {
    const j = stack.pop();
    const jx = j % w, jy = (j / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = jx + dx, ny = jy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (bright[k] && !bin[k]) { bin[k] = 1; stack.push(k); }
    }
  }
  return { bin, width: w, height: h };
}

// Median RGB of one scanline of a crop, perpendicular to `axis`.
// axis "y": line = row y across full width. axis "x": line = column x.
export function lineMedianRGB(img, axis, idx) {
  const n = axis === "y" ? img.width : img.height;
  const ch = [[], [], []];
  for (let k = 0; k < n; k++) {
    const [x, y] = axis === "y" ? [k, idx] : [idx, k];
    const p = px(img, x, y);
    ch[0].push(p[0]); ch[1].push(p[1]); ch[2].push(p[2]);
  }
  return ch.map((a) => { a.sort((u, v) => u - v); return a[a.length >> 1]; });
}
