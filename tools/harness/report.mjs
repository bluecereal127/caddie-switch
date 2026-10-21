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
  out.push("", "Shots that did not end cleanly (penalty, outer ground, water, valley):", "");
  out.push("| hole | club | power | WSR carry / rest | rest lie | hazard | port KCL carry / rest | port KCL+ rest |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const h of Object.keys(holes).map(Number).sort((a, b) => a - b))
    for (const x of holes[h].shots.filter((x) => !clean(x)))
      out.push(`| ${h} | ${x.club} | ${x.q} | ${f1(x.wsr.carry)} / ${f1(x.wsr.realStop ?? x.wsr.stop)} | ${x.wsr.realLie ?? x.wsr.restLie} | ${x.wsr.hazard ? ["", "water", "OB floor", "valley"][x.wsr.hazard] : x.wsr.restWater || x.underWater ? "water" : x.wsr.placed ? "placed" : "–"} | ${f1(x.portKcl?.carry)} / ${f1(x.portKcl?.stop)} | ${f1(x.portKclPlus?.stop)} |`);
  // the outer-ground rests: what modelling outer ground and walls would buy
  const outer = Object.entries(holes).flatMap(([h, H]) => H.shots.filter((x) => x.wsr.restLie === "outer" && x.realRestMatches !== false && !x.wsr.hazard).map((x) => ({ ...x, hole: Number(h) })));
  out.push("", `Shots resting on outer ground (${outer.length}), rest: WSR − port over the KCL as the app rolls it (outer = fairway): ${fmtS(stats(outer.map((x) => x.wsr.stop - x.portKcl?.stop)))}; with WSR's outer / wall constants: ${fmtS(stats(outer.map((x) => x.wsr.stop - x.portKclPlus?.stop)))} (mean / rms / worst).`);
  return out.join("\n");
}

async function wind() {
  const out = [];
  for (const r of load("wind-")) {
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

const which = process.argv[2] ?? "sweep";
console.log(which === "wind" ? await wind() : which === "sweep" ? await sweep() : `unknown section ${which}`);
