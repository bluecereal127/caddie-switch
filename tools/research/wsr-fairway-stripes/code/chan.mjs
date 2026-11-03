// The material's light channels (MDL0 v11: 0x3f0, 2 x { flags, matColor, ambColor, colorCtrl, alphaCtrl }), decoded as GX channel control.
import fs from "node:fs";
import { readBrres } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const [id, kind, re] = process.argv.slice(2);
const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
const e = readBrres(buf).folders["3DModels(NW4R)"][0];
const mb = buf.subarray(e.off);
console.log("mdl0 version", mb.readUInt32BE(8));
const sec = []; for (let i = 0; i < 14; i++) sec.push(mb.readUInt32BE(0x10 + i * 4));
const g = sec[8], n = mb.readUInt32BE(g + 4);
const cstr = (b, o) => { let t = o; while (b[t]) t++; return b.toString("latin1", o, t); };
const ctl = (v) => ({ raw: "0x" + v.toString(16), matSrc: v & 1 ? "vertex" : "register", lighting: !!(v & 2), lights: ((v >> 2) & 15) | (((v >> 11) & 15) << 4), ambSrc: v & 64 ? "vertex" : "register", diffFn: (v >> 7) & 3, atten: !!(v & 0x200) });
for (let i = 1; i <= n; i++) {
  const off = g + mb.readUInt32BE(g + 8 + i * 16 + 12);
  const name = cstr(mb, off + mb.readUInt32BE(off + 8));
  if (!new RegExp(re).test(name)) continue;
  console.log(name, "lightChans", mb[off + 0x15], "lightSet", mb.readInt8(off + 0x1d), "fogSet", mb.readInt8(off + 0x1e));
  for (let c = 0; c < 2; c++) {
    const q = off + 0x3f0 + c * 0x14;
    const f = mb.readUInt32BE(q), mc = [...mb.subarray(q + 4, q + 8)], ac = [...mb.subarray(q + 8, q + 12)];
    console.log(` chan${c} flags 0x${f.toString(16)} mat ${mc} amb ${ac} color`, JSON.stringify(ctl(mb.readUInt32BE(q + 12))), "alpha", JSON.stringify(ctl(mb.readUInt32BE(q + 16))));
  }
}
