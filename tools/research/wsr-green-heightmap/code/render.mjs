// Top-down render of every green (course model M_Green) in its contour ramp's colours, north up (-z up), as the Terrain
// view's ramp layer draws it (the band of the vertex-interpolated uv1 t, the ramp clamped in t): cups (tools/wsr-pins.json
// spots) as black rings, and in white the band edges the green's TRUE height would give (t from the hole's height fit
// t = b*y + d, y interpolated from the mesh = the KCL), so a white edge off the colour edge marks a band baked wrong.
// Writes out/gNN.rgba + .json per hole (240 px on the green's longer side + margin) and a meta json; sheet by sheet.py.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(REPO + "tools/mesh-holes.json", "utf8"));
const PINS = JSON.parse(fs.readFileSync(REPO + "tools/wsr-pins.json", "utf8")).holes;
const UV = JSON.parse(fs.readFileSync("uvgreen.json", "utf8"));
const RAMPS = JSON.parse(fs.readFileSync("ramps.json", "utf8"));
fs.mkdirSync("out", { recursive: true });
const rampOf = (name) => Object.values(RAMPS).find((r) => r.texture === name);
const S = 240, PAD = 10;
const meta = {};
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_course_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const mat = m.materials.find((x) => x.name === "M_Green");
  const ramp = rampOf(mat.layers[1].texture), nb = UV[hole].course.bands, { b, d } = UV[hole].course.fitY;
  const rowColour = new Array(256);
  for (const band of ramp.bands) for (let y = band.y0; y <= band.y1; y++) rowColour[y] = band.c;
  const tris = [];
  for (const dr of [...m.draw.opa, ...m.draw.xlu].filter((x) => x.mat === mat.index)) {
    const obj = m.objects[dr.obj], pos = m.vertices[obj.arrays.vertex], uvA = m.uvs[obj.arrays.uv[1]];
    for (const p of obj.prims) {
      const vs = p.verts.map((v) => { const i = v.pos * pos.comps, j = v.uv1 * uvA.comps; return { x: pos.data[i], y: pos.data[i + 1], z: pos.data[i + 2], t: uvA.data[j + 1] }; });
      if (p.type === "triangles") for (let i = 0; i + 2 < vs.length; i += 3) tris.push([vs[i], vs[i + 1], vs[i + 2]]);
      else if (p.type === "strip") for (let i = 0; i + 2 < vs.length; i++) tris.push(i & 1 ? [vs[i + 1], vs[i], vs[i + 2]] : [vs[i], vs[i + 1], vs[i + 2]]);
      else if (p.type === "fan") for (let i = 1; i + 1 < vs.length; i++) tris.push([vs[0], vs[i], vs[i + 1]]);
    }
  }
  const xs = tris.flat().map((v) => v.x), zs = tris.flat().map((v) => v.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const sc = S / Math.max(x1 - x0, z1 - z0), W = Math.ceil((x1 - x0) * sc) + 2 * PAD, H = Math.ceil((z1 - z0) * sc) + 2 * PAD;
  const X = (x) => (x - x0) * sc + PAD, Y = (z) => (z - z0) * sc + PAD; // z grows south = down: north up
  const img = new Uint8Array(W * H * 4), tb = new Float32Array(W * H).fill(NaN), tt = new Float32Array(W * H).fill(NaN);
  for (let i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 40; img[i * 4 + 2] = 48; img[i * 4 + 3] = 255; }
  for (const [A, B, C] of tris) {
    const P = [A, B, C].map((v) => ({ X: X(v.x), Y: Y(v.z), t: v.t, y: v.y }));
    const den = (P[1].Y - P[2].Y) * (P[0].X - P[2].X) + (P[2].X - P[1].X) * (P[0].Y - P[2].Y);
    if (Math.abs(den) < 1e-9) continue;
    const xa = Math.max(0, Math.floor(Math.min(...P.map((p) => p.X)))), xb = Math.min(W - 1, Math.ceil(Math.max(...P.map((p) => p.X))));
    const ya = Math.max(0, Math.floor(Math.min(...P.map((p) => p.Y)))), yb = Math.min(H - 1, Math.ceil(Math.max(...P.map((p) => p.Y))));
    for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
      const x = px + 0.5, y = py + 0.5;
      const w0 = ((P[1].Y - P[2].Y) * (x - P[2].X) + (P[2].X - P[1].X) * (y - P[2].Y)) / den, w1 = ((P[2].Y - P[0].Y) * (x - P[2].X) + (P[0].X - P[2].X) * (y - P[2].Y)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const t = w0 * P[0].t + w1 * P[1].t + w2 * P[2].t, hy = w0 * P[0].y + w1 * P[1].y + w2 * P[2].y;
      const k = py * W + px;
      tb[k] = t; tt[k] = b * hy + d;
      const row = Math.min(255, Math.max(0, Math.floor(t * 256)));
      const c = rowColour[row];
      img[k * 4] = c[0]; img[k * 4 + 1] = c[1]; img[k * 4 + 2] = c[2];
    }
  }
  // true band edges (white) where the band index of the true t changes between 4-neighbours
  const bandOf = (t) => Math.min(nb - 1, Math.max(0, Math.floor(t * nb)));
  let wrongPx = 0, livePx = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const k = py * W + px;
    if (Number.isNaN(tt[k])) continue;
    livePx++;
    if (bandOf(tt[k]) !== bandOf(tb[k])) wrongPx++;
    const e = [[1, 0], [0, 1]].some(([dx, dy]) => px + dx < W && py + dy < H && !Number.isNaN(tt[k + dy * W + dx]) && bandOf(tt[k + dy * W + dx]) !== bandOf(tt[k]));
    if (e) { img[k * 4] = 255; img[k * 4 + 1] = 255; img[k * 4 + 2] = 255; }
  }
  // cups
  for (const s of PINS[hole]?.spots ?? []) {
    const cx = X(s.mesh[0]), cy = Y(s.mesh[2]);
    for (let py = Math.floor(cy - 6); py <= Math.ceil(cy + 6); py++) for (let px = Math.floor(cx - 6); px <= Math.ceil(cx + 6); px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const r = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (r >= 3.2 && r <= 5.2) { const k = py * W + px; img[k * 4] = 0; img[k * 4 + 1] = 0; img[k * 4 + 2] = 0; }
    }
  }
  const f = `out/g${String(hole).padStart(2, "0")}`;
  fs.writeFileSync(f + ".rgba", img); fs.writeFileSync(f + ".json", JSON.stringify({ w: W, h: H }));
  meta[hole] = { id, ramp: ramp.texture, bands: nb, mPerBand: UV[hole].course.mPerBand, reliefM: UV[hole].course.reliefM, bandsSpanned: UV[hole].course.bandsSpanned, wrongShare: +(wrongPx / livePx).toFixed(3) };
}
fs.writeFileSync("out/greens-meta.json", JSON.stringify(meta, null, 1));
for (const [h, r] of Object.entries(meta)) console.log(`H${h} ${r.ramp.replace("glf_tokosen", "")} ${r.bands} bands, ${r.mPerBand} m a band, relief ${r.reliefM} m, spans ${r.bandsSpanned} bands; drawn band != true band on ${(r.wrongShare * 100).toFixed(1)}% of the green`);
