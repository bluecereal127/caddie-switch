// The green's contour coordinate: per hole and model (course / map), the M_Green objects' vertices (x, y, z, uv1 s, t),
// least-squares fits t = b*y + d and t = a*x + b*y + c*z + d (rms, max residual), the green's height range, t's range,
// the window (heights at t = 0 and t = 1), the band interval (m per band, from the hole's ramp's band count) and how many
// bands the green spans; s's range. node uvgreen.mjs  (writes uvgreen.json)
import fs from "node:fs";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const BANDS = { glf_tokosenFix: 12, glf_tokosenFix2: 14 };
// vertices of an object with named uv sets (objectTriangles drops the names)
function verts(model, obj) {
  const pos = model.vertices[obj.arrays.vertex];
  const sets = {};
  obj.arrays.uv.forEach((ai, k) => { if (ai >= 0 && obj.attrs.includes("uv" + k)) sets[k] = model.uvs[ai]; });
  const out = [], tris = [];
  for (const p of obj.prims) {
    const vs = p.verts.map((v) => {
      const i = v.pos * pos.comps;
      const r = { x: pos.data[i], y: pos.data[i + 1], z: pos.data[i + 2], uv: {}, key: v.pos };
      for (const [k, arr] of Object.entries(sets)) { const j = v["uv" + k] * arr.comps; r.uv[k] = [arr.data[j], arr.comps === 2 ? arr.data[j + 1] : 0]; r.key += "|" + v["uv" + k]; }
      return r;
    });
    out.push(...vs);
    if (p.type === "triangles") for (let i = 0; i + 2 < vs.length; i += 3) tris.push([vs[i], vs[i + 1], vs[i + 2]]);
    else if (p.type === "strip") for (let i = 0; i + 2 < vs.length; i++) tris.push(i & 1 ? [vs[i + 1], vs[i], vs[i + 2]] : [vs[i], vs[i + 1], vs[i + 2]]);
    else if (p.type === "fan") for (let i = 1; i + 1 < vs.length; i++) tris.push([vs[0], vs[i], vs[i + 1]]);
  }
  return { verts: out, tris, sets: Object.keys(sets).map(Number) };
}
function lsq(rows, ys) {
  const n = rows[0].length, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  rows.forEach((r, i) => { for (let p = 0; p < n; p++) { b[p] += r[p] * ys[i]; for (let q = 0; q < n; q++) A[p][q] += r[p] * r[q]; } });
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let piv = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i; [M[c], M[piv]] = [M[piv], M[c]]; for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; } }
  const x = M.map((r, i) => r[n] / r[i]);
  let ss = 0, mx = 0; rows.forEach((r, i) => { const e = r.reduce((s, v, k) => s + v * x[k], 0) - ys[i]; ss += e * e; mx = Math.max(mx, Math.abs(e)); });
  return { x, rms: Math.sqrt(ss / rows.length), max: mx };
}
const res = {};
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  res[hole] = { id };
  for (const kind of ["course", "map"]) {
    const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
    const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
    const mat = m.materials.find((x) => x.name === "M_Green");
    const ramp = mat.layers[1].texture, nb = BANDS[ramp];
    const draws = [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index);
    const uniq = new Map(); const sets = new Set(); const objs = [];
    let tris = [];
    for (const d of draws) {
      const o = m.objects[d.obj]; objs.push(o.name);
      const r = verts(m, o); r.sets.forEach((s) => sets.add(s)); tris = tris.concat(r.tris);
      for (const v of r.verts) uniq.set(v.key + "@" + o.name, v);
    }
    const V = [...uniq.values()].filter((v) => v.uv[1]);
    const ys = V.map((v) => v.y), ts = V.map((v) => v.uv[1][1]), ss = V.map((v) => v.uv[1][0]);
    const fy = lsq(V.map((v) => [v.y, 1]), ts), fxyz = lsq(V.map((v) => [v.x, v.y, v.z, 1]), ts);
    const [b, d] = fy.x;
    const ymin = Math.min(...ys), ymax = Math.max(...ys), tmin = Math.min(...ts), tmax = Math.max(...ts);
    const y0 = -d / b, y1 = (1 - d) / b; // heights at t = 0 and t = 1
    const mPerBand = 1 / nb / Math.abs(b) / 10;
    res[hole][kind] = {
      objs, uvSets: [...sets], nVerts: V.length, nTris: tris.length, ramp, bands: nb,
      fitY: { b: +b.toPrecision(6), d: +d.toPrecision(6), rms: +fy.rms.toExponential(2), max: +fy.max.toExponential(2) },
      fitXYZ: { a: +fxyz.x[0].toExponential(2), b: +fxyz.x[1].toPrecision(6), c: +fxyz.x[2].toExponential(2), rms: +fxyz.rms.toExponential(2) },
      yRange: [+ymin.toFixed(3), +ymax.toFixed(3)], reliefM: +((ymax - ymin) / 10).toFixed(3),
      tRange: [+tmin.toFixed(4), +tmax.toFixed(4)], sRange: [+Math.min(...ss).toFixed(4), +Math.max(...ss).toFixed(4)],
      window: [+y0.toFixed(3), +y1.toFixed(3)], windowM: +(Math.abs(y1 - y0) / 10).toFixed(3), mPerBand: +mPerBand.toFixed(4),
      bandsSpanned: +((tmax - tmin) * nb).toFixed(2),
    };
  }
}
fs.writeFileSync("uvgreen.json", JSON.stringify(res, null, 1));
console.log("hole model ramp  verts | t = b*y + d: b, d, rms, max | xyz rms | green y range (u) relief m | t range | window y(t=0) y(t=1) | m/band | bands spanned | s range");
for (const [h, r] of Object.entries(res)) for (const kind of ["course", "map"]) {
  const x = r[kind];
  console.log(`H${String(h).padStart(2)} ${kind.padEnd(6)} ${x.ramp.replace("glf_tokosen", "")} ${String(x.nVerts).padStart(4)} | ${x.fitY.b} ${x.fitY.d} ${x.fitY.rms} ${x.fitY.max} | ${x.fitXYZ.rms} | ${x.yRange.join("..")} ${x.reliefM} | ${x.tRange.join("..")} | ${x.window.join(" ")} | ${x.mPerBand} | ${x.bandsSpanned} | ${x.sRange.join("..")}`);
}
