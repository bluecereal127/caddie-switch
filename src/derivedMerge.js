// Merge one hole of public/derived.json into the stored hole state. Pure (no
// React, no storage) so it can be exercised outside the app.
//
//   cur        the stored hole, with `green` already defaulted
//   n          hole number
//   dh         derived.json's entry for the hole
//   fresh      first load ever (no derivedV1 flag): derived values apply wholesale
//
// Rules:
// - Holes built from the WSR collision meshes carry source "wsr". That data is
//   the truth (CLAUDE.md, "Truth source"), so their scale, green box, outline and
//   slope grid overwrite whatever is stored until the hole's marker green.src
//   equals derived.json's wsrRev (a hash of that hole's WSR geometry, so a later
//   correction of the truth applies again). The marker lives in the hole's own saved state, so a save
//   that raced the merge (old values written back) simply gets migrated again on
//   the next load; once it is stored, later manual edits survive (every edit
//   spreads the existing green object, keeping the marker).
// - Everything else keeps the original fill-empty behaviour, except the tees:
//   tee (the WSR player start, where local play tees off) and teeOnline (the
//   two-tiered Survival Golf platform: its lower and upper tier, or only the
//   observed median x, y while none of a hole's online rounds has a judged
//   tier) always follow derived.json, whole. Nothing in the app edits a tee,
//   and the loader drops both from saved state anyway.
// - Pins the pipeline produced (string ids "d…") mirror derived.json on every
//   load, so corrections reach the app and stale spots drop out; they keep the
//   derived fields (label, set, src, yd, seen) and their id is "d<hole>-<derived
//   id>" (s<slot> for a WSR spot, x<k> for a Switch-only one). The player's own
//   pins (numeric ids) are never touched. If the current pin was a pipeline pin
//   it moves to the pipeline pin at the same spot on the green: its position is
//   carried from the stored green box's frame into the new one, then the nearest
//   current pipeline pin is chosen.
// - Tree markers the pipeline placed carry `auto: true` (today WSR's own trees
//   from the course placement files, id "t<hole>-<k>", x, y = the trunk, with
//   the painted canopy's radius r as a fraction of the map width and its
//   centre's offset dy from the trunk as a fraction of the map height
//   (negative = north: the map is rendered from the game files with WSR's own
//   tree sprites, whose canopy stands north of the trunk), and `off: true` on
//   a tree the course does not reach — outer ground or water under its trunk —
//   which the app leaves out of its tap rule; before that the v13 hand-placed
//   seeds, also auto). The app draws none of them (the map shows the trees);
//   they serve the tap rule. They mirror derived.json's `trees` on every load;
//   the player's own markers (no `auto`) are never touched. A derived.json
//   with no `trees` for the hole leaves the markers as they are, so an old
//   install keeps its seeds until the pipeline ships trees.
export const isPipelinePin = (p) => typeof p?.id === "string" && p.id.startsWith("d");
// the app's hole-map frame (map px), so "nearest" means nearest on the map
const MAP_W = 250, MAP_H = 304;

export function applyDerivedHole(cur, n, dh, { fresh }) {
  const out = { ...cur, green: { ...cur.green } };
  const storedBox = out.green.box ?? null;
  if (dh.source === "wsr") {
    const rev = dh.wsrRev ?? "wsr";
    if (fresh || out.green.src !== rev) {
      if (dh.scale != null) out.scale = dh.scale;
      if (dh.greenBox) out.green.box = dh.greenBox;
      if (dh.greenPoly) out.green.poly = dh.greenPoly;
      if (dh.grid) out.green.grid = dh.grid;
    }
    out.green.src = rev;
  }
  if (dh.scale != null && (fresh || out.scale == null)) out.scale = dh.scale;
  if (dh.tee) out.tee = dh.tee;
  out.teeOnline = dh.teeOnline ?? null;
  if (dh.greenBox && (fresh || !out.green.box)) out.green.box = dh.greenBox;
  if (dh.greenPoly && (fresh || !out.green.poly)) out.green.poly = dh.greenPoly;
  // aspect + provenance for the zoomed green view; always take the derived
  // value, it describes the shipped image not user edits
  if (dh.greenView) out.green.view = dh.greenView;
  const gridEmpty = !(out.green.grid ?? []).some((r) => r.some(([x, y]) => x || y));
  if (dh.grid && (fresh || gridEmpty)) out.green.grid = dh.grid;

  const stored = out.pins ?? [];
  const oldCur = stored.find((p) => p.id === out.curPin) ?? null;
  const pipeline = (dh.pins ?? []).map((p, k) => ({ ...p, id: `d${n}-${p.id ?? `w${k}`}` }));
  out.pins = [...stored.filter((p) => !isPipelinePin(p)), ...pipeline];
  if (oldCur && isPipelinePin(oldCur)) {
    const sb = storedBox, nb = out.green.box;
    const ok = (b) => b && b.x1 > b.x0 && b.y1 > b.y0;
    const at = ok(sb) && ok(nb)
      ? { x: nb.x0 + ((oldCur.x - sb.x0) / (sb.x1 - sb.x0)) * (nb.x1 - nb.x0),
          y: nb.y0 + ((oldCur.y - sb.y0) / (sb.y1 - sb.y0)) * (nb.y1 - nb.y0) }
      : oldCur;
    let best = null;
    for (const p of pipeline) { const d = Math.hypot((p.x - at.x) * MAP_W, (p.y - at.y) * MAP_H); if (!best || d < best.d) best = { id: p.id, d }; }
    out.curPin = best ? best.id : null;
  }
  // no current pin yet (or it vanished): the pipeline pin seen most often in the
  // player's captures, the first one if none has been, else the last pin
  if (out.curPin == null || !out.pins.some((p) => p.id === out.curPin)) {
    const pick = pipeline.reduce((b, p) => ((p.seen ?? 0) > (b ? b.seen ?? 0 : -1) ? p : b), null);
    out.curPin = pick ? pick.id : out.pins.length ? out.pins[out.pins.length - 1].id : null;
  }
  if (Array.isArray(dh.trees)) {
    out.markers = [...(out.markers ?? []).filter((m) => !m.auto),
      ...dh.trees.map((t, k) => ({ id: `t${n}-${k}`, x: t.x, y: t.y, r: t.r, ...(t.dy != null ? { dy: t.dy } : {}), auto: true, ...(t.off ? { off: true } : {}) }))];
  }
  return out;
}
