// public/course3d/ (GENERATED, committed): what the browser's live solver
// (src/live3d.worker.js) needs to run the harness's 3D model
// (tools/harness/lib/model3d.mjs) on a hole: WSR's collision prisms as the
// disc's KCL holds them (round-model.mjs courseSource: a vertex table, a
// normal table, per prism its height, five indices and its type), the hole's
// trees (the PMP's, as the model uses them), its pins in mesh units, and the
// registration between the map and the mesh; the palm's own mesh once, in
// palm.bin. Every number is a 32-bit float as the disc has it (refused
// otherwise), so the browser's packCourse rebuilds the harness's course to the
// bit. Per hole hNN.bin (little-endian: Float32 vertices, Float32 normals,
// Float32 heights, Uint16 or Uint32 indices, Uint8 types) and hNN.json; and
// index.json (sizes, SHA-1s). Rerun when the meshes or the model's loader change.
//   node tools/build-course3d.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "public", "course3d");
const RM = await import(pathToFileURL(path.join(HERE, "harness", "round-model.mjs")).href);
const PINS = JSON.parse(fs.readFileSync(path.join(HERE, "wsr-pins.json"), "utf8"));
const REG = JSON.parse(fs.readFileSync(path.join(HERE, "mesh-registration.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });
const f32 = (v) => { if (Math.fround(v) !== v) throw new Error(`not a 32-bit float: ${v}`); return v; };
const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");
// a little-endian file from typed arrays, each 4-byte aligned; their offsets
function pack(parts) {
  let size = 0; const offs = {};
  for (const [k, a] of parts) { size = Math.ceil(size / 4) * 4; offs[k] = size; size += a.byteLength; }
  const buf = Buffer.alloc(size);
  for (const [k, a] of parts) Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(buf, offs[k]);
  return { buf, offs };
}
const index = { version: 1, holes: {} };
let palmDone = false;
for (let hole = 1; hole <= 18; hole++) {
  const s = RM.courseSource(hole);
  if (s.src !== "kcl") throw new Error(`hole ${hole}: the course came from ${s.src}, not the disc's KCL`);
  const vk = new Map(), nk = new Map(), V = [], N = [];
  const vid = (p) => { const k = p.join(","); let i = vk.get(k); if (i == null) { i = V.length / 3; vk.set(k, i); V.push(f32(p[0]), f32(p[1]), f32(p[2])); } return i; };
  const nid = (p) => { const k = p.join(","); let i = nk.get(k); if (i == null) { i = N.length / 3; nk.set(k, i); N.push(f32(p[0]), f32(p[1]), f32(p[2])); } return i; };
  const n = s.prisms.length, H = new Float32Array(n), A = new Uint8Array(n), I = [];
  s.prisms.forEach((q, i) => { H[i] = f32(q.h); A[i] = q.attr; I.push(vid(q.p), nid(q.fn), nid(q.e1), nid(q.e2), nid(q.e3)); });
  const wide = Math.max(V.length / 3, N.length / 3) > 65535;
  const { buf, offs } = pack([["V", new Float32Array(V)], ["N", new Float32Array(N)], ["H", H], ["I", wide ? new Uint32Array(I) : new Uint16Array(I)], ["A", A]]);
  const hh = String(hole).padStart(2, "0");
  fs.writeFileSync(path.join(OUT, `h${hh}.bin`), buf);
  const pins = Object.fromEntries(PINS.holes[hole].spots.map((sp) => [`s${sp.slots[0]}`, sp.mesh]));
  const meta = { hole, id: s.id, thick: f32(s.thick), n, nv: V.length / 3, nn: N.length / 3, idx: wide ? "u32" : "u16", offs, bytes: buf.length,
    trees: s.trees.map(({ x, base, z, sx, sy, sz, kind, M, k, src, id }) => ({ x, base, z, sx, sy, sz, kind, M, k, src, id })),
    palm: !!s.palm, pins, reg: { m2f: REG.holes[hole].meshToMapFrac, f2m: REG.holes[hole].mapFracToMesh } };
  fs.writeFileSync(path.join(OUT, `h${hh}.json`), JSON.stringify(meta));
  index.holes[hole] = { bin: `h${hh}.bin`, json: `h${hh}.json`, bytes: buf.length, sha1: sha1(buf), prisms: n, palm: meta.palm };
  if (s.palm && !palmDone) {
    const P = s.palm;
    for (const k of ["PV", "FN", "E1", "E2", "E3", "H"]) for (const v of P[k]) f32(v);
    const { buf: pb, offs: po } = pack(["PV", "FN", "E1", "E2", "E3", "H"].map((k) => [k, new Float32Array(P[k])]).concat([["attr", P.attr]]));
    fs.writeFileSync(path.join(OUT, "palm.bin"), pb);
    index.palm = { bin: "palm.bin", n: P.n, thick: f32(P.thick), offs: po, bytes: pb.length, sha1: sha1(pb) };
    palmDone = true;
  }
  RM.dropCourse(hole);
  console.log(`hole ${hole}: ${n} prisms, ${V.length / 3} vertices, ${N.length / 3} normals, ${(buf.length / 1024).toFixed(0)} KB, ${s.trees.length} trees${s.palm ? ", palms" : ""}`);
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
