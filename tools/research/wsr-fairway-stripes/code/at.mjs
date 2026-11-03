// uv1.s of a hole's fairway (course model M_Fairway, and the map model's) at world points (x, z); the band (W: frac >= 0.5,
// the line texture's white half; B: black), the distance to the nearest band edges along +x / -x / +z / -z (world units, stepping).
//   node at.mjs <meshId> x,z [x,z ...]
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const [id, ...pts] = process.argv.slice(2);
const load = (kind) => {
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const mat = m.materials.find((x) => x.name === "M_Fairway");
  return [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index).flatMap((d) => objectTriangles(m, m.objects[d.obj]));
};
const T = { course: load("course"), map: load("map") };
export function sAt(tris, x, z) {
  for (const [a, b, c] of tris) {
    const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (!den) continue;
    const w0 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den, w1 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den, w2 = 1 - w0 - w1;
    if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) return { s: w0 * a.u[1][0] + w1 * b.u[1][0] + w2 * c.u[1][0], y: w0 * a.y + w1 * b.y + w2 * c.y };
  }
  return null;
}
const band = (s) => (s - Math.floor(s) >= 0.5 ? "W" : "B");
for (const p of pts) {
  const [x, z] = p.split(",").map(Number);
  const r = {};
  for (const kind of ["course", "map"]) {
    const h = sAt(T[kind], x, z);
    if (!h) { r[kind] = null; continue; }
    const edges = {};
    for (const [nm, dx, dz] of [["+x", 1, 0], ["-x", -1, 0], ["+z", 0, 1], ["-z", 0, -1]]) {
      let d = 0;
      for (; d < 300; d += 0.25) { const q = sAt(T[kind], x + dx * d, z + dz * d); if (!q) { d = null; break; } if (band(q.s) !== band(h.s)) break; }
      edges[nm] = d;
    }
    r[kind] = { s: +h.s.toFixed(4), frac: +(h.s - Math.floor(h.s)).toFixed(3), band: band(h.s), y: +h.y.toFixed(2), edgeDist: edges };
  }
  console.log(p, JSON.stringify(r));
}
