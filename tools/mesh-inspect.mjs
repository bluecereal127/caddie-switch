// Geometry report for the WSR golf collision meshes (KCL -> OBJ).
//   node tools/mesh-inspect.mjs <files.obj...> [--out <dir>] [--px 800] [--json <file>] [--flip-z]
// Prints per-group stats (collision type, triangle count, footprint area,
// height range, flatness), traces boundary loops of the small per-hole groups
// (tee pads and the small gaps in the ground show up as tiny interior loops;
// there are no cups in the meshes, see tools/MESHES.md) and writes a hillshaded
// type-map preview per mesh so the surfaces can be eyeballed against the
// in-game minimaps.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  parseObj, groupStats, groupBoundaryLoops, triVerts, triAreaXZ, rasterizeHeight, hillshade, drawEdges, writePngRGB,
  TYPE_COLORS, SEMANTIC_COLORS, KCL_GOLF, WALL_TYPES,
} from "./lib/obj.mjs";

const args = process.argv.slice(2);
const opt = { out: null, px: 800, json: null, flipZ: false, raw: false, loopTypes: [5, 6, 7, 9], bigTri: 1e5 };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else if (a === "--px") opt.px = +args[++i];
  else if (a === "--json") opt.json = args[++i];
  else if (a === "--flip-z") opt.flipZ = true;
  else if (a === "--raw") opt.raw = true; // colour by raw KCL type instead of golf semantics
  else if (a === "--loop-types") opt.loopTypes = args[++i].split(",").map(Number);
  else files.push(a);
}
if (!files.length) { console.error("usage: node tools/mesh-inspect.mjs <files.obj...> [--out dir] [--px n] [--json file] [--flip-z] [--raw]"); process.exit(1); }
if (opt.out) mkdirSync(opt.out, { recursive: true });
const f1 = (v) => (v == null || !isFinite(v) ? "-" : v.toFixed(1));
const f2 = (v) => (v == null || !isFinite(v) ? "-" : v.toFixed(2));
const report = [];

for (const file of files) {
  const mesh = parseObj(file);
  const stats = groupStats(mesh);
  const nt = mesh.tris.length / 3;
  // "course" extent: everything except giant filler triangles (water / kill planes)
  const ext = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
  let giant = 0;
  for (let t = 0; t < nt; t++) {
    const v = triVerts(mesh, t);
    if (triAreaXZ(v) > opt.bigTri) { giant++; continue; }
    if (WALL_TYPES.has(mesh.groups[mesh.triGroup[t]].type)) continue;
    for (let k = 0; k < 9; k += 3) {
      ext.x0 = Math.min(ext.x0, v[k]); ext.x1 = Math.max(ext.x1, v[k]);
      ext.z0 = Math.min(ext.z0, v[k + 2]); ext.z1 = Math.max(ext.z1, v[k + 2]);
      ext.y0 = Math.min(ext.y0, v[k + 1]); ext.y1 = Math.max(ext.y1, v[k + 1]);
    }
  }
  const base = basename(file).replace(/\.obj$/i, "");
  console.log(`\n=== ${base}: ${mesh.verts.length / 3} verts, ${nt} tris, ${mesh.groups.length} groups, ${giant} giant tris (>${opt.bigTri} u²)`);
  console.log(`course extent x[${f1(ext.x0)} ${f1(ext.x1)}] z[${f1(ext.z0)} ${f1(ext.z1)}] y[${f1(ext.y0)} ${f1(ext.y1)}]  (${f1(ext.x1 - ext.x0)} x ${f1(ext.z1 - ext.z0)} u, rise ${f1(ext.y1 - ext.y0)} u)`);
  console.log("group                 type  tris   areaXZ    maxTri  big  vert%  |ny|   meanY    minY    maxY      cx       cz   bboxW  bboxD");
  for (const g of stats) {
    if (!g.tris) continue;
    console.log(
      `${g.name.padEnd(21)} ${String(g.type ?? "-").padStart(3)} ${String(g.tris).padStart(6)} ${f1(g.areaXZ).padStart(9)} ${f1(g.maxTriAreaXZ).padStart(9)} ${String(g.bigTris).padStart(4)} ${(g.vertFrac * 100).toFixed(0).padStart(5)}% ${f2(g.meanAbsNy).padStart(5)} ${f1(g.meanY).padStart(7)} ${f1(g.bbox.y0).padStart(7)} ${f1(g.bbox.y1).padStart(7)} ${f1(g.cx).padStart(8)} ${f1(g.cz).padStart(8)} ${f1(g.bbox.x1 - g.bbox.x0).padStart(7)} ${f1(g.bbox.z1 - g.bbox.z0).padStart(6)}`,
    );
  }
  const loopsByGroup = {};
  for (let gi = 0; gi < mesh.groups.length; gi++) {
    const g = mesh.groups[gi];
    if (!g.tris || !opt.loopTypes.includes(g.type)) continue;
    const loops = groupBoundaryLoops(mesh, gi);
    loopsByGroup[g.name] = loops;
    const small = loops.filter((l) => l.perim < 400);
    console.log(`loops ${g.name}: ${loops.length} total, ${small.length} small (<400 u); largest perim ${f1(loops[0]?.perim)} bbox ${f1(loops[0]?.w)}x${f1(loops[0]?.d)}`);
    for (const l of small.slice(0, 12)) console.log(`   small loop n=${l.n} perim=${f1(l.perim)} size=${f1(l.w)}x${f1(l.d)} at (${f1(l.cx)}, ${f1(l.cz)}) y=${f1(l.y0)}..${f1(l.y1)}`);
  }
  report.push({ file, base, verts: mesh.verts.length / 3, tris: nt, giantTris: giant, extent: ext, groups: stats, loops: loopsByGroup });

  if (opt.out) {
    const m = 0.03;
    const dx = ext.x1 - ext.x0, dz = ext.z1 - ext.z0;
    const x0 = ext.x0 - dx * m, x1 = ext.x1 + dx * m, z0 = ext.z0 - dz * m, z1 = ext.z1 + dz * m;
    const upp = Math.max(x1 - x0, z1 - z0) / opt.px; // units per pixel
    const w = Math.max(1, Math.round((x1 - x0) / upp)), h = Math.max(1, Math.round((z1 - z0) / upp));
    const include = new Uint8Array(mesh.groups.length);
    mesh.groups.forEach((g, i) => { include[i] = WALL_TYPES.has(g.type) ? 0 : 1; });
    const { height, top } = rasterizeHeight(mesh, { x0, z0, x1, z1, w, h, include, flipZ: opt.flipZ });
    const filled = Float32Array.from(height, (v) => (v === -Infinity ? ext.y0 : v));
    const shade = hillshade(filled, w, h, upp, upp);
    const rgb = Buffer.alloc(w * h * 3);
    for (let p = 0; p < w * h; p++) {
      const g = top[p];
      const type = g < 0 ? null : mesh.groups[g].type;
      const c = g < 0 ? [20, 20, 20] : opt.raw ? TYPE_COLORS[type] || [200, 200, 200] : SEMANTIC_COLORS[KCL_GOLF[type]] || [200, 200, 200];
      const s = g < 0 ? 1 : 0.55 + 0.6 * shade[p];
      rgb[p * 3] = Math.min(255, c[0] * s); rgb[p * 3 + 1] = Math.min(255, c[1] * s); rgb[p * 3 + 2] = Math.min(255, c[2] * s);
    }
    // walls (banks, cliffs and retaining walls along the water and the edge of
    // the terrain; no tree trunks) have no footprint: draw their edges
    const walls = new Uint8Array(mesh.groups.length);
    mesh.groups.forEach((g, i) => { walls[i] = g.type === 12 ? 1 : 0; }); // real walls only; invisible fences (0x0d) span the map
    drawEdges(mesh, { x0, z0, x1, z1, w, h, include: walls, flipZ: opt.flipZ }, rgb, SEMANTIC_COLORS.wall);
    const png = join(opt.out, base + (opt.raw ? "_types.png" : "_preview.png"));
    writePngRGB(png, rgb, w, h);
    console.log(`preview ${png} (${w}x${h}, ${upp.toFixed(2)} u/px${opt.flipZ ? ", Z flipped" : ""}, origin x=${f1(x0)} z=${f1(z0)})`);
  }
}
if (opt.json) { writeFileSync(opt.json, JSON.stringify(report, null, 1)); console.log(`\nwrote ${opt.json}`); }
