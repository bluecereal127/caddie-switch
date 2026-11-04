// The Terrain view of Switch Sports Resort against the true heights, on the holes SR shares with NSS (1-18).
// Frames: lab/live/greenzoom/*-hN-*.png (the capture card's 1280x720 frames the advisor kept). Per frame: the Terrain
// legend must be up; the overlays painted out (greenzoom's cleaned); the green's outline registered on the hole's
// polygon (greenfit's fitGreen: panel X = X0 + sx fx 250, Y = Y0 + sy fy 304); every panel pixel well inside the green
// (its height node and the eight around it masked) gives (R, G, B, y): y the collision height at that map spot
// (public/terrain/gNN.bin, NSS metres). Writes sr-samples-NN.f32 (r, g, b, y, frame) and prints the frames used.
//   node srband.mjs [max frames per hole]
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const imp = (p) => import(pathToFileURL(p).href);
const { loadImage } = await imp(REPO + "tools/lib/image.mjs");
const { parseGreenHeights, greenHeightAt } = await imp(REPO + "src/terrain.js");
const E = REPO + "tools/harness/state/eden/";
const GZ = await imp(E + "tools-r6/greenzoom.mjs"), GF = await imp(E + "tools-r6/greenfit.mjs");
const DIR = process.env.FRAMES ?? E + "lab/live/greenzoom/";
const MAXF = Number(process.argv[2] || 14), M = 0.9144;
const files = fs.readdirSync(DIR).filter((f) => /-h(\d+)-.*\.png$/.test(f) || /-h(\d+)\.png$/.test(f));
const byHole = {};
for (const f of files) { const h = +f.match(/-h(\d+)[-.]/)[1]; if (h >= 1 && h <= 18) (byHole[h] ??= []).push(f); }
const { x0: PX0, y0: PY0, x1: PX1, y1: PY1 } = GZ.PANE;
const summary = [];
for (let h = 1; h <= 18; h++) {
  const nn = String(h).padStart(2, "0");
  const g = parseGreenHeights(fs.readFileSync(REPO + `public/terrain/g${nn}.bin`));
  const inner = (fx, fy) => {
    const i = Math.round(((fx - g.box.x0) / (g.box.x1 - g.box.x0)) * (g.w - 1)), j = Math.round(((fy - g.box.y0) / (g.box.y1 - g.box.y0)) * (g.h - 1));
    if (i < 1 || j < 1 || i >= g.w - 1 || j >= g.h - 1) return false;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h || !g.mask[jj * g.w + ii]) return false; }
    return true;
  };
  const fits = [];
  for (const f of byHole[h] ?? []) {
    let im; try { im = loadImage(DIR + f); } catch { continue; }
    if (!GZ.terrainLegend(im)) continue;
    const clean = GZ.cleaned(im, null);
    const fit = GF.fitGreen(clean, { hole: h });
    if (!fit.ok || fit.kind !== "heat" || fit.rmsPx > 1.6 || fit.clipped) continue;
    fits.push({ f, sx: fit.sx, clean, fit });
  }
  fits.sort((a, b) => b.sx - a.sx);
  const use = fits.slice(0, MAXF);
  const out = [];
  use.forEach(({ clean, fit }, fi) => {
    for (let Y = PY0 + 1; Y < PY1 - 1; Y += 2) for (let X = PX0 + 1; X < PX1 - 1; X += 2) {
      const { x, y } = fit.toMap(X, Y);
      if (!inner(x, y)) continue;
      const hy = greenHeightAt(g, x, y);
      if (hy == null) continue;
      const i = (Y * clean.width + X) * 4;
      out.push(clean.data[i], clean.data[i + 1], clean.data[i + 2], hy * M, fi);
    }
  });
  fs.writeFileSync(`sr-samples-${nn}.f32`, Buffer.from(new Float32Array(out).buffer));
  summary.push({ h, frames: (byHole[h] ?? []).length, fitted: fits.length, used: use.length, zoom: use.length ? +use[0].sx.toFixed(2) : null, px: out.length / 5 });
  console.log(`H${h}: ${(byHole[h] ?? []).length} frames, ${fits.length} Terrain views fitted, ${use.length} used (best ${use.length ? use[0].sx.toFixed(1) : "-"} panel px a map px), ${out.length / 5} samples`);
}
fs.writeFileSync("sr-summary.json", JSON.stringify(summary, null, 1));
