// The live solver's handle (src/live3d.worker.js, src/live3d-core.js): one
// worker, made on the first solve; liveSolve(args, onProgress) → the result.
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
