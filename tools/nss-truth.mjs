// Per-hole green truth from NSS's own collision meshes (the Switch game's
// Fld_GolfCourseNN field shapes, as the eden exporter dumps them), in the
// app's map frame (the 250x304 minimap, fractional coords) through
// tools/nss-registration.json, the one transform the cups, the platform and
// the terrain share (INTEGRATION.md D1). It replaces tools/wsr-truth.mjs as
// the source of the green geometry (the user's rule since 2026-10-24: NSS
// data replaces WSR data); tools/build-terrain.mjs reads it for the green
// grid's box and the yd per map px, tools/build-derived.mjs for the scale,
// green box / outline and slope grid it ships. wsr-truth.mjs stays for the
// WSR side (the minimap renderer, the Dolphin harness).
//
//   node tools/nss-truth.mjs [--collision tools/harness/state/eden/nss-golf-x/collision]
//        [--registration tools/nss-registration.json] [--out tools/nss-truth.json]
//
// The collision dump is git-ignored (on the dump machine only), so the output
// is committed. Reads per hole collision/hNN.json + hNN.bin (the field) and
// hNN-covers.bin (the six HoleCover plugs, code 18, which close the cups)
// through tools/lib/nsscol.mjs. Deterministic: doubles over the dump's
// float32 vertices, norms by Math.sqrt (never Math.hypot, whose bits are
// engine-defined), fixed decimals, a fixed key order.
//
// Per hole (wsr-truth.mjs's schema, less its tee and teePad: the app's tee
// stays the WSR start for now, INTEGRATION.md D3):
//   meshId     the NSS field shape, Fld_GolfCourseNN
//   scale      yd per map px: 1 / (sqrt(a^2 + b^2) * 0.9144), a, b the
//              registration's similarity (map px per NSS metre)
//   greenBox   bbox of the green's outline, map fractions
//   greenPoly  that outline: the boundary of the field's code-18 (GolfGreen)
//              triangles, its largest loop by area (the six cup rings, about
//              1.2 m round, and anything under 5 m of perimeter dropped),
//              simplified (Douglas-Peucker, 0.25 map px); the cups' covers
//              play no part in it
//   greenCentre the box's centre
//   grid       9x9 downhill slope vectors in the green-local frame (bbox-
//              normalized, +x right, +y down) as wsr-truth.mjs builds them:
//              cell-mean heights of 12x12 vertical rays per cell onto the
//              green (code 18, the covers included, so a ray over a cup reads
//              the green surface the cover restores, not the cup's bottom
//              0.30 m down), a cell counted when more than 12% of its rays
//              hit, central differences at the cells' physical spacing,
//              normalized to the green's own steepest cell
//   gridPct    the same vectors unnormalized, in percent slope (rise/run);
//              slopeMaxPct its steepest cell (the putt model's scale for an
//              edited grid, src/putt.js gridField), slopeMeanPct the mean
//   reliefYd   the green's height range: its code-18 vertices inside the
//              outline's box
//   greenCells the cells counted
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadCollision, gridIndex, topGround } from "./lib/nsscol.mjs";
import { regOf, nssToPx, mapToNss, ydPerPx, MAP_W, MAP_H, M_PER_YD } from "./lib/nssreg.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = {
  collision: join(ROOT, "tools/harness/state/eden/nss-golf-x/collision"),
  registration: join(ROOT, "tools/nss-registration.json"),
  out: join(ROOT, "tools/nss-truth.json"),
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--collision") opt.collision = resolve(args[++i]);
  else if (a === "--registration") opt.registration = resolve(args[++i]);
  else if (a === "--out") opt.out = resolve(args[++i]);
  else { console.error(`unknown argument ${a}\nusage: node tools/nss-truth.mjs [--collision dir] [--registration tools/nss-registration.json] [--out tools/nss-truth.json]`); process.exit(1); }
}
const GRID_N = 9, S = 12, CELL_MIN = 0.12; // 12x12 rays a cell; a cell counts above 12% hits
const MIN_LOOP_M = 5;                        // loops under 5 m of perimeter (the cup rings) are dropped
const DP_PX = 0.25;                          // outline simplification, map px
const GREEN = 18;
const r4 = (v) => +v.toFixed(4);
const len = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

// Douglas-Peucker on a closed ring (points in map px), split at the point
// farthest from the first (wsr-truth.mjs's simplifyRing, Math.sqrt for hypot)
function simplifyRing(pts, eps) {
  if (pts.length < 8) return pts;
  let b = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const d = len(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; b = i; } }
  const dp = (seg) => {
    if (seg.length < 3) return seg;
    const [p, q] = [seg[0], seg[seg.length - 1]];
    const L = len(q[0] - p[0], q[1] - p[1]) || 1e-9;
    let far = -1, fd = -1;
    for (let i = 1; i < seg.length - 1; i++) {
      const d = Math.abs((q[0] - p[0]) * (p[1] - seg[i][1]) - (p[0] - seg[i][0]) * (q[1] - p[1])) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (fd <= eps) return [p, q];
    const left = dp(seg.slice(0, far + 1)), right = dp(seg.slice(far));
    return [...left.slice(0, -1), ...right];
  };
  const h1 = dp(pts.slice(0, b + 1)), h2 = dp([...pts.slice(b), pts[0]]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

// boundary loops of the triangles t0 <= t < t1 whose surface is `code`:
// vertices welded by exact position (the dump's float32s), an edge used by
// one triangle is a boundary edge, and the loops are walked edge by edge
// (Hierholzer, as tools/lib/obj.mjs groupBoundaryLoops: a pinch vertex, an
// outline touching itself, stays in one loop). -> [{ pts: [[x, y, z]...],
// perim (m, in xz), area (m^2, |shoelace| in xz) }]
function boundaryLoops(mesh, t0, t1, code) {
  const V = mesh.verts, T = mesh.tris;
  const ids = new Map(), pos = [];
  const idOf = (vi) => {
    const k = `${V[vi * 3]},${V[vi * 3 + 1]},${V[vi * 3 + 2]}`;
    let id = ids.get(k);
    if (id === undefined) { id = pos.length; ids.set(k, id); pos.push([V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]]); }
    return id;
  };
  const ek = (p, q) => (p < q ? `${p},${q}` : `${q},${p}`);
  const edges = new Map();
  for (let t = t0; t < t1; t++) {
    if (mesh.surface[t] !== code) continue;
    const a = idOf(T[t * 3]), b = idOf(T[t * 3 + 1]), c = idOf(T[t * 3 + 2]);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) if (p !== q) edges.set(ek(p, q), (edges.get(ek(p, q)) || 0) + 1);
  }
  const adj = new Map();
  for (const [k, c] of edges) {
    if (c !== 1) continue;
    const [p, q] = k.split(",").map(Number);
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q); adj.get(q).push(p);
  }
  const used = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (!adj.get(start).some((w) => !used.has(ek(start, w)))) continue;
    const stack = [start], circuit = [];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const w = adj.get(v).find((u) => !used.has(ek(v, u)));
      if (w === undefined) circuit.push(stack.pop());
      else { used.add(ek(v, w)); stack.push(w); }
    }
    circuit.pop();
    if (circuit.length < 3) continue;
    let perim = 0, area2 = 0;
    for (let i = 0; i < circuit.length; i++) {
      const p = pos[circuit[i]], q = pos[circuit[(i + 1) % circuit.length]];
      perim += len(q[0] - p[0], q[2] - p[2]);
      area2 += p[0] * q[2] - q[0] * p[2];
    }
    loops.push({ pts: circuit.map((v) => pos[v]), perim, area: Math.abs(area2) / 2 });
  }
  return loops;
}

const REGJ = JSON.parse(readFileSync(opt.registration, "utf8"));
const out = {
  _note: "NSS collision-mesh green truth in the app's map frame (250x304 minimap, fractional coords). Generated by tools/nss-truth.mjs from the NSS field meshes (the eden dump's collision/hNN.bin + hNN-covers.bin) through tools/nss-registration.json; consumed by tools/build-terrain.mjs (green box, scale) and tools/build-derived.mjs. scale = yd per map px; greenPoly = the boundary of the field's GolfGreen (code 18) triangles, the cup rings dropped, Douglas-Peucker 0.25 px; grid = 9x9 [dx,dy] downhill, +x right +y down, normalized to the green's own steepest cell (wsr-truth.mjs's convention, physical spacing), from 12x12 vertical rays per cell onto the green with the six HoleCovers closing the cups; gridPct = the same in percent slope.",
  // the registration's text with LF line ends (a checkout under core.autocrlf may give it CRLF)
  source: { registrationSha1: sha1(Buffer.from(readFileSync(opt.registration, "utf8").replace(/\r\n/g, "\n"))), collision: {} },
  ydPerM: +(1 / M_PER_YD).toFixed(6),
  holes: {},
};

for (let n = 1; n <= 21; n++) {
  const reg = regOf(REGJ, n);
  const mesh = loadCollision(opt.collision, n, { covers: true });
  out.source.collision[n] = mesh.sha1;
  const field = mesh.parts.find((p) => p.name === "field");
  const toPx = (x, z) => { const { px, py } = nssToPx(reg, x, z); return [px, py]; };

  // ---- the outline ----
  const all = boundaryLoops(mesh, field.tri0, field.tri1, GREEN), loops = all.filter((l) => l.perim >= MIN_LOOP_M);
  const rings = all.filter((l) => l.perim < MIN_LOOP_M).map((l) => l.perim);
  if (!loops.length) throw new Error(`H${n}: no GolfGreen boundary loop`);
  loops.sort((a, b) => b.area - a.area);
  const main = loops[0];
  const ring = main.pts.map(([x, , z]) => toPx(x, z));
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of ring) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const greenBox = { x0: r4(bx0 / MAP_W), y0: r4(by0 / MAP_H), x1: r4(bx1 / MAP_W), y1: r4(by1 / MAP_H) };
  const poly = simplifyRing(ring, DP_PX).map(([x, y]) => [r4(x / MAP_W), r4(y / MAP_H)]);
  // the main loop's xz box, for the relief
  let mx0 = Infinity, mz0 = Infinity, mx1 = -Infinity, mz1 = -Infinity;
  for (const [x, , z] of main.pts) { mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); mz0 = Math.min(mz0, z); mz1 = Math.max(mz1, z); }
  let hMin = Infinity, hMax = -Infinity;
  for (let t = field.tri0; t < field.tri1; t++) {
    if (mesh.surface[t] !== GREEN) continue;
    for (let c = 0; c < 3; c++) {
      const vi = mesh.tris[t * 3 + c], x = mesh.verts[vi * 3], y = mesh.verts[vi * 3 + 1], z = mesh.verts[vi * 3 + 2];
      if (x < mx0 || x > mx1 || z < mz0 || z > mz1) continue;
      hMin = Math.min(hMin, y); hMax = Math.max(hMax, y);
    }
  }

  // ---- the 9x9 grid: rays onto the green, covers included ----
  const idx = gridIndex(mesh, 2, { codes: new Set([GREEN]) });
  const cellH = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(null));
  for (let gy = 0; gy < GRID_N; gy++) for (let gx = 0; gx < GRID_N; gx++) {
    let sum = 0, k = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const fx = greenBox.x0 + ((gx + (sx + 0.5) / S) / GRID_N) * (greenBox.x1 - greenBox.x0);
      const fy = greenBox.y0 + ((gy + (sy + 0.5) / S) / GRID_N) * (greenBox.y1 - greenBox.y0);
      const [x, z] = mapToNss(reg, fx, fy);
      const hit = topGround(idx, x, z, idx.codes);
      if (hit) { sum += hit.y; k++; }
    }
    if (k > CELL_MIN * S * S) cellH[gy][gx] = sum / k / M_PER_YD; // yd
  }
  const scale = ydPerPx(reg);
  const cwYd = ((greenBox.x1 - greenBox.x0) * MAP_W / GRID_N) * scale;
  const chYd = ((greenBox.y1 - greenBox.y0) * MAP_H / GRID_N) * scale;
  const at = (gy, gx) => (gy >= 0 && gy < GRID_N && gx >= 0 && gx < GRID_N ? cellH[gy][gx] : null);
  const vec = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(null));
  let maxMag = 0, sumMag = 0, nMag = 0;
  for (let gy = 0; gy < GRID_N; gy++) for (let gx = 0; gx < GRID_N; gx++) {
    const c = cellH[gy][gx];
    if (c == null) continue;
    const l = at(gy, gx - 1), rr = at(gy, gx + 1), u = at(gy - 1, gx), d = at(gy + 1, gx);
    const ddx = rr != null && l != null ? (rr - l) / (2 * cwYd) : rr != null ? (rr - c) / cwYd : l != null ? (c - l) / cwYd : 0;
    const ddy = d != null && u != null ? (d - u) / (2 * chYd) : d != null ? (d - c) / chYd : u != null ? (c - u) / chYd : 0;
    const vx = -ddx, vy = -ddy; // downhill, +y = map down (south)
    const m = len(vx, vy);
    vec[gy][gx] = [vx, vy]; maxMag = Math.max(maxMag, m); sumMag += m; nMag++;
  }
  const grid = vec.map((row) => row.map((v) => (v && maxMag > 1e-9 ? [+(v[0] / maxMag).toFixed(3), +(v[1] / maxMag).toFixed(3)] : [0, 0])));
  const gridPct = vec.map((row) => row.map((v) => (v ? [+(v[0] * 100).toFixed(2), +(v[1] * 100).toFixed(2)] : [0, 0])));

  out.holes[n] = {
    meshId: mesh.meta.shape, scale: +scale.toFixed(6), greenBox, greenPoly: poly,
    greenCentre: [r4((bx0 + bx1) / 2 / MAP_W), r4((by0 + by1) / 2 / MAP_H)],
    grid, gridPct,
    slopeMaxPct: +(maxMag * 100).toFixed(2), slopeMeanPct: nMag ? +((sumMag / nMag) * 100).toFixed(2) : 0,
    reliefYd: +((hMax - hMin) / M_PER_YD).toFixed(2), greenCells: nMag,
  };
  const others = loops.length - 1;
  console.log(`H${String(n).padStart(2)} ${mesh.meta.shape}: box ${bx0.toFixed(1)},${by0.toFixed(1)}..${bx1.toFixed(1)},${by1.toFixed(1)} px; outline ${ring.length} -> ${poly.length} pts (${main.perim.toFixed(1)} m round, ${main.area.toFixed(0)} m^2; ${rings.length} cup rings ${rings.length ? `${Math.min(...rings).toFixed(2)}-${Math.max(...rings).toFixed(2)} m` : ""} dropped${others ? `, and ${others} other loop(s) over ${MIN_LOOP_M} m` : ""}); cells ${nMag}; slope max ${(maxMag * 100).toFixed(2)}% mean ${nMag ? ((sumMag / nMag) * 100).toFixed(2) : "-"}%; relief ${((hMax - hMin) / M_PER_YD).toFixed(2)} yd; ${scale.toFixed(4)} yd/px`);
}
writeFileSync(opt.out, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${relative(ROOT, opt.out).startsWith("..") ? opt.out : relative(ROOT, opt.out)}`);
