// Per hole: (1) where each of WSR's cup spots (tools/wsr-pins.json `spots`, the PMP pin points) falls on the green's
// contour ramp: t interpolated from the course model's green triangle under it, the band (0 = lightest = the window's
// top), the cup's height against the green's own range; (2) the render green against the collision (KCL) the ball rolls
// on: at every green vertex the KCL's top surface height less the vertex height, and less the height the vertex's t
// stands for (the window fit), i.e. how far the drawn band is from the true height there.  node cupband.mjs [holes]
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const C = await import(pathToFileURL(REPO + "tools/harness/lib/course.mjs").href);
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(REPO + "tools/mesh-holes.json", "utf8"));
const PINS = JSON.parse(fs.readFileSync(REPO + "tools/wsr-pins.json", "utf8")).holes;
const UV = JSON.parse(fs.readFileSync("uvgreen.json", "utf8"));
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function greenTris(m) {
  const mat = m.materials.find((x) => x.name === "M_Green");
  const tris = [];
  for (const d of [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index)) {
    const obj = m.objects[d.obj], pos = m.vertices[obj.arrays.vertex];
    const uvA = m.uvs[obj.arrays.uv[1]];
    for (const p of obj.prims) {
      const vs = p.verts.map((v) => { const i = v.pos * pos.comps, j = v.uv1 * uvA.comps; return { x: pos.data[i], y: pos.data[i + 1], z: pos.data[i + 2], t: uvA.data[j + 1] }; });
      if (p.type === "triangles") for (let i = 0; i + 2 < vs.length; i += 3) tris.push([vs[i], vs[i + 1], vs[i + 2]]);
      else if (p.type === "strip") for (let i = 0; i + 2 < vs.length; i++) tris.push(i & 1 ? [vs[i + 1], vs[i], vs[i + 2]] : [vs[i], vs[i + 1], vs[i + 2]]);
      else if (p.type === "fan") for (let i = 1; i + 1 < vs.length; i++) tris.push([vs[0], vs[i], vs[i + 1]]);
    }
  }
  return tris;
}
function at(tris, x, z) {
  for (const [a, b, c] of tris) {
    const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (!den) continue;
    const w0 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den, w1 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den, w2 = 1 - w0 - w1;
    if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) return { y: w0 * a.y + w1 * b.y + w2 * c.y, t: w0 * a.t + w1 * b.t + w2 * c.t };
  }
  return null;
}
const summary = [];
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  if (only && !only.includes(hole)) continue;
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_course_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const tris = greenTris(m);
  const u = UV[hole].course, nb = u.bands, [ymin, ymax] = u.yRange;
  const cups = (PINS[hole]?.spots ?? []).map((s) => {
    const [x, y, z] = s.mesh, h = at(tris, x, z);
    if (!h) return { label: s.label, off: true };
    const tc = Math.min(Math.max(h.t, 0), 0.999999);
    return { label: s.label ?? "?", pmpY: y, meshY: +h.y.toFixed(2), t: +h.t.toFixed(3), band: Math.floor(tc * nb) + 1, ofRange: +((ymax - h.y) / (ymax - ymin)).toFixed(2) };
  });
  // render vs KCL at the green vertices
  const K = await C.kcl(hole);
  const dv = [], dt = [];
  if (K) {
    const seen = new Set();
    for (const tri of tris) for (const v of tri) {
      const key = `${v.x},${v.z}`; if (seen.has(key)) continue; seen.add(key);
      const g = C.groundAt(K, v.x, v.z);
      if (!g) continue;
      dv.push(g.y - v.y);
      dt.push(g.y - (v.t - u.fitY.d) / u.fitY.b);
    }
  }
  const s = (a) => (a.length ? `p50 ${q(a.map(Math.abs), 0.5).toFixed(3)} p90 ${q(a.map(Math.abs), 0.9).toFixed(3)} max ${Math.max(...a.map(Math.abs)).toFixed(3)} u` : "no KCL");
  console.log(`H${hole} ${id} (${nb} bands, ${u.mPerBand} m a band; green ${ymin}..${ymax} u): cups ${cups.map((c) => (c.off ? `${c.label} off-mesh` : `${c.label} band ${c.band} (t ${c.t}, ${(c.ofRange * 100).toFixed(0)}% down the green's range)`)).join("; ")}`);
  console.log(`   KCL - render vertex height ${s(dv)} | KCL - height the band stands for ${s(dt)}`);
  C.dropMesh(hole);
  summary.push({ hole, bands: cups.filter((c) => !c.off).map((c) => c.band), nb });
}
const all = summary.flatMap((r) => r.bands.map((b) => ({ b, nb: r.nb })));
const hist = {}; for (const { b } of all) hist[b] = (hist[b] ?? 0) + 1;
console.log("cups per band (1 = lightest):", JSON.stringify(hist), "of", all.length);
