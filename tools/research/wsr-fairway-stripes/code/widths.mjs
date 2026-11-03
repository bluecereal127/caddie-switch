// Per hole: the fairway stripe width (half a repeat of uv1.s: one light + one dark band = 1 repeat) from the course model's
// per-triangle uv1 gradients, area-weighted quantiles, split into the tee pad (triangles within 25 m of the tee) and the rest;
// the share of fairway area whose stripe direction turns more than 20 deg from the area-weighted mean (how much the stripes bend).
import fs from "node:fs";
import { readBrres, readMdl0, objectTriangles } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const idx = JSON.parse(fs.readFileSync(new URL("../../../harness/state/saves/index.json", import.meta.url), "utf8"));
const wq = (arr, p) => { const s = [...arr].sort((a, b) => a.v - b.v); const tot = s.reduce((t, x) => t + x.w, 0); let c = 0; for (const x of s) { c += x.w; if (c >= p * tot) return x.v; } return s.at(-1).v; };
const rows = [];
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  const tee = idx[hole]?.tee;
  const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_course_${id}.brres`);
  const m = readMdl0(buf, readBrres(buf).folders["3DModels(NW4R)"][0].off);
  const mat = m.materials.find((x) => x.name === "M_Fairway");
  const tris = [...m.draw.opa, ...m.draw.xlu].filter((d) => d.mat === mat.index).flatMap((d) => objectTriangles(m, m.objects[d.obj]));
  const pad = [], fw = [];
  for (const [a, b, c] of tris) {
    const x1 = b.x - a.x, z1 = b.z - a.z, x2 = c.x - a.x, z2 = c.z - a.z, det = x1 * z2 - x2 * z1;
    if (Math.abs(det) < 2e-3) continue;
    const d1 = b.u[1][0] - a.u[1][0], d2 = c.u[1][0] - a.u[1][0];
    const gx = (d1 * z2 - d2 * z1) / det, gz = (x1 * d2 - x2 * d1) / det, g = Math.hypot(gx, gz);
    if (!g) continue;
    const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
    const rec = { v: 1 / g / 2 / 10, w: Math.abs(det) / 2 / 100, gx: gx / g, gz: gz / g };
    (tee && Math.hypot(cx - tee[0], cz - tee[2]) < 250 ? pad : fw).push(rec);
  }
  // bend: angle of each triangle's stripe normal from the mean (axial: gradient sign ignored)
  let sx = 0, sz = 0; for (const r of fw) { const a2 = 2 * Math.atan2(r.gz, r.gx); sx += Math.cos(a2) * r.w; sz += Math.sin(a2) * r.w; }
  const mean = Math.atan2(sz, sx) / 2;
  const area = fw.reduce((t, r) => t + r.w, 0);
  const bent = fw.filter((r) => { let d = Math.abs(Math.atan2(r.gz, r.gx) - mean) % Math.PI; d = Math.min(d, Math.PI - d); return d > 20 * Math.PI / 180; }).reduce((t, r) => t + r.w, 0) / area;
  rows.push({ hole, id, fwArea: Math.round(area), fw: [0.1, 0.5, 0.9].map((p) => +wq(fw, p).toFixed(2)), pad: pad.length ? [0.1, 0.5, 0.9].map((p) => +wq(pad, p).toFixed(2)) : null, bent: +bent.toFixed(2) });
}
for (const r of rows) console.log(`H${String(r.hole).padStart(2)} ${r.id.padEnd(7)} fairway ${String(r.fwArea).padStart(6)} m2: stripe ${r.fw[1]} m (p10-p90 ${r.fw[0]}-${r.fw[2]}), ${(r.bent * 100).toFixed(0)}% of area turned >20 deg | tee pad stripe ${r.pad ? r.pad[1] + " m (" + r.pad[0] + "-" + r.pad[2] + ")" : "-"}`);
const all = rows.map((r) => r.fw[1]).sort((a, b) => a - b), pads = rows.filter((r) => r.pad).map((r) => r.pad[1]).sort((a, b) => a - b);
console.log("fairway medians", all[0], all[10], all[20], "| pad medians", pads[0], pads[Math.floor(pads.length / 2)], pads.at(-1));
fs.writeFileSync("widths.json", JSON.stringify(rows, null, 1));
