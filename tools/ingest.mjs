// Batch pipeline: folder of Switch captures -> Log-tab import JSON rows.
//   node tools/ingest.mjs <captureFolder> [--out rows.json]
//
// Expected capture rhythm (see tools/README.md): for every shot,
//   frame A: at ADDRESS  — distance-to-pin + wind readable, gauge empty
//   frame B: after SWING — power gauge locked at its final fill
// Frames are sorted by filename (Switch album names are timestamps) and
// classified address/post-swing by gauge fill, so extra or missing frames
// get flagged instead of silently mispairing.
//
// Emits rows: {club,power,lie,windSpeed,windDeg,ended,side?,hole?,stroke?}
//   power      — measured from gauge (needs gauge-cal.json)
//   windSpeed  — OCR (needs templates/windSpeed/)
//   ended      — this address distance minus next address distance
//   club/lie/windDeg — null for now: fill in while reviewing (club HUD +
//                arrow-direction templates are the next iteration)
// Review the JSON before importing; the app drops rows with null club/power.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "./lib/image.mjs";
import { readGauge } from "./lib/gauge.mjs";
import { loadTemplates, readNumber } from "./lib/digits.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
if (!folder) { console.error("usage: node tools/ingest.mjs <captureFolder> [--out rows.json]"); process.exit(1); }

const roiPath = existsSync(join(here, "roi.json")) ? join(here, "roi.json") : join(here, "roi.example.json");
const roi = JSON.parse(readFileSync(roiPath, "utf8"));
const calPath = join(here, "gauge-cal.json");
if (!existsSync(calPath)) { console.error("gauge-cal.json missing — run calibrate-gauge.mjs first"); process.exit(1); }
const cal = JSON.parse(readFileSync(calPath, "utf8"));
const distT = loadTemplates(join(here, "templates", "distance"));
const windT = loadTemplates(join(here, "templates", "windSpeed"));
if (!distT.length) console.warn("no distance templates yet — run learn-digits.mjs; distances will be null");
if (!windT.length) console.warn("no windSpeed templates yet — wind speeds will be null");

const POWER_MIN = 0.15; // gauge fill below this = address frame

const files = readdirSync(folder)
  .filter((f) => /\.(png|jpe?g)$/i.test(f)).sort()
  .map((f) => join(folder, f));
console.log(`${files.length} captures`);

const frames = files.map((f) => {
  const img = loadImage(f);
  const g = readGauge(img, roi.gauge, cal);
  const dist = distT.length ? readNumber(img, roi.distance, distT, roi.distance.polarity ?? "light") : null;
  const wind = windT.length ? readNumber(img, roi.windSpeed, windT, roi.windSpeed.polarity ?? "light") : null;
  return { file: f, power: g.power, gaugeConf: g.confidence, dist: dist?.value ?? null,
    distScore: dist?.minScore ?? null, wind: wind?.value ?? null,
    kind: g.power >= POWER_MIN ? "swing" : "address" };
});

// pair address -> following swing
const rows = [], warnings = [];
for (let i = 0; i < frames.length; i++) {
  const a = frames[i];
  if (a.kind !== "address") { warnings.push(`unpaired swing frame: ${a.file}`); continue; }
  const b = frames[i + 1];
  if (!b || b.kind !== "swing") { warnings.push(`address frame with no swing after it: ${a.file}`); continue; }
  // 'ended': distance closed by this shot = this address dist - next address dist.
  // A next-address distance LARGER than this one means a new hole started; the
  // hole-out shot's ended can't be derived from frames, so it stays null.
  const nextAddr = frames.slice(i + 2).find((f) => f.kind === "address");
  let ended = null;
  if (a.dist != null && nextAddr?.dist != null && nextAddr.dist < a.dist) ended = a.dist - nextAddr.dist;
  rows.push({ club: null, power: b.power, lie: null,
    windSpeed: a.wind, windDeg: null, ended,
    _frames: [a.file, b.file], _distBefore: a.dist,
    _lowConfidence: (a.distScore != null && a.distScore < 0.85) || b.gaugeConf < 0.05 || undefined });
  i++; // consume the swing frame
}

for (const w of warnings) console.warn("WARN:", w);
const json = JSON.stringify(rows, null, 2);
if (outFile) { writeFileSync(outFile, json); console.log(`wrote ${rows.length} rows to ${outFile}`); }
else console.log(json);
console.log("\nReview pass needed: fill club/lie/windDeg (and ended on hole-outs), " +
  "delete _-prefixed helper fields, then paste into the Log tab importer.");
