// The app's tree check for a harness shot: src/trees.js treesAlong over
// derived.json's trees for the hole (as the App's markers: auto, kind, size,
// sy, z, off) on the line from the ball along the bearing, then treeCheck on
// the port's flight. Also the trees' line-frame positions, so a WSR contact
// can be matched to a tree.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, DERIVED, meshToMap, bearingOf } from "./course.mjs";

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { treesAlong, treeCheck } = await imp("src/trees.js");
const { parseTerrain, heightAt } = await imp("src/terrain.js");
const terr = new Map();
const terrain = (h) => { if (!terr.has(h)) terr.set(h, parseTerrain(readFileSync(join(ROOT, `public/terrain/h${String(h).padStart(2, "0")}.bin`)))); return terr.get(h); };

export function lineTrees(hole, ballMesh, dx, dz) {
  const t = terrain(hole);
  const [fx, fy] = meshToMap(hole, ballMesh[0], ballMesh[2]);
  const markers = DERIVED.holes[hole].trees.map((tr, k) => ({ ...tr, id: `t${hole}-${k}`, auto: true }));
  return treesAlong(markers, { ball: { x: fx, y: fy }, bearing: bearingOf(hole, dx, dz), scale: DERIVED.holes[hole].scale, groundAt: (x, y) => heightAt(t, x, y) });
}

// the app's verdict for a port flight o (run(..., trace: true)) on that line
export function appTreeCheck(trees, o, ballZ = 0) {
  return treeCheck(o.path, trees, { k: 1, carry: o.carry, aim: 0, ballZ });
}
