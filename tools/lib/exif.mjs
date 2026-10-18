// The capture time a camera (here the console) writes into a JPEG's EXIF:
// DateTimeOriginal (tag 0x9003, in the Exif sub-IFD) when present, else
// DateTime (0x0132, IFD0). Switch captures carry only DateTime, as
// "2026:08:22 00:23:38" in the console's own clock with no time zone, so it is
// read as if it were UTC (Date.UTC): only the differences between captures
// are used. The ULID in a capture's original file name is NOT this time: it
// is when the phone received the file (4 h to ~6.5 h later for the 2026-08
// captures), and a batch transfer reverses and interleaves its files.
import { openSync, readSync, closeSync } from "node:fs";

// The APP1 Exif segment follows SOI and is at most 64 KB (a 2-byte length),
// so the first 128 KB of the file always holds it; the rest is image data.
const HEAD_BYTES = 128 * 1024;

export function readHead(path, n = HEAD_BYTES) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, readSync(fd, buf, 0, n, 0));
  } finally { closeSync(fd); }
}

// "YYYY:MM:DD HH:MM:SS" -> ms since the epoch, as if UTC; null for anything else
export function exifDateMs(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, se);
}

// The TIFF structure inside the Exif segment (either byte order): IFD0, and
// the Exif sub-IFD it points to. Offsets are relative to the TIFF header; an
// offset or count past the buffer reads as missing rather than throwing.
function parseTiff(t, out) {
  if (t.length < 8) return;
  const bo = t.toString("latin1", 0, 2), le = bo === "II";
  if (!le && bo !== "MM") return;
  const u16 = (o) => (o + 2 <= t.length ? (le ? t.readUInt16LE(o) : t.readUInt16BE(o)) : null);
  const u32 = (o) => (o + 4 <= t.length ? (le ? t.readUInt32LE(o) : t.readUInt32BE(o)) : null);
  if (u16(2) !== 42) return;
  // an ASCII value sits in the entry itself when it is 4 bytes or shorter
  const ascii = (e, cnt) => {
    const o = cnt <= 4 ? e + 8 : u32(e + 8);
    return o != null && o + cnt <= t.length ? t.toString("latin1", o, o + cnt).replace(/\0+$/, "") : undefined;
  };
  const ifd = (off, fn) => {
    const n = off != null ? u16(off) : null;
    for (let k = 0; n != null && k < n; k++) {
      const e = off + 2 + k * 12;
      if (e + 12 > t.length) return;
      fn(u16(e), u16(e + 2), u32(e + 4), e);
    }
  };
  let exifIfd = null;
  ifd(u32(4), (tag, type, cnt, e) => {
    if (tag === 0x0132 && type === 2) out.dateTime = ascii(e, cnt);
    else if (tag === 0x8769) exifIfd = u32(e + 8);
  });
  ifd(exifIfd, (tag, type, cnt, e) => { if (tag === 0x9003 && type === 2) out.original = ascii(e, cnt); });
}

// The date-time strings of a JPEG buffer: {original, dateTime}, each
// "YYYY:MM:DD HH:MM:SS" or undefined. Walks the marker segments up to the
// scan (SOS) looking for APP1 "Exif"; a file that is not a JPEG, or has no
// Exif segment, gives {}.
export function exifTimes(buf) {
  const out = {};
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return out;
  for (let p = 2; p + 4 <= buf.length; ) {
    if (buf[p] !== 0xff) break;
    const marker = buf[p + 1];
    if (marker === 0xff) { p++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; } // no length
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS: image data from here
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString("latin1", p + 4, p + 10) === "Exif\0\0") {
      parseTiff(buf.subarray(p + 10, Math.min(buf.length, p + 2 + len)), out);
      break;
    }
    p += 2 + len;
  }
  return out;
}

// Capture time of a JPEG file in ms (DateTimeOriginal, else DateTime), or
// null when the file carries neither.
export function exifMs(path) {
  const { original, dateTime } = exifTimes(readHead(path));
  return exifDateMs(original) ?? exifDateMs(dateTime);
}
