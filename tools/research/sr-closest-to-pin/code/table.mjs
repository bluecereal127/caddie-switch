// The 81 NearPinOBJ spots of Switch Sports Resort against the shipped registration, cups and the SR dump's collision.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/";
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { loadCollision, gridIndex, topGround, rayHits, NSS_CODES } = await imp("tools/lib/nsscol.mjs");
const { regOf, nssToMap, nssToPx, M_PER_YD } = await imp("tools/lib/nssreg.mjs");
const reg = JSON.parse(fs.readFileSync(REPO + "tools/nss-registration.json", "utf8"));
const pins = JSON.parse(fs.readFileSync(REPO + "tools/nss-pins.json", "utf8")).holes;
const plat = JSON.parse(fs.readFileSync(REPO + "tools/nss-platform.json", "utf8")).holes;
const scene = JSON.parse(fs.readFileSync("nearpin-scene.json", "utf8"));
const prefab = JSON.parse(fs.readFileSync("nearpin-raw.json", "utf8"));
const DUMP = REPO + "tools/harness/state/eden/sr-golf-x/collision";
const name = (c) => NSS_CODES[c] ?? c;
const out = {}; let same = 0, tot = 0, tilted = 0;
for (let h = 1; h <= 27; h++) {
  const R = regOf(reg, h), P = pins[h];
  const col = loadCollision(DUMP, h, { covers: true });
  const idx = gridIndex(col, 4);
  const rows = [];
  scene[h].forEach((a, i) => {
    const b = prefab[h][i], T = a.Translate ?? [0, 0, 0], Q = a.Rotate ?? [0, 0, 0];
    tot++;
    const eq = JSON.stringify(a.Translate) === JSON.stringify(b.Translate) && JSON.stringify(a.Rotate) === JSON.stringify(b.Rotate);
    if (eq) same++; else console.log("hole", h, i, "scene != prefab", a.Translate, b.Translate);
    if (Q[0] || Q[2]) tilted++;
    const [x, y, z] = T, th = Q[1];
    const g = topGround(idx, x, z);
    const fwd = [-Math.sin(th), -Math.cos(th)];        // the 180 degree turn of 0x316db80: forward = -(actor +z)
    const bearing = (Math.atan2(fwd[0], -fwd[1]) * 180 / Math.PI + 360) % 360;
    const near = (yy) => rayHits(idx, x, z).filter((r) => Math.abs(r.y - yy) <= 2);
    const cups = P.cups.map((c) => {
      const dx = c.world[0] - x, dz = c.world[2] - z, d = Math.sqrt(dx * dx + dz * dz);
      const cb = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      return { k: c.k, m: +d.toFixed(2), yd: +(d / M_PER_YD).toFixed(1), ft: +(d / 0.3048).toFixed(1), off: +(((cb - bearing + 540) % 360) - 180).toFixed(1), dy: +(c.surfaceY - (g?.y ?? y)).toFixed(2), difficult: c.difficult };
    });
    const m = nssToMap(R, x, z);
    rows.push({ i, x, y, z, yawRad: th, facingDeg: +bearing.toFixed(2), groundY: g ? +g.y.toFixed(3) : null, surface: g ? name(g.code) : null, dyGround: g ? +(y - g.y).toFixed(3) : null, hits2: near(y).map((r) => name(r.code)), mapX: +m[0]?.toFixed?.(5) || +m.x?.toFixed(5), mapY: +m[1]?.toFixed?.(5) || +m.y?.toFixed(5), cups });
  });
  rows.sort((p, q) => Math.min(...p.cups.map((c) => c.m)) - Math.min(...q.cups.map((c) => c.m)));
  out[h] = { par: P.par, rows, tee: P.tees?.teeObj?.world ?? null, rotate: P.tees?.rotateObj?.world ?? null };
  const t = out[h];
  console.log(`H${h} par ${P.par}`);
  for (const r of rows) {
    const ds = r.cups.map((c) => c.yd), lo = Math.min(...ds), hi = Math.max(...ds);
    const offs = r.cups.map((c) => c.off);
    console.log(`  #${r.i} (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}) ground ${r.groundY} ${r.surface} dy ${r.dyGround} | facing ${r.facingDeg} | map ${r.mapX}, ${r.mapY} | cups ${lo}-${hi} yd | off ${Math.min(...offs)}..${Math.max(...offs)}`);
  }
}
console.log(tot, "actors,", same, "scene = prefab; tilted", tilted);
fs.writeFileSync("ctp-table.json", JSON.stringify(out, null, 1));
