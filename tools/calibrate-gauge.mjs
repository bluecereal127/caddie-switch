// Build the gauge color model from two reference captures.
//   node tools/calibrate-gauge.mjs <empty-gauge-frame> <full-gauge-frame>
//
// empty = address frame before starting the swing (gauge at 0)
// full  = a maxed 4.0 swing from tee/fairway (gauge completely filled)
// Writes tools/gauge-cal.json. Re-run if the capture setup changes.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "./lib/image.mjs";
import { gaugeProfile, readGauge } from "./lib/gauge.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [, , emptyFile, fullFile] = process.argv;
if (!emptyFile || !fullFile) {
  console.error("usage: node tools/calibrate-gauge.mjs <empty-frame> <full-frame>");
  process.exit(1);
}
const roiPath = existsSync(join(here, "roi.json")) ? join(here, "roi.json") : join(here, "roi.example.json");
const roi = JSON.parse(readFileSync(roiPath, "utf8")).gauge;

const cal = {
  empty: gaugeProfile(loadImage(emptyFile), roi),
  full: gaugeProfile(loadImage(fullFile), roi),
};
writeFileSync(join(here, "gauge-cal.json"), JSON.stringify(cal));
console.log(`wrote gauge-cal.json (${cal.empty.length} scanlines)`);

// self-check: the calibration frames should read ~0.0 and ~4.0
const rE = readGauge(loadImage(emptyFile), roi, cal);
const rF = readGauge(loadImage(fullFile), roi, cal);
console.log(`self-check  empty -> power ${rE.power} (want ~0)   full -> power ${rF.power} (want ~4)`);
if (rE.power > 0.2 || rF.power < 3.8)
  console.warn("WARNING: self-check off — the gauge ROI rect is probably misaligned; fix roi.json with inspect.mjs first.");
