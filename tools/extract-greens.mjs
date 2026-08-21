// Extract green boundary, height field, 9x9 slope grid, and pin position
// from the zoomed-minimap green pairs (plain + heightmap/Terrain view).
//   node tools/extract-greens.mjs
//
// Method: the Terrain toggle recolors ONLY the green, so |plain - heightmap|
// marks the green's pixels (legend area excluded, largest component kept,
// holes filled - the flag renders identically in both frames and diffs out).
// Height comes from matching heightmap colors to the legend gradient bar
// (top = High, bottom = Low). Slope vectors = downhill gradient of the 9x9
// cell heights, in green-local coords (+x right, +y down), magnitude 0..1
// relative to the green's own height range.
//
// Every session pair is processed (pins move between sessions): the grid is
// taken from the latest session; pins accumulate across sessions.
// Outputs: captures/derived/greens/hNN.json + debug hNN-mask.png / hNN-height.png
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng, px, colorDist } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { sessions, fileMs } from "./lib/ulid.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox") + "/";
const OUT = join(ROOT, "captures", "derived", "greens");
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(join(ROOT, "captures", "classification.json"), "utf8"));
const GRID_N = 9;

const crop = (file) => { const img = loadImage(INBOX + file); return cropRect(img, panelRect(img)); };

const isFlagPink = (p) => p[0] > 190 && p[2] > 120 && p[1] < 110 && p[0] - p[1] > 100;

function greenMask(plain, hmap) {
  const w = plain.width, h = plain.height;
  // The legend UI's actual footprint: gradient bar + "High" + "Low" labels.
  // Only these strips are unknowable (legend drawn over the map on the
  // heightmap frame); the map shows through everywhere else in the corner.
  const inLegend = (x, y) => {
    const fx = x / w, fy = y / h;
    return (fx > 0.02 && fx < 0.132 && fy > 0.035 && fy < 0.34) ||   // bar
      (fx >= 0.132 && fx < 0.375 && fy > 0.04 && fy < 0.135) ||      // "High"
      (fx >= 0.132 && fx < 0.34 && fy > 0.24 && fy < 0.325);         // "Low"
  };
  const raw = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (inLegend(x, y)) continue;
      if (colorDist(px(plain, x, y), px(hmap, x, y)) > 28) raw[y * w + x] = 1;
    }
  // largest 4-connected component
  const label = new Int32Array(w * h).fill(-1);
  let best = -1, bestSize = 0, nLabels = 0;
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!raw[i] || label[i] >= 0) continue;
    let size = 0; stack.push(i); label[i] = nLabels;
    while (stack.length) {
      const j = stack.pop(); size++;
      const jx = j % w, jy = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (raw[k] && label[k] < 0) { label[k] = nLabels; stack.push(k); }
      }
    }
    if (size > bestSize) { bestSize = size; best = nLabels; }
    nLabels++;
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] === best) mask[i] = 1;
  // fill holes: flood the background from the borders; anything unflooded is a hole
  const bg = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const j = stack.pop();
    if (bg[j] || mask[j]) continue;
    bg[j] = 1;
    const jx = j % w, jy = (j / w) | 0;
    if (jx > 0) stack.push(j - 1); if (jx < w - 1) stack.push(j + 1);
    if (jy > 0) stack.push(j - w); if (jy < h - 1) stack.push(j + w);
  }
  for (let i = 0; i < w * h; i++) if (!bg[i]) mask[i] = 1;

  // Fill the small legend strips where they are surrounded by mask: treat
  // them as holes (they were skipped in the diff), then re-run the border
  // flood so only enclosed strip parts get absorbed.
  const bg2 = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const j = stack.pop();
    if (bg2[j] || mask[j]) continue;
    bg2[j] = 1;
    const jx = j % w, jy = (j / w) | 0;
    if (jx > 0) stack.push(j - 1); if (jx < w - 1) stack.push(j + 1);
    if (jy > 0) stack.push(j - w); if (jy < h - 1) stack.push(j + w);
  }
  for (let i = 0; i < w * h; i++) if (!bg2[i] && !mask[i]) mask[i] = 1;
  return { mask, size: bestSize, inLegend };
}

// legend gradient bar: sample its colors top(=1.0 high) .. bottom(=0.0 low)
function legendLUT(hmap) {
  const xs = Math.round(0.072 * hmap.width);
  const y0 = Math.round(0.066 * hmap.height), y1 = Math.round(0.315 * hmap.height);
  const lut = [];
  for (let y = y0; y <= y1; y++) lut.push({ c: px(hmap, xs, y), h: 1 - (y - y0) / (y1 - y0) });
  return lut;
}
const heightOf = (p, lut) => {
  let best = null, bd = 1e9;
  for (const e of lut) { const d = colorDist(p, e.c); if (d < bd) { bd = d; best = e; } }
  return best.h;
};

// downhill slope vectors from central differences over cell heights,
// normalized to the green's own max slope
function slopeGrid(cellH) {
  const at = (gy, gx) => (gy >= 0 && gy < GRID_N && gx >= 0 && gx < GRID_N) ? cellH[gy][gx] : null;
  const grid = Array.from({ length: GRID_N }, () => Array.from({ length: GRID_N }, () => [0, 0]));
  let maxMag = 0;
  const rawVec = [];
  for (let gy = 0; gy < GRID_N; gy++)
    for (let gx = 0; gx < GRID_N; gx++) {
      if (cellH[gy][gx] == null) continue;
      const l = at(gy, gx - 1), r = at(gy, gx + 1), u = at(gy - 1, gx), d = at(gy + 1, gx);
      const ddx = (r != null && l != null) ? (r - l) / 2 : (r != null ? r - cellH[gy][gx] : (l != null ? cellH[gy][gx] - l : 0));
      const ddy = (d != null && u != null) ? (d - u) / 2 : (d != null ? d - cellH[gy][gx] : (u != null ? cellH[gy][gx] - u : 0));
      const vx = -ddx, vy = -ddy; // downhill
      const mag = Math.hypot(vx, vy);
      if (mag > maxMag) maxMag = mag;
      rawVec.push({ gy, gx, vx, vy });
    }
  for (const v of rawVec) {
    if (maxMag > 1e-6) grid[v.gy][v.gx] = [+(v.vx / maxMag).toFixed(3), +(v.vy / maxMag).toFixed(3)];
  }
  return grid;
}

function extractPair(hole, plainFile, hmapFile) {
  const plain = crop(plainFile), hmap = crop(hmapFile);
  const w = plain.width, h = plain.height;
  const { mask, size, inLegend } = greenMask(plain, hmap);
  if (size < 800) return { error: `mask too small (${size}px)` };

  // bbox
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }

  // heights (+ per-cell sample counts, used as fusion weights across
  // sessions — the height field never changes, so frames are fusable)
  const lut = legendLUT(hmap);
  const cellH = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(null));
  const cellN = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(0));
  const cw = (x1 - x0 + 1) / GRID_N, ch = (y1 - y0 + 1) / GRID_N;
  for (let gy = 0; gy < GRID_N; gy++)
    for (let gx = 0; gx < GRID_N; gx++) {
      let sum = 0, n = 0, tot = 0;
      for (let y = Math.floor(y0 + gy * ch); y < y0 + (gy + 1) * ch; y++)
        for (let x = Math.floor(x0 + gx * cw); x < x0 + (gx + 1) * cw; x++) {
          tot++;
          // legend-zone pixels are occluded on the heightmap frame — they
          // count for the mask/bbox but can't contribute height
          if (mask[y * w + x] && !inLegend(x, y)) { sum += heightOf(px(hmap, x, y), lut); n++; }
        }
      if (n > 0.12 * tot) { cellH[gy][gx] = sum / n; cellN[gy][gx] = n; }
    }

  const grid = slopeGrid(cellH);

  // pin: pole base from the heightmap frame. The wind compass floats to
  // whichever bottom corner avoids the green, and its arrow is pink at
  // 20+ mph — exclude BOTH bottom-corner disks.
  const cr = 0.15 * w, ccy = 0.815 * h, ccxL = 0.132 * w, ccxR = 0.832 * w;
  const inCompass = (x, y) =>
    (x - ccxL) * (x - ccxL) + (y - ccy) * (y - ccy) < cr * cr ||
    (x - ccxR) * (x - ccxR) + (y - ccy) * (y - ccy) < cr * cr;
  let flag = { sx: 0, sy: 0, c: 0, maxY: -1 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inCompass(x, y)) continue;
    const p = px(hmap, x, y);
    if (isFlagPink(p)) { flag.sx += x; flag.sy += y; flag.c++; if (y > flag.maxY) flag.maxY = y; }
  }
  let pin = null;
  if (flag.c >= 4) {
    const fx = flag.sx / flag.c;
    let base = null;
    for (let y = Math.round(flag.sy / flag.c); y < Math.min(h, flag.maxY + 16); y++)
      for (let x = Math.max(0, Math.round(fx - 4)); x <= Math.min(w - 1, Math.round(fx + 6)); x++) {
        const p = px(hmap, x, y);
        if (p[0] < 70 && p[1] < 70 && p[2] < 70) base = { x, y };
      }
    if (!base) base = { x: fx, y: flag.maxY + 8 };
    pin = { gx: +((base.x - x0) / (x1 - x0)).toFixed(4), gy: +((base.y - y0) / (y1 - y0)).toFixed(4) };
  }

  // debug: mask outline + bbox + pin on the plain crop
  const dbg = { width: w, height: h, data: Buffer.from(plain.data) };
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; dbg.data[i] = c[0]; dbg.data[i + 1] = c[1]; dbg.data[i + 2] = c[2]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx];
    });
    if (edge) set(x, y, [230, 30, 30]);
  }
  for (let x = x0; x <= x1; x++) { set(x, y0, [40, 90, 220]); set(x, y1, [40, 90, 220]); }
  for (let y = y0; y <= y1; y++) { set(x0, y, [40, 90, 220]); set(x1, y, [40, 90, 220]); }
  if (pin) { const bx = x0 + pin.gx * (x1 - x0), by = y0 + pin.gy * (y1 - y0);
    for (let d = -5; d <= 5; d++) { set(Math.round(bx + d), Math.round(by), [255, 255, 0]); set(Math.round(bx), Math.round(by + d), [255, 255, 0]); } }

  // debug: height colormap + slope arrows
  const hv = { width: w, height: h, data: Buffer.alloc(w * h * 4, 255) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (mask[y * w + x]) { const v = Math.round(heightOf(px(hmap, x, y), lut) * 255); hv.data[i] = v; hv.data[i + 1] = v; hv.data[i + 2] = 60; }
    else { hv.data[i] = 235; hv.data[i + 1] = 235; hv.data[i + 2] = 235; }
    hv.data[i + 3] = 255;
  }
  const hset = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; hv.data[i] = c[0]; hv.data[i + 1] = c[1]; hv.data[i + 2] = c[2]; };
  for (let gy = 0; gy < GRID_N; gy++) for (let gx = 0; gx < GRID_N; gx++) {
    const [vx, vy] = grid[gy][gx];
    if (!vx && !vy) continue;
    const cx = x0 + (gx + 0.5) * cw, cy = y0 + (gy + 0.5) * ch, L = 9;
    for (let t = 0; t <= 1; t += 0.08) hset(Math.round(cx + vx * L * t), Math.round(cy + vy * L * t), [220, 30, 30]);
    hset(Math.round(cx), Math.round(cy), [0, 0, 255]);
  }

  return { plain, hmap, mask, bbox: { x0, y0, x1, y1 }, grid, pin, dbg, hv, maskSize: size, cellH, cellN };
}

const results = [];
for (let hole = 1; hole <= 21; hole++) {
  const frames = manifest.frames.filter((f) => f.hole === hole &&
    (f.frameType === "greenPlain" || f.frameType === "greenHeightmap"));
  const sess = sessions(frames).filter((s) =>
    s.some((f) => f.frameType === "greenPlain") && s.some((f) => f.frameType === "greenHeightmap"));
  if (!sess.length) { console.log(`H${hole}: no plain+heightmap pair`); continue; }
  const pins = [];
  const sessionDetails = [];
  const extracted = [];
  // PAIR EVERY FRAME, not just the first of each kind. This used to take
  // s.find(plain) + s.find(heightmap) and drop the rest, so a session with 5
  // plains and 8 heightmaps yielded ONE pair and 11 dead frames. Each
  // heightmap is matched to its nearest plain in time and vice versa (the
  // Terrain toggle means the counterpart is the adjacent capture); a frame
  // may serve in more than one pair, which is harmless — every pair is an
  // independent observation of a height field that never changes.
  const stamp = (f) => fileMs(f.originalFile ?? f.file) ?? 0;
  const pairsOf = (s) => {
    const plains = s.filter((f) => f.frameType === "greenPlain");
    const hmaps = s.filter((f) => f.frameType === "greenHeightmap");
    if (!plains.length || !hmaps.length) return [];
    const nearest = (f, pool) =>
      pool.reduce((best, c) => Math.abs(stamp(c) - stamp(f)) < Math.abs(stamp(best) - stamp(f)) ? c : best);
    const seen = new Set(), out = [];
    const push = (p, hm) => {
      const k = `${p.file}|${hm.file}`;
      if (seen.has(k)) return;
      seen.add(k); out.push([p.file, hm.file]);
    };
    for (const hm of hmaps) push(nearest(hm, plains), hm);
    for (const p of plains) push(p, nearest(p, hmaps));
    return out;
  };
  const pairs = sess.flatMap(pairsOf);
  for (const [plainF, hmapF] of pairs) {
    const r = extractPair(hole, plainF, hmapF);
    if (r.error) { console.log(`H${hole} pair ${plainF.slice(-12)}+${hmapF.slice(-12)}: ${r.error}`); continue; }
    // the zoom level grows as the player nears the green — a cropped green
    // (mask at the panel border) must never supply the grid
    const cw = r.plain.width, ch = r.plain.height;
    const cropped = r.bbox.x0 <= 1 || r.bbox.y0 <= 1 || r.bbox.x1 >= cw - 2 || r.bbox.y1 >= ch - 2;
    if (r.pin) {
      pins.push(r.pin);
      sessionDetails.push({ plain: plainF, hmap: hmapF, bboxPx: r.bbox, cropped,
        pinPx: { x: +(r.bbox.x0 + r.pin.gx * (r.bbox.x1 - r.bbox.x0)).toFixed(1),
                 y: +(r.bbox.y0 + r.pin.gy * (r.bbox.y1 - r.bbox.y0)).toFixed(1) } });
    }
    extracted.push({ r, plainF, hmapF, cropped, area: r.maskSize });
  }
  // grid source: FUSE cell heights across every uncropped session — the
  // height field never changes, sessions differ only in zoom (resolution)
  // and where the legend happened to occlude, so a weighted average both
  // denoises and fills legend holes. Grids are bbox-normalized, so cells
  // align across zoom levels.
  const clean = extracted.filter((e) => !e.cropped);
  const pool = clean.length ? clean : extracted;
  const final = pool.length ? pool.reduce((a, b) => (b.area > a.area ? b : a)) : null;
  let fusedGrid = null, fusedFrom = 0;
  if (pool.length) {
    const fusedH = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(null));
    for (let gy = 0; gy < GRID_N; gy++)
      for (let gx = 0; gx < GRID_N; gx++) {
        let sum = 0, wsum = 0;
        for (const e of pool) {
          const h = e.r.cellH[gy][gx], n = e.r.cellN[gy][gx];
          if (h != null && n > 0) { sum += h * n; wsum += n; }
        }
        if (wsum > 0) fusedH[gy][gx] = sum / wsum;
      }
    fusedGrid = slopeGrid(fusedH);
    fusedFrom = pool.length;
  }
  if (!final) continue;
  const { r } = final;
  const id = `h${String(hole).padStart(2, "0")}`;
  savePng(join(OUT, `${id}-mask.png`), r.dbg);
  savePng(join(OUT, `${id}-height.png`), r.hv);
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify({
    hole, sources: { plain: final.plainF, heightmap: final.hmapF },
    panelBbox: r.bbox, gridN: GRID_N, grid: fusedGrid ?? r.grid, fusedFrom,
    pins, sessions: sessionDetails,
    convention: "grid[row][col]=[dx,dy] downhill, +x right +y down, normalized to the green's own max slope; pin gx/gy fractional within bbox",
  }, null, 2));
  console.log(`H${hole}: mask=${r.maskSize}px bbox=[${r.bbox.x0},${r.bbox.y0}..${r.bbox.x1},${r.bbox.y1}] pins=${pins.length} ${pins.map((p) => `(${p.gx},${p.gy})`).join(" ")}`);
  results.push(hole);
}
console.log(`extracted ${results.length}/21 greens`);
