// The harness's own copy of Dolphin, two debugger costs taken out (lib/dolphin.mjs
// uses it when it exists). Both are in the stock 2609a build's GDB stub
// (Source/Core/Core/PowerPC/GDBStub.cpp), and neither changes what the
// emulated game does:
// - the socket poll: scheduled every 100,000 emulated cycles
//   (GDB_UPDATE_CYCLES), each with a 20 us select() that costs about half a
//   millisecond on Windows, so an attached game ran at a quarter of real
//   time. The two "mov edx, 100000" before its two ScheduleEvent calls
//   (GDBStub::Init's and the update callback's) become 5,000,000: an async
//   halt is then seen within 6.9 ms of emulated time.
// - the 'M' packet (write memory) resets the instruction cache
//   (ppc_state.iCache.Reset(jit_interface)), which throws away every JIT
//   block: the frame after any memory write recompiled the game's code, 290-435
//   ms instead of 25-30. The harness writes data only, never code, and a data
//   write leaves the real Broadway's instruction cache alone too, so the call
//   becomes a 5-byte nop.
// The stock install is only read; the copy goes to state/<--out>.
//   node tools/harness/make-fast-dolphin.mjs [--from <Dolphin-x64 dir>] [--out dolphin-fast-v2] [--cycles 5000000]
import fs from "node:fs";
import path from "node:path";
import { STATE, STOCK_DOLPHIN } from "./lib/dolphin.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const from = arg("--from", path.dirname(STOCK_DOLPHIN));
const cycles = Number(arg("--cycles", 5000000));
const to = path.join(STATE, arg("--out", "dolphin-fast-v2"));
const le32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b.toString("hex"); };
// file offsets in the 2609a Dolphin.exe (rva - 0xc00) with the bytes they
// must hold; anything else there means another build, which is refused
const PATCHES = [
  { at: 0x3bfc6b, was: "baa0860100", now: `ba${le32(cycles)}`, what: "GDBStub::Init: ScheduleEvent(100000)" },
  { at: 0x3c2524, was: "baa0860100", now: `ba${le32(cycles)}`, what: "GDB update callback: ScheduleEvent(100000)" },
  { at: 0x3c027a, was: "e8417d0200", now: "0f1f440000", what: "'M' handler: call InstructionCache::Reset" },
];

fs.cpSync(from, to, { recursive: true });
const exe = path.join(to, "Dolphin.exe");
const b = fs.readFileSync(exe);
for (const p of PATCHES) {
  const cur = b.subarray(p.at, p.at + p.was.length / 2).toString("hex");
  if (cur !== p.was) throw new Error(`Dolphin.exe at 0x${p.at.toString(16)} (${p.what}): ${cur}, expected ${p.was} (another build?)`);
  Buffer.from(p.now, "hex").copy(b, p.at);
  console.log(`0x${p.at.toString(16)} ${p.what}: ${p.was} -> ${p.now}`);
}
fs.writeFileSync(exe, b);
console.log(`wrote ${exe}`);
