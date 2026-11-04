# Switch Sports Resort: what its files say, what shipped, what is open (2026-11-04)

The write-up of the SR phase (goals A, B and C of the brief): the game identified, its meshes, cups, tees, platform,
trees, physics and tables decoded and compared with Nintendo Switch Sports (NSS), and the seven Special holes wired
into the app. The decode units, their Opus reviews and the wiring units' reports are under the git-ignored lab
`tools/harness/state/eden/lab/r6work/sr/` (A-identity.md, REVIEWS-decode.md, <unit>/REPORT.md, wire/LEAD-NOTES.md,
wire/<unit>/REPORT.txt, wire/*/review/, wire/fixreview/). CLAUDE.md's "The SR changeover" paragraph is the short form.
The user's rules held throughout: the game's own files are the truth, captures confirm and credit; nothing of the
solver changed without the user's approval (the two solver-side items are listed in section 7, unchanged).

## 0. Summary

- SR is a Switch 2 title (program id 0x04008E001F098000, v1.0.0, codename "Anna"), an extracted ExeFS + RomFS at
  `C:\Users\Stephen\Desktop\Switch Sports Resort\`. Its ball is NSS's: the shot velocity table is bit-identical, the
  ball and club parameter files equal on every shared key. Only the swing assist and the normal-mode putter assist
  curves changed (not in the model).
- 27 holes: 1-18 are NSS's, 23 is NSS 20 lengthened (par 5), 24 is NSS 19, 25 is NSS 21, and 19, 20, 21, 22, 26, 27
  are new. The world frame is NSS's to the bit on every shared vertex; the cup bones are bit-identical.
- The app ships all 27 holes since main ab77450 (2026-11-04): the generators read the SR dump, the maps are SR's own
  minimap renders, the storage migrates once (flag `srHolesV1`, the old state kept under
  `caddie:sss-golf-solver-v2.pre-sr`). All 20 tests pass; five Opus reviews of the wiring and two of the fix pass.
- Two solver-side items await the user's approval (hole 27 cup 0's two-ring cover in the live solver's loader; the
  new holes' cup constants against the putt model's median cup). The live advisor's patches are staged for the
  session that owns it (`wire/app/patches/ALL.patch`, `wire/app/HANDOFF.md`).
- Nothing of SR has been checked in an emulator (Eden runs NSS only; SR needs Eden NX2 or Eglantine).

## 1. The game files (goal A; lab A-identity.md)

- An already extracted ExeFS + RomFS, FTP-dumped (47,393 RomFS files; NSS's truncated dump 19,287). No keys needed.
- `exefs/main.npdm`: program id 0x04008E001F098000, a 0x300-byte ACID signature block (Switch 1: 0x200). `exefs/main`:
  NSO0, module "Anna", build id 9043181847fa…9d77, flags 0xFF = ZBIC-compressed code (a zstd variant, Switch FW 22+;
  not decoded, the code's values come from NSS's decode and SR's parameter files). Assets tagged Nin_Ounce_NVN2, BNTX
  platform "Ounc". Display version "100".
- What opens with the NSS decoders: zstd, BYML v7, SARC. What needed ports: Phive collision (Havok 2025.2
  hknpMeshShape v4, `GeometrySection.vertexBuffer`, renumbered material enums: lab collision/phive2025.py), BFRES v10.4
  (the bone struct 0x58 bytes, v9's 0x60: lab bones/bfres10.py), BNTX BC7 in the Turing / Ampere GOB layout (NSS's Tegra
  X1 layout scrambles 4x4 blocks at edges) and the ASTC 6x6 plaid.
- Two Switch 2 emulator builds sit beside the dump (Eden NX2, Eglantine v0.5.1). Neither was run.

## 2. What is NSS's (unchanged)

- Physics: `AnnaGolfShotVelTable` = GolfShotVelTable, 1,200 cells identical in float32. `AnnaGolfBallMoveParam`: every
  shared key equal (gravity 10 / 6, air friction 0.0025, hop 0.0012 / 0.9985, side spin 0.0015, the per-surface
  friction and reflection tables, the roll switch at 4 m/s, AddGravityHole 8 within 0.3 m, the wind block 0.33 / 0.6,
  the backspin block, the stop rules); SR writes out NSS's code defaults as keys and adds a per-surface BackSpinResist
  0.7 and Object / PalmLeaf reflections 0.5 / 0.5. `AnnaGolfPlayerClubParam`: no value differences (lofts, carries,
  rough and bunker ratios, hop ratios, PowerMin, PowerOverMax 1.0 / +0.25 / PT 1.5). Ball shape and the pin's
  collision identical. The HUD wind values seen on SR frames (0 2 4 6 9 11 13 15 17 20 22 26 33 mph) all belong to
  NSS's HUD_MPH table; the wind law fitted on 11 clean windy tee shots gave k = 1.00 (lab/windfit, 2026-10-27).
- The world frame: metres, y up, -z toward the green; on the 21 shared holes 42-96 % of SR's field vertices lie on an
  NSS vertex and every match is exact (0 mm). The 126 cup bones are bit-identical to NSS's; GlfTeeOBJ bit-identical on
  20 of 21 (SR 23 moved); Glf_RotateOBJ identical on 20 of 21 in position and 19 of 21 in heading (SR 25 +0.733 deg).
- The platform: the same two decks, the same eight slot bones (x -3.45 / -1.15 / 1.15 / 3.45 m; low y 0.1 z 2.0, high y
  1.668 z -1.5), the same seating rule; the decks re-exported (the low deck's four underside vertices at -724/512 m
  against NSS's -545/512; a ball never meets them).
- The map frame of 19 shared holes (1-16, 18, 24, 25): the capture parameters equal NSS's, so tools/nss-registration.json
  keeps NSS's entries byte for byte and every stored map fraction of those holes stays valid.
- The minimap textures' geometry: course masks IoU 0.94-0.99 against NSS's on the shared holes; the shading changed
  (section 3).

## 3. What changed (goal B / C, the differences)

**The swing (not in the model).** `AnnaGolfPlayerSwingParam`: BackSwingPowerAssist's full pull within 0.10 of the
white line (NSS 0.05; UpMch 0.16 / 0.21 against 0.12 / 0.17); the normal-mode PutterAssistCurve widened (full pull
within 0.08 of the target, 0.6 at 0.11, 0.35 at 0.20, 0.15 at 0.5; NSS 0.03, 0.5 at 0.06, 0.25 at 0.12, 0 at 0.5);
the HandeHigh (Shot Assist) and HandeLow curves, EnableDist 25 / 30 m and CloseDist 3 / 7 / 4 m unchanged; the
putter's pitch limits 40 deg (50 / 45); the rumble curves. src/putt.js's `puttAssist` and the rec cards' "take it
back to N bars" describe NSS's assists; SR's are wider, so a stroke within 0.10 (not 0.05) of the white line launches
on it, and the normal-mode putter assist catches strokes within 0.08 (not 0.03).

**The course.** 27 holes, pars 4 3 5 3 5 4 4 3 5 4 3 5 3 5 4 4 3 5 | 4 3 5 3 5 4 4 3 5 (AnnaGolfFieldParam, the
OfficialScene copy; the AnnaGolfCommon copy still carries NSS's stale flags). 20 difficult cups: NSS's 16 under SR's
numbers (23 = NSS 20's 3 and 5, 24 = NSS 19's 2 and 6, 25 = NSS 21's 1 and 6) plus 26's 4 and 5 and 27's 2 and 3;
none on 19-22.

**The shared holes' meshes.** Re-triangulated (SR 1: 10,416 vertices against NSS's 17,525) with the same heights;
the green / fringe boundary re-cut on 7, 8, 10-16, 24, 25 (a 0.4-0.5 m rim of GolfGreen became GolfGreenEdge, the
fringe also widened outward on 10-16: the putting surface 3-44 m2 smaller, greenBox up to 0.64 px, slopeMaxPct up
to 0.89 points; the heights within 3.5 mm away from the re-cut edges and up to 60 mm on SR 10 within 3.6 m of them);
SR 18's green re-meshed without a re-cut (heights up to 30 mm off); NSS out-of-bounds ground that is rock in SR (947
NSS triangles, 61,365 m2 on 13 holes); NSS 20's 92 glass and 104 object triangles as barrier; OB ground where NSS
21's frame held the sea (SR 25); no water actor anywhere (hole 3's sea is 149 triangles in the field mesh; NSS's was a
63,321-triangle actor). Stacked triangles with two codes: SR 27's 154 fairway + fringe pairs (half of its fringe
ring) and SR 23's 60 OB + object; the builds keep the copy whose code ranks first in nsscol's TIE_ORDER (the terrain's
rule), which surface the game reads being undecoded.

**The trees.** No baked trees in the field meshes: every tree is a scene (Banc) actor over a per-kind collision mesh,
2,254 over the 27 holes. The four playable kinds (HardWoodA, ConiferTreeA, PalmTreeA / B) are NSS's kind meshes vertex
for vertex; the `_OB` kinds are trunk-only, their canopies the hole's TreeLeafNN pieces. NSS's actor HardWoodB / C / D
are HardWoodA in SR (another trunk; D a smaller crown). Against the shipped NSS file (SR 1-18, 24 = NSS 19, 25 = NSS
21): 1,246 of 1,257 trees matched within 0.02 px, 5 moved (0.04-3.6 m), 77 SR-only (59 new, mostly OB trees far out;
11 decor trees NSS had dropped for lack of collision; 7 whose footprint now reaches the frame), 6 NSS-only (five of
SR 23's re-planting, one estimated palm SR places 0.4 m away). The TreeLeaf canopies are placed in play on all 27
scenes (NSS's H21 rule, its TreeLeaf21 absent in play, has no counterpart: SR 25 ships the 28 canopies NSS dropped;
unverified in play). SR 23's field mesh carries 12,808 foliage triangles (hedges, no trunk actors), in course3d's tree
pack but not a tree marker. The hole-14 field keeps one baked trunk (296 triangles).

**The frames.** SR 17's capture square is (30, -92) m, 340 m across (NSS 17's (30, -120), 320) and SR 23's (-30, -80),
600 m (NSS 20's (-30, -175), 420); the six new holes have squares of their own. The exact layout frame is a 306.667 px
square about (125.667, 152.667) of the 250x304 map (both games' LGlfMiniMap layouts; S = 460 x 720 / 1080); NSS's
fitted registration sits 0.40 px low in y against it (0.53 px low on SR's screen, sd 0.23). The 19 shared holes keep
NSS's fit (the user's decision to make, section 7); 17, 19-23, 26, 27 take the exact frame, unchecked against a tree
fit (up to about 1.5 px by the shared holes' residuals).

**The minimap.** SR re-baked the captures with another shading (lighter rough, flatter mowing stripes, its own trees;
luminance r 0.84-0.91 on 12 shared holes, 0.53-0.78 on 7); the textures are BC7 in the Turing / Ampere GOB layout,
alpha = the coverage with the colour premultiplied at the edges; SR's shader is a compiled binary, so NSS's
transcribed shader draws it with a Vec3 fitted to SR's own screen (map (1, 1.186, 1.264), green (1, 1.165, 1.287);
3.15 levels mean |d| against 11.4 with NSS's constants); the plaid is ASTC 6x6, its tile 2 m on 22 holes and 1.969 /
1.990 / 1.976 / 1.978 / 1.997 m on 21, 22, 24, 26, 27 (the layout animation; the render keeps 2 m, the index records
the layout's). On SR's 720p screen the capture square shows 311.5 x 303.6 px (2.6 % wider than tall) centred at
(1139.6, 387.3): 13 px right of the NSS panel rect tools/lib/panel.mjs assumes (for the advisor).

**The cups.** The new holes' cups are not NSS's median cup: rims 0.189-0.193 m (NSS's median 0.1948), a fixed 0.2246 m
wall top on 19-22 and 27, depths 0.25-0.285 m on SR 26 and 0.334 m on SR 22 (NSS 0.30-0.34); SR 24's rim 0.1913 m
against NSS 19's 0.1945. Hole 27 cup 0's cover is a two-ring disc (41 vertices, 60 triangles; every other cover on
the 27 holes a 20-triangle fan).

**SR 23 is more than a new tee.** GlfTeeOBJ (42, 10, 51) m, yaw 204 deg: 73.0 m from NSS 20's tee and 10 m up; the
platform stands there (Glf_RotateOBJ (44.6, 10, 56.9)); yards to the cups 392-408 (NSS 20 from its tee 330-345). The
back of the hole (z > -50 m) is rebuilt: the old pond gone (30 water triangles, 3,764 m2), a new pond of 9,255 m2 at y
6.38 m, 36 % of NSS 20's rough changed, the beach's 83 sand-OB triangles gone; from z -150 m to the green the hole is
NSS 20's (the six cup bones bit-identical, still named GolfCourse20hole0..5). Its 21 NSS trees: 15 stand where they
did, 6 moved, 9 new. The terrain datum stays NSS 20's start (NSS y 0), 10.94 yd below the tee, so heights "against the
tee" are measured from the ground under GlfTeeOBJ.

**Mode flags.** The tee marks, Hole1StartOBJ and the five swan boats carry HideSurvival (absent in online Survival
Golf); the tree actors carry no mode flag.

## 4. The seven Special holes, as shipped

| SR | par | tee to cups (yd) | capture area (centre m, size) | yd / px | green m2 | slopeMax % (mean) | trees shipped (off course) | platform faces | difficult cups | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 19 | 4 | 357-373 | (65, -160), 550 | 1.961 | 755 | 6.75 (3.83) | 58 (47) | 40.5 deg | none | no water; bunkers; the rock set carries a material type nobody else uses |
| 20 | 3 | 158-171 | (45, -85), 300 | 1.070 | 485 | 13.15 (5.58) | 44 (28) | 28.5 deg | none | a pond; tilted conifers |
| 21 | 5 | 488-507 | (-115, -270), 600 | 2.140 | 612 | 15.91 (7.19) | 88 (75), all conifers | 301.7 deg | none | water and rock cliffs; the tee bone tilted 0.5 deg (the export carries the heading) |
| 22 | 3 | 187-199 | (-15, -100), 275 | 0.981 | 645 | 13.22 (6.57) | 42 (34) | 6.0 deg | none | water; cups 0.334 m deep |
| 23 | 5 | 392-408 | (-30, -80), 600 | 2.140 | 520 | 15.22 (7.95) | 24 (4) | 336.0 deg | 3, 5 | NSS 20 + the new tee (73 m back, 10 m up); a new pond; hedges in the field mesh |
| 26 | 3 | 175-184 | (-10, -120), 440 | 1.569 | 657 | 24.21 (13.28) | 112 (98) | 0.0 deg | 4, 5 | water, no bunker; a three-lobed green; cups 0.25-0.285 m deep |
| 27 | 5 | 583-598 | (-155, -13), 690 | 2.461 | 781 | 22.13 (10.48) | 78 (11), 56 palms | 329.5 deg | 2, 3 | a seaside hole (sea and a sand-OB beach); the tee at the frame's south edge, 245 m from the origin; a round green with a central peak; cup 0's two-ring cover; cups 1 and 2 only 1.76 px (4.3 yd) apart |

The slopes (6.75-24.21 %) lie inside the NSS holes' 3.63-26.03. Every cup lies inside its green outline (nearest the
rim 2.94 yd, SR 21 cup 1) with its HoleCover as the top ground; GlfTeeOBJ stands on fairway within 1.2 cm of the
ground on all 27; the platform's 42 spots a hole stand over fairway on the new holes, the mats 0.109 / 1.824 yd above
the ground. derived.json's `yards` is null on these seven (no capture records; the app does not read it, the cups
carry their own yardages). Every new hole's course lies inside its capture square (edge contacts only on SR 21 and 27).

## 5. What shipped (main ab77450; the four commits on `sr-27-holes`)

1. baf6612 (part 1): the generators read the SR dump `tools/harness/state/eden/sr-golf-x/` by default (assembled from
   the lab decodes by lab/r6work/sr/assemble/assemble.py in nss-golf-x's schema): nss-export (registration, pins,
   platform), nss-truth, build-terrain (27 holes; `--nss-extras` for NSS's H3 sea), build-course3d (27 holes; the
   covers' ranges, the TIE_ORDER duplicate rule, no water file), nss-trees-export (from lab wire/trees/sr-trees.py's
   fit, 1,750 trees); `--game nss` / `--art nss` / the NSS dump path reproduce the NSS files byte for byte.
2. f822c94 (part 2): the app ships the 27 holes: render-nss-maps.py `--game sr` (SR's textures, the GOB layout, the
   fitted Vec3, the alpha convention, the ASTC plaid; `--game nss` byte-identical to NSS's renders, kept at
   captures/derived/render-nss-nss21), build-map-scales `--art sr` (public/maps 3x / 4x for 27 holes), build-derived
   (SR_HOLES, the capture records renumbered where read, SR 17 / 23 positions through the frame change), src/maps.js,
   src/greens.js, src/mapxform.js, public/derived.json; src/srMigrate.js (new, pure) and App.jsx (COURSES' Special
   course 19-27, PARS = SR_PARS, every loop to 27, NOTES / TREE_SEEDS / WIND_RULES renumbered, the load's one-time
   migration and `srFrameFix`, the Log's export / import forms); 18 tests moved onto SR's data and
   tools/test-sr-migrate.mjs added; CLAUDE.md and tools/README.md.
3. fb6b27f (part 3): the Opus reviews' fixes (the migration guard `srNeedsMove`, a write-once backup, SR 23's tee
   datum in the height readouts and the contour view, per-hole test bounds instead of loosened global ones, wording).
4. ab77450 (part 4): the second fix pass (the `.pre-sr` copy is actually written: src/storage.js's get throws on a
   missing key; old bare-array Log exports renumbered on import; the tee level tested on every hole).

The storage migration (src/srMigrate.js, flag `srHolesV1`): before every older migration, a store without the flag and
without a hole past 21 is copied once to `caddie:sss-golf-solver-v2.pre-sr`, then its holes 19, 20, 21 move to 24,
23, 25 with their pins, markers, blocked rules, shot rows, putts and round scores; after the older migrations
`srFrameFix` moves SR 17's and 23's stored markers, pins, green box, outline and scale into SR's frame. The Log's
Export carries `srHolesV1`; an import without it is renumbered.

Tests: 20 pass (test-sr-migrate 237 checks, test-course3d 2,429, test-live3d 641, test-merge-pins 2,391, test-pins
2,498, test-platform 4,020, test-platform-helpers 35,500, test-nss-export 13,971, test-playbook-routes 36,757,
test-nsssim 647, and test-terrain, test-trees, test-putt, test-solver, test-relief, test-mapscale, test-mapview,
test-rows, test-merge-slope, test-merge-tree-fields). The bundle builds; App.jsx parses.

## 6. How it was verified

- The decodes (five Sonnet / Opus units: frame, bones, surfaces, collision, trees), each reviewed by Opus
  (REVIEWS-decode.md, all "sound with fixes"). The reviews' corrections that mattered: the FSHP bounding boxes were
  misread (SR's GREEN render bounds equal NSS's on 20 of 21 holes, not 10); "630 changed tree locations" was false
  (111 new and 119 gone by position on the shared holes; the rest trunk-mesh differences); SR 4's OB palms keep their
  fronds (GolfLeaf sheets in TreeLeaf04); SR 23's water was rebuilt, not kept; the SR HUD pane sits one layout unit
  (y -41, not -40) lower; hole 27 cover 0's two rings; the stacked fairway + fringe pairs on SR 27.
- The wiring (five units: exports, maps, trees, lead's terrain / course3d, app), each reviewed by Opus, then two
  fix-pass reviews (app; tests and docs), all "sound with fixes", the fixes in parts 3 and 4. Each generator's NSS
  mode reproduces the committed NSS files byte for byte; every SR output is byte-identical across runs.
- NSS's 71 Eden strokes replayed over SR's course3d (test-live3d): 25 strokes whose fixture triangles SR's mesh
  contains rest bit for bit as over the fixture (within 0.09 m of the recording); 26 fly a mesh that differs near
  their path (worst rest 1.11 m, H2's 7-iron); all 17 holed putts hole; the six actor-tree strokes rest 0.0003-0.09 m
  from their recordings.
- The exports against the committed NSS data on the 19 same-frame holes: registration byte-equal; 114 cups 0 px / 0 m;
  tees 0; platform within 1e-4 m (SR 25's spots 6.1 cm, the re-pose); truth equal on 1, 3, 5, 6, the re-cut holes as
  in section 3. SR 17's and 23's cups through the frame change land within 0.004 px of SR's own (test-sr-migrate).
- The maps against SR's own screen (427 Eden frames stacked): the exact layout frames fit to 0.00 px in y, the copied
  NSS fits 0.53 px low; the course interior within 3.15 levels mean |d| of the screen.

## 7. Decisions for the user (nothing of the solver changed)

1. **Hole 27 cup 0** (the live solver, src/live3d-core.js through tools/lib/nss3d.mjs): the loader opens the cup in
   play as the 20 green triangles touching a hub within 0.02 m of the bone, so on SR 27 cup 0 the outer 40-triangle
   annulus (r 0.15-0.19 m) stays in the course and plugs the cup's bevel. The fix: build-course3d writes each cover's
   triangle range into the course3d meta and nss3d removes the cover by that range (the planner in the advisor already
   does). tools/test-course3d.mjs and test-live3d.mjs assert the plug as a tripwire until then.
2. **The new holes' cup constants** (src/putt.js's analytic cup, CUP_WINDOW from src/nssShape.js on nss-physics.json's
   median cup): per-hole rim and depth would be a solver change, 3-5 mm at the rim.
3. **SR's assist curves** (src/putt.js `puttAssist` PUTT_ASSIST normal mode; the rec cards' swing line): SR's
   backswing assist pulls within 0.10 and its normal-mode putter assist within 0.08 of the target. A `game: "sr"` set of
   constants would be a solver change; Shot Assist's curves are unchanged.
4. **The frame of the 19 shared holes**: keep NSS's fitted registration (0.53 px low on SR's screen; every stored map
   fraction of those holes stays as it is) or move to the exact layout frames (0.00 px, moving cups, trees and tee by
   0.34-0.77 px rms, up to 1.5 px, on those holes, with a migration).
5. **Wording**: the UI still says "NSS cup N" and "NSS course" (COURSE_LABEL, the Guide's prose).
6. Optional tree-model items: open leaf sheets on OB trees that reach the rough (SR 14 x11, 17 x4, 20, 22, 24, 25 one
   each, covers mostly under 0.1) rank recs down; the tilted conifers of SR 20 / 26 and the leaning palms of SR 27 go
   through the same fit as NSS's tilted trees with no NSS partner to check against.

## 8. Known effects of the switch

- A painted green grid (`gridEdited`) was replaced by SR's mesh heights on every shared hole but 6: the geometry rev
  changed there (the re-cut, SR 18's re-mesh, the frame change on 17 and 23, or on 1, 3 and 5 only the outline's
  start vertex), and the merge re-applies the geometry once. The painted grids are in the `.pre-sr` copy.
- Rounds logged on NSS 20 now count against SR 23's par 5 (the round and hole stats use the current par).
- A Log export made before the switch is renumbered on import (19 -> 24, 20 -> 23, 21 -> 25; a hole 17 / 20 row's
  pos through the frame change); rows typed by hand keep their numbers.
- The capture pipeline (classify, extract-*, assemble-shots) is NSS-only: 720p NSS frames, banners to 21. SR captures
  (1080p, banners to 27) would need it extended, and a run on them would misfile 19-21. The user's NSS captures stay
  keyed by NSS's numbers and are renumbered where build-derived reads them; SR 23's old-tee captures no longer fit.
- tools/online-rounds.json: round 19 -> 24; the NSS 20 round -> 23 marked stale (its platform was NSS 20's).

## 9. The live advisor (hand-off; not this session's files)

The advisor's patches (12 git-ignored files under tools/harness/state/eden: advisor.mjs, page.html, srview.mjs,
tools/text.mjs, tools-r6 text / uiread / rsolve / rsolve-worker / rground / landmarks.json, the new
tools-r6/sr-capture.json and sr-capture-export.mjs) are staged at lab/r6work/sr/wire/app/patches/ALL.patch (`git
apply --check` clean on 2026-11-04 after the push) with the brief for its owner at lab/r6work/sr/wire/app/HANDOFF.md
and the notes at lab/r6work/sr/wire/LEAD-NOTES.md items 10-17: NSS mode (tools-r6/rplay.mjs) must keep the NSS dump
through SR_GOLF_X or it plans on SR's meshes; /map8/ must serve captures/derived/render-nss (SR's 27) instead of
render-nss-8x (NSS's 21 under numbers that are other holes now); the pane geometry; the persisted hole state keyed by
number; the frame choice; the plaid tiles; SR 23's Terrain-colour ramp zero 0.20 m off NSS 20's.

## 10. Open and unverified

- Nothing of SR run in an emulator: the exact layout frames of 17, 19-23, 26, 27 against the captured art; the
  TreeLeaf canopies in play on all 27; SR 23's rebuilt back nine hundred metres and its field-mesh hedges as Leaf
  collision; which surface the game reads on a stacked pair; the plaid's layout tile on 21, 22, 24, 26, 27.
- The swing: the over-swing's random curve, the backspin source and SR's wider assists (section 3) are not modelled.
- The cup draw and the online cup rule are NSS's decode; SR's code (ZBIC) was not read.
