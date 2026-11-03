// Per hole: the objects drawn with M_Fairway (course and minimap), the uv sets' per-triangle gradients over world (x, z):
// stripe period (world units per repeat of uv1.s) and direction, and how constant they are; a least-squares planar fit.
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const MAT = process.argv[2] || "M_Fairway";
const out = {};
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function grads(tris, set, comp) {
  const g = [];
  for (const t of tris) {
    const [a, b, c] = t;
    if (!a.u[set]) return null;
    const x1 = b.x - a.x, z1 = b.z - a.z, x2 = c.x - a.x, z2 = c.z - a.z;
    const det = x1 * z2 - x2 * z1;
    const area = Math.abs(det) / 2;
    if (area < 1e-3) continue;
    const d1 = b.u[set][comp] - a.u[set][comp], d2 = c.u[set][comp] - a.u[set][comp];
    // grad = (gx, gz): d1 = gx x1 + gz z1, d2 = gx x2 + gz z2
    const gx = (d1 * z2 - d2 * z1) / det, gz = (x1 * d2 - x2 * d1) / det;
    g.push({ gx, gz, area, cx: (a.x + b.x + c.x) / 3, cz: (a.z + b.z + c.z) / 3 });
  }
  return g;
}
function summ(g) {
  if (!g || !g.length) return null;
  const tot = g.reduce((s, v) => s + v.area, 0);
  // area-weighted mean gradient; then each triangle's angle and |g| against it
  const mx = g.reduce((s, v) => s + v.gx * v.area, 0) / tot, mz = g.reduce((s, v) => s + v.gz * v.area, 0) / tot;
  const per = g.map((v) => 1 / Math.hypot(v.gx, v.gz));
  const ang = g.map((v) => Math.atan2(v.gz, v.gx) * 180 / Math.PI);
  const a0 = Math.atan2(mz, mx) * 180 / Math.PI;
  const dang = ang.map((a) => { let d = a - a0; while (d > 180) d -= 360; while (d < -180) d += 360; return d; });
  return {
    n: g.length, area: +tot.toFixed(0),
    meanPeriod: +(1 / Math.hypot(mx, mz)).toFixed(3), gradDeg: +a0.toFixed(2),
    period: [q(per, 0.05), q(per, 0.5), q(per, 0.95)].map((v) => +v.toFixed(3)),
    angleOff: [q(dang, 0.05), q(dang, 0.5), q(dang, 0.95)].map((v) => +v.toFixed(2)),
  };
}
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  out[hole] = { id };
  for (const kind of ["course", "map"]) {
    const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
    const e = readBrres(buf).folders["3DModels(NW4R)"][0];
    const m = readMdl0(buf, e.off);
    const mat = m.materials.find((x) => x.name === MAT);
    if (!mat) { out[hole][kind] = null; continue; }
    const draws = [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index);
    const tris = draws.flatMap((d) => objectTriangles(m, m.objects[d.obj]));
    const r = { objs: draws.map((d) => m.objects[d.obj].name), tris: tris.length, srt: mat.srt.map((s) => `s${s.scale.map((v) => +v.toFixed(3))} r${s.rot} t${s.trans.map((v) => +v.toFixed(3))}`), layers: mat.layers.map((l) => l.texture) };
    const nUV = tris[0]?.[0].u.length ?? 0;
    for (let set = 0; set < nUV; set++) for (const comp of [0, 1]) r[`uv${set}${"st"[comp]}`] = summ(grads(tris, set, comp));
    out[hole][kind] = r;
  }
}
fs.writeFileSync(`uvfit-${MAT}.json`, JSON.stringify(out, null, 1));
for (const [h, r] of Object.entries(out)) {
  const c = r.course, mm = r.map;
  const f = (x) => x ? `T${x.meanPeriod} @${x.gradDeg}° per[${x.period}] off[${x.angleOff}]` : "-";
  console.log(`H${h} ${r.id} course uv1s ${f(c?.uv1s)} | uv1t ${f(c?.uv1t)} | uv0s ${f(c?.uv0s)}`);
  console.log(`        map    uv1s ${f(mm?.uv1s)} | uv1t ${f(mm?.uv1t)}`);
}
