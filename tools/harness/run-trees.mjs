// Validation 2c: trees. From a saved ball position (a tee, or a spot reached
// by real play), shots aimed at one tree's trunk, straight at it and with the
// line moved left and right of it, at several clubs and powers so the ball
// meets the tree at different heights. WSR's answer is read in the game's own
// tree check (lib/shot.mjs treeWatch: the contact codes of 0x80401ac0 for the
// real ball, 1 trunk, 2 broadleaf canopy, 3 conifer canopy, 4 palm fronds)
// from a traced flight; the app's is src/trees.js treeCheck on the port's
// flight over the same line (src/wsrsim.js over the KCL triangles), with the
// tree as derived.json ships it (kind, x scale, y scale, base height z).
//   node tools/harness/run-trees.mjs --hole 7 --save h07-tee.sav --tree 18 [--offsets -6,-3,0,3,6]
//        [--shots driver:1,driver:0.9,spoon:1,3iron:1] [--instance 0] [--out results/trees-h7.json]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, portsFor } from "./lib/dolphin.mjs";
import { YD, DERIVED, mapToMesh, kclProfile, simOf, kcl, groundAt, ROOT } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";
import { pathToFileURL } from "node:url";

const { treeCheck, TREE_SHAPES } = await import(pathToFileURL(path.join(ROOT, "src/trees.js")).href);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 7));
const save = path.join(SAVES, arg("--save", `h${String(hole).padStart(2, "0")}-tee.sav`));
const treeIdx = Number(arg("--tree", 18));
const offsets = arg("--offsets", "-6,-3,0,3,6").split(",").map(Number);
const shots = arg("--shots", "driver:1,driver:0.9,driver:0.8,spoon:1,spoon:0.9,3iron:1").split(",").map((x) => { const [c, q] = x.split(":"); return { club: c, q: Number(q) }; });
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const outFile = path.join(HARNESS, arg("--out", `results/trees-h${hole}-t${treeIdx}.json`));
const CODE = { 1: "trunk", 2: "canopy", 3: "canopy", 4: "canopy" };

const tree = DERIVED.holes[hole].trees[treeIdx];
if (!tree) throw new Error(`hole ${hole} has no tree ${treeIdx}`);
const [TX, TZ] = mapToMesh(hole, tree.x, tree.y);
const W = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/wsr-pins.json"), "utf8")).holes[hole].trees;
const pmp = W.reduce((b, t) => { const d = Math.hypot(t.x - tree.x, t.y - tree.y); return !b || d < b.d ? { t, d } : b; }, null).t;
const TY = pmp.meshY;   // the trunk base, KCL units (WSR stands its shapes there)

const s = new Session({ gdbPort: portsFor(inst).gdb, dsuPort: portsFor(inst).dsu });
await s.start(save);
const st = await s.state();
const B = st.ball.pos;
const mesh = await kcl(hole);
const g0 = groundAt(mesh, B[0], B[2]);
const S = Math.hypot(TX - B[0], TZ - B[2]) / YD;
const h0 = Math.atan2(TX - B[0], TZ - B[2]);
console.log(`hole ${hole} tree ${treeIdx} (kind ${tree.kind}, sx ${tree.size}, sy ${tree.sy}${tree.off ? ", off" : ""}): ${S.toFixed(1)} yd from the ball, base ${((TY - g0.y) / YD).toFixed(1)} yd vs the ball's ground`);
const results = { kind: "trees-2c", hole, save: path.basename(save), tree: { idx: treeIdx, ...tree, mesh: [TX, TY, TZ] }, ball: B, distance: S, shots: [] };

for (const off of offsets) {
  // the line passes `off` yd to the right of the trunk: aim right by off / S
  const heading = h0 - off / S;
  const dx = Math.sin(heading), dz = Math.cos(heading);
  const kp = await kclProfile(hole, B[0], B[2], dx, dz);
  // the tree on the line's frame: s along, l right of the line, z the base vs the ball's ground (yd)
  const ex = TX - B[0], ez = TZ - B[2];
  const lineTree = { id: `t${hole}-${treeIdx}`, kind: tree.kind, sx: tree.size, sy: tree.sy ?? tree.size, z: (TY - g0.y) / YD,
    s: (ex * dx + ez * dz) / YD, l: (ex * -dz + ez * dx) / YD, own: false };
  for (const sh of shots) {
    await s.load(save, { pos: B });
    const t0 = Date.now();
    // calm: the saved round's own wind (hole 7's: 24 mph from the east)
    // would curve the ball off the line the port flies
    const r = await s.shoot({ power: sh.q, club: sh.club, heading, wind: { dir: 0, speedIdx: 0 }, trace: true, treeWatch: { x: TX, z: TZ, r: 25 * YD } });
    const first = r.treeContacts?.[0];
    // the ball's height over the trunk's spot when it passed it (from the trace)
    let passH = null, passD = null;
    for (const row of r.path) {
      const sAlong = ((row[1] - B[0]) * dx + (row[3] - B[2]) * dz) / YD;
      if (sAlong >= lineTree.s) { passH = (row[2] - TY) / YD; passD = Math.hypot(row[1] - TX, row[3] - TZ) / YD; break; }
    }
    const o = run({ club: sh.club, q: sh.q, profile: kp ? simOf(kp) : null, trace: true });
    const pc = treeCheck(o.path, [lineTree], { k: 1, carry: o.carry, aim: 0, ballZ: (B[1] - g0.y - 0.5) / YD });
    const last = r.path[r.path.length - 1];
    const row = {
      offset: off, club: sh.club, q: sh.q, ms: Date.now() - t0,
      wsr: { contact: first ? CODE[first.code] : "none", codes: [...new Set((r.treeContacts ?? []).map((c) => c.code))], firstAt: first ? Math.hypot(first.pos[0] - B[0], first.pos[2] - B[2]) / YD : null, heightOverBase: passH, distFromTrunk: passD,
        rest: Math.hypot(last[1] - B[0], last[3] - B[2]) / YD },
      port: { kind: pc.kind, at: pc.at, margin: pc.margin, carry: o.carry, stop: o.stop },
    };
    results.shots.push(row);
    console.log(`off ${off} ${sh.club} ${sh.q}: WSR ${row.wsr.contact}${first ? ` at ${row.wsr.firstAt.toFixed(1)} yd` : ""} (ball ${passH?.toFixed(1)} yd over the base, ${passD?.toFixed(1)} yd from the trunk; rest ${row.wsr.rest.toFixed(1)}) | port ${pc.kind}${pc.at != null ? ` at ${pc.at.toFixed(1)}` : ""} margin ${pc.margin?.toFixed(1)} (${(row.ms / 1000).toFixed(0)} s)`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(results, (k, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
  }
}
await s.stop();
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
