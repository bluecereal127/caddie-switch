// Dump the WSR course models' green material (layers, texgens, the texture-matrix effect block at material +0x250) and fit the green objects' uv0, per hole: node tools/research/wsr-green-plaid/code/dump-green.mjs [meshId]
import fs from "node:fs";
import path from "node:path";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";

const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const only = process.argv[2];
const out = {};
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  if (only && id !== only) continue;
  const f = path.join(ROOT, `glf_course_${id}.d/G3D/glf_course_${id}.brres`);
  const buf = fs.readFileSync(f);
  const b = readBrres(buf);
  const e = b.folders["3DModels(NW4R)"].find((m) => m.name === `glf_course_${id}`);
  const m = readMdl0(buf, e.off);
  const mbuf = buf.subarray(e.off);
  const res = { hole, materials: [] };
  m.materials.forEach((mat, mi) => {
    // texture matrix effect block: 8 x 0x34 at 0x250 (camRef s8, lightRef s8, mapMode u8, flags u8, 3x4 matrix)
    const matEntry = (() => {
      // find the material entry offset again: readMdl0 does not keep it; locate by name pointer search
      return null;
    })();
    const info = { i: mi, name: mat.name, layers: mat.layers.map((l) => l.texture), srt: mat.srt, texgen: mat.texgen, stages: mat.stages, texgens: mat.texgens };
    res.materials.push(info);
  });
  // effect blocks: re-walk the material index group
  const nSections = 14, secOff = [];
  for (let i = 0; i < nSections; i++) secOff.push(mbuf.readUInt32BE(0x10 + i * 4));
  const g = secOff[8];
  const count = mbuf.readUInt32BE(g + 4);
  for (let i = 1; i <= count; i++) {
    const ent = g + 8 + i * 16;
    const off = g + mbuf.readUInt32BE(ent + 12);
    const name = (() => { let s = off + mbuf.readUInt32BE(off + 8), t = s; while (mbuf[t]) t++; return mbuf.toString("latin1", s, t); })();
    const mat = res.materials.find((x) => x.name === name);
    mat.srtFlags = mbuf.readUInt32BE(off + 0x1a8).toString(16);
    mat.texMtxMode = mbuf.readUInt32BE(off + 0x1ac);
    mat.effect = [];
    for (let k = 0; k < mat.layers.length; k++) {
      const q = off + 0x250 + k * 0x34;
      const mtx = [];
      for (let j = 0; j < 12; j++) mtx.push(+mbuf.readFloatBE(q + 4 + j * 4).toFixed(5));
      mat.effect.push({ cam: mbuf.readInt8(q), light: mbuf.readInt8(q + 1), mapMode: mbuf[q + 2], flags: mbuf[q + 3], mtx });
    }
  }
  // objects drawn with the green material
  const greenMats = new Set(res.materials.filter((x) => /green/i.test(x.name)).map((x) => x.i));
  const draws = [...m.draw.opa, ...m.draw.xlu].filter((d) => greenMats.has(d.mat));
  res.greenObjects = [];
  for (const d of draws) {
    const obj = m.objects[d.obj];
    const tris = objectTriangles(m, obj);
    // fit u = a*x + b*z + c, v = d*x + e*z + f by least squares over vertices (uv set 0)
    const pts = [];
    for (const t of tris) for (const v of t) if (v.u.length) pts.push([v.x, v.y, v.z, v.u[0][0], v.u[0][1]]);
    const fit = (k) => {
      // normal equations 3x3
      let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
      for (const p of pts) { const row = [p[0], p[2], 1]; for (let i = 0; i < 3; i++) { r[i] += row[i] * p[k]; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; } }
      // solve
      const M = A.map((row, i) => [...row, r[i]]);
      for (let c = 0; c < 3; c++) { let piv = c; for (let i = c + 1; i < 3; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i; [M[c], M[piv]] = [M[piv], M[c]]; for (let i = 0; i < 3; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let j = c; j < 4; j++) M[i][j] -= f * M[c][j]; } }
      const sol = M.map((row, i) => row[3] / row[i]);
      let rms = 0, max = 0;
      for (const p of pts) { const e = p[0] * sol[0] + p[2] * sol[1] + sol[2] - p[k]; rms += e * e; max = Math.max(max, Math.abs(e)); }
      return { coef: sol, rms: Math.sqrt(rms / pts.length), max };
    };
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]), us = pts.map((p) => p[3]), vs = pts.map((p) => p[4]);
    res.greenObjects.push({
      obj: obj.name, mat: res.materials[d.mat].name, attrs: obj.attrs, uvArrays: obj.arrays.uv, nTris: tris.length, nVerts: pts.length,
      bboxXZ: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => +v.toFixed(2)),
      uRange: [Math.min(...us), Math.max(...us)].map((v) => +v.toFixed(4)), vRange: [Math.min(...vs), Math.max(...vs)].map((v) => +v.toFixed(4)),
      uFit: pts.length ? fit(3) : null, vFit: pts.length ? fit(4) : null,
    });
  }
  out[id] = res;
}
console.log(JSON.stringify(out, null, 1));
