# The flagstick and the flag in WSR

What the ball meets at the pin, what WSR does with it, and whether aiming at it pays. Decoded from main.dol (NTSC-U rev 1) into `lib/flagstick.mjs`, measured in WSR through the harness on 2026-10-22 (139 shots from savestates, every swing through the game's own pipeline), and checked against the planner's stroke memory. The raw data is in `state/flagstick/` (gitignored): `measure.json` (every shot, traced tick by tick), `summary-table.md` (the four experiments' rows), `history.json` / `history.out` (the memory analysis), `selftest.out` (the model's own tests).

## In short

- **There are two things at the pin, not three.** The stick is a thin capsule (0.066 yd from its axis to the ball's centre, from the cup's floor to 3.35 yd up). The flag cloth is a small box that streams downwind 2.2–3.1 yd up. The "catch box at the pin's base" in `tools/research/wsr-ground-phase.md` is the flag cloth's box: its frame is the flag's, not the base's.
- **The flag is in for every lie but the green.** WSR skips both tests only when the player stands on the green (lie 6), the side of the cup (10) or in the cup (11). From the fringe (9), fairway, rough, sand and tee, the stick and the flag are there.
- **The flag cloth catches and holes.** A ball whose centre passes through the cloth loses nearly all its horizontal speed and drops beside the cup: 18 of 21 catches holed; the other three stopped 0.19–0.61 yd away.
- **The stick in the air throws the ball away.** It bounces the ball straight back at 0.7 of its approach speed: 16 of 16 in-flight hits above its base missed, resting 1.8–24.6 yd from the pin (a 7-iron at 26 yd/s: 17–25 yd).
- **Rolling into the stick holes if it is slow.** At 0.95–3.5 yd/s, 9 of 10 holed. At 5.4–8 yd/s none did; they stopped 1.1–6.5 yd away. A chip still hopping low into the stick's base at 5.2 yd/s (20° descent) holed 4 of 4.
- **The decode is right.** `lib/flagstick.mjs`'s contact rule agreed with WSR on all 139 shots: contact or not, and stick or flag on all 62 contacts. Its response matches WSR's to 8.4e-6 u/tick.
- **Its outcome rule is not.** Whether a contact ends in the cup agrees on 55 of 62 contacts. The model holes 6 rolling stick hits at 3.4–8 yd/s that WSR bounces out 0.2–4 yd, and its in-flight stick rebounds carry 1.4–2.1 times too far.
- **Aiming at the flag in normal play did not pay.** With the scatter the planner had (1.8 yd along, 2.3 yd across, 1σ), a carry aimed into the flag is caught 4.5–5.1 % of the time, an estimated 2.5–2.8 % holed. Otherwise it lands at the pin and runs on, a mean 20.7 yd away.
- **With savestates and the 3D model it becomes a holing route.** On hole 1 from 109.5 yd, a 7-iron holed through the flag on 11 of 12 catches inside one band of power 0.0045 wide. `round-model.mjs` has the stick but not the cloth, so the savestate solver does not yet search for catches. Adding them is the next step (below).

## The stick

- **Shape (0x80413350 → 0x803f2340).** A vertical capsule centred on the pin position, its axis from 30 u below the pin to 30 u above it. Its radius is 0.1 u, plus the ball's 0.5. Contact means the ball's centre comes within 0.6 u (0.066 yd) of the axis, anywhere from the cup's floor to 30.6 u (3.35 yd) above the green. Measured hits came at up to 0.064 yd from the axis; misses started at 0.067 yd rolling and 0.070 yd in the air. The top cap was hit at 30.3 and 30.6 u, and nothing at 31.3 u or higher.
- **The sweep.** Each tick, the path from last tick's position to the new one is tested in four quarter steps. The first quarter that touches is tested again in four sixteenths, and the ball is moved back to the first sixteenth that touches.
- **Response (0x80413648 with 0.7 and e).** The ball is pushed out along the normal, which is made horizontal. The normal component is reversed and multiplied by 0.7, so it bounces straight back. Everything else in the velocity, vertical included, is capped at e·|v·n|, with e = clamp(0.299·sgn(x)·|x|^1.737 + 0.001, 0.001, 0.3), x = 1 − 2a, and a the approach speed in u/tick. So e is 0.3 for a touch, 0.091 at 0.25 u/tick, and 0.001 from 0.5 u/tick (13.1 yd/s) up. Spin is zeroed.
- **Correction.** `wsr-ground-phase.md` (line 409) has these two numbers swapped ("normal reversed × e, tangential ≤ 0.7 |v_n|"). The stick returns 0.7 of the approach speed and takes nearly all the rest.

## The flag cloth

- **Box (0x80413020 → 0x803ff8ec).** The box sits in a frame the pin rebuilds every frame. It is yawed to the wind angle t (across = (cos t, 0, −sin t); along = (s·sin t, −0.55, s·cos t), so the flag streams downwind and droops), and its centre is at pin + (0, 26, 0) + 3.6 × along.
  - The extension is s = 0.5 + 0.5 × speedIdx / 15.
  - A ball's centre is in the flag when its local coordinates are within |x| ≤ 2, |y| ≤ 2.8 and |z| ≤ 2.8 u. This is a point test; the ball's radius is not added.
  - The cloth reaches 0.8s to 6.4s u from the stick's axis: 0.04–0.35 yd in calm air, 0.09–0.70 yd at 30 mph. It is 4 u (0.44 yd) thick, spans heights 19.7–28.4 u (2.2–3.1 yd), and its centre is 24.0 u up.
- **The flag's frame keeps the wind the hole began with.** The frame sits at pin+0xb8..0xef. It matched `flagFrame()` on six saves (calm, 4 mph, 24 mph). Writing a new wind at the shot does not turn the flag. So the savestate solver's calm runs keep each tee state's own flag direction and extension. A catch search must read the frame from memory, not derive it from the wind it set.
- **Response (0x80413080–0x80413328).** It applies only while the ball moves toward the cloth's plane:
  - a ball within 1 u of the plane is pushed out to 1 u;
  - the speed toward the plane is cut to 0.5 × depth;
  - the horizontal speed is multiplied by 0.1 and nudged 0.012 u/tick toward the stick;
  - the vertical speed is multiplied by 0.1 when rising and 0.98 when falling;
  - spin is zeroed.

  In a few ticks the ball has no horizontal speed left and drops from 2–3 yd up, 0.04–0.7 yd downwind of the stick. A ball already moving away from the plane is left alone: E3 #18 and #21–24 crossed inside the box's far edge and flew on.
- **There is no speed limit.** Catches came at 11.1–25.8 yd/s in the air.

## What WSR did (the four experiments)

Every shot was struck from a savestate in the save's own wind, with the club, power and aim set through the game's pipeline. The real ball was traced every tick at breakpoints on the flag test, the flag's exit, the stick contact and the response.

| Experiment | Shots | Holed | Contacts | What decided it |
|---|---|---|---|---|
| E1: putter from the fringe, 14.2 yd (hole 2, lie 9) | 49 | 10 | 20 stick | Stick hits at 2.1–3.5 yd/s holed (8 of 9; the 3.44 yd/s one stopped 0.21 yd away). At 5.4–8 yd/s (9 hits) they stopped 1.1–6.5 yd away. Two balls missed the stick and still holed through the cup's window: 0.078 yd off at 1.88 yd/s, 0.100 yd at 2.04. |
| E2: 9-iron chip from the fairway, 14.6 yd (hole 11, lie 1) | 27 | 7 | 7 stick | Rolling into the stick at 2.7–3.0 yd/s: 3 of 3 holed. Hopping in low at 5.2 yd/s (descent 20°, 0.2–0.4 u up the stick): 4 of 4 holed. No ball that missed the stick holed (closest 0.053 yd at 5.2 yd/s). |
| E3: wedge pitch from the fairway, 14.6 yd, the flag streaming to the ball's left (hole 11) | 37 | 8 | 12 stick, 9 flag | Flag catches 7 of 9 holed (the others 0.24 and 0.61 yd), on the downwind side 0.10–0.30 yd from the axis at 22–26 u. In-flight stick hits at 4–31 u: 0 of 9 holed (1.8–12.2 yd away). A stick hit at the base (−0.1 u) holed. |
| E4: 7-iron from the fairway, 109.5 yd, the flag streaming toward the ball (hole 1) | 26 | 11 | 7 stick, 12 flag | Flag catches dead on the line at 23.8–26.8 u: 11 of 12 holed (the other 0.19 yd). In-flight stick hits at 0.7–30.6 u: 0 of 7 holed (16.8–24.6 yd away). Nothing caught at 0.09 yd or more across. The 11 holes spanned power 0.8255–0.8300. |

- **The bands, in yards.** E4's caught heights (21–27 u as the ball reaches the stick) are one power band 0.0045 wide, and the stick lies just below it. Too low, and the ball hits the stick and goes 17–20 yd. Too high (30.4–30.6 u), and it hits the stick's top and goes 19–25 yd. Higher still (31.3 u and up), and it clears everything and runs on 9–18 yd. Across the line, the cloth is the 0.44 yd thickness when it streams at the ball. When it streams sideways it is its 0.04–0.35 yd reach, on the downwind side only.
- **Where the model goes wrong on outcomes.** `captureOutcome` gets the outcome right on 55 of 62 contacts. It wrongly holes the six rolling stick hits at 3.4–8 yd/s (by its rim rule) and one flag catch that stopped 0.19 yd out. The rebounds it gives in-flight stick hits run 1.4–2.1 times as far as WSR's.

## What it would have done in normal play

`history.mjs` replayed what aiming the carry at the flag would have done in the planner's stroke memory. It used 306 subjects within reach and 105,876 simulated tries, with the scatter the planner then had: 1.8 yd along and 2.3 yd across (1σ, the 2D port's era). Two debiasing variants (A, B) bracket the numbers.

| | A | B |
|---|---|---|
| caught (stick or flag) | 4.5 % | 5.1 % |
| caught by the flag | 3.1 % | 3.5 % |
| estimated holed | 2.5 % | 2.8 % |
| mean rest when not caught | 20.7 yd | 20.8 yd |

By band, catches ran 4.1–5.2 % from 20 to 150 yd. By wind, 3.6–4.3 % calm, 3.7–4.5 % tail, 5.0–5.9 % cross (the cloth streams sideways and widens the target) and 4.2–4.4 % head. In the memory itself, 44 of 1,121 off-green strokes met the pin (39 the stick, 5 the flag) and only 1 of them holed.

So with normal scatter, aiming at the flag trades a 2–3 % hole for a 20 yd miss, because a carry aimed at the flag lands at the pin and runs on. It is a tie-break between otherwise equal plans, never a plan of its own.

## With savestates and the 3D model

The savestate solver (`hole-solve.mjs`) plays in calm air from each cup's tee state, and corrects each try from the miss before it. `round-model.mjs` is a median 0.02 yd from WSR on full strokes. At that precision the flag is a target:
- **Fly it into the cloth.** E4 holed 11 of 12 catches inside one band 0.0045 of power wide. The cloth is in calm air on every tee state the solver sets calm, but the flag keeps the hole's own starting wind (above). Against a sloped cup, where a rolling ball has to arrive at the right speed and line, this is the steadier route: the cloth takes the ball's speed away whatever it was.
- **Chip or putt into the stick slowly.** From the fringe or fairway, a ball reaching the stick at up to 3.5 yd/s holes. A low hop into its base holed at 5.2 yd/s. The stick then widens the target to the cup's window plus the 0.066 yd capsule.
- **Never hit the stick on the fly.** Every in-flight stick hit above its base missed by 1.8–24.6 yd.

Next step:
1. **Model the cloth.** Add the cloth to the solver's holing-cell search through `lib/flagstick.mjs` (`pinCapture` on the model's traced path, with the flag frame read from the tee state's memory).
2. **Count only what WSR holes.** A catch at 20–27 u counts as holing (18 of 21 in WSR). A stick contact counts only when the ball rolls in at 3.4 yd/s or less, or hops in at the base.
3. **Score the misses.** An in-flight stick hit counts as a miss of 2–25 yd.

## A related correction: the cup itself

The solver's first runs today (2026-10-22, results/solve) gave the cup a matching flaw. `round-model.mjs` holes a ball that crosses the cup's window with its centre anywhere within 2 u above or below the cup's level. On the 16 holes it predicted in the first par 3 runs:
- **Rolling balls holed.** The game holed all 10 balls that were rolling as they crossed (the centre 0.14 u below to 0.03 u above the level).
- **Hopping balls mostly missed.** Of the 6 still hopping (0.29–1.35 u up), the game holed only 1 (hole 4 s1); the others stopped 0.5–1.5 yd away.
- **The rule now.** `round-model.mjs` returns its cup pass (`cupPass`: distance, speed, height above the cup's level, vertical speed). The solver counts a model hole only when the ball rolls in (under 0.25 u up) and, after a stick hit, only at 3.4 yd/s or less (WSR's rim, E1). One near-identical hopping ball holed (hole 4 s1) and one missed (hole 11 s3), so the rule gives up a few real holes to avoid trying shots that miss.
