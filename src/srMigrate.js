// Switch Sports Resort's 27-hole numbering, and the one-time move of a stored state onto it (the flag srHolesV1).
// Pure (no React, no storage), so the tools can run it: App.jsx's load, tools/build-derived.mjs (the capture
// pipeline's NSS-numbered records) and tools/test-sr-migrate.mjs.
//
// The user, 2026-11-04: "going forward we will adopt SR's 27-hole numbering throughout". A hole id is the number on
// SR's own banner. Holes 1-18 are NSS's, under the same numbers (SR 17's map frame is SR's own capture area, not
// NSS 17's); SR 23 is NSS 20 with a new tee 73 m back and 10 m up (par 5); SR 24 is NSS 19 and SR 25 NSS 21; SR 19, 20,
// 21, 22, 26 and 27 are new. So a state stored before the switch (NSS numbers, holes 1-21) moves 19 to 24, 20 to 23,
// 21 to 25, and its old 19, 20 and 21 slots become the new holes (nothing stored there). The ball (NSS's, identical in
// SR's files) and every shot, putt and round keep their numbers on the holes 1-18.

export const SR_HOLES = 27;
export const SR_OF_NSS = Object.freeze({ 19: 24, 20: 23, 21: 25 });   // a stored (NSS-numbered) hole -> its SR number
export const NSS_OF_SR = Object.freeze({ 24: 19, 23: 20, 25: 21 });   // and back, for the holes SR shares with NSS
export const srHoleOf = (n) => SR_OF_NSS[n] ?? n;
// the NSS hole an SR hole is (the capture pipeline's, WSR's, the eden dump's number), null for SR's six new ones
export const nssHoleOf = (n) => NSS_OF_SR[n] ?? (n >= 1 && n <= 18 ? n : null);

// pars from the in-game hole select screen (SR's AnnaGolfFieldParam, OfficialScene; the same list as
// tools/nss-pins.json's `par`): SR 23 is a par 5 where NSS 20 was a 4
export const SR_PARS = Object.freeze({ 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5, 19: 4, 20: 3, 21: 5, 22: 3, 23: 5, 24: 4, 25: 4, 26: 3, 27: 5 });

// NSS 20's default note (App.jsx NOTES[20] until the switch): a stored note equal to it was never edited, and SR 23's
// tee is elsewhere, so it takes SR 23's own default
const NSS20_NOTE = "Driver 3.5\u20134.0 up the fairway. Risky line between the tree and rock wall gives a cleaner stroke 2.";

// The two holes whose map frame changed. SR 17 and SR 23 are captured from SR's own capture squares (SR 17: centre
// (30, -92) m, 340 m across, NSS's was (30, -120) and 320; SR 23: centre (-30, -80) and 600 against NSS 20's (-30,
// -175) and 420), so a position stored as a map fraction of NSS's 250x304 frame lands elsewhere in SR's. The world
// is the same (same origin and cups: tools/nss-registration.json's originMesh is equal, the six cups' world points
// identical), so a fraction goes through the world: px = a x - b z + tx, py = b x + a z + ty (the registration's
// own form), NSS's fit out and SR's frame in. `from` is tools/nss-registration.json at 4aa70b3 (hole 17, hole 20),
// `to` the one the switch ships (hole 17, hole 23): NSS's six cups of those holes land within 0.003 px of SR's
// (tools/test-sr-migrate.mjs).
export const MAP_W = 250, MAP_H = 304;
export const FRAME_CHANGE = Object.freeze({
  17: { from: { a: 0.9598106343171809, b: 3.198455766796715e-06, tx: 96.742044039112, ty: 267.91041585479394 }, to: { a: 0.901960784314, b: 0, tx: 98.607843137255, ty: 235.647058823529 } },
  23: { from: { a: 0.7304210996231567, b: 0.0016030785576736954, tx: 147.15995840885347, ty: 280.8081937220956 }, to: { a: 0.511111111111, b: 0, tx: 141, ty: 193.555555555556 } },
});
// a map fraction (x, y) of NSS's frame for SR hole `hole` -> [x, y] of SR's; the same point for a hole whose frame
// did not change
export function toSrFrame(hole, x, y) {
  const f = FRAME_CHANGE[hole];
  if (!f) return [x, y];
  const { from: o, to: t } = f;
  const u = x * MAP_W - o.tx, v = y * MAP_H - o.ty, det = o.a * o.a + o.b * o.b;
  const wx = (o.a * u + o.b * v) / det, wz = (-o.b * u + o.a * v) / det;
  return [(t.a * wx - t.b * wz + t.tx) / MAP_W, (t.b * wx + t.a * wz + t.ty) / MAP_H];
}
// yd per map px of SR's frame over NSS's (a length stored in px or yd/px scales by it); 1 where the frame is the same
export function srScaleRatio(hole) {
  const f = FRAME_CHANGE[hole];
  return f ? Math.sqrt(f.from.a ** 2 + f.from.b ** 2) / Math.sqrt(f.to.a ** 2 + f.to.b ** 2) : 1;
}

// one hole's stored state under its new number: the par SR's, the blocked rules' `hole`, the pipeline pins' and the
// auto trees' ids (d<hole>-c<k>, t<hole>-<k>: derived.json's merge replaces both on every load, but a curPin on a
// pipeline pin must keep naming a pin of the same id), an unedited NSS 20 note replaced; everything else as stored
function rekeyHole(h, from, to, notes) {
  if (!h || typeof h !== "object") return h;
  const re = (id) => (typeof id === "string" ? id.replace(new RegExp("^([dt])" + from + "-"), "$1" + to + "-") : id);
  const out = { ...h, par: SR_PARS[to] };
  if (from === 20 && h.note === NSS20_NOTE && typeof notes?.[to] === "string") out.note = notes[to];
  if (Array.isArray(h.blocked)) out.blocked = h.blocked.map((b) => (b && typeof b === "object" ? { ...b, hole: to } : b));
  if (Array.isArray(h.markers)) out.markers = h.markers.map((m) => (m?.auto ? { ...m, id: re(m.id) } : m));
  if (Array.isArray(h.pins)) out.pins = h.pins.map((p) => (p && typeof p === "object" ? { ...p, id: re(p.id) } : p));
  if (typeof h.curPin === "string") out.curPin = re(h.curPin);
  return out;
}
const rekeyScores = (s) => {
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) out[srHoleOf(+k)] = v;
  return out;
};

// a stored hole set that already holds one of SR's numbers past 21 (a store this build wrote whose flag a racing write dropped)
const holdsSrHole = (hm) => !!hm && typeof hm === "object" && Object.keys(hm).some((k) => +k > 21);
// whether srMigrate would move a parsed store's holes: no flag and no hole past 21 yet. App.jsx gates the pre-sr backup
// and srFrameFix on it, so a store srMigrate only flags is neither backed up over nor moved through the frame change again
export function srNeedsMove(d) { return !!d && typeof d === "object" && !d.srHolesV1 && !holdsSrHole(d.holesMeta); }
// a shot or putt row of a store (or of a Log export) from before the switch under its SR hole number; posToo also moves a
// shot row's pos (a map fraction of the address frame's minimap) of hole 17 or 20 through the frame change
export function srRow(r, posToo) {
  if (!r || typeof r !== "object") return r;
  const from = Number(r.hole) || 0, to = srHoleOf(from);
  // (NSS 17 is SR 17 and NSS 20 is SR 23: FRAME_CHANGE is keyed by the SR number)
  const fix = posToo && FRAME_CHANGE[to] && r.pos && Number.isFinite(r.pos.x) && Number.isFinite(r.pos.y);
  if (to === from && !fix) return r;
  const o = { ...r };
  if (to !== from) o.hole = to;
  if (fix) {
    const [x, y] = toSrFrame(to, r.pos.x, r.pos.y);
    o.pos = { ...r.pos, x, y };
  }
  return o;
}

// The state as it was, kept beside the store under `${key}.pre-sr` before the one-way move, written once: never over an
// earlier copy (the shim's get throws on a missing key, src/storage.js, so that read has a try of its own); a quota
// failure or a storage without set is ignored. Resolves true when the copy was written. App.jsx runs it only when
// srNeedsMove(d).
export async function srBackupOnce(storage, key, raw) {
  if (!storage || typeof raw !== "string") return false;
  let prev = null;
  try { prev = await storage.get(key + ".pre-sr"); } catch {}
  if (prev && prev.value) return false;
  try { await storage.set(key + ".pre-sr", raw); return true; } catch { return false; }
}

// The stored state (the parsed JSON of caddie:sss-golf-solver-v2) onto SR's numbering, once: holesMeta re-keyed
// (and each moved hole as rekeyHole says), shots' and putts' hole, the rounds' and the active round's scores keys;
// a row's pos (a map fraction of the address frame's minimap) of SR 17 or of NSS 20 (SR 23) goes through the frame
// change, since a row is not re-derived from derived.json unless the pipeline ships it. Returns d itself when it
// carries the flag, or when it already holds a hole past 21 (a store written by this build whose flag a racing write
// dropped), else a new object with srHolesV1 true; d is not modified. The frame change of a hole's own markers, pins
// and green is srFrameFix's, to run after the load's older migrations (App.jsx), which work in the NSS frame.
// notes: App.jsx's NOTES (the new default note of SR 23).
export function srMigrate(d, { notes } = {}) {
  if (!d || typeof d !== "object" || d.srHolesV1) return d;
  if (!srNeedsMove(d)) return { ...d, srHolesV1: true };
  const hm = d.holesMeta && typeof d.holesMeta === "object" ? d.holesMeta : null;
  const out = { ...d, srHolesV1: true };
  if (hm) {
    const m = {};
    for (const [k, h] of Object.entries(hm)) if (!(k in SR_OF_NSS)) m[k] = h;
    for (const [from, to] of Object.entries(SR_OF_NSS)) if (hm[from]) m[to] = rekeyHole(hm[from], +from, to, notes);
    out.holesMeta = m;
  }
  if (Array.isArray(d.shots)) out.shots = d.shots.map((r) => srRow(r, true));
  if (Array.isArray(d.putts)) out.putts = d.putts.map((r) => srRow(r, false));
  if (Array.isArray(d.rounds)) out.rounds = d.rounds.map((r) => (r && r.scores ? { ...r, scores: rekeyScores(r.scores) } : r));
  if (d.activeRound && d.activeRound.scores) out.activeRound = { ...d.activeRound, scores: rekeyScores(d.activeRound.scores) };
  return out;
}

// The frame change of the stored holes SR 17 and SR 23 (state holesMeta, keyed by SR hole): the player's own
// markers and pins, the green's box and outline, and the stored scale go from NSS's map frame to SR's; the auto tree
// markers are dropped (derived.json's trees, in SR's frame, replace them on every load), the pipeline pins move with
// the rest (they mirror derived.json too). The green's marker green.src is left, so derived.json's geometry, whose
// hash differs for a new frame, applies once as it always does. Holes whose frame did not change come back as they
// are (the same objects).
export function srFrameFix(holesMeta) {
  if (!holesMeta || typeof holesMeta !== "object") return holesMeta;
  const out = { ...holesMeta };
  for (const key of Object.keys(FRAME_CHANGE)) {
    const n = +key, h = out[n];
    if (!h || typeof h !== "object") continue;
    const at = (p) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
      const [x, y] = toSrFrame(n, p.x, p.y);
      return { ...p, x, y };
    };
    const g = h.green;
    let green = g;
    if (g && typeof g === "object") {
      green = { ...g };
      const b = g.box;
      if (b && ["x0", "y0", "x1", "y1"].every((k) => Number.isFinite(b[k]))) {
        const [x0, y0] = toSrFrame(n, b.x0, b.y0), [x1, y1] = toSrFrame(n, b.x1, b.y1);
        green.box = { x0, y0, x1, y1 };
      }
      if (Array.isArray(g.poly)) green.poly = g.poly.map(([x, y]) => toSrFrame(n, x, y));
    }
    out[n] = {
      ...h,
      markers: (h.markers ?? []).filter((m) => !m?.auto).map(at),
      pins: (h.pins ?? []).map(at),
      scale: Number.isFinite(h.scale) ? h.scale * srScaleRatio(n) : h.scale,
      ...(green ? { green } : {}),
    };
  }
  return out;
}
