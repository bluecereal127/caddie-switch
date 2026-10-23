// The live solver off the page (src/live3d.js posts to it): each hole's course
// fetched once from public/course3d and kept, then src/live3d-core.js's
// solveFrom, a progress message per club, and the result.
import { buildCourse, solveFrom } from "./live3d-core.js";

const courses = new Map();
let palm = null;
const get = async (u, json) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return json ? r.json() : r.arrayBuffer(); };
function course(hole) {
  if (!courses.has(hole)) {
    courses.set(hole, (async () => {
      const hh = String(hole).padStart(2, "0");
      const meta = await get(`/course3d/h${hh}.json`, true), bin = await get(`/course3d/h${hh}.bin`);
      if (meta.palm && !palm) { const idx = await get("/course3d/index.json", true); palm = { meta: idx.palm, buf: await get(`/course3d/${idx.palm.bin}`) }; }
      return buildCourse(meta, bin, palm);
    })().catch((e) => { courses.delete(hole); throw e; }));
  }
  return courses.get(hole);
}
self.onmessage = async ({ data }) => {
  const { id, args } = data;
  try {
    const C = await course(args.hole);
    self.postMessage({ id, progress: { loaded: true } });
    const r = solveFrom(C, args, (p) => self.postMessage({ id, progress: { done: p.done, of: p.of } }));
    self.postMessage({ id, result: r });
  } catch (e) { self.postMessage({ id, error: String(e?.message ?? e) }); }
};
