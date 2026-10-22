# Classic C (holes 16, 17, 18, par 12)

Played over and over on one harness instance (tools/harness/course-supervisor.mjs), naturally: the game's own wind and pins (3-hole rounds use WSR's set B pins), club and aim by D-pad, the swing simulated through the game's power pipeline, the planner (round-planner.mjs) re-imported for every stroke. Goal: 6 under par (6 strokes). Written by course-notes.mjs after every attempt.

- Attempts finished: 21; best -4 (#21, 3-2-3); mean -2; last five -1 E -1 -1 -4.
- Hole 16 (par 4): best 3, mean 3.38 over 21.
- Hole 17 (par 3): best 2, mean 2.81 over 21.
- Hole 18 (par 5): best 3, mean 3.81 over 21.
- The planner's memory of these holes: 326 strokes from every round and attempt, 28 of them failed lines it no longer tries from their spots.

## What recurs

- Hole 16, strokes 15+ yd from the port's flight: #20 stroke 1 (driver), #17 stroke 2 (9iron), #15 stroke 2 (7iron).
- Hole 17, penalties: #1 stroke 1 (spoon).
- Hole 17, strokes 15+ yd from the port's flight: #7 stroke 1 (driver), #6 stroke 1 (spoon).
- Hole 18, strokes 15+ yd from the port's flight: #13 stroke 2 (spoon), #9 stroke 2 (spoon), #7 stroke 1 (driver), #7 stroke 2 (5iron), #3 stroke 2 (3iron).

<!-- lessons -->
## Lessons

From the 12 natural 18-hole rounds before these attempts (round-planner.mjs as it was then: no lie yaw, a 300-candidate cap, no memory):

- Hole 16 (par 4): 12 rounds, -1 ×9, par ×1, +1 ×2.
  - stroke 1 from the tee (spoon): 8 times (round-r10: rested 58 yd from the port's rest; round-r11: rested 58 yd from the port's rest; round-r12: rested 49 yd from the port's rest; round-r2: rested 49 yd from the port's rest; round-r3: rested 49 yd from the port's rest; round-r5: rested 49 yd from the port's rest; round-r6: rested 49 yd from the port's rest; round-r9: rested 49 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the rough (3iron): 2 times (round-r2: rested 86 yd from the port's rest; round-r3: rested 86 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 1 from the tee (driver): 1 time (round-r4: rested 25 yd from the port's rest); the planner no longer tries those lines from those spots.
- Hole 17 (par 3): 12 rounds, -2 ×1, -1 ×1, par ×10.
  - stroke 1 from the tee (driver): 1 time (round-r11: rested 36 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 1 from the tee (spoon): 1 time (round18: rested 18 yd from the port's rest); the planner no longer tries those lines from those spots.
- Hole 18 (par 5): 12 rounds, -2 ×3, -1 ×9.
  - stroke 2 from the fairway (5iron): 2 times (round-r4: rested 17 yd from the port's rest; round-r8: rested 15 yd from the port's rest); the planner no longer tries those lines from those spots.
  - stroke 2 from the fairway (3iron): 1 time (round-r7: rested 16 yd from the port's rest); the planner no longer tries those lines from those spots.

Since 2026-10-22 the planner aims shots from rough and sand 2 deg left of where it wants them to start (WSR's lie yaw, fitted on 86 rough strokes), tries every candidate (no 300 cap), leans 1 yd against rough and 3 against sand when two rests' second shots are about as good, and remembers every stroke: failed lines are skipped from the same spot, and a stroke that repeats an earlier one (same spot, club, power, line and wind) is corrected by what that one did.
<!-- /lessons -->

## Attempts (newest first)

### Attempt 21: 3-2-3 (-4), 2026-10-22 05:45 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 24 mph (dir 0): driver 0.66, launched 19.5 deg left of the pin line; planned: rough, 101.6 yd from the pin. Result: rough, 101.5 yd from the pin; against the port's flight +0.6 yd along, -6.0 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 13.0 deg (the game put the ball back where it was hit (out of bounds), classic-c/attempt-20 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the rough, 101.5 yd, wind 24 mph (dir 0): spoon 0.31, launched 2.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 1.9 yd from the pin; against the port's flight -7.8 yd along, -0.5 across.
- 16.3 from the green, 1.9 yd, wind 24 mph (dir 0): putter 0.220, aimed +0.225 deg of the cup. Result: HOLED.

Hole 17 (par 3): 2 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 22 mph (dir 6): spoon 1.00, launched 13.0 deg right of the pin line; planned: green, 18.5 yd from the pin. Result: green, 18.8 yd from the pin; against the port's flight +8.3 yd along, -4.9 across. **repeat**: planned from classic-c/attempt-15 h17 k1's identical stroke (+0.3 along, -1.5 across the port). **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the green, 18.8 yd, wind 22 mph (dir 6): putter 0.949, aimed -3.8 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 30 mph (dir 1): driver 1.00, launched 16.0 deg right of the pin line; planned: fairway, 243.2 yd from the pin. Result: fairway, 242.9 yd from the pin; against the port's flight +4.4 yd along, +2.5 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 242.9 yd, wind 30 mph (dir 1): driver 1.00, launched 4.0 deg left of the pin line; planned: green, 6.7 yd from the pin. Result: green, 6.4 yd from the pin; against the port's flight +3.6 yd along, +1.2 across.
- 18.3 from the green, 6.4 yd, wind 30 mph (dir 1): putter 0.503, aimed -0.5 deg of the cup. Result: HOLED.

### Attempt 20: 5-3-3 (-1), 2026-10-22 05:42 UTC

Hole 16 (par 4): 5 by the game's count (1 penalty).
- 16.1 from the tee, 246.7 yd, wind 30 mph (dir 6): driver 0.82, launched 13.0 deg left of the pin line; planned: fairway, 88.8 yd from the pin. Result: tee, 109.6 yd from the pin; against the port's flight -83.7 yd along, +20.6 across. **miss**: rested 86 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the tee, 246.7 yd, wind 30 mph (dir 6): driver 0.66, launched 19.7 deg left of the pin line; planned: fairway, 109.2 yd from the pin. Result: fairway, 108.9 yd from the pin; against the port's flight +5.0 yd along, -1.5 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 13.0 deg (the game put the ball back where it was hit (out of bounds), classic-c/attempt-20 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.3 from the fairway, 108.9 yd, wind 30 mph (dir 6): spoon 0.34, launched 0.0 deg left of the pin line; planned: green, 4.8 yd from the pin. Result: green, 3.0 yd from the pin; against the port's flight -10.0 yd along, +2.6 across.
- 16.4 from the green, 3.0 yd, wind 30 mph (dir 6): putter 0.278, aimed -0.2 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 22 mph (dir 7): spoon 0.92, launched 13.0 deg right of the pin line; planned: fairway, 43.9 yd from the pin. Result: rough, 43.9 yd from the pin; against the port's flight +1.7 yd along, -2.9 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the rough, 43.9 yd, wind 22 mph (dir 7): wedge 0.57, launched 13.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.6 yd along, +0.3 across.
- 17.3 from the green, 0.9 yd, wind 22 mph (dir 7): putter 0.178, aimed -0.375 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 28 mph (dir 3): driver 1.00, launched 10.0 deg left of the pin line; planned: fairway, 152.6 yd from the pin. Result: fairway, 155.5 yd from the pin; against the port's flight -0.3 yd along, -2.1 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 155.5 yd, wind 28 mph (dir 3): 3iron 0.60, launched 4.0 deg left of the pin line; planned: green, 1.8 yd from the pin. Result: green, 1.8 yd from the pin; against the port's flight +8.7 yd along, +2.6 across.
- 18.3 from the green, 1.8 yd, wind 28 mph (dir 3): putter 0.218, aimed +0.025 deg of the cup. Result: HOLED.

### Attempt 19: 3-3-5 (-1), 2026-10-22 05:38 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 28 mph (dir 3): spoon 0.96, launched 28.8 deg left of the pin line; planned: fairway, 98.1 yd from the pin. Result: fairway, 101.6 yd from the pin; against the port's flight -5.4 yd along, -6.5 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 101.6 yd, wind 28 mph (dir 3): spoon 0.36, launched 3.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -3.0 yd along, +1.1 across.
- 16.3 from the green, 1.4 yd, wind 28 mph (dir 3): putter 0.221, aimed -0.1 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 216.1 yd, wind 24 mph (dir 4): 3iron 1.00, launched 6.0 deg left of the pin line; planned: fairway, 28.6 yd from the pin. Result: fairway, 28.9 yd from the pin; against the port's flight -4.6 yd along, +0.0 across. **repeat**: planned from classic-c/attempt-5 h17 k1's identical stroke (-5.8 along, +0 across the port). **avoided**: lines that failed from here before, not tried: 2.1 deg (rested 18 yd from the port's rest, round18 h17 k1); -2.6 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -5.1 deg (hazard 1, classic-c/attempt-1 h17 k1); 9.4 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 28.9 yd, wind 24 mph (dir 4): wedge 0.45, launched 10.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight -0.1 yd along, +0.4 across.
- 17.3 from the green, 0.3 yd, wind 24 mph (dir 4): putter 0.138, aimed -3.65 deg of the cup. Result: HOLED.

Hole 18 (par 5): 5 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 26 mph (dir 2): driver 0.95, launched 16.0 deg right of the pin line; planned: fairway, 226.4 yd from the pin. Result: rough, 224.1 yd from the pin; against the port's flight +6.2 yd along, +2.7 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the rough, 224.1 yd, wind 26 mph (dir 2): 3iron 0.53, launched 16.0 deg right of the pin line; planned: fairway, 124 yd from the pin. Result: rough, 125.3 yd from the pin; against the port's flight +4.6 yd along, +7.9 across.
- 18.3 from the rough, 125.3 yd, wind 26 mph (dir 2): 3iron 0.59, launched 6.0 deg left of the pin line; planned: green, 2.5 yd from the pin. Result: fairway, 11.1 yd from the pin; against the port's flight +11.6 yd along, +2.1 across.
- 18.4 from the fairway, 11.1 yd, wind 26 mph (dir 2): wedge 0.13, launched 2.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight -0.4 yd along, +0.7 across.
- 18.5 from the green, 0.2 yd, wind 26 mph (dir 2): putter 0.077, aimed -29.85 deg of the cup. Result: HOLED.

### Attempt 18: 4-3-5 (E), 2026-10-22 05:33 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 20 mph (dir 6): driver 0.64, launched 22.7 deg left of the pin line; planned: rough, 118.4 yd from the pin. Result: fairway, 120.4 yd from the pin; against the port's flight +2.8 yd along, -3.2 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 120.4 yd, wind 20 mph (dir 6): 5iron 0.88, launched 6.0 deg right of the pin line; planned: fairway, 10.2 yd from the pin. Result: sand, 14.5 yd from the pin; against the port's flight +7.2 yd along, -0.7 across.
- 16.3 from the sand, 14.5 yd, wind 20 mph (dir 6): wedge 0.14, launched 5.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight +0.2 yd along, -1.8 across.
- 16.4 from the green, 2.0 yd, wind 20 mph (dir 6): putter 0.258, aimed +0.15 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 24 mph (dir 1): driver 0.92, launched 4.0 deg left of the pin line; planned: green, 12.5 yd from the pin. Result: fairway, 15.0 yd from the pin; against the port's flight +6.6 yd along, -3.0 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 15.0 yd, wind 24 mph (dir 1): wedge 0.16, launched 8.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight -0.0 yd along, +0.3 across.
- 17.3 from the green, 0.3 yd, wind 24 mph (dir 1): putter 0.132, aimed -6.45 deg of the cup. Result: HOLED.

Hole 18 (par 5): 5 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 28 mph (dir 5): driver 1.00, launched 30.9 deg right of the pin line; planned: fairway, 222.4 yd from the pin. Result: rough, 217.3 yd from the pin; against the port's flight +7.0 yd along, -1.6 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the rough, 217.3 yd, wind 28 mph (dir 5): wedge 0.21, launched 2.0 deg right of the pin line; planned: rough, 204.4 yd from the pin. Result: rough, 204.7 yd from the pin; against the port's flight -0.4 yd along, -0.0 across.
- 18.3 from the rough, 204.7 yd, wind 28 mph (dir 5): 5iron 0.68, launched 40.0 deg right of the pin line; planned: rough, 113.6 yd from the pin. Result: rough, 117.6 yd from the pin; against the port's flight -3.2 yd along, +3.3 across.
- 18.4 from the rough, 117.6 yd, wind 28 mph (dir 5): 7iron 0.65, launched 2.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight -0.3 yd along, -0.2 across.
- 18.5 from the green, 0.9 yd, wind 28 mph (dir 5): putter 0.173, aimed -0.025 deg of the cup. Result: HOLED.

### Attempt 17: 4-3-4 (-1), 2026-10-22 05:27 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 28 mph (dir 3): spoon 0.92, launched 28.8 deg left of the pin line; planned: fairway, 96.5 yd from the pin. Result: fairway, 100.5 yd from the pin; against the port's flight -5.2 yd along, -6.1 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 100.5 yd, wind 28 mph (dir 3): 9iron 0.98, launched 10.0 deg right of the pin line; planned: green, 1.1 yd from the pin. Result: fairway, 15.3 yd from the pin; against the port's flight +11.6 yd along, -9.6 across. **miss**: rested 15 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 16.3 from the fairway, 15.3 yd, wind 28 mph (dir 3): wedge 0.17, launched 4.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight +0.1 yd along, +1.1 across.
- 16.4 from the green, 1.0 yd, wind 28 mph (dir 3): putter 0.183, aimed -1.025 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 215.5 yd, wind 24 mph (dir 4): 3iron 1.00, launched 3.0 deg left of the pin line; planned: fairway, 18.3 yd from the pin. Result: fairway, 18.3 yd from the pin; against the port's flight -5.8 yd along, +0.0 across. **repeat**: planned from classic-c/attempt-5 h17 k1's identical stroke (-5.8 along, +0 across the port). **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 6.5 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (hazard 1, classic-c/attempt-1 h17 k1); -10.8 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 18.3 yd, wind 24 mph (dir 4): wedge 0.20, launched 6.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 0.2 yd from the pin; against the port's flight -0.2 yd along, +0.3 across.
- 17.3 from the green, 0.2 yd, wind 24 mph (dir 4): putter 0.106, aimed -17.275 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 26 mph (dir 2): driver 0.87, launched 16.0 deg right of the pin line; planned: fairway, 234.8 yd from the pin. Result: fairway, 231.6 yd from the pin; against the port's flight +7.8 yd along, +3.8 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 231.6 yd, wind 26 mph (dir 2): driver 0.90, launched 8.0 deg left of the pin line; planned: green, 4.7 yd from the pin. Result: fairway, 12.4 yd from the pin; against the port's flight +10.0 yd along, +3.2 across.
- 18.3 from the fairway, 12.4 yd, wind 26 mph (dir 2): wedge 0.14, launched 8.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.1 yd along, +0.3 across.
- 18.4 from the green, 0.5 yd, wind 26 mph (dir 2): putter 0.152, aimed -0.2 deg of the cup. Result: HOLED.

### Attempt 16: 3-3-5 (-1), 2026-10-22 05:23 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 250.6 yd, wind 26 mph (dir 5): driver 0.60, launched 20.0 deg left of the pin line; planned: rough, 106.3 yd from the pin. Result: rough, 109.8 yd from the pin; against the port's flight +0.9 yd along, -4.2 across. **avoided**: lines that failed from here before, not tried: -5.6 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 24.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the rough, 109.8 yd, wind 26 mph (dir 5): 3iron 0.49, launched 4.0 deg right of the pin line; planned: green, 5.2 yd from the pin. Result: green, 11.0 yd from the pin; against the port's flight +11.3 yd along, -1.5 across.
- 16.3 from the green, 11.0 yd, wind 26 mph (dir 5): putter 0.553, aimed -0.25 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 215.5 yd, wind 20 mph (dir 4): 3iron 0.99, launched 2.0 deg left of the pin line; planned: fairway, 17.1 yd from the pin. Result: fairway, 15.9 yd from the pin; against the port's flight -8.5 yd along, -2.3 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 6.5 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (hazard 1, classic-c/attempt-1 h17 k1); -10.8 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 15.9 yd, wind 20 mph (dir 4): wedge 0.16, launched 6.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.0 yd along, +1.1 across.
- 17.3 from the green, 0.9 yd, wind 20 mph (dir 4): putter 0.176, aimed -0.1 deg of the cup. Result: HOLED.

Hole 18 (par 5): 5 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 28 mph (dir 3): spoon 0.96, launched 20.0 deg right of the pin line; planned: fairway, 224.4 yd from the pin. Result: rough, 223.5 yd from the pin; against the port's flight +2.3 yd along, +0.9 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the rough, 223.5 yd, wind 28 mph (dir 3): 5iron 0.56, launched 20.0 deg right of the pin line; planned: fairway, 138.5 yd from the pin. Result: fairway, 131.5 yd from the pin; against the port's flight +13.0 yd along, +4.3 across.
- 18.3 from the fairway, 131.5 yd, wind 28 mph (dir 3): 7iron 0.94, launched 13.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: fairway, 12.3 yd from the pin; against the port's flight +8.3 yd along, +7.9 across.
- 18.4 from the fairway, 12.3 yd, wind 28 mph (dir 3): wedge 0.17, launched 8.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.2 yd along, +0.4 across.
- 18.5 from the green, 0.5 yd, wind 28 mph (dir 3): putter 0.144, aimed -2.15 deg of the cup. Result: HOLED.

### Attempt 15: 4-2-3 (-3), 2026-10-22 05:18 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 28 mph (dir 3): spoon 0.94, launched 25.5 deg left of the pin line; planned: fairway, 82.7 yd from the pin. Result: fairway, 85.9 yd from the pin; against the port's flight -5.8 yd along, -6.2 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 85.9 yd, wind 28 mph (dir 3): 7iron 0.51, launched 8.0 deg right of the pin line; planned: green, 1 yd from the pin. Result: sand, 22.4 yd from the pin; against the port's flight -20.9 yd along, +6.1 across. **miss**: rested 22 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 16.3 from the sand, 22.4 yd, wind 28 mph (dir 3): 9iron 0.13, launched 6.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight +0.5 yd along, +1.9 across.
- 16.4 from the green, 2.2 yd, wind 28 mph (dir 3): putter 0.239, aimed +0.025 deg of the cup. Result: HOLED.

Hole 17 (par 3): 2 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 22 mph (dir 6): spoon 1.00, launched 13.0 deg right of the pin line; planned: fairway, 23.2 yd from the pin. Result: green, 18.8 yd from the pin; against the port's flight +8.3 yd along, -4.9 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the green, 18.8 yd, wind 22 mph (dir 6): putter 0.949, aimed -3.8 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 30 mph (dir 4): driver 1.00, launched 3.0 deg left of the pin line; planned: fairway, 137.2 yd from the pin. Result: fairway, 138.0 yd from the pin; against the port's flight -1.0 yd along, +0.7 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 138.0 yd, wind 30 mph (dir 4): 9iron 1.00, launched 6.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 5.7 yd from the pin; against the port's flight +6.3 yd along, -1.7 across.
- 18.3 from the green, 5.7 yd, wind 30 mph (dir 4): putter 0.451, aimed +0.15 deg of the cup. Result: HOLED.

### Attempt 14: 3-3-3 (-3), 2026-10-22 05:14 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 22 mph (dir 5): driver 0.64, launched 22.8 deg left of the pin line; planned: rough, 112.8 yd from the pin. Result: fairway, 116.6 yd from the pin; against the port's flight +1.9 yd along, -4.5 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 116.6 yd, wind 22 mph (dir 5): 7iron 1.00, launched 10.0 deg right of the pin line; planned: green, 6.3 yd from the pin. Result: green, 10.4 yd from the pin; against the port's flight +8.2 yd along, -10.8 across.
- 16.3 from the green, 10.4 yd, wind 22 mph (dir 5): putter 0.563, aimed -2.25 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 24 mph (dir 2): spoon 0.93, launched 4.0 deg left of the pin line; planned: green, 19.5 yd from the pin. Result: fairway, 20.5 yd from the pin; against the port's flight +5.3 yd along, +0.3 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 20.5 yd, wind 24 mph (dir 2): wedge 0.26, launched 2.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.2 yd from the pin; against the port's flight +0.1 yd along, +0.9 across.
- 17.3 from the green, 1.2 yd, wind 24 mph (dir 2): putter 0.194, aimed -0.225 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 26 mph (dir 0): driver 1.00, launched 16.0 deg right of the pin line; planned: fairway, 239 yd from the pin. Result: fairway, 236.4 yd from the pin; against the port's flight +5.8 yd along, +3.2 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 236.4 yd, wind 26 mph (dir 0): driver 0.97, launched 2.0 deg right of the pin line; planned: green, 0.8 yd from the pin. Result: green, 0.4 yd from the pin; against the port's flight +0.3 yd along, -0.3 across.
- 18.3 from the green, 0.4 yd, wind 26 mph (dir 0): putter 0.134, aimed -3.8 deg of the cup. Result: HOLED.

### Attempt 13: 3-2-4 (-3), 2026-10-22 05:09 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 250.6 yd, wind 24 mph (dir 2): spoon 0.98, launched 29.8 deg left of the pin line; planned: fairway, 93 yd from the pin. Result: fairway, 92.4 yd from the pin; against the port's flight +7.6 yd along, +1.6 across. **avoided**: lines that failed from here before, not tried: -5.6 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 24.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 92.4 yd, wind 24 mph (dir 2): 3iron 0.32, launched 1.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 2.8 yd from the pin; against the port's flight +1.1 yd along, +1.6 across.
- 16.3 from the green, 2.8 yd, wind 24 mph (dir 2): putter 0.238, aimed +4.675 deg of the cup. Result: HOLED.

Hole 17 (par 3): 2 by the game's count.
- 17.1 from the tee, 215.5 yd, wind 28 mph (dir 1): spoon 1.00, launched 3.0 deg left of the pin line; planned: green, 19.1 yd from the pin. Result: green, 19.4 yd from the pin; against the port's flight +3.9 yd along, +1.6 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 6.5 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (hazard 1, classic-c/attempt-1 h17 k1); -10.8 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the green, 19.4 yd, wind 28 mph (dir 1): putter 0.933, aimed -0.25 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 26 mph (dir 6): driver 1.00, launched 28.0 deg right of the pin line; planned: fairway, 230.5 yd from the pin. Result: fairway, 230.0 yd from the pin; against the port's flight +2.5 yd along, +1.3 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 230.0 yd, wind 26 mph (dir 6): spoon 0.99, launched 10.0 deg right of the pin line; planned: green, 6.3 yd from the pin. Result: fairway, 20.5 yd from the pin; against the port's flight +17.4 yd along, +3.2 across. **miss**: rested 18 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 18.3 from the fairway, 20.5 yd, wind 26 mph (dir 6): wedge 0.27, launched 10.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -0.4 yd along, -1.2 across.
- 18.4 from the green, 1.4 yd, wind 26 mph (dir 6): putter 0.200, aimed -0.125 deg of the cup. Result: HOLED.

### Attempt 12: 4-3-4 (-1), 2026-10-22 05:05 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 250.6 yd, wind 28 mph (dir 6): driver 0.66, launched 20.8 deg left of the pin line; planned: fairway, 114.8 yd from the pin. Result: fairway, 114.5 yd from the pin; against the port's flight +4.7 yd along, -1.3 across. **avoided**: lines that failed from here before, not tried: -5.6 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 24.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 114.5 yd, wind 28 mph (dir 6): 3iron 0.50, launched 4.0 deg left of the pin line; planned: fairway, 14.5 yd from the pin. Result: fairway, 15.7 yd from the pin; against the port's flight -4.8 yd along, +0.3 across.
- 16.3 from the fairway, 15.7 yd, wind 28 mph (dir 6): wedge 0.23, launched 6.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 3.4 yd from the pin; against the port's flight +0.7 yd along, +3.1 across.
- 16.4 from the green, 3.4 yd, wind 28 mph (dir 6): putter 0.363, aimed +1.825 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 26 mph (dir 5): spoon 0.94, launched 13.0 deg right of the pin line; planned: green, 19.5 yd from the pin. Result: sand, 21.2 yd from the pin; against the port's flight +10.5 yd along, -5.3 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the sand, 21.2 yd, wind 26 mph (dir 5): wedge 0.23, launched 10.0 deg left of the pin line; planned: green, 0.4 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight +1.2 yd along, +1.4 across.
- 17.3 from the green, 1.4 yd, wind 26 mph (dir 5): putter 0.209, aimed +0 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 20 mph (dir 2): driver 0.84, launched 16.0 deg right of the pin line; planned: fairway, 236.7 yd from the pin. Result: fairway, 232.7 yd from the pin; against the port's flight +8.6 yd along, +4.3 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 232.7 yd, wind 20 mph (dir 2): driver 0.89, launched 6.0 deg left of the pin line; planned: green, 2.2 yd from the pin. Result: fairway, 15.2 yd from the pin; against the port's flight +12.2 yd along, +5.8 across.
- 18.3 from the fairway, 15.2 yd, wind 20 mph (dir 2): wedge 0.19, launched 8.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 1.2 yd from the pin; against the port's flight -1.1 yd along, +0.1 across.
- 18.4 from the green, 1.2 yd, wind 20 mph (dir 2): putter 0.193, aimed +0 deg of the cup. Result: HOLED.

### Attempt 11: 4-2-4 (-2), 2026-10-22 05:01 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 26 mph (dir 3): spoon 0.90, launched 28.8 deg left of the pin line; planned: fairway, 97.5 yd from the pin. Result: fairway, 101.3 yd from the pin; against the port's flight -5.9 yd along, -5.5 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 101.3 yd, wind 26 mph (dir 3): 3iron 0.39, launched 6.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: fairway, 11.3 yd from the pin; against the port's flight +10.0 yd along, -0.1 across.
- 16.3 from the fairway, 11.3 yd, wind 26 mph (dir 3): wedge 0.10, launched 8.0 deg left of the pin line; planned: green, 0.6 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight -0.5 yd along, -1.0 across.
- 16.4 from the green, 1.6 yd, wind 26 mph (dir 3): putter 0.210, aimed +0.875 deg of the cup. Result: HOLED.

Hole 17 (par 3): 2 by the game's count.
- 17.1 from the tee, 216.1 yd, wind 30 mph (dir 5): 3iron 1.00, launched 13.0 deg right of the pin line; planned: green, 13.7 yd from the pin. Result: green, 12.2 yd from the pin; against the port's flight +1.2 yd along, -1.4 across. **avoided**: lines that failed from here before, not tried: 2.1 deg (rested 18 yd from the port's rest, round18 h17 k1); -2.6 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -5.1 deg (hazard 1, classic-c/attempt-1 h17 k1); 9.4 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the green, 12.2 yd, wind 30 mph (dir 5): putter 0.728, aimed +2.95 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 24 mph (dir 2): driver 0.88, launched 16.0 deg right of the pin line; planned: fairway, 233 yd from the pin. Result: fairway, 229.8 yd from the pin; against the port's flight +7.8 yd along, +3.7 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 229.8 yd, wind 24 mph (dir 2): driver 0.89, launched 6.0 deg left of the pin line; planned: green, 4.4 yd from the pin. Result: fairway, 17.0 yd from the pin; against the port's flight +10.9 yd along, +6.5 across.
- 18.3 from the fairway, 17.0 yd, wind 24 mph (dir 2): wedge 0.22, launched 10.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight -1.1 yd along, +0.5 across.
- 18.4 from the green, 1.3 yd, wind 24 mph (dir 2): putter 0.195, aimed +0 deg of the cup. Result: HOLED.

### Attempt 10: 3-3-4 (-2), 2026-10-22 04:57 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 250.6 yd, wind 28 mph (dir 1): driver 1.00, launched 26.8 deg left of the pin line; planned: rough, 84.9 yd from the pin. Result: rough, 90.0 yd from the pin; against the port's flight -3.4 yd along, -5.9 across. **avoided**: lines that failed from here before, not tried: -5.6 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 24.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the rough, 90.0 yd, wind 28 mph (dir 1): 9iron 0.70, launched 8.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 3.4 yd from the pin; against the port's flight +3.0 yd along, +2.1 across.
- 16.3 from the green, 3.4 yd, wind 28 mph (dir 1): putter 0.312, aimed +2.775 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 216.1 yd, wind 24 mph (dir 6): spoon 1.00, launched 13.0 deg right of the pin line; planned: fairway, 20.5 yd from the pin. Result: fairway, 16.7 yd from the pin; against the port's flight +5.9 yd along, -4.6 across. **avoided**: lines that failed from here before, not tried: 2.1 deg (rested 18 yd from the port's rest, round18 h17 k1); -2.6 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -5.1 deg (hazard 1, classic-c/attempt-1 h17 k1); 9.4 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 16.7 yd, wind 24 mph (dir 6): wedge 0.15, launched 3.0 deg right of the pin line; planned: green, 0.7 yd from the pin. Result: green, 2.2 yd from the pin; against the port's flight -0.5 yd along, +1.5 across.
- 17.3 from the green, 2.2 yd, wind 24 mph (dir 6): putter 0.261, aimed -1.5 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 30 mph (dir 7): driver 0.96, launched 22.0 deg right of the pin line; planned: fairway, 241.1 yd from the pin. Result: fairway, 241.8 yd from the pin; against the port's flight +0.8 yd along, +1.9 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 241.8 yd, wind 30 mph (dir 7): driver 1.00, launched 6.0 deg right of the pin line; planned: fairway, 10.8 yd from the pin. Result: fairway, 14.6 yd from the pin; against the port's flight +1.9 yd along, -3.4 across.
- 18.3 from the fairway, 14.6 yd, wind 30 mph (dir 7): wedge 0.21, launched 10.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.7 yd along, +0.2 across.
- 18.4 from the green, 0.5 yd, wind 30 mph (dir 7): putter 0.153, aimed -0.075 deg of the cup. Result: HOLED.

### Attempt 9: 3-3-4 (-2), 2026-10-22 04:53 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 250.6 yd, wind 24 mph (dir 1): spoon 1.00, launched 26.8 deg left of the pin line; planned: rough, 87 yd from the pin. Result: rough, 93.0 yd from the pin; against the port's flight -5.3 yd along, -5.6 across. **avoided**: lines that failed from here before, not tried: -5.6 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 24.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the rough, 93.0 yd, wind 24 mph (dir 1): 3iron 0.34, launched 4.0 deg left of the pin line; planned: green, 1.2 yd from the pin. Result: green, 4.3 yd from the pin; against the port's flight +2.2 yd along, +2.1 across.
- 16.3 from the green, 4.3 yd, wind 24 mph (dir 1): putter 0.338, aimed +2.475 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 215.5 yd, wind 26 mph (dir 2): spoon 0.89, launched 2.0 deg left of the pin line; planned: fairway, 30.3 yd from the pin. Result: fairway, 28.5 yd from the pin; against the port's flight +0.8 yd along, -1.6 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 6.5 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -8.0 deg (hazard 1, classic-c/attempt-1 h17 k1); -10.8 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 28.5 yd, wind 26 mph (dir 2): wedge 0.34, launched 6.0 deg left of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.9 yd from the pin; against the port's flight +0.1 yd along, -0.7 across.
- 17.3 from the green, 0.9 yd, wind 26 mph (dir 2): putter 0.175, aimed -0.025 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 30 mph (dir 3): spoon 0.94, launched 19.0 deg right of the pin line; planned: fairway, 223.1 yd from the pin. Result: fairway, 222.4 yd from the pin; against the port's flight +2.8 yd along, +1.7 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 222.4 yd, wind 30 mph (dir 3): spoon 0.89, launched 8.0 deg left of the pin line; planned: green, 6.9 yd from the pin. Result: fairway, 22.1 yd from the pin; against the port's flight +13.3 yd along, +8.0 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 18.3 from the fairway, 22.1 yd, wind 30 mph (dir 3): wedge 0.32, launched 8.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 1.0 yd from the pin; against the port's flight -1.8 yd along, -0.1 across.
- 18.4 from the green, 1.0 yd, wind 30 mph (dir 3): putter 0.178, aimed -0.1 deg of the cup. Result: HOLED.

### Attempt 8: 3-3-3 (-3), 2026-10-22 04:49 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 26 mph (dir 7): spoon 0.94, launched 19.5 deg left of the pin line; planned: fairway, 106.9 yd from the pin. Result: fairway, 108.0 yd from the pin; against the port's flight +0.1 yd along, -1.3 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 108.0 yd, wind 26 mph (dir 7): 7iron 0.87, launched 6.0 deg left of the pin line; planned: green, 1 yd from the pin. Result: green, 6.0 yd from the pin; against the port's flight +2.6 yd along, +4.3 across.
- 16.3 from the green, 6.0 yd, wind 26 mph (dir 7): putter 0.404, aimed +0.7 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 22 mph (dir 1): driver 0.92, launched 4.0 deg left of the pin line; planned: green, 11.8 yd from the pin. Result: fairway, 15.7 yd from the pin; against the port's flight +8.1 yd along, -4.2 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); 8.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the fairway, 15.7 yd, wind 22 mph (dir 1): wedge 0.17, launched 8.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.4 yd from the pin; against the port's flight -0.2 yd along, +0.3 across.
- 17.3 from the green, 0.4 yd, wind 22 mph (dir 1): putter 0.154, aimed +0.15 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 28 mph (dir 0): driver 1.00, launched 16.0 deg right of the pin line; planned: fairway, 240.7 yd from the pin. Result: fairway, 238.3 yd from the pin; against the port's flight +5.7 yd along, +3.3 across. **avoided**: lines that failed from here before, not tried: 6.0 deg (rested 16 yd from the port's rest, classic-c/attempt-7 h18 k1).
- 18.2 from the fairway, 238.3 yd, wind 28 mph (dir 0): driver 1.00, launched 2.0 deg right of the pin line; planned: green, 1.6 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight +0.6 yd along, -0.1 across.
- 18.3 from the green, 1.1 yd, wind 28 mph (dir 0): putter 0.186, aimed -0.05 deg of the cup. Result: HOLED.

### Attempt 7: 3-2-4 (-3), 2026-10-22 04:45 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 28 mph (dir 5): driver 0.64, launched 19.5 deg left of the pin line; planned: rough, 100.7 yd from the pin. Result: fairway, 103.7 yd from the pin; against the port's flight +2.6 yd along, -4.0 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 103.7 yd, wind 28 mph (dir 5): 3iron 0.42, launched 1.0 deg right of the pin line; planned: green, 10.4 yd from the pin. Result: green, 8.8 yd from the pin; against the port's flight +1.6 yd along, +0.8 across.
- 16.3 from the green, 8.8 yd, wind 28 mph (dir 5): putter 0.492, aimed +0 deg of the cup. Result: HOLED.

Hole 17 (par 3): 2 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 26 mph (dir 2): driver 0.96, launched 8.0 deg left of the pin line; planned: green, 11.9 yd from the pin. Result: sand, 27.6 yd from the pin; against the port's flight +15.2 yd along, +4.3 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1); -9.4 deg (rested 17 yd from the port's rest, classic-c/attempt-6 h17 k1).
- 17.2 from the sand, 27.6 yd, wind 26 mph (dir 2): wedge 0.35, launched 10.0 deg right of the pin line; planned: green, 0.5 yd from the pin. Result: HOLED. **holed**: holed from 28 yd off the green.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 22 mph (dir 3): driver 0.98, launched 6.0 deg left of the pin line; planned: fairway, 171.6 yd from the pin. Result: fairway, 156.2 yd from the pin; against the port's flight +15.5 yd along, +1.2 across. **miss**: rested 16 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 18.2 from the fairway, 156.2 yd, wind 22 mph (dir 3): 5iron 0.80, launched 6.0 deg left of the pin line; planned: green, 0.8 yd from the pin. Result: fairway, 19.1 yd from the pin; against the port's flight +18.8 yd along, +4.8 across. **miss**: rested 19 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 18.3 from the fairway, 19.1 yd, wind 22 mph (dir 3): wedge 0.28, launched 4.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.3 yd along, -0.3 across.
- 18.4 from the green, 0.5 yd, wind 22 mph (dir 3): putter 0.149, aimed -0.775 deg of the cup. Result: HOLED.

### Attempt 6: 3-3-3 (-3), 2026-10-22 04:41 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 20 mph (dir 1): driver 1.00, launched 28.8 deg left of the pin line; planned: fairway, 101.5 yd from the pin. Result: fairway, 104.3 yd from the pin; against the port's flight +0.8 yd along, -2.6 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 104.3 yd, wind 20 mph (dir 1): spoon 0.34, launched 1.0 deg left of the pin line; planned: green, 0.9 yd from the pin. Result: green, 1.1 yd from the pin; against the port's flight +0.6 yd along, +0.1 across.
- 16.3 from the green, 1.1 yd, wind 20 mph (dir 1): putter 0.187, aimed +0.65 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 216.1 yd, wind 24 mph (dir 5): spoon 0.91, launched 8.0 deg right of the pin line; planned: green, 2.5 yd from the pin. Result: fairway, 17.4 yd from the pin; against the port's flight +16.2 yd along, -3.6 across. **miss**: rested 17 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: 2.1 deg (rested 18 yd from the port's rest, round18 h17 k1); -2.6 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -5.1 deg (hazard 1, classic-c/attempt-1 h17 k1).
- 17.2 from the fairway, 17.4 yd, wind 24 mph (dir 5): wedge 0.26, launched 8.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight +0.2 yd along, +2.0 across.
- 17.3 from the green, 2.0 yd, wind 24 mph (dir 5): putter 0.256, aimed +0.75 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 26 mph (dir 4): driver 1.00, launched 2.0 deg right of the pin line; planned: fairway, 138.8 yd from the pin. Result: fairway, 135.5 yd from the pin; against the port's flight +3.2 yd along, +0.8 across.
- 18.2 from the fairway, 135.5 yd, wind 26 mph (dir 4): 9iron 0.97, launched 3.0 deg right of the pin line; planned: green, 1.7 yd from the pin. Result: green, 3.1 yd from the pin; against the port's flight -1.6 yd along, -0.2 across.
- 18.3 from the green, 3.1 yd, wind 26 mph (dir 4): putter 0.309, aimed +0.25 deg of the cup. Result: HOLED.

### Attempt 5: 3-3-4 (-2), 2026-10-22 04:37 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 28 mph (dir 6): driver 0.62, launched 22.8 deg left of the pin line; planned: fairway, 122.1 yd from the pin. Result: fairway, 121.9 yd from the pin; against the port's flight +3.5 yd along, -1.2 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 121.9 yd, wind 28 mph (dir 6): 3iron 0.58, launched 1.0 deg right of the pin line; planned: green, 5.1 yd from the pin. Result: green, 3.7 yd from the pin; against the port's flight -1.4 yd along, +1.1 across.
- 16.3 from the green, 3.7 yd, wind 28 mph (dir 6): putter 0.343, aimed -1.875 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 215.5 yd, wind 24 mph (dir 4): 3iron 1.00, launched 3.0 deg left of the pin line; planned: rough, 21.4 yd from the pin. Result: fairway, 18.3 yd from the pin; against the port's flight -5.8 yd along, +0.0 across. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -8.0 deg (hazard 1, classic-c/attempt-1 h17 k1).
- 17.2 from the fairway, 18.3 yd, wind 24 mph (dir 4): wedge 0.20, launched 8.0 deg right of the pin line; planned: green, 0.2 yd from the pin. Result: green, 0.8 yd from the pin; against the port's flight -0.7 yd along, +0.2 across.
- 17.3 from the green, 0.8 yd, wind 24 mph (dir 4): putter 0.167, aimed -0.175 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 20 mph (dir 5): driver 1.00, launched 1.0 deg right of the pin line; planned: fairway, 162.4 yd from the pin. Result: rough, 163.8 yd from the pin; against the port's flight -1.0 yd along, -2.3 across.
- 18.2 from the rough, 163.8 yd, wind 20 mph (dir 5): 3iron 0.71, launched 6.0 deg right of the pin line; planned: green, 2.2 yd from the pin. Result: fairway, 14.3 yd from the pin; against the port's flight +12.0 yd along, -5.6 across. **avoided**: lines that failed from here before, not tried: -8.8 deg (rested 18 yd from the port's rest, classic-c/attempt-3 h18 k2).
- 18.3 from the fairway, 14.3 yd, wind 20 mph (dir 5): wedge 0.23, launched 4.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -0.1 yd along, -0.5 across.
- 18.4 from the green, 0.5 yd, wind 20 mph (dir 5): putter 0.141, aimed -2.775 deg of the cup. Result: HOLED.

### Attempt 4: 3-3-4 (-2), 2026-10-22 04:33 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 26 mph (dir 1): spoon 1.00, launched 25.5 deg left of the pin line; planned: rough, 78.6 yd from the pin. Result: rough, 85.3 yd from the pin; against the port's flight -4.9 yd along, -6.4 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the rough, 85.3 yd, wind 26 mph (dir 1): 3iron 0.31, launched 4.0 deg left of the pin line; planned: green, 1.3 yd from the pin. Result: green, 3.8 yd from the pin; against the port's flight +1.9 yd along, +1.7 across.
- 16.3 from the green, 3.8 yd, wind 26 mph (dir 1): putter 0.303, aimed +0.4 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 22 mph (dir 7): driver 0.95, launched 10.0 deg right of the pin line; planned: fairway, 26.6 yd from the pin. Result: fairway, 26.2 yd from the pin; against the port's flight -1.9 yd along, -0.4 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1).
- 17.2 from the fairway, 26.2 yd, wind 22 mph (dir 7): wedge 0.25, launched 8.0 deg right of the pin line; planned: green, 0.3 yd from the pin. Result: green, 2.5 yd from the pin; against the port's flight -0.0 yd along, +2.4 across.
- 17.3 from the green, 2.5 yd, wind 22 mph (dir 7): putter 0.252, aimed -0.45 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 30 mph (dir 2): driver 0.86, launched 16.0 deg right of the pin line; planned: fairway, 237.1 yd from the pin. Result: fairway, 233.9 yd from the pin; against the port's flight +8.1 yd along, +4.0 across.
- 18.2 from the fairway, 233.9 yd, wind 30 mph (dir 2): driver 0.91, launched 8.0 deg left of the pin line; planned: green, 0.7 yd from the pin. Result: fairway, 14.5 yd from the pin; against the port's flight +12.4 yd along, +7.8 across.
- 18.3 from the fairway, 14.5 yd, wind 30 mph (dir 2): wedge 0.19, launched 10.0 deg right of the pin line; planned: green, 0.4 yd from the pin. Result: green, 0.6 yd from the pin; against the port's flight -1.0 yd along, +0.2 across.
- 18.4 from the green, 0.6 yd, wind 30 mph (dir 2): putter 0.158, aimed -0.15 deg of the cup. Result: HOLED.

### Attempt 3: 4-3-4 (-1), 2026-10-22 04:30 UTC

Hole 16 (par 4): 4 by the game's count.
- 16.1 from the tee, 251.0 yd, wind 26 mph (dir 4): 5iron 1.00, launched 28.8 deg left of the pin line; planned: fairway, 117.8 yd from the pin. Result: fairway, 117.5 yd from the pin; against the port's flight -0.1 yd along, +0.4 across. **avoided**: lines that failed from here before, not tried: -3.7 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 26.0 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 117.5 yd, wind 26 mph (dir 4): spoon 0.38, launched 4.0 deg right of the pin line; planned: green, 6.8 yd from the pin. Result: fairway, 14.2 yd from the pin; against the port's flight +6.9 yd along, +2.0 across.
- 16.3 from the fairway, 14.2 yd, wind 26 mph (dir 4): wedge 0.13, launched 8.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 0.4 yd from the pin; against the port's flight -0.3 yd along, -0.4 across.
- 16.4 from the green, 0.4 yd, wind 26 mph (dir 4): putter 0.147, aimed -0.25 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 216.1 yd, wind 24 mph (dir 7): driver 0.94, launched 8.0 deg right of the pin line; planned: fairway, 17.2 yd from the pin. Result: fairway, 18.1 yd from the pin; against the port's flight +2.5 yd along, +1.1 across. **avoided**: lines that failed from here before, not tried: 2.1 deg (rested 18 yd from the port's rest, round18 h17 k1); -2.6 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -5.1 deg (hazard 1, classic-c/attempt-1 h17 k1).
- 17.2 from the fairway, 18.1 yd, wind 24 mph (dir 7): wedge 0.18, launched 8.0 deg right of the pin line; planned: green, 0.1 yd from the pin. Result: green, 2.0 yd from the pin; against the port's flight -0.8 yd along, +1.8 across.
- 17.3 from the green, 2.0 yd, wind 24 mph (dir 7): putter 0.247, aimed -1.325 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 22 mph (dir 5): driver 1.00, launched 1.0 deg right of the pin line; planned: fairway, 161.3 yd from the pin. Result: rough, 166.6 yd from the pin; against the port's flight -4.9 yd along, -2.8 across.
- 18.2 from the rough, 166.6 yd, wind 22 mph (dir 5): 3iron 0.72, launched 8.0 deg right of the pin line; planned: green, 2.4 yd from the pin. Result: fairway, 16.8 yd from the pin; against the port's flight +17.5 yd along, -5.7 across. **miss**: rested 18 yd from the port's flight (a tree, a bank or a bounce the port does not see); the line is not tried again from there.
- 18.3 from the fairway, 16.8 yd, wind 22 mph (dir 5): wedge 0.23, launched 8.0 deg left of the pin line; planned: green, 0.3 yd from the pin. Result: green, 1.4 yd from the pin; against the port's flight -0.6 yd along, -0.9 across.
- 18.4 from the green, 1.4 yd, wind 22 mph (dir 5): putter 0.199, aimed -0.025 deg of the cup. Result: HOLED.

### Attempt 2: 3-3-3 (-3), 2026-10-22 04:25 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 22 mph (dir 1): driver 1.00, launched 25.5 deg left of the pin line; planned: fairway, 84.6 yd from the pin. Result: fairway, 87.6 yd from the pin; against the port's flight +0.8 yd along, -2.7 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 87.6 yd, wind 22 mph (dir 1): spoon 0.28, launched 0.0 deg right of the pin line; planned: green, 1.9 yd from the pin. Result: green, 2.1 yd from the pin; against the port's flight -0.0 yd along, +0.2 across.
- 16.3 from the green, 2.1 yd, wind 22 mph (dir 1): putter 0.238, aimed +0.1 deg of the cup. Result: HOLED.

Hole 17 (par 3): 3 by the game's count.
- 17.1 from the tee, 220.9 yd, wind 28 mph (dir 0): driver 1.00, launched 4.0 deg left of the pin line; planned: green, 9.9 yd from the pin. Result: fairway, 11.5 yd from the pin; against the port's flight +2.6 yd along, -0.9 across. **avoided**: lines that failed from here before, not tried: 0.7 deg (rested 18 yd from the port's rest, round18 h17 k1); -4.0 deg (rested 36 yd from the port's rest, round-r11 h17 k1); -6.5 deg (hazard 1, classic-c/attempt-1 h17 k1).
- 17.2 from the fairway, 11.5 yd, wind 28 mph (dir 0): wedge 0.12, launched 8.0 deg left of the pin line; planned: green, 0.1 yd from the pin. Result: green, 0.3 yd from the pin; against the port's flight +0.0 yd along, +0.2 across.
- 17.3 from the green, 0.3 yd, wind 28 mph (dir 0): putter 0.132, aimed -5.725 deg of the cup. Result: HOLED.

Hole 18 (par 5): 3 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 24 mph (dir 4): driver 1.00, launched 1.0 deg left of the pin line; planned: fairway, 138.6 yd from the pin. Result: fairway, 141.6 yd from the pin; against the port's flight -3.0 yd along, +0.4 across.
- 18.2 from the fairway, 141.6 yd, wind 24 mph (dir 4): 3iron 0.54, launched 2.0 deg right of the pin line; planned: green, 0.9 yd from the pin. Result: green, 0.5 yd from the pin; against the port's flight -1.4 yd along, -0.6 across.
- 18.3 from the green, 0.5 yd, wind 24 mph (dir 4): putter 0.156, aimed -0.175 deg of the cup. Result: HOLED.

### Attempt 1: 3-4-4 (-1), 2026-10-22 04:21 UTC

Hole 16 (par 4): 3 by the game's count.
- 16.1 from the tee, 246.7 yd, wind 28 mph (dir 3): spoon 0.90, launched 25.5 deg left of the pin line; planned: fairway, 81.5 yd from the pin. Result: fairway, 85.7 yd from the pin; against the port's flight -8.0 yd along, -6.9 across. **avoided**: lines that failed from here before, not tried: -7.0 deg (rested 25 yd from the port's rest, round-r4 h16 k1); 22.7 deg (rested 58 yd from the port's rest, round-r10 h16 k1).
- 16.2 from the fairway, 85.7 yd, wind 28 mph (dir 3): 3iron 0.31, launched 4.0 deg right of the pin line; planned: green, 0.6 yd from the pin. Result: green, 1.6 yd from the pin; against the port's flight +1.9 yd along, +0.9 across.
- 16.3 from the green, 1.6 yd, wind 28 mph (dir 3): putter 0.208, aimed +0.075 deg of the cup. Result: HOLED.

Hole 17 (par 3): 4 by the game's count (1 penalty).
- 17.1 from the tee, 215.5 yd, wind 26 mph (dir 5): spoon 0.88, launched 8.0 deg right of the pin line; planned: green, 1.2 yd from the pin. Result: a penalty drop, 96.0 yd from the pin; against the port's flight -68.8 yd along, +21.7 across. **hazard**: into water (a penalty stroke); the line is not tried again from there. **avoided**: lines that failed from here before, not tried: -0.8 deg (rested 18 yd from the port's rest, round18 h17 k1); -5.5 deg (rested 36 yd from the port's rest, round-r11 h17 k1).
- 17.2 from the rough, 96.0 yd, wind 26 mph (dir 5): 7iron 0.62, launched 8.0 deg right of the pin line; planned: green, 1.3 yd from the pin. Result: green, 2.6 yd from the pin; against the port's flight -1.2 yd along, -2.4 across.
- 17.3 from the green, 2.6 yd, wind 26 mph (dir 5): putter 0.254, aimed -0.25 deg of the cup. Result: HOLED.

Hole 18 (par 5): 4 by the game's count.
- 18.1 from the tee, 455.2 yd, wind 22 mph (dir 6): driver 1.00, launched 28.0 deg right of the pin line; planned: fairway, 231.8 yd from the pin. Result: fairway, 231.6 yd from the pin; against the port's flight +1.5 yd along, +0.9 across.
- 18.2 from the fairway, 231.6 yd, wind 22 mph (dir 6): spoon 0.99, launched 8.0 deg right of the pin line; planned: fringe, 11.4 yd from the pin. Result: fairway, 20.6 yd from the pin; against the port's flight +8.5 yd along, -4.4 across.
- 18.3 from the fairway, 20.6 yd, wind 22 mph (dir 6): wedge 0.28, launched 8.0 deg left of the pin line; planned: green, 0.5 yd from the pin. Result: green, 1.3 yd from the pin; against the port's flight -0.3 yd along, -1.3 across.
- 18.4 from the green, 1.3 yd, wind 22 mph (dir 6): putter 0.193, aimed -0.05 deg of the cup. Result: HOLED.

