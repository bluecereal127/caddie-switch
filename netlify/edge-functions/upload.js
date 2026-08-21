// Intercepts capture uploads at the site root BEFORE Netlify Forms sees
// them (form submissions are metered on the Starter plan; edge function
// invocations effectively are not at this scale). The iPhone Shortcut keeps
// POSTing multipart form data to "/" exactly as it always has — any file
// field (file1, batch/zip, anything) is stored into the "captures" blob
// store, which tools/autosync.ps1 drains on its poll loop.
// Non-POST requests (and POSTs without files) pass through to the site.
import { getStore } from "@netlify/blobs";

export default async (request, context) => {
  if (request.method !== "POST") return context.next();
  let form;
  try { form = await request.formData(); } catch { return context.next(); }

  const files = [];
  for (const [, value] of form.entries()) {
    if (value && typeof value === "object" && typeof value.arrayBuffer === "function" && value.size > 0) {
      files.push(value);
    }
  }
  if (!files.length) return context.next();

  const store = getStore("captures");
  const saved = [];
  for (const f of files) {
    const clean = (f.name || "upload.bin").replace(/[^\w.\-]/g, "_");
    const key = `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${clean}`;
    await store.set(key, await f.arrayBuffer());
    saved.push(key);
  }
  return new Response(JSON.stringify({ ok: true, saved: saved.length }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/" };
