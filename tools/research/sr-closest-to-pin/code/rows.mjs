import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/";
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { loadCollision, gridIndex, topGround, NSS_CODES } = await imp("tools/lib/nsscol.mjs");
const T = JSON.parse(fs.readFileSync("ctp-table.json", "utf8"));
let clean = 0; const bad = [], near = [];
for (let h = 1; h <= 27; h++) {
  const idx = gridIndex(loadCollision(REPO + "tools/harness/state/eden/sr-golf-x/collision", h, { covers: true }), 4);
  T[h].rows.forEach((r, n) => {
    const th = r.yawRad, zc = [-Math.sin(th), -Math.cos(th)], xc = [-Math.cos(th), Math.sin(th)];
    let hit = null;
    for (const lz of [-1.5, 2]) for (let lx = -4.35; lx <= 4.3501; lx += 0.05) {
      const g = topGround(idx, r.x + xc[0] * lx + zc[0] * lz, r.z + xc[1] * lx + zc[1] * lz);
      if (!g || NSS_CODES[g.code] !== r.surface) { if (!hit || Math.abs(lx) < Math.abs(hit.lx)) hit = { lx: +lx.toFixed(2), lz, c: g ? NSS_CODES[g.code] : "none" }; }
    }
    if (hit) bad.push(`H${h}#${n + 1} ${r.surface} -> ${hit.c} at lx ${hit.lx} lz ${hit.lz}`); else clean++;
    // the nearest change's direction against the line
    let best = null;
    for (let a = 0; a < 72 && !0; a++) for (let d = 0.25; d < 8; d += 0.25) {
      const A = a * Math.PI / 36, lx = d * Math.cos(A), lz = d * Math.sin(A);
      const g = topGround(idx, r.x + xc[0] * lx + zc[0] * lz, r.z + xc[1] * lx + zc[1] * lz);
      if (!g || NSS_CODES[g.code] !== r.surface) { if (!best || d < best.d) best = { d, lx: +lx.toFixed(1), lz: +lz.toFixed(1) }; break; }
    }
    if (best && best.d < 4) near.push(`H${h}#${n + 1} ${best.d} m at local (${best.lx}, ${best.lz})`);
  });
}
console.log(clean, "of 81 seat rows wholly on the spot's surface"); console.log(bad.join("\n")); console.log("nearest changes under 4 m:", near.join("; "));
