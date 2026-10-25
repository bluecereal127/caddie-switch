// NSS's (Nintendo Switch Sports') golf ball physics, exported from the git-ignored
// eden dump into the committed files the engine (src/nsssim.js) and its test use:
//
//   node tools/nss-physics-export.mjs [--src tools/harness/state/eden/nss-golf-x] [--keep]
//
//   tools/nss-physics.json         every constant src/nsssim.js uses: the tick, the air
//                                  (gravity, drag, lift, the hop decay, side spin, wind),
//                                  the ground (the roll switch, friction and its ratio
//                                  curve, the green's gravity, stop-gravity, AddGravityHole,
//                                  the stop rules), the backspin (reflection factor, the
//                                  pull-back and its angle curve), the 22 ball attributes
//                                  (ReflectionH / V, Friction, BackSpinResist and its decay
//                                  per tick, pass-through), the collision code -> attribute
//                                  map, the eight clubs (loft, carry, hop, lie ratios), the
//                                  whole launch table (GolfShotVelTable, Power1..150 per
//                                  club) and the cup's shape (the 126 NSS cups of the
//                                  collision dump, measured).
//   tools/fixtures/nss-flights/    the 71 strokes recorded in Eden's RAM (flights/raw/*.npz,
//                                  flights.md), compact: per stroke the launch state exactly
//                                  (the shot record's start and velocity, float32 bits), the
//                                  wind, the active cup, the airborne samples before the first
//                                  contact (every 16 ticks), the path (every 48), the contacts
//                                  (each new contact record of a shot: tick, surfaces, normal,
//                                  incoming velocity), the rest; and the triangles of NSS's
//                                  collision the ball came near (within MARGIN_M of the path
//                                  from the first contact on, the active cup open), so the
//                                  test replays the ground phase without the dump (to the
//                                  same bits as over the dump's whole collision).
//   src/nsssim.js                  the block between "// <nss-physics>" and
//                                  "// </nss-physics>" = tools/nss-physics.json as a literal.
//
// Inputs (the dump, read-only, under --src): ball/GolfBall.pack.d/Parameter/
// GolfBallMoveParam/Default.elsa__parameter__GolfBallMoveParam.bgyml and ball/
// GolfPlayer.pack.d/Parameter/GolfPlayerClubParam/GolfPlayer.elsa__parameter__
// GolfPlayerClubParam.bgyml (the RomFS's Pack/Actor/GolfBall.pack.zs and GolfPlayer.pack.zs,
// as the decoder extracted them: Node 22.14 has no zstd), physics.json (the code defaults the
// file leaves to the class: physics.md section 7), GolfShotVelTable.json (the launch table,
// read from Eden's RAM), flights/index.json + flights/raw/*.npz (the recordings),
// verify/flights/verdicts.json + launch.json (the verifiers' corrections and end-to-end air
// fits) and collision/ (through tools/lib/nsscol.mjs); the committed tools/nss-pins.json for
// the cups. Deterministic: fixed key order, fixed decimals (float32 values as the shortest
// decimal that reads back to the same float32), so two runs are byte-identical.
// Exits 1 when an input is missing, unless --keep (then the committed outputs stay as they are).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { loadCollision } from "./lib/nsscol.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const opt = { src: join(ROOT, "tools/harness/state/eden/nss-golf-x"), keep: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--src") opt.src = resolve(argv[++i]);
  else if (argv[i] === "--keep") opt.keep = true;
  else { console.error(`unknown argument ${argv[i]}`); process.exit(1); }
}
const OUT_PHYS = join(ROOT, "tools/nss-physics.json");
const OUT_FIX = join(ROOT, "tools/fixtures/nss-flights");
const SIM = join(ROOT, "src/nsssim.js");
const IN = {
  move: "ball/GolfBall.pack.d/Parameter/GolfBallMoveParam/Default.elsa__parameter__GolfBallMoveParam.bgyml",
  club: "ball/GolfPlayer.pack.d/Parameter/GolfPlayerClubParam/GolfPlayer.elsa__parameter__GolfPlayerClubParam.bgyml",
  physics: "physics.json",
  vel: "GolfShotVelTable.json",
  flights: "flights/index.json",
  raw: "flights/raw",
  verdicts: "verify/flights/verdicts.json",
  e2e: "verify/flights/launch.json",
  collision: "collision/h01.json",
};
const missing = Object.entries(IN).filter(([, f]) => !existsSync(join(opt.src, f))).map(([, f]) => f);
if (!existsSync(join(ROOT, "tools/nss-pins.json"))) missing.push("tools/nss-pins.json (the repo's, from tools/nss-export.mjs)");
if (missing.length) {
  if (opt.keep && existsSync(OUT_PHYS) && existsSync(join(OUT_FIX, "index.json"))) {
    console.log(`nss-physics-export: inputs missing under ${opt.src} (${missing.join(", ")}); --keep: the committed tools/nss-physics.json and tools/fixtures/nss-flights stay`);
    process.exit(0);
  }
  console.error(`nss-physics-export: missing ${missing.join(", ")} under ${opt.src}: the export runs on the dump machine (--src <the eden nss-golf-x dir>; --keep to keep the committed outputs)`);
  process.exit(1);
}

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const readBuf = (f) => readFileSync(join(opt.src, f));
const readJson = (f) => JSON.parse(readBuf(f).toString("utf8"));
const fails = [];
const refuse = (m) => fails.push(m);

// ------------------------------------------------------------------ BYML (v2-v7)

function readByml(buf) {
  const m = buf.toString("latin1", 0, 2);
  const le = m === "YB";
  if (!le && m !== "BY") throw new Error("not BYML");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const u24 = (o) => (le ? buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) : (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2]);
  const keysOff = u32(4), strsOff = u32(8), rootOff = u32(12);
  if (u16(2) < 2 || u16(2) > 7) throw new Error(`BYML version ${u16(2)}`);
  const strtab = (off) => {
    if (!off) return [];
    if (buf[off] !== 0xc2) throw new Error("BYML: no string table");
    const n = u24(off + 1), out = [];
    for (let i = 0; i < n; i++) { const s = off + u32(off + 4 + 4 * i); out.push(buf.toString("utf8", s, buf.indexOf(0, s))); }
    return out;
  };
  const keys = strtab(keysOff), strs = strtab(strsOff);
  const f32 = (raw) => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, raw); return d.getFloat32(0); };
  const value = (t, raw) => {
    switch (t) {
      case 0xa0: return strs[raw];
      case 0xd0: return !!raw;
      case 0xd1: return raw | 0;
      case 0xd2: return f32(raw);
      case 0xd3: return raw >>> 0;
      case 0xd6: return dv.getFloat64(raw, le);
      case 0xff: return null;
      case 0xc0: case 0xc1: return node(raw);
      default: throw new Error(`BYML type 0x${t.toString(16)}`);
    }
  };
  const node = (off) => {
    const t = buf[off];
    if (t === 0xc0) {
      const n = u24(off + 1), vals = off + 4 + ((n + 3) & ~3), out = [];
      for (let i = 0; i < n; i++) out.push(value(buf[off + 4 + i], u32(vals + 4 * i)));
      return out;
    }
    if (t === 0xc1) {
      const n = u24(off + 1), out = {};
      for (let i = 0; i < n; i++) { const e = off + 4 + 8 * i; out[keys[u24(e)]] = value(buf[e + 3], u32(e + 4)); }
      return out;
    }
    throw new Error(`BYML node 0x${t.toString(16)}`);
  };
  return node(rootOff);
}

// ------------------------------------------------------------------ npz (zip of .npy)

function readNpz(buf, want = null) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("npz: no end of central directory");
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("npz: bad central entry");
    const method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    let lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    // zip64 extra: the 8-byte values for the fields set to 0xffffffff, in order
    for (let e = p + 46 + nlen; e < p + 46 + nlen + xlen;) {
      const id = buf.readUInt16LE(e), sz = buf.readUInt16LE(e + 2);
      if (id === 1) {
        let q = e + 4;
        if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (lho === 0xffffffff) { lho = Number(buf.readBigUInt64LE(q)); q += 8; }
      }
      e += 4 + sz;
    }
    const key = name.replace(/\.npy$/, "");
    if (want && !want.has(key)) { p += 46 + nlen + xlen + clen; continue; }
    const d0 = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(d0, d0 + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data || data.length !== usize) throw new Error(`npz: ${name}: method ${method}`);
    out[key] = parseNpy(data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
function parseNpy(b) {
  if (b.toString("latin1", 1, 6) !== "NUMPY") throw new Error("npy magic");
  const major = b[6];
  const hl = major === 1 ? b.readUInt16LE(8) : b.readUInt32LE(8);
  const h0 = major === 1 ? 10 : 12;
  const header = b.toString("latin1", h0, h0 + hl);
  const descr = /'descr':\s*'([^']+)'/.exec(header)[1];
  const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (/'fortran_order':\s*True/.test(header)) throw new Error("npy: fortran order");
  const data = b.subarray(h0 + hl);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
  let arr;
  if (descr === "<f8") arr = new Float64Array(ab);
  else if (descr === "|u1") arr = new Uint8Array(ab);
  else if (descr === "<i8") arr = Array.from(new BigInt64Array(ab), Number);
  else if (/^<U\d+$/.test(descr)) {
    const s = []; for (let i = 0; i + 4 <= data.length; i += 4) { const c = data.readUInt32LE(i); if (!c) break; s.push(String.fromCodePoint(c)); }
    arr = s.join("");
  } else throw new Error(`npy dtype ${descr}`);
  return { shape, data: arr };
}

// one recording (flights/raw/<tag>.npz) -> per sample the fields the export needs
function loadRecording(path) {
  const z = readNpz(readFileSync(path), new Set(["blk", "a_off", "a_len", "m_off", "wind"]));
  const aOff = z.a_off.data[0], aLen = z.a_len.data[0], mOff = z.m_off.data[0];
  if (aOff !== 0x3ac80 || mOff !== 0x3f940) throw new Error(`${path}: block offsets ${aOff.toString(16)} ${mOff.toString(16)}`);
  const [n, w] = z.blk.shape;
  const blk = z.blk.data;
  const mlen = w - aLen;
  const dv = new DataView(blk.buffer, blk.byteOffset, blk.byteLength);
  const fA = (i, off) => dv.getFloat32(i * w + (off - aOff), true);
  const fM = (i, off) => (off + 4 <= mlen ? dv.getFloat32(i * w + aLen + off, true) : NaN);
  const iM = (i, off) => (off + 4 <= mlen ? dv.getInt32(i * w + aLen + off, true) : -999);
  const v3A = (i, off) => [fA(i, off), fA(i, off + 4), fA(i, off + 8)];
  const v3M = (i, off) => [fM(i, off), fM(i, off + 4), fM(i, off + 8)];
  const S = [];
  for (let i = 0; i < n; i++) {
    const v = v3A(i, 0x3acf0), vc = v3M(i, 0x28);
    const frame = fM(i, 0x50), tick = frame * 4;
    S.push({
      pos: v3A(i, 0x3aca0), u: v3A(i, 0x3ace4), v,
      mode: iM(i, 0x24), hop: fM(i, 0x34), side: fM(i, 0x38), bs: fM(i, 0x3c), P: v3M(i, 0x40), yRef: fM(i, 0xc),
      tick, n: v3M(i, 0x78), vin: v3M(i, 0x90), vn: fM(i, 0x9c), a0: fM(i, 0xa0),
      a4: iM(i, 0xa4), a8: iM(i, 0xa8), ac: iM(i, 0xac), phase: iM(i, 0xb4), tsc: fM(i, 0xb8), stopf: fM(i, 0x58),
      sCurve: fM(i, 0x3ac), sStart: v3M(i, 0x3b0), sV: v3M(i, 0x3bc), sPower: fM(i, 0x3c8), sBack: fM(i, 0x3dc), sClub: iM(i, 0x3e0),
      ok: Math.abs(vc[0] - v[0]) < 1e-6 && Math.abs(vc[1] - v[1]) < 1e-6 && Math.abs(vc[2] - v[2]) < 1e-6 && Math.abs(tick - Math.round(tick)) < 1e-3,
    });
  }
  return { n, mlen, S, wind: z.wind ? JSON.parse(z.wind.data) : null };
}

// ------------------------------------------------------------------ number formatting

// a float32 as the shortest decimal that reads back to the same float32
function f32s(x) {
  if (!Number.isFinite(x)) throw new Error(`not finite: ${x}`);
  const f = Math.fround(x);
  if (f === 0) return 0;
  for (let p = 1; p <= 9; p++) { const s = +f.toPrecision(p); if (Math.fround(s) === f) return s; }
  return f;
}
const fx = (x, d) => { const v = +x.toFixed(d); return Object.is(v, -0) ? 0 : v; };

// ------------------------------------------------------------------ physics

const MOVE = readByml(readBuf(IN.move));
const CLUBP = readByml(readBuf(IN.club));
const PHJ = readJson(IN.physics);
const VEL = readJson(IN.vel);
const CODE_DEF = PHJ.constants_code_defaults_used_when_the_file_omits_them;
const req = (o, k, what) => { if (o[k] == null) refuse(`${what}: no ${k}`); return o[k]; };
const mv = (k) => req(MOVE, k, "GolfBallMoveParam");
const cd = (k) => req(CODE_DEF, k, "physics.json code defaults");
const curve = (c, what) => {
  if (!c || !Array.isArray(c.Data)) { refuse(`${what}: not a curve`); return null; }
  const w = c.Type === "Hermit2D" ? 3 : c.Type === "Linear2D" ? 2 : 0;
  if (!w || c.Data.length % w) { refuse(`${what}: curve type ${c.Type}`); return null; }
  const points = [];
  for (let i = 0; i < c.Data.length; i += w) points.push(c.Data.slice(i, i + w).map(f32s));
  return { type: c.Type, maxX: f32s(c.MaxX), points };
};

// the ball's attribute ids (0xd40644's jump table of 22 cases) and the collision
// codes: in their sorted order the 21 codes the collision legends use or the
// exporter defines are the attributes 1..21 (every recorded contact agrees: 5
// Fairway 1, 6 Rough 2, 7 Bunker 3, 8 water 4, 10 OB 5, 18 Green 6, 24 Color 7,
// 25 Leaf 8, 30 Cupside 9, 31 Cup 10, 32 Rock 11, 36 SandOB 14, 38 the flag 16,
// 42 Pin 19, 43 PalmLeaf 20; 34 Glass 12, 35 Tee 13 and 39 AirOB 17 follow by
// the order, not seen in a recording)
const ATTRS = ["Default", "Fairway", "Rough", "Bunker", "Water", "OB", "Green", "Color", "Leaf", "Cupside", "Cup", "Rock", "Glass", "Tee", "SandOB", "Tree", "Flag", "AirOB", "Object", "Pin", "PalmLeaf", "Barrier"];
const CODES = [5, 6, 7, 8, 10, 18, 24, 25, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44];
// 0xd39094..0xd390b8: the mask 0x130110
const PASS_ATTRS = [4, 8, 16, 17, 20];
// the per-tick decays the game's approximate pow gives (0xd3e160..: a 256-entry log2
// table with linear interpolation), as read in RAM: HopSpinResist 0.9985 -> ball+0xe0 =
// 0x3f7fe7ec (every recorded hop matches repeated float32 multiplication by it);
// BackSpinResist 0.95 -> 0.98745035 a tick (the pull-back on the green, verdicts.json
// backspin_pullback). Others fall back to R^(1/4), marked.
const TICK_DECAY = { 0.9984999895095825: { v: new Float32Array(new Uint32Array([0x3f7fe7ec]).buffer)[0], from: "RAM ball+0xe0 (0x3f7fe7ec)" }, 0.949999988079071: { v: 0.98745035, from: "RAM, the pull-back's decay on the green (verdicts.json)" } };
const decayTick = (R) => (R == null ? { v: 1, from: "no BackSpinResist: no decay (assumed)" } : TICK_DECAY[R] ?? { v: Math.pow(R, 0.25), from: "R^(1/4) (the game's approximate pow not measured for this R)" });

const attrs = {};
for (let a = 0; a < ATTRS.length; a++) {
  const own = MOVE["Attr" + ATTRS[a]];
  const def = MOVE.AttrDefault;
  // 0xd40644: 12, 13, 16 and 17 have no case of their own and read AttrDefault; a field
  // an Attr* block leaves out reads AttrDefault's (assumed: the class default is not decoded)
  const src = own ?? def;
  const pick = (k) => (src[k] != null ? src[k] : def[k] != null ? def[k] : 0);
  const bsr = src.BackSpinResist ?? null;
  const d = decayTick(bsr);
  attrs[a] = {
    name: ATTRS[a], code: a === 0 ? null : CODES[a - 1], block: own ? "Attr" + ATTRS[a] : "AttrDefault",
    reflectionH: f32s(pick("ReflectionH")), reflectionV: f32s(pick("ReflectionV")), friction: f32s(pick("Friction")),
    backSpinResist: bsr == null ? null : f32s(bsr), backSpinDecayTick: d.v, backSpinDecayFrom: d.from,
    pass: PASS_ATTRS.includes(a),
  };
}
const codes = {};
CODES.forEach((c, i) => { codes[c] = i + 1; });

// the clubs: GolfPlayerClubParam's <club>Param, the class defaults (GolfClubParam visitor
// 0x1186e98) where the file is silent
const CLUB_NAMES = ["WD1", "WD3", "IR3", "IR5", "IR7", "IR9", "SW", "PT"];
const APP = { WD1: "driver", WD3: "spoon", IR3: "3iron", IR5: "5iron", IR7: "7iron", IR9: "9iron", SW: "wedge", PT: "putter" };
const CDEF = PHJ.club_code_defaults;
const clubs = {};
CLUB_NAMES.forEach((c, i) => {
  const p = CLUBP[c + "Param"];
  if (!p) { refuse(`GolfPlayerClubParam: no ${c}Param`); return; }
  const g = (k) => f32s(p[k] ?? CDEF[k]);
  clubs[c] = {
    index: i, app: APP[c],
    carryMaxYard: g("CarryMaxYard"), loftDeg: g("LoftDeg"), hopSpinRatio: g("HopSpinRatio"), sideSpinRatio: g("SideSpinRatio"), backSpinRatio: g("BackSpinRatio"),
    roughRatio: g("RoughRatio"), bunkerRatio: g("BunkerRatio"), powerMin: g("PowerMin"),
    roughDiffDeg: g("RoughDiffDeg"), bunkerDiffDeg: g("BunkerDiffDeg"),
    roughCurveMax: f32s(p.RoughCurveMax ?? CDEF.RoughCurveMax), bunkerCurveMax: f32s(p.BunkerCurveMax ?? CDEF.DefaultCurveMax),
  };
});
// the launch table: Power1..Power150 per club, m/s (float32 as RAM held them)
const launchTable = {};
for (const c of CLUB_NAMES) {
  const row = VEL.table?.[c];
  if (!row) { refuse(`GolfShotVelTable.json: no ${c}`); continue; }
  const arr = [];
  for (let p = 1; p <= 150; p++) { const v = row["Power" + p]; if (!(v > 0)) refuse(`GolfShotVelTable ${c} Power${p}: ${v}`); arr.push(f32s(v)); }
  for (let p = 1; p < 150; p++) if (!(arr[p] >= arr[p - 1])) refuse(`GolfShotVelTable ${c}: not rising at Power${p + 1}`);
  launchTable[c] = arr;
}

// the cup: every NSS cup's Cupside / Cup triangles around its bone, from the collision
// (verify/coll/cupwall.json measured the same): rings of radius and height
const NSSP = JSON.parse(readFileSync(join(ROOT, "tools/nss-pins.json"), "utf8"));
const cupStats = { rim: [], rimY: [], wallTop: [], wallR: [], bottomR: [], bottomY: [], cups: 0 };
const collisions = {};
const col = (h) => (collisions[h] ??= loadCollision(join(opt.src, "collision"), h, { covers: true, extras: ["leaf", "water"] }));
for (let h = 1; h <= 21; h++) {
  const m = col(h);
  const cups = NSSP.holes[h]?.cups ?? [];
  for (const c of cups) {
    const [bx, by, bz] = c.world;
    const pts = new Map();
    for (let t = 0; t < m.nt; t++) {
      const code = m.surface[t];
      if (code !== 30 && code !== 31) continue;
      for (let j = 0; j < 3; j++) {
        const vi = m.tris[t * 3 + j], x = m.verts[vi * 3], y = m.verts[vi * 3 + 1], z = m.verts[vi * 3 + 2];
        const r = Math.hypot(x - bx, z - bz);
        if (r > 0.3 || Math.abs(y - by) > 0.5) continue;
        const q = pts.get(vi) ?? { r, y: y - by, codes: new Set() };
        q.codes.add(code); pts.set(vi, q);
      }
    }
    if (pts.size < 20) { refuse(`H${h} c${c.k}: ${pts.size} cup vertices near the bone`); continue; }
    const P = [...pts.values()];
    // three rings: the rim (Cupside, r ~0.19, on the green), the wall's top (Cupside,
    // r ~0.15, a bevel lower), the bottom (Cup, r ~0.15, at the bone) and its hub
    const rimPts = P.filter((p) => p.codes.has(30) && p.r > 0.17), wallPts = P.filter((p) => !p.codes.has(31) && p.r <= 0.17 && p.y > 0.1);
    const bot = P.filter((p) => p.codes.has(31) && p.r > 0.1);
    if (rimPts.length < 10 || wallPts.length < 10 || bot.length < 10) { refuse(`H${h} c${c.k}: cup rings ${rimPts.length} / ${wallPts.length} / ${bot.length}`); continue; }
    const rimY = median(rimPts.map((p) => p.y)), wallY = median(wallPts.map((p) => p.y));
    cupStats.rim.push(median(rimPts.map((p) => p.r))); cupStats.rimY.push(rimY);
    cupStats.wallTop.push(rimY - wallY); cupStats.wallR.push(median(wallPts.map((p) => p.r)));
    cupStats.bottomR.push(median(bot.map((p) => p.r))); cupStats.bottomY.push(median(bot.map((p) => p.y)));
    cupStats.cups++;
  }
}
function median(a) { const s = [...a].sort((p, q) => p - q); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
if (cupStats.cups !== 126) refuse(`${cupStats.cups} cups measured, not 126`);
const cup = {
  _note: "the median NSS cup over the 126 of the collision dump, relative to its bone (GolfCourseNNholeK, the cup bottom): a 20-sided hole: the rim (Cupside) on the green at rimRadiusM, depthM above the bone (the rim follows the green's slope: depthRangeM); a bevel (Cupside) bevelM down and in to the wall's top at wallRadiusM; the wall (Cupside) straight down to the flat Cup bottom (bottomRadiusM) at bottomM above the bone. src/nsssim.js cupMesh cuts it into a height field.",
  cups: cupStats.cups,
  rimRadiusM: fx(median(cupStats.rim), 4), depthM: fx(median(cupStats.rimY), 4),
  bevelM: fx(median(cupStats.wallTop), 4), wallRadiusM: fx(median(cupStats.wallR), 4),
  bottomRadiusM: fx(median(cupStats.bottomR), 4), bottomM: fx(median(cupStats.bottomY), 4),
  rimRadiusRangeM: [fx(Math.min(...cupStats.rim), 4), fx(Math.max(...cupStats.rim), 4)], depthRangeM: [fx(Math.min(...cupStats.rimY), 4), fx(Math.max(...cupStats.rimY), 4)],
};

const frameS = Math.fround(1 / 60);   // 0x3c888889 (0xd37564..0xd375cc)
const physics = {
  _note: "NSS 1.5.0's golf ball, every constant src/nsssim.js uses. GENERATED by tools/nss-physics-export.mjs from the git-ignored eden dump (GolfBallMoveParam and GolfPlayerClubParam from the RomFS, the class defaults the file omits from the decoded .nso, GolfShotVelTable from Eden's RAM, the cup from the collision). Laws: tools/harness/state/eden/nss-golf-x/physics.md, flights.md and verify/flights/verdicts.json (the corrections there override the decode). Units m, s, m/s; float32 values as the shortest decimal that reads back to the same float32.",
  source: {
    game: "NSS 1.5.0",
    moveParam: { file: "RomFS Pack/Actor/GolfBall.pack.zs: " + IN.move.replace(/^ball\/GolfBall\.pack\.d\//, ""), sha1: sha1(readBuf(IN.move)) },
    clubParam: { file: "RomFS Pack/Actor/GolfPlayer.pack.zs: " + IN.club.replace(/^ball\/GolfPlayer\.pack\.d\//, ""), sha1: sha1(readBuf(IN.club)) },
    codeDefaults: { file: "physics.json (the .nso's class defaults)", sha1: sha1(readBuf(IN.physics)) },
    launchTable: { file: "GolfShotVelTable.json (" + VEL.source + ")", sha1: sha1(readBuf(IN.vel)) },
    cups: { file: "collision/hNN.bin (tools/lib/nsscol.mjs) at the cups of tools/nss-pins.json" },
  },
  tick: { frameS, substeps: 4, dt: frameS / 4, _note: "dt = the game's 0.016666668 / 4; the step 0xd388d8 runs 4 times a 60 Hz frame" },
  ball: { contactRadiusM: 0.05, phiveRadiusM: f32s(PHJ.ball_body.Radius_m), teeHeightM: cd("TeeHeight"), _note: "the ground contact is the centre less 0.050 m along the normal (9,624 contact samples, median 0.05000001); a ball on a tee starts 0.1000 m above the mesh, at rest 0.05" },
  air: {
    gravity: f32s(mv("Gravity")), airFriction: f32s(mv("AirFriction")),
    hopSpinK: f32s(mv("HopSpinK")), hopSpinResist: f32s(mv("HopSpinResist")), hopDecayTick: decayTick(mv("HopSpinResist")).v,
    sideSpinK: f32s(mv("SideSpinK")), sideSpinResist: f32s(mv("SideSpinResist")), sideDecayTick: decayTick(mv("SideSpinResist")).v,
    windK: f32s(mv("WindK")), windFwdK: f32s(mv("WindFwdK")), windBias: f32s(mv("WindBias")), windVelMax: cd("WindVelMax"), windHeight: cd("WindHeight"),
    windEffectCurve: curve(mv("WindEffectCurve"), "WindEffectCurve"),
    _note: "drag v -= AirFriction / 4 v a tick while |v| > StopVelLen; lift along normalize(-ux uy, ux^2 + uz^2, -uy uz) * HopSpinK * hop * |u| / 4; hop *= hopDecayTick (the RAM value; HopSpinResist^(1/4) would be 0.999624789); wind |W| = WindVelMax (s / WindVelMax)^log2(1 / WindBias) = s, times WindEffectCurve((y - y_launch) / WindHeight), v += WindK (W_across + WindFwdK W_along) dt about u's heading, shots only",
  },
  ground: {
    gravityPutter: f32s(mv("GravityPutter")), fieldResistanceEnableSpeed: f32s(mv("FieldResistanceEnableSpeed")), groundLeaveTimeForAirMode: f32s(mv("GroundLeaveTimeForAirMode")),
    frictionRatioCurve: curve(mv("FrictionRatioCurve"), "FrictionRatioCurve"),
    velLenForStopGravity: cd("VelLenForStopGravity"), stopGravityDisableDist: f32s(mv("StopGravityDisableDist")),
    addGravityHole: f32s(mv("AddGravityHole")), addGravityHoleDist: f32s(mv("AddGravityHoleDist")), addGravityHoleCurve: curve(mv("AddGravityHoleCurve"), "AddGravityHoleCurve"),
    noGravityVelLen: f32s(mv("NoGravityVelLen")), stopVelLen: f32s(mv("StopVelLen")), stopVelFrame: mv("StopVelFrame"),
    smallMoveForceStopDistance: cd("SmallMoveForceStopDistance"), smallMoveForceStopFrame: cd("SmallMoveForceStopFrame"),
    forceStopFrame: mv("ForceStopFrame"), forceStopPosY: cd("ForceStopPosY"), cupsideReflectionMaxVelY: cd("CupsideReflectionMaxVelY"),
    leafTimerS: 0.5,
    // measured, not decoded (the move's own collision response, Havok's material, which
    // the dump does not carry): the post-move velocity of every contact a mid-tick sample
    // caught is vin - (1 + e)(vin . n) n with e = 0 exactly on fairway, rough, green,
    // fringe, cupside and cup, and e = 0.3 on bunker (2 contacts), OB (1) and the pin (1);
    // those contacts also left the ball 0.0550 m from the face, every other 0.0500, and the
    // roll switches on the sand OB under H5's and H8's water bounced up at about 0.3 and
    // sat at 0.0550. All of them were a shot's contacts (a bounce or the switch to the
    // roll); a roll rests at 0.0500 on every surface, and h05s1's roll, landing in its
    // bunker again at 0.46 m/s, slid.
    softLiftM: 0.005, softRestitution: 0.3, softAttrs: [3, 5, 14, 19],
    flagHitAfterAngleRange: f32s(mv("FlagHitAfterAngleRange")), flagHitAfterVelMin: f32s(mv("FlagHitAfterVelMin")), flagHitAfterVelMax: f32s(mv("FlagHitAfterVelMax")), hitPinFlagHeightFromCupPos: f32s(mv("HitPinFlagHeightFromCupPos")),
    _note: "roll when |vin . n| < FieldResistanceEnableSpeed, the pass-through contact's speed < it and |vin.y| < it (the third condition: verdicts.json roll_switch); a roll airborne for GroundLeaveTimeForAirMode s is a shot again; roll tick: drag, friction (Friction[attr] FrictionRatioCurve(|v|) dt), pull-back, stop count, gravity (GravityPutter on the green; along -n at |v| <= VelLenForStopGravity with n.y >= 0.5 farther than StopGravityDisableDist from the cup; + AddGravityHole AddGravityHoleCurve(d / AddGravityHoleDist) within AddGravityHoleDist, in flight and in a roll faster than VelLenForStopGravity: verdicts.json corrections). leafTimerS: the 0.5 s a canopy entry keeps the leaf counter (0xd38f10, trees.md). softAttrs (bunker, OB, sand OB, the pin): a shot's contact with one sets the ball down softLiftM farther out than the 0.05 m contact radius and turns its velocity back at softRestitution (measured on the recordings, not decoded; every other surface, and a roll on any, slides: restitution 0). The FlagHit* and HitPinFlag* values are not modelled.",
  },
  backspin: {
    reflectionMin: f32s(mv("BackSpinReflectionMin")), reflectionBias: cd("BackSpinReflectionBias"),
    initVelK: f32s(mv("BackSpinInitVelK")), initVelRatioMax: f32s(mv("BackSpinInitVelRatioMax")), backwardVelocityMax: f32s(mv("BackSpinBackwardVelocityMax")),
    angleRatioCurve: curve(mv("BackSpinAngleRatioCurve"), "BackSpinAngleRatioCurve"),
    _note: "bounce factor k = 1 + (reflectionMin - 1) b b^log2(1 / reflectionBias) = 1 - 0.4 b^1.737; at the roll switch P = -d initVelK min(b, initVelRatioMax)^log2(1 / reflectionBias) max(d . a, 0) (d the incoming horizontal direction, a M+0xf4: the post-move velocity of the stroke's first contact, the launch velocity before it; |P| 2.2399 / 4.9604 on the two chips); in the roll v += r P_plane dt, r = angleRatioCurve(the angle between P and the ball-to-cup direction, deg), P *= the surface's backSpinDecayTick. BackSpinK (0.1) and BackSpinInitVelBias (0.655) have no reader in the ball code.",
  },
  attrs,
  codes,
  passAttrs: PASS_ATTRS,
  clubs,
  launch: {
    keyClamp: [0.01, 1.5], powerMax: f32s(PHJ.club_code_defaults.PowerOverMax), powerOverMaxAdd: f32s(PHJ.club_code_defaults.PowerOverMaxAdd), powerOverMaxPT: f32s(PHJ.club_code_defaults.PowerOverMaxPT),
    _note: "speed = launchTable[club][pct - 1], pct = (int)(100.0f * clamp(power, 0.01, 1.5)) in float32 (0xe10b08..0xe10b38); along the aim pitched up by loftDeg; hop = hopSpinRatio (not scaled by power); the lie only caps the power (rough roughRatio, bunker bunkerRatio), the speed is the table's at the capped power",
  },
  launchTable,
  cup,
  wind: { hudMphPerS: 2.25, _note: "the HUD's mph against the wind object's s (m/s) on the recorded round: 1 -> 2, 3 -> 6, 4 -> 9, 5 -> 11, 6 -> 13, 10 -> 22 = floor(2.25 s); the code's converter is 2.237 (0x1bf21fc) and neither its floor nor its round fits all six: the rounding is open" },
};

// ------------------------------------------------------------------ the fixture

const FLIGHTS = readJson(IN.flights);
const E2E = readJson(IN.e2e).end_to_end;
const STEP = 16;          // ticks between the kept airborne samples
const PATH_STEP = 48;     // ticks between the kept path rows
const MARGIN_M = 0.75;    // triangles kept within this of the path from the first contact on
const rawDir = join(opt.src, IN.raw);
const rawFiles = readdirSync(rawDir).filter((f) => f.endsWith(".npz")).sort();
const recs = {};
const rec = (tag) => (recs[tag] ??= loadRecording(join(rawDir, tag + ".npz")));
const v3 = (a, d = 6) => a.map((x) => fx(x, d));
const v3f = (a) => a.map(f32s);
const strokes = [];
const fixtures = [];

for (const shot of FLIGHTS.shots) {
  const tag = shot.tag;
  const R = rec(tag);
  const S = R.S;
  // the launch: the sample where the shot record changes (flightlib launch_index)
  let i0 = -1;
  const s0 = S[0].sV;
  if (!s0.some(Number.isNaN)) { for (let i = 1; i < R.n; i++) if (S[i].sV.some((c, j) => c !== s0[j])) { i0 = i; break; } }
  if (i0 < 0) for (let i = 0; i < R.n; i++) if (Math.abs(S[i].v[0]) + Math.abs(S[i].v[1]) + Math.abs(S[i].v[2]) > 0) { i0 = i; break; }
  let L = S[i0];
  let rec0 = { start: L.sStart, v0: L.sV, power: L.sPower, club: L.sClub, back: L.sBack, curve: L.sCurve };
  if (rec0.v0.some(Number.isNaN) || rec0.club < 0) {
    // the first recording's block stopped short of the shot record: the next recording's
    // first sample still holds it (flightexport.py)
    const k = rawFiles.indexOf(tag + ".npz");
    const N = rec(basename(rawFiles[k + 1], ".npz")).S[0];
    if (Math.hypot(N.sStart[0] - shot.start[0], N.sStart[2] - shot.start[2]) > 1e-3) refuse(`${tag}: no shot record`);
    rec0 = { start: N.sStart, v0: N.sV, power: N.sPower, club: N.sClub, back: N.sBack, curve: N.sCurve };
  }
  if (CLUB_NAMES[rec0.club] !== shot.club) refuse(`${tag}: club ${rec0.club} vs ${shot.club}`);
  const hop0 = clubs[shot.club].hopSpinRatio;
  // the samples from the launch on; of two clean samples with one frame counter the
  // later one was read a move ahead (its position |v| dt past the first's, its v not yet
  // updated: the v-copy check passes), so only the first of a tick counts as clean
  const after = S.slice(i0);
  const seenTick = new Set();
  for (const s of after) { if (!s.ok) continue; if (seenTick.has(s.tick)) s.ok = false; else seenTick.add(s.tick); }
  // the first contact: the first sample past the launch in phase 2 (M+0xb4: 1 before the
  // first contact, 2 after) or touching anything (a sample read mid-tick can show the
  // contact before the phase)
  const firstContactI = after.findIndex((s, i) => i > 0 && s.tick > 0 && (s.phase === 2 || s.a4 > 0 || s.a8 > 0));
  const fc = firstContactI > 0 ? after[firstContactI] : null;
  const air = [];
  for (let i = 1; i < after.length; i++) {
    const s = after[i];
    if (fc && i >= firstContactI) break;
    if (!s.ok || s.mode !== 1 && shot.club !== "PT" || s.a4 || s.a8 || s.tick <= 0) continue;
    if (s.tick % STEP === 0) air.push([s.tick, ...v3(s.pos)]);
  }
  // the last clean airborne sample before the first contact
  let lastAir = null;
  for (let i = (fc ? firstContactI : after.length) - 1; i > 0; i--) { const s = after[i]; if (s.ok && !s.a4 && !s.a8 && s.mode === after[1].mode) { lastAir = s; break; } }
  if (lastAir && (!air.length || air[air.length - 1][0] !== lastAir.tick)) air.push([lastAir.tick, ...v3(lastAir.pos)]);
  // the path every PATH_STEP ticks and at every mode change (for looking at; the test
  // reads air, the contacts and the rest), to 0.1 mm
  const path = [];
  let prevMode = null;
  for (let i = 1; i < after.length; i++) {
    const s = after[i];
    if (!s.ok) continue;
    if (s.tick % PATH_STEP === 0 || s.mode !== prevMode) path.push([s.tick, s.mode, s.a4, s.a8, ...v3(s.pos, 4)]);
    prevMode = s.mode;
  }
  // the contacts: each new contact record (vin) of a shot (mode 1 before it), and the roll switch
  const contacts = [];
  let prevVin = after[0].vin;
  for (let i = 1; i < after.length; i++) {
    const s = after[i];
    if (s.vin.some(Number.isNaN) || s.vin.every((c, j) => c === prevVin[j]) || s.vin.every((c) => c === 0)) continue;
    prevVin = s.vin;
    const before = after.slice(0, i).reverse().find((q) => q.ok);
    const modeBefore = before ? before.mode : s.mode;
    if (modeBefore !== 1) continue;
    const aft = after.slice(i + 1).find((q) => q.ok && q.vin.every((c, j) => c === s.vin[j]));
    contacts.push({ tick: s.tick, attr: s.ac, vol: s.a8, n: v3(s.n, 6), vin: v3(s.vin, 5), vn: fx(s.vn, 5), modeAfter: aft ? aft.mode : null });
  }
  const last = S[R.n - 1];
  const restAttr = last.ac;
  const outcome = shot.outcome === "holed" ? "holed" : shot.outcome === "OB" ? "OB" : shot.outcome === "water" ? "water" : "rest";
  // the active cup: the cup the hole's holed stroke rests in
  const holedTag = FLIGHTS.shots.find((q) => q.hole === shot.hole && q.outcome === "holed")?.tag;
  const hc = holedTag ? rec(holedTag).S.at(-1).pos : null;
  const cups = NSSP.holes[shot.hole].cups;
  const near = hc ? cups.map((c) => ({ k: c.k, d: Math.hypot(c.world[0] - hc[0], c.world[2] - hc[2]) })).sort((p, q) => p.d - q.d)[0] : null;
  if (!near || near.d > 0.15) refuse(`${tag}: the active cup (holed rest ${near?.d?.toFixed(3)} m from the nearest)`);
  const cupW = cups.find((c) => c.k === near.k).world;
  // the verifiers' end-to-end air fit (verify/flights/launch.json), AddGravityHole included
  const e = E2E[tag];
  const airFit = shot.club === "PT" ? null : e ? (e.pos_err_m < 1.2e-3 || ["h04s2-sw", "h04s3-sw", "h13s1-5i"].includes(tag)) : false;
  const events = [...new Set(after.map((s) => s.a8).filter((a) => a > 0))].sort((p, q) => p - q);
  // the triangles near the ground phase (the whole path for a putt; and around every
  // pass-through contact), the active cup's cover left out
  const m = col(shot.hole);
  const coverOf = m.covers.find((c) => c.k === near.k);
  const pts = [];
  const iStart = shot.club === "PT" ? 0 : Math.max(0, firstContactI - 2);
  const nearPass = new Set();
  after.forEach((s, i) => { if (s.a8 > 0 || s.ac === 8 || s.ac === 20) for (let k = Math.max(0, i - 6); k <= i + 6; k++) nearPass.add(k); });
  for (let i = 0; i < after.length; i++) {
    if (i < iStart && !nearPass.has(i)) continue;
    const a = after[i].pos, b = after[Math.min(i + 1, after.length - 1)].pos;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const k = Math.max(1, Math.ceil(d / 0.25));
    for (let j = 0; j < k; j++) pts.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k, a[2] + (b[2] - a[2]) * j / k]);
  }
  const keep = trianglesNear(m, pts, MARGIN_M, (t) => coverOf && t >= coverOf.tri0 && t < coverOf.tri1);
  const mesh = packMesh(m, keep);
  const fix = {
    tag, hole: shot.hole, stroke: shot.stroke, club: shot.club, power: f32s(rec0.power), pct: shot.pct, lie: shot.lie_attr, lieName: shot.lie,
    wind: R.wind ? { s: R.wind.s_mps, dirRad: f32s(R.wind.angle_rad), dir: R.wind.dir, mphHud: R.wind.mph_hud ?? null } : { s: 1, dirRad: f32s(Math.PI / 2), dir: 2, mphHud: 2.24, inferred: true },
    launch: { start: v3f(rec0.start), v0: v3f(rec0.v0), hop: hop0, side: 0, backspin: f32s(rec0.back || 0), curve: f32s(rec0.curve || 0), yRef: f32s(rec0.start[1]), tick0: after[0].tick },
    cup: { k: near.k, world: cupW },
    outcome, outcomeRecorded: shot.outcome, restAttr, rest: v3f(last.pos), restTick: shot.rest_tick,
    // the surface: this tick's contact (M+0xa4), else the last surface touched (M+0xac:
    // the sample came after the contact tick), else the pass-through one (M+0xa8)
    firstContact: fc ? { tick: fc.tick, attr: fc.a4 || fc.ac || fc.a8, vol: fc.a8, pos: v3(fc.pos) } : null,
    rollTick: (() => { const s = after.find((q, i) => i > 0 && q.mode === 2 && after[i - 1].mode === 1); return s ? s.tick : null; })(),
    passThrough: events,
    verifier: { airFitEndToEnd: airFit, airErrMm: e ? fx(e.pos_err_m * 1000, 3) : null, endedBy: e ? e.ended_by : null },
    air, path, contacts, mesh,
  };
  fixtures.push(fix);
  strokes.push({ tag, hole: shot.hole, club: shot.club, pct: shot.pct, lie: shot.lie_attr, outcome, airFitEndToEnd: airFit, passThrough: events, samples: { air: air.length, path: path.length, contacts: contacts.length }, triangles: mesh.nt });
}

// the triangles (of every code) whose boxes come within margin of a point
function trianglesNear(m, pts, margin, skip) {
  const cell = 4, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const p of pts) {
    const i = Math.floor(p[0] / cell), j = Math.floor(p[2] / cell);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const k = key(a, b); if (!grid.has(k)) grid.set(k, []); }
    grid.get(key(i, j)).push(p);
  }
  const out = [];
  for (let t = 0; t < m.nt; t++) {
    if (skip(t)) continue;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let j = 0; j < 3; j++) {
      const v = m.tris[t * 3 + j] * 3;
      x0 = Math.min(x0, m.verts[v]); x1 = Math.max(x1, m.verts[v]); y0 = Math.min(y0, m.verts[v + 1]); y1 = Math.max(y1, m.verts[v + 1]); z0 = Math.min(z0, m.verts[v + 2]); z1 = Math.max(z1, m.verts[v + 2]);
    }
    if (x1 - x0 > 400 || z1 - z0 > 400) {   // a sea plane: keep it whole
      if (pts.some((p) => p[0] >= x0 - margin && p[0] <= x1 + margin && p[2] >= z0 - margin && p[2] <= z1 + margin && p[1] >= y0 - margin && p[1] <= y1 + margin)) out.push(t);
      continue;
    }
    let hit = false;
    for (let i = Math.floor((x0 - margin) / cell); i <= Math.floor((x1 + margin) / cell) && !hit; i++) {
      for (let j = Math.floor((z0 - margin) / cell); j <= Math.floor((z1 + margin) / cell) && !hit; j++) {
        const list = grid.get(key(i, j));
        if (!list) continue;
        for (const p of list) {
          const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(y0 - p[1], 0, p[1] - y1), dz = Math.max(z0 - p[2], 0, p[2] - z1);
          if (dx * dx + dy * dy + dz * dz <= margin * margin) { hit = true; break; }
        }
      }
    }
    if (hit) out.push(t);
  }
  return out;
}
// the kept triangles with their own vertices: base64 Float32 verts, Uint32 tris, Uint8 codes
function packMesh(m, keep) {
  const vmap = new Map(), verts = [], tris = [], codesArr = [];
  for (const t of keep) {
    for (let j = 0; j < 3; j++) {
      const v = m.tris[t * 3 + j];
      if (!vmap.has(v)) { vmap.set(v, verts.length / 3); verts.push(m.verts[v * 3], m.verts[v * 3 + 1], m.verts[v * 3 + 2]); }
      tris.push(vmap.get(v));
    }
    codesArr.push(m.surface[t]);
  }
  const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString("base64");
  return { nv: verts.length / 3, nt: keep.length, verts: b64(new Float32Array(verts)), tris: b64(new Uint32Array(tris)), codes: b64(new Uint8Array(codesArr)), source: { field: m.sha1.field, covers: m.sha1.covers, leaf: m.sha1.leaf ?? null, water: m.sha1.water ?? null } };
}

// ------------------------------------------------------------------ write

if (fails.length) { for (const f of fails) console.error("REFUSED:", f); process.exit(1); }
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).map((q) => [q, x[q]])) : x));
for (const [what, v] of [["physics", physics], ...fixtures.map((f) => [f.tag, f])]) {
  const bad = []; walk(v, what, bad);
  if (bad.length) { console.error(`REFUSED: ${bad.slice(0, 5).join("; ")}`); process.exit(1); }
}
function walk(v, p, bad) {
  if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${p} = ${v}`);
  else if (v === undefined) bad.push(`${p} undefined`);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`, bad));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`, bad);
}
// tools/nss-physics.json: two-space indent, short arrays on one line
const physText = pretty(physics) + "\n";
writeFileSync(OUT_PHYS, physText);
mkdirSync(OUT_FIX, { recursive: true });
let fixBytes = 0;
for (const f of fixtures) { const t = stable(f) + "\n"; fixBytes += t.length; writeFileSync(join(OUT_FIX, f.tag + ".json"), t); }
const index = {
  _note: "The 71 NSS strokes recorded in Eden's RAM (tools/harness/state/eden/nss-golf-x/flights, flights.md), one file per stroke: GENERATED by tools/nss-physics-export.mjs. Per stroke: the launch exactly (the shot record: start, v0, float32), the wind (s m/s; the air moves along (sin dirRad, 0, cos dirRad)), the active cup (the bone, NSS m), air = [tick, x, y, z] of the clean airborne samples before the first contact every 16 ticks and the last one (1e-6 m), path = [tick, mode, contact surface, pass-through surface, x, y, z] every 48 ticks and at each mode change (1e-4 m), contacts = each new contact record of a shot (tick, attr = the last surface touched, vol = the pass-through one, n, vin, vn, modeAfter), the rest; mesh = the NSS collision triangles (all codes: field, covers but the active cup's, TreeLeaf canopies, H3's sea) whose boxes come within 0.75 m of the path from the first contact on (the whole putt) and of the samples around a pass-through contact, base64 little-endian (verts Float32 x,y,z; tris Uint32; codes Uint8, tools/lib/nsscol.mjs's surface codes). verifier.airFitEndToEnd: the verifiers' end-to-end flight from the shot record to the last airborne sample fits (verify/flights/launch.json end_to_end within 1.2 mm; h04s2, h04s3, h13s1 once AddGravityHole acts in flight, verdicts.json); null for putts.",
  source: { flights: sha1(readBuf(IN.flights)), verdicts: sha1(readBuf(IN.verdicts)), endToEnd: sha1(readBuf(IN.e2e)), raw: Object.fromEntries(rawFiles.map((f) => [f, sha1(readFileSync(join(rawDir, f)))])) },
  step: STEP, pathStep: PATH_STEP, marginM: MARGIN_M,
  strokes,
};
writeFileSync(join(OUT_FIX, "index.json"), pretty(index) + "\n");
// the constants block of src/nsssim.js
const sim = readFileSync(SIM, "utf8");
const a = sim.indexOf("// <nss-physics>"), b = sim.indexOf("// </nss-physics>");
if (a < 0 || b < a) { console.error("REFUSED: src/nsssim.js has no // <nss-physics> ... // </nss-physics> block"); process.exit(1); }
const head = sim.slice(a, sim.indexOf("\n", a) + 1);
const block = head + "export const PHYSICS = " + JSON.stringify(physics) + ";\n";
const next = sim.slice(0, a) + block + sim.slice(b);
if (next !== sim) writeFileSync(SIM, next);
console.log(`tools/nss-physics.json ${physText.length} B; tools/fixtures/nss-flights: ${fixtures.length} strokes, ${(fixBytes / 1024).toFixed(0)} KB, ${fixtures.reduce((s, f) => s + f.mesh.nt, 0)} triangles; cup rim ${cup.rimRadiusM} m, depth ${cup.depthM} m; src/nsssim.js block ${next === sim ? "unchanged" : "written"}`);

// JSON with two-space indent; an array of numbers (or of short arrays of numbers) on one line
function pretty(v, ind = "") {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const inner = ind + "  ";
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== "object" || (Array.isArray(x) && x.every((y) => typeof y !== "object")))) return "[" + v.map((x) => JSON.stringify(x)).join(", ") + "]";
    return "[\n" + v.map((x) => inner + pretty(x, inner)).join(",\n") + "\n" + ind + "]";
  }
  const ks = Object.keys(v);
  if (!ks.length) return "{}";
  return "{\n" + ks.map((k) => inner + JSON.stringify(k) + ": " + pretty(v[k], inner)).join(",\n") + "\n" + ind + "}";
}
