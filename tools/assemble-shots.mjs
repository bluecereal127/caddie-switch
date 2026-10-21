// Assemble shot rows from play captures: pair each result pop-up with the
// address frames before it, walking every session chronologically.
//   node tools/assemble-shots.mjs
//
//   power     = pop-up gauge (yellow dot position)
//   ended     = distance-before − distance-after (pop-up "N yd/ft to go";
//               before = address badge, previous pop-up, or tee yardage)
//   lie       = previous pop-up's title (stroke 1 = tee); Green = putt = skipped
//   landed    = this pop-up's title, where the ball finished (when read)
//   club/wind = from the last address frame before the swing (arrow is
//               aim-relative: up = tailwind = 0°; see pushRow for the dial)
//   pos       = the ball on that frame's minimap, map fractions, and
//   bearing   = the shot's direction, deg N-up (tools/lib/addressmap.mjs;
//               the minimap zooms and pans closer in, so the frame is
//               registered against the hole's capture stack)
// Ground-truth labels (captures/labels.json, written by the labeling
// workflow) override OCR where present. Rows listed in
// tools/shot-exclusions.json (hand-kept: id -> reason) are dropped and the
// reason logged. Output: captures/derived/shots.json; tools/build-derived.mjs
// flies each row with a position over the hole's terrain (elevFactor,
// flatEnded) and ships the importable ones.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, cropFrac, binarizeText } from "./lib/image.mjs";
import { segmentGlyphs, normalizeGlyph, loadTemplates } from "./lib/digits.mjs";
import { readPopupGauge, binarizeTitle, POPUP_ROIS } from "./lib/popup.mjs";
import { readWindArrow, readMapWindArrow } from "./lib/wind.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { fileMs } from "./lib/ulid.mjs";
import { readAddressMap, stackIndex } from "./lib/addressmap.mjs";
import { MAP_W, MAP_H } from "./lib/minimap.mjs";

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
// the WSR truth's yd per map px and green box per hole (the minimap registration)
const TRUTH = JSON.parse(readFileSync(join(ROOT, "tools", "wsr-truth.json"), "utf8")).holes;
// row id -> why it must not reach the app (a malformed file stops the run)
const EXCLUSIONS = join(ROOT, "tools", "shot-exclusions.json");
const EXCLUDED = existsSync(EXCLUSIONS) ? JSON.parse(readFileSync(EXCLUSIONS, "utf8")).rows ?? {} : {};

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
// hyphen drops) — the prefixes stay unambiguous. Returns the app's club ids
// (src/model.js DEFAULT_CLUBS); the irons came out as "3i" .. "9i" until
// 2026-10-21, which no club's fit matched (App.jsx CLUB_MIGRATE maps them).
const clubId = (label) => {
  if (!label) return null;
  const s = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^dr/.test(s)) return "driver";
  if (/^sp|^3w/.test(s)) return "spoon";
  const m = s.match(/^([3579])[li1]?r/);
  if (m) return m[1] + "iron";
  if (/^w/.test(s)) return "wedge";
  if (/^pu/.test(s)) return "putter";
  return null;
};

const LIE_OF_TITLE = { fairway: "fairway", rough: "rough", bunker: "bunker", green: "green", tee: "tee" };
// where a ball can finish, as the app's Log reads it (App.jsx LANDED)
const LANDED_TITLES = new Set(["fairway", "rough", "bunker", "green"]);
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
  // the panel's own wind dial: NORTH-relative, exactly 8 directions (no
  // arrow at 0 mph)
  const mapArrow = f.frameType === "map" ? readMapWindArrow(cropRect(img, panelRect(img))) : null;
  const badgeYd = f.badge?.match(/^(\d+) yd/) ? parseInt(f.badge) : null;
  return { club: clubId(club), clubRaw: club, windMph: f.windMph ?? null,
    windDeg: arrow ? arrow.deg : (f.windMph === 0 ? 0 : null), mapWindDeg: mapArrow ? mapArrow.deg : null,
    badgeYd, frameType: f.frameType };
}

// The ball on a row's address frame (tools/lib/addressmap.mjs), registered
// against the hole's capture stack (extract-maps.mjs; its var.png says which
// pixels are map art). Only for the frames that become a row's address: a
// zoomed frame takes 0.4 s, one with the ball off the panel 2.7.
const stacks = new Map();
function stackOf(hole) {
  if (!stacks.has(hole)) {
    const id = `h${String(hole).padStart(2, "0")}`, p = join(ROOT, "captures", "derived", "maps", id);
    stacks.set(hole, existsSync(`${p}.png`)
      ? stackIndex(loadImage(`${p}.png`), existsSync(`${p}.var.png`) ? loadImage(`${p}.var.png`) : null) : null);
  }
  return stacks.get(hole);
}
function ballSpot(a, hole, beforeYd) {
  if (!a.file) return { pos: null, why: "no address frame before the swing" };
  if (a.frameType !== "map") return { pos: null, why: `the address frame is a ${a.frameType} view, not the hole map` };
  const t = TRUTH[hole], stack = stackOf(hole);
  if (!t) return { pos: null, why: `no WSR truth for hole ${hole}` };
  if (!stack) return { pos: null, why: `no capture stack for hole ${hole}` };
  const img = loadImage(join(INBOX, a.file));
  const green = { x0: t.greenBox.x0 * MAP_W, y0: t.greenBox.y0 * MAP_H, x1: t.greenBox.x1 * MAP_W, y1: t.greenBox.y1 * MAP_H };
  return readAddressMap(cropRect(img, panelRect(img)), stack, { scale: t.scale, green, badgeYd: a.badgeYd ?? beforeYd });
}
const bearingTo = (from, to) => ((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI + 360) % 360;
const angleBetween = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
// The address frame's aim is the swing's only if the ball could have stopped
// where it did along it: `after` yd from the cup, so the line must pass the
// cup within that, plus the wind's drift (c x mph x bars, c at most 0.62 at
// full power in WSR: 0.6 mph x bars) and 5 yd for the marks. H10's 11 mph tee
// shot of 2026-08-21 was captured aiming 325°, 35.5° left of the pin, on a
// line passing 226 yd from the cup, and stopped 95 yd from it: the player
// re-aimed after the capture, so its bearing is the line to the cup (the
// game's default line). A frame whose aim is unreadable takes that line too.
const AIM_SLACK_YD = 5, DRIFT_YD_PER_MPH_BAR = 0.6;
// The two wind arrows disagree when they are more than a step and a half of
// 45° apart (the dial's 8 directions against the puck read to the nearest 45)
const ARROWS_APART = 67.5;

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
    a.file = f.file;
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
    else {
      const t = p.title?.toLowerCase();
      pushRow(f, cur, a, p.gauge.power, ended, flags, LANDED_TITLES.has(t) ? t : null);
    }
  }
  // advance state
  cur.before = after ?? cur.before;
  cur.lie = p.title ? (LIE_OF_TITLE[p.title.toLowerCase()] ?? cur.lie) : cur.lie;
  cur.stroke++;
  cur.addr = null; // consumed
}

function pushRow(f, cur, a, power, ended, flags, landed = null) {
  const id = (f.originalFile ?? f.file).match(/([0-9A-HJKMNP-TV-Z]{26})/)?.[1] ?? f.file;
  if (EXCLUDED[id]) { skipped.push({ file: f.file, why: `excluded (tools/shot-exclusions.json): ${EXCLUDED[id]}` }); return; }
  const cap = CAPS[cur.lie]?.(a.club);
  if (cap != null && power > cap + 0.08) { skipped.push({ file: f.file, why: `power ${power} over ${cur.lie} cap ${cap}` }); return; }
  if (!a.club) flags.push("missingClub");
  if (a.windMph == null) flags.push("missingWindSpeed");

  // where the ball stood and which way it went
  const before = a.badgeYd ?? cur.before;
  const spot = ballSpot(a, cur.hole, before);
  const scale = TRUTH[cur.hole]?.scale;
  let bearing = null, bearingFrom = null;
  if (spot.pos) {
    if (spot.aim != null) { bearing = spot.aim; bearingFrom = "aim"; }
    if (spot.cup && before != null) {
      const toCup = bearingTo(spot.pos, spot.cup);
      if (spot.aim == null) { bearing = toCup; bearingFrom = "cup"; }
      else {
        const th = (spot.aim * Math.PI) / 180, ex = spot.pos.x - spot.cup.x, ey = spot.pos.y - spot.cup.y;
        const passYd = Math.abs(ex * -Math.cos(th) - ey * Math.sin(th)) * scale, afterYd = before - ended;
        if (passYd > afterYd + AIM_SLACK_YD + DRIFT_YD_PER_MPH_BAR * (a.windMph ?? 0) * power) {
          flags.push(`aimNotTheSwing(${spot.aim.toFixed(1)}°, ${angleBetween(spot.aim, toCup).toFixed(1)}° off the cup)`);
          bearing = toCup; bearingFrom = "cup";
        }
      }
    }
  }
  // The wind relative to the shot. The dial is north-up and takes exactly 8
  // directions (CLAUDE.md), so with the shot's bearing it gives the relative
  // direction to the degree, where the aim-relative arrow on the 3D puck is
  // read to the nearest 45° and can flip end for end: of four identical
  // up-right puck arrows on H1's tee frames of 2026-08-21, one read 225°. And
  // an aim the swing did not keep took its puck arrow with it. The puck's
  // reading stands where the dial has none (0 mph) or the bearing is unknown.
  let windDeg = a.windDeg;
  if (a.mapWindDeg != null && bearing != null && (a.windMph ?? 0) > 0) {
    windDeg = +(((a.mapWindDeg - bearing) % 360 + 360) % 360).toFixed(1);
    if (a.windDeg != null && angleBetween(windDeg, a.windDeg) > ARROWS_APART) flags.push(`windArrowsDisagree(puck ${a.windDeg}°)`);
  }
  if (windDeg == null && (a.windMph ?? 0) > 2) flags.push("missingWindDeg");
  // popupFile/addrFile are what frame-audit joins on: a capture counts as
  // "used for shot data" only if it actually produced a row here
  rows.push({
    id,
    popupFile: f.file, addrFile: a.file ?? null,
    hole: cur.hole, stroke: cur.stroke, club: a.club, power, lie: cur.lie,
    ...(landed ? { landed } : {}),
    windSpeed: a.windMph ?? 0, windDeg: windDeg ?? 0, ended,
    ...(spot.pos ? {
      pos: { x: +(spot.pos.x / MAP_W).toFixed(4), y: +(spot.pos.y / MAP_H).toFixed(4) },
      ...(bearing != null ? { bearing: +bearing.toFixed(1), bearingFrom } : {}),
      // how the frame was read (not shipped): the overview or a zoom, the
      // similarity and its art correlation, the cup in map px
      spot: { how: spot.how, zoom: spot.zoom, offset: spot.offset, fit: spot.fit, cup: spot.cup ? { x: +spot.cup.x.toFixed(1), y: +spot.cup.y.toFixed(1) } : null },
    } : { posWhy: spot.why }),
    flags: flags.length ? flags : undefined,
    importable: !!a.club && power > 0 && (windDeg != null || (a.windMph ?? 0) <= 2),
  });
}

writeFileSync(join(ROOT, "captures", "derived", "shots.json"),
  JSON.stringify({ generated: "assemble-shots", rows, skipped }, null, 2));
const imp = rows.filter((r) => r.importable);
console.log(`rows: ${rows.length} (${imp.length} importable, ${rows.filter((r) => r.pos).length} with a position), skipped: ${skipped.length}`);
for (const s of skipped.slice(0, 15)) console.log(`  skip ${s.file.slice(-18)}: ${s.why}`);
for (const r of rows) console.log(`  H${r.hole} S${r.stroke} ${r.club ?? "??"} p=${r.power} ${r.lie}${r.landed ? `->${r.landed}` : ""} w=${r.windSpeed}@${r.windDeg} ended=${r.ended}` +
  (r.pos ? ` pos=${r.pos.x},${r.pos.y} ${r.spot.how}${r.spot.zoom !== 1 ? ` x${r.spot.zoom}` : ""} fit ${r.spot.fit} bearing=${r.bearing ?? "?"} (${r.bearingFrom ?? "-"})` : ` no position: ${r.posWhy}`) +
  `${r.flags ? " [" + r.flags + "]" : ""}${r.importable ? "" : " NOT-IMPORTABLE"}`);
