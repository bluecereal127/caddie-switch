// Merge one hole of public/derived.json into the stored hole state. Pure (no
// React, no storage) so it can be exercised outside the app.
//
//   cur        the stored hole, with `green` already defaulted
//   n          hole number
//   dh         derived.json's entry for the hole
//   fresh      first load ever (no derivedV1 flag): derived values apply wholesale
//
// Rules:
// - Holes whose geometry comes from the game's own collision carry source
//   "nss" (the Switch game's, tools/nss-truth.json) or, before it, "wsr" (the
//   WSR meshes, tools/wsr-truth.json). That data is the truth (CLAUDE.md,
//   "Truth source"), so their scale, green box, outline and slope grid
//   overwrite whatever is stored until the hole's marker green.src equals
//   derived.json's rev (`rev`, or `wsrRev` on a derived.json from before the
//   NSS switch: a hash of that hole's geometry, prefixed "nss-" / "wsr-", so a
//   later correction of the truth, or the switch from WSR's geometry to NSS's,
//   applies again, once). The marker lives in the hole's own saved state, so a
//   save that raced the merge (old values written back) simply gets migrated
//   again on the next load; once it is stored, later manual edits survive
//   (every edit spreads the existing green object, keeping the marker).
// - green.gridEdited (set by the app's paint UI: the putt model then reads the
//   painted grid instead of the mesh heights) says the grid is the player's;
//   wherever the merge writes derived.json's grid into the hole (a hole whose
//   marker is behind, a fresh application, an empty grid refilled) it drops
//   the flag, since the grid is the pipeline's again.
// - Everything else keeps the original fill-empty behaviour, except the tees:
//   tee (the WSR player start, where local play tees off) and platform (the
//   online Survival Golf platform, tools/nss-platform.json: per tier every
//   spot a player can stand on, src/platform.js reads it) always follow
//   derived.json, whole; a derived.json without `platform` leaves null. The
//   old teeOnline (the platform's two tiers placed from the online captures)
//   is gone: the merge deletes it. Nothing in the app edits a tee or the
//   platform; App.jsx's persist writes them with the hole (the platform about
//   1.5 KB a hole, 32 KB for the 21), but they are never read back: the
//   loader keeps only par, note, blocked, markers, scale, green, pins and
//   curPin, and this merge sets tee and platform again on every load.
//   derived.json's teeNss (NSS's tee bones, for audit) is not merged.
// - Pins the pipeline produced (string ids "d…") mirror derived.json on every
//   load, so corrections reach the app and stale spots drop out; they keep the
//   derived fields (label, src, yd, seen; difficult, k and wsr on an NSS cup,
//   set on a WSR spot) and their id is "d<hole>-<derived id>": c<k> for NSS's
//   cup k (0-5, labelled 1-6), before the NSS switch s<slot> for a WSR spot
//   and x<k> for a Switch-only one. The player's own pins (numeric ids) are
//   never touched. If the current pin was a pipeline pin it moves to the
//   pipeline pin at the same spot on the green:
//   - an NSS cup whose id derived.json still ships keeps it (c<k> names the
//     cup's bone, so it is the same cup whatever the green box does);
//   - a WSR-era pin (s<slot>, x<k>) under NSS cups moves to the nearest cup by
//     its map position: both live in the one map frame (tools/nss-export.mjs
//     maps the WSR start within 0.016 px of its own point), and carrying it
//     through the green boxes would only blur it (the box changes with the
//     truth's source by up to a px on H9, and H12's s0 and s2 sit 0.03 and
//     0.06 px nearer their cup than the next);
//   - otherwise its position is carried from the stored green box's frame
//     into the new one, then the nearest current pipeline pin is chosen.
//   The id moves on every load until the new one is saved, so no storage
//   flag; a second load changes nothing.
// - Tree markers the pipeline placed carry `auto: true` (today WSR's own trees
//   from the course placement files, id "t<hole>-<k>", x, y = the trunk, with
//   the painted canopy's radius r as a fraction of the map width and its
//   centre's offset from the trunk, dy as a fraction of the map height
//   (negative = north: the map is rendered from the game files with WSR's own
//   tree sprites, whose canopy stands north of the trunk) and, on the few
//   sprites painted east or west of their trunk, dx as a fraction of the
//   width, and `off: true` on
//   a tree the course does not reach — outer ground or water under its trunk —
//   which the app leaves out of its tap rule; before that the v13 hand-placed
//   seeds, also auto). The app draws none of them (the map shows the trees);
//   they serve the tap rule and, through kind, size (the x scale), sy (the y
//   scale) and z (the base height in yd above the hole's datum, the WSR
//   start), the flight check against WSR's tree collision shapes; since the
//   NSS changeover they are NSS's trees, and `col` (the tree's own collision,
//   yd about its placement: trunk capsules and leaf volumes) is what
//   src/trees.js flies the ball against, the family template only for a
//   marker without it. They mirror derived.json's `trees` on every load (the
//   fields in TREE_FIELDS, each only when derived.json has it; App.jsx's
//   persist leaves `col` out of the saved auto markers, since this merge
//   puts it back on every load);
//   the player's own markers (no `auto`) are never touched. A derived.json
//   with no `trees` for the hole leaves the markers as they are, so an old
//   install keeps its seeds until the pipeline ships trees.
export const isPipelinePin = (p) => typeof p?.id === "string" && p.id.startsWith("d");
// what an auto tree marker carries besides id, x, y, r, auto and off
const TREE_FIELDS = ["dy", "dx", "kind", "size", "sy", "z", "col"];
// the app's hole-map frame (map px), so "nearest" means nearest on the map
const MAP_W = 250, MAP_H = 304;

export function applyDerivedHole(cur, n, dh, { fresh }) {
  const out = { ...cur, green: { ...cur.green } };
  const storedBox = out.green.box ?? null;
  if (dh.source === "wsr" || dh.source === "nss") {
    const rev = dh.rev ?? dh.wsrRev ?? dh.source;
    if (fresh || out.green.src !== rev) {
      if (dh.scale != null) out.scale = dh.scale;
      if (dh.greenBox) out.green.box = dh.greenBox;
      if (dh.greenPoly) out.green.poly = dh.greenPoly;
      if (dh.grid) { out.green.grid = dh.grid; delete out.green.gridEdited; }
    }
    out.green.src = rev;
  }
  if (dh.scale != null && (fresh || out.scale == null)) out.scale = dh.scale;
  if (dh.tee) out.tee = dh.tee;
  out.platform = dh.platform ?? null;
  delete out.teeOnline;
  if (dh.greenBox && (fresh || !out.green.box)) out.green.box = dh.greenBox;
  if (dh.greenPoly && (fresh || !out.green.poly)) out.green.poly = dh.greenPoly;
  // aspect + provenance for the zoomed green view; always take the derived
  // value, it describes the shipped image not user edits
  if (dh.greenView) out.green.view = dh.greenView;
  // the steepest slope of the hole's green in percent (the truth's green, NSS's
  // or before it WSR's: the level-3 cells of the painted grid), which turns a painted grid into
  // absolute slopes for the putt model; always the derived value, like the view
  if (dh.slopeMaxPct != null) out.green.slopeMaxPct = dh.slopeMaxPct;
  const gridEmpty = !(out.green.grid ?? []).some((r) => r.some(([x, y]) => x || y));
  if (dh.grid && (fresh || gridEmpty)) { out.green.grid = dh.grid; delete out.green.gridEdited; }

  const stored = out.pins ?? [];
  const oldCur = stored.find((p) => p.id === out.curPin) ?? null;
  const pipeline = (dh.pins ?? []).map((p, k) => ({ ...p, id: `d${n}-${p.id ?? `w${k}`}` }));
  out.pins = [...stored.filter((p) => !isPipelinePin(p)), ...pipeline];
  if (oldCur && isPipelinePin(oldCur)) {
    const nssCups = pipeline.some((p) => p.src === "nss");
    const same = oldCur.src === "nss" ? pipeline.find((p) => p.id === oldCur.id && p.src === "nss") : null;
    if (same) out.curPin = same.id;
    else {
      const sb = storedBox, nb = out.green.box;
      const ok = (b) => b && b.x1 > b.x0 && b.y1 > b.y0;
      const at = !(nssCups && oldCur.src !== "nss") && ok(sb) && ok(nb)
        ? { x: nb.x0 + ((oldCur.x - sb.x0) / (sb.x1 - sb.x0)) * (nb.x1 - nb.x0),
            y: nb.y0 + ((oldCur.y - sb.y0) / (sb.y1 - sb.y0)) * (nb.y1 - nb.y0) }
        : oldCur;
      let best = null;
      for (const p of pipeline) { const d = Math.hypot((p.x - at.x) * MAP_W, (p.y - at.y) * MAP_H); if (!best || d < best.d) best = { id: p.id, d }; }
      out.curPin = best ? best.id : null;
    }
  }
  // no current pin yet (or it vanished): the pipeline pin seen most often in the
  // player's captures, the first one if none has been, else the last pin
  if (out.curPin == null || !out.pins.some((p) => p.id === out.curPin)) {
    const pick = pipeline.reduce((b, p) => ((p.seen ?? 0) > (b ? b.seen ?? 0 : -1) ? p : b), null);
    out.curPin = pick ? pick.id : out.pins.length ? out.pins[out.pins.length - 1].id : null;
  }
  if (Array.isArray(dh.trees)) {
    out.markers = [...(out.markers ?? []).filter((m) => !m.auto),
      ...dh.trees.map((t, k) => {
        const m = { id: `t${n}-${k}`, x: t.x, y: t.y, r: t.r };
        for (const f of TREE_FIELDS) if (t[f] != null) m[f] = t[f];
        return { ...m, auto: true, ...(t.off ? { off: true } : {}) };
      })];
  }
  return out;
}
