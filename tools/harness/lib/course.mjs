// The course as the harness compares it: WSR's KCL coordinates (the game's
// RAM, 1 unit = 0.1 m, x east, y up, z south) against the app's map frame
// (tools/mesh-registration.json, a per-hole similarity transform) and two
// grounds to fly the port over:
// - the app's: public/terrain through src/terrain.js, exactly as the solver
//   and tools/test-rows.mjs build a line (src/model.js lineProfile), one
//   sample per 2 map px (3.5-5 yd);
// - the KCL's: the collision triangles themselves (captures/meshes/
//   wsr-kcl-obj, the wszst export of the disc's KCLs; gitignored, the user's
//   rip), the highest triangle under a point, sampled as finely as asked.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const REG = JSON.parse(readFileSync(join(ROOT, "tools/mesh-registration.json"), "utf8"));
const HOLES = JSON.parse(readFileSync(join(ROOT, "tools/mesh-holes.json"), "utf8"));
export const DERIVED = JSON.parse(readFileSync(join(ROOT, "public/derived.json"), "utf8"));
export const YD = 9.144;
export const MESH_DIR = join(ROOT, "captures/meshes/wsr-kcl-obj");

export const meshIdOf = (hole) => Object.entries(HOLES).find(([k, v]) => v === hole && k.startsWith("fc"))?.[0];

export function meshToMap(hole, X, Z) {
  const B = REG.holes[hole].meshToMapFrac;
  return [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]];
}
export function mapToMesh(hole, fx, fy) {
  const A = REG.holes[hole].mapFracToMesh;
  return [A[0][0] * fx + A[0][1] * fy + A[0][2], A[1][0] * fx + A[1][1] * fy + A[1][2]];
}
// a mesh direction (dx, dz) -> the app's bearing (deg, north-up, clockwise)
export function bearingOf(hole, dx, dz) {
  const B = REG.holes[hole].meshToMapFrac;
  const W = DERIVED.mapW, H = DERIVED.mapH;
  const px = (B[0][0] * dx + B[0][1] * dz) * W, py = (B[1][0] * dx + B[1][1] * dz) * H;
  const deg = (Math.atan2(px, -py) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// ---- the KCL triangles ----
// the attributes a ground query returns: what the contact routine resolves
// (0x1de5e) plus water 7 and valley 13, so a ball over water reads water
const SURF_MASK = 0x1de5e | (1 << 7) | (1 << 13);
const meshCache = new Map();
export async function kcl(hole) {
  if (meshCache.has(hole)) return meshCache.get(hole);
  const id = meshIdOf(hole);
  const path = join(MESH_DIR, `WS2_glf_course_${id}.kcl.obj`);
  if (!existsSync(path)) { meshCache.set(hole, null); return null; }
  const { parseObj } = await imp("tools/lib/obj.mjs");
  const o = parseObj(path);
  const nt = o.tris.length / 3;
  const tri = new Float64Array(nt * 9), attr = new Int16Array(nt), nrm = new Float64Array(nt * 3);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const v = o.tris[3 * t + k];
      for (let c = 0; c < 3; c++) tri[9 * t + 3 * k + c] = o.verts[3 * v + c];
    }
    const g = o.groups[o.triGroup[t]];
    attr[t] = g.type ?? 0;
    const ax = tri[9 * t], ay = tri[9 * t + 1], az = tri[9 * t + 2];
    const ux = tri[9 * t + 3] - ax, uy = tri[9 * t + 4] - ay, uz = tri[9 * t + 5] - az;
    const vx = tri[9 * t + 6] - ax, vy = tri[9 * t + 7] - ay, vz = tri[9 * t + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const m = Math.hypot(nx, ny, nz) || 1;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nrm[3 * t] = nx / m; nrm[3 * t + 1] = ny / m; nrm[3 * t + 2] = nz / m;
    for (let k = 0; k < 3; k++) {
      const x = tri[9 * t + 3 * k], z = tri[9 * t + 3 * k + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  // a uniform XZ grid of triangle lists
  const cell = 20;
  const gw = Math.ceil((maxX - minX) / cell) + 1, gh = Math.ceil((maxZ - minZ) / cell) + 1;
  const grid = Array.from({ length: gw * gh }, () => []);
  for (let t = 0; t < nt; t++) {
    // only what a ground query can return (the dead floor, attr 5, and the
    // like span the whole course and would sit in every cell)
    if (!((1 << attr[t]) & SURF_MASK)) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const x = tri[9 * t + 3 * k], z = tri[9 * t + 3 * k + 2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    for (let gx = Math.floor((x0 - minX) / cell); gx <= Math.floor((x1 - minX) / cell); gx++)
      for (let gz = Math.floor((z0 - minZ) / cell); gz <= Math.floor((z1 - minZ) / cell); gz++) grid[gz * gw + gx].push(t);
  }
  const m = { hole, id, nt, tri, attr, nrm, grid, cell, gw, gh, minX, minZ };
  meshCache.set(hole, m);
  return m;
}

export function dropMesh(hole) { meshCache.delete(hole); }

// the triangles whose XZ box can hold (x, z), within pad units
export function cellTris(m, x, z) {
  const gx = Math.floor((x - m.minX) / m.cell), gz = Math.floor((z - m.minZ) / m.cell);
  if (gx < 0 || gz < 0 || gx >= m.gw || gz >= m.gh) return [];
  return m.grid[gz * m.gw + gx];
}

// highest triangle under (x, z) whose attribute is in `mask` (default: any
// the contact routine resolves, 0x1de5e, plus water 7 and valley 13 so a
// ball over water reads water); returns { y, attr, n: [nx, ny, nz] } or null
export function groundAt(m, x, z, { yMax = Infinity, mask = SURF_MASK, skipWallAbove = Infinity } = {}) {
  let best = null;
  for (const t of cellTris(m, x, z)) {
    if (!((1 << m.attr[t]) & mask)) continue;
    const o = 9 * t;
    const ax = m.tri[o], az = m.tri[o + 2], bx = m.tri[o + 3], bz = m.tri[o + 5], cx = m.tri[o + 6], cz = m.tri[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * m.tri[o + 1] + l2 * m.tri[o + 4] + l3 * m.tri[o + 7];
    if (y > yMax) continue;
    if (m.attr[t] === 12 && y > skipWallAbove) continue;
    if (!best || y > best.y) best = { y, attr: m.attr[t], n: [m.nrm[3 * t], m.nrm[3 * t + 1], m.nrm[3 * t + 2]], t };
  }
  return best;
}

// the lowest surface (in SURF_MASK) above y at (x, z)
export function lowestAbove(m, x, z, y) {
  let best = null;
  for (const t of cellTris(m, x, z)) {
    if (!((1 << m.attr[t]) & SURF_MASK)) continue;
    const o = 9 * t;
    const ax = m.tri[o], az = m.tri[o + 2], bx = m.tri[o + 3], bz = m.tri[o + 5], cx = m.tri[o + 6], cz = m.tri[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const yy = l1 * m.tri[o + 1] + l2 * m.tri[o + 4] + l3 * m.tri[o + 7];
    if (yy <= y) continue;
    if (!best || yy < best.y) best = { y: yy, attr: m.attr[t], n: [m.nrm[3 * t], m.nrm[3 * t + 1], m.nrm[3 * t + 2]], t };
  }
  return best;
}

export const ATTR_LIE = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "tee", 4: "outer", 7: "water", 12: "wall", 13: "valley", 16: "bunker" };

// ---- the port's profiles along a line from (X0, Z0) in mesh units, unit direction (dx, dz) ----
const PROF_STEP = 0.25, PROF_BACK = 8, PROF_LEN = 500;

// the exact KCL ground (highest triangle under each sample), heights in yd
// relative to the ground under the ball, the lie per sample; the same shape
// as src/model.js's profile ({ h, lies, n, i0 }) so simProfile() takes it
// The ground along a line is the highest surface under each sample, except
// rock walls (KCL class 12) more than CLIMB above the previous sample: hole
// 20's tee line passes under wall triangles 27-40 yd up at 36-44 yd out, and
// "highest" put a 34 yd cliff in front of a driver WSR flies under. Walls
// within CLIMB (a bank's face, climbed sample by sample) and every other
// class count, so a bank whose face is vertical still lifts the line onto
// its top (hole 8: the green 7 yd above the lake surface, which runs under
// the whole hole; following the lower layer missed the green).
const CLIMB = 3 * YD;
export async function kclProfile(hole, X0, Z0, dx, dz, { step = PROF_STEP } = {}) {
  const m = await kcl(hole);
  if (!m) return null;
  const g0 = groundAt(m, X0, Z0);
  const i0 = Math.round(PROF_BACK / step), n = i0 + Math.round(PROF_LEN / step) + 1;
  const h = new Float64Array(n), lies = new Array(n);
  const follow = (from, to, dir) => {
    let prev = g0.y;
    for (let i = from; i !== to; i += dir) {
      const yd = (i - i0) * step;
      const px = X0 + dx * yd * YD, pz = Z0 + dz * yd * YD;
      const g = groundAt(m, px, pz, { skipWallAbove: prev + CLIMB });
      h[i] = g ? (g.y - g0.y) / YD : NaN;
      lies[i] = g ? ATTR_LIE[g.attr] ?? null : null;
      if (g) prev = g.y;
    }
  };
  follow(i0, n, 1);
  follow(i0 - 1, -1, -1);
  for (let i = i0 + 1; i < n; i++) if (Number.isNaN(h[i])) h[i] = h[i - 1];
  for (let i = i0 - 1; i >= 0; i--) if (Number.isNaN(h[i])) h[i] = h[i + 1];
  return { h, lies, n, i0, step, ground0: g0 };
}

// the app's profile: public/terrain along the same line, built the way
// tools/test-rows.mjs and the solver build it
export async function appProfile(hole, X0, Z0, dx, dz) {
  const { lineProfile } = await imp("src/model.js");
  const { parseTerrain, heightAt, classAt, lieOf } = await imp("src/terrain.js");
  const t = parseTerrain(readFileSync(join(ROOT, `public/terrain/h${String(hole).padStart(2, "0")}.bin`)));
  const [fx, fy] = meshToMap(hole, X0, Z0);
  const th = (bearingOf(hole, dx, dz) * Math.PI) / 180, sc = DERIVED.holes[hole].scale;
  const W = DERIVED.mapW, H = DERIVED.mapH;
  const at = (yd) => [fx + (Math.sin(th) * yd) / sc / W, fy - (Math.cos(th) * yd) / sc / H];
  const h0 = heightAt(t, fx, fy);
  const prof = lineProfile({ surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const hh = heightAt(t, ...at(yd)); return hh == null ? null : hh - h0; } });
  return { prof, pos: [fx, fy], bearing: (th * 180) / Math.PI, h0 };
}

// a profile of the src/model.js shape -> src/wsrsim.js run()'s profile, k = 1
export function simOf(prof) {
  const step = prof.step ?? PROF_STEP;
  const { h, lies, n, i0 } = prof;
  const hAt = (yd) => {
    const u = yd / step + i0;
    if (!(u > 0)) return h[0];
    if (u >= n - 1) return h[n - 1];
    const i = Math.floor(u);
    return h[i] + (h[i + 1] - h[i]) * (u - i);
  };
  return {
    heightAt: hAt,
    surfaceAt: (yd) => { const i = Math.round(yd / step) + i0; return lies[i < 0 ? 0 : i >= n ? n - 1 : i]; },
  };
}
