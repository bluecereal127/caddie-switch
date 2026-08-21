// Assemble shot rows from play captures: pair each result pop-up with the
// address frames before it, walking every session chronologically.
//   node tools/assemble-shots.mjs
//
//   power     = pop-up gauge (yellow dot position)
//   ended     = distance-before − distance-after (pop-up "N yd/ft to go";
//               before = address badge, previous pop-up, or tee yardage)
//   lie       = previous pop-up's title (stroke 1 = tee); Green = putt = skipped
//   club/wind = from the last address frame before the swing (arrow is
//               aim-relative: up = tailwind = 0°)
// Ground-truth labels (captures/labels.json, written by the labeling
// workflow) override OCR where present. Output: captures/derived/shots.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, cropFrac, binarizeText } from "./lib/image.mjs";
import { segmentGlyphs, normalizeGlyph, loadTemplates } from "./lib/digits.mjs";
import { readPopupGauge, binarizeTitle, POPUP_ROIS } from "./lib/popup.mjs";
import { readWindArrow } from "./lib/wind.mjs";
import { fileMs } from "./lib/ulid.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const TEMPLATES = loadTemplates(join(ROOT, "tools", "templates", "chars"));
const TITLE_TEMPLATES = loadTemplates(join(ROOT, "tools", "templates", "title"));

const manifest = JSON.parse(readFileSync(join(ROOT, "captures", "classification.json"), "utf8"));
const labels = existsSync(join(ROOT, "captures", "labels.json"))
  ? JSON.parse(readFileSync(join(ROOT, "captures", "labels.json"), "utf8")) : { popups: [], address: [] };
const popupLabel = new Map(labels.popups.map((l) => [l.file, l]));
const addrLabel = new Map(labels.address.map((l) => [l.file, l]));
const mapsMeta = JSON.parse(readFileSync(join(ROOT, "captures", "derived", "maps.json"), "utf8")).holes;

const sim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) s++; return s / a.length; };
const matchText = (bin, templates) => {
  let out = "";
  for (const s of segmentGlyphs(bin)) {
    const norm = normalizeGlyph(s);
    let best = "?", bs = -1;
    for (const t of templates) { const sc = sim(norm, Uint8Array.from(t.grid)); if (sc > bs) { bs = sc; best = t.label; } }
    out += bs > 0.66 ? best : "?";
  }
  return out;
};
const DIGITIZE = { l: "1", o: "0", O: "0", S: "5", g: "9", e: "8", t: "1", i: "1", B: "8" };
const digitize = (s) => s.split("").map((c) => /\d/.test(c) ? c : (DIGITIZE[c] ?? "")).join("");

const CLUB_ROI = [0.79, 0.92, 0.19, 0.05];
// fuzzy: OCR reads "5-Iron" as "5lroo"/"5lroD" etc (I=l in this font, the
// hyphen drops) — the prefixes stay unambiguous
const clubId = (label) => {
  if (!label) return null;
  const s = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^dr/.test(s)) return "driver";
  if (/^sp|^3w/.test(s)) return "spoon";
  const m = s.match(/^([3579])[li1]?r/);
  if (m) return m[1] + "i";
  if (/^w/.test(s)) return "wedge";
  if (/^pu/.test(s)) return "putter";
  return null;
};

const LIE_OF_TITLE = { fairway: "fairway", rough: "rough", bunker: "bunker", green: "green", tee: "tee" };
const CAPS = { rough: () => 3.0, bunker: (club) => club === "wedge" ? 3.0 : (club === "driver" || club === "spoon") ? 1.0 : 2.0 };

// parse "204 yd to go" / "13.3 ft to go" OCR text (confusables tolerated)
function parseDistance(text) {
  if (!text) return null;
  const m = text.match(/^([\dloOSgeti]{1,3})(?:[.l]([\dloOSgeti]))?\s*([yf]|tt|ft|yd)/);
  if (!m) return null;
  const whole = digitize(m[1]);
  if (!whole) return null;
  let val = parseInt(whole);
  const isFeet = /^(f|tt|ft)/.test(m[3]) || (m[2] != null); // decimals only appear in feet
  if (m[2] != null) { const d = digitize(m[2]); if (d) val = parseFloat(`${whole}.${d}`); }
  return { yards: isFeet ? val / 3 : val, feet: isFeet };
}

function readPopup(file) {
  const lab = popupLabel.get(file);
  const img = loadImage(join(INBOX, file));
  const gauge = readPopupGauge(img);
  let title = lab?.title ?? null;
  if (!title && TITLE_TEMPLATES.length) {
    const t = matchText(binarizeTitle(cropFrac(img, POPUP_ROIS.title)), TITLE_TEMPLATES);
    if (t.length >= 2 && !t.includes("?")) title = t;
  }
  let distText = lab?.distanceText ?? null;
  if (!distText) {
    const raw = matchText(binarizeText(cropFrac(img, POPUP_ROIS.distance)), TEMPLATES);
    if (raw) distText = raw;
  }
  const dist = parseDistance(distText);
  const kind = lab?.kind ?? (dist ? "result" : (title ? "holeout" : "other"));
  return { file, kind, title, dist, gauge };
}

function readAddress(f) {
  const lab = addrLabel.get(f.file);
  const img = loadImage(join(INBOX, f.file));
  let club = lab?.club ?? f.club ?? null;
  if (!club && TEMPLATES.length) {
    const t = matchText(binarizeText(cropFrac(img, CLUB_ROI)), TEMPLATES);
    if (t.length >= 4 && (t.match(/\?/g) ?? []).length <= 1) club = t;
  }
  const arrow = readWindArrow(img);
  const badgeYd = f.badge?.match(/^(\d+) yd/) ? parseInt(f.badge) : null;
  return { club: clubId(club), clubRaw: club, windMph: f.windMph ?? null,
    windDeg: arrow ? arrow.deg : (f.windMph === 0 ? 0 : null), badgeYd };
}

// ---- walk sessions ----
const frames = manifest.frames
  .map((f) => ({ ...f, _ms: fileMs(f.originalFile ?? f.file) ?? 0 }))
  .filter((f) => f._ms > 0)
  .sort((a, b) => a._ms - b._ms);

const rows = [], skipped = [];
let cur = null; // { hole, stroke, before, lie, addr }
const holeYards = (h) => mapsMeta.find((m) => m.hole === h)?.yards ?? null;

let lastMs = 0, sessionId = 0;
for (const f of frames) {
  if (f._ms - lastMs > 20 * 60000) { sessionId++; cur = null; }
  lastMs = f._ms;

  if (f.hole && ["map", "greenPlain", "greenHeightmap"].includes(f.frameType)) {
    if (!cur || cur.hole !== f.hole) {
      cur = { hole: f.hole, stroke: 1, before: null, lie: "tee", session: sessionId };
    }
    const a = readAddress(f);
    cur.addr = a;
    if (a.badgeYd != null) cur.before = a.badgeYd;
    continue;
  }
  if (f.frameType !== "other" || !cur) continue;

  const p = readPopup(f.file);
  if (p.kind === "other") continue;
  const flags = [];
  const a = cur.addr ?? {};

  if (p.kind === "holeout") {
    // last shot holed: ended = whatever was left
    if (cur.before != null && cur.lie !== "green" && a.club && p.gauge) {
      pushRow(f, cur, a, p.gauge.power, cur.before, flags.concat("holeout"));
    }
    cur = null;
    continue;
  }

  // result pop-up = a shot happened
  const after = p.dist ? p.dist.yards : null;
  const before = cur.before;
  if (cur.lie === "green") { skipped.push({ file: f.file, why: "putt" }); }
  else if (!p.gauge) { skipped.push({ file: f.file, why: "no gauge" }); }
  else if (before == null || after == null) {
    skipped.push({ file: f.file, why: `missing ${before == null ? "before" : "after"}-distance` });
  } else {
    const ended = +(before - after).toFixed(1);
    if (ended <= 0 || ended > 420) skipped.push({ file: f.file, why: `implausible ended ${ended}` });
    else pushRow(f, cur, a, p.gauge.power, ended, flags);
  }
  // advance state
  cur.before = after ?? cur.before;
  cur.lie = p.title ? (LIE_OF_TITLE[p.title.toLowerCase()] ?? cur.lie) : cur.lie;
  cur.stroke++;
  cur.addr = null; // consumed
}

function pushRow(f, cur, a, power, ended, flags) {
  const cap = CAPS[cur.lie]?.(a.club);
  if (cap != null && power > cap + 0.08) { skipped.push({ file: f.file, why: `power ${power} over ${cur.lie} cap ${cap}` }); return; }
  if (!a.club) flags.push("missingClub");
  if (a.windMph == null) flags.push("missingWindSpeed");
  if (a.windDeg == null && (a.windMph ?? 0) > 2) flags.push("missingWindDeg");
  rows.push({
    id: (f.originalFile ?? f.file).match(/([0-9A-HJKMNP-TV-Z]{26})/)?.[1] ?? f.file,
    hole: cur.hole, stroke: cur.stroke, club: a.club, power, lie: cur.lie,
    windSpeed: a.windMph ?? 0, windDeg: a.windDeg ?? 0, ended,
    flags: flags.length ? flags : undefined,
    importable: !!a.club && power > 0 && (a.windDeg != null || (a.windMph ?? 0) <= 2),
  });
}

writeFileSync(join(ROOT, "captures", "derived", "shots.json"),
  JSON.stringify({ generated: "assemble-shots", rows, skipped }, null, 2));
const imp = rows.filter((r) => r.importable);
console.log(`rows: ${rows.length} (${imp.length} importable), skipped: ${skipped.length}`);
for (const s of skipped.slice(0, 15)) console.log(`  skip ${s.file.slice(-18)}: ${s.why}`);
for (const r of rows) console.log(`  H${r.hole} S${r.stroke} ${r.club ?? "??"} p=${r.power} ${r.lie} w=${r.windSpeed}@${r.windDeg} ended=${r.ended}${r.flags ? " [" + r.flags + "]" : ""}${r.importable ? "" : " NOT-IMPORTABLE"}`);
