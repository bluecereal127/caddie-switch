// Auto-learn character templates from already-classified frames (the
// manifest is ground truth: banner says "Hole N  Par N", badge says
// "Stroke 1"/"NNN yd to go", wind says "N mph"). Segment each known ROI,
// keep glyphs only when the count matches the expected text, label them
// from the expected string. Writes tools/templates/chars/*.json.
//   node tools/learn-templates.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, cropFrac, binarizeText } from "./lib/image.mjs";
import { segmentGlyphs, normalizeGlyph, NORM_W, NORM_H } from "./lib/digits.mjs";
import { binarizeTitle, POPUP_ROIS } from "./lib/popup.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const OUT = join(ROOT, "templates-work"); // staged here, promoted to tools/templates/chars
const DIR = join(ROOT, "tools", "templates", "chars");
mkdirSync(DIR, { recursive: true });

export const ROIS = {
  banner: [0.02, 0.04, 0.19, 0.05],
  badge: [0.058, 0.218, 0.155, 0.05],
  wind: [0.845, 0.16, 0.075, 0.048],
};

const manifest = JSON.parse(readFileSync(join(ROOT, "captures", "classification.json"), "utf8"));

const sim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) s++; return s / a.length; };

const bank = {}; // char -> [Uint8Array,...]
const bankTitle = {};
let learned = 0, skipped = 0;
const addSample = (ch, norm) => {
  bank[ch] = bank[ch] || [];
  if (bank[ch].some((t) => sim(t, norm) > 0.93)) return;
  if (bank[ch].length >= 8) return;
  bank[ch].push(norm); learned++;
};
const addTitleSample = (ch, norm) => {
  bankTitle[ch] = bankTitle[ch] || [];
  if (bankTitle[ch].some((t) => sim(t, norm) > 0.93)) return;
  if (bankTitle[ch].length >= 6) return;
  bankTitle[ch].push(norm); learned++;
};

const harvest = (img, roi, text) => {
  const compact = text.replace(/\s+/g, "");
  const segs = segmentGlyphs(binarizeText(cropFrac(img, roi)));
  if (segs.length !== compact.length) { skipped++; return; }
  segs.forEach((s, i) => addSample(compact[i], normalizeGlyph(s)));
};

for (const f of manifest.frames) {
  if (!f.hole) continue;
  const path = join(INBOX, f.file);
  if (!existsSync(path)) continue;
  const img = loadImage(path);
  harvest(img, ROIS.banner, `Hole ${f.hole} Par ${f.par}`);
  if (f.badge && /^(Stroke \d+|\d+ yd to go)$/.test(f.badge)) harvest(img, ROIS.badge, f.badge);
  if (f.windMph != null) harvest(img, ROIS.wind, `${f.windMph} mph`);
  if (f.club) harvest(img, [0.79, 0.92, 0.19, 0.05], f.club);
}

// labeled data from the labeling workflow: club labels + pop-up distance
// lines (same white-on-dark HUD font)
if (existsSync(join(ROOT, "captures", "labels.json"))) {
  const labels = JSON.parse(readFileSync(join(ROOT, "captures", "labels.json"), "utf8"));
  for (const a of labels.address ?? []) {
    const path = join(INBOX, a.file);
    if (!existsSync(path) || !a.club) continue;
    harvest(loadImage(path), [0.79, 0.92, 0.19, 0.05], a.club);
  }
  for (const p of labels.popups ?? []) {
    const path = join(INBOX, p.file);
    if (!existsSync(path)) continue;
    const img = loadImage(path);
    if (p.distanceText) harvest(img, [0.36, 0.40, 0.28, 0.06], p.distanceText);
    // pop-up TITLE uses a different style (white with teal outline) — its
    // glyphs go to a separate template bank
    if (p.title) {
      const compact = p.title.replace(/\s+/g, "");
      const segs = segmentGlyphs(binarizeTitle(cropFrac(img, POPUP_ROIS.title)));
      if (segs.length === compact.length)
        segs.forEach((s, i) => addTitleSample(compact[i], normalizeGlyph(s)));
      else skipped++;
    }
  }
}

let files = 0;
const safeName = (ch) => ch === "." ? "dot" : ch === "-" ? "dash" : /[a-z]/.test(ch) ? `lc-${ch}` : /[A-Z]/.test(ch) ? `uc-${ch}` : ch;
for (const [ch, variants] of Object.entries(bank)) {
  variants.forEach((v, i) => {
    writeFileSync(join(DIR, `${safeName(ch)}-${i}.json`),
      JSON.stringify({ label: ch, w: NORM_W, h: NORM_H, grid: Array.from(v) }));
    files++;
  });
}
const TDIR = join(ROOT, "tools", "templates", "title");
mkdirSync(TDIR, { recursive: true });
for (const [ch, variants] of Object.entries(bankTitle)) {
  variants.forEach((v, i) => {
    writeFileSync(join(TDIR, `${safeName(ch)}-${i}.json`),
      JSON.stringify({ label: ch, w: NORM_W, h: NORM_H, grid: Array.from(v) }));
    files++;
  });
}
console.log(`chars learned: ${Object.keys(bank).sort().join("")} | title: ${Object.keys(bankTitle).sort().join("")}`);
console.log(`${files} template files (${learned} variants), ${skipped} ROI reads skipped (count mismatch)`);
