import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/";
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { loadCollision, gridIndex, topGround, NSS_CODES } = await imp("tools/lib/nsscol.mjs");
const T = JSON.parse(fs.readFileSync("ctp-table.json", "utf8")), B = JSON.parse(fs.readFileSync("ctp-seats.json", "utf8"));
const rad = [];
for (let h = 1; h <= 27; h++) {
  const idx = gridIndex(loadCollision(REPO + "tools/harness/state/eden/sr-golf-x/collision", h, { covers: true }), 4);
  T[h].rows.forEach((r, n) => {
    let best = 99;
    for (let a = 0; a < 72; a++) for (let d = 0.25; d < Math.min(best, 30); d += 0.25) {
      const g = topGround(idx, r.x + d * Math.cos(a * Math.PI / 36), r.z + d * Math.sin(a * Math.PI / 36));
      if (!g || NSS_CODES[g.code] !== r.surface) { if (d < best) best = d; break; }
    }
    rad.push({ h, n: n + 1, s: r.surface, best });
  });
  if (h === 1) { const b = B[1][0]; console.log("H1 spot1 balls:", b.slice(0, 4).map((q) => [q.tier, q.standX, q.hand, q.x, q.z, q.surface].join(" "))); }
}
rad.sort((a, b) => a.best - b.best);
console.log("closest other surface, m:", rad.slice(0, 14).map((r) => `H${r.h}#${r.n} ${r.s.replace("Golf", "")} ${r.best}`).join("; "));
const v = rad.map((r) => r.best); console.log("median", v[40], "min", v[0], "under 5 m:", v.filter((x) => x < 5).length);
