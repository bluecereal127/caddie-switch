// Writes a 3-hole course's notes, results/courses/SLUG/NOTES.md, from its
// attempts (results/courses/SLUG/attempt-N.json, attempts.json) and the
// planner's memory of their strokes (results/knowledge/strokes.jsonl, which
// round-play.mjs fills as each stroke is played and round-planner.mjs reads
// before each stroke: lines that failed from a spot are not tried again, and
// a stroke that repeats an earlier one is corrected by what that one did).
// The notes say, per attempt and stroke, what was planned, what happened and
// how far the ball went from the port's flight, and gather what recurs: the
// penalties and big misses by hole and spot, the assist's pulls, the putts
// missed, what the planner now knows. A block between the lessons markers is
// kept as written (lessons drawn by hand from the notes).
//   node tools/harness/course-notes.mjs --slug classic-a [--n 3]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const slug = arg("--slug", null);
// the series: "courses" (the game's own wind) or another (results/<phase>, e.g. "calm": no wind, set by the harness)
const PHASE = arg("--phase", "courses");
const COURSES = {
  "resort-a": { name: "Resort A", holes: [1, 2, 3] }, "resort-b": { name: "Resort B", holes: [4, 5, 6] }, "resort-c": { name: "Resort C", holes: [7, 8, 9] },
  "classic-a": { name: "Classic A", holes: [10, 11, 12] }, "classic-b": { name: "Classic B", holes: [13, 14, 15] }, "classic-c": { name: "Classic C", holes: [16, 17, 18] },
};
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const LIE = { 1: "fairway", 2: "rough", 3: "sand", 6: "green", 9: "fringe", 10: "green", 11: "green", 15: "tee", 16: "sand" };
const C = COURSES[slug];
if (!C) { console.log(`no course ${slug}`); process.exit(2); }
const YD = 9.144, DEG = Math.PI / 180;
const DIR = path.join(HERE, "results", PHASE, slug);
const SRC = (n) => `${PHASE === "courses" ? "" : `${PHASE}/`}${slug}/attempt-${n}`;
const NOTES = path.join(DIR, "NOTES.md");
// the goal the supervisor plays to (its board.json), -6 since 2026-10-22
const GOAL = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, "results", PHASE, "board.json"), "utf8")).goal ?? -6; } catch { return -6; } })();
const fmt = (t) => (t > 0 ? `+${t}` : t === 0 ? "E" : `${t}`);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const attempts = fs.existsSync(path.join(DIR, "attempts.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "attempts.json"), "utf8")) : [];
const KNOW = path.join(HERE, "results", "knowledge", "strokes.jsonl");
const know = fs.existsSync(KNOW) ? fs.readFileSync(KNOW, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const kOf = new Map(know.map((r) => [r.src, r]));

// one stroke's line in the notes, and its flags for the findings
function strokeNote(n, hole, s, next) {
  const r = kOf.get(`${SRC(n)} h${hole} k${s.k}`);
  const flags = [];
  const toT = Math.atan2(s.pin[0] - s.from[0], s.pin[2] - s.from[2]);
  const lineDeg = r ? angDiff(r.launch, toT) / DEG : null;
  let dev = "";
  if (r?.pred && r.end && s.club !== "putter") {
    const dx = Math.sin(r.launch), dz = Math.cos(r.launch), ex = r.end[0] - r.from[0], ez = r.end[2] - r.from[2];
    const along = (ex * dx + ez * dz) / YD - r.pred.stop, across = (ex * -dz + ez * dx) / YD - r.pred.lateral;
    dev = `; against the port's flight ${along >= 0 ? "+" : ""}${along.toFixed(1)} yd along, ${across >= 0 ? "+" : ""}${across.toFixed(1)} across`;
    if (Math.hypot(along, across) >= 15 && !s.hazard) flags.push({ kind: "miss", text: `rested ${Math.hypot(along, across).toFixed(0)} yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there` });
  }
  if (s.hazard) flags.push({ kind: "hazard", text: `into ${s.hazard === 1 ? "water" : s.hazard === 2 ? "out of bounds" : "a valley"} (a penalty stroke); the line is not tried again from there` });
  if (s.gamePower != null && Math.abs(s.gamePower - s.plan.power) > 0.003 && s.club !== "putter") flags.push({ kind: "assist", text: `the game launched it at ${s.gamePower.toFixed(3)}, not the swung ${s.plan.power.toFixed(3)} (WSR's pin-power assist on a partial swing)` });
  if (s.plan?.expect?.repeat) flags.push({ kind: "repeat", text: `planned from ${s.plan.expect.repeat.src}'s identical stroke (${s.plan.expect.repeat.along >= 0 ? "+" : ""}${s.plan.expect.repeat.along} along, ${s.plan.expect.repeat.across >= 0 ? "+" : ""}${s.plan.expect.repeat.across} across the port)` });
  if (/not tried/.test(s.plan?.why ?? "")) flags.push({ kind: "avoided", text: s.plan.why.replace(/^.*; lines that failed/, "lines that failed") });
  if (s.club === "putter" && !s.holed) flags.push({ kind: "putt", text: `missed from ${s.toPin.toFixed(1)} yd: rests ${s.after.toFixed(1)} yd from the cup (the read: ${s.plan.why.replace(/^putt [\d.]+ yd /, "")})` });
  if (s.holed && s.club !== "putter") flags.push({ kind: "holed", text: `holed from ${s.toPin.toFixed(0)} yd off the green` });
  const restLie = s.holed ? "the cup" : s.hazard ? "a penalty drop" : next ? LIE[next.lie] ?? `lie ${next.lie}` : "?";
  const head = `${hole}.${s.k} from the ${LIE[s.lie] ?? `lie ${s.lie}`}, ${s.toPin.toFixed(1)} yd, wind ${s.wind.mph} mph (dir ${s.wind.dir})`;
  const what = s.club === "putter"
    ? `putter ${s.plan.power.toFixed(3)}, aimed ${s.plan.expect?.aimDeg != null ? `${s.plan.expect.aimDeg >= 0 ? "+" : ""}${s.plan.expect.aimDeg} deg` : "?"} of the cup`
    : `${s.club} ${s.plan.power.toFixed(2)}${lineDeg != null ? `, launched ${Math.abs(lineDeg).toFixed(1)} deg ${lineDeg >= 0 ? "left" : "right"} of the pin line` : ""}; planned: ${s.plan.expect?.restLie ?? "?"}, ${s.plan.expect?.toPin ?? "?"} yd from the pin`;
  const got = s.holed ? "HOLED" : `${restLie}, ${s.after.toFixed(1)} yd from the pin${dev}`;
  return { line: `- ${head}: ${what}. Result: ${got}.${flags.length ? " " + flags.map((f) => `**${f.kind}**: ${f.text}.`).join(" ") : ""}`, flags };
}

const sections = [], recur = {};
const perHole = Object.fromEntries(C.holes.map((h) => [h, []]));
for (const a of [...attempts].sort((x, y) => y.n - x.n)) {
  const f = path.join(DIR, `attempt-${a.n}.json`);
  if (!fs.existsSync(f)) continue;
  const at = JSON.parse(fs.readFileSync(f, "utf8"));
  const out = [`### Attempt ${a.n}: ${C.holes.map((h) => a.holes[h] ?? "-").join("-")} (${a.complete ? fmt(a.toPar) : `unfinished: ${a.why}`}), ${a.ended?.slice(0, 16).replace("T", " ")} UTC`, ""];
  for (const h of C.holes) {
    const st = at.holes?.[h]?.strokes ?? [];
    if (a.holes[h]) perHole[h].push(a.holes[h]);
    if (!st.length) continue;
    out.push(`Hole ${h} (par ${PAR[h]}): ${a.holes[h] ?? "?"} by the game's count${a.holes[h] && a.holes[h] > st.length ? ` (${a.holes[h] - st.length} penalty)` : ""}.`);
    for (const [i, s] of st.entries()) {
      const { line, flags } = strokeNote(a.n, h, s, st[i + 1]);
      out.push(line);
      for (const fl of flags) if (["hazard", "miss", "assist", "putt"].includes(fl.kind)) (recur[`${h} ${fl.kind}`] ??= []).push(`#${a.n} stroke ${s.k} (${s.club}${s.club === "putter" ? `, ${s.toPin.toFixed(1)} yd` : ""})`);
    }
    out.push("");
  }
  sections.push(out.join("\n"));
}
const done = attempts.filter((a) => a.complete);
const best = done.length ? done.reduce((b, a) => (a.toPar < b.toPar ? a : b)) : null;
const mine = know.filter((r) => C.holes.includes(r.hole));
const head = [
  `# ${C.name} (holes ${C.holes.join(", ")}, par ${C.holes.reduce((t, h) => t + PAR[h], 0)})`, "",
  `Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: ${-GOAL} under par (${C.holes.reduce((t, h) => t + PAR[h], 0) + GOAL} strokes). Written by course-notes.mjs after every attempt.`, "",
  `- Attempts finished: ${done.length}${attempts.length > done.length ? ` (and ${attempts.length - done.length} unfinished)` : ""}; best ${best ? `${fmt(best.toPar)} (#${best.n}, ${C.holes.map((h) => best.holes[h]).join("-")})` : "-"}; mean ${done.length ? fmt(+(done.reduce((t, a) => t + a.toPar, 0) / done.length).toFixed(2)) : "-"}; last five ${done.slice(-5).map((a) => fmt(a.toPar)).join(" ") || "-"}.`,
  ...C.holes.map((h) => `- Hole ${h} (par ${PAR[h]}): ${perHole[h].length ? `best ${Math.min(...perHole[h])}, mean ${(perHole[h].reduce((t, x) => t + x, 0) / perHole[h].length).toFixed(2)} over ${perHole[h].length}` : "not finished yet"}.`),
  `- The planner's memory of these holes: ${mine.length} strokes from every round and attempt, ${mine.filter((r) => r.fail).length} of them failed lines it no longer tries from their spots.`, "",
  "## What recurs", "",
  ...(Object.keys(recur).length ? Object.entries(recur).sort().map(([k, v]) => { const [h, kind] = k.split(" "); return `- Hole ${h}, ${kind === "hazard" ? "penalties" : kind === "miss" ? "strokes 15+ yd from the port's flight" : kind === "assist" ? "assist pulls" : "missed putts"}: ${v.join(", ")}.`; }) : ["- Nothing yet."]), "",
];
const old = fs.existsSync(NOTES) ? fs.readFileSync(NOTES, "utf8") : "";
const lessons = /<!-- lessons -->[\s\S]*?<!-- \/lessons -->/.exec(old)?.[0] ?? "<!-- lessons -->\n## Lessons\n\n(Drawn from the notes below as attempts come in.)\n<!-- /lessons -->";
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(NOTES, [...head, lessons, "", "## Attempts (newest first)", "", ...sections].join("\n") + "\n");
console.log(`wrote ${path.relative(HERE, NOTES)}: ${done.length} attempts`);
