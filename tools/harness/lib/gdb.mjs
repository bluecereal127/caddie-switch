// A GDB remote-serial-protocol client for Dolphin's GDB stub
// (Source/Core/Core/PowerPC/GDBStub.cpp; enabled by Dolphin.ini [General]
// GDBPort, which makes the emulated CPU wait at boot for a connection).
// What this build's stub answers (its strings): ?, c, s, D, k, g, p / P,
// m / M, H, qSupported (swbreak+;hwbreak+), qAttached, qfThreadInfo,
// qHostInfo, Z0/Z1 (instruction breakpoints) and Z2/Z3/Z4 (memchecks), the
// 0x03 break byte, and the stop reply T<sig>40:<pc>;01:<r1>;.
//
// Register numbers (the stub's own): r0..r31 = 0..31 (32-bit), f0..f31 =
// 32..63 (64-bit, the double in PS0), 64 PC, 65 MSR, 66 CR, 67 LR, 68 CTR,
// 69 XER. Values travel big-endian, as the target stores them.

import net from "node:net";

export const REG = { PC: 64, MSR: 65, CR: 66, LR: 67, CTR: 68, XER: 69 };
export const F = (n) => 32 + n;

const hex2 = (n) => n.toString(16).padStart(2, "0");
const checksum = (s) => { let c = 0; for (let i = 0; i < s.length; i++) c = (c + s.charCodeAt(i)) & 0xff; return c; };

export class GdbError extends Error {}
export class GdbTimeout extends GdbError {}

export class Gdb {
  constructor({ host = "127.0.0.1", port = 47020, log = null } = {}) {
    this.host = host;
    this.port = port;
    this.log = log;
    this.sock = null;
    this.buf = "";
    this.packets = [];      // received packets not yet consumed
    this.waiters = [];      // resolvers waiting for a packet
    this.acks = 0;
    this.closed = false;
    this.running = false;   // true between c/s and the stop reply
    this.breakpoints = new Set();
  }

  async connect({ timeoutMs = 60000 } = {}) {
    const t0 = Date.now();
    for (;;) {
      try {
        await new Promise((resolve, reject) => {
          const s = net.createConnection({ host: this.host, port: this.port }, () => { this.sock = s; resolve(); });
          s.once("error", reject);
        });
        break;
      } catch (e) {
        if (Date.now() - t0 > timeoutMs) throw new GdbError(`gdb connect ${this.host}:${this.port}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    this.sock.setNoDelay(true);
    this.sock.setEncoding("latin1");
    this.sock.on("data", (d) => this._onData(d));
    this.sock.on("close", () => { this.closed = true; this._flushWaiters(new GdbError("gdb socket closed")); });
    this.sock.on("error", (e) => { this.lastError = e; });
    return this;
  }

  _flushWaiters(err) {
    const w = this.waiters; this.waiters = [];
    for (const x of w) x.reject(err);
  }

  _onData(d) {
    this.buf += d;
    for (;;) {
      if (!this.buf.length) return;
      const c = this.buf[0];
      if (c === "+") { this.acks++; this.buf = this.buf.slice(1); continue; }
      if (c === "-") { this.buf = this.buf.slice(1); this.nak = true; continue; }
      if (c !== "$") { this.buf = this.buf.slice(1); continue; }
      const hash = this.buf.indexOf("#");
      if (hash < 0 || this.buf.length < hash + 3) return;
      const body = this.buf.slice(1, hash);
      const sum = parseInt(this.buf.slice(hash + 1, hash + 3), 16);
      this.buf = this.buf.slice(hash + 3);
      if (checksum(body) !== sum) { this.sock.write("-"); continue; }
      this.sock.write("+");
      const unrle = body.replace(/(.)\*(.)/g, (m, ch, n) => ch.repeat(n.charCodeAt(0) - 29 + 1));
      if (this.log) this.log(`<- ${unrle.slice(0, 120)}`);
      const w = this.waiters.shift();
      if (w) w.resolve(unrle); else this.packets.push(unrle);
    }
  }

  _nextPacket(timeoutMs) {
    if (this.packets.length) return Promise.resolve(this.packets.shift());
    if (this.closed) return Promise.reject(new GdbError("gdb socket closed"));
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      let timer = null;
      if (timeoutMs != null) {
        timer = setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new GdbError(`gdb: no reply within ${timeoutMs} ms`));
        }, timeoutMs);
      }
      w.resolve = (v) => { clearTimeout(timer); resolve(v); };
      w.reject = (e) => { clearTimeout(timer); reject(e); };
      this.waiters.push(w);
    });
  }

  _write(cmd) {
    if (this.log) this.log(`-> ${cmd.slice(0, 120)}`);
    this.sock.write(`$${cmd}#${hex2(checksum(cmd))}`);
  }

  // After a 0x03 break Dolphin answers "T05...", then "" and "T05..." again
  // (measured: all three within the same millisecond; the stub reads the
  // break byte a second time as an unknown command and signals again). A
  // stop packet or an empty one where a command's answer is expected is
  // therefore stale: no answer to m, M, p, P, Z or z is empty or starts with
  // T / S + two hex digits.
  static isStop(p) { return /^[TS][0-9a-fA-F]{2}/.test(p); }
  static isStray(p) { return p === "" || Gdb.isStop(p); }

  _drainStrays() { this.packets = this.packets.filter((p) => !Gdb.isStray(p)); }

  async request(cmd, timeoutMs = 10000) {
    if (this.running) throw new GdbError(`gdb: '${cmd}' sent while the CPU runs`);
    this._write(cmd);
    const answersNonEmpty = /^[mMpPZz]/.test(cmd);
    let r;
    do { r = await this._nextPacket(timeoutMs); } while (answersNonEmpty && Gdb.isStray(r));
    if (/^E[0-9a-fA-F]{2}$/.test(r)) throw new GdbError(`gdb: ${cmd.slice(0, 40)} -> ${r}`);
    return r;
  }

  // wait out the duplicates of a break and drop them, so the next c / s
  // cannot return a stale stop. settle(0), go()'s, only yields to the event
  // loop: a 0 ms timer waits for Windows' timer tick, about 12 ms a
  // breakpoint stop (measured on a per-tick breakpoint: 30 ms a stop with it,
  // 17.7 without), and a stop at a breakpoint sends no duplicates
  async settle(ms = 30) {
    await new Promise((r) => (ms > 0 ? setTimeout(r, ms) : setImmediate(r)));
    this._drainStrays();
  }

  async readMem(addr, len) {
    const out = Buffer.alloc(len);
    for (let off = 0; off < len; off += 0x800) {
      const n = Math.min(0x800, len - off);
      const r = await this.request(`m${(addr + off >>> 0).toString(16)},${n.toString(16)}`);
      if (r.length !== n * 2) throw new GdbError(`gdb: short read at ${(addr + off).toString(16)}: ${r.slice(0, 20)}`);
      Buffer.from(r, "hex").copy(out, off);
    }
    return out;
  }

  async writeMem(addr, data) {
    for (let off = 0; off < data.length; off += 0x400) {
      const chunk = data.subarray(off, Math.min(data.length, off + 0x400));
      const r = await this.request(`M${(addr + off >>> 0).toString(16)},${chunk.length.toString(16)}:${chunk.toString("hex")}`);
      if (r !== "OK") throw new GdbError(`gdb: write at ${(addr + off).toString(16)} -> ${r}`);
    }
  }

  async u32(addr) { return (await this.readMem(addr, 4)).readUInt32BE(0); }
  async f32(addr) { return (await this.readMem(addr, 4)).readFloatBE(0); }
  async setU32(addr, v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); await this.writeMem(addr, b); }
  async setF32(addr, v) { const b = Buffer.alloc(4); b.writeFloatBE(v); await this.writeMem(addr, b); }
  async setU8(addr, v) { await this.writeMem(addr, Buffer.from([v & 0xff])); }

  async reg(n) {
    const r = await this.request(`p${n.toString(16)}`);
    if (r.length === 16) return Buffer.from(r, "hex").readDoubleBE(0);
    return parseInt(r, 16) >>> 0;
  }
  async setReg(n, v) {
    let hex;
    if (n >= 32 && n < 64) { const b = Buffer.alloc(8); b.writeDoubleBE(v); hex = b.toString("hex"); }
    else hex = (v >>> 0).toString(16).padStart(8, "0");
    const r = await this.request(`P${n.toString(16)}=${hex}`);
    if (r !== "OK") throw new GdbError(`gdb: set reg ${n} -> ${r}`);
  }

  async addBreak(addr) {
    const r = await this.request(`Z0,${(addr >>> 0).toString(16)},4`);
    if (r !== "OK") throw new GdbError(`gdb: Z0 ${addr.toString(16)} -> ${r}`);
    this.breakpoints.add(addr >>> 0);
  }
  async removeBreak(addr) {
    const r = await this.request(`z0,${(addr >>> 0).toString(16)},4`);
    if (r !== "OK") throw new GdbError(`gdb: z0 ${addr.toString(16)} -> ${r}`);
    this.breakpoints.delete(addr >>> 0);
  }
  async clearBreaks() { for (const a of [...this.breakpoints]) await this.removeBreak(a); }

  static parseStop(p) {
    const m = /^([TS])([0-9a-fA-F]{2})(.*)$/.exec(p);
    if (!m) return { raw: p };
    const regs = {};
    for (const kv of m[3].split(";").filter(Boolean)) {
      const [k, v] = kv.split(":");
      if (v !== undefined) regs[parseInt(k, 16)] = parseInt(v, 16) >>> 0;
    }
    return { raw: p, signal: parseInt(m[2], 16), pc: regs[64], regs };
  }

  // ---- run control. The CPU is either stopped (requests allowed) or
  // running (only the break byte may be sent). `go()` resumes and arms a
  // promise for the next stop reply; `waitStop()` awaits it; `halt()` makes
  // sure the CPU is stopped, sending the break byte only when it is still
  // running (a break sent to a stopped CPU makes the stub answer "" and a
  // stop reply, which would then be taken for the next stop).

  // the next stop reply while running (empty strays are skipped)
  async _stopPacket() {
    for (;;) {
      const p = await this._nextPacket(null);
      if (Gdb.isStop(p)) return Gdb.parseStop(p);
    }
  }

  // Resume from a stop. Dolphin's c from a PC that holds a breakpoint stops
  // again at once without executing the instruction (measured: the stop
  // reply arrives within 1 ms, PC unchanged), so step over it first. A plain
  // s executes the instruction under a breakpoint (measured: 0x80417364 ->
  // 0x80417368 with the breakpoint still set), and leaving the breakpoint in
  // place matters: z0 / Z0 invalidate the JIT's blocks, which made a stop at
  // a per-frame breakpoint cost 250-280 ms a frame instead of 61 ms.
  async go(pc = null) {
    if (this.running) throw new GdbError("gdb: go() while running");
    await this.settle(0);
    if (pc == null) pc = this.lastStop?.pc ?? await this.reg(REG.PC);
    if (this.breakpoints.has(pc)) await this.step();
    this._write("c");
    this.running = true;
    this.stopArrived = false;
    this.stopPromise = this._stopPacket().then((st) => { this.stopArrived = true; this.lastStop = st; return st; });
    this.stopPromise.catch(() => {});
  }

  // the stop the last go() is waiting for; on a timeout the CPU is halted
  // (so the connection stays in step) and a GdbTimeout is thrown
  async waitStop(timeoutMs = null) {
    if (!this.running) return this.lastStop;
    let timer = null;
    const timeout = timeoutMs == null ? null : new Promise((_, rej) => { timer = setTimeout(() => rej(new GdbTimeout(`gdb: no stop within ${timeoutMs} ms`)), timeoutMs); });
    try {
      const st = await (timeout ? Promise.race([this.stopPromise, timeout]) : this.stopPromise);
      this.running = false;
      return st;
    } catch (e) {
      if (e instanceof GdbTimeout) await this.halt();
      throw e;
    } finally { clearTimeout(timer); }
  }

  // stop the CPU if it runs; returns the stop
  async halt(timeoutMs = 5000) {
    if (!this.running) return this.lastStop;
    if (!this.stopArrived) this.sock.write("\x03");
    let timer;
    const st = await Promise.race([this.stopPromise, new Promise((_, rej) => { timer = setTimeout(() => rej(new GdbError("gdb: halt timed out")), timeoutMs); })]);
    clearTimeout(timer);
    this.running = false;
    await this.settle();
    return st;
  }

  // A break (0x03) can land in an exception handler running with address
  // translation off (MSR IR 0x20 / DR 0x10 clear), where the stub cannot read
  // 0x8xxxxxxx effective addresses (measured: m80cfb970,180 -> E00 on the
  // 13th poll of a run). Halt, and while translation is off, run on briefly.
  async haltSafe(tries = 50) {
    let st = await this.halt();
    for (let i = 0; i < tries; i++) {
      const msr = await this.reg(REG.MSR);
      if ((msr & 0x30) === 0x30) return st;
      await this.go();
      await new Promise((r) => setTimeout(r, 3));
      st = await this.halt();
    }
    throw new GdbError("gdb: could not stop with translation on");
  }

  // resume and wait for the next stop
  async cont(timeoutMs = null) { await this.go(); return this.waitStop(timeoutMs); }
  async resume(timeoutMs = null) { return this.cont(timeoutMs); }

  async step(timeoutMs = 10000) {
    this._drainStrays();
    this._write("s");
    this.running = true;
    try {
      let p;
      do { p = await this._nextPacket(timeoutMs); } while (!Gdb.isStop(p));
      this.lastStop = Gdb.parseStop(p);
      return this.lastStop;
    } finally { this.running = false; }
  }

  // legacy: break a running CPU (prefer halt())
  interrupt() { if (this.sock && !this.closed && this.running && !this.stopArrived) this.sock.write("\x03"); }

  async status() { return Gdb.parseStop(await this.request("?")); }

  close() { try { this.sock?.end(); this.sock?.destroy(); } catch { /* gone */ } }
}
