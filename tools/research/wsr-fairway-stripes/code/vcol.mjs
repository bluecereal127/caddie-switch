// The fairway objects' vertex colours (col0), course and map, per hole: quantiles of R, G, B, A.
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  const row = [];
  for (const kind of ["course", "map"]) {
    const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
    const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
    const mat = m.materials.find((x) => x.name === "M_Fairway");
    const tris = [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index).flatMap((d) => objectTriangles(m, m.objects[d.obj]));
    const ch = [[], [], [], []];
    for (const t of tris) for (const v of t) if (v.c) for (let k = 0; k < 4; k++) ch[k].push(v.c[k]);
    ch.forEach((a) => a.sort((x, y) => x - y));
    row.push(`${kind} ` + ch.map((a, k) => "RGBA"[k] + `[${q(a, 0.02)},${q(a, 0.5)},${q(a, 0.98)}]`).join(" "));
  }
  console.log(`H${hole} ${row.join(" | ")}`);
}
