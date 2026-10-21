// The harness's interactive driver: one long-lived process that owns Dolphin,
// the DSU server and the GDB connection, and takes commands over a local HTTP
// port, so a person (or a script) can walk WSR's menus one screenshot at a
// time and keep the emulator between commands. Used once, to reach the first
// tee from a clean boot and save the states the batch runs start from; the
// batch tools (tools/harness/lib/session.mjs) drive the same pieces without it.
//
//   node tools/harness/driver.mjs [--port 8765] [--state <savestate>]
//   node tools/harness/drive.mjs <op> [args...]      (the client)
//
// ops: press <btn> [ms] | hold <btn...> | release <btn...> | point <x> <y>
//      (pointer, -1..1, y up) | motion <ax> <ay> <az> <gp> <gy> <gr> |
//      shot (screenshot; prints its path) | hotkey <name> | wait <ms> |
//      save <slot> | load <slot> | peek <addr> <len> | poke <addr> <hex> |
//      regs | speed <0|1> | quit
// Wii Remote buttons: A B 1 2 - + Home Up Down Left Right.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { DsuServer, sleep } from "./lib/dsu.mjs";
import { Gdb, REG } from "./lib/gdb.mjs";
import { writeUserDir, launch, kill, screenshotDir, HOTKEY_MAP, WIIMOTE_MAP, portsFor } from "./lib/dolphin.mjs";
import * as wsr from "./lib/wsr.mjs";

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg("--port", 8765));
const STATE0 = arg("--state", null);
const SPEED = Number(arg("--speed", 1));

const dsu = await new DsuServer({ port: portsFor().dsu }).start();
writeUserDir({ speed: SPEED });
const child = launch({ batch: true, saveState: STATE0 });
const gdb = new Gdb({ port: portsFor().gdb });
await gdb.connect({ timeoutMs: 90000 });
await gdb.go();
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
log("driver up: dolphin pid", child.pid, "port", PORT);

// stop the CPU, run fn with GDB, resume
async function paused(fn) {
  await gdb.haltSafe();
  try { return await fn(); } finally {
    // whatever fn left set, a stray breakpoint would stop the game unobserved
    try { await gdb.clearBreaks(); } catch { /* reported by fn's own error */ }
    await gdb.go();
  }
}

function wiimote(btn) {
  const k = WIIMOTE_MAP[btn];
  if (!k) throw new Error(`no Wii Remote button ${btn}`);
  return k;
}
function hotkey(name) {
  const e = Object.entries(HOTKEY_MAP).find(([k]) => k.toLowerCase().endsWith(name.toLowerCase()));
  if (!e) throw new Error(`no hotkey ${name}`);
  return e[1];
}

async function screenshot() {
  const dir = screenshotDir();
  const before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  // the hotkey is sometimes missed (no frame presented while it was down):
  // press it again, up to three times
  for (let attempt = 0; attempt < 3; attempt++) {
    await dsu.tap(1, hotkey("Take Screenshot"), 150);
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const now = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      const fresh = now.filter((f) => !before.has(f));
      if (fresh.length) { await sleep(150); return path.join(dir, fresh.sort().pop()); }
    }
  }
  throw new Error("no screenshot appeared");
}

async function run(op, a) {
  switch (op) {
    case "press": await dsu.tap(0, wiimote(a[0]), Number(a[1] || 120)); return "ok";
    case "hold": dsu.setButtons(0, a.map(wiimote), true); return "ok";
    case "release": dsu.setButtons(0, a.map(wiimote), false); return "ok";
    case "point": dsu.setStick(0, "left", Number(a[0]), Number(a[1])); return "ok";
    case "motion": dsu.setMotion(0, { accel: a.slice(0, 3).map(Number), gyro: a.slice(3, 6).map(Number) }); return "ok";
    case "shot": return await screenshot();
    case "hotkey": await dsu.tap(1, hotkey(a.join(" ")), 150); return "ok";
    case "wait": await sleep(Number(a[0])); return "ok";
    case "save": await dsu.tap(1, hotkey(`Save State Slot ${a[0]}`), 150); await sleep(1500); return "ok";
    case "load": await dsu.tap(1, hotkey(`Load State Slot ${a[0]}`), 150); await sleep(1500); return "ok";
    case "peek": return await paused(async () => (await gdb.readMem(parseInt(a[0], 16), Number(a[1] || 16))).toString("hex"));
    case "poke": return await paused(async () => { await gdb.writeMem(parseInt(a[0], 16), Buffer.from(a[1], "hex")); return "ok"; });
    case "regs": return await paused(async () => {
      const out = { pc: (await gdb.reg(REG.PC)).toString(16), lr: (await gdb.reg(REG.LR)).toString(16) };
      for (let i = 0; i < 32; i++) out[`r${i}`] = (await gdb.reg(i)).toString(16);
      return JSON.stringify(out);
    });
    // break at addr (hex) on its next execution and report the registers;
    // the breakpoint is lifted and the CPU resumes
    case "bwait": return await paused(async () => {
      const addr = parseInt(a[0], 16);
      await gdb.addBreak(addr);
      await gdb.cont(Number(a[1] || 20000));
      const out = { pc: (await gdb.reg(REG.PC)).toString(16), lr: (await gdb.reg(REG.LR)).toString(16) };
      for (let i = 3; i <= 10; i++) out[`r${i}`] = (await gdb.reg(i)).toString(16);
      for (const i of [1, 2, 3]) out[`f${i}`] = await gdb.reg(32 + i);
      return JSON.stringify(out);
    });
    // eval <js>: an async function body with gdb, dsu, wsr in scope, run with
    // the CPU stopped (a development aid; the module is re-imported each time)
    case "eval": return await paused(async () => {
      const lib = await import(`./lib/wsr.mjs?t=${Date.now()}`);
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const r = await new AsyncFunction("gdb", "dsu", "wsr", a.join(" "))(gdb, dsu, lib);
      return typeof r === "string" ? r : JSON.stringify(r, null, 1);
    });
    case "quit": setTimeout(shutdown, 100); return "bye";
    default: throw new Error(`unknown op ${op}`);
  }
}

let queue = Promise.resolve();
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    queue = queue.then(async () => {
      let out, code = 200;
      try {
        const { op, args = [] } = JSON.parse(body || "{}");
        out = String(await run(op, args));
        log(op, args.join(" "), "->", out.slice(0, 200));
      } catch (e) { code = 500; out = `error: ${e.message}`; log(out); }
      res.writeHead(code, { "content-type": "text/plain" });
      res.end(out);
    });
  });
});
server.listen(PORT, "127.0.0.1");

async function shutdown() {
  server.close();
  try { gdb.close(); } catch { /* */ }
  kill(child);
  await dsu.stop();
  process.exit(0);
}
child.on("exit", (c) => { log("dolphin exited", c); shutdown(); });
process.on("SIGINT", shutdown);
