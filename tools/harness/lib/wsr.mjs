// Wii Sports Resort (NTSC-U rev 1, RZTE01) golf in RAM: the addresses and
// struct offsets the harness reads and writes, each with where it comes from.
// "doc" = tools/research/*.md; "live" = read from the running game through
// the GDB stub (2026-10-21, hole 10 tee, Classic A) and checked against the
// disassembly of main.dol. SDA bases: r2 = 0x806fe080, r13 = 0x806f8120.

export const YD = 9.144;                 // KCL units per yard (1 u = 0.1 m)

// static pointers (r13-relative SDA words; the r13 offsets are the docs')
export const PTR = {
  playerManager: 0x806f5468,  // r13-0x2cb8 RPGlfPlayerManager (ground-phase 7)
  fieldManager: 0x806f5480,   // r13-0x2ca0 RPGlfFieldManager (ground-phase 7)
  glfConfig: 0x806f5498,      // r13-0x2c88 GlfConfig (0x80405f1c, 0x80406164)
  clubManager: 0x806f54a0,    // r13-0x2c80 RPGlfClubManager::sInstance (club-physics 2)
  ballManager: 0x806f54e0,    // r13-0x2c40; +0x12c4 = the real ball (0x803fabd8)
  simBall: 0x806f54e8,        // r13-0x2c38 RPGlfSimManager::spSimBall, the look-ahead
  staticMem: 0x806f4e98,      // r13-0x3288 Sp2::StaticMem (0x804061c8)
  rand: 0x806f4e38,           // Sp2::Rand state s0, s1 (swing-redzone-spin 7.1)
};

// code addresses the harness breaks on
export const CODE = {
  swingUpdate: 0x80420d84,     // per-frame swing state machine (r3 = swing)
  swingState0: 0x80421254,     // lwz r0,0x30(r27): the state-0 trigger test; r27 = swing
  powerStored: 0x80421368,     // right after stfs f1,0x98(r27) (0x80421364): launch power set
  realShot: 0x8041210c,        // RPGlfBall launch (r3 = ball, r4 = swing)
  ballStart: 0x80414ebc,       // ball start (lifetime 0, velocity, lift)
  spinStored: 0x8041489c,      // in the hand-off 0x80414854, after ball+0x9c/+0xa0 are stored; r31 = ball
  stepWrapper: 0x80414734,     // per-tick step: Calc, trees, flagstick, contacts (r3 = ball)
  stopBall: 0x80413b04,        // stops a ball (v = 0, +0x60 = 0)
  choosePin: 0x804066e0,       // GlfConfig::choosePin(set)
};

// the ball (RPGlfBall, 0x1e0 bytes; live layout)
export const BALL = {
  matrix: 0x0c,      // 3x3 rotation (the model's), then translation:
  pos: 0x30,         // vec3: the ball centre in KCL units (x east, y up, z south)
  posPtr: 0x4c,      // -> pos (what the contact routine's "&ball+0x4c" passes)
  isSim: 0x50,       // u8: != 0 for a look-ahead ball (ground-phase 3.1)
  life: 0x54,        // s32 ticks since launch (1/240 s)
  spinStart: 0x58,   // s32 tick the swing's spin was applied
  frames: 0x5c,      // s32 frames (lifetime >> 2)
  moving: 0x60,      // u8: 0 once stopped
  posCalc: 0x64,     // vec3: position after Calc, before the contact routine
  normal: 0x70,      // vec3: smoothed contact normal (ring of four)
  vContact: 0x7c,    // vec3: velocity entering the last contact
  vel: 0x88,         // vec3 u/tick
  speedPrev: 0x94,   // |v| at the end of the previous tick
  lift: 0x98,        // lift scalar (P14 q at launch)
  side: 0x9c,        // side spin (swing side * P18)
  back: 0xa0,        // backspin (s7c * P1c)
  steerOn: 0xa4,     // u8: pull-back started
  steer: 0xa8,       // vec3: pull-back vector
  attrMax: 0xb4,     // u16: largest attr over the last four ticks (in-air test)
  attrGround: 0xb6,  // u16: attr while on the ground
  stopCount: 0xb8,
  water: 0xbc,       // s32: 1 water, 2 OB floor under, 3 valley
  simPos: 0xf0,      // look-ahead records (sim ball): position copy
  landPos: 0xfc,     // first ground contact after a flight
  wallPos: 0x108,
  restPos: 0x114,
  closePos: 0x120,   // closest approach to the pin
  apexPos: 0x12c,
  landFrame: 0x13c, wallFrame: 0x140, holeFrame: 0x144, restFrame: 0x148,
  closeFrame: 0x14c, apexFrame: 0x150, restAttr: 0x154, restWater: 0x158,
  swing: 0x16c,      // -> the swing while attached
  touched: 0x17f,    // u8: has touched something this shot
};

// the swing (swing-redzone-spin sections 3-5)
export const SWING = {
  follower: 0x10,    // -> follower object: +4 g, +8 velocity
  gPrev: 0x14,       // the follower's g on the previous frame (the trigger's other operand)
  tracker: 0x18,     // s18
  trackerPeak: 0x1c, // s1c
  speed: 0x28,       // recent peak remote speed
  speedThresh: 0x2c, // its decaying threshold
  state: 0x30,       // 0 address, 1 follow-through window, 2, 3
  timer: 0x34,       // state-1 frame counter
  s48: 0x48,
  backspin: 0x7c,    // s7c
  raw: 0x88, p1: 0x8c, p2: 0x90, p3: 0x94,
  power: 0x98,       // launch power min(p3, lie factor): what the shot flies with
  curveSrc: 0xb4,    // -> curve tracker (+4)
  coin: 0xd8,        // red-zone side
  fired: 0xe4,       // u8: the real shot has been fired
};

export const PLAYER = {
  heading: 0x80,     // aim heading
  aim: 0x84,         // vec2 (x, z): unit aim direction the launch rotates by the lie yaw
  pos: 0x98,         // vec3 player position
  lie: 0xb0,         // u16 mPrevGndAttr: the lie the club code uses
  swingIdx: 0x50,    // u8: swing = *(player + 0xe8 + 4 * this)
  swingOff: 0x7c,    // u8: 1 = swing logic disabled (0x803fcd44 -> 0x80422d70 r5)
  swingTab: 0xe8,
};

export const CLUBS = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge", "putter"];

export const ATTR = { 0: "none", 1: "fairway", 2: "rough", 3: "bunker", 4: "ob", 5: "ob2", 6: "green",
  7: "water", 8: "wood", 9: "fringe", 10: "cupside", 11: "cup", 12: "wall", 13: "valley", 14: "glass", 15: "tee", 16: "sandob" };

const vec3 = (b, o) => [b.readFloatBE(o), b.readFloatBE(o + 4), b.readFloatBE(o + 8)];

export async function pointers(gdb) {
  const out = {};
  for (const [k, a] of Object.entries(PTR)) if (!["rand"].includes(k)) out[k] = await gdb.u32(a);
  out.ball = await gdb.u32(out.ballManager + 0x12c4);
  out.player = await gdb.u32(out.playerManager + 0x664);
  const idx = (await gdb.readMem(out.player + PLAYER.swingIdx, 1))[0];
  out.swing = await gdb.u32(out.player + PLAYER.swingTab + 4 * idx);
  out.pin = await gdb.u32(out.fieldManager + 0x3c);
  out.pinPos = await gdb.u32(out.pin + 0x4c);
  out.wind = await gdb.u32(out.fieldManager + 0x78);
  return out;
}

// { records: false }: the ball's own state only (below its look-ahead records
// at +0xf0..+0x158), for reads before a stroke, where the records hold the
// last stroke's look-ahead and a natural round must not read them (the
// fair-play audit of 2026-10-22: they were read, never used)
export async function readBall(gdb, addr, { records = true } = {}) {
  if (!records) {
    const b = await gdb.readMem(addr, 0xf0);
    return {
      pos: vec3(b, BALL.pos), life: b.readInt32BE(BALL.life), frames: b.readInt32BE(BALL.frames),
      spinStart: b.readInt32BE(BALL.spinStart), moving: b[BALL.moving], vel: vec3(b, BALL.vel),
      lift: b.readFloatBE(BALL.lift), side: b.readFloatBE(BALL.side), back: b.readFloatBE(BALL.back),
      attrMax: b.readUInt16BE(BALL.attrMax), attrGround: b.readUInt16BE(BALL.attrGround), water: b.readInt32BE(BALL.water),
      dropSpot: vec3(b, 0xd0), waterTicks: b.readInt32BE(0xc0),
    };
  }
  const b = await gdb.readMem(addr, 0x180);
  return {
    pos: vec3(b, BALL.pos), life: b.readInt32BE(BALL.life), frames: b.readInt32BE(BALL.frames),
    spinStart: b.readInt32BE(BALL.spinStart), moving: b[BALL.moving], vel: vec3(b, BALL.vel),
    lift: b.readFloatBE(BALL.lift), side: b.readFloatBE(BALL.side), back: b.readFloatBE(BALL.back),
    attrMax: b.readUInt16BE(BALL.attrMax), attrGround: b.readUInt16BE(BALL.attrGround), water: b.readInt32BE(BALL.water),
    land: vec3(b, BALL.landPos), rest: vec3(b, BALL.restPos), apex: vec3(b, BALL.apexPos),
    landFrame: b.readInt32BE(BALL.landFrame), restFrame: b.readInt32BE(BALL.restFrame),
    holeFrame: b.readInt32BE(BALL.holeFrame), restAttr: b.readUInt16BE(BALL.restAttr),
    restWater: b.readInt32BE(BALL.restWater), dropSpot: vec3(b, 0xd0), waterTicks: b.readInt32BE(0xc0),
    wallFrame: b.readInt32BE(BALL.wallFrame), wall: vec3(b, BALL.wallPos),
    close: vec3(b, BALL.closePos), closeFrame: b.readInt32BE(BALL.closeFrame),
    touched: b[BALL.touched],
  };
}

export async function state(gdb, { records = true } = {}) {
  const p = await pointers(gdb);
  const pl = await gdb.readMem(p.player, 0xc0);
  const cfg = await gdb.readMem(p.glfConfig, 0x10);
  const cm = await gdb.readMem(p.clubManager, 0x30);
  const wind = await gdb.readMem(p.wind, 0x14);
  const pin = await gdb.readMem(p.pinPos, 12);
  const sw = await gdb.readMem(p.swing, 0xe8);
  return {
    ptr: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toString(16)])),
    hole: cfg.readInt32BE(0xc) + 1, mode: cfg.readInt32BE(4),
    club: CLUBS[cm.readInt32BE(0x2c)] ?? cm.readInt32BE(0x2c),
    wind: { angle: wind.readFloatBE(8), speedIdx: wind.readInt32BE(0x10), dir: Math.round(wind.readFloatBE(8) / (Math.PI / 4)) },
    pin: vec3(pin, 0),
    player: { heading: pl.readFloatBE(PLAYER.heading), headingU32: pl.readUInt32BE(PLAYER.heading).toString(16),
      aim: [pl.readFloatBE(PLAYER.aim), pl.readFloatBE(PLAYER.aim + 4)], pos: vec3(pl, PLAYER.pos), lie: pl.readUInt16BE(PLAYER.lie) },
    swing: { state: sw.readInt32BE(SWING.state), timer: sw.readInt32BE(SWING.timer), power: sw.readFloatBE(SWING.power),
      raw: sw.readFloatBE(SWING.raw), fired: sw[SWING.fired] },
    ball: await readBall(gdb, p.ball, { records }),
  };
}
