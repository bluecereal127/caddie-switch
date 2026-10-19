// Reader for WSR's BRRES archives and the MDL0 models inside them, as far as
// the minimap renderer needs: the vertex / texcoord / colour arrays, the
// materials with their texture layers (name, wrap mode, texture SRT), the
// shaders' texture-map / texcoord pairing per TEV stage, the objects with
// their GX display lists decoded to primitives, and the draw lists (which
// material each object is drawn with, in what order). Normals, bones beyond
// the root, fur, user data and the TEX0 pixel data are skipped (wszst has
// already decoded the textures to PNG).
//
// Layout references: the Custom Mario Kart wiki's BRRES and MDL0 pages and
// szs.wiimm.de. Everything is big-endian. Offsets inside an index group are
// relative to the group; inside a section entry (vertex array, material,
// object) relative to that entry; the model-relative ones are negative
// pointers back to the MDL0 start.
//
// Verified on glf_map_fc1: 5 vertex arrays whose counts and positions match
// wszst's text dump (573 / 172 / 753 / 654 / 1383 vertices, array 0's
// minimum -240.355 65.343 -1760.908), 7675 vertex references and 5673
// triangles, the header's N-VERTEX / N-FACE.

const td = new TextDecoder("latin1");

function cstr(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return td.decode(buf.subarray(off, end));
}

// A BRRES index group ("resource group") at `off`: size, count, then count+1
// entries of 16 bytes (the first is the tree root, skipped). Returns
// [{ name, off }] with `off` absolute.
function indexGroup(buf, off) {
  const count = buf.readUInt32BE(off + 4);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const e = off + 8 + i * 16;
    const nameOff = buf.readUInt32BE(e + 8), dataOff = buf.readUInt32BE(e + 12);
    out.push({ name: cstr(buf, off + nameOff), off: off + dataOff });
  }
  return out;
}

// The archive: { version, folders: { "3DModels(NW4R)": [{ name, off, length }], ... } }.
// Each entry's bytes are buf.subarray(off, off + length).
export function readBrres(buf) {
  if (buf.toString("latin1", 0, 4) !== "bres") throw new Error("not a BRRES");
  const rootOff = buf.readUInt16BE(0x0c);
  if (buf.toString("latin1", rootOff, rootOff + 4) !== "root") throw new Error("BRRES root missing");
  const folders = {};
  for (const folder of indexGroup(buf, rootOff + 8)) {
    folders[folder.name] = indexGroup(buf, folder.off).map((e) => ({ name: e.name, off: e.off, length: buf.readUInt32BE(e.off + 4), magic: buf.toString("latin1", e.off, e.off + 4) }));
  }
  return { version: buf.readUInt16BE(8), folders };
}

// Vertex-array element formats (GX): bytes per component and a reader.
const FMT = {
  0: { size: 1, read: (b, o) => b.readUInt8(o) },
  1: { size: 1, read: (b, o) => b.readInt8(o) },
  2: { size: 2, read: (b, o) => b.readUInt16BE(o) },
  3: { size: 2, read: (b, o) => b.readInt16BE(o) },
  4: { size: 4, read: (b, o) => b.readFloatBE(o) },
};

// A vertex / texcoord array entry: `comps` components per element (positions
// 2 or 3, texcoords 1 or 2), `format` 0-4, `divisor` a fixed-point shift.
function readArray(buf, off, compsOf) {
  const dataOff = buf.readUInt32BE(off + 8), nameOff = buf.readUInt32BE(off + 0x0c);
  const comps = compsOf(buf.readUInt32BE(off + 0x14)), format = buf.readUInt32BE(off + 0x18);
  const divisor = buf.readUInt8(off + 0x1c), stride = buf.readUInt8(off + 0x1d), count = buf.readUInt16BE(off + 0x1e);
  const f = FMT[format], scale = 1 / 2 ** divisor;
  const data = new Float32Array(count * comps);
  for (let i = 0; i < count; i++) for (let c = 0; c < comps; c++) data[i * comps + c] = f.read(buf, off + dataOff + i * stride + c * f.size) * scale;
  return { name: cstr(buf, off + nameOff), index: buf.readUInt32BE(off + 0x10), comps, format, divisor, stride, count, data };
}

// Colour array: formats 0 RGB565, 1 RGB8, 2 RGBX8, 3 RGBA4, 4 RGBA6, 5 RGBA8 -> Uint8 RGBA.
function readColors(buf, off) {
  const dataOff = buf.readUInt32BE(off + 8), nameOff = buf.readUInt32BE(off + 0x0c);
  const format = buf.readUInt32BE(off + 0x18), stride = buf.readUInt8(off + 0x1c), count = buf.readUInt16BE(off + 0x1e);
  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = off + dataOff + i * stride;
    let r, g, b, a = 255;
    if (format === 0) { const v = buf.readUInt16BE(o); r = ((v >> 11) & 31) * 255 / 31; g = ((v >> 5) & 63) * 255 / 63; b = (v & 31) * 255 / 31; }
    else if (format === 1 || format === 2) { r = buf[o]; g = buf[o + 1]; b = buf[o + 2]; }
    else if (format === 3) { const v = buf.readUInt16BE(o); r = ((v >> 12) & 15) * 17; g = ((v >> 8) & 15) * 17; b = ((v >> 4) & 15) * 17; a = (v & 15) * 17; }
    else if (format === 4) { const v = (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2]; r = ((v >> 18) & 63) * 255 / 63; g = ((v >> 12) & 63) * 255 / 63; b = ((v >> 6) & 63) * 255 / 63; a = (v & 63) * 255 / 63; }
    else { r = buf[o]; g = buf[o + 1]; b = buf[o + 2]; a = buf[o + 3]; }
    data[i * 4] = Math.round(r); data[i * 4 + 1] = Math.round(g); data[i * 4 + 2] = Math.round(b); data[i * 4 + 3] = Math.round(a);
  }
  return { name: cstr(buf, off + nameOff), index: buf.readUInt32BE(off + 0x10), format, count, data };
}

// Material (MDL0 v11 layout): texture layers at +0x30's offset, 0x34 bytes
// each; texture SRT at 0x1b0 (8 x { scale[2], rot, trans[2] }); the shader
// this material uses at +0x28 (an offset to the shader entry); XLU in the
// flags' top bit. The raw BP/XF display list is kept for anyone who needs
// the texgen sources.
function readMaterial(buf, off, mdlOff) {
  const nameOff = buf.readUInt32BE(off + 8), flags = buf.readUInt32BE(off + 0x10);
  const shaderOff = buf.readInt32BE(off + 0x28), nLayers = buf.readUInt32BE(off + 0x2c), layerOff = buf.readUInt32BE(off + 0x30);
  const layers = [];
  for (let i = 0; i < nLayers; i++) {
    const l = off + layerOff + i * 0x34;
    const texName = cstr(buf, l + buf.readUInt32BE(l)), palOff = buf.readUInt32BE(l + 4);
    layers.push({ texture: texName, palette: palOff ? cstr(buf, l + palOff) : null, wrapS: buf.readUInt32BE(l + 0x18), wrapT: buf.readUInt32BE(l + 0x1c), minFilter: buf.readUInt32BE(l + 0x20), magFilter: buf.readUInt32BE(l + 0x24), lodBias: buf.readFloatBE(l + 0x28) });
  }
  const srt = [];
  for (let i = 0; i < 8; i++) {
    const s = off + 0x1b0 + i * 0x14;
    srt.push({ scale: [buf.readFloatBE(s), buf.readFloatBE(s + 4)], rot: buf.readFloatBE(s + 8), trans: [buf.readFloatBE(s + 12), buf.readFloatBE(s + 16)] });
  }
  const dlOff = buf.readUInt32BE(off + 0x3c), dl = buf.subarray(off + dlOff, off + buf.readUInt32BE(off));
  // the material's own GX state: TEV registers c0-c2 (BP 0xe2-0xe7, 11-bit
  // signed RA / BG pairs), konst colours k0-k3 (the same registers with bit
  // 23, 8-bit), blend mode, z mode, alpha compare, and per texcoord the
  // texgen source (XF 0x1040+i: bits 7-11, 0 = position, 5+ = uv set)
  const regs = bpWrites(dl);
  const s11 = (v) => (v & 0x400 ? v - 0x800 : v);
  const tev = {}, konst = {};
  for (let i = 0; i < 4; i++) {
    const ra = regs["r" + (0xe0 + 2 * i).toString(16)], bg = regs["r" + (0xe1 + 2 * i).toString(16)];
    if (i > 0 && ra !== undefined && bg !== undefined) tev["c" + (i - 1)] = [s11(ra & 0x7ff), s11((bg >> 12) & 0x7ff), s11(bg & 0x7ff), s11((ra >> 12) & 0x7ff)];
    const kra = regs["k" + (0xe0 + 2 * i).toString(16)], kbg = regs["k" + (0xe1 + 2 * i).toString(16)];
    if (kra !== undefined && kbg !== undefined) konst["k" + i] = [kra & 0xff, (kbg >> 12) & 0xff, kbg & 0xff, (kra >> 12) & 0xff];
  }
  const bm = regs["41"] ?? 0, zm = regs["40"] ?? 0, ac = regs["f3"] ?? 0;
  const texgen = [];
  for (let p = 0; p < dl.length;) {
    const op = dl[p];
    if (op === 0x10) { const n = dl.readUInt16BE(p + 1) + 1, addr = dl.readUInt16BE(p + 3); if (addr >= 0x1040 && addr < 0x1048) { const v = dl.readUInt32BE(p + 5); texgen[addr - 0x1040] = { source: (v >> 7) & 31, projection: !!(v & 2), inputForm: !!(v & 4), type: (v >> 4) & 7 }; } p += 5 + n * 4; }
    else if (op === 0x61) p += 5; else if (op === 0x08) p += 6; else if (op === 0) p++; else break;
  }
  return {
    name: cstr(buf, off + nameOff), index: buf.readUInt32BE(off + 0x0c), xlu: !!(flags & 0x80000000),
    texgens: buf[off + 0x14], lightChannels: buf[off + 0x15], stages: buf[off + 0x16], indirect: buf[off + 0x17],
    cull: buf.readUInt32BE(off + 0x18), alphaFunc: buf[off + 0x1c], shaderOff: off + shaderOff, shader: null, layers, srt: srt.slice(0, nLayers), texgen,
    tev, konst,
    blend: { enable: !!(bm & 1), src: (bm >> 8) & 7, dst: (bm >> 5) & 7, subtract: !!(bm & 0x800) },
    zmode: { test: !!(zm & 1), func: (zm >> 1) & 7, write: !!(zm & 0x10) },
    alphaCompare: { ref0: ac & 0xff, ref1: (ac >> 8) & 0xff, comp0: (ac >> 16) & 7, comp1: (ac >> 19) & 7, logic: (ac >> 22) & 3 },
    dl,
  };
}

// The BP register writes of a display list (op 0x61), the 0xfe mask applied
// to the write that follows it; later writes of a register replace earlier
// ones, except that the TEV colour registers (0xe0-0xe7) are kept twice over,
// as plain registers and as konst colours (bit 23 tells them apart).
function bpWrites(dl) {
  const regs = {};
  let mask = 0xffffff, p = 0;
  while (p < dl.length) {
    const op = dl[p];
    if (op === 0x61) {
      const v = dl.readUInt32BE(p + 1), reg = v >>> 24, val = v & 0xffffff;
      if (reg === 0xfe) mask = val;
      else {
        const key = reg >= 0xe0 && reg <= 0xe7 ? (val & 0x800000 ? "k" : "r") + reg.toString(16) : reg.toString(16);
        regs[key] = ((regs[key] ?? 0) & ~mask) | (val & mask);
        mask = 0xffffff;
      }
      p += 5;
    } else if (op === 0x10) p += 5 + (dl.readUInt16BE(p + 1) + 1) * 4;
    else if (op === 0x08) p += 6;
    else if (op === 0) p++;
    else break;
  }
  return regs;
}

// TEV input names, GX order (colour: 0-15; alpha: 0-7); konst selectors.
const CIN = ["cprev", "aprev", "c0", "a0", "c1", "a1", "c2", "a2", "texc", "texa", "rasc", "rasa", "one", "half", "konst", "zero"];
const AIN = ["aprev", "a0", "a1", "a2", "texa", "rasa", "konst", "zero"];
const KC = (v) => (v < 8 ? (8 - v) / 8 : v >= 12 && v < 16 ? "k" + (v - 12) : v >= 16 ? ["r", "g", "b", "a"][(v - 16) >> 2] + "k" + ((v - 16) & 3) : 1);
const KA = (v) => (v < 8 ? (8 - v) / 8 : v >= 16 ? ["r", "g", "b", "a"][(v - 16) >> 2] + "k" + ((v - 16) & 3) : 1);

// Shader: per TEV stage, which texture map / texcoord / colour channel it
// reads (BP TREF 0x28-0x2b) and its colour and alpha combiners (BP 0xc0+2i,
// 0xc1+2i: out = d + bias +/- (a (1-c) + b c), clamped, scaled) with their
// konst selections (BP KSEL 0xf6+i). Enough to evaluate the minimap
// materials exactly: they use at most two stages.
function readShader(buf, off) {
  const stages = buf[off + 0x0c], length = buf.readUInt32BE(off);
  const regs = bpWrites(buf.subarray(off + 0x20, off + length));
  const BIAS = [0, 0.5, -0.5, 0], SCALE = [1, 2, 4, 0.5];
  const perStage = [];
  for (let s = 0; s < stages; s++) {
    const t = regs[(0x28 + (s >> 1)).toString(16)] ?? 0, sh = (s & 1) * 12;
    const c = regs[(0xc0 + 2 * s).toString(16)] ?? 0, a = regs[(0xc1 + 2 * s).toString(16)] ?? 0;
    const k = regs[(0xf6 + (s >> 1)).toString(16)] ?? 0, ksh = (s & 1) * 10;
    perStage.push({
      texMap: (t >> sh) & 7, texCoord: (t >> (sh + 3)) & 7, texEnable: !!((t >> (sh + 6)) & 1), colorChan: (t >> (sh + 7)) & 7,
      color: { a: CIN[(c >> 12) & 15], b: CIN[(c >> 8) & 15], c: CIN[(c >> 4) & 15], d: CIN[c & 15], bias: BIAS[(c >> 16) & 3], sub: !!((c >> 18) & 1), clamp: !!((c >> 19) & 1), scale: SCALE[(c >> 20) & 3], dest: (c >> 22) & 3 },
      alpha: { a: AIN[(a >> 13) & 7], b: AIN[(a >> 10) & 7], c: AIN[(a >> 7) & 7], d: AIN[(a >> 4) & 7], bias: BIAS[(a >> 16) & 3], sub: !!((a >> 18) & 1), clamp: !!((a >> 19) & 1), scale: SCALE[(a >> 20) & 3], dest: (a >> 22) & 3 },
      kc: KC((k >> (4 + ksh)) & 31), ka: KA((k >> (9 + ksh)) & 31),
    });
  }
  return { index: buf.readUInt32BE(off + 8), stages: perStage };
}

// Object (polygon): the vertex descriptor says which attributes each vertex
// carries and whether as a direct value, an 8-bit or a 16-bit index; the
// data display list is GX primitives over those vertices. Only indexed
// attributes are decoded (the minimap models use nothing else).
const PRIM = { 0x80: "quads", 0x88: "quads2", 0x90: "triangles", 0x98: "strip", 0xa0: "fan", 0xa8: "lines", 0xb0: "linestrip", 0xb8: "points" };
function readObject(buf, off) {
  const vcdLo = buf.readUInt32BE(off + 0x0c), vcdHi = buf.readUInt32BE(off + 0x10);
  // the two display-list offsets are relative to their own size/size/offset
  // field blocks (+0x18 settings, +0x24 data): fc1 object 0 has its data DL
  // offset 0x13c and its first strip at entry + 0x160, and its 0xe0-byte
  // settings DL (offset 0x68) runs from entry + 0x80 to exactly that 0x160
  const dlSize = buf.readUInt32BE(off + 0x24), dlOff = 0x24 + buf.readUInt32BE(off + 0x2c);
  const nameOff = buf.readUInt32BE(off + 0x38);
  const arrays = { vertex: buf.readInt16BE(off + 0x48), normal: buf.readInt16BE(off + 0x4a), color: [buf.readInt16BE(off + 0x4c), buf.readInt16BE(off + 0x4e)], uv: [] };
  for (let i = 0; i < 8; i++) arrays.uv.push(buf.readInt16BE(off + 0x50 + i * 2));
  // attribute order in a vertex: pos matrix idx, tex matrix idx 0-7, position, normal, color 0-1, tex 0-7
  const attrs = [];
  if (vcdLo & 1) attrs.push({ key: "pnmtx", mode: 1 });
  for (let i = 0; i < 8; i++) if ((vcdLo >> (1 + i)) & 1) attrs.push({ key: "tmtx" + i, mode: 1 });
  attrs.push({ key: "pos", mode: (vcdLo >> 9) & 3 });
  attrs.push({ key: "nrm", mode: (vcdLo >> 11) & 3 });
  attrs.push({ key: "col0", mode: (vcdLo >> 13) & 3 });
  attrs.push({ key: "col1", mode: (vcdLo >> 15) & 3 });
  for (let i = 0; i < 8; i++) attrs.push({ key: "uv" + i, mode: (vcdHi >> (2 * i)) & 3 });
  const live = attrs.filter((a) => a.mode);
  for (const a of live) if (a.mode === 1 && !(a.key === "pnmtx" || a.key.startsWith("tmtx"))) throw new Error(`object ${cstr(buf, off + nameOff)}: direct ${a.key} data not supported`);
  const prims = [];
  let p = off + dlOff;
  const end = p + dlSize;
  while (p < end) {
    const op = buf[p];
    if (op === 0) { p++; continue; }
    const type = PRIM[op & 0xf8];
    if (!type) throw new Error(`object ${cstr(buf, off + nameOff)}: unknown GX opcode 0x${op.toString(16)} at ${p - off}`);
    const n = buf.readUInt16BE(p + 1);
    p += 3;
    const verts = [];
    for (let i = 0; i < n; i++) {
      const v = {};
      for (const a of live) {
        if (a.mode === 1) { v[a.key] = buf[p]; p += 1; }
        else if (a.mode === 2) { v[a.key] = buf[p]; p += 1; }
        else { v[a.key] = buf.readUInt16BE(p); p += 2; }
      }
      verts.push(v);
    }
    prims.push({ type, verts });
  }
  return { name: cstr(buf, off + nameOff), index: buf.readUInt32BE(off + 0x3c), vertexCount: buf.readUInt32BE(off + 0x40), faceCount: buf.readUInt32BE(off + 0x44), arrays, attrs: live.map((a) => a.key), prims };
}

// Draw lists: NodeTree (op 2), NodeMix (3), DrawOpa / DrawXlu (op 4: mat,
// obj, bone, priority), end (1). Returns the draw entries in list order.
function readDrawList(buf, off) {
  const out = [];
  let p = off;
  for (;;) {
    const op = buf[p];
    if (op === 1 || p >= buf.length) break;
    if (op === 2) p += 5;
    else if (op === 3) { const n = buf.readUInt8(p + 3); p += 4 + n * 6; }
    else if (op === 4) { out.push({ mat: buf.readUInt16BE(p + 1), obj: buf.readUInt16BE(p + 3), bone: buf.readUInt16BE(p + 5), prio: buf[p + 7] }); p += 8; }
    else if (op === 5) p += 5;
    else if (op === 6) p += 4;
    else throw new Error(`draw list: unknown op ${op}`);
  }
  return out;
}

// The model at `base` in `buf`. Inside a BRRES the names live in the
// archive-wide string pool past the MDL0's own length, so the whole archive
// buffer is passed, not a subarray (wszst's raw dumps append the pool, so
// base 0 on one of those works too).
export function readMdl0(buf, base = 0) {
  if (base) buf = buf.subarray(base);
  if (buf.toString("latin1", 0, 4) !== "MDL0") throw new Error("not an MDL0");
  const version = buf.readUInt32BE(8);
  const nSections = version >= 10 ? 14 : 11;
  const secOff = [];
  for (let i = 0; i < nSections; i++) secOff.push(buf.readUInt32BE(0x10 + i * 4));
  const nameOff = buf.readUInt32BE(0x10 + nSections * 4);
  const hdr = 0x10 + nSections * 4 + 4; // the 0x40-byte model header
  const group = (i) => (secOff[i] ? indexGroup(buf, secOff[i]) : []);
  const S = version >= 10 ? { def: 0, bones: 1, vert: 2, nrm: 3, col: 4, uv: 5, mat: 8, shd: 9, obj: 10, tex: 11 } : { def: 0, bones: 1, vert: 2, nrm: 3, col: 4, uv: 5, mat: 6, shd: 7, obj: 8, tex: 9 };
  const model = {
    name: cstr(buf, nameOff), version,
    vertexCount: buf.readUInt32BE(hdr + 0x10), faceCount: buf.readUInt32BE(hdr + 0x14),
    min: [0, 1, 2].map((k) => buf.readFloatBE(hdr + 0x28 + k * 4)), max: [0, 1, 2].map((k) => buf.readFloatBE(hdr + 0x34 + k * 4)),
    bones: group(S.bones).map((e) => ({ name: e.name, flags: buf.readUInt32BE(e.off + 0x14), scale: [0, 1, 2].map((k) => buf.readFloatBE(e.off + 0x20 + k * 4)), rotation: [0, 1, 2].map((k) => buf.readFloatBE(e.off + 0x2c + k * 4)), translation: [0, 1, 2].map((k) => buf.readFloatBE(e.off + 0x38 + k * 4)) })),
    vertices: group(S.vert).map((e) => readArray(buf, e.off, (c) => (c === 0 ? 2 : 3))),
    uvs: group(S.uv).map((e) => readArray(buf, e.off, (c) => (c === 0 ? 1 : 2))),
    colors: group(S.col).map((e) => readColors(buf, e.off)),
    materials: group(S.mat).map((e) => readMaterial(buf, e.off)),
    shaders: group(S.shd).map((e) => ({ off: e.off, ...readShader(buf, e.off) })),
    objects: group(S.obj).map((e) => readObject(buf, e.off)),
    textures: group(S.tex).map((e) => e.name),
    draw: { opa: [], xlu: [] },
  };
  for (const m of model.materials) m.shader = model.shaders.find((s) => s.off === m.shaderOff) ?? null;
  for (const e of group(S.def)) {
    if (e.name === "DrawOpa") model.draw.opa = readDrawList(buf, e.off);
    else if (e.name === "DrawXlu") model.draw.xlu = readDrawList(buf, e.off);
  }
  return model;
}

// Every primitive of an object as triangles, each vertex resolved to
// { x, y, z, u: [[s,t] per uv set in the object's uv order], c: RGBA or null }.
// Strips and fans unwound; quads split along 0-2.
export function objectTriangles(model, obj) {
  const pos = model.vertices[obj.arrays.vertex];
  const uvSets = obj.arrays.uv.map((i, k) => (i >= 0 && obj.attrs.includes("uv" + k) ? { key: "uv" + k, arr: model.uvs[i] } : null)).filter(Boolean);
  const col = obj.arrays.color[0] >= 0 && obj.attrs.includes("col0") ? model.colors[obj.arrays.color[0]] : null;
  const resolve = (v) => {
    const i = v.pos * pos.comps;
    const out = { x: pos.data[i], y: pos.comps === 3 ? pos.data[i + 1] : 0, z: pos.comps === 3 ? pos.data[i + 2] : pos.data[i + 1], u: [], c: null };
    for (const s of uvSets) { const j = v[s.key] * s.arr.comps; out.u.push([s.arr.data[j], s.arr.comps === 2 ? s.arr.data[j + 1] : 0]); }
    if (col) { const j = v.col0 * 4; out.c = [col.data[j], col.data[j + 1], col.data[j + 2], col.data[j + 3]]; }
    return out;
  };
  const tris = [];
  for (const p of obj.prims) {
    const v = p.verts.map(resolve);
    if (p.type === "triangles") for (let i = 0; i + 2 < v.length; i += 3) tris.push([v[i], v[i + 1], v[i + 2]]);
    else if (p.type === "strip") for (let i = 0; i + 2 < v.length; i++) tris.push(i & 1 ? [v[i + 1], v[i], v[i + 2]] : [v[i], v[i + 1], v[i + 2]]);
    else if (p.type === "fan") for (let i = 1; i + 1 < v.length; i++) tris.push([v[0], v[i], v[i + 1]]);
    else if (p.type === "quads" || p.type === "quads2") for (let i = 0; i + 3 < v.length; i += 4) tris.push([v[i], v[i + 1], v[i + 2]], [v[i], v[i + 2], v[i + 3]]);
  }
  return tris;
}

// The archive's models as { name: Mdl0 } and its texture names with sizes
// (width, height, format) from the TEX0 headers.
export function readArchive(buf) {
  const b = readBrres(buf);
  const models = {};
  for (const e of b.folders["3DModels(NW4R)"] ?? []) models[e.name] = readMdl0(buf, e.off);
  const textures = {};
  for (const e of b.folders["Textures(NW4R)"] ?? []) textures[e.name] = { width: buf.readUInt16BE(e.off + 0x1c), height: buf.readUInt16BE(e.off + 0x1e), format: buf.readUInt32BE(e.off + 0x20), mipmaps: buf.readUInt32BE(e.off + 0x24) };
  return { version: b.version, models, textures };
}

// TEX0 pixel data -> RGBA (the GX tiled formats; palettes from a PLT0 at
// `palOff`: 0 IA8, 1 RGB565, 2 RGB5A3). Only the top mip level is decoded.
// Checked against wszst's PNGs of the minimap textures (CMPR, I4) and used
// for glf_tokosenFix (C4), which wszst leaves undecoded.
const rgb565 = (v) => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31, 255];
const rgb5a3 = (v) => (v & 0x8000 ? [((v >> 10) & 31) * 255 / 31, ((v >> 5) & 31) * 255 / 31, (v & 31) * 255 / 31, 255] : [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17, ((v >> 12) & 7) * 255 / 7]);
export function decodeTex0(buf, off, palOff = 0) {
  const width = buf.readUInt16BE(off + 0x1c), height = buf.readUInt16BE(off + 0x1e), format = buf.readUInt32BE(off + 0x20);
  const data = buf.subarray(off + buf.readUInt32BE(off + 0x10));
  const out = new Uint8Array(width * height * 4);
  const put = (x, y, c) => { if (x >= width || y >= height) return; const o = (y * width + x) * 4; out[o] = Math.round(c[0]); out[o + 1] = Math.round(c[1]); out[o + 2] = Math.round(c[2]); out[o + 3] = Math.round(c[3]); };
  let pal = null;
  if (palOff) {
    const pf = buf.readUInt32BE(palOff + 0x18), n = buf.readUInt16BE(palOff + 0x1c), pd = palOff + buf.readUInt32BE(palOff + 0x10);
    pal = [];
    for (let i = 0; i < n; i++) { const v = buf.readUInt16BE(pd + i * 2); pal.push(pf === 0 ? [v & 255, v & 255, v & 255, v >> 8] : pf === 1 ? rgb565(v) : rgb5a3(v)); }
  }
  const tile = (tw, th, bytes, texel) => {
    let p = 0;
    for (let ty = 0; ty < height; ty += th) for (let tx = 0; tx < width; tx += tw) { texel(tx, ty, p); p += bytes; }
  };
  if (format === 0) tile(8, 8, 32, (tx, ty, p) => { for (let i = 0; i < 64; i++) { const v = i & 1 ? data[p + (i >> 1)] & 15 : data[p + (i >> 1)] >> 4; put(tx + (i & 7), ty + (i >> 3), [v * 17, v * 17, v * 17, 255]); } });
  else if (format === 1) tile(8, 4, 32, (tx, ty, p) => { for (let i = 0; i < 32; i++) { const v = data[p + i]; put(tx + (i & 7), ty + (i >> 3), [v, v, v, 255]); } });
  else if (format === 2) tile(8, 4, 32, (tx, ty, p) => { for (let i = 0; i < 32; i++) { const v = data[p + i], l = (v & 15) * 17; put(tx + (i & 7), ty + (i >> 3), [l, l, l, (v >> 4) * 17]); } });
  else if (format === 3) tile(4, 4, 32, (tx, ty, p) => { for (let i = 0; i < 16; i++) { const l = data[p + i * 2 + 1]; put(tx + (i & 3), ty + (i >> 2), [l, l, l, data[p + i * 2]]); } });
  else if (format === 4) tile(4, 4, 32, (tx, ty, p) => { for (let i = 0; i < 16; i++) put(tx + (i & 3), ty + (i >> 2), rgb565(data.readUInt16BE(p + i * 2))); });
  else if (format === 5) tile(4, 4, 32, (tx, ty, p) => { for (let i = 0; i < 16; i++) put(tx + (i & 3), ty + (i >> 2), rgb5a3(data.readUInt16BE(p + i * 2))); });
  else if (format === 6) tile(4, 4, 64, (tx, ty, p) => { for (let i = 0; i < 16; i++) put(tx + (i & 3), ty + (i >> 2), [data[p + i * 2 + 1], data[p + 32 + i * 2], data[p + 32 + i * 2 + 1], data[p + i * 2]]); });
  else if (format === 8) tile(8, 8, 32, (tx, ty, p) => { for (let i = 0; i < 64; i++) { const v = i & 1 ? data[p + (i >> 1)] & 15 : data[p + (i >> 1)] >> 4; put(tx + (i & 7), ty + (i >> 3), pal[v]); } });
  else if (format === 9) tile(8, 4, 32, (tx, ty, p) => { for (let i = 0; i < 32; i++) put(tx + (i & 7), ty + (i >> 3), pal[data[p + i]]); });
  else if (format === 10) tile(4, 4, 32, (tx, ty, p) => { for (let i = 0; i < 16; i++) put(tx + (i & 3), ty + (i >> 2), pal[data.readUInt16BE(p + i * 2) & 0x3fff]); });
  else if (format === 14) tile(8, 8, 32, (tx, ty, p) => {
    for (let b = 0; b < 4; b++) { // four DXT1 blocks: top-left, top-right, bottom-left, bottom-right
      const q = p + b * 8, c0 = data.readUInt16BE(q), c1 = data.readUInt16BE(q + 2), a = rgb565(c0), bb = rgb565(c1);
      const cols = [a, bb, c0 > c1 ? [0, 1, 2].map((k) => (2 * a[k] + bb[k]) / 3).concat(255) : [0, 1, 2].map((k) => (a[k] + bb[k]) / 2).concat(255), c0 > c1 ? [0, 1, 2].map((k) => (a[k] + 2 * bb[k]) / 3).concat(255) : [0, 0, 0, 0]];
      for (let y = 0; y < 4; y++) { const row = data[q + 4 + y]; for (let x = 0; x < 4; x++) put(tx + (b & 1) * 4 + x, ty + (b >> 1) * 4 + y, cols[(row >> (6 - 2 * x)) & 3]); }
    }
  });
  else throw new Error(`TEX0 format ${format} not supported`);
  return { width, height, format, data: Buffer.from(out.buffer) };
}

// All textures of an archive decoded, palettes matched by name.
export function archiveTextures(buf) {
  const b = readBrres(buf);
  const pal = {};
  for (const e of b.folders["Palettes(NW4R)"] ?? []) pal[e.name] = e.off;
  const out = {};
  for (const e of b.folders["Textures(NW4R)"] ?? []) out[e.name] = decodeTex0(buf, e.off, pal[e.name] ?? 0);
  return out;
}
