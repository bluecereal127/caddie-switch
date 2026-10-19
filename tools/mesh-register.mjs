// Register each WSR collision mesh to the app's hole-map frame.
//
//   node tools/mesh-register.mjs --heightmaps captures/meshes/heightmaps-res4 --out captures/meshes/registration
//        [--json tools/mesh-registration.json] [--holes 3,11] [--classify-only] [--maps captures/derived/maps]
//        [--derived public/derived.json] [--names tools/mesh-holes.json]
//
// The app's frame is the 250x304 minimap panel with fractional coordinates.
// The input is the Switch's own minimap art: the capture stack of each hole,
// captures/derived/maps/hNN.png (250x304, extract-maps.mjs), from the --maps
// directory. NEVER src/maps.js: since 2026-10-18 it holds the 500x608 renders
// of WSR's minimap model drawn through this very registration
// (tools/render-maps.mjs), so a fit against it is circular and wrong (on H7:
// 12.6 degrees of rotation at half the scale, score 0.97 against 3.0). A .js
// module exporting HOLE_MAPS (the stack-based src/maps.js of an older commit)
// is still accepted as --maps; any image that is not 250x304 is refused.
// For every hole this fits a similarity transform (scale, rotation,
// translation) from map pixels to mesh units by maximising the overlap between
// the minimap's colour classes (fairway / green / sand / water / rough / outer
// ground, classified by hue-saturation-value rules) and the mesh surface-class
// raster written by mesh-heightmap.mjs. The green centre + yardage scale from
// derived.json seeds the search; a coarse grid at half resolution is refined
// by a pattern search at full resolution.
//
// Outputs: <out>/hole-NN_overlay.png (3x minimap with mesh class edges, tee and
// pins drawn on top, for eyeballing), <out>/hole-NN_mapclass.png (the minimap
// classification), and one JSON with the transform both ways per hole.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { writePngRGB } from "./lib/obj.mjs";

const args = process.argv.slice(2);
const opt = { heightmaps: "captures/meshes/heightmaps-res4", out: "captures/meshes/registration", json: null, holes: null, classifyOnly: false, maps: "captures/derived/maps", derived: "public/derived.json", names: "tools/mesh-holes.json", other: "water" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--other") opt.other = args[++i]; // penalize | water | ignore (see score())
  else if (a === "--heightmaps") opt.heightmaps = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--json") opt.json = args[++i];
  else if (a === "--holes") opt.holes = args[++i].split(",").map(Number);
  else if (a === "--classify-only") opt.classifyOnly = true;
  else if (a === "--maps") opt.maps = args[++i];
  else if (a === "--derived") opt.derived = args[++i];
  else if (a === "--names") opt.names = args[++i];
}
mkdirSync(opt.out, { recursive: true });
const derived = JSON.parse(readFileSync(opt.derived, "utf8"));
const names = JSON.parse(readFileSync(opt.names, "utf8"));
const UPY = names.unitsPerYard || 9.144;
const holeToMesh = {};
for (const [k, v] of Object.entries(names)) if (typeof v === "number" && !k.startsWith("_") && !["unitsPerYard", "metresPerUnit"].includes(k)) holeToMesh[v] = k;
// --maps: a directory of capture stacks (hNN.png), or a .js module exporting
// HOLE_MAPS (base64 JPEG per hole); only the latter is imported, lazily
const HOLE_MAPS = opt.maps.endsWith(".js") ? (await import(pathToFileURL(resolve(process.cwd(), opt.maps)).href)).HOLE_MAPS : null;

// ---- minimap colour classes ----
// 1 fairway, 2 rough, 3 sand, 4 outer ground, 6 green, 7 water, 0 other/unknown, 255 excluded (wind dial)
const MC = { fairway: 1, rough: 2, sand: 3, outer: 4, green: 6, water: 7, other: 0, excluded: 255 };
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) { if (mx === r) h = (g - b) / (mx - mn); else if (mx === g) h = 2 + (b - r) / (mx - mn); else h = 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; }
  return [h, s, v];
}
// The putting surface's hex pattern is the same bright green as the fairway, so
// colour cannot separate them: both land in "fairway" here, and the "grass" term
// merges fairway and green on the mesh side to match.
export function classifyMinimapPixel(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (h >= 170 && h <= 230 && s >= 0.25 && v < 0.55) return MC.water;             // deep sea / river
  if (h >= 135 && h <= 230 && s >= 0.08 && s < 0.6 && v >= 0.55) return MC.water; // pale / mint lake water
  if (h >= 25 && h <= 65 && s >= 0.18 && s < 0.55 && v >= 0.65) return MC.sand;   // beige bunkers / beaches
  if (h >= 60 && h <= 120 && s >= 0.4 && v >= 0.6) return MC.fairway;             // bright striped fairway (+ hex green)
  if (h >= 80 && h <= 130 && s >= 0.35 && v >= 0.38 && v < 0.6) return MC.rough;  // mid green
  if (h >= 80 && h <= 160 && v < 0.38) return MC.outer;                            // dark dotted ground
  return MC.other;
}
const MAP_CLASS_COLORS = { 1: [128, 205, 70], 2: [78, 156, 58], 3: [236, 216, 150], 4: [44, 96, 46], 6: [160, 235, 150], 7: [96, 165, 232], 0: [120, 120, 120], 255: [20, 20, 20] };

// The wind dial sits in the bottom-LEFT corner on some holes and bottom-RIGHT on
// others. Its white ring + "NN mph" text are the only near-white pixels down
// there, so the corner with more of them holds the dial; mask their bbox + pad.
function detectDial(W, H, data, pad = 4) {
  const box = { left: { n: 0, x0: W, y0: H, x1: -1, y1: -1 }, right: { n: 0, x0: W, y0: H, x1: -1, y1: -1 } };
  for (let y = Math.floor(H * 0.72); y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const [, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
    if (v <= 0.85 || s >= 0.15) continue;
    const b = x < W * 0.36 ? box.left : x > W * 0.64 ? box.right : null;
    if (!b) continue;
    b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
  }
  const side = box.right.n >= box.left.n ? "right" : "left";
  const b = box[side];
  if (b.n < 50) return null;
  return { side, x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(W - 1, b.x1 + pad), y1: Math.min(H - 1, b.y1 + pad), whitePx: b.n };
}

function decodeMinimap(hole) {
  let W, H, data;
  if (HOLE_MAPS) ({ width: W, height: H, data } = jpeg.decode(Buffer.from(HOLE_MAPS[hole].split(",")[1], "base64"), { useTArray: true, formatAsRGBA: true }));
  else ({ width: W, height: H, data } = PNG.sync.read(readFileSync(join(opt.maps, `h${String(hole).padStart(2, "0")}.png`))));
  // the renders in today's src/maps.js are 500x608 and drawn through this registration: not an input
  if (W !== 250 || H !== 304) throw new Error(`hole ${hole}: --maps ${opt.maps} gives a ${W}x${H} image, not the 250x304 Switch minimap panel; src/maps.js holds the renders of WSR's model drawn through this registration (circular), fit against the capture stacks captures/derived/maps/hNN.png`);
  const dial = detectDial(W, H, data);
  const cls = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const masked = y < 3 /* panel's top border line */ || (dial && x >= dial.x0 && x <= dial.x1 && y >= dial.y0 && y <= dial.y1);
    cls[y * W + x] = masked ? MC.excluded : classifyMinimapPixel(data[i], data[i + 1], data[i + 2]);
  }
  return { W, H, rgba: data, cls, dial };
}

// ---- mesh class raster (from mesh-heightmap.mjs output) ----
// registration classes for mesh types: 1,2,3,4,6,7 kept; 9 fringe / 5 floor / 14 zone / 16 fall / 0 nodata -> 0 (ignored)
const MESH_TO_REG = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 6, 7: 7 };
function loadMeshRaster(hole) {
  const tag = `hole-${String(hole).padStart(2, "0")}`;
  const meta = JSON.parse(readFileSync(join(opt.heightmaps, `${tag}.json`), "utf8"));
  const png = PNG.sync.read(readFileSync(join(opt.heightmaps, `${tag}_classes.png`)));
  const w = png.width, h = png.height;
  const cls = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) cls[p] = MESH_TO_REG[png.data[p * 4]] || 0;
  return { meta, w, h, cls, originX: meta.raster.originX, originZ: meta.raster.originZ, upp: meta.raster.unitsPerPixel };
}

// ---- transform: map px (u,v) -> mesh (X,Z); pivot at the map green centre ----
function makeXform(p, pivot) {
  const c = Math.cos(p.theta), s = Math.sin(p.theta);
  return (u, v) => {
    const du = u - pivot.u0, dv = v - pivot.v0;
    return [p.X0 + p.s * (c * du - s * dv), p.Z0 + p.s * (s * du + c * dv)];
  };
}
// Overlap terms: map classes vs mesh classes (weighted IoU). "grass" merges fairway
// and green on both sides because the minimap colours cannot tell them apart.
// The app's greenPoly is NOT a term: it was capture-derived and misplaced on six
// holes (5/7/8/10/14/18), and the stack-based src/maps.js of the time had a green
// texture transplanted at that same derived box, so neither may steer the fit
// (the stacks themselves only have the flag painted out). Its offset from the
// mesh green is reported as a diagnostic instead.
const TERMS = [
  { id: "grass", w: 1.0, m: new Set([1, 6]), k: new Set([1, 6]) },
  { id: "sand", w: 1.0, m: new Set([3]), k: new Set([3]) },
  { id: "water", w: 1.0, m: new Set([7]), k: new Set([7]) },
  { id: "rough", w: 0.5, m: new Set([2]), k: new Set([2]) },
  { id: "outer", w: 0.3, m: new Set([4]), k: new Set([4]) },
];
function score(map, mesh, p, pivot, step) {
  const xf = makeXform(p, pivot);
  const terms = TERMS;
  const inter = new Float64Array(terms.length), uni = new Float64Array(terms.length);
  for (let v = 0; v < map.H; v += step) for (let u = 0; u < map.W; u += step) {
    const m = map.cls[v * map.W + u];
    if (m === MC.excluded) continue;
    const [X, Z] = xf(u + 0.5, v + 0.5);
    const i = Math.floor((X - mesh.originX) / mesh.upp), j = Math.floor((Z - mesh.originZ) / mesh.upp);
    const k = i >= 0 && j >= 0 && i < mesh.w && j < mesh.h ? mesh.cls[j * mesh.w + i] : 0;
    // map pixels the classifier cannot name (brown cliff/bank bands, tee mats, UI
    // glyphs): "penalize" skips them only over mesh nodata; "water" also skips them
    // over mesh water (the mesh puts water under cliff faces, walls have no
    // footprint); "ignore" skips them always (lets the mesh grow into cliff bands)
    if (m === MC.other && (k === 0 || opt.other === "ignore" || (opt.other === "water" && k === 7))) continue;
    for (let t = 0; t < terms.length; t++) {
      const a = terms[t].m.has(m), b = k !== 0 && terms[t].k.has(k);
      if (a && b) inter[t]++;
      if (a || b) uni[t]++; // a map feature over mesh nodata counts against the fit
    }
  }
  let total = 0; const iou = {};
  terms.forEach((t, i) => { iou[t.id] = uni[i] ? inter[i] / uni[i] : 0; total += t.w * iou[t.id]; });
  return { total, iou };
}

function registerHole(hole) {
  const meshId = holeToMesh[hole];
  const dh = derived.holes[String(hole)] || {};
  const map = decodeMinimap(hole); // no greenPoly painting: see TERMS
  const mesh = loadMeshRaster(hole);
  const gm = mesh.meta.green;
  if (!gm) throw new Error(`hole ${hole}: no green in mesh sidecar`);
  const gb = dh.greenBox;
  const pivot = gb ? { u0: ((gb.x0 + gb.x1) / 2) * map.W, v0: ((gb.y0 + gb.y1) / 2) * map.H } : { u0: map.W / 2, v0: map.H * 0.25 };
  // seed: yardage calibration if the app has one; otherwise match the extent of the
  // grass classes (fairway + rough + green) in both frames and align their centres
  let s0 = dh.scale ? dh.scale * UPY : null;
  let X0 = gm.centerX, Z0 = gm.centerZ;
  const seeded = !!dh.scale;
  if (!seeded) {
    const bb = (pred, W, H, at) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pred(at(x, y))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
    const grass = (c) => c === 1 || c === 2 || c === 6;
    const mb = bb(grass, map.W, map.H, (x, y) => map.cls[y * map.W + x]);
    const kb = bb(grass, mesh.w, mesh.h, (x, y) => mesh.cls[y * mesh.w + x]);
    const sx = ((kb.x1 - kb.x0) * mesh.upp) / (mb.x1 - mb.x0), sz = ((kb.y1 - kb.y0) * mesh.upp) / (mb.y1 - mb.y0);
    s0 = (sx + sz) / 2;
    // mesh point under the map pivot when the two grass bboxes are centred on each other
    const mcx = (mb.x0 + mb.x1) / 2, mcy = (mb.y0 + mb.y1) / 2;
    const kcx = mesh.originX + ((kb.x0 + kb.x1) / 2) * mesh.upp, kcz = mesh.originZ + ((kb.y0 + kb.y1) / 2) * mesh.upp;
    X0 = kcx + (pivot.u0 - mcx) * s0; Z0 = kcz + (pivot.v0 - mcy) * s0;
  }
  let best = { p: { s: s0, theta: 0, X0, Z0 }, ...score(map, mesh, { s: s0, theta: 0, X0, Z0 }, pivot, 1) };
  const init = best;
  // coarse grid, half resolution
  const sRange = seeded ? 0.18 : 0.3, sStep = 0.03, tRange = seeded ? 30 : 45;
  for (let sf = 1 - sRange; sf <= 1 + sRange + 1e-9; sf += sStep) {
    for (let th = -8; th <= 8; th += 2) {
      for (let dz = -tRange; dz <= tRange; dz += 5) for (let dx = -tRange; dx <= tRange; dx += 5) {
        const p = { s: s0 * sf, theta: (th * Math.PI) / 180, X0: X0 + dx * s0, Z0: Z0 + dz * s0 };
        const r = score(map, mesh, p, pivot, 2);
        if (r.total > best.total) best = { p, ...r };
      }
    }
  }
  // pattern search at full resolution over the full 3^4-1 stencil: rotation about
  // the green pivot has to be paired with a shift to move the far (tee) end, which
  // a one-parameter-at-a-time search cannot do (it left hole 7 stuck at exactly 1 deg)
  let steps = { s: 0.02, theta: (1 * Math.PI) / 180, X0: 2 * s0, Z0: 2 * s0 };
  best = { p: best.p, ...score(map, mesh, best.p, pivot, 1) };
  for (let round = 0; round < 80; round++) {
    let cand = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) {
      if (!a && !b && !c && !d) continue;
      const p = { s: best.p.s * (1 + a * steps.s), theta: best.p.theta + b * steps.theta, X0: best.p.X0 + c * steps.X0, Z0: best.p.Z0 + d * steps.Z0 };
      const r = score(map, mesh, p, pivot, 1);
      if (r.total > (cand ? cand.total : best.total) + 1e-6) cand = { p, ...r };
    }
    if (cand) { best = cand; continue; }
    steps = { s: steps.s / 2, theta: steps.theta / 2, X0: steps.X0 / 2, Z0: steps.Z0 / 2 };
    if (steps.s < 0.0015) break;
  }
  const p = best.p;
  const xf = makeXform(p, pivot);
  const c = Math.cos(p.theta), sn = Math.sin(p.theta);
  // fractional map coords -> mesh: X = a*fx + b*fy + e ; Z = c*fx + d*fy + f
  const A = [[p.s * c * map.W, -p.s * sn * map.H, p.X0 - p.s * (c * pivot.u0 - sn * pivot.v0)], [p.s * sn * map.W, p.s * c * map.H, p.Z0 - p.s * (sn * pivot.u0 + c * pivot.v0)]];
  const inv = (X, Z) => { const dx = (X - p.X0) / p.s, dz = (Z - p.Z0) / p.s; const u = c * dx + sn * dz + pivot.u0, v = -sn * dx + c * dz + pivot.v0; return [u / map.W, v / map.H]; };
  const B = (() => { const o = inv(0, 0), ex = inv(1, 0), ez = inv(0, 1); return [[ex[0] - o[0], ez[0] - o[0], o[0]], [ex[1] - o[1], ez[1] - o[1], o[1]]]; })();
  // diagnostics: tee and pins
  const tee = mesh.meta.tee;
  const teeMap = tee ? inv(tee.x, tee.z) : null;
  const teeResidualPx = tee && dh.tee ? Math.hypot((teeMap[0] - dh.tee.x) * map.W, (teeMap[1] - dh.tee.y) * map.H) : null;
  const pins = (dh.pins || []).map((q) => { const [X, Z] = xf(q.x * map.W, q.y * map.H); return { frac: [q.x, q.y], x: +X.toFixed(1), z: +Z.toFixed(1), insideGreen: Math.abs(X - gm.centerX) < gm.width / 2 && Math.abs(Z - gm.centerZ) < gm.depth / 2 }; });
  const greenMap = inv(gm.centerX, gm.centerZ);
  const result = {
    hole, meshId, map: { width: map.W, height: map.H, windDialMasked: map.dial ? [map.dial.side, map.dial.x0, map.dial.y0, map.dial.x1, map.dial.y1] : null },
    seed: { scaleUnitsPerPx: +s0.toFixed(4), fromAppScale: seeded },
    transform: { unitsPerMapPx: +p.s.toFixed(4), rotationDeg: +((p.theta * 180) / Math.PI).toFixed(3), pivotPx: [+pivot.u0.toFixed(2), +pivot.v0.toFixed(2)], pivotMesh: [+p.X0.toFixed(2), +p.Z0.toFixed(2)] },
    mapFracToMesh: A.map((r) => r.map((v) => +v.toFixed(5))), meshToMapFrac: B.map((r) => r.map((v) => +v.toFixed(8))),
    ydPerPx: +(p.s / UPY).toFixed(4), appScaleYdPerPx: dh.scale ?? null,
    score: +best.total.toFixed(4), iou: Object.fromEntries(Object.entries(best.iou).map(([k, v]) => [k, +v.toFixed(3)])),
    seedScore: +init.total.toFixed(4), seedIou: Object.fromEntries(Object.entries(init.iou).map(([k, v]) => [k, +v.toFixed(3)])),
    greenCentreMapFrac: [+greenMap[0].toFixed(4), +greenMap[1].toFixed(4)], appGreenCentreFrac: gb ? [+((gb.x0 + gb.x1) / 2).toFixed(4), +((gb.y0 + gb.y1) / 2).toFixed(4)] : null,
    appGreenOffsetPx: gb ? +Math.hypot(((gb.x0 + gb.x1) / 2 - greenMap[0]) * map.W, ((gb.y0 + gb.y1) / 2 - greenMap[1]) * map.H).toFixed(1) : null,
    teeMapFrac: teeMap ? [+teeMap[0].toFixed(4), +teeMap[1].toFixed(4)] : null, appTeeFrac: dh.tee ? [dh.tee.x, dh.tee.y] : null, teeResidualPx: teeResidualPx == null ? null : +teeResidualPx.toFixed(1),
    pins,
  };
  // overlay: 3x minimap with mesh class edges + tee + pins
  const S = 3, OW = map.W * S, OH = map.H * S;
  const rgb = Buffer.alloc(OW * OH * 3);
  const meshAt = (u, v) => { const [X, Z] = xf(u, v); const i = Math.floor((X - mesh.originX) / mesh.upp), j = Math.floor((Z - mesh.originZ) / mesh.upp); return i >= 0 && j >= 0 && i < mesh.w && j < mesh.h ? mesh.cls[j * mesh.w + i] : 0; };
  const EDGE = { 1: [255, 255, 255], 6: [255, 240, 0], 3: [255, 140, 0], 7: [0, 230, 255] };
  const kcache = new Uint8Array(OW * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) kcache[y * OW + x] = meshAt((x + 0.5) / S, (y + 0.5) / S);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const si = (Math.floor(y / S) * map.W + Math.floor(x / S)) * 4;
    let col = [map.rgba[si], map.rgba[si + 1], map.rgba[si + 2]];
    const k = kcache[y * OW + x];
    if (EDGE[k]) {
      const kl = x ? kcache[y * OW + x - 1] : k, ku = y ? kcache[(y - 1) * OW + x] : k, kr = x + 1 < OW ? kcache[y * OW + x + 1] : k, kd = y + 1 < OH ? kcache[(y + 1) * OW + x] : k;
      if (kl !== k || ku !== k || kr !== k || kd !== k) col = EDGE[k];
    }
    const o = (y * OW + x) * 3; rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
  }
  const dot = (fx, fy, colr, r) => { const cx = fx * OW, cy = fy * OH; for (let y = Math.max(0, cy - r); y <= Math.min(OH - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(OW - 1, cx + r); x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d >= r - 1.5) { const o = (Math.floor(y) * OW + Math.floor(x)) * 3; rgb[o] = colr[0]; rgb[o + 1] = colr[1]; rgb[o + 2] = colr[2]; } } };
  if (teeMap) dot(teeMap[0], teeMap[1], [255, 0, 255], 7);   // mesh tee pad: magenta ring
  if (dh.tee) dot(dh.tee.x, dh.tee.y, [255, 255, 255], 4);     // app tee marker: small white ring
  for (const q of dh.pins || []) dot(q.x, q.y, [255, 0, 0], 4); // app pins: red rings
  dot(greenMap[0], greenMap[1], [255, 240, 0], 5);             // mesh green centre: yellow ring
  if (dh.greenPoly) {                                          // app green polygon: magenta outline
    const P = dh.greenPoly;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const n = Math.ceil(Math.hypot((bx - ax) * OW, (by - ay) * OH)) + 1;
      for (let t = 0; t <= n; t++) { const x = Math.round((ax + ((bx - ax) * t) / n) * OW), y = Math.round((ay + ((by - ay) * t) / n) * OH); if (x >= 0 && y >= 0 && x < OW && y < OH) { const o = (y * OW + x) * 3; rgb[o] = 255; rgb[o + 1] = 0; rgb[o + 2] = 255; } }
    }
  }
  const tag = `hole-${String(hole).padStart(2, "0")}`;
  writePngRGB(join(opt.out, `${tag}_overlay.png`), rgb, OW, OH);
  // side-by-side at 2x: minimap | mesh classes warped into the map frame | overlay
  const S2 = 2, CW = map.W * S2, CH = map.H * S2;
  const cmp = Buffer.alloc(CW * 3 * CH * 3);
  const put = (panel, x, y, c) => { const o = ((y * CW * 3) + panel * CW + x) * 3; cmp[o] = c[0]; cmp[o + 1] = c[1]; cmp[o + 2] = c[2]; };
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const si = (Math.floor(y / S2) * map.W + Math.floor(x / S2)) * 4;
    put(0, x, y, [map.rgba[si], map.rgba[si + 1], map.rgba[si + 2]]);
    const k = meshAt((x + 0.5) / S2, (y + 0.5) / S2);
    put(1, x, y, MAP_CLASS_COLORS[k] || [20, 20, 20]);
    const oi = (Math.floor((y * S) / S2) * OW + Math.floor((x * S) / S2)) * 3;
    put(2, x, y, [rgb[oi], rgb[oi + 1], rgb[oi + 2]]);
  }
  writePngRGB(join(opt.out, `${tag}_compare.png`), cmp, CW * 3, CH);
  return result;
}

function writeMapClass(hole) {
  const map = decodeMinimap(hole);
  const rgb = Buffer.alloc(map.W * map.H * 3);
  for (let p = 0; p < map.W * map.H; p++) { const c = MAP_CLASS_COLORS[map.cls[p]]; rgb[p * 3] = c[0]; rgb[p * 3 + 1] = c[1]; rgb[p * 3 + 2] = c[2]; }
  writePngRGB(join(opt.out, `hole-${String(hole).padStart(2, "0")}_mapclass.png`), rgb, map.W, map.H);
}

const holes = opt.holes || Array.from({ length: 21 }, (_, i) => i + 1);
const results = {};
for (const hole of holes) {
  writeMapClass(hole);
  if (opt.classifyOnly) continue;
  const t0 = Date.now();
  const r = registerHole(hole);
  results[hole] = r;
  console.log(`hole ${String(hole).padStart(2)} ${r.meshId.padEnd(7)} s ${r.transform.unitsPerMapPx.toFixed(2)} u/px (${r.ydPerPx.toFixed(3)} yd/px, app ${r.appScaleYdPerPx ?? "-"}) rot ${r.transform.rotationDeg.toFixed(2)}deg  score ${r.seedScore.toFixed(3)} -> ${r.score.toFixed(3)}  iou grass ${r.iou.grass} sand ${r.iou.sand} water ${r.iou.water} rough ${r.iou.rough}  tee resid ${r.teeResidualPx ?? "-"} px  pins in ${r.pins.filter((q) => q.insideGreen).length}/${r.pins.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (opt.json && !opt.classifyOnly) {
  writeFileSync(opt.json, JSON.stringify({ _note: "Similarity transform per hole between the app's 250x304 minimap frame (fractional coords) and the WSR collision mesh units (0.1 m). mapFracToMesh: [X,Z] = M * [fx, fy, 1]; meshToMapFrac: [fx, fy] = M * [X, Z, 1]. Fitted by mesh-register.mjs from colour-class overlap against the capture stacks captures/derived/maps/hNN.png (the Switch's own minimap art; never src/maps.js, which is rendered through this registration); seeded from derived.json green centre + yardage scale.", unitsPerYard: UPY, holes: results }, null, 1));
  console.log(`wrote ${opt.json}`);
}
