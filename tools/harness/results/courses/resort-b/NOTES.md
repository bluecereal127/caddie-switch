# Resort B (holes 4, 5, 6, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 21 (and 1 unfinished); best -4 (#2, 2-3-3); mean -2.71; last five -2 -3 -4 -4 -3.
- Hole 4 (par 3): best 2, mean 2.33 over 21.
- Hole 5 (par 5): best 3, mean 3.76 over 21.
- Hole 6 (par 4): best 3, mean 3.19 over 21.
- The planner's memory of these holes: 330 strokes from every round and attempt, 7 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 4, assist pulls: #14 stroke 2 (wedge), #8 stroke 2 (wedge).
- Hole 4, missed putts: #14 stroke 3 (putter, 7.6 yd), #8 stroke 3 (putter, 6.5 yd), #7 stroke 2 (putter, 6.8 yd), #3 stroke 2 (putter, 8.5 yd).
- Hole 5, missed putts: #18 stroke 3 (putter, 16.8 yd), #11 stroke 4 (putter, 6.9 yd).
- Hole 6, strokes 15+ yd from the port's flight: #18 stroke 2 (7iron), #15 stroke 2 (3iron), #12 stroke 2 (3iron), #6 stroke 1 (driver), #2 stroke 1 (driver).
- Hole 6, missed putts: #18 stroke 3 (putter, 15.6 yd), #16 stroke 3 (putter, 10.5 yd), #3 stroke 3 (putter, 10.5 yd), #3 stroke 4 (putter, 0.9 yd).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 4 (par 3): 12 rounds, -1 ×9, par ×2, +1 ×1.
- Hole 5 (par 5): 12 rounds, -1 ×10, par ×1, +1 ×1.
- Hole 6 (par 4): 12 rounds, -1 ×4, par ×6, +1 ×2.
  - stroke 2 from the sand (3iron): 1 time (round-r2: rested 31 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the rough (7iron): 1 time (round-r3: rested 36 yd from the port's rest); the planner no longer tries those lines from those spots.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 22: 2-4-3 (-3), 2026-10-22 05:47 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 18 mph (dir 2): 3iron 0.82, launched 6.0 deg left of the pin line; planned: green, 7 yd from the pin. Result: green, 7.1 yd from the pin; against the port's flight +3.9 yd along, +3.2 across.
- 4.2 from the green, 7.1 yd, wind 18 mph (dir 2): putter 0.439, aimed +2.7 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 16 mph (dir 6): driver 1.00, launched 3.0 deg left of the pin line; planned: fairway, 278.5 yd from the pin. Result: fairway, 278.3 yd from the pin; against the port's flight +2.4 yd along, +0.0 across.
- 5.2 from the fairway, 278.3 yd, wind 16 mph (dir 6): driver 1.00, launched 1.0 deg right of the pin line; planned: fairway, 36.8 yd from the pin. Result: fairway, 36.7 yd from the pin; against the port's flight +9.9 yd along, -7.0 across.
- 5.3 from the fairway, 36.7 yd, wind 16 mph (dir 6): 9iron 0.34, launched 1.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.4 yd from the pin; against the port's flight +0.8 yd along, +1.7 across.
- 5.4 from the green, 0.4 yd, wind 16 mph (dir 6): putter 0.147, aimed -0.725 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 14 mph (dir 5): driver 0.90, launched 3.0 deg right of the pin line; planned: fairway, 134 yd from the pin. Result: fairway, 133.9 yd from the pin; against the port's flight +3.1 yd along, -0.9 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 133.9 yd, wind 14 mph (dir 5): spoon 0.32, launched 0.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight +1.1 yd along, +4.0 across.
- 6.3 from the green, 2.0 yd, wind 14 mph (dir 5): putter 0.239, aimed +0.35 deg of the cup. Result: HOLED.

### Attempt 21: 2-3-3 (-4), 2026-10-22 05:42 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): 3iron 0.71, launched 6.0 deg right of the pin line; planned: green, 2.4 yd from the pin. Result: green, 2.8 yd from the pin; against the port's flight +6.8 yd along, +0.7 across.
- 4.2 from the green, 2.8 yd, wind 18 mph (dir 6): putter 0.253, aimed +0.4 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 14 mph (dir 4): driver 1.00, launched 6.6 deg left of the pin line; planned: rough, 257.5 yd from the pin. Result: rough, 257.5 yd from the pin; against the port's flight -0.2 yd along, +0.0 across. **repeat**: planned from resort-b/attempt-6 h5 k1's identical stroke (-0.2 along, +0 across the port).
- 5.2 from the rough, 257.5 yd, wind 14 mph (dir 4): driver 0.74, launched 3.0 deg left of the pin line; planned: fairway, 43.1 yd from the pin. Result: fairway, 43.1 yd from the pin; against the port's flight -0.2 yd along, -1.3 across.
- 5.3 from the fairway, 43.1 yd, wind 14 mph (dir 4): wedge 0.58, launched 3.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: HOLED. **holed**: holed from 43 yd off the green.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 10 mph (dir 5): driver 0.92, launched 3.0 deg left of the pin line; planned: fairway, 135.6 yd from the pin. Result: fairway, 135.5 yd from the pin; against the port's flight -4.1 yd along, +9.7 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 135.5 yd, wind 10 mph (dir 5): spoon 0.32, launched 0.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 1.7 yd from the pin; against the port's flight +0.1 yd along, +3.5 across.
- 6.3 from the green, 1.7 yd, wind 10 mph (dir 5): putter 0.225, aimed +0.125 deg of the cup. Result: HOLED.

### Attempt 20: 2-3-3 (-4), 2026-10-22 05:38 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 162.5 yd, wind 10 mph (dir 5): spoon 0.54, launched 1.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 3.9 yd from the pin; against the port's flight -0.4 yd along, +3.3 across.
- 4.2 from the green, 3.9 yd, wind 10 mph (dir 5): putter 0.339, aimed +0.45 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 18 mph (dir 4): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 256.4 yd from the pin. Result: fairway, 255.0 yd from the pin; against the port's flight +0.6 yd along, +1.7 across.
- 5.2 from the fairway, 255.0 yd, wind 18 mph (dir 4): spoon 1.00, launched 3.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 13.0 yd from the pin; against the port's flight +13.6 yd along, +2.0 across.
- 5.3 from the green, 13.0 yd, wind 18 mph (dir 4): putter 0.589, aimed +9.775 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 16 mph (dir 1): driver 1.00, launched 3.0 deg left of the pin line; planned: fairway, 145.2 yd from the pin. Result: fairway, 145.1 yd from the pin; against the port's flight -0.6 yd along, +1.2 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 145.1 yd, wind 16 mph (dir 1): driver 0.32, launched 4.0 deg left of the pin line; planned: green, 2.3 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight -0.7 yd along, +4.7 across.
- 6.3 from the green, 2.6 yd, wind 16 mph (dir 1): putter 0.267, aimed -0.175 deg of the cup. Result: HOLED.

### Attempt 19: 2-4-3 (-3), 2026-10-22 05:34 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 12 mph (dir 3): 3iron 0.75, launched 4.0 deg left of the pin line; planned: green, 2.8 yd from the pin. Result: green, 7.7 yd from the pin; against the port's flight +0.2 yd along, +4.8 across.
- 4.2 from the green, 7.7 yd, wind 12 mph (dir 3): putter 0.533, aimed +2.65 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 20 mph (dir 2): driver 0.98, launched 13.0 deg left of the pin line; planned: rough, 269 yd from the pin. Result: rough, 275.3 yd from the pin; against the port's flight -6.7 yd along, +0.0 across.
- 5.2 from the rough, 275.3 yd, wind 20 mph (dir 2): driver 0.75, launched 10.0 deg left of the pin line; planned: fairway, 58 yd from the pin. Result: fairway, 66.4 yd from the pin; against the port's flight -7.3 yd along, -4.1 across.
- 5.3 from the fairway, 66.4 yd, wind 20 mph (dir 2): 9iron 0.53, launched 8.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 3.8 yd from the pin; against the port's flight -2.9 yd along, +0.4 across.
- 5.4 from the green, 3.8 yd, wind 20 mph (dir 2): putter 0.373, aimed -0.65 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 18 mph (dir 1): driver 1.00, launched 2.6 deg right of the pin line; planned: rough, 155.4 yd from the pin. Result: rough, 162.1 yd from the pin; against the port's flight -8.3 yd along, -3.6 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.7 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 162.1 yd, wind 18 mph (dir 1): driver 0.40, launched 2.0 deg left of the pin line; planned: green, 1.3 yd from the pin. Result: green, 8.3 yd from the pin; against the port's flight +3.1 yd along, +9.0 across.
- 6.3 from the green, 8.3 yd, wind 18 mph (dir 1): putter 0.671, aimed +2.9 deg of the cup. Result: HOLED.

### Attempt 18: 2-4-4 (-2), 2026-10-22 05:30 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 18 mph (dir 6): 5iron 0.90, launched 9.4 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 5.5 yd from the pin; against the port's flight +3.0 yd along, +4.3 across.
- 4.2 from the green, 5.5 yd, wind 18 mph (dir 6): putter 0.439, aimed +2.15 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 16 mph (dir 5): driver 1.00, launched 10.0 deg left of the pin line; planned: fairway, 276.1 yd from the pin. Result: fairway, 275.2 yd from the pin; against the port's flight +0.6 yd along, +0.9 across.
- 5.2 from the fairway, 275.2 yd, wind 16 mph (dir 5): driver 1.00, launched 3.0 deg right of the pin line; planned: green, 18.6 yd from the pin. Result: fringe, 16.8 yd from the pin; against the port's flight +9.0 yd along, -3.7 across.
- 5.3 from the fringe, 16.8 yd, wind 16 mph (dir 5): putter 0.821, aimed ? of the cup. Result: green, 4.9 yd from the pin. **putt**: missed from 16.8 yd: rests 4.9 yd from the cup (the read: (the port's putt over the KCL line)).
- 5.4 from the green, 4.9 yd, wind 16 mph (dir 5): putter 0.390, aimed +1.35 deg of the cup. Result: HOLED.

Hole 6 (par 4): 4 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 10 mph (dir 2): driver 0.90, launched 3.0 deg left of the pin line; planned: fairway, 150.9 yd from the pin. Result: fairway, 146.8 yd from the pin; against the port's flight +4.0 yd along, +0.8 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 146.8 yd, wind 10 mph (dir 2): 7iron 0.95, launched 6.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: fringe, 15.6 yd from the pin; against the port's flight +12.2 yd along, +9.2 across. **miss**: rested 15 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 6.3 from the fringe, 15.6 yd, wind 10 mph (dir 2): putter 0.945, aimed ? of the cup. Result: green, 1.8 yd from the pin. **putt**: missed from 15.6 yd: rests 1.8 yd from the cup (the read: (the port's putt over the KCL line)).
- 6.4 from the green, 1.8 yd, wind 10 mph (dir 2): putter 0.223, aimed -0.075 deg of the cup. Result: HOLED.

### Attempt 17: 2-4-3 (-3), 2026-10-22 05:25 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 162.5 yd, wind 10 mph (dir 2): 5iron 1.00, launched 6.0 deg left of the pin line; planned: green, 1.8 yd from the pin. Result: green, 7.1 yd from the pin; against the port's flight +2.9 yd along, +4.5 across.
- 4.2 from the green, 7.1 yd, wind 10 mph (dir 2): putter 0.507, aimed +2.475 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 16 mph (dir 6): driver 0.98, launched 1.0 deg left of the pin line; planned: fairway, 274.7 yd from the pin. Result: fairway, 276.4 yd from the pin; against the port's flight -1.7 yd along, -0.2 across.
- 5.2 from the fairway, 276.4 yd, wind 16 mph (dir 6): driver 1.00, launched 1.0 deg right of the pin line; planned: fairway, 36.8 yd from the pin. Result: fairway, 35.3 yd from the pin; against the port's flight +4.5 yd along, -2.8 across.
- 5.3 from the fairway, 35.3 yd, wind 16 mph (dir 6): wedge 0.57, launched 4.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 2.8 yd from the pin; against the port's flight +0.2 yd along, +3.3 across.
- 5.4 from the green, 2.8 yd, wind 16 mph (dir 6): putter 0.319, aimed +1.525 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 14 mph (dir 7): driver 1.00, launched 6.0 deg right of the pin line; planned: fairway, 158.9 yd from the pin. Result: fairway, 151.2 yd from the pin; against the port's flight +7.7 yd along, -0.8 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.7 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 151.2 yd, wind 14 mph (dir 7): spoon 0.42, launched 2.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 6.9 yd from the pin; against the port's flight +1.2 yd along, +6.2 across.
- 6.3 from the green, 6.9 yd, wind 14 mph (dir 7): putter 0.605, aimed +0.275 deg of the cup. Result: HOLED.

### Attempt 16: 2-4-4 (-2), 2026-10-22 05:21 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 12 mph (dir 5): 5iron 0.86, launched 2.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: green, 5.1 yd from the pin; against the port's flight -1.4 yd along, +4.8 across.
- 4.2 from the green, 5.1 yd, wind 12 mph (dir 5): putter 0.414, aimed -0.75 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 10 mph (dir 2): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 276 yd from the pin. Result: fairway, 276.2 yd from the pin; against the port's flight +0.2 yd along, -0.9 across.
- 5.2 from the fairway, 276.2 yd, wind 10 mph (dir 2): driver 1.00, launched 6.0 deg left of the pin line; planned: fairway, 18.1 yd from the pin. Result: fairway, 17.5 yd from the pin; against the port's flight +0.9 yd along, -0.4 across.
- 5.3 from the fairway, 17.5 yd, wind 10 mph (dir 2): wedge 0.25, launched 4.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.2 yd from the pin; against the port's flight +0.1 yd along, +1.1 across.
- 5.4 from the green, 1.2 yd, wind 10 mph (dir 2): putter 0.206, aimed +1.175 deg of the cup. Result: HOLED.

Hole 6 (par 4): 4 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 16 mph (dir 3): driver 1.00, launched 1.0 deg right of the pin line; planned: bunker, 122.4 yd from the pin. Result: sand, 133.9 yd from the pin; against the port's flight -12.1 yd along, -1.8 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.7 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the sand, 133.9 yd, wind 16 mph (dir 3): 3iron 0.50, launched 4.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: fringe, 10.5 yd from the pin; against the port's flight +8.4 yd along, +7.3 across.
- 6.3 from the fringe, 10.5 yd, wind 16 mph (dir 3): putter 0.649, aimed ? of the cup. Result: green, 2.3 yd from the pin. **putt**: missed from 10.5 yd: rests 2.3 yd from the cup (the read: (the port's putt over the KCL line)).
- 6.4 from the green, 2.3 yd, wind 16 mph (dir 3): putter 0.298, aimed -3.175 deg of the cup. Result: HOLED.

### Attempt 15: 2-4-3 (-3), 2026-10-22 05:17 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): 5iron 0.89, launched 10.0 deg right of the pin line; planned: green, 2.4 yd from the pin. Result: green, 3.8 yd from the pin; against the port's flight +4.4 yd along, +1.5 across. **repeat**: planned from resort-b/attempt-4 h4 k1's identical stroke (+4.9 along, -0.1 across the port).
- 4.2 from the green, 3.8 yd, wind 18 mph (dir 6): putter 0.325, aimed +0.6 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 14 mph (dir 4): driver 1.00, launched 7.3 deg left of the pin line; planned: rough, 254.8 yd from the pin. Result: rough, 254.8 yd from the pin; against the port's flight -0.2 yd along, +0.0 across. **repeat**: planned from resort-b/attempt-6 h5 k1's identical stroke (-0.2 along, +0 across the port).
- 5.2 from the rough, 254.8 yd, wind 14 mph (dir 4): driver 0.75, launched 4.0 deg left of the pin line; planned: fairway, 39.9 yd from the pin. Result: fairway, 40.8 yd from the pin; against the port's flight +0.0 yd along, -1.2 across. **repeat**: planned from resort-b/attempt-6 h5 k2's identical stroke (+0.4 along, -0.2 across the port).
- 5.3 from the fairway, 40.8 yd, wind 14 mph (dir 4): 9iron 0.33, launched 4.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 4.3 yd from the pin; against the port's flight -0.0 yd along, +4.2 across.
- 5.4 from the green, 4.3 yd, wind 14 mph (dir 4): putter 0.394, aimed +1.45 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 10 mph (dir 5): driver 0.96, launched 4.0 deg left of the pin line; planned: rough, 113.2 yd from the pin. Result: rough, 116.0 yd from the pin; against the port's flight +1.7 yd along, +8.1 across. **repeat**: planned from resort-b/attempt-4 h6 k1's identical stroke (+3.8 along, +11.6 across the port). **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.1 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 116.0 yd, wind 10 mph (dir 5): 3iron 0.41, launched 2.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: green, 21.8 yd from the pin; against the port's flight +20.8 yd along, +6.9 across. **miss**: rested 22 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 6.3 from the green, 21.8 yd, wind 10 mph (dir 5): putter 1.373, aimed +4.65 deg of the cup. Result: HOLED.

### Attempt 14: 4-4-3 (-1), 2026-10-22 05:12 UTC

Hole 4 (par 3): 4 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 16 mph (dir 3): 3iron 0.74, launched 6.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: fairway, 12.0 yd from the pin; against the port's flight +9.6 yd along, +5.7 across.
- 4.2 from the fairway, 12.0 yd, wind 16 mph (dir 3): wedge 0.14, launched 4.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: fringe, 7.6 yd from the pin; against the port's flight +0.2 yd along, -0.2 across. **assist**: the game launched it at 0.070, not the swung 0.140 (WSR's pin-power assist on a partial swing).
- 4.3 from the fringe, 7.6 yd, wind 16 mph (dir 3): putter 0.402, aimed ? of the cup. Result: green, 0.6 yd from the pin. **putt**: missed from 7.6 yd: rests 0.6 yd from the cup (the read: (the port's putt over the KCL line)).
- 4.4 from the green, 0.6 yd, wind 16 mph (dir 3): putter 0.161, aimed +0.025 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 10 mph (dir 6): driver 1.00, launched 4.3 deg left of the pin line; planned: fairway, 279.8 yd from the pin. Result: rough, 277.6 yd from the pin; against the port's flight +2.1 yd along, +0.3 across.
- 5.2 from the rough, 277.6 yd, wind 10 mph (dir 6): driver 0.75, launched 4.0 deg left of the pin line; planned: fairway, 73.8 yd from the pin. Result: fairway, 71.9 yd from the pin; against the port's flight +2.5 yd along, -0.7 across.
- 5.3 from the fairway, 71.9 yd, wind 10 mph (dir 6): 7iron 0.48, launched 3.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight +2.9 yd along, +4.4 across.
- 5.4 from the green, 5.0 yd, wind 10 mph (dir 6): putter 0.399, aimed +0.675 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 20 mph (dir 4): driver 0.97, launched 2.0 deg right of the pin line; planned: rough, 104.1 yd from the pin. Result: rough, 103.7 yd from the pin; against the port's flight +0.3 yd along, +0.5 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.1 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 103.7 yd, wind 20 mph (dir 4): driver 0.19, launched 0.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 4.2 yd from the pin; against the port's flight -1.1 yd along, +4.4 across.
- 6.3 from the green, 4.2 yd, wind 20 mph (dir 4): putter 0.370, aimed -0.825 deg of the cup. Result: HOLED.

### Attempt 13: 2-4-3 (-3), 2026-10-22 05:07 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 18 mph (dir 5): 5iron 0.83, launched 3.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 5.7 yd from the pin; against the port's flight -1.4 yd along, +4.8 across.
- 4.2 from the green, 5.7 yd, wind 18 mph (dir 5): putter 0.449, aimed -0.675 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 12 mph (dir 3): driver 1.00, launched 8.0 deg left of the pin line; planned: rough, 261.7 yd from the pin. Result: sand, 259.9 yd from the pin; against the port's flight +1.4 yd along, +2.2 across.
- 5.2 from the sand, 259.9 yd, wind 12 mph (dir 3): 3iron 0.50, launched 13.0 deg right of the pin line; planned: rough, 139.3 yd from the pin. Result: rough, 138.8 yd from the pin; against the port's flight +0.5 yd along, -0.1 across.
- 5.3 from the rough, 138.8 yd, wind 12 mph (dir 3): driver 0.60, launched 3.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 6.4 yd from the pin; against the port's flight -5.6 yd along, -0.0 across.
- 5.4 from the green, 6.4 yd, wind 12 mph (dir 3): putter 0.601, aimed -0.825 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 14 mph (dir 6): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 140.9 yd from the pin. Result: fairway, 139.8 yd from the pin; against the port's flight +1.2 yd along, -1.9 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.7 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 139.8 yd, wind 14 mph (dir 6): spoon 0.34, launched 3.0 deg right of the pin line; planned: green, 2.9 yd from the pin. Result: green, 6.4 yd from the pin; against the port's flight -0.2 yd along, +3.8 across.
- 6.3 from the green, 6.4 yd, wind 14 mph (dir 6): putter 0.535, aimed -4.775 deg of the cup. Result: HOLED.

### Attempt 12: 2-4-3 (-3), 2026-10-22 05:03 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 10 mph (dir 3): 3iron 0.75, launched 4.0 deg left of the pin line; planned: green, 1.5 yd from the pin. Result: green, 4.6 yd from the pin; against the port's flight -1.4 yd along, +2.9 across.
- 4.2 from the green, 4.6 yd, wind 10 mph (dir 3): putter 0.389, aimed -0.625 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 20 mph (dir 0): driver 1.00, launched 7.3 deg left of the pin line; planned: fairway, 292.1 yd from the pin. Result: fairway, 290.9 yd from the pin; against the port's flight +0.4 yd along, +3.2 across.
- 5.2 from the fairway, 290.9 yd, wind 20 mph (dir 0): driver 1.00, launched 6.0 deg left of the pin line; planned: fairway, 58.7 yd from the pin. Result: fairway, 59.3 yd from the pin; against the port's flight +0.2 yd along, -1.7 across.
- 5.3 from the fairway, 59.3 yd, wind 20 mph (dir 0): 9iron 0.61, launched 6.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 3.4 yd from the pin; against the port's flight -2.6 yd along, -0.8 across.
- 5.4 from the green, 3.4 yd, wind 20 mph (dir 0): putter 0.320, aimed -0.625 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 14 mph (dir 5): driver 0.99, launched 4.0 deg left of the pin line; planned: fairway, 117.2 yd from the pin. Result: rough, 111.1 yd from the pin; against the port's flight +3.3 yd along, +7.1 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.1 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 111.1 yd, wind 14 mph (dir 5): 3iron 0.39, launched 4.0 deg right of the pin line; planned: green, 2.1 yd from the pin. Result: green, 22.9 yd from the pin; against the port's flight +23.4 yd along, +4.6 across. **miss**: rested 24 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 6.3 from the green, 22.9 yd, wind 14 mph (dir 5): putter 1.403, aimed +4.325 deg of the cup. Result: HOLED.

### Attempt 11: 2-5-3 (-2), 2026-10-22 04:59 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 162.5 yd, wind 12 mph (dir 5): 5iron 0.83, launched 3.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 5.5 yd from the pin; against the port's flight -3.1 yd along, +3.1 across.
- 4.2 from the green, 5.5 yd, wind 12 mph (dir 5): putter 0.427, aimed -0.1 deg of the cup. Result: HOLED.

Hole 5 (par 5): 5 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 18 mph (dir 4): driver 0.99, launched 8.0 deg left of the pin line; planned: rough, 252.9 yd from the pin. Result: rough, 253.2 yd from the pin; against the port's flight -0.1 yd along, -0.7 across.
- 5.2 from the rough, 253.2 yd, wind 18 mph (dir 4): driver 0.75, launched 6.0 deg left of the pin line; planned: fairway, 37.8 yd from the pin. Result: fairway, 38.2 yd from the pin; against the port's flight +0.3 yd along, -0.7 across.
- 5.3 from the fairway, 38.2 yd, wind 18 mph (dir 4): 9iron 0.30, launched 6.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: fringe, 6.9 yd from the pin; against the port's flight -0.3 yd along, +6.6 across.
- 5.4 from the fringe, 6.9 yd, wind 18 mph (dir 4): putter 0.528, aimed ? of the cup. Result: green, 0.3 yd from the pin. **putt**: missed from 6.9 yd: rests 0.3 yd from the cup (the read: (the port's putt over the KCL line)).
- 5.5 from the green, 0.3 yd, wind 18 mph (dir 4): putter 0.127, aimed -6.225 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 14 mph (dir 0): driver 0.94, launched 3.0 deg right of the pin line; planned: fairway, 151 yd from the pin. Result: fairway, 150.9 yd from the pin; against the port's flight +0.1 yd along, +0.1 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.1 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 150.9 yd, wind 14 mph (dir 0): 5iron 0.93, launched 0.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 5.2 yd from the pin; against the port's flight -0.6 yd along, +5.3 across.
- 6.3 from the green, 5.2 yd, wind 14 mph (dir 0): putter 0.427, aimed -0.7 deg of the cup. Result: HOLED.

### Attempt 10: 2-4-3 (-3), 2026-10-22 04:54 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 165.2 yd, wind 12 mph (dir 6): 5iron 0.90, launched 6.5 deg right of the pin line; planned: green, 1.9 yd from the pin. Result: green, 4.8 yd from the pin; against the port's flight -0.8 yd along, +6.5 across.
- 4.2 from the green, 4.8 yd, wind 12 mph (dir 6): putter 0.391, aimed +0.75 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 562.2 yd, wind 20 mph (dir 3): driver 1.00, launched 13.0 deg left of the pin line; planned: rough, 256.6 yd from the pin. Result: rough, 256.7 yd from the pin; against the port's flight -0.1 yd along, -0.1 across.
- 5.2 from the rough, 256.7 yd, wind 20 mph (dir 3): driver 0.75, launched 6.0 deg left of the pin line; planned: fairway, 36.7 yd from the pin. Result: fairway, 37.9 yd from the pin; against the port's flight -0.6 yd along, -1.4 across.
- 5.3 from the fairway, 37.9 yd, wind 20 mph (dir 3): wedge 0.51, launched 3.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 4.5 yd from the pin; against the port's flight -4.5 yd along, +1.1 across.
- 5.4 from the green, 4.5 yd, wind 20 mph (dir 3): putter 0.436, aimed -1.2 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 10 mph (dir 5): driver 0.92, launched 6.0 deg right of the pin line; planned: fairway, 149.6 yd from the pin. Result: sand, 142.5 yd from the pin; against the port's flight +7.1 yd along, -0.6 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.7 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the sand, 142.5 yd, wind 10 mph (dir 5): 3iron 0.49, launched 2.0 deg right of the pin line; planned: green, 1.5 yd from the pin. Result: green, 4.8 yd from the pin; against the port's flight -0.5 yd along, +6.1 across.
- 6.3 from the green, 4.8 yd, wind 10 mph (dir 5): putter 0.478, aimed -0.45 deg of the cup. Result: HOLED.

### Attempt 9: 2-4-3 (-3), 2026-10-22 04:50 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 162.5 yd, wind 18 mph (dir 5): 7iron 1.00, launched 4.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 7.0 yd from the pin; against the port's flight -6.3 yd along, +3.2 across.
- 4.2 from the green, 7.0 yd, wind 18 mph (dir 5): putter 0.523, aimed +0.275 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 16 mph (dir 2): driver 0.97, launched 13.0 deg left of the pin line; planned: rough, 275.9 yd from the pin. Result: rough, 281.2 yd from the pin; against the port's flight -5.5 yd along, -0.4 across.
- 5.2 from the rough, 281.2 yd, wind 16 mph (dir 2): driver 0.75, launched 13.0 deg left of the pin line; planned: fairway, 71 yd from the pin. Result: fairway, 70.8 yd from the pin; against the port's flight +0.5 yd along, -0.4 across.
- 5.3 from the fairway, 70.8 yd, wind 16 mph (dir 2): 7iron 0.40, launched 4.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 4.1 yd from the pin; against the port's flight +3.0 yd along, +2.1 across.
- 5.4 from the green, 4.1 yd, wind 16 mph (dir 2): putter 0.349, aimed +2.575 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 12 mph (dir 3): driver 0.90, launched 3.0 deg left of the pin line; planned: rough, 132.5 yd from the pin. Result: rough, 133.8 yd from the pin; against the port's flight -1.4 yd along, +1.0 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 133.8 yd, wind 12 mph (dir 3): 5iron 0.64, launched 6.0 deg left of the pin line; planned: green, 5.6 yd from the pin. Result: green, 5.0 yd from the pin; against the port's flight +2.4 yd along, +0.8 across. **avoided**: lines that failed from here before, not tried: 2.8 deg (rested 36 yd from the port's rest, round-r3 h6 k2).
- 6.3 from the green, 5.0 yd, wind 12 mph (dir 3): putter 0.399, aimed -0.2 deg of the cup. Result: HOLED.

### Attempt 8: 4-4-3 (-1), 2026-10-22 04:46 UTC

Hole 4 (par 3): 4 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 3): 5iron 0.93, launched 10.0 deg left of the pin line; planned: green, 2.5 yd from the pin. Result: fairway, 10.2 yd from the pin; against the port's flight +6.7 yd along, +6.2 across.
- 4.2 from the fairway, 10.2 yd, wind 18 mph (dir 3): wedge 0.11, launched 4.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: fringe, 6.5 yd from the pin; against the port's flight +0.0 yd along, -0.3 across. **assist**: the game launched it at 0.055, not the swung 0.110 (WSR's pin-power assist on a partial swing).
- 4.3 from the fringe, 6.5 yd, wind 18 mph (dir 3): putter 0.318, aimed ? of the cup. Result: green, 0.6 yd from the pin. **putt**: missed from 6.5 yd: rests 0.6 yd from the cup (the read: (the port's putt over the KCL line)).
- 4.4 from the green, 0.6 yd, wind 18 mph (dir 3): putter 0.161, aimed +0.075 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 14 mph (dir 2): driver 0.98, launched 10.0 deg left of the pin line; planned: rough, 271.2 yd from the pin. Result: rough, 282.5 yd from the pin; against the port's flight -11.2 yd along, -1.9 across.
- 5.2 from the rough, 282.5 yd, wind 14 mph (dir 2): driver 0.71, launched 10.0 deg left of the pin line; planned: fairway, 76.2 yd from the pin. Result: fairway, 77.8 yd from the pin; against the port's flight -1.3 yd along, -0.9 across.
- 5.3 from the fairway, 77.8 yd, wind 14 mph (dir 2): 9iron 0.73, launched 8.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 5.3 yd from the pin; against the port's flight +3.7 yd along, +3.2 across.
- 5.4 from the green, 5.3 yd, wind 14 mph (dir 2): putter 0.357, aimed +4.35 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 12 mph (dir 0): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 139.4 yd from the pin. Result: fairway, 139.4 yd from the pin; against the port's flight +0.1 yd along, +0.3 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 7.1 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the fairway, 139.4 yd, wind 12 mph (dir 0): 5iron 0.81, launched 0.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 6.9 yd from the pin; against the port's flight +0.3 yd along, +6.5 across.
- 6.3 from the green, 6.9 yd, wind 12 mph (dir 0): putter 0.518, aimed -0.525 deg of the cup. Result: HOLED.

### Attempt 7: 3-3-3 (-3), 2026-10-22 04:42 UTC

Hole 4 (par 3): 3 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): driver 0.47, launched 3.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: fringe, 6.8 yd from the pin; against the port's flight +2.3 yd along, +5.4 across.
- 4.2 from the fringe, 6.8 yd, wind 18 mph (dir 6): putter 0.393, aimed ? of the cup. Result: green, 0.5 yd from the pin. **putt**: missed from 6.8 yd: rests 0.5 yd from the cup (the read: (the port's putt over the KCL line)).
- 4.3 from the green, 0.5 yd, wind 18 mph (dir 6): putter 0.153, aimed -0.425 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 14 mph (dir 4): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 259.5 yd from the pin. Result: fairway, 259.5 yd from the pin; against the port's flight +0.6 yd along, +1.6 across. **repeat**: planned from resort-b/attempt-4 h5 k1's identical stroke (+0.6 along, +1.6 across the port).
- 5.2 from the fairway, 259.5 yd, wind 14 mph (dir 4): driver 0.89, launched 2.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 1.7 yd from the pin; against the port's flight +2.4 yd along, +1.5 across. **repeat**: planned from resort-b/attempt-4 h5 k2's identical stroke (+2.4 along, +1.5 across the port).
- 5.3 from the green, 1.7 yd, wind 14 mph (dir 4): putter 0.226, aimed +1.275 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 10 mph (dir 5): driver 0.94, launched 3.0 deg right of the pin line; planned: fairway, 136.2 yd from the pin. Result: rough, 129.4 yd from the pin; against the port's flight +6.8 yd along, -0.1 across. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1); 6.0 deg (rested 71 yd from the port's rest, resort-b/attempt-6 h6 k1).
- 6.2 from the rough, 129.4 yd, wind 10 mph (dir 5): driver 0.25, launched 1.0 deg right of the pin line; planned: green, 2.6 yd from the pin. Result: green, 7.0 yd from the pin; against the port's flight +0.2 yd along, +7.2 across. **avoided**: lines that failed from here before, not tried: 3.7 deg (rested 36 yd from the port's rest, round-r3 h6 k2).
- 6.3 from the green, 7.0 yd, wind 10 mph (dir 5): putter 0.546, aimed -0.8 deg of the cup. Result: HOLED.

### Attempt 6: 2-4-3 (-3), 2026-10-22 04:39 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): 3iron 0.73, launched 6.0 deg right of the pin line; planned: green, 1.4 yd from the pin. Result: green, 8.3 yd from the pin; against the port's flight +8.8 yd along, +1.4 across.
- 4.2 from the green, 8.3 yd, wind 18 mph (dir 6): putter 0.461, aimed +3.35 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 14 mph (dir 4): driver 1.00, launched 6.6 deg left of the pin line; planned: rough, 257.3 yd from the pin. Result: rough, 257.5 yd from the pin; against the port's flight -0.2 yd along, +0.0 across.
- 5.2 from the rough, 257.5 yd, wind 14 mph (dir 4): driver 0.75, launched 2.0 deg left of the pin line; planned: fairway, 39.4 yd from the pin. Result: fairway, 39.0 yd from the pin; against the port's flight +0.4 yd along, -0.2 across.
- 5.3 from the fairway, 39.0 yd, wind 14 mph (dir 4): wedge 0.53, launched 4.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight +0.5 yd along, +0.8 across.
- 5.4 from the green, 0.3 yd, wind 14 mph (dir 4): putter 0.147, aimed -0.5 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 10 mph (dir 5): driver 0.97, launched 6.0 deg left of the pin line; planned: fairway, 128 yd from the pin. Result: rough, 190.8 yd from the pin; against the port's flight -70.5 yd along, +8.3 across. **miss**: rested 71 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -0.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1).
- 6.2 from the rough, 190.8 yd, wind 10 mph (dir 5): driver 0.46, launched 2.0 deg right of the pin line; planned: green, 2.1 yd from the pin. Result: green, 6.5 yd from the pin; against the port's flight +0.9 yd along, +5.4 across.
- 6.3 from the green, 6.5 yd, wind 10 mph (dir 5): putter 0.515, aimed -0.775 deg of the cup. Result: HOLED.

### Attempt 5: 3-3-3 (-3), 2026-10-22 04:35 UTC

Hole 4 (par 3): 3 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): driver 0.46, launched 1.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: fairway, 10.7 yd from the pin; against the port's flight -10.6 yd along, +1.5 across. **repeat**: planned from round-r2 h4 k1's identical stroke (-1.1 along, +4.8 across the port).
- 4.2 from the fairway, 10.7 yd, wind 18 mph (dir 6): wedge 0.13, launched 6.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight +0.1 yd along, +0.6 across.
- 4.3 from the green, 0.5 yd, wind 18 mph (dir 6): putter 0.155, aimed +0.075 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 14 mph (dir 4): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 259.5 yd from the pin. Result: fairway, 259.5 yd from the pin; against the port's flight +0.6 yd along, +1.6 across. **repeat**: planned from resort-b/attempt-4 h5 k1's identical stroke (+0.6 along, +1.6 across the port).
- 5.2 from the fairway, 259.5 yd, wind 14 mph (dir 4): driver 0.89, launched 2.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 1.7 yd from the pin; against the port's flight +2.4 yd along, +1.5 across. **repeat**: planned from resort-b/attempt-4 h5 k2's identical stroke (+2.4 along, +1.5 across the port).
- 5.3 from the green, 1.7 yd, wind 14 mph (dir 4): putter 0.226, aimed +1.325 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 408.5 yd, wind 10 mph (dir 5): driver 1.00, launched 6.0 deg left of the pin line; planned: fairway, 118.2 yd from the pin. Result: rough, 112.6 yd from the pin; against the port's flight +2.6 yd along, +6.9 across. **avoided**: lines that failed from here before, not tried: 1.0 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1).
- 6.2 from the rough, 112.6 yd, wind 10 mph (dir 5): 3iron 0.37, launched 2.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: green, 7.0 yd from the pin; against the port's flight +5.6 yd along, +4.7 across.
- 6.3 from the green, 7.0 yd, wind 10 mph (dir 5): putter 0.526, aimed +0.7 deg of the cup. Result: HOLED.

### Attempt 4: 2-3-3 (-4), 2026-10-22 04:31 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 6): 5iron 0.91, launched 10.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 4.5 yd from the pin; against the port's flight +4.9 yd along, -0.1 across.
- 4.2 from the green, 4.5 yd, wind 18 mph (dir 6): putter 0.340, aimed +0.825 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 14 mph (dir 4): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 260.8 yd from the pin. Result: fairway, 259.5 yd from the pin; against the port's flight +0.6 yd along, +1.6 across.
- 5.2 from the fairway, 259.5 yd, wind 14 mph (dir 4): driver 0.89, launched 2.0 deg right of the pin line; planned: green, 1.5 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +2.4 yd along, +1.5 across.
- 5.3 from the green, 1.6 yd, wind 14 mph (dir 4): putter 0.218, aimed +1.175 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 10 mph (dir 5): driver 0.94, launched 6.0 deg left of the pin line; planned: fairway, 139.2 yd from the pin. Result: rough, 131.0 yd from the pin; against the port's flight +3.8 yd along, +11.6 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1).
- 6.2 from the rough, 131.0 yd, wind 10 mph (dir 5): spoon 0.31, launched 2.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 8.2 yd from the pin; against the port's flight +2.8 yd along, +6.1 across.
- 6.3 from the green, 8.2 yd, wind 10 mph (dir 5): putter 0.674, aimed +0.35 deg of the cup. Result: HOLED.

### Attempt 3: 3-4-5 (E), 2026-10-22 04:27 UTC

Hole 4 (par 3): 3 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 12 mph (dir 4): 5iron 0.86, launched 3.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: fringe, 8.5 yd from the pin; against the port's flight +8.4 yd along, +3.6 across.
- 4.2 from the fringe, 8.5 yd, wind 12 mph (dir 4): putter 0.445, aimed ? of the cup. Result: green, 0.7 yd from the pin. **putt**: missed from 8.5 yd: rests 0.7 yd from the cup (the read: (the port's putt over the KCL line)).
- 4.3 from the green, 0.7 yd, wind 12 mph (dir 4): putter 0.167, aimed +0.125 deg of the cup. Result: HOLED.

Hole 5 (par 5): 4 by the game's count.
- 5.1 from the tee, 566.0 yd, wind 14 mph (dir 6): driver 1.00, launched 2.0 deg left of the pin line; planned: fairway, 282.7 yd from the pin. Result: rough, 280.5 yd from the pin; against the port's flight +2.2 yd along, +0.5 across.
- 5.2 from the rough, 280.5 yd, wind 14 mph (dir 6): driver 0.75, launched 1.0 deg right of the pin line; planned: fairway, 73.2 yd from the pin. Result: fairway, 72.8 yd from the pin; against the port's flight +0.4 yd along, -0.0 across.
- 5.3 from the fairway, 72.8 yd, wind 14 mph (dir 6): 9iron 0.76, launched 8.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.5 yd from the pin; against the port's flight +1.3 yd along, -0.8 across.
- 5.4 from the green, 1.5 yd, wind 14 mph (dir 6): putter 0.170, aimed +0 deg of the cup. Result: HOLED.

Hole 6 (par 4): 5 by the game's count.
- 6.1 from the tee, 421.6 yd, wind 16 mph (dir 7): driver 1.00, launched 4.0 deg right of the pin line; planned: fairway, 151.9 yd from the pin. Result: fairway, 152.8 yd from the pin; against the port's flight -0.9 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: 1.6 deg (rested 18 yd from the port's rest, resort-b/attempt-2 h6 k1).
- 6.2 from the fairway, 152.8 yd, wind 16 mph (dir 7): spoon 0.42, launched 3.0 deg right of the pin line; planned: green, 5 yd from the pin. Result: green, 10.5 yd from the pin; against the port's flight +7.7 yd along, +5.8 across.
- 6.3 from the green, 10.5 yd, wind 16 mph (dir 7): putter 0.773, aimed +2.075 deg of the cup. Result: green, 0.9 yd from the pin. **putt**: missed from 10.5 yd: rests 0.9 yd from the cup (the read: (WSR's tick over the green's KCL, 1760 ms): aim +2.07 deg right of the cup, putter 0.7725 (holes 0.685-0.861; the app's read 1.63 deg 0.7505)).
- 6.4 from the green, 0.9 yd, wind 16 mph (dir 7): putter 0.092, aimed -10.75 deg of the cup. Result: green, 0.3 yd from the pin. **putt**: missed from 0.9 yd: rests 0.3 yd from the cup (the read: (WSR's tick over the green's KCL, 671 ms): aim -10.75 deg right of the cup, putter 0.0920 (holes 0.052-0.132; the app's read -17.00 deg 0.0650)).
- 6.5 from the green, 0.3 yd, wind 16 mph (dir 7): putter 0.151, aimed -2.1 deg of the cup. Result: HOLED.

### Attempt 2: 2-3-3 (-4), 2026-10-22 04:23 UTC

Hole 4 (par 3): 2 by the game's count.
- 4.1 from the tee, 163.4 yd, wind 18 mph (dir 0): 3iron 0.84, launched 3.0 deg right of the pin line; planned: green, 2.3 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight -3.2 yd along, +0.5 across.
- 4.2 from the green, 0.9 yd, wind 18 mph (dir 0): putter 0.178, aimed -0.275 deg of the cup. Result: HOLED.

Hole 5 (par 5): 3 by the game's count.
- 5.1 from the tee, 558.7 yd, wind 12 mph (dir 4): driver 1.00, launched 13.0 deg left of the pin line; planned: fairway, 263.5 yd from the pin. Result: fairway, 262.7 yd from the pin; against the port's flight +0.2 yd along, +1.3 across.
- 5.2 from the fairway, 262.7 yd, wind 12 mph (dir 4): driver 0.92, launched 2.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 3.6 yd from the pin; against the port's flight +2.5 yd along, +1.5 across.
- 5.3 from the green, 3.6 yd, wind 12 mph (dir 4): putter 0.301, aimed +1.625 deg of the cup. Result: HOLED.

Hole 6 (par 4): 3 by the game's count.
- 6.1 from the tee, 417.6 yd, wind 20 mph (dir 3): driver 1.00, launched 0.0 deg right of the pin line; planned: rough, 110.7 yd from the pin. Result: sand, 127.3 yd from the pin; against the port's flight -17.5 yd along, -2.7 across. **miss**: rested 18 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 6.2 from the sand, 127.3 yd, wind 20 mph (dir 3): 3iron 0.42, launched 2.0 deg right of the pin line; planned: green, 12.7 yd from the pin. Result: green, 19.6 yd from the pin; against the port's flight +3.6 yd along, +6.5 across.
- 6.3 from the green, 19.6 yd, wind 20 mph (dir 3): putter 1.351, aimed +0.85 deg of the cup. Result: HOLED.

