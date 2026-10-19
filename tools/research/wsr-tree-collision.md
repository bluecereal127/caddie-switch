# WSR tree collision shapes (group S, 2026-10-18)

Read-only research on `C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol` (US Rev 1)
and the extracted disc. Everything below is **Wii Sports Resort's** data; the Switch game
(Nintendo Switch Sports) is a different engine and may differ, see the last section.
Units: KCL units, 1 u = 0.1 m, 9.144 u/yd (same frame as the course meshes and the PMP).

Scratch files: `$S/research/trees/` (`dis/` disassemblies, `models/` the three tree BRRES
extracted with wszst, `kcl/` the palm KCL decoded with wkclt, `scripts/` the PMP tallies,
`tree-shapes.json` the table below in machine form).

## Summary

The ball tests every placed tree each physics step against an **analytic shape built from
per-kind constants in the binary, scaled by the PMP scale** (x scale for radii, y scale for
heights); the palm alone has a real collision mesh (`WS2_glf_tree3.kcl`, its own visual
mesh) used as the narrow phase inside an analytic broad phase.

| PMP id | model | count | trunk (hit = bounce, code 1) | canopy (hit = slowed, no deflection) |
|---|---|---|---|---|
| 2 | `tree1` broadleaf | 960 | vertical capsule, radius **6·sx**, straight to **60·sy** above the base, rounded cap | **sphere**, centre **100·sy** up, radius **48·sx** (code 2, ×0.98/step) |
| 3 | `tree2` conifer | 409 | capsule, radius **4.4·sx**, to **70·sy** | **cone**, base at **40·sy** radius **30·sx**, apex at **170·sy** (code 3, ×0.98/step) |
| 6 | `tree3` palm | 171 | the KCL trunk: radius ≈6.7 at the base tapering to ≈1.5, height **132·sy**, leaning 20 u toward the tree's local +z | the KCL fronds: **76..170·sy** up, **±70·sx** wide (code 4, ×0.94/step) |

At scale 1 (multiply radii by the tree's x scale, heights by its y scale):

| | broadleaf | conifer | palm |
|---|---|---|---|
| trunk radius | 6 u = 0.6 m = 0.66 yd | 4.4 u = 0.48 yd | ≈6.7 u = 0.73 yd (base) |
| trunk top | 60 u = 6.6 yd (cap to 66) | 70 u = 7.7 yd (cap to 74) | 132 u = 14.4 yd |
| canopy bottom | 52 u = 5.7 yd | 40 u = 4.4 yd | 76 u = 8.3 yd |
| canopy top | 148 u = 16.2 yd | 170 u = 18.6 yd | 170 u = 18.5 yd |
| canopy half-width | 48 u = 5.2 yd (sphere) | 30 u = 3.3 yd at the base, 0 at the apex | ≈70 u = 7.6 yd (irregular) |

The ball's collision radius is 0.5 u (5 cm) and is added to the capsule and sphere radii
(not to the cone). Scales in the PMP: broadleaf sx 0.7..3.0 (median 1.7), conifer 0.85..3.95
(median 2.3), palm 1.2..3.0 (median 2.2); y differs from x on 366 of the 1,540 (sy/sx
0.667..1.524). A median broadleaf's canopy therefore spans 88..252 u (9.7..27.5 yd) up and
is 163 u (18 yd) wide; a median conifer's cone runs 92..391 u (10..43 yd); a median palm's
fronds 167..374 u (18..41 yd).

## 1. The collision code (main.dol, US Rev 1)

All addresses are virtual; `r2 = 0x806fe080` is the small-data base (float literals),
`r13-0x2ca0` is `RPGlfFieldManager::sInstance` (Caddie's symbol list).

**Objects.** When a course loads, the field manager walks the PMP twice. The counting pass
(`0x80402834`, jump table `0x806d4a6c` indexed by the object id of group 2) counts ids
2/3/6/22/23 into +0x1c and ids 4/5/7/24/25 into +0x24. The creating pass (`0x80402400`,
jump table `0x806d4a00`) then builds, for every id 2/3/6/22/23 record, a 0x54-byte
**scenery object** in the array at FieldManager+0x20 by calling `0x803f3b74(obj, record,
index, kind)` with kind 1 (id 2), 2 (id 3), 3 (id 6), 4 (id 22), 5 (id 23). That loader
looks the kind up in the name table at `0x8067b148` -> `{"dummy","tree1","tree2","tree3",
"hotel1","rock1"}` (strings at `0x8067b160..`), loads `G3D/glf_<name>.brres` with models
`WS2_glf_<name>`, `WS2_glf_<name>_LOD` and `WS2_glf_<name>_sh` from Common/GlfScene/common.carc,
and copies the record's position (PMP +0x08 -> obj+0x30) and scale (PMP +0x14 ->
obj+0x3c). It ends with `0x803f3ac8`, which writes the **shape constants** into obj+0x04..+0x14
from the literal pool:

| kind | +0x04 | +0x08 | +0x0c | +0x10 | +0x14 | literals |
|---|---|---|---|---|---|---|
| 1 broadleaf | 6 | 60 | 100 | 48 | 48 | r2-0x9e8, -0x9e4, -0x9e0, -0x9dc |
| 2 conifer | 4.4 | 70 | 40 | 30 | 130 | r2-0x9d8, -0x9fc, -0x9d4, -0x9f0, -0x9d0 |
| 3 palm | 15 | 80 | 120 | 80 | 80 | r2-0x9cc, -0x9c8, -0x9c4 |
| 0, 4, 5 | 0 | 0 | 0 | 0 | 0 | r2-0xa04 |

The meaning of each field follows from how the tests below use it: +0x04 trunk radius
(× obj scale.x), +0x08 trunk half-height (× scale.y), +0x0c canopy centre/base height
(× scale.y), +0x10 canopy radius (× scale.x), +0x14 canopy height (conifer only, × scale.y).
Only scale.x enters the radii (scale.z is ignored by the analytic shapes; 1,533 of the 1,540
trees have x = z anyway), scale.y enters every height.

**The per-step test.** `0x80414734` (ball step wrapper, 4 callers) runs `RPGlfBall::Calc`
(`0x80413b68`) and then `0x804138a0(ball, flag)`, the ball's tree check. That calls
`0x80401ac0(fieldMgr, &ball.pos (+0x4c), &normal, &depth, f1 = 0.5)` (r2-0xc4 = the ball's
collision radius, 0.5 u), which loops over the scenery array (+0x20, count +0x1c, stride
0x54) and calls the dispatcher `0x803f376c` per object, remembering the last non-zero code
and stopping at the first trunk hit (code 1).

**Dispatcher `0x803f376c`** (obj, ballPos, &normal, &depth, f1 = ball radius): rejects when
the horizontal distance (RPGlfUtility::CalcDeltaXZ `0x803edb2c`) exceeds +0x10·sx + 0.5,
then by kind: 1 -> `0x803f3630`, 2 -> `0x803f34f8`, 3 -> `0x803f3194`, others -> 0. So hotel
and rocks (kinds 4/5) never collide through this path.

**Primitives.**
- `0x803f2340` **vertical capsule** (ballPos, base, &n, &depth; f1 ball r, f2 radius, f3
  half-height): miss if the xz distance > f1+f2; if |ball.y − base.y| ≤ f3 the hit normal is
  horizontal and depth = (f1+f2) − xz distance; otherwise the end cap at base.y ± f3 is tested
  as a sphere of radius f2. The segment runs from base.y − f3 to base.y + f3, i.e. the half
  below ground is irrelevant: the trunk stands from the ground to +f3 with a rounded top.
- `0x803f24cc` **sphere** (ballPos, centre, &n, &depth; f1 ball r, f2 radius): hit if
  |ball − centre| ≤ f1+f2; normal = that direction (default up vector when zero), depth =
  (f1+f2) − distance.
- `0x803f25d4` **cone** (ballPos, base centre; f1 base radius, f2 height): d = ball − base;
  miss if d.y < 0 or d.y > f2; radius at the ball's height r = f1·(1 − d.y/f2); hit if
  dx²+dz² ≤ r². The ball radius is not used. No normal or depth is produced.

**Kind 1 broadleaf `0x803f3630`**: capsule(radius 6·sx + 3 as a gate, then exactly 6·sx,
half-height 60·sy) -> code 1 with normal/depth; else sphere(centre = pos + (0, 100·sy, 0),
radius 48·sx) -> code 2. (If the gate hits but the exact capsule misses, the canopy is not
tested that step: a 3 u shell around the trunk, negligible.)

**Kind 2 conifer `0x803f34f8`**: capsule(4.4·sx, 70·sy) -> code 1; else cone(base = pos +
(0, 40·sy, 0), base radius 30·sx, height 130·sy, so the apex is at 170·sy) -> code 3.

**Kind 3 palm `0x803f3194`**: broad phase capsule(15·sx, 80·sy) or sphere(centre 120·sy up,
radius 80·sx); if either hits, the ball is moved into the tree's local frame (ball − pos,
times the inverse of the object's rotation matrix at obj+0x24, each axis divided by the
scale) and the shared palm KCL at `r13-0x2ccc` is queried as a sphere (`0x803f0738` begin
at the local point with radius 0.5/|(sx,sy,sz)|, `0x803f0644` next hit). A triangle of KCL
type 0x12 (fronds) returns code 4 at once; type 0x11 (trunk) hits keep the deepest one, whose
normal is rotated back and depth multiplied by |scale|, and return code 1. (The radius is
divided by the length of the scale vector rather than the scale, so the effective ball
radius against the palm mesh is 0.5/(s·√3) ≈ 0.29/s for a uniform scale s: a quirk, harmless.)

The palm KCL is loaded once per course by `0x803f30f0` ("WS2_glf_tree3.kcl" at `0x8067b185`,
from Common/GlfScene/common.carc, 52,556 bytes, 404 triangles: 104 of type 0x11, 300 of
type 0x12) into a 0x2a8-byte KCL object (vtable `0x806b75f8`) stored at `r13-0x2ccc`; the
disc-golf copy of the same code (`0x8022580c`, name table `0x80664cb8`) stores at
`r13-0x34cc`. There is no KCL for tree1 or tree2 anywhere on the disc (the only tree KCLs
are this one and `WS2_common_tree*.kcl` for the island scenes of other sports).

**Response in `0x804138a0`** (the ball's tree check):
- code 1 (trunk): `0x80413648(ball, normal, 1, depth, 0.5, 0.5)`: the ball is pushed out
  along the normal by the depth; the normal is flattened (y = 0) and renormalised; the
  normal velocity component is reversed and halved (restitution 0.5); the tangential
  component is capped at 0.5·|v_n|; spin is pulled toward 2·(n × v_t) with weight
  clamp(0.07 + 0.93·|v_n|/0.25, 0.07, 1); the accumulators at ball+0x98..+0xa0 are zeroed.
  A trunk hit kills the shot: the ball leaves with at most ~0.7·|v_n|. Sound 0x5c8 and the
  effect `WS2_glf_hit_wood` (`0x8067c117`) when |v| > 0.1 u/step.
- codes 2/3 (broadleaf/conifer canopy): no deflection and no position change; the velocity
  (ball+0x88..+0x90) is multiplied by **0.98** (r2-0x64) on every step the ball is inside
  the volume. Sound 0x5c7 once per entry (flag ball+0x17c) with the effect `WS2_glf_tree_leaf`
  / `WS2_glf_tree_conifer`.
- code 4 (palm fronds): velocity × **0.94** (r2-0x38) per step; effect `WS2_glf_palmtree_leaf`.
- When |v| ≤ 0.8 u/step (4.8 m/s at 60 Hz) the canopy damping only runs on steps where
  (ball frame counter mod 60) < 12, so a slow ball is not ground to a halt in a canopy.

At 60 steps/s a ball crossing a 10 m canopy at 60 m/s spends ~10 steps inside and keeps
0.98^10 = 0.82 of its speed (0.94^10 = 0.54 through palm fronds); a full second inside keeps
0.30 (0.02). The steps-per-frame of the ball sim were not verified here (group R's area).

A second user of the tree loop, `0x803fbb88` (called from `0x803fb754/0x803fb910/0x803fb9d0`),
tests a candidate position with ball radius 6 u and rejects it if any tree is hit: a
placement/drop validity check, not flight.

## 2. Visual geometry (cross-check)

Common/GlfScene/common.carc -> `G3D/glf_tree1.brres`, `glf_tree2.brres`, `glf_tree3.brres`
(extracted with wszst to `$S/research/trees/models/glf_tree<N>.d/3DModels(NW4R)/*.txt`).
Each model has two bones / two vertex sets, trunk and canopy, in KCL units (the palm's
vertex set equals the KCL's extents to 0.01 u, which fixes the unit):

| model | trunk set (x, y, z extents) | canopy set | LOD billboard |
|---|---|---|---|
| `WS2_glf_tree1` broadleaf (textures glfM_wood01, glfM_leaf03) | ±59.9, −4.9..120.5, ±59.9 (trunk + branches) | −96..89, 19.5..193.2, −99..87 (leaf cards) | ±79.9 × 176.3 |
| `WS2_glf_tree2` conifer (glfM_tree2wood, glfM_tree2leaf) | ±5.0, −6.1..113.7, ±4.8 | ±50, 29..200 (bone at y 140, −111..+60) | ±50 × 200 |
| `WS2_glf_tree3` palm (glfM_tree3wood, glfM_tree3leaf) | ±6.7, −9.9..132.1, −10.5..20.6 | −69.6..65.5, 75.9..169.5, −55.2..69.5 | ±70 × 170 |

Compared with the collision shapes: the broadleaf's sphere (52..148 up, radius 48) sits
well inside the drawn crown (19.5..193 up, radius ~90..96): the ball passes through the
outer half of the visible canopy untouched, and under the lowest leaves. The conifer's cone
(base radius 30 at 40 up, apex 170) is narrower and shorter than the drawn cone (radius 50,
29..200). The palm's collision is its drawn mesh. The minimap sprite radii fitted in
tools/MESHES.md (81·size broadleaf, 48·size conifer, ~45 palm) match the drawn crowns, not
the collision volumes.

Palm KCL by height band (`$S/research/trees/kcl/tree3.obj`, group `cannon_11` = trunk type
0x11, `effect_12` = fronds type 0x12): trunk centre z −4 at 0..60 up, −3 at 60..80, +2 at
80..100, +9 at 100..120, +21 at 120..132 (a lean toward local +z); half-extent 6.8 at the
base, 5 at 60, 2.8 at 90, 1.5 at 110. Fronds centre ≈ (0, 120, +15); half-extents x/z: 80..100
up 58/53, 100..120 70/47, 120..140 64/69, 140..160 44/49, 160..170 39/36. The palm's PMP
rotation is a yaw on 170 of 171 (fcJP16 = hole 4 index 31 is tilted), so the lean direction
is the yaw applied to local +z.

## 3. The 16 param bytes

All zero on every tree: ids 2 (960), 3 (409), 6 (171), and on the companions 4/5/7 (166).
The u32 at record +0x04 is 0 and the u32 at +0x44 is 0xffffffff on all of them (and on every
group-2 object). Nothing is read from them: the loader `0x803f3b74` only copies position
and scale, and the creator passes the kind from the id. (For contrast, pins carry slot/set
and the 85 id-26 objects carry values like `0028 0000 0001`; those are not trees.)

## 4. The companions (ids 4, 5, 7): water reflections, no collision

The creator's jump table sends ids 4/5/7 (and 24/25) to `0x803f2fb8` with kinds 1/2/3
(4/5), which builds the 0x50-byte objects of the second array (FieldManager+0x28) from the
models `WS2_glf_tree1_env`, `WS2_glf_tree2_env`, `WS2_glf_tree3_env` (name table
`0x8067b0e8`, format "WS2_glf_%s_env"). Those models are the trees mirrored: vertex y runs
−176.3..0 (tree1_env), −190..0 (tree2_env), −170..0 (tree3_env). Each companion stands at the
same x, z as a tree of the matching kind (id 4 <-> 2, 5 <-> 3, 7 <-> 6: 166 of 166 pair,
0 u off except up to 26 u on H2), with the tree's scale on 164, and at y = 2·p − tree.y: on
H11 (fc3) p = −40.0 for all 24 (the KCL water plane there is −50, the drawn water is above
it), elsewhere p varies per tree (hand-placed). They are reflections drawn in the water, and
the ball never tests them: the collision loop iterates the +0x20 array only.

Other group-2 ids seen: 8 = sky (one per hole, `0x803f4514`), 10 = tee marker, 22/23 =
hotel1/rock1 (kinds 4/5, shape constants 0, never hit through this path), 24/25 = their
_env copies, 26 = 85 flat area objects with params (not scenery).

## 5. What the solver needs per tree

Per tree the app needs its kind, position, **both scales** (`size` = sx is shipped today;
sy is needed for every height and differs on 366 trees) and, for palms, the yaw. The shapes
themselves are per kind, so ship one table rather than per-tree numbers. Proposed for
derived.json (KCL units at scale 1; the app converts with 9.144 u/yd and the hole's map
scale; radii × sx, heights × sy):

```json
"treeShapes": {
  "2": { "name": "broadleaf", "ball": 0.5,
         "trunk":  { "type": "capsule", "r": 6,   "top": 60 },
         "canopy": { "type": "sphere",  "cy": 100, "r": 48, "damp": 0.98 } },
  "3": { "name": "conifer",
         "trunk":  { "type": "capsule", "r": 4.4, "top": 70 },
         "canopy": { "type": "cone", "y0": 40, "r0": 30, "y1": 170, "damp": 0.98 } },
  "6": { "name": "palm",
         "trunk":  { "type": "capsule", "r": 7, "top": 132, "leanZ": 20 },
         "canopy": { "type": "slab", "y0": 76, "y1": 170, "r": 70, "cz": 15, "damp": 0.94 },
         "bound":  { "capsule": { "r": 15, "top": 80 }, "sphere": { "cy": 120, "r": 80 } } }
}
```
and per tree `{ x, y, kind, size, sy, yaw? }` (yaw in degrees from the PMP rotation matrix,
palms only; `off` as today). Rules for the solver, with the flight height h above the tree's
base and horizontal offset d from its trunk:
- broadleaf: trunk hit if d < 6·sx + 0.5 and h < 60·sy (+ the cap); canopy if
  d² + (h − 100·sy)² < (48·sx + 0.5)²; over the top when h > 100·sy + sqrt((48·sx)² − d²).
- conifer: trunk if d < 4.4·sx + 0.5 and h < 70·sy; canopy if 40·sy < h < 170·sy and
  d < 30·sx·(170·sy − h)/(130·sy).
- palm: nothing can hit outside the broad phase (capsule 15·sx to 80·sy, sphere at 120·sy
  radius 80·sx + 0.5); inside it, the trunk is a 6.7·sx-wide stem to 132·sy leaning 20·sz
  along the yaw, the fronds a 76..170·sy slab of radius ~70·sx centred 15·sz along the yaw.
- A trunk hit ends the shot at the tree (speed after ≤ 0.7·|v_n|, restitution 0.5,
  tangential capped). A canopy hit does not deflect: speed × 0.98 per step inside
  (× 0.94 in palm fronds), then gravity and roll from wherever it exits.

## 6. Confidence and the Switch

- High: the per-kind constants, which field each is, the capsule/sphere/cone tests, the
  palm KCL path, the return codes and the responses (0.5 restitution, 0.98/0.94 damping),
  the empty params, the companions as reflections. Read from the code with the literal
  pool, consistent with the three models' geometry and with the minimap fits.
- Medium: that the step is one per 60 Hz frame (the damping factors are per call of the
  tree check, which runs once per `0x80414734`; substeps inside `RPGlfBall::Calc` were not
  checked); the exact spin update; the "slow ball, 12 of 60 steps" cadence.
- Not WSR facts, may differ on the Switch: NSS is a different engine, so the constants
  (6/60/100/48 etc.), the sphere-vs-cone choice, the damping and the ball radius are
  WSR's. What carries over is the placement (positions, kinds and scales match the Switch
  minimaps per tools/MESHES.md) and probably the modelling idea (trunk cylinder + canopy
  volume, canopy slows rather than deflects); the Switch's "Hit a Tree!" toast has no WSR
  counterpart (sports2.bmg has no tree message; WSR only plays sound 0x5c8/0x5c7 and the
  leaf effects). The Switch numbers should be checked in play: a ball through the outer
  half of a drawn broadleaf crown should be untouched if the sphere is the same.
