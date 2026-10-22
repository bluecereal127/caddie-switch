// The savestate campaign's six workers (solve-course.mjs), one per 3-hole
// course on instances 15-20, their Dolphins tiled two across and three down
// on the portrait monitor (the user, 2026-10-22: "you can also move those 6
// windows to my portrait mode monitor"; DISPLAY2, 1440 x 2560 at 2560,-929:
// 720 x 436 a window, the largest 16:9 picture two columns allow). Writes
// each instance's spot into state/windows.json (lib/dolphin.mjs windowFor),
// then starts each worker detached (Start-Process), so the workers outlive
// this launcher and any task that ran it; their pids go to
// state/solve/campaign-pids.json.
//   node tools/harness/solve-campaign.mjs [--courses resort-a,classic-b] [--left 2560 --top -929 --w 720 --h 436]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const SLOTS = [
  { slug: "resort-a", instance: 15, col: 0, row: 0 }, { slug: "resort-b", instance: 16, col: 1, row: 0 },
  { slug: "resort-c", instance: 17, col: 0, row: 1 }, { slug: "classic-a", instance: 18, col: 1, row: 1 },
  { slug: "classic-b", instance: 19, col: 0, row: 2 }, { slug: "classic-c", instance: 20, col: 1, row: 2 },
];
const left = Number(arg("--left", 2560)), top = Number(arg("--top", -929)), W = Number(arg("--w", 720)), H = Number(arg("--h", 436));
const only = arg("--courses", null)?.split(",");
const slots = SLOTS.filter((s) => !only || only.includes(s.slug));
const WINF = path.join(HERE, "state", "windows.json");
let wins = {};
try { wins = JSON.parse(fs.readFileSync(WINF, "utf8")); } catch { /* new */ }
for (const s of SLOTS) wins[s.instance] = { x: left + s.col * W, y: top + s.row * H, w: W, h: H };
fs.writeFileSync(WINF, JSON.stringify(wins, null, 1));
fs.mkdirSync(path.join(HERE, "state", "solve"), { recursive: true });
const PIDF = path.join(HERE, "state", "solve", "campaign-pids.json");
let pids = {};
try { pids = JSON.parse(fs.readFileSync(PIDF, "utf8")); } catch { /* new */ }
for (const s of slots) {
  const w = wins[s.instance];
  const out = path.join(HERE, "state", "solve", `campaign-${s.slug}.out`);
  const args = ["tools/harness/solve-course.mjs", "--course", s.slug, "--instance", String(s.instance), "--x", String(w.x), "--y", String(w.y), "--w", String(w.w), "--h", String(w.h)];
  // the pid through a file, PowerShell's stdio ignored: a pipe read here would
  // stay open while the detached worker holds the inherited handle
  const pidFile = path.join(HERE, "state", "solve", `campaign-${s.slug}.pid`);
  const ps = `$p = Start-Process -FilePath '${process.execPath}' -ArgumentList '${args.join(" ")}' -WorkingDirectory '${ROOT}' -WindowStyle Hidden -RedirectStandardOutput '${out}' -RedirectStandardError '${out}.err' -PassThru; Set-Content -Path '${pidFile}' -Value $p.Id`;
  spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore", windowsHide: true });
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  pids[s.slug] = { pid, instance: s.instance, window: w, started: new Date().toISOString() };
  console.log(`${s.slug}: instance ${s.instance}, window ${w.x},${w.y} ${w.w}x${w.h}, worker pid ${pid}`);
}
fs.writeFileSync(PIDF, JSON.stringify(pids, null, 1));
