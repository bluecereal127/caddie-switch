// helpers: H.dumpNow(tag) (CPU already halted), H.dump(tag), H.state(), H.play(name, opts), H.toAddress(name)
const YD = 9.144;
H.dumpNow = async (tag) => {
  const out = {};
  fs.mkdirSync(path.join(HERE, "ram"), { recursive: true });
  for (const [kind, b] of Object.entries(H.brres)) {
    const buf = await gdb.readMem(b.hits[0], b.size);
    fs.writeFileSync(path.join(HERE, "ram", `${tag}-${kind}.bin`), buf);
    out[kind] = H.hex(b.hits[0]);
  }
  return out;
};
H.dump = (tag) => H.paused(() => H.dumpNow(tag));
H.state = () => H.paused(async () => {
  const st = await W.state(gdb, { records: false });
  return { hole: st.hole, ball: st.ball.pos, moving: st.ball.moving, pin: st.pin, lie: st.player.lie };
});
H.readyInfo = async () => H.paused(async () => {
  const pm = await gdb.u32(W.PTR.playerManager), cfg = await gdb.u32(W.PTR.glfConfig);
  const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
  const p = await W.pointers(gdb);
  const b = await W.readBall(gdb, p.ball, { records: false });
  const sw = await gdb.u32(p.swing + 0x30);
  return { f674: f[0], f675: f[1], tut, moving: b.moving, sw, ball: b.pos, ready: f[0] === 1 && f[1] === 1 && !tut && !b.moving && (sw === 0 || sw === 3) };
});
H.play = async (name, { along = 0, right = 0, club = null, power = null, heading = null } = {}) => {
  const res = { name };
  await gdb.haltSafe();
  const st = await W.state(gdb);
  res.hole = st.hole; res.pin = st.pin; res.from = st.ball.pos; res.lie = st.player.lie;
  const [bx, , bz] = st.ball.pos, [px, py, pz] = st.pin;
  let ux = px - bx, uz = pz - bz; const n = Math.hypot(ux, uz); ux /= n; uz /= n;
  const rx = -uz, rz = ux;
  const tgt = [px + (along * ux + right * rx) * YD, py, pz + (along * uz + right * rz) * YD];
  res.target = tgt;
  const plan = club ? { club, power, heading } : await PLAY.planStroke(st.hole, { ...st, wind: { ...st.wind, speedIdx: 0 }, pin: tgt });
  res.plan = plan;
  const shot = await SHOT.shoot(gdb, { dsu: s.dsu, power: plan.power, club: plan.club, heading: plan.heading, trace: false, untilRest: "real",
    onHandoff: async () => { res.flightDump = await H.dumpNow(`${name}-flight`); } });
  res.rest = shot.ball.pos; res.restAttr = shot.ball.restAttr; res.hazard = shot.hazard;
  res.restDump = await H.dumpNow(`${name}-rest`);
  await gdb.go();
  res.snapRest = await H.snap(`${name}-rest`);
  res.toPinYd = Math.hypot(res.rest[0] - res.pin[0], res.rest[2] - res.pin[2]) / YD;
  return res;
};
H.toAddress = async (name, { waitS = 6, maxS = 60 } = {}) => {
  const t0 = Date.now(), seq = [];
  let k = 0, info;
  for (;;) {
    const el = (Date.now() - t0) / 1000;
    if (k % 2 === 0) await H.dump(`${name}-wait${String(k).padStart(2, "0")}`);
    seq.push({ t: +el.toFixed(1), snap: await H.snap(`${name}-seq${String(k++).padStart(2, "0")}`) });
    info = await H.readyInfo();
    seq[seq.length - 1].info = info;
    if (info.ready) break;
    if (el > maxS) break;
    if (el > waitS) { H.hold(["A", "B"], true); await sleep(250); H.hold(["A", "B"], false); }
    await sleep(1000);
  }
  await sleep(1500);
  const addrDump = await H.dump(`${name}-address`);
  const snapAddr = await H.snap(`${name}-address`);
  return { seq, info, addrDump, snapAddr };
};
return "ok";
