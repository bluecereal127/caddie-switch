import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/";
const P = await import(pathToFileURL(REPO + "src/platform.js").href);
const T = JSON.parse(fs.readFileSync("ctp-table.json", "utf8"));
const pins = JSON.parse(fs.readFileSync(REPO + "tools/nss-pins.json", "utf8")).holes;
const seats = [{ tag: "spot itself", lx: 0, lz: 0 }];
const seen = new Set();
for (let N = 1; N <= 8; N++) for (const tier of ["high", "low"]) P.tierStandXs(N, tier).forEach((sx) => { for (const [hand, o] of [["R", -0.9], ["L", 0.9]]) { const k = tier + sx + hand; if (seen.has(k)) continue; seen.add(k); seats.push({ tag: `${tier} x${sx.toFixed(2)} ${hand}`, lx: sx + o, lz: P.TIER[tier].z }); } });
for (const ft of process.argv.slice(2).map(Number)) {
  const best = [];
  for (let h = 1; h <= 27; h++) for (const r of T[h].rows) {
    const th = r.yawRad, zc = [-Math.sin(th), -Math.cos(th)], xc = [-Math.cos(th), Math.sin(th)];
    for (const c of pins[h].cups) for (const s of seats) {
      const x = r.x + xc[0] * s.lx + zc[0] * s.lz, z = r.z + xc[1] * s.lx + zc[1] * s.lz;
      const d = Math.sqrt((c.world[0] - x) ** 2 + (c.world[2] - z) ** 2) / 0.3048;
      if (Math.abs(d - ft) < 0.6) best.push({ h, spot: r.i, facing: r.facingDeg, surf: r.surface, cup: c.k + 1, seat: s.tag, d: +d.toFixed(2) });
    }
  }
  console.log("==", ft, "ft:", best.length);
  best.sort((a, b) => Math.abs(a.d - ft) - Math.abs(b.d - ft));
  for (const b of best.slice(0, 22)) console.log("  ", JSON.stringify(b));
}
// hole 23's read
const r = T[23].rows.find((q) => q.i === 1), c = pins[23].cups[5];
console.log("H23 spot #1 raw to cup 6:", (Math.hypot(c.world[0]-r.x, c.world[2]-r.z)/0.3048).toFixed(2), "ft; read ball to cup:", (Math.hypot(c.world[0]+16.57, c.world[2]+328.09)/0.3048).toFixed(2));
