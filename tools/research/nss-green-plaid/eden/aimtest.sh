#!/usr/bin/env bash
# aimtest.sh <tag> <hole> <line deg> <dist m>: frames at the auto aim, 40 deg either side and back; the minimap measured
E="C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/tools/harness/state/eden"
SP="C:/Users/Stephen/AppData/Local/Temp/claude/c--Users-Stephen-Desktop-caddie-switch-web-caddie-web/a1e4a994-46d5-4fab-a59e-c1bdcb8ac3e5/scratchpad"
T=$1; H=$2; L=$3; D=$4
cd "$E/tools"
bash "$SP/g.sh" $T-aim0 >/dev/null
L1=$(python -c "print(($L-40)%360)"); L2=$(python -c "print(($L+40)%360)")
timeout 120 python -P aimram.py fset $H $L1 --tol 0.3 | tail -c 100; sleep 1.5; bash "$SP/g.sh" $T-aimL40 >/dev/null
timeout 120 python -P aimram.py fset $H $L2 --tol 0.3 | tail -c 100; sleep 1.5; bash "$SP/g.sh" $T-aimR40 >/dev/null
timeout 120 python -P aimram.py fset $H $L --tol 0.3 | tail -c 100; sleep 1.5; bash "$SP/g.sh" $T-aimback >/dev/null
cd "$E/lab/plaid/eden"
for f in $T-aimL40 $T-aimR40; do echo "== $f"; python -P mmplaid.py $f.png --aims $T-aim0.png,$T-aimL40.png,$T-aimR40.png,$T-aimback.png --dist $D --line $L --out z-mm-$f > z-mm-$f.json; python -c "import json; d=json.load(open('z-mm-$f.json')); [print(' ', k, d[k]) for k in ['cup_px','cup_r_px','ball_px','ball_cup_px','px_per_m','line_on_panel_deg','period_m','period_px','r2','cup_phase','ball_uv_m','ball_phase']]"; done
