// The collision's height on the Green texture's full texel grid (top ground y where it is GolfGreen, else NaN),
// for overlaying its 0.1 m contour lines on the bake. node iso.mjs 9 21 7 10 -> iso-NN.f32 (H x W)
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const C = await import(pathToFileURL(REPO + "tools/lib/nsscol.mjs").href);
const DIR = REPO + "tools/harness/state/eden/nss-golf-x/collision";
for (const h of process.argv.slice(2).map(Number)) {
  const j = JSON.parse(fs.readFileSync(`green-${String(h).padStart(2, "0")}.json`, "utf8")), p = j.params, W = j.w, H = j.h;
  const x0 = p.GreenAreaCenterX - p.GreenAreaSizeX / 2, z0 = p.GreenAreaCenterZ - p.GreenAreaSizeZ / 2;
  const idx = C.gridIndex(C.loadCollision(DIR, h, { covers: true }), 2, { bbox: [x0 - 2, z0 - 2, x0 + p.GreenAreaSizeX + 2, z0 + p.GreenAreaSizeZ + 2] });
  const Y = new Float32Array(W * H).fill(NaN);
  for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) {
    const g = C.topGround(idx, x0 + (ii + 0.5) * p.GreenAreaSizeX / W, z0 + (jj + 0.5) * p.GreenAreaSizeZ / H);
    if (g && g.code === 18) Y[jj * W + ii] = g.y;
  }
  fs.writeFileSync(`iso-${String(h).padStart(2, "0")}.f32`, Buffer.from(Y.buffer));
  console.log("H" + h, "done");
}
