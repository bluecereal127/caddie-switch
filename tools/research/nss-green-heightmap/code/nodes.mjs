// Per hole: the green height grid's nodes (public/terrain/gNN.bin) with their NSS world (x, z), true height (m above
// the green's z0) and mask -> nodes-NN.f32 (x, z, y, mask per node) + nodes-NN.json {w, h}.
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { parseGreenHeights } = await imp("src/terrain.js");
const { regOf, mapToNss } = await imp("tools/lib/nssreg.mjs");
const REG = JSON.parse(fs.readFileSync(REPO + "tools/nss-registration.json", "utf8"));
const M = 0.9144;
for (let h = 1; h <= 21; h++) {
  const nn = String(h).padStart(2, "0");
  const g = parseGreenHeights(fs.readFileSync(REPO + `public/terrain/g${nn}.bin`));
  const reg = regOf(REG, h);
  const out = new Float32Array(g.w * g.h * 4);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const k = j * g.w + i;
    const fx = g.box.x0 + (i / (g.w - 1)) * (g.box.x1 - g.box.x0), fy = g.box.y0 + (j / (g.h - 1)) * (g.box.y1 - g.box.y0);
    const w = mapToNss(reg, fx, fy);
    const x = w.x ?? w[0], z = w.z ?? w[1];
    out[k * 4] = x; out[k * 4 + 1] = z; out[k * 4 + 2] = (g.z0Yd + g.data[k] * g.unitYd) * M; out[k * 4 + 3] = g.mask[k];
  }
  fs.writeFileSync(`nodes-${nn}.f32`, Buffer.from(out.buffer));
  fs.writeFileSync(`nodes-${nn}.json`, JSON.stringify({ w: g.w, h: g.h, stepYd: g.stepYd, z0Yd: g.z0Yd, unitYd: g.unitYd }));
}
console.log("ok");
