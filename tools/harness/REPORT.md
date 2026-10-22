# Dolphin harness: WSR itself against the app's port

Everything below was measured in Wii Sports Resort (NTSC-U rev 1) running in
Dolphin 2609a, driven by the harness in this folder (README.md): shots
injected through the GDB stub at the game's own decision points, the ball
read from RAM tick by tick or from the game's own look-ahead records. "Port"
is the app's copy of WSR's ball physics, `src/wsrsim.js` `run()` (the putts:
`src/putt.js`), flown over:

- **app grid**: the line the app itself builds from `public/terrain`
  (`src/model.js` `lineProfile`, one height sample per 2 map px, 3.5-5 yd),
  exactly as `tools/test-rows.mjs` flies a logged shot;
- **KCL**: the same line over the collision triangles themselves
  (`captures/meshes/wsr-kcl-obj`, the highest surface under each 0.25 yd
  sample, a wall only when it is no more than 3 yd above the sample before;
  `lib/course.mjs`);
- **flat**: a level fairway (the shape's own ground).

Distances are horizontal yards along the shot line from the ball's start
(1 yd = 9.144 KCL units); "carry" is the first ground contact, "rest" where
the ball stops, "roll" rest minus carry. Raw results: `results/*.json`; the
tables between the `begin` / `end` markers are written by
`node tools/harness/report.mjs --write`, which flies the port again from each
row's inputs (so they show the code as it stands).

## Summary

- **The first question** (section 1): WSR rolls hole 10's maxed irons 6-14 yd
  off the tee's drop in calm air and 3-12 yd in a 4 mph headwind, and the
  port rolls them the same to 0.8 yd. The Switch's longer iron rows are the
  Switch's, not the port's.
- **The port is WSR wherever the ball flies** (sections 2-3): over 450 clean
  shots from all 21 tees, every club at 1-4 bars, carry within +0.2 / 0.7 yd
  (mean / rms) and rest within +0.2 / 2.1 yd over the KCL line; wind in all
  8 directions at 2-30 mph and, for every club at 1-4 bars, cross, head and
  tail at 10 and 30 mph: the sideways drift at carry within 0.0-0.3 yd at 10
  mph and the stop's change within 1-2 yd. What the port cannot follow is the
  ground off its line: it flies a level-across profile, so a ball that lands
  or rolls off the line onto a cross-slope (wind, a curve, a slope at the
  landing) ends a few yards away from WSR's.
- **The app's terrain grid** costs 0.7 yd rms of rest (2.8 against 2.1 over
  the KCL; 27 shots more than 3 yd off against 11), mostly at banks and in
  sub-grid relief; a finer grid read the same way does not help (1 px: 31,
  0.5 px: 42 beyond 3 yd), so the fix would be the triangles, not resolution.
- **The app's wind model is the biggest error found** (section 3): it scales
  the drift and the stop's wind change linearly with mph and with bars
  (`c x mph x bars`, `stop x (1 + h x mph)`). WSR's wind is index^0.737 (30
  mph does 2.25 times what 10 mph does, not 3) and acts on the air time, so
  a 1-bar shot drifts 7-8 % of the full-power drift at carry, not 25 %. The
  app over-aims part-power shots in a crosswind by 2-4 times and over-plays
  30 mph by a third. Recommendation 1: fly the port with the wind.
- **Trees** (section 4): 107 of 108 shots at six trees agree with WSR's own
  tree check, the contact point within 0.5 yd. **Changed in the app**:
  `src/trees.js` also checks the first 5 yd of the bounce, where WSR's ball
  hit three trunks (four shots) the old check missed; the longer roll is not checked (it
  drifts off the line more than a trunk's width).
- **Putts and the cup** (section 5): the app's roll stops within 0.01-0.05 yd
  of WSR's on both gentle test greens (its line is 0.08 yd off on an 8 deg
  cup); wind has no effect at all on the green (bit for bit) and 0.02-0.04 yd
  from the fringe; WSR's capture window narrows with the ball's speed at the
  cup (0.147 yd at 0.9 yd/s, 0.10 at 2.7, 0.03 at 4.0) the same way on every
  green, slope (1.2-8.1 deg) and approach tested. **Changed in the app**:
  src/putt.js holds that window, and reads the aim whose holing strengths
  span the widest range, at its middle (the putt card shows the range): in
  WSR those reads drop across up to +-0.32 bars of strength error where the
  old softest-putt reads missed every under-hit.
- **The hidden pin-power assist** (section 6) acts exactly as decoded on all
  49 swings, including a holing window not in the decode before, and moves a
  partial approach up to 23.5 yd of carry. **Backspin and the red zone** (section 7):
  the port's backspin rolls within 0.9 yd of WSR's on 32 shots; the red
  zone's power, curve size and window match the formulas on 20 swings, the
  in-air curve within 0.1-2 yd.
- **Harness** (README.md): every tee by genuine play, 19 Dolphins at once, bit-identical replays, and the decodes it needed
  (tools/research/wsr-harness-decodes.md).

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

## 2. Every club from every tee (2a)

From each of the 21 tees (the WSR start, reached by playing the courses
through with holed-out putts; `make-states.mjs`), along the game's own
default line (the start's facing), calm, no spin, the power held so the
pin-power assist cannot act: 7 clubs at 1, 2, 3 and 4 bars, 588 shots
(`run-sweep.mjs`, `results/sweep-*.json`). WSR's carry and rest are the
look-ahead's records in the real ball; 84 shots were also run to the real
ball's own rest, and the two agree exactly on all 68 whose records were
written (the 16 others ended in water or off the course, where the
look-ahead writes no landing or rest record and the game drops the ball:
hole 4's three at 27 yd are its drop spot).

"Clean" = WSR's ball rested on fairway, rough, green, fringe, bunker or tee
with no penalty: 450 shots. Residuals are WSR minus the port (mean / rms /
worst, yd).

<!-- begin:sweep -->
| hole | shots | clean | carry: WSR − port, KCL (mean / rms / worst) | rest: WSR − port, KCL | carry: WSR − port, app grid | rest: WSR − port, app grid | rest: WSR − port flat |
|---|---|---|---|---|---|---|---|
| 1 | 28 | 15 | +0.2 / 0.4 / +1.1 | +0.5 / 1.0 / +3.0 | +0.2 / 0.4 / +1.1 | +0.5 / 1.9 / -4.5 | +13.8 / 14.7 / +21.3 |
| 2 | 28 | 21 | +0.3 / 0.4 / +1.0 | +0.1 / 1.0 / -3.6 | +0.2 / 0.4 / +1.0 | +0.2 / 1.6 / +3.6 | +8.9 / 12.9 / +26.4 |
| 3 | 28 | 28 | +0.2 / 0.4 / +1.0 | +0.2 / 0.6 / +1.2 | +0.2 / 0.4 / +1.0 | -0.2 / 1.3 / -5.7 | +6.9 / 7.6 / +15.4 |
| 4 | 28 | 10 | +0.0 / 0.1 / +0.3 | +0.4 / 1.1 / +2.9 | +0.0 / 0.1 / +0.3 | +0.1 / 2.2 / -5.2 | -10.9 / 14.2 / -30.5 |
| 5 | 28 | 28 | +0.3 / 0.4 / +1.1 | +0.4 / 0.6 / +1.8 | +0.2 / 0.4 / +1.1 | +0.6 / 1.4 / +6.0 | +8.9 / 10.0 / +20.2 |
| 6 | 28 | 28 | +0.3 / 0.4 / +1.1 | +0.2 / 0.5 / +1.2 | +0.3 / 0.4 / +1.2 | +0.2 / 0.8 / +1.8 | +5.6 / 6.7 / +14.0 |
| 7 | 28 | 28 | -0.2 / 2.3 / -12.1 | -0.8 / 6.2 / -32.7 | -0.2 / 2.3 / -12.0 | -0.7 / 6.1 / -32.2 | +9.0 / 11.4 / -19.3 |
| 8 | 28 | 5 | +0.2 / 0.2 / +0.4 | +0.5 / 0.5 / +0.8 | +0.2 / 0.2 / +0.4 | -0.4 / 1.6 / -3.2 | +2.5 / 7.0 / +11.2 |
| 9 | 28 | 28 | +0.2 / 0.4 / +1.1 | +0.3 / 0.6 / +1.2 | +0.2 / 0.4 / +1.2 | +0.7 / 1.7 / +5.9 | -2.2 / 8.0 / -16.5 |
| 10 | 28 | 28 | +0.2 / 0.4 / +1.1 | +0.3 / 0.7 / -1.4 | +0.2 / 0.4 / +1.0 | +0.4 / 1.2 / -4.0 | +5.7 / 7.5 / +15.3 |
| 11 | 28 | 17 | +0.2 / 0.3 / +0.6 | -0.0 / 1.5 / -5.3 | +0.1 / 0.3 / +0.7 | +0.3 / 5.4 / +18.2 | -2.5 / 10.3 / -38.1 |
| 12 | 28 | 28 | +0.2 / 0.3 / +0.9 | +0.1 / 0.9 / -4.2 | +0.2 / 0.4 / +0.9 | +0.0 / 1.5 / -4.5 | -2.1 / 3.4 / -9.8 |
| 13 | 28 | 12 | -0.3 / 1.7 / -5.9 | -1.8 / 6.5 / -22.5 | -0.3 / 1.7 / -5.9 | -1.6 / 5.2 / -16.8 | -1.0 / 9.8 / -17.7 |
| 14 | 28 | 28 | +0.2 / 0.4 / +1.1 | +0.4 / 0.8 / -2.1 | +0.2 / 0.4 / +1.1 | +0.3 / 1.0 / +2.6 | +1.4 / 5.4 / -14.3 |
| 15 | 28 | 12 | +0.1 / 0.3 / +0.6 | +0.1 / 0.4 / +0.7 | +0.1 / 0.3 / +0.7 | +0.2 / 0.5 / +0.9 | -5.0 / 7.5 / -13.3 |
| 16 | 28 | 28 | +0.2 / 0.3 / +0.9 | +0.3 / 0.5 / +1.5 | +0.2 / 0.3 / +0.8 | +0.5 / 1.2 / +3.9 | -4.6 / 6.5 / -16.1 |
| 17 | 28 | 14 | +0.1 / 0.3 / +0.6 | +0.1 / 1.0 / -3.3 | +0.2 / 0.3 / +0.6 | -0.4 / 2.0 / -5.1 | -11.0 / 13.8 / -28.4 |
| 18 | 28 | 18 | +0.3 / 0.4 / +1.2 | +0.7 / 1.6 / +6.2 | +0.2 / 0.5 / +1.2 | +1.1 / 7.4 / +28.5 | +5.7 / 8.6 / +16.4 |
| 19 | 28 | 18 | +0.3 / 0.5 / +1.1 | +0.7 / 0.9 / +1.7 | +0.3 / 0.4 / +1.0 | +0.9 / 1.2 / +2.1 | +11.6 / 12.5 / +18.3 |
| 20 | 28 | 28 | +0.2 / 0.3 / +0.7 | +0.5 / 1.0 / +3.6 | +0.2 / 0.3 / +0.7 | +0.5 / 1.8 / +7.8 | -6.5 / 7.5 / -13.2 |
| 21 | 28 | 28 | +0.3 / 0.4 / +1.1 | +0.5 / 0.8 / +3.1 | +0.3 / 0.4 / +1.2 | +0.6 / 1.2 / +4.7 | +19.5 / 20.1 / +28.6 |
| all | | 450 | +0.2 / 0.7 / -12.1 | +0.2 / 2.1 / -32.7 | +0.2 / 0.7 / -12.0 | +0.2 / 2.8 / -32.2 | +3.3 / 10.3 / -38.1 |

By club (clean shots, all holes):

| club | shots | carry, KCL | rest, KCL | carry, app grid | rest, app grid |
|---|---|---|---|---|---|
| driver | 61 | -0.0 / 0.1 / -0.3 | +0.1 / 0.9 / -4.2 | +0.0 / 0.1 / -0.3 | +0.2 / 1.3 / +4.7 |
| spoon | 62 | +0.1 / 1.6 / -12.1 | -0.1 / 4.4 / -32.7 | +0.1 / 1.6 / -12.0 | +0.3 / 6.0 / -32.2 |
| 3iron | 66 | +0.4 / 1.0 / -5.9 | +0.3 / 2.9 / -22.5 | +0.4 / 1.0 / -5.9 | +0.2 / 2.5 / -16.8 |
| 5iron | 64 | +0.0 / 0.1 / +0.1 | +0.1 / 0.4 / +1.6 | +0.0 / 0.1 / +0.1 | -0.1 / 2.0 / -9.7 |
| 7iron | 63 | +0.4 / 0.5 / +0.8 | +0.5 / 0.7 / +3.2 | +0.4 / 0.5 / +0.8 | +0.5 / 2.7 / +18.2 |
| 9iron | 64 | +0.3 / 0.3 / +0.6 | +0.4 / 0.7 / +3.6 | +0.3 / 0.3 / +0.6 | +0.5 / 1.2 / +7.8 |
| wedge | 70 | +0.0 / 0.0 / +0.1 | +0.1 / 0.3 / +1.6 | +0.0 / 0.0 / +0.1 | +0.0 / 0.7 / -4.0 |

Clean shots with a rest more than 3 yd off the port over the KCL line:

| hole | club | power | WSR carry / rest | port KCL carry / rest | port app carry / rest | rest lie | rest across (yd) |
|---|---|---|---|---|---|---|---|
| 2 | spoon | 0.75 | 191.4 / 197.9 | 191.2 / 201.5 | 191.3 / 200.8 | rough | -1.9 |
| 7 | spoon | 1 | 229.4 / 233.4 | 241.5 / 266.1 | 241.4 / 265.5 | fairway | -0.6 |
| 11 | spoon | 0.5 | 120.8 / 122.4 | 120.5 / 127.7 | 120.5 / 133.7 | fairway | -0.1 |
| 11 | 7iron | 0.5 | 70.1 / 81.7 | 69.7 / 78.4 | 70.5 / 63.4 | fairway | -0.5 |
| 12 | driver | 0.75 | 187.6 / 223.2 | 187.6 / 227.4 | 187.6 / 227.7 | fairway | -0.2 |
| 13 | 3iron | 1 | 193.5 / 194.0 | 199.3 / 216.5 | 199.4 / 210.8 | rough | -0.7 |
| 17 | spoon | 1 | 181.2 / 232.7 | 181.4 / 236.0 | 181.4 / 237.4 | fairway | -4.5 |
| 18 | spoon | 0.75 | 184.4 / 200.4 | 184.2 / 194.2 | 185.4 / 172.0 | fairway | 8.7 |
| 20 | 3iron | 0.25 | 48.3 / 66.9 | 47.6 / 63.3 | 48.0 / 63.8 | rough | 9.1 |
| 20 | 9iron | 0.5 | 51.4 / 63.1 | 51.0 / 59.5 | 51.0 / 55.3 | rough | 8.0 |
| 21 | driver | 0.75 | 237.1 / 261.6 | 237.0 / 258.5 | 237.0 / 256.9 | fairway | 1.1 |

Shots that did not end cleanly (penalty, outer ground, water, valley). A ball that ends in water or off the course leaves the look-ahead's landing or rest record unwritten (frame -1; the position then is an earlier shot's), shown as –:

| hole | club | power | WSR carry / rest | rest lie | hazard | port KCL carry / rest | port KCL+ rest |
|---|---|---|---|---|---|---|---|
| 1 | driver | 0.25 | – / – | – | – | 92.3 / 119.1 | 119.1 |
| 1 | driver | 0.5 | 157.4 / 159.8 | – | water | 153.1 / 189.5 | 189.5 |
| 1 | spoon | 0.25 | 83.4 / 104.8 | – | water | 82.7 / 106.3 | 106.3 |
| 1 | spoon | 0.5 | 144.2 / 146.5 | – | water | 139.8 / 163.0 | 162.9 |
| 1 | 3iron | 0.5 | 118.5 / 120.3 | – | water | 115.1 / 131.1 | 131.1 |
| 1 | 3iron | 0.75 | 163.2 / 158.7 | – | water | 161.4 / 178.3 | 178.3 |
| 1 | 5iron | 0.5 | 99.2 / 100.7 | – | water | 96.8 / 107.4 | 107.4 |
| 1 | 5iron | 0.75 | – / – | – | – | 136.0 / 146.4 | 146.4 |
| 1 | 7iron | 0.5 | 80.5 / 96.2 | – | water | 80.0 / 94.0 | 94.0 |
| 1 | 7iron | 0.75 | 115.4 / 116.9 | – | water | 112.9 / 122.2 | 122.2 |
| 1 | 7iron | 1 | 145.2 / 146.7 | – | water | 143.1 / 151.4 | 151.4 |
| 1 | 9iron | 0.75 | 87.1 / 93.6 | – | water | 87.0 / 92.6 | 92.6 |
| 1 | 9iron | 1 | 112.3 / 113.6 | – | water | 110.6 / 114.9 | 114.9 |
| 2 | driver | 0.75 | 206.8 / 219.4 | outer | outer ground | 206.9 / 220.5 | 218.9 |
| 2 | driver | 1 | 255.2 / 260.9 | outer | outer ground | 255.2 / 276.6 | 260.9 |
| 2 | spoon | 1 | 234.5 / 238.1 | outer | outer ground | 234.5 / 251.5 | 237.9 |
| 2 | 7iron | 0.25 | 39.0 / 47.5 | – | water | 38.5 / 38.7 | 41.7 |
| 2 | 9iron | 0.25 | 35.0 / 36.4 | – | water | 34.8 / 23.4 | 23.1 |
| 2 | wedge | 0.25 | 14.2 / 26.8 | – | water | 14.0 / 29.2 | 28.7 |
| 2 | wedge | 0.5 | 34.5 / 34.9 | – | water | 34.5 / 22.8 | 23.2 |
| 4 | driver | 0.25 | – / 27.0 | – | water | 89.3 / 118.2 | 118.2 |
| 4 | spoon | 0.25 | 81.8 / 83.9 | – | water | 81.1 / 105.3 | 105.3 |
| 4 | spoon | 0.5 | 128.1 / 136.2 | – | water | 127.9 / 133.6 | 137.3 |
| 4 | 3iron | 0.25 | 64.7 / 66.3 | – | water | 63.9 / 70.2 | 70.2 |
| 4 | 3iron | 0.5 | 113.6 / 115.5 | – | water | 112.9 / 115.1 | 114.7 |
| 4 | 5iron | 0.25 | 53.5 / 54.8 | – | water | 53.5 / 61.2 | 61.2 |
| 4 | 5iron | 0.5 | 95.1 / 96.7 | – | water | 95.0 / 106.6 | 106.6 |
| 4 | 5iron | 0.75 | – / 27.0 | – | water | 129.1 / 127.1 | 133.1 |
| 4 | 7iron | 0.25 | 45.6 / 46.8 | – | water | 45.0 / 50.6 | 50.6 |
| 4 | 7iron | 0.5 | 79.5 / 81.0 | – | water | 77.9 / 93.4 | 93.6 |
| 4 | 7iron | 0.75 | 111.6 / 113.1 | – | water | 111.3 / 118.0 | 118.0 |
| 4 | 9iron | 0.25 | 29.3 / 40.6 | – | water | 28.7 / 39.5 | 39.5 |
| 4 | 9iron | 0.5 | – / 27.1 | – | water | 61.4 / 66.4 | 66.4 |
| 4 | 9iron | 0.75 | 86.4 / 87.6 | – | water | 86.2 / 91.7 | 91.7 |
| 4 | 9iron | 1 | 109.4 / 110.7 | – | water | 109.4 / 114.3 | 114.3 |
| 4 | wedge | 0.5 | 30.1 / 38.0 | – | water | 30.1 / 43.5 | 43.5 |
| 4 | wedge | 0.75 | 48.8 / 49.6 | – | water | 48.7 / 48.8 | 48.8 |
| 4 | wedge | 1 | 62.7 / 63.7 | – | water | 62.8 / 63.0 | 63.0 |
| 8 | driver | 0.25 | – / – | – | water | 100.1 / 121.6 | 121.6 |
| 8 | driver | 0.5 | 151.3 / 193.4 | – | water | 151.3 / 192.8 | 192.8 |
| 8 | driver | 0.75 | 211.4 / 201.7 | – | water | 211.4 / 190.0 | 189.5 |
| 8 | driver | 1 | 266.9 / 269.1 | – | water | 267.0 / 267.5 | 267.7 |
| 8 | spoon | 0.25 | 91.6 / 93.5 | – | water | 90.9 / 108.7 | 108.7 |
| 8 | spoon | 0.75 | 198.6 / 200.8 | – | water | 198.4 / 206.8 | 206.8 |
| 8 | spoon | 1 | – / – | – | water | 231.9 / 257.4 | 257.4 |
| 8 | 3iron | 0.25 | 71.7 / 73.1 | – | water | 70.8 / 78.7 | 78.7 |
| 8 | 3iron | 0.5 | 121.3 / 123.0 | – | water | 120.6 / 133.3 | 133.3 |
| 8 | 3iron | 1 | 209.0 / 210.7 | – | water | 209.0 / 189.4 | 189.4 |
| 8 | 5iron | 0.25 | 59.3 / 60.5 | – | off the KCL | 59.3 / 64.0 | 64.0 |
| 8 | 5iron | 0.5 | 101.5 / 103.0 | – | water | 101.5 / 109.5 | 109.5 |
| 8 | 5iron | 0.75 | – / – | – | water | 137.7 / 124.8 | 124.8 |
| 8 | 7iron | 0.25 | 50.9 / 52.0 | – | off the KCL | 50.2 / 53.4 | 53.4 |
| 8 | 7iron | 0.5 | 85.7 / 87.0 | – | water | 85.1 / 91.6 | 91.6 |
| 8 | 7iron | 0.75 | 117.5 / 119.0 | – | water | 117.3 / 124.5 | 124.5 |
| 8 | 9iron | 0.25 | 30.1 / 45.5 | – | off the KCL | 29.6 / 45.5 | 45.6 |
| 8 | 9iron | 0.5 | – / – | – | water | 66.2 / 68.8 | 68.8 |
| 8 | 9iron | 0.75 | 91.2 / 92.4 | – | water | 91.0 / 94.2 | 94.2 |
| 8 | 9iron | 1 | 114.0 / 115.2 | – | water | 113.9 / 116.4 | 116.4 |
| 8 | wedge | 0.5 | 30.6 / 45.0 | – | off the KCL | 30.6 / 49.4 | 47.6 |
| 8 | wedge | 0.75 | 52.0 / 52.8 | – | off the KCL | 52.0 / 52.0 | 52.0 |
| 8 | wedge | 1 | 66.2 / 67.0 | – | water | 66.2 / 66.2 | 66.2 |
| 11 | driver | 0.75 | 188.7 / 212.2 | outer | outer ground | 188.6 / 218.0 | 212.1 |
| 11 | driver | 1 | 236.3 / 246.2 | outer | outer ground | 236.4 / 262.9 | 246.1 |
| 11 | spoon | 0.25 | 68.0 / 58.4 | – | water | 68.0 / 51.8 | 51.8 |
| 11 | spoon | 1 | 219.3 / 225.4 | outer | outer ground | 219.4 / 238.3 | 225.4 |
| 11 | 3iron | 0.25 | 59.3 / 61.0 | – | water | 58.5 / 64.4 | 64.4 |
| 11 | 3iron | 1 | 192.5 / 201.2 | outer | outer ground | 192.5 / 201.4 | 201.1 |
| 11 | 5iron | 0.25 | 44.7 / 56.4 | – | water | 44.5 / 59.4 | 59.4 |
| 11 | 7iron | 0.25 | 35.6 / 50.3 | – | water | 34.9 / 50.5 | 50.7 |
| 11 | 9iron | 0.5 | – / – | – | – | 57.7 / 64.6 | 64.6 |
| 11 | wedge | 0.75 | 44.0 / 55.3 | – | water | 43.9 / 61.4 | 62.8 |
| 11 | wedge | 1 | 60.3 / 61.3 | – | water | 60.3 / 62.3 | 62.3 |
| 13 | driver | 0.25 | 83.0 / 77.3 | outer | outer ground | 83.1 / 68.2 | 77.3 |
| 13 | driver | 0.75 | 195.2 / 204.4 | – | off the KCL | 200.9 / 250.3 | 250.3 |
| 13 | driver | 1 | 306.0 / 306.0 | – | off the KCL | 271.3 / 289.1 | 289.1 |
| 13 | spoon | 0.25 | 79.1 / 74.8 | outer | outer ground | 78.7 / 67.1 | 74.4 |
| 13 | spoon | 0.75 | 181.7 / 233.9 | – | off the KCL | 181.4 / 222.1 | 222.1 |
| 13 | spoon | 1 | – / – | – | outer ground | 248.3 / 262.8 | 262.8 |
| 13 | 3iron | 0.25 | 65.7 / 67.1 | outer | outer ground | 64.9 / 70.3 | 66.1 |
| 13 | 5iron | 0.25 | 53.0 / 63.4 | outer | outer ground | 52.9 / 71.8 | 62.7 |
| 13 | 7iron | 0.25 | 42.1 / 54.4 | outer | outer ground | 41.3 / 69.2 | 53.8 |
| 13 | 7iron | 0.5 | 78.2 / 75.2 | outer | outer ground | 77.9 / 67.5 | 74.6 |
| 13 | 9iron | 0.25 | 30.2 / 42.3 | outer | outer ground | 29.6 / 55.3 | 41.5 |
| 13 | 9iron | 0.5 | 62.4 / 62.5 | outer | outer ground | 62.1 / 67.2 | 62.1 |
| 13 | 9iron | 0.75 | 83.5 / 77.8 | outer | outer ground | 83.4 / 67.8 | 77.6 |
| 13 | wedge | 0.5 | 30.7 / 39.7 | outer | outer ground | 30.7 / 50.9 | 39.6 |
| 13 | wedge | 0.75 | 47.6 / 52.6 | outer | outer ground | 47.5 / 65.8 | 52.5 |
| 13 | wedge | 1 | 63.3 / 63.3 | outer | outer ground | 63.2 / 63.1 | 63.2 |
| 15 | driver | 0.25 | 74.3 / 76.9 | bunker | water | 74.2 / 110.0 | 110.0 |
| 15 | driver | 0.5 | 127.5 / 112.0 | bunker | water | 127.6 / 102.8 | 102.8 |
| 15 | spoon | 0.25 | 68.3 / 70.7 | bunker | water | 67.7 / 98.0 | 98.0 |
| 15 | spoon | 0.5 | 120.1 / 122.9 | bunker | water | 119.7 / 122.4 | 119.9 |
| 15 | 3iron | 0.25 | 52.4 / 66.0 | bunker | water | 51.5 / 69.8 | 69.8 |
| 15 | 3iron | 0.5 | 102.6 / 104.8 | bunker | water | 102.0 / 122.4 | 122.4 |
| 15 | 5iron | 0.25 | 43.1 / 57.7 | bunker | water | 43.0 / 56.3 | 60.2 |
| 15 | 5iron | 0.5 | 86.5 / 88.3 | bunker | water | 86.4 / 100.6 | 100.6 |
| 15 | 5iron | 0.75 | 125.3 / 125.2 | bunker | water | 125.3 / 133.0 | 133.4 |
| 15 | 7iron | 0.5 | 71.8 / 73.5 | bunker | water | 71.3 / 83.2 | 83.2 |
| 15 | 7iron | 0.75 | 103.2 / 105.0 | bunker | water | 103.0 / 114.3 | 114.3 |
| 15 | 7iron | 1 | 130.2 / 123.3 | bunker | water | 130.2 / 133.4 | 136.7 |
| 15 | 9iron | 0.5 | 53.9 / 64.2 | bunker | water | 53.5 / 71.6 | 73.6 |
| 15 | 9iron | 0.75 | 80.3 / 81.7 | bunker | water | 80.1 / 86.6 | 86.6 |
| 15 | 9iron | 1 | 103.3 / 104.7 | bunker | water | 103.3 / 107.8 | 107.8 |
| 15 | wedge | 1 | 58.5 / 63.1 | bunker | water | 58.5 / 75.7 | 78.1 |
| 17 | driver | 0.25 | – / – | – | water | 47.1 / 78.8 | 79.0 |
| 17 | driver | 0.5 | 88.0 / 152.0 | – | water | 88.2 / 149.0 | 149.0 |
| 17 | driver | 0.75 | 152.4 / 141.0 | – | water | 152.6 / 130.3 | 132.9 |
| 17 | spoon | 0.25 | 45.7 / 83.5 | – | water | 45.3 / 80.0 | 79.0 |
| 17 | spoon | 0.5 | 86.4 / 104.5 | – | water | 86.5 / 114.8 | 120.3 |
| 17 | spoon | 0.75 | 141.1 / 162.6 | – | water | 141.1 / 167.4 | 169.6 |
| 17 | 3iron | 0.5 | 85.7 / 89.0 | – | water | 85.7 / 80.4 | 79.0 |
| 17 | 3iron | 0.75 | 128.9 / 152.2 | – | water | 128.5 / 149.0 | 149.1 |
| 17 | 5iron | 0.5 | 70.5 / 85.4 | – | water | 70.4 / 79.2 | 79.0 |
| 17 | 5iron | 0.75 | – / – | – | water | 110.7 / 127.9 | 127.9 |
| 17 | 5iron | 1 | 151.8 / 157.1 | – | water | 151.8 / 149.1 | 149.0 |
| 17 | 7iron | 0.75 | 89.0 / 107.6 | – | water | 88.7 / 100.6 | 103.7 |
| 17 | 7iron | 1 | 120.4 / 139.3 | – | water | 120.4 / 134.7 | 134.7 |
| 17 | 9iron | 0.75 | 69.7 / 82.0 | – | water | 69.6 / 79.4 | 79.0 |
| 18 | driver | 0.25 | – / – | – | water | 87.1 / 114.3 | 115.3 |
| 18 | driver | 0.5 | 151.9 / 154.4 | – | water | 151.8 / 170.1 | 170.1 |
| 18 | spoon | 0.5 | 139.1 / 141.5 | – | water | 138.6 / 167.7 | 167.7 |
| 18 | 3iron | 0.5 | 114.8 / 116.7 | – | water | 114.2 / 130.7 | 130.7 |
| 18 | 3iron | 0.75 | 160.9 / 162.8 | – | water | 160.6 / 171.4 | 171.4 |
| 18 | 5iron | 0.75 | – / – | – | water | 135.3 / 146.1 | 146.1 |
| 18 | 5iron | 1 | 171.9 / 173.5 | – | water | 171.9 / 177.9 | 177.9 |
| 18 | 7iron | 0.75 | 112.5 / 114.1 | – | water | 112.3 / 121.9 | 121.9 |
| 18 | 7iron | 1 | 142.5 / 144.0 | – | water | 142.5 / 151.1 | 151.1 |
| 18 | 9iron | 1 | 110.1 / 111.4 | – | water | 110.1 / 114.6 | 114.6 |
| 19 | driver | 0.5 | 157.1 / 159.1 | bunker | water | 157.1 / 186.0 | 186.0 |
| 19 | driver | 0.75 | 211.6 / 213.8 | bunker | water | 211.6 / 235.4 | 235.4 |
| 19 | spoon | 0.5 | 138.4 / 164.5 | bunker | water | 137.9 / 168.2 | 168.2 |
| 19 | spoon | 0.75 | 194.7 / 196.5 | bunker | water | 194.5 / 216.2 | 216.2 |
| 19 | spoon | 1 | 237.8 / 220.5 | bunker | water | 237.9 / 217.8 | 217.8 |
| 19 | 3iron | 0.75 | 164.1 / 165.5 | bunker | water | 163.8 / 176.6 | 176.6 |
| 19 | 3iron | 1 | 206.0 / 207.4 | bunker | water | 206.0 / 213.1 | 213.1 |
| 19 | 5iron | 0.75 | – / 140.0 | – | water | 134.9 / 148.4 | 148.4 |
| 19 | 5iron | 1 | 174.3 / 175.4 | bunker | water | 174.2 / 180.9 | 180.9 |
| 19 | 7iron | 1 | 142.2 / 149.3 | bunker | water | 142.2 / 152.8 | 152.8 |

Shots resting on outer ground (19), rest: WSR − port over the KCL as the app rolls it (outer = fairway): -5.2 / 10.3 / -16.7; with WSR's outer / wall constants: +0.3 / 0.4 / +0.9 (mean / rms / worst).
<!-- end:sweep -->

Reading the tables:

- **Carry**: the port lands where WSR lands, +0.2 / 0.7 yd over the KCL line
  and the same over the app's grid; every club but the spoon and 3-iron to
  0.5 yd rms, and those two only because of the tree shots below.
- **Rest over the KCL line**: +0.2 / 2.1 yd. The 11 shots beyond 3 yd are
  trees (hole 7's full spoon into t7-18's canopy at 206 yd, which the app's
  tree check also predicts, 206.5; hole 13's full 3-iron 172 ticks in a
  broadleaf canopy at 181.5 yd), five balls that rolled sideways down a
  cross-slope the level-across line does not have (holes 2, 17, 18 and 20
  twice: 1.9-9.1 yd across at rest), and four that end 3.1-5.3 yd off along
  the line itself (hole 11's spoon and 7-iron at 2 bars, hole 12's and hole
  21's drivers at 3), where the cause was not traced.
- **Rest over the app's grid**: +0.2 / 2.8 yd, 27 shots beyond 3 yd. A grid
  sampled from the KCL at the app's own 2 px reproduces it (27 beyond 3 yd,
  2.77 rms), so it is the grid; but finer grids read the app's way are no
  better (1 px: 31 beyond 3 yd, 2.84 rms; 0.5 px: 42, 3.07), and most of the
  extra misses cross no wall at all: 3-10 yd roll differences from relief
  the bilinear grid does not carry. Hole 11's 7-iron at 2 bars (WSR 81.7,
  the KCL line 78.4, the app's grid 63.4) and hole 18's spoon at 3 bars
  (200.4 / 194.2 / 172.0) are banks: the KCL line climbs the bank's steep
  face, the grid smears it into a slope at any resolution.
- **Flat**: +3.3 / 10.3 yd; the terrain matters on every hole (hole 21's tee
  drop +19.5 yd mean).
- **Outer ground**: 19 rests there. The app rolls outer ground and walls as
  fairway: -5.2 / 10.3 yd over the KCL line, against +0.3 / 0.4 with WSR's
  own outer and wall constants (attr 4: A 0.7, B 0.3; 12: A 0.3, B 0.5).
  Over the app's grid the same constants give 12.8 -> 8.9 yd rms on those
  rests and make 4 clean hole 20 shots worse (the grid's 2 px class cells put
  wall class on lines whose ball meets none), and a ball at rest on outer
  ground is out of bounds anyway, so the app was not changed (section 9).

## 3. Wind (2b)

### 3.1 Full power, every direction

Hole 10's tee, full power, WSR's wind written for each shot: 4 clubs, 5
speeds (2, 6, 10, 20, 30 mph), all 8 directions, 160 shots
(`run-wind.mjs`, `results/wind-h10.json`). The port flies the KCL line with
the same wind (relative angle from the shot's own line).

<!-- begin:wind -->
Hole 10, 160 shots at full power along the default line (bearing 2.1 deg).

| club | wind (mph) | carry: WSR − port (mean / rms / worst) | sideways at carry: WSR − port | rest: WSR − port | WSR sideways at carry, by WSR direction 0-7 |
|---|---|---|---|---|---|
| driver | 2 | -0.2 / 0.4 / -0.7 | -0.0 / 0.0 / -0.1 | +0.5 / 1.3 / +3.4 | 0.2 3.5 4.7 3.2 -0.2 -3.5 -4.8 -3.3 |
| driver | 6 | -0.5 / 0.8 / -1.7 | -0.1 / 0.2 / -0.3 | +0.1 / 0.8 / -1.7 | 0.4 7.8 10.5 7.2 -0.4 -7.9 -10.8 -7.4 |
| driver | 10 | -0.8 / 1.3 / -2.6 | -0.1 / 0.3 / -0.6 | -0.7 / 3.3 / -6.7 | 0.6 11.3 15.2 10.4 -0.6 -11.5 -15.7 -10.8 |
| driver | 20 | -1.3 / 2.1 / -4.2 | -0.3 / 0.7 / -1.5 | -2.1 / 5.4 / -10.1 | 1.0 18.6 24.8 17.1 -1.0 -19.1 -26.0 -17.9 |
| driver | 30 | -1.5 / 2.8 / -5.2 | -0.6 / 1.1 / -2.5 | -6.2 / 9.6 / -18.0 | 1.3 24.9 32.9 22.8 -1.3 -25.9 -35.0 -24.4 |
| 3iron | 2 | -0.1 / 0.1 / -0.2 | -0.0 / 0.0 / -0.1 | -1.0 / 1.6 / -3.4 | 0.2 4.4 6.0 4.1 -0.2 -4.4 -6.0 -4.1 |
| 3iron | 6 | -0.1 / 0.3 / -0.5 | -0.0 / 0.1 / -0.2 | -1.8 / 2.6 / -4.6 | 0.5 10.0 13.4 9.1 -0.5 -9.8 -13.6 -9.4 |
| 3iron | 10 | -0.1 / 0.5 / -0.9 | -0.1 / 0.2 / -0.3 | -3.6 / 5.6 / -13.2 | 0.8 14.7 19.5 13.1 -0.7 -14.3 -19.9 -13.8 |
| 3iron | 20 | -0.1 / 0.8 / -1.8 | -0.2 / 0.3 / -0.6 | -6.7 / 9.5 / -20.6 | 1.3 24.7 32.1 21.3 -1.2 -23.7 -32.9 -23.5 |
| 3iron | 30 | -0.6 / 1.1 / -2.5 | -0.2 / 0.6 / -1.2 | -5.7 / 7.7 / -13.8 | 1.8 33.6 42.6 28.3 -1.6 -31.2 -43.2 -31.6 |
| 7iron | 2 | +0.0 / 0.1 / +0.1 | +0.0 / 0.0 / +0.0 | +0.3 / 0.6 / +1.4 | 0.2 3.2 4.4 3.0 -0.2 -3.2 -4.4 -3.0 |
| 7iron | 6 | +0.0 / 0.1 / -0.2 | +0.0 / 0.0 / +0.1 | +0.3 / 1.0 / +2.3 | 0.4 7.3 9.9 6.7 -0.4 -7.2 -9.8 -6.8 |
| 7iron | 10 | +0.0 / 0.1 / -0.2 | +0.0 / 0.1 / +0.1 | +0.4 / 1.0 / +2.1 | 0.6 10.7 14.4 9.7 -0.5 -10.4 -14.3 -9.9 |
| 7iron | 20 | +0.0 / 0.2 / +0.4 | +0.1 / 0.1 / +0.3 | +0.9 / 1.8 / +4.2 | 0.9 17.9 23.8 15.9 -0.9 -17.1 -23.6 -16.6 |
| 7iron | 30 | -0.0 / 0.2 / +0.4 | +0.1 / 0.2 / +0.3 | +0.8 / 1.9 / +4.8 | 1.3 24.2 31.9 21.2 -1.2 -22.8 -31.5 -22.4 |
| wedge | 2 | +0.0 / 0.1 / +0.1 | -0.0 / 0.0 / -0.0 | +0.3 / 0.4 / +0.8 | 0.1 1.5 2.0 1.4 -0.1 -1.5 -2.0 -1.4 |
| wedge | 6 | -0.0 / 0.1 / -0.1 | -0.0 / 0.0 / -0.0 | +0.3 / 0.6 / +1.0 | 0.2 3.3 4.5 3.0 -0.2 -3.3 -4.5 -3.1 |
| wedge | 10 | -0.0 / 0.1 / -0.3 | -0.0 / 0.0 / -0.1 | -0.0 / 0.4 / -0.9 | 0.3 4.9 6.5 4.4 -0.2 -4.8 -6.6 -4.6 |
| wedge | 20 | -0.1 / 0.2 / -0.4 | -0.1 / 0.1 / -0.2 | -0.3 / 0.6 / -1.4 | 0.4 8.2 10.6 7.2 -0.4 -7.8 -10.9 -7.7 |
| wedge | 30 | -0.2 / 0.3 / -0.5 | -0.1 / 0.2 / -0.4 | -0.7 / 1.0 / -2.3 | 0.6 11.0 14.1 9.5 -0.5 -10.4 -14.4 -10.4 |
<!-- end:wind -->

The carry and the drift at the carry follow WSR to 0.0-1.5 yd mean even at
30 mph. The rest drifts further from the port with the wind, because a ball
blown 20-35 yd off the line lands and rolls on ground the line's profile
does not describe.

### 3.2 Part power: is the wind's effect linear in bars? No

Every club at 1, 2, 3 and 4 bars, calm and in 10 and 30 mph from the right,
left, behind and ahead, 252 shots (`--powers`, `results/wind-h10-<club>.json`;
the wedge and 7-iron also in `wind-h10-power.json`, an overlapping run on
another instance that gave the same numbers). The app's model is linear in
both mph and bars: sideways drift = c x mph x bars, the stop x (1 + h x
mph), with c and h the 10 mph, 4 bar secants of WSR's own wind.

<!-- begin:windpower -->
Crosswind: sideways drift in yd (+ = with the wind), the mean of the wind from either side, the calm shot's own offset taken out; hole 10's tee along its default line. The app: c x mph x bars, c its WSR-seeded default.

| club | bars | air (s) | 10 mph: WSR carry / rest | port carry / rest | app | 30 mph: WSR carry / rest | port carry / rest | app | WSR 30 / 10 mph | WSR share of the full-power drift at 10 mph (app's) |
|---|---|---|---|---|---|---|---|---|---|---|
| driver | 4 | 5.15 | 15.4 / 17.3 | 15.8 / 22.4 | 22.0 | 33.9 / 43.1 | 35.4 / 50.4 | 66.1 | 2.49 | 1.000 (1.00) |
| driver | 3 | 4.27 | 7.9 / 10.3 | 8.0 / 12.6 | 16.5 | 17.7 / 25.0 | 18.0 / 28.3 | 49.6 | 2.43 | 0.596 (0.75) |
| driver | 2 | 3.52 | 3.7 / 6.6 | 3.7 / 6.6 | 11.0 | 8.2 / 14.8 | 8.3 / 14.9 | 33.1 | 2.25 | 0.379 (0.50) |
| driver | 1 | 2.35 | 1.2 / 3.1 | 1.2 / 3.3 | 5.5 | 2.6 / 5.9 | 2.6 / 7.4 | 16.5 | 1.92 | 0.179 (0.25) |
| spoon | 4 | 5.15 | 15.6 / 16.5 | 15.9 / 21.4 | 21.5 | 34.2 / 39.4 | 35.5 / 48.4 | 64.6 | 2.40 | 1.000 (1.00) |
| spoon | 3 | 4.32 | 8.1 / 11.8 | 8.2 / 12.2 | 16.1 | 18.2 / 22.8 | 18.3 / 27.5 | 48.4 | 1.93 | 0.716 (0.75) |
| spoon | 2 | 3.48 | 3.6 / 6.5 | 3.6 / 6.5 | 10.8 | 8.1 / 14.3 | 8.2 / 14.7 | 32.3 | 2.21 | 0.393 (0.50) |
| spoon | 1 | 2.28 | 1.1 / 2.7 | 1.1 / 3.2 | 5.4 | 2.5 / 5.7 | 2.5 / 7.2 | 16.1 | 2.09 | 0.166 (0.25) |
| 3iron | 4 | 5.22 | 19.7 / 21.2 | 19.8 / 24.8 | 24.7 | 42.9 / 42.9 | 43.9 / 55.6 | 74.0 | 2.02 | 1.000 (1.00) |
| 3iron | 3 | 4.48 | 10.8 / 14.2 | 10.9 / 14.1 | 18.5 | 24.2 / 31.7 | 24.3 / 31.9 | 55.5 | 2.24 | 0.668 (0.75) |
| 3iron | 2 | 3.57 | 4.9 / 6.3 | 4.8 / 7.8 | 12.3 | 10.8 / 16.5 | 10.9 / 17.6 | 37.0 | 2.61 | 0.299 (0.50) |
| 3iron | 1 | 2.32 | 1.4 / 2.6 | 1.3 / 2.9 | 6.2 | 3.1 / 5.4 | 3.0 / 6.6 | 18.5 | 2.08 | 0.122 (0.25) |
| 5iron | 4 | 5.23 | 19.8 / 23.2 | 19.9 / 23.4 | 23.2 | 43.5 / 45.4 | 43.8 / 52.4 | 69.7 | 1.96 | 1.000 (1.00) |
| 5iron | 3 | 4.43 | 10.8 / 14.3 | 10.8 / 14.4 | 17.4 | 23.9 / 32.8 | 24.1 / 32.3 | 52.3 | 2.28 | 0.619 (0.75) |
| 5iron | 2 | 3.47 | 4.7 / 5.4 | 4.7 / 7.7 | 11.6 | 10.4 / 13.4 | 10.6 / 17.4 | 34.9 | 2.45 | 0.235 (0.50) |
| 5iron | 1 | 2.20 | 1.3 / 2.1 | 1.3 / 2.4 | 5.8 | 2.9 / 4.7 | 2.9 / 5.5 | 17.4 | 2.24 | 0.091 (0.25) |
| 7iron | 4 | 4.82 | 14.4 / 18.2 | 14.4 / 18.0 | 16.9 | 31.7 / 40.4 | 31.9 / 40.5 | 50.8 | 2.23 | 1.000 (1.00) |
| 7iron | 3 | 4.05 | 7.9 / 9.7 | 7.9 / 11.1 | 12.7 | 17.3 / 23.9 | 17.6 / 25.0 | 38.1 | 2.46 | 0.534 (0.75) |
| 7iron | 2 | 3.12 | 3.5 / 4.5 | 3.5 / 6.1 | 8.5 | 7.7 / 10.8 | 7.7 / 13.7 | 25.4 | 2.42 | 0.246 (0.50) |
| 7iron | 1 | 2.00 | 1.0 / 1.7 | 1.0 / 1.9 | 4.2 | 2.2 / 3.9 | 2.2 / 4.3 | 12.7 | 2.26 | 0.094 (0.25) |
| 9iron | 4 | 4.60 | 12.9 / 14.1 | 13.1 / 16.3 | 14.6 | 28.1 / 35.9 | 28.7 / 36.4 | 43.7 | 2.55 | 1.000 (1.00) |
| 9iron | 3 | 3.83 | 7.1 / 8.5 | 7.1 / 10.2 | 10.9 | 15.5 / 20.1 | 15.8 / 23.0 | 32.8 | 2.36 | 0.603 (0.75) |
| 9iron | 2 | 2.95 | 3.2 / 3.9 | 3.1 / 4.7 | 7.3 | 7.0 / 9.1 | 7.0 / 10.7 | 21.8 | 2.36 | 0.274 (0.50) |
| 9iron | 1 | 1.90 | 0.9 / 1.5 | 0.9 / 1.6 | 3.6 | 2.0 / 3.3 | 2.0 / 3.6 | 10.9 | 2.22 | 0.107 (0.25) |
| wedge | 4 | 3.57 | 6.5 / 6.8 | 6.6 / 7.7 | 7.4 | 14.3 / 15.7 | 14.5 / 17.5 | 22.2 | 2.31 | 1.000 (1.00) |
| wedge | 3 | 3.02 | 3.8 / 4.4 | 3.9 / 4.8 | 5.6 | 8.5 / 9.9 | 8.6 / 10.7 | 16.6 | 2.26 | 0.646 (0.75) |
| wedge | 2 | 2.37 | 1.9 / 2.3 | 1.9 / 2.5 | 3.7 | 4.1 / 5.3 | 4.2 / 5.6 | 11.1 | 2.32 | 0.334 (0.50) |
| wedge | 1 | 1.50 | 0.5 / 1.0 | 0.5 / 0.9 | 1.9 | 1.2 / 2.1 | 1.2 / 2.0 | 5.5 | 2.10 | 0.149 (0.25) |

Head and tail wind: the stop's change in yd against the calm shot; the app: calm stop x h x mph.

| club | bars | calm stop | 10 mph tail / head: WSR | port | app | 30 mph tail / head: WSR | port | app |
|---|---|---|---|---|---|---|---|---|
| driver | 4 | 280.5 | +21.7 / -12.7 | +22.2 / -13.9 | +17.6 / -17.6 | +40.0 / -36.7 | +38.9 / -38.2 | +52.7 / -52.7 |
| driver | 3 | 233.5 | +13.4 / -12.3 | +13.0 / -12.4 | +14.6 / -14.6 | +24.0 / -23.0 | +24.1 / -22.8 | +43.8 / -43.8 |
| driver | 2 | 183.8 | -1.5 / -5.5 | -0.1 / -4.2 | +11.5 / -11.5 | +5.3 / -11.8 | +6.7 / -10.5 | +34.5 / -34.5 |
| driver | 1 | 126.3 | +2.6 / -3.5 | +2.8 / -2.7 | +7.9 / -7.9 | +5.9 / -6.8 | +6.2 / -6.9 | +23.7 / -23.7 |
| spoon | 4 | 251.7 | +26.2 / -16.3 | +25.7 / -17.2 | +17.1 / -17.1 | +42.1 / -30.6 | +41.3 / -31.6 | +51.2 / -51.2 |
| spoon | 3 | 210.2 | +8.5 / -11.0 | +8.5 / -10.4 | +14.3 / -14.3 | +20.4 / -21.5 | +20.4 / -21.3 | +42.8 / -42.8 |
| spoon | 2 | 167.4 | +5.1 / -7.0 | +5.0 / -7.2 | +11.3 / -11.3 | +11.0 / -11.0 | +10.9 / -12.0 | +34.0 / -34.0 |
| spoon | 1 | 114.0 | +2.7 / -2.3 | +2.7 / -2.4 | +7.7 / -7.7 | +5.8 / -5.4 | +5.9 / -5.6 | +23.2 / -23.2 |
| 3iron | 4 | 213.0 | +18.7 / -20.6 | +18.5 / -20.5 | +19.7 / -19.7 | +44.0 / -41.5 | +44.3 / -41.5 | +59.0 / -59.0 |
| 3iron | 3 | 170.1 | +10.8 / -10.1 | +10.8 / -10.1 | +15.7 / -15.7 | +25.1 / -17.2 | +25.1 / -17.2 | +47.2 / -47.2 |
| 3iron | 2 | 133.9 | +8.4 / -4.4 | +8.5 / -4.3 | +12.4 / -12.4 | +13.5 / -12.5 | +14.5 / -12.4 | +37.1 / -37.1 |
| 3iron | 1 | 80.3 | +3.4 / -3.0 | +3.3 / -3.0 | +7.4 / -7.4 | +7.3 / -6.5 | +7.1 / -6.4 | +22.3 / -22.3 |
| 5iron | 4 | 174.7 | +17.2 / -16.8 | +17.3 / -16.8 | +18.4 / -18.4 | +42.2 / -30.9 | +45.0 / -31.0 | +55.1 / -55.1 |
| 5iron | 3 | 147.3 | +10.8 / -12.1 | +9.3 / -13.6 | +15.5 / -15.5 | +17.9 / -24.4 | +16.5 / -25.9 | +46.4 / -46.4 |
| 5iron | 2 | 113.9 | +4.8 / -5.5 | +4.6 / -5.8 | +12.0 / -12.0 | +13.2 / -12.8 | +13.2 / -13.3 | +35.9 / -35.9 |
| 5iron | 1 | 60.9 | +3.1 / -2.7 | +3.1 / -2.7 | +6.4 / -6.4 | +6.8 / -5.7 | +6.9 / -5.6 | +19.2 / -19.2 |
| 7iron | 4 | 152.2 | +6.9 / -13.6 | +7.3 / -13.3 | +14.3 / -14.3 | +24.9 / -29.0 | +25.2 / -28.7 | +42.9 / -42.9 |
| 7iron | 3 | 126.5 | +8.3 / -9.1 | +8.9 / -8.8 | +11.9 / -11.9 | +18.1 / -17.6 | +18.8 / -17.5 | +35.6 / -35.6 |
| 7iron | 2 | 96.7 | +5.5 / -5.0 | +5.4 / -5.2 | +9.1 / -9.1 | +13.0 / -10.9 | +13.1 / -11.0 | +27.2 / -27.2 |
| 7iron | 1 | 49.7 | +2.0 / -1.9 | +1.9 / -1.9 | +4.7 / -4.7 | +4.4 / -4.2 | +4.4 / -4.3 | +14.0 / -14.0 |
| 9iron | 4 | 118.3 | +11.9 / -11.3 | +12.2 / -11.4 | +12.7 / -12.7 | +25.6 / -24.9 | +26.5 / -24.7 | +38.1 / -38.1 |
| 9iron | 3 | 99.7 | +7.7 / -9.5 | +8.2 / -9.0 | +10.7 / -10.7 | +18.5 / -19.6 | +18.3 / -19.2 | +32.1 / -32.1 |
| 9iron | 2 | 68.3 | +4.8 / -4.8 | +4.7 / -4.6 | +7.3 / -7.3 | +15.2 / -10.9 | +15.1 / -10.7 | +22.0 / -22.0 |
| 9iron | 1 | 35.5 | +1.6 / -1.6 | +1.7 / -1.6 | +3.8 / -3.8 | +3.8 / -3.5 | +3.8 / -3.4 | +11.5 / -11.5 |
| wedge | 4 | 63.9 | +11.8 / -6.7 | +11.9 / -6.4 | +6.5 / -6.5 | +24.2 / -13.7 | +24.3 / -13.4 | +19.6 / -19.6 |
| wedge | 3 | 49.0 | +4.7 / -4.2 | +4.6 / -4.1 | +5.0 / -5.0 | +10.3 / -9.2 | +10.1 / -9.2 | +15.0 / -15.0 |
| wedge | 2 | 32.8 | +2.2 / -2.3 | +2.2 / -2.2 | +3.4 / -3.4 | +5.4 / -4.8 | +5.4 / -4.8 | +10.1 / -10.1 |
| wedge | 1 | 16.2 | +1.0 / -1.1 | +1.0 / -1.0 | +1.7 / -1.7 | +2.4 / -2.2 | +2.4 / -2.2 | +5.0 / -5.0 |
<!-- end:windpower -->

What this says:

- **WSR's wind formula is the port's**, at every power: per tick in the air
  the ball's horizontal velocity gains 8e-5 (0.6 W_along + W_across), |W| =
  15 (index/15)^0.737 x clamp(0.1 + 0.9 dh/300, 0.1, 1), the index mph / 2
  and dh the ball's height over the player's ground (300 u = 32.8 yd);
  wsr-club-physics.md 4.4. Drift at the carry: WSR within 0.0-0.3 yd of the
  port at 10 mph, within 0.6 yd at 30 mph below full power and 1.5 yd at
  full power (the port's long clubs drift 3-4 % more). The stop's change in
  head and tail wind: within 1-2 yd, the asymmetries included (a full driver
  gains 21.7 yd in a 10 mph tailwind and loses 12.7 in the same headwind;
  the port: 22.2 / 13.9).
- **30 mph is 2.25 times 10 mph** (3^0.737), not 3 times: the drift ratios at
  the carry are 2.17-2.4.
- **Part power drifts far less than linearly**: at the carry 7-8 % of the
  full-power drift at 1 bar, 24-29 % at 2 and 51-59 % at 3, close to
  (bars / 4)^1.9 (air time and height both fall with power, and a low ball
  feels as little as 10 % of the wind). A 1-bar wedge chip in 30 mph moves
  1.2 yd at the carry (2.1 at rest), a full wedge in 10 mph 6.5 (6.8); the
  app's model has 5.5 against 7.4.
- **The app over-predicts both terms off its calibration point**: the drift
  2-4 times at 1-2 bars and a third at 30 mph full power (the driver: app
  66.1 yd, WSR 33.9 at the carry, 43.1 at rest); the stop's wind change 2-4
  times at part power (the driver at 1 bar in a 30 mph tail: WSR +5.9 yd, the
  app +23.7).

### 3.3 Wind on putts

From hole 2's green (3.7 yd from the cup) and from its fringe (a real putt
off the green, lie 9), putts aimed 15 deg off the cup at three powers, calm
and in 30 mph from all 8 directions and 10 mph from two
(`run-puttwind.mjs`, `results/puttwind-h2-*.json`):

<!-- begin:puttwind -->
| save (lie) | putt power | winds | bit-identical to calm | largest move of the rest, along / across (yd) | the port's largest, along / across |
|---|---|---|---|---|---|
| hole 2 h02-fringe.sav (fringe) | 0.2 | 10 (30 mph x 8 directions, 10 mph x 2) | 0 of 10 | 0.0315 / -0.0188 | 0.0146 / 0.0134 |
| hole 2 h02-fringe.sav (fringe) | 0.4 | 10 (30 mph x 8 directions, 10 mph x 2) | 0 of 10 | 0.0435 / -0.0336 | 0.0200 / 0.0191 |
| hole 2 h02-fringe.sav (fringe) | 0.6 | 10 (30 mph x 8 directions, 10 mph x 2) | 0 of 10 | 0.0387 / 0.0460 | 0.0236 / 0.0232 |
| hole 2 h02-fringe.sav: traced | 0.2 | 30 mph at 88 deg | first different at lifetime 33 | | |
| hole 2 h02-green.sav (green) | 0.15 | 10 (30 mph x 8 directions, 10 mph x 2) | 10 of 10 | 0.0000 / 0.0000 | 0.0201 / -0.0193 |
| hole 2 h02-green.sav (green) | 0.3 | 10 (30 mph x 8 directions, 10 mph x 2) | 10 of 10 | 0.0000 / 0.0000 | 0.0260 / -0.0264 |
| hole 2 h02-green.sav (green) | 0.5 | 10 (30 mph x 8 directions, 10 mph x 2) | 10 of 10 | 0.0000 / 0.0000 | 0.0305 / -0.0323 |
| hole 2 h02-green.sav: traced | 0.15 | 30 mph at 105 deg | identical on all 40 ticks | | |
<!-- end:puttwind -->

On the green the wind does nothing at all: every putt bit-identical to the
calm one, and a traced pair identical on every tick. WSR zeroes the wind
while the player stands on the green or the cup (attr 6, 10, 11;
wsr-club-physics.md 4.4). The fringe (attr 9) is not on that list: a putt
from it rolls from its first tick, so the wind acts only in the 8 ticks WSR
counts as airborne at every launch, at its 10 % floor near the ground: 0.02-
0.04 yd at 30 mph, about 1.5 times the port's figure (which has no player-lie
switch and gives a green putt the same; the app's putt model has no wind, so
the app agrees with WSR on the green). A chip from the fringe flies, and
feels the wind by its air time as in 3.2.

## 4. Trees (2c)

Lines past one tree straight at the trunk and moved left and right of it, at
clubs and powers that meet it at different heights, from a tee or from a
spot reached by a real stroke (`run-trees.mjs`, `results/trees-*.json`):
hole 7's centre tree t7-18 (the tree NOTES[7] plays right of), hole 19's
corner tree t19-53 from the north end of the right fairway, hole 20's
conifer t20-16 at the dogleg (the "risky line between the tree and the rock
wall"), and four checks of trunks met after the landing (t7-23, t16-53,
t2-31, t20-11). WSR's verdict is its own tree check, read at the tree query
(0x804138d4: 1 trunk, 2-4 canopy) for the real ball; the app's is
`src/trees.js` treeCheck on the port's flight over the KCL line with the
tree as derived.json ships it, flown again here with the code as it stands
("run:" is the verdict when the run was made, before the change below).

<!-- begin:trees -->
Hole 2, tree t2-31 (kind 3 conifer, x scale 1.9, y scale 1.9, base -11.5 yd on the hole's datum, off the course), 248.7 yd from the ball (h02-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -0.3 | spoon | 1 | none | – / – | clear (run: trunk) | – | yes | 233.8 |
| +0.0 | spoon | 1 | none | – / – | clear (run: trunk) | – | yes | 233.8 |

Hole 7, tree t7-18 (kind 2 broadleaf, x scale 2.3, y scale 2.3, base -19.6 yd on the hole's datum), 208.9 yd from the ball (h07-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -10.0 | 3iron | 1 | none | 3.3 / 10.1 | under at 203.0 | +17.0 | yes | 205.6 |
| -10.0 | driver | 1 | none | 34.9 / 10.0 | over at 211.0 | +2.7 | yes | 265.7 |
| -10.0 | driver | 0.9 | canopy at 202.3 | 24.4 / 10.0 | canopy at 202.5 | -6.8 | yes | 245.8 |
| -10.0 | spoon | 1 | canopy at 203.5 | 26.6 / 10.0 | canopy at 204.0 | -6.2 | yes | 242.7 |
| -10.0 | spoon | 0.9 | none | 13.0 / 10.0 | under at 204.5 | +3.4 | yes | 223.0 |
| -5.0 | 3iron | 1 | none | 3.2 / 5.2 | under at 200.0 | +10.3 | yes | 205.5 |
| -5.0 | driver | 1 | canopy at 206.0 | 34.8 / 5.0 | canopy at 206.5 | -1.8 | yes | 265.4 |
| -5.0 | driver | 0.9 | canopy at 198.6 | 23.6 / 5.0 | canopy at 199.0 | -11.0 | yes | 245.6 |
| -5.0 | spoon | 1 | canopy at 199.8 | 25.8 / 5.0 | canopy at 200.0 | -10.6 | yes | 242.5 |
| -5.0 | spoon | 0.9 | canopy at 199.2 | 11.5 / 5.0 | canopy at 199.5 | -1.6 | yes | 222.9 |
| +0.0 | 3iron | 1 | trunk at 207.4 | – / – | trunk at 207.5 (run: under) | -13.1 | yes | 205.5 |
| +0.0 | driver | 1 | canopy at 204.2 | 34.7 / 0.1 | canopy at 204.5 | -3.0 | yes | 265.2 |
| +0.0 | driver | 0.9 | canopy at 197.6 | 22.8 / 0.0 | canopy at 198.0 | -12.1 | yes | 244.7 |
| +0.0 | spoon | 1 | canopy at 198.8 | 25.6 / 0.0 | canopy at 199.0 | -11.7 | yes | 241.8 |
| +0.0 | spoon | 0.9 | canopy at 197.6 | – / – | canopy at 198.0 | -2.9 | yes | 222.8 |
| +5.0 | 3iron | 1 | none | 3.5 / 4.8 | under at 200.0 | +10.3 | yes | 205.4 |
| +5.0 | driver | 1 | canopy at 206.0 | 34.8 / 5.0 | canopy at 206.5 | -1.8 | yes | 265.1 |
| +5.0 | driver | 0.9 | canopy at 198.6 | 23.6 / 5.0 | canopy at 199.0 | -11.0 | yes | 244.5 |
| +5.0 | spoon | 1 | canopy at 199.8 | 25.8 / 5.0 | canopy at 200.0 | -10.6 | yes | 241.6 |
| +5.0 | spoon | 0.9 | canopy at 199.2 | 11.5 / 5.0 | canopy at 199.5 | -1.6 | yes | 222.7 |
| +10.0 | 3iron | 1 | none | 3.7 / 9.9 | under at 203.0 | +17.0 | yes | 205.2 |
| +10.0 | driver | 1 | none | 34.9 / 10.0 | over at 211.0 | +2.7 | yes | 264.9 |
| +10.0 | driver | 0.9 | canopy at 202.3 | 24.4 / 10.0 | canopy at 202.5 | -6.8 | yes | 244.4 |
| +10.0 | spoon | 1 | canopy at 203.5 | 26.6 / 10.0 | canopy at 204.0 | -6.2 | yes | 241.5 |
| +10.0 | spoon | 0.9 | none | 13.0 / 10.0 | under at 204.5 | +3.4 | yes | 222.6 |

Hole 7, tree t7-23 (kind 2 broadleaf, x scale 2.15, y scale 2.15, base -16.4 yd on the hole's datum), 175.1 yd from the ball (h07-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -0.1 | 3iron | 0.75 | none | 0.8 / 2.5 | clear (run: trunk) | – | yes | 157.9 |
| -0.1 | 5iron | 1 | trunk at 173.7 | – / – | trunk at 174.1 | -11.8 | yes | 171.1 |
| -0.1 | driver | 0.5 | none | 0.6 / 2.1 | clear (run: trunk) | – | yes | 145.0 |
| +0.0 | 3iron | 0.75 | none | 0.8 / 2.6 | clear (run: trunk) | – | yes | 157.9 |
| +0.0 | 5iron | 1 | trunk at 173.7 | – / – | trunk at 174.1 | -11.8 | yes | 171.1 |
| +0.0 | driver | 0.5 | none | 0.5 / 2.3 | clear (run: trunk) | – | yes | 145.0 |

Hole 16, tree t16-53 (kind 2 broadleaf, x scale 1.4, y scale 1.4, base 13.4 yd on the hole's datum, off the course), 176.4 yd from the ball (h16-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| +0.0 | driver | 0.75 | none | -0.1 / 1.8 | clear (run: trunk) | – | yes | 147.9 |
| +0.0 | spoon | 0.75 | none | – / – | clear (run: trunk) | – | yes | 140.2 |
| +0.9 | driver | 0.75 | trunk at 175.9 | – / – | clear (run: trunk) | – | **no** | 147.6 |
| +0.9 | spoon | 0.75 | none | – / – | clear (run: trunk) | – | yes | 140.1 |

Hole 19, tree t19-53 (kind 2 broadleaf, x scale 2, y scale 2, base -12.2 yd on the hole's datum), 70.5 yd from the ball (h19-corner.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -6.2 | 3iron | 0.8 | canopy at 63.3 | 18.2 / 6.2 | canopy at 63.5 | -5.2 | yes | 143.8 |
| -6.2 | 5iron | 0.95 | canopy at 61.8 | 23.1 / 6.2 | canopy at 62.0 | -7.0 | yes | 145.4 |
| -6.2 | 7iron | 1 | canopy at 61.8 | 21.5 / 6.2 | canopy at 62.0 | -8.4 | yes | 125.4 |
| -6.2 | 9iron | 1 | canopy at 61.8 | 20.1 / 6.2 | canopy at 62.0 | -7.3 | yes | 98.8 |
| -6.2 | driver | 0.59 | none | 8.8 / 6.2 | under at 70.5 | +4.5 | yes | 127.8 |
| -6.2 | spoon | 0.66 | none | 10.3 / 6.2 | under at 71.0 | +3.0 | yes | 132.8 |
| -6.0 | 3iron | 0.8 | canopy at 63.1 | 18.2 / 6.0 | canopy at 63.0 | -5.3 | yes | 143.8 |
| -6.0 | 5iron | 0.95 | canopy at 61.7 | 23.1 / 6.0 | canopy at 62.0 | -7.2 | yes | 145.4 |
| -6.0 | 7iron | 1 | canopy at 61.7 | 21.5 / 6.0 | canopy at 62.0 | -8.5 | yes | 125.4 |
| -6.0 | 9iron | 1 | canopy at 61.7 | 20.0 / 6.0 | canopy at 62.0 | -7.5 | yes | 98.8 |
| -6.0 | driver | 0.59 | none | 8.8 / 6.0 | under at 71.0 | +4.4 | yes | 127.8 |
| -6.0 | spoon | 0.66 | none | 10.3 / 6.0 | under at 71.0 | +2.8 | yes | 132.8 |
| -3.0 | 3iron | 0.8 | canopy at 61.8 | 18.1 / 3.0 | canopy at 62.0 | -6.8 | yes | 143.4 |
| -3.0 | 5iron | 0.95 | canopy at 60.5 | 22.9 / 3.0 | canopy at 60.5 | -8.6 | yes | 145.1 |
| -3.0 | 7iron | 1 | canopy at 60.6 | 21.3 / 3.0 | canopy at 60.5 | -10.0 | yes | 125.0 |
| -3.0 | 9iron | 1 | canopy at 60.5 | 18.7 / 3.0 | canopy at 60.5 | -8.9 | yes | 98.6 |
| -3.0 | driver | 0.59 | none | 8.8 / 3.0 | under at 71.0 | +2.9 | yes | 126.8 |
| -3.0 | spoon | 0.66 | none | 10.3 / 3.0 | under at 71.0 | +1.4 | yes | 131.7 |
| +0.0 | 3iron | 0.8 | canopy at 61.4 | 18.0 / 0.0 | canopy at 61.5 | -7.2 | yes | 143.0 |
| +0.0 | 5iron | 0.95 | canopy at 60.2 | 22.8 / 0.0 | canopy at 60.5 | -9.0 | yes | 144.8 |
| +0.0 | 7iron | 1 | canopy at 60.1 | 21.1 / 0.0 | canopy at 60.5 | -10.4 | yes | 124.7 |
| +0.0 | 9iron | 1 | canopy at 60.1 | 18.6 / 0.0 | canopy at 60.0 | -9.4 | yes | 98.3 |
| +0.0 | driver | 0.59 | trunk at 69.4 | – / – | trunk at 69.5 | -5.3 | yes | 125.7 |
| +0.0 | spoon | 0.66 | trunk at 69.3 | – / – | trunk at 69.5 | -3.7 | yes | 130.9 |
| +3.0 | 3iron | 0.8 | canopy at 61.8 | 18.1 / 3.0 | canopy at 62.0 | -6.8 | yes | 142.4 |
| +3.0 | 5iron | 0.95 | canopy at 60.5 | 22.9 / 3.0 | canopy at 60.5 | -8.6 | yes | 144.4 |
| +3.0 | 7iron | 1 | canopy at 60.6 | 21.3 / 3.0 | canopy at 60.5 | -10.0 | yes | 124.4 |
| +3.0 | 9iron | 1 | canopy at 60.5 | 18.7 / 3.0 | canopy at 60.5 | -8.9 | yes | 98.1 |
| +3.0 | driver | 0.59 | none | 8.8 / 3.0 | under at 71.0 | +2.9 | yes | 124.8 |
| +3.0 | spoon | 0.66 | none | 10.3 / 3.0 | under at 71.0 | +1.4 | yes | 130.0 |
| +6.0 | 3iron | 0.8 | canopy at 63.1 | 18.2 / 6.0 | canopy at 63.0 | -5.3 | yes | 142.3 |
| +6.0 | 5iron | 0.95 | canopy at 61.7 | 23.1 / 6.0 | canopy at 62.0 | -7.2 | yes | 144.4 |
| +6.0 | 7iron | 1 | canopy at 61.7 | 21.5 / 6.0 | canopy at 62.0 | -8.5 | yes | 124.0 |
| +6.0 | 9iron | 1 | canopy at 61.7 | 20.0 / 6.0 | canopy at 62.0 | -7.5 | yes | 97.8 |
| +6.0 | driver | 0.59 | none | 8.8 / 6.0 | under at 71.0 | +4.4 | yes | 124.0 |
| +6.0 | spoon | 0.66 | none | 10.3 / 6.0 | under at 71.0 | +2.8 | yes | 129.3 |

Hole 20, tree t20-11 (kind 2 broadleaf, x scale 1.7, y scale 1.7, base -1.6 yd on the hole's datum), 53.7 yd from the ball (h20-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -0.8 | 7iron | 0.4 | trunk at 52.9 | – / – | trunk at 52.8 | -11.3 | yes | 52.8 |
| -0.8 | 9iron | 0.5 | trunk at 52.9 | – / – | trunk at 53.0 | -10.1 | yes | 51.5 |
| -0.8 | 9iron | 0.45 | none | – / – | under at 46.6 | +13.5 | yes | 46.6 |
| +0.0 | 7iron | 0.4 | trunk at 52.5 | – / – | trunk at 52.5 | -11.0 | yes | 52.8 |
| +0.0 | 9iron | 0.5 | trunk at 52.5 | – / – | trunk at 53.0 | -10.6 | yes | 51.5 |
| +0.0 | 9iron | 0.45 | none | – / – | under at 46.6 | +13.4 | yes | 46.6 |

Hole 20, tree t20-16 (kind 3 conifer, x scale 2.2, y scale 2.2, base 8.9 yd on the hole's datum), 150.9 yd from the ball (h20-tee.sav). Offset: the line passes that far right of the trunk.

| offset (yd) | club | power | WSR | ball over the base / from the trunk at the tree (yd) | app treeCheck | margin (yd) | agree | port carry (yd) |
|---|---|---|---|---|---|---|---|---|
| -8.0 | 3iron | 1 | none | 14.9 / 8.0 | clear at 150.5 | +0.8 | yes | 179.0 |
| -8.0 | 5iron | 1 | none | 0.5 / 8.0 | clear at 150.5 | +0.8 | yes | 151.3 |
| -8.0 | 7iron | 1 | none | – / – | clear | – | yes | 123.9 |
| -8.0 | driver | 1 | none | 13.8 / 8.0 | clear at 150.5 | +0.8 | yes | 200.2 |
| -8.0 | driver | 0.8 | none | 5.0 / 8.0 | clear at 150.5 | +0.8 | yes | 171.6 |
| -8.0 | spoon | 1 | none | 13.8 / 8.0 | clear at 150.5 | +0.8 | yes | 198.6 |
| -4.0 | 3iron | 1 | canopy at 146.8 | 14.8 / 4.0 | canopy at 147.0 | -5.9 | yes | 179.0 |
| -4.0 | 5iron | 1 | none | 0.3 / 4.0 | under at 145.0 | +4.5 | yes | 151.1 |
| -4.0 | 7iron | 1 | none | – / – | clear | – | yes | 123.7 |
| -4.0 | driver | 1 | canopy at 146.2 | 13.7 / 4.0 | canopy at 146.5 | -4.3 | yes | 198.7 |
| -4.0 | driver | 0.8 | none | 4.9 / 4.0 | under at 145.0 | +3.9 | yes | 171.3 |
| -4.0 | spoon | 1 | canopy at 146.3 | 13.7 / 4.0 | canopy at 146.5 | -4.4 | yes | 197.2 |
| +0.0 | 3iron | 1 | canopy at 145.4 | – / – | canopy at 145.5 | -6.5 | yes | 179.1 |
| +0.0 | 5iron | 1 | trunk at 149.9 | – / – | trunk at 150.0 | -16.3 | yes | 151.0 |
| +0.0 | 7iron | 1 | none | – / – | clear | – | yes | 123.5 |
| +0.0 | driver | 1 | canopy at 144.8 | – / – | canopy at 145.0 | -4.2 | yes | 197.1 |
| +0.0 | driver | 0.8 | trunk at 150.0 | – / – | trunk at 150.0 | -12.3 | yes | 171.2 |
| +0.0 | spoon | 1 | canopy at 144.9 | – / – | canopy at 145.0 | -4.4 | yes | 195.7 |
| +4.0 | 3iron | 1 | canopy at 146.8 | 14.8 / 4.0 | canopy at 147.0 | -5.9 | yes | 179.3 |
| +4.0 | 5iron | 1 | none | 0.4 / 4.0 | under at 145.0 | +4.5 | yes | 150.9 |
| +4.0 | 7iron | 1 | none | – / – | clear | – | yes | 123.2 |
| +4.0 | driver | 1 | canopy at 146.2 | 13.7 / 4.0 | canopy at 146.5 | -4.3 | yes | 195.4 |
| +4.0 | driver | 0.8 | none | 4.9 / 4.0 | under at 145.0 | +3.9 | yes | 171.8 |
| +4.0 | spoon | 1 | canopy at 146.3 | 13.7 / 4.0 | canopy at 146.5 | -4.4 | yes | 194.0 |
| +8.0 | 3iron | 1 | none | 14.9 / 8.0 | clear at 150.5 | +0.8 | yes | 179.4 |
| +8.0 | 5iron | 1 | none | 0.5 / 8.0 | clear at 150.8 | +0.8 | yes | 150.8 |
| +8.0 | 7iron | 1 | none | – / – | clear | – | yes | 123.1 |
| +8.0 | driver | 1 | none | 13.8 / 8.0 | clear at 150.5 | +0.8 | yes | 193.7 |
| +8.0 | driver | 0.8 | none | 5.0 / 8.0 | clear at 150.5 | +0.8 | yes | 171.9 |
| +8.0 | spoon | 1 | none | 13.8 / 8.0 | clear at 150.5 | +0.8 | yes | 192.3 |

108 of 109 shots agree on contact or none (and on trunk or canopy); where both meet the tree, WSR's first contact minus the app's: -0.2 / 0.3 / -0.5 yd (mean / rms / worst).
<!-- end:trees -->

The shapes are right: every canopy and trunk contact in the air agrees, the
contact point within 0.5 yd (the app samples every 0.5 yd); the cone's
narrowing top, the broadleaf's sphere and the trunk capsules all decide the
same shots WSR's do; "clear" 0.8 yd from hole 20's conifer is clear in WSR.
The one shot of the first three runs the app got wrong was hole 7's full
3-iron straight at t7-18: it lands 1.9 yd short of the trunk's capsule and
bounces into it, and the app's check stopped at the carry.

**Changed**: treeCheck now also checks the first 5 yd past the carry
(`BOUNCE_YD`, src/trees.js). Of the trunk hits the full-roll version
predicted, WSR confirmed the ones near the landing (t7-18's 3-iron 1.9 yd
past its carry, t7-23's full 5-iron 2.7 yd past, t20-11's 9-iron at 2 bars
1.0 yd past; t20-11's 7-iron at 1.6 bars meets the trunk at its carry, in
the air, where both checks already agreed) and refuted the long rolls (t7-23 from the driver at
2 bars and the 3-iron at 3, 16-29 yd past the carry: WSR's ball passed 2.3
and 2.6 yd from the trunk; t16-53 straight at it: 1.8 yd; t2-31 and t16-53's
spoon: WSR's ball stopped short on outer ground, which the port rolls as
fairway). On a level-across line the port's roll is where WSR's is along the
line but not across it, and a trunk is 1.3-1.5 yd wide, so the roll beyond 5
yd is not checked (the one WSR roll hit it misses, t16-53 0.9 yd right of the
trunk, 28 yd past the carry, the old code missed too). Over 1,260 flights
(12 tees x 5 lines x 7 clubs x 3 powers) the change alters 2 verdicts, both
to trunk hits WSR confirms; tools/test-trees.mjs and test-solver.mjs pass
unchanged.

## 5. The cup and the roll on a green (2d)

### 5.1 The roll

The first grid (`results/cup-h*-grid1.json`, 120 putts on holes 2 and 11,
aimed straight and right of the cup) holed almost nothing, because both
greens break about half a yard over these putts. It measured the roll:
straight putts with up to 3 yd of excess stop within 0.01-0.05 yd of WSR's
along the line and 0.00-0.04 across, the app's roll over the mesh green
heights. The traced runs (`run-cup.mjs`, `results/cup-h2.json`,
`cup-h11.json`, `cup-h20a.json`, `cup-h20b.json`) aim each line off the
break (a probe on the app's holing line measures WSR's pass and the grid is
shifted by it), trace the putt and record WSR's closest approach to the cup
centre, the speed there and the verdict:

<!-- begin:cup -->
Hole 2: the ball 3.7 yd from the cup (h02-green.sav); 60 putts, each traced; pass = the ball centre's closest approach to the cup centre, + right of the cup; speed there in yd/s. "App rule" applies the app's cup rule (pass <= 0.15 yd at <= 4.07 yd/s) to WSR's own pass and speed; "app" is the app's own putt (its roll and its rule).

| excess (yd) | line | WSR pass offset / speed | WSR | app rule on WSR's pass | app's own pass offset / speed | app | rest WSR - app, along / across (yd) |
|---|---|---|---|---|---|---|---|
| 0.5 | -0.2 | -0.2 / 1.2 | missed | missed | -0.2 / 1.3 | missed | -0.0 / +0.0 |
| 0.5 | -0.2 | -0.2 / 1.3 | missed | missed | -0.2 / 1.3 | missed | +0.0 / +0.1 |
| 0.5 | -0.1 | -0.1 / 1.4 | missed | holed (differs) | -0.1 / 1.3 | holed | -0.1 / +0.6 |
| 0.5 | -0.1 | -0.1 / 1.4 | **holed** | holed | -0.1 / 1.3 | holed | – |
| 0.5 | -0.1 | -0.0 / 1.5 | **holed** | holed | -0.1 / 1.3 | holed | – |
| 0.5 | +0.0 | +0.0 / 1.5 | **holed** | holed | -0.0 / 1.3 | holed | – |
| 0.5 | probe | +0.0 / 1.5 | **holed** | holed | +0.0 / 1.3 | holed | – |
| 0.5 | +0.1 | +0.1 / 1.5 | **holed** | holed | +0.0 / 1.3 | holed | – |
| 0.5 | +0.1 | +0.1 / 1.5 | **holed** | holed | +0.1 / 1.5 | holed | – |
| 0.5 | +0.1 | +0.1 / 1.5 | missed | holed (differs) | +0.1 / 1.5 | holed | +0.1 / -0.3 |
| 0.5 | +0.2 | +0.2 / 1.4 | missed | missed | +0.2 / 1.5 | missed | -0.0 / -0.0 |
| 0.5 | +0.2 | +0.2 / 1.4 | missed | missed | +0.2 / 1.5 | missed | -0.0 / -0.0 |
| 2 | -0.2 | -0.2 / 2.6 | missed | missed | -0.2 / 2.6 | missed | -0.0 / +0.0 |
| 2 | -0.2 | -0.2 / 2.6 | missed | missed | -0.2 / 2.6 | missed | -0.0 / +0.0 |
| 2 | -0.1 | -0.1 / 2.7 | missed | holed (differs) | -0.1 / 2.6 | holed | +0.1 / +0.3 |
| 2 | -0.1 | -0.1 / 2.7 | **holed** | holed | -0.1 / 2.6 | holed | – |
| 2 | -0.1 | -0.1 / 2.7 | **holed** | holed | -0.1 / 2.6 | holed | – |
| 2 | +0.0 | -0.0 / 2.7 | **holed** | holed | -0.0 / 2.6 | holed | – |
| 2 | probe | +0.0 / 2.7 | **holed** | holed | +0.0 / 2.6 | holed | – |
| 2 | +0.1 | +0.0 / 2.7 | **holed** | holed | +0.0 / 2.6 | holed | – |
| 2 | +0.1 | +0.1 / 2.7 | missed | holed (differs) | +0.1 / 2.8 | holed | -1.4 / -1.6 |
| 2 | +0.1 | +0.1 / 2.7 | missed | holed (differs) | +0.1 / 2.8 | holed | +0.0 / -0.3 |
| 2 | +0.2 | +0.2 / 2.7 | missed | missed | +0.2 / 2.8 | missed | -0.0 / -0.0 |
| 2 | +0.2 | +0.2 / 2.7 | missed | missed | +0.2 / 2.8 | missed | -0.0 / -0.0 |
| 3.5 | -0.2 | -0.2 / 3.6 | missed | missed | -0.2 / 3.5 | missed | -0.1 / +0.0 |
| 3.5 | -0.2 | -0.2 / 3.6 | missed | missed | -0.2 / 3.5 | missed | -0.1 / +0.0 |
| 3.5 | -0.1 | -0.1 / 3.6 | missed | holed (differs) | -0.1 / 3.5 | holed | +0.0 / +0.4 |
| 3.5 | -0.1 | -0.1 / 3.6 | missed | holed (differs) | -0.1 / 3.5 | holed | -1.5 / +1.9 |
| 3.5 | -0.1 | -0.0 / 3.7 | **holed** | holed | -0.1 / 3.6 | holed | – |
| 3.5 | +0.0 | -0.0 / 3.7 | **holed** | holed | -0.0 / 3.6 | holed | – |
| 3.5 | probe | +0.0 / 3.7 | **holed** | holed | +0.0 / 3.6 | holed | – |
| 3.5 | +0.1 | +0.1 / 3.7 | **holed** | holed | +0.0 / 3.6 | holed | – |
| 3.5 | +0.1 | +0.1 / 3.7 | missed | holed (differs) | +0.1 / 3.6 | holed | -1.1 / -1.4 |
| 3.5 | +0.1 | +0.1 / 3.7 | missed | holed (differs) | +0.1 / 3.6 | holed | +0.0 / -0.3 |
| 3.5 | +0.2 | +0.2 / 3.6 | missed | missed | +0.2 / 3.6 | missed | -0.1 / +0.0 |
| 3.5 | +0.2 | +0.2 / 3.6 | missed | missed | +0.2 / 3.6 | missed | -0.1 / +0.0 |
| 4.5 | -0.2 | -0.2 / 4.1 | missed | missed | -0.2 / 4.1 | missed | -0.1 / +0.0 |
| 4.5 | -0.2 | -0.2 / 4.1 | missed | missed | -0.2 / 4.1 | missed | -0.1 / +0.0 |
| 4.5 | -0.1 | -0.1 / 4.2 | missed | missed | -0.1 / 4.1 | missed | +0.0 / +0.3 |
| 4.5 | -0.1 | -0.1 / 4.2 | missed | missed | -0.1 / 4.1 | missed | -1.3 / +1.5 |
| 4.5 | -0.1 | -0.1 / 4.2 | missed | missed | -0.1 / 4.2 | missed | -3.7 / +0.7 |
| 4.5 | +0.0 | -0.0 / 4.2 | **holed** | missed (differs) | -0.0 / 4.2 | missed | – |
| 4.5 | probe | +0.0 / 4.2 | **holed** | missed (differs) | +0.0 / 4.2 | missed | – |
| 4.5 | +0.1 | +0.0 / 4.2 | missed | missed | +0.0 / 4.2 | missed | -3.1 / -1.1 |
| 4.5 | +0.1 | +0.1 / 4.2 | missed | missed | +0.1 / 4.2 | missed | -1.4 / -1.6 |
| 4.5 | +0.1 | +0.1 / 4.2 | missed | missed | +0.1 / 4.2 | missed | -0.0 / -0.4 |
| 4.5 | +0.2 | +0.2 / 4.2 | missed | missed | +0.2 / 4.2 | missed | -0.1 / +0.0 |
| 4.5 | +0.2 | +0.2 / 4.2 | missed | missed | +0.2 / 4.2 | missed | -0.1 / +0.0 |
| 5.5 | -0.2 | -0.2 / 4.7 | missed | missed | -0.2 / 4.7 | missed | -0.1 / +0.0 |
| 5.5 | -0.2 | -0.2 / 4.7 | missed | missed | -0.2 / 4.8 | missed | -0.1 / +0.0 |
| 5.5 | -0.1 | -0.1 / 4.7 | missed | missed | -0.1 / 4.8 | missed | -0.0 / +0.6 |
| 5.5 | -0.1 | -0.1 / 4.7 | missed | missed | -0.1 / 4.8 | missed | -1.6 / +1.8 |
| 5.5 | -0.1 | -0.0 / 4.7 | missed | missed | -0.1 / 4.8 | missed | -3.8 / +0.7 |
| 5.5 | +0.0 | -0.0 / 4.7 | missed | missed | -0.0 / 4.8 | missed | -4.8 / -0.7 |
| 5.5 | probe | +0.0 / 4.7 | missed | missed | +0.0 / 4.8 | missed | -4.8 / -0.8 |
| 5.5 | +0.1 | +0.1 / 4.7 | missed | missed | +0.0 / 4.8 | missed | -4.0 / -1.6 |
| 5.5 | +0.1 | +0.1 / 4.7 | missed | missed | +0.1 / 4.8 | missed | -1.4 / -1.3 |
| 5.5 | +0.1 | +0.1 / 4.7 | missed | missed | +0.1 / 4.8 | missed | -0.0 / -0.3 |
| 5.5 | +0.2 | +0.2 / 4.7 | missed | missed | +0.2 / 4.8 | missed | -0.1 / +0.0 |
| 5.5 | +0.2 | +0.2 / 4.7 | missed | missed | +0.2 / 4.8 | missed | -0.1 / +0.0 |

The app's rule on WSR's own pass and speed agrees with WSR's verdict on 49 of 60. WSR's pass minus the app's (the break and speed at the cup): offset +0.0 / 0.0 / +0.0, speed +0.0 / 0.1 / +0.2. Rests of the putts that pass the cup more than 0.3 yd away, WSR - app: along –, across – (0 putts).

Hole 11: the ball 6.6 yd from the cup (h11-green.sav); 47 putts, each traced; pass = the ball centre's closest approach to the cup centre, + right of the cup; speed there in yd/s. "App rule" applies the app's cup rule (pass <= 0.15 yd at <= 4.07 yd/s) to WSR's own pass and speed; "app" is the app's own putt (its roll and its rule).

| excess (yd) | line | WSR pass offset / speed | WSR | app rule on WSR's pass | app's own pass offset / speed | app | rest WSR - app, along / across (yd) |
|---|---|---|---|---|---|---|---|
| 0.5 | -0.2 | -0.2 / 1.9 | missed | missed | -0.2 / 1.9 | missed | +0.0 / -0.0 |
| 0.5 | -0.2 | -0.2 / 1.9 | missed | missed | -0.2 / 1.9 | missed | +0.0 / -0.0 |
| 0.5 | -0.1 | -0.1 / 2.0 | missed | holed (differs) | -0.1 / 1.9 | holed | +0.1 / +0.2 |
| 0.5 | -0.1 | -0.1 / 0.1 | **holed** | holed | -0.1 / 1.9 | holed | – |
| 0.5 | -0.1 | -0.1 / 2.0 | **holed** | holed | -0.0 / 1.9 | holed | – |
| 0.5 | probe | -0.0 / 2.0 | **holed** | holed | +0.0 / 1.9 | holed | – |
| 0.5 | +0.0 | +0.0 / 2.0 | **holed** | holed | +0.0 / 1.9 | holed | – |
| 0.5 | +0.1 | +0.1 / 2.0 | **holed** | holed | +0.1 / 1.9 | holed | – |
| 0.5 | +0.1 | +0.1 / 2.0 | **holed** | holed | +0.1 / 1.9 | holed | – |
| 0.5 | +0.1 | +0.1 / 2.0 | missed | holed (differs) | +0.2 / 1.9 | missed | +0.1 / -0.2 |
| 0.5 | +0.2 | +0.2 / 1.9 | missed | missed | +0.2 / 1.9 | missed | +0.0 / +0.0 |
| 0.5 | +0.2 | +0.2 / 1.9 | missed | missed | +0.2 / 1.9 | missed | +0.0 / +0.0 |
| 2 | -0.2 | -0.2 / 3.0 | missed | missed | -0.2 / 3.0 | missed | -0.0 / -0.0 |
| 2 | -0.2 | -0.2 / 3.0 | missed | missed | -0.2 / 3.0 | missed | -0.0 / -0.0 |
| 2 | -0.1 | -0.1 / 3.1 | missed | holed (differs) | -0.1 / 3.0 | holed | +0.1 / +0.1 |
| 2 | -0.1 | -0.1 / 3.1 | missed | holed (differs) | -0.1 / 3.0 | holed | -1.3 / +1.9 |
| 2 | -0.1 | -0.1 / 3.1 | **holed** | holed | -0.0 / 3.0 | holed | – |
| 2 | probe | -0.0 / 3.1 | **holed** | holed | +0.0 / 3.0 | holed | – |
| 2 | +0.0 | +0.0 / 3.1 | **holed** | holed | +0.0 / 3.0 | holed | – |
| 2 | +0.1 | +0.1 / 3.1 | **holed** | holed | +0.1 / 3.0 | holed | – |
| 2 | +0.1 | +0.1 / 3.1 | missed | holed (differs) | +0.1 / 3.0 | holed | -2.3 / -1.9 |
| 2 | +0.1 | +0.1 / 3.1 | missed | holed (differs) | +0.1 / 3.0 | holed | +0.1 / -0.3 |
| 2 | +0.2 | +0.2 / 3.0 | missed | missed | +0.2 / 3.0 | missed | -0.0 / +0.0 |
| 2 | +0.2 | +0.2 / 3.0 | missed | missed | +0.2 / 3.0 | missed | -0.0 / +0.0 |
| 3.5 | -0.2 | -0.2 / 3.9 | missed | missed | -0.2 / 3.9 | missed | -0.0 / -0.0 |
| 3.5 | -0.2 | -0.2 / 3.9 | missed | missed | -0.2 / 3.9 | missed | -0.0 / -0.0 |
| 3.5 | -0.1 | -0.1 / 3.9 | missed | holed (differs) | -0.1 / 3.9 | holed | +0.1 / +0.2 |
| 3.5 | -0.1 | -0.1 / 4.0 | missed | holed (differs) | -0.1 / 3.9 | holed | -1.0 / +1.3 |
| 3.5 | -0.1 | -0.1 / 4.0 | missed | holed (differs) | -0.0 / 3.9 | holed | -3.3 / +0.9 |
| 3.5 | probe | -0.0 / 4.0 | **holed** | holed | +0.0 / 3.9 | holed | – |
| 3.5 | +0.0 | -0.0 / 4.0 | **holed** | holed | +0.0 / 3.9 | holed | – |
| 3.5 | +0.1 | +0.0 / 4.0 | missed | holed (differs) | +0.1 / 3.9 | holed | -3.6 / -0.9 |
| 3.5 | +0.1 | +0.1 / 4.0 | missed | holed (differs) | +0.1 / 3.9 | holed | -1.4 / -1.5 |
| 3.5 | +0.1 | +0.1 / 3.9 | missed | holed (differs) | +0.1 / 3.9 | holed | +0.0 / -0.3 |
| 3.5 | +0.2 | +0.2 / 3.9 | missed | missed | +0.2 / 3.9 | missed | -0.0 / +0.0 |
| 3.5 | +0.2 | +0.2 / 3.9 | missed | missed | +0.2 / 3.9 | missed | -0.0 / +0.0 |
| 4.5 | -0.2 | -0.2 / 4.4 | missed | missed | -0.2 / 4.4 | missed | -0.0 / -0.0 |
| 4.5 | -0.2 | -0.2 / 4.4 | missed | missed | -0.2 / 4.4 | missed | -0.0 / +0.0 |
| 4.5 | -0.1 | -0.1 / 4.5 | missed | missed | -0.1 / 4.4 | missed | +0.1 / +0.5 |
| 4.5 | -0.1 | -0.1 / 4.5 | missed | missed | -0.1 / 4.4 | missed | -1.4 / +1.5 |
| 4.5 | -0.1 | -0.0 / 4.5 | missed | missed | -0.0 / 4.4 | missed | -3.7 / +0.8 |
| 4.5 | probe | -0.0 / 4.5 | missed | missed | +0.0 / 4.4 | missed | -4.4 / -0.1 |
| 4.5 | +0.0 | +0.0 / 4.5 | **holed** | missed (differs) | +0.0 / 4.4 | missed | – |
| 4.5 | +0.1 | +0.1 / 4.5 | missed | missed | +0.1 / 4.4 | missed | -3.7 / -1.2 |
| 4.5 | +0.1 | +0.1 / 4.5 | missed | missed | +0.1 / 4.4 | missed | -1.4 / -1.4 |
| 4.5 | +0.1 | +0.1 / 4.5 | missed | missed | +0.2 / 4.4 | missed | +0.0 / -0.2 |
| 4.5 | +0.2 | +0.2 / 4.4 | missed | missed | +0.2 / 4.4 | missed | -0.0 / -0.0 |

The app's rule on WSR's own pass and speed agrees with WSR's verdict on 34 of 47. WSR's pass minus the app's (the break and speed at the cup): offset -0.0 / 0.0 / -0.0, speed +0.0 / 0.3 / -1.8. Rests of the putts that pass the cup more than 0.3 yd away, WSR - app: along –, across – (0 putts).

Hole 20: the ball 3.6 yd from the cup (h20-green.sav); 22 putts, each traced; pass = the ball centre's closest approach to the cup centre, + right of the cup; speed there in yd/s. "App rule" applies the app's cup rule (pass <= 0.15 yd at <= 4.07 yd/s) to WSR's own pass and speed; "app" is the app's own putt (its roll and its rule).

| excess (yd) | line | WSR pass offset / speed | WSR | app rule on WSR's pass | app's own pass offset / speed | app | rest WSR - app, along / across (yd) |
|---|---|---|---|---|---|---|---|
| 1.94 | -0.2 | -0.1 / 1.3 | missed | holed (differs) | -0.1 / 1.2 | holed | +0.1 / +0.3 |
| 1.94 | -0.1 | -0.1 / 1.3 | **holed** | holed | -0.0 / 1.1 | holed | – |
| 1.94 | -0.1 | -0.1 / 1.2 | **holed** | holed | -0.0 / 1.1 | holed | – |
| 1.94 | probe | -0.1 / 1.1 | **holed** | holed | +0.0 / 1.1 | holed | – |
| 1.94 | -0.1 | -0.0 / 1.1 | **holed** | holed | +0.0 / 1.0 | holed | – |
| 1.94 | -0.0 | -0.0 / 1.1 | **holed** | holed | +0.1 / 0.9 | holed | – |
| 1.94 | +0.1 | +0.0 / 0.1 | **holed** | holed | +0.2 / 0.8 | missed | – |
| 1.94 | +0.0 | +0.0 / 1.0 | **holed** | holed | +0.1 / 0.9 | holed | – |
| 1.94 | +0.1 | +0.0 / 0.0 | **holed** | holed | +0.0 / 0.1 | missed | – |
| 1.94 | +0.1 | +0.0 / 0.0 | **holed** | holed | +0.0 / 0.1 | missed | – |
| 1.94 | +0.2 | +0.0 / 0.0 | **holed** | holed | +0.0 / 0.1 | missed | – |
| 2.63 | -0.2 | -0.2 / 1.9 | missed | missed | -0.1 / 2.0 | holed | -0.1 / -0.1 |
| 2.63 | -0.1 | -0.1 / 1.9 | missed | holed (differs) | -0.1 / 1.8 | holed | +0.0 / +0.3 |
| 2.63 | -0.1 | -0.1 / 1.9 | **holed** | holed | -0.0 / 1.8 | holed | – |
| 2.63 | probe | -0.1 / 1.9 | **holed** | holed | +0.0 / 1.8 | holed | – |
| 2.63 | -0.1 | -0.1 / 1.9 | **holed** | holed | +0.0 / 1.8 | holed | – |
| 2.63 | -0.0 | -0.0 / 1.9 | **holed** | holed | +0.1 / 1.8 | holed | – |
| 2.63 | +0.0 | +0.0 / 1.9 | **holed** | holed | +0.1 / 1.8 | holed | – |
| 2.63 | +0.1 | +0.1 / 1.8 | **holed** | holed | +0.1 / 1.8 | holed | – |
| 2.63 | +0.1 | +0.1 / 1.1 | **holed** | holed | +0.2 / 1.7 | missed | – |
| 2.63 | +0.1 | +0.1 / 1.8 | missed | holed (differs) | +0.2 / 1.7 | missed | +0.0 / -0.4 |
| 2.63 | +0.2 | +0.2 / 1.6 | missed | missed | +0.3 / 1.7 | missed | -0.1 / -0.1 |

The app's rule on WSR's own pass and speed agrees with WSR's verdict on 19 of 22. WSR's pass minus the app's (the break and speed at the cup): offset -0.1 / 0.1 / -0.2, speed -0.0 / 0.2 / -0.7. Rests of the putts that pass the cup more than 0.3 yd away, WSR - app: along –, across – (0 putts).

Hole 20: the ball 3.6 yd from the cup (h20-green.sav); 22 putts, each traced; pass = the ball centre's closest approach to the cup centre, + right of the cup; speed there in yd/s. "App rule" applies the app's cup rule (pass <= 0.15 yd at <= 4.07 yd/s) to WSR's own pass and speed; "app" is the app's own putt (its roll and its rule).

| excess (yd) | line | WSR pass offset / speed | WSR | app rule on WSR's pass | app's own pass offset / speed | app | rest WSR - app, along / across (yd) |
|---|---|---|---|---|---|---|---|
| 3.76 | -0.2 | -0.2 / 2.8 | missed | missed | -0.1 / 2.9 | holed | -0.1 / -0.1 |
| 3.76 | -0.1 | -0.1 / 2.8 | missed | holed (differs) | -0.1 / 2.9 | holed | -0.0 / +0.1 |
| 3.76 | -0.1 | -0.1 / 2.8 | missed | holed (differs) | -0.0 / 2.9 | holed | -2.0 / +2.0 |
| 3.76 | probe | -0.1 / 2.8 | **holed** | holed | +0.0 / 2.9 | holed | – |
| 3.76 | -0.1 | -0.1 / 2.8 | **holed** | holed | +0.0 / 2.7 | holed | – |
| 3.76 | -0.0 | -0.0 / 2.8 | **holed** | holed | +0.1 / 2.7 | holed | – |
| 3.76 | +0.0 | +0.0 / 2.8 | **holed** | holed | +0.1 / 2.7 | holed | – |
| 3.76 | +0.1 | +0.1 / 2.8 | **holed** | holed | +0.1 / 2.6 | holed | – |
| 3.76 | +0.1 | +0.1 / 1.5 | **holed** | holed | +0.2 / 2.6 | missed | – |
| 3.76 | +0.1 | +0.1 / 2.7 | missed | holed (differs) | +0.2 / 2.6 | missed | +0.2 / -0.5 |
| 3.76 | +0.2 | +0.2 / 2.6 | missed | missed | +0.3 / 2.6 | missed | -0.0 / -0.2 |
| 4.9 | -0.2 | -0.2 / 3.5 | missed | missed | -0.1 / 3.6 | holed | -0.1 / -0.2 |
| 4.9 | -0.1 | -0.1 / 3.6 | missed | holed (differs) | -0.1 / 3.6 | holed | +0.1 / +0.0 |
| 4.9 | -0.1 | -0.1 / 3.6 | missed | holed (differs) | -0.0 / 3.6 | holed | -2.5 / +2.4 |
| 4.9 | probe | -0.1 / 3.6 | missed | holed (differs) | +0.0 / 3.6 | holed | -5.0 / +2.4 |
| 4.9 | -0.1 | -0.1 / 3.6 | **holed** | holed | +0.0 / 3.6 | holed | – |
| 4.9 | -0.0 | -0.0 / 3.6 | **holed** | holed | +0.0 / 3.6 | holed | – |
| 4.9 | +0.0 | +0.0 / 3.5 | **holed** | holed | +0.1 / 3.6 | holed | – |
| 4.9 | +0.1 | +0.1 / 3.5 | **holed** | holed | +0.1 / 3.6 | holed | – |
| 4.9 | +0.1 | +0.1 / 3.5 | missed | holed (differs) | +0.2 / 3.6 | missed | -2.7 / -2.3 |
| 4.9 | +0.1 | +0.1 / 3.5 | missed | holed (differs) | +0.2 / 3.6 | missed | +0.1 / -0.4 |
| 4.9 | +0.2 | +0.2 / 3.4 | missed | missed | +0.2 / 3.6 | missed | +0.0 / -0.2 |

The app's rule on WSR's own pass and speed agrees with WSR's verdict on 14 of 22. WSR's pass minus the app's (the break and speed at the cup): offset -0.1 / 0.1 / -0.1, speed -0.1 / 0.3 / -1.2. Rests of the putts that pass the cup more than 0.3 yd away, WSR - app: along –, across – (0 putts).

<!-- end:cup -->

WSR's line at the cup sits 0.005-0.013 yd from the app's on holes 2 and 11
(measured on putts passing beyond 0.175 yd, which the rim's funnel cannot
touch) and 0.08-0.09 yd from it on hole 20's 8.1 deg cup: the app's roll
over the 0.5 yd height grid is good on gentle greens and off by most of a
cup's radius on a steep one. Putts that miss more than 0.2 yd from the
centre rest where the app's roll rests, to 0.02-0.06 yd rms; putts that miss
within 0.16 yd are thrown by WSR's rim (the flag is out on the green), up to
4.8 yd shorter and 1.9 yd sideways than the app's roll, which has no rim:
that changes where a near miss ends, not whether it drops.

### 5.2 The capture window

Bisected edges (`run-cupedge.mjs`, `results/cupedge-*.json`): per speed at
the cup, the line holed and missed on each side of the cup by five halvings
(6 mm steps), from hole 2's spot, from three more spots around the same cup
reached by real putts (uphill, downhill, the far side; `make-greenspot.mjs`)
and from hole 11's; with WSR's own line measured on two putts passing 0.25 yd
either side:

<!-- begin:cupedge -->
Hole 2: the ball 3.7 yd from the cup (h02-far.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 0 | 1.17 | holed | 0.138 / 0.144 | 0.125 / 0.131 | 0.134 | -0.006 |
| 0.5475 | 1.82 | holed | 0.125 / 0.131 | 0.119 / 0.125 | 0.125 | -0.003 |
| 1.7781 | 2.63 | holed | 0.106 / 0.113 | 0.100 / 0.106 | 0.106 | -0.003 |
| 3.3135 | 3.60 | holed | 0.056 / 0.063 | 0.044 / 0.050 | 0.053 | -0.006 |

Hole 2: the ball 3.6 yd from the cup (h02-high.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 0 | 1.81 | holed | 0.119 / 0.125 | 0.125 / 0.131 | 0.125 | +0.003 |
| 0 | 1.81 | holed | 0.119 / 0.125 | 0.125 / 0.131 | 0.125 | +0.003 |
| 1.1934 | 2.70 | holed | 0.100 / 0.106 | 0.100 / 0.106 | 0.103 | +0.000 |
| 2.6504 | 3.60 | holed | 0.044 / 0.050 | 0.063 / 0.069 | 0.056 | +0.009 |

Hole 2: the ball 3.7 yd from the cup (h02-low.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 1.0572 | 1.00 | holed | 0.138 / 0.144 | 0.131 / 0.138 | 0.138 | -0.003 |
| 1.6248 | 1.82 | holed | 0.125 / 0.131 | 0.119 / 0.125 | 0.125 | -0.003 |
| 2.7663 | 2.70 | holed | 0.106 / 0.113 | 0.100 / 0.106 | 0.106 | -0.003 |
| 4.0968 | 3.69 | holed | 0.063 / 0.069 | 0.063 / 0.069 | 0.066 | +0.000 |

Hole 2: the ball 3.7 yd from the cup (h02-green.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 0.2203 | 0.92 | holed | 0.131 / 0.138 | 0.150 / 0.156 | 0.144 | +0.009 |
| 0.8907 | 1.80 | holed | 0.119 / 0.125 | 0.125 / 0.131 | 0.125 | +0.003 |
| 2.0229 | 2.79 | holed | 0.100 / 0.106 | 0.113 / 0.119 | 0.109 | +0.006 |
| 3.6075 | 3.60 | holed | 0.044 / 0.050 | 0.056 / 0.063 | 0.053 | +0.006 |

Hole 2: the ball 3.7 yd from the cup (h02-green.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 0.15 | 0.90 | holed | 0.131 / 0.138 | 0.156 / 0.163 | 0.147 | +0.012 |
| 0.5 | 1.32 | holed | 0.125 / 0.131 | 0.131 / 0.138 | 0.131 | +0.003 |
| 1 | 1.84 | holed | 0.113 / 0.119 | 0.125 / 0.131 | 0.122 | +0.006 |
| 1.5 | 2.39 | holed | 0.094 / 0.100 | 0.119 / 0.125 | 0.109 | +0.012 |
| 2.5 | 2.97 | holed | 0.081 / 0.087 | 0.094 / 0.100 | 0.091 | +0.006 |
| 3 | 3.37 | holed | 0.075 / 0.081 | 0.081 / 0.087 | 0.081 | +0.003 |
| 4 | 3.97 | holed | 0.031 / 0.037 | 0.037 / 0.044 | 0.037 | +0.003 |
| 4.25 | 4.06 | holed | 0.019 / 0.025 | 0.037 / 0.044 | 0.031 | +0.009 |
| 4.75 | 4.25 | holed | 0.000 / 0.006 | 0.019 / 0.025 | 0.012 | +0.009 |

Hole 11: the ball 6.6 yd from the cup (h11-green.sav), 5 bisection steps a side from 0 (holed) and 0.2 yd (missed). Offsets in yd past the cup centre on the app's line; "half-width" = (right + left) / 2 of the bracket middles, "shift" = (left - right) / 2, how far right of the app's line WSR's ball passes.

| excess (yd) | speed at the cup (yd/s, the app's roll) | centre line | right: holed to / missed from | left: holed to / missed from | half-width | shift |
|---|---|---|---|---|---|---|
| 0.15 | 1.63 | holed | 0.125 / 0.131 | 0.106 / 0.113 | 0.119 | -0.009 |
| 0.5 | 1.88 | holed | 0.125 / 0.131 | 0.100 / 0.106 | 0.116 | -0.012 |
| 1 | 2.37 | holed | 0.119 / 0.125 | 0.094 / 0.100 | 0.109 | -0.012 |
| 1.5 | 2.69 | holed | 0.113 / 0.119 | 0.087 / 0.094 | 0.103 | -0.013 |
| 2.5 | 3.37 | holed | 0.081 / 0.087 | 0.063 / 0.069 | 0.075 | -0.009 |
| 3 | 3.51 | holed | 0.069 / 0.075 | 0.050 / 0.056 | 0.063 | -0.009 |
| 4 | 4.25 | holed | 0.031 / 0.037 | 0.006 / 0.013 | 0.022 | -0.013 |
| 4.25 | 4.32 | holed | 0.025 / 0.031 | 0.006 / 0.013 | 0.019 | -0.009 |
| 4.75 | 4.47 | missed (0.016) | – | – | – | – |

<!-- end:cupedge -->

Pooled, against the speed at the cup:

<!-- begin:cupwindow -->
| speed at the cup (yd/s) | half-width (yd) | how | where | note | the app's rule |
|---|---|---|---|---|---|
| 0.74 | 0.117 | traced | hole 20 | holed to 0.098, missed from 0.137 | 0.150 |
| 0.90 | 0.147 | bisected | hole 2 green |  | 0.150 |
| 0.92 | 0.144 | bisected | hole 2 green | WSR's line +0.009 off the app's | 0.150 |
| 1.00 | 0.138 | bisected | hole 2 low | WSR's line -0.002 off the app's | 0.150 |
| 1.17 | 0.134 | bisected | hole 2 far | WSR's line -0.008 off the app's | 0.150 |
| 1.32 | 0.131 | bisected | hole 2 green |  | 0.150 |
| 1.43 | 0.114 | traced | hole 2 | holed to 0.101, missed from 0.127 | 0.150 |
| 1.63 | 0.119 | bisected | hole 11 green |  | 0.150 |
| 1.79 | 0.118 | traced | hole 20 | holed to 0.098, missed from 0.138 | 0.150 |
| 1.80 | 0.125 | bisected | hole 2 green | WSR's line +0.007 off the app's | 0.150 |
| 1.81 | 0.125 | bisected | hole 2 high | WSR's line +0.002 off the app's | 0.150 |
| 1.81 | 0.125 | bisected | hole 2 high | WSR's line +0.002 off the app's | 0.150 |
| 1.82 | 0.125 | bisected | hole 2 far | WSR's line -0.008 off the app's | 0.150 |
| 1.82 | 0.125 | bisected | hole 2 low | WSR's line -0.002 off the app's | 0.150 |
| 1.83 | 0.122 | traced | hole 11 | holed to 0.106, missed from 0.138 | 0.150 |
| 1.84 | 0.122 | bisected | hole 2 green |  | 0.150 |
| 1.88 | 0.116 | bisected | hole 11 green |  | 0.150 |
| 2.37 | 0.109 | bisected | hole 11 green |  | 0.150 |
| 2.39 | 0.109 | bisected | hole 2 green |  | 0.150 |
| 2.63 | 0.106 | bisected | hole 2 far | WSR's line -0.007 off the app's | 0.150 |
| 2.67 | 0.093 | traced | hole 20 | holed to 0.086, missed from 0.100 | 0.150 |
| 2.69 | 0.103 | bisected | hole 11 green |  | 0.150 |
| 2.69 | 0.101 | traced | hole 2 | holed to 0.100, missed from 0.101 | 0.150 |
| 2.70 | 0.103 | bisected | hole 2 high | WSR's line +0.002 off the app's | 0.150 |
| 2.70 | 0.106 | bisected | hole 2 low | WSR's line -0.002 off the app's | 0.150 |
| 2.79 | 0.109 | bisected | hole 2 green | WSR's line +0.005 off the app's | 0.150 |
| 2.97 | 0.091 | bisected | hole 2 green |  | 0.150 |
| 3.06 | 0.077 | traced | hole 11 | holed to 0.055, missed from 0.100 | 0.150 |
| 3.37 | 0.075 | bisected | hole 11 green |  | 0.150 |
| 3.37 | 0.081 | bisected | hole 2 green |  | 0.150 |
| 3.51 | 0.063 | bisected | hole 11 green |  | 0.150 |
| 3.52 | 0.064 | traced | hole 20 | holed to 0.060, missed from 0.069 | 0.150 |
| 3.60 | 0.056 | bisected | hole 2 high | WSR's line +0.001 off the app's | 0.150 |
| 3.60 | 0.053 | bisected | hole 2 far | WSR's line -0.006 off the app's | 0.150 |
| 3.60 | 0.053 | bisected | hole 2 green | WSR's line +0.007 off the app's | 0.150 |
| 3.64 | 0.076 | traced | hole 2 | holed to 0.052, missed from 0.099 | 0.150 |
| 3.69 | 0.066 | bisected | hole 2 low | WSR's line -0.001 off the app's | 0.150 |
| 3.94 | 0.028 | traced | hole 11 | holed to 0.009, missed from 0.046 | 0.150 |
| 3.97 | 0.037 | bisected | hole 2 green |  | 0.150 |
| 4.06 | 0.031 | bisected | hole 2 green |  | 0.150 |
| 4.19 | 0.028 | traced | hole 2 | holed to 0.007, missed from 0.048 | 0 (too fast) |
| 4.25 | 0.022 | bisected | hole 11 green |  | 0 (too fast) |
| 4.25 | 0.012 | bisected | hole 2 green |  | 0 (too fast) |
| 4.32 | 0.019 | bisected | hole 11 green |  | 0 (too fast) |
| 4.47 | 0.008 | traced | hole 11 | holed to 0.001, missed from 0.015 | 0 (too fast) |
| 4.47 | 0.000 | bisected | hole 11 green | the centre line missed | 0 (too fast) |
| 4.71 | 0.000 | traced | hole 2 | holed to –, missed from 0.000 | 0 (too fast) |
<!-- end:cupwindow -->

The window is a function of the speed at the cup: 0.147 yd at 0.9 yd/s, 0.13
at 1.3, 0.12 at 1.8, 0.11 at 2.4, 0.10 at 2.7, 0.08 at 3.4, 0.03 at 4.0 and
nothing past about 4.4. Hole 2's 3.95 deg cup approached across the slope
from either side, straight up it and straight down it gives the same window
at the same speed (0.13-0.14 yd at 0.9-1.2 yd/s, 0.124-0.126 at 1.8, 0.10-
0.11 at 2.7), symmetric once WSR's own line is measured (the left / right
asymmetries in the app's frame are the 0.002-0.012 yd the app's line is off),
and hole 11's 1.2 deg cup gives the same curve. Hole 20's 8.1 deg cup (the
steepest pin a saved round has; WSR's pins run to 13.1 deg, median 3.95)
gives the same within the traced brackets; there a slow ball aimed above the
cup dies and rolls back rather than passing it, so the "pass" is a different
geometry on that side. The app held anything within 0.15 yd at up to 4.07
yd/s: right at 0.9 yd/s, 0.04-0.06 yd too generous at 2.4-3 yd/s and 0.12 yd
at 4. **Changed**: src/putt.js now holds the measured window (`CUP_WINDOW`,
`cupWindow(v)`; section 9).

### 5.3 The read that forgives the strength

A player sets the aim to the line but swings the strength by feel, so the
read that holes most often is the aim whose holing strengths span the widest
range, at the middle of it (the user's spec, 2026-10-21). With WSR's window
in, the softest holing putt the app used to read sits right on that range's
soft edge: over 1,358 putts of 5-20 yd through every pin of the 21 mesh
greens it was 0.0003-0.004 of putter power from it, and 237 of those reads do
not hole by WSR's window at all. **Changed**: src/putt.js solvePutt finds a
holing line as before (a miss now scored by its margin to the window), then
takes of the aims round it the one whose holing strengths span the most putter
power, at the middle (the putt card shows the range in bars): all 1,358 hole,
the span 0.137-0.173 of putter power against 0.048-0.071, the read 0.05-0.10
inside the nearer edge (0.2-0.4 bars of tolerance either side), 74 ms a solve
against 19. In WSR itself, both reads from six green spots, each putted at
its own aim with the strength off by up to 0.08 of putter power (0.32 bars)
either way (`run-puttread.mjs`, `results/puttread-*.json`):

<!-- begin:puttread -->
| green (spot) | putt (yd) | read | aim (deg) | power | holes in the model | WSR, power off by -0.08 ... +0.08 (x4 = bars) | holed in WSR |
|---|---|---|---|---|---|---|---|
| hole 2 (far) | 3.7 | robust | 3.675 | 0.2496 | 0.1903-0.3090 | . . o o o o o o . | 6 of 9 |
| hole 2 (far) | 3.7 | committed | 7.750 | 0.1640 | – | . . . . o o . . . | 2 of 9 |
| hole 2 (green) | 3.7 | robust | -4.925 | 0.2366 | 0.1938-0.2794 | . . o o o o o . . | 5 of 9 |
| hole 2 (green) | 3.7 | committed | -9.000 | 0.1822 | – | . . . . o o . . . | 2 of 9 |
| hole 2 (high) | 3.6 | robust | 0.100 | 0.2588 | 0.1300-0.3875 | o o o o o o o o o | 9 of 9 |
| hole 2 (high) | 3.6 | committed | 0.000 | 0.1313 | – | . . . . o o o o o | 5 of 9 |
| hole 2 (low) | 3.7 | robust | -0.025 | 0.3400 | 0.2200-0.4601 | o o o o o o o o o | 9 of 9 |
| hole 2 (low) | 3.7 | committed | 0.000 | 0.2200 | – | . . . . o o o o o | 5 of 9 |
| hole 11 (green) | 6.6 | robust | 2.450 | 0.3799 | 0.2952-0.4646 | . o o o o o o o . | 7 of 9 |
| hole 11 (green) | 6.6 | committed | 3.000 | 0.2912 | – | . . . . o o o o o | 5 of 9 |
| hole 20 (green) | 3.6 | robust | 2.950 | 0.3742 | 0.3058-0.4426 | . . . . o o o o o | 5 of 9 |
| hole 20 (green) | 3.6 | committed | 7.000 | 0.2620 | – | . . . . . o o o . | 3 of 9 |

In all: the robust read holed 41 of 54 putts in WSR, the committed one 22 of 54 (o = holed, . = missed, from -0.08 to +0.08 of putter power in 0.02 steps).
<!-- end:puttread -->

### 5.4 Every cup on every green

Sections 5.1-5.3 come from the greens of holes 2, 11 and 20 as 3-hole
rounds reached them, and a 3-hole round draws set-1 pins only: cups of 1.2
to 8.1 deg. WSR's 118 cup locations (`tools/wsr-pins.json`, every hole's
spots) run to 13.1 deg under the cup, 15 of them over 8. `run-pinputts.mjs`
puts the whole battery to each one, from a green state of its hole whose pin
slot was forced through WSR's own choosePin result at hole start
(GlfConfig+0x38 written at 0x803f8e60, after the draw and before the game
derives the pin, the cup and its decal from it; the tee, the ball and every
outcome are the game's own). Real putts take the ball to spots on rings
round the cup, 3 and 8 yd out in 8 directions from up the fall line of the
KCL triangle under the pin and 15 yd out in 4, where the KCL is green; each
spot is saved as a temporary state. From every spot: the app's read at its
aim with the strength moved by up to 0.08 of putter power (0.32 bars)
either way, as in 5.3; six putts that miss on purpose, the app's roll
passing 0.3 yd right and left of the cup at 0.5, 2 and 4 yd of excess, for
the roll's rest and WSR's line at the cup (traced tick by tick on cups of 6
deg or more); and on the four 3 yd spots up, across and down the fall line
the capture window at 1, 2 and 3 yd/s at the cup, bisected as in 5.2 from
the app's line when its putt holes, else from WSR's own line (or the
nearest of the app's offsets that holes), an edge 0.35 yd out where none
misses within 0.2 (WSR's line runs 0.04-0.09 yd off the app's on hole
20's cup).
The speed at the cup is the app's roll's, interpolated between its 0.1 s
path points; 5.2 took the mean speed of the 0.1 s segment the closest
approach fell in, which runs up to 0.1 yd/s either side of it and jumps
from one segment to the next. Outcomes are the look-ahead's records; on
every spot the read's putt is also waited for and traced, and one roll putt
is run in the other mode, against the real ball. The tables fly the app's
side again from each putt's heading and power with `src/putt.js` as it
stands (`node tools/harness/report.mjs pins --write`):

<!-- begin:pins -->
7 cups (results/pins). Per cup: the spots used of those tried; the read's own putt (dq 0) holed in WSR / by the model, over the spots; the read's 9 putts holed in WSR / by the model and how many verdicts agree; the strength that holes at the read's aim, mean over the spots in WSR putter power (x4 = bars): WSR's (0.02 x its putts holed, within the putts' +-0.09) against the model's range clipped to the same +-0.09, and the model's whole range in brackets (a 0.004 scan); the roll's rest, WSR - app along / across the putt (rms, worst; the putts that miss on purpose); WSR's line at the cup minus the app's (mean / rms, putts passing 0.22 yd or more away); the window's half-width at 1 / 2 / 3 yd/s at the cup, WSR's in its own frame (the edges' aims put on WSR's line through the putts 0.25 yd either side; mean over the 3 yd spots) with the app's cupWindow at its speed there in brackets.

| hole | cup | set | slope at the cup: KCL / app (deg) | spots | read: dq 0 holed WSR / model | read putts holed WSR / model (agree) | holing strength WSR / model | roll rest along / across: rms (worst) | line at the cup (mean / rms) | window 1 / 2 / 3 yd/s |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | BM (s0) | 1 | 0.94 / 0.98 | 19 of 21 | 19 / 19 of 19 | 171 / 171 of 171 (171) | 0.180 / 0.180 (0.252) | 0.08 (-0.24) / 0.03 (-0.11) | +0.001 / 0.012 | 0.138 (0.138) / 0.119 (0.118) / 0.093 (0.091) |
| 3 | BM (s1) | 1 | 1.54 / 1.56 | 18 of 21 | 18 / 18 of 18 | 150 / 148 of 162 (158) | 0.167 / 0.166 (0.219) | 0.05 (-0.13) / 0.06 (0.39) | +0.006 / 0.050 | 0.136 (0.138) / 0.120 (0.118) / 0.092 (0.091) |
| 8 | AM (s4) | 2 | 9.39 / 8.83 | 15 of 21 | 10 / 15 of 15 | 66 / 81 of 135 (102) | 0.088 / 0.109 (0.115) | 0.44 (-1.55) / 0.31 (-2.08) | -0.029 / 0.150 | 0.147 (0.138) / 0.117 (0.118) / 0.094 (0.091) |
| 8 | AL (s5) | 2 | 7.31 / 7.32 | 19 of 21 | 14 / 19 of 19 | 89 / 107 of 171 (131) | 0.094 / 0.112 (0.132) | 0.27 (-1.76) / 0.30 (2.14) | -0.009 / 0.087 | 0.140 (0.138) / 0.116 (0.118) / 0.086 (0.091) |
| 21 | 4 (s3) | 1 | 13.08 / 12.56 | 8 of 21 | 4 / 8 of 8 | 16 / 40 of 71 (31) | 0.040 / 0.104 (0.171) | 0.70 (-2.06) / 0.14 (-0.40) | -0.011 / 0.076 | 0.175 (0.138) / 0.123 (0.118) / 0.110 (0.091) |
| 21 | 5 (s4) | 1 | 12.32 / 12.49 | 7 of 21 | 4 / 7 of 7 | 22 / 31 of 62 (51) | 0.063 / 0.086 (0.102) | 1.30 (4.36) / 0.14 (0.37) | +0.030 / 0.154 | 0.151 (0.137) / 0.116 (0.118) / 0.089 (0.091) |
| 21 | 6 (s5) | 1 | 12.88 / 13.05 | 9 of 21 | 7 / 9 of 9 | 38 / 45 of 79 (70) | 0.084 / 0.099 (0.124) | 1.67 (4.52) / 0.17 (0.44) | +0.002 / 0.131 | 0.158 (0.138) / 0.120 (0.118) / 0.100 (0.091) |

By the slope at the cup (KCL), pooled over the cups and their spots:

| slope (deg) | cups | spots | read: dq 0 holed WSR / model | read verdicts agree | holing strength WSR / model | roll rest along / across rms | line at the cup (mean / rms) | window 1 / 2 / 3 yd/s |
|---|---|---|---|---|---|---|---|---|
| 0-2 | 2 | 37 | 37 / 37 of 37 | 329 of 333 | 0.174 / 0.173 (0.236) | 0.07 / 0.05 | +0.003 / 0.035 | 0.137 (0.138, 8) / 0.120 (0.118, 8) / 0.093 (0.091, 8) |
| 2-4 | 0 | | | | | | | |
| 4-6 | 0 | | | | | | | |
| 6-8 | 1 | 19 | 14 / 19 of 19 | 131 of 171 | 0.094 / 0.112 (0.132) | 0.27 / 0.30 | -0.009 / 0.087 | 0.140 (0.138, 3) / 0.116 (0.118, 4) / 0.086 (0.091, 4) |
| 8-10 | 1 | 15 | 10 / 15 of 15 | 102 of 135 | 0.088 / 0.109 (0.115) | 0.44 / 0.31 | -0.029 / 0.150 | 0.147 (0.138, 1) / 0.117 (0.118, 4) / 0.094 (0.091, 4) |
| 10-14 | 3 | 24 | 15 / 24 of 24 | 152 of 212 | 0.063 / 0.097 (0.133) | 1.30 / 0.15 | +0.006 / 0.124 | 0.161 (0.138, 3) / 0.121 (0.118, 11) / 0.103 (0.091, 11) |

The look-ahead against the real ball (the read's putt waited for and traced, the roll putts traced on cups of 6 deg or more, one roll putt per spot in the other mode): 575 putts that waited for the real ball; the look-ahead's records in the same putt put the rest within 0.0000 u of the real ball's on all 575; a look-ahead-only run of the same putt within 0.0000 u on all 285, the same verdict on 285 of 285; the real ball in the cup exactly when the look-ahead holed it on 575 of 575.
<!-- end:pins -->

The steep cups first (hole 8's AL and AM, 7.3 and 9.4 deg, and hole 21's
three, 12.3-13.1 deg; 58 spots, 1,832 putts). Hole 21's faces hold few
spots: no putt rested 3 yd above s3 or on its right (r3-a000 to a090,
15.5-17 deg; three more 3 yd spots there were made in a second run, each
first probed with a putt planned by the tick port below), and from the
green state's ball none on most of the 12-14 deg faces round s4 and s5.
Against the two cups under 2 deg:

- **The read** holes what the model says it holes on the gentle cups (all
  37 own putts, 329 of 333 verdicts agree). On hole 8 its own putt holes
  on 24 of 34 spots in WSR, on hole 21 on 15 of 24 (the model: all), and of
  the 9 strengths WSR holes 155 of 306 and 76 of 212 (the model 188 and
  116); WSR's holing strength there is 0.04-0.09 of putter power, the
  model's 0.09-0.11 (0.17-0.18 for both on the gentle cups).
- **The roll**: the rests of the putts that miss on purpose are 0.05-0.08
  yd rms off along and 0.03-0.06 across on the gentle cups, 0.27-0.44 /
  0.30-0.31 on hole 8's and 0.70-1.67 / 0.14-0.17 on hole 21's; WSR's line
  at the cup 0.01-0.05 yd rms off the app's on the gentle cups and
  0.08-0.15 on the steep ones, up to 0.34 yd from 8-15 yd out.
- **Past 12 deg** WSR's ball rests on faces to 15.6 deg under the ball (36
  of hole 21 s3's 266 rests off the cup lie on faces over 12 deg, 27 over
  13), where src/putt.js rests nothing (CREEP_DEG 12): its ball rolls on, a
  median 1.3-3.8 yd from WSR's rest on hole 21's three cups. The port of
  WSR's ball on a plane (src/wsrsim.js) rests an uphill putt up to 15.5
  deg and none at 16.
  No WSR ball failed to rest (every look-ahead had a rest, no trace was
  cut). The launch hop holds: WSR's speed 0.8-1.5 yd out puts its hop within
  1 point of v0 of LAUNCH_HOP on average at rises of -14 to +14 deg (641
  traced putts on holes 8, 20 and 21).
- **The window** in WSR's own frame, against cupWindow at WSR's own speed
  at the cup: at 2 yd/s within 0.01 yd of it from every side; at 3 yd/s
  0.08-0.10 across (0.09), 0.076-0.089 from above (up to 0.016 narrower)
  and 0.094-0.137 from below (0.003-0.036 wider, most on hole 21's s3 and
  s5); at 1 yd/s 0.131-0.175 against 0.136-0.147, wider on 6 of 7.
- **The slope field** is not where it goes wrong: at the cups the app's
  slope is within 0.56 deg of the KCL triangle's (fall lines 0.7-5 deg
  apart), along WSR's traced paths within 0.5-1.0 deg rms.

The error is the roll's model of the facets: WSR's tick (src/wsrsim.js's
contact routine) run over the green's own KCL triangles follows WSR's
traced paths to 0.025 yd (median of each path's largest gap, 570 traced
putts; the outliers pass within 0.13 yd of the cup, which it lacks, but
one ball it rests on a 13.8 deg face that WSR's rolls on from), and a
read made with it (the aim whose holing strengths span the widest range,
as solvePutt picks it, the cup by cupWindow) putted in WSR at every steep
spot (`run-pinputts.mjs --read-file`, results/pins-portread) holes its own
putt on 56 of 58 spots and 345 of 522 of the 9 strengths, against the
app's read's 39 and 231 of 518.


## 6. The hidden pin-power assist (2e)

From an approach spot on hole 1 reached by a real driver (109.5 yd from the
pin, fairway; `make-spot.mjs`), calm, aimed at the pin, per club: the aim
table rebuilt from a reset (lib/assist.mjs, 140-157 s a club) and saved;
then partial swings at p2 = the table's pin power + d, the raw swing value
fed so the game computes p1, p2 and p3 itself, the state-1 window held open
as a follow-through holds it (25 frames; unheld, the injected trigger often
closes it after one, before the assist can act), with and without backspin
(`run-assist.mjs`, `results/assist-h1.json`):

<!-- begin:assist -->
Hole 1, h01-approach.sav: the ball 109.5 yd from the pin, lie 1, calm, aimed at the pin. The aim table per club: the pin power (index / 256), the best smoothed distance and the build time.

| club | pin power | best (yd) | build (s) |
|---|---|---|---|
| 7iron | 0.6328 | 0.0 | 149 |
| 9iron | 0.9766 | 0.7 | 140 |
| 3iron | 0.3633 | 0.0 | 157 |

| club | swung p2 | p2 - pin power | s7c (bs) | window frames | game power | formula | WSR carry / rest | rest from the pin | port at p2: carry / rest | port at the game's power: carry / rest | WSR rest - port at p2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 7iron | 0.4829 | -0.150 | 0 (0.000) | 14 (not held) | 0.5578 | 0.5578 | 76.4 / 100.9 | 8.6 | 65.4 / 86.4 | 76.0 / 100.4 | +14.5 |
| 7iron | 0.3528 | -0.280 | 0 (0.000) | 25 | 0.4225 | 0.4225 | 56.8 / 80.3 | 29.3 | 45.6 / 67.8 | 56.3 / 79.6 | +12.4 |
| 7iron | 0.3528 | -0.280 | 1 (0.700) | 25 | 0.4225 | 0.4225 | 56.8 / 66.0 | 43.5 | 45.6 / 53.8 | 56.3 / 65.3 | +12.2 |
| 7iron | 0.3969 | -0.236 | 0 (0.000) | 25 | 0.5041 | 0.5041 | 69.0 / 90.5 | 19.0 | 52.5 / 74.8 | 68.5 / 89.3 | +15.7 |
| 7iron | 0.3969 | -0.236 | 1 (0.700) | 25 | 0.5041 | 0.5041 | 69.0 / 76.8 | 32.7 | 52.5 / 61.4 | 68.5 / 76.3 | +15.5 |
| 7iron | 0.4829 | -0.150 | 0 (0.000) | 25 | 0.5578 | 0.5578 | 76.4 / 100.9 | 8.6 | 65.4 / 86.4 | 76.0 / 100.4 | +14.5 |
| 7iron | 0.4829 | -0.150 | 1 (0.700) | 25 | 0.5578 | 0.5578 | 76.4 / 83.4 | 26.1 | 65.4 / 73.4 | 76.0 / 83.0 | +10.1 |
| 7iron | 0.5528 | -0.080 | 0 (0.000) | 25 | 0.5928 | 0.5928 | 81.3 / 108.6 | 1.0 | 75.4 / 97.1 | 80.9 / 108.2 | +11.5 |
| 7iron | 0.5528 | -0.080 | 1 (0.700) | 25 | 0.5928 | 0.5928 | 81.3 / 87.9 | 21.6 | 75.4 / 82.4 | 80.9 / 87.5 | +5.6 |
| 7iron | 0.6029 | -0.030 | 0 (0.000) | 25 | 0.6293 | 0.6293 | 86.2 / 109.5 | **holed** | 82.3 / 108.5 | 85.8 / 111.2 | +0.9 |
| 7iron | 0.6029 | -0.030 | 1 (0.700) | 25 | 0.6293 | 0.6293 | 86.2 / 92.6 | 16.9 | 82.3 / 88.6 | 85.8 / 91.9 | +4.1 |
| 7iron | 0.6629 | +0.030 | 0 (0.000) | 25 | 0.6364 | 0.6364 | 87.1 / 109.5 | **holed** | 90.2 / 110.7 | 86.7 / 112.2 | -1.1 |
| 7iron | 0.6629 | +0.030 | 1 (0.700) | 25 | 0.6629 | 0.6629 | 90.5 / 94.2 | 15.3 | 90.2 / 94.0 | 90.2 / 94.0 | +0.3 |
| 7iron | 0.7129 | +0.080 | 0 (0.000) | 25 | 0.6728 | 0.6728 | 91.8 / 112.5 | 3.1 | 96.8 / 117.8 | 91.5 / 112.0 | -5.3 |
| 7iron | 0.7129 | +0.080 | 1 (0.700) | 25 | 0.7129 | 0.7129 | 97.0 / 100.2 | 9.3 | 96.8 / 99.8 | 96.8 / 99.8 | +0.5 |
| 7iron | 0.7830 | +0.150 | 0 (0.000) | 25 | 0.7080 | 0.7080 | 96.5 / 117.9 | 8.4 | 106.0 / 125.4 | 96.2 / 117.6 | -7.5 |
| 7iron | 0.7830 | +0.150 | 1 (0.700) | 25 | 0.7830 | 0.7830 | 106.3 / 97.5 | 12.6 | 106.0 / 109.4 | 106.0 / 109.4 | -11.9 |
| 7iron | 0.8690 | +0.236 | 0 (0.000) | 25 | 0.7618 | 0.7618 | 103.4 / 109.4 | **holed** | 117.0 / 128.5 | 103.2 / 123.3 | -19.0 |
| 7iron | 0.8690 | +0.236 | 1 (0.700) | 25 | 0.8690 | 0.8690 | 117.2 / 109.6 | 0.6 | 117.0 / 115.6 | 117.0 / 115.6 | -6.0 |
| 9iron | 0.8266 | -0.150 | 0 (0.000) | 16 (not held) | 0.9015 | 0.9015 | 93.1 / 101.9 | 7.7 | 85.8 / 99.6 | 93.0 / 101.7 | +2.3 |
| 9iron | 0.6967 | -0.280 | 0 (0.000) | 25 | 0.7667 | 0.7668 | 80.1 / 93.3 | 16.2 | 72.8 / 85.0 | 79.9 / 93.1 | +8.3 |
| 9iron | 0.6967 | -0.280 | 1 (0.900) | 25 | 0.7667 | 0.7668 | 80.1 / 82.2 | 27.3 | 72.8 / 75.4 | 79.9 / 82.0 | +6.9 |
| 9iron | 0.7407 | -0.236 | 0 (0.000) | 25 | 0.8479 | 0.8479 | 88.0 / 96.4 | 13.1 | 77.3 / 88.9 | 87.9 / 96.4 | +7.5 |
| 9iron | 0.7407 | -0.236 | 1 (0.900) | 25 | 0.8479 | 0.8479 | 88.0 / 86.0 | 23.5 | 77.3 / 79.5 | 87.9 / 85.8 | +6.5 |
| 9iron | 0.8266 | -0.150 | 0 (0.000) | 25 | 0.9015 | 0.9015 | 93.1 / 101.9 | 7.7 | 85.8 / 99.6 | 93.0 / 101.7 | +2.3 |
| 9iron | 0.8266 | -0.150 | 1 (0.900) | 25 | 0.9015 | 0.9015 | 93.1 / 85.8 | 23.8 | 85.8 / 87.2 | 93.0 / 85.7 | -1.5 |
| 9iron | 0.8967 | -0.080 | 0 (0.000) | 25 | 0.9366 | 0.9366 | 96.4 / 106.9 | 2.7 | 92.6 / 101.2 | 96.4 / 106.8 | +5.6 |
| 9iron | 0.8967 | -0.080 | 1 (0.900) | 25 | 0.9366 | 0.9366 | 96.4 / 88.0 | 21.5 | 92.6 / 85.4 | 96.4 / 87.9 | +2.6 |
| 9iron | 0.9468 | -0.030 | 0 (0.000) | 25 | 0.9617 | 0.9617 | 98.8 / 107.7 | 1.9 | 97.3 / 106.6 | 98.7 / 107.9 | +1.0 |
| 9iron | 0.9468 | -0.030 | 1 (0.900) | 25 | 0.9617 | 0.9617 | 98.8 / 88.9 | 20.6 | 97.3 / 88.0 | 98.7 / 88.9 | +0.9 |
| 3iron | 0.2133 | -0.150 | 0 (0.000) | 12 (not held) | 0.2882 | 0.2882 | 56.8 / 88.0 | 21.6 | 38.5 / 68.7 | 55.9 / 86.2 | +19.4 |
| 3iron | 0.1000 | -0.280 | 0 (0.000) | 25 | 0.1958 | 0.1958 | 35.7 / 64.0 | 45.8 | 15.9 / 32.4 | 34.9 / 63.2 | +31.6 |
| 3iron | 0.1000 | -0.280 | 1 (0.250) | 25 | 0.1958 | 0.1958 | 35.7 / 55.6 | 54.1 | 15.9 / 25.7 | 34.9 / 54.4 | +29.8 |
| 3iron | 0.1273 | -0.236 | 0 (0.000) | 25 | 0.2345 | 0.2345 | 44.5 / 74.8 | 35.0 | 21.0 / 41.2 | 43.6 / 74.0 | +33.6 |
| 3iron | 0.1273 | -0.236 | 1 (0.250) | 25 | 0.2345 | 0.2345 | 44.5 / 66.5 | 43.2 | 21.0 / 33.6 | 43.6 / 65.5 | +32.9 |
| 3iron | 0.2133 | -0.150 | 0 (0.000) | 25 | 0.2882 | 0.2882 | 56.8 / 88.0 | 21.6 | 38.5 / 68.7 | 55.9 / 86.2 | +19.4 |
| 3iron | 0.2133 | -0.150 | 1 (0.250) | 25 | 0.2882 | 0.2882 | 56.8 / 79.2 | 30.3 | 38.5 / 59.5 | 55.9 / 77.8 | +19.8 |
| 3iron | 0.2833 | -0.080 | 0 (0.000) | 25 | 0.3233 | 0.3233 | 64.8 / 97.2 | 12.3 | 54.8 / 84.3 | 63.9 / 94.9 | +12.9 |
| 3iron | 0.2833 | -0.080 | 1 (0.250) | 25 | 0.3233 | 0.3233 | 64.8 / 85.3 | 24.2 | 54.8 / 76.0 | 63.9 / 84.4 | +9.3 |
| 3iron | 0.3333 | -0.030 | 0 (0.000) | 25 | 0.3597 | 0.3597 | 72.6 / 109.4 | **holed** | 66.2 / 100.0 | 71.9 / 107.2 | +9.4 |
| 3iron | 0.3333 | -0.030 | 1 (0.250) | 25 | 0.3597 | 0.3597 | 72.6 / 94.9 | 14.6 | 66.2 / 87.0 | 71.9 / 93.2 | +7.9 |
| 3iron | 0.3933 | +0.030 | 0 (0.000) | 25 | 0.3669 | 0.3669 | 74.1 / 111.1 | 2.0 | 78.8 / 118.7 | 73.4 / 109.4 | -7.5 |
| 3iron | 0.3933 | +0.030 | 1 (0.250) | 25 | 0.3801 | 0.3801 | 76.8 / 101.4 | 8.1 | 78.8 / 103.9 | 76.1 / 100.3 | -2.6 |
| 3iron | 0.4434 | +0.080 | 0 (0.000) | 25 | 0.4033 | 0.4033 | 81.7 / 122.2 | 12.7 | 88.9 / 122.4 | 80.9 / 121.2 | -0.2 |
| 3iron | 0.4434 | +0.080 | 1 (0.250) | 25 | 0.4233 | 0.4233 | 85.7 / 109.6 | **holed** | 88.9 / 109.3 | 85.0 / 110.7 | +0.3 |
| 3iron | 0.5133 | +0.150 | 0 (0.000) | 25 | 0.4384 | 0.4384 | 88.6 / 122.1 | 12.6 | 102.7 / 131.6 | 87.9 / 121.5 | -9.5 |
| 3iron | 0.5133 | +0.150 | 1 (0.250) | 25 | 0.4758 | 0.4758 | 95.8 / 115.6 | 6.1 | 102.7 / 122.9 | 95.2 / 115.6 | -7.3 |
| 3iron | 0.5994 | +0.236 | 0 (0.000) | 25 | 0.4922 | 0.4922 | 99.1 / 109.4 | **holed** | 119.6 / 136.2 | 98.5 / 128.2 | -26.8 |
| 3iron | 0.5994 | +0.236 | 1 (0.250) | 25 | 0.5458 | 0.5458 | 106.8 / 85.4 | 24.4 | 119.6 / 133.6 | 109.3 / 126.8 | -48.2 |

Game power minus the formula: +0.0 / 0.0 / -0.0 (mean / rms / worst, 49 swings). WSR minus the port flown at the game's power: carry +0.4 / 0.6 / -2.5 yd; rest -0.8 / 6.7 / -41.4 yd over the 43 not holed (the port has no cup). At the swung power, as the app flies it: carry +5.1 / 11.2 / +23.5, rest +6.3 / 15.3 / -48.2 yd.

<!-- end:assist -->

The assist is real in WSR and is exactly the decoded formula
(wsr-swing-redzone-spin.md 3.5) on all 49 swings, with one addition found
here (wsr-harness-decodes.md 1, lib/assist.mjs): when a simulated power
holes out (the 7-iron's table: best 0.0 yd), the weight is the smaller of
the decoded one and clamp(0.01 + 0.99 (|d| / 0.05)^log2(20), 0.01, 1)
(0x80409a30), so within 0.05 of the holing run's middle the swing is pulled
up to 99 % of the way into it: p2 0.6029 -> 0.6293 and 0.6629 -> 0.6364
around 0.6328, and both balls finished at the cup's edge (0.1 yd). A swing
short of the pin's power is raised whatever the backspin; one past it is
lowered unless s7c x P1c >= 0.5 (the 7-iron's full spin, 0.7, kept 0.6629,
0.7129, 0.7829 and 0.869 untouched; the 3-iron's 0.25 kept half the pull:
0.3933 -> 0.3801); the largest pull, 0.107 of full power at 0.236 short, is
10.7 yd of carry for the 9-iron, 16.5 for the 7-iron and 23.5 for the
3-iron. Flown at the game's own final power the port carries within 0.6 yd
rms of WSR (the worst, -2.5 yd, a 3-iron that met the flagstick before the
ground); flown at the swung power, as the app flies a partial approach, it
is short by 5.1 yd on average and up to 23.5. Whether the Switch kept the assist is the open test the CLAUDE.md
data-entry caution names; nothing in the app models it, which is right for
the Switch until a sweep shows it.

Two by-products: with full backspin a 7-iron landing past the pin spun back
to it (117.2 yd -> 109.6, the pin at 109.5), which the port does only with
WSR's pin homing (h up to 1.3 when the pull-back points at the pin,
wsr-ground-phase.md 5; the port fixes h = 1 and has no pin: 115.6 without,
109.3 with); and one landing 3 yd short of the pin came back to 97.5 yd from
106.3 (the port with homing: 106.8), most likely off the flagstick, which the
port does not have.

## 7. Backspin and the red zone (2f)

From hole 10's tee, calm (`run-spin.mjs`; A: `results/spin-h10.json`, B and
C: `results/spin-h10-red.json`):

<!-- begin:spin -->
A. Backspin (s7c the swing's input, bs = s7c x P1c on the ball), calm, from hole 10's tee along the default line, over the KCL line:

| club | power | s7c | bs | WSR carry / rest | port carry / rest | rest: WSR - port | spin's cut, WSR / port |
|---|---|---|---|---|---|---|---|
| 3iron | 1 | 0 | 0.000 | 198.9 / 213.0 | 198.9 / 212.9 | +0.1 | 0.0 / 0.0 |
| 3iron | 1 | 0.25 | 0.063 | 198.9 / 210.8 | 198.9 / 210.7 | +0.1 | 2.2 / 2.2 |
| 3iron | 1 | 0.5 | 0.125 | 198.9 / 210.1 | 198.9 / 209.9 | +0.1 | 3.0 / 3.0 |
| 3iron | 1 | 1 | 0.250 | 198.9 / 208.3 | 198.9 / 208.2 | +0.1 | 4.7 / 4.7 |
| 3iron | 0.75 | 0 | 0.000 | 157.5 / 170.2 | 157.3 / 169.8 | +0.3 | 0.0 / 0.0 |
| 3iron | 0.75 | 0.25 | 0.063 | 157.5 / 168.2 | 157.3 / 168.0 | +0.3 | 1.9 / 1.9 |
| 3iron | 0.75 | 0.5 | 0.125 | 157.5 / 167.2 | 157.3 / 166.9 | +0.3 | 2.9 / 2.9 |
| 3iron | 0.75 | 1 | 0.250 | 157.5 / 165.8 | 157.3 / 165.5 | +0.3 | 4.4 / 4.4 |
| 7iron | 1 | 0 | 0.000 | 140.2 / 152.2 | 140.1 / 151.7 | +0.5 | 0.0 / 0.0 |
| 7iron | 1 | 0.25 | 0.175 | 140.2 / 148.4 | 140.1 / 148.0 | +0.4 | 3.8 / 3.7 |
| 7iron | 1 | 0.5 | 0.350 | 140.2 / 147.0 | 140.1 / 146.7 | +0.3 | 5.1 / 5.0 |
| 7iron | 1 | 1 | 0.700 | 140.2 / 144.1 | 140.1 / 143.8 | +0.2 | 8.1 / 7.8 |
| 7iron | 0.75 | 0 | 0.000 | 109.0 / 126.5 | 108.8 / 125.7 | +0.7 | 0.0 / 0.0 |
| 7iron | 0.75 | 0.25 | 0.175 | 109.0 / 121.1 | 108.8 / 120.5 | +0.6 | 5.4 / 5.2 |
| 7iron | 0.75 | 0.5 | 0.350 | 109.0 / 118.8 | 108.8 / 118.1 | +0.7 | 7.6 / 7.6 |
| 7iron | 0.75 | 1 | 0.700 | 109.0 / 115.1 | 108.8 / 114.6 | +0.5 | 11.4 / 11.1 |
| 9iron | 1 | 0 | 0.000 | 107.4 / 118.3 | 107.4 / 118.2 | +0.1 | 0.0 / 0.0 |
| 9iron | 1 | 0.25 | 0.225 | 107.4 / 114.0 | 107.4 / 113.9 | +0.1 | 4.3 / 4.3 |
| 9iron | 1 | 0.5 | 0.450 | 107.4 / 111.7 | 107.4 / 111.7 | +0.1 | 6.5 / 6.5 |
| 9iron | 1 | 1 | 0.900 | 107.4 / 109.0 | 107.4 / 108.8 | +0.2 | 9.3 / 9.4 |
| 9iron | 0.75 | 0 | 0.000 | 82.7 / 99.7 | 82.5 / 98.8 | +0.9 | 0.0 / 0.0 |
| 9iron | 0.75 | 0.25 | 0.225 | 82.7 / 93.2 | 82.5 / 92.5 | +0.7 | 6.5 / 6.3 |
| 9iron | 0.75 | 0.5 | 0.450 | 82.7 / 89.9 | 82.5 / 89.3 | +0.5 | 9.8 / 9.5 |
| 9iron | 0.75 | 1 | 0.900 | 82.7 / 85.9 | 82.5 / 85.7 | +0.3 | 13.7 / 13.2 |
| wedge | 1 | 0 | 0.000 | 58.9 / 63.9 | 58.9 / 63.7 | +0.3 | 0.0 / 0.0 |
| wedge | 1 | 0.25 | 0.250 | 58.9 / 60.6 | 58.9 / 60.4 | +0.2 | 3.3 / 3.2 |
| wedge | 1 | 0.5 | 0.500 | 58.9 / 59.4 | 58.9 / 59.3 | +0.1 | 4.6 / 4.4 |
| wedge | 1 | 1 | 1.000 | 58.9 / 58.3 | 58.9 / 58.2 | +0.1 | 5.6 / 5.4 |
| wedge | 0.75 | 0 | 0.000 | 43.9 / 49.0 | 43.9 / 48.9 | +0.1 | 0.0 / 0.0 |
| wedge | 0.75 | 0.25 | 0.250 | 43.9 / 46.1 | 43.9 / 46.0 | +0.0 | 2.9 / 2.9 |
| wedge | 0.75 | 0.5 | 0.500 | 43.9 / 44.9 | 43.9 / 44.9 | +0.0 | 4.0 / 4.0 |
| wedge | 0.75 | 1 | 1.000 | 43.9 / 43.6 | 43.9 / 43.6 | +0.0 | 5.4 / 5.3 |

Rest, WSR - port: +0.3 / 0.4 / +0.9 yd over 32 shots.

B. The red zone on a full lie (tee), the raw swing value fed past the 1.1 dead band, the game's own power, curve size m, coin and side spin; the window held to its timer:

| club | raw | game power / expected | m / expected | window / expected | side spin | WSR carry, across at carry / rest, across | port (with the game's side spin from the same tick) | across at carry: WSR - port |
|---|---|---|---|---|---|---|---|---|
| driver | 1.12 | 1.0000 / 1.0000 | 0.280 / 0.280 | 22 / 22 | -0.140 | 249.8, +10.6 / 281.0, +2.9 | 251.5, +10.8 / 280.7, +13.7 | -0.2 |
| driver | 1.15 | 1.0000 / 1.0000 | 0.400 / 0.400 | 21 / 21 | -0.200 | 248.6, +15.1 / 281.4, +8.1 | 251.1, +15.5 / 279.6, +19.7 | -0.4 |
| driver | 1.2 | 1.0000 / 1.0000 | 0.600 / 0.600 | 20 / 20 | -0.300 | 246.3, +22.5 / 270.8, +22.0 | 250.2, +23.4 / 278.5, +29.7 | -0.9 |
| driver | 1.25 | 1.0000 / 1.0000 | 0.800 / 0.800 | 18 / 18 | -0.400 | 244.2, +30.1 / 262.9, +31.9 | 249.0, +31.5 / 277.1, +40.0 | -1.4 |
| driver | 1.3 | 1.0000 / 1.0000 | 1.000 / 1.000 | 18 / 18 | -0.500 | 241.9, +37.2 / 259.3, +40.1 | 247.4, +39.3 / 278.4, +50.3 | -2.0 |
| 7iron | 1.12 | 1.0000 / 1.0000 | 0.280 / 0.280 | 22 / 22 | -0.168 | 140.0, +7.1 / 152.8, +9.3 | 139.9, +7.1 / 151.5, +8.5 | +0.0 |
| 7iron | 1.15 | 1.0000 / 1.0000 | 0.400 / 0.400 | 21 / 21 | -0.240 | 139.7, +10.3 / 153.3, +13.2 | 139.6, +10.3 / 151.2, +12.2 | +0.0 |
| 7iron | 1.2 | 1.0000 / 1.0000 | 0.600 / 0.600 | 20 / 20 | -0.360 | 139.0, +15.5 / 152.3, +19.4 | 138.8, +15.5 / 150.4, +18.3 | +0.0 |
| 7iron | 1.25 | 1.0000 / 1.0000 | 0.800 / 0.800 | 18 / 18 | -0.480 | 138.0, +21.0 / 150.7, +26.0 | 137.7, +20.9 / 149.6, +24.8 | +0.1 |
| 7iron | 1.3 | 1.0000 / 1.0000 | 1.000 / 1.000 | 18 / 18 | -0.600 | 136.7, +26.1 / 150.0, +32.3 | 136.3, +25.9 / 148.3, +30.9 | +0.1 |

C. The same from rough (the lie set to 2 before the swing):

| club | raw | game power / expected | m / expected | window / expected | side spin | WSR carry, across at carry / rest, across | port (with the game's side spin from the same tick) | across at carry: WSR - port |
|---|---|---|---|---|---|---|---|---|
| driver | 0.9 | 0.6939 / curve | 0.000 / 0.000 | 25 / 25 | 0.000 | 188.0, -0.0 / 218.5, -2.6 | 188.1, +0.0 / 218.0, +0.0 | -0.0 |
| driver | 1 | 0.7500 / curve | 0.000 / 0.000 | 25 / 25 | 0.000 | 199.7, -0.0 / 231.5, -3.7 | 199.6, +0.0 / 230.5, +0.0 | -0.0 |
| driver | 1.05 | 0.7917 / 0.7917 | 0.333 / 0.333 | 24 / 24 | -0.167 | 207.2, +9.2 / 234.4, +8.8 | 208.3, +9.4 / 240.9, +13.0 | -0.1 |
| driver | 1.15 | 0.8750 / 0.8750 | 0.600 / 0.600 | 21 / 21 | -0.300 | 222.0, +19.0 / 245.7, +21.3 | 224.2, +19.4 / 250.9, +25.6 | -0.5 |
| driver | 1.3 | 1.0000 / 1.0000 | 1.000 / 1.000 | 18 / 18 | -0.500 | 241.0, +36.9 / 256.0, +39.2 | 246.2, +38.8 / 277.4, +50.0 | -1.9 |
| 7iron | 0.9 | 0.6849 / curve | 0.000 / 0.000 | 25 / 25 | 0.000 | 100.1, -0.0 / 119.6, -3.7 | 99.7, +0.0 / 119.0, +0.0 | -0.0 |
| 7iron | 1 | 0.7500 / curve | 0.000 / 0.000 | 25 / 25 | 0.000 | 108.9, -0.0 / 127.8, -2.5 | 108.5, +0.0 / 127.1, +0.0 | -0.0 |
| 7iron | 1.05 | 0.7917 / 0.7917 | 0.333 / 0.333 | 24 / 24 | -0.200 | 113.8, +6.1 / 131.1, +6.3 | 113.9, +6.1 / 129.6, +7.9 | -0.0 |
| 7iron | 1.15 | 0.8750 / 0.8750 | 0.600 / 0.600 | 21 / 21 | -0.360 | 123.6, +12.8 / 141.1, +17.4 | 123.7, +12.9 / 138.4, +16.1 | -0.0 |
| 7iron | 1.3 | 1.0000 / 1.0000 | 1.000 / 1.000 | 18 / 18 | -0.600 | 136.7, +26.1 / 149.1, +31.6 | 136.4, +26.0 / 148.6, +30.9 | +0.1 |

<!-- end:spin -->

- **Backspin**: the port's pull-back is WSR's: rests within 0.0-0.9 yd on all
  32 shots, the spin's cut from the no-spin roll within 0.5 yd (the largest,
  the 9-iron at 3 bars with full spin: WSR 13.7 yd, the port 13.2).
- **The red zone**: the game's launch power, the curve size m and the window
  length are the decoded formulas on all 20 swings (power stays 1.0 on a
  full lie; from rough it rises 0.75 + 0.25 (raw - 1) / 0.3; m = 0.2 + 0.8
  min(1, (raw - 1.1) / 0.2), from rough (raw - 1) / 0.3; the window
  ceil(18 + 28 (1.25 - raw)) frames), and the spin attaches 4 ticks per
  window frame after launch. With that tick the in-air curve is the port's:
  the 7-iron within 0.1 yd at the carry, the driver within 0.2-2.0 yd (the
  bigger the curve, the further off its line the driver lands, onto hole
  10's sloping fairway; that is also why its carry and rest differ by up to
  5.5 and 19 yd). From rough a straight swing launches 2.00 deg off the aim,
  the decoded lie yaw. The first run of this part read the spin tick at
  0x8041489c, one instruction before the hand-off stores it (0x804148a0), so
  it compared the curve with the port curving from launch; those rows were
  dropped and rerun (lib/shot.mjs reads the lifetime there now).

## 8. Whole holes and how forgiving they are (3, optional)

Every hole from its tee state (the round's own pin and wind), played out with
the strokes lib/play.mjs plans; at each of the first two strokes the same
shot also flown with +-0.05 bar and +-0.3 and +-1.1 deg of aim (5- and
10-frame D-pad taps: WSR's turn accelerates, 0.020 deg in the first frame
and 0.00035 rad more each frame to 1.15 deg a frame, so it has no fixed aim
tick; wsr-harness-decodes.md 1), each to its real rest (`run-plan.mjs`,
`results/plan-*.json`). Distances are from the pin.

<!-- begin:plan -->
| hole | stroke | plan | from | to the pin before (yd) | rest from the pin | +0.05 bar | -0.05 bar | 0.3 deg right | 0.3 deg left | 1.1 deg right | 1.1 deg left |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | driver 4.00 bars | tee | 395.5 | 112.5 | 105.5 | 110.8 | 112.8 | 112.1 | 110.7 | 109.4 |
| 1 | 2 | 7iron 2.72 bars | fairway | 112.5 | 0.7 | **holed** | 0.8 | 0.7 | 1.1 | 2.5 | 2.8 |
| 1 | 3 | putter 0.28 bars | green | 0.7 | **holed** | – | – | – | – | – | – |
| 2 | 1 | 7iron 3.96 bars | tee | 152.2 | 2.2 | 3.3 | 1.7 | 2.1 | 1.2 | 3.6 | **holed** |
| 2 | 2 | putter 0.72 bars | green | 2.2 | **holed** | **holed** | **holed** | **holed** | **holed** | **holed** | **holed** |
| 3 | 1 | driver 4.00 bars | tee | 528.1 | 266.8 | 267.1 | 270.3 | 267.8 | 267.8 | 264.0 | 271.2 |
| 3 | 2 | driver 3.64 bars | fairway | 266.8 | 3.7 | 8.1 | 1.3 | 4.3 | 3.3 | 4.8 | 19.4 bunker |
| 3 | 3 | putter 0.62 bars | green | 3.7 | **holed** | – | – | – | – | – | – |
| 4 | 1 | 5iron 3.56 bars | tee | 165.2 | 6.5 | 4.4 | 12.4 | 7.0 | 6.1 | 12.1 | 8.0 |
| 4 | 2 | putter 1.54 bars | green | 6.5 | 0.6 | 0.8 | 0.5 | 0.6 | 0.6 | 0.7 | 0.5 |
| 4 | 3 | putter 0.25 bars | green | 0.6 | **holed** | – | – | – | – | – | – |
| 5 | 1 | driver 4.00 bars | tee | 565.9 | 284.2 rough | 282.0 rough | 283.1 rough | 284.2 rough | 282.5 bunker | 284.7 rough | 283.4 bunker |
| 5 | 2 | driver 3.00 bars | rough | 284.2 | 200.8 rough | 180.9 rough | 181.1 rough | 225.7 rough | 155.8 (water) | 149.3 (water) | 159.1 (water) |
| 5 | 3 | driver 2.72 bars | rough | 200.8 | 8.9 | – | – | – | – | – | – |
| 5 | 4 | putter 1.76 bars | green | 8.9 | 0.7 | – | – | – | – | – | – |
| 5 | 5 | putter 0.28 bars | green | 0.7 | **holed** | – | – | – | – | – | – |
| 6 | 1 | driver 4.00 bars | tee | 421.6 | 118.6 rough | 122.2 rough | 121.9 rough | 118.7 rough | 117.3 rough | 119.1 rough | 116.9 rough |
| 6 | 2 | 7iron 2.52 bars | rough | 118.6 | 11.1 | 11.5 | 8.9 | 11.1 | 10.4 | 12.4 | 27.5 rough |
| 6 | 3 | putter 3.09 bars | green | 11.1 | 1.2 | – | – | – | – | – | – |
| 6 | 4 | putter 0.21 bars | green | 1.2 | 0.8 | – | – | – | – | – | – |
| 6 | 5 | putter 0.43 bars | green | 0.8 | **holed** | – | – | – | – | – | – |
| 7 | 1 | driver 4.00 bars | tee | 387.9 | 174.6 rough | 170.1 rough | 176.2 rough | 176.9 rough | 169.1 rough | 179.3 rough | 154.3 bunker |
| 7 | 2 | spoon 2.08 bars | rough | 174.6 | 68.4 rough | 67.8 rough | 68.8 rough | 68.4 rough | 70.0 (water) | 68.4 rough | 87.6 rough |
| 7 | 3 | 9iron 2.04 bars | rough | 68.4 | 2.9 | – | – | – | – | – | – |
| 7 | 4 | putter 0.71 bars | green | 2.9 | **holed** | – | – | – | – | – | – |
| 8 | 1 | 5iron 3.80 bars | tee | 167.6 | 5.6 | 1.9 | 12.2 | 6.2 | 3.7 | 6.3 | 12.6 |
| 8 | 2 | putter 1.10 bars | green | 5.6 | 0.3 | 0.6 | 0.2 | 0.3 | 0.3 | **holed** | 0.4 |
| 8 | 3 | putter 0.21 bars | green | 0.3 | **holed** | – | – | – | – | – | – |
| 9 | 1 | driver 4.00 bars | tee | 555.8 | 239.2 | 236.1 | 243.2 | 240.3 | 238.6 | 250.9 | 237.8 |
| 9 | 2 | driver 2.96 bars | fairway | 239.2 | 90.4 (water) | 16.2 bunker | 90.3 (water) | 90.1 (water) | 90.7 (water) | 3.0 | 91.6 (water) |
| 9 | 3 | 3iron 1.64 bars | rough | 90.4 | 23.1 | – | – | – | – | – | – |
| 9 | 4 | putter 3.11 bars | fringe | 23.1 | 3.3 | – | – | – | – | – | – |
| 9 | 5 | putter 0.88 bars | green | 3.3 | 1.1 | – | – | – | – | – | – |
| 9 | 6 | putter 0.42 bars | green | 1.1 | **holed** | – | – | – | – | – | – |
| 10 | 1 | driver 4.00 bars | tee | 379.1 | 98.5 | 96.0 | 99.8 | 98.7 | 98.4 | 99.1 | 95.7 |
| 10 | 2 | 9iron 3.64 bars | fairway | 98.5 | 0.5 | **holed** | 0.7 | 0.3 | 1.0 | 0.8 | 1.9 |
| 10 | 3 | putter 0.22 bars | green | 0.5 | **holed** | – | – | – | – | – | – |
| 11 | 1 | spoon 1.64 bars | tee | 136.1 | 14.6 | 16.7 | 12.3 | 14.7 | 14.0 | 11.0 | 13.6 |
| 11 | 2 | wedge 0.56 bars | fairway | 14.6 | 1.4 | 1.8 | 1.8 | 1.4 | 1.5 | 1.2 | 1.6 |
| 11 | 3 | putter 0.44 bars | green | 1.4 | **holed** | – | – | – | – | – | – |
| 12 | 1 | driver 4.00 bars | tee | 459.6 | 311.5 rough | 311.0 rough | 312.0 rough | 312.9 rough | 310.1 rough | 316.5 rough | 306.5 rough |
| 12 | 2 | driver 3.00 bars | rough | 311.5 | 129.6 | 133.5 | 119.0 | 163.7 | 76.3 rough | 200.4 | 75.5 rough |
| 12 | 3 | 7iron 3.52 bars | fairway | 129.6 | 0.7 | – | – | – | – | – | – |
| 12 | 4 | putter 0.25 bars | green | 0.7 | **holed** | – | – | – | – | – | – |
| 13 | 1 | 7iron 3.72 bars | tee | 142.6 | 2.0 | 2.6 | 7.7 | **holed** | 2.3 | 0.4 | 4.5 |
| 13 | 2 | putter 0.55 bars | green | 2.0 | **holed** | **holed** | **holed** | **holed** | **holed** | **holed** | **holed** |
| 14 | 1 | driver 4.00 bars | tee | 359.4 | 205.4 | 205.1 | 206.5 | 205.1 | 206.7 | 200.7 | 201.9 rough |
| 14 | 2 | spoon 3.20 bars | fairway | 205.4 | 4.0 | 12.4 | 13.4 | 4.8 | 3.1 | 13.3 | 4.1 |
| 14 | 3 | putter 0.90 bars | green | 4.0 | **holed** | – | – | – | – | – | – |
| 15 | 1 | driver 4.00 bars | tee | 341.2 | 65.8 (water) | 65.3 (water) | 67.1 (water) | 67.1 (water) | 66.4 (water) | 65.7 (water) | 66.8 (water) |
| 15 | 2 | driver 0.88 bars | rough | 77.9 | 11.9 | 13.8 | 43.2 rough | 12.0 | 11.6 | 14.4 | 12.4 |
| 15 | 3 | wedge 0.48 bars | fairway | 11.9 | 0.6 | – | – | – | – | – | – |
| 15 | 4 | putter 0.30 bars | green | 0.6 | **holed** | – | – | – | – | – | – |
| 16 | 1 | driver 3.84 bars | tee | 250.6 | 19.0 bunker | 48.3 ob | 19.7 bunker | 22.9 bunker | 73.8 ob | 113.1 ob | 18.1 bunker |
| 16 | 2 | wedge 1.00 bars | bunker | 19.0 | 2.7 | 3.0 | 2.4 | 2.6 | 2.8 | 2.3 | 3.0 |
| 16 | 3 | putter 0.83 bars | green | 2.7 | 0.7 | – | – | – | – | – | – |
| 16 | 4 | putter 0.28 bars | green | 0.7 | **holed** | – | – | – | – | – | – |
| 17 | 1 | spoon 3.60 bars | tee | 215.5 | 212.2 (water) | 212.4 (water) | 84.3 (water) | 83.7 (water) | 213.0 (water) | 81.8 (water) | 136.9 (water) |
| 17 | 2 | driver 3.00 bars | rough | 212.2 | 31.4 | 41.3 rough | 28.0 | 32.2 | 30.2 | 36.6 | 24.2 |
| 17 | 3 | wedge 1.48 bars | fairway | 31.4 | 1.2 | – | – | – | – | – | – |
| 17 | 4 | putter 0.38 bars | green | 1.2 | **holed** | – | – | – | – | – | – |
| 18 | 1 | driver 4.00 bars | tee | 455.2 | 225.6 rough | 224.3 rough | 223.9 rough | 226.8 rough | 224.8 rough | 229.6 rough | 221.6 rough |
| 18 | 2 | driver 3.00 bars | rough | 225.6 | 220.7 (water) | 220.7 (water) | 220.5 (water) | 138.2 (water) | 220.7 (water) | 120.4 (water) | 220.4 (water) |
| 18 | 3 | driver 3.00 bars | rough | 220.7 | 220.6 (water) | – | – | – | – | – | – |
| 18 | 4 | driver 3.00 bars | rough | 220.6 | 220.6 (water) | – | – | – | – | – | – |
| 18 | 5 | driver 3.00 bars | rough | 220.6 | 220.6 (water) | – | – | – | – | – | – |
| 18 | 6 | driver 3.00 bars | rough | 220.6 | 220.6 (water) | – | – | – | – | – | – |
| 18 | 7 | driver 3.00 bars | rough | 220.6 | 220.6 (water) | – | – | – | – | – | – |
| 19 | 1 | driver 4.00 bars | tee | 384.1 | 108.5 rough | 108.0 rough | 110.2 rough | 109.7 rough | 109.2 rough | 108.0 rough | 111.2 rough |
| 19 | 2 | 5iron 2.52 bars | rough | 108.5 | 12.3 | 13.0 | 9.6 | 12.6 | 12.5 | 13.1 | 11.5 |
| 19 | 3 | putter 2.89 bars | fringe | 12.3 | 0.9 | – | – | – | – | – | – |
| 19 | 4 | putter 0.29 bars | green | 0.9 | **holed** | – | – | – | – | – | – |
| 20 | 1 | driver 4.00 bars | tee | 340.1 | 173.6 rough | 173.1 rough | 173.6 rough | 171.9 rough | 174.8 rough | 167.8 rough | 178.8 rough |
| 20 | 2 | driver 2.24 bars | rough | 173.6 | 14.0 rough | 15.7 rough | 22.9 | 13.6 rough | 12.7 rough | 15.4 rough | 23.1 |
| 20 | 3 | wedge 0.72 bars | rough | 14.0 | 7.0 | – | – | – | – | – | – |
| 20 | 4 | putter 2.16 bars | green | 7.0 | **holed** | – | – | – | – | – | – |
| 21 | 1 | driver 4.00 bars | tee | 422.3 | 95.6 | 93.7 | 96.4 | 96.1 | 95.3 | 102.1 | 91.7 |
| 21 | 2 | 3iron 1.44 bars | fairway | 95.6 | 14.7 | 18.4 bunker | 17.4 bunker | 14.5 | 15.3 | 14.3 | 16.2 |
| 21 | 3 | wedge 0.40 bars | fairway | 14.7 | 3.6 | – | – | – | – | – | – |
| 21 | 4 | putter 1.17 bars | fringe | 3.6 | **holed** | – | – | – | – | – | – |

Strokes to hole out: hole 1 3, hole 2 2, hole 3 3, hole 4 3, hole 5 5, hole 6 5, hole 7 4, hole 8 3, hole 9 6, hole 10 3, hole 11 3, hole 12 4, hole 13 2, hole 14 3, hole 15 4, hole 16 4, hole 17 4, hole 18 7 (not holed), hole 19 4, hole 20 4, hole 21 4; 73 over the 20 holed.
<!-- end:plan -->

Tables only; nothing in the app reads them. The planner is the harness's,
not the app's solver: out of reach it lays up at the cap along the game's
line, and its aim-off for wind is one pass of the port's drift along the
line to the pin, which is why hole 17's tee shot in a 20 mph crosswind
(aimed 9.8 deg off) and its six variants all went into the water: the port
flies the line to the pin, not the curve the aimed-off ball takes over the
water beside it. On hole 18 (a 28 mph round) its out-of-reach layup from the
rough, the driver at the rough's cap along the game's line, went into the
water from the same drop six times running (the same shot, so the same
outcome) until a stroke timed out; that hole's rows stop there, and holes 19-21
were played in runs of their own.

## 9. What is right, what is coarse, what to change

**Right (WSR to within the harness's own resolution)**: the launch, the
flight, the bounce and the roll on every surface the port knows, over the
KCL (carry 0.7 yd rms, rest 2.1, the residue trees and cross-slopes); the
wind in the air at every power, direction and speed; backspin; the red
zone's curve; the tree shapes; the roll on a green; the decoded assist.

**Coarse**: the app's terrain grid at banks and in sub-grid relief (2.8 yd
rms of rest against 2.1), and a finer grid read the same way does not help;
the level-across line, which cannot follow a ball that lands or rolls off
it (crosswind, a curve, a side slope at the landing: the largest residues in
sections 2, 3 and 7); the app's roll on a steep green (0.08-0.09 yd off WSR's
line at 3.6 yd on hole 20's 8.1 deg cup against 0.005-0.013 on 1-4 deg
cups).

**Changed in the app (verified)**:

- src/trees.js checks the first 5 yd of the bounce for tree hits (section 4):
  test-trees' numbers unchanged, 2 of 1,260 verdicts changed, both to trunk
  hits WSR confirms.
- src/putt.js holds WSR's measured cup window (5.2) and reads the putt whose
  aim forgives the strength most (5.3): every putt of the 1,358-putt scan
  holes by WSR's window (1,121 did), with 2-3 times the holing span; in WSR
  itself the new reads hole across up to +-0.32 bars of strength error where
  the old ones missed every under-hit. tools/test-putt.mjs's cup cases now
  follow the measured window (0.137 yd off at dying speed, 1.75 yd/s at the
  cup, misses in WSR and in the table), its solves still hole (the 2 deg side
  slope, H7, H6's 20 yd putt), a 30 yd solve takes 66 ms (budget 100); the
  putt digest in tools/test-solver.mjs was re-recorded (18 of its 216 sims
  hole against 16, all 24 solves still hole). The putt card shows the range of
  strengths that drop.

All tools/test-*.mjs pass with both.

**Recommended, not changed** (each needs a decision or more than a small
edit):

1. **Wind: fly the port with it.** The solver's wind model (`c x mph x
   bars` sideways, `stop x (1 + h x mph)` along) is linear in both mph and
   bars; WSR's is mph^0.737 and acts by air time and height, and the port
   reproduces it at every power (section 3.2). Replacing the multipliers by
   the wind in the flights the solver already makes (`run({ wind })` in
   src/model.js's flyer and flightOf, the flat path through a wind-aware
   shape or a flight) would put the drift and the wind's carry at WSR's to
   0.3 yd; c and h would become per-club Switch factors on WSR's wind (1
   until logged sideways misses or wind rows say otherwise). The logged
   rows already go through WSR's wind (tools/build-derived.mjs elevFactor),
   and hole 10's four driver tee shots matched it within 4 yd. The app's
   current model over-aims part-power shots in crosswind 2-4 times and 30
   mph full-power ones by a third.
2. **The roll on a steep green**: the app's line is 0.08-0.09 yd off WSR's
   at 3.6 yd on hole 20's 8 deg cup, and the holing strengths there sit 0.04-
   0.07 of putter power above the model's (the robust read held at its own
   power and above, 5.3); worth a look at the green heights' gradient
   (central differences on the 0.5 yd grid against the KCL's 1.6 yd facets)
   before the steep pins (to 13 deg) are trusted.
3. **The putt read's cost**: 74 ms a solve (19 before); the edge bisection
   could start from the neighbouring aim's edges, or the scan run in a worker,
   if the putt card ever feels slow.
4. **Outer ground and walls**: WSR's constants fix the rests over the KCL
   (10.3 -> 0.4 yd rms) but not over the 2 px grid (12.8 -> 8.9, and 4 clean
   shots worse); worth doing only with a terrain that resolves the walls.
5. **The banks and the cross-slope**: the port over the KCL triangles
   themselves (lib/course.mjs kclProfile, both sides of the line) is the fix
   for both; shipping the triangles (8,000-50,000 a hole) is a larger change.
6. **Pin homing and the flagstick** (section 6): only for backspin shots that
   land past or onto the pin, and only if the Switch kept WSR's homing.
7. **The Switch's irons**: WSR's irons are 14-22 yd short of the logged
   Switch rows from hole 10's tee (section 1); the app already refits them
   from logged rows, which is the right handling.

## 10. What could not be done

- **The Switch itself**: there is no Switch harness, so every number here is
  WSR's; the Switch-only questions (its iron distances, whether it kept the
  assist, its aim step, its cup) stay open, and the app's calibration from
  logged shots remains the way to answer them.
- **An aim tick**: WSR's D-pad turn accelerates (no fixed tick), so section
  8 uses 5- and 10-frame taps; the Switch's stick or button step is a Switch
  measurement.
- **The putter's own assist windows** (0x80407e10-0x80407f28) were not
  decoded or tested: every putt here was held at its power.
- **Steep cups beyond 8 deg**: no saved round has one (WSR's pins reach 13.1
  deg, hole 21); a forced pin (wsr-harness-decodes.md 2) would get there.
- **The plan search** is a sensitivity table of the harness's own planner,
  not an optimisation over plans.
- **Rough and sand lies for 2f** were set by writing the player's lie
  attribute (player+0xb0), not by a ball in the rough; the launch yaw and
  caps it gives are the decoded ones, the ball's surroundings are the tee's.
