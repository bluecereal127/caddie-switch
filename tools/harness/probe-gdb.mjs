// Probe how Dolphin's GDB stub answers a break and a breakpoint: every raw
// packet for a while after each, with timing. node tools/harness/probe-gdb.mjs
import { DsuServer, sleep } from "./lib/dsu.mjs";
import { Gdb, REG } from "./lib/gdb.mjs";
import { writeUserDir, launch, kill , portsFor } from "./lib/dolphin.mjs";

const dsu = await new DsuServer({ port: portsFor().dsu }).start();
writeUserDir({});
const child = launch({ batch: true });
const t0 = Date.now();
const gdb = new Gdb({ port: portsFor().gdb, log: (s) => console.log(String(Date.now() - t0).padStart(6), s) });
try {
  await gdb.connect();
  let pending = gdb.cont();
  await sleep(3000);
  console.log("--- interrupt");
  gdb.interrupt();
  console.log("stop:", (await pending).raw);
  await gdb.settle();
  console.log("queued after 500 ms:", gdb.packets);
  console.log("PC via p40:", (await gdb.reg(REG.PC)).toString(16), "r1:", (await gdb.reg(1)).toString(16), "r2:", (await gdb.reg(2)).toString(16), "r13:", (await gdb.reg(13)).toString(16));
  // a breakpoint on the OS idle loop the break landed in
  const pc = await gdb.reg(REG.PC);
  await gdb.addBreak(pc);
  console.log("--- cont with a breakpoint at the current PC", pc.toString(16));
  for (let i = 0; i < 3; i++) {
    const tc = Date.now();
    const st = await gdb.cont(5000).catch((e) => ({ raw: String(e) }));
    console.log(`hit ${i}: ${st.raw} after ${Date.now() - tc} ms; queued ${JSON.stringify(gdb.packets)}`);
    await gdb.settle(50);
  }
  await gdb.removeBreak(pc);
  // step once and see the PC move
  const s = await gdb.step();
  console.log("step:", s.raw);
  pending = gdb.cont();
  await sleep(1000);
  gdb.interrupt();
  console.log("final stop:", (await pending).raw);
} finally {
  gdb.close(); kill(child); await dsu.stop();
}
