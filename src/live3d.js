// The live solver's handle (src/live3d.worker.js, src/live3d-core.js): one
// worker, made on the first solve; liveSolve(args, onProgress) -> the result.
// NSS's ball (src/nsssim.js) on NSS's course (public/course3d v2). args = { hole,
// ball, target, cupKey ("c0".."c5", NSS's cups), pinFrac, windMph, windDeg, clubs,
// start, lift }, as live3d-core.js solveFrom takes them: start = { kind: "local" }
// on the tee (NSS's GlfTeeOBJ, where local play tees off), { kind: "platform",
// tier: "low" | "high", ballLocalX (the ball's platform-local x, src/platform.js
// ballOf's localX: the standing spot and the hand's 0.9 m) | fromLeft 0-6 | localX
// | side, hand } on the online platform's mat, or null for a ball on the course;
// lift (yd) raises the ball only for a platform start the course has no platform
// data for. The result's recs carry pct (the gauge percent NSS reads the launch
// at) beside bars, and physics "NSS". (pinKey and onTee, the v1 names, still pass
// through.)
let worker = null, seq = 0;
const pending = new Map();
export function liveSolve(args, onProgress) {
  if (!worker) {
    worker = new Worker(new URL("./live3d.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.progress) { p.onProgress?.(data.progress); return; }
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || "the live solver failed")); pending.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, args }); });
}
