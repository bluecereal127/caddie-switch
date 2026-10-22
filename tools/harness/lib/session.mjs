// One harness session: Dolphin (its own generated user dir), the DSU server
// and the GDB connection, with savestate reloads that are checked against
// memory. Batch scripts use this; tools/harness/driver.mjs is the
// interactive equivalent for menu work.

import fs from "node:fs";
import path from "node:path";
import { DsuServer, sleep } from "./dsu.mjs";
import { Gdb } from "./gdb.mjs";
import { writeUserDir, launch, kill, stateSlotPath, HOTKEY_MAP, STATE, portsFor, INSTANCE, windowSpot, placeWindow } from "./dolphin.mjs";
import { pointers, readBall, state as readState } from "./wsr.mjs";
import { shoot } from "./shot.mjs";

export const SAVES = path.join(STATE, "saves");

const hotkey = (name) => {
  const e = Object.entries(HOTKEY_MAP).find(([k]) => k.toLowerCase().endsWith(name.toLowerCase()));
  if (!e) throw new Error(`no hotkey ${name}`);
  return e[1];
};

export class Session {
  // instance: the Dolphin user dir (lib/dolphin.mjs userDir) and, unless
  // given, the ports; a caller that passes only a GDB port gets the instance
  // that port belongs to (portsFor), so the user dir always follows the ports
  constructor({ instance, gdbPort, dsuPort, speed = 1.0, log = console.log } = {}) {
    if (instance == null) instance = gdbPort != null ? gdbPort - portsFor(0).gdb : INSTANCE;
    gdbPort ??= portsFor(instance).gdb;
    dsuPort ??= portsFor(instance).dsu;
    Object.assign(this, { instance, gdbPort, dsuPort, speed, log });
  }

  // waitBall: wait until the save's golf ball is at rest (false for a menu state)
  async start(saveFile, { waitBall = true } = {}) {
    this.dsu = await new DsuServer({ port: this.dsuPort }).start();
    writeUserDir({ instance: this.instance, gdbPort: this.gdbPort, dsuPort: this.dsuPort, speed: this.speed });
    this.child = launch({ instance: this.instance, batch: true, saveState: saveFile });
    const spot = windowSpot(this.instance);
    if (spot) placeWindow(this.child.pid, spot);
    this.gdb = new Gdb({ port: this.gdbPort });
    await this.gdb.connect({ timeoutMs: 120000 });
    await this.gdb.go();
    this.saveFile = saveFile;
    // the boot loads the state: wait until the game is in it
    if (waitBall) await this.waitLoaded(null, 60000);
    else await sleep(8000);
    return this;
  }

  async stop() {
    try { await this.gdb.halt(); await this.gdb.clearBreaks(); } catch { /* gone */ }
    try { this.gdb.close(); } catch { /* */ }
    kill(this.child);
    await this.dsu.stop();
  }

  // run fn with the CPU stopped
  async paused(fn) {
    await this.gdb.haltSafe();
    try { return await fn(this.gdb); } finally { await this.gdb.go(); }
  }

  // until the real ball rests at the expected start (default: the one read
  // from the save at start) with no shot in flight. The ball's lifetime is
  // not reset between strokes (2,182 ticks at a second stroke's address), so
  // a save is recognised by its ball's position and lifetime both
  async waitLoaded(expect, timeoutMs = 20000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await this.paused(async (gdb) => {
        try {
          const p = await pointers(gdb);
          const b = await readBall(gdb, p.ball);
          if (!expect) {
            const swing = await gdb.u32(p.swing + 0x30);
            if (b.moving || (swing !== 0 && swing !== 3)) return false;
            this.start0 = { pos: b.pos, life: b.life };
            return true;
          }
          const same = b.pos.every((v, i) => Math.abs(v - expect.pos[i]) < 1e-4);
          return same && !b.moving && (expect.life == null || b.life === expect.life);
        } catch { return false; }
      });
      if (ok) return;
      if (Date.now() - t0 > timeoutMs) throw new Error("state did not load");
      await sleep(250);
    }
  }

  // load a savestate file: copied into slot 4, the slot-4 hotkey pressed
  // (retried if Dolphin missed it), done when the ball sits at the file's
  // start; `expect` = { pos } of that start (default: the session's first).
  // The 45 MB copy is skipped when slot 4 still holds this file from this
  // session's last copy: the same path, the file's size and mtime unchanged
  // since, and the slot file's own size and mtime as the copy left them
  // (Dolphin only reads a slot to load it; nothing here saves to slot 4, and
  // saveSlot(4) drops the record). A run putting 500 times from one state
  // copies it once.
  async load(file = this.saveFile, expect = this.start0) {
    const slot = stateSlotPath(4, this.instance);
    const key = path.resolve(file);
    const st = (f) => { try { const x = fs.statSync(f); return `${x.size}:${x.mtimeMs}`; } catch { return null; } };
    const held = this.slot4 && this.slot4.file === key && this.slot4.src === st(file) && this.slot4.slot === st(slot);
    if (!held) {
      this.slot4 = null;
      fs.copyFileSync(file, slot);
      this.slot4 = { file: key, src: st(file), slot: st(slot) };
      this.copies = (this.copies ?? 0) + 1;
    }
    await this.loadSlot(4, expect, file);
  }

  // load what a state slot holds by its hotkey, no copy (a temporary state
  // saved with saveSlot, or slot 4 after load): retried if Dolphin missed
  // the press, done when the ball sits at `expect`
  async loadSlot(slot, expect, what = `slot ${slot}`) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.gdb.halt(); await this.gdb.clearBreaks(); await this.gdb.go();
      // make the current state differ from the target, so a missed load shows
      await this.dsu.tap(1, hotkey(`Load State Slot ${slot}`), 150);
      try { await this.waitLoaded(expect, 6000); return; } catch { this.log(`load: retry ${attempt + 1}`); }
    }
    throw new Error(`could not load ${what}`);
  }

  // save the running state into a slot (its hotkey, retried) and return the
  // slot file's path, without copying it anywhere: a temporary state that
  // loadSlot reads back (Dolphin moves the slot's previous file to
  // lastState.sav, its undo copy). Done once the file has been rewritten and
  // its size has held for 0.4 s after the 0.8 s the copy always waited.
  async saveSlot(slot = 3) {
    const file = stateSlotPath(slot, this.instance);
    if (slot === 4) this.slot4 = null;
    const before = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0;
    for (let a = 0; a < 4; a++) {
      await this.dsu.tap(1, hotkey(`Save State Slot ${slot}`), 200);
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        if (fs.existsSync(file) && fs.statSync(file).mtimeMs > before) {
          await sleep(800);
          for (let k = 0, size = -1; k < 25; k++) {
            const now = fs.statSync(file).size;
            if (now === size && now > 0) break;
            size = now; await sleep(200);
          }
          return file;
        }
      }
    }
    throw new Error(`save to slot ${slot} failed`);
  }

  // save the running state as SAVES/<name> (slot 3 + its hotkey, retried)
  async saveState(name) {
    let slot;
    try { slot = await this.saveSlot(3); } catch { throw new Error(`save ${name} failed`); }
    fs.copyFileSync(slot, path.join(SAVES, name));
    return path.join(SAVES, name);
  }

  async shoot(opts) {
    return this.paused((gdb) => shoot(gdb, { dsu: this.dsu, ...opts }));
  }

  async state() { return this.paused((gdb) => readState(gdb)); }
}
