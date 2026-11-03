// Class raster of a hole's fairway bands in the 250x304 map frame at SC px per map px: 0 off the fairway, 1 frac(uv1.s) >= 0.5, 2 < 0.5
// (by the model's raw uv1, no SRT), topmost surface of the model wins. node cls.mjs <hole> <course|map> <SC> -> out/hNN-<kind>-cls<SC>.bin
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const REG = JSON.parse(fs.readFileSync(new URL("../../../mesh-registration.json", import.meta.url), "utf8")).holes;
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const [hole, KIND, SCs] = process.argv.slice(2); const SC = Number(SCs);
const id = Object.keys(holes).find((k) => holes[k] === Number(hole) && k.startsWith("fc"));
const W = 250 * SC, H = 304 * SC, M = REG[hole].meshToMapFrac;
const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${KIND}_${id}.brres`);
const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
const out = new Uint8Array(W * H), depth = new Float32Array(W * H).fill(-1e9);
for (const d of [...m.draw.opa, ...m.draw.xlu]) {
  const mat = m.materials[d.mat];
  if (!/^M_/.test(mat.name) || /Sea|Lake|River|OtherCourse|Hayas|Hahashi|Mount|Enkei/.test(mat.name)) continue;
  const isF = mat.name === "M_Fairway";
  for (const t of objectTriangles(m, m.objects[d.obj])) {
    const P = t.map((v) => ({ X: (M[0][0] * v.x + M[0][1] * v.z + M[0][2]) * W, Y: (M[1][0] * v.x + M[1][1] * v.z + M[1][2]) * H, y: v.y, s: isF ? v.u[1][0] : 0 }));
    const [A, B, C] = P, den = (B.Y - C.Y) * (A.X - C.X) + (C.X - B.X) * (A.Y - C.Y);
    if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A.X, B.X, C.X))), x1 = Math.min(W - 1, Math.ceil(Math.max(A.X, B.X, C.X)));
    const y0 = Math.max(0, Math.floor(Math.min(A.Y, B.Y, C.Y))), y1 = Math.min(H - 1, Math.ceil(Math.max(A.Y, B.Y, C.Y)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const X = px + 0.5, Y = py + 0.5;
      const w0 = ((B.Y - C.Y) * (X - C.X) + (C.X - B.X) * (Y - C.Y)) / den, w1 = ((C.Y - A.Y) * (X - C.X) + (A.X - C.X) * (Y - C.Y)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const yy = w0 * A.y + w1 * B.y + w2 * C.y, p = py * W + px;
      if (yy < depth[p] - 0.5) continue;
      depth[p] = yy;
      if (!isF) { out[p] = 0; continue; }
      const s = w0 * A.s + w1 * B.s + w2 * C.s;
      out[p] = s - Math.floor(s) >= 0.5 ? 1 : 2;
    }
  }
}
fs.writeFileSync(`out/h${String(hole).padStart(2, "0")}-${KIND}-cls${SC}.bin`, out);
console.log(W, H);
