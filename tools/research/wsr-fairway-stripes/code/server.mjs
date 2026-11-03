// Fairway experiment server: one Dolphin (instance 1), DSU + GDB, commands over HTTP (after the green-plaid session's server).
//   node server.mjs --save <tee.sav> [--port 8791] [--ires 3]
// POST {op:"eval", code:"..."}: an async function body with ctx in scope (s, gdb, H = helpers, lib modules).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const HARN = fileURLToPath(new URL("../../../harness/lib/", import.meta.url)) + "/";
const imp = (f) => import(pathToFileURL(path.join(HARN, f)).href);
const { DsuServer, sleep } = await imp("dsu.mjs");
const { Gdb, REG } = await imp("gdb.mjs");
const D = await imp("dolphin.mjs");
const { Session } = await imp("session.mjs");
const W = await imp("wsr.mjs");
const PLAY = await imp("play.mjs");
const SHOT = await imp("shot.mjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "shots");
fs.mkdirSync(OUT, { recursive: true });
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg("--port", 8791));
const SAVE = arg("--save");
const IRES = Number(arg("--ires", 3));
const INST = 1;
const LOGF = path.join(HERE, "server.log");
const log = (...a) => { const m = `${new Date().toISOString().slice(11, 23)} ${a.join(" ")}`; console.log(m); fs.appendFileSync(LOGF, m + "\n"); };

const s = new Session({ instance: INST, log });
s.dsu = await new DsuServer({ port: s.dsuPort }).start();
D.writeUserDir({ instance: INST, gdbPort: s.gdbPort, dsuPort: s.dsuPort, speed: 1.0 });
const gfx = path.join(D.userDir(INST), "Config", "GFX.ini");
// SafeTextureCacheColorSamples 0: hash every texel, so a texture edited in RAM is re-read
fs.writeFileSync(gfx, `[Settings]\nInternalResolution = ${IRES}\nShowFPS = False\nAspectRatio = 0\nShaderCompilationMode = 0\nWaitForShadersBeforeStarting = False\nInternalResolutionFrameDumps = True\nSafeTextureCacheColorSamples = 0\n[Hardware]\nVSync = False\n`);
s.child = D.launch({ instance: INST, batch: true, saveState: SAVE });
const spot = D.windowSpot(INST);
if (spot) D.placeWindow(s.child.pid, spot);
s.gdb = new Gdb({ port: s.gdbPort });
await s.gdb.connect({ timeoutMs: 120000 });
await s.gdb.go();
s.saveFile = SAVE;
await s.waitLoaded(null, 90000);
const gdb = s.gdb;
log("up: pid", s.child.pid, "save", SAVE, "start0", JSON.stringify(s.start0));

const H = {};
const hex = (v) => "0x" + (v >>> 0).toString(16);
H.hex = hex;
// run fn with the CPU stopped
H.paused = async (fn) => { await gdb.haltSafe(); try { return await fn(gdb); } finally { await gdb.go(); } };
H.read = (a, n) => H.paused(() => gdb.readMem(a, n));
H.write = (a, buf) => H.paused(() => gdb.writeMem(a, buf));
// search [lo, hi) for a byte pattern (Buffer); CPU halted for the whole scan
H.find = (pat, lo = 0x90000000, hi = 0x94000000, chunk = 0x40000) => H.paused(async () => {
  const hits = [];
  for (let a = lo; a < hi; a += chunk) {
    const n = Math.min(chunk + pat.length - 1, hi - a);
    let b;
    try { b = await gdb.readMem(a, n); } catch { continue; }
    for (let i = b.indexOf(pat); i >= 0; i = b.indexOf(pat, i + 1)) if (i < chunk) hits.push(a + i);
  }
  return hits;
});
H.snap = async (name) => {
  const dir = D.screenshotDir(INST);
  const before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  for (let a = 0; a < 3; a++) {
    await s.dsu.tap(1, "L1", 150);
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const fresh = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => !before.has(f));
      if (fresh.length) {
        await sleep(500);
        const out = path.join(OUT, `${name}.png`);
        fs.copyFileSync(path.join(dir, fresh.sort().pop()), out);
        return out;
      }
    }
  }
  throw new Error("no screenshot");
};
H.press = async (btn, ms = 150) => s.dsu.tap(0, D.WIIMOTE_MAP[btn], ms);
H.hold = (btns, on) => s.dsu.setButtons(0, btns.map((b) => D.WIIMOTE_MAP[b]), on);
H.sleep = sleep;
H.save = (name, obj) => { const f = path.join(HERE, name); fs.writeFileSync(f, JSON.stringify(obj, null, 1)); return f; };

const ctx = { s, gdb, H, W, PLAY, SHOT, D, sleep, log, fs, path, OUT, HERE, REG };
let queue = Promise.resolve();
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    queue = queue.then(async () => {
      let out, code = 200;
      try {
        const { op, code: js } = JSON.parse(body || "{}");
        if (op === "quit") { setTimeout(shutdown, 200); out = "bye"; }
        else {
          const AF = Object.getPrototypeOf(async function () {}).constructor;
          const r = await new AF("ctx", `const { s, gdb, H, W, PLAY, SHOT, D, sleep, log, fs, path, OUT, HERE, REG } = ctx;\n${js}`)(ctx);
          out = typeof r === "string" ? r : JSON.stringify(r, null, 1);
        }
      } catch (e) { code = 500; out = `error: ${e.stack || e.message}`; log(out); }
      res.writeHead(code, { "content-type": "text/plain" });
      res.end(out ?? "");
    });
  });
});
server.listen(PORT, "127.0.0.1");
log("listening", PORT);
async function shutdown() {
  server.close();
  try { await gdb.halt(); await gdb.clearBreaks(); } catch { /* */ }
  try { gdb.close(); } catch { /* */ }
  D.kill(s.child);
  await s.dsu.stop();
  process.exit(0);
}
s.child.on("exit", (c) => { log("dolphin exited", c); process.exit(1); });
process.on("SIGINT", shutdown);
