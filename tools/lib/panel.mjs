// Minimap panel geometry. The HUD is fixed, so the panel rect is constant per
// resolution; PANEL is measured from real 1280x720 captures and stored
// fractionally. probePanel() refines the exact border on a given frame by
// scanning for the panel's light rounded border near the expected edges.
import { px } from "./image.mjs";

// [x, y, w, h] fractional — measured seed, refined by probePanel
export const PANEL = [0.7805, 0.3236, 0.1977, 0.4264];

// Consensus interior rect from probing real 720p frames: [1001,234]..[1251,538]
// (250x304). Probing occasionally fails when map art touches the border, and
// median-stacking needs EXACT alignment across frames, so extractors use this
// fixed rect (scaled fractionally for other resolutions).
export function panelRect(img) {
  const s = img.width / 1280;
  return { x0: Math.round(1001 * s), y0: Math.round(234 * s), x1: Math.round(1251 * s), y1: Math.round(538 * s) };
}

const isBorder = (p) => p[0] > 215 && p[1] > 225 && p[2] > 215;

// Scan outward/inward around the seed rect to lock onto the border lines.
// Returns pixel rect {x0, y0, x1, y1} of the panel INTERIOR.
export function probePanel(img) {
  const seedX0 = Math.round(PANEL[0] * img.width);
  const seedY0 = Math.round(PANEL[1] * img.height);
  const seedX1 = seedX0 + Math.round(PANEL[2] * img.width);
  const seedY1 = seedY0 + Math.round(PANEL[3] * img.height);
  const midY = (seedY0 + seedY1) >> 1, midX = (seedX0 + seedX1) >> 1;

  const findEdge = (fixed, from, to, axis) => {
    const step = from < to ? 1 : -1;
    for (let v = from; v !== to; v += step) {
      const p = axis === "x" ? px(img, v, fixed) : px(img, fixed, v);
      if (isBorder(p)) return v;
    }
    return null;
  };
  // search +-12px around each seed edge for the bright border, then step
  // inside it until the border ends
  const inside = (edge, dir, fixed, axis) => {
    if (edge == null) return null;
    let v = edge;
    while (true) {
      const n = v + dir;
      const p = axis === "x" ? px(img, n, fixed) : px(img, fixed, n);
      if (!isBorder(p)) return n;
      v = n;
    }
  };
  const lx = inside(findEdge(midY, seedX0 - 12, seedX0 + 12, "x"), 1, midY, "x");
  const rx = inside(findEdge(midY, seedX1 + 12, seedX1 - 12, "x"), -1, midY, "x");
  const ty = inside(findEdge(midX, seedY0 - 12, seedY0 + 12, "y"), 1, midX, "y");
  const by = inside(findEdge(midX, seedY1 + 12, seedY1 - 12, "y"), -1, midX, "y");
  if (lx == null || rx == null || ty == null || by == null) {
    // fall back to the seed rect
    return { x0: seedX0, y0: seedY0, x1: seedX1, y1: seedY1, probed: false };
  }
  return { x0: lx, y0: ty, x1: rx, y1: by, probed: true };
}

export function cropRect(img, r) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const src = ((r.y0 + y) * img.width + r.x0) * 4;
    img.data.copy(out.data, y * w * 4, src, src + w * 4);
  }
  return out;
}
