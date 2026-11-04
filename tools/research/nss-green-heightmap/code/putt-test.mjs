// Can a putt be solved from the Green bake's colours alone? Per NSS green and cup, balls at 3 / 6 / 10 / 15 / 22 yd on
// the green (seeded bearings). Each putt solved by src/putt.js solvePutt on a field, then that exact stroke (aim a,
// launch p) rolled on the TRUE field (public/terrain's collision heights):
//   truth   solved on the true field (the ceiling);
//   colours solved on the height grid rebuilt from the bake (est-NN.f32, recon.py, leave-one-out ramp);
//   x0.5/x2 solved on the true field with every slope halved / doubled (what a wrong vertical scale costs);
//   flat    straight at the cup at the flat speed (no read at all).
// Reported per distance: holed %, the median miss at rest (yd), and for the colours read whether its AIM holes at some
// strength on the true green (the game's putter assist can supply the strength). Writes putt-test.json.
//   node putt-test.mjs [bearings per cup and distance] [estimate prefix, default est] [out json, default putt-test.json]
// (prefix est-sr: the height grids srrecon.py rebuilt from real SR screen frames; holes without a file are skipped)
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const imp = (p) => import(pathToFileURL(REPO + p).href);
const { parseGreenHeights } = await imp("src/terrain.js");
const { heightField, solvePutt, simPutt } = await imp("src/putt.js");
const DER = JSON.parse(fs.readFileSync(REPO + "public/derived.json", "utf8")).holes;
const MAP_W = 250, MAP_H = 304, DIST = [3, 6, 10, 15, 22], NB = Number(process.argv[2] || 3), EST = process.argv[3] || "est", OUT = process.argv[4] || "putt-test.json";
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const scaled = (f, k) => ({ ...f, grad(x, y, o) { f.grad(x, y, o); o[0] *= k; o[1] *= k; } });
const res = [];
const t0 = Date.now();
for (let n = 1; n <= 21; n++) {
  const nn = String(n).padStart(2, "0"), d = DER[n];
  const g = parseGreenHeights(fs.readFileSync(REPO + `public/terrain/g${nn}.bin`));
  if (!fs.existsSync(`${EST}-${nn}.f32`)) continue;
  const estBuf = fs.readFileSync(`${EST}-${nn}.f32`), est = new Float32Array(estBuf.buffer.slice(estBuf.byteOffset, estBuf.byteOffset + estBuf.byteLength));
  const data = new Int16Array(g.data.length), mask = new Uint8Array(g.mask.length);
  for (let k = 0; k < data.length; k++) { if (Number.isFinite(est[k]) && g.mask[k]) { data[k] = Math.round((est[k] / 0.9144 - g.z0Yd) / g.unitYd); mask[k] = 1; } }
  const gE = { ...g, data, mask };
  const box = d.greenBox, W = (box.x1 - box.x0) * MAP_W * d.scale, H = (box.y1 - box.y0) * MAP_H * d.scale;
  const fT = heightField(g, box, W, H), fE = heightField(gE, box, W, H), fH = scaled(fT, 0.5), fD = scaled(fT, 2);
  const inMask = (fx, fy) => {
    const mx = box.x0 + fx * (box.x1 - box.x0), my = box.y0 + fy * (box.y1 - box.y0);
    const i = Math.round(((mx - g.box.x0) / (g.box.x1 - g.box.x0)) * (g.w - 1)), j = Math.round(((my - g.box.y0) / (g.box.y1 - g.box.y0)) * (g.h - 1));
    return i >= 0 && j >= 0 && i < g.w && j < g.h && g.mask[j * g.w + i] === 1;
  };
  const miss = (r, cup) => (r.holed ? 0 : Math.hypot((r.stop[0] - cup.x) * W, (r.stop[1] - cup.y) * H));
  for (const pin of d.pins) {
    const cup = { x: (pin.x - box.x0) / (box.x1 - box.x0), y: (pin.y - box.y0) / (box.y1 - box.y0) };
    for (const D of DIST) for (let b = 0; b < NB; b++) {
      let ball = null;
      for (let t = 0; t < 30 && !ball; t++) {
        const th = rnd() * 2 * Math.PI, q = { x: cup.x + (Math.cos(th) * D) / W, y: cup.y + (Math.sin(th) * D) / H };
        if (q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1 && inMask(q.x, q.y)) ball = q;
      }
      if (!ball) continue;
      const roll = (f) => { const s = solvePutt(f, ball, cup); return { s, r: simPutt(fT, ball, cup, s.a, s.p, { trace: false }) }; };
      const T = roll(fT);
      if (!T.r.holed) continue; // no holing read on the truth: not a test of the read
      const E = roll(fE), Hf = roll(fH), Db = roll(fD), F = simPutt(fT, ball, cup, 0, 1, { trace: false });
      let aimHoles = E.r.holed;
      if (!aimHoles) for (let p = 0.6; p <= 1.6 && !aimHoles; p += 0.01) if (simPutt(fT, ball, cup, E.s.a, p, { trace: false }).holed) aimHoles = true;
      res.push({ n, pin: pin.id, D, truth: 1, colours: +E.r.holed, aim: +aimHoles, half: +Hf.r.holed, dbl: +Db.r.holed, flat: +F.holed,
        mC: +miss(E.r, cup).toFixed(3), mH: +miss(Hf.r, cup).toFixed(3), mD: +miss(Db.r, cup).toFixed(3), mF: +miss(F, cup).toFixed(3), aimErr: +(E.s.a - T.s.a).toFixed(2) });
    }
  }
  console.log(`H${n} done, ${res.length} putts so far, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(OUT, JSON.stringify(res));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pc = (a, k) => ((100 * a.filter((r) => r[k]).length) / (a.length || 1)).toFixed(0).padStart(3);
console.log("dist  putts | holed %: colours  aim-holes  x0.5  x2  flat | median miss yd: colours x0.5 x2 flat");
for (const D of [...DIST, "all"]) {
  const a = D === "all" ? res : res.filter((r) => r.D === D);
  console.log(`${String(D).padStart(4)} ${String(a.length).padStart(6)} | ${pc(a, "colours")} ${pc(a, "aim")} ${pc(a, "half")} ${pc(a, "dbl")} ${pc(a, "flat")} | ${med(a.map((r) => r.mC)).toFixed(2)} ${med(a.map((r) => r.mH)).toFixed(2)} ${med(a.map((r) => r.mD)).toFixed(2)} ${med(a.map((r) => r.mF)).toFixed(2)}`);
}
for (let n = 1; n <= 21; n++) { const a = res.filter((r) => r.n === n); console.log(`H${n}: ${a.length} putts, colours ${pc(a, "colours")}% aim ${pc(a, "aim")}% flat ${pc(a, "flat")}%, median miss ${med(a.map((r) => r.mC)).toFixed(2)} yd`); }
