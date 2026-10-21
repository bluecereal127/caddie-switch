# Dolphin harness: WSR itself against the app's port

Everything below was measured in Wii Sports Resort (NTSC-U rev 1) running in
Dolphin 2609a, driven by the harness in this folder (README.md): shots
injected through the GDB stub at the game's own decision points, the ball
read from RAM tick by tick or from the game's own look-ahead records. "Port"
is the app's `src/wsrsim.js` `run()`, flown over:

- **app grid**: the line the app itself builds from `public/terrain`
  (`src/model.js` `lineProfile`, one height sample per 2 map px, 3.5-5 yd),
  exactly as `tools/test-rows.mjs` flies a logged shot;
- **KCL**: the same line over the collision triangles themselves
  (`captures/meshes/wsr-kcl-obj`, the highest triangle under each 0.25 yd
  sample; `lib/course.mjs`);
- **flat**: a level fairway (the shape's own ground).

Distances are horizontal yards along the shot line from the ball's start
(1 yd = 9.144 KCL units); "carry" is the first ground contact, "rest" where
the ball stops, "roll" rest minus carry. Raw results: `results/*.json`.

## 1. The first question: hole 10's tee, irons maxed

From hole 10's tee (Classic A; the WSR start, KCL (12.8, 194.95, 1968.5)),
along the game's default line (the start's facing, 2.15 deg east of north),
full power, no spin, calm and with a 4 mph headwind (WSR wind index 2,
direction 0: the air moving south, into the face of the shot):

| club | wind | WSR carry | land vs tee | 1st bounce long / high | WSR rest | WSR roll | port (app grid) carry / rest / roll | port (KCL) carry / rest / roll | port flat carry / rest / roll |
|---|---|---|---|---|---|---|---|---|---|
| 3iron | calm | 198.9 | -10.1 | 13.4 / 5.3 | 213.0 | 14.1 | 198.9 / 212.2 / 13.3 | 198.9 / 212.9 / 14.0 | 189.8 / 211.7 / 21.9 |
| 3iron | 4 mph head | 192.8 | -10.4 | 8.3 / 5.8 | 200.9 | 8.1 | 192.8 / 201.2 / 8.4 | 192.8 / 200.9 / 8.1 | 184.3 / 202.0 / 17.7 |
| 5iron | calm | 169.0 | -11.9 | 6.1 / 5.9 | 174.7 | 5.8 | 168.9 / 174.1 / 5.1 | 168.9 / 174.7 / 5.8 | 159.9 / 175.6 / 15.7 |
| 5iron | 4 mph head | 162.9 | -12.3 | 3.6 / 5.9 | 166.1 | 3.2 | 162.9 / 166.5 / 3.6 | 162.9 / 166.0 / 3.2 | 154.5 / 166.5 / 12.0 |
| 7iron | calm | 140.2 | -12.9 | 11.5 / 4.3 | 152.2 | 12.0 | 140.1 / 152.5 / 12.3 | 140.1 / 151.7 / 11.6 | 130.1 / 145.8 / 15.7 |
| 7iron | 4 mph head | 135.5 | -12.6 | 10.7 / 4.2 | 147.3 | 11.8 | 135.4 / 146.8 / 11.4 | 135.4 / 147.2 / 11.8 | 126.2 / 139.0 / 12.8 |
| 9iron | calm | 107.4 | -11.6 | 9.9 / 3.8 | 118.3 | 10.8 | 107.4 / 118.2 / 10.8 | 107.4 / 118.2 / 10.8 | 99.8 / 109.5 / 9.7 |
| 9iron | 4 mph head | 103.2 | -11.2 | 7.5 / 4.1 | 111.0 | 7.8 | 103.1 / 111.9 / 8.7 | 103.1 / 110.8 / 7.6 | 96.3 / 103.6 / 7.3 |

Residuals, WSR minus port (yd):

| club | wind | carry, app grid | rest, app grid | carry, KCL | rest, KCL |
|---|---|---|---|---|---|
| 3iron | calm | -0.1 | +0.8 | -0.1 | +0.1 |
| 3iron | 4 mph head | +0.0 | -0.2 | +0.0 | +0.1 |
| 5iron | calm | +0.0 | +0.7 | +0.0 | -0.0 |
| 5iron | 4 mph head | +0.0 | -0.3 | +0.0 | +0.1 |
| 7iron | calm | +0.0 | -0.3 | +0.0 | +0.5 |
| 7iron | 4 mph head | +0.1 | +0.5 | +0.1 | +0.1 |
| 9iron | calm | +0.0 | +0.0 | +0.0 | +0.1 |
| 9iron | 4 mph head | +0.0 | -0.8 | +0.0 | +0.3 |

The launch is WSR's club block exactly (2.790 / 2.450 / 2.130 / 1.780 u/tick
at 19.0 / 23.0 / 24.0 / 30.0 deg, P04 and P10), the apex 28.2 / 28.4 / 22.9 /
22.1 yd above the tee as wsr-club-physics.md section 5 has it, and the first
bounce is a 4-6 yd hop (the ball lands 10-13 yd below the tee, at 0.42-0.50
u/tick of rebound). The 4 mph headwind's 2.15 deg of crosswind drifts the
carry 0.25-0.39 yd sideways.

**Answer: WSR itself rolls the irons 6-14 yd off this drop in calm air and
3-12 yd in the 4 mph headwind, and the port rolls them the same to within
0.8 yd over the app's grid (0.5 yd over the KCL).** The port's contact
phase is right on a fast landing from a drop; the decode's level-ground
validation carries over. So the Switch's ground physics (or its iron
launch) differ from WSR's: the logged Switch rows from this tee in the same
4 mph headwind (public/derived.json) go 14-22 yd past WSR:

| club | Switch ended (yd) | WSR rest, 4 mph head (harness) | Switch minus WSR |
|---|---|---|---|
| 3iron (stroke 5) | 222 | 200.9 | +21.1 |
| 5iron (stroke 6) | 188 | 166.1 | +21.9 |
| 7iron (stroke 7) | 161 | 147.3 | +13.7 |
| 9iron (stroke 9) | 127 | 111.0 | +16.0 |

The Switch's aim line shows WSR's nominal carries (P0c + 2 yd), but that line
is a drawn guide of fixed length in WSR (wsr-ground-phase.md 7), not a
measured carry, so the harness cannot say whether the Switch carries its
irons further or rolls them further; it does say the difference is the
Switch's, not the port's. What the app needs is a Switch term for the
irons (section 9).

Determinism: the 3-iron, calm, flown twice from the same savestate gave
bit-identical traces (2,042 ticks); it is also identical, tick for tick, to
an earlier session's flight of the same shot whose trigger fired 11 frames
sooner (the swing's state-1 window ran 1 frame there and 12 here), ending at
the same float (73.07340240478516, 103.22662353515625, 21.604270935058594):
with the power and spins held, the outcome depends on nothing but the
injected values. The game's own look-ahead (the records it writes into the
real ball after the spin hand-off) predicted the real rest exactly on all
eight shots, which is what lets the bulk runs read it instead of tracing.

The ball on the tee sits 0.95 u above the KCL ground (the port starts it
0.5 u above, its radius): a 0.05 yd difference in launch height, worth under
0.1 yd of carry.
