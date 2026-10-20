// The solver's magnified map (the Map 3x / 4x chips): the map drawn 1.5x or
// 2x the panel's width inside a viewport the size of the fitted map, panned
// by scrolling. This is where it opens: on the ball, with the target in view
// when the two fit, or else on the hole's default line to the pin in use.
// Pure, so Node can test it (tools/test-mapview.mjs).

// the share of the view (per axis) kept between the target and the view's
// edge: the target's ring is r 2.8 + half its 1.1 stroke = 3.35% of the view
// (the marks keep their fitted size when magnified), so 8% shows it whole
// with room around it
export const VIEW_MARGIN = 0.08;

// -> { left, top }: the scroll offsets (CSS px) of a viewW x viewH viewport
// over a map drawn mapW x mapH. ball, target and aim are fractions of the map
// (0-1), target null for none; aim is where the hole's default line ends
// (the pin in use, as App's defaultBearing has it) and stands in for a
// missing target, so a hole opened magnified shows the ball at the margin
// away from the pin with the fairway running up the view, not the ball
// centred with half the view behind it. Per axis: the ball centred, then
// shifted only as far as needed to bring the target VIEW_MARGIN of the view
// inside the edge, and never so far that the ball leaves that margin itself.
// When the two fit (at most the view less both margins apart) the target is
// in view and the ball inside the margins; when they do not, the ball sits
// at the margin away from the target and the view runs as far toward it as
// it can (H7's tee to its BL pin at 3x on a phone: 371 px apart in a 418-px
// view, 20 px too far to fit; centring the tee left the pin 162 px out of
// view and half the view behind the tee, this shows it 14 px inside the
// top). Clamped to the scrollable range, which keeps a target that fitted in
// view. No ball: the target, else the map's centre (the aim is not used).
export function scrollFor({ viewW, viewH, mapW, mapH, ball, target = null, aim = null, margin = VIEW_MARGIN }) {
  const focus = ball ?? target ?? { x: 0.5, y: 0.5 };
  const to = ball ? target ?? aim : null;
  const axis = (view, size, b, t) => {
    const bp = b * size, m = margin * view;
    let s = bp - view / 2;
    if (t != null) {
      const tp = t * size;
      if (tp > s + view - m) s = Math.min(tp - view + m, bp - m);
      else if (tp < s + m) s = Math.max(tp - m, bp - view + m);
    }
    return Math.min(Math.max(0, size - view), Math.max(0, s));
  };
  return {
    left: axis(viewW, mapW, focus.x, to?.x ?? null),
    top: axis(viewH, mapH, focus.y, to?.y ?? null),
  };
}
