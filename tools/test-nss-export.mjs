// node tools/test-nss-export.mjs [--src tools/harness/state/eden/nss-golf-x]
// Acceptance for tools/nss-export.mjs and its readers (tools/lib/nssreg.mjs,
// tools/lib/nsscol.mjs) on the committed tools/nss-registration.json,
// nss-pins.json and nss-platform.json:
//  1. the registration: 21 holes, unitsPerM 10, yd/px against the fit and
//     derived.json's scale, nssToMap(mapToNss(p)) = p and meshToNss(nssToMesh(p))
//     = p to 1e-9, bearings, the platform frame (local +x = the player's left)
//  2. the cups: six per hole, k 0-5; `difficult` on exactly the 16
//     CupDifficulties cups, `wsr` on exactly the 7 that are WSR spots (each
//     within 0.3 yd of that spot in tools/wsr-pins.json, every other cup
//     further); x/y = the world through the registration; every cup inside
//     derived.json's greenPoly; mesh = the surface point through the mesh
//     offset, and through tools/mesh-registration.json's meshToMapFrac (an
//     independent path, 100-560 yd from the origin) within 0.1 px of x/y; the
//     surface 0.29-0.345 m over the bone; the cover hub within 4 mm; the
//     yardages from the WSR start and GlfTeeOBJ; the WSR start (from
//     tools/wsr-pins.json) within 0.2 px of its own map point and at y 0
//  3. the platform: 7 standing x per tier from the player's left (3.45 .. -3.45 m:
//     the four slot bones and the three midpoints), each placed by origin +
//     Ry(yaw) * local through the registration; neighbours 1.15 m apart and the
//     bones 2.3 m (2.515 yd via derived.json's scale, +-0.05); the high tier
//     3.5 m behind the low along facingDeg; z = the mats (0.0996 / 1.668 m, not
//     the 0.117 / 1.686 rim): 0.1089 / 1.8241 yd, +0.1094 on H3; left-to-right
//     order on every map (slot 0 = R2 the rightmost, slot 3 = L2 the leftmost);
//     the 8 bones within 0.8 px of the decoder's own map points; ground under
//     every position; every stance (10 * world + O) through mesh-registration.json
//     within 0.02 px; per stance its two balls (ballOffsetM -0.9 / +0.9 m along
//     local x): placed by the same pose, 0.9 m to the right (right-handed) or
//     left of the stance across facingDeg, on the same mat, with a ground of
//     their own, within 0.02 px through mesh-registration.json; startFacingDeg
//     = GlfTeeOBJ's yaw on the map, within 10.5 deg of facingDeg
//  4. nsscol on synthetic meshes: topGround's codes, ties and misses (TIE_ORDER
//     over the triangle index: coincident rock / sand OB with sand OB the
//     higher index, a tie within TIE_M and one beyond it, one code twice, a
//     shared edge, an unlisted code), rayHits' first hit = topGround's; the
//     grid against a brute-force ray over 2,000 rays, and with a bbox over a
//     mesh with doubled triangles and a 40 km sea; readMeshBin and
//     loadCollision (covers appended, the water extra appended, a missing
//     leaf listed) through files in a temp dir
//  5. with the dump present: a fresh export is identical to the committed
//     files (line ends aside: core.autocrlf may check them out CRLF; an export
//     that fails is a FAIL line), their source SHA-1s are the dump's;
//     slots.json's 399 stands are the stances (1e-4 px) and its 798 balls the
//     balls (0.002 px, heights 1e-4 yd); and on every hole, with H3's sea, the
//     ground at the WSR start, Glf_RotateOBJ and GlfTeeOBJ is 0.000 m fairway,
//     each cup's top ground is its own cover at the shipped surface, and the
//     ground under every stance and ball is the shipped one, not a tie
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { regOf, nssToMap, mapToNss, nssToMesh, meshToNss, ydPerPx, pxPerM, bearingOf, platformToWorld, M_PER_YD } from "./lib/nssreg.mjs";
import { readMeshBin, loadCollision, gridIndex, topGround, rayHits, GROUND_CODES, TIE_ORDER, TIE_M } from "./lib/nsscol.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let SRC = join(ROOT, "tools/harness/state/eden/nss-golf-x");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--src") SRC = resolve(argv[++i]);
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL:", msg); } };
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const REG = J("tools/nss-registration.json"), PINS = J("tools/nss-pins.json"), PLAT = J("tools/nss-platform.json");
const WSRP = J("tools/wsr-pins.json"), DER = J("public/derived.json"), MREG = J("tools/mesh-registration.json");
// an independent path from WSR mesh units to the map: tools/mesh-registration.json's
// per-hole meshToMapFrac (fitted on the WSR meshes, not through nss-registration)
const meshFrac = (n, X, Z) => { const M = MREG.holes[n].meshToMapFrac; return { x: M[0][0] * X + M[0][1] * Z + M[0][2], y: M[1][0] * X + M[1][1] * Z + M[1][2] }; };
const HOLES = Array.from({ length: 21 }, (_, i) => i + 1);
const d2 = (ax, az, bx, bz) => Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
const r5 = (v) => +v.toFixed(5);
const pxDist = (p, q) => Math.sqrt(((p.x - q.x) * 250) ** 2 + ((p.y - q.y) * 304) ** 2);
// a deterministic generator (the test's own random cases)
let seed = 0x2f6b1c3d;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- 1. registration -------------------------------------------------------
ok(Object.keys(REG.holes).join() === HOLES.join(), "nss-registration: holes 1-21");
for (const n of HOLES) {
  const R = regOf(REG, n);
  ok(["a", "b", "tx", "ty", "originMeshY"].every((k) => Number.isFinite(R[k])) && R.originMesh.length === 2 && R.unitsPerM === 10, `H${n}: registration fields`);
  ok(Math.abs(ydPerPx(R) - R.ydPerPxFit) < 2e-4, `H${n}: yd/px ${ydPerPx(R)} against the fit's ${R.ydPerPxFit}`);
  ok(Math.abs(ydPerPx(R) - DER.holes[n].scale) < 2e-3, `H${n}: yd/px ${ydPerPx(R).toFixed(5)} against derived.json's ${DER.holes[n].scale}`);
  let worst = 0, worstM = 0;
  for (let i = 0; i < 200; i++) {
    const p = { x: rnd() * 1.4 - 0.2, y: rnd() * 1.4 - 0.2 };
    const [x, z] = mapToNss(R, p.x, p.y), q = nssToMap(R, x, z);
    worst = Math.max(worst, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    const w = [rnd() * 800 - 400, rnd() * 100 - 50, rnd() * 800 - 600], b = meshToNss(R, nssToMesh(R, w));
    worstM = Math.max(worstM, ...w.map((v, k) => Math.abs(v - b[k])));
  }
  ok(worst <= 1e-9, `H${n}: nssToMap(mapToNss(p)) off by ${worst}`);
  ok(worstM <= 1e-9, `H${n}: meshToNss(nssToMesh(p)) off by ${worstM}`);
  // -z is toward the green, map up: bearing ~0 (the fit's rotation is under 0.3 deg)
  const b0 = bearingOf(R, 0, -1);
  ok(Math.min(b0, 360 - b0) < 0.3, `H${n}: NSS -z bears ${b0} deg on the map, not north`);
  ok(Math.abs(bearingOf(R, 1, 0) - 90) < 0.3, `H${n}: NSS +x bears ${bearingOf(R, 1, 0)}, not east`);
}
{
  // the platform frame on an identity-like map: yaw 180 faces -z (map up); local +x is the player's left (map west)
  const R = { a: 1, b: 0, tx: 0, ty: 0 };
  const f = platformToWorld([0, 0, 0], 180, [0, 0, 1]), l = platformToWorld([0, 0, 0], 180, [1, 0, 0]);
  ok(Math.abs(bearingOf(R, f[0], f[2])) < 1e-9 || Math.abs(bearingOf(R, f[0], f[2]) - 360) < 1e-9, "platform yaw 180 faces map up");
  ok(Math.abs(bearingOf(R, l[0], l[2]) - 270) < 1e-9, "platform local +x is the player's left (west, facing north)");
  const g = platformToWorld([1, 2, 3], 90, [1, 0.5, 2]);   // yaw 90: +z -> +x, +x -> -z
  ok(Math.abs(g[0] - 3) < 1e-12 && Math.abs(g[1] - 2.5) < 1e-12 && Math.abs(g[2] - 2) < 1e-12, `platformToWorld yaw 90: ${g}`);
}

// ---- 2. cups ------------------------------------------------------------------
const DIFFICULT = { 5: [4], 6: [5], 7: [4], 8: [3], 9: [2], 14: [5], 16: [0, 4], 17: [0], 18: [3], 19: [1, 5], 20: [2, 4], 21: [0, 5] };
const WSR_SAME = { 3: { 1: "s1" }, 7: { 2: "s3" }, 9: { 0: "s1" }, 11: { 0: "s0" }, 13: { 0: "s0" }, 16: { 3: "s2" }, 18: { 0: "s0" } };
ok(Object.keys(PINS.holes).join() === HOLES.join(), "nss-pins: holes 1-21");
let nDiff = 0, nWsr = 0, minOther = Infinity, maxSame = 0, maxHubMm = 0, surf = [Infinity, -Infinity], maxStartPx = 0, maxCupMeshPx = 0;
for (const n of HOLES) {
  const R = regOf(REG, n), h = PINS.holes[n], dh = DER.holes[n], wh = WSRP.holes[n];
  ok([3, 4, 5].includes(h.par), `H${n}: par ${h.par}`);
  ok(h.cups.length === 6 && h.cups.every((c, i) => c.k === i), `H${n}: six cups k 0-5`);
  // the WSR start and the tee bones
  const ws = h.tees.wsrStart, s0 = wh.starts[0];
  ok(ws.x === s0.x && ws.y === s0.y && ws.mesh.join() === s0.mesh.join(), `H${n}: tees.wsrStart is wsr-pins.json's start`);
  const wsw = meshToNss(R, s0.mesh);
  ok(ws.world.every((v, k) => Math.abs(v - wsw[k]) <= 6e-5), `H${n}: wsrStart.world ${ws.world} against ${wsw}`);
  const startPx = pxDist(nssToMap(R, wsw[0], wsw[2]), ws);
  maxStartPx = Math.max(maxStartPx, startPx);
  ok(startPx <= 0.2, `H${n}: the WSR start maps ${startPx.toFixed(3)} px from its own map point`);
  ok(Math.abs(wsw[1]) <= 0.013, `H${n}: the WSR start at NSS y ${wsw[1]}, not the datum`);
  for (const b of ["rotateObj", "teeObj"]) {
    const t = h.tees[b], p = nssToMap(R, t.world[0], t.world[2]);
    ok(Math.abs(r5(p.x) - t.x) <= 1e-5 && Math.abs(r5(p.y) - t.y) <= 1e-5, `H${n}: tees.${b} map point`);
  }
  const spots = wh.spots.map((s) => ({ id: `s${s.slots[0]}`, w: meshToNss(R, s.mesh) }));
  for (const c of h.cups) {
    const tag = `H${n} c${c.k}`;
    const p = nssToMap(R, c.world[0], c.world[2]);
    ok(Math.abs(r5(p.x) - c.x) <= 1e-5 && Math.abs(r5(p.y) - c.y) <= 1e-5, `${tag}: x/y ${c.x},${c.y} against the world through the registration ${p.x},${p.y}`);
    ok(inPoly(dh.greenPoly, c.x, c.y), `${tag}: outside derived.json's greenPoly`);
    const want = (DIFFICULT[n] || []).includes(c.k);
    ok(c.difficult === want, `${tag}: difficult ${c.difficult}, want ${want}`);
    nDiff += c.difficult ? 1 : 0;
    const same = WSR_SAME[n]?.[c.k] ?? null;
    ok(c.wsr === same, `${tag}: wsr ${c.wsr}, want ${same}`);
    let near = Infinity;
    for (const s of spots) near = Math.min(near, d2(c.world[0], c.world[2], s.w[0], s.w[2]) / M_PER_YD);
    if (same) {
      nWsr++;
      const s = spots.find((q) => q.id === same), yd = d2(c.world[0], c.world[2], s.w[0], s.w[2]) / M_PER_YD;
      maxSame = Math.max(maxSame, yd);
      ok(yd <= 0.3, `${tag}: ${yd.toFixed(3)} yd from WSR ${same}`);
    } else minOther = Math.min(minOther, near);
    ok(Math.abs(c.nearestWsr.yd - near) <= 0.006, `${tag}: nearestWsr ${c.nearestWsr.yd} yd against ${near}`);
    const m = nssToMesh(R, [c.world[0], c.surfaceY, c.world[2]]);
    ok(m.every((v, k) => Math.abs(v - c.mesh[k]) <= 2e-3), `${tag}: mesh ${c.mesh} against ${m}`);
    // the mesh point 100-560 yd out, where a scale or rotation error in the offset would show
    const viaMesh = pxDist(meshFrac(n, c.mesh[0], c.mesh[2]), c);
    maxCupMeshPx = Math.max(maxCupMeshPx, viaMesh);
    ok(viaMesh <= 0.1, `${tag}: mesh ${c.mesh} through mesh-registration.json lands ${viaMesh.toFixed(3)} px from x/y`);
    const up = c.surfaceY - c.world[1];
    surf = [Math.min(surf[0], up), Math.max(surf[1], up)];
    ok(up >= 0.29 && up <= 0.345, `${tag}: surface ${up.toFixed(4)} m over the bone`);
    ok(Math.abs(c.surfaceYd - c.surfaceY / M_PER_YD) <= 1e-4, `${tag}: surfaceYd`);
    maxHubMm = Math.max(maxHubMm, c.cover.dxzMm);
    ok(c.cover.dxzMm <= 4 && Math.abs(d2(c.cover.hub[0], c.cover.hub[2], c.world[0], c.world[2]) * 1000 - c.cover.dxzMm) <= 0.2, `${tag}: cover hub ${c.cover.dxzMm} mm`);
    ok(Math.abs(c.ydFromWsrStart - d2(c.world[0], c.world[2], ws.world[0], ws.world[2]) / M_PER_YD) <= 0.01, `${tag}: ydFromWsrStart`);
    ok(Math.abs(c.ydFromTeeObj - d2(c.world[0], c.world[2], h.tees.teeObj.world[0], h.tees.teeObj.world[2]) / M_PER_YD) <= 0.01, `${tag}: ydFromTeeObj`);
  }
}
ok(nDiff === 16, `${nDiff} difficult cups, not 16`);
ok(nWsr === 7, `${nWsr} cups on WSR spots, not 7`);
ok(minOther > 0.3, `a cup not marked as a WSR spot is ${minOther} yd from one`);
console.log(`cups: 126; difficult ${nDiff}; on WSR spots ${nWsr} (0.00-${maxSame.toFixed(2)} yd; the nearest other cup ${minOther.toFixed(2)} yd); surface ${surf[0].toFixed(3)}-${surf[1].toFixed(3)} m over the bone; cover hubs <= ${maxHubMm} mm; WSR start <= ${maxStartPx.toFixed(3)} px; mesh through mesh-registration.json <= ${maxCupMeshPx.toFixed(3)} px`);

// ---- 3. platform ------------------------------------------------------------
const SX = [3.45, 2.3, 1.15, 0, -1.15, -2.3, -3.45], SIDE = ["R2", "R1", "L1", "L2"];
ok(PLAT.standingX.join() === SX.join(), `standingX ${PLAT.standingX}`);
const T = PLAT.tiers;
ok(Math.abs(T.low.matY - 0.0996) < 1e-4 && Math.abs(T.high.matY - 1.668) < 1e-3, `mats at ${T.low.matY} / ${T.high.matY} m`);
ok(T.low.rimY - T.low.matY > 0.015 && T.high.rimY - T.high.matY > 0.015, "the mats are not the deck's rim");
ok(T.low.localZ === 2 && T.high.localZ === -1.5 && T.low.boneY === 0.1 && T.high.boneY === 1.668244, "tier rows: z 2.0 / -1.5, bones at y 0.1 / 1.668244");
ok(PLAT.slotsLocal.length === 8 && PLAT.slotsLocal.every((s, i) => s.i === i && s.side === SIDE[i % 4] && s.bone === `GlfTeeOBJ_${i + 1}` && s.tier === (i < 4 ? "low" : "high") && s.x === [-3.45, -1.15, 1.15, 3.45][i % 4]), "slotsLocal: GlfTeeOBJ_1..8 = R2 R1 L1 L2 per tier at x -3.45 .. 3.45");
ok(Math.abs(PLAT.tierOffset.backM - 3.5) < 1e-9 && Math.abs(PLAT.tierOffset.backYd - 3.8276) < 1e-4, "tier offset 3.5 m = 3.83 yd back");
ok(Object.keys(PLAT.holes).join() === HOLES.join(), "nss-platform: holes 1-21");
// the ball: the stance moved 0.9 m along local x (slots.json ballOffset), to the player's right for a right-hander
const HANDS = ["rightHanded", "leftHanded"], OFF = { rightHanded: -0.9, leftHanded: 0.9 };
ok(JSON.stringify(PLAT.ballOffsetM) === JSON.stringify(OFF), `ballOffsetM ${JSON.stringify(PLAT.ballOffsetM)}`);
const lines = [];
let maxDec = 0, spacing = [Infinity, -Infinity], backs = [Infinity, -Infinity], maxPosMeshPx = 0, ballSide = [Infinity, -Infinity], startDev = [];
let groundSplit = 0;
for (const n of HOLES) {
  const R = regOf(REG, n), H = PLAT.holes[n], tees = PINS.holes[n].tees, sc = DER.holes[n].scale, ppm = pxPerM(R);
  ok(H.origin.every((v, k) => Math.abs(v - tees.rotateObj.world[k]) <= 1e-4) && Math.abs(H.yawDeg - tees.rotateObj.yawDeg) <= 1e-4, `H${n}: the platform is not posed at Glf_RotateOBJ with its own yaw`);
  const yr = (H.yawDeg * Math.PI) / 180;
  ok(Math.abs(H.forward[0] - Math.sin(yr)) < 1e-5 && Math.abs(H.forward[1] - Math.cos(yr)) < 1e-5, `H${n}: forward`);
  const fb = bearingOf(R, H.forward[0], H.forward[1]), dfb = Math.abs(((fb - H.facingDeg + 540) % 360) - 180);
  ok(dfb < 2e-3, `H${n}: facingDeg ${H.facingDeg} against ${fb}`);
  // the start's rotation: GlfTeeOBJ's yaw, within 10.5 deg of the row's
  const sy = (tees.teeObj.yawDeg * Math.PI) / 180, sb = bearingOf(R, Math.sin(sy), Math.cos(sy));
  ok(H.startYawDeg === tees.teeObj.yawDeg && Math.abs(((sb - H.startFacingDeg + 540) % 360) - 180) < 2e-3, `H${n}: startFacingDeg ${H.startFacingDeg} (yaw ${H.startYawDeg}) against GlfTeeOBJ's ${sb} (yaw ${tees.teeObj.yawDeg})`);
  const dStart = ((H.startFacingDeg - H.facingDeg + 540) % 360) - 180;
  startDev.push([n, dStart]);
  ok(H.startFacingDeg >= 0 && H.startFacingDeg < 360 && Math.abs(dStart) <= 10.5, `H${n}: the start faces ${dStart.toFixed(2)} deg off the row`);
  ok(H.localTee.x === tees.teeObj.x && H.localTee.y === tees.teeObj.y, `H${n}: localTee is GlfTeeOBJ`);
  const br = (H.facingDeg * Math.PI) / 180, fwd = [Math.sin(br), -Math.cos(br)], right = [Math.cos(br), Math.sin(br)];   // map px, y down
  const zLow = (H.origin[1] + T.low.matY) / M_PER_YD, zHigh = (H.origin[1] + T.high.matY) / M_PER_YD;
  for (const t of ["low", "high"]) {
    const row = H.tiers[t];
    ok(row.length === 7 && row.every((q, i) => q.fromLeft === i && q.localX === SX[i]), `H${n} ${t}: 7 positions from the left`);
    row.forEach((q, i) => {
      const tag = `H${n} ${t} #${i}`;
      const j = [-3.45, -1.15, 1.15, 3.45].indexOf(q.localX), base = t === "low" ? 0 : 4;
      if (j >= 0) ok(q.side === SIDE[j] && q.slot === base + j && q.bones.join() === `GlfTeeOBJ_${base + j + 1}` && q.between === undefined, `${tag}: bone ${q.side} ${q.slot} ${q.bones}`);
      else {
        const a = [-3.45, -1.15, 1.15, 3.45].findIndex((b) => b > q.localX);
        ok(q.side === undefined && q.slot === undefined && q.between.join() === [SIDE[a], SIDE[a - 1]].join() && q.bones.join() === [`GlfTeeOBJ_${base + a + 1}`, `GlfTeeOBJ_${base + a}`].join(), `${tag}: midpoint ${q.between} ${q.bones}`);
      }
      const w = platformToWorld(H.origin, H.yawDeg, [q.localX, T[t].matY, T[t].localZ]);
      ok(w.every((v, k) => Math.abs(v - q.world[k]) <= 2e-4), `${tag}: world ${q.world} against ${w}`);
      const p = nssToMap(R, w[0], w[2]);
      ok(Math.abs(p.x - q.x) <= 1e-5 && Math.abs(p.y - q.y) <= 1e-5, `${tag}: map ${q.x},${q.y} against ${p.x},${p.y}`);
      ok(Math.abs(q.z - (t === "low" ? zLow : zHigh)) <= 1e-4, `${tag}: z ${q.z}`);
      ok(q.groundZ !== null && GROUND_CODES.has(q.groundCode) && typeof q.ground === "string", `${tag}: no ground under it`);
      // the stance through the WSR mesh units and mesh-registration.json (an independent path)
      const viaMesh = pxDist(meshFrac(n, 10 * q.world[0] + R.originMesh[0], 10 * q.world[2] + R.originMesh[1]), q);
      maxPosMeshPx = Math.max(maxPosMeshPx, viaMesh);
      ok(viaMesh <= 0.02, `${tag}: through mesh-registration.json ${viaMesh.toFixed(4)} px off`);
      // the ball, per hand
      ok(q.ball && JSON.stringify(Object.keys(q.ball)) === JSON.stringify(HANDS), `${tag}: ball ${q.ball && Object.keys(q.ball)}`);
      for (const h of HANDS) {
        const b = q.ball?.[h], bt = `${tag} ${h} ball`;
        if (!b) continue;
        ok(Math.abs(b.localX - (q.localX + OFF[h])) <= 1e-9, `${bt}: local x ${b.localX}`);
        const bw = platformToWorld(H.origin, H.yawDeg, [q.localX + OFF[h], T[t].matY, T[t].localZ]);
        ok(bw.every((v, k) => Math.abs(v - b.world[k]) <= 2e-4), `${bt}: world ${b.world} against ${bw}`);
        const bp = nssToMap(R, bw[0], bw[2]);
        ok(Math.abs(bp.x - b.x) <= 1e-5 && Math.abs(bp.y - b.y) <= 1e-5, `${bt}: map ${b.x},${b.y} against ${bp.x},${bp.y}`);
        ok(b.z === q.z, `${bt}: z ${b.z}, the stance's ${q.z}`);
        ok(b.groundZ !== null && GROUND_CODES.has(b.groundCode) && typeof b.ground === "string", `${bt}: no ground under it`);
        if (b.ground !== q.ground) groundSplit++;
        // 0.9 m across the facing, to the right for a right-hander (the right on a y-down map is (cos, sin) of the bearing)
        const dx = (b.x - q.x) * 250, dy = (b.y - q.y) * 304;
        const across = (dx * right[0] + dy * right[1]) / ppm, along = (dx * fwd[0] + dy * fwd[1]) / ppm;
        const want = h === "rightHanded" ? 0.9 : -0.9;
        ballSide = [Math.min(ballSide[0], across * Math.sign(want)), Math.max(ballSide[1], across * Math.sign(want))];
        ok(Math.abs(across - want) <= 0.01 && Math.abs(along) <= 0.01, `${bt}: ${across.toFixed(3)} m to the right of the stance, ${along.toFixed(3)} m along`);
        const bm = pxDist(meshFrac(n, 10 * b.world[0] + R.originMesh[0], 10 * b.world[2] + R.originMesh[1]), b);
        maxPosMeshPx = Math.max(maxPosMeshPx, bm);
        ok(bm <= 0.02, `${bt}: through mesh-registration.json ${bm.toFixed(4)} px off`);
      }
    });
    // left to right on the map, 1.15 m apart; bones 2.3 m = 2.515 yd through derived.json's scale
    const proj = row.map((q) => q.x * 250 * right[0] + q.y * 304 * right[1]);
    ok(proj.every((v, i) => i === 0 || v > proj[i - 1]), `H${n} ${t}: not left to right on the map`);
    for (let i = 1; i < 7; i++) {
      const yd = pxDist(row[i], row[i - 1]) * sc;
      spacing = [Math.min(spacing[0], yd), Math.max(spacing[1], yd)];
      ok(Math.abs(yd - 1.15 / M_PER_YD) <= 0.03, `H${n} ${t}: positions ${i - 1}-${i} ${yd.toFixed(3)} yd apart`);
    }
    for (let i = 2; i < 7; i += 2) ok(Math.abs(pxDist(row[i], row[i - 2]) * sc - 2.515) <= 0.05, `H${n} ${t}: bones ${pxDist(row[i], row[i - 2]) * sc} yd apart`);
  }
  ok(Math.abs(H.tiers.low[0].z - (n === 3 ? 0.2183 : 0.1089)) <= 1e-4 && Math.abs(H.tiers.high[0].z - (n === 3 ? 1.9335 : 1.8241)) <= 1e-4, `H${n}: mats at ${H.tiers.low[0].z} / ${H.tiers.high[0].z} yd`);
  // the high tier 3.5 m straight behind the low one along the facing
  for (let i = 0; i < 7; i++) {
    const lo = H.tiers.low[i], hi = H.tiers.high[i], dx = (hi.x - lo.x) * 250, dy = (hi.y - lo.y) * 304;
    const along = (dx * fwd[0] + dy * fwd[1]) / ppm, across = (dx * right[0] + dy * right[1]) / ppm;
    backs = [Math.min(backs[0], along), Math.max(backs[1], along)];
    ok(Math.abs(along + 3.5) <= 0.01 && Math.abs(across) <= 0.01, `H${n} #${i}: high tier ${along.toFixed(3)} m along, ${across.toFixed(3)} across the low`);
  }
  // the 8 bones: right to left within a tier (SLOT_SIDE), on the tier rows, within 0.8 px of the decoder's points
  ok(H.slots.length === 8, `H${n}: 8 slots`);
  const cx = H.centre.low.x * 250, cy = H.centre.low.y * 304;
  H.slots.forEach((s, i) => {
    const t = i < 4 ? "low" : "high", q = H.tiers[t][6 - 2 * (i % 4)];
    ok(s.i === i && s.tier === t && s.side === SIDE[i % 4] && s.bone === `GlfTeeOBJ_${i + 1}` && s.fromLeft === 6 - 2 * (i % 4) && s.x === q.x && s.y === q.y && s.z === q.z && s.groundZ === q.groundZ && s.ground === q.ground, `H${n} slot ${i}`);
    const wb = platformToWorld(H.origin, H.yawDeg, [PLAT.slotsLocal[i].x, PLAT.slotsLocal[i].y, PLAT.slotsLocal[i].z]);
    const dec = { x: H.decoderMapSlots[i][0], y: H.decoderMapSlots[i][1] }, pd = pxDist(nssToMap(R, wb[0], wb[2]), dec);
    maxDec = Math.max(maxDec, pd);
    ok(pd <= 0.8, `H${n} slot ${i}: ${pd.toFixed(3)} px from the decoder's point`);
  });
  const side = (s) => (s.x * 250 - cx) * right[0] + (s.y * 304 - cy) * right[1];
  ok(side(H.slots[0]) > 0 && side(H.slots[1]) > 0 && side(H.slots[2]) < 0 && side(H.slots[3]) < 0, `H${n}: R2 R1 not right of the facing line or L1 L2 not left`);
  ok(["low", "high"].every((t) => ["x", "y", "z"].every((k) => H.centre[t][k] === H.tiers[t][3][k])), `H${n}: centre = local x 0`);
  const grounds = [...new Set(["low", "high"].flatMap((t) => H.tiers[t].map((q) => `${q.ground} ${q.groundZ}`)))];
  lines.push(`H${String(n).padStart(2)} facing ${H.facingDeg.toFixed(1).padStart(5)}  decoder ${H.decoderMaxPx.toFixed(2)} px  ground ${grounds.join(", ")}`);
}
for (const l of lines) console.log(l);
console.log(`platform: neighbours ${spacing[0].toFixed(3)}-${spacing[1].toFixed(3)} yd apart (1.15 m = ${(1.15 / M_PER_YD).toFixed(3)}); high tier ${backs[0].toFixed(4)}..${backs[1].toFixed(4)} m along; bones <= ${maxDec.toFixed(3)} px from the decoder's; stances and balls <= ${maxPosMeshPx.toFixed(4)} px through mesh-registration.json`);
console.log(`balls: ${21 * 2 * 7 * 2}, each ${ballSide[0].toFixed(4)}..${ballSide[1].toFixed(4)} m to its hand's side of the stance; ${groundSplit} on another ground than their stance`);
console.log(`start rotation (GlfTeeOBJ) against the row (Glf_RotateOBJ): ${startDev.filter(([, d]) => Math.abs(d) >= 4).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([n, d]) => `H${n} ${d >= 0 ? "+" : ""}${d.toFixed(2)}`).join(", ")} deg (the others under 4)`);

// ---- 4. nsscol, synthetic --------------------------------------------------
function meshOf(tris) {   // tris: [[[x,y,z] x3], code]
  const verts = new Float32Array(tris.length * 9), idx = new Uint32Array(tris.length * 3), surface = new Uint8Array(tris.length), material = new Uint8Array(tris.length);
  tris.forEach(([p, code], t) => { p.forEach((v, k) => { verts.set(v, (t * 3 + k) * 3); idx[t * 3 + k] = t * 3 + k; }); surface[t] = code; });
  return { nv: tris.length * 3, nt: tris.length, verts, tris: idx, surface, material };
}
{
  const sq = (y, code, x0 = 0, x1 = 10) => [[[[x0, y, 0], [x1, y, 0], [x1, y, 10]], code], [[[x0, y, 0], [x1, y, 10], [x0, y, 10]], code]];
  const m = meshOf([
    ...sq(0, 5),                                              // 0-1 fairway at 0
    [[[2, 1, 2], [4, 1, 2], [2, 1, 4]], 6],                   // 2 rough at 1, small
    [[[-10, 5, -10], [30, 5, -10], [-10, 5, 30]], 25],        // 3 a leaf at 5 over it all (rays pass)
    [[[0, 0, 5], [10, 0, 5], [10, 3, 5]], 32],                // 4 a wall: no xz area
    [[[6, 2, 6], [9, 2, 6], [6, 2, 9]], 32],                  // 5 rock at 2
    [[[6, 2, 6], [6, 2, 9], [9, 2, 6]], 36],                  // 6 the same triangle reversed, sand OB
    [[[0, -1, 0], [1, -1, 0], [0, -1, 1]], 37],               // 7 a tree code under the ground
  ]);
  const idx = gridIndex(m, 3, { codes: GROUND_CODES });
  const g = (x, z) => topGround(idx, x, z);
  ok(g(1, 1)?.code === 5 && g(1, 1).y === 0 && g(1, 1).tri === 0, `topGround: fairway under the leaf (${JSON.stringify(g(1, 1))})`);
  ok(g(2.5, 2.5)?.code === 6 && Math.abs(g(2.5, 2.5).y - 1) < 1e-6, "topGround: the rough above the fairway");
  // coincident rock (lower index) and sand OB (higher): TIE_ORDER, not the index, decides
  ok(g(7, 7)?.code === 36 && g(7, 7).tri === 6 && g(7, 7).tie === true, `topGround: coincident rock / sand OB go to sand OB, the higher index (${JSON.stringify(g(7, 7))})`);
  ok(g(1, 1).tie === false && g(2.5, 2.5).tie === false, "topGround: no tie flagged where one surface is on top");
  ok(g(-1, 5) === null && g(11, 11) === null && g(50, 50) === null, "topGround: no ground off the mesh");
  ok(g(10, 10)?.code === 5, "topGround: a corner of the square hits (edge tolerance)");
  const all = rayHits(gridIndex(m, 3), 7, 6.5);
  ok(all.map((h) => h.tri).join() === "3,6,5,0", `rayHits: leaf, then sand OB before the coincident rock, then fairway (${all.map((h) => h.tri)})`);
  ok(topGround(gridIndex(m, 3), 0.2, 0.2, null).tri === 3 && topGround(gridIndex(m, 3), 0.2, 0.2, new Set([37])).y === -1, "topGround: codes null takes every code; a code set filters");
  ok(TIE_ORDER.length === new Set(TIE_ORDER).size && [...GROUND_CODES].every((c) => TIE_ORDER.includes(c)) && TIE_ORDER.indexOf(8) < TIE_ORDER.indexOf(32) && TIE_ORDER.indexOf(10) < TIE_ORDER.indexOf(32) && TIE_ORDER.indexOf(36) < TIE_ORDER.indexOf(32) && TIE_ORDER.indexOf(18) < TIE_ORDER.indexOf(30) && TIE_ORDER.indexOf(18) < TIE_ORDER.indexOf(31), "TIE_ORDER: every ground code once; water / OB / sand OB over rock; green over the cup's wall and bottom");
  // ties within TIE_M, beyond it, of one code, on a shared edge, and an unlisted code
  const box = (x0, y, code, flip = false) => [[[x0, y, 0], ...(flip ? [[x0, y, 2], [x0 + 2, y, 0]] : [[x0 + 2, y, 0], [x0, y, 2]])], code];
  const t2 = meshOf([
    box(0, 3, 5), box(0, 3 - 0.5 * TIE_M, 10, true),          // 0 fairway, 1 OB 0.5 um under it: one height, OB
    box(4, 4, 7), box(4, 4 - 3 * TIE_M, 8, true),             // 2 bunker, 3 water 3 um under: the bunker, no tie
    box(8, 1, 6), box(8, 1, 6, true),                         // 4, 5 rough twice: the lower index
    [[[12, 0, 0], [14, 0, 0], [12, 0, 2]], 5], [[[14, 0, 0], [14, 0, 2], [12, 0, 2]], 6],   // 6 fairway | 7 rough, sharing the edge x + z = 14
    box(16, 2, 32), box(16, 2, 99, true),                     // 8 rock, 9 an unlisted code: the rock
  ]);
  const gi2 = gridIndex(t2, 1), g2 = (x, z, codes = null) => topGround(gi2, x, z, codes);
  ok(g2(0.5, 0.5)?.code === 10 && g2(0.5, 0.5).tri === 1 && Math.abs(g2(0.5, 0.5).y - Math.fround(3 - 0.5 * TIE_M)) < 1e-12 && g2(0.5, 0.5).tie, `tie within TIE_M: OB over the fairway 0.5 um above it, at OB's own height (${JSON.stringify(g2(0.5, 0.5))})`);
  ok(g2(4.5, 0.5)?.code === 7 && g2(4.5, 0.5).tie === false, `beyond TIE_M the higher wins: bunker over water 3 um under (${JSON.stringify(g2(4.5, 0.5))})`);
  ok(g2(8.5, 0.5)?.tri === 4 && g2(8.5, 0.5).tie === false, "one code twice: the lower index, no tie");
  ok(g2(13, 1)?.code === 6 && g2(13, 1).tie && g2(12.5, 0.5).code === 5 && g2(13.5, 1.2).code === 6, `a ray on a fairway / rough edge: rough (${JSON.stringify(g2(13, 1))})`);
  ok(g2(16.5, 0.5, null)?.code === 32 && g2(16.5, 0.5, null).tie, "an unlisted code ranks after every listed one");
  // rayHits' first hit is topGround's, on every ray, with and without a code filter
  let firstDiff = 0, firstRays = 0;
  for (const codes of [null, GROUND_CODES]) for (let x = -0.25; x < 18.5; x += 0.25) for (let z = -0.25; z < 2.5; z += 0.25) {
    const a = rayHits(gi2, x, z, codes)[0] ?? null, b = topGround(gi2, x, z, codes);
    firstRays++;
    if (!!a !== !!b || (a && (a.y !== b.y || a.code !== b.code || a.tri !== b.tri))) firstDiff++;
  }
  ok(firstDiff === 0, `rayHits[0] differs from topGround on ${firstDiff} of ${firstRays} rays`);
  // the grid against a brute-force ray
  const rt = [];
  for (let i = 0; i < 300; i++) {
    const cx = rnd() * 200 - 100, cz = rnd() * 200 - 100, s = 1 + rnd() * 25;
    rt.push([[[cx, rnd() * 10, cz], [cx + s * (rnd() - 0.5) * 2, rnd() * 10, cz + s * (rnd() - 0.5) * 2], [cx + s * (rnd() - 0.5) * 2, rnd() * 10, cz + s * (rnd() - 0.5) * 2]], [5, 6, 25, 32, 36][Math.floor(rnd() * 5)]]);
  }
  const big = meshOf(rt), gi = gridIndex(big, 4, { codes: GROUND_CODES }), whole = { ...gridIndex(big, 1e6, { codes: GROUND_CODES }) };
  let diff = 0, hits = 0;
  for (let i = 0; i < 2000; i++) {
    const x = rnd() * 220 - 110, z = rnd() * 220 - 110, a = topGround(gi, x, z), b = topGround(whole, x, z);
    if (b) hits++;
    if (JSON.stringify(a) !== JSON.stringify(b)) diff++;
  }
  ok(diff === 0 && hits > 300, `gridIndex: ${diff} of 2000 rays differ from one cell over everything (${hits} hits)`);
  // with every 5th triangle doubled under another ground code (reversed), and a sea
  // plane 20 km across: a bbox grid over the middle reads what one cell over
  // everything reads, and rayHits' first hit is topGround's
  const dup = rt.flatMap((tr, i) => (i % 5 ? [tr] : [tr, [[tr[0][0], tr[0][2], tr[0][1]], [5, 6, 7, 8, 10, 32, 36][i % 7]]]));
  const sea = [[[[-20000, -50, -20000], [20000, -50, -20000], [-20000, -50, 20000]], 8], [[[20000, -50, -20000], [20000, -50, 20000], [-20000, -50, 20000]], 8]];
  const big3 = meshOf([...dup, ...sea]);
  const gb = gridIndex(big3, 4, { codes: GROUND_CODES, bbox: [-110, -110, 110, 110] }), w3 = gridIndex(big3, 1e6, { codes: GROUND_CODES });
  let bdiff = 0, bties = 0, rdiff = 0, outside = 0;
  for (let i = 0; i < 2000; i++) {
    const x = rnd() * 220 - 110, z = rnd() * 220 - 110, a = topGround(gb, x, z), b = topGround(w3, x, z), r = rayHits(gb, x, z, GROUND_CODES)[0] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) bdiff++;
    if (a?.tie) bties++;
    if (!!a !== !!r || (a && (a.y !== r.y || a.code !== r.code || a.tri !== r.tri))) rdiff++;
  }
  for (const [x, z] of [[-130, 0], [0, 130], [5000, 5000]]) if (topGround(gb, x, z) === null && topGround(w3, x, z)?.code === 8) outside++;
  ok(gb.nx === 56 && gb.nz === 56 && gb.bbox.join() === "-110,-110,110,110", `gridIndex bbox: a ${gb.nx} x ${gb.nz} grid, not 56 x 56`);
  ok(bdiff === 0 && bties > 20, `gridIndex bbox: ${bdiff} of 2000 rays differ from one cell over everything (${bties} ties between two codes)`);
  ok(rdiff === 0, `rayHits[0] differs from topGround on ${rdiff} of 2000 rays over doubled triangles`);
  ok(outside === 3, "gridIndex bbox: a ray outside the box finds nothing");
  let threwBox = false; try { gridIndex(big3, 4, { bbox: [0, 0, -1, 1] }); } catch { threwBox = true; }
  ok(threwBox, "gridIndex refuses a bbox with x1 < x0");
  // files: readMeshBin and loadCollision with covers and a missing extra
  const dir = mkdtempSync(join(tmpdir(), "nsscol-"));
  try {
    const pack = (mm) => {
      const L = {}, parts = [["verts", mm.verts, "float32", [mm.nv, 3]], ["tris", mm.tris, "uint32", [mm.nt, 3]], ["surface", mm.surface, "uint8", [mm.nt]], ["material", mm.material, "uint8", [mm.nt]]];
      let off = 0; const bufs = [];
      for (const [k, a, dtype, shape] of parts) { const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); L[k] = { offset: off, bytes: b.length, dtype, shape }; off += b.length; bufs.push(b); }
      return { layout: L, buf: Buffer.concat(bufs) };
    };
    const field = pack(m);
    const coverTris = [];
    for (let k = 0; k < 6; k++) for (let i = 0; i < 20; i++) { const a = (i / 20) * 2 * Math.PI, b = ((i + 1) / 20) * 2 * Math.PI, cx = 1 + k, cz = 8; coverTris.push([[[cx, 0.3, cz], [cx + 0.19 * Math.cos(a), 0.3, cz + 0.19 * Math.sin(a)], [cx + 0.19 * Math.cos(b), 0.3, cz + 0.19 * Math.sin(b)]], 18]); }
    const cm = meshOf(coverTris), covers = pack(cm);
    const items = Array.from({ length: 6 }, (_, k) => ({ k, vertexRange: [k * 60, k * 60 + 60], triRange: [k * 20, k * 20 + 20] }));
    writeFileSync(join(dir, "h07.bin"), field.buf);
    writeFileSync(join(dir, "h07-covers.bin"), covers.buf);
    const sha = (b) => createHash("sha1").update(b).digest("hex");
    writeFileSync(join(dir, "h07.json"), JSON.stringify({ hole: 7, layout: field.layout, binBytes: field.buf.length, binSha1: sha(field.buf), covers: { bin: "h07-covers.bin", layout: covers.layout, binSha1: sha(covers.buf), items } }));
    const back = readMeshBin(field.buf, field.layout);
    ok(back.nt === m.nt && back.verts.every((v, i) => v === m.verts[i]) && back.tris.every((v, i) => v === m.tris[i]), "readMeshBin round trip");
    // an extra as the dump writes one (hNN-water: H3's sea), and one absent (hNN-leaf)
    const water = pack(meshOf([[[[6, 0.5, 0.5], [8, 0.5, 0.5], [6, 0.5, 2.5]], 8]]));
    writeFileSync(join(dir, "h07-water.bin"), water.buf);
    writeFileSync(join(dir, "h07-water.json"), JSON.stringify({ hole: 7, actor: "Object_BGOBJ_GolfCourse07Water", layout: water.layout, binBytes: water.buf.length, binSha1: sha(water.buf) }));
    const col = loadCollision(dir, 7, { extras: ["water", "leaf"] });
    ok(col.nt === m.nt + 121 && col.nv === m.nv + 363 && col.covers.length === 6 && col.missing.join() === "leaf", "loadCollision: field + six covers + the water extra, the missing leaf listed");
    const wp = col.parts.find((q) => q.name === "water");
    ok(wp && wp.tri0 === m.nt + 120 && wp.tri1 === m.nt + 121 && col.sha1.water === sha(water.buf) && col.material[m.nt + 120] === 255 && col.surface[m.nt + 120] === 8, `loadCollision: the water extra appended after the covers (${JSON.stringify(wp)})`);
    const wg = topGround(gridIndex(col, 4, { codes: GROUND_CODES }), 6.5, 1), wf = topGround(gridIndex(loadCollision(dir, 7), 4, { codes: GROUND_CODES }), 6.5, 1);
    ok(wg?.code === 8 && Math.abs(wg.y - 0.5) < 1e-6 && wf?.code === 5, "loadCollision: the extra's water is the ground over the fairway, which is the ground without it");
    ok(col.parts[0].name === "field" && col.parts[1].name === "cover0" && col.covers[2].tri0 === m.nt + 40 && col.material[m.nt] === 255, "loadCollision: parts and cover ranges");
    const top = topGround(gridIndex(col, 4, { codes: GROUND_CODES }), 3, 8);
    ok(top && top.tri >= col.covers[2].tri0 && top.tri < col.covers[2].tri1 && Math.abs(top.y - 0.3) < 1e-6, `loadCollision: the cover over its spot is the top ground (${JSON.stringify(top)})`);
    ok(Math.abs(col.covers[0].centre[0] - 1) < 1e-6 && Math.abs(col.covers[0].centre[2] - 8) < 1e-3, "loadCollision: cover centre");
    writeFileSync(join(dir, "h07.bin"), Buffer.concat([field.buf.subarray(0, 4), Buffer.from([1, 2, 3, 4]), field.buf.subarray(8)]));
    let threw = false; try { loadCollision(dir, 7); } catch { threw = true; }
    ok(threw, "loadCollision refuses a bin whose SHA-1 is not its json's");
    let bad = false; const evil = Buffer.from(field.buf); evil.writeUInt32LE(999999, field.layout.tris.offset);
    try { readMeshBin(evil, field.layout); } catch { bad = true; }
    ok(bad, "readMeshBin refuses a vertex index past the table");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- 5. against the dump ------------------------------------------------------
const DUMP = existsSync(join(SRC, "pins.json")) && existsSync(join(SRC, "platform.json")) && existsSync(join(SRC, "collision/h01.bin"));
if (!DUMP) console.log(`dump not at ${SRC}: fresh-export, slots.json and collision checks skipped`);
else {
  const out = mkdtempSync(join(tmpdir(), "nss-export-"));
  try {
    const t0 = Date.now();
    let ran = false;
    try {
      execFileSync(process.execPath, [join(ROOT, "tools/nss-export.mjs"), "--src", SRC, "--out-dir", out], { stdio: "pipe" });
      ran = true;
    } catch (e) {
      ok(false, `tools/nss-export.mjs --src ${SRC} failed (exit ${e.status}): ${String(e.stderr || e.message).trim().split("\n").slice(0, 12).join(" | ")}`);
    }
    if (ran) {
      // the committed files are text: a checkout under core.autocrlf may have given them CRLF
      const text = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
      for (const f of ["nss-registration.json", "nss-pins.json", "nss-platform.json"]) ok(text(join(ROOT, "tools", f)) === text(join(out, f)), `${f}: a fresh export differs from the committed file`);
      console.log(`fresh export: identical to the committed files, line ends aside (${Date.now() - t0} ms)`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
  const sha = (p) => createHash("sha1").update(readFileSync(p)).digest("hex");
  ok(PINS.source.pinsJsonSha1 === sha(join(SRC, "pins.json")) && REG.source.pinsJsonSha1 === PINS.source.pinsJsonSha1, "pins.json SHA-1");
  ok(PLAT.source.platformJsonSha1 === sha(join(SRC, "platform.json")), "platform.json SHA-1");
  // slots.json (the eden slot decoder's own table): its stands are the shipped
  // stances, its balls the shipped balls, on all 19 positions x 2 hands per hole
  const SLOTS_PATH = join(SRC, "slots.json");
  if (!existsSync(SLOTS_PATH)) ok(false, `no slots.json in ${SRC}`);
  else {
    ok(PLAT.source.slotsJsonSha1 === sha(SLOTS_PATH), "slots.json SHA-1");
    const SJ = JSON.parse(readFileSync(SLOTS_PATH, "utf8"));
    ok(JSON.stringify(SJ.ballOffset?.alongLocalX_m) === JSON.stringify({ rightHanded: -0.9, leftHanded: 0.9 }), `slots.json ballOffset ${JSON.stringify(SJ.ballOffset?.alongLocalX_m)}`);
    let nStand = 0, nBall = 0, worstStand = 0, worstBall = 0, worstH = 0;
    for (const n of HOLES) {
      const sh = SJ.perHole?.[String(n).padStart(2, "0")], H = PLAT.holes[n];
      if (!sh) { ok(false, `slots.json: no hole ${n}`); continue; }
      for (const t of ["low", "high"]) for (const [key, e] of Object.entries(sh[t] || {})) {
        const q = H.tiers[t].find((p) => p.localX === e.slotX), tag = `H${n} ${t} ${key}`;
        if (!q) { ok(false, `${tag}: slots.json's standing x ${e.slotX} is none of the shipped positions`); continue; }
        const ds = pxDist(e.stand, q);
        worstStand = Math.max(worstStand, ds); nStand++;
        ok(ds <= 1e-4, `${tag}: the stance ${q.x},${q.y} ${ds.toFixed(5)} px from slots.json's stand`);
        for (const h of HANDS) {
          const b = q.ball[h], d = pxDist(e[h], b), dh = Math.abs(e[h].heightYd - b.z);
          worstBall = Math.max(worstBall, d); worstH = Math.max(worstH, dh); nBall++;
          ok(d <= 0.002 && dh <= 1e-4, `${tag} ${h}: the ball ${b.x},${b.y} ${d.toFixed(4)} px from slots.json's, z ${b.z} against ${e[h].heightYd}`);
        }
      }
    }
    ok(nStand === 399 && nBall === 798, `slots.json: ${nStand} stands and ${nBall} balls compared, not 399 and 798`);
    console.log(`slots.json: ${nStand} stands within ${worstStand.toFixed(5)} px of the shipped stances, ${nBall} balls within ${worstBall.toFixed(4)} px (heights ${worstH.toExponential(1)} yd)`);
  }
  let worst = 0;
  const t1 = Date.now();
  for (const n of HOLES) {
    let col;
    try { col = loadCollision(join(SRC, "collision"), n, { extras: ["water"] }); } catch (e) { ok(false, `H${n}: the dump's collision does not load: ${e.message}`); continue; }
    const cs = PINS.source.collisionSha1[n];
    ok(col.sha1.field === cs.field && col.sha1.covers === cs.covers && col.sha1.water === cs.water, `H${n}: collision SHA-1`);
    if (n === 3) ok(!!col.sha1.water, "H3: its sea (collision/h03-water) is in the dump and read");
    // over the map frame (+ 25 m): H3's sea plane runs ~16 km out
    const R = regOf(REG, n), cn = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([fx, fy]) => mapToNss(R, fx, fy));
    const bbox = [Math.min(...cn.map((c) => c[0])) - 25, Math.min(...cn.map((c) => c[1])) - 25, Math.max(...cn.map((c) => c[0])) + 25, Math.max(...cn.map((c) => c[1])) + 25];
    const idx = gridIndex(col, 4, { codes: GROUND_CODES, bbox }), h = PINS.holes[n];
    for (const b of ["wsrStart", "rotateObj", "teeObj"]) {
      const w = h.tees[b].world, g = topGround(idx, w[0], w[2]);
      worst = Math.max(worst, g ? Math.abs(g.y) : Infinity);
      ok(g && Math.abs(g.y) <= 1e-4 && g.code === 5, `H${n}: ground at ${b} ${g ? `${g.y} code ${g.code}` : "none"}, not 0.000 m fairway`);
    }
    for (const c of h.cups) {
      const g = topGround(idx, c.world[0], c.world[2]), cv = col.covers.find((q) => q.k === c.k);
      ok(g && g.tri >= cv.tri0 && g.tri < cv.tri1 && Math.abs(g.y - c.surfaceY) <= 1e-4, `H${n} c${c.k}: the top ground over the bone is not its cover at the surface`);
    }
    for (const t of ["low", "high"]) for (const q of PLAT.holes[n].tiers[t]) for (const p of [q, ...HANDS.map((hh) => q.ball[hh])]) {
      const g = topGround(idx, p.world[0], p.world[2]);
      ok(g && Math.abs(g.y / M_PER_YD - p.groundZ) <= 1e-4 && g.code === p.groundCode && !g.tie, `H${n} ${t} #${q.fromLeft}${p === q ? "" : " ball"}: ground`);
    }
  }
  console.log(`collision (H3 with its sea): ground at the WSR start, Glf_RotateOBJ and GlfTeeOBJ within ${worst.toExponential(1)} m of 0 on all 21 holes; cups on their covers; the ground under every stance and ball as shipped (${Date.now() - t1} ms)`);
}

console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
