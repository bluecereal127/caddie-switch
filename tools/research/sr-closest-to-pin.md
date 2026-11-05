# Switch Sports Resort: where Closest to Pin starts (2026-11-05)

Each of SR's 27 holes has **three** Closest to Pin start spots, 81 in all. They are placed
actors, `AnnaObject_BGOBJ_Glf_NearPinOBJ`, in `Banc/AnnaGolfCourseNNScene.bcett.byml.zs`
(expanded from `Banc/Prefab/AnnaGolfCourseNNSceneLocatorPrefab`; equal by value on all 81).
The game draws one of the three for the hole, so a hole has no single event spot.

Online the ball does not sit on the actor: the players stand in a row around it, on the
platform's seat positions (below). Sources: the SR RomFS, SR's code
(`lab/r6work/sr/code/`), the SR collision dump and the advisor's saved frames and logs. No
emulator was run.

Files beside this note in `sr-closest-to-pin/`:
- `spots.json`: every spot with its float32 coordinates, yaw, facing, ground, surface, map
  position, distance to each cup, and the ball at all 28 online seats.
- `spots.csv`: the same spots, one row each, without the seats.
- `img/spots-on-maps.jpg`: the 81 spots on the 27 maps (1 = nearest the green).
- `code/`: the scripts.

## The spots

Metres in the hole's world (x east, y up, z south; the same frame as `tools/nss-pins.json`),
rounded here; `spots.json` has the stored values. Spot 1 is the nearest the green. Yards are
the range to the hole's six cups.

| hole | par | spot 1 | spot 2 | spot 3 |
|---|---|---|---|---|
| 1 | 4 | 73.83, -21.61, -386.80 · bunker · 23–42 yd | 89.04, -19.52, -263.36 · fairway · 95–113 yd | 58.12, -15.69, -156.27 · fairway · 214–230 yd |
| 2 | 3 | -65.09, -15.97, -185.19 · rough · 53–66 yd | -30.11, -5.92, -44.10 · fairway · 101–117 yd | 0.00, 0.00, 0.00 · fairway · 155–167 yd |
| 3 | 5 | 67.84, -7.36, -458.26 · rough · 64–88 yd | -104.62, -11.63, -426.00 · rough · 133–150 yd | -124.15, -18.28, -334.60 · fairway · 216–232 yd |
| 4 | 3 | -53.99, -4.83, -152.70 · fairway · 14–30 yd | 6.89, -10.00, -72.05 · fairway · 108–124 yd | 0.00, 0.00, 0.00 · fairway · 169–184 yd |
| 5 | 5 | 49.90, -12.26, -502.05 · fairway · 18–32 yd | -16.23, -21.48, -408.08 · fairway · 136–155 yd | -24.64, -24.96, -346.51 · fairway · 201–219 yd |
| 6 | 4 | -19.38, -17.62, -310.38 · fairway · 92–115 yd | -83.57, -7.24, -310.60 · rough · 149–170 yd | 30.29, -15.18, -188.41 · fairway · 202–220 yd |
| 7 | 4 | -41.88, -26.71, -398.22 · rough · 95–114 yd | 111.36, -21.40, -256.57 · fairway · 128–145 yd | 41.05, -17.59, -188.81 · fairway · 185–198 yd |
| 8 | 3 | 63.97, -3.89, -188.88 · fairway · 95–113 yd | -129.59, -9.61, -89.74 · rough · 124–143 yd | 0.00, 0.00, 0.00 · fairway · 160–174 yd |
| 9 | 5 | 87.50, -18.09, -540.04 · bunker · 25–39 yd | 84.21, -19.10, -384.03 · fairway · 138–155 yd | 95.32, -5.29, -290.56 · fairway · 240–258 yd |
| 10 | 4 | 1.53, -6.12, -326.51 · fairway · 15–33 yd | 3.06, -8.48, -230.28 · fairway · 121–139 yd | 5.35, -11.14, -151.19 · fairway · 207–225 yd |
| 11 | 3 | 92.68, -6.95, -87.62 · rough · 55–69 yd | 40.41, -3.95, 3.81 · rough · 132–143 yd | 0.00, 0.00, 0.00 · fairway · 138–149 yd |
| 12 | 5 | 56.92, -9.99, -393.48 · fairway · 40–51 yd | 131.52, -2.34, -280.08 · fairway · 189–199 yd | 15.32, 8.14, -234.53 · fairway · 203–215 yd |
| 13 | 3 | -6.47, -5.38, -118.14 · fairway · 16–27 yd | -17.60, -7.21, -87.18 · rough · 40–54 yd | 0.00, 0.00, 0.00 · fairway · 138–151 yd |
| 14 | 5 | -21.88, 3.14, -366.72 · rough · 34–43 yd | -100.68, -8.68, -240.23 · fairway · 125–135 yd | -150.72, -6.82, -193.26 · fairway · 200–209 yd |
| 15 | 4 | -8.76, 7.30, -275.20 · rough · 38–53 yd | -99.61, 11.80, -262.57 · fairway · 102–115 yd | -42.63, 2.65, -166.10 · fairway · 161–174 yd |
| 16 | 4 | 32.72, 7.51, -224.23 · rough · 57–75 yd | -5.31, 6.27, -285.05 · fairway · 124–139 yd | -27.21, 2.99, -133.36 · fairway · 150–166 yd |
| 17 | 3 | 32.79, 19.97, -216.20 · fairway · 13–30 yd | 17.88, 21.63, -234.76 · rough · 39–56 yd | 0.00, 0.00, 0.00 · fairway · 219–232 yd |
| 18 | 5 | 160.94, -4.66, -330.86 · fairway · 128–141 yd | 9.46, -2.98, -296.39 · fairway · 138–151 yd | 129.71, -9.00, -214.13 · fairway · 223–235 yd |
| 19 | 4 | 75.46, -8.69, -360.75 · bunker · 27–42 yd | 99.95, -14.08, -251.14 · rough · 82–96 yd | 153.49, -13.49, -175.90 · fairway · 181–195 yd |
| 20 | 3 | 45.47, -9.43, -143.31 · rough · 22–42 yd | 77.88, -6.74, -216.97 · rough · 80–95 yd | 31.01, -5.58, -23.28 · fairway · 128–140 yd |
| 21 | 5 | -4.24, -14.00, -532.37 · rough · 83–100 yd | -158.19, -11.48, -399.04 · fairway · 122–140 yd | -58.02, -1.56, -277.04 · fairway · 214–233 yd |
| 22 | 3 | 14.60, -14.71, -203.53 · bunker · 18–34 yd | 9.48, -13.84, -102.15 · rough · 81–94 yd | -64.49, -2.00, -107.02 · fairway · 114–136 yd |
| 23 | 5 | 33.70, 16.90, -329.03 · bunker · 19–34 yd | -15.79, 14.60, -326.40 · rough · 26–44 yd | -109.26, 8.54, -193.37 · fairway · 184–197 yd |
| 24 | 4 | -92.85, -1.81, -370.11 · rough · 25–41 yd | -56.25, -10.96, -282.46 · rough · 75–92 yd | -79.78, -13.26, -236.41 · fairway · 113–128 yd |
| 25 | 4 | -75.58, -50.00, -407.69 · fairway · 10–31 yd | -51.45, -49.48, -354.68 · fairway · 33–56 yd | -49.94, -45.16, -225.37 · fairway · 173–196 yd |
| 26 | 3 | -75.89, 9.08, -189.71 · fairway · 79–96 yd | 65.91, -1.17, -222.22 · fairway · 83–102 yd | 73.33, 3.27, -11.91 · fairway · 184–195 yd |
| 27 | 5 | -196.21, -32.12, -291.84 · bunker · 30–45 yd | -146.94, -31.75, -286.52 · rough · 32–49 yd | -36.06, -34.97, -166.41 · fairway · 179–198 yd |

- Surfaces: 53 fairway, 22 rough, 6 bunker.
- Median nearest-cup distance: 30 yd (spot 1), 108 yd (spot 2), 184 yd (spot 3).
- On the six par 3s of holes 1–18 (2, 4, 8, 11, 13, 17), spot 3 is exactly (0, 0, 0): the
  stored actor has no `Translate`, which puts it on the hole's origin, `Glf_RotateOBJ`. Each
  has its own yaw, so these are real spots, not placeholders.

## How the game uses them

All from SR's code (the near-pin mode is bit 20 of the mode word):

- **The draw** (0x316da00): the routine collects the hole's NearPinOBJ actors and picks
  `index = (count × r) >> 32`, r being one xorshift128 draw from the hole seed. With the seed
  flag (game+0x1994) clear it takes index 0. The order of that list is not decoded, so a seed
  cannot yet be mapped to a spot.
- **The facing**: the picked matrix is multiplied by `diag(−1, 1, −1)` (0x316db80, constant
  at 0x438ce5c), a 180° turn that leaves the position alone. `facingDeg` is that bearing.
- **It replaces both bones**: the reader of `GlfTeeOBJ` (0x316d6d0) and of `Glf_RotateOBJ`
  (0x316d910) both return this matrix, so the start line and the seats follow the spot.
- **The platform is put away**: in this mode 0x316d1d0 calls 0x3168690, not the routine that
  shows it (0x3168430). That the call hides the platform is read from the code's shape,
  not traced to the end.
- **Seats**: seats are still dealt, posed through the same matrix. Each seat's height is then
  read from the ground with a ray ±100 m (0x316b67c), since there is no mat to stand on.
- **The cup**: the cup draw (0x316c3e0) has no near-pin branch, so it draws as on any hole.

So online the ball is at, in the spot's frame (+x the player's left, +z forward):
`x = stand ∓ 0.9` (right- / left-handed), `z = −1.5` high tier or `+2.0` low tier, with
`stand` from `src/platform.js`. With 1–4 players everyone is on the high tier, so the ball
is about 1.5 m behind the actor. `onlineBalls` in `spots.json` holds all 28.

## What was checked

- All 81 actors sit on the collision ground, within 3 cm (80 within 2 mm).
- All 81 are upright (yaw only), and each line points at the green: from spots 2 and 3 no
  cup is more than 15.8° off it. Spot 1 is close enough for the cups to spread wider.
- On all 81, every seat stays on the spot's surface. Sampled every 5 cm along both rows. The
  surface changes within 4 m of a spot are ahead of or behind the rows, not along them.

Two real online events, from the saved frames and the advisor's log:

| event | badge | identified as | spot to cup | best seat | left over |
|---|---|---|---|---|---|
| frame `1793012196369-ctp` | 228.9 ft, rough cap | hole 16 spot 1, cup 3 | 224.4 ft | 229.21 ft | 0.31 ft (9 cm) |
| 2026-11-04 12:02 | 135.9 ft, rough cap | hole 23 spot 2, cup 6 | 131.4 ft | 136.05 ft | 0.15 ft (5 cm) |

- Hole 16: the frame's zoomed green is hole 16's, the flag is on cup 3, and the aim line
  runs slightly south of east against the spot's 96°.
- Hole 23: the log's aim read 109.35° against the spot's 109.0°. A zoomed-view read put the
  ball at (−16.57, −328.09), σ 0.3 m; the nearest high-tier seat ball is 0.22 m from it.
- Neither badge fits the bare actor (4–5 ft short) or a low-tier seat. Both fit the high tier.

## Not settled

- **The 5–9 cm left over.** The seat model reads 0.15–0.31 ft long on both events, and the
  seat each player had is unknown. The hand offset and the pose are as in the code, so the
  cause is open. Treat an online ball as good to about 10 cm, not to the millimetre.
- **Local or bot play.** With no seat dealt, 0x316b500 returns without a seat, which should
  leave the ball on the actor itself. No frame shows it.
- **Which holes the event can draw.** All 27 have spots, but the hole choice is not decoded.
  `FirstBot_NearPinHoles` is `[4]` in `AnnaGolfSceneGameSettingParam`, apparently the first
  bot match's hole.
- **A third event.** The log has a 410.9 ft badge at 22:24 on an earlier day, but its hole was
  not recorded (its "hole 26" was the previous state, and no hole 26 spot is about 137 yd
  from a cup). No frame was kept, and the badge alone fits several holes.
- Nothing here was run in an emulator; Eden does not run SR.

## Run order

In a scratch folder, with the RomFS and the SR dump on this machine:
1. `python code/dump1.py`, `python code/cmp.py`: the actors from the prefab and the scene.
2. `node code/table.mjs`, `node code/seats.mjs`: cups, ground, map and the online balls.
3. `python code/export.py`, `python code/sheet.py img/spots-on-maps.jpg`: the files.
4. `node code/match2.mjs 228.9 135.9`: a badge against every hole, spot, cup and seat.
5. `node code/rows.mjs`, `node code/probe.mjs`: the surface checks.
6. `python -B -P code/scan.py`: every use of the mode bit in the golf code.
