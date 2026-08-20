// ROI calibration helper.
//   node tools/inspect.mjs <capture.png|jpg> [outDir]
//
// Loads tools/roi.json (or roi.example.json as fallback), writes each ROI's
// crop as a PNG into outDir (default tools/_inspect/) plus a copy of the full
// frame with ROI rectangles burned in, so you can eyeball and nudge the
// fractional rects until each crop tightly frames its HUD element.
import { existsSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng, cropFrac } from "./lib/image.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [, , file, outDirArg] = process.argv;
if (!file) { console.error("usage: node tools/inspect.mjs <capture> [outDir]"); process.exit(1); }

const roiPath = existsSync(join(here, "roi.json")) ? join(here, "roi.json") : join(here, "roi.example.json");
const roi = JSON.parse(readFileSync(roiPath, "utf8"));
console.log("using ROIs from", basename(roiPath));

const img = loadImage(file);
console.log(`frame: ${img.width}x${img.height}`);
const outDir = outDirArg ?? join(here, "_inspect");
mkdirSync(outDir, { recursive: true });

const COLORS = { gauge: [255, 60, 60], distance: [60, 255, 60], windSpeed: [60, 120, 255], windArrow: [255, 200, 0] };
const overlay = { width: img.width, height: img.height, data: Buffer.from(img.data) };

for (const [name, cfg] of Object.entries(roi)) {
  if (name.startsWith("_") || !cfg.rect) continue;
  savePng(join(outDir, `${name}.png`), cropFrac(img, cfg.rect));
  // burn rectangle into overlay
  const c = COLORS[name] ?? [255, 0, 255];
  const x0 = Math.round(cfg.rect[0] * img.width), y0 = Math.round(cfg.rect[1] * img.height);
  const x1 = x0 + Math.round(cfg.rect[2] * img.width), y1 = y0 + Math.round(cfg.rect[3] * img.height);
  const set = (x, y) => { if (x < 0 || y < 0 || x >= img.width || y >= img.height) return; const i = (y * img.width + x) * 4; overlay.data[i] = c[0]; overlay.data[i + 1] = c[1]; overlay.data[i + 2] = c[2]; };
  for (let x = x0; x <= x1; x++) { set(x, y0); set(x, y0 + 1); set(x, y1); set(x, y1 - 1); }
  for (let y = y0; y <= y1; y++) { set(x0, y); set(x0 + 1, y); set(x1, y); set(x1 - 1, y); }
  console.log(`${name}: rect px [${x0},${y0} ${x1 - x0}x${y1 - y0}] -> ${name}.png`);
}
savePng(join(outDir, "_overlay.png"), overlay);
console.log("wrote crops + _overlay.png to", outDir);
