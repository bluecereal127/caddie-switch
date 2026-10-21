// A DSU ("cemuhook") server: the virtual controllers the harness drives
// Dolphin with. Dolphin's DSU client (InputCommon DualShockUDPClient, enabled
// by Config/DSUClient.ini) polls this server and shows each connected slot as
// the device DSUClient/<slot>/<description>; the generated WiimoteNew.ini maps
// slot 0 onto the emulated Wii Remote (buttons, the IR pointer on the left
// stick, the MotionPlus gyro and the accelerometer) and Hotkeys.ini maps slot
// 1 onto Dolphin's hotkeys (savestate slots, screenshot, speed limit), so no
// keystroke ever goes to a window and the user's own Dolphin settings are
// never read or written.
//
// Wire format: Dolphin's DualShockUDPProto.h (pack(1)): a 16-byte header
// ("DSUS", protocol 1001, payload length, CRC-32 of the whole packet with the
// CRC field zeroed, server id) and a u32 message type: 0x100000 version,
// 0x100001 port info, 0x100002 pad data (100 bytes in all).

import dgram from "node:dgram";

const PROTO = 1001;
export const MSG = { version: 0x100000, ports: 0x100001, data: 0x100002 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// The digital inputs Dolphin's DSU device exposes, by the names its mapping
// strings use, with their byte and bit in the pad-data packet (byte 0 =
// buttons1: D-pad W S E N, Options, R3, L3, Share from bit 7 down; byte 1 =
// buttons2: Square Cross Circle Triangle R1 L1 R2 L2; then PS, Touch Button).
export const BUTTONS = {
  "Pad W": [0, 0x80], "Pad S": [0, 0x40], "Pad E": [0, 0x20], "Pad N": [0, 0x10],
  Options: [0, 0x08], R3: [0, 0x04], L3: [0, 0x02], Share: [0, 0x01],
  Square: [1, 0x80], Cross: [1, 0x40], Circle: [1, 0x20], Triangle: [1, 0x10],
  R1: [1, 0x08], L1: [1, 0x04], R2: [1, 0x02], L2: [1, 0x01],
  PS: [2, 1], "Touch Button": [3, 1],
};

function newPad() {
  return {
    buttons: new Set(),
    // sticks 0..255, 128 = centre; Y is "plus upward" on the wire
    lx: 128, ly: 128, rx: 128, ry: 128,
    accel: [0, 0, 0],      // g (x, y, z)
    gyro: [0, 0, 0],       // deg/s (pitch, yaw, roll)
    motionTimestampUs: 0n,
    counter: 0,
  };
}

export class DsuServer {
  constructor({ port = 46020, host = "127.0.0.1", slots = 2, serverId = 0x48415253 /* "HARS" */, rateHz = 250 } = {}) {
    this.port = port;
    this.host = host;
    this.serverId = serverId;
    this.rateHz = rateHz;
    this.pads = Array.from({ length: slots }, newPad);
    this.clients = new Map(); // "addr:port" -> { addr, port, last }
    this.sock = null;
    this.timer = null;
    this.stats = { rx: 0, tx: 0, badRx: 0 };
    this.t0 = process.hrtime.bigint();
  }

  start() {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket("udp4");
      this.sock = sock;
      sock.on("error", reject);
      sock.on("message", (msg, rinfo) => this._onMessage(msg, rinfo));
      sock.bind(this.port, this.host, () => {
        sock.removeListener("error", reject);
        sock.on("error", (e) => { this.lastError = e; });
        // Dolphin marks a pad disconnected after a few seconds without data;
        // stream continuously, and send on every state change too (push()).
        this.timer = setInterval(() => this.push(), Math.max(1, Math.round(1000 / this.rateHz)));
        resolve(this);
      });
    });
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    return new Promise((r) => (this.sock ? this.sock.close(() => r()) : r()));
  }

  pad(slot = 0) { return this.pads[slot]; }

  setButtons(slot, names, down = true) {
    const p = this.pads[slot];
    for (const n of [].concat(names)) {
      if (!(n in BUTTONS)) throw new Error(`unknown DSU button ${n}`);
      if (down) p.buttons.add(n); else p.buttons.delete(n);
    }
    this.push();
  }

  // stick in -1..1 (x right, y up) -> 0..255
  setStick(slot, which, x, y) {
    const p = this.pads[slot];
    const b = (v) => Math.max(0, Math.min(255, Math.round(128 + v * 127)));
    if (which === "left") { p.lx = b(x); p.ly = b(y); } else { p.rx = b(x); p.ry = b(y); }
    this.push();
  }

  setMotion(slot, { accel, gyro }) {
    const p = this.pads[slot];
    if (accel) p.accel = accel.slice();
    if (gyro) p.gyro = gyro.slice();
    // the timestamp must move for Dolphin to take a new motion sample
    p.motionTimestampUs = (process.hrtime.bigint() - this.t0) / 1000n;
    this.push();
  }

  _header(buf, payloadLen) {
    buf.write("DSUS", 0, "ascii");
    buf.writeUInt16LE(PROTO, 4);
    buf.writeUInt16LE(payloadLen, 6);
    buf.writeUInt32LE(0, 8);
    buf.writeUInt32LE(this.serverId, 12);
  }
  _finish(buf) { buf.writeUInt32LE(crc32(buf), 8); return buf; }

  // the 11-byte "shared response beginning": slot, state, model, connection, MAC, battery
  _portInfo(buf, off, slot) {
    const connected = slot < this.pads.length;
    buf[off] = slot;
    buf[off + 1] = connected ? 2 : 0;     // DsState: 2 connected
    buf[off + 2] = connected ? 2 : 0;     // DsModel: 2 full gyro
    buf[off + 3] = connected ? 2 : 0;     // DsConnection: 2 bluetooth
    for (let i = 0; i < 6; i++) buf[off + 4 + i] = connected ? (i === 5 ? slot + 1 : 0x42) : 0;
    buf[off + 10] = connected ? 0x05 : 0; // DsBattery: full
  }

  _onMessage(msg, rinfo) {
    if (msg.length < 20 || msg.toString("ascii", 0, 4) !== "DSUC") { this.stats.badRx++; return; }
    const crc = msg.readUInt32LE(8);
    const copy = Buffer.from(msg);
    copy.writeUInt32LE(0, 8);
    if (crc32(copy) !== crc) { this.stats.badRx++; return; }
    this.stats.rx++;
    const type = msg.readUInt32LE(16);
    const key = `${rinfo.address}:${rinfo.port}`;
    if (type === MSG.version) {
      const out = Buffer.alloc(16 + 6);
      this._header(out, 6);
      out.writeUInt32LE(MSG.version, 16);
      out.writeUInt16LE(PROTO, 20);
      this._send(this._finish(out), rinfo);
    } else if (type === MSG.ports) {
      const n = Math.max(0, Math.min(4, msg.readInt32LE(20)));
      for (let i = 0; i < n; i++) {
        const slot = msg[24 + i];
        const out = Buffer.alloc(16 + 16);
        this._header(out, 16);
        out.writeUInt32LE(MSG.ports, 16);
        this._portInfo(out, 20, slot);
        out[31] = 0;
        this._send(this._finish(out), rinfo);
      }
    } else if (type === MSG.data) {
      // PadDataRequest: register flags (0 all, 1 by pad id, 2 by MAC), pad id,
      // MAC. Dolphin opens one socket per device, registers its own pad id
      // and keeps whatever pad packet arrived last without checking the slot,
      // so a socket must only ever get the slots it registered for.
      const flags = msg[20], id = msg[21];
      const slots = flags === 1 ? [id] : flags === 2 ? [msg[27] - 1] : this.pads.map((_, i) => i);
      const prev = this.clients.get(key);
      const set = new Set(prev ? prev.slots : []);
      for (const s of slots) if (s >= 0 && s < this.pads.length) set.add(s);
      this.clients.set(key, { addr: rinfo.address, port: rinfo.port, last: Date.now(), slots: [...set] });
      this.push();
    }
  }

  _send(buf, rinfo) {
    this.stats.tx++;
    this.sock.send(buf, rinfo.port, rinfo.address);
  }

  _dataPacket(slot) {
    const p = this.pads[slot];
    const out = Buffer.alloc(100);
    this._header(out, 84);
    out.writeUInt32LE(MSG.data, 16);
    this._portInfo(out, 20, slot);
    out[31] = 1;                                   // active
    out.writeUInt32LE(p.counter++ >>> 0, 32);
    const b = [0, 0, 0, 0];
    for (const n of p.buttons) { const [i, bit] = BUTTONS[n]; b[i] |= bit; }
    out[36] = b[0]; out[37] = b[1]; out[38] = b[2]; out[39] = b[3];
    out[40] = p.lx; out[41] = p.ly; out[42] = p.rx; out[43] = p.ry;
    // analog D-pad W S E N, analog Square Cross Circle Triangle, R1 L1, R2 L2
    const an = (name) => (p.buttons.has(name) ? 255 : 0);
    ["Pad W", "Pad S", "Pad E", "Pad N", "Square", "Cross", "Circle", "Triangle", "R1", "L1", "R2", "L2"]
      .forEach((n, i) => { out[44 + i] = an(n); });
    // touches 56..67 stay inactive
    out.writeBigUInt64LE(p.motionTimestampUs, 68);
    out.writeFloatLE(p.accel[0], 76); out.writeFloatLE(p.accel[1], 80); out.writeFloatLE(p.accel[2], 84);
    out.writeFloatLE(p.gyro[0], 88); out.writeFloatLE(p.gyro[1], 92); out.writeFloatLE(p.gyro[2], 96);
    return this._finish(out);
  }

  push() {
    if (!this.sock) return;
    const now = Date.now();
    for (const [key, c] of this.clients) {
      if (now - c.last > 10000) { this.clients.delete(key); continue; }
      for (const s of c.slots) this._send(this._dataPacket(s), c);
    }
  }

  // hold a button for ms, then release (a hotkey or a Wii Remote press)
  async tap(slot, names, ms = 120) {
    this.setButtons(slot, names, true);
    await sleep(ms);
    this.setButtons(slot, names, false);
    await sleep(ms);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
