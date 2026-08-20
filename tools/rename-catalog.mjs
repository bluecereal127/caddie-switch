// Rename classified capture files to meaningful names:
//   H07-map-L-D399-W20-CEWT.jpeg   hole 7, map frame aimed left, 399 yd to
//                                  the pin, wind 20 mph, ULID tail for
//                                  uniqueness/chronology
//   H14-green-D359-W4-XPSJ.jpeg    zoomed green plain
//   H14-hmap-D359-W4-RRJ1.jpeg     zoomed green heightmap
// (Wind DIRECTION joins the name once arrow-reading exists.)
// Reads/updates captures/classification.json; run the extractors afterwards
// since their outputs reference manifest filenames.
//   node tools/rename-catalog.mjs
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const mPath = join(ROOT, "captures", "classification.json");
const manifest = JSON.parse(readFileSync(mPath, "utf8"));

const KIND = { map: "map", greenPlain: "green", greenHeightmap: "hmap" };
const AIM = { left: "L", center: "C", right: "R" };

// yardage per hole+session comes from whichever frame in the session shows it
const yardOf = (f) => (f.badge && /(\d+)\s*yd/.test(f.badge)) ? parseInt(f.badge) : null;

let renamed = 0;
for (const f of manifest.frames) {
  if (!f.hole || !KIND[f.frameType]) continue;
  if (/^H\d\d-/.test(f.file)) continue; // already renamed
  const ulidTail = (f.file.match(/([0-9A-HJKMNP-TV-Z]{26})/) || [])[1]?.slice(-4) ?? "XXXX";
  // find a yardage from the same hole (prefer same file, else any hole frame
  // within the same ULID cluster prefix — first 6 ULID chars ≈ same session)
  let yd = yardOf(f);
  if (yd == null) {
    const prefix = (f.file.match(/-([0-9A-HJKMNP-TV-Z]{6})/) || [])[1];
    const mate = manifest.frames.find((g) => g.hole === f.hole && yardOf(g) != null &&
      prefix && g.file.includes(`-${prefix.slice(0, 5)}`));
    yd = mate ? yardOf(mate) : null;
  }
  const parts = [`H${String(f.hole).padStart(2, "0")}`, KIND[f.frameType]];
  if (f.frameType === "map" && AIM[f.aim]) parts.push(AIM[f.aim]);
  if (yd != null) parts.push(`D${yd}`);
  if (f.windMph != null) parts.push(`W${f.windMph}`);
  parts.push(ulidTail);
  const ext = f.file.slice(f.file.lastIndexOf("."));
  const name = parts.join("-") + ext;
  const from = join(INBOX, f.file), to = join(INBOX, name);
  if (!existsSync(from)) { console.warn(`missing on disk: ${f.file}`); continue; }
  if (existsSync(to)) { console.warn(`target exists, skipping: ${name}`); continue; }
  renameSync(from, to);
  f.originalFile = f.file;
  f.file = name;
  renamed++;
}
writeFileSync(mPath, JSON.stringify(manifest, null, 2));
console.log(`renamed ${renamed} files; manifest updated`);
