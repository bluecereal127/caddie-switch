// Harness smoke test: boot WSR in Dolphin with the generated user dir, attach
// the GDB stub, read the disc header from RAM, run a few seconds, break, take
// a screenshot through the DSU hotkey device, and stop.
//   node tools/harness/smoke.mjs [seconds]

import fs from "node:fs";
import { DsuServer, sleep } from "./lib/dsu.mjs";
import { Gdb, REG } from "./lib/gdb.mjs";
import { writeUserDir, launch, kill, screenshotDir, HOTKEY_MAP , portsFor } from "./lib/dolphin.mjs";

const secs = Number(process.argv[2] || 8);
const dsu = await new DsuServer({ port: portsFor().dsu }).start();
writeUserDir({});
const child = launch({ batch: true });
const gdb = new Gdb({ port: portsFor().gdb });
try {
  await gdb.connect({ timeoutMs: 60000 });
  console.log("gdb connected; status", await gdb.status());
  const hdr = await gdb.readMem(0x80000000, 8);
  console.log("RAM 0x80000000:", JSON.stringify(hdr.toString("latin1")));
  console.log("PC", (await gdb.reg(REG.PC)).toString(16));
  const t0 = Date.now();
  const pending = gdb.cont();
  await sleep(secs * 1000);
  console.log("dsu stats", dsu.stats, "clients", dsu.clients.size);
  const shotKey = Object.entries(HOTKEY_MAP).find(([k]) => k.endsWith("Take Screenshot"))[1];
  await dsu.tap(1, shotKey, 150);
  await sleep(1500);
  gdb.interrupt();
  const stop = await pending;
  console.log(`stopped after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, stop);
  const dir = screenshotDir();
  console.log("screenshots:", fs.existsSync(dir) ? fs.readdirSync(dir) : "none");
} finally {
  gdb.close();
  kill(child);
  await dsu.stop();
}
