// The ground under a point from the dump's collision (the field mesh with the six cup covers), NSS metres:
//   node ground.mjs <hole> x z [x z ...]  -> JSON [{ x, z, y, code }]
import { pathToFileURL } from "node:url";
const ROOT = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web";
const C = await import(pathToFileURL(`${ROOT}/tools/lib/nsscol.mjs`).href);
const [hole, ...xs] = process.argv.slice(2).map(Number);
const mesh = C.loadCollision(`${ROOT}/tools/harness/state/eden/nss-golf-x/collision`, hole, { covers: true });
const pts = []; for (let i = 0; i + 1 < xs.length; i += 2) pts.push([xs[i], xs[i + 1]]);
const pad = 20, bbox = [Math.min(...pts.map((p) => p[0])) - pad, Math.min(...pts.map((p) => p[1])) - pad, Math.max(...pts.map((p) => p[0])) + pad, Math.max(...pts.map((p) => p[1])) + pad];
const idx = C.gridIndex(mesh, 2, { bbox });
console.log(JSON.stringify(pts.map(([x, z]) => { const g = C.topGround(idx, x, z); return { x, z, y: g?.y ?? null, code: g?.code ?? null }; })));
