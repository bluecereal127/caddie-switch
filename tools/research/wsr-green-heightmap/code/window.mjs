// What sets each green's contour window? Per hole (course model):
// - the uv1 s coordinate fitted against x and z (a planar side projection would give s linear in one horizontal axis);
// - the height range of the green alone, of the green plus the fringe objects (M_Color) touching it (any vertex within 1 u
//   of a green vertex in x, z), of every M_Color vertex within 15 m of the green's bounding box, and of the fairway / rough
//   / Kiwa objects within that box; compared with the window (heights at t = 0 and t = 1);
// - the residuals of t = b*y + d: quantiles, and where the worst vertices lie (distance to the green's boundary, height).
import fs from "node:fs";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const UV = JSON.parse(fs.readFileSync("uvgreen.json", "utf8"));
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
function objVerts(model, obj) {
  const pos = model.vertices[obj.arrays.vertex];
  const sets = {};
  obj.arrays.uv.forEach((ai, k) => { if (ai >= 0 && obj.attrs.includes("uv" + k)) sets[k] = model.uvs[ai]; });
  const out = [];
  for (const p of obj.prims) for (const v of p.verts) {
    const i = v.pos * pos.comps;
    const r = { x: pos.data[i], y: pos.data[i + 1], z: pos.data[i + 2], uv: {} };
    for (const [k, arr] of Object.entries(sets)) { const j = v["uv" + k] * arr.comps; r.uv[k] = [arr.data[j], arr.comps === 2 ? arr.data[j + 1] : 0]; }
    out.push(r);
  }
  return out;
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  if (only && !only.includes(hole)) continue;
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_course_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const byMat = {};
  for (const d of [...m.draw.opa, ...m.draw.xlu]) { const mn = m.materials[d.mat].name; (byMat[mn] ??= []).push(...objVerts(m, m.objects[d.obj])); }
  const G = byMat.M_Green.filter((v) => v.uv[1]);
  const u = UV[hole].course, b = u.fitY.b, d = u.fitY.d;
  // s against x, z
  const fit = (rows, ys) => { const n = rows[0].length, A = Array.from({ length: n }, () => new Array(n).fill(0)), bb = new Array(n).fill(0); rows.forEach((r, i) => { for (let p = 0; p < n; p++) { bb[p] += r[p] * ys[i]; for (let qq = 0; qq < n; qq++) A[p][qq] += r[p] * r[qq]; } }); const M = A.map((r, i) => [...r, bb[i]]); for (let c = 0; c < n; c++) { let piv = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i; [M[c], M[piv]] = [M[piv], M[c]]; for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; } } const x = M.map((r, i) => r[n] / r[i]); let ss = 0; rows.forEach((r, i) => { const e = r.reduce((s, v, k) => s + v * x[k], 0) - ys[i]; ss += e * e; }); return { x, rms: Math.sqrt(ss / rows.length) }; };
  const sx = fit(G.map((v) => [v.x, v.z, 1]), G.map((v) => v.uv[1][0]));
  const xs = G.map((v) => v.x), zs = G.map((v) => v.z), ys = G.map((v) => v.y);
  const box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const near = (vs, r) => vs.filter((v) => v.x > box[0] - r && v.x < box[1] + r && v.z > box[2] - r && v.z < box[3] + r);
  const gset = new Set(G.map((v) => `${Math.round(v.x)},${Math.round(v.z)}`));
  const touching = (byMat.M_Color ?? []).filter((v) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (gset.has(`${Math.round(v.x) + dx},${Math.round(v.z) + dz}`)) return true; return false; });
  const rng = (vs) => (vs.length ? [Math.min(...vs.map((v) => v.y)), Math.max(...vs.map((v) => v.y))].map((v) => +v.toFixed(2)) : null);
  const win = [(1 - d) / b, -d / b].map((v) => +v.toFixed(2)); // [y at t=1 (low), y at t=0 (high)]
  const res = G.map((v) => v.uv[1][1] - (b * v.y + d));
  const absr = res.map(Math.abs);
  // the worst vertices: their height and t, and the height that t implies
  const worst = G.map((v, i) => ({ v, r: res[i] })).sort((a, c) => Math.abs(c.r) - Math.abs(a.r)).slice(0, 4).map(({ v, r }) => `(${v.x.toFixed(0)},${v.y.toFixed(2)},${v.z.toFixed(0)}) t ${v.uv[1][1].toFixed(3)} r ${r.toFixed(3)} -> y ${((v.uv[1][1] - d) / b).toFixed(2)}`);
  console.log(`H${hole} ${id}: window y ${win[0]}..${win[1]} (${((win[1] - win[0]) / 10).toFixed(2)} m) | green ${rng(G)} | +touching fringe ${rng([...G, ...touching])} (${touching.length} v) | fringe within 15 m ${rng(near(byMat.M_Color ?? [], 150))} | fairway within 15 m ${rng(near(byMat.M_Fairway ?? [], 150))} | rough within 15 m ${rng(near(byMat.M_Rough ?? [], 150))}`);
  console.log(`   s = ${sx.x[0].toExponential(3)} x + ${sx.x[1].toExponential(3)} z + ${sx.x[2].toFixed(3)} (rms ${sx.rms.toExponential(2)}); green x ${box[0].toFixed(0)}..${box[1].toFixed(0)} z ${box[2].toFixed(0)}..${box[3].toFixed(0)}`);
  console.log(`   |t residual| p50 ${q(absr, 0.5).toFixed(4)} p90 ${q(absr, 0.9).toFixed(4)} p99 ${q(absr, 0.99).toFixed(4)} max ${Math.max(...absr).toFixed(4)}; share > 0.5 band ${(absr.filter((a) => a > 0.5 / u.bands).length / absr.length).toFixed(3)}; worst ${worst.join("; ")}`);
}
