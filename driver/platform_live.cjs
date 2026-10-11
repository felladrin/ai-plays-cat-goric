"use strict";
// Live platform width (SHRINK_GEOM, gated, off by default).
//
// The game shrinks a platform while it touches a laser and the driver's geometry
// did not: checkPlatformsCollisionWithLasers.ts lowers scaleX by 0.01 per frame
// while the platform's hand-made 40x8 laser box overlaps a laser sprite, and
// destroys it at scale 0 or when its centre leaves the laser bounds. The cat
// collides with the 52x16 sprite, whose width is 52 * scaleX about the centre
// (kontra getWorldRect). For a side laser the box edge tracks the beam exactly,
// 20px * 0.01 = 0.2px per frame = droneSpeed, so the scale is a function of the
// laser clock alone. The beam's inner edge sits a half-thickness inside the drone
// line; minLaserHalfSize matches the probe (experiments/probe_platform_shrink.cjs,
// L10 tower x 330: 0.83 at mf 59 and 0.63 at mf 79, this formula 0.82 and 0.62).
// Top and bottom beams shrink a platform 0.01 per frame from first contact,
// approximated here by moving frames (an idle frame in contact shrinks it too).
//
// Every per-decision geometry reader takes the clock from setClock, which the
// runners call after each state read. With the gate on and no clock set, the
// readers throw: a silent full-width default is the bug this module removes.
const CFG = require("./physics.cjs");

let clockMf = null;

function enabled() {
  return process.env.SHRINK_GEOM === "1";
}

function setClock(mf) {
  if (mf != null && !Number.isFinite(mf)) throw new Error(`platform_live.setClock: bad movingFrames ${mf}`);
  clockMf = mf;
}

function clock() {
  if (clockMf == null) throw new Error("platform_live: SHRINK_GEOM=1 but no laser clock was set for this decision");
  return clockMf;
}

function scaleAt(x, y, mf) {
  const d = CFG.droneSpeed * mf;
  if (x <= 1 + d || x >= 359 - d || y <= 1 + d || y >= CFG.maximumLaserY - d) return 0;
  const h = CFG.minLaserHalfSize;
  let s = Math.min(1, (359 - d - h - x) / 20, (x - 1 - d - h) / 20);
  const contact = Math.min((y - 4 - 1 - h) / CFG.droneSpeed, (CFG.maximumLaserY - h - (y + 4)) / CFG.droneSpeed);
  if (mf > contact) s = Math.min(s, 1 - 0.01 * (mf - contact));
  return Math.max(0, s);
}

// Scale of platform (x, y) at `mf`, or at the decision's clock when mf is omitted.
// 1 when the gate is off.
function scale(x, y, mf) {
  if (!enabled()) return 1;
  return scaleAt(x, y, mf == null ? clock() : mf);
}

module.exports = { enabled, setClock, clock, scaleAt, scale };
