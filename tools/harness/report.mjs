// The comparison tables for REPORT.md from results/*.json, as markdown on
// stdout, one section per validation run (2a sweep, 2b wind, 2c trees, ...).
//   node tools/harness/report.mjs [sweep|wind|trees|...]
import fs from "node:fs";
import path from "node:path";
import { HARNESS } from "./lib/dolphin.mjs";
import { YD, appProfile, kclProfile, simOf, dropMesh, kcl, groundAt } from "./lib/course.mjs";
import { run, SURFACE_ATTR } from "../lib/wsrsim.mjs";

// The port flights are recomputed here from each row's inputs (tee, aim,
// club, power), so a change to the profile code (lib/course.mjs) or to the
// port shows without a Dolphin re-run. "KCL+" is the port over the KCL line
// with outer ground and walls given WSR's own contact constants (attr 4: A
// 0.7, B 0.3; attr 12: A 0.3, B 0.5) instead of the app's "roll them as
// fairway" (SURFACE_ATTR has no outer or wall).
const profCache = new Map();
async function profilesFor(hole, tee, aim) {
  const key = `${hole}|${tee.join(",")}|${aim.join(",")}`;
  if (!profCache.has(key)) {
    const app = await appProfile(hole, tee[0], tee[2], aim[0], aim[1]);
    profCache.set(key, { app: app.prof, kcl: await kclProfile(hole, tee[0], tee[2], aim[0], aim[1]) });
  }
  return profCache.get(key);
}
function portRuns(club, q, P, extra = {}) {
  const fly = (prof) => { const o = run({ club, q, profile: prof ? simOf(prof) : null, trace: false, ...extra }); return { carry: o.carry, stop: o.stop }; };
  const out = { portApp: fly(P.app), portKcl: P.kcl ? fly(P.kcl) : null, portFlat: fly(null) };
  if (P.kcl) {
    SURFACE_ATTR.outer = 4; SURFACE_ATTR.wall = 12;
    try { out.portKclPlus = fly(P.kcl); } finally { delete SURFACE_ATTR.outer; delete SURFACE_ATTR.wall; }
  }
  return out;
}

const RES = path.join(HARNESS, "results");
const load = (prefix) => fs.readdirSync(RES).filter((f) => f.startsWith(prefix)).map((f) => ({ f, ...JSON.parse(fs.readFileSync(path.join(RES, f), "utf8")) }));
const f1 = (v) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(1));
const sg = (v) => (v == null || Number.isNaN(v) ? "–" : (v >= 0 ? "+" : "") + v.toFixed(1));
const stats = (a) => {
  const v = a.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const rms = Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  const max = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
  return { n: v.length, mean, rms, max };
};
const fmtS = (s) => (s ? `${sg(s.mean)} / ${f1(s.rms)} / ${sg(s.max)}` : "–");
const PLAYABLE = new Set(["fairway", "rough", "green", "fringe", "bunker", "tee"]);

// a sweep row is "clean" when WSR's ball ended on the course with no penalty:
// not in water by the look-ahead's own record (ball+0x158), nor by the
// in-flight poll (ball+0xbc), nor under a KCL water surface at its rest
// (rivers with a sand bed: hole 15's water lies 4.3 yd over sand, and a ball
// resting on the bed read "bunker"), on a playable surface, and the real rest
// equal to the prediction where it was checked
const clean = (x) => !x.wsr.hazard && !x.wsr.restWater && !x.underWater && !x.wsr.placed && PLAYABLE.has(x.wsr.restLie ?? "") && (x.realRestMatches !== false);
// a water surface above the row's rest point (reconstructed from the line)
async function underWater(hole, H, x) {
  const m = await kcl(hole);
  if (!m) return false;
  const [dx, dz] = H.aim, t = H.tee;
  const X = t[0] + (dx * x.wsr.stop - dz * x.wsr.stopAcross) * YD, Z = t[2] + (dz * x.wsr.stop + dx * x.wsr.stopAcross) * YD;
  const Y = t[1] + x.wsr.restDy * YD;
  const w = groundAt(m, X, Z, { mask: 1 << 7 });
  return !!(w && w.y > Y + 0.5);
}

async function sweep() {
  const out = [];
  const holes = {};
  for (const r of load("sweep-")) for (const [h, H] of Object.entries(r.holes)) holes[h] = H;
  for (const [h, H] of Object.entries(holes)) {
    const P = await profilesFor(Number(h), H.tee, H.aim);
    for (const x of H.shots) { Object.assign(x, portRuns(x.club, x.q, P)); x.underWater = await underWater(Number(h), H, x); }
    dropMesh(Number(h)); profCache.clear();
  }
  // re-checks replace the rows they re-ran
  for (const r of load("recheck-")) for (const [h, H] of Object.entries(r.holes)) {
    if (!holes[h]) continue;
    for (const y of H.shots) {
      const i = holes[h].shots.findIndex((x) => x.club === y.club && x.q === y.q);
      if (i >= 0) holes[h].shots[i] = { ...y, rechecked: true };
    }
  }
  out.push("| hole | shots | clean | carry: WSR − port, KCL (mean / rms / worst) | rest: WSR − port, KCL | carry: WSR − port, app grid | rest: WSR − port, app grid | rest: WSR − port flat |");
  out.push("|---|---|---|---|---|---|---|---|");
  const all = [];
  for (const h of Object.keys(holes).map(Number).sort((a, b) => a - b)) {
    const rows = holes[h].shots, c = rows.filter(clean);
    all.push(...c.map((x) => ({ ...x, hole: h })));
    out.push(`| ${h} | ${rows.length} | ${c.length} | ${fmtS(stats(c.map((x) => x.wsr.carry - x.portKcl?.carry)))} | ${fmtS(stats(c.map((x) => x.wsr.stop - x.portKcl?.stop)))} | ${fmtS(stats(c.map((x) => x.wsr.carry - x.portApp.carry)))} | ${fmtS(stats(c.map((x) => x.wsr.stop - x.portApp.stop)))} | ${fmtS(stats(c.map((x) => x.wsr.stop - x.portFlat.stop)))} |`);
  }
  out.push(`| all | | ${all.length} | ${fmtS(stats(all.map((x) => x.wsr.carry - x.portKcl?.carry)))} | ${fmtS(stats(all.map((x) => x.wsr.stop - x.portKcl?.stop)))} | ${fmtS(stats(all.map((x) => x.wsr.carry - x.portApp.carry)))} | ${fmtS(stats(all.map((x) => x.wsr.stop - x.portApp.stop)))} | ${fmtS(stats(all.map((x) => x.wsr.stop - x.portFlat.stop)))} |`);
  // by club
  out.push("", "By club (clean shots, all holes):", "");
  out.push("| club | shots | carry, KCL | rest, KCL | carry, app grid | rest, app grid |");
  out.push("|---|---|---|---|---|---|");
  for (const club of ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"]) {
    const c = all.filter((x) => x.club === club);
    out.push(`| ${club} | ${c.length} | ${fmtS(stats(c.map((x) => x.wsr.carry - x.portKcl?.carry)))} | ${fmtS(stats(c.map((x) => x.wsr.stop - x.portKcl?.stop)))} | ${fmtS(stats(c.map((x) => x.wsr.carry - x.portApp.carry)))} | ${fmtS(stats(c.map((x) => x.wsr.stop - x.portApp.stop)))} |`);
  }
  // the clean shots whose rest is off by more than 3 yd on the KCL line, and every unclean one
  out.push("", "Clean shots with a rest more than 3 yd off the port over the KCL line:", "");
  out.push("| hole | club | power | WSR carry / rest | port KCL carry / rest | port app carry / rest | rest lie | rest across (yd) |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const x of all.filter((x) => Math.abs(x.wsr.stop - x.portKcl?.stop) > 3).sort((a, b) => a.hole - b.hole))
    out.push(`| ${x.hole} | ${x.club} | ${x.q} | ${f1(x.wsr.carry)} / ${f1(x.wsr.stop)} | ${f1(x.portKcl?.carry)} / ${f1(x.portKcl?.stop)} | ${f1(x.portApp.carry)} / ${f1(x.portApp.stop)} | ${x.wsr.restLie} | ${f1(x.wsr.stopAcross)} |`);
  out.push("", "Shots that did not end cleanly (penalty, outer ground, water, valley). A ball that ends in water or off the course leaves the look-ahead's landing or rest record unwritten (frame -1; the position then is an earlier shot's), shown as –:", "");
  out.push("| hole | club | power | WSR carry / rest | rest lie | hazard | port KCL carry / rest | port KCL+ rest |");
  out.push("|---|---|---|---|---|---|---|---|");
  const outcome = (x) => (x.wsr.hazard ? ["", "water", "OB floor", "valley"][x.wsr.hazard] : x.wsr.restWater || x.underWater || x.wsr.restLie === "water" ? "water" : x.wsr.placed ? "placed" : x.wsr.restLie === "outer" ? "outer ground" : x.wsr.restLie == null ? "off the KCL" : "–");
  for (const h of Object.keys(holes).map(Number).sort((a, b) => a - b))
    for (const x of holes[h].shots.filter((x) => !clean(x)))
      out.push(`| ${h} | ${x.club} | ${x.q} | ${x.wsr.landFrame < 0 ? "–" : f1(x.wsr.carry)} / ${x.wsr.restFrame < 0 && x.wsr.realStop == null ? "–" : f1(x.wsr.realStop ?? x.wsr.stop)} | ${(x.wsr.restFrame < 0 ? null : x.wsr.realLie ?? x.wsr.restLie) ?? "–"} | ${outcome(x)} | ${f1(x.portKcl?.carry)} / ${f1(x.portKcl?.stop)} | ${f1(x.portKclPlus?.stop)} |`);
  // the outer-ground rests: what modelling outer ground and walls would buy
  const outer = Object.entries(holes).flatMap(([h, H]) => H.shots.filter((x) => x.wsr.restLie === "outer" && x.realRestMatches !== false && !x.wsr.hazard).map((x) => ({ ...x, hole: Number(h) })));
  out.push("", `Shots resting on outer ground (${outer.length}), rest: WSR − port over the KCL as the app rolls it (outer = fairway): ${fmtS(stats(outer.map((x) => x.wsr.stop - x.portKcl?.stop)))}; with WSR's outer / wall constants: ${fmtS(stats(outer.map((x) => x.wsr.stop - x.portKclPlus?.stop)))} (mean / rms / worst).`);
  return out.join("\n");
}

async function wind() {
  const out = [];
  // the full-power run (2b); the part-power files are windpower's
  for (const r of load("wind-").filter((r) => r.f === "wind-h10.json")) {
    const tee = r.tee, [dx, dz] = r.aim;
    const kp = await kclProfile(r.hole, tee[0], tee[2], dx, dz);
    out.push(`Hole ${r.hole}, ${r.shots.length} shots at full power along the default line (bearing ${f1(r.line.bearing)} deg).`, "");
    out.push("| club | wind (mph) | carry: WSR − port (mean / rms / worst) | sideways at carry: WSR − port | rest: WSR − port | WSR sideways at carry, by WSR direction 0-7 |");
    out.push("|---|---|---|---|---|---|");
    const groups = {};
    for (const x of r.shots) (groups[`${x.club}|${x.speedIdx}`] ??= []).push(x);
    for (const [k, v] of Object.entries(groups)) {
      const [club, idx] = k.split("|");
      // the port's own sideways drift at its first contact, from its path
      const lat = v.map((x) => {
        const o = run({ club, q: 1, profile: kp ? simOf(kp) : null, wind: { mph: 2 * x.speedIdx, deg: x.relDeg }, trace: true });
        const p = o.path.find((q) => q[0] >= o.carry - 1e-9) ?? o.path[o.path.length - 1];
        return x.wsr.carryAcross - p[2];
      });
      out.push(`| ${club} | ${2 * idx} | ${fmtS(stats(v.map((x) => x.wsr.carry - x.portKcl.carry)))} | ${fmtS(stats(lat))} | ${fmtS(stats(v.map((x) => x.wsr.stop - x.portKcl.stop)))} | ${v.sort((a, b) => a.dir - b.dir).map((x) => f1(x.wsr.carryAcross)).join(" ")} |`);
    }
  }
  return out.join("\n");
}

// 2c: WSR's tree contacts (the game's own tree check, codes 1 trunk, 2-4
// canopy) against src/trees.js treeCheck on the port's flight, both flown
// again here (the port over the KCL line toward the row's heading, the tree on
// that line's frame as run-trees.mjs builds it), so the table is the current
// code's; `stored` is the verdict the run recorded
async function trees() {
  const { pathToFileURL } = await import("node:url");
  const { treeCheck } = await import(pathToFileURL(path.join(HARNESS, "../../src/trees.js")).href);
  const out = [];
  const hit = (k) => k === "trunk" || k === "canopy";
  let agree = 0, n = 0, dAt = [];
  for (const r of load("trees-").sort((a, b) => a.hole - b.hole)) {
    const t = r.tree, B = r.ball, [TX, TY, TZ] = t.mesh;
    const m = await kcl(r.hole), g0 = groundAt(m, B[0], B[2]);
    const S = Math.hypot(TX - B[0], TZ - B[2]) / YD, h0 = Math.atan2(TX - B[0], TZ - B[2]);
    for (const x of r.shots) {
      const heading = h0 - x.offset / S, dx = Math.sin(heading), dz = Math.cos(heading);
      const kp = await kclProfile(r.hole, B[0], B[2], dx, dz);
      const ex = TX - B[0], ez = TZ - B[2];
      const lineTree = { id: `t${r.hole}-${t.idx}`, kind: t.kind, sx: t.size, sy: t.sy ?? t.size, z: (TY - g0.y) / YD, s: (ex * dx + ez * dz) / YD, l: (ex * -dz + ez * dx) / YD, own: false };
      const o = run({ club: x.club, q: x.q, profile: kp ? simOf(kp) : null, trace: true });
      const pc = treeCheck(o.path, [lineTree], { k: 1, carry: o.carry, aim: 0, ballZ: (B[1] - g0.y - 0.5) / YD });
      x.stored = x.port;
      x.port = { kind: pc.kind, at: pc.at, margin: pc.margin, carry: o.carry, stop: o.stop };
    }
    dropMesh(r.hole);
    out.push(`Hole ${r.hole}, tree t${r.hole}-${t.idx} (kind ${t.kind}${t.kind === 2 ? " broadleaf" : t.kind === 3 ? " conifer" : " palm"}, x scale ${t.size}, y scale ${t.sy}, base ${f1(t.z)} yd on the hole's datum${t.off ? ", off the course" : ""}), ${f1(r.distance)} yd from the ball (${r.save}). Offset: the line passes that far right of the trunk.`, "");
    out.push("| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |");
    out.push("|---|---|---|---|---|---|---|---|---|");
    for (const x of r.shots.sort((a, b) => a.offset - b.offset || a.club.localeCompare(b.club) || b.q - a.q)) {
      const ok = hit(x.wsr.contact) === hit(x.port.kind) && (!hit(x.wsr.contact) || x.wsr.contact === x.port.kind);
      n++; if (ok) agree++;
      if (hit(x.wsr.contact) && hit(x.port.kind) && x.port.at != null && x.wsr.firstAt != null) dAt.push(x.wsr.firstAt - x.port.at);
      const was = x.stored && x.stored.kind !== x.port.kind ? ` (run: ${x.stored.kind})` : "";
      out.push(`| ${sg(x.offset)} | ${x.club} | ${x.q} | ${x.wsr.contact}${x.wsr.firstAt != null ? ` at ${f1(x.wsr.firstAt)}` : ""} | ${f1(x.wsr.heightOverBase)} / ${f1(x.wsr.distFromTrunk)} | ${x.port.kind}${x.port.at != null ? ` at ${f1(x.port.at)}` : ""}${was} | ${sg(x.port.margin)} | ${ok ? "yes" : "**no**"} | ${f1(x.port.carry)} |`);
    }
    out.push("");
  }
  out.push(`${agree} of ${n} shots agree on contact or none (and on trunk or canopy); where both meet the tree, WSR's first contact minus the app's: ${fmtS(stats(dAt))} yd (mean / rms / worst).`);
  return out.join("\n");
}

// 2d: the cup rule and the roll on the green
function cup() {
  const out = [];
  for (const r of load("cup-h").filter((r) => !r.f.includes("grid1")).sort((a, b) => a.hole - b.hole)) {
    out.push(`Hole ${r.hole}: the ball ${f1(r.distance)} yd from the cup (${r.save}); ${r.putts.length} putts, each traced; pass = the ball centre's closest approach to the cup centre, + right of the cup; speed there in yd/s. "App rule" applies the app's cup rule (pass <= ${r.cupR} yd at <= ${r.vCap.toFixed(2)} yd/s) to WSR's own pass and speed; "app" is the app's own putt (its roll and its rule).`, "");
    out.push("| excess (yd) | line | WSR pass offset / speed | WSR | app rule on WSR's pass | app's own pass offset / speed | app | rest WSR - app, along / across (yd) |");
    out.push("|---|---|---|---|---|---|---|---|");
    for (const x of r.putts.sort((a, b) => a.excess - b.excess || a.wsr.offset - b.wsr.offset)) {
      const rule = x.wsr.pass <= r.cupR && x.wsr.speed <= r.vCap;
      out.push(`| ${x.excess} | ${x.role === "probe" ? "probe" : sg(x.target)} | ${sg(x.wsr.offset)} / ${f1(x.wsr.speed)} | ${x.wsr.holed ? "**holed**" : "missed"} | ${rule ? "holed" : "missed"}${rule !== x.wsr.holed ? " (differs)" : ""} | ${sg(x.app.offset)} / ${f1(x.app.speed)} | ${x.app.holedSim ? "holed" : "missed"} | ${x.wsr.holed ? "–" : `${sg(x.wsr.rest[0] - x.app.rest[0])} / ${sg(x.wsr.rest[1] - x.app.rest[1])}`} |`);
    }
    const ok = r.putts.filter((x) => (x.wsr.pass <= r.cupR && x.wsr.speed <= r.vCap) === x.wsr.holed).length;
    const clear = r.putts.filter((x) => !x.wsr.holed && x.wsr.pass > 0.3);
    out.push("", `The app's rule on WSR's own pass and speed agrees with WSR's verdict on ${ok} of ${r.putts.length}. WSR's pass minus the app's (the break and speed at the cup): offset ${fmtS(stats(r.putts.map((x) => x.wsr.offset - x.app.offset)))}, speed ${fmtS(stats(r.putts.map((x) => x.wsr.speed - x.app.speed)))}. Rests of the putts that pass the cup more than 0.3 yd away, WSR - app: along ${fmtS(stats(clear.map((x) => x.wsr.rest[0] - x.app.rest[0])))}, across ${fmtS(stats(clear.map((x) => x.wsr.rest[1] - x.app.rest[1])))} (${clear.length} putts).`, "");
  }
  return out.join("\n");
}

// 2d: the cup's edge (run-cupedge.mjs): per speed and side the last holed and
// the first missed offset of the bisection, in the app's frame (the line the
// app's roll passes the cup at), and the half-width the two sides give with
// WSR's own sideways offset from the app's line taken out
function cupedge() {
  const out = [];
  for (const r of load("cupedge-").sort((a, b) => a.hole - b.hole)) {
    out.push(`Hole ${r.hole}: the ball ${f1(r.distance)} yd from the cup (${r.save}), ${r.steps} bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.`, "");
    out.push("| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |", "|---|---|---|---|---|---|---|");
    for (const e of r.edges) {
      const R = e.sides.right, L = e.sides.left;
      const mid = (s) => (s ? (s.holedTo + s.missedFrom) / 2 : null);
      const w = R && L ? (mid(R) + mid(L)) / 2 : null, sh = R && L ? (mid(L) - mid(R)) / 2 : null;
      out.push(`| ${e.excess} | ${e.speed.toFixed(2)} | ${e.centre.holed ? "holed" : `missed (${e.centre.pass.toFixed(3)})`} | ${R ? `${R.holedTo.toFixed(3)} / ${R.missedFrom.toFixed(3)}` : "–"} | ${L ? `${L.holedTo.toFixed(3)} / ${L.missedFrom.toFixed(3)}` : "–"} | ${w != null ? w.toFixed(3) : "–"} | ${sh != null ? (sh >= 0 ? "+" : "") + sh.toFixed(3) : "–"} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

// 2b at part power (run-wind.mjs --powers): per club and power, the crosswind's
// sideways drift (the mean of the two sides, the calm shot's own offset taken
// out) and the head / tail wind's change of the stop, WSR against the port
// over the KCL line and against the app's linear model (src/model.js:
// drift = c mph bars; stop x (1 + h mph))
async function windpower() {
  const { DEFAULT_CLUBS } = await import(pathToFileURLs(path.join(HARNESS, "../../src/model.js")));
  const rows = load("wind-h10-").filter((r) => r.shots.some((x) => x.q != null && x.q < 1)).flatMap((r) => r.shots);
  const out = [];
  const near = (x, deg) => Math.abs(((x.relDeg - deg + 540) % 360) - 180) < 20;
  const clubs = [...new Set(rows.map((x) => x.club))];
  const order = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"].filter((c) => clubs.includes(c));
  out.push("Crosswind: sideways drift in yd (+ = with the wind), the mean of the wind from either side, the calm shot's own offset taken out; hole 10's tee along its default line. The app: c x mph x bars, c its WSR-seeded default.", "");
  out.push("| club | bars | air (s) | 10 mph: WSR carry / rest | port carry / rest | app | 30 mph: WSR carry / rest | port carry / rest | app | WSR 30 / 10 mph | WSR share of the full-power drift at 10 mph (app's) |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  const along = [];
  for (const club of order) {
    const cl = DEFAULT_CLUBS.find((c) => c.id === club);
    let full10 = null;
    const qs = [...new Set(rows.filter((x) => x.club === club).map((x) => x.q))].sort((a, b) => b - a);
    const line = {};
    for (const q of qs) {
      const g = rows.filter((x) => x.club === club && x.q === q);
      const calm = g.find((x) => x.speedIdx === 0);
      if (!calm) continue;
      const drift = (idx) => {
        const R = g.find((x) => x.speedIdx === idx && near(x, 90)), L = g.find((x) => x.speedIdx === idx && near(x, -90));
        if (!R || !L) return null;
        const w = (k) => ((R.wsr[k] - calm.wsr[k]) - (L.wsr[k] - calm.wsr[k])) / 2;
        const p = (k) => ((R.portKcl[k] - calm.portKcl[k]) - (L.portKcl[k] - calm.portKcl[k])) / 2;
        return { wc: w("carryAcross"), wr: w("stopAcross"), pc: p("carryLateral"), pr: p("lateral") };
      };
      const stop = (idx) => {
        const T = g.find((x) => x.speedIdx === idx && near(x, 0)), H = g.find((x) => x.speedIdx === idx && near(x, 180));
        return T && H ? { wt: T.wsr.stop - calm.wsr.stop, wh: H.wsr.stop - calm.wsr.stop, pt: T.portKcl.stop - calm.portKcl.stop, ph: H.portKcl.stop - calm.portKcl.stop, calm: calm.wsr.stop } : null;
      };
      line[q] = { d10: drift(5), d30: drift(15), s10: stop(5), s30: stop(15), air: calm.airTicks != null ? calm.airTicks / 240 : null };
      if (q === 1) full10 = line[q].d10?.wr;
    }
    for (const q of qs) {
      const L = line[q];
      if (!L) continue;
      const bars = 4 * q, app10 = cl.c * 10 * bars, app30 = cl.c * 30 * bars;
      const c = (d) => (d ? `${f1(d.wc)} / ${f1(d.wr)}` : "–"), p = (d) => (d ? `${f1(d.pc)} / ${f1(d.pr)}` : "–");
      out.push(`| ${club} | ${bars} | ${L.air != null ? L.air.toFixed(2) : "–"} | ${c(L.d10)} | ${p(L.d10)} | ${f1(app10)} | ${c(L.d30)} | ${p(L.d30)} | ${f1(app30)} | ${L.d10 && L.d30 ? (L.d30.wr / L.d10.wr).toFixed(2) : "–"} | ${L.d10 && full10 ? `${(L.d10.wr / full10).toFixed(3)} (${(bars / 4).toFixed(2)})` : "–"} |`);
      if (L.s10 || L.s30) along.push({ club, bars, L, cl });
    }
  }
  out.push("", "Head and tail wind: the stop's change in yd against the calm shot; the app: calm stop x h x mph.", "");
  out.push("| club | bars | calm stop | 10 mph tail / head: WSR | port | app | 30 mph tail / head: WSR | port | app |", "|---|---|---|---|---|---|---|---|---|");
  for (const { club, bars, L, cl } of along) {
    const a = (s) => (s ? `${sg(s.wt)} / ${sg(s.wh)}` : "–"), p = (s) => (s ? `${sg(s.pt)} / ${sg(s.ph)}` : "–"), ap = (s, mph) => (s ? `${sg(cl.h * mph * s.calm)} / ${sg(-cl.h * mph * s.calm)}` : "–");
    out.push(`| ${club} | ${bars} | ${f1((L.s10 ?? L.s30).calm)} | ${a(L.s10)} | ${p(L.s10)} | ${ap(L.s10, 10)} | ${a(L.s30)} | ${p(L.s30)} | ${ap(L.s30, 30)} |`);
  }
  return out.join("\n");
}
const pathToFileURLs = (p) => new URL(`file:///${p.replace(/\\/g, "/")}`).href;

// wind on putts (run-puttwind.mjs): from the green and from the fringe, the
// rest in wind against the calm putt's, bit for bit, and the port's figure
function puttwind() {
  const out = [];
  out.push("| save (lie) | putt power | winds | bit-identical to calm | largest move of the rest, along / across (yd) | the port's largest, along / across |", "|---|---|---|---|---|---|");
  for (const r of load("puttwind-").sort((a, b) => a.hole - b.hole || b.lie - a.lie)) {
    for (const p of r.putts) {
      const n = p.winds.length, same = p.winds.filter((w) => w.identical).length;
      const big = (k) => p.winds.reduce((m, w) => (Math.abs(w[k]) > Math.abs(m) ? w[k] : m), 0);
      out.push(`| hole ${r.hole} ${r.save} (${r.lie === 6 ? "green" : r.lie === 9 ? "fringe" : r.lie}) | ${p.power} | ${n} (30 mph x 8 directions, 10 mph x 2) | ${same} of ${n} | ${big("dAlong").toFixed(4)} / ${big("dAcross").toFixed(4)} | ${big("portAlong").toFixed(4)} / ${big("portAcross").toFixed(4)} |`);
    }
    for (const t of r.traces ?? []) out.push(`| hole ${r.hole} ${r.save}: traced | ${t.power} | ${2 * t.wind.speedIdx} mph at ${t.relDeg.toFixed(0)} deg | ${t.firstDifferentTick == null ? `identical on all ${t.ticks} ticks` : `first different at lifetime ${t.firstDifferentTick}`} | | |`);
  }
  return out.join("\n");
}

// 2d, pooled: the capture window's half-width against the speed at the cup,
// every green and spot: the bisected edges (run-cupedge.mjs; the half-width
// of the two sides' brackets, where WSR's line shift cancels) and the traced
// putts (run-cup.mjs; per speed the largest |pass| WSR holed and the smallest
// it missed, in its own frame). The app: holed within 0.15 yd at <= 4.07 yd/s.
function cupwindow() {
  const rows = [];
  for (const r of load("cupedge-")) {
    for (const e of r.edges) {
      const R = e.sides?.right, L = e.sides?.left;
      if (!R || !L) { rows.push({ v: e.speed, w: e.centre.holed ? null : 0, how: "bisected", where: `hole ${r.hole} ${r.spot ?? "green"}`, note: e.centre.holed ? "one side only" : "the centre line missed" }); continue; }
      const mid = (s) => (s.holedTo + s.missedFrom) / 2;
      rows.push({ v: e.speed, w: (mid(R) + mid(L)) / 2, how: "bisected", where: `hole ${r.hole} ${r.spot ?? "green"}`, note: e.shift ? `WSR's line ${e.shift.mean >= 0 ? "+" : ""}${e.shift.mean.toFixed(3)} off the app's` : "" });
    }
  }
  for (const r of load("cup-h").filter((r) => !r.f.includes("grid1"))) {
    const by = {};
    for (const p of r.putts) (by[p.excess] ??= []).push(p);
    for (const ps of Object.values(by)) {
      const v = ps.reduce((s, p) => s + p.wsr.speed, 0) / ps.length;
      const inn = ps.filter((p) => p.wsr.holed).map((p) => Math.abs(p.wsr.offset)), out = ps.filter((p) => !p.wsr.holed).map((p) => Math.abs(p.wsr.offset));
      const hi = inn.length ? Math.max(...inn) : null, lo = out.filter((x) => hi == null || x > hi).length ? Math.min(...out.filter((x) => hi == null || x > hi)) : null;
      rows.push({ v, w: hi != null && lo != null ? (hi + lo) / 2 : hi ?? 0, how: "traced", where: `hole ${r.hole}`, note: `holed to ${hi != null ? hi.toFixed(3) : "–"}, missed from ${lo != null ? lo.toFixed(3) : "–"}` });
    }
  }
  rows.sort((a, b) => a.v - b.v);
  const out = ["| speed at the cup (yd/s) | half-width (yd) | how | where | note | the app's rule |", "|---|---|---|---|---|---|"];
  for (const x of rows) out.push(`| ${x.v.toFixed(2)} | ${x.w == null ? "–" : x.w.toFixed(3)} | ${x.how} | ${x.where} | ${x.note} | ${x.v <= 4.07 ? "0.150" : "0 (too fast)"} |`);
  return out.join("\n");
}

// 2d, the read (run-puttread.mjs): the robust read and the committed one, each
// putted in WSR at its own aim with the strength moved up and down
function puttread() {
  const out = ["| green (spot) | putt (yd) | read | aim (deg) | power | holes in the model | WSR, power off by -0.08 ... +0.08 (x4 = bars) | holed in WSR |", "|---|---|---|---|---|---|---|---|"];
  let tot = { robust: [0, 0], committed: [0, 0] };
  for (const r of load("puttread-").sort((a, b) => a.hole - b.hole || a.save.localeCompare(b.save))) {
    for (const [name, x] of Object.entries(r.reads)) {
      const marks = x.putts.map((p) => (p.holed ? "o" : ".")).join(" ");
      const n = x.putts.filter((p) => p.holed).length;
      tot[name][0] += n; tot[name][1] += x.putts.length;
      out.push(`| hole ${r.hole} (${r.save.replace(/^h\d\d-|\.sav$/g, "")}) | ${f1(r.distance)} | ${name} | ${x.aim.toFixed(3)} | ${x.power.toFixed(4)} | ${x.model ? `${x.model.lo.toFixed(4)}-${x.model.hi.toFixed(4)}` : "–"} | ${marks} | ${n} of ${x.putts.length} |`);
    }
  }
  out.push("", `In all: the robust read holed ${tot.robust[0]} of ${tot.robust[1]} putts in WSR, the committed one ${tot.committed[0]} of ${tot.committed[1]} (o = holed, . = missed, from -0.08 to +0.08 of putter power in 0.02 steps).`);
  return out.join("\n");
}

// 3: the plan and its sensitivity (run-plan.mjs)
function plan() {
  const out = [];
  const holes = {};
  for (const r of load("plan-h")) Object.assign(holes, r.holes);
  out.push("| hole | stroke | plan | from | to the pin before (yd) | rest from the pin | +0.05 bar | -0.05 bar | 0.3 deg right | 0.3 deg left | 1.1 deg right | 1.1 deg left |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  const cell = (o) => (o.holed ? "**holed**" : `${f1(o.toPin)}${o.hazard ? ` (${["", "water", "OB", "valley"][o.hazard]})` : o.restLie && !["fairway", "green", "fringe", "tee"].includes(o.restLie) ? ` ${o.restLie}` : ""}`);
  for (const h of Object.keys(holes).map(Number).sort((a, b) => a - b)) {
    for (const s of holes[h].strokes) {
      const v = Object.fromEntries((s.variants ?? []).map((x) => [x.name, x]));
      const vc = (n) => (v[n] ? cell(v[n]) : "–");
      out.push(`| ${h} | ${s.k} | ${s.plan.club} ${(s.plan.power * 4).toFixed(2)} bars | ${s.lie} | ${f1(s.toPinBefore)} | ${cell(s.base)} | ${vc("+0.05 bar")} | ${vc("-0.05 bar")} | ${vc("0.3 deg right")} | ${vc("0.3 deg left")} | ${vc("1.1 deg right")} | ${vc("1.1 deg left")} |`);
    }
  }
  const n = Object.values(holes).map((H) => H.strokes.length);
  out.push("", `Strokes to hole out, holes ${Object.keys(holes).join(", ")}: ${n.join(", ")} (total ${n.reduce((a, b) => a + b, 0)}).`);
  return out.join("\n");
}

// 2e: the pin-power assist; the formula recomputed from each row with
// lib/assist.mjs as it stands
async function assist() {
  const { assistP3 } = await import("./lib/assist.mjs");
  const out = [];
  for (const r of load("assist-")) {
    // the assist acts from the window's second frame, held or not
    for (const x of r.shots) {
      const t = r.tables[x.club];
      x.formula = x.game.frames > 1 ? assistP3({ p2: x.p2, pPin: t.pPin, best: t.bestYd * YD, cap: 1, spin: x.back }) : { p3: x.p2 };
    }
    out.push(`Hole ${r.hole}, ${r.save}: the ball ${f1(r.distance)} yd from the pin, lie ${r.lie}, calm, aimed at the pin. The aim table per club: the pin power (index / 256), the best smoothed distance and the build time.`, "");
    out.push("| club | pin power | best (yd) | build (s) |", "|---|---|---|---|");
    for (const [c, t] of Object.entries(r.tables)) out.push(`| ${c} | ${t.pPin.toFixed(4)} | ${f1(t.bestYd)} | ${(t.ms / 1000).toFixed(0)} |`);
    out.push("", "| club | swung p2 | p2 - pin power | s7c (bs) | window frames | game power | formula | WSR carry / rest | rest from the pin | port at p2: carry / rest | port at the game's power: carry / rest | WSR rest - port at p2 |");
    out.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const x of r.shots) {
      out.push(`| ${x.club} | ${x.p2.toFixed(4)} | ${(x.d >= 0 ? "+" : "") + x.d.toFixed(3)} | ${x.s7c} (${x.back.toFixed(3)}) | ${x.game.frames}${x.hold ? "" : " (not held)"} | ${x.game.power.toFixed(4)} | ${x.formula.p3.toFixed(4)} | ${f1(x.wsr.carry)} / ${f1(x.wsr.stop)} | ${x.wsr.toPin <= 0.2 ? "**holed**" : f1(x.wsr.toPin)} | ${f1(x.portSwung.carry)} / ${f1(x.portSwung.stop)} | ${f1(x.portFinal.carry)} / ${f1(x.portFinal.stop)} | ${sg(x.wsr.stop - x.portSwung.stop)} |`);
    }
    const dp = r.shots.map((x) => x.game.power - x.formula.p3);
    const live = r.shots.filter((x) => x.wsr.toPin > 0.2);
    out.push("", `Game power minus the formula: ${fmtS(stats(dp))} (mean / rms / worst, ${r.shots.length} swings). WSR minus the port flown at the game's power: carry ${fmtS(stats(r.shots.map((x) => x.wsr.carry - x.portFinal.carry)))} yd; rest ${fmtS(stats(live.map((x) => x.wsr.stop - x.portFinal.stop)))} yd over the ${live.length} not holed (the port has no cup). At the swung power, as the app flies it: carry ${fmtS(stats(r.shots.map((x) => x.wsr.carry - x.portSwung.carry)))}, rest ${fmtS(stats(live.map((x) => x.wsr.stop - x.portSwung.stop)))} yd.`, "");
  }
  return out.join("\n");
}

// 2f: backspin and the red zone
function spin() {
  const out = [];
  const A = load("spin-h").flatMap((r) => r.A ?? []);
  if (A.length) {
    out.push("A. Backspin (s7c the swing's input, bs = s7c x P1c on the ball), calm, from hole 10's tee along the default line, over the KCL line:", "");
    out.push("| club | power | s7c | bs | WSR carry / rest | port carry / rest | rest: WSR - port | spin's cut, WSR / port |", "|---|---|---|---|---|---|---|---|");
    for (const x of A) {
      const base = A.find((y) => y.club === x.club && y.q === x.q && y.s7c === 0);
      out.push(`| ${x.club} | ${x.q} | ${x.s7c} | ${x.back.toFixed(3)} | ${f1(x.wsr.carry)} / ${f1(x.wsr.stop)} | ${f1(x.port.carry)} / ${f1(x.port.stop)} | ${sg(x.wsr.stop - x.port.stop)} | ${f1(base.wsr.stop - x.wsr.stop)} / ${f1(base.port.stop - x.port.stop)} |`);
    }
    out.push("", `Rest, WSR - port: ${fmtS(stats(A.map((x) => x.wsr.stop - x.port.stop)))} yd over ${A.length} shots.`, "");
  }
  for (const r of load("spin-h").filter((r) => r.f.includes("red"))) {
    for (const part of ["B", "C"]) {
      const rows = r[part] ?? [];
      if (!rows.length) continue;
      out.push(part === "B" ? "B. The red zone on a full lie (tee), the raw swing value fed past the 1.1 dead band, the game's own power, curve size m, coin and side spin; the window held to its timer:" : "C. The same from rough (the lie set to 2 before the swing):", "");
      out.push("| club | raw | game power / expected | m / expected | window / expected | side spin | WSR carry, across at carry / rest, across | port (with the game's side spin from the same tick) | across at carry: WSR - port |", "|---|---|---|---|---|---|---|---|---|");
      for (const x of rows) out.push(`| ${x.club} | ${x.raw} | ${x.game.power.toFixed(4)} / ${x.expect.power == null ? "curve" : x.expect.power.toFixed(4)} | ${x.game.m.toFixed(3)} / ${x.expect.m.toFixed(3)} | ${x.game.frames} / ${x.expect.frames} | ${x.game.side.toFixed(3)} | ${f1(x.wsr.carry)}, ${sg(x.wsr.carryAcross)} / ${f1(x.wsr.stop)}, ${sg(x.wsr.stopAcross)} | ${f1(x.port.carry)}, ${sg(x.port.carryLateral)} / ${f1(x.port.stop)}, ${sg(x.port.lateral)} | ${sg(x.wsr.carryAcross - x.port.carryLateral)} |`);
      out.push("");
    }
  }
  return out.join("\n");
}

const SECTIONS = { sweep, wind, windpower, trees, cup, cupedge, cupwindow, puttread, assist, spin, plan, puttwind };
if (process.argv.includes("--write")) {
  // REPORT.md's tables live between <!-- begin:NAME --> and <!-- end:NAME -->;
  // the prose around them is written by hand and left alone
  const file = path.join(HARNESS, "REPORT.md");
  let text = fs.readFileSync(file, "utf8");
  for (const [name, fn] of Object.entries(SECTIONS)) {
    const re = new RegExp(`(<!-- begin:${name} -->)[\\s\\S]*?(<!-- end:${name} -->)`);
    if (!re.test(text)) continue;
    const body = await fn();
    text = text.replace(re, (m, a, b) => `${a}\n${body}\n${b}`);
    console.log(`REPORT.md: ${name}`);
  }
  fs.writeFileSync(file, text);
} else {
  const which = process.argv[2] ?? "sweep";
  console.log(SECTIONS[which] ? await SECTIONS[which]() : `unknown section ${which}`);
}
