// Teach the digit reader from a labeled capture.
//   node tools/learn-digits.mjs <capture> <roiName> <truth>
// e.g.
//   node tools/learn-digits.mjs cap1.jpg distance 187
//   node tools/learn-digits.mjs cap2.jpg windSpeed 12
//
// Segments the glyphs in that ROI, checks the count matches the truth string,
// and saves each as a labeled template under tools/templates/<roiName>/.
// 3-4 captures covering all ten digits is plenty; duplicates only help.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, cropFrac, binarize } from "./lib/image.mjs";
import { segmentGlyphs, normalizeGlyph, saveTemplate, loadTemplates } from "./lib/digits.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [, , file, roiName, truth] = process.argv;
if (!file || !roiName || !truth) {
  console.error("usage: node tools/learn-digits.mjs <capture> <roiName> <truth>");
  process.exit(1);
}
const roiPath = existsSync(join(here, "roi.json")) ? join(here, "roi.json") : join(here, "roi.example.json");
const cfg = JSON.parse(readFileSync(roiPath, "utf8"))[roiName];
if (!cfg) { console.error(`no ROI named "${roiName}" in roi config`); process.exit(1); }

const crop = cropFrac(loadImage(file), cfg.rect);
const segs = segmentGlyphs(binarize(crop, cfg.polarity ?? "light"));
if (segs.length !== truth.length) {
  console.error(`segmented ${segs.length} glyphs but truth "${truth}" has ${truth.length} chars.`);
  console.error("Tighten the ROI rect (inspect.mjs) or check the frame shows exactly that number.");
  process.exit(1);
}
const dir = join(here, "templates", roiName);
const existing = loadTemplates(dir).length;
segs.forEach((s, i) => saveTemplate(dir, truth[i], normalizeGlyph(s), existing + i));
console.log(`saved ${segs.length} templates to templates/${roiName}/ (total now ${existing + segs.length})`);
