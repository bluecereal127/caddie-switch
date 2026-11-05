// Adds every online ball to ctp-table.json: the spot through the near-pin matrix at each standing place of both tiers, each hand,
// grounded on the SR dump's collision (0x316b67c re-grounds a seat in this mode). Writes ctp-seats.json.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/";
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { loadCollision, gridIndex, topGround, NSS_CODES } = await imp("tools/lib/nsscol.mjs");
const P = await imp("src/platform.js");
const T = JSON.parse(fs.readFileSync("ctp-table.json", "utf8"));
const DUMP = REPO + "tools/harness/state/eden/sr-golf-x/collision";
const seats = [], seen = new Set();
for (let N = 1; N <= 8; N++) for (const tier of ["high", "low"]) for (const sx of P.tierStandXs(N, tier)) for (const [hand, o] of [["right", -0.9], ["left", 0.9]]) {
  const k = `${tier}|${sx}|${hand}`; if (seen.has(k)) continue; seen.add(k);
  seats.push({ tier, standX: sx, hand, lx: +(sx + o).toFixed(2), lz: P.TIER[tier].z });
}
seats.sort((a, b) => a.tier.localeCompare(b.tier) || b.standX - a.standX || a.hand.localeCompare(b.hand));
const out = {}; let mixed = 0, off = 0;
for (let h = 1; h <= 27; h++) {
  const idx = gridIndex(loadCollision(DUMP, h, { covers: true }), 4);
  out[h] = T[h].rows.map((r) => {
    const th = r.yawRad, zc = [-Math.sin(th), -Math.cos(th)], xc = [-Math.cos(th), Math.sin(th)];
    const balls = seats.map((s) => {
      const x = r.x + xc[0] * s.lx + zc[0] * s.lz, z = r.z + xc[1] * s.lx + zc[1] * s.lz, g = topGround(idx, x, z);
      return { ...s, x: +x.toFixed(3), y: g ? +g.y.toFixed(3) : null, z: +z.toFixed(3), surface: g ? NSS_CODES[g.code] : null };
    });
    const set = new Set(balls.map((b) => b.surface));
    if (set.size > 1) mixed++;
    if ([...set].some((s) => s !== r.surface)) off++;
    return balls;
  });
}
console.log(seats.length, "seat cases;", mixed, "of 81 spots have balls on more than one surface;", off, "have a ball on a surface other than the spot's");
fs.writeFileSync("ctp-seats.json", JSON.stringify(out));
