#!/usr/bin/env bash
# One attempt at a 3-hole course, start to finish, on its own harness
# instance: a driver Dolphin booted on the "Select Course" menu
# (saves/menu-course.sav), its window placed at X,Y (WxH) above other windows
# and titled with the attempt's progress and the course's best finished
# attempt so far by round-window.ps1, the course's tile picked and the game's screens walked
# to its first tee (round-start.mjs --course), then its three holes played
# (round-ctl.mjs -> round-play.mjs), logged to state/PHASE/SLUG-N.log and
# results/PHASE/SLUG/attempt-N.json. The driver is left running at the end
# so the scorecard stays up; course-supervisor.mjs quits it and starts the
# next attempt. PHASE is the series ("courses": the game's own wind; e.g.
# "calm" with WIND 0:0: the wind the user set, round-play.mjs applyWind);
# WIND is dir:speedIdx, or - for the game's own.
#   bash tools/harness/course-launch.sh <instance> <port> <slug> <attempt> <x> <y> <w> <h> [phase] [wind]
set -u
INST=$1; PORT=$2; SLUG=$3; N=$4; X=$5; Y=$6; W=$7; HT=$8; PHASE=${9:-courses}; WIND=${10:--}
H="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$H/../.." && pwd)"
case "$SLUG" in
  resort-a) NAME="Resort A"; FIRST=1 ;; resort-b) NAME="Resort B"; FIRST=4 ;; resort-c) NAME="Resort C"; FIRST=7 ;;
  classic-a) NAME="Classic A"; FIRST=10 ;; classic-b) NAME="Classic B"; FIRST=13 ;; classic-c) NAME="Classic C"; FIRST=16 ;;
  *) echo "no course $SLUG"; exit 2 ;;
esac
LAST=$((FIRST + 2))
if [ "$PHASE" = "courses" ]; then LABEL="$NAME #$N"; else LABEL="$NAME $PHASE #$N"; fi
WINDARGS=(); if [ "$WIND" != "-" ]; then WINDARGS=(--wind "$WIND"); fi
mkdir -p "$H/state/$PHASE" "$H/results/$PHASE/$SLUG"
LOG="$H/state/$PHASE/$SLUG-$N.log"
CTL="$H/state/$PHASE/$SLUG-$N-ctl.log"
DRV="$H/state/$PHASE/$SLUG-$N-driver.log"
cd "$ROOT"
echo "[$(date -u +%H:%M:%S)] $LABEL: launching on instance $INST${WINDARGS:+, wind $WIND}" >> "$CTL"
HARNESS_INSTANCE=$INST node tools/harness/driver.mjs --port "$PORT" --state "$H/state/saves/menu-course.sav" > "$DRV" 2>&1 &
DRIVER=$!
for i in $(seq 1 60); do grep -q "driver up" "$DRV" 2>/dev/null && break; sleep 2; done
DPID=$(grep -o "dolphin pid [0-9]*" "$DRV" | grep -o "[0-9]*$")
powershell -NoProfile -Command "
Add-Type @'
using System; using System.Runtime.InteropServices;
public class RL { [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }
'@
\$p = Get-Process -Id $DPID; for (\$i = 0; \$i -lt 30 -and \$p.MainWindowHandle -eq 0; \$i++) { Start-Sleep 1; \$p.Refresh() }
\$p.PriorityClass = 'AboveNormal'
[RL]::SetWindowPos(\$p.MainWindowHandle, [IntPtr](-1), $X, $Y, $W, $HT, 0x0040) | Out-Null
"
sleep 4
node tools/harness/round-start.mjs --port "$PORT" --course "$NAME" >> "$LOG" 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "$H/round-window.ps1" -Log "$LOG" -Round "$N" -Instance "$INST" -Label "$LABEL" -Holes 3 -Best "$H/results/$PHASE/$SLUG/attempts.json" -DolphinPid "$DPID" > /dev/null 2>&1 &
node tools/harness/round-ctl.mjs --port "$PORT" --from "$FIRST" --to "$LAST" --log "state/$PHASE/$SLUG-$N.log" --out "results/$PHASE/$SLUG/attempt-$N.json" --label "$LABEL" "${WINDARGS[@]}" >> "$CTL" 2>&1
echo "attempt $N over" >> "$CTL"
wait $DRIVER
