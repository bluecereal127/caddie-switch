// For every NSS hole: each covered texel (A < 8) of the Green capture texture (green-NN.rgba from dump.py), at its
// world point (texel centre over GreenAreaCenter +- GreenAreaSize / 2; row 0 = the -z edge), the collision's top
// ground there (the field mesh with the six HoleCovers, as the game's green); keeps texels whose top ground is
// GolfGreen (18). Writes samples-NN.f32 (r, g, b, a, y, x, z per texel) and prints the green's height range there
// against the capture window GreenAreaCenterY +- GreenAreaSizeY / 2.   node sample.mjs [step]
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const C = await import(pathToFileURL(REPO + "tools/lib/nsscol.mjs").href);
const DIR = REPO + "tools/harness/state/eden/nss-golf-x/collision";
const STEP = Number(process.argv[2] || 2);
for (let h = 1; h <= 21; h++) {
  const j = JSON.parse(fs.readFileSync(`green-${String(h).padStart(2, "0")}.json`, "utf8"));
  const tex = fs.readFileSync(`green-${String(h).padStart(2, "0")}.rgba`);
  const p = j.params, W = j.w, H = j.h;
  const x0 = p.GreenAreaCenterX - p.GreenAreaSizeX / 2, z0 = p.GreenAreaCenterZ - p.GreenAreaSizeZ / 2;
  const mesh = C.loadCollision(DIR, h, { covers: true });
  const idx = C.gridIndex(mesh, 2, { bbox: [x0 - 2, z0 - 2, x0 + p.GreenAreaSizeX + 2, z0 + p.GreenAreaSizeZ + 2] });
  const out = [];
  let ymin = Infinity, ymax = -Infinity, other = 0, none = 0;
  for (let jj = 0; jj < H; jj += STEP) for (let ii = 0; ii < W; ii += STEP) {
    const o = (jj * W + ii) * 4;
    if (tex[o + 3] >= 8) continue;
    const x = x0 + (ii + 0.5) * p.GreenAreaSizeX / W, z = z0 + (jj + 0.5) * p.GreenAreaSizeZ / H;
    const g = C.topGround(idx, x, z);
    if (!g) { none++; continue; }
    if (g.code !== 18) { other++; continue; }
    out.push(tex[o], tex[o + 1], tex[o + 2], tex[o + 3], g.y, x, z);
    if (g.y < ymin) ymin = g.y; if (g.y > ymax) ymax = g.y;
  }
  fs.writeFileSync(`samples-${String(h).padStart(2, "0")}.f32`, Buffer.from(new Float32Array(out).buffer));
  const lo = p.GreenAreaCenterY - p.GreenAreaSizeY / 2, hi = p.GreenAreaCenterY + p.GreenAreaSizeY / 2;
  console.log(`H${h}: ${out.length / 7} green texels (not green ${other}, no ground ${none}); green y ${ymin.toFixed(4)}..${ymax.toFixed(4)} (${(ymax - ymin).toFixed(4)} m) | window ${lo.toFixed(4)}..${hi.toFixed(4)} (${p.GreenAreaSizeY.toFixed(4)} m, centre ${p.GreenAreaCenterY.toFixed(4)}) | green mid ${((ymin + ymax) / 2).toFixed(4)}`);
}
