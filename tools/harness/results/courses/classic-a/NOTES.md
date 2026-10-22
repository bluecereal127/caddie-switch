# Classic A (holes 10, 11, 12, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 22; best -4 (#7, 3-2-3); mean -3.32; last five -3 -3 -3 -4 -4.
- Hole 10 (par 4): best 3, mean 3.00 over 22.
- Hole 11 (par 3): best 1, mean 2.14 over 22.
- Hole 12 (par 5): best 3, mean 3.55 over 22.
- The planner's memory of these holes: 303 strokes from every round and attempt, 4 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 11, assist pulls: #7 stroke 1 (7iron), #6 stroke 1 (7iron).
- Hole 11, strokes 15+ yd from the port's flight: #8 stroke 1 (spoon), #4 stroke 1 (7iron).
- Hole 12, strokes 15+ yd from the port's flight: #21 stroke 1 (driver).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 10 (par 4): 12 rounds, -1 ×11, par ×1.
  - stroke 1 from the tee (driver): 1 time (round-r5: rested 52 yd from the port's rest); the planner no longer tries those lines from those spots.
- Hole 11 (par 3): 12 rounds, -2 ×1, -1 ×8, par ×1, +1 ×2.
- Hole 12 (par 5): 12 rounds, -2 ×2, -1 ×9, par ×1.
  - stroke 2 from the fairway (spoon): 1 time (round-r3: rested 19 yd from the port's rest); the planner no longer tries those lines from those spots.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
- 2026-10-22, hole 12 (the user's point): the island fairway, 218-260 yd from the tee along the pin line and about 45 yd across with out-of-bounds forest round it, leaves the green (about 225 yd on) in reach of the second shot: an eagle putt at worst, an albatross chance. The planner never took it, even in calm air, because the 2D port rolls a driver that carries onto it (218 yd or more) about 50 yd, off its far edge into the forest; no club both carries the forest and stops on the island in that model. The game disagrees: rounds 2 and 3 held it with a full driver into a 14 mph headwind, resting 246 yd along (12 yd short of the port), and made eagle. The 2D port flies a line that is level across; a 3D port over the hole's own KCL triangles is being built and validated on the 642 remembered strokes so the planner sees the island's real roll (workflow kcl-3d-shot-port).
- 2026-10-22 05:37 UTC, hole 12 fixed: the 3D port (lib/kclshot.mjs) shows the island holds in calm air for a driver at 0.90-0.96 aimed 0-6 deg left of the pin line (205-226 yd from the pin), every hold landing on the forest floor just short and bouncing on, as rounds 2 and 3 did; the planner's old rules (no out-of-bounds between landing and rest, a 7 yd landing margin) threw exactly those out. The live planner now flies its candidates in 3D, lets a roll cross out-of-bounds ground when the ball comes to rest in play, and plays the calm tee as a driver at 0.93, 3 deg left, 211 yd from the pin.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 22: 3-2-3 (-4), 2026-10-22 05:44 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.1 yd, wind 6 mph (dir 5): driver 0.99, launched 2.0 deg right of the pin line; planned: fairway, 92 yd from the pin. Result: fairway, 92.0 yd from the pin; against the port's flight -0.4 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: 2.5 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 92.0 yd, wind 6 mph (dir 5): 9iron 0.74, launched 3.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight -1.3 yd along, -0.3 across.
- 10.3 from the green, 1.0 yd, wind 6 mph (dir 5): putter 0.184, aimed -0.075 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 7): 7iron 0.96, launched 1.7 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight -0.8 yd along, +0.5 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 1.5 yd, wind 4 mph (dir 7): putter 0.197, aimed +0.175 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 10 mph (dir 6): driver 0.94, launched 1.0 deg right of the pin line; planned: fairway, 209.9 yd from the pin. Result: fairway, 209.8 yd from the pin; against the port's flight -12.4 yd along, +3.6 across.
- 12.2 from the fairway, 209.8 yd, wind 10 mph (dir 6): spoon 0.76, launched 2.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight +1.8 yd along, +5.2 across.
- 12.3 from the green, 1.4 yd, wind 10 mph (dir 6): putter 0.205, aimed -0.425 deg of the cup. Result: HOLED.

### Attempt 21: 3-2-3 (-4), 2026-10-22 05:40 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 10 mph (dir 3): driver 0.97, launched 0.0 deg left of the pin line; planned: fairway, 86.3 yd from the pin. Result: fairway, 85.7 yd from the pin; against the port's flight -0.3 yd along, -5.6 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 85.7 yd, wind 10 mph (dir 3): 9iron 0.66, launched 4.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +1.2 yd along, -1.3 across.
- 10.3 from the green, 1.0 yd, wind 10 mph (dir 3): putter 0.186, aimed +0.3 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 2 mph (dir 4): 3iron 0.52, launched 1.7 deg right of the pin line; planned: green, 3.1 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight +0.6 yd along, -0.2 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 3.5 yd, wind 2 mph (dir 4): putter 0.285, aimed +0.325 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 470.0 yd, wind 6 mph (dir 5): driver 0.90, launched 0.0 deg right of the pin line; planned: fairway, 220.3 yd from the pin. Result: fairway, 221.5 yd from the pin; against the port's flight -15.0 yd along, +2.2 across. **miss**: rested 15 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 12.2 from the fairway, 221.5 yd, wind 6 mph (dir 5): 3iron 0.96, launched 3.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +8.0 yd along, +1.9 across.
- 12.3 from the green, 1.6 yd, wind 6 mph (dir 5): putter 0.210, aimed -0.1 deg of the cup. Result: HOLED.

### Attempt 20: 3-2-4 (-3), 2026-10-22 05:36 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 10 mph (dir 1): driver 0.95, launched 1.0 deg left of the pin line; planned: fairway, 117.3 yd from the pin. Result: fairway, 117.9 yd from the pin; against the port's flight -0.9 yd along, -6.0 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 117.9 yd, wind 10 mph (dir 1): 7iron 0.83, launched 4.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight +0.4 yd along, -2.4 across.
- 10.3 from the green, 2.2 yd, wind 10 mph (dir 1): putter 0.255, aimed -0.975 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 0 mph (dir 4): 7iron 0.91, launched 1.7 deg right of the pin line; planned: green, 4.7 yd from the pin. Result: green, 5.4 yd from the pin; against the port's flight +0.2 yd along, +0.5 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 5.4 yd, wind 0 mph (dir 4): putter 0.374, aimed +0.65 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 8 mph (dir 0): driver 0.92, launched 39.1 deg right of the pin line; planned: fairway, 317.8 yd from the pin. Result: fairway, 317.5 yd from the pin; against the port's flight -0.0 yd along, -0.2 across.
- 12.2 from the fairway, 317.5 yd, wind 8 mph (dir 0): driver 0.98, launched 4.0 deg right of the pin line; planned: fairway, 59.2 yd from the pin. Result: fairway, 59.2 yd from the pin; against the port's flight +0.2 yd along, +1.6 across.
- 12.3 from the fairway, 59.2 yd, wind 8 mph (dir 0): 9iron 0.50, launched 3.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.8 yd from the pin; against the port's flight -2.1 yd along, +0.1 across.
- 12.4 from the green, 1.8 yd, wind 8 mph (dir 0): putter 0.230, aimed +0 deg of the cup. Result: HOLED.

### Attempt 19: 3-2-4 (-3), 2026-10-22 05:32 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 10 mph (dir 6): driver 1.00, launched 6.0 deg right of the pin line; planned: fairway, 109.1 yd from the pin. Result: fairway, 98.6 yd from the pin; against the port's flight +9.0 yd along, -10.8 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 98.6 yd, wind 10 mph (dir 6): 5iron 0.47, launched 4.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 4.7 yd from the pin; against the port's flight +4.6 yd along, -0.4 across.
- 10.3 from the green, 4.7 yd, wind 10 mph (dir 6): putter 0.331, aimed -0.85 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 139.4 yd, wind 2 mph (dir 7): 7iron 0.93, launched 1.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.3 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: 3.6 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 6.6 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 1.6 yd, wind 2 mph (dir 7): putter 0.210, aimed +0.25 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 8 mph (dir 3): driver 0.92, launched 39.1 deg right of the pin line; planned: fairway, 302.4 yd from the pin. Result: fairway, 302.3 yd from the pin; against the port's flight -0.1 yd along, -0.3 across. **repeat**: planned from classic-a/attempt-17 h12 k1's identical stroke (-0.1 along, -0.3 across the port).
- 12.2 from the fairway, 302.3 yd, wind 8 mph (dir 3): driver 1.00, launched 3.0 deg left of the pin line; planned: fairway, 17 yd from the pin. Result: fairway, 16.9 yd from the pin; against the port's flight +4.1 yd along, +5.5 across. **repeat**: planned from classic-a/attempt-17 h12 k2's identical stroke (+4.1 along, +5.5 across the port).
- 12.3 from the fairway, 16.9 yd, wind 8 mph (dir 3): wedge 0.23, launched 4.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight -0.0 yd along, -0.2 across. **repeat**: planned from classic-a/attempt-17 h12 k3's identical stroke (+0 along, -0.1 across the port).
- 12.4 from the green, 0.2 yd, wind 8 mph (dir 3): putter 0.093, aimed -23.75 deg of the cup. Result: HOLED.

### Attempt 18: 3-2-4 (-3), 2026-10-22 05:27 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 8 mph (dir 7): driver 1.00, launched 1.0 deg left of the pin line; planned: fairway, 107.9 yd from the pin. Result: fairway, 106.9 yd from the pin; against the port's flight +0.9 yd along, +0.8 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 106.9 yd, wind 8 mph (dir 7): 7iron 0.71, launched 3.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight +0.3 yd along, -2.6 across.
- 10.3 from the green, 2.0 yd, wind 8 mph (dir 7): putter 0.237, aimed -0.875 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 139.4 yd, wind 6 mph (dir 2): driver 0.44, launched 1.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 3.6 yd from the pin; against the port's flight -3.3 yd along, +0.4 across. **avoided**: lines that failed from here before, not tried: 3.6 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 6.6 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 3.6 yd, wind 6 mph (dir 2): putter 0.332, aimed -0.275 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 4 mph (dir 4): driver 0.91, launched 36.1 deg right of the pin line; planned: fairway, 286.4 yd from the pin. Result: fairway, 286.5 yd from the pin; against the port's flight +0.1 yd along, +0.0 across.
- 12.2 from the fairway, 286.5 yd, wind 4 mph (dir 4): driver 0.94, launched 1.0 deg left of the pin line; planned: green, 5.4 yd from the pin. Result: fairway, 17.0 yd from the pin; against the port's flight -10.1 yd along, +0.3 across.
- 12.3 from the fairway, 17.0 yd, wind 4 mph (dir 4): wedge 0.21, launched 1.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight -0.0 yd along, +0.9 across.
- 12.4 from the green, 1.0 yd, wind 4 mph (dir 4): putter 0.184, aimed +0.475 deg of the cup. Result: HOLED.

### Attempt 17: 3-2-4 (-3), 2026-10-22 05:23 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 10 mph (dir 6): driver 0.92, launched 1.0 deg right of the pin line; planned: fairway, 111.5 yd from the pin. Result: fairway, 110.6 yd from the pin; against the port's flight +0.8 yd along, +1.8 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 110.6 yd, wind 10 mph (dir 6): 7iron 0.75, launched 6.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 4.9 yd from the pin; against the port's flight +4.0 yd along, -0.6 across.
- 10.3 from the green, 4.9 yd, wind 10 mph (dir 6): putter 0.325, aimed +0.25 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 136.1 yd, wind 2 mph (dir 7): 7iron 0.92, launched 5.0 deg right of the pin line; planned: green, 10.4 yd from the pin. Result: green, 11.5 yd from the pin; against the port's flight +0.5 yd along, +1.0 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1); -2.0 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1).
- 11.2 from the green, 11.5 yd, wind 2 mph (dir 7): putter 0.657, aimed +0.15 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 8 mph (dir 3): driver 0.92, launched 39.1 deg right of the pin line; planned: fairway, 302.6 yd from the pin. Result: fairway, 302.3 yd from the pin; against the port's flight -0.1 yd along, -0.3 across.
- 12.2 from the fairway, 302.3 yd, wind 8 mph (dir 3): driver 1.00, launched 3.0 deg left of the pin line; planned: fairway, 19.7 yd from the pin. Result: fairway, 16.9 yd from the pin; against the port's flight +4.1 yd along, +5.5 across.
- 12.3 from the fairway, 16.9 yd, wind 8 mph (dir 3): wedge 0.23, launched 4.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight +0.0 yd along, -0.1 across.
- 12.4 from the green, 0.2 yd, wind 8 mph (dir 3): putter 0.076, aimed -28.8 deg of the cup. Result: HOLED.

### Attempt 16: 3-1-4 (-4), 2026-10-22 05:19 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 6 mph (dir 2): driver 0.92, launched 0.0 deg left of the pin line; planned: fairway, 101.9 yd from the pin. Result: fairway, 102.2 yd from the pin; against the port's flight -1.0 yd along, -6.5 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 102.2 yd, wind 6 mph (dir 2): 5iron 0.50, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight +3.4 yd along, -1.5 across.
- 10.3 from the green, 3.5 yd, wind 6 mph (dir 2): putter 0.307, aimed -0.825 deg of the cup. Result: HOLED.

Hole 11 (par 3): 1 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 8 mph (dir 6): 7iron 0.93, launched 4.7 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: HOLED. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1). **holed**: holed from 138 yd off the green.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 4 mph (dir 7): driver 0.94, launched 36.1 deg right of the pin line; planned: fairway, 293.7 yd from the pin. Result: fairway, 293.7 yd from the pin; against the port's flight +0.2 yd along, -0.0 across.
- 12.2 from the fairway, 293.7 yd, wind 4 mph (dir 7): driver 0.98, launched 1.0 deg right of the pin line; planned: fairway, 15.3 yd from the pin. Result: fairway, 16.4 yd from the pin; against the port's flight -1.7 yd along, +2.9 across.
- 12.3 from the fairway, 16.4 yd, wind 4 mph (dir 7): wedge 0.21, launched 2.0 deg right of the pin line; planned: green, 0 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight -0.0 yd along, +1.2 across.
- 12.4 from the green, 1.1 yd, wind 4 mph (dir 7): putter 0.190, aimed +0.4 deg of the cup. Result: HOLED.

### Attempt 15: 3-2-3 (-4), 2026-10-22 05:15 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 4 mph (dir 7): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 94 yd from the pin. Result: fairway, 93.5 yd from the pin; against the port's flight +0.3 yd along, -0.7 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 93.5 yd, wind 4 mph (dir 7): 9iron 0.89, launched 3.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.5 yd along, -2.2 across.
- 10.3 from the green, 1.6 yd, wind 4 mph (dir 7): putter 0.222, aimed -0.475 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 136.1 yd, wind 6 mph (dir 1): 7iron 0.92, launched 4.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 3.8 yd from the pin; against the port's flight +4.1 yd along, +1.2 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1); -2.0 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1).
- 11.2 from the green, 3.8 yd, wind 6 mph (dir 1): putter 0.318, aimed +0.95 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 470.0 yd, wind 8 mph (dir 4): driver 0.90, launched 35.4 deg right of the pin line; planned: fairway, 288.3 yd from the pin. Result: fairway, 288.4 yd from the pin; against the port's flight +0.1 yd along, +0.0 across.
- 12.2 from the fairway, 288.4 yd, wind 8 mph (dir 4): driver 0.97, launched 2.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -0.6 yd along, -0.6 across.
- 12.3 from the green, 1.9 yd, wind 8 mph (dir 4): putter 0.223, aimed -0.375 deg of the cup. Result: HOLED.

### Attempt 14: 3-2-4 (-3), 2026-10-22 05:11 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 8 mph (dir 6): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 88.8 yd from the pin. Result: fairway, 88.9 yd from the pin; against the port's flight +2.3 yd along, +1.0 across. **repeat**: planned from classic-a/attempt-3 h10 k1's identical stroke (+2.3 along, +1 across the port). **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 88.9 yd, wind 8 mph (dir 6): 7iron 0.54, launched 4.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 5.2 yd from the pin; against the port's flight +4.8 yd along, -2.2 across.
- 10.3 from the green, 5.2 yd, wind 8 mph (dir 6): putter 0.382, aimed -0.85 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 4): 3iron 0.52, launched 1.7 deg right of the pin line; planned: green, 4 yd from the pin. Result: green, 4.1 yd from the pin; against the port's flight +0.9 yd along, -0.2 across. **repeat**: planned from classic-a/attempt-12 h11 k1's identical stroke (+0.9 along, -0.2 across the port). **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 4.1 yd, wind 4 mph (dir 4): putter 0.301, aimed +0.45 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 0 mph (dir 5): driver 0.96, launched 39.1 deg right of the pin line; planned: fairway, 303.4 yd from the pin. Result: fairway, 303.3 yd from the pin; against the port's flight +0.1 yd along, -0.2 across. **repeat**: planned from classic-a/attempt-3 h12 k1's identical stroke (+0.1 along, -0.2 across the port).
- 12.2 from the fairway, 303.3 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: fairway, 18.3 yd from the pin. Result: fairway, 18.3 yd from the pin; against the port's flight -0.3 yd along, +2.0 across. **repeat**: planned from classic-a/attempt-3 h12 k2's identical stroke (-0.3 along, +2 across the port).
- 12.3 from the fairway, 18.3 yd, wind 0 mph (dir 5): wedge 0.24, launched 1.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight -0.1 yd along, +0.6 across. **repeat**: planned from classic-a/attempt-3 h12 k3's identical stroke (-0.1 along, +0.6 across the port).
- 12.4 from the green, 0.3 yd, wind 0 mph (dir 5): putter 0.137, aimed -3.725 deg of the cup. Result: HOLED.

### Attempt 13: 3-2-3 (-4), 2026-10-22 05:07 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 2 mph (dir 1): driver 0.99, launched 1.0 deg right of the pin line; planned: fairway, 101.2 yd from the pin. Result: fairway, 99.9 yd from the pin; against the port's flight +0.7 yd along, -6.1 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 99.9 yd, wind 2 mph (dir 1): 7iron 0.60, launched 1.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight +0.6 yd along, -0.4 across.
- 10.3 from the green, 0.7 yd, wind 2 mph (dir 1): putter 0.153, aimed -0.725 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 8 mph (dir 3): driver 0.43, launched 1.7 deg right of the pin line; planned: green, 5.8 yd from the pin. Result: green, 8.4 yd from the pin; against the port's flight -3.4 yd along, +0.4 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 8.4 yd, wind 8 mph (dir 3): putter 0.548, aimed -0.125 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 462.0 yd, wind 10 mph (dir 5): driver 0.89, launched 35.3 deg right of the pin line; planned: fairway, 279.8 yd from the pin. Result: fairway, 280.8 yd from the pin; against the port's flight -1.3 yd along, +0.4 across.
- 12.2 from the fairway, 280.8 yd, wind 10 mph (dir 5): driver 1.00, launched 2.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 4.3 yd from the pin; against the port's flight +1.7 yd along, +2.4 across.
- 12.3 from the green, 4.3 yd, wind 10 mph (dir 5): putter 0.310, aimed +0.35 deg of the cup. Result: HOLED.

### Attempt 12: 3-2-4 (-3), 2026-10-22 05:02 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 8 mph (dir 6): driver 0.94, launched 1.0 deg right of the pin line; planned: fairway, 96.7 yd from the pin. Result: fairway, 97.3 yd from the pin; against the port's flight -0.8 yd along, +0.8 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 97.3 yd, wind 8 mph (dir 6): 7iron 0.60, launched 4.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight +3.1 yd along, -1.6 across.
- 10.3 from the green, 3.9 yd, wind 8 mph (dir 6): putter 0.321, aimed -0.85 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 4): 3iron 0.52, launched 1.7 deg right of the pin line; planned: green, 3.5 yd from the pin. Result: green, 4.1 yd from the pin; against the port's flight +0.9 yd along, -0.2 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 4.1 yd, wind 4 mph (dir 4): putter 0.301, aimed +0.45 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 470.0 yd, wind 0 mph (dir 5): driver 0.96, launched 38.3 deg right of the pin line; planned: fairway, 308.9 yd from the pin. Result: fairway, 308.8 yd from the pin; against the port's flight +0.1 yd along, -0.2 across. **repeat**: planned from classic-a/attempt-3 h12 k1's identical stroke (+0.1 along, -0.2 across the port).
- 12.2 from the fairway, 308.8 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: fairway, 23.1 yd from the pin. Result: fairway, 23.0 yd from the pin; against the port's flight +0.3 yd along, +2.7 across.
- 12.3 from the fairway, 23.0 yd, wind 0 mph (dir 5): wedge 0.28, launched 0.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight -0.4 yd along, -1.9 across.
- 12.4 from the green, 2.0 yd, wind 0 mph (dir 5): putter 0.230, aimed -0.325 deg of the cup. Result: HOLED.

### Attempt 11: 3-2-3 (-4), 2026-10-22 04:58 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.1 yd, wind 0 mph (dir 3): driver 1.00, launched 2.7 deg right of the pin line; planned: fairway, 98.9 yd from the pin. Result: fairway, 99.1 yd from the pin; against the port's flight -1.0 yd along, -4.7 across. **avoided**: lines that failed from here before, not tried: 2.5 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 99.1 yd, wind 0 mph (dir 3): 9iron 0.92, launched 0.0 deg left of the pin line; planned: green, 0 yd from the pin. Result: green, 0.8 yd from the pin; against the port's flight +0.4 yd along, -0.7 across.
- 10.3 from the green, 0.8 yd, wind 0 mph (dir 3): putter 0.167, aimed -0.225 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 10 mph (dir 0): driver 0.45, launched 3.0 deg right of the pin line; planned: green, 8.8 yd from the pin. Result: green, 8.8 yd from the pin; against the port's flight -1.4 yd along, -0.3 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 8.8 yd, wind 10 mph (dir 0): putter 0.594, aimed +1.225 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 462.0 yd, wind 4 mph (dir 5): driver 0.93, launched 35.3 deg right of the pin line; planned: fairway, 282.5 yd from the pin. Result: fairway, 282.6 yd from the pin; against the port's flight +0.2 yd along, +0.1 across. **repeat**: planned from classic-a/attempt-4 h12 k1's identical stroke (+0.2 along, +0.1 across the port).
- 12.2 from the fairway, 282.6 yd, wind 4 mph (dir 5): driver 0.99, launched 1.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 4.0 yd from the pin; against the port's flight +2.6 yd along, +1.3 across. **repeat**: planned from classic-a/attempt-4 h12 k2's identical stroke (+4.5 along, -0.4 across the port).
- 12.3 from the green, 4.0 yd, wind 4 mph (dir 5): putter 0.334, aimed +0.925 deg of the cup. Result: HOLED.

### Attempt 10: 3-2-3 (-4), 2026-10-22 04:55 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 8 mph (dir 7): driver 0.94, launched 0.0 deg left of the pin line; planned: fairway, 118.1 yd from the pin. Result: fairway, 117.0 yd from the pin; against the port's flight +0.9 yd along, +1.5 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 117.0 yd, wind 8 mph (dir 7): 7iron 0.79, launched 3.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.2 yd from the pin; against the port's flight -0.2 yd along, -0.7 across.
- 10.3 from the green, 1.2 yd, wind 8 mph (dir 7): putter 0.194, aimed -0.625 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 2): driver 0.44, launched 1.7 deg right of the pin line; planned: green, 5.6 yd from the pin. Result: green, 6.7 yd from the pin; against the port's flight -2.6 yd along, +0.5 across. **avoided**: lines that failed from here before, not tried: 1.3 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 6.7 yd, wind 4 mph (dir 2): putter 0.491, aimed +1.25 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 10 mph (dir 5): driver 0.93, launched 36.1 deg right of the pin line; planned: fairway, 275.6 yd from the pin. Result: fairway, 276.7 yd from the pin; against the port's flight -1.5 yd along, +0.5 across.
- 12.2 from the fairway, 276.7 yd, wind 10 mph (dir 5): driver 0.86, launched 1.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight -1.9 yd along, +4.8 across.
- 12.3 from the green, 5.0 yd, wind 10 mph (dir 5): putter 0.404, aimed +0.575 deg of the cup. Result: HOLED.

### Attempt 9: 3-2-3 (-4), 2026-10-22 04:51 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 10 mph (dir 3): driver 0.97, launched 2.0 deg right of the pin line; planned: fairway, 88.9 yd from the pin. Result: fairway, 85.3 yd from the pin; against the port's flight +0.9 yd along, -10.8 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 85.3 yd, wind 10 mph (dir 3): 5iron 0.38, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight +1.0 yd along, -1.9 across.
- 10.3 from the green, 1.9 yd, wind 10 mph (dir 3): putter 0.235, aimed -0.675 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 139.4 yd, wind 2 mph (dir 4): 3iron 0.54, launched 0.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +1.8 yd along, +0.0 across. **avoided**: lines that failed from here before, not tried: 3.6 deg (rested 26 yd from the port's rest, classic-a/attempt-8 h11 k1); 6.6 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 1.3 yd, wind 2 mph (dir 4): putter 0.188, aimed -0.275 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 470.0 yd, wind 6 mph (dir 5): driver 0.93, launched 35.4 deg right of the pin line; planned: fairway, 286.8 yd from the pin. Result: fairway, 286.9 yd from the pin; against the port's flight +0.2 yd along, +0.1 across.
- 12.2 from the fairway, 286.9 yd, wind 6 mph (dir 5): driver 0.98, launched 0.0 deg left of the pin line; planned: green, 5.5 yd from the pin. Result: green, 4.1 yd from the pin; against the port's flight +0.9 yd along, +1.8 across.
- 12.3 from the green, 4.1 yd, wind 6 mph (dir 5): putter 0.320, aimed +0.6 deg of the cup. Result: HOLED.

### Attempt 8: 3-3-3 (-3), 2026-10-22 04:47 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 10 mph (dir 3): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 81.6 yd from the pin. Result: fairway, 84.3 yd from the pin; against the port's flight -5.7 yd along, -10.0 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 84.3 yd, wind 10 mph (dir 3): 7iron 0.47, launched 3.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 1.7 yd from the pin; against the port's flight +0.9 yd along, -2.2 across.
- 10.3 from the green, 1.7 yd, wind 10 mph (dir 3): putter 0.222, aimed -0.675 deg of the cup. Result: HOLED.

Hole 11 (par 3): 3 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 6 mph (dir 2): spoon 0.50, launched 1.3 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: rough, 26.3 yd from the pin; against the port's flight +26.4 yd along, +1.4 across. **miss**: rested 26 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the rough, 26.3 yd, wind 6 mph (dir 2): wedge 0.26, launched 3.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight -2.1 yd along, +1.7 across.
- 11.3 from the green, 2.6 yd, wind 6 mph (dir 2): putter 0.261, aimed -0.875 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 8 mph (dir 4): spoon 0.99, launched 36.1 deg right of the pin line; planned: fairway, 284.2 yd from the pin. Result: fairway, 285.2 yd from the pin; against the port's flight -1.6 yd along, +0.3 across.
- 12.2 from the fairway, 285.2 yd, wind 8 mph (dir 4): driver 0.98, launched 1.0 deg left of the pin line; planned: green, 3.6 yd from the pin. Result: green, 9.4 yd from the pin; against the port's flight +7.0 yd along, +3.8 across.
- 12.3 from the green, 9.4 yd, wind 8 mph (dir 4): putter 0.582, aimed +3.1 deg of the cup. Result: HOLED.

### Attempt 7: 3-2-3 (-4), 2026-10-22 04:43 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 0 mph (dir 6): driver 0.92, launched 0.0 deg left of the pin line; planned: fairway, 101.1 yd from the pin. Result: fairway, 100.6 yd from the pin; against the port's flight +0.4 yd along, -0.5 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 100.6 yd, wind 0 mph (dir 6): 9iron 0.94, launched 0.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.4 yd along, -0.8 across.
- 10.3 from the green, 0.9 yd, wind 0 mph (dir 6): putter 0.177, aimed -0.425 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 1): 7iron 0.97, launched 1.3 deg left of the pin line; planned: green, 4.1 yd from the pin. Result: green, 7.5 yd from the pin; against the port's flight +2.1 yd along, +1.3 across. **assist**: the game launched it at 0.985, not the swung 0.970 (WSR's pin-power assist on a partial swing). **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 7.5 yd, wind 4 mph (dir 1): putter 0.439, aimed +2.5 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 8 mph (dir 5): driver 0.93, launched 36.1 deg right of the pin line; planned: fairway, 278.1 yd from the pin. Result: fairway, 278.3 yd from the pin; against the port's flight +0.1 yd along, +0.1 across.
- 12.2 from the fairway, 278.3 yd, wind 8 mph (dir 5): driver 0.97, launched 1.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 10.9 yd from the pin; against the port's flight +11.1 yd along, +3.3 across.
- 12.3 from the green, 10.9 yd, wind 8 mph (dir 5): putter 0.579, aimed +1 deg of the cup. Result: HOLED.

### Attempt 6: 3-2-4 (-3), 2026-10-22 04:40 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 8 mph (dir 6): driver 0.99, launched 3.0 deg right of the pin line; planned: fairway, 88.7 yd from the pin. Result: fairway, 92.3 yd from the pin; against the port's flight -1.3 yd along, -0.4 across. **repeat**: planned from classic-a/attempt-3 h10 k1's identical stroke (+2.3 along, +1 across the port). **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 92.3 yd, wind 8 mph (dir 6): 9iron 0.80, launched 6.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -0.6 yd along, -1.4 across.
- 10.3 from the green, 1.9 yd, wind 8 mph (dir 6): putter 0.241, aimed -0.475 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 136.1 yd, wind 4 mph (dir 4): 7iron 0.78, launched 2.0 deg right of the pin line; planned: green, 3.3 yd from the pin. Result: green, 8.8 yd from the pin; against the port's flight +1.1 yd along, -0.1 across. **assist**: the game launched it at 0.885, not the swung 0.780 (WSR's pin-power assist on a partial swing). **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 8.8 yd, wind 4 mph (dir 4): putter 0.488, aimed +2.1 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 0 mph (dir 5): driver 0.96, launched 39.1 deg right of the pin line; planned: fairway, 303.4 yd from the pin. Result: fairway, 303.3 yd from the pin; against the port's flight +0.1 yd along, -0.2 across. **repeat**: planned from classic-a/attempt-3 h12 k1's identical stroke (+0.1 along, -0.2 across the port).
- 12.2 from the fairway, 303.3 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: fairway, 18.3 yd from the pin. Result: fairway, 18.3 yd from the pin; against the port's flight -0.3 yd along, +2.0 across. **repeat**: planned from classic-a/attempt-3 h12 k2's identical stroke (-0.3 along, +2 across the port).
- 12.3 from the fairway, 18.3 yd, wind 0 mph (dir 5): 9iron 0.12, launched 0.0 deg left of the pin line; planned: green, 0 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.5 yd along, +0.8 across.
- 12.4 from the green, 0.9 yd, wind 0 mph (dir 5): putter 0.169, aimed +0.225 deg of the cup. Result: HOLED.

### Attempt 5: 3-2-4 (-3), 2026-10-22 04:36 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 4 mph (dir 4): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 99.1 yd from the pin. Result: fairway, 92.9 yd from the pin; against the port's flight +4.5 yd along, -9.3 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 92.9 yd, wind 4 mph (dir 4): 9iron 0.76, launched 0.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight -1.4 yd along, -0.2 across.
- 10.3 from the green, 0.7 yd, wind 4 mph (dir 4): putter 0.172, aimed +0.05 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 2 mph (dir 6): 7iron 0.91, launched 1.7 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 2.3 yd from the pin; against the port's flight +2.3 yd along, +0.7 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 25 yd from the port's rest, classic-a/attempt-4 h11 k1).
- 11.2 from the green, 2.3 yd, wind 2 mph (dir 6): putter 0.225, aimed -0.275 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 6 mph (dir 1): driver 0.92, launched 39.1 deg right of the pin line; planned: fairway, 316.8 yd from the pin. Result: fairway, 316.7 yd from the pin; against the port's flight -0.2 yd along, -0.3 across. **repeat**: planned from classic-a/attempt-2 h12 k1's identical stroke (-0.2 along, -0.3 across the port).
- 12.2 from the fairway, 316.7 yd, wind 6 mph (dir 1): driver 0.96, launched 4.0 deg right of the pin line; planned: fairway, 63.4 yd from the pin. Result: fairway, 65.7 yd from the pin; against the port's flight -1.7 yd along, +1.7 across.
- 12.3 from the fairway, 65.7 yd, wind 6 mph (dir 1): 9iron 0.56, launched 0.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight -3.3 yd along, -0.6 across.
- 12.4 from the green, 2.9 yd, wind 6 mph (dir 1): putter 0.288, aimed -0.3 deg of the cup. Result: HOLED.

### Attempt 4: 3-3-3 (-3), 2026-10-22 04:32 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.1 yd, wind 8 mph (dir 4): driver 0.98, launched 4.0 deg right of the pin line; planned: fairway, 90.6 yd from the pin. Result: fairway, 87.7 yd from the pin; against the port's flight +0.9 yd along, -8.0 across. **avoided**: lines that failed from here before, not tried: 2.5 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 87.7 yd, wind 8 mph (dir 4): 9iron 0.68, launched 0.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight +1.0 yd along, -0.1 across.
- 10.3 from the green, 1.4 yd, wind 8 mph (dir 4): putter 0.195, aimed +0 deg of the cup. Result: HOLED.

Hole 11 (par 3): 3 by the game's count.
- 11.1 from the tee, 136.1 yd, wind 2 mph (dir 0): 7iron 0.82, launched 1.0 deg left of the pin line; planned: green, 1.2 yd from the pin. Result: sand, 24.8 yd from the pin; against the port's flight -24.7 yd along, -0.4 across. **miss**: rested 25 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 11.2 from the sand, 24.8 yd, wind 2 mph (dir 0): wedge 0.34, launched 1.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight +0.3 yd along, -0.8 across.
- 11.3 from the green, 1.4 yd, wind 2 mph (dir 0): putter 0.189, aimed -0.05 deg of the cup. Result: HOLED.

Hole 12 (par 5): 3 by the game's count.
- 12.1 from the tee, 462.0 yd, wind 4 mph (dir 5): driver 0.93, launched 35.3 deg right of the pin line; planned: fairway, 282.5 yd from the pin. Result: fairway, 282.6 yd from the pin; against the port's flight +0.2 yd along, +0.1 across.
- 12.2 from the fairway, 282.6 yd, wind 4 mph (dir 5): driver 1.00, launched 1.0 deg right of the pin line; planned: green, 2.2 yd from the pin. Result: green, 3.1 yd from the pin; against the port's flight +4.5 yd along, -0.4 across.
- 12.3 from the green, 3.1 yd, wind 4 mph (dir 5): putter 0.260, aimed +0.025 deg of the cup. Result: HOLED.

### Attempt 3: 3-3-4 (-2), 2026-10-22 04:29 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 8 mph (dir 6): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 91.2 yd from the pin. Result: fairway, 88.9 yd from the pin; against the port's flight +2.3 yd along, +1.0 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 88.9 yd, wind 8 mph (dir 6): 9iron 0.77, launched 6.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -0.7 yd along, -1.2 across.
- 10.3 from the green, 1.4 yd, wind 8 mph (dir 6): putter 0.209, aimed -0.375 deg of the cup. Result: HOLED.

Hole 11 (par 3): 3 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 4 mph (dir 4): driver 0.36, launched 0.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: fairway, 12.1 yd from the pin; against the port's flight -11.7 yd along, -0.7 across.
- 11.2 from the fairway, 12.1 yd, wind 4 mph (dir 4): wedge 0.12, launched 1.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.6 yd from the pin; against the port's flight +0.0 yd along, +0.6 across.
- 11.3 from the green, 0.6 yd, wind 4 mph (dir 4): putter 0.156, aimed -0.05 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 0 mph (dir 5): driver 0.96, launched 39.1 deg right of the pin line; planned: fairway, 303.6 yd from the pin. Result: fairway, 303.3 yd from the pin; against the port's flight +0.1 yd along, -0.2 across.
- 12.2 from the fairway, 303.3 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: fairway, 17.9 yd from the pin. Result: fairway, 18.3 yd from the pin; against the port's flight -0.3 yd along, +2.0 across.
- 12.3 from the fairway, 18.3 yd, wind 0 mph (dir 5): wedge 0.24, launched 0.0 deg left of the pin line; planned: green, 0 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight -0.1 yd along, +0.6 across.
- 12.4 from the green, 0.7 yd, wind 0 mph (dir 5): putter 0.161, aimed +0.1 deg of the cup. Result: HOLED.

### Attempt 2: 3-3-4 (-2), 2026-10-22 04:25 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 379.8 yd, wind 0 mph (dir 5): driver 0.92, launched 1.0 deg right of the pin line; planned: fairway, 110.1 yd from the pin. Result: fairway, 109.4 yd from the pin; against the port's flight +0.5 yd along, -5.5 across. **avoided**: lines that failed from here before, not tried: 4.3 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 109.4 yd, wind 0 mph (dir 5): 7iron 0.66, launched 0.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight +0.5 yd along, -0.2 across.
- 10.3 from the green, 0.3 yd, wind 0 mph (dir 5): putter 0.138, aimed -3.55 deg of the cup. Result: HOLED.

Hole 11 (par 3): 3 by the game's count.
- 11.1 from the tee, 139.4 yd, wind 8 mph (dir 4): 5iron 0.68, launched 2.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: sand, 20.6 yd from the pin; against the port's flight +0.3 yd along, -0.0 across.
- 11.2 from the sand, 20.6 yd, wind 8 mph (dir 4): wedge 0.23, launched 1.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight +0.3 yd along, +0.7 across.
- 11.3 from the green, 0.7 yd, wind 8 mph (dir 4): putter 0.162, aimed +0.05 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 459.6 yd, wind 6 mph (dir 1): driver 0.92, launched 39.1 deg right of the pin line; planned: fairway, 317 yd from the pin. Result: fairway, 316.7 yd from the pin; against the port's flight -0.2 yd along, -0.3 across.
- 12.2 from the fairway, 316.7 yd, wind 6 mph (dir 1): driver 1.00, launched 1.0 deg right of the pin line; planned: fairway, 47.8 yd from the pin. Result: fairway, 48.9 yd from the pin; against the port's flight -0.7 yd along, +2.0 across.
- 12.3 from the fairway, 48.9 yd, wind 6 mph (dir 1): 9iron 0.41, launched 1.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +1.1 yd along, +0.0 across.
- 12.4 from the green, 1.6 yd, wind 6 mph (dir 1): putter 0.203, aimed -0.325 deg of the cup. Result: HOLED.

### Attempt 1: 3-2-4 (-3), 2026-10-22 04:21 UTC

Hole 10 (par 4): 3 by the game's count.
- 10.1 from the tee, 371.8 yd, wind 4 mph (dir 6): driver 0.99, launched 4.0 deg right of the pin line; planned: fairway, 90.7 yd from the pin. Result: fairway, 92.3 yd from the pin; against the port's flight -2.2 yd along, -4.6 across. **avoided**: lines that failed from here before, not tried: 3.4 deg (rested 52 yd from the port's rest, round-r5 h10 k1).
- 10.2 from the fairway, 92.3 yd, wind 4 mph (dir 6): 9iron 0.80, launched 4.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +0.3 yd along, -2.0 across.
- 10.3 from the green, 1.6 yd, wind 4 mph (dir 6): putter 0.217, aimed -0.575 deg of the cup. Result: HOLED.

Hole 11 (par 3): 2 by the game's count.
- 11.1 from the tee, 138.1 yd, wind 10 mph (dir 3): 3iron 0.50, launched 1.3 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 0.7 yd from the pin; against the port's flight +1.6 yd along, -0.4 across.
- 11.2 from the green, 0.7 yd, wind 10 mph (dir 3): putter 0.163, aimed -0.35 deg of the cup. Result: HOLED.

Hole 12 (par 5): 4 by the game's count.
- 12.1 from the tee, 470.0 yd, wind 6 mph (dir 7): driver 0.94, launched 35.4 deg right of the pin line; planned: fairway, 301.2 yd from the pin. Result: fairway, 301.2 yd from the pin; against the port's flight +0.1 yd along, +0.0 across.
- 12.2 from the fairway, 301.2 yd, wind 6 mph (dir 7): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 21.5 yd from the pin. Result: fairway, 28.1 yd from the pin; against the port's flight -6.8 yd along, +0.6 across.
- 12.3 from the fairway, 28.1 yd, wind 6 mph (dir 7): wedge 0.38, launched 3.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.4 yd along, -1.3 across.
- 12.4 from the green, 1.6 yd, wind 6 mph (dir 7): putter 0.205, aimed +0.15 deg of the cup. Result: HOLED.

