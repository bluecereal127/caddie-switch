// Nintendo Switch Sports' golf ball, tick for tick (NSS 1.5.0): the laws decoded
// from the game's code and RomFS (tools/harness/state/eden/nss-golf-x/physics.md)
// and confirmed against 71 strokes recorded in Eden's RAM (flights.md, and the
// verifiers' corrections in verify/flights/verdicts.json, which override the
// decode where they differ) and against the RAM player's rounds of 2026-10-25 (the
// cup, the bounce, the flagstick, the canopy counter and the HUD's wind decoded then:
// the putter assist's ghost balls, the pole contacts, the strong winds). Every constant
// comes from tools/nss-physics.json (tools/nss-physics-export.mjs: GolfBallMoveParam,
// GolfPlayerClubParam, the code defaults the file leaves to the class, GolfShotVelTable
// read from Eden's RAM, the contact record's code constants and the flagstick's shape),
// copied into the block below by that exporter; tools/test-nsssim.mjs checks the copy
// and replays the recorded strokes.
//
// Pure ES module, no Node or DOM API: the app, its worker and the tools share it.
// src/wsrsim.js (Wii Sports Resort's ball) stays as it was, for history.
//
// Frame and units: the NSS hole frame, metres and seconds, +x east, +y up, -z
// toward the minimap's north; a tick is 1/240 s (4 per 60 Hz frame, dt = the
// game's float 0.016666668 / 4).
//
// The ball's state is float32, as the game's: every operation is rounded with
// Math.fround, in the order of the decode, and a flight from a recorded launch lands on
// the recording's last airborne sample to 0.001-0.09 mm after up to 262 m (in doubles
// 0.1-1.1 mm). The collision geometry is computed in doubles from the float32 vertices.
//
// One tick (0xd388d8), in the order the recordings fit:
//   1. move: pos += v dt, then the solid triangles the move meets (meshGround's
//      contacts: the ones the ball's 0.05 m sphere overlaps at the end of the move,
//      face, edge or corner, and the ones it touched on the way coming from clear of
//      them; a Cupside one farther than 0.5 m from the active cup is none: the move's
//      query callback 0xd34400..0xd34468 and the contact record 0xd38f68..0xd38fbc drop
//      it). A shot (mode 1): deepest first, each acting only while the velocity still
//      approaches it: the ball pushed out along the triangle's FACE normal to 0.05 m (NSS
//      reports a face normal for every contact) and the velocity's part into it removed.
//      The tick's contact (M+0xa4, the normal M+0x78, the bounce's) is the acting one the
//      incoming velocity met most head-on. A shot meeting bunker, OB, sand OB or the pin
//      is set down 0.005 m farther out and turned back at a restitution of 0.3 by the move
//      itself (Havok's material: measured, the dump has no material table). A roll or a
//      putt (mode 2): one contact a tick from the course, the deepest (at a tie, a shared
//      edge or corner, the one that is not Cupside, then the deeper plane), pushed out by
//      its depth along its face normal whether or not the ball approaches it; only an
//      approaching one slides the ball and is the tick's contact (the putter assist's
//      ghost paths of 2026-10-25, every tick from RAM). The pre-move velocity is the
//      contact's incoming velocity vin; u = the post-move v.
//      The flagstick (run's flag; flagMesh: the Phive shape BGOBJ_GlfPin_Anim_col, a
//      decagonal pole from the cup's bone to 2.996 m and the cloth, one quad 1.0078 m
//      downwind of it, 1.89..2.98 m up, along the wind object's angle) is its own body:
//      one pole face a tick, the first the move's swept sphere touches of those the
//      velocity approaches (at a vertical edge two are touched at once and the game's
//      choice is not decoded: poleTie); a shot meeting it is set at the face's closest
//      point out by 0.055 m (a face only touched on the way: where the sweep touches it,
//      out by 0.005 m) and bounces as the Pin, a roll
//      against it in the cup slides along it after the course's contact. It is in for
//      every stroke but a putt from the green (flagInPlay; no recorded putt met it).
//      Pass-through surfaces (water, leaf, flag, air OB, palm leaf) are crossed: water
//      sets the water line, palm leaves damp, the cloth zeroes v (not u) once (M+0x103)
//      unless a pin or flag contact at least 0.37 m over the bone came first (M+0x102,
//      not for the putter); the canopy counter M+0xdc (0xd38ecc..0xd38f10): each leaf
//      contact whose normal is not the one the last tick counted, +1 moving against it
//      (the 0.5 s timer M+0xe0 set), -1 along it (the timer stopped at a count <= 0; not
//      clamped), in a shot only; the stored normal is cleared every tick (0xd38b64), and
//      the timer runs down at the top of the tick and clears the count at zero (0xd38940).
//      The leaf contacts are, on a mesh, the Leaf triangles the step's sphere touches
//      (meshGround.leafTouch: fitted, not decoded), else the leaf faces crossed.
//   2. the record: a contact with bunker, Cupside, glass, sand OB, tree, object, the pin
//      or a barrier, or the flag's or water's volume, zeroes the backspin and the
//      pull-back (0xd396d8..0xd39700, 0xd39a2c); M+0xbc counts the stroke's
//      ground-contact ticks (any contact but none, leaf, rock, glass, tree, flag, air OB,
//      object, pin, palm leaf, barrier: 0xd39a44); M+0xac, the last surface touched, is
//      sticky once Cup and records Cupside as Green (0xd39674..0xd396d4). A shot (mode 1)
//      touching ground switches to the roll (mode 2) when the incoming normal speed, the
//      pass-through contact's speed and |vin.y| are all below FieldResistanceEnableSpeed
//      (4 m/s) (0xd39f84..0xd3a0b4: the third condition is the verifiers' correction); at
//      the switch the backspin pull-back P = -d 28 b^0.737 max(d . a, 0) is stored (d the
//      incoming horizontal direction, a M+0xf4: the post-move velocity of the stroke's
//      first contact, the launch velocity before it). A roll with no contact for
//      GroundLeaveTimeForAirMode (0.2 s; a pass-through contact holds the count) is a shot
//      again.
//   3. mode 1: gravity 10 (+ AddGravityHole within 0.3 m of the cup), wind
//      (|W| = s, 0.2 below 3 m above the launch rising to 1 at 30 m; 0.33 (W across
//      + 0.6 W along u's heading)), drag (0.0025 per frame), water friction under the
//      water line, leaf damping (1 - 0.03/4 per tick on the horizontal and rising
//      vertical speed while the counter is 1 or more), palm-leaf damping (1 - 0.08 per
//      touching tick), lift 0.0012 hop |u| / 4 along normalize(-ux uy, ux^2 + uz^2, -uy uz),
//      the hop decay (0.999632597 a tick: the game's approximate pow, read in RAM), side
//      spin and its decay. On a contact tick the bounce (0xd3f910) REPLACES all of that
//      but the decays: v = ReflectionH vt - ReflectionV k vn (vin split about n; k = 1 -
//      0.4 b^1.737 with backspin b), Green's ReflectionH / V instead of the contact's on
//      the cup's bevel (a near Cupside face with n.y > 0.1 that became the tick's contact:
//      M+0x108) in the stroke's first two ground-contact ticks (0xd3f958..0xd3f984), plus
//      the cloth's kick on the stroke's first ground contact, on the green, after a cloth
//      hit (flagKick: 0.5..2.5 m/s toward the cup turned by up to 20 deg, from sead::Random
//      seeded with the contact point's x, 0xd3fee4..0xd404c4), and v.y at most
//      CupsideReflectionMaxVelY (2 m/s) when the contact is Cupside (0xd404d0).
//   4. mode 2: drag, water, a Cupside contact's bounce (0xd3ab74..0xd3ab8c calls
//      0xd3f910: v = 0.999 vt - 0.13 vn from the incoming velocity, v.y at most 2 m/s),
//      friction |v| -= Friction[attr] FrictionRatioCurve(|v|) dt (to 0 at most; the tick's
//      contact surface, none when airborne), the backspin pull-back v += r P_plane dt (r =
//      BackSpinAngleRatioCurve of the angle between P and the ball-to-cup direction; P
//      decays by the surface's BackSpinResist^(1/4)), the stop count (horizontal |v| <=
//      StopVelLen for StopVelFrame = 10 frames: rest), then gravity: 6 on the green, 10
//      elsewhere, + AddGravityHole while |v| > 0.5 within 0.3 m of the cup; at |v| <= 0.5
//      with n.y >= 0.5 more than 1 m from the cup it acts along -n (no downhill pull: a
//      slow ball stops on a slope).
// The putter launches in mode 2. Holed: the first tick whose contact is Cup (the cup's
// bottom): the putter assist's ghost run marks it so (S+0x8a, 0xd45e74 / 0xd45f4c) and stops
// there (stopAtCup; 0xd45d18..0xd45d48), the real ball sets M+0x100 (0xd39838); a ball on the
// lip (Cupside) is not holed. Stops also after 1300 frames, below y -70, or within 0.2 m of
// one spot for 180 frames.
//
// What the replays show (tools/test-nsssim.mjs, over the dump's collision with the actor
// trees' canopies, the flag in for the non-putter strokes): every flight lands within
// 0.1 mm; the 51 strokes played to a rest off the cup end within 0.042 m of the recorded
// rest (median 0.5 mm; the six through actor canopies within 0.02 m); all 17 holed putts
// hole, 13 at rest within 5 mm of the recorded spot in the cup; h08s6's lip-out lips out
// (0.07 m from its rest). Of the putter assist's 99 ghost balls of 2026-10-25 87 hole or
// miss as the game's; the 15 assisted putts' holing runs match the game's holeLo..holeHi to
// 1 pct at the low end and 4 at the high (all 12 misses and the high ends' excess are fast
// putts the model holds and the game rejects: Havok's choice between two triangles that
// share the deepest edge point, which this model guesses, and its keeping the green face
// a tick longer as the ball rolls off the rim). The 16 recorded pole contacts: the velocity
// after within 3 mm/s on 14 (the two misses edge ties). Over a height field read off the
// same mesh with the analytic cup (heightGround, cupMesh: the route a terrain grid takes)
// all 23 recorded putts end as recorded. The game's own contact differs from this model's
// on about 1 % of rolling ticks, the tick a ball rolls off a face over a convex edge: half
// the time the game still counts that face (27 against 30 such ticks, alike in every
// measured way), so long rolls and the cup's walls can amplify a sub-millimetre difference.
//
// Not modelled (not decoded, or not exercised by the recordings): side spin from curve (0 on
// every recorded swing; the law is in, untested), over-swing randomness, the swing's own
// backspin (b is an input), which face Havok keeps at a pole edge or at a shared edge of
// the course in a roll, the canopy counter in a roll (RAM moves it there; counting it made
// h17s1 worse), StopVelFrame x 10 while the last surface is the pin (0xd3c97c), b *= k at
// the bounces after the first switch to the roll (M+0x4c, 0xd3feb8), why the flag is out
// for putts. The HUD's wind is a table (HUD_MPH: RAM's s against the HUD's own text; the
// text box's rounding is not traced).

// <nss-physics> generated by tools/nss-physics-export.mjs from tools/nss-physics.json; do not edit by hand
export const PHYSICS = {"_note":"NSS 1.5.0's golf ball, every constant src/nsssim.js uses. GENERATED by tools/nss-physics-export.mjs from the git-ignored eden dump (GolfBallMoveParam and GolfPlayerClubParam from the RomFS, the class defaults the file omits from the decoded .nso, GolfShotVelTable from Eden's RAM, the cup from the collision). Laws: tools/harness/state/eden/nss-golf-x/physics.md, flights.md and verify/flights/verdicts.json (the corrections there override the decode). Units m, s, m/s; float32 values as the shortest decimal that reads back to the same float32.","source":{"game":"NSS 1.5.0","moveParam":{"file":"RomFS Pack/Actor/GolfBall.pack.zs: Parameter/GolfBallMoveParam/Default.elsa__parameter__GolfBallMoveParam.bgyml","sha1":"5f34037a1c475d17d696f086524faf09886c11c9"},"clubParam":{"file":"RomFS Pack/Actor/GolfPlayer.pack.zs: Parameter/GolfPlayerClubParam/GolfPlayer.elsa__parameter__GolfPlayerClubParam.bgyml","sha1":"435069ebe0a596b4ef073115919349f79adb3797"},"codeDefaults":{"file":"physics.json (the .nso's class defaults)","sha1":"9c5a1709504978aae9631ad89d69de0b28f86093"},"launchTable":{"file":"GolfShotVelTable.json (Eden RAM 0x2073C937140 (System/CombinationDataTableData/GolfShotVelTable.pp__CombinationDataTableData.bgyml, NSS 1.5.0, loaded in a local golf round))","sha1":"81f0dc88e1e4e4be9c5e51e74b75382d90c50f78"},"cups":{"file":"collision/hNN.bin (tools/lib/nsscol.mjs) at the cups of tools/nss-pins.json"}},"tick":{"frameS":0.01666666753590107,"substeps":4,"dt":0.004166666883975267,"_note":"dt = the game's 0.016666668 / 4; the step 0xd388d8 runs 4 times a 60 Hz frame"},"ball":{"contactRadiusM":0.05,"phiveRadiusM":0.056,"teeHeightM":0.05,"_note":"the ground contact is the centre less 0.050 m along the normal (9,624 contact samples, median 0.05000001); a ball on a tee starts 0.1000 m above the mesh, at rest 0.05"},"air":{"gravity":10,"airFriction":0.0025,"hopSpinK":0.0012,"hopSpinResist":0.9985,"hopDecayTick":0.9996325969696045,"sideSpinK":0.0015,"sideSpinResist":0.9985,"sideDecayTick":0.9996325969696045,"windK":0.33,"windFwdK":0.6,"windBias":0.5,"windVelMax":15,"windHeight":30,"windEffectCurve":{"type":"Linear2D","maxX":1,"points":[[0,0.2],[0.1,0.2],[1,1]]},"_note":"drag v -= AirFriction / 4 v a tick while |v| > StopVelLen; lift along normalize(-ux uy, ux^2 + uz^2, -uy uz) * HopSpinK * hop * |u| / 4; hop *= hopDecayTick (the RAM value; HopSpinResist^(1/4) would be 0.999624789); wind |W| = WindVelMax (s / WindVelMax)^log2(1 / WindBias) = s, times WindEffectCurve((y - y_launch) / WindHeight), v += WindK (W_across + WindFwdK W_along) dt about u's heading, shots only"},"ground":{"gravityPutter":6,"fieldResistanceEnableSpeed":4,"groundLeaveTimeForAirMode":0.2,"frictionRatioCurve":{"type":"Hermit2D","maxX":15,"points":[[0,1,0],[5,1,0],[7.5,0.75,-0.7884906],[10,0.5,0]]},"velLenForStopGravity":0.5,"stopGravityDisableDist":1,"addGravityHole":8,"addGravityHoleDist":0.3,"addGravityHoleCurve":{"type":"Hermit2D","maxX":1,"points":[[0.5,1,0],[1,0,0]]},"noGravityVelLen":0.001,"stopVelLen":0.005,"stopVelFrame":10,"smallMoveForceStopDistance":0.2,"smallMoveForceStopFrame":180,"forceStopFrame":1300,"forceStopPosY":-70,"cupsideReflectionMaxVelY":2,"leafTimerS":0.5,"cupsideReachM":0.5,"cupGreenNormalY":0.1,"cupGreenGroundTicks":3,"groundTickAttrs":[1,2,3,4,5,6,7,9,10,13,14],"zeroSpinAttrs":[3,9,12,14,15,18,19,21],"softLiftM":0.005,"softRestitution":0.3,"softAttrs":[3,5,14,19],"flagHitAfterAngleRange":20,"flagHitAfterVelMin":0.5,"flagHitAfterVelMax":2.5,"hitPinFlagHeightFromCupPos":0.37,"_note":"roll when |vin . n| < FieldResistanceEnableSpeed, the pass-through contact's speed < it and |vin.y| < it (the third condition: verdicts.json roll_switch); a roll airborne for GroundLeaveTimeForAirMode s is a shot again; roll tick: drag, friction (Friction[attr] FrictionRatioCurve(|v|) dt), pull-back, stop count, gravity (GravityPutter on the green; along -n at |v| <= VelLenForStopGravity with n.y >= 0.5 farther than StopGravityDisableDist from the cup; + AddGravityHole AddGravityHoleCurve(d / AddGravityHoleDist) within AddGravityHoleDist, in flight and in a roll faster than VelLenForStopGravity: verdicts.json corrections). leafTimerS: the 0.5 s a canopy entry keeps the leaf counter (0xd38f10, trees.md). softAttrs (bunker, OB, sand OB, the pin): a shot's contact with one sets the ball down softLiftM farther out than the 0.05 m contact radius and turns its velocity back at softRestitution (measured on the recordings, not decoded; every other surface, and a roll on any, slides: restitution 0). FlagHit*: the cloth's kick on the stroke's first ground contact after a cloth hit, on the green (0xd3fee4..0xd404c4); HitPinFlagHeightFromCupPos: a pin or flag contact at least this high over the cup's bone sets M+0x102, after which the cloth is passed through (0xd39900..0xd39b6c)."},"backspin":{"reflectionMin":0.6,"reflectionBias":0.6,"initVelK":28,"initVelRatioMax":1,"backwardVelocityMax":18,"angleRatioCurve":{"type":"Linear2D","maxX":30,"points":[[0,1.3],[1,1.2],[5,1.2],[30,1]]},"_note":"bounce factor k = 1 + (reflectionMin - 1) b b^log2(1 / reflectionBias) = 1 - 0.4 b^1.737; at the roll switch P = -d initVelK min(b, initVelRatioMax)^log2(1 / reflectionBias) max(d . a, 0) (d the incoming horizontal direction, a M+0xf4: the post-move velocity of the stroke's first contact, the launch velocity before it; |P| 2.2399 / 4.9604 on the two chips); in the roll v += r P_plane dt, r = angleRatioCurve(the angle between P and the ball-to-cup direction, deg), P *= the surface's backSpinDecayTick. BackSpinK (0.1) and BackSpinInitVelBias (0.655) have no reader in the ball code."},"attrs":{"0":{"name":"Default","code":null,"block":"AttrDefault","reflectionH":0.5,"reflectionV":0.5,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"1":{"name":"Fairway","code":5,"block":"AttrFairway","reflectionH":0.6,"reflectionV":0.37,"friction":3.5,"backSpinResist":0.95,"backSpinDecayTick":0.98745035,"backSpinDecayFrom":"RAM, the pull-back's decay on the green (verdicts.json)","pass":false},"2":{"name":"Rough","code":6,"block":"AttrRough","reflectionH":0.53,"reflectionV":0.32,"friction":7,"backSpinResist":0.9,"backSpinDecayTick":0.9740037399747248,"backSpinDecayFrom":"R^(1/4) (the game's approximate pow not measured for this R)","pass":false},"3":{"name":"Bunker","code":7,"block":"AttrBunker","reflectionH":0.27,"reflectionV":0.1,"friction":10,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"4":{"name":"Water","code":8,"block":"AttrWater","reflectionH":0,"reflectionV":0,"friction":0.1,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":true},"5":{"name":"OB","code":10,"block":"AttrOB","reflectionH":0.4,"reflectionV":0.24,"friction":8,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"6":{"name":"Green","code":18,"block":"AttrGreen","reflectionH":0.5,"reflectionV":0.37,"friction":1.3,"backSpinResist":0.95,"backSpinDecayTick":0.98745035,"backSpinDecayFrom":"RAM, the pull-back's decay on the green (verdicts.json)","pass":false},"7":{"name":"Color","code":24,"block":"AttrColor","reflectionH":0.6,"reflectionV":0.37,"friction":2.6,"backSpinResist":0.94,"backSpinDecayTick":0.9846501765874599,"backSpinDecayFrom":"R^(1/4) (the game's approximate pow not measured for this R)","pass":false},"8":{"name":"Leaf","code":25,"block":"AttrLeaf","reflectionH":0.5,"reflectionV":0.5,"friction":0.03,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":true},"9":{"name":"Cupside","code":30,"block":"AttrCupside","reflectionH":0.999,"reflectionV":0.13,"friction":0,"backSpinResist":0.95,"backSpinDecayTick":0.98745035,"backSpinDecayFrom":"RAM, the pull-back's decay on the green (verdicts.json)","pass":false},"10":{"name":"Cup","code":31,"block":"AttrCup","reflectionH":0.5,"reflectionV":0,"friction":0.5,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"11":{"name":"Rock","code":32,"block":"AttrRock","reflectionH":0.5,"reflectionV":0.5,"friction":0.5,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"12":{"name":"Glass","code":34,"block":"AttrDefault","reflectionH":0.5,"reflectionV":0.5,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"13":{"name":"Tee","code":35,"block":"AttrDefault","reflectionH":0.5,"reflectionV":0.5,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"14":{"name":"SandOB","code":36,"block":"AttrSandOB","reflectionH":0.4,"reflectionV":0.1,"friction":7,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"15":{"name":"Tree","code":37,"block":"AttrTree","reflectionH":0.4,"reflectionV":0.1,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"16":{"name":"Flag","code":38,"block":"AttrDefault","reflectionH":0.5,"reflectionV":0.5,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":true},"17":{"name":"AirOB","code":39,"block":"AttrDefault","reflectionH":0.5,"reflectionV":0.5,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":true},"18":{"name":"Object","code":40,"block":"AttrObject","reflectionH":0.5,"reflectionV":0.5,"friction":0.05,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"19":{"name":"Pin","code":42,"block":"AttrPin","reflectionH":0.8,"reflectionV":0.4,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false},"20":{"name":"PalmLeaf","code":43,"block":"AttrPalmLeaf","reflectionH":0.5,"reflectionV":0.5,"friction":0.08,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":true},"21":{"name":"Barrier","code":44,"block":"AttrBarrier","reflectionH":0.3,"reflectionV":0.1,"friction":0,"backSpinResist":null,"backSpinDecayTick":1,"backSpinDecayFrom":"no BackSpinResist: no decay (assumed)","pass":false}},"codes":{"5":1,"6":2,"7":3,"8":4,"10":5,"18":6,"24":7,"25":8,"30":9,"31":10,"32":11,"34":12,"35":13,"36":14,"37":15,"38":16,"39":17,"40":18,"42":19,"43":20,"44":21},"passAttrs":[4,8,16,17,20],"clubs":{"WD1":{"index":0,"app":"driver","carryMaxYard":240,"loftDeg":10.5,"hopSpinRatio":3,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.25,"powerMin":0.08,"roughDiffDeg":8,"bunkerDiffDeg":20,"roughCurveMax":1.6,"bunkerCurveMax":1.2},"WD3":{"index":1,"app":"spoon","carryMaxYard":220,"loftDeg":12,"hopSpinRatio":3,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.25,"powerMin":0.08,"roughDiffDeg":8,"bunkerDiffDeg":20,"roughCurveMax":1.6,"bunkerCurveMax":1.2},"IR3":{"index":2,"app":"3iron","carryMaxYard":190,"loftDeg":25,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.5,"powerMin":0.08,"roughDiffDeg":4,"bunkerDiffDeg":12,"roughCurveMax":1.8,"bunkerCurveMax":1.4},"IR5":{"index":3,"app":"5iron","carryMaxYard":160,"loftDeg":28,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.5,"powerMin":0.08,"roughDiffDeg":4,"bunkerDiffDeg":12,"roughCurveMax":1.8,"bunkerCurveMax":1.4},"IR7":{"index":4,"app":"7iron","carryMaxYard":130,"loftDeg":29,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.5,"powerMin":0.08,"roughDiffDeg":4,"bunkerDiffDeg":12,"roughCurveMax":1.8,"bunkerCurveMax":1.4},"IR9":{"index":5,"app":"9iron","carryMaxYard":100,"loftDeg":34,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.5,"powerMin":0.08,"roughDiffDeg":4,"bunkerDiffDeg":12,"roughCurveMax":1.8,"bunkerCurveMax":1.4},"SW":{"index":6,"app":"wedge","carryMaxYard":55,"loftDeg":40,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":0.75,"bunkerRatio":0.75,"powerMin":0.08,"roughDiffDeg":2,"bunkerDiffDeg":8,"roughCurveMax":1.8,"bunkerCurveMax":1.6},"PT":{"index":7,"app":"putter","carryMaxYard":20,"loftDeg":1.14,"hopSpinRatio":1,"sideSpinRatio":1,"backSpinRatio":1,"roughRatio":1,"bunkerRatio":1,"powerMin":0.04,"roughDiffDeg":0,"bunkerDiffDeg":0,"roughCurveMax":2,"bunkerCurveMax":2}},"launch":{"keyClamp":[0.01,1.5],"powerMax":1,"powerOverMaxAdd":0.25,"powerOverMaxPT":1.5,"_note":"speed = launchTable[club][pct - 1], pct = (int)(100.0f * clamp(power, 0.01, 1.5)) in float32 (0xe10b08..0xe10b38); along the aim pitched up by loftDeg; hop = hopSpinRatio (not scaled by power); the lie only caps the power (rough roughRatio, bunker bunkerRatio), the speed is the table's at the capped power"},"launchTable":{"WD1":[7.8,10.4,12.4,14,15.5,16.7,17.8,18.8,19.8,20.7,21.5,22.3,23,23.8,24.4,25.1,25.7,26.3,26.9,27.5,28.1,28.6,29.1,29.7,30.2,30.7,31.2,31.6,32.1,32.6,33,33.4,33.9,34.3,34.7,35.2,35.6,36,36.4,36.8,37.2,37.6,38,38.4,38.8,39.1,39.5,39.9,40.3,40.6,41,41.4,41.7,42.1,42.4,42.8,43.1,43.5,43.9,44.2,44.6,44.9,45.2,45.6,45.9,46.3,46.6,47,47.3,47.6,48,48.3,48.6,49,49.3,49.7,50,50.3,50.7,51,51.3,51.7,52,52.3,52.6,53,53.3,53.6,54,54.3,54.6,55,55.3,55.6,56,56.3,56.6,57,57.3,57.6,57.9,58.3,58.6,58.9,59.3,59.6,59.9,60.3,60.6,61,61.3,61.6,62,62.3,62.6,63,63.3,63.6,64,64.3,64.7,65,65.3,65.7,66,66.4,66.7,67,67.4,67.7,68.1,68.4,68.8,69.1,69.5,69.8,70.1,70.5,70.8,71.2,71.5,71.9,72.2,72.6,72.9,73.3,73.7,74,74.4,74.7],"WD3":[7.2,9.5,11.4,12.9,14.2,15.3,16.4,17.4,18.3,19.1,19.9,20.6,21.3,22,22.7,23.3,23.9,24.5,25.1,25.6,26.2,26.7,27.2,27.7,28.2,28.7,29.1,29.6,30,30.5,30.9,31.3,31.7,32.2,32.6,33,33.4,33.8,34.2,34.6,34.9,35.3,35.7,36.1,36.4,36.8,37.2,37.5,37.9,38.2,38.6,38.9,39.3,39.6,40,40.3,40.7,41,41.3,41.7,42,42.3,42.7,43,43.3,43.7,44,44.3,44.6,44.9,45.3,45.6,45.9,46.2,46.5,46.9,47.2,47.5,47.8,48.1,48.5,48.8,49.1,49.4,49.7,50,50.3,50.6,51,51.3,51.6,51.9,52.2,52.5,52.8,53.2,53.5,53.8,54.1,54.4,54.7,55,55.3,55.7,56,56.3,56.6,56.9,57.2,57.5,57.8,58.2,58.5,58.8,59.1,59.4,59.7,60.1,60.4,60.7,61,61.3,61.6,62,62.3,62.6,62.9,63.2,63.5,63.9,64.2,64.5,64.8,65.2,65.5,65.8,66.1,66.4,66.8,67.1,67.4,67.7,68.1,68.4,68.7,69,69.4,69.7,70,70.4],"IR3":[5.2,7.1,8.6,9.9,11,12,13,13.9,14.8,15.6,16.3,17.1,17.8,18.5,19.1,19.8,20.4,21.1,21.7,22.2,22.8,23.4,23.9,24.5,25,25.5,26,26.5,27,27.5,28,28.5,29,29.5,29.9,30.4,30.8,31.3,31.7,32.2,32.6,33,33.5,33.9,34.3,34.7,35.1,35.5,36,36.4,36.8,37.2,37.6,37.9,38.3,38.7,39.1,39.5,39.9,40.3,40.6,41,41.4,41.8,42.1,42.5,42.9,43.2,43.6,43.9,44.3,44.7,45,45.4,45.7,46.1,46.4,46.8,47.1,47.5,47.8,48.2,48.5,48.9,49.2,49.5,49.9,50.2,50.5,50.9,51.2,51.5,51.9,52.2,52.5,52.9,53.2,53.5,53.9,54.2,54.5,54.8,55.2,55.5,55.8,56.1,56.4,56.7,57.1,57.4,57.7,58,58.3,58.7,59,59.3,59.6,59.9,60.2,60.5,60.9,61.2,61.5,61.8,62.1,62.4,62.7,63,63.3,63.6,63.9,64.2,64.5,64.9,65.2,65.5,65.8,66.1,66.4,66.7,67,67.3,67.6,67.9,68.2,68.5,68.8,69.1,69.4,69.7],"IR5":[4.7,6.3,7.6,8.8,9.8,10.7,11.6,12.4,13.1,13.8,14.5,15.2,15.8,16.4,17,17.6,18.2,18.7,19.2,19.8,20.3,20.8,21.3,21.8,22.2,22.7,23.2,23.6,24.1,24.5,24.9,25.4,25.8,26.2,26.6,27,27.4,27.8,28.2,28.6,29,29.4,29.8,30.2,30.5,30.9,31.3,31.6,32,32.4,32.7,33.1,33.4,33.8,34.1,34.5,34.8,35.2,35.5,35.9,36.2,36.5,36.9,37.2,37.5,37.8,38.2,38.5,38.8,39.1,39.5,39.8,40.1,40.4,40.7,41.1,41.4,41.7,42,42.3,42.6,42.9,43.2,43.5,43.8,44.1,44.4,44.7,45,45.3,45.6,45.9,46.2,46.5,46.8,47.1,47.4,47.7,48,48.3,48.6,48.8,49.1,49.4,49.7,50,50.3,50.6,50.8,51.1,51.4,51.7,52,52.2,52.5,52.8,53.1,53.4,53.7,53.9,54.2,54.5,54.8,55,55.3,55.6,55.9,56.1,56.4,56.7,56.9,57.2,57.5,57.8,58,58.3,58.6,58.8,59.1,59.4,59.7,59.9,60.2,60.4,60.7,61,61.2,61.5,61.8,62],"IR7":[4.2,5.7,6.9,7.9,8.8,9.6,10.3,11,11.7,12.3,13,13.5,14.1,14.6,15.2,15.7,16.2,16.7,17.1,17.6,18.1,18.5,18.9,19.4,19.8,20.2,20.6,21,21.4,21.8,22.2,22.5,22.9,23.3,23.6,24,24.4,24.7,25.1,25.4,25.7,26.1,26.4,26.8,27.1,27.4,27.7,28.1,28.4,28.7,29,29.3,29.6,29.9,30.2,30.5,30.8,31.1,31.4,31.7,32,32.3,32.6,32.9,33.2,33.5,33.8,34.1,34.3,34.6,34.9,35.2,35.5,35.7,36,36.3,36.5,36.8,37.1,37.4,37.6,37.9,38.2,38.4,38.7,38.9,39.2,39.5,39.7,40,40.2,40.5,40.7,41,41.3,41.5,41.8,42,42.3,42.5,42.8,43,43.3,43.5,43.8,44,44.3,44.5,44.8,45,45.2,45.5,45.7,46,46.2,46.4,46.7,46.9,47.2,47.4,47.6,47.9,48.1,48.3,48.6,48.8,49,49.3,49.5,49.8,50,50.2,50.4,50.7,50.9,51.2,51.4,51.6,51.8,52.1,52.3,52.5,52.7,53,53.2,53.4,53.7,53.9,54.1,54.3],"IR9":[3.7,4.9,5.9,6.7,7.4,8.1,8.8,9.4,9.9,10.4,11,11.5,11.9,12.4,12.8,13.3,13.7,14.1,14.5,14.9,15.3,15.7,16,16.4,16.8,17.1,17.4,17.8,18.1,18.4,18.8,19.1,19.4,19.7,20,20.3,20.6,20.9,21.2,21.5,21.8,22.1,22.4,22.7,23,23.2,23.5,23.8,24.1,24.3,24.6,24.9,25.1,25.4,25.7,25.9,26.2,26.4,26.7,26.9,27.2,27.4,27.7,27.9,28.2,28.4,28.7,28.9,29.1,29.4,29.6,29.8,30.1,30.3,30.5,30.8,31,31.2,31.5,31.7,31.9,32.1,32.4,32.6,32.8,33,33.3,33.5,33.7,33.9,34.1,34.4,34.6,34.8,35,35.2,35.4,35.7,35.9,36.1,36.3,36.5,36.7,36.9,37.1,37.4,37.6,37.8,38,38.2,38.4,38.6,38.8,39,39.2,39.4,39.6,39.8,40,40.2,40.4,40.6,40.8,41,41.2,41.4,41.6,41.8,42,42.2,42.4,42.6,42.8,43,43.2,43.4,43.6,43.8,44,44.2,44.4,44.6,44.8,45,45.1,45.3,45.5,45.7,45.9,46.1],"SW":[2.8,3.7,4.4,5,5.5,6,6.4,6.8,7.2,7.6,8,8.3,8.7,9,9.3,9.6,9.9,10.2,10.5,10.8,11,11.3,11.6,11.8,12.1,12.3,12.6,12.8,13.1,13.3,13.5,13.7,14,14.2,14.4,14.6,14.8,15.1,15.3,15.5,15.7,15.9,16.1,16.3,16.5,16.7,16.9,17.1,17.2,17.4,17.6,17.8,18,18.2,18.4,18.5,18.7,18.9,19.1,19.2,19.4,19.6,19.8,20,20.1,20.3,20.4,20.6,20.8,21,21.1,21.3,21.5,21.6,21.8,21.9,22.1,22.3,22.4,22.6,22.7,22.9,23,23.2,23.4,23.5,23.7,23.8,24,24.1,24.3,24.4,24.6,24.7,24.9,25,25.2,25.3,25.5,25.6,25.8,25.9,26.1,26.2,26.3,26.5,26.6,26.8,26.9,27.1,27.2,27.3,27.5,27.6,27.8,27.9,28,28.2,28.3,28.5,28.6,28.7,28.9,29,29.1,29.3,29.4,29.5,29.7,29.8,30,30.1,30.2,30.4,30.5,30.6,30.7,30.9,31,31.1,31.3,31.4,31.5,31.7,31.8,31.9,32.1,32.2,32.3,32.4],"PT":[0.7,1.02,1.26,1.46,1.64,1.8,1.96,2.1,2.24,2.36,2.48,2.6,2.72,2.84,2.94,3.06,3.16,3.26,3.36,3.46,3.56,3.64,3.74,3.82,3.92,4,4.08,4.16,4.26,4.34,4.42,4.5,4.58,4.66,4.74,4.82,4.88,4.96,5.04,5.12,5.18,5.26,5.34,5.4,5.48,5.54,5.62,5.68,5.74,5.82,5.88,5.96,6.02,6.08,6.14,6.22,6.28,6.34,6.4,6.46,6.54,6.6,6.66,6.72,6.78,6.84,6.9,6.96,7,7.06,7.12,7.18,7.24,7.28,7.34,7.4,7.44,7.5,7.54,7.6,7.64,7.7,7.74,7.8,7.84,7.88,7.94,7.98,8.02,8.08,8.12,8.16,8.2,8.26,8.3,8.34,8.38,8.42,8.48,8.52,8.56,8.6,8.64,8.68,8.72,8.76,8.8,8.86,8.9,8.94,8.98,9.02,9.06,9.1,9.14,9.18,9.22,9.26,9.3,9.34,9.38,9.42,9.46,9.5,9.54,9.58,9.62,9.66,9.7,9.74,9.78,9.82,9.86,9.9,9.94,9.98,10.02,10.06,10.1,10.14,10.16,10.2,10.24,10.28,10.32,10.36,10.4,10.44,10.48,10.52]},"cup":{"_note":"the median NSS cup over the 126 of the collision dump, relative to its bone (GolfCourseNNholeK, the cup bottom): a 20-sided hole: the rim (Cupside) on the green at rimRadiusM, depthM above the bone (the rim follows the green's slope: depthRangeM); a bevel (Cupside) bevelM down and in to the wall's top at wallRadiusM; the wall (Cupside) straight down to the flat Cup bottom (bottomRadiusM) at bottomM above the bone. src/nsssim.js cupMesh cuts it into a height field.","cups":126,"rimRadiusM":0.1931,"depthM":0.3098,"bevelM":0.043,"wallRadiusM":0.15,"bottomRadiusM":0.15,"bottomM":-0.0002,"rimRadiusRangeM":[0.1889,0.1955],"depthRangeM":[0.2988,0.3381]},"wind":{"hudMphPerS":2.237,"hudMph":[0,2,4,6,9,11,13,15,17,20,22,24,26,29,31,33],"_note":"the HUD's mph for each whole s (m/s, 0..15) of the wind object. Against RAM's s on the RAM player's address frames (tools/harness/state/eden/lab/rplay/frames, rounds 2 and 3 of 2026-10-25): 1 -> 2 (h11, h15), 2 -> 4 (h06, h09), 4 -> 9 (h07, h10, h12), 5 -> 11 (h13), 6 -> 13 (h08), 7 -> 15 (h14, r3 h04), 8 -> 17 (h05), 9 -> 20 (h16), 15 -> 33 (h18); flights.md 5.9's round adds 3 -> 6 and 10 -> 22; 26 mph showed (pink) on a round with no RAM read. Every value is floor(2.237 s + d) with 0.052 < d < 0.104 (2.237: the converter at 0x1bf21fc; the text box's rounding is not traced); floor(2.25 s) gives 18 for s 8 and 27 for 12, floor(2.237 s) 8 for 4. s 11..14 (24, 26, 29, 31) are the rule's, 26 seen without its s."},"flag":{"unitM":0.001953125,"verts512":[[-4,1534,-13],[-11,1534,-8],[-2,1541,-6],[-14,1534,0],[-5,1541,-4],[11,0,8],[4,0,13],[0,0,0],[14,0,0],[-4,1534,13],[-5,1541,4],[-11,1534,8],[-6,1541,0],[11,1534,8],[2,1541,6],[4,1534,13],[-4,0,13],[14,1534,0],[11,1534,-8],[6,1541,0],[4,1534,-13],[5,1541,-4],[5,1541,4],[0,1525,-516],[0,1525,0],[0,969,0],[0,969,-516],[-4,0,-13],[4,0,-13],[-11,0,-8],[-14,0,0],[11,0,-8],[-11,0,8]],"tris":[[0,1,2],[1,3,4],[5,6,7],[5,7,8],[9,10,11],[12,3,11],[13,14,15],[6,15,9],[6,9,16],[17,18,19],[18,20,21],[17,22,13],[8,17,13],[8,13,5],[5,13,15],[5,15,6],[23,24,25],[23,25,26],[27,0,20],[27,20,28],[29,27,7],[29,7,30],[0,27,29],[0,29,1],[1,29,30],[1,30,3],[28,7,27],[7,28,31],[7,31,8],[18,31,28],[18,28,20],[31,18,17],[31,17,8],[7,16,32],[7,32,30],[6,16,7],[16,9,11],[16,11,32],[32,11,3],[32,3,30]],"clothTris":[16,17],"source":{"file":"RomFS Pack/Actor/Object_BGOBJ_GlfPin.pack.zs: Phive/Shape/Dcc/BGOBJ_GlfPin_Anim_col.Nin_NX_NVN.bphsh","packSha1":"bd2fd36868122d155052b6948cb3197ccf4d4e0b","shapeSha1":"f2badbd1ab9888501e8065f52e6e0e9a9bbfa67d"},"_note":"the pole: one face acts a tick, the nearest one the incoming velocity approaches (at a vertical edge both faces are as near and the game's choice is not decoded: src/nsssim.js run's poleTie); a shot meeting it is set at the face's closest point to the end of the move, out along the face normal by contactRadiusM + softLiftM, and bounces as the Pin (soft) surface; the cloth zeroes v (not u) once (M+0x103, 0xd39b8c..0xd39ca8). Present for every stroke but the putter's from the green (31 recorded putts, 19 through the pole's place, met nothing; why is not decoded)"}};
// </nss-physics>

const P = PHYSICS;
const T = P.tick, A = P.air, G = P.ground, B = P.backspin;
export const DT = T.dt;
export const N_SUB = T.substeps;
export const BALL_R = P.ball.contactRadiusM;
export const M_PER_YD = 0.9144;
const DEG = Math.PI / 180;

// clubs: the game's names in its own order (club index 0..7), and the app's ids
export const CLUBS = Object.freeze(Object.keys(P.clubs).sort((a, b) => P.clubs[a].index - P.clubs[b].index));
const APP_ID = {};
for (const k of CLUBS) APP_ID[P.clubs[k].app] = k;
// "WD1" | "driver" -> "WD1"
export function clubOf(id) {
  if (P.clubs[id]) return id;
  if (APP_ID[id]) return APP_ID[id];
  throw new Error(`nsssim: unknown club ${id}`);
}

// collision surface code (tools/lib/nsscol.mjs NSS_CODES) -> the ball's
// attribute id (0xd40644's jump table; the codes in their sorted order are
// attributes 1..21)
export const ATTR_OF_CODE = Object.freeze(Object.fromEntries(Object.entries(P.codes).map(([c, a]) => [+c, a])));
export const ATTR = Object.freeze({
  default: 0, fairway: 1, rough: 2, bunker: 3, water: 4, ob: 5, green: 6, fringe: 7, leaf: 8, cupside: 9, cup: 10,
  rock: 11, glass: 12, tee: 13, sandOb: 14, tree: 15, flag: 16, airOb: 17, object: 18, pin: 19, palmLeaf: 20, barrier: 21,
});
const LIE_ATTR = { tee: 1, fairway: 1, rough: 2, bunker: 3, green: 6, fringe: 7, color: 7 };
// the surfaces a ball passes through (0xd39094: the mask 0x130110); they never
// block the move and are reported as the tick's secondary contact (M+0xa8)
const PASS = new Uint8Array(32);
for (const a of P.passAttrs) PASS[a] = 1;
// the soft surfaces (tools/nss-physics.json ground.softAttrs): a shot's contact with one
// leaves the ball softLiftM farther from the face than r and turns it back at
// softRestitution
const SOFT = new Uint8Array(32);
for (const a of P.ground.softAttrs) SOFT[a] = 1;
// per attribute: ReflectionH, ReflectionV, Friction, the backspin's per-tick decay
const RH = new Float64Array(32), RV = new Float64Array(32), FR = new Float64Array(32), BSD = new Float64Array(32);
for (let a = 0; a < 32; a++) {
  const t = P.attrs[a] ?? P.attrs[0];
  RH[a] = t.reflectionH; RV[a] = t.reflectionV; FR[a] = t.friction; BSD[a] = t.backSpinDecayTick;
}

// Linear2D / Hermit2D curves as the game evaluates them (0x2277d70: a cubic
// Hermite whose slopes are not scaled by the interval); x below the first point
// reads its y, past the last the last y
function curveAt(c, x) {
  const p = c.points;
  if (x <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const [x0, y0, m0 = 0] = p[i - 1], [x1, y1, m1 = 0] = p[i];
      const t = (x - x0) / (x1 - x0);
      if (c.type === "Linear2D") return y0 + (y1 - y0) * t;
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    }
  }
  return p[p.length - 1][1];
}
export { curveAt };

// ---------------------------------------------------------------- launch

const f32 = Math.fround;
// the table key's percent as the game computes it (0xe10b08..0xe10b38):
// (int)(100.0f * clamp(power, 0.01, 1.5)) in float32
export function pctOf(power) {
  const p = f32(Math.min(Math.max(f32(power), f32(P.launch.keyClamp[0])), f32(P.launch.keyClamp[1])));
  return Math.trunc(f32(f32(100) * p));
}
// GolfShotVelTable["Power<pct>___<club>"], m/s
export function launchSpeed(club, power) {
  const c = clubOf(club);
  return P.launchTable[c][pctOf(power) - 1];
}
// the gauge's cap on a lie: rough RoughRatio, bunker BunkerRatio (the lies only
// cap the power: the speed is the fairway table's at the capped power, flights.md 4);
// the putter's is its PowerMax, PowerOverMaxPT 1.5 on every lie (0xe10fdc; its
// lie ratios are 1, so Shot Assist cuts a putt at 1.0: swing-power.md 1, 6.1)
export function capFor(club, lie) {
  const c = P.clubs[clubOf(club)];
  if (clubOf(club) === "PT") return P.launch.powerOverMaxPT;
  const a = typeof lie === "number" ? lie : LIE_ATTR[lie] ?? 1;
  if (a === 2) return c.roughRatio;
  if (a === 3) return c.bunkerRatio;
  return P.launch.powerMax;
}
// the launch velocity: speed along the heading (deg, N-up: (sin, 0, -cos) in
// x, z), pitched up by the club's LoftDeg
export function launchVelocity(club, power, headingDeg) {
  const c = P.clubs[clubOf(club)];
  const s = launchSpeed(club, power), L = c.loftDeg * DEG, h = headingDeg * DEG;
  return [s * Math.cos(L) * Math.sin(h), s * Math.sin(L), -s * Math.cos(L) * Math.cos(h)];
}

// ---------------------------------------------------------------- wind

// { s, dirRad } (the wind object: speed 0..15, the air moves along (sin a, 0, cos a))
// or { x, z } (the air's velocity, m/s) -> { x, z } at full strength, or null
export function windVector(w) {
  if (!w) return null;
  if (w.x != null || w.z != null) {
    const x = w.x ?? 0, z = w.z ?? 0;
    return x || z ? { x, z } : null;
  }
  const s = w.s ?? 0;
  if (!(s > 0)) return null;
  const m = A.windVelMax * Math.pow(s / A.windVelMax, Math.log2(1 / A.windBias));   // = s (WindBias 0.5)
  const a = w.dirRad ?? 0;
  return { x: m * Math.sin(a), z: m * Math.cos(a) };
}
// The HUD's wind. NSS's wind object holds a whole s (m/s, 0..15) and the HUD shows
// HUD_MPH[s] mph (tools/nss-physics.json wind: RAM's s against the HUD's own text on the
// RAM player's frames, 1 -> 2 ... 8 -> 17, 9 -> 20, 15 -> 33; the rest floor(2.237 s + d),
// 0.052 < d < 0.104, the one rule that gives every value seen; floor(2.25 s), the earlier
// reading, shows 18 for 8 and 27 for 12)
export const HUD_MPH = Object.freeze(P.wind.hudMph.slice());
// s (m/s) -> the HUD's mph
export function hudMphOf(s) {
  return HUD_MPH[Math.min(HUD_MPH.length - 1, Math.max(0, Math.round(s)))];
}
// the HUD's mph -> the wind object's s: the whole s whose HUD value is nearest (each HUD
// value gives its own s, and so does the RAM reader's 2.237 s; a value the HUD never
// shows, as 8 or 18, the nearer neighbour, ties the lower; any wind at all is s >= 1)
export function windSpeedFromHud(mph) {
  if (!(mph > 0)) return 0;
  let best = 1;
  for (let s = 2; s < HUD_MPH.length; s++) if (Math.abs(HUD_MPH[s] - mph) < Math.abs(HUD_MPH[best] - mph)) best = s;
  return best;
}
// the minimap's wind (mph, the bearing it blows toward, deg N-up) -> { x, z } (m/s), or null
export function windFromHud(mph, towardDeg) {
  const s = windSpeedFromHud(mph);
  if (!(s > 0)) return null;
  const t = towardDeg * DEG;
  return { x: s * Math.sin(t), z: -s * Math.cos(t) };
}

// ---------------------------------------------------------------- geometry

// a ball within r + CLEAR_M of a triangle at the start of a move is touching it (a
// push-out leaves it at r to rounding): only the end of the move can make it a contact
const CLEAR_M = 1e-6;
// two overlaps whose distances differ by less than this are one (a shared edge or corner)
const TIE_DIST_M = 1e-7;

// The earliest touch, at t in [0, tmax], of the sphere (radius r) swept from o
// by D against the triangle abc (unit face normal f); -1 when none. Writes the
// touch's normal (from the touched point toward the centre) into out.n and the
// point into out.q. Two-sided: the side the centre starts on. A sphere already
// within r of the triangle and moving into it touches at t = 0. No feature of
// the triangle can be touched before its plane is, so a plane touch after tmax
// ends the test.
function sweepTri(ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, ox, oy, oz, Dx, Dy, Dz, r, tmax, out) {
  const d0 = (ox - ax) * fx + (oy - ay) * fy + (oz - az) * fz;
  const dd = Dx * fx + Dy * fy + Dz * fz;
  const s = d0 >= 0 ? 1 : -1, sd0 = s * d0, sdd = s * dd;
  if (sdd >= 0 && sd0 >= r) return -1;
  if (sdd < 0) {
    let t = (sd0 - r) / -sdd;
    if (t < 0) t = 0;
    if (t > tmax) return -1;
    const h = sd0 + sdd * t;   // the centre's distance from the plane at t
    const qx = ox + Dx * t - s * fx * h, qy = oy + Dy * t - s * fy * h, qz = oz + Dz * t - s * fz * h;
    if (inTri(ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, qx, qy, qz)) {
      out.n[0] = s * fx; out.n[1] = s * fy; out.n[2] = s * fz; out.q[0] = qx; out.q[1] = qy; out.q[2] = qz;
      return t;
    }
  }
  let best = -1, lim = tmax;
  let t = capsule(ax, ay, az, bx, by, bz, ox, oy, oz, Dx, Dy, Dz, r, lim, out);
  if (t >= 0) { best = t; lim = t; }
  t = capsule(bx, by, bz, cx, cy, cz, ox, oy, oz, Dx, Dy, Dz, r, lim, out);
  if (t >= 0) { best = t; lim = t; }
  t = capsule(cx, cy, cz, ax, ay, az, ox, oy, oz, Dx, Dy, Dz, r, lim, out);
  if (t >= 0) best = t;
  return best;
}

// is p (on the plane) inside the triangle (edges included, to 1e-12)?
function inTri(ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, px, py, pz) {
  const e = -1e-12;
  const c0 = ((by - ay) * (pz - az) - (bz - az) * (py - ay)) * fx + ((bz - az) * (px - ax) - (bx - ax) * (pz - az)) * fy + ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * fz;
  if (c0 < e) return false;
  const c1 = ((cy - by) * (pz - bz) - (cz - bz) * (py - by)) * fx + ((cz - bz) * (px - bx) - (cx - bx) * (pz - bz)) * fy + ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * fz;
  if (c1 < e) return false;
  const c2 = ((ay - cy) * (pz - cz) - (az - cz) * (py - cy)) * fx + ((az - cz) * (px - cx) - (ax - cx) * (pz - cz)) * fy + ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * fz;
  return c2 >= e;
}

// the swept sphere against the capsule of the segment ab (its side, then the
// end point a; b is the next edge's a): the earliest approaching touch at t in
// [0, tmax], or -1
function capsule(ax, ay, az, bx, by, bz, ox, oy, oz, Dx, Dy, Dz, r, tmax, out) {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const wx = ox - ax, wy = oy - ay, wz = oz - az;
  const ee = ex * ex + ey * ey + ez * ez;
  if (!(ee > 0)) return -1;
  const ed = ex * Dx + ey * Dy + ez * Dz, ew = ex * wx + ey * wy + ez * wz;
  const dd = Dx * Dx + Dy * Dy + Dz * Dz, wd = wx * Dx + wy * Dy + wz * Dz, ww = wx * wx + wy * wy + wz * wz;
  let best = -1, lim = tmax;
  // the side: |w + tD - ((ew + t ed) / ee) e| = r
  const qa = ee * dd - ed * ed, qb = ee * wd - ed * ew, qc = ee * ww - ew * ew - r * r * ee;
  if (qa > 1e-30 && qb < 0) {
    let t = -1;
    if (qc <= 0) t = 0;
    else { const disc = qb * qb - qa * qc; if (disc >= 0) t = (-qb - Math.sqrt(disc)) / qa; }
    if (t >= 0 && t <= lim) {
      const sa = (ew + t * ed) / ee;
      if (sa >= 0 && sa <= 1 && touchNormal(out, ox + Dx * t, oy + Dy * t, oz + Dz * t, ax + ex * sa, ay + ey * sa, az + ez * sa)) { best = t; lim = t; }
    }
  }
  // the end point a: |w + tD| = r
  if (dd > 1e-30 && wd < 0) {
    let t = -1;
    const c = ww - r * r;
    if (c <= 0) t = 0;
    else { const disc = wd * wd - dd * c; if (disc >= 0) t = (-wd - Math.sqrt(disc)) / dd; }
    if (t >= 0 && t < lim && touchNormal(out, ox + Dx * t, oy + Dy * t, oz + Dz * t, ax, ay, az)) best = t;
  }
  return best;
}

function touchNormal(out, cx, cy, cz, qx, qy, qz) {
  const nx = cx - qx, ny = cy - qy, nz = cz - qz;
  const m = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!(m > 1e-12)) return false;
  out.n[0] = nx / m; out.n[1] = ny / m; out.n[2] = nz / m; out.q[0] = qx; out.q[1] = qy; out.q[2] = qz;
  return true;
}

// the point of triangle abc closest to p (Ericson, Real-Time Collision Detection 5.1.5)
function closestOnTri(ax, ay, az, bx, by, bz, cx, cy, cz, px, py, pz, q) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { q[0] = ax; q[1] = ay; q[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { q[0] = bx; q[1] = by; q[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q[0] = ax + abx * v; q[1] = ay + aby * v; q[2] = az + abz * v; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { q[0] = cx; q[1] = cy; q[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q[0] = ax + acx * w; q[1] = ay + acy * w; q[2] = az + acz * w; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    q[0] = bx + (cx - bx) * w; q[1] = by + (cy - by) * w; q[2] = bz + (cz - bz) * w; return;
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  q[0] = ax + abx * v + acx * w; q[1] = ay + aby * v + acy * w; q[2] = az + abz * v + acz * w;
}

// the squared distance between the segments p0p1 and q0q1 (Ericson 5.1.9)
function segSegDist2(p0, p1, q0, q1) {
  const d1x = p1[0] - p0[0], d1y = p1[1] - p0[1], d1z = p1[2] - p0[2], d2x = q1[0] - q0[0], d2y = q1[1] - q0[1], d2z = q1[2] - q0[2];
  const rx = p0[0] - q0[0], ry = p0[1] - q0[1], rz = p0[2] - q0[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-18 && e <= 1e-18) { s = 0; t = 0; }
  else if (a <= 1e-18) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-18) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
  return x * x + y * y + z * z;
}
// the squared distance between the segment o..e and the triangle abc (unit face normal f)
const _cq = [0, 0, 0], _A = [0, 0, 0], _B = [0, 0, 0], _C = [0, 0, 0];
function segTriDist2(ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, o, e) {
  const d0 = (o[0] - ax) * fx + (o[1] - ay) * fy + (o[2] - az) * fz, d1 = (e[0] - ax) * fx + (e[1] - ay) * fy + (e[2] - az) * fz;
  if ((d0 > 0) !== (d1 > 0)) {
    const t = d0 / (d0 - d1);
    if (inTri(ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, o[0] + (e[0] - o[0]) * t, o[1] + (e[1] - o[1]) * t, o[2] + (e[2] - o[2]) * t)) return 0;
  }
  let best = Infinity;
  for (const p of [o, e]) {
    closestOnTri(ax, ay, az, bx, by, bz, cx, cy, cz, p[0], p[1], p[2], _cq);
    const x = p[0] - _cq[0], y = p[1] - _cq[1], z = p[2] - _cq[2];
    if (x * x + y * y + z * z < best) best = x * x + y * y + z * z;
  }
  _A[0] = ax; _A[1] = ay; _A[2] = az; _B[0] = bx; _B[1] = by; _B[2] = bz; _C[0] = cx; _C[1] = cy; _C[2] = cz;
  return Math.min(best, segSegDist2(o, e, _A, _B), segSegDist2(o, e, _B, _C), segSegDist2(o, e, _C, _A));
}

// A triangle mesh as the ball's ground: { verts: Float32Array | Float64Array
// [V * 3] (NSS metres), tris: Uint32Array [T * 3], attr: Uint8Array [T] (the
// ball's attribute ids: ATTR_OF_CODE of the collision codes) }, gridded over x/z
// (cell m). contacts(o, e, r): the solid triangles a move from o to e meets;
// pass(o, D, r): the pass-through ones (PASS) a step crosses; leafTouch(o, D, r): the Leaf
// triangles the step's sphere touches (the canopy counter's contacts; only on a mesh with
// Leaf triangles); faceNormal(t). skip(t) drops triangle t (the active cup's cover);
// closest: contacts also carry q, the triangle's point closest to the end of the move (the
// flagstick's ground: a shot meeting the pole is set there). Pure;
// tools/test-nsssim.mjs builds it from tools/lib/nsscol.mjs's loadCollision and
// from the fixture's triangle subsets.
export function meshGround({ verts, tris, attr }, { cell = 2, skip = null, closest = false } = {}) {
  const nt = attr.length;
  const V = verts, Tr = tris;
  const fn = new Float64Array(nt * 3), box = new Float64Array(nt * 6);
  const keep = new Uint8Array(nt);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, hasLeaf = false;
  for (let t = 0; t < nt; t++) {
    if (skip && skip(t)) continue;
    if (attr[t] === ATTR.leaf) hasLeaf = true;
    const a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    const wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const m = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(m > 1e-14)) continue;   // zero area
    keep[t] = 1;
    fn[t * 3] = nx / m; fn[t * 3 + 1] = ny / m; fn[t * 3 + 2] = nz / m;
    const bx0 = Math.min(V[a], V[b], V[c]), by0 = Math.min(V[a + 1], V[b + 1], V[c + 1]), bz0 = Math.min(V[a + 2], V[b + 2], V[c + 2]);
    const bx1 = Math.max(V[a], V[b], V[c]), by1 = Math.max(V[a + 1], V[b + 1], V[c + 1]), bz1 = Math.max(V[a + 2], V[b + 2], V[c + 2]);
    box[t * 6] = bx0; box[t * 6 + 1] = by0; box[t * 6 + 2] = bz0; box[t * 6 + 3] = bx1; box[t * 6 + 4] = by1; box[t * 6 + 5] = bz1;
    if (bx0 < x0) x0 = bx0; if (bz0 < z0) z0 = bz0; if (bx1 > x1) x1 = bx1; if (bz1 > z1) z1 = bz1;
  }
  if (!(x1 >= x0)) { x0 = z0 = 0; x1 = z1 = 1; }
  const nx = Math.min(2048, Math.max(1, Math.ceil((x1 - x0) / cell))), nz = Math.min(2048, Math.max(1, Math.ceil((z1 - z0) / cell)));
  const cx = (x1 - x0) / nx || cell, cz = (z1 - z0) / nz || cell;
  const spanOf = (t) => [
    Math.max(0, Math.floor((box[t * 6] - x0) / cx)), Math.min(nx - 1, Math.floor((box[t * 6 + 3] - x0) / cx)),
    Math.max(0, Math.floor((box[t * 6 + 2] - z0) / cz)), Math.min(nz - 1, Math.floor((box[t * 6 + 5] - z0) / cz)),
  ];
  // a triangle over more than 1024 cells (H3's 16 km sea) is tested on every query
  const big = [];
  const count = new Uint32Array(nx * nz + 1);
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    const [i0, i1, j0, j1] = spanOf(t);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 1024) { big.push(t); keep[t] = 2; continue; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * nx + i + 1]++;
  }
  for (let k = 1; k <= nx * nz; k++) count[k] += count[k - 1];
  const items = new Uint32Array(count[nx * nz]);
  const fill = count.slice(0, nx * nz);
  for (let t = 0; t < nt; t++) {
    if (keep[t] !== 1) continue;
    const [i0, i1, j0, j1] = spanOf(t);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * nx + i]++] = t;
  }
  const stamp = new Uint32Array(nt);
  let gen = 0;
  const cand = [];
  // the last query (pass and leafTouch ask for the same step: one candidate list)
  let mox = NaN, moy = NaN, moz = NaN, mex = NaN, mey = NaN, mez = NaN, mr = NaN;
  // the triangles whose boxes, grown by r, meet the box of the step, by index
  function candidates(ox, oy, oz, ex, ey, ez, r) {
    if (ox === mox && oy === moy && oz === moz && ex === mex && ey === mey && ez === mez && r === mr) return cand;
    mox = ox; moy = oy; moz = oz; mex = ex; mey = ey; mez = ez; mr = r;
    if (++gen === 0xffffffff) { stamp.fill(0); gen = 1; }
    cand.length = 0;
    const bx0 = Math.min(ox, ex) - r, bx1 = Math.max(ox, ex) + r, by0 = Math.min(oy, ey) - r, by1 = Math.max(oy, ey) + r;
    const bz0 = Math.min(oz, ez) - r, bz1 = Math.max(oz, ez) + r;
    const test = (t) => {
      if (stamp[t] === gen) return;
      stamp[t] = gen;
      if (box[t * 6] > bx1 || box[t * 6 + 3] < bx0 || box[t * 6 + 1] > by1 || box[t * 6 + 4] < by0 || box[t * 6 + 2] > bz1 || box[t * 6 + 5] < bz0) return;
      cand.push(t);
    };
    if (bx1 >= x0 && bx0 <= x1 && bz1 >= z0 && bz0 <= z1) {
      const i0 = Math.max(0, Math.floor((bx0 - x0) / cx)), i1 = Math.min(nx - 1, Math.floor((bx1 - x0) / cx));
      const j0 = Math.max(0, Math.floor((bz0 - z0) / cz)), j1 = Math.min(nz - 1, Math.floor((bz1 - z0) / cz));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let p = count[j * nx + i], e = count[j * nx + i + 1]; p < e; p++) test(items[p]);
    }
    for (let k = 0; k < big.length; k++) test(big[k]);
    cand.sort((p, q) => p - q);   // a fixed order: ties go to the lower triangle index
    return cand;
  }
  const buf = { n: [0, 1, 0], q: [0, 0, 0] };
  const tsweep = (t, o, D, r, tmax) => {
    const a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
    return sweepTri(V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2], fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2], o[0], o[1], o[2], D[0], D[1], D[2], r, tmax, buf);
  };
  const q = [0, 0, 0];
  return {
    kind: "mesh",
    // The solid triangles the move of the centre from o to e meets: the ones the sphere
    // (radius r) overlaps at e (its face, an edge or a corner), and the ones the swept
    // sphere touches on the way coming from clear of them (farther than r + CLEAR_M at
    // o), each reported with its own face normal on o's side and e's distance from that
    // plane, and its true distance from e (Infinity when only touched on the way):
    // [{ tri, n, d, dist, attr, q (closest: the point at e) }]. In a shot run() lets them act
    // deepest first (dist, ties to the deeper plane, the touched-only last), each while the
    // velocity still approaches it, and takes the one the incoming velocity meets most
    // head-on as the tick's contact; in a roll only the deepest acts (run, mode 2).
    // The rules, all from the recordings: NSS reports a face's normal for every contact
    // (8,343 of the 8,368 distinct contact records carry a triangle's exact face normal;
    // the rest are the flagstick and the leaf volumes); h14s3's landing was pushed out
    // along the face under it and bounced off the neighbour whose edge it overlapped, at
    // the recorded normal speed 13.126 m/s against the face's 13.071; h15s2's bounced off
    // a neighbour the sweep touched, 0.0557 m from the end of the move; h12s5's was
    // pushed out along the face under it, not the neighbour whose plane it was deeper
    // behind (its closest point an edge); h17s1's roll, at a corner two faces share,
    // went with the one it was moving into; h05s1's bunker bounce took the face it was
    // pushed out of, the faster-approaching neighbour turning away once the 0.3
    // restitution had acted; and a rolling ball touching a face at the start of a move
    // that carries it off over a convex edge makes no contact with that face (h06s3: two
    // ticks in the air past the putt's first ridge; the game counts the face on about
    // half such ticks, see the header).
    contacts(o, e, r) {
      const list = candidates(o[0], o[1], o[2], e[0], e[1], e[2], r);
      const out = [];
      const D = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (PASS[attr[t]]) continue;
        const a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
        closestOnTri(V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2], e[0], e[1], e[2], q);
        let qx = e[0] - q[0], qy = e[1] - q[1], qz = e[2] - q[2];
        let dist = Math.sqrt(qx * qx + qy * qy + qz * qz);
        const cq = closest ? [q[0], q[1], q[2]] : null;   // the closest point at e
        // closest (the flagstick): the swept sphere's first touch of the face along the move (t in [0, 1], -1 when
        // none) and the side it touches from (the touch normal against the face normal)
        let tt = -1, tn = 0;
        if (closest) { tt = tsweep(t, o, D, r, 1); if (tt >= 0) tn = buf.n[0] * fn[t * 3] + buf.n[1] * fn[t * 3 + 1] + buf.n[2] * fn[t * 3 + 2]; }
        if (!(dist < r)) {
          closestOnTri(V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2], o[0], o[1], o[2], q);
          qx = o[0] - q[0]; qy = o[1] - q[1]; qz = o[2] - q[2];
          if (qx * qx + qy * qy + qz * qz < (r + CLEAR_M) * (r + CLEAR_M)) continue;
          if ((closest ? tt : tsweep(t, o, D, r, 1)) < 0) continue;
          dist = Infinity;   // touched on the way only
        }
        const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
        const d0 = (o[0] - V[a]) * fx + (o[1] - V[a + 1]) * fy + (o[2] - V[a + 2]) * fz;
        const d1 = (e[0] - V[a]) * fx + (e[1] - V[a + 1]) * fy + (e[2] - V[a + 2]) * fz;
        // the normal on o's side of the face's plane; on the flagstick the side the sweep touches it from (a fast
        // ball's move can end past the pole's axis, where o is behind the far faces' planes: oriented by o they
        // point inward and look approached)
        const sg = tt >= 0 ? (tn >= 0 ? 1 : -1) : d0 >= 0 ? 1 : -1;
        const ct = { tri: t, n: [sg * fx, sg * fy, sg * fz], d: sg * d1, dist, attr: attr[t] };
        if (cq) { ct.q = cq; ct.t = tt; }
        out.push(ct);
      }
      return out;
    },
    // the pass-through faces the step from o by D comes within r of (as contacts, the
    // face's region: the centre's foot inside it where the step is nearest the plane,
    // or crosses it): [{ t, n (the face normal), q (the foot), attr, tri }] by t
    pass(o, D, r) {
      const list = candidates(o[0], o[1], o[2], o[0] + D[0], o[1] + D[1], o[2] + D[2], r);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!PASS[attr[t]]) continue;
        const a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
        const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
        const d0 = (o[0] - V[a]) * fx + (o[1] - V[a + 1]) * fy + (o[2] - V[a + 2]) * fz;
        const d1 = d0 + D[0] * fx + D[1] * fy + D[2] * fz;
        if ((d0 >= r && d1 >= r) || (d0 <= -r && d1 <= -r)) continue;
        const tt = (d0 > 0) !== (d1 > 0) ? d0 / (d0 - d1) : Math.abs(d1) < Math.abs(d0) ? 1 : 0;
        const dt = d0 + (d1 - d0) * tt;
        const qx = o[0] + D[0] * tt - fx * dt, qy = o[1] + D[1] * tt - fy * dt, qz = o[2] + D[2] * tt - fz * dt;
        if (!inTri(V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2], fx, fy, fz, qx, qy, qz)) continue;
        out.push({ t: tt, n: [fx, fy, fz], q: [qx, qy, qz], attr: attr[t], tri: t });
      }
      out.sort((p, q) => p.t - q.t || p.tri - q.tri);
      return out;
    },
    // the Leaf triangles the sphere (radius r) touches anywhere on the step from o by D (the step's segment within
    // r of the triangle: its face, an edge or a corner), by index: [{ tri, n (the face normal) }]: the canopy
    // counter's contacts (fitted, not decoded: Havok's leaf contact set; on the recorded canopies the counter they
    // give is the game's M+0xdc at every sample of 5 of the 11 canopy strokes and the damping on 10)
    leafTouch: hasLeaf ? (o, D, r) => {
      const e = [o[0] + D[0], o[1] + D[1], o[2] + D[2]];
      const list = candidates(o[0], o[1], o[2], e[0], e[1], e[2], r);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (attr[t] !== ATTR.leaf) continue;
        const a = Tr[t * 3] * 3, b = Tr[t * 3 + 1] * 3, c = Tr[t * 3 + 2] * 3;
        if (segTriDist2(V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2], fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2], o, e) < r * r)
          out.push({ tri: t, n: [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]] });
      }
      return out;
    } : null,
    faceNormal: (t) => [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]],
    triangles: nt,
  };
}
// the order the move's contacts act in: the deepest first (the smallest true distance;
// at a tie, a shared edge or corner, the deeper plane), the ones only touched on the way last
const deepestFirst = (p, q) => (Math.abs(p.dist - q.dist) <= TIE_DIST_M || (p.dist === Infinity && q.dist === Infinity) ? p.d - q.d : p.dist - q.dist);
// the roll's one contact: the deepest; at a tie (a shared edge or corner) the one that is not Cupside (the green
// at the rim: 223 of the 311 rim ties of the putter assist's ghost paths), then the deeper plane. Which triangle
// Havok's query keeps at a tie is not decoded: between two Cupside faces (the wall and the bevel) the paths split
// about evenly
const deepestFirstRoll = (p, q) => (Math.abs(p.dist - q.dist) <= TIE_DIST_M || (p.dist === Infinity && q.dist === Infinity)
  ? ((p.attr === ATTR.cupside) - (q.attr === ATTR.cupside)) || p.d - q.d : p.dist - q.dist);
// the contacts that count the stroke's ground-contact ticks (M+0xbc; tools/nss-physics.json ground.groundTickAttrs)
const GROUND_TICK = new Uint8Array(32);
for (const a of P.ground.groundTickAttrs) GROUND_TICK[a] = 1;
// the contacts that zero the backspin and the pull-back (ground.zeroSpinAttrs)
const ZERO_SPIN = new Uint8Array(32);
for (const a of P.ground.zeroSpinAttrs) ZERO_SPIN[a] = 1;

// A height field as the ground: { heightAt(x, z) -> y | null, normalAt(x, z) ->
// [nx, ny, nz], attrAt(x, z) -> attribute id } (NSS metres). A move is tested
// against the plane under its end (through heightAt there, normal normalAt there),
// as meshGround's contacts tests a face; a pass-through attribute (water) is a
// surface the ball crosses there. An optional cup ({ x, y, z }: the active cup's
// bone) cuts the NSS cup's hole into it (cupMesh): inside the rim the cup's own
// triangles, outside the field's plane.
export function heightGround(g, { cup = null } = {}) {
  const cm = cup ? meshGround(cupMesh(cup, { surfaceAt: (x, z) => g.heightAt(x, z) })) : null;
  const rim = P.cup.rimRadiusM;
  const inHole = (x, z) => cup != null && (x - cup.x) * (x - cup.x) + (z - cup.z) * (z - cup.z) < rim * rim;
  function plane(x, z) {
    const h = g.heightAt(x, z);
    if (h == null || !Number.isFinite(h)) return null;
    const n = g.normalAt ? g.normalAt(x, z) : [0, 1, 0];
    const m = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    return { h, n: [n[0] / m, n[1] / m, n[2] / m], attr: g.attrAt ? g.attrAt(x, z) ?? 1 : 1 };
  }
  return {
    kind: "height",
    contacts(o, e, r) {
      const out = cm ? cm.contacts(o, e, r) : [];
      if (!inHole(e[0], e[2])) {
        const pl = plane(e[0], e[2]);
        if (pl && !PASS[pl.attr]) {
          const d = (e[1] - pl.h) * pl.n[1];   // e's distance from the plane through (ex, h, ez)
          if (d < r) out.push({ tri: -1, n: pl.n, d, dist: Math.max(d, 0), attr: pl.attr });
        }
      }
      return out;
    },
    pass(o, D, r) {
      const ex = o[0] + D[0], ez = o[2] + D[2];
      const pl = plane(ex, ez);
      if (!pl || !PASS[pl.attr]) return [];
      const d = (o[1] + D[1] - pl.h) * pl.n[1];
      return d < r ? [{ t: 1, n: pl.n, q: [ex, pl.h, ez], attr: pl.attr, tri: -1 }] : [];
    },
  };
}

// The NSS cup as triangles (tools/nss-physics.json cup: the median of the 126 cups
// in the collision, a 20-sided hole: the rim (Cupside) on the green, a bevel down and
// in to the wall's top, the wall straight down to the flat Cup bottom at the bone),
// around cup = { x, y (the bone), z }. surfaceAt(x, z), when given, is the green's
// height: the rim follows it, as the real rims do (0.299-0.338 m above the bone), the
// bevel bevelM below the rim; else the rim is level at depthM. For heightGround.
export function cupMesh(cup, { segments = 20, surfaceAt = null } = {}) {
  const C = P.cup;
  const verts = [], tris = [], attr = [];
  const rimY = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments, x = cup.x + C.rimRadiusM * Math.cos(a), z = cup.z + C.rimRadiusM * Math.sin(a);
    const h = surfaceAt ? surfaceAt(x, z) : null;
    rimY.push(h != null && Number.isFinite(h) ? h : cup.y + C.depthM);
    verts.push(x, rimY[i], z);
  }
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    verts.push(cup.x + C.wallRadiusM * Math.cos(a), rimY[i] - C.bevelM, cup.z + C.wallRadiusM * Math.sin(a));
  }
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    verts.push(cup.x + C.bottomRadiusM * Math.cos(a), cup.y + C.bottomM, cup.z + C.bottomRadiusM * Math.sin(a));
  }
  const hub = verts.length / 3;
  verts.push(cup.x, cup.y + C.bottomM, cup.z);
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < segments; i++) {
    const a = ring * segments + i, b = ring * segments + ((i + 1) % segments), c = a + segments, d = b + segments;
    tris.push(a, c, b, b, c, d); attr.push(ATTR.cupside, ATTR.cupside);
  }
  for (let i = 0; i < segments; i++) { tris.push(hub, 2 * segments + ((i + 1) % segments), 2 * segments + i); attr.push(ATTR.cup); }
  return { verts: new Float64Array(verts), tris: new Uint32Array(tris), attr: new Uint8Array(attr) };
}

// ---------------------------------------------------------------- the flagstick

// The flagstick (Object_BGOBJ_GlfPin; tools/nss-physics.json flag: its Phive collision shape
// BGOBJ_GlfPin_Anim_col, exactly): a decagonal pole (Pin) of circumradius 0.0273 m (apothems
// 0.0252-0.0256) from the cup's bone (y 0) to 2.996 m with a cap to 3.010, and the cloth
// (Flag, pass-through), one quad in the pole's plane from the axis out 1.0078 m, 1.8926..2.9785 m
// up. Placed at the active cup's bone, yawed so the cloth points downwind: the model's -z along
// (sin a, 0, cos a), a = the wind object's angle (also when its speed is 0).
export function flagMesh(cup, { windDirRad = 0, pole = true, cloth = true } = {}) {
  const FL = P.flag, c = Math.cos(windDirRad), s = Math.sin(windDirRad);
  const verts = [], tris = [], attr = [];
  for (const [x, y, z] of FL.verts512) {
    const X = x * FL.unitM, Y = y * FL.unitM, Z = z * FL.unitM;
    // R_y(a + pi): (x, z) -> (-x cos a - z sin a, x sin a - z cos a)
    verts.push(cup.x - X * c - Z * s, cup.y + Y, cup.z + X * s - Z * c);
  }
  FL.tris.forEach((t, i) => {
    const isCloth = FL.clothTris.includes(i);
    if (isCloth ? !cloth : !pole) return;
    tris.push(...t); attr.push(isCloth ? ATTR.flag : ATTR.pin);
  });
  return { verts: new Float64Array(verts), tris: new Uint32Array(tris), attr: new Uint8Array(attr) };
}
// the flag as its own ground (meshGround over flagMesh, with the closest points), cached by cup and yaw
const flagGrounds = new Map();
export function flagGround(cup, windDirRad = 0) {
  const key = `${cup.x},${cup.y},${cup.z},${windDirRad}`;
  let g = flagGrounds.get(key);
  if (!g) {
    if (flagGrounds.size > 64) flagGrounds.clear();
    g = meshGround(flagMesh(cup, { windDirRad }), { cell: 0.25, closest: true });
    flagGrounds.set(key, g);
  }
  return g;
}
// is the flag in the cup for this stroke? Not for the putter on the green (Green or Cupside):
// 31 recorded putts from 0.4 to 8.3 m, 19 through the pole's place, met nothing; every
// recorded stroke from off the green that came near it met it. A putter from the fringe: not
// recorded (in, inferred)
export function flagInPlay(club, lie) {
  const a = typeof lie === "number" ? lie : LIE_ATTR[lie] ?? 1;
  return !(clubOf(club) === "PT" && (a === ATTR.green || a === ATTR.cupside));
}
// The cloth's kick (0xd3fee4..0xd404c4), added to the bounce of the stroke's first ground contact, on the
// green, after a cloth hit: the horizontal direction from the contact point (M+0x6c: the ball's centre less
// 0.05 m along the contact normal) to the cup, turned by an angle in [-FlagHitAfterAngleRange, +range) deg
// (x' = x cos + z sin, z' = z cos - x sin), times a speed in [FlagHitAfterVelMin, VelMax), both drawn from
// sead::Random (xorshift128; init x_i = 0x6c078965 (x_(i-1) ^ x_(i-1) >> 30) + i; a draw's unit value the
// float of 0x3f800000 | u >> 9, less 1) seeded with fcvtzu(f32(contact x) * 1e6) (a negative x seeds 0). h01s3
// (flights/raw): seed 88183192, 16.982 deg, 1.2615 m/s, the recorded bounce to 2.2e-4 m/s
// -> { seed, angDeg, speed, x, z } (the kick's m/s)
const _ku = new Uint32Array(1), _kf = new Float32Array(_ku.buffer);
const unit01 = (r) => { _ku[0] = (0x3f800000 | (r >>> 9)) >>> 0; return Math.fround(_kf[0] - 1); };
function seadInit(seed) {
  const st = [0, 0, 0, 0];
  let x = seed >>> 0;
  for (let i = 0; i < 4; i++) { x = (Math.imul(0x6c078965, (x ^ (x >>> 30)) >>> 0) + i + 1) >>> 0; st[i] = x; }
  return st;
}
function seadU32(st) {
  const t = (st[0] ^ (st[0] << 11)) >>> 0;
  const w = (st[3] ^ (st[3] >>> 19) ^ t ^ (t >>> 8)) >>> 0;
  st[0] = st[1]; st[1] = st[2]; st[2] = st[3]; st[3] = w;
  return w;
}
export function flagKick(cpx, cpz, cup) {
  const F = Math.fround;
  let dx = F(F(cup.x) - F(cpx)), dz = F(F(cup.z) - F(cpz));
  const m = F(Math.sqrt(F(F(dx * dx) + F(dz * dz))));
  if (m > 0) { const inv = F(1 / m); dx = F(dx * inv); dz = F(dz * inv); }
  const sv = F(F(cpx) * F(1e6));
  const seed = !(sv > 0) ? 0 : sv >= 4294967295 ? 0xffffffff : Math.trunc(sv) >>> 0;
  const st = seadInit(seed);
  const R = F(G.flagHitAfterAngleRange), vmin = F(G.flagHitAfterVelMin), vmax = F(G.flagHitAfterVelMax);
  const ang = F(F(unit01(seadU32(st)) * F(R + R)) - R);
  const rad = F(ang * F(0.017453292));
  const A = F(Math.cos(rad)), B = F(Math.sin(rad));
  const kx = F(F(dx * A) + F(dz * B)), kz = F(F(dz * A) - F(dx * B));
  const sp = F(vmin + F(unit01(seadU32(st)) * F(vmax - vmin)));
  return { seed, angDeg: ang, speed: sp, x: F(kx * sp), z: F(kz * sp) };
}
// the pole's one contact a tick, among the faces the incoming velocity approaches (letting every overlapped
// face act, deepest first, put the ball 1-9 cm off on 8 of the 16 recorded contacts): the face the move's swept
// sphere touches first (the smallest time of impact t; a face it already overlaps and moves into touches at 0).
// (Until 2026-10-25 the face nearest the end of the move: a ball faster than ~12 m/s whose move ends past the
// axis took a far face, its normal oriented by o pointing inward, and was deflected to the wrong side, through
// the pole: of 920 synthetic off-centre hits per speed on a flat green, none at 8 m/s, 12 at 12, 124 at 16, 383 at
// 25; now none. The recorded contacts, all at 8 m/s or less but r4 h10s2's dead-centre 25 m/s, are unchanged.) At a vertical edge two faces share (about 2/3 of the
// directions a ball can meet the decagon from) both are touched at the same t, and which the game takes is not
// known: of 6 recorded ties, the lower triangle (the shape's primitive order) on 4, the higher on 2 (h01s3 643,
// h08s1 1489). tie "low" (default) or "high"; pick.tie marks a tie
function polePick(fc, vx, vy, vz, tie) {
  let pick = null, tied = false;
  for (let k = 0; k < fc.length; k++) {
    const c = fc[k];
    if (c.attr !== ATTR.pin || !(c.t >= 0) || !(vx * c.n[0] + vy * c.n[1] + vz * c.n[2] < 0)) continue;
    if (!pick || c.t < pick.t - 1e-9) { pick = c; tied = false; continue; }
    if (Math.abs(c.t - pick.t) > 1e-9) continue;
    if (c.n[0] !== pick.n[0] || c.n[2] !== pick.n[2]) tied = true;   // another face (not the quad's other half)
    if (tie === "high" ? c.tri > pick.tri : c.tri < pick.tri) pick = c;
  }
  if (pick) pick.tie = tied;
  return pick;
}
// the flag's reach: the cloth's free edge from the axis, its top over the bone (m)
const FLAG_REACH_M = Math.max(...P.flag.verts512.map(([x, , z]) => Math.hypot(x, z))) * P.flag.unitM;
const FLAG_TOP_M = Math.max(...P.flag.verts512.map((v) => v[1])) * P.flag.unitM;

// A shot line's profile as a height field: profile.heightAt(s) (m, NSS y or
// relative to the ball's ground), profile.attrAt(s) (attribute id, or
// profile.surfaceAt(s) a lie name), s metres along the heading from the start;
// level across the line. The normal is the slope over the half metre ahead.
export function profileGround(profile, start, headingDeg, opts) {
  const h = headingDeg * DEG, ux = Math.sin(h), uz = -Math.cos(h);
  const sOf = (x, z) => (x - start[0]) * ux + (z - start[2]) * uz;
  const attrAt = (s) => profile.attrAt ? profile.attrAt(s) : LIE_ATTR[profile.surfaceAt?.(s)] ?? 1;
  return heightGround({
    heightAt: (x, z) => profile.heightAt(sOf(x, z)),
    normalAt: (x, z) => {
      const s = sOf(x, z), a = profile.heightAt(s), b = profile.heightAt(s + 0.5);
      const k = a == null || b == null ? 0 : (b - a) / 0.5;
      return [-k * ux, 1, -k * uz];
    },
    attrAt: (x, z) => attrAt(sOf(x, z)),
  }, opts);
}

// ---------------------------------------------------------------- the ball

const ATTR_NAME = ["Default", "Fairway", "Rough", "Bunker", "Water", "OB", "Green", "Color", "Leaf", "Cupside", "Cup", "Rock", "Glass", "Tee", "SandOB", "Tree", "Flag", "AirOB", "Object", "Pin", "PalmLeaf", "Barrier"];
export { ATTR_NAME };

// run(opts) -> { carry, stop, rest, apex, flightTicks, bounces, path, holed, outcome, ... }
//   club      "WD1" .. "PT" or the app's ids (driver .. wedge, putter)
//   power     the swing's power, 0..1.5 (the gauge's bars / 4); capped by the lie
//   lie       the lie the ball is played from (tee | fairway | rough | bunker |
//             green | fringe, or an attribute id): caps the power (capFor)
//   wind      null | { s, dirRad } | { x, z } (windVector)
//   start     the ball's centre, NSS metres [x, y, z] (at rest it is 0.05 m above the
//             mesh along the normal, on a tee 0.1 m)
//   heading   the aim, deg N-up (0 = -z)
//   backspin  b (0..1), the swing's backspin (two recorded wedge chips: 0.03, 0.10)
//   ground    meshGround(...) | heightGround(...) | { heightAt, normalAt, attrAt }
//   profile   instead of ground: { heightAt(s), attrAt(s) | surfaceAt(s) } (profileGround)
//   cup       { x, y, z } the active cup's bone (AddGravityHole, stop-gravity, the
//             pull-back's angle, the Cupside reach and the bevel's green bounce; on a
//             height field also the cup's hole, cupMesh)
//   flag      null (default) | true | { windDirRad }: the flagstick in the active cup (cup
//             required), the cloth's yaw the wind object's angle (default o.wind's dirRad,
//             or its x, z; the game yaws it in a calm too, so with neither run throws);
//             flagInPlay(club, lie) says when the game has it in (not for a putt from the green)
//   poleTie   "low" (default) | "high": the face taken at a pole edge both faces share (the
//             game's rule is not known: run both where poleTies says it mattered)
//   flagKick  (cpx, cpz, cup) -> { x, z }: replaces the cloth kick's draw (a planner sampling
//             its range; the game's own draw is flagKick)
//   resume    { groundCount, flagHit, pinHigh }: a stroke continued from a recorded mid-stroke
//             state (M+0xbc, M+0x103, M+0x102)
//   trace     true: path = [tick, x, y, z, mode, contact attribute] every tick (a
//             number n: every n ticks)
//   v0, hop0, side0, yRef   a recorded launch (the shot record), replacing the
//             club / power / heading launch
//   stopAtHazard  true (default): the run ends where the ball first meets water or air
//             OB (the game penalises it there); false flies on (under the water)
//   stopAtCup true: the run ends at the first Cup contact (the putter assist's ghost run
//             does; the rest is then the ball's spot at that tick)
//   maxTicks  default ForceStopFrame frames
//   onMove(state), onTick(state)  per-tick hooks (diagnostics)
// Returns, in metres (and yd where named): carry (horizontal, start to the first
// contact), carryYd, stop (horizontal, start to rest), stopYd, rest [x, y, z],
// restAttr, lateral (m, + right of the heading), apex (m above the start, before the
// first contact), flightTicks (to the first contact), firstContact { tick, pos, attr },
// bounces (shot contacts that bounced), rollTick (the switch to the roll), ticks,
// holed (a tick's contact was Cup), holedTick, outcome (rest | holed | water | OB |
// timeout | fell), hazard (where water or air OB was first met), end (the hazard's point
// for water / OB, else the rest), pullBack (the backspin pull-back P as stored at the switch
// to the roll, or null), path, pinHigh (M+0x102), flagHit ({ tick, pos } or null), flagKick
// ({ tick, seed, angDeg, speed, x, z } or null), poleTies (the ticks whose pole contact was an
// edge tie: the other face would deflect the ball differently).
//
// The ball's state is float32, as the game's (every operation rounded with
// Math.fround): flown from a recorded launch it lands on the recording's last airborne
// sample to 0.004 mm after 235 m (in doubles 1.1 mm). The collision geometry is
// computed in doubles from the float32 vertices.
const F = Math.fround;
export function run(o) {
  const club = clubOf(o.club);
  const C = P.clubs[club];
  const putter = club === "PT";
  const lieA = typeof o.lie === "number" ? o.lie : LIE_ATTR[o.lie ?? "tee"] ?? 1;
  const ground = o.ground
    ? (o.ground.contacts ? o.ground : heightGround(o.ground, { cup: o.cup }))
    : o.profile ? profileGround(o.profile, o.start, o.heading ?? 0, { cup: o.cup }) : null;
  if (!ground) throw new Error("nsssim.run: no ground");
  const start = o.start;
  let power = o.power ?? 1;
  const cap = capFor(club, lieA);
  if (power > cap) power = cap;
  const v0 = o.v0 ?? launchVelocity(club, power, o.heading ?? 0);
  const W = windVector(o.wind);
  const Wx0 = W ? F(W.x) : 0, Wz0 = W ? F(W.z) : 0;
  const cup = o.cup ?? null;
  const stopAtHazard = o.stopAtHazard ?? true, stopAtCup = o.stopAtCup ?? false;
  const maxTicks = o.maxTicks ?? G.forceStopFrame * N_SUB;
  const traceEvery = o.trace === true ? 1 : o.trace > 0 ? o.trace | 0 : 0;
  const yRef = F(o.yRef ?? start[1]);   // the wind's height reference (M+0xc): the launch y
  const R = BALL_R;
  const headingRad = Math.atan2(v0[0], -v0[2]);
  const onTick = o.onTick ?? null, onMove = o.onMove ?? null;
  const contacts = o.contacts ? [] : null;
  const leafTouch = ground.leafTouch ?? null;
  // the flagstick (o.flag: true, or { windDirRad }: the cloth's yaw, default the wind's angle, also at 0 m/s). The
  // game turns the flag to the wind object's angle in a calm too, so a flag whose yaw is not known is refused, not
  // flown at yaw 0 (round 4 h10s2, s 0 at 4.712 rad: at yaw 0 the model holed it off the cloth 2.41 m up; at the
  // wind's angle it bounces off the pole and rests 0.024 m from the game's ball, 13.6 m back on the fairway)
  let flagG = null;
  if (o.flag && cup) {
    const wa = o.wind ? (Number.isFinite(o.wind.dirRad) ? o.wind.dirRad : (o.wind.x || o.wind.z) ? Math.atan2(o.wind.x ?? 0, o.wind.z ?? 0) : null) : null;
    const flagYaw = Number.isFinite(o.flag.windDirRad) ? o.flag.windDirRad : wa;
    if (flagYaw == null) throw new Error("nsssim.run: the flag is in but its yaw is not known: pass flag: { windDirRad } or a wind with dirRad (the wind object's angle, also at 0 m/s)");
    flagG = flagGround(cup, flagYaw);
  }
  const poleTie = o.poleTie ?? "low", kickOf = o.flagKick ?? flagKick;

  // float32 constants
  const dt = F(DT), grav = F(A.gravity), gPutt = F(G.gravityPutter);
  const drag = F(F(A.airFriction) / N_SUB), waterK = F(F(P.attrs[ATTR.water].friction) / N_SUB);
  const hopK = F(A.hopSpinK), hopD = F(A.hopDecayTick), sideK = F(A.sideSpinK), sideD = F(A.sideDecayTick);
  const windK = F(A.windK), windF = F(A.windFwdK), windH = F(A.windHeight);
  const leafF = F(P.attrs[ATTR.leaf].friction), palmF = F(P.attrs[ATTR.palmLeaf].friction), leafT = F(G.leafTimerS);
  const stop2 = F(F(G.stopVelLen) * F(G.stopVelLen)), resist = F(G.fieldResistanceEnableSpeed);
  const softLift = F(G.softLiftM), softK = F(1 + G.softRestitution);
  const cupsideCap = F(G.cupsideReflectionMaxVelY), pinHighY = cup ? F(F(cup.y) + F(G.hitPinFlagHeightFromCupPos)) : 0;

  let px = F(start[0]), py = F(start[1]), pz = F(start[2]);
  let vx = F(v0[0]), vy = F(v0[1]), vz = F(v0[2]);
  let mode = putter ? 2 : 1;
  let hop = F(o.hop0 ?? C.hopSpinRatio), side = F(o.side0 ?? 0), bs = F(o.backspin ?? 0);
  let Px = 0, Py = 0, Pz = 0;                 // the backspin pull-back (M+0x40)
  let nx = 0, ny = 1, nz = 0;                 // the last contact normal (M+0x78)
  // M+0xf4, the pull-back's reference direction: the launch velocity, then the post-move
  // velocity of the stroke's first contact (h03s1: still the first landing's at its
  // third, h06s3's putt: its first tick's slide)
  let lvx = F(v0[0]), lvz = F(v0[2]);
  let lastAttr = lieA;                        // the last surface touched (M+0xac)
  let tSince = 0;                             // s since the last contact (M+0xb8)
  let stopFrames = 0, smallFrames = 0, ax = px, az = pz, ay = py;
  // the canopy counter M+0xdc, its timer M+0xe0, the leaf normal the last tick counted (M+0xe4)
  let leafCount = 0, leafTimer = 0, leafPrev = null;
  let waterY = null;
  let bounces = 0, apex = 0, firstContact = null, rollTick = null, hazard = null, outcome = null, pullBack = null;
  // the stroke's ground-contact ticks (M+0xbc), M+0x102 (a pin or flag contact at or above
  // HitPinFlagHeightFromCupPos over the bone), M+0x103 (the cloth hit), M+0x108 (this tick's
  // contact met the cup's bevel), the first Cup contact (M+0x100)
  let groundCount = o.resume?.groundCount ?? 0, pinHigh = !!o.resume?.pinHigh;
  let flagHit = o.resume?.flagHit ? (typeof o.resume.flagHit === "object" ? o.resume.flagHit : { tick: 0, pos: null }) : null;
  let cupGreen = false, holedTick = null, flagKicked = null;
  const poleTies = [];
  const path = traceEvery ? [[0, px, py, pz, mode, 0]] : null;
  const O = [0, 0, 0], E = [0, 0, 0], D = [0, 0, 0];
  const cupHoriz = cup ? (x, z) => Math.sqrt((x - cup.x) * (x - cup.x) + (z - cup.z) * (z - cup.z)) : () => Infinity;
  const holeG = (dc) => F(F(G.addGravityHole) * F(curveAt(G.addGravityHoleCurve, dc / G.addGravityHoleDist)));
  let tick = 0, restAttr = lieA;
  // the canopy counter (0xd38ecc..0xd38f10, 0xd39048..0xd39054): a leaf contact whose normal is not the one the
  // last tick counted counts +1 moving against it (and sets the timer to leafTimerS), -1 along it (at a count <= 0
  // the timer stops; the count is not clamped: RAM reads -1 .. -6), and stores its normal; the stored normal is
  // cleared every tick, so a face touched on consecutive ticks counts on the 1st, 3rd, 5th ... (h09s2-WD1 of
  // 2026-10-25: three ticks on one face, RAM's count 2, the timer set again on the third). Shots only: RAM moves it
  // in a roll too (h17s1-dr to -1), but counting there puts h17s1 further off, so that part is not decoded
  let prevLeaf = null;
  const countLeaf = (n, cn) => {
    if (prevLeaf && n[0] === prevLeaf[0] && n[1] === prevLeaf[1] && n[2] === prevLeaf[2]) return;
    leafPrev = n;
    if (cn < 0) { leafCount++; leafTimer = leafT; }
    else { leafCount--; if (leafCount <= 0) leafTimer = 0; }
  };

  while (tick < maxTicks) {
    tick++;
    // the canopy timer runs down at the top of the tick (0xd38940..0xd38974: at zero it clears the counter); the
    // last tick's leaf normal is taken and cleared (0xd38b64..0xd38b74)
    if (leafTimer > 0) { leafTimer = F(leafTimer - dt); if (leafTimer <= 0) { leafTimer = 0; leafCount = 0; } }
    prevLeaf = leafPrev; leafPrev = null;
    // ---- 1. move ----
    // pos += v dt; then the triangles the move meets (meshGround contacts; a Cupside one farther than
    // cupsideReachM from the active cup is none: the move's query callback 0xd34400..0xd34468 drops it).
    // A shot (mode 1): deepest first (the smallest true distance; at a tie the deeper plane; the ones only
    // touched on the way last), each acting only while the velocity still approaches it: the ball pushed out
    // along its face normal to r and the velocity's part into it removed (a slide), or, a shot meeting a soft
    // surface (bunker, OB, sand OB, the pin), set down softLiftM farther out and turned back at a restitution of
    // 0.3 (the pole: at the face's closest point, out by r + softLiftM). The tick's contact (M+0xa4, M+0x78, the
    // bounce's normal) is the acting one the incoming velocity met most head-on. A roll (mode 2): one contact a
    // tick, the deepest (at a tie the one that is not Cupside, then the deeper plane), pushed out by its depth
    // along its face normal whether or not the ball approaches it; only an approaching one slides the ball and
    // is the tick's contact (the putter assist's ghost paths, every tick from RAM: of 733 roll ticks overlapping
    // two or more triangles at distinct depths, 726 slid along the deepest's face normal and none along two; of
    // 112 Cupside bounces off a face contact all came off the deepest, often not the most head-on one; h06's ghost
    // was pushed 7.04 mm, its depth, along the wall's face normal at the wall-bevel edge; a receding deepest
    // pushes the ball and leaves no contact). Measured on the recordings (meshGround contacts).
    const ivx = vx, ivy = vy, ivz = vz;      // the incoming velocity (M+0x90)
    const opx = px, opy = py, opz = pz;
    px = F(px + F(vx * dt)); py = F(py + F(vy * dt)); pz = F(pz + F(vz * dt));
    if (onMove) onMove({ tick, o: [opx, opy, opz], e: [px, py, pz], vin: [ivx, ivy, ivz], mode });
    O[0] = opx; O[1] = opy; O[2] = opz; E[0] = px; E[1] = py; E[2] = pz;
    let hit = null;
    cupGreen = false;
    let cs = ground.contacts(O, E, R);
    if (cup && cs.length && cupHoriz(px, pz) > G.cupsideReachM) {
      let far = false;
      for (let k = 0; k < cs.length; k++) if (cs[k].attr === ATTR.cupside) { far = true; break; }
      if (far) cs = cs.filter((c) => c.attr !== ATTR.cupside);
    }
    // the flagstick, its own body: one pole face a tick (polePick), beside the course's contacts (only near it:
    // every point of the step is within its length of o; the cloth's edge is FLAG_REACH_M out)
    let nearFlag = false, pole = null;
    if (flagG) {
      const stepM = Math.sqrt((ivx * dt) * (ivx * dt) + (ivy * dt) * (ivy * dt) + (ivz * dt) * (ivz * dt));
      nearFlag = cupHoriz(opx, opz) - stepM < FLAG_REACH_M + 2 * R && Math.min(opy, py) - cup.y < FLAG_TOP_M + 2 * R;
    }
    if (nearFlag) {
      pole = polePick(flagG.contacts(O, E, R), ivx, ivy, ivz, poleTie);
      if (pole) { pole.pole = true; if (pole.tie) poleTies.push(tick); if (mode === 1) cs = cs.concat([pole]); }
    }
    if (mode === 2) {
      // the course's one contact
      if (cs.length) {
        if (cs.length > 1) cs.sort(deepestFirstRoll);
        const c = cs[0];
        const n0 = F(c.n[0]), n1 = F(c.n[1]), n2 = F(c.n[2]);
        if (c.dist < R) {
          // the depth: the true distance (an edge or corner's), or the plane's when the centre is past it
          const push = F(R - (c.d < 0 ? c.d : c.dist));
          if (push > 0) { px = F(px + F(push * n0)); py = F(py + F(push * n1)); pz = F(pz + F(push * n2)); }
        }
        const vn = F(F(F(vx * n0) + F(vy * n1)) + F(vz * n2));
        if (vn < 0) {
          vx = F(vx - F(vn * n0)); vy = F(vy - F(vn * n1)); vz = F(vz - F(vn * n2));
          hit = { n0, n1, n2, attr: c.attr, ap: -F(F(F(ivx * n0) + F(ivy * n1)) + F(ivz * n2)), tri: c.tri };
          if (c.attr === ATTR.cupside && cup) cupGreen = n1 > G.cupGreenNormalY;
        }
      }
      // and the pole's, after it: a roll in the cup against the pole slides along the face it moves into, pushed
      // to r from its plane (the 11 recorded in-cup pole contacts: the velocity after within 2.4 mm/s; taking the
      // deeper of the pole and the course as the tick's one contact put three of them 0.15-0.47 m/s off)
      if (pole) {
        const n0 = F(pole.n[0]), n1 = F(pole.n[1]), n2 = F(pole.n[2]);
        const vn = F(F(F(vx * n0) + F(vy * n1)) + F(vz * n2));
        if (vn < 0) {
          if (pole.dist < R) {
            const d = pole.d + (px - E[0]) * n0 + (py - E[1]) * n1 + (pz - E[2]) * n2;
            const push = F(R - d);
            if (push > 0) { px = F(px + F(push * n0)); py = F(py + F(push * n1)); pz = F(pz + F(push * n2)); }
          }
          vx = F(vx - F(vn * n0)); vy = F(vy - F(vn * n1)); vz = F(vz - F(vn * n2));
          const ap = -F(F(F(ivx * n0) + F(ivy * n1)) + F(ivz * n2));
          if (!hit || ap > hit.ap) hit = { n0, n1, n2, attr: pole.attr, ap, tri: pole.tri };
        }
      }
    } else if (cs.length) {
      if (cs.length > 1) cs.sort(deepestFirst);
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        const n0 = F(c.n[0]), n1 = F(c.n[1]), n2 = F(c.n[2]);
        const vn = F(F(F(vx * n0) + F(vy * n1)) + F(vz * n2));
        if (!(vn < 0)) continue;
        const ap = -F(F(F(ivx * n0) + F(ivy * n1)) + F(ivz * n2));
        const soft = SOFT[c.attr] === 1;
        if (c.pole && soft && c.dist < R) {
          // a shot meeting the pole: the ball set at the face's closest point to the end of the move, out along
          // the face's normal by r + softLift (at an edge the edge's point, not e pushed out: h10s2, h12s2 to
          // 0.06 mm)
          px = F(c.q[0] + (R + softLift) * n0); py = F(c.q[1] + (R + softLift) * n1); pz = F(c.q[2] + (R + softLift) * n2);
        } else if (c.pole && soft) {
          // a pole face only touched on the way (a fast ball's move clears it by its end): the ball set where the
          // swept sphere first touches it, out along its normal by softLift (left at e it would pass through)
          const k = c.t;
          px = F(O[0] + (E[0] - O[0]) * k + softLift * n0); py = F(O[1] + (E[1] - O[1]) * k + softLift * n1); pz = F(O[2] + (E[2] - O[2]) * k + softLift * n2);
        } else if (c.dist < R) {
          // e's distance from this plane after the pushes so far
          const d = c.d + (px - E[0]) * n0 + (py - E[1]) * n1 + (pz - E[2]) * n2;
          const push = F((soft ? R + softLift : R) - d);
          if (push > 0) { px = F(px + F(push * n0)); py = F(py + F(push * n1)); pz = F(pz + F(push * n2)); }
        }
        const kv = soft ? F(softK * vn) : vn;
        vx = F(vx - F(kv * n0)); vy = F(vy - F(kv * n1)); vz = F(vz - F(kv * n2));
        if (!hit || ap > hit.ap) {
          hit = { n0, n1, n2, attr: c.attr, ap, tri: c.tri };
          // M+0x108 (0xd3936c..0xd393ac): each near Cupside face that becomes the tick's contact sets it to
          // n.y > cupGreenNormalY (the bevel, not the wall); another surface becoming the contact afterwards
          // leaves it as it is
          if (c.attr === ATTR.cupside && cup) cupGreen = n1 > G.cupGreenNormalY;
        }
      }
    }
    const ux = vx, uy = vy, uz = vz;          // u: the post-move velocity
    // the pass-through surfaces this step crosses (the move before any push-out)
    let a8 = 0, a0 = 0, palm = false, a8n = null;
    D[0] = ivx * dt; D[1] = ivy * dt; D[2] = ivz * dt;
    let crossed = ground.pass(O, D, R);
    if (nearFlag) { const fp = flagG.pass(O, D, R); if (fp.length) crossed = crossed.concat(fp).sort((p, q) => p.t - q.t); }
    // the canopy's leaf contacts: on a mesh, the Leaf triangles the step's sphere touches (leafTouch), else the
    // pass-through leaf faces
    if (leafTouch && mode === 1) {
      const lt = leafTouch(O, D, R);
      for (let k = 0; k < lt.length; k++) { const n = lt[k].n; countLeaf(n, ivx * n[0] + ivy * n[1] + ivz * n[2]); }
    }
    for (let k = 0; k < crossed.length; k++) {
      const c = crossed[k], a = c.attr;
      const cn = ivx * c.n[0] + ivy * c.n[1] + ivz * c.n[2];
      if (!a8) { a8 = a; a0 = Math.abs(cn); a8n = c.n; }
      if (a === ATTR.leaf) { if (!leafTouch && mode === 1) countLeaf(c.n, cn); }
      else if (a === ATTR.palmLeaf) palm = true;
      else if (a === ATTR.water) {
        if (waterY == null) { waterY = c.q[1]; lastAttr = ATTR.water; }
        if (!hazard) hazard = { tick, kind: "water", pos: [px, py, pz] };
      } else if (a === ATTR.airOb) {
        if (!hazard) hazard = { tick, kind: "OB", pos: [px, py, pz] };
      }
    }
    // ---- 2. contact bookkeeping ----
    const ha = hit ? hit.attr : 0;
    // the spin (0xd396d8..0xd39700): zeroed by a contact with bunker, Cupside, glass, sand OB, tree, object, the
    // pin or a barrier, or by the flag's or water's volume
    if (ZERO_SPIN[ha] || a8 === ATTR.flag || a8 === ATTR.water) { bs = 0; Px = 0; Py = 0; Pz = 0; }
    // the pin and the flag (0xd397ec..0xd39ca8)
    if (cup && (ha === ATTR.pin || a8 === ATTR.flag)) {
      const wasHigh = pinHigh;
      if (!wasHigh && !putter) {
        // the contact point M+0x70: the centre less r along the contact's normal (the solid one's, else the pass one's)
        const cny = hit ? hit.n1 : a8n ? F(a8n[1]) : 1;
        if (F(py - F(cny * R)) >= pinHighY) pinHigh = true;
      }
      if (a8 === ATTR.flag) {
        if (!wasHigh && ha !== ATTR.pin) {
          // the cloth hit: v (not u) zeroed once (M+0x103), the flag's reaction played (0xd5ba2c)
          if (!flagHit) { vx = 0; vy = 0; vz = 0; flagHit = { tick, pos: [px, py, pz] }; }
        } else a8 = 0;   // a cloth contact after a high pin or flag contact, or with the pin: ignored
      }
    }
    if (hit && GROUND_TICK[ha]) groundCount++;
    let a4 = 0;
    if (hit) {
      a4 = ha; nx = hit.n0; ny = hit.n1; nz = hit.n2;
      // M+0xac: sticky once Cup (0xd39674), Cupside recorded as Green (0xd396a4..0xd396ac)
      if (waterY == null && lastAttr !== ATTR.cup) lastAttr = a4 === ATTR.cupside ? ATTR.green : a4;
      tSince = 0;
      if (contacts) contacts.push({ tick, attr: a4, vol: a8, n: [nx, ny, nz], vin: [ivx, ivy, ivz], mode, tri: hit.tri });
      if (!firstContact) { firstContact = { tick, pos: [px, py, pz], attr: a4 }; lvx = ux; lvz = uz; }
      // holed: the tick's contact is Cup (the cup's bottom; 0xd39838..0xd39858 M+0x100, the ghost run's S+0x8a)
      if (a4 === ATTR.cup && holedTick == null) holedTick = tick;
    } else if (a8) {
      // a pass-through contact holds the time since the last contact (M+0xb8: h16s2's
      // canopy ticks 274 and 275 add nothing to it; h17s1's roll, leaving the ground at
      // tick 1920 over a leaf sheet it touched for three ticks, read 49 ticks at 1972 and
      // turned back into a shot then) and records an up normal (M+0x78 = (0, 1, 0))
      nx = 0; ny = 1; nz = 0;
      if (!firstContact && a8 !== ATTR.leaf && a8 !== ATTR.palmLeaf) firstContact = { tick, pos: [px, py, pz], attr: a8 };
    } else tSince = F(tSince + dt);
    if (hazard && stopAtHazard) { outcome = hazard.kind; restAttr = a8 || a4; break; }
    if (stopAtCup && holedTick != null) { outcome = "holed"; restAttr = ATTR.cup; if (traceEvery) path.push([tick, px, py, pz, mode, a4]); break; }
    let bounce = false;
    if (mode === 1 && hit) {
      // the switch to the roll (0xd39cb8..0xd3a0c0, the |vin.y| condition 0xd39f84..)
      if (hit.ap < resist && a0 < resist && Math.abs(ivy) < resist && a8 !== ATTR.flag) {
        mode = 2; rollTick = tick;
        // the backspin pull-back (0xd3a0d8..0xd3a698)
        if (bs > 0) {
          const hm = Math.sqrt(ivx * ivx + ivz * ivz), lm = Math.sqrt(lvx * lvx + lvz * lvz);
          if (hm > 0) {
            const dxh = ivx / hm, dzh = ivz / hm;
            const cosA = lm > 0 ? (dxh * lvx + dzh * lvz) / lm : 1;
            const mag = B.initVelK * Math.pow(Math.min(bs, B.initVelRatioMax), Math.log2(1 / B.reflectionBias)) * Math.max(cosA, 0);
            Px = F(-dxh * mag); Py = 0; Pz = F(-dzh * mag);
            pullBack = [Px, Py, Pz];
          }
        }
      } else bounce = true;
    } else if (mode === 2 && !hit && !a8 && tSince >= F(G.groundLeaveTimeForAirMode)) {
      mode = 1;
    }
    // ---- 3. forces ----
    if (mode === 1) {
      if (bounce) {
        // v' = RH vt - RV k vn from the incoming velocity, replacing this tick's forces (0xd3f910)
        const vdn = F(F(F(ivx * nx) + F(ivy * ny)) + F(ivz * nz));
        const vnx = F(vdn * nx), vny = F(vdn * ny), vnz = F(vdn * nz);
        const k = bs > 0 ? F(1 + (B.reflectionMin - 1) * bs * Math.pow(bs, Math.log2(1 / B.reflectionBias))) : 1;
        // Green's coefficients on the cup's bevel in the stroke's first two ground-contact ticks (M+0x108,
        // 0xd3f958..0xd3f984: r1 h10s2 of 2026-10-25 came off the pole onto the bevel, n.y 0.706, and left with
        // Green's and the Cupside cap, to the bit)
        const ra = cupGreen && groundCount < G.cupGreenGroundTicks ? ATTR.green : a4;
        const rh = F(RH[ra]), rv = F(F(RV[ra]) * k);
        vx = F(F(rh * F(ivx - vnx)) - F(rv * vnx)); vy = F(F(rh * F(ivy - vny)) - F(rv * vny)); vz = F(F(rh * F(ivz - vnz)) - F(rv * vnz));
        // the cloth's kick: the stroke's first ground contact, on the green, after a cloth hit (0xd3fee4..0xd404c4)
        if (flagHit && a4 === ATTR.green && groundCount === 1 && cup) {
          const kick = kickOf(F(px - F(nx * R)), F(pz - F(nz * R)), cup);
          vx = F(vx + F(kick.x)); vz = F(vz + F(kick.z));
          flagKicked = { tick, ...kick };
        }
        // the cap goes by the contact's own surface (0xd404d0)
        if (a4 === ATTR.cupside && vy > cupsideCap) vy = cupsideCap;
        bounces++;
        hop = F(hop * hopD); side = F(side * sideD);
      } else {
        let g = grav;
        const dc = cupHoriz(px, pz);
        if (dc < G.addGravityHoleDist) g = F(g + holeG(dc));
        vy = F(vy - F(g * dt));
        if (W) {
          const f = F(curveAt(A.windEffectCurve, Math.min(Math.max(F(F(py - yRef) / windH), 0), 1)));
          const Wx = F(Wx0 * f), Wz = F(Wz0 * f);
          const hm = F(Math.sqrt(F(F(ux * ux) + F(uz * uz))));
          if (hm > 0) {
            const hx = F(ux / hm), hz = F(uz / hm), al = F(F(Wx * hx) + F(Wz * hz));
            const pxw = F(hx * al), pzw = F(hz * al);
            vx = F(vx + F(F(windK * F(F(Wx - pxw) + F(windF * pxw))) * dt));
            vz = F(vz + F(F(windK * F(F(Wz - pzw) + F(windF * pzw))) * dt));
          }
        }
        if (F(F(F(vx * vx) + F(vy * vy)) + F(vz * vz)) > stop2) { vx = F(vx - F(drag * vx)); vy = F(vy - F(drag * vy)); vz = F(vz - F(drag * vz)); }
        if (waterY != null && py < waterY) { vx = F(vx - F(waterK * vx)); vy = F(vy - F(waterK * vy)); vz = F(vz - F(waterK * vz)); }
        if (leafCount >= 1) {
          vx = F(vx - F(F(leafF * vx) / N_SUB)); vz = F(vz - F(F(leafF * vz) / N_SUB));
          if (vy > 0) vy = F(vy - F(F(leafF * vy) / N_SUB));
          bs = F(bs * F(1 - leafF));
        }
        if (palm) {
          vx = F(vx - F(palmF * vx)); vz = F(vz - F(palmF * vz));
          if (vy > 0) vy = F(vy - F(palmF * vy));
          bs = F(bs * F(1 - palmF));
        }
        const hm2 = F(F(ux * ux) + F(uz * uz));
        const um = F(Math.sqrt(F(hm2 + F(uy * uy)))), hm = F(Math.sqrt(hm2));
        if (hop > 0 && um > 0 && hm > 0) {
          const ll = F(hm * um), k = F(F(F(hopK * hop) * um) / N_SUB);
          vx = F(vx + F(F(F(-F(ux * uy)) / ll) * k)); vy = F(vy + F(F(F(hm * hm) / ll) * k)); vz = F(vz + F(F(F(-F(uy * uz)) / ll) * k));
        }
        hop = F(hop * hopD);
        if (side && hm > 0) {
          const k = F(F(F(sideK * side) * um) / N_SUB);
          vx = F(vx + F(F(uz / hm) * k)); vz = F(vz - F(F(ux / hm) * k));
        }
        side = F(side * sideD);
      }
    } else {
      // roll (mode 2): drag, water, a Cupside contact's bounce, friction, the pull-back, the stop count, gravity
      if (F(F(F(vx * vx) + F(vy * vy)) + F(vz * vz)) > stop2) { vx = F(vx - F(drag * vx)); vy = F(vy - F(drag * vy)); vz = F(vz - F(drag * vz)); }
      if (waterY != null && py < waterY) { vx = F(vx - F(waterK * vx)); vy = F(vy - F(waterK * vy)); vz = F(vz - F(waterK * vz)); }
      if (a4 === ATTR.cupside) {
        // a roll touching Cupside bounces (0xd3ab74..0xd3ab8c calls the bounce 0xd3f910): v = RH vt - RV vn from
        // the incoming velocity (k = 1: the backspin term is a shot's), v.y at most CupsideReflectionMaxVelY;
        // h15s3's putt met the cup's far wall at (-1.043, -2.293, 2.182) and left at (0.224, -2.291, -0.238) plus
        // the tick's gravity
        const vdn = F(F(F(ivx * nx) + F(ivy * ny)) + F(ivz * nz));
        const vnx = F(vdn * nx), vny = F(vdn * ny), vnz = F(vdn * nz);
        const rh = F(RH[ATTR.cupside]), rv = F(RV[ATTR.cupside]);
        vx = F(F(rh * F(ivx - vnx)) - F(rv * vnx)); vy = F(F(rh * F(ivy - vny)) - F(rv * vny)); vz = F(F(rh * F(ivz - vnz)) - F(rv * vnz));
        if (vy > cupsideCap) vy = cupsideCap;
      }
      const sp = F(Math.sqrt(F(F(F(vx * vx) + F(vy * vy)) + F(vz * vz))));
      const fr = FR[a4];
      if (fr > 0 && sp > 0) {
        const d = F(F(F(fr) * F(curveAt(G.frictionRatioCurve, sp))) * dt);
        if (d >= sp) { vx = 0; vy = 0; vz = 0; }
        else { const k = F(d / sp); vx = F(vx - F(k * vx)); vy = F(vy - F(k * vy)); vz = F(vz - F(k * vz)); }
      }
      if (Px || Py || Pz) {
        const pn = Px * nx + Py * ny + Pz * nz;
        const qx = Px - pn * nx, qy = Py - pn * ny, qz = Pz - pn * nz;
        let ang = 180;
        if (cup) {
          const cx = cup.x - px, cz = cup.z - pz, cm = Math.sqrt(cx * cx + cz * cz), pm = Math.sqrt(Px * Px + Pz * Pz);
          if (cm > 0 && pm > 0) ang = Math.acos(Math.max(-1, Math.min(1, (Px * cx + Pz * cz) / (cm * pm)))) / DEG;
        }
        const r = curveAt(B.angleRatioCurve, ang);
        vx = F(vx + r * qx * dt); vy = F(vy + r * qy * dt); vz = F(vz + r * qz * dt);
        const k = BSD[a4 || lastAttr] || 1;
        Px = F(Px * k); Py = F(Py * k); Pz = F(Pz * k);
      }
      // the stop rule: the horizontal speed at or below StopVelLen for StopVelFrame frames
      if (F(F(vx * vx) + F(vz * vz)) <= stop2) stopFrames += 1 / N_SUB; else stopFrames = 0;
      const dax = px - ax, daz = pz - az, day = py - ay;
      if (dax * dax + day * day + daz * daz <= G.smallMoveForceStopDistance * G.smallMoveForceStopDistance) smallFrames += 1 / N_SUB;
      else { smallFrames = 0; ax = px; ay = py; az = pz; }
      // gravity, after the friction (the stored v carries its normal part into the next slide)
      let g = a4 === ATTR.green ? gPutt : grav;
      const dc = cupHoriz(px, pz);
      if (sp <= G.velLenForStopGravity && ny >= 0.5 && dc > G.stopGravityDisableDist) {
        const gd = F(g * dt);
        vx = F(vx - F(nx * gd)); vy = F(vy - F(ny * gd)); vz = F(vz - F(nz * gd));
      } else {
        if (dc < G.addGravityHoleDist && sp > G.velLenForStopGravity) g = F(g + holeG(dc));
        vy = F(vy - F(g * dt));
      }
      if (stopFrames >= G.stopVelFrame || smallFrames >= G.smallMoveForceStopFrame) {
        outcome = "rest"; restAttr = a4 || lastAttr;
        if (traceEvery) path.push([tick, px, py, pz, 0, a4]);
        break;
      }
    }
    if (!firstContact && py - start[1] > apex) apex = py - start[1];
    if (py < G.forceStopPosY) { outcome = "fell"; break; }
    if (traceEvery && tick % traceEvery === 0) path.push([tick, px, py, pz, mode, a4]);
    if (onTick) onTick({ tick, p: [px, py, pz], v: [vx, vy, vz], mode, a4, a8, n: [nx, ny, nz], hop, P: [Px, Py, Pz], leaf: leafCount, groundCount });
  }
  if (!outcome) outcome = "timeout";
  // holed: a tick's contact was Cup (the ghost run marks it so and stops there; the real ball raises the cup-in
  // event); a ball on the lip (Cupside) is not
  if (holedTick != null && outcome !== "water" && outcome !== "OB") outcome = "holed";
  if (outcome === "rest") {
    if (restAttr === ATTR.cup) outcome = "holed";
    else if (cup && cupHoriz(px, pz) < P.cup.rimRadiusM && py < cup.y + P.cup.depthM - R) outcome = "holed";
    else if (waterY != null) outcome = "water";
    else if (restAttr === ATTR.ob || restAttr === ATTR.sandOb) outcome = "OB";
  }
  const hx = Math.sin(headingRad), hz = -Math.cos(headingRad);
  const end = (outcome === "water" || outcome === "OB") && hazard ? hazard.pos : [px, py, pz];
  const horiz = (p) => Math.sqrt((p[0] - start[0]) * (p[0] - start[0]) + (p[2] - start[2]) * (p[2] - start[2]));
  const carry = firstContact ? horiz(firstContact.pos) : horiz([px, py, pz]);
  const stop = horiz([px, py, pz]);
  return {
    club, power, pct: pctOf(power), v0,
    carry, carryYd: carry / M_PER_YD, stop, stopYd: stop / M_PER_YD,
    rest: [px, py, pz], restAttr, lateral: (px - start[0]) * -hz + (pz - start[2]) * hx,
    apex, flightTicks: firstContact ? firstContact.tick : tick, firstContact, bounces, rollTick, ticks: tick,
    holed: outcome === "holed", holedTick, outcome, hazard, end, pullBack, path, contacts,
    pinHigh, flagHit, flagKick: flagKicked, poleTies,
  };
}
