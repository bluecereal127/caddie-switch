// Power-gauge fill measurement.
//
// Calibration-based: from one EMPTY gauge frame (address) and one FULL gauge
// frame (maxed 4.0 swing on tee/fairway), we store the median RGB of every
// scanline in the gauge ROI for both states. At ingest time each scanline is
// classified by whichever reference it is closer to; fill fraction = filled
// lines / total, and power = fraction * 4 (gauge is 4 bars, linear).
//
// This sidesteps needing to know the gauge's exact colors/gradient up front —
// the two calibration frames ARE the color model, per scanline position.
import { cropFrac, lineMedianRGB, colorDist } from "./image.mjs";

export function gaugeProfile(img, roi) {
  const crop = cropFrac(img, roi.rect);
  const axis = roi.axis ?? "y";
  const n = axis === "y" ? crop.height : crop.width;
  const prof = [];
  for (let i = 0; i < n; i++) prof.push(lineMedianRGB(crop, axis, i));
  return prof;
}

// cal = { empty: [[r,g,b],...], full: [[r,g,b],...] } from calibrate-gauge.mjs
// Returns { power, fillFrac, confidence } — confidence is the mean margin
// between the two reference distances, normalized; low values mean the frame
// probably isn't showing a locked gauge at all.
export function readGauge(img, roi, cal) {
  const prof = gaugeProfile(img, roi);
  const n = Math.min(prof.length, cal.empty.length, cal.full.length);
  const filled = new Array(n);
  let marginSum = 0;
  for (let i = 0; i < n; i++) {
    const dE = colorDist(prof[i], cal.empty[i]);
    const dF = colorDist(prof[i], cal.full[i]);
    filled[i] = dF < dE ? 1 : 0;
    marginSum += Math.abs(dE - dF);
  }
  // Fill grows from one end (fillFrom). Count the contiguous filled run from
  // that end rather than raw sum, so stray misclassified lines mid-gauge
  // don't inflate the reading.
  const fromEnd = (roi.fillFrom ?? "bottom") === "bottom" || roi.fillFrom === "right";
  let run = 0;
  if (fromEnd) { for (let i = n - 1; i >= 0 && filled[i]; i--) run++; }
  else { for (let i = 0; i < n && filled[i]; i++) run++; }
  const fillFrac = run / n;
  return {
    power: +(fillFrac * 4).toFixed(2),
    fillFrac,
    confidence: marginSum / n / 255,
    rawFilledLines: filled.reduce((a, b) => a + b, 0),
    lines: n,
  };
}
