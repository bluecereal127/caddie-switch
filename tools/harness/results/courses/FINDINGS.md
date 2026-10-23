# Findings across the 3-hole courses

What the attempts (and the 18-hole rounds before them) have shown that holds on every course. Each course's own NOTES.md has its attempts and its hole-by-hole lessons; the planner's memory of every stroke is results/knowledge/strokes.jsonl.

## The ball

- **Rough and sand launch 2 deg right of the aim.** WSR's lie yaw (tools/research/wsr-swing-redzone-spin.md 4.1) is exactly 2.000 deg for a straight swing; the harness's swings read a curve input of exactly 0 on every stroke, so it is 2 deg at every distance. Fitted on 86 rough strokes (median miss 5.9 yd along the aim, 2.5 along the aim turned 2 deg right). The planner aims rough and sand shots 2 deg left since 2026-10-22.
- **The 2D port is level across its line.** It flies each shot over the KCL profile along the launch line, so cross-slopes, mounds and the real shape of landing areas do not act on its bounce and roll. Over 642 remembered full strokes its rest is a median 3.4 yd from where the ball went, but 67 are 15 yd or more off, recurring on the same tee shots (hole 3 drivers 28 yd, hole 7 22-33, hole 14 43, hole 16 49-58) and on hole 12's island fairway (12 yd too much roll).
- **The 3D port (lib/kclshot.mjs, live in the planner since 2026-10-22 05:37 UTC).** run()'s own tick over the hole's KCL triangles (src/wsrsim.js takes a `ground`, the app never passes one): over 975 real full strokes its rest is a median 0.19 yd from the ball's (p90 1.6, 41 of 15 yd or more, most of them canopy hits, which the 3D flight does not model and the planner's tree check covers), against 3.4 / 14.3 / 85 for the 2D port; no false water calls; 0.5 ms a shot. The planner re-flies its best 150 candidates in 3D (up to 600 a search), takes a 3D rest that is not a hazard and holds at power +-0.01 and aim +-1 deg, and lets a roll cross out-of-bounds ground when the 3D ball comes to rest in play.
- **Hole 12's island holds.** In calm air a driver at 0.90-0.96 aimed 0-6 deg left of the pin line rests on the island fairway 205-226 yd from the pin, every one landing on the forest floor just short and bouncing on; the old rules (no out-of-bounds between landing and rest, 7 yd landing margin) rejected exactly these. The live planner now plays the calm tee as a driver at 0.93, 3 deg left, 211 yd from the pin. One knife edge remains: a landing within a yard of the island's lip (the 3D's one contact a tick against WSR's combined contacts); the planner keeps first contacts 1 yd from those seams.
- **Still better: round-model.mjs** (an earlier workflow's 3D model with trees, flagstick and out of bounds, read from the disc's own KCL and placement files, with the first-tick lift and the wind's height reference fixed): a median 0.02 yd on 443 logged strokes (rms 0.8), all 9 water balls. A planner on it (round-planner.candidate.mjs, fewest expected strokes, holing searches, round-short.mjs's assist-aware short game) is being finished and reviewed.
- **Out-of-bounds ground is ground.** WSR bounces the ball on the out-of-bounds forest (KCL attr 4: friction A 0.7, restitution B 0.3) and walls (12); a ball is out of bounds only when it comes to rest there (the game then puts it back where it was hit, with a penalty stroke). Water and valleys are not contacts: the ball falls in.

## The pin and the cup

The full account is in tools/harness/FLAGSTICK.md (measured in WSR 2026-10-22, 139 shots).

- **The flag is in from every lie but the green, side of the cup and cup** (6, 10, 11): from the fringe too.
- **The flag cloth holes; the stick in flight does not.** The cloth is a small box streaming downwind 2.2–3.1 yd up. A ball through it loses its speed and drops: 18 of 21 holed, and the others stopped 0.19–0.61 yd away. The stick bounces a ball straight back at 0.7 of its speed: 16 of 16 in-flight hits above its base missed by 1.8–24.6 yd. Rolling into the stick holes at up to 3.5 yd/s and bounces out at 5.4–8.
- **In normal play the flag is a tie-break only.** With the 2D era's scatter, a carry aimed at the flag was caught 4.5–5.1 % of the time (an estimated 2.5–2.8 % holed). Otherwise it ran on a mean 20.7 yd past.
- **A hopping ball does not hole.** `round-model.mjs` holes any ball whose centre crosses the cup's window within 2 u of its level. In the game, 10 of 10 balls rolling in holed, but only 1 of 6 still hopping (0.29–1.35 u up). The savestate solver counts a model hole only below 0.25 u up, and after a stick hit only at 3.4 yd/s or less.

## Every pin solved with savestates, then played for real (2026-10-22)

- **The savestate campaign** (`hole-solve.mjs`, run per course by `solve-course.mjs`): every WSR cup on holes 1–18 was played to its target in calm wind from its own tee state. Targets: an ace on a par 3; an eagle on a par 4 or par 5; an albatross on hole 14. Each try is a real swing, and a miss is reloaded. **All 100 cups made it, in calm air**: 719 swings in the cups' result files, 737 with hole 17's experiments (results/solve/SUMMARY.md has every stroke).
  - **Par 3s:** every ace's window was mapped, meaning the aims either side that still hole it. They run from 0 (a knife edge) to 1.88 yd across at the pin (h04-s2).
  - **Hole 14:** all six pins albatrossed. A spoon or driver to the left fairway sets up a straight second shot, which holes from about 190 yd.
  - **Hole 17 s5:** aced through the flag cloth, the only ace found that way. A driver at 0.99 bounces off the 10° upslope and is still rising when the cloth takes it, on the first try.
  - **Hole 17 s4 and s3 (set A):** in calm air the model finds no route on either, so both were aced by rolling slowly into the stick, which the model bounces out but WSR holds.
    - **s4:** a spoon at 0.9536 reached the stick at about 3.7–3.9 yd/s, the third of three tries (`try-cells.mjs`).
    - **s3:** its holing strokes fall between the aims the D-pad can reach (0.02–0.06° apart from that tee). A power sweep in the game on a reachable aim holed it on the third stroke: a spoon at 0.9578 at 166.355° (`aim-lattice.mjs`, then `try-cells.mjs`).
    - **Windows:** both are knife edges.
    - **Rounds:** neither pin is drawn in 3-hole rounds.
- **The solver needed four fixes.**
  - **Search wider than the planner's plan.** It searches each club's own nearest approach, up to 6° off the pin line, as well as round the planner's plan. The planner plays safe lines: on h11-s0 its 7-iron goes 4° right and rests 9.8 yd off, while a part-power 3-iron rests 0.01 yd from the pin.
  - **A hole must roll in.** A model hole counts only when the ball's centre is under 0.25 u above the cup's level (see the cup section above).
  - **A finer look-ahead.** When ranking setup strokes, it counts holing cells on the final stroke's fine grid.
  - **The edge search** gets three tries per aim.
- **Natural rounds replay the solutions.** In WSR a 3-hole round draws only set B (s0–s2), plus hole 1's three spots and hole 18's one. In 443 logged draws there was no set-A pin, so every pin such a round can draw is solved. The rounds ran from the course menu in calm wind (results/playbook).
  - **The playbook** (`playbook.mjs`, asked by `round-play.mjs` before the planner) replays a solved cup's stroke when the ball is on that stroke's own spot.
  - **Aim drift.** The D-pad reaches aims 0.001–0.055° off the solve's: its release timing varies, while in the solve every try started from the same frame. Par 3 aces mostly survive this. A setup stroke, though, then rests 0.02–1.3 yd off the solved spot.
  - **The fix.** After the D-pad aims, the playbook re-solves the power for the aim actually reached (`adjustPower`). Near a solved spot, it searches for a holing shot from where the ball really is (`lookupNear`): one holed from 2.8 yd away.
- **Result: all six courses at the goal.**
  - Classic B −7 (1-2-2) and Classic C −6 (2-1-3), on their first attempts.
  - Resort A, Resort B, Resort C and Classic A −6, on their first attempt after the fix went live (attempts 10–12). Before it, those four repeated −4 or −5.

## Back in the game's own wind: all six courses at -5 or better, first attempt (2026-10-22)

- **Natural rounds again.** Played from the course menu in the game's own wind and pins (results/wind), with a goal of -5.
- **The planner.** round-planner.mjs is now the candidate planner (backup: state/round-planner.before-candidate.mjs). It flies every candidate with round-model.mjs and plays for the fewest expected strokes, searching for holing launches whenever the pin is in reach. Before the swap the reviewer's run-all.mjs was re-run on it: 300 logged and 368 adversarial states, no errors and no problems, the longest plan 1.5 s.
- **The aim drift, in wind.** When the D-pad misses a holing stroke's aim, round-play.mjs re-solves the power for the aim actually reached. It uses the hole's own wind and the rolling-in rule, and takes the middle of the longest holing run of powers.
- **Result: every course made the goal on its first attempt.**
  - Classic A -7 (2-1-2), Resort A -6 (2-1-3), Classic B -6 (1-3-2), Classic C -6 (2-2-2), Resort B -5 (2-3-2), Resort C -5 (2-2-3).
  - The winds ran from speed 0 to 15 (30 mph).
  - The planner tried 15 holing strokes from off the green and 14 dropped. The one miss was Classic B hole 14's 7-iron, rated 54%.

## Every pin at -5 or better in the game's own wind (2026-10-22)

- **The goal.** The user's: -5 or better "for every pin location per hole", which takes all of WSR's pins, sets A and B. A 3-hole round draws only set B, so the pins are forced at each hole's start (the user allowed setting them).
  - **Hole 1:** `round-start.mjs --pin`, the force armed with the course tile's A press, in one eval.
  - **The next hole:** `round-play.mjs forceNext`, armed right after the previous hole's holing stroke.
  - **The supervisor:** `course-supervisor.mjs --cover` forces each hole's first pin not yet played in a round at the goal or better. It reads the pins an attempt actually played back from its strokes.
- **Result: all 100 pins covered.** That took 36 rounds, 6 per course with the series' first rounds included, and every one came in at -5 or better.
  - Rounds at -7: 15. At -6: 17. At -5: 4.
  - 203 strokes in all, a mean of 5.6 a round.
  - The planner's holing strokes: 93 of 103 dropped.
  - The hardest calm pins held up in wind: hole 17's s3 and s4 were both aced in their rounds.
- **A trap for the next eval that halts the CPU.** The driver's eval wrapper clears the breakpoints and resumes after each eval, so an eval must end with the CPU halted. The first hole-1 forces ended it running and reported "go() while running", although the force had taken.

## The game's hidden assist on partial swings

- WSR pulls a partial swing's power toward the power its own look-ahead table says lands nearest the pin, while the swing's follow-through window is open (wsr-swing-redzone-spin.md 3.5). The harness strikes as soon as it is lined up (the user's rule: no waiting), before that table is built, so the pull goes toward a table that is mostly empty: **89 of 376 putts (24 %) launched at a power other than the one swung, most at exactly half** (the pull halfway toward 0); 68 of them still dropped (short putts forgive it), the rest came up short or long. Of 535 partial non-putt swings 22 were pulled (Resort B #8, hole 4: a 10 yd chip at 0.110 launched at 0.055 and stopped 6.5 yd short).
- Not worked around: the user ruled out pausing for it. Open question to the user: a swing that ends at impact (no follow-through frames, so the window closes at once) would stop the pull; it changes the simulated swing, so it waits for the user's word.

## The planner

- **Trees.** A ball resting next to a trunk must be able to leave it: the trunk-gap margin grows from 0.2 yd at the ball to 1 yd by 8 yd out (it was a flat 1 yd from the first point of the path, which trapped Classic B #3's ball behind t14-46 and let a fallback hit the trunk five times). When nothing passes the full rules the planner relaxes them in two levels and searches all round the ball; it never flies a path into a trunk or canopy.
- **Memory.** A line that put a ball into a tree or a hazard, rested 15 yd or more from the port, or was put back by the game is not tried again from within 4 yd of that spot; a stroke repeating an earlier one (spot within 1.5 yd, lie, club, power within 0.006, line within 0.3 deg, wind) is corrected by what that one did. Attempts that draw the same wind replay their good holes exactly (Classic B #4 and #5 both eagled hole 14 the same way). The match was looser (3 yd, 0.03, 1.5 deg) until 2026-10-22 and its "repeats" landed on other ground: over the first 13-15 attempts per course the corrected strokes missed their plans by 9.1 yd on Resort C and 7.1 on Classic B (against 5.9 and 3.9 uncorrected), and only 0-12 of each course's 74-95 full strokes used one; the approaches did not get closer from the first half of the attempts to the second (Resort A 2.8 -> 2.0 yd, Resort B 7.0 -> 5.0, Resort C 5.6 -> 7.3, Classic A 1.9 -> 3.9, Classic B 4.5 -> 5.7, Classic C 11.5 -> 12.2). Planned next: a per-hole correction by landing area learned from every stroke there in any wind, on top of the 3D port.
- **Lies.** When two rests' best second shots are about as good, the planner leans 1 yd against the rough and 3 against sand.

## The harness

- The game writes a round's last-hole count after the holing shot's replay; the harness re-reads it for up to 30 s (Resort A #7's eagle read 0 once).
- Fair-play audit (Opus, 2026-10-22, over the 18-hole rounds): fair since the user's rule change, with exceptions. Rounds 1-4's first holes were played under the old waits (holdWindow, 25-72 s before putts and partial swings), including the -17 card saved as best.png (round 4); round 8's -17 is the cleanest best. Every round (and every 3-hole attempt) boots from the same menu savestate, so wind draws repeat and later rounds replay earlier holes; the audit counts that as practice rounds. One putt (round 1, hole 16) was struck about 67 s after the ball was ready, logged 5.2 s, after a mid-hole restart. The last stroke's look-ahead records were read before every stroke, never used. Fixed since: a mid-hole restart now plans at ready at once (round-play.mjs), and the reads before a stroke stop below the look-ahead records (lib/wsr.mjs readBall({ records: false }), round-play.mjs, lib/play.mjs waitStroke, round-start.mjs); the holed check after the strike still reads the hole record, as the user's rule allowed.

## A natural 18 with the current planner (2026-10-22)

- The user asked for one completely natural 18-hole round, no savestates in play (a menu savestate to start from allowed). tools/harness/natural-18.sh: booted on "Number of Holes" (saves/menu-holes.sav), Eighteen Holes through the game's menus, then holes 1-18 straight through (round-ctl.mjs), the game's own wind and pins, nothing written, nothing saved or loaded, no restart.
- **37 strokes, -35** (the game's scorecard: results/natural18/round-1-scorecard.png): 2 1 3 1 3 2 2 2 3 | 2 1 2 2 2 2 2 2 3. Three aces (holes 2, 4, 11), two albatrosses (12, 14), eagles on every other par 4 and par 5, birdies on 8, 13 and 17. The earlier 18-hole rounds' best was -17 (round 8).
- **Not a fresh draw.** The menu savestate fixes the game's RNG: started at once, this round drew the same 18 winds as rounds r2, r3, r5, r6, r9 and r12 (and r13's first 8), and the planner's memory (results/knowledge/strokes.jsonl) holds those rounds' strokes, which it avoids and corrects by. So it is the best play of a draw the harness had practised. Round 2 is the fresh one: natural-18.sh FRESH=1 idles a random 5-90 s on the menu first (rounds r4, r7, r8 drew other winds from the same state) and gives the planner an empty memory of its own (HARNESS_KNOW).
- **The fresh round: 35 strokes, -37** (round 2, results/natural18/round-2-scorecard.png): 2 1 3 1 3 2 2 1 3 | 2 1 2 1 3 2 2 2 2. Idled 41 s on the menu, so a new draw: no hole shares its wind with round 1, and at most one with any earlier round (r7, by chance); the planner's memory held only this round's own strokes (35 rows). Five aces (holes 2, 4, 8, 11, 13), two albatrosses (12, 18), eagles on every other par 4 and par 5, one birdie (17). No savestate saved or loaded after the menu, the game's own wind and pins, no restart.


## Headless / no-video Dolphin (measured 2026-10-22)

- Dolphin's Null video backend (nothing drawn) and no speed limit (EmulationSpeed 0), through lib/dolphin.mjs's HARNESS_GFX / HARNESS_SPEED: h10-s0's full-power driver on the game's aim in 16 mph rests at the same position to the bit as under D3D at 100%, so the game's physics do not depend on either.
- No gain: the stroke took 20 s either way (the boot 10 s against 16), and an idle instance uses 0.87 of a core with Null against 0.90 with D3D. Drawing at native resolution is nearly free; emulating the CPU in real time is what costs (single-core mode, which the GDB control needs), so an instance cannot run much past 100% on this machine, and a stroke's wall time is the game's own time (the flight, the camera) plus the harness's real-time input (D-pad presses at ~0.2 s, already the fewest, the swing motion, the 120 ms polls). The levers left are the planners' CPU (about half of a wind's time) and the number of instances.
