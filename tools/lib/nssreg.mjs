// NSS world <-> the app's map frame, and NSS world <-> WSR's KCL mesh units, per
// hole, from tools/nss-registration.json (written by tools/nss-export.mjs).
//
// NSS world: metres, y up, -z toward the green (minimap up), one frame per hole
// (origin = the hole's own, y 0 = the WSR player start's height = the datum of
// public/terrain). The map frame is the app's 250x304 minimap; positions are
// fractions of it (fx = px / 250, fy = py / 304), y down.
//
//   px = a*x - b*z + tx,  py = b*x + a*z + ty     (a proper similarity, no flip)
//   mesh = unitsPerM * nss + O,  O = [originMesh[0], originMeshY, originMesh[1]]
//
// a, b, tx, ty are the per-hole fit of the NSS tree bones on WSR's PMP trees
// (pins.json transform, the one transform the cups, the platform slots, the
// local tee and course3d share: INTEGRATION.md D1). unitsPerM is 10 (WSR's
// 1 unit = 0.1 m; the fit gives 9.9979-10.0002, kept as unitsPerMFit).
//
// All doubles. Norms use Math.sqrt, never Math.hypot (whose bits are
// engine-defined), so a generator's output is the same on every machine.

export const MAP_W = 250, MAP_H = 304;
export const M_PER_YD = 0.9144;

// one hole's entry of tools/nss-registration.json (its `holes` keyed "1".."21")
export function regOf(json, hole) {
  const r = json?.holes?.[String(hole)];
  if (!r) throw new Error(`nss-registration: no hole ${hole}`);
  return r;
}

// NSS world (x, z) metres -> map px
export function nssToPx(reg, x, z) {
  return { px: reg.a * x - reg.b * z + reg.tx, py: reg.b * x + reg.a * z + reg.ty };
}

// NSS world (x, z) metres -> map fractions
export function nssToMap(reg, x, z) {
  const { px, py } = nssToPx(reg, x, z);
  return { x: px / MAP_W, y: py / MAP_H };
}

// map fractions -> NSS world [x, z] metres (the inverse similarity)
export function mapToNss(reg, fx, fy) {
  const det = reg.a * reg.a + reg.b * reg.b;
  const dx = fx * MAP_W - reg.tx, dy = fy * MAP_H - reg.ty;
  return [(reg.a * dx + reg.b * dy) / det, (-reg.b * dx + reg.a * dy) / det];
}

// map px per NSS metre, and yd per map px
export const pxPerM = (reg) => Math.sqrt(reg.a * reg.a + reg.b * reg.b);
export const ydPerPx = (reg) => 1 / (pxPerM(reg) * M_PER_YD);

// NSS world [x, y, z] metres -> WSR KCL mesh units [X, Y, Z]
export function nssToMesh(reg, p) {
  const u = reg.unitsPerM;
  return [u * p[0] + reg.originMesh[0], u * p[1] + reg.originMeshY, u * p[2] + reg.originMesh[1]];
}

// WSR KCL mesh units [X, Y, Z] -> NSS world [x, y, z] metres
export function meshToNss(reg, P) {
  const u = reg.unitsPerM;
  return [(P[0] - reg.originMesh[0]) / u, (P[1] - reg.originMeshY) / u, (P[2] - reg.originMesh[1]) / u];
}

// the map bearing (deg, north-up, clockwise; 0 = map up, 90 = map right) of an
// NSS world direction (dx, dz), in [0, 360)
export function bearingOf(reg, dx, dz) {
  const dpx = reg.a * dx - reg.b * dz, dpy = reg.b * dx + reg.a * dz;
  const deg = (Math.atan2(dpx, -dpy) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

// a platform-local point (x right-of-player negative / left positive, y up,
// z forward) -> NSS world, for a platform posed at `origin` with yaw `yawDeg`
// (the Glf_RotateOBJ bone's Euler Y): world = origin + Ry(yaw) * local,
// Ry = [[cos, 0, sin], [0, 1, 0], [-sin, 0, cos]]
export function platformToWorld(origin, yawDeg, local) {
  const t = (yawDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [origin[0] + c * local[0] + s * local[2], origin[1] + local[1], origin[2] - s * local[0] + c * local[2]];
}
