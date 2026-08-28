// Capture-upload endpoint. This REPLACES Netlify Forms as the transport —
// Forms submissions are metered per submission (one photo = one submission =
// real money; Jul/Aug 2026 cost $19 before this existed), while edge
// invocations and Blobs are effectively free at this scale.
//
// The iPhone Shortcut keeps POSTing multipart form data to "/" exactly as it
// always has; "/api/upload" is accepted too as a named endpoint. Any file
// field (batch, file1..fileN, anything) lands in the "captures" blob store,
// which tools/autosync.ps1 drains on its poll loop.
//
// INVARIANT: a POST is ALWAYS answered here and never passed downstream with
// context.next(). Falling through is what would hand the request to Netlify
// Forms, so every failure path below returns a Response instead. There is
// also no form element left in index.html, so nothing is registered to meter.
import { getStore } from "@netlify/blobs";

const MAX_FILES = 64;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // Netlify caps requests ~8MB anyway
const ALLOWED_EXT = /\.(jpe?g|png|mp4|zip)$/i;

// Filename extensions are the fast path; magic bytes are the fallback so an
// upload shape that sends an extension-less file still works.
function sniff(bytes) {
  const b = new Uint8Array(bytes.slice(0, 4));
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip";                    // PK
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";   // JFIF
  if (b[0] === 0x89 && b[1] === 0x50) return "png";                    // .PNG
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (request, context) => {
  if (request.method !== "POST") return context.next();

  // Optional shared secret. Unset (the default) = open, exactly as before, so
  // the existing Shortcut keeps working untouched. Set UPLOAD_TOKEN in the
  // Netlify site env and add a matching "token" text field in the Shortcut to
  // close this endpoint off from the public internet.
  let expected;
  try { expected = globalThis.Netlify?.env?.get("UPLOAD_TOKEN"); } catch { expected = undefined; }

  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "not multipart form data" }, 400); }

  if (expected && form.get("token") !== expected) {
    return json({ ok: false, error: "bad or missing token" }, 401);
  }

  const files = [];
  for (const [, value] of form.entries()) {
    if (value && typeof value === "object" && typeof value.arrayBuffer === "function" && value.size > 0) {
      files.push(value);
    }
  }
  if (!files.length) return json({ ok: true, saved: 0, note: "no file fields in request" });
  if (files.length > MAX_FILES) return json({ ok: false, error: `too many files (${files.length} > ${MAX_FILES})` }, 413);

  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return json({ ok: false, error: `payload too large (${total} bytes)` }, 413);

  let store;
  try { store = getStore("captures"); }
  catch (e) { return json({ ok: false, error: `blob store unavailable: ${e.message}` }, 500); }

  const saved = [];
  const skipped = [];
  for (const f of files) {
    const name = f.name || "";
    const buf = await f.arrayBuffer();
    // Only capture media and zips get stored — this endpoint is public, and
    // an open write to metered storage should not accept arbitrary payloads.
    if (!ALLOWED_EXT.test(name) && !sniff(buf)) {
      skipped.push(name || "(unnamed)");
      continue;
    }
    const clean = (name || `upload.${sniff(buf) || "bin"}`).replace(/[^\w.\-]/g, "_");
    // Key shape "<ms>-<rand>-<originalName>" is parsed by autosync's
    // Sync-Blobs (^\d+-\d+- is stripped back off) — do not change it.
    const key = `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${clean}`;
    try {
      await store.set(key, buf);
      saved.push(key);
    } catch (e) {
      return json({ ok: false, saved: saved.length, error: `store failed on ${clean}: ${e.message}` }, 500);
    }
  }
  return json({ ok: true, saved: saved.length, skipped });
};

export const config = { path: ["/", "/api/upload"] };
