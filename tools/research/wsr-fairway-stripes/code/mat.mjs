// Dump a material in full (layers, texgen, SRT, effect blocks, TEV stages, konst/regs) for one hole's course and map models.
import fs from "node:fs";
import { readBrres, readMdl0 } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const [id, kind, re] = process.argv.slice(2);
const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
const br = readBrres(buf);
const e = br.folders["3DModels(NW4R)"][0];
const m = readMdl0(buf, e.off);
const mb = buf.subarray(e.off);
const sec = []; for (let i = 0; i < 14; i++) sec.push(mb.readUInt32BE(0x10 + i * 4));
const g = sec[8], n = mb.readUInt32BE(g + 4);
const cstr = (b, o) => { let t = o; while (b[t]) t++; return b.toString("latin1", o, t); };
for (let i = 1; i <= n; i++) {
  const off = g + mb.readUInt32BE(g + 8 + i * 16 + 12);
  const name = cstr(mb, off + mb.readUInt32BE(off + 8));
  if (!new RegExp(re).test(name)) continue;
  const mat = m.materials.find((x) => x.name === name);
  const eff = mat.layers.map((l, k) => { const q = off + 0x250 + k * 0x34; return { cam: mb.readInt8(q), light: mb.readInt8(q + 1), mapMode: mb[q + 2], flags: mb[q + 3], mtx: Array.from({ length: 12 }, (_, j) => +mb.readFloatBE(q + 4 + j * 4).toFixed(5)).join(" ") }; });
  const { dl, shader, shaderOff, ...rest } = mat;
  console.log(JSON.stringify({ ...rest, srtFlags: mb.readUInt32BE(off + 0x1a8).toString(16), effect: eff, shader }, null, 1));
  const draws = [...m.draw.opa.map((d) => ({ ...d, l: "opa" })), ...m.draw.xlu.map((d) => ({ ...d, l: "xlu" }))].filter((d) => d.mat === mat.index);
  console.log("draws:", draws.map((d) => `${m.objects[d.obj].name}(${d.l},prio ${d.prio}) attrs ${m.objects[d.obj].attrs.join(",")} uv ${m.objects[d.obj].arrays.uv.join(",")}`).join("\n  "));
}
