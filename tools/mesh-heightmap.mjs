// Rasterize the WSR golf collision meshes (KCL -> OBJ via wszst) into 16-bit heightmaps.
//
//   node tools/mesh-heightmap.mjs <files.obj...> --out <dir> [--res 4 | --px N | --square N]
//        [--yrange MIN MAX] [--margin 0.03] [--names map.json] [--flip-z] [--no-fill] [--keep-floor]
//
// Per mesh this writes:
//   <name>_<W>x<H>.raw    headerless 16-bit unsigned little-endian heightmap, row-major,
//                          column = +X (east), row = +Z (south); row 0 is the north edge
//   <name>_height16.png   the same values as a lossless 16-bit greyscale PNG
//   <name>_preview.png    8-bit hillshaded preview in semantic colours (fairway, rough, sand, green, water...)
//   <name>_classes.png    8-bit class map: pixel value = KCL collision type of the top surface (0 = nodata)
//   <name>.json           georeferencing (origin, units/pixel), height encoding, legend, per-group stats
//
// Height encoding: value = round((y - minY) / (maxY - minY) * 65535) with minY/maxY per mesh
// (or fixed with --yrange so all holes share one vertical scale). The meshes are Y-up and
// horizontal and vertical units are the same, so slopes are true after decoding.
//
// What goes in: every surface group (fairway, rough, sand, outer ground, green, fringe,
// water surface, special zones). Walls (tree trunks, cliffs, fences) are skipped: they have no
// footprint. Giant filler triangles (> 1e5 u² in plan, i.e. ocean / sky-box planes) are skipped
// unless they are water or the floor plane, because those define the water level. Floor-plane
// pixels (the dead plane under water and OB) are treated as nodata and filled from the nearest
// real surface unless --keep-floor is given. Where several surfaces overlap, the topmost wins.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  parseObj, groupStats, groupBoundaryLoops, groupComponents, triVerts, triAreaXZ, rasterizeHeight, fillNodata, hillshade, drawEdges,
  writeRaw16, writePng16, writePng8, writePngRGB, KCL_GOLF, SURFACE_TYPES, WALL_TYPES, SEMANTIC_COLORS,
} from "./lib/obj.mjs";

const args = process.argv.slice(2);
const opt = {
  out: null, res: 4, px: null, square: null, yrange: null, crop: "core", pad: 600, margin: 0.03, names: null, derived: null,
  flipZ: false, fill: true, keepFloor: false, bigTri: 1e5, unitsPerYard: 9.144,
};
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else if (a === "--res") opt.res = +args[++i];
  else if (a === "--px") opt.px = +args[++i];
  else if (a === "--square") opt.square = +args[++i];
  else if (a === "--yrange") opt.yrange = [+args[++i], +args[++i]];
  else if (a === "--crop") opt.crop = args[++i]; // core = hole surfaces + pad (default), all = every non-giant surface + margin
  else if (a === "--pad") opt.pad = +args[++i]; // units of outer ground kept around the core crop
  else if (a === "--margin") opt.margin = +args[++i];
  else if (a === "--names") { const m = JSON.parse(readFileSync(args[++i], "utf8")); opt.names = m; if (m.unitsPerYard) opt.unitsPerYard = m.unitsPerYard; }
  else if (a === "--derived") opt.derived = JSON.parse(readFileSync(args[++i], "utf8")); // public/derived.json for app-frame registration
  else if (a === "--flip-z") opt.flipZ = true;
  else if (a === "--no-fill") opt.fill = false;
  else if (a === "--keep-floor") opt.keepFloor = true;
  else files.push(a);
}
if (!files.length || !opt.out) {
  console.error("usage: node tools/mesh-heightmap.mjs <files.obj...> --out <dir> [--res u/px | --px N | --square N] [--yrange MIN MAX] [--crop core|all] [--pad units] [--margin f] [--names map.json] [--derived derived.json] [--flip-z] [--no-fill] [--keep-floor]");
  process.exit(1);
}
mkdirSync(opt.out, { recursive: true });
const f1 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(1));
const CORE_TYPES = new Set([1, 2, 3, 6, 9]); // fairway, rough, sand, green, fringe: what the minimap frames

// Tee pad: a small, perfectly flat fairway-class component far from the green
// (fragments of one pad are merged). Returns null when none qualifies.
function findTeePad(mesh, green) {
  const gi = mesh.groups.findIndex((g) => g.type === 1 && g.tris > 0);
  if (gi < 0 || !green) return null;
  const pads = groupComponents(mesh, gi).filter((c) => c.w >= 20 && c.d >= 20 && c.w <= 300 && c.d <= 300 && c.y1 - c.y0 <= 0.6 && c.tris >= 4);
  if (!pads.length) return null;
  pads.sort((a, b) => Math.hypot(b.cx - green.cx, b.cz - green.cz) - Math.hypot(a.cx - green.cx, a.cz - green.cz));
  const far = pads[0];
  const frags = pads.filter((p) => Math.hypot(p.cx - far.cx, p.cz - far.cz) < 250 && Math.abs(p.y0 - far.y0) < 0.6);
  const area = frags.reduce((s, p) => s + p.areaXZ, 0) || 1;
  return {
    x: f1(frags.reduce((s, p) => s + p.cx * p.areaXZ, 0) / area), z: f1(frags.reduce((s, p) => s + p.cz * p.areaXZ, 0) / area), y: f1(far.y0),
    width: f1(Math.max(...frags.map((p) => p.x1)) - Math.min(...frags.map((p) => p.x0))), depth: f1(Math.max(...frags.map((p) => p.z1)) - Math.min(...frags.map((p) => p.z0))),
    fragments: frags.length,
  };
}

for (const file of files) {
  const t0 = Date.now();
  const mesh = parseObj(file);
  const stats = groupStats(mesh);
  const nt = mesh.tris.length / 3;
  const meshId = basename(file).replace(/^WS2_glf_course_/, "").replace(/\.kcl\.obj$/i, "").replace(/\.obj$/i, "");
  const hole = opt.names ? opt.names[meshId] ?? null : null;
  const name = hole ? `hole-${String(hole).padStart(2, "0")}` : meshId;

  // extent: "core" = the hole's own surfaces (fairway/rough/sand/green/fringe) plus a fixed pad of
  // whatever outer ground is there; "all" = every non-giant surface triangle plus a relative margin
  const ext = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let t = 0; t < nt; t++) {
    const g = mesh.groups[mesh.triGroup[t]];
    if (opt.crop === "core" ? !CORE_TYPES.has(g.type) : !SURFACE_TYPES.has(g.type) || g.type === 5) continue;
    const v = triVerts(mesh, t);
    if (triAreaXZ(v) > opt.bigTri) continue;
    for (let k = 0; k < 9; k += 3) {
      ext.x0 = Math.min(ext.x0, v[k]); ext.x1 = Math.max(ext.x1, v[k]);
      ext.z0 = Math.min(ext.z0, v[k + 2]); ext.z1 = Math.max(ext.z1, v[k + 2]);
      ext.y0 = Math.min(ext.y0, v[k + 1]); ext.y1 = Math.max(ext.y1, v[k + 1]);
    }
  }
  let dx = ext.x1 - ext.x0, dz = ext.z1 - ext.z0;
  const padX = opt.crop === "core" ? opt.pad : dx * opt.margin, padZ = opt.crop === "core" ? opt.pad : dz * opt.margin;
  let x0 = ext.x0 - padX, x1 = ext.x1 + padX, z0 = ext.z0 - padZ, z1 = ext.z1 + padZ;
  dx = x1 - x0; dz = z1 - z0;
  let upp, w, h;
  if (opt.square) {
    upp = Math.max(dx, dz) / opt.square; w = h = opt.square;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = (opt.square * upp) / 2;
    x0 = cx - half; x1 = cx + half; z0 = cz - half; z1 = cz + half;
  } else {
    upp = opt.px ? Math.max(dx, dz) / opt.px : opt.res;
    w = Math.max(1, Math.round(dx / upp)); h = Math.max(1, Math.round(dz / upp));
    x1 = x0 + w * upp; z1 = z0 + h * upp; // keep pixels exactly square
  }

  const include = new Uint8Array(mesh.groups.length);
  mesh.groups.forEach((g, i) => { include[i] = SURFACE_TYPES.has(g.type) ? 1 : 0; });
  const triFilter = (t, v) => {
    const type = mesh.groups[mesh.triGroup[t]].type;
    return type === 5 || type === 7 || triAreaXZ(v) <= opt.bigTri;
  };
  const { height, top } = rasterizeHeight(mesh, { x0, z0, x1, z1, w, h, include, flipZ: opt.flipZ, triFilter });

  const classes = new Uint8Array(w * h);
  let floorDropped = 0, nodata = 0;
  for (let p = 0; p < w * h; p++) {
    const g = top[p];
    const type = g < 0 ? 0 : mesh.groups[g].type;
    classes[p] = type;
    if (type === 5 && !opt.keepFloor) { height[p] = -Infinity; floorDropped++; }
    if (height[p] === -Infinity) nodata++;
  }
  let filled = height, nFilled = 0;
  if (opt.fill) { const r = fillNodata(height, w, h); filled = r.height; nFilled = r.filled; }
  let minY = Infinity, maxY = -Infinity;
  for (let p = 0; p < w * h; p++) { const y = filled[p]; if (y === -Infinity) continue; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!isFinite(minY)) { minY = 0; maxY = 1; }
  const [encMin, encMax] = opt.yrange || [minY, maxY];
  const span = encMax - encMin || 1;
  const u16 = new Uint16Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const y = filled[p] === -Infinity ? encMin : filled[p];
    u16[p] = Math.max(0, Math.min(65535, Math.round(((y - encMin) / span) * 65535)));
  }

  // preview: semantic colours x hillshade, walls drawn as edges
  const shade = hillshade(Float32Array.from(filled, (v) => (v === -Infinity ? encMin : v)), w, h, upp, upp);
  const rgb = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const c = classes[p] ? SEMANTIC_COLORS[KCL_GOLF[classes[p]]] || [200, 200, 200] : [16, 16, 16];
    const s = classes[p] ? 0.55 + 0.6 * shade[p] : 1;
    rgb[p * 3] = Math.min(255, c[0] * s); rgb[p * 3 + 1] = Math.min(255, c[1] * s); rgb[p * 3 + 2] = Math.min(255, c[2] * s);
  }
  const walls = new Uint8Array(mesh.groups.length);
  mesh.groups.forEach((g, i) => { walls[i] = g.type === 12 ? 1 : 0; }); // real walls only; invisible fences (0x0d) span the map
  drawEdges(mesh, { x0, z0, x1, z1, w, h, include: walls, flipZ: opt.flipZ }, rgb, SEMANTIC_COLORS.wall);

  const rawPath = join(opt.out, `${name}_${w}x${h}.raw`);
  writeRaw16(rawPath, u16, true);
  writePng16(join(opt.out, `${name}_height16.png`), u16, w, h);
  writePngRGB(join(opt.out, `${name}_preview.png`), rgb, w, h);
  writePng8(join(opt.out, `${name}_classes.png`), classes, w, h);

  // green, cup and tee geometry straight from the mesh (registration anchors for the app's data)
  const toPixel = (x, z) => [+(((x - x0) / upp) - 0.5).toFixed(1), +(((opt.flipZ ? z1 - z : z - z0) / upp) - 0.5).toFixed(1)];
  const gi = mesh.groups.findIndex((g) => g.type === 6 && g.tris > 0);
  let green = null, greenLoop = null;
  if (gi >= 0) {
    const loops = groupBoundaryLoops(mesh, gi).filter((l) => l.perim > 50);
    const main = loops.slice().sort((a, b) => b.n - a.n)[0];
    const cups = loops.filter((l) => l !== main && l.w < 40 && l.d < 40 && l.w > 5);
    if (main) {
      greenLoop = main;
      green = {
        centerX: f1(main.cx), centerZ: f1(main.cz), width: f1(main.w), depth: f1(main.d), minY: f1(main.y0), maxY: f1(main.y1),
        pixel: toPixel(main.cx, main.cz),
        cups: cups.map((c) => ({ x: f1(c.cx), z: f1(c.cz), y: f1((c.y0 + c.y1) / 2), pixel: toPixel(c.cx, c.cz) })),
      };
    }
  }
  const tee = findTeePad(mesh, greenLoop);
  if (tee) { tee.pixel = toPixel(tee.x, tee.z); tee.toGreenCenterUnits = f1(Math.hypot(tee.x - greenLoop.cx, tee.z - greenLoop.cz)); tee.toGreenCenterYards = f1(tee.toGreenCenterUnits / opt.unitsPerYard); }

  // first-cut registration of the app's minimap frame (derived.json: fractional coords on a 250x304
  // panel, scale in yd/px) onto mesh units: green centres coincide, no rotation, scale from the
  // yardage calibration. Good to roughly 10 yd; a proper fit against the fairway outline would do better.
  let app = null;
  const dh = opt.derived && hole ? opt.derived.holes[String(hole)] : null;
  if (dh && dh.greenBox && greenLoop) {
    const W = opt.derived.mapW, H = opt.derived.mapH;
    const gcx = (dh.greenBox.x0 + dh.greenBox.x1) / 2, gcy = (dh.greenBox.y0 + dh.greenBox.y1) / 2;
    const s = dh.scale ? dh.scale * opt.unitsPerYard : null; // mesh units per minimap pixel
    const fracToMesh = (fx, fy) => (s ? [greenLoop.cx + (fx - gcx) * W * s, greenLoop.cz + (fy - gcy) * H * s] : null);
    const teeM = dh.tee && s ? fracToMesh(dh.tee.x, dh.tee.y) : null;
    app = {
      yards: dh.yards, scaleYdPerPx: dh.scale, unitsPerYard: opt.unitsPerYard, panel: [W, H],
      greenCenterFrac: [+gcx.toFixed(4), +gcy.toFixed(4)],
      fracToMesh: s ? `x = ${f1(greenLoop.cx)} + (fx - ${gcx.toFixed(4)}) * ${W} * ${s.toFixed(4)}; z = ${f1(greenLoop.cz)} + (fy - ${gcy.toFixed(4)}) * ${H} * ${s.toFixed(4)}` : null,
      teeResidualUnits: teeM && tee ? f1(Math.hypot(teeM[0] - tee.x, teeM[1] - tee.z)) : null,
      pins: (dh.pins || []).map((p) => { const m = fracToMesh(p.x, p.y); return m ? { frac: [p.x, p.y], x: f1(m[0]), z: f1(m[1]), pixel: toPixel(m[0], m[1]), insideGreen: Math.abs(m[0] - greenLoop.cx) < greenLoop.w / 2 && Math.abs(m[1] - greenLoop.cz) < greenLoop.d / 2 } : { frac: [p.x, p.y] }; }),
    };
  }
  const classCounts = {};
  for (let p = 0; p < w * h; p++) classCounts[classes[p]] = (classCounts[classes[p]] || 0) + 1;
  const meta = {
    source: basename(file), meshId: meshId, hole, units: { metresPerUnit: 0.1, unitsPerYard: opt.unitsPerYard },
    crop: { mode: opt.crop, padUnits: opt.crop === "core" ? opt.pad : null, margin: opt.crop === "all" ? opt.margin : null },
    raster: {
      width: w, height: h, unitsPerPixel: +upp.toFixed(6), originX: +x0.toFixed(3), originZ: +z0.toFixed(3),
      extentX: [+x0.toFixed(3), +x1.toFixed(3)], extentZ: [+z0.toFixed(3), +z1.toFixed(3)],
      columnAxis: "+X", rowAxis: opt.flipZ ? "-Z" : "+Z",
      pixelCenter: opt.flipZ
        ? "x = originX + (col + 0.5) * unitsPerPixel; z = extentZ[1] - (row + 0.5) * unitsPerPixel"
        : "x = originX + (col + 0.5) * unitsPerPixel; z = originZ + (row + 0.5) * unitsPerPixel",
      playableExtent: { x: [f1(ext.x0), f1(ext.x1)], z: [f1(ext.z0), f1(ext.z1)], y: [f1(ext.y0), f1(ext.y1)] },
    },
    height: {
      file: basename(rawPath), format: "uint16 little-endian, headerless, row-major", png16: `${name}_height16.png`,
      encodeMinY: +encMin.toFixed(3), encodeMaxY: +encMax.toFixed(3), decode: "y = encodeMinY + value / 65535 * (encodeMaxY - encodeMinY)",
      dataMinY: +minY.toFixed(3), dataMaxY: +maxY.toFixed(3), nodataPixels: nodata, floorPixelsDropped: floorDropped, pixelsFilledFromNeighbours: nFilled,
    },
    classes: { file: `${name}_classes.png`, legend: Object.fromEntries(Object.entries(KCL_GOLF).map(([k, v]) => [k, v])), nodata: 0, pixelCounts: classCounts },
    green, tee, app,
    groups: stats.filter((g) => g.tris).map((g) => ({
      name: g.name, flag: g.flag, type: g.type, class: KCL_GOLF[g.type] || "unknown", triangles: g.tris,
      rasterized: !!include[mesh.groups.findIndex((x) => x.name === g.name)], areaXZ: Math.round(g.areaXZ),
      meanY: f1(g.meanY), minY: f1(g.bbox.y0), maxY: f1(g.bbox.y1),
    })),
    mesh: { vertices: mesh.verts.length / 3, triangles: nt },
  };
  writeFileSync(join(opt.out, `${name}.json`), JSON.stringify(meta, null, 1));
  console.log(`${name.padEnd(8)} ${meshId.padEnd(7)} ${w}x${h} @ ${upp.toFixed(2)} u/px  y ${minY.toFixed(1)}..${maxY.toFixed(1)}  nodata ${nodata} (floor ${floorDropped}) filled ${nFilled}  green ${green ? `${green.width}x${green.depth} @(${green.centerX},${green.centerZ}) cups ${green.cups.length}` : "-"}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
