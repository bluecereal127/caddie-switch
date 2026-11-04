// SR's Special greens (holes 19-22, 26, 27: no mesh): the Terrain frames lab/live/greens-sr/*-srN-heat*.png; per frame the
// heat paint's pixels (greenfit's greenMask, overlays painted out by greenzoom's cleaned, legend and dials left out) ->
// sr-special.json { hole: [{ file, n, px: [r, g, b, ...] }] }; pixels from masks of at least 900 px only.
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const imp = (p) => import(pathToFileURL(p).href);
const { loadImage } = await imp(ROOT + "tools/lib/image.mjs");
const E = ROOT + "tools/harness/state/eden/";
const GZ = await imp(E + "tools-r6/greenzoom.mjs"), GF = await imp(E + "tools-r6/greenfit.mjs");
const DIR = E + "lab/live/greens-sr/";
const { x0: PX0, y0: PY0, x1: PX1, y1: PY1 } = GZ.PANE;
const covered = (X, Y) => (X < 1052 && Y < 342) || [[1057, 486.5], [1221, 486.5]].some(([cx, cy]) => (X - cx) ** 2 + (Y - cy) ** 2 < 36 * 36 || (Math.abs(X - cx) < 42 && Y > cy && Y < cy + 50));
const out = {};
for (const f of fs.readdirSync(DIR).sort()) {
  const m = f.match(/-sr(\d+)-heat/); if (!m) continue;
  const h = +m[1];
  const im = loadImage(DIR + f);
  if (!GZ.terrainLegend(im)) continue;
  const clean = GZ.cleaned(im, null), gm = GF.greenMask(clean);
  if (!gm || gm.kind !== "heat" || gm.n < 900) continue;
  const w = PX1 - PX0, px = [];
  // erode the mask by 2 px so the blend at the green's edge stays out
  const M = gm.mask, H = PY1 - PY0, er = new Uint8Array(M.length);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < w - 2; x++) { let ok = 1; for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (!M[(y + dy) * w + x + dx]) { ok = 0; break; } er[y * w + x] = ok; }
  for (let y = 0; y < H; y += 2) for (let x = 0; x < w; x += 2) {
    if (!er[y * w + x]) continue;
    const X = PX0 + x, Y = PY0 + y; if (covered(X, Y)) continue;
    const i = (Y * clean.width + X) * 4; px.push(clean.data[i], clean.data[i + 1], clean.data[i + 2]);
  }
  (out[h] ??= []).push({ file: f, n: px.length / 3, box: gm.box, clipped: gm.clipped, px });
}
fs.writeFileSync("sr-special.json", JSON.stringify(out));
for (const [h, a] of Object.entries(out)) console.log(`hole ${h}: ${a.length} Terrain frames with a green blob, ${a.reduce((s, r) => s + r.n, 0)} px`);
