// The first question's tables from results/h10-irons.json (+ the logged
// Switch rows of public/derived.json): markdown on stdout.
//   node tools/harness/report-h10.mjs
import fs from "node:fs";
import path from "node:path";
import { HARNESS } from "./lib/dolphin.mjs";
import { DERIVED } from "./lib/course.mjs";

const r = JSON.parse(fs.readFileSync(path.join(HARNESS, "results", "h10-irons.json"), "utf8"));
const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const sg = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(1));
const out = [];
out.push("| club | wind | WSR carry | land vs tee | 1st bounce long / high | WSR rest | WSR roll | port (app grid) carry / rest / roll | port (KCL) carry / rest / roll | port flat carry / rest / roll |");
out.push("|---|---|---|---|---|---|---|---|---|---|");
for (const s of r.shots) {
  const w = s.wsr, a = s.portApp, k = s.portKcl, f = s.portFlat;
  out.push(`| ${s.club} | ${s.wind === "calm" ? "calm" : "4 mph head"} | ${f1(w.carry)} | ${f1(w.landDy)} | ${f1(w.bounce1.len)} / ${f1(w.bounce1.height)} | ${f1(w.rest)} | ${f1(w.roll)} | ${f1(a.carry)} / ${f1(a.stop)} / ${f1(a.roll)} | ${k ? `${f1(k.carry)} / ${f1(k.stop)} / ${f1(k.roll)}` : "–"} | ${f1(f.carry)} / ${f1(f.stop)} / ${f1(f.roll)} |`);
}
out.push("");
out.push("Residuals, WSR minus port (yd):");
out.push("");
out.push("| club | wind | carry, app grid | rest, app grid | carry, KCL | rest, KCL |");
out.push("|---|---|---|---|---|---|");
for (const s of r.shots) {
  out.push(`| ${s.club} | ${s.wind === "calm" ? "calm" : "4 mph head"} | ${sg(s.wsr.carry - s.portApp.carry)} | ${sg(s.wsr.rest - s.portApp.stop)} | ${s.portKcl ? sg(s.wsr.carry - s.portKcl.carry) : "–"} | ${s.portKcl ? sg(s.wsr.rest - s.portKcl.stop) : "–"} |`);
}
// the Switch: hole 10's logged full-power iron tee shots (4 mph, head)
const rows = (DERIVED.shots ?? []).filter((x) => x.hole === 10 && x.power === 4 && Math.abs(x.pos?.y - 0.8646) < 0.003 && ["3iron", "5iron", "7iron", "9iron", "wedge"].includes(x.club));
if (rows.length) {
  out.push("");
  out.push("The Switch on the same tee (public/derived.json, full power, 4 mph headwind) against WSR in the same wind:");
  out.push("");
  out.push("| club | Switch ended (yd) | WSR rest, 4 mph head (harness) | Switch minus WSR |");
  out.push("|---|---|---|---|");
  for (const x of rows) {
    const s = r.shots.find((y) => y.club === x.club && y.wind === "head4");
    out.push(`| ${x.club} (stroke ${x.stroke}) | ${x.ended} | ${s ? f1(s.wsr.rest) : "–"} | ${s ? sg(x.ended - s.wsr.rest) : "–"} |`);
  }
}
if (r.determinism) out.push("", `Determinism: ${r.determinism.club} (${JSON.stringify(r.determinism.wind)}) flown twice from the same state: ${r.determinism.identical ? "bit-identical traces" : "DIFFERENT"} (${r.determinism.ticks} ticks).`);
console.log(out.join("\n"));
