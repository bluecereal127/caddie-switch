// Decode the 48-bit millisecond timestamp from a ULID's first 10 chars
// (Crockford base32). Used to group captures into play sessions.
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulidMs(ulid) {
  let ms = 0;
  for (const c of ulid.slice(0, 10).toUpperCase()) {
    const v = ALPHA.indexOf(c);
    if (v < 0) return null;
    ms = ms * 32 + v;
  }
  return ms;
}

// file like "20260820-01M0GJCF20WAGGJ374JX4GTZ8G.jpeg" -> ms or null
export function fileMs(file) {
  const m = file.match(/-([0-9A-HJKMNP-TV-Z]{26})/);
  return m ? ulidMs(m[1]) : null;
}

// Split frames (with .file) into sessions separated by > gapMin minutes.
// Renamed catalog files keep their ULID timing in .originalFile.
export function sessions(frames, gapMin = 20) {
  const withMs = frames.map((f) => ({ ...f, _ms: fileMs(f.originalFile ?? f.file) ?? 0 })).sort((a, b) => a._ms - b._ms);
  const out = [];
  for (const f of withMs) {
    const cur = out[out.length - 1];
    if (cur && f._ms - cur[cur.length - 1]._ms <= gapMin * 60000) cur.push(f);
    else out.push([f]);
  }
  return out;
}
