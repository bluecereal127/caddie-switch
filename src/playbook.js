// The solver's playbook (public/playbook/, tools/build-playbook.mjs): the
// routes the Dolphin harness played in WSR itself to an ace, an eagle or the
// albatross on 14, per WSR pin and wind. Pure but for the fetch.
//   loadPlaybook(hole) → the hole's file ({ hole, par, target, dirs, pins }),
//     one fetch per hole, shared; null when missing (fetched again next time)
//   pinKeyOf(hole, pinId) → the file's pin key ("s3") for the app's pipeline
//     pin id ("d<hole>-s3"); null for a player's own pin or a Switch-only spot
//   routesFor(pb, key, { mph, deg }) → { routes, exact, dir } for the wind on
//     the solver's dial (mph; deg N-up, the bearing it blows toward): calm
//     under 1 mph; else the WSR direction nearest the dial (pb.dirs, the
//     bearing of each of WSR's 8 on this hole's map) at the two even speeds
//     either side (WSR's wind is 0-30 mph in steps of 2, the Switch's any
//     whole mph; an even speed is its own), `exact` when the first is solved;
//     else the nearest solved speed in that direction, `exact` false; else none.

const cache = new Map();
export function loadPlaybook(hole) {
  if (!(hole >= 1 && hole <= 21)) return Promise.resolve(null);
  if (!cache.has(hole)) {
    const p = fetch(`/playbook/h${String(hole).padStart(2, "0")}.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => { if (!j || !j.pins) cache.delete(hole); return j?.pins ? j : null; });
    cache.set(hole, p);
  }
  return cache.get(hole);
}

export function pinKeyOf(hole, pinId) {
  if (typeof pinId !== "string") return null;
  const m = pinId.match(/^d(\d+)-(s\d+)$/);
  return m && Number(m[1]) === hole ? m[2] : null;
}

const angGap = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

export function routesFor(pb, key, { mph = 0, deg = 0 } = {}) {
  const pin = pb?.pins?.[key];
  if (!pin) return { routes: [], exact: false, dir: null };
  const sp = Math.max(0, Math.round(Number(mph) || 0));
  if (sp < 1) { const r = pin.routes.filter((x) => x.mph === 0); return { routes: r, exact: r.length > 0, dir: null }; }
  let dir = 0;
  for (let d = 1; d < 8; d++) if (angGap(pb.dirs[d], deg) < angGap(pb.dirs[dir], deg)) dir = d;
  const inDir = pin.routes.filter((x) => x.dir === dir);
  const lo = Math.min(30, Math.max(2, 2 * Math.floor(sp / 2))), hi = Math.min(30, Math.max(2, 2 * Math.ceil(sp / 2)));
  const at = [...new Set([lo, hi])].map((m) => inDir.find((x) => x.mph === m)).filter(Boolean);
  if (at.length) return { routes: at, exact: true, dir };
  const near = [...inDir].sort((a, b) => Math.abs(a.mph - sp) - Math.abs(b.mph - sp) || a.mph - b.mph)[0];
  return { routes: near ? [near] : [], exact: false, dir };
}
