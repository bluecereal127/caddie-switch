// Diff a RAM dump of a BRRES against another (the disk file, or an earlier dump): changed byte runs, each named by
// the BRRES entry and, inside the MDL0, the section entry (material / shader / object / array) and the offset in it.
//   node diff.mjs <a.bin> <b.bin> [--min 1]
import fs from "node:fs";
import { readBrres } from "../../../lib/brres.mjs";
const [fa, fb] = process.argv.slice(2);
const A = fs.readFileSync(fa), B = fs.readFileSync(fb);
const br = readBrres(A);
const cstr = (b, o) => { let t = o; while (b[t]) t++; return b.toString("latin1", o, t); };
const spans = [];
for (const [folder, ents] of Object.entries(br.folders)) for (const e of ents) {
  const size = A.readUInt32BE(e.off + 4);
  spans.push({ name: `${folder.replace("(NW4R)", "")}/${e.name}`, lo: e.off, hi: e.off + size });
  if (A.toString("latin1", e.off, e.off + 4) === "MDL0") {
    const m = A.subarray(e.off);
    const SEC = ["defs", "bones", "verts", "nrms", "cols", "uvs", "furVec", "furPos", "mats", "shaders", "objs", "texLinks", "palLinks", "users"];
    for (let s = 0; s < 14; s++) {
      const g = m.readUInt32BE(0x10 + s * 4);
      if (!g) continue;
      const n = m.readUInt32BE(g + 4);
      for (let i = 1; i <= n; i++) {
        const ent = g + 8 + i * 16, off = g + m.readUInt32BE(ent + 12), name = cstr(m, g + m.readUInt32BE(ent + 8));
        let size = 0;
        if (["mats", "shaders", "objs"].includes(SEC[s])) size = m.readUInt32BE(off);
        else if (["verts", "nrms", "cols", "uvs"].includes(SEC[s])) size = m.readUInt32BE(off);
        else if (SEC[s] === "bones") size = m.readUInt32BE(off);
        if (size > 0 && size < 0x1000000) spans.push({ name: `  MDL0.${SEC[s]}/${name}`, lo: e.off + off, hi: e.off + off + size, inner: true });
      }
    }
  }
}
const who = (o) => {
  const inner = spans.filter((s) => s.inner && o >= s.lo && o < s.hi);
  const outer = spans.filter((s) => !s.inner && o >= s.lo && o < s.hi);
  const s = inner[0] ?? outer[0];
  return s ? `${s.name.trim()} +0x${(o - s.lo).toString(16)}` : "(header/strings)";
};
const runs = [];
for (let i = 0; i < A.length; i++) {
  if (A[i] === B[i]) continue;
  let j = i; while (j < A.length && (A[j] !== B[j] || (j + 4 < A.length && A.subarray(j, j + 4).some((v, k) => v !== B[j + k])))) j++;
  runs.push([i, j]); i = j;
}
let total = 0;
for (const [i, j] of runs) {
  total += j - i;
  console.log(`0x${i.toString(16).padStart(6, "0")} +${j - i}  ${who(i)}  ${A.subarray(i, Math.min(j, i + 16)).toString("hex")} -> ${B.subarray(i, Math.min(j, i + 16)).toString("hex")}`);
}
console.log(`${runs.length} runs, ${total} bytes of ${A.length}`);
