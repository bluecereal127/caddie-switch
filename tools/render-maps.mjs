// Render the app's hole maps from the WSR data alone. Two arts:
//
//  --art wsr (default): WSR's own minimap. Each course archive holds
//    glf_map_<id>.brres: a model glf_map_<id> in the KCL frame, textured with
//    WSR's minimap tiles, that is the KCL ground by class (bunker / fringe /
//    fairway / green / rock / OB / rough / sea objects) with WSR's own edits:
//    per-class IoU against the class rasters is 1.000 on H1, H6, H10, H11,
//    H13, H14, H16 and H20; elsewhere the model paints OB over KCL water on
//    H3's right edge and top-left coast (1,150 map px), H5's and H7's edges
//    (180 / 400) and H21's bottom-left, x41-72 y207-303 (1,400), sand over
//    KCL water on H3's and H19's beaches (360 / 490), fairway over an 8x8 px
//    KCL sand square on H4 (x147-154 y122-129) and OB over a 10x10 px KCL
//    pond and a rough strip on H12 (x140-149 y267-276; x109-118 y114-120);
//    H3 and H21 agree on 97-98% of live pixels, every other hole on 99% or
//    more, and the Switch minimap follows the model where checked
//    (tools/MESHES.md "Rendered minimaps"). And glf_tree_<id>:
//    one sprite quad per placement tree on rough or fairway. tools/wsr-map/
//    holds the extracted copies (textures, sprites, per-hole geometry; see
//    --extract), so no disc is needed. The model is rasterised top-down into
//    the app frame through tools/mesh-registration.json with a Y depth buffer
//    (the sea plane lies under the land, trees above it), each material's
//    GX TEV program evaluated as the Wii does (stage 0: tex screened against
//    the vertex colour, lerp(tex, ras, tex); stage 1: + c0 x layer 2, which
//    is the fairway's mowing stripes and the green's height-contour bands;
//    the overview holds those bands at one, flat like the Switch's green,
//    the green crop keeps them, see GREEN_FLAT_V), alpha test on the
//    sprites, blending on the XLU objects. Beyond the model the border class
//    continues flat with its WSR texture (OB2 over outer ground, the sea /
//    lake tile over water), classified by the rules below; on H3 alone the
//    model's sea plane yields where that word and the raster's own pixel
//    both say outer ground (its bottom-right corner, OB rough on the Switch;
//    SEA_YIELDS), and H14's five rock cones in the lake, which the Switch
//    does not draw, are dropped (dropSmallRocks). --wsr raster is the
//    cross-check: the class-raster geometry of the switch art painted with
//    the same textures tiled at the model's world scale, sprites at the
//    placement positions.
//  --art switch: the style tools/map-style.mjs sampled from the captures
//    (tools/map-style.json) over the class-raster geometry, the cross-check.
//    It and --wsr raster write to captures/derived/render-switch /
//    render-raster unless --out says otherwise, never over the shipped
//    renders; each index.json entry records its art, and build-derived ships
//    the capture stack for a hole whose render is not the WSR art.
//
// Both read the mesh class rasters (captures/meshes/heightmaps-res4), the
// mesh registration, the PMP trees and starts (tools/wsr-pins.json) and the
// tee pad / green box (tools/wsr-truth.json). No capture is read here. Flat
// backdrop, no flag, avatar, aim line, wind dial or landing dots: the app
// draws its own pins and ball.
//
//   node tools/render-maps.mjs [--art wsr|switch] [--wsr model|raster] [--trees model|placement]
//        [--scale 2] [--ss 4] [--holes 7,16] [--out captures/derived/render (render-switch / render-raster for the cross-checks)]
//        [--style tools/map-style.json] [--green-scale 4] [--green-min 256] [--no-green]
//   node tools/render-maps.mjs --extract <WSR_Extract>/DATA/files/Stage/Shared2 [--holes 1] [--wsr-dir tools/wsr-map]
//     rebuilds tools/wsr-map from the course archives: glf_course_<id>.carc as
//     DolphinTool extracts them from the disc, or the glf_course_<id>.d/
//     folders `wszst extract glf_course_*.carc` (Wiimm's SZS Tools) unpacks
//     beside them, which are read first. --holes limits it (no library.json then).
//
// Per hole: hNN.png, the 250x304 map frame at `scale`x (500x608 by default),
// and hNN-green.png, the WSR green box plus GREEN_MARGIN of it on every side
// (the app's GT_MARGIN) at the box's true aspect, at `green-scale` map px per
// px or more so its longer side is at least `green-min` px; index.json lists
// both with their sizes, the green's aspect and margin. Every pixel is the box
// mean of ss x ss samples; a sample is: output px -> map fraction ->
// mapFracToMesh -> raster -> the class with the largest bilinear weight among
// the four raster pixels around it (the 4-unit raster's staircase smoothed,
// not copied), with the raster's dead regions already replaced by what the
// minimap draws there (map-style.json `holes[n].regions`; enclosed collision
// gaps by the nearest class) and anything beyond the raster by the class at
// the nearest raster edge, so an island hole sits in sea and an inland one in
// outer ground. The switch paint: vertical mown stripes on fairway, green,
// fringe and (fainter) the tee pad; the screen-fixed dot lattice on outer
// ground and sea; mottle on the rough; a shaded inner edge on bunkers; bank
// bands on the water side of every land/water edge (the type-12 walls stand
// there), per hole because their width varies; canopy sprites for the trees
// on fairway or rough (the game draws none on outer ground or water),
// southern trees over northern.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { savePng, loadImage } from "./lib/image.mjs";
import { MAP_W, MAP_H, CLS, LAND, loadHole, fracToRaster, resolveRaster, cleanRaster, beyondSide, runLookup, edt2, gaussianBlur, rng, pointInPoly, smoothstep, readJson } from "./lib/minimap.mjs";
import { readArchive, archiveTextures, objectTriangles } from "./lib/brres.mjs";

const args = process.argv.slice(2);
const opt = { scale: 2, ss: 4, holes: null, out: null, style: "tools/map-style.json", greenScale: 4, greenMin: 256, green: true, art: "wsr", wsr: "model", trees: "model", extract: null, wsrDir: "tools/wsr-map" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--scale") opt.scale = +args[++i];
  else if (a === "--ss") opt.ss = +args[++i];
  else if (a === "--holes") opt.holes = args[++i].split(",").map(Number);
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--style") opt.style = args[++i];
  else if (a === "--green-scale") opt.greenScale = +args[++i];
  else if (a === "--green-min") opt.greenMin = +args[++i];
  else if (a === "--no-green") opt.green = false;
  else if (a === "--art") opt.art = args[++i];
  else if (a === "--wsr") opt.wsr = args[++i];
  else if (a === "--trees") opt.trees = args[++i];
  else if (a === "--extract") opt.extract = args[++i];
  else if (a === "--wsr-dir") opt.wsrDir = args[++i];
}
// a mistyped mode must not render: an unknown --wsr value once skipped both
// the model and the raster's bunker rim and shipped, exit 0, a third image
const CHOICES = { art: ["wsr", "switch"], wsr: ["model", "raster"], trees: ["model", "placement"] };
for (const [k, v] of Object.entries(CHOICES)) if (!v.includes(opt[k])) { console.error(`--${k} must be one of ${v.join("|")}, got "${opt[k]}"`); process.exit(1); }
// the shipped art has the default directory; a cross-check art writes beside
// it (the file names are the same, so a cross-check run into the shipped
// directory replaced the renders build-derived ships, with nothing to tell
// them apart but the art recorded in index.json, which it now checks)
opt.out ??= opt.art === "wsr" && opt.wsr === "model" ? "captures/derived/render" : `captures/derived/render-${opt.art === "wsr" ? opt.wsr : opt.art}`;
const ROOT = process.cwd();
// --style, --out and --wsr-dir resolve against the cwd, so absolute paths work too
const STYLE = readJson(resolve(ROOT, opt.style));
const HOLES = opt.holes ?? Array.from({ length: 21 }, (_, i) => i + 1);
const WSR_DIR = resolve(ROOT, opt.wsrDir), OUT = resolve(ROOT, opt.out);

// the green crop carries this fraction of the box on every side (build-derived's GT_MARGIN)
const GREEN_MARGIN = 0.12;
// bank bands reach this far (map px) into the water; map-style samples 8
const SHORE_REACH = 8;
// the bunker's shaded inner edge, map px
const SAND_EDGE = 0.5;
// a tee pad hull from wsr-truth is the pad's own triangles; the class-1 island
// under it is a raster, so the hull is grown by this factor to cover it
const PAD_GROW = 1.2;
// class edges are read through a tent this many raster px wide (4 units each):
// 0.3 map px on a long hole, 0.7 on a short one, under an output px at 2x, but
// it rounds the raster's staircase off the green crops drawn at 9-13x
const CLASS_TENT = 1.5;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// piecewise-linear lookup of a colour/number table at centres c[k]
function interpTable(centres, table, x) {
  if (x <= centres[0]) return table[0];
  for (let k = 1; k < centres.length; k++) if (x <= centres[k]) { const t = (x - centres[k - 1]) / (centres[k] - centres[k - 1]); const a = table[k - 1], b = table[k]; return Array.isArray(a) ? lerp3(a, b, t) : a + (b - a) * t; }
  return table[table.length - 1];
}

// ============================================================================
// WSR extraction: the archives -> tools/wsr-map
// ============================================================================

// Every texture a TEV stage or a tree sprite samples, once (they are
// byte-identical across the 21 archives; OB2_Mip2 on fc8 / fc13 and
// tokosenFix2 on nine holes are variants under their own names; the water's
// indirect ripple map glf_water_ind1 is never sampled by a stage and is left
// out), plus per hole hNN.json (materials, objects in draw order with their
// UV-to-world fits and median vertex colour, the tree quads) and hNN.bin
// (gzip: per object positions f32x3, uvs f32x2 per set, colours u8x4,
// triangle indices u16x3, one entry per distinct vertex tuple), and
// library.json, one spec per material name / texture pair for the holes that
// lack an object of that kind (H10 has no OB object: its backdrop is drawn
// with the library's M_OB).
const r5 = (v) => Math.round(v * 1e5) / 1e5;
function matSpec(m) {
  return { layers: m.layers.map((l) => ({ texture: l.texture, wrapS: l.wrapS, wrapT: l.wrapT })), srt: m.srt.map((s) => ({ scale: s.scale.map(r5), rot: s.rot, trans: s.trans.map(r5) })), texgen: m.texgen.map((t) => (t ? (t.source === 0 ? "pos" : "uv" + (t.source - 5)) : null)), xlu: m.xlu, tev: m.tev, konst: m.konst, blend: m.blend, zmode: m.zmode, alphaCompare: m.alphaCompare, stages: m.shader.stages };
}
// least-squares u = a x + b z + c over a vertex list; [a, b, c, rms]
function fitAffine(verts, get) {
  const n = 3, A = [new Float64Array(n), new Float64Array(n), new Float64Array(n)], y = new Float64Array(n);
  for (const v of verts) { const x = [v.x, v.z, 1], t = get(v); for (let i = 0; i < n; i++) { y[i] += x[i] * t; for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j]; } }
  const M = A.map((row, i) => [...row, y[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null;
    for (let k = 0; k < n; k++) { if (k === i) continue; const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const c = M.map((row, i) => row[n] / row[i]);
  let r = 0; for (const v of verts) r += (c[0] * v.x + c[1] * v.z + c[2] - get(v)) ** 2;
  return [r5(c[0]), r5(c[1]), r5(c[2]), r5(Math.sqrt(r / verts.length))];
}
// The minimap BRRES of one course: from the archive unpacked beside itself
// by Wiimm's SZS Tools (`wszst extract glf_course_<id>.carc` writes
// glf_course_<id>.d/G3D/glf_map_<id>.brres), or, when that folder is
// missing, out of the .carc itself (Yaz0 over U8, the readers
// tools/wsr-pins.mjs has), so a disc extracted with DolphinTool alone works.
async function mapBrres(dir, id) {
  const unpacked = join(dir, `glf_course_${id}.d/G3D/glf_map_${id}.brres`);
  if (existsSync(unpacked)) return readFileSync(unpacked);
  const carc = join(dir, `glf_course_${id}.carc`);
  if (!existsSync(carc)) throw new Error(`${dir}: neither glf_course_${id}.d/G3D/glf_map_${id}.brres (wszst extract) nor glf_course_${id}.carc`);
  const { yaz0Decode, u8Files } = await import("./wsr-pins.mjs");
  const f = u8Files(yaz0Decode(readFileSync(carc)))?.find((e) => e.path.endsWith(`G3D/glf_map_${id}.brres`));
  if (!f) throw new Error(`${carc}: no G3D/glf_map_${id}.brres inside`);
  return Buffer.from(f.data);
}
async function extractWsr(dir) {
  const MH = readJson(join(ROOT, "tools/mesh-holes.json"));
  mkdirSync(WSR_DIR, { recursive: true });
  const written = new Set(), library = {};
  for (const [id, n] of Object.entries(MH)) {
    if (typeof n !== "number" || !id.startsWith("fc") || (opt.holes && !opt.holes.includes(n))) continue;
    const nn = String(n).padStart(2, "0");
    const buf = await mapBrres(dir, id);
    const a = readArchive(buf), tex = archiveTextures(buf);
    const map = a.models[`glf_map_${id}`], tree = a.models[`glf_tree_${id}`];
    const need = (m) => { for (const s of m.shader.stages) if (s.texEnable && m.layers[s.texMap]) { const t = m.layers[s.texMap].texture; if (!written.has(t)) { savePng(join(WSR_DIR, `${t}.png`), tex[t]); written.add(t); } } };
    const out = { _note: "Written by tools/render-maps.mjs --extract from WSR's glf_map_<id>.brres: the minimap model (the KCL ground by class, in mesh units) with its materials' GX state, and the tree sprite quads. Vertex data in the .bin (gzip), see tools/render-maps.mjs loadWsr.", hole: n, meshId: id, model: map.name, bounds: { min: map.min.map(r5), max: map.max.map(r5) }, materials: {}, objects: [], trees: { materials: {}, quads: [] }, bin: `h${nn}.bin` };
    const chunks = []; let offset = 0;
    const push = (arr) => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (b.length % 4)) % 4; chunks.push(b); if (pad) chunks.push(Buffer.alloc(pad)); const at = offset; offset += b.length + pad; return at; };
    for (const d of [...map.draw.opa, ...map.draw.xlu]) {
      const mat = map.materials[d.mat], obj = map.objects[d.obj];
      out.materials[mat.name] = matSpec(mat); need(mat);
      // (fc3 has an M_OB with no texture layer at all: not library material)
      if (mat.shader.stages.every((st) => !st.texEnable || mat.layers[st.texMap])) library[mat.name + "/" + mat.layers[0].texture] ??= { ...matSpec(mat), from: id };
      const tris = objectTriangles(map, obj), K = tris[0]?.[0].u.length ?? 0;
      const index = new Map(), pos = [], uv = [], col = [], idx = [];
      for (const t of tris) for (const v of t) {
        const k = `${v.x},${v.y},${v.z},${v.u.map((p) => p.join(",")).join(",")},${v.c}`;
        let i = index.get(k);
        if (i === undefined) { i = index.size; index.set(k, i); pos.push(v.x, v.y, v.z); for (const p of v.u) uv.push(p[0], p[1]); col.push(...(v.c ?? [255, 255, 255, 255])); }
        idx.push(i);
      }
      const verts = tris.flat();
      const cm = [0, 1, 2, 3].map((c) => { const s = verts.map((v) => (v.c ?? [255, 255, 255, 255])[c]).sort((p, q) => p - q); return s[s.length >> 1]; });
      out.objects.push({ name: obj.name, material: mat.name, vertices: index.size, triangles: tris.length, uvSets: K, colour: cm, uvFit: Array.from({ length: K }, (_, k) => ({ u: fitAffine(verts, (v) => v.u[k][0]), v: fitAffine(verts, (v) => v.u[k][1]) })), offset: { pos: push(Float32Array.from(pos)), uv: push(Float32Array.from(uv)), col: push(Uint8Array.from(col)), idx: push(Uint16Array.from(idx)) } });
    }
    if (tree) for (const d of [...tree.draw.opa, ...tree.draw.xlu]) {
      const mat = tree.materials[d.mat], obj = tree.objects[d.obj];
      out.trees.materials[mat.name] = matSpec(mat); need(mat);
      if (mat.layers[0]) library["tree/" + mat.layers[0].texture] ??= { ...matSpec(mat), from: id };
      const pos = tree.vertices[obj.arrays.vertex], uvs = tree.uvs[obj.arrays.uv[0]];
      for (const p of obj.prims) {
        if (p.verts.length !== 4) { console.warn(`${id}: tree prim with ${p.verts.length} vertices skipped`); continue; }
        const v = p.verts.map((q) => ({ x: pos.data[q.pos * 3], y: pos.data[q.pos * 3 + 1], z: pos.data[q.pos * 3 + 2], u: uvs.data[q.uv0 * 2], v: uvs.data[q.uv0 * 2 + 1] }));
        const x0 = Math.min(...v.map((q) => q.x)), x1 = Math.max(...v.map((q) => q.x)), z0 = Math.min(...v.map((q) => q.z)), z1 = Math.max(...v.map((q) => q.z));
        // every quad maps u 0 -> x0, v 0 -> z0 (checked on all 460); say so if one does not
        const c00 = v.find((q) => q.u === 0 && q.v === 0);
        if (!c00 || c00.x !== x0 || c00.z !== z0) console.warn(`${id}: tree quad at ${x0},${z0} has an unexpected uv orientation`);
        out.trees.quads.push([mat.name, r5(x0), r5(z0), r5(x1), r5(z1), r5(v.reduce((s, q) => s + q.y, 0) / 4)]);
      }
    }
    writeFileSync(join(WSR_DIR, `h${nn}.bin`), gzipSync(Buffer.concat(chunks)));
    writeFileSync(join(WSR_DIR, `h${nn}.json`), JSON.stringify(out) + "\n");
    console.log(`H${n} ${id}: ${out.objects.length} objects, ${out.objects.reduce((s, o) => s + o.triangles, 0)} triangles, ${out.trees.quads.length} tree quads, bin ${offset} B`);
  }
  // the library must see every archive: a --holes extract leaves it alone
  if (opt.holes) console.log(`library.json not written (--holes ${opt.holes.join(",")} is a partial extract)`);
  else writeFileSync(join(WSR_DIR, "library.json"), JSON.stringify({ _note: "One material spec per name / first-texture pair, from the first archive that has it (`from`); render-maps.mjs draws the backdrop and the raster fallback with these where a hole has no object of the kind.", materials: library }, null, 1) + "\n");
  console.log(`textures: ${[...written].sort().join(", ")}`);
}

// ============================================================================
// Shared: per-hole inputs and the class per sample
// ============================================================================

// Everything per hole the views share: the resolved raster, the colours, the
// stripe / dot parameters, the noise fields, the tee pad hull, the trees.
function prepareHole(n) {
  const hole = loadHole(ROOT, n);
  const hs = STYLE.holes[n] ?? {};
  const waterStyle = hs.waterStyle ?? "sea";
  const cls = resolveRaster(hole.raster, hs.regions ?? {}, waterStyle, hs.water ?? {});
  const cleaned = cleanRaster(cls, hole.raster.w, hole.raster.h);
  // past the raster: the capture's word per raster side where it has one,
  // else the raster's edge class when that is a backdrop, else outer ground
  // (a course class at the edge, H20's rough at its bottom or H8's mainland
  // rough at its top, is land that goes on as ground, never as sea)
  const BACKDROP = { sea: CLS.WATER, pond: CLS.POND, outer: CLS.OUTER };
  const beyondClass = (c, r, edgeClass) => {
    const b = beyondSide(hole.raster, c, r);
    const v = b && runLookup(hs.beyond?.[b.side], b.index);
    if (v) return BACKDROP[v];
    return edgeClass === CLS.OUTER || edgeClass === CLS.WATER || edgeClass === CLS.POND ? edgeClass : CLS.OUTER;
  };
  const pal = { ...STYLE.palette, ...(hs.palette ?? {}) };
  if (hs.palette?.water) pal[waterStyle] = hs.palette.water;
  const colour = {
    [CLS.FAIRWAY]: pal.fairway, [CLS.ROUGH]: pal.rough, [CLS.SAND]: pal.sand, [CLS.OUTER]: pal.outer,
    [CLS.GREEN]: pal.green, [CLS.FRINGE]: pal.fringe, [CLS.WATER]: pal.sea, [CLS.POND]: pal.pond,
  };
  // stripes: the hole's own period and phase where the capture resolved one, the shared period otherwise
  const sg = STYLE.stripes, sh = hs.stripes;
  const stripes = sh?.resolved
    ? { theta: (sh.normalDeg * Math.PI) / 180, period: sh.periodPx, phase: sh.phasePx, amp: sg.ampLuma }
    : { theta: 0, period: sg.periodPx, phase: 0, amp: sg.ampLuma };
  stripes.chan = sg.chan;
  stripes.factor = { [CLS.FAIRWAY]: 1, [CLS.GREEN]: sg.factors.green, [CLS.FRINGE]: sg.factors.fringe, pad: sg.factors.teePad };
  // mottle: a luma field and a warm field at 2x map resolution, sampled bilinearly
  const NW = MAP_W * 2, NH = MAP_H * 2, R = rng(16 + n);
  const raw1 = new Float32Array(NW * NH), raw2 = new Float32Array(NW * NH);
  for (let i = 0; i < NW * NH; i++) { raw1[i] = R.gauss(); raw2[i] = R.gauss(); }
  const nz = gaussianBlur(raw1, NW, NH, STYLE.rough.sigmaPx * 2), wz = gaussianBlur(raw2, NW, NH, STYLE.rough.warmSigmaPx * 2);
  const norm = (f, target) => { let s = 0; for (const v of f) s += v * v; const k = target / Math.sqrt(s / f.length); for (let i = 0; i < f.length; i++) f[i] *= k; };
  norm(nz, STYLE.rough.hpStd); norm(wz, 1);
  const field = (f, X, Y) => { // bilinear at map px (X, Y)
    const fx = Math.min(NW - 1.001, Math.max(0, X * 2 - 0.5)), fy = Math.min(NH - 1.001, Math.max(0, Y * 2 - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    return (f[y0 * NW + x0] * (1 - tx) + f[y0 * NW + x0 + 1] * tx) * (1 - ty) + (f[(y0 + 1) * NW + x0] * (1 - tx) + f[(y0 + 1) * NW + x0 + 1] * tx) * ty;
  };
  // the tee pad hull in map px, grown about its centroid
  let pad = null;
  if (hole.truth.teePad?.length >= 3) {
    const pts = hole.truth.teePad.map(([x, y]) => [x * MAP_W, y * MAP_H]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    pad = { poly: pts.map(([x, y]) => [cx + (x - cx) * PAD_GROW, cy + (y - cy) * PAD_GROW]), x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y] of pad.poly) { pad.x0 = Math.min(pad.x0, x); pad.y0 = Math.min(pad.y0, y); pad.x1 = Math.max(pad.x1, x); pad.y1 = Math.max(pad.y1, y); }
  }
  // trees the minimap draws: on fairway or rough, radius by map-style's rule
  const rule = STYLE.canopyRadius.rule;
  const trees = hole.pins.trees
    .filter((t) => t.lie === "fairway" || t.lie === "rough")
    .map((t) => ({ ...t, X: t.x * MAP_W, Y: t.y * MAP_H, R: (rule[t.kind].a * t.size + rule[t.kind].b) / hole.unitsPerMapPx + rule[t.kind].c }))
    .sort((a, b) => a.Y - b.Y);
  // bank bands: the hole's own where sampled (a band no pixel fell in takes the shared one)
  const bands = (style) => { const g = STYLE.shore[style]?.draw; const h = hs.shore?.[style]?.draw; return h && g ? h.map((c, k) => c ?? g[k]) : h ?? g; };
  const shore = { sea: bands("sea"), pond: bands("pond"), pondLand: hs.shore?.pond?.land?.[0] ?? STYLE.shore.pond?.land?.[0] };
  return { hole, cls, cleaned, beyondClass, colour, pal, waterStyle, stripes, nz, wz, field, pad, trees, shore };
}

// The sample grid of a view: map fractions [fx0,fx1) x [fy0,fy1) at width x
// height px with ss x ss samples per px; sample (i, j) has its centre at map
// px (X0 + (i + 0.5) dx, Y0 + (j + 0.5) dy).
function sampleGrid(view) {
  const { width, height, ss } = view;
  const SW = width * ss, SH = height * ss;
  const dx = ((view.fx1 - view.fx0) * MAP_W) / SW, dy = ((view.fy1 - view.fy0) * MAP_H) / SH;
  return { SW, SH, N: SW * SH, dx, dy, X0: view.fx0 * MAP_W, Y0: view.fy0 * MAP_H, PX: 1 / dx };
}

// Class per sample: the class with the most weight under a tent kernel of
// radius CLASS_TENT raster px (a 4x4 neighbourhood), i.e. the one-hot class
// masks box-prefiltered and sampled bilinearly. Past the raster's edge (by
// more than half a pixel) the class is what beyondClass says; `raw`, when
// given, receives the raster's own class there (its nearest edge pixel's).
function classifySamples(P, G, raw) {
  const { hole, cls: raster, beyondClass } = P;
  const { SW, SH, dx, dy, X0, Y0 } = G;
  const rw = hole.raster.w, rh = hole.raster.h;
  const cls = new Uint8Array(SW * SH);
  const acc = new Float32Array(32); // weight per class id (ids < 32)
  for (let j = 0; j < SH; j++) {
    const fy = (Y0 + (j + 0.5) * dy) / MAP_H;
    for (let i = 0; i < SW; i++) {
      const fx = (X0 + (i + 0.5) * dx) / MAP_W;
      const [c, r] = fracToRaster(hole, fx, fy);
      const cc = Math.min(rw - 1, Math.max(0, c)), rr = Math.min(rh - 1, Math.max(0, r));
      const c0 = Math.floor(cc) - 1, r0 = Math.floor(rr) - 1;
      acc.fill(0);
      for (let b = 0; b < 4; b++) {
        const ry = Math.min(rh - 1, Math.max(0, r0 + b)), wy = Math.max(0, 1 - Math.abs(r0 + b - rr) / CLASS_TENT);
        if (wy <= 0) continue;
        for (let a = 0; a < 4; a++) {
          const rx = Math.min(rw - 1, Math.max(0, c0 + a)), wx = Math.max(0, 1 - Math.abs(c0 + a - cc) / CLASS_TENT);
          if (wx > 0) acc[raster[ry * rw + rx]] += wx * wy;
        }
      }
      let best = 0, bw = -1;
      for (let k = 0; k < 32; k++) if (acc[k] > bw) { bw = acc[k]; best = k; }
      if (raw) raw[j * SW + i] = best;
      if (c < -0.5 || r < -0.5 || c > rw - 0.5 || r > rh - 0.5) best = beyondClass(c, r, best);
      cls[j * SW + i] = best;
    }
  }
  return cls;
}

// Box filter of a Float32 RGB sample buffer (0-255) to width x height RGBA.
function downsample(img, G, width, height) {
  const { SW, ss } = { SW: G.SW, ss: G.SW / width };
  const out = Buffer.alloc(width * height * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let r = 0, g = 0, b = 0;
    for (let jj = 0; jj < ss; jj++) for (let ii = 0; ii < ss; ii++) { const p = ((y * ss + jj) * SW + x * ss + ii) * 3; r += img[p]; g += img[p + 1]; b += img[p + 2]; }
    const o = (y * width + x) * 4;
    out[o] = Math.max(0, Math.min(255, Math.round(r * inv))); out[o + 1] = Math.max(0, Math.min(255, Math.round(g * inv))); out[o + 2] = Math.max(0, Math.min(255, Math.round(b * inv))); out[o + 3] = 255;
  }
  return { width, height, data: out };
}

// ============================================================================
// The switch art (map-style.json over the class raster)
// ============================================================================

// Render one view of a prepared hole in the switch art. Returns RGBA.
function renderView(P, view) {
  const { cls: _raster, colour, stripes, field, pad, trees, shore } = P;
  const { width, height } = view;
  const G = sampleGrid(view), { SW, SH, N, dx, dy, X0, Y0, PX } = G;
  const cls = classifySamples(P, G);
  // ---- masks and distance fields (a beach meets the water with no bank, so
  // sand is not "land" for the bank bands)
  const land = new Uint8Array(N), notSand = new Uint8Array(N), wet = new Uint8Array(N), pondM = new Uint8Array(N);
  let anySand = false, anyWet = false, anyPond = false;
  for (let p = 0; p < N; p++) {
    const c = cls[p];
    if (LAND.has(c) && c !== CLS.SAND) land[p] = 1;
    if (c !== CLS.SAND) notSand[p] = 1; else anySand = true;
    if (c === CLS.WATER || c === CLS.POND) { wet[p] = 1; anyWet = true; }
    if (c === CLS.POND) { pondM[p] = 1; anyPond = true; }
  }
  const dLand = anyWet ? edt2(land, SW, SH) : null; // squared, samples
  const dSandIn = anySand ? edt2(notSand, SW, SH) : null;
  const dPond = anyPond && shore.pondLand ? edt2(pondM, SW, SH) : null;
  // ---- paint
  const img = new Float32Array(N * 3);
  const dots = STYLE.dots, dotProfile = { [CLS.OUTER]: dots.profile.outer, [CLS.WATER]: dots.profile.sea };
  const dotCentres = Array.from({ length: 10 }, (_, k) => 0.25 + 0.5 * k);
  const bandCentres = Array.from({ length: SHORE_REACH }, (_, k) => k + 0.5);
  const cosT = Math.cos(stripes.theta), sinT = Math.sin(stripes.theta);
  const warm = STYLE.rough.warm, sandUL = STYLE.sand.upLeft, sandDR = STYLE.sand.downRight;
  const shift = Math.max(1, Math.round(SAND_EDGE * PX));
  for (let j = 0; j < SH; j++) {
    const Y = Y0 + (j + 0.5) * dy;
    for (let i = 0; i < SW; i++) {
      const X = X0 + (i + 0.5) * dx, p = j * SW + i, c = cls[p];
      let base = colour[c] ?? colour[CLS.OUTER];
      let r = base[0], g = base[1], b = base[2];
      if (c === CLS.FAIRWAY || c === CLS.GREEN || c === CLS.FRINGE) {
        let f = stripes.factor[c];
        if (c === CLS.FAIRWAY && pad && X >= pad.x0 && X <= pad.x1 && Y >= pad.y0 && Y <= pad.y1 && pointInPoly(pad.poly, X, Y)) f = stripes.factor.pad;
        const wave = Math.cos((2 * Math.PI * ((X - 0.5) * cosT + (Y - 0.5) * sinT - stripes.phase)) / stripes.period) * stripes.amp * f;
        r += wave * stripes.chan[0]; g += wave * stripes.chan[1]; b += wave * stripes.chan[2];
      } else if (c === CLS.ROUGH) {
        const l = field(P.nz, X, Y), w = field(P.wz, X, Y);
        r += l + w * warm[0]; g += l + w * warm[1]; b += l + w * warm[2];
      } else if (c === CLS.SAND) {
        // the shaded inner edge: down-right side dark, up-left side a touch lighter (as sampled)
        const d = Math.sqrt(dSandIn[p]);
        if (d <= shift) {
          const q = p - shift * SW - shift, q2 = p + shift * SW + shift;
          const ulOut = i < shift || j < shift || cls[q] !== CLS.SAND, drOut = i + shift >= SW || j + shift >= SH || cls[q2] !== CLS.SAND;
          if (drOut) { r = sandDR[0]; g = sandDR[1]; b = sandDR[2]; } else if (ulOut) { r = sandUL[0]; g = sandUL[1]; b = sandUL[2]; }
        }
      } else if (c === CLS.OUTER || c === CLS.WATER) {
        // the screen-fixed centred-square dot lattice: dots at (x0 + 10i, y0 + 10j) and (x0 + 5 + 10i, y0 + 5 + 10j)
        let dd = 99;
        for (let k = 0; k < 2; k++) {
          const ox = (((X - dots.x0 - 5 * k) % 10) + 10) % 10, oy = (((Y - dots.y0 - 5 * k) % 10) + 10) % 10;
          dd = Math.min(dd, Math.hypot(Math.min(ox, 10 - ox), Math.min(oy, 10 - oy)));
        }
        const off = interpTable(dotCentres, dotProfile[c], dd);
        r += off; g += off; b += off;
      }
      if (wet[p]) {
        // bank bands on the water side of every land/water edge, the dots kept underneath
        const d = Math.sqrt(dLand[p]) / PX;
        const bands = c === CLS.POND ? shore.pond : shore.sea;
        if (bands && d < SHORE_REACH) {
          const col = interpTable(bandCentres, bands, d);
          r += col[0] - base[0]; g += col[1] - base[1]; b += col[2] - base[2];
        }
      } else if (dPond && land[p] && dPond[p] < PX * PX) {
        // the pond's lip on the land side (a lighter 1-px ring)
        const t = 1 - Math.sqrt(dPond[p]) / PX;
        r += (shore.pondLand[0] - r) * t; g += (shore.pondLand[1] - g) * t; b += (shore.pondLand[2] - b) * t;
      }
      img[p * 3] = r; img[p * 3 + 1] = g; img[p * 3 + 2] = b;
    }
  }
  drawTrees(img, SW, SH, trees, { X0, Y0, dx, dy, PX });
  return downsample(img, G, width, height);
}

// Canopy sprites, southern trees on top. Kind 2 is a round canopy (light
// centre, dark rim, slightly lobed), kind 3 a flat dark crown with a soft
// edge, kind 6 a palm: a pale 8-point star under 8 tapered dark fronds and a
// brown heart. Colours are map-style's radial ramps (median RGB per 0.1 r/R bin).
function drawTrees(img, SW, SH, trees, V) {
  const ramps = STYLE.canopy, R2 = rng(7);
  const lookup = (ramp, t) => interpTable(ramp.map((_, k) => k / 10 + 0.05), ramp, t);
  const blend = (p, col, a) => { img[p * 3] += (col[0] - img[p * 3]) * a; img[p * 3 + 1] += (col[1] - img[p * 3 + 1]) * a; img[p * 3 + 2] += (col[2] - img[p * 3 + 2]) * a; };
  for (const t of trees) {
    const kind = String(t.kind), ramp = ramps[kind]?.ramp;
    if (!ramp) continue;
    const R = t.R * V.PX, cx = (t.X - V.X0) / V.dx, cy = (t.Y - V.Y0) / V.dy;
    const padPx = Math.ceil(R * 1.2) + 2;
    const xa = Math.max(0, Math.floor(cx) - padPx), xb = Math.min(SW, Math.floor(cx) + padPx + 1), ya = Math.max(0, Math.floor(cy) - padPx), yb = Math.min(SH, Math.floor(cy) + padPx + 1);
    if (xa >= xb || ya >= yb) continue;
    const phi = R2.next() * 2 * Math.PI;
    if (kind === "6") {
      const light = ramps[kind].light, frond = ramps[kind].frond, heart = ramps[kind].heart;
      const PX = V.PX;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const ddx = x + 0.5 - cx, ddy = y + 0.5 - cy, rr = Math.hypot(ddx, ddy), th = Math.atan2(ddy, ddx), p = y * SW + x;
        const Rs = R * (0.78 + 0.22 * Math.cos(8 * (th - phi)));
        const aDisc = (1 - smoothstep(0.85, 1.05, rr / Rs)) * 0.8;
        if (aDisc > 0) blend(p, light, aDisc);
        let aFr = 0;
        for (let k = 0; k < 8; k++) {
          const ang = phi + (k * Math.PI) / 4, ux = Math.cos(ang), uy = Math.sin(ang);
          const along = ddx * ux + ddy * uy, across = Math.abs(-ddx * uy + ddy * ux);
          if (along < 0 || along > R) continue;
          const half = ((0.8 - 0.5 * Math.min(1, along / R)) * PX) / 2; // half-width 0.8 px at the base to 0.3 px at the tip (1x)
          aFr = Math.max(aFr, 1 - smoothstep(half - PX / 8, half + PX / 8, across));
        }
        if (aFr > 0) blend(p, frond, aFr);
        const aH = 1 - smoothstep(0.9 * PX, 1.3 * PX, rr);
        if (aH > 0) blend(p, heart, aH);
      }
      continue;
    }
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const ddx = x + 0.5 - cx, ddy = y + 0.5 - cy, rr = Math.hypot(ddx, ddy), th = Math.atan2(ddy, ddx), p = y * SW + x;
      let col, a;
      if (kind === "2") {
        const Rl = R * (1 + 0.045 * Math.cos(5 * th + phi) + 0.03 * Math.cos(8 * th + 2.1 * phi)), tt = rr / Rl;
        a = 1 - smoothstep(0.97, 1.03, tt);
        if (a <= 0) continue;
        col = lookup(ramp.slice(0, 10), Math.min(tt, 0.95));
      } else {
        const Rl = R * (1 + 0.05 * Math.cos(4 * th + phi)), tt = rr / Rl;
        a = 1 - smoothstep(0.85, 1.05, tt);
        if (a <= 0) continue;
        col = lookup(ramp.slice(0, 8), Math.min(tt, 0.75));
      }
      blend(p, col, a);
    }
  }
}

// ============================================================================
// The WSR art: the minimap model, its textures and TEV programs
// ============================================================================

// A texture with box-filtered mip levels, RGBA 0-1.
const texCache = new Map();
function wsrTexture(name) {
  if (texCache.has(name)) return texCache.get(name);
  const img = loadImage(join(WSR_DIR, `${name}.png`));
  const levels = [];
  let w = img.width, h = img.height, data = new Float32Array(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = img.data[i] / 255;
  levels.push({ w, h, data });
  while (w > 1 || h > 1) {
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), d2 = new Float32Array(w2 * h2 * 4);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < 4; c++) {
      const x0 = Math.min(w - 1, 2 * x), x1 = Math.min(w - 1, 2 * x + 1), y0 = Math.min(h - 1, 2 * y), y1 = Math.min(h - 1, 2 * y + 1);
      d2[(y * w2 + x) * 4 + c] = (data[(y0 * w + x0) * 4 + c] + data[(y0 * w + x1) * 4 + c] + data[(y1 * w + x0) * 4 + c] + data[(y1 * w + x1) * 4 + c]) / 4;
    }
    w = w2; h = h2; data = d2; levels.push({ w, h, data });
  }
  const t = { name, width: img.width, height: img.height, levels };
  texCache.set(name, t);
  return t;
}
// Bilinear fetch at (u, v) in texture units from mip level L, wrap 0 clamp / 1 repeat / 2 mirror, into out[0..3].
function texelAt(tex, L, u, v, wrapS, wrapT, out) {
  const lv = tex.levels[L], w = lv.w, h = lv.h, d = lv.data;
  const x = u * w - 0.5, y = v * h - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let x1 = x0 + 1, y1 = y0 + 1;
  if (wrapS === 0) { x0 = Math.min(w - 1, Math.max(0, x0)); x1 = Math.min(w - 1, Math.max(0, x1)); } else { x0 = ((x0 % w) + w) % w; x1 = ((x1 % w) + w) % w; }
  if (wrapT === 0) { y0 = Math.min(h - 1, Math.max(0, y0)); y1 = Math.min(h - 1, Math.max(0, y1)); } else { y0 = ((y0 % h) + h) % h; y1 = ((y1 % h) + h) % h; }
  const p00 = (y0 * w + x0) * 4, p01 = (y0 * w + x1) * 4, p10 = (y1 * w + x0) * 4, p11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) out[c] = (d[p00 + c] * (1 - fx) + d[p01 + c] * fx) * (1 - fy) + (d[p10 + c] * (1 - fx) + d[p11 + c] * fx) * fy;
}
// Trilinear sample at a fractional level of detail.
const tA = new Float32Array(4), tB = new Float32Array(4);
function sampleTex(tex, u, v, lod, wrapS, wrapT, out) {
  const maxL = tex.levels.length - 1, l = Math.min(maxL, Math.max(0, lod)), l0 = Math.floor(l), t = l - l0;
  texelAt(tex, l0, u, v, wrapS, wrapT, tA);
  if (t > 0.001 && l0 < maxL) { texelAt(tex, l0 + 1, u, v, wrapS, wrapT, tB); for (let c = 0; c < 4; c++) out[c] = tA[c] + (tB[c] - tA[c]) * t; }
  else for (let c = 0; c < 4; c++) out[c] = tA[c];
}

// A material spec compiled for the fragment loop: its textures, per layer
// the UV transform of the texture SRT (rotation about the origin then
// scale; with repeat wrap a 180-degree turn is just the flipped phase), the
// TEV program as integer-coded inputs, alpha test, blend and z state.
const CIN = { cprev: 0, aprev: 1, c0: 2, a0: 3, c1: 4, a1: 5, c2: 6, a2: 7, texc: 8, texa: 9, rasc: 10, rasa: 11, one: 12, half: 13, konst: 14, zero: 15 };
const AIN = { aprev: 0, a0: 1, a1: 2, a2: 3, texa: 4, rasa: 5, konst: 6, zero: 7 };
function compileMaterial(spec) {
  // only layers a stage samples are loaded (the sea lists its indirect ripple map, never sampled by a stage)
  const sampled = new Set(spec.stages.filter((st) => st.texEnable).map((st) => st.texMap));
  const layers = spec.layers.map((l, i) => {
    const s = spec.srt[i] ?? { scale: [1, 1], rot: 0, trans: [0, 0] }, r = (s.rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    return { tex: sampled.has(i) ? wsrTexture(l.texture) : null, wrapS: l.wrapS, wrapT: l.wrapT, m: [s.scale[0] * c, -s.scale[0] * sn, s.trans[0], s.scale[1] * sn, s.scale[1] * c, s.trans[1]] };
  });
  const K = ["k0", "k1", "k2", "k3"].map((k) => (spec.konst?.[k] ?? [0, 0, 0, 0]).map((v) => v / 255));
  const C = ["c0", "c1", "c2"].map((k) => (spec.tev?.[k] ?? [0, 0, 0, 0]).map((v) => v / 255));
  const konstC = (sel) => (typeof sel === "number" ? [sel, sel, sel] : sel.length === 2 ? K[+sel[1]].slice(0, 3) : [0, 1, 2].map(() => K[+sel[2]]["rgba".indexOf(sel[0])]));
  const konstA = (sel) => (typeof sel === "number" ? sel : K[+sel[2]]["rgba".indexOf(sel[0])]);
  const stages = spec.stages.map((st) => ({
    texMap: st.texMap, texCoord: st.texCoord, texEnable: st.texEnable && !!layers[st.texMap]?.tex,
    ca: CIN[st.color.a], cb: CIN[st.color.b], cc: CIN[st.color.c], cd: CIN[st.color.d], cbias: st.color.bias, csign: st.color.sub ? -1 : 1, cclamp: st.color.clamp, cscale: st.color.scale, cdest: st.color.dest,
    aa: AIN[st.alpha.a], ab: AIN[st.alpha.b], ac: AIN[st.alpha.c], ad: AIN[st.alpha.d], abias: st.alpha.bias, asign: st.alpha.sub ? -1 : 1, aclamp: st.alpha.clamp, ascale: st.alpha.scale, adest: st.alpha.dest,
    kc: konstC(st.kc), ka: konstA(st.ka),
  }));
  const ac = spec.alphaCompare ?? { comp0: 7, comp1: 7, logic: 0, ref0: 0, ref1: 0 };
  const cmp = (f, a, ref) => [false, a < ref, a === ref, a <= ref, a > ref, a !== ref, a >= ref, true][f];
  const alphaTest = ac.comp0 === 7 && ac.comp1 === 7 && ac.logic === 0 ? null : (a) => {
    const p = cmp(ac.comp0, a, ac.ref0 / 255), q = cmp(ac.comp1, a, ac.ref1 / 255);
    return ac.logic === 0 ? p && q : ac.logic === 1 ? p || q : ac.logic === 2 ? p !== q : p === q;
  };
  // the XLU objects (OB ground, sea) blend with an alpha their programs leave
  // at 0 in the file (M_OB: A = zero; M_Sea writes its 0.5 konst alpha to
  // register c1, not the output), so the game must set it at runtime; the
  // backdrop here is flat and opaque, so they are drawn without blending
  return { layers, stages, C, alphaTest, blend: spec.blend?.enable && !spec.xlu ? spec.blend : null, zmode: spec.zmode ?? { test: true, write: true }, uvSets: Math.max(1, ...spec.stages.map((s) => s.texCoord + 1)) };
}

// Evaluate a compiled material for one fragment: texels per stage already
// sampled into tx (stage i at tx[i*4..]), the vertex colour ras (0-1).
// GX TEV: regs prev, c0, c1, c2 (RGBA); each stage writes
// clamp(d + bias + sign (a (1 - c) + b c)) x scale to its destination.
// (The minimap's green has its first texcoord generated from the vertex
// position, XF 0x5006, with an identity matrix in the file; the runtime
// matrix is unknown, so its exported uv set 0, a world-aligned projection
// at 15-160 units per repeat, stands in for it.)
const regs = new Float32Array(16), fragOut = new Float32Array(4), tx = new Float32Array(8), stOut = new Float32Array(4);
function cin(code, ch, t, ras, kc) {
  switch (code) {
    case 0: return regs[ch]; case 1: return regs[3]; case 2: return regs[4 + ch]; case 3: return regs[7]; case 4: return regs[8 + ch]; case 5: return regs[11]; case 6: return regs[12 + ch]; case 7: return regs[15];
    case 8: return tx[t + ch]; case 9: return tx[t + 3]; case 10: return ras[ch]; case 11: return ras[3]; case 12: return 1; case 13: return 0.5; case 14: return kc[ch]; default: return 0;
  }
}
function ain(code, t, ras, ka) {
  switch (code) { case 0: return regs[3]; case 1: return regs[7]; case 2: return regs[11]; case 3: return regs[15]; case 4: return tx[t + 3]; case 5: return ras[3]; case 6: return ka; default: return 0; }
}
function evalMaterial(M, ras) {
  regs.fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) regs[4 + r * 4 + c] = M.C[r][c];
  for (let s = 0; s < M.stages.length; s++) {
    const st = M.stages[s], t = s * 4;
    for (let ch = 0; ch < 3; ch++) {
      const a = cin(st.ca, ch, t, ras, st.kc), b = cin(st.cb, ch, t, ras, st.kc), c = cin(st.cc, ch, t, ras, st.kc), d = cin(st.cd, ch, t, ras, st.kc);
      let v = (d + st.cbias + st.csign * (a * (1 - c) + b * c)) * st.cscale;
      if (st.cclamp) v = Math.min(1, Math.max(0, v));
      stOut[ch] = v;
    }
    { const a = ain(st.aa, t, ras, st.ka), b = ain(st.ab, t, ras, st.ka), c = ain(st.ac, t, ras, st.ka), d = ain(st.ad, t, ras, st.ka);
      let v = (d + st.abias + st.asign * (a * (1 - c) + b * c)) * st.ascale;
      if (st.aclamp) v = Math.min(1, Math.max(0, v));
      stOut[3] = v; }
    for (let ch = 0; ch < 3; ch++) regs[st.cdest * 4 + ch] = stOut[ch];
    regs[st.adest * 4 + 3] = stOut[3];
  }
  fragOut[0] = regs[0]; fragOut[1] = regs[1]; fragOut[2] = regs[2]; fragOut[3] = regs[3];
  return fragOut;
}

// The hole's extracted model: tools/wsr-map/hNN.json + .bin.
function loadWsr(n) {
  const nn = String(n).padStart(2, "0");
  const meta = readJson(join(WSR_DIR, `h${nn}.json`));
  const z = gunzipSync(readFileSync(join(WSR_DIR, meta.bin)));
  const ab = new ArrayBuffer(z.length); new Uint8Array(ab).set(z);
  const objects = meta.objects.map((o) => ({
    ...o, pos: new Float32Array(ab, o.offset.pos, o.vertices * 3), uv: new Float32Array(ab, o.offset.uv, o.vertices * 2 * o.uvSets), col: new Uint8Array(ab, o.offset.col, o.vertices * 4), idx: new Uint16Array(ab, o.offset.idx, o.triangles * 3),
  }));
  return { meta, objects };
}

// The mesh -> sample affine of a view: [a, b, c, d, e, f] with
// sx = a x + b z + c, sy = d x + e z + f, from the inverse of mapFracToMesh.
function meshToSample(P, G) {
  const M = P.hole.M, det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const I = [[M[1][1] / det, -M[0][1] / det], [-M[1][0] / det, M[0][0] / det]]; // frac = I (mesh - t)
  const tx = M[0][2], tz = M[1][2];
  const kx = MAP_W / G.dx, ky = MAP_H / G.dy;
  const a = I[0][0] * kx, b = I[0][1] * kx, c = -(I[0][0] * tx + I[0][1] * tz) * kx - G.X0 / G.dx;
  const d = I[1][0] * ky, e = I[1][1] * ky, f = -(I[1][0] * tx + I[1][1] * tz) * ky - G.Y0 / G.dy;
  return [a, b, c, d, e, f];
}

// Rasterise triangles into the frame buffers with a material. `tri(k, v)`
// fills v = { sx, sy, y, uv: Float32Array(2 * uvSets), col: [r,g,b,a] } for
// corner v of triangle k; n triangles. Depth is world Y: the camera looks
// straight down, so a higher fragment is nearer; LEQUAL lets ties through,
// later draws winning them. A sample flagged in F.skip (when set) is left
// alone.
const vtx = [0, 1, 2].map(() => ({ sx: 0, sy: 0, y: 0, uv: new Float32Array(16), col: new Float32Array(4) }));
const uvS = new Float32Array(16), rasF = new Float32Array(4), tO = new Float32Array(4);
function rasterTriangles(F, M, n, tri) {
  const { SW, SH, img, depth, cover } = F;
  const L = M.layers;
  const lod = new Float32Array(L.length);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) tri(k, c, vtx[c]);
    const [A, B, Cc] = vtx;
    const area = (B.sx - A.sx) * (Cc.sy - A.sy) - (Cc.sx - A.sx) * (B.sy - A.sy);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A.sx, B.sx, Cc.sx))), x1 = Math.min(SW - 1, Math.ceil(Math.max(A.sx, B.sx, Cc.sx)));
    const y0 = Math.max(0, Math.floor(Math.min(A.sy, B.sy, Cc.sy))), y1 = Math.min(SH - 1, Math.ceil(Math.max(A.sy, B.sy, Cc.sy)));
    if (x0 > x1 || y0 > y1) continue;
    // level of detail per layer from the triangle's UV gradient in sample space
    for (let l = 0; l < L.length; l++) {
      const st = M.stages.find((s) => s.texEnable && s.texMap === l);
      if (!st) { lod[l] = 0; continue; }
      const m = L[l].m, k0 = st.texCoord * 2;
      const uA = m[0] * A.uv[k0] + m[1] * A.uv[k0 + 1], vA = m[3] * A.uv[k0] + m[4] * A.uv[k0 + 1];
      const uB = m[0] * B.uv[k0] + m[1] * B.uv[k0 + 1], vB = m[3] * B.uv[k0] + m[4] * B.uv[k0 + 1];
      const uC = m[0] * Cc.uv[k0] + m[1] * Cc.uv[k0 + 1], vC = m[3] * Cc.uv[k0] + m[4] * Cc.uv[k0 + 1];
      // plane gradients of u and v over (sx, sy)
      const dux = ((uB - uA) * (Cc.sy - A.sy) - (uC - uA) * (B.sy - A.sy)) / area, duy = ((uC - uA) * (B.sx - A.sx) - (uB - uA) * (Cc.sx - A.sx)) / area;
      const dvx = ((vB - vA) * (Cc.sy - A.sy) - (vC - vA) * (B.sy - A.sy)) / area, dvy = ((vC - vA) * (B.sx - A.sx) - (vB - vA) * (Cc.sx - A.sx)) / area;
      const W = L[l].tex.width, H = L[l].tex.height;
      const rho = Math.max(Math.hypot(dux * W, dvx * H), Math.hypot(duy * W, dvy * H));
      lod[l] = rho > 1 ? Math.log2(rho) : 0;
    }
    const inv = 1 / area, nuv = M.uvSets * 2;
    for (let j = y0; j <= y1; j++) {
      const py = j + 0.5;
      for (let i = x0; i <= x1; i++) {
        const px = i + 0.5;
        let w0 = ((B.sx - px) * (Cc.sy - py) - (Cc.sx - px) * (B.sy - py)) * inv;
        let w1 = ((Cc.sx - px) * (A.sy - py) - (A.sx - px) * (Cc.sy - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
        const p = j * SW + i;
        if (F.skip && F.skip[p]) continue;
        const y = w0 * A.y + w1 * B.y + w2 * Cc.y;
        if (M.zmode.test && y < depth[p] - 1e-3) continue;
        for (let k = 0; k < nuv; k++) uvS[k] = w0 * A.uv[k] + w1 * B.uv[k] + w2 * Cc.uv[k];
        for (let c = 0; c < 4; c++) rasF[c] = w0 * A.col[c] + w1 * B.col[c] + w2 * Cc.col[c];
        for (let s = 0; s < M.stages.length; s++) {
          const st = M.stages[s];
          if (!st.texEnable) { tx[s * 4] = tx[s * 4 + 1] = tx[s * 4 + 2] = 0; tx[s * 4 + 3] = 1; continue; }
          const l = L[st.texMap], m = l.m, k0 = st.texCoord * 2;
          const u = m[0] * uvS[k0] + m[1] * uvS[k0 + 1] + m[2], v = m[3] * uvS[k0] + m[4] * uvS[k0 + 1] + m[5];
          sampleTex(l.tex, u, v, lod[st.texMap], l.wrapS, l.wrapT, tO);
          tx[s * 4] = tO[0]; tx[s * 4 + 1] = tO[1]; tx[s * 4 + 2] = tO[2]; tx[s * 4 + 3] = tO[3];
        }
        const o = evalMaterial(M, rasF);
        if (M.alphaTest && !M.alphaTest(o[3])) continue;
        const q = p * 3;
        if (M.blend) { const a = o[3]; img[q] += (o[0] * 255 - img[q]) * a; img[q + 1] += (o[1] * 255 - img[q + 1]) * a; img[q + 2] += (o[2] * 255 - img[q + 2]) * a; }
        else { img[q] = o[0] * 255; img[q + 1] = o[1] * 255; img[q + 2] = o[2] * 255; }
        if (M.zmode.write) depth[p] = y;
        cover[p] = 1;
      }
    }
  }
}

// Everything per hole the WSR views share: the model, its materials compiled,
// the library materials for the backdrop and the raster fallback, the tree
// quads (model or placement), and the world-UV maps of the backdrop tiles.
// world -> uv per tile kind when a hole has no object to fit it from: the
// periods most archives use (OB2 at 66.7 units per repeat before its 0.1
// SRT, the sea at 300 before its 0.2, fairway / rough 44, bunker 30, fringe
// and green 15, the fairway's stripe layer 120)
const DEFAULT_UV = { "M_OB": [[0.015, 0, 0], [0, 0.015, 0]], "M_Sea": [[1 / 300, 0, 0], [0, 1 / 300, 0]], "M_Fairway": [[1 / 44, 0, 0], [0, 1 / 44, 0]], "M_Fairway/1": [[1 / 120, 0, 0], [0, 1 / 120, 0]], "M_Rough": [[1 / 44, 0, 0], [0, 1 / 44, 0]], "M_Bunker": [[1 / 30, 0, 0], [0, 1 / 30, 0]], "M_Color": [[1 / 15, 0, 0], [0, 1 / 15, 0]], "M_Green": [[1 / 15, 0, 0], [0, 1 / 15, 0]] };
const UV_FIT_OK = 0.05; // an object's UV-to-world fit with rms under this (texture repeats) continues past its edge
function prepareWsr(n, P) {
  const W = loadWsr(n);
  for (const o of W.objects) {
    if (o.material !== "M_Iwa") continue;
    const dropped = dropSmallRocks(o, P.hole);
    if (dropped.length) console.log(`H${n}: ${dropped.length} M_Iwa rock${dropped.length > 1 ? "s" : ""} of ${dropped.map((d) => d.tris).join("/")} triangles, ${dropped.map((d) => d.px.toFixed(1)).join("/")} map px across, dropped (not on the Switch minimap)`);
  }
  const lib = readJson(join(WSR_DIR, "library.json")).materials;
  const compiled = {};
  const libMat = (name, texture) => { const key = Object.keys(lib).find((k) => k === `${name}/${texture}`) ?? Object.keys(lib).find((k) => k.startsWith(name + "/")); return key ? compileMaterial(lib[key]) : null; };
  for (const [name, spec] of Object.entries(W.meta.materials)) {
    // a material whose stage samples a layer it lacks (H11's M_OB has none) is drawn with the library's
    const lacking = spec.stages.some((st) => st.texEnable && !spec.layers[st.texMap]);
    compiled[name] = lacking ? libMat(name) : compileMaterial(spec);
    if (lacking) console.log(`H${n}: ${name} has no texture of its own, library material used`);
  }
  // the world-UV map per material kind: the hole's own object's fit when it is affine, else the default period
  const uvMap = {};
  for (const o of W.objects) for (let k = 0; k < o.uvSets; k++) {
    const key = o.material + (k ? "/" + k : ""), f = o.uvFit[k];
    if (!uvMap[key] && f.u && f.v && f.u[3] < UV_FIT_OK && f.v[3] < UV_FIT_OK) uvMap[key] = [f.u.slice(0, 3), f.v.slice(0, 3)];
  }
  for (const [k, v] of Object.entries(DEFAULT_UV)) uvMap[k] ??= v;
  // a material of a kind the hole lacks comes from the library (the sea's by the water style of the hole)
  const own = (name) => (compiled[name] ? { M: compiled[name], colour: W.objects.find((o) => o.material === name).colour } : null);
  const sea = own("M_Sea") ?? { M: libMat("M_Sea", P.waterStyle === "pond" ? "glfM_MapLake1" : "glfM_MapSea1"), colour: [255, 255, 255, 255] };
  const lake = compiled["M_Lake"] ? own("M_Lake") : { M: libMat("M_Sea", "glfM_MapLake1"), colour: [255, 255, 255, 255] };
  const kinds = {
    [CLS.OUTER]: own("M_OB") ?? { M: libMat("M_OB"), colour: [255, 255, 255, 255] },
    [CLS.WATER]: sea, [CLS.POND]: lake,
    [CLS.FAIRWAY]: own("M_Fairway") ?? { M: libMat("M_Fairway"), colour: [255, 255, 255, 255] },
    [CLS.ROUGH]: own("M_Rough") ?? { M: libMat("M_Rough"), colour: [255, 255, 255, 255] },
    [CLS.SAND]: own("M_Bunker") ?? { M: libMat("M_Bunker"), colour: [255, 255, 255, 255] },
    [CLS.GREEN]: own("M_Green") ?? { M: libMat("M_Green"), colour: [255, 255, 255, 255] },
    [CLS.FRINGE]: own("M_Color") ?? { M: libMat("M_Color"), colour: [255, 255, 255, 255] },
  };
  const kindUv = { [CLS.OUTER]: ["M_OB"], [CLS.WATER]: ["M_Sea"], [CLS.POND]: ["M_Sea"], [CLS.FAIRWAY]: ["M_Fairway", "M_Fairway/1"], [CLS.ROUGH]: ["M_Rough"], [CLS.SAND]: ["M_Bunker"], [CLS.GREEN]: ["M_Green", null], [CLS.FRINGE]: ["M_Color"] };
  // tree quads: the map's own sprite model, or sprites at the placement
  // positions sized as the model sizes them (width 160 units per size unit,
  // trunk base at the centre, 81% down) for the trees on fairway or rough
  const treeMats = {};
  for (const [name, spec] of Object.entries(W.meta.trees.materials)) treeMats[name] = compileMaterial(spec);
  let quads = W.meta.trees.quads;
  if (opt.trees === "placement") {
    const M = P.hole.M, SPRITE = { 2: "tree/glfM_map_tree1", 3: "tree/glfM_map_tree2", 6: "tree/glfM_map_tree3" };
    for (const k of Object.values(SPRITE)) if (lib[k]) treeMats[k] = compileMaterial(lib[k]);
    quads = P.hole.pins.trees.filter((t) => t.lie === "fairway" || t.lie === "rough").map((t) => {
      const x = M[0][0] * t.x + M[0][1] * t.y + M[0][2], z = M[1][0] * t.x + M[1][1] * t.y + M[1][2], w = TREE_UNITS_PER_SIZE * t.size;
      return [SPRITE[t.kind], x - w / 2, z - TREE_ANCHOR_V * w, x + w / 2, z + (1 - TREE_ANCHOR_V) * w, 1e6];
    }).filter((q) => treeMats[q[0]]).sort((a, b) => a[0].localeCompare(b[0]));
  }
  return { W, compiled, kinds, kindUv, uvMap, treeMats, quads };
}
const TREE_UNITS_PER_SIZE = 160; // quad width per placement size unit (median of 460 quads; p10-p90 151-172)
const TREE_ANCHOR_V = 0.812; // the placement position sits this far down the quad (its trunk base)

// WSR's H14 model decorates the lake with five rock cones (M_Iwa, 40
// triangles each, 2.0-4.2 map px across, their bases at the sea's Y -150
// where the collision mesh has water) that the Switch minimap does not draw.
// Over the 21 holes every other M_Iwa component (30 more, on 17 holes) is a
// bank or cliff of 108-2,168 triangles and 34 map px or more across (census
// 2026-10-19), so a component under IWA_MIN_PX across (its larger extent) is
// dropped. Components: triangles sharing a vertex position (the .bin keeps
// one entry per position/uv/colour tuple, so a position can appear under
// several indices). Rewrites o.idx / o.triangles in place and returns the
// dropped components.
const IWA_MIN_PX = 8;
function dropSmallRocks(o, hole) {
  const B = hole.reg.meshToMapFrac;
  const key = new Map(), vid = new Int32Array(o.vertices);
  for (let i = 0; i < o.vertices; i++) { const k = `${o.pos[i * 3]},${o.pos[i * 3 + 1]},${o.pos[i * 3 + 2]}`; if (!key.has(k)) key.set(k, key.size); vid[i] = key.get(k); }
  const par = Int32Array.from({ length: key.size }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let k = 0; k < o.triangles; k++) { const a = find(vid[o.idx[k * 3]]), b = find(vid[o.idx[k * 3 + 1]]), c = find(vid[o.idx[k * 3 + 2]]); par[a] = b; par[find(b)] = find(c); }
  const comps = new Map();
  for (let k = 0; k < o.triangles; k++) {
    const r = find(vid[o.idx[k * 3]]);
    let C = comps.get(r);
    if (!C) comps.set(r, (C = { tris: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
    C.tris++;
    for (let c = 0; c < 3; c++) { const i = o.idx[k * 3 + c], x = o.pos[i * 3], z = o.pos[i * 3 + 2]; const X = (B[0][0] * x + B[0][1] * z + B[0][2]) * MAP_W, Y = (B[1][0] * x + B[1][1] * z + B[1][2]) * MAP_H; if (X < C.x0) C.x0 = X; if (X > C.x1) C.x1 = X; if (Y < C.y0) C.y0 = Y; if (Y > C.y1) C.y1 = Y; }
  }
  const dropped = [];
  for (const [r, C] of comps) { C.px = Math.max(C.x1 - C.x0, C.y1 - C.y0); if (C.px < IWA_MIN_PX) { C.drop = true; dropped.push(C); } }
  if (!dropped.length) return dropped;
  const keep = [];
  for (let k = 0; k < o.triangles; k++) if (!comps.get(find(vid[o.idx[k * 3]])).drop) keep.push(o.idx[k * 3], o.idx[k * 3 + 1], o.idx[k * 3 + 2]);
  o.idx = Uint16Array.from(keep); o.triangles = keep.length / 3;
  return dropped;
}

// The green's second layer is glf_tokosenFix, a 1-D ramp of 12 flat bands
// from light to dark, read through the model's uv set 1 whose v falls
// linearly with the vertex height (0-1 spans the green's own range on 15
// holes; on H1, H2, H10, H12, H14 and H18 the window is wider, v 0.26-0.74
// on H1, so those crops show part of the ramp; tools/MESHES.md "Rendered
// minimaps"): WSR's own contour shading, lighter = higher. The Switch's overview
// draws no such thing: its green is flat and light (capture stacks, luma mean
// 158-169 inside the eroded WSR green polygon on 19 holes, sd 4-16; H6 127
// and H7 145 only because the flag and cup cover much of those small greens
// and the stack's inpaint fills them darker), so the map view holds v at one
// band; the zoomed green crop keeps the ramp, where lighter = higher is worth
// having. The band is lerped with the base tile by konst k2 = 30/60/90 per
// channel. Measured on H3, H6, H7 and H14, bands 1-5 (v 0.06, 0.14, 0.22,
// 0.30, 0.38) render luma 198-214, 183-200, 170-173, 152-153, 135-137, sd
// 0-1: the third and fourth straddle the stacks' 161 by 9 either way, and
// the third, the lighter, is used (170-173 on all 21 holes); the lightest is
// a pale mint no Switch green has.
const GREEN_FLAT_V = 0.22;

// H3's bottom-right corner (map x 215-250, y 288-304) is KCL outer ground,
// inside the raster and continuing past its right edge, that the minimap
// model's OB object does not reach, so the model's sea plane shows there;
// the Switch draws OB rough (374 map px, the stack OB on all but one). There
// the sea plane yields to the word and the raster's own pixel when both say
// outer ground. Only on H3: the same two tests fire on two other holes, and
// both times where the Switch shows sea: H5's right edge at map y 59-64 (29
// px, the KCL's outer ground reaching a few px past the model's coastline;
// the stack has the beach and sea there) and H18's left edge at y 147-160
// (165 px, KCL outer ground at the edge in a window map-style's runs leave
// out; the stack sea on 142). No other hole has the sea plane over an outer
// word at all (census 2026-10-19).
const SEA_YIELDS = new Set([3]);

// Render one view in the WSR art. `mode` "model" rasterises the minimap
// model and fills what it leaves uncovered with the border class's tile;
// "raster" paints every sample from the class raster. `view.flatGreen`
// holds the green's height ramp at GREEN_FLAT_V (the overview).
function renderWsrView(P, Q, view, mode) {
  const { width, height } = view;
  const G = sampleGrid(view), { SW, SH, N } = G;
  const F = { SW, SH, img: new Float32Array(N * 3), depth: new Float32Array(N).fill(-1e9), cover: new Uint8Array(N) };
  const S = meshToSample(P, G);
  // the class raster's word per sample (the beyond rules past its edge): the
  // backdrop, and the one thing the model's sea plane yields to
  const raw = new Uint8Array(N);
  const cls = classifySamples(P, G, raw);
  if (mode === "model") {
    // The sea plane lies under the whole model, so it shows wherever no land
    // object covers a sample. On the holes in SEA_YIELDS, where that sample
    // is outer ground both by the word (the raster, or the beyond rules past
    // it) and by the raster's own pixel (its nearest edge pixel past it), it
    // stays uncovered and the backdrop draws the OB tile instead.
    const onOuter = new Uint8Array(N);
    if (SEA_YIELDS.has(P.hole.n)) for (let p = 0; p < N; p++) if (cls[p] === CLS.OUTER && raw[p] === CLS.OUTER) onOuter[p] = 1;
    for (const o of Q.W.objects) {
      const M = Q.compiled[o.material];
      // the OB ground takes the world-projected map its tile continues with
      // past the model (H19's own OB UVs are partly collapsed: the game
      // never shows this object textured, see compileMaterial)
      const wuv = o.material === "M_OB" ? Q.uvMap["M_OB"] : null;
      F.skip = o.material === "M_Sea" || o.material === "M_Lake" ? onOuter : null;
      rasterTriangles(F, M, o.triangles, (k, c, v) => {
        const i = o.idx[k * 3 + c];
        const x = o.pos[i * 3], y = o.pos[i * 3 + 1], z = o.pos[i * 3 + 2];
        v.sx = S[0] * x + S[1] * z + S[2]; v.sy = S[3] * x + S[4] * z + S[5]; v.y = y;
        for (let u = 0; u < o.uvSets * 2; u++) v.uv[u] = o.uv[i * o.uvSets * 2 + u];
        if (wuv) { v.uv[0] = wuv[0][0] * x + wuv[0][1] * z + wuv[0][2]; v.uv[1] = wuv[1][0] * x + wuv[1][1] * z + wuv[1][2]; }
        // the overview holds the green's height ramp (layer 1 through uv set 1, v = height) at one band
        if (view.flatGreen && o.material === "M_Green" && o.uvSets > 1) v.uv[3] = GREEN_FLAT_V;
        for (let q = 0; q < 4; q++) v.col[q] = o.col[i * 4 + q] / 255;
      });
    }
    F.skip = null;
  }
  // the backdrop (model mode: only where the model drew nothing; raster
  // mode: everything): the class raster's word per sample, drawn as a flat
  // quad of the kind's material with the world-UV map of its tile
  const notSand = new Uint8Array(N);
  let anySand = false;
  for (let p = 0; p < N; p++) { if (cls[p] !== CLS.SAND) notSand[p] = 1; else anySand = true; }
  const dSandIn = mode === "raster" && anySand ? edt2(notSand, SW, SH) : null;
  const sandEdge = SAND_EDGE * G.PX;
  const MF = P.hole.M; // sample -> mesh for the flat quads
  const Si = (i, j) => { const fx = (G.X0 + (i + 0.5) * G.dx) / MAP_W, fy = (G.Y0 + (j + 0.5) * G.dy) / MAP_H; return [MF[0][0] * fx + MF[0][1] * fy + MF[0][2], MF[1][0] * fx + MF[1][1] * fy + MF[1][2]]; };
  const byKind = new Map();
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const p = j * SW + i;
    if (mode === "model" && F.cover[p]) continue;
    let c = cls[p];
    if (!Q.kinds[c]) c = CLS.OUTER;
    if (!byKind.has(c)) byKind.set(c, []);
    byKind.get(c).push(p);
  }
  for (const [c, list] of byKind) {
    const kind = Q.kinds[c], Mk = kind.M;
    if (!Mk) continue;
    const maps = Q.kindUv[c].map((k) => (k ? Q.uvMap[k] : null));
    const ras = kind.colour.map((v) => v / 255);
    const lod = new Float32Array(Mk.layers.length);
    for (let l = 0; l < Mk.layers.length; l++) {
      const st = Mk.stages.find((s) => s.texEnable && s.texMap === l), map = st && maps[st.texCoord];
      if (!map) { lod[l] = 0; continue; }
      const m = Mk.layers[l].m, upp = Math.hypot(MF[0][0] / MAP_W * G.dx, MF[1][0] / MAP_W * G.dx); // mesh units per sample
      const W = Mk.layers[l].tex.width, H = Mk.layers[l].tex.height;
      const rho = Math.max(Math.hypot(m[0] * map[0][0] * W, m[3] * map[0][0] * H), Math.hypot(m[1] * map[1][1] * W, m[4] * map[1][1] * H)) * upp;
      lod[l] = rho > 1 ? Math.log2(rho) : 0;
    }
    for (const p of list) {
      const i = p % SW, j = (p - i) / SW, [x, z] = Si(i, j);
      for (let s = 0; s < Mk.stages.length; s++) {
        const st = Mk.stages[s];
        const map = maps[st.texCoord];
        if (!st.texEnable) { tx[s * 4] = tx[s * 4 + 1] = tx[s * 4 + 2] = 0; tx[s * 4 + 3] = 1; continue; }
        const l = Mk.layers[st.texMap], m = l.m;
        // a layer with no world map (the green contour, indexed by height) reads one texel: the overview's flat band, else the middle
        if (!map) { sampleTex(l.tex, 0.5, view.flatGreen ? GREEN_FLAT_V : 0.5, 0, l.wrapS, l.wrapT, tO); tx[s * 4] = tO[0]; tx[s * 4 + 1] = tO[1]; tx[s * 4 + 2] = tO[2]; tx[s * 4 + 3] = tO[3]; continue; }
        const u0 = map[0][0] * x + map[0][1] * z + map[0][2], v0 = map[1][0] * x + map[1][1] * z + map[1][2];
        sampleTex(l.tex, m[0] * u0 + m[1] * v0 + m[2], m[3] * u0 + m[4] * v0 + m[5], lod[st.texMap], l.wrapS, l.wrapT, tO);
        tx[s * 4] = tO[0]; tx[s * 4 + 1] = tO[1]; tx[s * 4 + 2] = tO[2]; tx[s * 4 + 3] = tO[3];
      }
      rasF.set(ras);
      // the bunker's shaded rim: the model gives its edge vertices half the vertex colour
      if (c === CLS.SAND && dSandIn && Math.sqrt(dSandIn[p]) <= sandEdge) { rasF[0] = rasF[1] = rasF[2] = 0.5; }
      const o = evalMaterial(Mk, rasF), q = p * 3;
      F.img[q] = o[0] * 255; F.img[q + 1] = o[1] * 255; F.img[q + 2] = o[2] * 255;
      F.cover[p] = 1;
    }
  }
  // the trees, last: alpha-tested sprites with depth, in the model's order
  for (const [name, x0, z0, x1, z1, y] of Q.quads) {
    const Mt = Q.treeMats[name];
    if (!Mt) continue;
    const corner = [[x0, z0, 0, 0], [x1, z0, 1, 0], [x0, z1, 0, 1], [x1, z1, 1, 1]];
    rasterTriangles(F, Mt, 2, (k, c, v) => {
      const q = corner[k === 0 ? [0, 1, 2][c] : [1, 3, 2][c]];
      v.sx = S[0] * q[0] + S[1] * q[1] + S[2]; v.sy = S[3] * q[0] + S[4] * q[1] + S[5]; v.y = y;
      v.uv[0] = q[2]; v.uv[1] = q[3]; v.col.fill(1);
    });
  }
  return downsample(F.img, G, width, height);
}

// ============================================================================
// Main
// ============================================================================

if (opt.extract) { await extractWsr(opt.extract); process.exit(0); }
if (opt.art === "wsr" && !existsSync(join(WSR_DIR, "library.json"))) { console.error(`${WSR_DIR} is missing; run with --extract <WSR_Extract>/DATA/files/Stage/Shared2 first (the glf_course_<id>.carc archives, or the glf_course_<id>.d folders wszst extract makes of them)`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// index.json: a --holes batch keeps the other holes' entries (their PNGs are
// untouched too) and refreshes its own, so build-derived's stale-crop check
// sees every hole whichever way the directory was built; each entry records
// the art it was rendered with (the file level says only the last run's), so
// build-derived can tell a cross-check batch from the shipped art
const idxPath = join(OUT, "index.json");
let prevHoles = {};
if (opt.holes) { try { prevHoles = JSON.parse(readFileSync(idxPath, "utf8")).holes ?? {}; } catch {} }
const index = { _note: "Written by tools/render-maps.mjs. map: the 250x304 hole-map frame at `scale` px per map px. green: the WSR green box (wsr-truth.json) plus `margin` of it on every side, at the box's true aspect (width/height in map px); bbox-local (u,v) in 0..1 sits at ((u + margin) / (1 + 2 margin)) of the image, as the app's GreenView places pins. art, wsr: per entry, what that hole was rendered with (the top level is the last run's; build-derived ships only art wsr, mode model).", scale: opt.scale, ss: opt.ss, style: opt.style, art: opt.art, wsr: opt.art === "wsr" ? { mode: opt.wsr, trees: opt.trees } : undefined, holes: { ...prevHoles } };
for (const n of HOLES) {
  const t0 = Date.now();
  const P = prepareHole(n);
  const Q = opt.art === "wsr" ? prepareWsr(n, P) : null;
  const render = (view) => (Q ? renderWsrView(P, Q, view, opt.wsr) : renderView(P, view));
  const nn = P.hole.nn;
  const map = render({ fx0: 0, fy0: 0, fx1: 1, fy1: 1, width: MAP_W * opt.scale, height: MAP_H * opt.scale, ss: opt.ss, flatGreen: true });
  savePng(join(OUT, `h${nn}.png`), map);
  const t1 = Date.now();
  const entry = { art: opt.art, ...(opt.art === "wsr" ? { wsr: { mode: opt.wsr, trees: opt.trees } } : {}), map: { file: `h${nn}.png`, width: map.width, height: map.height, scale: opt.scale } };
  if (opt.green && P.hole.truth.greenBox) {
    const b = P.hole.truth.greenBox, bw = (b.x1 - b.x0) * MAP_W, bh = (b.y1 - b.y0) * MAP_H;
    const cw = bw * (1 + 2 * GREEN_MARGIN), ch = bh * (1 + 2 * GREEN_MARGIN);
    const gs = Math.max(opt.greenScale, Math.ceil(opt.greenMin / Math.max(cw, ch)));
    const width = Math.round(cw * gs), height = Math.round(ch * gs);
    const view = { fx0: b.x0 - GREEN_MARGIN * (b.x1 - b.x0), fx1: b.x1 + GREEN_MARGIN * (b.x1 - b.x0), fy0: b.y0 - GREEN_MARGIN * (b.y1 - b.y0), fy1: b.y1 + GREEN_MARGIN * (b.y1 - b.y0), width, height, ss: Math.max(2, Math.min(opt.ss, Math.round(opt.ss * 4 / gs))) };
    const green = render(view);
    savePng(join(OUT, `h${nn}-green.png`), green);
    entry.green = { file: `h${nn}-green.png`, width, height, aspect: +(bw / bh).toFixed(4), margin: GREEN_MARGIN, pxPerMapPx: gs, box: b, frame: { x0: +view.fx0.toFixed(4), y0: +view.fy0.toFixed(4), x1: +view.fx1.toFixed(4), y1: +view.fy1.toFixed(4) } };
    console.log(JSON.stringify({ hole: n, ...entry.green }));
  }
  index.holes[n] = entry;
  const treesNote = Q ? `${Q.quads.length} tree quads (${opt.trees})` : `${P.trees.length} trees drawn of ${P.hole.pins.trees.length}`;
  console.log(`H${n}: map ${map.width}x${map.height} in ${t1 - t0} ms${entry.green ? `, green ${entry.green.width}x${entry.green.height} (${entry.green.pxPerMapPx}x) in ${Date.now() - t1} ms` : ""}; ${treesNote}${P.cleaned.dropped ? `; off-course sand dropped: ${P.cleaned.components.map((c) => `${c.px} px at raster ${c.cx.toFixed(0)},${c.cy.toFixed(0)}`).join(", ")}` : ""}`);
}
writeFileSync(idxPath, JSON.stringify(index, null, 1) + "\n");
