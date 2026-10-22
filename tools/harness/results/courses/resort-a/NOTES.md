# Resort A (holes 1, 2, 3, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 22; best -4 (#1, 3-2-3); mean -3.64; last five -3 -4 -4 -3 -4.
- Hole 1 (par 4): best 2, mean 2.95 over 22.
- Hole 2 (par 3): best 2, mean 2.00 over 22.
- Hole 3 (par 5): best 3, mean 3.41 over 22.
- The planner's memory of these holes: 287 strokes from every round and attempt, 7 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 1, strokes 15+ yd from the port's flight: #21 stroke 1 (driver).
- Hole 3, strokes 15+ yd from the port's flight: #5 stroke 1 (driver).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 1 (par 4): 12 rounds, -2 ×1, -1 ×11.
- Hole 2 (par 3): 12 rounds, -1 ×12.
  - stroke 1 from the tee (7iron): 1 time (round-r7: rested 16 yd from the port's rest); the planner no longer tries those lines from those spots.
- Hole 3 (par 5): 12 rounds, -2 ×3, -1 ×9.
  - stroke 1 from the tee (driver): 4 times (round-r12: rested 28 yd from the port's rest; round-r13: rested 28 yd from the port's rest; round-r6: rested 28 yd from the port's rest; round-r9: rested 28 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the fairway (driver): 1 time (round-r4: rested 21 yd from the port's rest); the planner no longer tries those lines from those spots.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 22: 3-2-3 (-4), 2026-10-22 05:47 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.5 yd, wind 4 mph (dir 3): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 99.8 yd from the pin. Result: fairway, 99.9 yd from the pin; against the port's flight +7.0 yd along, +9.4 across.
- 1.2 from the fairway, 99.9 yd, wind 4 mph (dir 3): 9iron 0.82, launched 2.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +0.2 yd along, +0.0 across.
- 1.3 from the green, 1.0 yd, wind 4 mph (dir 3): putter 0.180, aimed -0.175 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 8 mph (dir 4): 7iron 0.78, launched 3.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight +4.9 yd along, +4.4 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 0.3 yd, wind 8 mph (dir 4): putter 0.117, aimed -8.5 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 2 mph (dir 6): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 271.9 yd from the pin. Result: fairway, 271.9 yd from the pin; against the port's flight +1.7 yd along, -3.4 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 271.9 yd, wind 2 mph (dir 6): driver 1.00, launched 1.0 deg right of the pin line; planned: green, 4.5 yd from the pin. Result: green, 4.8 yd from the pin; against the port's flight +6.7 yd along, -1.4 across.
- 3.3 from the green, 4.8 yd, wind 2 mph (dir 6): putter 0.384, aimed -0.575 deg of the cup. Result: HOLED.

### Attempt 21: 3-2-4 (-3), 2026-10-22 05:42 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 10 mph (dir 2): driver 1.00, launched 4.0 deg left of the pin line; planned: fairway, 104.4 yd from the pin. Result: fairway, 104.3 yd from the pin; against the port's flight +15.5 yd along, +13.2 across. **miss**: rested 20 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 1.2 from the fairway, 104.3 yd, wind 10 mph (dir 2): 9iron 0.90, launched 8.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 0.8 yd from the pin; against the port's flight +1.5 yd along, +1.4 across.
- 1.3 from the green, 0.8 yd, wind 10 mph (dir 2): putter 0.169, aimed +0.175 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.2 yd, wind 0 mph (dir 7): 7iron 0.87, launched 0.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight -0.1 yd along, +0.1 across. **avoided**: lines that failed from here before, not tried: 7.9 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 0.2 yd, wind 0 mph (dir 7): putter 0.081, aimed -31.85 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 538.0 yd, wind 4 mph (dir 0): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 290.7 yd from the pin. Result: fairway, 290.7 yd from the pin; against the port's flight +2.6 yd along, -2.2 across. **avoided**: lines that failed from here before, not tried: 11.6 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 290.7 yd, wind 4 mph (dir 0): driver 1.00, launched 0.0 deg left of the pin line; planned: fairway, 29.5 yd from the pin. Result: fairway, 29.5 yd from the pin; against the port's flight +0.4 yd along, -1.8 across.
- 3.3 from the fairway, 29.5 yd, wind 4 mph (dir 0): wedge 0.42, launched 4.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.5 yd along, +1.6 across.
- 3.4 from the green, 0.5 yd, wind 4 mph (dir 0): putter 0.155, aimed -0.275 deg of the cup. Result: HOLED.

### Attempt 20: 3-2-3 (-4), 2026-10-22 05:37 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 1.00, launched 8.6 deg right of the pin line; planned: fairway, 111.8 yd from the pin. Result: fairway, 110.1 yd from the pin; against the port's flight +1.6 yd along, -1.2 across.
- 1.2 from the fairway, 110.1 yd, wind 8 mph (dir 6): 9iron 0.98, launched 6.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight -0.3 yd along, +1.0 across.
- 1.3 from the green, 0.3 yd, wind 8 mph (dir 6): putter 0.111, aimed -14.1 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 4 mph (dir 4): 5iron 0.64, launched 1.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight +1.0 yd along, +2.9 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.2 yd, wind 4 mph (dir 4): putter 0.265, aimed +0.25 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 0 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 270.1 yd from the pin. Result: fairway, 270.1 yd from the pin; against the port's flight +0.1 yd along, -3.4 across. **repeat**: planned from resort-a/attempt-3 h3 k1's identical stroke (+0.1 along, -3.4 across the port). **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 270.1 yd, wind 0 mph (dir 5): driver 0.99, launched 0.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 0.8 yd from the pin; against the port's flight +0.1 yd along, -0.8 across. **repeat**: planned from resort-a/attempt-11 h3 k2's identical stroke (+0.1 along, -0.8 across the port).
- 3.3 from the green, 0.8 yd, wind 0 mph (dir 5): putter 0.152, aimed -2.75 deg of the cup. Result: HOLED.

### Attempt 19: 3-2-3 (-4), 2026-10-22 05:33 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 0.98, launched 4.0 deg right of the pin line; planned: fairway, 107.4 yd from the pin. Result: fairway, 117.0 yd from the pin; against the port's flight -9.1 yd along, +5.2 across.
- 1.2 from the fairway, 117.0 yd, wind 8 mph (dir 6): 7iron 0.70, launched 4.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight +3.2 yd along, +0.6 across.
- 1.3 from the green, 2.9 yd, wind 8 mph (dir 6): putter 0.284, aimed +0.125 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 4): 7iron 0.84, launched 1.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight -0.7 yd along, +0.4 across. **repeat**: planned from resort-a/attempt-16 h2 k1's identical stroke (-0.7 along, +0.4 across the port). **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.1 yd, wind 4 mph (dir 4): putter 0.192, aimed +0.5 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 0 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 276.3 yd from the pin. Result: fairway, 276.3 yd from the pin; against the port's flight +0.4 yd along, -3.6 across. **repeat**: planned from resort-a/attempt-3 h3 k1's identical stroke (+0.1 along, -3.4 across the port). **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 276.3 yd, wind 0 mph (dir 5): driver 1.00, launched 1.0 deg right of the pin line; planned: green, 6.4 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight +0.7 yd along, -1.0 across.
- 3.3 from the green, 5.0 yd, wind 0 mph (dir 5): putter 0.437, aimed +1.925 deg of the cup. Result: HOLED.

### Attempt 18: 3-2-4 (-3), 2026-10-22 05:29 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 401.3 yd, wind 8 mph (dir 6): driver 0.98, launched 4.0 deg right of the pin line; planned: fairway, 119 yd from the pin. Result: fairway, 120.9 yd from the pin; against the port's flight -1.0 yd along, +7.7 across.
- 1.2 from the fairway, 120.9 yd, wind 8 mph (dir 6): 5iron 0.55, launched 4.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight -0.8 yd along, +0.4 across.
- 1.3 from the green, 1.3 yd, wind 8 mph (dir 6): putter 0.192, aimed -0.225 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 2 mph (dir 3): 7iron 0.92, launched 2.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight +0.2 yd along, -1.8 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.5 yd, wind 2 mph (dir 3): putter 0.273, aimed -0.625 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 10 mph (dir 2): driver 0.99, launched 20.0 deg left of the pin line; planned: fairway, 258.1 yd from the pin. Result: fairway, 265.8 yd from the pin; against the port's flight -7.7 yd along, -2.1 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 265.8 yd, wind 10 mph (dir 2): driver 0.98, launched 6.0 deg left of the pin line; planned: fairway, 12.6 yd from the pin. Result: fairway, 13.6 yd from the pin; against the port's flight -0.5 yd along, -0.9 across.
- 3.3 from the fairway, 13.6 yd, wind 10 mph (dir 2): wedge 0.14, launched 2.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +0.1 yd along, +1.1 across.
- 3.4 from the green, 1.0 yd, wind 10 mph (dir 2): putter 0.185, aimed +0.525 deg of the cup. Result: HOLED.

### Attempt 17: 3-2-4 (-3), 2026-10-22 05:25 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 1.00, launched 6.0 deg right of the pin line; planned: fairway, 106.9 yd from the pin. Result: fairway, 109.6 yd from the pin; against the port's flight -1.9 yd along, +3.7 across.
- 1.2 from the fairway, 109.6 yd, wind 8 mph (dir 6): 7iron 0.63, launched 4.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 3.0 yd from the pin; against the port's flight +3.0 yd along, +0.8 across.
- 1.3 from the green, 3.0 yd, wind 8 mph (dir 6): putter 0.294, aimed +0.05 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 4 mph (dir 4): 7iron 0.94, launched 1.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight +0.7 yd along, +2.3 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.5 yd, wind 4 mph (dir 4): putter 0.278, aimed +0.7 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 0 mph (dir 5): driver 0.96, launched 20.0 deg left of the pin line; planned: fairway, 275.9 yd from the pin. Result: fairway, 277.8 yd from the pin; against the port's flight +0.1 yd along, -3.0 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 277.8 yd, wind 0 mph (dir 5): driver 1.00, launched 1.0 deg left of the pin line; planned: fairway, 13.6 yd from the pin. Result: sand, 20.4 yd from the pin; against the port's flight -4.6 yd along, -1.3 across.
- 3.3 from the sand, 20.4 yd, wind 0 mph (dir 5): wedge 0.26, launched 0.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight +0.2 yd along, +2.2 across.
- 3.4 from the green, 2.2 yd, wind 0 mph (dir 5): putter 0.269, aimed +1.375 deg of the cup. Result: HOLED.

### Attempt 16: 3-2-3 (-4), 2026-10-22 05:21 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 1.00, launched 5.5 deg right of the pin line; planned: fairway, 106.6 yd from the pin. Result: fairway, 107.8 yd from the pin; against the port's flight +0.3 yd along, +7.5 across.
- 1.2 from the fairway, 107.8 yd, wind 8 mph (dir 6): 9iron 0.99, launched 6.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +1.2 yd along, +0.4 across.
- 1.3 from the green, 1.3 yd, wind 8 mph (dir 6): putter 0.203, aimed +0.15 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 4): 7iron 0.84, launched 1.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight -0.7 yd along, +0.4 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.1 yd, wind 4 mph (dir 4): putter 0.192, aimed +0.5 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 538.0 yd, wind 0 mph (dir 5): driver 0.99, launched 20.0 deg left of the pin line; planned: fairway, 284.3 yd from the pin. Result: fairway, 286.8 yd from the pin; against the port's flight -0.2 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: 11.6 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 286.8 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: green, 17.1 yd from the pin. Result: green, 17.1 yd from the pin; against the port's flight -0.8 yd along, -0.3 across. **repeat**: planned from resort-a/attempt-7 h3 k2's identical stroke (-0.8 along, -0.1 across the port).
- 3.3 from the green, 17.1 yd, wind 0 mph (dir 5): putter 1.081, aimed -2.775 deg of the cup. Result: HOLED.

### Attempt 15: 3-2-4 (-3), 2026-10-22 05:16 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 401.3 yd, wind 4 mph (dir 2): driver 1.00, launched 0.3 deg right of the pin line; planned: fairway, 115.3 yd from the pin. Result: fairway, 107.8 yd from the pin; against the port's flight +9.0 yd along, +8.7 across.
- 1.2 from the fairway, 107.8 yd, wind 4 mph (dir 2): 9iron 0.95, launched 4.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 0.8 yd from the pin; against the port's flight +0.8 yd along, +1.1 across.
- 1.3 from the green, 0.8 yd, wind 4 mph (dir 2): putter 0.175, aimed +0 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 2 mph (dir 0): spoon 0.38, launched 0.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.6 yd along, -0.5 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 0.9 yd, wind 2 mph (dir 0): putter 0.182, aimed -0.525 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 538.0 yd, wind 6 mph (dir 7): driver 0.98, launched 20.0 deg left of the pin line; planned: fairway, 296.1 yd from the pin. Result: fairway, 297.5 yd from the pin; against the port's flight -1.1 yd along, -0.8 across. **avoided**: lines that failed from here before, not tried: 11.6 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 297.5 yd, wind 6 mph (dir 7): driver 0.97, launched 2.0 deg left of the pin line; planned: fairway, 46.6 yd from the pin. Result: fairway, 47.2 yd from the pin; against the port's flight +0.3 yd along, -2.1 across.
- 3.3 from the fairway, 47.2 yd, wind 6 mph (dir 7): wedge 0.72, launched 0.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.1 yd from the pin; against the port's flight -0.9 yd along, +3.1 across.
- 3.4 from the green, 3.1 yd, wind 6 mph (dir 7): putter 0.299, aimed +0.675 deg of the cup. Result: HOLED.

### Attempt 14: 3-2-4 (-3), 2026-10-22 05:11 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 10 mph (dir 3): driver 0.96, launched 4.0 deg right of the pin line; planned: fairway, 98.8 yd from the pin. Result: fairway, 98.8 yd from the pin; against the port's flight -3.1 yd along, -2.4 across. **repeat**: planned from resort-a/attempt-4 h1 k1's identical stroke (-3.1 along, -2.4 across the port).
- 1.2 from the fairway, 98.8 yd, wind 10 mph (dir 3): 9iron 0.74, launched 4.0 deg left of the pin line; planned: green, 1.4 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight +0.4 yd along, +1.5 across.
- 1.3 from the green, 2.9 yd, wind 10 mph (dir 3): putter 0.283, aimed -0.4 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.2 yd, wind 6 mph (dir 2): 5iron 0.76, launched 4.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +0.7 yd along, +0.4 across. **avoided**: lines that failed from here before, not tried: 7.9 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.3 yd, wind 6 mph (dir 2): putter 0.191, aimed +0.075 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 8 mph (dir 4): spoon 0.96, launched 20.0 deg left of the pin line; planned: fairway, 276.8 yd from the pin. Result: fairway, 279.3 yd from the pin; against the port's flight -3.8 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 279.3 yd, wind 8 mph (dir 4): driver 0.98, launched 4.0 deg right of the pin line; planned: fairway, 16.9 yd from the pin. Result: sand, 16.3 yd from the pin; against the port's flight +1.5 yd along, +0.3 across.
- 3.3 from the sand, 16.3 yd, wind 8 mph (dir 4): wedge 0.19, launched 2.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -0.2 yd along, -1.4 across.
- 3.4 from the green, 1.4 yd, wind 8 mph (dir 4): putter 0.213, aimed -0.15 deg of the cup. Result: HOLED.

### Attempt 13: 3-2-3 (-4), 2026-10-22 05:07 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 6 mph (dir 4): driver 0.99, launched 5.5 deg right of the pin line; planned: fairway, 90.8 yd from the pin. Result: fairway, 91.8 yd from the pin; against the port's flight -1.4 yd along, -0.9 across.
- 1.2 from the fairway, 91.8 yd, wind 6 mph (dir 4): 9iron 0.67, launched 0.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight +0.3 yd along, +1.4 across.
- 1.3 from the green, 1.5 yd, wind 6 mph (dir 4): putter 0.212, aimed -0.25 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 10 mph (dir 5): 7iron 0.94, launched 3.7 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 5.3 yd from the pin; against the port's flight +4.3 yd along, -3.2 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 5.3 yd, wind 10 mph (dir 5): putter 0.395, aimed -1.95 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 0 mph (dir 3): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 274.1 yd from the pin. Result: fairway, 276.3 yd from the pin; against the port's flight +0.4 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 276.3 yd, wind 0 mph (dir 3): driver 1.00, launched 1.0 deg right of the pin line; planned: green, 6.4 yd from the pin. Result: green, 5.2 yd from the pin; against the port's flight +0.9 yd along, -1.0 across.
- 3.3 from the green, 5.2 yd, wind 0 mph (dir 3): putter 0.445, aimed +2.075 deg of the cup. Result: HOLED.

### Attempt 12: 3-2-3 (-4), 2026-10-22 05:03 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.5 yd, wind 8 mph (dir 2): driver 1.00, launched 3.0 deg right of the pin line; planned: fairway, 108 yd from the pin. Result: fairway, 104.6 yd from the pin; against the port's flight +4.7 yd along, +2.6 across.
- 1.2 from the fairway, 104.6 yd, wind 8 mph (dir 2): 9iron 0.90, launched 6.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 3.6 yd from the pin; against the port's flight -3.5 yd along, -1.2 across.
- 1.3 from the green, 3.6 yd, wind 8 mph (dir 2): putter 0.290, aimed -0.025 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 6 mph (dir 6): 5iron 0.76, launched 4.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight -1.0 yd along, +1.2 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.0 yd, wind 6 mph (dir 6): putter 0.247, aimed -1.2 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 4 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 265 yd from the pin. Result: fairway, 268.3 yd from the pin; against the port's flight -1.0 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 268.3 yd, wind 4 mph (dir 5): driver 1.00, launched 2.0 deg right of the pin line; planned: green, 3.7 yd from the pin. Result: green, 9.4 yd from the pin; against the port's flight +13.1 yd along, -1.1 across.
- 3.3 from the green, 9.4 yd, wind 4 mph (dir 5): putter 0.508, aimed -1.325 deg of the cup. Result: HOLED.

### Attempt 11: 3-2-3 (-4), 2026-10-22 04:59 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 0.99, launched 6.0 deg right of the pin line; planned: fairway, 113.2 yd from the pin. Result: fairway, 113.2 yd from the pin; against the port's flight -6.7 yd along, +1.4 across. **repeat**: planned from resort-a/attempt-7 h1 k1's identical stroke (-6.7 along, +1.4 across the port).
- 1.2 from the fairway, 113.2 yd, wind 8 mph (dir 6): 7iron 0.64, launched 3.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +4.2 yd along, +0.3 across. **repeat**: planned from resort-a/attempt-7 h1 k2's identical stroke (+2.7 along, +0.7 across the port).
- 1.3 from the green, 1.0 yd, wind 8 mph (dir 6): putter 0.176, aimed +0.15 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 4): 7iron 0.94, launched 0.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -0.5 yd along, -3.2 across. **repeat**: planned from resort-a/attempt-6 h2 k1's identical stroke (-0.3 along, -1.6 across the port). **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.9 yd, wind 4 mph (dir 4): putter 0.239, aimed +0.25 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 0 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 270.1 yd from the pin. Result: fairway, 270.1 yd from the pin; against the port's flight +0.1 yd along, -3.4 across. **repeat**: planned from resort-a/attempt-3 h3 k1's identical stroke (+0.1 along, -3.4 across the port). **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 270.1 yd, wind 0 mph (dir 5): driver 0.99, launched 0.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.1 yd along, -0.8 across. **repeat**: planned from resort-a/attempt-8 h3 k2's identical stroke (+0.1 along, -0.8 across the port).
- 3.3 from the green, 0.9 yd, wind 0 mph (dir 5): putter 0.167, aimed -1.675 deg of the cup. Result: HOLED.

### Attempt 10: 3-2-4 (-3), 2026-10-22 04:55 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 401.3 yd, wind 6 mph (dir 6): driver 1.00, launched 6.0 deg right of the pin line; planned: fairway, 113.2 yd from the pin. Result: fairway, 115.5 yd from the pin; against the port's flight -1.5 yd along, +3.7 across.
- 1.2 from the fairway, 115.5 yd, wind 6 mph (dir 6): 5iron 0.51, launched 3.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight +0.9 yd along, +0.5 across.
- 1.3 from the green, 1.3 yd, wind 6 mph (dir 6): putter 0.199, aimed +0.05 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 2): 7iron 0.89, launched 3.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +1.2 yd along, -1.3 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.0 yd, wind 4 mph (dir 2): putter 0.181, aimed -0.625 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 8 mph (dir 7): driver 0.99, launched 20.0 deg left of the pin line; planned: fairway, 289.2 yd from the pin. Result: fairway, 290.6 yd from the pin; against the port's flight -0.6 yd along, -1.3 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 290.6 yd, wind 8 mph (dir 7): driver 1.00, launched 1.0 deg left of the pin line; planned: fairway, 38.4 yd from the pin. Result: fairway, 38.6 yd from the pin; against the port's flight +0.5 yd along, -2.2 across.
- 3.3 from the fairway, 38.6 yd, wind 8 mph (dir 7): 9iron 0.29, launched 0.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 2.9 yd from the pin; against the port's flight +0.4 yd along, +2.9 across.
- 3.4 from the green, 2.9 yd, wind 8 mph (dir 7): putter 0.315, aimed +1.775 deg of the cup. Result: HOLED.

### Attempt 9: 3-2-3 (-4), 2026-10-22 04:51 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 10 mph (dir 3): driver 0.97, launched 4.0 deg right of the pin line; planned: fairway, 97.3 yd from the pin. Result: fairway, 93.5 yd from the pin; against the port's flight +0.7 yd along, -2.8 across. **repeat**: planned from resort-a/attempt-4 h1 k1's identical stroke (-3.1 along, -2.4 across the port).
- 1.2 from the fairway, 93.5 yd, wind 10 mph (dir 3): 9iron 0.69, launched 4.0 deg left of the pin line; planned: green, 1.1 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight +0.4 yd along, +1.5 across.
- 1.3 from the green, 2.5 yd, wind 10 mph (dir 3): putter 0.265, aimed -0.4 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 2 mph (dir 4): 7iron 0.93, launched 0.0 deg right of the pin line; planned: green, 1 yd from the pin. Result: green, 3.5 yd from the pin; against the port's flight +2.8 yd along, -3.1 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 3.5 yd, wind 2 mph (dir 4): putter 0.311, aimed -1.425 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 6 mph (dir 5): driver 0.97, launched 20.0 deg left of the pin line; planned: fairway, 274.2 yd from the pin. Result: fairway, 275.0 yd from the pin; against the port's flight +2.1 yd along, -3.3 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 275.0 yd, wind 6 mph (dir 5): driver 1.00, launched 3.0 deg right of the pin line; planned: green, 8.3 yd from the pin. Result: green, 4.0 yd from the pin; against the port's flight +12.1 yd along, -1.7 across.
- 3.3 from the green, 4.0 yd, wind 6 mph (dir 5): putter 0.285, aimed +0.525 deg of the cup. Result: HOLED.

### Attempt 8: 3-2-3 (-4), 2026-10-22 04:47 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 0.96, launched 5.5 deg right of the pin line; planned: fairway, 113 yd from the pin. Result: fairway, 114.9 yd from the pin; against the port's flight -0.8 yd along, +5.5 across.
- 1.2 from the fairway, 114.9 yd, wind 8 mph (dir 6): 7iron 0.68, launched 4.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 3.8 yd from the pin; against the port's flight +3.1 yd along, +0.7 across.
- 1.3 from the green, 3.8 yd, wind 8 mph (dir 6): putter 0.331, aimed +0.2 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 4): 7iron 0.92, launched 0.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight +3.5 yd along, -3.1 across. **repeat**: planned from resort-a/attempt-6 h2 k1's identical stroke (-0.3 along, -1.6 across the port). **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 3.9 yd, wind 4 mph (dir 4): putter 0.327, aimed -1.625 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 0 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 270.1 yd from the pin. Result: fairway, 270.1 yd from the pin; against the port's flight +0.1 yd along, -3.4 across. **repeat**: planned from resort-a/attempt-3 h3 k1's identical stroke (+0.1 along, -3.4 across the port). **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.2 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 270.1 yd, wind 0 mph (dir 5): driver 0.99, launched 0.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.1 yd along, -0.8 across. **repeat**: planned from resort-a/attempt-3 h3 k2's identical stroke (+0.1 along, -0.8 across the port).
- 3.3 from the green, 0.9 yd, wind 0 mph (dir 5): putter 0.176, aimed -0.475 deg of the cup. Result: HOLED.

### Attempt 7: 3-2-3 (-4), 2026-10-22 04:43 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 0.99, launched 6.0 deg right of the pin line; planned: fairway, 106.4 yd from the pin. Result: fairway, 113.2 yd from the pin; against the port's flight -6.7 yd along, +1.4 across.
- 1.2 from the fairway, 113.2 yd, wind 8 mph (dir 6): 7iron 0.66, launched 4.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.8 yd from the pin; against the port's flight +2.7 yd along, +0.7 across.
- 1.3 from the green, 2.8 yd, wind 8 mph (dir 6): putter 0.281, aimed +0.025 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 4 mph (dir 4): 7iron 0.81, launched 1.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight +2.6 yd along, +2.9 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 3.9 yd, wind 4 mph (dir 4): putter 0.362, aimed +1.15 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 538.0 yd, wind 0 mph (dir 5): driver 0.97, launched 20.0 deg left of the pin line; planned: fairway, 284.6 yd from the pin. Result: fairway, 285.8 yd from the pin; against the port's flight +0.9 yd along, -2.9 across. **avoided**: lines that failed from here before, not tried: 11.6 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 285.8 yd, wind 0 mph (dir 5): driver 1.00, launched 0.0 deg left of the pin line; planned: green, 14 yd from the pin. Result: green, 14.7 yd from the pin; against the port's flight -0.8 yd along, -0.1 across.
- 3.3 from the green, 14.7 yd, wind 0 mph (dir 5): putter 0.899, aimed -3.1 deg of the cup. Result: HOLED.

### Attempt 6: 3-2-4 (-3), 2026-10-22 04:40 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 3): driver 1.00, launched 2.0 deg left of the pin line; planned: fairway, 103.6 yd from the pin. Result: fairway, 95.3 yd from the pin; against the port's flight +8.6 yd along, +11.4 across.
- 1.2 from the fairway, 95.3 yd, wind 8 mph (dir 3): 9iron 0.75, launched 3.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.8 yd from the pin; against the port's flight +0.6 yd along, +1.1 across.
- 1.3 from the green, 1.8 yd, wind 8 mph (dir 3): putter 0.225, aimed -0.3 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 4 mph (dir 4): 7iron 0.94, launched 1.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: green, 2.7 yd from the pin; against the port's flight -0.3 yd along, -1.6 across. **repeat**: planned from resort-a/attempt-3 h2 k1's identical stroke (+0.5 along, +0.2 across the port). **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.7 yd, wind 4 mph (dir 4): putter 0.281, aimed +0.1 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 538.0 yd, wind 6 mph (dir 2): driver 0.98, launched 20.0 deg left of the pin line; planned: fairway, 276.4 yd from the pin. Result: fairway, 285.2 yd from the pin; against the port's flight -9.5 yd along, -1.9 across. **avoided**: lines that failed from here before, not tried: 11.6 deg (rested 28 yd from the port's rest, round-r12 h3 k1); 16.0 deg (rested 29 yd from the port's rest, resort-a/attempt-5 h3 k1).
- 3.2 from the fairway, 285.2 yd, wind 6 mph (dir 2): driver 1.00, launched 4.0 deg left of the pin line; planned: fairway, 25 yd from the pin. Result: sand, 28.2 yd from the pin; against the port's flight -2.9 yd along, -1.4 across.
- 3.3 from the sand, 28.2 yd, wind 6 mph (dir 2): wedge 0.37, launched 3.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight -0.4 yd along, +2.0 across.
- 3.4 from the green, 2.2 yd, wind 6 mph (dir 2): putter 0.244, aimed +0.55 deg of the cup. Result: HOLED.

### Attempt 5: 2-2-4 (-4), 2026-10-22 04:36 UTC

Hole 1 (par 4): 2 by the game's count.
- 1.1 from the tee, 401.3 yd, wind 4 mph (dir 6): driver 1.00, launched 8.0 deg right of the pin line; planned: fairway, 116.8 yd from the pin. Result: fairway, 115.0 yd from the pin; against the port's flight +1.4 yd along, -1.5 across.
- 1.2 from the fairway, 115.0 yd, wind 4 mph (dir 6): 7iron 0.65, launched 2.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: HOLED. **holed**: holed from 115 yd off the green.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 6 mph (dir 1): 5iron 0.73, launched 2.3 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -0.9 yd along, -1.3 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 1.4 yd, wind 6 mph (dir 1): putter 0.213, aimed +0.225 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 2 mph (dir 2): driver 1.00, launched 16.0 deg left of the pin line; planned: fairway, 261.7 yd from the pin. Result: fairway, 287.9 yd from the pin; against the port's flight -28.5 yd along, -3.2 across. **miss**: rested 29 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1).
- 3.2 from the fairway, 287.9 yd, wind 2 mph (dir 2): driver 1.00, launched 2.0 deg right of the pin line; planned: rough, 28.4 yd from the pin. Result: rough, 29.3 yd from the pin; against the port's flight -0.9 yd along, +0.3 across.
- 3.3 from the rough, 29.3 yd, wind 2 mph (dir 2): wedge 0.39, launched 2.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +0.1 yd along, -1.4 across.
- 3.4 from the green, 1.6 yd, wind 2 mph (dir 2): putter 0.223, aimed -1.125 deg of the cup. Result: HOLED.

### Attempt 4: 3-2-3 (-4), 2026-10-22 04:32 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 10 mph (dir 3): driver 0.96, launched 4.0 deg right of the pin line; planned: fairway, 96.8 yd from the pin. Result: fairway, 98.8 yd from the pin; against the port's flight -3.1 yd along, -2.4 across.
- 1.2 from the fairway, 98.8 yd, wind 10 mph (dir 3): 7iron 0.52, launched 3.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 3.3 yd from the pin; against the port's flight -2.3 yd along, +2.5 across.
- 1.3 from the green, 3.3 yd, wind 10 mph (dir 3): putter 0.297, aimed -0.625 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 2 mph (dir 4): 7iron 0.83, launched 0.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight +0.4 yd along, +2.6 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 3.9 yd, wind 2 mph (dir 4): putter 0.350, aimed -0.375 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 6 mph (dir 5): driver 0.97, launched 17.1 deg left of the pin line; planned: fairway, 261.2 yd from the pin. Result: fairway, 261.1 yd from the pin; against the port's flight +3.8 yd along, -4.6 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1).
- 3.2 from the fairway, 261.1 yd, wind 6 mph (dir 5): driver 0.95, launched 1.0 deg right of the pin line; planned: green, 7.2 yd from the pin. Result: green, 11.1 yd from the pin; against the port's flight +7.6 yd along, -0.6 across.
- 3.3 from the green, 11.1 yd, wind 6 mph (dir 5): putter 0.597, aimed -1 deg of the cup. Result: HOLED.

### Attempt 3: 3-2-3 (-4), 2026-10-22 04:29 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 8 mph (dir 6): driver 0.99, launched 4.0 deg right of the pin line; planned: fairway, 106.1 yd from the pin. Result: fairway, 113.1 yd from the pin; against the port's flight -6.2 yd along, +7.3 across.
- 1.2 from the fairway, 113.1 yd, wind 8 mph (dir 6): 7iron 0.66, launched 4.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 2.8 yd from the pin; against the port's flight +2.9 yd along, +0.6 across.
- 1.3 from the green, 2.8 yd, wind 8 mph (dir 6): putter 0.282, aimed +0.075 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.2 yd, wind 4 mph (dir 4): 7iron 0.94, launched 0.7 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight +0.5 yd along, +0.2 across. **avoided**: lines that failed from here before, not tried: 7.9 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 0.3 yd, wind 4 mph (dir 4): putter 0.136, aimed -3.725 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 521.6 yd, wind 0 mph (dir 5): driver 1.00, launched 20.0 deg left of the pin line; planned: fairway, 267.8 yd from the pin. Result: fairway, 270.1 yd from the pin; against the port's flight +0.1 yd along, -3.4 across. **avoided**: lines that failed from here before, not tried: 11.8 deg (rested 28 yd from the port's rest, round-r12 h3 k1).
- 3.2 from the fairway, 270.1 yd, wind 0 mph (dir 5): driver 0.99, launched 0.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +0.1 yd along, -0.8 across.
- 3.3 from the green, 1.0 yd, wind 0 mph (dir 5): putter 0.177, aimed -0.675 deg of the cup. Result: HOLED.

### Attempt 2: 3-2-4 (-3), 2026-10-22 04:25 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 395.1 yd, wind 4 mph (dir 7): driver 0.99, launched 2.5 deg right of the pin line; planned: fairway, 113.5 yd from the pin. Result: fairway, 113.9 yd from the pin; against the port's flight +0.3 yd along, +5.3 across.
- 1.2 from the fairway, 113.9 yd, wind 4 mph (dir 7): 7iron 0.66, launched 1.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.0 yd along, +0.9 across.
- 1.3 from the green, 0.5 yd, wind 4 mph (dir 7): putter 0.153, aimed -0.1 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 155.3 yd, wind 10 mph (dir 4): 5iron 0.72, launched 1.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight +1.0 yd along, -2.5 across. **avoided**: lines that failed from here before, not tried: 9.5 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 2.6 yd, wind 10 mph (dir 4): putter 0.274, aimed -0.8 deg of the cup. Result: HOLED.

Hole 3 (par 5): 4 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 8 mph (dir 2): driver 0.98, launched 20.0 deg left of the pin line; planned: fairway, 265.6 yd from the pin. Result: fairway, 274.5 yd from the pin; against the port's flight -9.4 yd along, -2.3 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1).
- 3.2 from the fairway, 274.5 yd, wind 8 mph (dir 2): driver 1.00, launched 6.0 deg left of the pin line; planned: fairway, 17.5 yd from the pin. Result: sand, 22.7 yd from the pin; against the port's flight -4.5 yd along, -2.9 across.
- 3.3 from the sand, 22.7 yd, wind 8 mph (dir 2): wedge 0.26, launched 2.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.3 yd from the pin; against the port's flight -2.2 yd along, +2.3 across.
- 3.4 from the green, 3.3 yd, wind 8 mph (dir 2): putter 0.333, aimed +0.1 deg of the cup. Result: HOLED.

### Attempt 1: 3-2-3 (-4), 2026-10-22 04:21 UTC

Hole 1 (par 4): 3 by the game's count.
- 1.1 from the tee, 401.3 yd, wind 2 mph (dir 1): driver 1.00, launched 3.0 deg right of the pin line; planned: fairway, 113.5 yd from the pin. Result: fairway, 116.3 yd from the pin; against the port's flight -2.3 yd along, +2.1 across.
- 1.2 from the fairway, 116.3 yd, wind 2 mph (dir 1): 5iron 0.52, launched 1.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.8 yd along, +0.6 across.
- 1.3 from the green, 0.9 yd, wind 2 mph (dir 1): putter 0.180, aimed +0 deg of the cup. Result: HOLED.

Hole 2 (par 3): 2 by the game's count.
- 2.1 from the tee, 152.2 yd, wind 8 mph (dir 3): 3iron 0.50, launched 3.0 deg left of the pin line; planned: green, 1.4 yd from the pin. Result: green, 5.2 yd from the pin; against the port's flight +3.0 yd along, +4.2 across. **avoided**: lines that failed from here before, not tried: 6.1 deg (rested 16 yd from the port's rest, round-r7 h2 k1).
- 2.2 from the green, 5.2 yd, wind 8 mph (dir 3): putter 0.428, aimed +1.325 deg of the cup. Result: HOLED.

Hole 3 (par 5): 3 by the game's count.
- 3.1 from the tee, 528.1 yd, wind 10 mph (dir 5): driver 0.97, launched 16.0 deg left of the pin line; planned: fairway, 262.4 yd from the pin. Result: fairway, 260.9 yd from the pin; against the port's flight +5.6 yd along, -4.7 across. **avoided**: lines that failed from here before, not tried: 11.7 deg (rested 28 yd from the port's rest, round-r12 h3 k1).
- 3.2 from the fairway, 260.9 yd, wind 10 mph (dir 5): driver 0.94, launched 3.0 deg right of the pin line; planned: green, 3.6 yd from the pin. Result: green, 11.7 yd from the pin; against the port's flight +9.5 yd along, -1.3 across.
- 3.3 from the green, 11.7 yd, wind 10 mph (dir 5): putter 0.601, aimed +0.225 deg of the cup. Result: HOLED.

