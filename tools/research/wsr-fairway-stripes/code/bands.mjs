// Top-down render of each hole's fairway stripe bands in the app's 250x304 map frame (x SC):
// course model M_Fairway: band W (glf_fairway_line1 white, frac(uv1.s) >= 0.5) light, band B (black, constant c0) dark;
// green (M_Green) and the rest of the course model in flat greys. Writes out/hNN-bands.rgba (+ .json).
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const REG = JSON.parse(fs.readFileSync(new URL("../../../mesh-registration.json", import.meta.url), "utf8")).holes;
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const SC = Number(process.argv[2] || 2), KIND = process.argv[3] || "course", only = process.argv[4] ? process.argv[4].split(",").map(Number) : null;
fs.mkdirSync("out", { recursive: true });
const W = 250 * SC, H = 304 * SC;
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  if (only && !only.includes(hole)) continue;
  const M = REG[hole].meshToMapFrac;
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${KIND}_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const img = new Uint8Array(W * H * 4), depth = new Float32Array(W * H).fill(-1e9);
  for (let i = 0; i < W * H; i++) { img[i * 4] = 30; img[i * 4 + 1] = 30; img[i * 4 + 2] = 40; img[i * 4 + 3] = 255; }
  const draws = [...m.draw.opa, ...m.draw.xlu];
  for (const d of draws) {
    const mat = m.materials[d.mat];
    const isF = mat.name === "M_Fairway", isG = mat.name === "M_Green";
    if (!/^M_(Fairway|Green|Rough|Bunker|Color|Kiwa|OB|Iwa)/.test(mat.name)) continue;
    const tris = objectTriangles(m, m.objects[d.obj]);
    for (const t of tris) {
      const P = t.map((v) => ({ X: (M[0][0] * v.x + M[0][1] * v.z + M[0][2]) * W, Y: (M[1][0] * v.x + M[1][1] * v.z + M[1][2]) * H, y: v.y, s: v.u[1] ? v.u[1][0] : 0 }));
      const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.X)))), x1 = Math.min(W - 1, Math.ceil(Math.max(...P.map((p) => p.X))));
      const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.Y)))), y1 = Math.min(H - 1, Math.ceil(Math.max(...P.map((p) => p.Y))));
      const [A, B, C] = P, den = (B.Y - C.Y) * (A.X - C.X) + (C.X - B.X) * (A.Y - C.Y);
      if (Math.abs(den) < 1e-9) continue;
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const X = px + 0.5, Y = py + 0.5;
        const w0 = ((B.Y - C.Y) * (X - C.X) + (C.X - B.X) * (Y - C.Y)) / den, w1 = ((C.Y - A.Y) * (X - C.X) + (A.X - C.X) * (Y - C.Y)) / den, w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const yy = w0 * A.y + w1 * B.y + w2 * C.y, p = py * W + px;
        if (yy < depth[p] - 0.5) continue;
        depth[p] = yy;
        let c;
        if (isF) {
          const s = w0 * A.s + w1 * B.s + w2 * C.s, f = s - Math.floor(s);
          c = f >= 0.5 ? [150, 215, 90] : [55, 120, 40];
        } else if (isG) c = [200, 200, 200];
        else if (/Bunker/.test(mat.name)) c = [120, 110, 80];
        else c = [70, 70, 75];
        img[p * 4] = c[0]; img[p * 4 + 1] = c[1]; img[p * 4 + 2] = c[2];
      }
    }
  }
  const f = `out/h${String(hole).padStart(2, "0")}-${KIND}-bands`;
  fs.writeFileSync(f + ".rgba", img); fs.writeFileSync(f + ".json", JSON.stringify({ w: W, h: H }));
}
console.log("ok");
