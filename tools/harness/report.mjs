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
  const done = Object.entries(holes).map(([h, H]) => ({ h, n: H.strokes.length, holed: !!H.strokes[H.strokes.length - 1]?.base?.holed }));
  const holedOnes = done.filter((x) => x.holed);
  out.push("", `Strokes to hole out: ${done.map((x) => `hole ${x.h} ${x.n}${x.holed ? "" : " (not holed)"}`).join(", ")}; ${holedOnes.reduce((a, x) => a + x.n, 0)} over the ${holedOnes.length} holed.`);
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

// 2d at every cup (run-pinputts.mjs, results/pins/*.json; --dir another
// folder, e.g. results/pins-dev): per cup the spots used, the read in WSR
// against the model, the roll's rest, WSR's line at the cup against the
// app's and the window's edges, then the same pooled by the slope at the cup.
// The app's side is flown again here from every putt's injected heading and
// power with src/putt.js as it stands (lib/green.mjs predict), so a model
// change shows without a Dolphin re-run; WSR's side is the run's.
// a window row's half-width: in WSR's own frame (see pins()) and in the app's
// offsets as 5.2 has it, with k = how far WSR's pass moves per yd of the
// app's offset between the two shift putts. Only where both edges are near
// misses (the first missed putt passing within 0.3 yd): a slow ball across a
// steep cup can drop in rolling back down from above it, and the putt beside
// that one roll yards away, an edge of something other than the window
function windowHalf(w) {
  const [A, B] = w.shiftPutts ?? [];
  if (!A?.wsr || !B?.wsr || A.wsr.holed || B.wsr.holed || A.skipped || B.skipped) return null;
  if (!(w.sides.right.missedPass < 0.3 && w.sides.left.missedPass < 0.3)) return null;
  const hA = Number(A.inj[0]), hB = Number(B.inj[0]);
  if (hA === hB) return null;
  // WSR's line: the traced first approach where there is one (a slow ball on
  // a steep cup can roll back past the cup, and the look-ahead's closest
  // approach be that one), else the look-ahead's closest approach
  const off = (x) => x.wsr.trace?.first?.offset ?? x.wsr.offset;
  const oA = off(A), oB = off(B), k = (oA - oB) / (A.o - B.o);
  // a line that does not move with the aim (0.5-1.5 yd per yd of the app's)
  // is not a line through the cup: no half-width
  if (!(k > 0.5 && k < 1.5)) return null;
  const pAt = (h) => oB + ((h - hB) * (oA - oB)) / (hA - hB);
  const edge = (s) => {
    const at = (o) => (Math.abs(o - w.c) < 1e-9 ? w.centre2 ?? w.centre : s.putts.find((p) => !p.skipped && Math.abs(p.o - o) < 1e-9));
    const a = at(s.holedAt), b = at(s.missedAt);
    return a && b ? (Number(a.inj[0]) + Number(b.inj[0])) / 2 : null;
  };
  const hR = edge(w.sides.right), hL = edge(w.sides.left);
  if (hR == null || hL == null) return null;
  const mid = (x) => (x.holedTo + x.missedFrom) / 2;
  return { wsr: Math.abs(pAt(hR) - pAt(hL)) / 2, app: (mid(w.sides.right) + mid(w.sides.left)) / 2, k };
}

async function pins() {
  const i = process.argv.indexOf("--dir");
  const dirArg = i >= 0 ? process.argv[i + 1] : "results/pins";
  const dir = path.resolve(HARNESS, dirArg);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  if (!files.length) return `No cup measured yet (${dirArg} holds no results).`;
  const { greenModel, P } = await import("./lib/green.mjs");
  const deg = (r) => (r * 180) / Math.PI;
  const rms = (a) => { const v = a.filter(Number.isFinite); return v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) : null; };
  const mx = (a) => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0) : null; };
  const mean = (a) => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const f2 = (v) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(2)), f3 = (v) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(3));
  const s3 = (v) => (v == null || !Number.isFinite(v) ? "–" : (v >= 0 ? "+" : "") + v.toFixed(3));
  const SPEEDS = [1, 2, 3];
  const cups = [];
  // one cup's spots may come from several files (a cup split over instances
  // with --spots and its own --out, or a spot made again in a later run):
  // merged by hole, cup and green state; of a spot two files hold, the one
  // that was made (usable), then the finished one, else the file updated last
  const byCup = new Map();
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (r.kind !== "pinputts") continue;
    const key = `${r.hole}|${r.id}|${r.green}`, have = byCup.get(key);
    if (!have) { byCup.set(key, { ...r, spots: { ...r.spots }, files: [f] }); continue; }
    const newer = (r.updatedAt ?? "") > (have.updatedAt ?? "");
    for (const [n, sp] of Object.entries(r.spots)) {
      const old = have.spots[n];
      const sameUse = !!sp.usable === !!old?.usable;
      if (!old || (sp.usable && !old.usable) || (sameUse && sp.done && !old.done) || (sameUse && !!sp.done === !!old.done && newer)) have.spots[n] = sp;
    }
    have.files.push(f);
    if (newer) have.updatedAt = r.updatedAt;
  }
  for (const r of byCup.values()) {
    const f = r.files.join(", ");
    const pin = r.cup.pin, g0 = greenModel(r.hole, r.ball0, pin), gr = new Float64Array(2);
    g0.field.grad(g0.fCup.x * g0.W, g0.fCup.y * g0.H, gr);
    const c = { f, r, appSlope: deg(Math.atan(Math.hypot(gr[0], gr[1]))), spots: 0, used: 0, read0: [0, 0, 0], reads: [0, 0, 0], agree: [0, 0], widthW: [], widthM: [], widthMc: [],
      along: [], across: [], line: [], win: Object.fromEntries(SPEEDS.map((v) => [v, { w: [], app: [] }])), checks: [], detail: [] };
    for (const sp of Object.values(r.spots)) {
      c.spots++;
      if (!sp.usable || !sp.ball) { c.detail.push({ name: sp.name, why: sp.why ?? (sp.done ? "not used" : "not finished") }); continue; }
      c.used++;
      const d = { name: sp.name, D: sp.D, model: sp.model, off: sp.off, read: sp.read, pat: "", patM: "", along: [], across: [], line: [], win: {} };
      c.detail.push(d);
      const g = greenModel(r.hole, sp.ball, pin);
      const app = (p) => g.predict(Number(p.inj[0]), Number(p.inj[1]));
      // the look-ahead against the real ball: in the same putt (its records
      // against where the real ball stopped), and across two runs of one putt
      // (the look-ahead-only run's rest against the real ball's)
      const all = [...(sp.read?.putts ?? []), ...(sp.roll ?? [])].filter((p) => p.wsr);
      for (const p of all.filter((p) => p.wsr.check)) {
        const la = all.find((q) => q !== p && !q.wsr.check && q.inj[0] === p.inj[0] && q.inj[1] === p.inj[1]);
        const cross = la ? (la.wsr.rest && p.wsr.pos ? Math.hypot(la.wsr.rest[0] - p.wsr.pos[0], la.wsr.rest[1] - p.wsr.pos[1], la.wsr.rest[2] - p.wsr.pos[2]) : null) : undefined;
        c.checks.push({ restDelta: p.wsr.check.restDelta, cross, same: la ? la.wsr.holed === p.wsr.holed : null, inCup: p.wsr.check.inCup === p.wsr.holed });
      }
      // the read: the 9 putts round its power, the model's verdict on each, its
      // holing range at the read's aim (a fine scan of the strength, 0.004)
      const rp = (sp.read?.putts ?? []).filter((p) => p.role === "read" && !p.skipped);
      if (rp.length) {
        const p0 = rp.find((p) => p.dq === 0);
        let nW = 0, nM = 0;
        for (const p of rp) {
          const m = app(p).holed;
          d.pat += p.wsr.holed ? "o" : "."; d.patM += m ? "o" : ".";
          nW += p.wsr.holed ? 1 : 0; nM += m ? 1 : 0;
          c.agree[0] += m === p.wsr.holed ? 1 : 0; c.agree[1]++;
          if (p === p0) { c.read0[0] += p.wsr.holed ? 1 : 0; c.read0[1] += m ? 1 : 0; c.read0[2]++; }
        }
        c.reads[0] += nW; c.reads[1] += nM; c.reads[2] += rp.length;
        c.widthW.push(0.02 * nW);
        if (p0) {
          // the model's holing strengths at the read's aim (0.004 steps over
          // +-0.24): the run through the read's own power (else the widest),
          // whole and clipped to the putts' +-0.09 (WSR's 9 putts cover that)
          const a = app(p0).angDeg, vD = P.vFlat(g.D), q0 = Number(p0.inj[1]);
          const holes = (q) => q >= 0.05 && P.simPutt(g.field, g.fBall, g.fCup, a, P.wsrPuttV0(q) / vD, { trace: false }).holed;
          const runs = [];
          let cur = null;
          for (let k = -60; k <= 60; k++) {
            const q = q0 + 0.004 * k;
            if (holes(q)) { if (!cur) runs.push((cur = { lo: q, hi: q })); else cur.hi = q; } else cur = null;
          }
          const run = runs.find((x) => x.lo <= q0 + 1e-9 && x.hi >= q0 - 1e-9) ?? runs.reduce((b, x) => (!b || x.hi - x.lo > b.hi - b.lo ? x : b), null);
          c.widthM.push(run ? run.hi - run.lo + 0.004 : 0);
          c.widthMc.push(run ? Math.max(0, Math.min(run.hi + 0.002, q0 + 0.09) - Math.max(run.lo - 0.002, q0 - 0.09)) : 0);
        }
      }
      // the roll: the rest of the putts that miss on purpose, WSR - app, and the
      // line at the cup (the first approach where traced, else the look-ahead's
      // closest, signed by the app's own travel direction) on the ones passing
      // it beyond the rim funnel's reach (0.22 yd) at 0.3 yd/s or more
      for (const p of (sp.roll ?? []).filter((p) => p.role === "roll" && !p.skipped)) {
        const a = app(p);
        if (!p.wsr.holed && p.wsr.restFromCup != null) { for (const x of [c, d]) { x.along.push(p.wsr.restAlong - a.rest[0]); x.across.push(p.wsr.restAcross - a.rest[1]); } }
        const tr = p.wsr.trace?.first;
        if (tr ? tr.pass > 0.22 && tr.speed > 0.3 && a.first.speed > 0.3 : p.wsr.pass > 0.22 && a.speed > 0.3) for (const x of [c, d]) x.line.push(tr ? tr.offset - a.first.offset : p.wsr.offset - a.offset);
      }
      // the window: the half-width between the two sides' edges, in WSR's
      // own frame: each edge is the aim halfway between its last holed and
      // first missed putt, and WSR's line there is read off the two putts the
      // app passes 0.25 yd either side (their look-ahead passes, signed,
      // linear in the aim between them), so neither the app's line nor how
      // its offsets map to WSR's enters; against the app's window at its speed
      // there. (5.2 took the half-width in the app's offsets, (right + left) /
      // 2 of the brackets' middles, which is WSR's only while WSR's pass moves
      // one for one with the app's: 0.99-1.01 on hole 2, 0.78-1.09 on hole 20.)
      for (const w of sp.window ?? []) {
        const R = w.sides?.right, L = w.sides?.left;
        if (!R || !L || R.failed || L.failed || !c.win[w.v]) continue;
        const hw = windowHalf(w);
        if (hw == null) continue;
        const sp0 = w.centre && !w.centre.skipped ? app(w.centre).first.v : w.speed;
        c.win[w.v].w.push(hw.wsr); c.win[w.v].app.push(P.cupWindow(sp0));
        d.win[w.v] = { w: hw.wsr, appFrame: hw.app, k: hw.k, app: P.cupWindow(sp0), c: w.c };
      }
    }
    cups.push(c);
  }
  cups.sort((a, b) => a.r.hole - b.r.hole || a.r.id.localeCompare(b.r.id));
  const out = [];
  out.push(`${cups.length} cup${cups.length === 1 ? "" : "s"} (${dirArg}). Per cup: the spots used of those tried; the read's own putt (dq 0) holed in WSR / by the model, over the spots; the read's 9 putts holed in WSR / by the model and how many verdicts agree; the strength that holes at the read's aim, mean over the spots in WSR putter power (x4 = bars): WSR's (0.02 x its putts holed, within the putts' +-0.09) against the model's range clipped to the same +-0.09, and the model's whole range in brackets (a 0.004 scan); the roll's rest, WSR - app along / across the putt (rms, worst; the putts that miss on purpose); WSR's line at the cup minus the app's (mean / rms, putts passing 0.22 yd or more away); the window's half-width at 1 / 2 / 3 yd/s at the cup, WSR's in its own frame (the edges' aims put on WSR's line through the putts 0.25 yd either side; mean over the 3 yd spots) with the app's cupWindow at its speed there in brackets.`, "");
  out.push("| hole | cup | set | slope at the cup: KCL / app (deg) | spots | read: dq 0 holed WSR / model | read putts holed WSR / model (agree) | holing strength WSR / model | roll rest along / across: rms (worst) | line at the cup (mean / rms) | window 1 / 2 / 3 yd/s |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  const winCell = (c, v) => (c.win[v].w.length ? `${f3(mean(c.win[v].w))} (${f3(mean(c.win[v].app))})` : "–");
  for (const c of cups) {
    const r = c.r;
    out.push(`| ${r.hole} | ${r.label} (${r.id}) | ${r.sets.join("/")} | ${f2(r.cup.kcl.slopeDeg)} / ${f2(c.appSlope)} | ${c.used} of ${c.spots} | ${c.read0[0]} / ${c.read0[1]} of ${c.read0[2]} | ${c.reads[0]} / ${c.reads[1]} of ${c.reads[2]} (${c.agree[0]}) | ${f3(mean(c.widthW))} / ${f3(mean(c.widthMc))} (${f3(mean(c.widthM))}) | ${f2(rms(c.along))} (${f2(mx(c.along))}) / ${f2(rms(c.across))} (${f2(mx(c.across))}) | ${s3(mean(c.line))} / ${f3(rms(c.line))} | ${SPEEDS.map((v) => winCell(c, v)).join(" / ")} |`);
  }
  // pooled by the slope at the cup (the KCL triangle under the pin)
  const BINS = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 14]];
  out.push("", "By the slope at the cup (KCL), pooled over the cups and their spots:", "");
  out.push("| slope (deg) | cups | spots | read: dq 0 holed WSR / model | read verdicts agree | holing strength WSR / model | roll rest along / across rms | line at the cup (mean / rms) | window 1 / 2 / 3 yd/s |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const [lo, hi] of BINS) {
    const cs = cups.filter((c) => c.r.cup.kcl.slopeDeg >= lo && (c.r.cup.kcl.slopeDeg < hi || (hi === 14 && c.r.cup.kcl.slopeDeg <= 90)));
    if (!cs.length) { out.push(`| ${lo}-${hi} | 0 | | | | | | | |`); continue; }
    const sum = (k, j) => cs.reduce((s, c) => s + c[k][j], 0), cat = (k) => cs.flatMap((c) => c[k]);
    const win = (v) => { const w = cs.flatMap((c) => c.win[v].w), a = cs.flatMap((c) => c.win[v].app); return w.length ? `${f3(mean(w))} (${f3(mean(a))}, ${w.length})` : "–"; };
    out.push(`| ${lo}-${hi} | ${cs.length} | ${cs.reduce((s, c) => s + c.used, 0)} | ${sum("read0", 0)} / ${sum("read0", 1)} of ${sum("read0", 2)} | ${sum("agree", 0)} of ${sum("agree", 1)} | ${f3(mean(cat("widthW")))} / ${f3(mean(cat("widthMc")))} (${f3(mean(cat("widthM")))}) | ${f2(rms(cat("along")))} / ${f2(rms(cat("across")))} | ${s3(mean(cat("line")))} / ${f3(rms(cat("line")))} | ${SPEEDS.map(win).join(" / ")} |`);
  }
  // --detail: every spot of every cup (not written to REPORT.md)
  if (process.argv.includes("--detail")) for (const c of cups) {
    out.push("", `Hole ${c.r.hole} ${c.r.label} (${c.r.id}), ${c.f}: per spot (read: o = holed, . = missed, from -0.08 to +0.08; WSR over the model)`, "");
    out.push("| spot | D (yd) | slope at the ball KCL / app | read aim / power | read WSR / model | roll rest along / across rms | line at the cup | window 1 / 2 / 3 yd/s (app) |", "|---|---|---|---|---|---|---|---|");
    for (const d of c.detail) {
      if (d.why) { out.push(`| ${d.name} | – | – | – | ${d.why} | | | |`); continue; }
      out.push(`| ${d.name} | ${f2(d.D)}${d.off ? ` (${f2(d.off)} off)` : ""} | ${f2(d.model?.kclSlopeDeg)} / ${f2(d.model?.slopeDeg)} | ${d.read ? `${d.read.a.toFixed(2)} / ${d.read.q0.toFixed(4)}` : "–"} | ${d.pat || "–"} / ${d.patM || "–"} | ${f2(rms(d.along))} / ${f2(rms(d.across))} | ${s3(mean(d.line))} | ${SPEEDS.map((v) => (d.win[v] ? `${f3(d.win[v].w)} (${f3(d.win[v].app)}; app frame ${f3(d.win[v].appFrame)}, k ${f2(d.win[v].k)})` : "–")).join(" / ")} |`);
    }
  }
  const ch = cups.flatMap((c) => c.checks), rd = ch.map((x) => x.restDelta).filter(Number.isFinite), cr = ch.map((x) => x.cross).filter(Number.isFinite);
  out.push("", `The look-ahead against the real ball (the read's putt waited for and traced, the roll putts traced on cups of 6 deg or more, one roll putt per spot in the other mode): ${ch.length} putts that waited for the real ball; the look-ahead's records in the same putt put the rest ${rd.length ? `within ${Math.max(...rd).toFixed(4)} u of the real ball's on all ${rd.length}` : "–"}; a look-ahead-only run of the same putt ${cr.length ? `within ${Math.max(...cr).toFixed(4)} u on all ${cr.length}` : "–"}, the same verdict on ${ch.filter((x) => x.same).length} of ${ch.filter((x) => x.same != null).length}; the real ball in the cup exactly when the look-ahead holed it on ${ch.filter((x) => x.inCup).length} of ${ch.length}.`);
  return out.join("\n");
}

const SECTIONS = { sweep, wind, windpower, trees, cup, cupedge, cupwindow, puttread, assist, spin, plan, puttwind, pins };
if (process.argv.includes("--write")) {
  // REPORT.md's tables live between <!-- begin:NAME --> and <!-- end:NAME -->;
  // the prose around them is written by hand and left alone. A section name
  // before --write fills only that section (report.mjs pins --write)
  const file = path.join(HARNESS, "REPORT.md");
  let text = fs.readFileSync(file, "utf8");
  const only = SECTIONS[process.argv[2]] ? process.argv[2] : null;
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (only && name !== only) continue;
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
