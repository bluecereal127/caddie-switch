// load a hole's tee save, find its course + map BRRES in RAM, and run the texture edits: course line white / black, map line dim / bright
const hole = globalThis.__HOLE__, id = globalThis.__ID__, tag = globalThis.__TAG__;
const ROOT = `C:/Users/Stephen/Downloads/WSR_Extract/DATA/files/Stage/Shared2/glf_course_${id}.d/G3D/`;
if (globalThis.__SAVE__) { const idx = JSON.parse(fs.readFileSync(path.join(D.STATE, "saves", "index.json"), "utf8")); await s.load(globalThis.__SAVE__, { pos: idx[hole].tee, life: 0 }); await sleep(3000); }
const { readBrres } = await import("file:///" + path.resolve(HERE, "../../../lib/brres.mjs").split(path.sep).join("/"));
H.brres = {};
const tex = {};
for (const kind of ["course", "map"]) {
  const disk = fs.readFileSync(ROOT + `glf_${kind}_${id}.brres`);
  const hits = await H.find(disk.subarray(0, 0x40), 0x90000000, 0x94000000);
  H.brres[kind] = { hits, size: disk.length };
  for (const e of readBrres(disk).folders["Textures(NW4R)"]) if (/line1$|Line1$/.test(e.name)) tex[kind] = hits[0] + e.off + disk.readUInt32BE(e.off + 0x10);
}
await H.dump(`${tag}-tee`);
const LINE = tex.course, MLINE = tex.map;
const orig = await H.read(LINE, 256), morig = await H.read(MLINE, 256);
const r = { brres: Object.fromEntries(Object.entries(H.brres).map(([k, v]) => [k, v.hits.map(H.hex)])), LINE: H.hex(LINE), MLINE: H.hex(MLINE), origOk: [orig.subarray(0, 4).toString("hex"), morig.subarray(0, 4).toString("hex")] };
r.n = await H.snap(`${tag}-x-normal`);
await H.write(LINE, Buffer.alloc(256, 0xff)); await sleep(500); await H.snap(`${tag}-x-white`);
await H.write(LINE, Buffer.alloc(256, 0x00)); await sleep(500); await H.snap(`${tag}-x-black`);
await H.write(LINE, orig); await sleep(500); await H.snap(`${tag}-x-map-restored0`);
await H.write(MLINE, Buffer.alloc(256, 0x44)); await sleep(500); await H.snap(`${tag}-x-map-dim`);
await H.write(MLINE, Buffer.alloc(256, 0xff)); await sleep(500); await H.snap(`${tag}-x-map-bright`);
await H.write(MLINE, morig); await sleep(500); await H.snap(`${tag}-x-map-restored`);
r.check = [(await H.read(LINE, 256)).equals(orig), (await H.read(MLINE, 256)).equals(morig)];
r.state = await H.state();
return r;
