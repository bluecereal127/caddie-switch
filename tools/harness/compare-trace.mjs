// One harness trace against the port: the shot's carry (first contact),
// first bounce and rest as WSR drew them, and src/wsrsim.js run() over
// (a) the app's public/terrain profile, (b) the KCL triangles along the same
// line, (c) a flat fairway.
//   node tools/harness/compare-trace.mjs <trace.json> --hole 10 --club 3iron --q 1 [--tee x,y,z] [--aim dx,dz]
import { readFileSync } from "node:fs";
import { YD, appProfile, kclProfile, simOf, kcl, groundAt } from "./lib/course.mjs";
import { run } from "../lib/wsrsim.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const file = process.argv[2];
const hole = Number(arg("--hole", 10)), club = arg("--club", "3iron"), q = Number(arg("--q", 1));
const d = JSON.parse(readFileSync(file, "utf8"));
const P = d.path;
const tee = (arg("--tee", null) || "12.8,194.95,1968.5").split(",").map(Number);
let [dx, dz] = (arg("--aim", null) || "0.037510622292757034,-0.9992204904556274").split(",").map(Number);
const m = Math.hypot(dx, dz); dx /= m; dz /= m;

// along / across the aim line, in yd
const along = (r) => ((r[1] - tee[0]) * dx + (r[3] - tee[2]) * dz) / YD;
const across = (r) => ((r[1] - tee[0]) * -dz + (r[3] - tee[2]) * dx) / YD;
const first = P.findIndex((r) => r[8] === 1);
const bounceIdx = [];
for (let i = 1; i < P.length; i++) if (P[i - 1][5] < 0 && P[i][5] > 0.005) bounceIdx.push(i);
let apex = P[0]; for (const r of P) if (r[2] > apex[2]) apex = r;
const last = P[P.length - 1];
const mesh = await kcl(hole);
const g0 = mesh ? groundAt(mesh, tee[0], tee[2]) : null;
const harness = {
  carry: along(P[first]), carryDy: (P[first][2] - tee[1]) / YD, carryAcross: across(P[first]),
  bounce2: bounceIdx[1] != null ? along(P[bounceIdx[1]]) : null,
  firstBounceUp: P[first][5],
  rest: along(last), restAcross: across(last), restDy: (last[2] - tee[1]) / YD, roll: along(last) - along(P[first]),
  apex: (apex[2] - tee[1]) / YD, ticks: last[0],
  teeGroundGap: g0 ? tee[1] - g0.y : null, teeAttr: g0?.attr,
};
const summary = (o) => ({ carry: o.carry, stop: o.stop, roll: o.stop - o.carry, apex: o.apex, bounces: o.bounces, ticks: o.ticks });
const app = await appProfile(hole, tee[0], tee[2], dx, dz);
const kp = await kclProfile(hole, tee[0], tee[2], dx, dz);
const out = {
  harness,
  portApp: summary(run({ club, q, profile: simOf(app.prof), trace: false })),
  portKcl: kp ? summary(run({ club, q, profile: simOf(kp), trace: false })) : null,
  portFlat: summary(run({ club, q, trace: false })),
  line: { pos: app.pos, bearing: app.bearing },
};
console.log(JSON.stringify(out, (k, v) => (typeof v === "number" ? +v.toFixed(3) : v), 1));
