"use strict";
// Where does the cat end up if it keeps doing what it is doing?
//
// A faithful replay of updateCatSprite.ts plus kontra's advance(), used to answer
// one question while airborne: is the CURRENT action already heading for a safe
// landing? If it is, the model is not re-asked, and the committed arc is allowed
// to finish.
//
// Why that matters: the airborne re-decide (cadence.cjs) fixed a real bug, but it
// also let the cat reverse direction mid-flight on a coin-flip. Measured on level
// 3, the cat reversed direction on 39.6% of airborne decisions with the gems
// almost straight overhead, climbed 42px in 3000 steps, and never took a gem. On
// level 2, where the targets are clearly lateral, the reversal rate was 7.5% and
// the level cleared. Committing to a good arc is what the unbounded-cadence bug
// was accidentally providing.
//
// This module only ever SUPPRESSES a question, and only when the geometry says
// the path is fine. Anything uncertain returns null and the caller asks the model.
const CFG = require("./physics.cjs");
const LEVELS = require("./level_data.cjs");

const PLAT_HALF_W = CFG.platformWidth / 2;
const PLAT_TOP_OFF = CFG.platformHeight * CFG.platformAnchorY;
const PLAT_BOT_OFF = CFG.platformHeight * (1 - CFG.platformAnchorY);

function platformBoxes(level) {
  return LEVELS.platforms(level).map(([x, y]) => ({
    x, y,
    left: x - PLAT_HALF_W, right: x + PLAT_HALF_W,
    top: y - PLAT_TOP_OFF, bot: y + PLAT_BOT_OFF,
  }));
}

// getCatCollisionObject(): a 1px-wide column from head (y - height) to feet (y).
function overlaps(cx, cy, catHeight, p) {
  return cx < p.right && cx + 1 > p.left && cy - catHeight < p.bot && cy > p.top;
}

// Simulate holding `action` from (x, y). Returns {outcome, x, y, frames}:
//   "landed" - grounded on a platform (includes the side-snap, which the game
//              applies to ANY overlap while dy >= 0, not just a landing from above)
//   "laser"  - the closing box reaches the cat first
//   "void"   - falls past every platform
//   "timeout"- did not resolve within maxFrames (treated as unknown by callers)
function simulate(level, x, y, dy, catHeight, action, movingFrames, opts = {}) {
  const maxFrames = opts.maxFrames || 240;
  const plats = platformBoxes(level);
  const goLeft = action.includes("left");
  const goRight = action.includes("right");
  const wantJump = action.includes("jump");
  let grounded = opts.grounded !== undefined ? opts.grounded : dy === 0;
  let jumped = false;
  let mf = movingFrames;

  for (let f = 1; f <= maxFrames; f++) {
    // Moving horizontally un-grounds the cat; the collision pass may re-ground it.
    if (goLeft || goRight) grounded = false;
    if (dy >= 0) {
      for (const p of plats) {
        if (overlaps(x, y, catHeight, p)) { grounded = true; y = p.y; dy = 0; break; }
      }
    }
    const dx = goLeft ? -CFG.catWalkSpeed : goRight ? CFG.catWalkSpeed : 0;
    if (wantJump && grounded && !jumped) { dy = -CFG.catJumpSpeed; grounded = false; jumped = true; }
    if (grounded) { dy = 0; } else { dy += CFG.catFallingAcceleration; }
    x += dx;
    y += dy;
    if (dx !== 0 || dy !== 0) mf += 1;

    // isOutOfLasersBounds / isCollidingWithLaser, in the cat's own time units.
    // Two tests, OR'd, kill the cat (updateCatSprite.ts:65):
    //   isCollidingWithLaser(catCollisionObject)  against the four laser SPRITES
    //   isOutOfLasersBounds(catSprite)            against the four DRONES
    // The four bounds below are the second test, which is why they carry no
    // thickness. But the lethal boundary is the INNER of the two, and the sprites
    // are a half-thickness inside the drones: every laser is anchored on its own
    // drone's centreline on the axis it points along (instances.ts:103-117 --
    // topLeft and bottomRight are anchor {x:0, y:0.5} so their HEIGHT straddles
    // the drone's y, topRight and bottomLeft are anchor {x:0.5, y:0} so their
    // WIDTH straddles the drone's x), and getRandomLaserSize redraws that
    // dimension every frame from Math.random, unseeded. So inset each bound by
    // the half thickness, on the axis its sprite is anchored on.
    //
    // maxLaserHalfSize, not an expected-cost figure: at one draw, P(survive) >=
    // 0.8 needs 1.351px, so 1.5 is above it and is CERTAIN rather than
    // probabilistic -- no draw can exceed it, and the gap is under one frame of
    // laser travel. Keep this equal to the term jumpClearanceNeeded uses in
    // decision.cjs, or the two files disagree about which jumps are survivable.
    //
    // The TOP bound is the only one of the four that spans several frames of the
    // arc, so it is worth being explicit that the peak alone binds. Per frame, the
    // clearance above the top drone that the cat must have had at launch is the
    // rise so far plus the laser descent so far:
    //     f=15  54.00 + 3.00 = 57.0
    //     f=16  54.40 + 3.20 = 57.6
    //     f=17  54.40 + 3.40 = 57.8   <- peak
    //     f=18  54.00 + 3.60 = 57.6
    //     f=19  53.20 + 3.80 = 57.0
    // Frame 17 is the maximum and every neighbour is strictly below it, so
    // surviving the peak on the thickest possible draw survives the whole arc.
    // That is what jumpClearanceNeeded computes: 54.4 + 0.2 * 17 + 1.5 = 59.3px.
    //
    // An earlier version of this comment claimed the neighbouring frames needed
    // 2.3 rather than 1.5, by adding their 0.8px gap below the peak to the half
    // thickness. That is backwards: being 0.8px below the peak means needing
    // 0.8px LESS clearance, so adding it double-counted. See
    // driver/team/PREDICTION_arc_inset.md.
    const top = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
    const bottom = CFG.maximumLaserY - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
    const left = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
    const right = 359 - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
    if (y >= bottom || y - catHeight <= top || x <= left || x >= right) {
      return { outcome: "laser", x, y, frames: f };
    }
    if (grounded && f > 1 && (jumped || !wantJump)) return { outcome: "landed", x, y, frames: f };
    if (y > 420) return { outcome: "void", x, y, frames: f };
  }
  return { outcome: "timeout", x, y, frames: maxFrames };
}

// Which platform is at (x, y)? Returns a stable key, or null.
// Uses the same 1px-wide collision box as the game, not a plain x-in-span test:
// the cat stands at x=73.25 on a platform whose left edge is 74, because its box
// spans 73.25..74.25 and overlaps. A span test calls that "no platform" and the
// departure platform is then never recognised.
function platformKeyAt(level, x, y, tol = 14) {
  for (const p of platformBoxes(level)) {
    if (x < p.right && x + 1 > p.left && Math.abs(p.y - y) <= tol) return `${p.x},${p.y}`;
  }
  return null;
}

// Is the cat still standing on a platform at this point?
//
// This is the game's own collision test, `overlaps`, applied at the position the
// arc actually returns. `platformKeyAt` is deliberately NOT used: it accepts a
// vertical tolerance (tol = 14) instead of the real platform band, so it answers
// "which floor is this near" rather than "is the cat on it".
//
// simulate() returns the position AFTER the landing frame's horizontal move, so
// the x it hands back is not the x that satisfied the platform test. A cat that
// was still on the platform when it was grounded can walk off it during that
// same frame, and then be reported as "landed" at a position with nothing under
// it. That is a real failure, not a near miss, so the question has to be asked
// of the returned point.
function standingOn(level, x, y, catHeight) {
  const plats = platformBoxes(level);
  for (let i = 0; i < plats.length; i++) {
    if (overlaps(x, y, catHeight, plats[i])) return true;
  }
  return false;
}

// Is the cat's CURRENT airborne action already heading somewhere safe?
// true  -> keep going, do not spend a model call
// false -> the held action ends badly, ask the model so it can steer
// null  -> unknown (missing data, timeout): ask.
//
// It deliberately does NOT care whether the arc returns to the platform the cat
// departed from. Denying the hold to return arcs was tried and reverted: it fixed
// a level-2 edge livelock but regressed level 3 from 3 deaths / 178 decisions
// (cleared) to 16 deaths / 543 decisions (failed), because forcing a re-decide on
// every returning arc reintroduces exactly the mid-air flip-flop the hold exists to
// prevent. The level-2 livelock is handled where it belongs: by letting the
// revisit escalation actually fire before the stall detector aborts the run.
//
// What it DOES now check, after simulate() says "landed", is `standingOn` at the
// returned point. That is independent of the returning-arc rule above: a returning
// arc still returns true, because its landing point is standing. What it stops is
// a landing with nothing under it, which used to be reported as safe and therefore
// extended the hold for the whole fall.
function heldActionIsSafe(snap, action) {
  if (!snap || snap.onPlatform) return null;
  const h = snap.cat && snap.cat.height;
  if (!h) return null;
  if (typeof snap.level !== "number") return null;
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : null;
  if (mf == null || !isFinite(mf)) return null;
  // HOLD_FIX: in the air a jump action is only its steering. Simulated whole, a
  // held jump_left jumps again on landing, so no jump in flight was ever safe.
  const air = process.env.HOLD_FIX === "1" ? action.replace(/^jump_?/, "") || "none" : action;
  const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, air, mf, { grounded: false });
  if (r.outcome === "landed") return standingOn(snap.level, r.x, r.y, h);
  if (r.outcome === "laser" || r.outcome === "void") return false;
  return null;
}

module.exports = { simulate, platformBoxes, platformKeyAt, heldActionIsSafe };
