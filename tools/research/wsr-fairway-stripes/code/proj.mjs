// The M_Fairway projection layers' effect matrices (layers 3, 4: block 0x250 + k*0x34) in each RAM dump; the world point each maps
// to the texture centre (s, t) = (0.5, 0.5) on the ground plane y = y0, and the world size of one texture repeat.
import fs from "node:fs";
const MAT = 0x92be4d80 - 0x92be2f20; // hole 1 (fcJP11): M_Fairway's offset in the course BRRES (the RAM dumps start at the BRRES)
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const row = [];
  for (const k of [3, 4]) {
    const q = MAT + 0x250 + k * 0x34;
    const hdr = b.subarray(q, q + 4).toString("hex");
    const M = []; for (let j = 0; j < 12; j++) M.push(b.readFloatBE(q + 4 + j * 4));
    // s = M0 x + M1 y + M2 z + M3, t = M4.., q = M8..; solve s/q = t/q = 0.5 at y = 0 -> 2 linear eqs in x, z
    const y = 0;
    const a = [[M[0] - 0.5 * M[8], M[2] - 0.5 * M[10]], [M[4] - 0.5 * M[8], M[6] - 0.5 * M[10]]];
    const c = [-(M[1] * y + M[3] - 0.5 * (M[9] * y + M[11])), -(M[5] * y + M[7] - 0.5 * (M[9] * y + M[11]))];
    const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    const x = (c[0] * a[1][1] - a[0][1] * c[1]) / det, z = (a[0][0] * c[1] - c[0] * a[1][0]) / det;
    row.push(`L${k} ${hdr} M=[${M.map((v) => +v.toPrecision(4)).join(" ")}] centre@y0 (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  console.log(f.split(/[\/]/).pop(), "\n  " + row.join("\n  "));
}
