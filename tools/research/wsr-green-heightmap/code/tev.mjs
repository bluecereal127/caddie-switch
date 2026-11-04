// Full GX decode of one material per model (course / map) of one WSR hole: layers (texture, palette, wrap, filters, SRT,
// effect block), texgens (XF 0x1040+, with the post-transform rows XF 0x1050+), light channels, the material's own BP state
// (TEV colour registers c0-c2 and konst k0-k3, alpha compare, blend, z), and the shader (ResTev): per stage TREF (tex map,
// coord, enable, ras channel), colour and alpha combiners with ras / tex swap tables, konst selections, indirect commands;
// the four swap tables. Prints readable formulas.  node tev.mjs <meshId> <course|map> <materialRegex> [--json]
import fs from "node:fs";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const [id, kind, re] = process.argv.slice(2);
const JSONOUT = process.argv.includes("--json");
const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
const ent = readBrres(buf).folders["3DModels(NW4R)"][0];
const m = readMdl0(buf, ent.off);
const mb = buf.subarray(ent.off);
const cstr = (b, o) => { let t = o; while (b[t]) t++; return b.toString("latin1", o, t); };
// BP / XF / CP writes of a display list: final values per register (the 0xfe mask applied)
export function bp(dl) {
  const fin = {}; let mask = 0xffffff, p = 0;
  while (p < dl.length) {
    const op = dl[p];
    if (op === 0x61) {
      const v = dl.readUInt32BE(p + 1), r = v >>> 24, val = v & 0xffffff;
      if (r === 0xfe) mask = val;
      else {
        const key = r >= 0xe0 && r <= 0xe7 ? (val & 0x800000 ? "k" : "c") + r.toString(16) : r;
        fin[key] = ((fin[key] ?? 0) & ~mask) | (val & mask);
        mask = 0xffffff;
      }
      p += 5;
    } else if (op === 0x10) { const n = dl.readUInt16BE(p + 1) + 1, addr = dl.readUInt16BE(p + 3); for (let i = 0; i < n; i++) fin["xf" + (addr + i).toString(16)] = dl.readUInt32BE(p + 5 + i * 4); p += 5 + n * 4; }
    else if (op === 0x08) { fin["cp" + dl[p + 1].toString(16)] = dl.readUInt32BE(p + 2); p += 6; }
    else if (op === 0) p++;
    else break;
  }
  return fin;
}
const CIN = ["cprev", "aprev", "c0", "a0", "c1", "a1", "c2", "a2", "texc", "texa", "rasc", "rasa", "one", "half", "konst", "zero"];
const AIN = ["aprev", "a0", "a1", "a2", "texa", "rasa", "konst", "zero"];
const KC = (v) => (v < 8 ? `${8 - v}/8` : v >= 12 && v < 16 ? "k" + (v - 12) + ".rgb" : v >= 16 ? "k" + ((v - 16) & 3) + "." + "rgba"[(v - 16) >> 2] : "?" + v);
const KA = (v) => (v < 8 ? `${8 - v}/8` : v >= 16 ? "k" + ((v - 16) & 3) + "." + "rgba"[(v - 16) >> 2] : "?" + v);
const BIAS = ["", " +0.5", " -0.5", ""], SCALE = ["", " *2", " *4", " *0.5"], DEST = ["prev", "r0", "r1", "r2"];
const RAS = { 0: "color0a0", 1: "color1a1", 5: "bump", 6: "bumpN", 7: "zero" };
const s11 = (v) => (v & 0x400 ? v - 0x800 : v);
const sec = []; for (let i = 0; i < 14; i++) sec.push(mb.readUInt32BE(0x10 + i * 4));
const g = sec[8], n = mb.readUInt32BE(g + 4);
const out = [];
for (let i = 1; i <= n; i++) {
  const off = g + mb.readUInt32BE(g + 8 + i * 16 + 12);
  const name = cstr(mb, off + mb.readUInt32BE(off + 8));
  if (!new RegExp(re).test(name)) continue;
  const mat = m.materials.find((x) => x.name === name);
  const R = { id, kind, name, index: mat.index, lines: [] };
  const L = (s) => R.lines.push(s);
  const nTexGen = mb[off + 0x14], nChan = mb[off + 0x15], nStage = mb[off + 0x16], nInd = mb[off + 0x17];
  L(`=== ${id} ${kind} ${name} (index ${mat.index}) texgens ${nTexGen} chans ${nChan} stages ${nStage} indirect ${nInd} xlu ${mat.xlu} cull ${mb.readUInt32BE(off + 0x18)} lightSet ${mb.readInt8(off + 0x1d)} fogSet ${mb.readInt8(off + 0x1e)}`);
  L(` indirect methods ${[...mb.subarray(off + 0x20, off + 0x24)].join(",")} normalMapRefs ${[...mb.subarray(off + 0x24, off + 0x28)].map((v) => (v > 127 ? v - 256 : v)).join(",")}`);
  L(` texSrt flags 0x${mb.readUInt32BE(off + 0x1a8).toString(16)} mode ${mb.readUInt32BE(off + 0x1ac)} (0 Maya, 1 XSI, 2 3dsMax)`);
  R.layers = mat.layers.map((l, k) => {
    const q = off + 0x250 + k * 0x34, mtx = Array.from({ length: 12 }, (_, j) => +mb.readFloatBE(q + 4 + j * 4).toFixed(4));
    const s = mat.srt[k];
    L(` L${k} ${l.texture}${l.palette ? " +pal " + l.palette : ""} wrap ${l.wrapS},${l.wrapT} min ${l.minFilter} mag ${l.magFilter} lodBias ${l.lodBias} | srt s(${s.scale.map((v) => +v.toFixed(4))}) r${s.rot} t(${s.trans.map((v) => +v.toFixed(4))}) | effect cam ${mb.readInt8(q)} light ${mb.readInt8(q + 1)} mapMode ${mb[q + 2]} flags ${mb[q + 3]} mtx [${mtx.join(" ")}]`);
    return { texture: l.texture, palette: l.palette, wrap: [l.wrapS, l.wrapT], srt: s, effect: { cam: mb.readInt8(q), light: mb.readInt8(q + 1), mapMode: mb[q + 2], flags: mb[q + 3], mtx } };
  });
  const dlOff = mb.readUInt32BE(off + 0x3c), dl = mb.subarray(off + dlOff, off + mb.readUInt32BE(off));
  const fin = bp(dl);
  const regs = {};
  for (let r = 0; r < 4; r++) {
    const ra = fin["c" + (0xe0 + 2 * r).toString(16)], bg = fin["c" + (0xe1 + 2 * r).toString(16)];
    if (ra !== undefined && bg !== undefined) regs[r ? "c" + (r - 1) : "cprev"] = [s11(ra & 0x7ff), s11((bg >> 12) & 0x7ff), s11(bg & 0x7ff), s11((ra >> 12) & 0x7ff)];
    const ka = fin["k" + (0xe0 + 2 * r).toString(16)], kb = fin["k" + (0xe1 + 2 * r).toString(16)];
    if (ka !== undefined && kb !== undefined) regs["k" + r] = [ka & 0xff, (kb >> 12) & 0xff, kb & 0xff, (ka >> 12) & 0xff];
  }
  R.regs = regs;
  L(" regs (R,G,B,A): " + JSON.stringify(regs));
  const ac = fin[0xf3] ?? 0, bm = fin[0x41] ?? 0, zm = fin[0x40] ?? 0;
  L(` alphaCompare ref0 ${ac & 0xff} ref1 ${(ac >> 8) & 0xff} comp0 ${(ac >> 16) & 7} comp1 ${(ac >> 19) & 7} op ${(ac >> 22) & 3} | blend en ${bm & 1} src ${(bm >> 8) & 7} dst ${(bm >> 5) & 7} sub ${(bm >> 11) & 1} | z test ${zm & 1} func ${(zm >> 1) & 7} write ${(zm >> 4) & 1}`);
  for (let t = 0; t < nTexGen; t++) {
    const v = fin["xf" + (0x1040 + t).toString(16)], pt = fin["xf" + (0x1050 + t).toString(16)];
    if (v === undefined) continue;
    L(` texgen${t}: ${(v >> 1) & 1 ? "STQ" : "ST"} in ${(v >> 2) & 1 ? "ABC1" : "AB11"} type ${(v >> 4) & 7} srcRow ${(v >> 7) & 31} (0 pos, 5+ uv0..) | dualTex row ${pt !== undefined ? pt & 0x3f : "-"} normalize ${pt !== undefined ? (pt >> 8) & 1 : "-"}`);
  }
  const ctl = (v) => `${v & 1 ? "vtx" : "reg"}${v & 2 ? " lit lights 0x" + (((v >> 2) & 15) | (((v >> 11) & 15) << 4)).toString(16) + (v & 64 ? " amb vtx" : " amb reg") + " diff" + ((v >> 7) & 3) + (v & 0x200 ? " atten" + ((v >> 10) & 1) : "") : " unlit"}`;
  for (let c = 0; c < nChan; c++) { const q = off + 0x3f0 + c * 0x14; L(` chan${c} flags 0x${mb.readUInt32BE(q).toString(16)} mat ${[...mb.subarray(q + 4, q + 8)]} amb ${[...mb.subarray(q + 8, q + 12)]} color[${ctl(mb.readUInt32BE(q + 12))}] alpha[${ctl(mb.readUInt32BE(q + 16))}]`); }
  const sOff = off + mb.readInt32BE(off + 0x28);
  const sLen = mb.readUInt32BE(sOff), sb = bp(mb.subarray(sOff + 0x20, sOff + sLen));
  L(` shader @0x${sOff.toString(16)} stages ${mb[sOff + 0x0c]} texRefs ${[...mb.subarray(sOff + 0x10, sOff + 0x18)].map((v) => (v === 0xff ? "-" : v)).join(",")}`);
  const swaps = [];
  for (let t = 0; t < 4; t++) { const a = sb[0xf6 + 2 * t] ?? 0, b = sb[0xf7 + 2 * t] ?? 0; swaps.push([a & 3, (a >> 2) & 3, b & 3, (b >> 2) & 3].map((c) => "rgba"[c]).join("")); }
  L(` swap tables: ${swaps.join(" ")}`);
  R.stages = [];
  for (let st = 0; st < nStage; st++) {
    const tref = sb[0x28 + (st >> 1)] ?? 0, sh = (st & 1) * 12;
    const tm = (tref >> sh) & 7, tc = (tref >> (sh + 3)) & 7, te = (tref >> (sh + 6)) & 1, rc = (tref >> (sh + 7)) & 7;
    const c = sb[0xc0 + 2 * st] ?? 0, a = sb[0xc1 + 2 * st] ?? 0, k = sb[0xf6 + (st >> 1)] ?? 0, ksh = (st & 1) * 10;
    const ind = sb[0x10 + st] ?? 0;
    const kc = KC((k >> (4 + ksh)) & 31), ka = KA((k >> (9 + ksh)) & 31);
    const cf = { a: CIN[(c >> 12) & 15], b: CIN[(c >> 8) & 15], c: CIN[(c >> 4) & 15], d: CIN[c & 15], bias: (c >> 16) & 3, sub: (c >> 18) & 1, clamp: (c >> 19) & 1, scale: (c >> 20) & 3, dest: (c >> 22) & 3 };
    const af = { a: AIN[(a >> 13) & 7], b: AIN[(a >> 10) & 7], c: AIN[(a >> 7) & 7], d: AIN[(a >> 4) & 7], bias: (a >> 16) & 3, sub: (a >> 18) & 1, clamp: (a >> 19) & 1, scale: (a >> 20) & 3, dest: (a >> 22) & 3, rswap: a & 3, tswap: (a >> 2) & 3 };
    const f = (x, ks) => `${DEST[x.dest]} = ${x.bias === 3 ? "COMPARE " : ""}(${x.d} ${x.sub ? "-" : "+"} lerp(${x.a}, ${x.b}; ${x.c})${BIAS[x.bias]})${SCALE[x.scale]}${x.clamp ? "" : " (no clamp)"}`.replace(/konst/g, "konst[" + ks + "]");
    L(` stage${st}: map ${te ? tm : "-"} coord ${tc} ras ${RAS[rc] ?? rc}${ind ? " ind 0x" + ind.toString(16) : ""}\n    C: ${f(cf, kc)}\n    A: ${f(af, ka)}  (swap ras ${af.rswap} tex ${af.tswap})`);
    R.stages.push({ map: te ? tm : null, coord: tc, ras: RAS[rc] ?? rc, ind, C: f(cf, kc), A: f(af, ka), rswap: af.rswap, tswap: af.tswap });
  }
  R.swaps = swaps;
  out.push(R);
}
if (JSONOUT) console.log(JSON.stringify(out.map(({ lines, ...r }) => r)));
else for (const r of out) console.log(r.lines.join("\n"));
