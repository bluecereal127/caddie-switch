#!/usr/bin/env bash
# Puts the wind campaign's results on Caddie Switch when a hole finishes (the
# user, 2026-10-22: "update caddie switch for a completed hole whenever it is
# fully finished"; wind-campaign.mjs runs this once no job of the hole is
# queued or running): public/playbook rebuilt (tools/build-playbook.mjs) and
# checked (tools/test-playbook-routes.mjs), then the playbook and the
# campaign's results committed and pushed to main, which Netlify deploys. A
# failed build or test pushes nothing (exit 2 / 3). Only those paths are staged.
#   bash tools/harness/publish-hole.sh <hole>
set -u
HOLE=$1
H="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$H/../.." && pwd)"
cd "$ROOT"
node tools/build-playbook.mjs > /dev/null || { echo "build-playbook failed: nothing pushed"; exit 2; }
node tools/test-playbook-routes.mjs | tail -1 | grep -q "checks pass" || { echo "the playbook test failed: nothing pushed"; exit 3; }
git add public/playbook tools/harness/results/solve-wind
if git diff --cached --quiet; then echo "nothing new to push"; exit 0; fi
SUM=$(node -e '
const fs = require("fs"), path = require("path"), D = "tools/harness/results/solve-wind", h = String(process.argv[1]).padStart(2, "0");
let ok = 0, n = 0;
for (const d of fs.readdirSync(D).filter((x) => x.startsWith(`h${h}-`)))
  for (const f of fs.readdirSync(path.join(D, d)).filter((x) => /^i\d\d\.json$/.test(x)))
    for (const e of Object.values(JSON.parse(fs.readFileSync(path.join(D, d, f), "utf8")).winds ?? {})) if (e.rule === "near") { n++; if (e.solved) ok++; }
console.log(`${ok} of ${n} winds solved`);' "$HOLE")
git commit -q -m "Playbook: hole $HOLE finished in the wind campaign ($SUM)" -m "Built by tools/harness/publish-hole.sh when the hole's last job ended; tools/test-playbook-routes.mjs passed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { echo "commit failed"; exit 4; }
git push -q origin main || { echo "push failed"; exit 5; }
echo "hole $HOLE pushed: $SUM"
