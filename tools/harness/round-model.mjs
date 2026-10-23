// The 3D model for Node: the physics are lib/model3d.mjs (shared with the
// browser's live solver, src/live3d.worker.js), re-exported here whole; this
// file adds what reads the extracted disc: the course's KCL (or the OBJ rips),
// the PMP's trees and the palm's mesh, set as the core's course loader.
// (The model's own description heads lib/model3d.mjs.)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, MESH_DIR, DERIVED, meshIdOf, mapToMesh, meshToMap } from "./lib/course.mjs";
import { parseObj } from "../lib/obj.mjs";

import { prismTri, packCourse, setCourseLoader } from "./lib/model3d.mjs";
export * from "./lib/model3d.mjs";

const { yaz0Decode, u8Files, pmpObjects } = await import(pathToFileURL(path.join(ROOT, "tools/wsr-pins.mjs")).href);
// the extracted disc (tools/wsr-pins.mjs's input): Stage/Shared2/glf_course_<id>.d
// holds each course's .kcl and .pmp as wszst unpacked them; Common/GlfScene/common.carc
// the palm's collision mesh
const DISC = process.env.WSR_EXTRACT ?? "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files";
const SHARED2 = path.join(DISC, "Stage", "Shared2");
const COMMON = path.join(DISC, "Common", "GlfScene", "common.carc");

// ---- KCL ----
function parseKcl(buf) {
  const pos = buf.readUInt32BE(0), nrm = buf.readUInt32BE(4), pri = buf.readUInt32BE(8), blk = buf.readUInt32BE(12);
  const thick = buf.readFloatBE(0x10);
  const n = (blk - pri - 0x10) / 0x10;
  const vec = (base, i) => [buf.readFloatBE(base + 12 * i), buf.readFloatBE(base + 12 * i + 4), buf.readFloatBE(base + 12 * i + 8)];
  const out = [];
  for (let i = 1; i <= n; i++) {
    const o = pri + 0x10 * i;
    const h = buf.readFloatBE(o);
    const p = vec(pos, buf.readUInt16BE(o + 4)), fn = vec(nrm, buf.readUInt16BE(o + 6));
    const e1 = vec(nrm, buf.readUInt16BE(o + 8)), e2 = vec(nrm, buf.readUInt16BE(o + 10)), e3 = vec(nrm, buf.readUInt16BE(o + 12));
    out.push({ h, p, fn, e1, e2, e3, attr: buf.readUInt16BE(o + 14) & 0x1f });
  }
  return { thick, prisms: out };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the same prisms from the wszst OBJ (when the disc is not extracted): edge
// planes through the triangle's edges, the face normal from its winding
function prismsFromObj(file) {
  const o = parseObj(file), out = [];
  for (let t = 0; t < o.tris.length / 3; t++) {
    const v = [0, 1, 2].map((k) => [0, 1, 2].map((c) => o.verts[3 * o.tris[3 * t + k] + c]));
    const fn = cross([v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]]);
    const m = Math.hypot(...fn);
    if (!(m > 1e-12)) continue;
    for (let c = 0; c < 3; c++) fn[c] /= m;
    // edges: e1 on v0-v2 (ca), e2 on v0-v1 (ab), e3 on v1-v2 (bc, at distance h from v0)
    const outward = (a, b, c) => { const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; let q = cross(e, fn); const l = Math.hypot(...q); q = q.map((x) => x / l); if (dot([c[0] - a[0], c[1] - a[1], c[2] - a[2]], q) > 0) q = q.map((x) => -x); return q; };
    const e1 = outward(v[0], v[2], v[1]), e2 = outward(v[0], v[1], v[2]), e3 = outward(v[1], v[2], v[0]);
    const h = dot([v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e3);
    out.push({ h, p: v[0], fn, e1, e2, e3, attr: o.groups[o.triGroup[t]].type ?? 0, tri: v.flat() });
  }
  return { thick: 5, prisms: out };
}

let PALM = null;   // WS2_glf_tree3.kcl, packed, when the disc is there
function palmMesh() {
  if (PALM !== null) return PALM;
  PALM = false;
  try {
    const files = u8Files(yaz0Decode(fs.readFileSync(COMMON)));
    const k = files.find((x) => /WS2_glf_tree3\.kcl$/i.test(x.path));
    if (k) {
      const { thick, prisms } = parseKcl(Buffer.from(k.data));
      for (const q of prisms) q.tri = prismTri(q);
      // types 0x11 trunk, 0x12 fronds (attr = flag & 0x1f keeps them apart)
      const n = prisms.length, PV = new Float64Array(3 * n), FN = new Float64Array(3 * n), E1 = new Float64Array(3 * n), E2 = new Float64Array(3 * n), E3 = new Float64Array(3 * n), H = new Float64Array(n), attr = new Uint8Array(n);
      prisms.forEach((q, i) => { for (let c = 0; c < 3; c++) { PV[3 * i + c] = q.p[c]; FN[3 * i + c] = q.fn[c]; E1[3 * i + c] = q.e1[c]; E2[3 * i + c] = q.e2[c]; E3[3 * i + c] = q.e3[c]; } H[i] = q.h; attr[i] = q.attr; });
      PALM = { n, PV, FN, E1, E2, E3, H, attr, thick };
    }
  } catch { PALM = false; }
  return PALM;
}

// every tree of the hole's PMP (k = its index among them, as tools/wsr-pins.json
// keeps them); id = the app's name for it, t<hole>-<index in derived.json's
// trees> (the trees on the map, as REPORT.md and the planner's tree check name
// them), else p<hole>-<k> for a tree off the map
function treesOf(hole, id) {
  const file = path.join(SHARED2, `glf_course_${id}.d`, `WS2_glf_course_${id}.pmp`);
  let trees;
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const { base, objs } = pmpObjects(buf);
    trees = objs.filter((o) => o.group === 2 && [2, 3, 6].includes(o.id)).map((o, k) => {
      const r = base + o.index * 0x58, M = [];
      for (let j = 0; j < 9; j++) M.push(buf.readFloatBE(r + 0x20 + 4 * j));
      return { x: o.pos[0], base: o.pos[1], z: o.pos[2], sx: o.scale[0], sy: o.scale[1], sz: o.scale[2], kind: o.id, M, k, src: "pmp" };
    });
  } else {
    const pins = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/wsr-pins.json"), "utf8"));
    trees = (pins.holes[hole].trees ?? []).map((tr, k) => {
      const [X, Z] = mapToMesh(hole, tr.x, tr.y);
      return { x: X, base: tr.meshY, z: Z, sx: tr.size, sy: tr.sy ?? tr.size, sz: tr.size, kind: tr.kind, M: null, k, src: "wsr-pins" };
    });
  }
  const app = DERIVED.holes?.[hole]?.trees ?? [];
  for (const t of trees) {
    const [fx, fy] = meshToMap(hole, t.x, t.z);
    let best = -1, bd = 0.0015;
    app.forEach((a, i) => { const d = Math.hypot(a.x - fx, a.y - fy); if (a.kind === t.kind && d < bd) { bd = d; best = i; } });
    t.id = best >= 0 ? `t${hole}-${best}` : `p${hole}-${t.k}`;
  }
  return trees;
}
// the hole's course as the disc has it, for the core (and its source, for tools/build-course3d.mjs)
export function courseSource(hole) {
  const id = meshIdOf(hole);
  const kclFile = path.join(SHARED2, `glf_course_${id}.d`, `WS2_glf_course_${id}.kcl`);
  let src, parsed;
  if (fs.existsSync(kclFile)) { parsed = parseKcl(fs.readFileSync(kclFile)); src = "kcl"; }
  else { parsed = prismsFromObj(path.join(MESH_DIR, `WS2_glf_course_${id}.kcl.obj`)); src = "obj"; }
  const trees = treesOf(hole, id);
  return { hole, id, src, thick: parsed.thick, prisms: parsed.prisms, trees, palm: trees.some((t) => t.kind === 6) ? palmMesh() : false };
}
setCourseLoader((hole) => { const s = courseSource(hole); return packCourse(s.prisms, s.thick, s); });
