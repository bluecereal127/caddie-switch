// Template-matching digit reader for the HUD numbers (distance to pin, wind
// speed). No OCR engine: the game uses one fixed font, so a handful of glyph
// templates learned from labeled captures beats tesseract on reliability.
//
// Templates live in tools/templates/<set>/ as JSON: { label, w, h, grid }
// where grid is a flat 0/1 array normalized to NORM_W x NORM_H.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { binarize, cropFrac } from "./image.mjs";

export const NORM_W = 12, NORM_H = 16;

// Split a binary crop into glyphs via column projection (gap = empty columns).
export function segmentGlyphs({ bin, width, height }, minGap = 1, minInk = 2) {
  const colInk = new Array(width).fill(0);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++) colInk[x] += bin[y * width + x];
  const spans = [];
  let start = -1, gap = 0;
  for (let x = 0; x <= width; x++) {
    const ink = x < width ? colInk[x] > 0 : false;
    if (ink) { if (start < 0) start = x; gap = 0; }
    else if (start >= 0 && ++gap >= minGap) { spans.push([start, x - gap + 1]); start = -1; }
  }
  return spans.map(([x0, x1]) => {
    // trim rows
    let y0 = 0, y1 = height;
    const rowInk = (y) => { let s = 0; for (let x = x0; x < x1; x++) s += bin[y * width + x]; return s; };
    while (y0 < y1 && rowInk(y0) === 0) y0++;
    while (y1 > y0 && rowInk(y1 - 1) === 0) y1--;
    const w = x1 - x0, h = y1 - y0;
    const glyph = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) glyph[y * w + x] = bin[(y0 + y) * width + (x0 + x)];
    return { glyph, w, h, x0 };
  }).filter((g) => g.w >= 2 && g.h >= 4 && g.glyph.reduce((a, b) => a + b, 0) >= minInk);
}

export function normalizeGlyph({ glyph, w, h }) {
  const out = new Uint8Array(NORM_W * NORM_H);
  for (let y = 0; y < NORM_H; y++)
    for (let x = 0; x < NORM_W; x++) {
      const sx = Math.min(w - 1, Math.floor((x / NORM_W) * w));
      const sy = Math.min(h - 1, Math.floor((y / NORM_H) * h));
      out[y * NORM_W + x] = glyph[sy * w + sx];
    }
  return out;
}

const similarity = (a, b) => {
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
};

export function loadTemplates(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

export function saveTemplate(dir, label, norm, idx) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${label}-${idx}.json`),
    JSON.stringify({ label, w: NORM_W, h: NORM_H, grid: Array.from(norm) }));
}

// Read a number out of an ROI crop. Returns { text, value, glyphs } where each
// glyph has its best match + score, or null glyphs when no templates exist yet.
export function readNumber(img, roi, templates, polarity = "light") {
  const crop = cropFrac(img, roi.rect);
  const segs = segmentGlyphs(binarize(crop, polarity));
  const glyphs = segs.map((s) => {
    const norm = normalizeGlyph(s);
    let best = null, bestScore = -1;
    for (const t of templates) {
      const sc = similarity(norm, Uint8Array.from(t.grid));
      if (sc > bestScore) { bestScore = sc; best = t.label; }
    }
    return { label: best, score: +bestScore.toFixed(3), x0: s.x0 };
  });
  const text = glyphs.map((g) => g.label ?? "?").join("");
  const value = /^\d+$/.test(text) ? parseInt(text, 10) : null;
  const minScore = glyphs.length ? Math.min(...glyphs.map((g) => g.score)) : 0;
  return { text, value, glyphs, minScore };
}
