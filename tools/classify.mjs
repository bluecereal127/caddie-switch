// Classify new capture frames WITHOUT agents: template OCR for the banner /
// badge / wind, panel-band heuristics for frame type. Appends to
// captures/classification.json and renames catalog frames meaningfully.
//   node tools/classify.mjs            # classify new ULID-named inbox files
//   node tools/classify.mjs --test 30  # accuracy check vs known frames
// Prints a summary line: CLASSIFIED catalog=<n> other=<n>
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, cropFrac, binarizeText, px } from "./lib/image.mjs";
import { segmentGlyphs, normalizeGlyph, loadTemplates } from "./lib/digits.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const TEMPLATES = loadTemplates(join(ROOT, "tools", "templates", "chars"));

const ROIS = {
  banner: [0.02, 0.04, 0.19, 0.05],
  badge: [0.058, 0.218, 0.155, 0.05],
  wind: [0.845, 0.16, 0.075, 0.048],
  modeBand: [0.762, 0.278, 0.226, 0.028], // "Zoom" vs "Terrain ... Return" hints above the panel
};

const sim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) s++; return s / a.length; };

function readText(img, roi) {
  const segs = segmentGlyphs(binarizeText(cropFrac(img, roi)));
  let out = "", minScore = 1;
  for (const s of segs) {
    const norm = normalizeGlyph(s);
    let best = "?", bs = -1;
    for (const t of TEMPLATES) {
      const sc = sim(norm, Uint8Array.from(t.grid));
      if (sc > bs) { bs = sc; best = t.label; }
    }
    if (bs < minScore) minScore = bs;
    out += bs > 0.68 ? best : "?";
  }
  return { text: out, minScore, glyphs: segs.length };
}

// map OCR confusables into digits when a number is expected
const DIGITIZE = { l: "1", o: "0", S: "5", g: "9", e: "8", t: "1" };
const digitize = (s) => s.split("").map((c) => /\d/.test(c) ? c : (DIGITIZE[c] ?? "")).join("");

function classifyFrame(file) {
  const img = loadImage(join(INBOX, file));
  const banner = readText(img, ROIS.banner).text;
  // tolerate junk glyphs: hole = digits right after "H?le", par = FIRST
  // digit after "Par" (trailing underline fragments read as extra glyphs)
  const bm = banner.match(/[Hh].{0,3}?(\d{1,2})[Pp]a?r?(\d)/);
  if (!bm) return { file, frameType: "other", banner };
  const hole = parseInt(bm[1]), par = parseInt(bm[2]);
  if (!(hole >= 1 && hole <= 21 && par >= 3 && par <= 5)) return { file, frameType: "other", banner };

  const panel = cropRect(img, panelRect(img));

  // Frame type from two empirically-perfect separators (validated on all
  // 113 classified frames):
  // 1) "High" legend label ink: heightmaps >= 50, everything else 0
  const highTxt = binarizeText(cropFrac(img, [0.806, 0.344, 0.04, 0.038]));
  let highInk = 0; for (const v of highTxt.bin) highInk += v;
  // 2) the avatar's yellow direction pointer (compass corners excluded):
  //    map frames >= 3 pixels, green zooms <= 1
  const w = panel.width, h = panel.height;
  const cr = 0.15 * w, ccy = 0.822 * h, ccxL = 0.132 * w, ccxR = 0.832 * w;
  let yellow = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x - ccxL) ** 2 + (y - ccy) ** 2 < cr * cr) continue;
    if ((x - ccxR) ** 2 + (y - ccy) ** 2 < cr * cr) continue;
    const p = px(panel, x, y);
    if (p[0] > 225 && p[1] > 160 && p[1] < 215 && p[2] < 90) yellow++;
  }
  const frameType = highInk > 20 ? "greenHeightmap" : yellow >= 2 ? "map" : "greenPlain";

  const badge = readText(img, ROIS.badge).text;
  let badgeOut = null;
  const yd = badge.match(/^([\dloSget]{1,3})[yg]/);
  const stroke = badge.match(/^[S5][ti]?roke?(\d)/);
  if (stroke) badgeOut = `Stroke ${stroke[1]}`;
  else if (yd) { const n = digitize(yd[1]); if (n) badgeOut = `${n} yd to go`; }

  const windR = readText(img, ROIS.wind).text;
  const wm = windR.match(/^([\dloSget]{1,2})m/) ?? windR.match(/^([\dloSget]{1,2})..?h$/);
  const windMph = wm ? parseInt(digitize(wm[1]) || "NaN") : null;

  return { file, hole, par, frameType, badge: badgeOut,
    windMph: Number.isFinite(windMph) ? windMph : null, banner, badgeRaw: badge, windRaw: windR };
}

// ---- test mode: score against already-classified (renamed) frames ----
const args = process.argv.slice(2);
if (args[0] === "--test") {
  const n = parseInt(args[1] ?? "30");
  const manifest = JSON.parse(readFileSync(join(ROOT, "captures", "classification.json"), "utf8"));
  const known = manifest.frames.filter((f) => f.hole && existsSync(join(INBOX, f.file)));
  const step = Math.max(1, Math.floor(known.length / n));
  let okHole = 0, okType = 0, okBadge = 0, okWind = 0, tot = 0, badgeTot = 0, windTot = 0;
  for (let i = 0; i < known.length; i += step) {
    const f = known[i];
    const r = classifyFrame(f.file);
    tot++;
    if (r.hole === f.hole) okHole++; else console.log(`HOLE MISS ${f.file}: got ${r.hole} banner="${r.banner}"`);
    if (r.frameType === f.frameType) okType++; else console.log(`TYPE MISS ${f.file}: got ${r.frameType} want ${f.frameType}`);
    if (f.badge && /^(Stroke \d+|\d+ yd to go)$/.test(f.badge)) { badgeTot++; if (r.badge === f.badge) okBadge++; else console.log(`BADGE MISS ${f.file}: got "${r.badge}" want "${f.badge}"`); }
    if (f.windMph != null) { windTot++; if (r.windMph === f.windMph) okWind++; else console.log(`WIND MISS ${f.file}: got ${r.windMph} want ${f.windMph}`); }
  }
  console.log(`hole ${okHole}/${tot}  type ${okType}/${tot}  badge ${okBadge}/${badgeTot}  wind ${okWind}/${windTot}`);
  process.exit(0);
}

// ---- production: classify new canonical-ULID files ----
const mPath = join(ROOT, "captures", "classification.json");
const manifest = JSON.parse(readFileSync(mPath, "utf8"));
const knownFiles = new Set(manifest.frames.flatMap((f) => [f.file, f.originalFile].filter(Boolean)));
const fresh = readdirSync(INBOX).filter((f) => /^\d{8}-[0-9A-HJKMNP-TV-Z]{26}\.(jpe?g|png)$/i.test(f) && !knownFiles.has(f));

const KIND = { map: "map", greenPlain: "green", greenHeightmap: "hmap" };
let catalogNew = 0, otherNew = 0;
for (const file of fresh) {
  const r = classifyFrame(file);
  if (r.frameType === "other" || !KIND[r.frameType]) {
    manifest.frames.push({ file, hole: r.hole ?? null, par: r.par ?? null, frameType: "other",
      badge: r.badge ?? null, windMph: r.windMph ?? null, aim: null, club: null, issues: null, autoClassified: true });
    otherNew++;
    console.log(`${file} -> other (banner="${r.banner}")`);
    continue;
  }
  const ulidTail = (file.match(/([0-9A-HJKMNP-TV-Z]{26})/) || [])[1]?.slice(-4) ?? "XXXX";
  const parts = [`H${String(r.hole).padStart(2, "0")}`, KIND[r.frameType]];
  const ydm = r.badge?.match(/^(\d+) yd/);
  if (ydm) parts.push(`D${ydm[1]}`);
  if (r.windMph != null) parts.push(`W${r.windMph}`);
  parts.push(ulidTail);
  const name = parts.join("-") + file.slice(file.lastIndexOf(".")).toLowerCase();
  if (!existsSync(join(INBOX, name))) renameSync(join(INBOX, file), join(INBOX, name));
  manifest.frames.push({ file: name, originalFile: file, hole: r.hole, par: r.par,
    frameType: r.frameType, aim: null, badge: r.badge, windMph: r.windMph, club: null,
    issues: null, autoClassified: true });
  catalogNew++;
  console.log(`${file} -> ${name} (${r.frameType})`);
}
manifest.frames.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(mPath, JSON.stringify(manifest, null, 2));
console.log(`CLASSIFIED catalog=${catalogNew} other=${otherNew}`);
