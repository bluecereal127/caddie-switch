// lib/flagcells.mjs against what WSR did at the flag (state/flagstick/measure.json) and on
// the cases that need it (hole 17's back cups), offline:
//  (a) every measured shot of E1-E4 flown by the model from the experiment's ball at the
//      shot's own power and aim (flagCatch, the flag's frame from the experiment's wind):
//      the first pin contact (cloth / stick / none), the catch and the outcome against
//      WSR's real ball (its hits that acted: every stick hit, the flag tests whose
//      response ran) and its look-ahead ball; each disagreement with the model's flight
//      error at the pin (model - WSR at the same tick) and the smallest rigid shift of the
//      model's path that gives WSR's verdict;
//  (b) flagCells from E4's ball (hole 1, 109.5 yd, the 7-iron and every other club): the
//      cells round WSR's measured holing band (0.8255-0.8300 at 3.0776 rad);
//  (c) flagCells from the tee states of h17-s3, h17-s4, h17-s5 (index.json: the tee ball,
//      the pin, the hole-start wind), the time of each call;
//  and flagWindFromFrame against the six flag frames WSR built (state/flagstick/saves-info.json).
//   node tools/harness/test-flagcells.mjs [--only a,b,c] [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FC from "./lib/flagcells.mjs";
import * as FS from "./lib/flagstick.mjs";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const only = (arg("--only", "a,b,c")).split(",");
const YD = 9.144, DEG = Math.PI / 180;
const M = JSON.parse(fs.readFileSync(path.join(HERE, "state/flagstick/measure.json"), "utf8"));
const IDX = JSON.parse(fs.readFileSync(path.join(HERE, "state/saves/pins/index.json"), "utf8"));
const report = { started: new Date().toISOString() };
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? "-" : x.toFixed(d));
const deg = (r) => (r * 180) / Math.PI;

// ---- (a) the measured shots ----
// WSR's hits that changed the ball (state/flagstick/summarize.mjs `acting`)
const acting = (s) => s.wsr.hits.filter((h) => h.kind === "stick" || h.acted);
const kindOf = (h) => (!h ? "none" : h.kind === "flag" ? "cloth" : "stick");
function verdictOf(path, pin, E) {
  const cap = FS.pinCapture(path, pin, { ticksPerSample: 1, wind: { angle: E.wind.angle, speedIdx: E.wind.speedIdx }, lie: E.lie, wsr: true });
  return { kind: !cap ? "none" : cap.kind === "box" ? "cloth" : "stick", cap };
}
// the smallest rigid shift of the model's path (u) that gives WSR's first contact
function boundaryShift(path, E, want, errDir) {
  const dirs = [errDir, [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].filter(Boolean);
  for (let d = 0.025; d <= 1.0001; d += 0.025)
    for (const u of dirs) {
      const sh = path.map((p) => [p[0] + u[0] * d, p[1] + u[1] * d, p[2] + u[2] * d, p[3]]);
      if (verdictOf(sh, E.pin, E).kind === want) return { d: +d.toFixed(3), dir: u === errDir ? "the flight error's" : `[${u.join(", ")}]` };
    }
  return null;
}
if (only.includes("a")) {
  const A = (report.a = { shots: 0, firstAgree: 0, catchAgree: 0, contactAgree: 0, wsrCatches: 0, modelCatches: 0, bothCatch: 0, holedAgreeFlat: 0, holedAgreeKcl: 0, lookAhead: [0, 0], ms: [], byExp: {}, disagreements: [], outcomeDisagreements: [], conf: {} });
  console.log("(a) the measured shots, flown by the model from each experiment's ball (flagCatch)");
  for (const E of Object.values(M.experiments)) {
    const wind = { angle: E.wind.angle, speedIdx: E.wind.speedIdx };
    const B = (A.byExp[E.id] = { shots: 0, firstAgree: 0, catchAgree: 0 });
    for (const s of E.shots) {
      const t0 = performance.now();
      const r = FC.flagCatch({ hole: E.hole, ball: E.ball, heading: s.heading, club: E.club, power: s.gamePower ?? s.power, lie: E.lie, pin: E.pin, flagWind: wind, wind });
      A.ms.push(performance.now() - t0);
      const h0 = acting(s)[0], wk = kindOf(h0), mk = r.first;
      const wCatch = wk === "cloth", mCatch = r.catch;
      A.shots++; B.shots++;
      if (wk === mk) { A.firstAgree++; B.firstAgree++; }
      if (wCatch === mCatch) { A.catchAgree++; B.catchAgree++; }
      if ((wk !== "none") === (mk !== "none")) A.contactAgree++;
      if (wCatch) A.wsrCatches++;
      if (mCatch) A.modelCatches++;
      if (wCatch && mCatch) {
        A.bothCatch++;
        if (r.holedEst === s.wsr.holed) A.holedAgreeFlat++;
        if (r.kcl.holed === s.wsr.holed) A.holedAgreeKcl++;
        if (r.holedEst !== s.wsr.holed || r.kcl.holed !== s.wsr.holed)
          A.outcomeDisagreements.push({ exp: E.id, n: s.n, power: +(s.gamePower ?? s.power).toFixed(4), heading: +s.heading.toFixed(6), wsr: s.wsr.holed ? "holed" : `${s.wsr.restYd.toFixed(2)} yd`,
            wsrCatch: { height: +(h0.pos[1] - E.pin[1]).toFixed(2), offset: +Math.hypot(h0.pos[0] - E.pin[0], h0.pos[2] - E.pin[2]).toFixed(2) },
            modelCatch: { tick: Math.round(r.cap.tick), height: +r.cap.height.toFixed(2), offset: +r.cap.offset.toFixed(2), local: r.cap.local.map((x) => +x.toFixed(2)) },
            flat: r.flat.holed ? `holed (${r.flat.how})` : `${r.flat.restYd.toFixed(2)} yd`, kcl: r.kcl.holed ? "holed" : `${r.kcl.restYd.toFixed(2)} yd` });
      }
      A.conf[`${wk} -> ${mk}`] = (A.conf[`${wk} -> ${mk}`] ?? 0) + 1;
      // WSR's look-ahead ball, for reference: its first pin test that fired (a flag test moving away counts there)
      const la = s.wsr.simHits?.first?.[0];
      if (la) { A.lookAhead[1]++; if ((la.kind === "flag" ? "cloth" : "stick") === wk) A.lookAhead[0]++; }
      if (wk === mk && wCatch === mCatch) continue;
      // the flight error at the pin: the model's free path against WSR's real one at the tick before WSR's first contact, else at WSR's closest approach
      const P = r.path, near = s.near;
      let tRef = h0 ? h0.life - 1 : null;
      if (tRef == null) { let best = Infinity; for (const x of near) { const d = Math.hypot(x[1], x[3]); if (d < best) { best = d; tRef = x[0]; } } }
      const w = near.find((x) => x[0] === tRef), m = P.find((p) => p[3] === tRef);
      const err = w && m ? [m[0] - (w[1] + E.pin[0]), m[1] - (w[2] + E.pin[1]), m[2] - (w[3] + E.pin[2])] : null;
      const errN = err ? Math.hypot(...err) : null;
      const shift = boundaryShift(P, E, wk, err && errN > 1e-6 ? err.map((x) => -x / errN) : null);
      const rec = {
        exp: E.id, n: s.n, power: +(s.gamePower ?? s.power).toFixed(4), heading: +s.heading.toFixed(6),
        wsr: h0 ? { kind: wk, tick: h0.life, height: +(h0.pos[1] - E.pin[1]).toFixed(2), offset: +Math.hypot(h0.pos[0] - E.pin[0], h0.pos[2] - E.pin[2]).toFixed(2) } : { kind: "none" },
        wsrHoled: s.wsr.holed, wsrRestYd: +s.wsr.restYd.toFixed(2),
        model: r.cap ? { kind: mk, tick: Math.round(r.cap.tick), height: +r.cap.height.toFixed(2), offset: +r.cap.offset.toFixed(2), local: r.cap.local?.map((x) => +x.toFixed(2)) } : { kind: "none" },
        flightErrU: err ? err.map((x) => +x.toFixed(3)) : null, flightErrN: errN != null ? +errN.toFixed(3) : null, shiftU: shift,
      };
      rec.nearBoundary = !!shift && errN != null && shift.d <= Math.max(errN, 0.3) + 1e-9;
      A.disagreements.push(rec);
    }
  }
  const ms = A.ms.slice().sort((x, y) => x - y);
  A.msMedian = +ms[ms.length >> 1].toFixed(1); A.msMax = +ms[ms.length - 1].toFixed(1); delete A.ms;
  console.log(`  ${A.shots} shots: first pin contact (cloth / stick / none) agrees on ${A.firstAgree}, contact or not on ${A.contactAgree}, the catch (cloth first) on ${A.catchAgree}`);
  for (const [id, B] of Object.entries(A.byExp)) console.log(`    ${id}: ${B.shots} shots, first contact ${B.firstAgree}, catch ${B.catchAgree}`);
  console.log(`  WSR caught ${A.wsrCatches}, the model ${A.modelCatches}, both ${A.bothCatch}; holed among both: the flat estimate agrees with WSR on ${A.holedAgreeFlat}/${A.bothCatch}, the KCL continuation on ${A.holedAgreeKcl}/${A.bothCatch}`);
  console.log(`  WSR -> model: ${JSON.stringify(A.conf)}`);
  console.log(`  WSR's look-ahead ball's first pin test matches its real ball's first contact on ${A.lookAhead[0]} of ${A.lookAhead[1]} shots where it had one`);
  console.log(`  flagCatch: ${A.msMedian} ms median, ${A.msMax} ms max a stroke`);
  console.log(`  ${A.disagreements.length} disagreements (${A.disagreements.filter((d) => d.nearBoundary).length} within the model's flight error of a boundary):`);
  for (const d of A.disagreements)
    console.log(`    ${d.exp} #${d.n} P ${d.power} h ${d.heading}: WSR ${d.wsr.kind}${d.wsr.tick != null ? `@${d.wsr.tick} H ${d.wsr.height} u, ${d.wsr.offset} u out` : ""} (${d.wsrHoled ? "holed" : `${d.wsrRestYd} yd`}) | model ${d.model.kind}${d.model.tick != null ? `@${d.model.tick} H ${d.model.height} u, ${d.model.offset} u out${d.model.local ? ` L [${d.model.local.join(", ")}]` : ""}` : ""} | flight error ${d.flightErrU ? `[${d.flightErrU.join(", ")}] = ${d.flightErrN} u` : "-"}; WSR's verdict at a shift of ${d.shiftU ? `${d.shiftU.d} u (${d.shiftU.dir})` : "> 1 u"} -> ${d.nearBoundary ? "near a boundary" : "NOT explained by the flight error"}`);
  console.log(`  the outcome of the ${A.bothCatch} catches both made, where the flat estimate or the KCL continuation differs from WSR:`);
  for (const d of A.outcomeDisagreements)
    console.log(`    ${d.exp} #${d.n} P ${d.power}: WSR ${d.wsr} (caught ${d.wsrCatch.height} u up, ${d.wsrCatch.offset} u out) | model caught @${d.modelCatch.tick} ${d.modelCatch.height} u up, ${d.modelCatch.offset} u out, L [${d.modelCatch.local.join(", ")}] | flat ${d.flat} | KCL ${d.kcl}`);
}

// ---- (b) E4's situation ----
const cellLine = (c) => `${c.club} ${c.power.toFixed(4)} at ${deg(c.heading).toFixed(3)} deg (${c.heading.toFixed(5)} rad, ${c.aimOffDeg >= 0 ? "+" : ""}${c.aimOffDeg.toFixed(2)} off the pin line) robust ${c.robust.toFixed(2)} margin ${c.marginU} u, ${c.route}, caught ${c.height} u up ${c.offset} u out at ${c.speed} yd/s, flat ${c.flat.how}, KCL ${c.kcl.holed ? "holed" : `${c.kcl.restYd} yd`}${c.verified != null ? `, verified ${c.verified}` : ""}`;
function clubTable(S) {
  for (const [club, C] of Object.entries(S.clubs))
    console.log(`    ${club.padEnd(6)} line band ${C.lineBand ? C.lineBand.join("-") : "none"}, ${C.flights} flights (${C.coarse} coarse, ${C.refine} refining, ${C.fill} on the grid), ${C.catches} catches, ${C.holes} holing, ${C.ms} ms${C.closest ? `; closest ${C.closest.e} (box units) at ${C.closest.power} ${C.closest.aimOffDeg >= 0 ? "+" : ""}${C.closest.aimOffDeg} deg (${C.closest.status})` : ""}${C.best ? `; best ${C.best.power} ${C.best.aimOffDeg >= 0 ? "+" : ""}${C.best.aimOffDeg} deg robust ${C.best.robust} margin ${C.best.marginU} u` : ""}`);
}
if (only.includes("b")) {
  const E = M.experiments.E4;
  const st = { hole: E.hole, ball: { pos: E.ball }, pin: E.pin, player: { lie: E.lie } };
  const flagWind = { angle: E.wind.angle, speedIdx: E.wind.speedIdx };
  console.log(`\n(b) E4's ball (hole ${E.hole}, lie ${E.lie}, ${E.D.toFixed(1)} yd): flagCells over every club`);
  const cells = FC.flagCells(st, { flagWind, maxCells: Infinity });
  const S = cells.stats;
  console.log(`  ${S.cells} holing cells in ${(S.ms / 1000).toFixed(1)} s (${S.flights} flights${S.truncated ? ", TRUNCATED by the budget" : ""})`);
  clubTable(S);
  const h0 = Math.atan2(E.pin[0] - E.ball[0], E.pin[2] - E.ball[2]);
  const seven = cells.filter((c) => c.club === "7iron"), fl = seven.filter((c) => c.route === "flight");
  // WSR's measured holes: power 0.8255-0.8300 at headings 3.077559-3.077614 rad
  const wsrHoles = E.shots.filter((s) => s.wsr.holed && acting(s)[0]?.kind === "flag");
  const wq = wsrHoles.map((s) => s.gamePower ?? s.power), wh = wsrHoles.map((s) => s.heading);
  const atAim = (h) => fl.filter((c) => Math.abs(c.heading - h) <= 0.0055 * DEG);
  const aimNear = fl.length ? fl.reduce((b, c) => (Math.abs(c.heading - 3.0776) < Math.abs(b - 3.0776) ? c.heading : b), fl[0].heading) : null;
  const row = aimNear != null ? atAim(aimNear) : [];
  const inBand = row.filter((c) => c.power >= Math.min(...wq) - 1e-9 && c.power <= Math.max(...wq) + 1e-9);
  console.log(`  WSR holed through the cloth ${wsrHoles.length} times at power ${Math.min(...wq).toFixed(4)}-${Math.max(...wq).toFixed(4)}, headings ${Math.min(...wh).toFixed(6)}-${Math.max(...wh).toFixed(6)} rad (the pin line ${h0.toFixed(6)})`);
  console.log(`  the model's 7-iron: ${seven.length} cells, ${fl.length} in flight (power ${fl.length ? `${Math.min(...fl.map((c) => c.power)).toFixed(4)}-${Math.max(...fl.map((c) => c.power)).toFixed(4)}` : "-"}, aims ${fl.length ? `${Math.min(...fl.map((c) => c.aimOffDeg)).toFixed(2)} to +${Math.max(...fl.map((c) => c.aimOffDeg)).toFixed(2)}` : "-"} deg off the pin line), ${seven.length - fl.length} off a bounce`);
  console.log(`  at the grid aim nearest WSR's (${aimNear != null ? aimNear.toFixed(5) : "-"} rad): ${row.length} in-flight cells, power ${row.length ? `${Math.min(...row.map((c) => c.power)).toFixed(4)}-${Math.max(...row.map((c) => c.power)).toFixed(4)}` : "-"}; ${inBand.length} of them inside WSR's band`);
  const byAim = new Map();
  for (const c of fl) { const k = c.aimOffDeg.toFixed(2); const a = byAim.get(k) ?? []; a.push(c); byAim.set(k, a); }
  console.log("  the 7-iron's in-flight cells by aim (deg off the pin line: count, power range, best robust / margin):");
  for (const [k, a] of [...byAim].sort((x, y) => +x[0] - +y[0])) console.log(`    ${(+k >= 0 ? "+" : "") + k}: ${String(a.length).padStart(3)}, ${Math.min(...a.map((c) => c.power)).toFixed(4)}-${Math.max(...a.map((c) => c.power)).toFixed(4)}, ${Math.max(...a.map((c) => c.robust)).toFixed(2)} / ${Math.max(...a.map((c) => c.marginU)).toFixed(2)} u`);
  console.log("  the first cells overall:");
  for (const c of cells.slice(0, 6)) console.log(`    ${cellLine(c)}`);
  const pass = inBand.length > 0;
  console.log(`  ${pass ? "PASS" : "FAIL"}: cells in or next to WSR's measured band`);
  // the budget: every club still gets stages 1-3 before any fill, the fills share what is left
  const tight = FC.flagCells(st, { flagWind, budgetMs: 6000 });
  const T = tight.stats, cut = Object.entries(T.clubs).filter(([, C]) => C.truncated).map(([k]) => k);
  console.log(`  with a 6 s budget: ${T.cells} cells in ${(T.ms / 1000).toFixed(1)} s, every club looked at: ${Object.keys(T.clubs).length === 7}, fills cut short: ${cut.join(", ") || "none"}; the first ${tight[0] ? cellLine(tight[0]) : "-"}`);
  report.bTight = { ms: T.ms, cells: T.cells, truncated: T.truncated, cut, clubs: Object.keys(T.clubs).length };
  report.b = { ms: S.ms, flights: S.flights, cells: S.cells, clubs: S.clubs, wsrBand: [Math.min(...wq), Math.max(...wq)], sevenIron: { cells: seven.length, flight: fl.length,
    flightPower: fl.length ? [Math.min(...fl.map((c) => c.power)), Math.max(...fl.map((c) => c.power))] : null, atWsrAim: { heading: aimNear, cells: row.length, inBand: inBand.length,
      power: row.length ? [Math.min(...row.map((c) => c.power)), Math.max(...row.map((c) => c.power))] : null } }, first: cells.slice(0, 10), pass };
}

// ---- (c) hole 17's back cups from their tee states ----
if (only.includes("c")) {
  console.log("\n(c) hole 17 from the tee states (lie 15, the flag's frame from the hole-start wind)");
  report.c = {};
  for (const key of ["h17-s3", "h17-s4", "h17-s5"]) {
    const cup = IDX.cups[key];
    const st = { hole: cup.hole, ball: { pos: cup.tee.pos }, pin: cup.pinRam, player: { lie: 15 } };
    const cells = FC.flagCells(st, { flagWind: cup.wind });
    const S = cells.stats;
    const fr = FS.flagFrame(cup.pinRam, cup.wind);
    console.log(`  ${key} (${cup.label}): ${S.D} yd, pin ${((cup.pinRam[1] - cup.tee.pos[1]) / YD).toFixed(1)} yd above the tee ball, the flag streaming ${f(deg(fr.t), 0)} deg (s ${fr.s.toFixed(3)}): ${S.cells} holing cells in ${(S.ms / 1000).toFixed(1)} s, ${S.flights} flights${S.truncated ? " (TRUNCATED)" : ""}`);
    clubTable(S);
    for (const c of cells.slice(0, 5)) console.log(`    ${cellLine(c)}`);
    const routes = { flight: cells.filter((c) => c.route === "flight").length, bounce: cells.filter((c) => c.route === "bounce").length };
    const kclToo = cells.filter((c) => c.kcl.holed).length;
    if (cells.length) console.log(`    of the ${cells.length} cells returned: ${routes.flight} in flight, ${routes.bounce} off a bounce; ${kclToo} hole by the KCL continuation too; robust 1.00: ${cells.filter((c) => c.robust === 1).length}`);
    report.c[key] = { ms: S.ms, flights: S.flights, cells: S.cells, truncated: S.truncated, clubs: S.clubs, routes, kclToo, first: cells.slice(0, 10) };
  }
}
// ---- the flag's frame read from RAM (pin+0xb8..0xef) back to a wind: flagWindFromFrame ----
{
  const info = JSON.parse(fs.readFileSync(path.join(HERE, "state/flagstick/saves-info.json"), "utf8"));
  let worst = 0, n = 0;
  for (const [, x] of Object.entries(info)) {
    const raw = x.pinFrame?.raw;
    if (!raw) continue;
    const F = FS.flagFrame(x.pin, FC.flagWindFromFrame(raw));
    const want = [...raw.slice(2, 5), ...raw.slice(8, 11), ...raw.slice(11, 14)], got = [...F.ax, ...F.az, ...F.origin];
    worst = Math.max(worst, ...want.map((v, i) => Math.abs(v - got[i])));
    n++;
  }
  console.log(`\nflagWindFromFrame: ${n} frames WSR built (state/flagstick/saves-info.json), flagFrame() from the wind read back matches them to ${worst.toExponential(1)} u`);
  report.frames = { n, worst };
}
const out = arg("--json", path.join(HERE, "state", "flagcells", "test-flagcells.json"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\nwrote ${path.relative(HERE, out)}`);
