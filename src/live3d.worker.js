// The live solver off the page (src/live3d.js posts to it): each hole's course
// fetched from public/course3d (v2, NSS's collision triangles: the field with its
// cups, the baked trees, the actor trees' kind meshes and their placements) and
// built for NSS's ball (src/live3d-core.js buildCourse: tools/lib/nss3d.mjs on
// src/nsssim.js, which places the actor trees), the three most recently used kept
// at most (a hole is 30k-117k triangles, 0.34-1.38 MB to fetch, up to about 20 MB
// of typed arrays with its grids in Node: every hole resident could exhaust a
// phone), then solveFrom, a progress message per club, and the result.
import { buildCourse, solveFrom } from "./live3d-core.js";

const KEEP = 3;
const courses = new Map();
const get = async (u, json) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return json ? r.json() : r.arrayBuffer(); };
function course(hole) {
  let p = courses.get(hole);
  if (p) { courses.delete(hole); courses.set(hole, p); return p; }
  p = (async () => {
    const hh = String(hole).padStart(2, "0");
    const meta = await get(`/course3d/h${hh}.json`, true), bin = await get(`/course3d/h${hh}.bin`);
    return buildCourse(meta, bin);
  })().catch((e) => { courses.delete(hole); throw e; });
  courses.set(hole, p);
  while (courses.size > KEEP) courses.delete(courses.keys().next().value);
  return p;
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
