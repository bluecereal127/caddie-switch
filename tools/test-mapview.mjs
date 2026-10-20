// node tools/test-mapview.mjs [repoRoot]
// Acceptance for src/mapView.js, where the solver's magnified map (the Map
// 3x / 4x chips) opens. The sizes are a 390-px phone's: the panel 344 CSS px
// wide inside the map's border, the fitted map 344 x 418.3 (the 250x304
// frame), the map 1.5x (3x) or 2x (4x) that inside a viewport of the fitted size.
//  1. no target: the ball at the view's centre, wherever the map has room;
//     with an aim (the pin in use: the hole's default line) the view is
//     placed as if the aim were the target (H7's tee to its pins as in 3, a
//     near aim inside the margins), the aim moot once a target is given and
//     ignored without a ball
//  2. a target that fits (at most the view less both 8% margins from the
//     ball): in view inside the margins, the ball inside them too, the shift
//     no larger than needed (the centred offset when the target is already
//     inside the margins, else the target exactly on the margin)
//  3. a target that does not fit: the ball on the margin away from it, the
//     view as far toward it as that allows (H7's tee to its pins at 3x)
//  4. clamping: every result inside [0, map - view]; the corners pin to the
//     map's edges; at fit (map = view) always 0, 0
//  5. no ball: the target, else the map's centre
//  6. 20,000 random cases at 3x and 4x hold 2 and 4's rules
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const V = await import(pathToFileURL(join(root, "src/mapView.js")).href);
const derived = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const VIEW = { viewW: 344, viewH: 344 * 304 / 250 };
const at = (zoom) => ({ ...VIEW, mapW: VIEW.viewW * zoom, mapH: VIEW.viewH * zoom });
const M = V.VIEW_MARGIN;
// a point's position in the view (CSS px) for a result
const inView = (g, r, p) => ({ x: p.x * g.mapW - r.left, y: p.y * g.mapH - r.top });

// 1
for (const zoom of [1.5, 2]) {
  const g = at(zoom);
  for (const ball of [{ x: 0.5, y: 0.5 }, { x: 0.4, y: 0.62 }, { x: 0.6, y: 0.35 }]) {
    const r = V.scrollFor({ ...g, ball });
    const b = inView(g, r, ball);
    ok(near(b.x, g.viewW / 2) && near(b.y, g.viewH / 2), `${zoom}x zoom, ball ${JSON.stringify(ball)} centred (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
    ok(JSON.stringify(V.scrollFor({ ...g, ball, target: null })) === JSON.stringify(r), "target null = no target");
  }
}
// 1, the aim: H7's tee with each of its pins as the aim (none fits: the tee
// on the bottom margin, the pin's column in view, as 3 has with the pin as
// the target), a near aim that fits on the margin, the aim moot with a
// target, ignored without a ball
{
  const h = derived[7], tee = { x: h.tee.x, y: h.tee.y };
  for (const zoom of [1.5, 2]) {
    const g = at(zoom);
    for (const p of h.pins) {
      const aim = { x: p.x, y: p.y };
      const r = V.scrollFor({ ...g, ball: tee, aim });
      ok(JSON.stringify(r) === JSON.stringify(V.scrollFor({ ...g, ball: tee, target: aim })), `H7 ${p.label} as the aim at ${zoom * 2}x: placed as the target would be`);
      const b = inView(g, r, tee), t = inView(g, r, aim);
      ok(near(b.y, g.viewH * (1 - M)) && t.x >= 0 && t.x <= g.viewW, `H7 ${p.label} as the aim at ${zoom * 2}x: the tee on the bottom margin (${b.y.toFixed(2)}), the pin's column in view (${t.x.toFixed(1)})`);
      const target = { x: 0.5, y: 0.5 };
      ok(JSON.stringify(V.scrollFor({ ...g, ball: tee, target, aim })) === JSON.stringify(V.scrollFor({ ...g, ball: tee, target })), `H7 ${p.label} at ${zoom * 2}x: a target given makes the aim moot`);
    }
  }
  const g = at(2), ball = { x: 0.5, y: 0.55 }, aim = { x: 0.55, y: 0.28 };
  const t = inView(g, V.scrollFor({ ...g, ball, aim }), aim);
  ok(near(t.y, M * g.viewH), `a near aim that fits: on the top margin (${t.y.toFixed(2)} px)`);
  ok(JSON.stringify(V.scrollFor({ ...g, ball: null, aim })) === JSON.stringify(V.scrollFor({ ...g, ball: null })), "no ball: the aim ignored (the map's centre)");
  ok(JSON.stringify(V.scrollFor({ ...g, ball: null, target: aim, aim: { x: 0.9, y: 0.9 } })) === JSON.stringify(V.scrollFor({ ...g, ball: null, target: aim })), "no ball, a target: the aim ignored (the target centred)");
}

// 2
{
  const g = at(2), ball = { x: 0.5, y: 0.55 };
  const c = V.scrollFor({ ...g, ball });
  // inside the margins already: the centred view, unmoved
  const t0 = { x: 0.6, y: 0.45 };
  ok(JSON.stringify(V.scrollFor({ ...g, ball, target: t0 })) === JSON.stringify(c), "a target already in view leaves the ball centred");
  // above the view, fits: on the top margin exactly, the ball still inside the margins
  const t1 = { x: 0.55, y: 0.28 };
  const r1 = V.scrollFor({ ...g, ball, target: t1 });
  const p1 = inView(g, r1, t1), b1 = inView(g, r1, ball);
  ok(near(p1.y, M * g.viewH) && near(r1.left, c.left), `target above: on the top margin (${p1.y.toFixed(2)} px), x unmoved`);
  ok(b1.y >= M * g.viewH - 1e-9 && b1.y <= g.viewH * (1 - M) + 1e-9, `target above: the ball inside the margins (${b1.y.toFixed(2)})`);
  // left and below at once: both axes shift just to the margins
  const t2 = { x: 0.22, y: 0.8 };
  const r2 = V.scrollFor({ ...g, ball, target: t2 }), p2 = inView(g, r2, t2);
  ok(near(p2.x, M * g.viewW) && near(p2.y, g.viewH * (1 - M)), `target left and below: on both margins (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`);
}

// 3: H7's tee to each of its pins (from public/derived.json) at 3x and 4x
{
  const h = derived[7], ball = { x: h.tee.x, y: h.tee.y };
  for (const zoom of [1.5, 2]) {
    const g = at(zoom);
    for (const p of h.pins) {
      const target = { x: p.x, y: p.y };
      const r = V.scrollFor({ ...g, ball, target });
      const b = inView(g, r, ball), t = inView(g, r, target), gap = (ball.y - target.y) * g.mapH;
      const fits = gap <= g.viewH * (1 - 2 * M);
      ok(!fits, `H7 ${p.label} at ${zoom * 2}x: ${gap.toFixed(1)} px from the tee does not fit ${(g.viewH * (1 - 2 * M)).toFixed(1)}`);
      ok(near(b.y, g.viewH * (1 - M)), `H7 ${p.label} at ${zoom * 2}x: the tee on the bottom margin (${b.y.toFixed(2)})`);
      const centred = ball.y * g.mapH - g.viewH / 2;
      if (p === h.pins[0]) console.log(`H7 tee -> ${p.label} at ${zoom * 2}x: ${gap.toFixed(1)} px apart, ${(gap - g.viewH * (1 - 2 * M)).toFixed(1)} past fitting; the pin ${t.y.toFixed(1)} px from the view's top (centring the tee: ${(ball.y * g.mapH - gap - centred).toFixed(1)})`);
      ok(t.x >= 0 && t.x <= g.viewW, `H7 ${p.label}: the pin's column in view (${t.x.toFixed(1)})`);
    }
  }
}

// 4
{
  for (const zoom of [1.5, 2]) {
    const g = at(zoom), maxL = g.mapW - g.viewW, maxT = g.mapH - g.viewH;
    const a = V.scrollFor({ ...g, ball: { x: 0.02, y: 0.03 } });
    const b = V.scrollFor({ ...g, ball: { x: 0.98, y: 0.97 }, target: { x: 0.9, y: 0.99 } });
    ok(a.left === 0 && a.top === 0, `${zoom * 2}x: a ball in the top-left corner pins the view to 0, 0 (${JSON.stringify(a)})`);
    ok(near(b.left, maxL) && near(b.top, maxT), `${zoom * 2}x: the bottom-right corner pins it to the max (${JSON.stringify(b)})`);
  }
  const g = at(1);
  for (const ball of [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }]) {
    const r = V.scrollFor({ ...g, ball, target: { x: 0.5, y: 0.2 } });
    ok(r.left === 0 && r.top === 0, `fit: always 0, 0 (${JSON.stringify(r)})`);
  }
}

// 5
{
  const g = at(2);
  const r = V.scrollFor({ ...g, ball: null, target: { x: 0.3, y: 0.4 } });
  const t = inView(g, r, { x: 0.3, y: 0.4 });
  ok(near(t.x, g.viewW / 2) && near(t.y, g.viewH / 2), "no ball: the target centred");
  const c = V.scrollFor({ ...g, ball: null });
  ok(near(c.left, (g.mapW - g.viewW) / 2) && near(c.top, (g.mapH - g.viewH) / 2), "no ball, no target: the map's centre");
}

// 6
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let n = 0, fit = 0, bad = 0;
  for (let i = 0; i < 20000; i++) {
    const zoom = i % 2 ? 1.5 : 2, g = at(zoom);
    const ball = { x: rnd(), y: rnd() }, target = { x: rnd(), y: rnd() };
    const r = V.scrollFor({ ...g, ball, target }), c = V.scrollFor({ ...g, ball });
    const maxL = g.mapW - g.viewW, maxT = g.mapH - g.viewH, e = 1e-9;
    let good = r.left >= -e && r.left <= maxL + e && r.top >= -e && r.top <= maxT + e;
    const b = inView(g, r, ball), t = inView(g, r, target);
    good &&= b.x >= -e && b.x <= g.viewW + e && b.y >= -e && b.y <= g.viewH + e; // the ball always in view
    for (const [k, view, size, off, co] of [["x", g.viewW, g.mapW, "left", c.left], ["y", g.viewH, g.mapH, "top", c.top]]) {
      const m = M * view, tp = t[k], gap = Math.abs(target[k] - ball[k]) * size;
      if (gap <= view - 2 * m) {
        fit++;
        // in view; inside the margins unless the map's edge is closer
        good &&= tp >= Math.min(m, target[k] * size) - e && tp <= Math.max(view - m, view - (size - target[k] * size)) + e;
        // no larger a shift than needed: where it moved off the (clamped)
        // centred view, the target sits on a margin or the map's edge stops it
        if (Math.abs(r[off] - co) > e) good &&= near(tp, m, 1e-6) || near(tp, view - m, 1e-6) || near(r[off], 0) || near(r[off], size - view);
      }
      n++;
    }
    if (!good) { bad++; if (bad < 5) console.log("bad case", zoom, JSON.stringify({ ball, target, r })); }
  }
  ok(bad === 0, `random cases: ${bad} of 20000 break a rule (${fit} of ${n} axes fit)`);
}

console.log(fails ? `${fails} FAILURES` : "all map-view checks passed");
process.exit(fails ? 1 : 0);
