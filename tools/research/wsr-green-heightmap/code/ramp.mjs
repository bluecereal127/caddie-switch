// The green's contour ramp textures across the 21 holes (course and minimap archives): which ramp each M_Green layer 1 uses,
// the TEX0 header (size, format, mips), the PLT0 palette (format, entries), the C4 index per texel; per texture the rows grouped
// into bands (runs of rows with one colour, every column checked), each band's colour, luma and alpha.
//   node ramp.mjs [--rows]   (writes ramps.json: every distinct ramp by content hash with its bands and the holes using it)
import fs from "node:fs";
import crypto from "node:crypto";
import { readBrres, readMdl0, decodeTex0 } from "../../../lib/brres.mjs";
const ROOT = "C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2";
const holes = JSON.parse(fs.readFileSync(new URL("../../../mesh-holes.json", import.meta.url), "utf8"));
const ROWS = process.argv.includes("--rows");
const seen = {};
for (const [id, hole] of Object.entries(holes)) {
  if (typeof hole !== "number" || !id.startsWith("fc")) continue;
  for (const kind of ["course", "map"]) {
    const buf = fs.readFileSync(`${ROOT}/glf_course_${id}.d/G3D/glf_${kind}_${id}.brres`);
    const br = readBrres(buf);
    const m = readMdl0(buf, br.folders["3DModels(NW4R)"][0].off);
    const mat = m.materials.find((x) => x.name === "M_Green");
    const L = mat.layers[1];
    const tex = (br.folders["Textures(NW4R)"] ?? []).find((e) => e.name === L.texture);
    const pal = (br.folders["Palettes(NW4R)"] ?? []).find((e) => e.name === (L.palette ?? L.texture));
    const hdr = { w: buf.readUInt16BE(tex.off + 0x1c), h: buf.readUInt16BE(tex.off + 0x1e), fmt: buf.readUInt32BE(tex.off + 0x20), mips: buf.readUInt32BE(tex.off + 0x24), minLod: buf.readFloatBE(tex.off + 0x28), maxLod: buf.readFloatBE(tex.off + 0x2c) };
    const pf = pal ? buf.readUInt32BE(pal.off + 0x18) : null, pn = pal ? buf.readUInt16BE(pal.off + 0x1c) : 0;
    const pd = pal ? pal.off + buf.readUInt32BE(pal.off + 0x10) : 0;
    const palRaw = pal ? Array.from({ length: pn }, (_, i) => buf.readUInt16BE(pd + i * 2)) : [];
    const img = decodeTex0(buf, tex.off, pal ? pal.off : 0);
    // C4 indices (format 8): 8x8 tiles, 4 bits per texel
    const data = buf.subarray(tex.off + buf.readUInt32BE(tex.off + 0x10));
    const idx = new Uint8Array(hdr.w * hdr.h);
    if (hdr.fmt === 8) { let p = 0; for (let ty = 0; ty < hdr.h; ty += 8) for (let tx = 0; tx < hdr.w; tx += 8) { for (let i = 0; i < 64; i++) { const v = i & 1 ? data[p + (i >> 1)] & 15 : data[p + (i >> 1)] >> 4; const x = tx + (i & 7), y = ty + (i >> 3); if (x < hdr.w && y < hdr.h) idx[y * hdr.w + x] = v; } p += 32; } }
    const hash = crypto.createHash("sha1").update(img.data).digest("hex").slice(0, 8);
    const key = `${L.texture}:${hash}`;
    if (!seen[key]) {
      // rows: colour of each row (all columns equal?), bands = runs
      const rows = [];
      let colsEqual = true;
      for (let y = 0; y < hdr.h; y++) {
        const o = y * hdr.w * 4, c0 = [...img.data.subarray(o, o + 4)];
        for (let x = 1; x < hdr.w; x++) for (let k = 0; k < 4; k++) if (img.data[o + x * 4 + k] !== c0[k]) colsEqual = false;
        rows.push({ y, c: c0, i: idx[y * hdr.w] });
      }
      const bands = [];
      for (const r of rows) {
        const last = bands[bands.length - 1];
        if (last && last.c.join() === r.c.join()) last.y1 = r.y; else bands.push({ y0: r.y, y1: r.y, c: r.c, i: r.i });
      }
      for (const b of bands) { b.rows = b.y1 - b.y0 + 1; b.v = [+(b.y0 / hdr.h).toFixed(4), +((b.y1 + 1) / hdr.h).toFixed(4)]; b.luma = +(0.299 * b.c[0] + 0.587 * b.c[1] + 0.114 * b.c[2]).toFixed(1); }
      seen[key] = { texture: L.texture, palette: L.palette, hash, hdr, palFmt: pf, palN: pn, palRaw: palRaw.map((v) => v.toString(16).padStart(4, "0")), colsEqual, bands, rows: ROWS ? rows : undefined, users: [] };
    }
    seen[key].users.push(`${kind}:H${hole}`);
  }
}
fs.writeFileSync("ramps.json", JSON.stringify(seen, null, 1));
for (const r of Object.values(seen)) {
  console.log(`${r.texture} [${r.hash}] ${r.hdr.w}x${r.hdr.h} fmt ${r.hdr.fmt} mips ${r.hdr.mips} lod ${r.hdr.minLod}-${r.hdr.maxLod} palette fmt ${r.palFmt} (0 IA8, 1 RGB565, 2 RGB5A3) n ${r.palN} cols-equal ${r.colsEqual}`);
  console.log(`  used by ${r.users.join(" ")}`);
  console.log(`  palette ${r.palRaw.join(" ")}`);
  for (const b of r.bands) console.log(`  rows ${String(b.y0).padStart(3)}-${String(b.y1).padStart(3)} (${String(b.rows).padStart(2)}) v ${b.v[0].toFixed(4)}-${b.v[1].toFixed(4)} idx ${b.i} rgba ${b.c.join(",")} luma ${b.luma}`);
}
