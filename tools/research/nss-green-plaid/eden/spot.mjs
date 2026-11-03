// spot.mjs <hole> <line bearing deg> <dist m>: the ball spot whose ball->cup line has that map bearing, at that distance
// from the active cup (the RAM cup from golfram's cache read: pass cx cz), with its ground y
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const E = "C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/tools/harness/state/eden";
const [h, line, dist, cx, cz] = process.argv.slice(2).map(Number);
const t = JSON.parse(fs.readFileSync(`${E}/nss-golf-x/pins.json`, "utf8")).holes[String(h).padStart(2, "0")].transform;
const rot = Math.atan2(t.b, t.a) * 180 / Math.PI;
const th = (line - rot) * Math.PI / 180;                 // world heading of ball->cup: (sin, -cos) in (x, z)
const x = cx - dist * Math.sin(th), z = cz + dist * Math.cos(th);
const g = JSON.parse(execFileSync("node", [`${E}/lab/plaid/eden/ground.mjs`, String(h), String(x), String(z)], { encoding: "utf8" }))[0];
console.log(JSON.stringify({ rotDeg: +rot.toFixed(4), x: +x.toFixed(5), z: +z.toFixed(5), groundY: g.y, code: g.code, ballY: +(g.y + 0.05).toFixed(5) }));
