// The NSS (Nintendo Switch Sports) course data the app and its generators use,
// exported from the git-ignored eden dump into three small committed files:
//
//   node tools/nss-export.mjs [--src tools/harness/state/eden/nss-golf-x] [--out-dir tools]
//
//   tools/nss-registration.json  per hole the NSS world -> map similarity (px = a*x - b*z + tx,
//                                py = b*x + a*z + ty; pins.json's tree fit, copied at full
//                                precision) and the NSS -> WSR KCL mesh offset O (mesh = 10 *
//                                nss + O). Read through tools/lib/nssreg.mjs.
//   tools/nss-pins.json          per hole the six NSS cups (bones GolfCourseNNholeK, k = 0..5):
//                                map x/y, world, the green surface over the cup (the HoleCover
//                                plug's top, from the collision), mesh units, CupDifficulties
//                                (`difficult`), yards from the WSR start and from GlfTeeOBJ,
//                                the nearest WSR spot (`wsr` = its id when <= 0.3 yd); and the
//                                tee bones Glf_RotateOBJ / GlfTeeOBJ and the WSR start.
//   tools/nss-platform.json      the online tee platform on every hole: posed at Glf_RotateOBJ
//                                with that bone's own yaw; per tier (low, high) every standing
//                                x the game uses (the four slot bones at local x +-1.15, +-3.45 m
//                                and the midpoints +-2.3, 0 an odd group stands on), listed
//                                left to right as the player faces the green (platform-local
//                                +x is the player's LEFT facing local +z), each with its map
//                                x/y, its height (the mat, yd above the datum = NSS y 0 = the
//                                WSR start's height) and the NSS ground under it. Those are
//                                where the golfer STANDS (slots.json `stand`); each carries
//                                `ball`, the tee spot: the stance moved along local x by
//                                ballOffsetM (-0.9 m right-handed, to the player's right; +0.9
//                                left-handed; slots.json ballOffset, applied before the platform
//                                transform), with its own map x/y, mat height and ground. The
//                                row's bearing (facingDeg, local +z: it orders L2 .. R2 and puts
//                                the high tier behind the low) and the start's (startFacingDeg,
//                                GlfTeeOBJ's yaw, the golfer's start rotation in platform mode,
//                                up to 10 deg off the row's); the 8 slot bones as `slots`.
//
// Inputs (the dump, read-only): pins.json, platform.json, slots.json, collision/hNN.bin +
// .json + -covers.bin, collision/h03-water.bin + .json (H3's sea, its own actor; the leaf
// canopies are no ground, so not read), collision/objects/BGOBJ_GlfStartObj(High).bin +
// .json; and the committed tools/wsr-pins.json (the WSR start and spots). Every number is
// rounded to fixed decimals (5 for map fractions, 4 for metres and heights in yd, 3 for mesh
// units) and objects are written in a fixed key order, so two runs are byte-identical; each
// file is checked before anything is written (no undefined, NaN or infinite value; the text
// parses back to the same object). Refuses (exit 1, nothing written): a hole without exactly
// six cups k = 0..5; a cup whose cover (the hub of its 20-triangle fan) is more than 4 mm
// from its bone in xz (two steps of the collision's 1/512 m vertex grid), or that is not the
// top ground over the bone; a platform yaw that is not a pure Euler Y or disagrees with
// platform.json's; a recomputed slot more than 1e-4 m from platform.json's slotsWorld or 0.8
// map px from its map.slots (which came through the tree-ICP + mesh-registration path,
// 0.40-0.77 px off on 13 holes); a standing x or ball the platform's collision mat does not
// cover; slots.json's ball offset not one magnitude to either side, or its mats or bones not
// the platform's; a WSR spot match the decoder did not make; H3 without its sea.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { nssToMap, nssToPx, mapToNss, meshToNss, nssToMesh, bearingOf, platformToWorld, M_PER_YD } from "./lib/nssreg.mjs";
import { loadCollision, loadObject, gridIndex, topGround, GROUND_CODES, NSS_CODES } from "./lib/nsscol.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const opt = { src: join(ROOT, "tools/harness/state/eden/nss-golf-x"), outDir: join(ROOT, "tools") };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--src") opt.src = resolve(argv[++i]);
  else if (argv[i] === "--out-dir") opt.outDir = resolve(argv[++i]);
  else { console.error(`unknown argument ${argv[i]}`); process.exit(1); }
}
const COL = join(opt.src, "collision");
for (const f of ["pins.json", "platform.json", "slots.json", "collision/h01.json", "collision/objects/BGOBJ_GlfStartObj.json"]) {
  if (!existsSync(join(opt.src, f))) { console.error(`no ${f} under ${opt.src}: the export runs on the dump machine (--src <the eden nss-golf-x dir>)`); process.exit(1); }
}
const fails = [];
const refuse = (msg) => fails.push(msg);

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const readJson = (p) => { const buf = readFileSync(p); return { json: JSON.parse(buf.toString("utf8")), sha1: sha1(buf) }; };
const f5 = (v) => +v.toFixed(5), f4 = (v) => +v.toFixed(4), f3 = (v) => +v.toFixed(3), f2 = (v) => +v.toFixed(2);
const pad2 = (n) => String(n).padStart(2, "0");
const dist2 = (ax, az, bx, bz) => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));

const PINS = readJson(join(opt.src, "pins.json"));
const PLAT = readJson(join(opt.src, "platform.json"));
const SLOTS = readJson(join(opt.src, "slots.json"));
const WSRP = readJson(join(ROOT, "tools/wsr-pins.json"));
const P = PINS.json, PL = PLAT.json, SL = SLOTS.json, W = WSRP.json;

// ---- the platform's own frame (the same on every hole) ---------------------
const TIERS = ["low", "high"];
const TIER_Z = {}, TIER_BONE_Y = {}, TIER_ACTOR = {};
const SLOTS_LOCAL = PL.slots.map((s) => ({ i: s.index, tier: s.tier, bone: s.bone, x: s.offset[0], y: s.offset[1], z: s.offset[2] }));
if (SLOTS_LOCAL.length !== 8 || SLOTS_LOCAL.some((s, i) => s.i !== i || s.bone !== `GlfTeeOBJ_${i + 1}` || s.tier !== (i < 4 ? "low" : "high"))) refuse("platform.json slots: not GlfTeeOBJ_1..8, low 0-3 / high 4-7");
// bone order within a tier runs from the player's right to the left (local -x .. +x)
const SLOT_SIDE = ["R2", "R1", "L1", "L2"];
for (const t of TIERS) {
  const ts = SLOTS_LOCAL.filter((s) => s.tier === t);
  if (ts.some((s, j) => s.x !== [-3.45, -1.15, 1.15, 3.45][j] || s.z !== ts[0].z || s.y !== ts[0].y)) refuse(`platform.json ${t} slots: not at x -3.45, -1.15, 1.15, 3.45 on one row`);
  TIER_Z[t] = ts[0].z; TIER_BONE_Y[t] = ts[0].y; TIER_ACTOR[t] = PL.tiers[t].actor;
}
// every standing x, from the player's left (+x) to the right (-x): the bones and
// the midpoints an odd group stands on (platform.json slotRule)
const STANDING_X = [3.45, 2.3, 1.15, 0, -1.15, -2.3, -3.45];
const standing = STANDING_X.map((x, fromLeft) => {
  const j = [-3.45, -1.15, 1.15, 3.45].indexOf(x);
  if (j >= 0) return { fromLeft, localX: x, kind: "bone", side: SLOT_SIDE[j], j };
  const a = [-3.45, -1.15, 1.15, 3.45].findIndex((b) => b > x), lo = a - 1;   // the bones either side
  return { fromLeft, localX: x, kind: "mid", between: [SLOT_SIDE[a], SLOT_SIDE[lo]], jj: [a, lo] };
});
// the ball: the standing spot moved along platform-local x, before the platform
// transform (slots.json ballOffset: main 0x2ef29f0 = -0.9 for a right-hander, whose
// ball is then on his right, 0x2ef29fc = +0.9 for a left-hander)
const HANDS = ["rightHanded", "leftHanded"];
const BALL_OFFSET = SL.ballOffset?.alongLocalX_m ?? {};
if (!HANDS.every((h) => Number.isFinite(BALL_OFFSET[h])) || !(BALL_OFFSET.rightHanded < 0) || BALL_OFFSET.leftHanded !== -BALL_OFFSET.rightHanded) refuse(`slots.json ballOffset.alongLocalX_m ${JSON.stringify(BALL_OFFSET)}: not -d (right-handed) / +d (left-handed)`);
for (const s of SLOTS_LOCAL) {
  const b = SL.bones?.find((q) => q.slot === s.i);
  if (!b || b.bone !== s.bone || b.tier !== s.tier || b.local?.[0] !== s.x || b.local?.[2] !== s.z || Math.abs(b.local?.[1] - s.y) > 1e-6) refuse(`slots.json bones: slot ${s.i} is not platform.json's ${s.bone} at ${s.x}, ${s.y}, ${s.z}`);
}
// the mats: a vertical ray on each tier's collision at every standing x and every
// ball (the deck's 0.117 / 1.686 m tops are only its bevelled rim)
const MAT_Y = {}, OBJ_SHA = {};
for (const t of TIERS) {
  const name = PL.tiers[t].model;
  const o = loadObject(COL, name);
  OBJ_SHA[name] = o.sha1;
  const idx = gridIndex(o, 0.5);
  const xs = standing.flatMap((p) => [p.localX, ...HANDS.map((h) => p.localX + BALL_OFFSET[h])]);
  const ys = xs.map((x) => topGround(idx, x, TIER_Z[t], null));
  if (ys.some((h) => !h)) { refuse(`${name}: no mat under a standing x or a ball (local x ${xs.filter((x, i) => !ys[i]).join(", ")})`); continue; }
  const y0 = Math.fround(ys[0].y);   // the collision is float32: a flat mat is one f32 height
  if (ys.some((h) => Math.fround(h.y) !== y0)) refuse(`${name}: the mat is not one height across the row (${ys.map((h) => h.y).join(", ")})`);
  if (Math.abs(y0 - TIER_BONE_Y[t]) > 0.002) refuse(`${name}: mat at ${y0}, the slot bones at ${TIER_BONE_Y[t]}`);
  if (!(Math.abs(SL.heights?.matLocalY_m?.[t] - y0) <= 1e-6)) refuse(`${name}: mat at ${y0}, slots.json's at ${SL.heights?.matLocalY_m?.[t]}`);
  MAT_Y[t] = y0;
}

// ---- per hole ----------------------------------------------------------------
const REG = {}, PINOUT = {}, PLATOUT = {}, COLSHA = {};
const WSR_MATCH_YD = 0.3, COVER_MM = 4, SLOT_MAP_PX = 0.8;
const FRAME_MARGIN_M = 25;   // the ground index reaches this far past the map frame
let surfUp = [Infinity, -Infinity];
const slotSummary = [], ties = [];
for (let n = 1; n <= 21; n++) {
  const key = pad2(n), h = P.holes[key], ph = PL.perHole[key], wh = W.holes[String(n)];
  if (!h || !ph || !wh) { refuse(`H${n}: missing in pins.json, platform.json or wsr-pins.json`); continue; }
  const t = h.transform, m = t.toWsrMesh;
  if (t.flip !== false) refuse(`H${n}: transform flipped`);
  if (h.par !== h.parApp) refuse(`H${n}: par ${h.par} against the app's ${h.parApp}`);
  const reg = {
    a: t.a, b: t.b, tx: t.tx, ty: t.ty,
    residualPx: t.residualPx, residualYd: t.residualYd, maxPx: t.maxPx, points: t.points, pointsKind: t.pointsKind,
    ydPerPxFit: t.ydPerPxFit, unitsPerM: 10, unitsPerMFit: m.unitsPerM, rotDegFit: m.rotDeg,
    originMesh: [m.originMesh[0], m.originMesh[1]], originMeshY: m.originMeshY,
  };
  REG[n] = reg;

  // collision: field + covers + the sea where it is its own actor (H3), a ground
  // index over the map frame (the sea plane runs ~16 km out)
  const col = loadCollision(COL, n, { covers: true, extras: ["water"] });
  if (n === 3 && col.missing.length) refuse(`H3: no collision/h03-water.json + .bin (H3's sea, Object_BGOBJ_GolfCourse03Water)`);
  COLSHA[n] = col.sha1;
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([fx, fy]) => mapToNss(reg, fx, fy));
  const frame = [Math.min(...corners.map((c) => c[0])) - FRAME_MARGIN_M, Math.min(...corners.map((c) => c[1])) - FRAME_MARGIN_M,
    Math.max(...corners.map((c) => c[0])) + FRAME_MARGIN_M, Math.max(...corners.map((c) => c[1])) + FRAME_MARGIN_M];
  const idx = gridIndex(col, 4, { codes: GROUND_CODES, bbox: frame });
  const groundAt = (x, z) => { const g = topGround(idx, x, z); if (g?.tie) ties.push(`H${n} at ${x.toFixed(3)}, ${z.toFixed(3)}`); return g; };

  // tees
  const bone = (name) => h.tees.find((e) => e.actor === `bone:${name}`);
  const rot = bone("Glf_RotateOBJ"), tee = bone("GlfTeeOBJ");
  if (!rot || !tee) { refuse(`H${n}: no Glf_RotateOBJ / GlfTeeOBJ bone`); continue; }
  for (const b of [rot, tee]) if (b.rot[0] !== 0 || b.rot[2] !== 0) refuse(`H${n}: ${b.actor} rotation ${b.rot} is not a pure yaw`);
  const yawDegOf = (b) => (b.rot[1] * 180) / Math.PI;
  const s0 = wh.starts?.[0];
  if (!s0) { refuse(`H${n}: wsr-pins.json has no start`); continue; }
  const wsrWorld = meshToNss(reg, s0.mesh);
  const teeEntry = (b) => { const p = nssToMap(reg, b.world[0], b.world[2]); return { world: b.world.map(f4), yawDeg: f4(yawDegOf(b)), x: f5(p.x), y: f5(p.y) }; };
  const tees = {
    rotateObj: teeEntry(rot),
    teeObj: teeEntry(tee),
    wsrStart: { world: wsrWorld.map(f4), mesh: s0.mesh, x: s0.x, y: s0.y },
  };

  // cups
  const cups = h.cups.slice().sort((p, q) => p.k - q.k);
  if (cups.length !== 6 || cups.some((c, i) => c.k !== i)) { refuse(`H${n}: ${cups.length} cups (k ${cups.map((c) => c.k)}), not six k = 0..5`); continue; }
  const spots = (wh.spots || []).map((s) => ({ id: `s${s.slots[0]}`, label: s.label, w: meshToNss(reg, s.mesh) }));
  const cupOut = [];
  for (const c of cups) {
    const [bx, by, bz] = c.world;
    const cv = col.covers.find((q) => q.k === c.k);
    if (!cv) { refuse(`H${n} c${c.k}: no cover`); continue; }
    // the hub of the cover's fan: the vertex all 20 of its triangles share
    const cnt = new Map();
    for (let tr = cv.tri0; tr < cv.tri1; tr++) for (let e = 0; e < 3; e++) { const v = col.tris[tr * 3 + e]; cnt.set(v, (cnt.get(v) || 0) + 1); }
    const [hub, hubN] = [...cnt.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0];
    const hx = col.verts[hub * 3], hy = col.verts[hub * 3 + 1], hz = col.verts[hub * 3 + 2];
    const dMm = dist2(hx, hz, bx, bz) * 1000;
    if (hubN !== cv.tri1 - cv.tri0 || dMm > COVER_MM) refuse(`H${n} c${c.k}: cover hub ${dMm.toFixed(2)} mm from the bone (${hubN} of ${cv.tri1 - cv.tri0} triangles)`);
    const top = groundAt(bx, bz);
    if (!top || top.tri < cv.tri0 || top.tri >= cv.tri1) { refuse(`H${n} c${c.k}: the top ground over the bone is not its cover (${top ? `${NSS_CODES[top.code]} tri ${top.tri}` : "none"})`); continue; }
    const surfaceY = top.y;
    surfUp = [Math.min(surfUp[0], surfaceY - by), Math.max(surfUp[1], surfaceY - by)];
    const mp = nssToMap(reg, bx, bz);
    if (Math.abs(mp.x - c.map[0]) > 1.5e-5 || Math.abs(mp.y - c.map[1]) > 1.5e-5) refuse(`H${n} c${c.k}: map ${mp.x},${mp.y} against pins.json's ${c.map}`);
    const ydWsr = dist2(bx, bz, wsrWorld[0], wsrWorld[2]) / M_PER_YD;
    const ydTee = dist2(bx, bz, tee.world[0], tee.world[2]) / M_PER_YD;
    if (Math.abs(ydWsr - c.ydFromWsrStart) > 0.06 || Math.abs(ydTee - c.ydFromGlfTeeOBJ) > 0.06) refuse(`H${n} c${c.k}: ${ydWsr} / ${ydTee} yd against pins.json's ${c.ydFromWsrStart} / ${c.ydFromGlfTeeOBJ}`);
    let near = null;
    for (const s of spots) { const d = dist2(bx, bz, s.w[0], s.w[2]) / M_PER_YD; if (!near || d < near.yd) near = { id: s.id, label: s.label, yd: d }; }
    const wsr = near && near.yd <= WSR_MATCH_YD ? near.id : null;
    const decoderWsr = c.nearestWsrSpot && c.nearestWsrSpot.distYd <= WSR_MATCH_YD ? c.nearestWsrSpot.id : null;
    if (wsr !== decoderWsr) refuse(`H${n} c${c.k}: WSR spot ${wsr} against the decoder's ${decoderWsr}`);
    cupOut.push({
      k: c.k, x: f5(mp.x), y: f5(mp.y), difficult: c.difficult === true,
      world: c.world.map(f4),
      surfaceY: f4(surfaceY), surfaceYd: f4(surfaceY / M_PER_YD),
      mesh: nssToMesh(reg, [bx, surfaceY, bz]).map(f3),
      ydFromWsrStart: f2(ydWsr), ydFromTeeObj: f2(ydTee),
      wsr, nearestWsr: near ? { id: near.id, label: near.label, yd: f2(near.yd) } : null,
      cover: { hub: [f4(hx), f4(hy), f4(hz)], dxzMm: f2(dMm) },
    });
  }
  PINOUT[n] = { par: h.par, cups: cupOut, tees };

  // platform
  const yawDeg = yawDegOf(rot);
  if (Math.abs(yawDeg - ph.yawDeg) > 1e-3) refuse(`H${n}: Glf_RotateOBJ yaw ${yawDeg} against platform.json's ${ph.yawDeg}`);
  const origin = ph.origin;
  if (origin.some((v, i) => Math.abs(v - rot.world[i]) > 1e-4)) refuse(`H${n}: platform origin ${origin} against Glf_RotateOBJ ${rot.world}`);
  const fwd = platformToWorld([0, 0, 0], yawDeg, [0, 0, 1]);
  const forward = [fwd[0], fwd[2]];
  const facingDeg = bearingOf(reg, forward[0], forward[1]);
  // the golfer's start rotation in platform mode is the course GlfTeeOBJ's, not
  // the platform's (verify/slots-verdicts.json): its local +z on the map
  const startYawDeg = yawDegOf(tee);
  const sf = platformToWorld([0, 0, 0], startYawDeg, [0, 0, 1]);
  const startFacingDeg = bearingOf(reg, sf[0], sf[2]);
  const at = (localX, t) => {
    const w = platformToWorld(origin, yawDeg, [localX, MAT_Y[t], TIER_Z[t]]);
    const p = nssToMap(reg, w[0], w[2]);
    const g = groundAt(w[0], w[2]);
    return { world: w.map(f4), x: f5(p.x), y: f5(p.y), z: f4(w[1] / M_PER_YD), groundZ: g ? f4(g.y / M_PER_YD) : null, groundCode: g ? g.code : null, ground: g ? NSS_CODES[g.code] : null };
  };
  const tiers = {};
  for (const t of TIERS) {
    const base = SLOTS_LOCAL.filter((s) => s.tier === t)[0].i;
    tiers[t] = standing.map((s) => {
      const head = { fromLeft: s.fromLeft, localX: s.localX };
      if (s.kind === "bone") Object.assign(head, { side: s.side, slot: base + s.j, bones: [`GlfTeeOBJ_${base + s.j + 1}`] });
      else Object.assign(head, { between: s.between, bones: s.jj.map((j) => `GlfTeeOBJ_${base + j + 1}`) });
      const ball = Object.fromEntries(HANDS.map((h) => { const lx = s.localX + BALL_OFFSET[h]; return [h, { localX: f4(lx), ...at(lx, t) }]; }));
      return { ...head, ...at(s.localX, t), ball };
    });
  }
  // the 8 slot bones, in bone order, with the decoder's own slot points as a check
  let maxPx = 0, maxM = 0;
  const slots = SLOTS_LOCAL.map((s) => {
    const p = tiers[s.tier].find((q) => q.slot === s.i);
    const wb = platformToWorld(origin, yawDeg, [s.x, s.y, s.z]);
    maxM = Math.max(maxM, dist2(wb[0], wb[2], ph.slotsWorld[s.i][0], ph.slotsWorld[s.i][2]), Math.abs(wb[1] - ph.slotsWorld[s.i][1]));
    const q = nssToPx(reg, wb[0], wb[2]);
    maxPx = Math.max(maxPx, dist2(q.px, q.py, ph.map.slots[s.i][0] * 250, ph.map.slots[s.i][1] * 304));
    return { i: s.i, tier: s.tier, side: p.side, bone: s.bone, fromLeft: p.fromLeft, x: p.x, y: p.y, z: p.z, groundZ: p.groundZ, groundCode: p.groundCode, ground: p.ground };
  });
  if (maxM > 1e-4) refuse(`H${n}: slots ${maxM} m from platform.json's slotsWorld`);
  if (maxPx > SLOT_MAP_PX) refuse(`H${n}: slots ${maxPx.toFixed(3)} px from platform.json's map.slots`);
  const centre = {};
  for (const t of TIERS) { const c = tiers[t].find((q) => q.localX === 0); centre[t] = { x: c.x, y: c.y, z: c.z }; }
  PLATOUT[n] = {
    origin: origin.map((v) => +v.toFixed(6)), yawDeg: f4(yawDeg), forward: forward.map((v) => +v.toFixed(6)), facingDeg: f3(facingDeg) % 360,
    startYawDeg: f4(startYawDeg), startFacingDeg: f3(startFacingDeg) % 360,
    tiers, slots, centre,
    localTee: { x: tees.teeObj.x, y: tees.teeObj.y },
    decoderMapSlots: ph.map.slots, decoderMaxPx: f3(maxPx),
  };
  const stances = TIERS.flatMap((t) => tiers[t]), balls = stances.flatMap((q) => HANDS.map((h) => q.ball[h]));
  const grounds = (list) => { const z = list.map((q) => q.groundZ); return `${Math.min(...z).toFixed(3)}..${Math.max(...z).toFixed(3)} yd (${[...new Set(list.map((q) => q.ground))].join(", ")})`; };
  const dStart = ((startFacingDeg - facingDeg + 540) % 360) - 180;
  slotSummary.push(`H${String(n).padStart(2)} facing ${facingDeg.toFixed(1).padStart(5)} (start ${dStart >= 0 ? "+" : ""}${dStart.toFixed(2)})  slots vs decoder ${maxPx.toFixed(2)} px  ground: stances ${grounds(stances)}, balls ${grounds(balls)}  cups ${cupOut.map((c) => `c${c.k}${c.difficult ? "*" : ""}${c.wsr ? "=" + c.wsr : ""}`).join(" ")}`);
}

if (fails.length) { for (const f of fails) console.error("REFUSED:", f); process.exit(1); }

// ---- write ----------------------------------------------------------------
// every value JSON keeps as it is: no undefined (dropped from a short object,
// written as a bare `undefined` in a long one), NaN or infinity (written as
// null), or other type; a field copied from the dump that a decoder renamed
// lands here
function badValues(v, path, out) {
  if (v === undefined) out.push(`${path}: undefined`);
  else if (typeof v === "number") { if (!Number.isFinite(v)) out.push(`${path}: ${v}`); }
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) badValues(v[i], `${path}[${i}]`, out);
  else if (v !== null && typeof v === "object") { for (const [k, e] of Object.entries(v)) badValues(e, `${path}.${k}`, out); }
  else if (v !== null && typeof v !== "string" && typeof v !== "boolean") out.push(`${path}: a ${typeof v}`);
  return out;
}
// JSON with short arrays and objects on one line (fixed key order, so deterministic)
function fmt(v, ind = "") {
  if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) throw new Error(`fmt: ${v} is not JSON`);
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== "object" || flat.length <= 110) return flat;
  const next = ind + " ";
  if (Array.isArray(v)) return `[\n${v.map((e) => next + fmt(e, next)).join(",\n")}\n${ind}]`;
  return `{\n${Object.entries(v).map(([k, e]) => `${next}${JSON.stringify(k)}: ${fmt(e, next)}`).join(",\n")}\n${ind}}`;
}
const GAME = "NSS 1.5.0";
const outReg = {
  _note: "NSS world -> the app's map frame per hole, and NSS -> WSR KCL mesh units. NSS world: metres, y up, -z toward the green, one frame per hole, y 0 = the WSR player start's height (public/terrain's datum). Map: the 250x304 minimap, px = a*x - b*z + tx, py = b*x + a*z + ty (fractions = px/250, py/304; no flip). a, b, tx, ty: the tree fit of pins.json (NSS tree bones on WSR's PMP trees), copied at full precision; residualPx/residualYd/maxPx over its `points` matched trees; ydPerPxFit = 1 / (sqrt(a^2+b^2) * 0.9144). Mesh: [X, Y, Z] = unitsPerM * [x, y, z] + [originMesh[0], originMeshY, originMesh[1]], unitsPerM 10 (the fit's own unitsPerMFit 9.9979-10.0002 and rotDegFit are kept for audit). One transform for the cups, the platform, the tees and course3d (INTEGRATION.md D1). Read with tools/lib/nssreg.mjs. Generated by tools/nss-export.mjs.",
  source: { game: GAME, pinsJsonSha1: PINS.sha1 },
  holes: REG,
};
const outPins = {
  _note: `NSS's six cups per hole (bones GolfCourseNNholeK of the course model Fld_GolfCourseNN, k = 0..5: the cup bottoms), from the eden dump through tools/nss-registration.json. x, y = map fractions; world = the bone, NSS metres; surfaceY = the green surface over the cup (the top of HoleCover k, the plug that closes cup k while another is in play; ${surfUp[0].toFixed(3)}-${surfUp[1].toFixed(3)} m above the bone; the game sets the flag pin at bone + 0.30), surfaceYd = it in yd above the datum (NSS y 0 = the WSR start's height); mesh = WSR KCL units at the surface; difficult = GolfFieldMgrParam HoleParams[hole-1].CupDifficulties[k] (the game leaves those out of some draws); ydFromWsrStart / ydFromTeeObj = the flat distance from the WSR start / the GlfTeeOBJ bone; nearestWsr = the nearest WSR pin spot (tools/wsr-pins.json, id s<slot>) and wsr = its id when it is within 0.3 yd (the same spot). cover.hub = the centre vertex of the cover's 20-triangle fan, dxzMm its offset from the bone (the collision's vertices sit on a 1/512 m grid). tees: Glf_RotateOBJ (where the online platform stands), GlfTeeOBJ (the local tee bone) and the WSR start (the app's tee for now). Generated by tools/nss-export.mjs.`,
  source: { game: GAME, pinsJsonSha1: PINS.sha1, wsrPinsSha1: WSRP.sha1, collisionSha1: COLSHA },
  holes: PINOUT,
};
const outPlat = {
  _note: "The online tee platform (Survival Golf), decoded from NSS: the actors Object_BGOBJ_GlfStartObj (low tier) and ...High (high tier) posed at the course bone Glf_RotateOBJ, world = origin + Ry(yawDeg) * local with Ry = [[cos,0,sin],[0,1,0],[-sin,0,cos]] and yawDeg the bone's own Euler Y. Platform-local: +z forward (toward the green), +y up, +x the player's LEFT. Slot bones GlfTeeOBJ_1..4 (low, local z +2.0) and _5..8 (high, z -1.5) at x -3.45, -1.15, +1.15, +3.45 m = sides R2, R1, L1, L2; with an odd number of players on a tier a player stands midway between two adjacent bones (x -2.3, 0, +2.3), so standingX lists every x the game uses, from the player's left to the right (which x a player takes for each player count: the eden dump's slots.json, not shipped here). holes[n].tiers.low/high: those 7 positions in that order (fromLeft 0..6). Each position is a STANCE, where the golfer stands (slots.json `stand`): its bone(s), world (NSS metres, y = the mat), x/y map fractions (tools/nss-registration.json), z = the mat in yd above the datum (NSS y 0 = the WSR start's height = public/terrain's datum; the mats are 0.0996 / 1.668 m up, the deck's 0.117 / 1.686 m faces are only its bevelled rim), and groundZ / groundCode / ground = the NSS field collision's top ground under the stance (yd above the datum; null where none). Its `ball` is the tee spot, the ball's start: rightHanded / leftHanded = the stance moved along platform-local x by ballOffsetM (applied before the platform transform: a right-hander's ball 0.9 m to his right, a left-hander's 0.9 m to his left; main 0x2ef29f0 / 0x2ef29fc, slots.md section 5; that this point is the GolfBall's start is inferred there, not yet seen in RAM), each with its localX, world, x/y, z (the mat under the ball, the contact height) and the ground under the ball, which can differ from the stance's (H1: the stance at -2.3 is over fairway, its right-handed ball over GolfOB). facingDeg = the map bearing (north-up, clockwise) of the platform's local +z, the row's orientation (it orders L2 .. R2 and puts the high tier behind the low), not the start aim; forward = local +z as a world (x, z) direction. startFacingDeg = the map bearing of GlfTeeOBJ's local +z (its yaw startYawDeg): the golfer's start rotation in platform mode is the course GlfTeeOBJ's, not the platform's (eden verify/slots-verdicts.json), up to 10 deg off facingDeg. slots = the 8 bones in bone order (i 0-7) with their sides (stances); centre = local x 0 per tier (stance); localTee = GlfTeeOBJ. decoderMapSlots = platform.json's own map points (its tree-ICP + mesh-registration path, decoderMaxPx from these). Generated by tools/nss-export.mjs.",
  source: { game: GAME, platformJsonSha1: PLAT.sha1, slotsJsonSha1: SLOTS.sha1, pinsJsonSha1: PINS.sha1, objectsSha1: OBJ_SHA, collisionSha1: COLSHA },
  standingX: STANDING_X,
  ballOffsetM: { rightHanded: BALL_OFFSET.rightHanded, leftHanded: BALL_OFFSET.leftHanded },
  tiers: Object.fromEntries(TIERS.map((t) => [t, { actor: TIER_ACTOR[t], localZ: TIER_Z[t], boneY: TIER_BONE_Y[t], matY: MAT_Y[t], rimY: PL.tierOffset.deckTopsY[t], bones: SLOTS_LOCAL.filter((s) => s.tier === t).map((s) => s.bone) }])),
  slotsLocal: SLOTS_LOCAL.map((s) => ({ i: s.i, tier: s.tier, side: SLOT_SIDE[s.i % 4], bone: s.bone, x: s.x, y: s.y, z: s.z })),
  oddCountPositionsX: PL.oddCountPositionsX,
  slotRule: PL.slotRule,
  tierOffset: { backM: f4(TIER_Z.low - TIER_Z.high), upM: +(TIER_BONE_Y.high - TIER_BONE_Y.low).toFixed(6), matUpM: +(MAT_Y.high - MAT_Y.low).toFixed(9), backYd: f4((TIER_Z.low - TIER_Z.high) / M_PER_YD), upYd: f4((MAT_Y.high - MAT_Y.low) / M_PER_YD) },
  holes: PLATOUT,
};
const files = [["nss-registration.json", outReg], ["nss-pins.json", outPins], ["nss-platform.json", outPlat]];
// check every file before writing any: JSON values only, and the text parses back to the object
const texts = [];
for (const [name, obj] of files) {
  for (const b of badValues(obj, name, [])) refuse(`${b} (not JSON)`);
  if (fails.length) continue;
  const text = fmt(obj) + "\n";
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(obj)) refuse(`${name}: the formatted text does not parse back to the object`);
  texts.push([name, text]);
}
if (fails.length) { for (const f of fails) console.error("REFUSED:", f); process.exit(1); }
mkdirSync(opt.outDir, { recursive: true });
for (const [name, text] of texts) writeFileSync(join(opt.outDir, name), text);
for (const l of slotSummary) console.log(l);
console.log(`ground reads decided by a tie between two codes (nsscol TIE_ORDER): ${ties.length}${ties.length ? ` (${ties.join("; ")})` : ""}`);
console.log(`mats: low ${MAT_Y.low} m, high ${MAT_Y.high} m (${Object.entries(MAT_Y).map(([t, y]) => `${t} ${(y / M_PER_YD).toFixed(4)} yd`).join(", ")})`);
console.log(`wrote ${files.map(([n]) => join(opt.outDir, n)).join(", ")}`);
