"use strict";
// Is an action CERTAIN death, whatever the model does afterwards?
//
// legalActions already prunes a jump that provably hits the ceiling, on the rule
// that an action which cannot help does not belong on the menu. This extends the
// same rule to every action: play the action for the frames the runner commits to
// it (cadence.cjs), then ask whether ANY later steering can still land the cat on
// a platform before a laser reaches it. If none can, the action is fatal.
//
// It never ranks survivable actions and says nothing about objectives, so it is
// not Arm D (docs/dead-ends.md): that one judged options by progress toward a goal
// and removed a load-bearing move. A move that survives stays on the menu even
// when it leads away from every gem.
//
// Every bound leans towards "survivable", so a prune is a certainty, not a guess:
//   - the reachable x after the commit is the continuous interval [x0 - v*f,
//     x0 + v*f], a superset of the lattice of positions the cat can occupy;
//   - lasers use minLaserHalfSize, the thinnest beam the game can draw;
//   - a landing anywhere counts as survival, even on a floor about to burn.
const CFG = require("./physics.cjs");
const { platformBoxes } = require("./arc.cjs");
const { AIR_REDECIDE_FRAMES, WALK_FRAMES } = require("./cadence.cjs");

const MAX_FRAMES = 240;

function bounds(mf) {
  const d = CFG.droneSpeed * mf + CFG.minLaserHalfSize;
  return { top: 1 + d, bottom: CFG.maximumLaserY - d, left: 1 + d, right: 359 - d };
}

// One frame of updateCatSprite, in the order arc.simulate replays it.
// Returns the new state, or {dead} / {landed}.
function stepFrame(plats, s, h, dir, wantJump) {
  let { x, y, dy, grounded, mf, jumped } = s;
  if (dir) grounded = false;
  if (dy >= 0) {
    for (const p of plats) {
      if (x < p.right && x + 1 > p.left && y - h < p.bot && y > p.top) { grounded = true; y = p.y; dy = 0; break; }
    }
  }
  if (wantJump && grounded && !jumped) { dy = -CFG.catJumpSpeed; grounded = false; jumped = true; }
  if (grounded) dy = 0; else dy += CFG.catFallingAcceleration;
  const dx = dir === "left" ? -CFG.catWalkSpeed : dir === "right" ? CFG.catWalkSpeed : 0;
  x += dx;
  y += dy;
  if (dx !== 0 || dy !== 0) mf += 1;
  const b = bounds(mf);
  if (y >= b.bottom || y - h <= b.top || x <= b.left || x >= b.right) return { dead: true };
  return { x, y, dy, grounded, mf, jumped };
}

// From an airborne state with free steering: can any trajectory land?
// With `hits`, keeps going and collects every platform some trajectory lands on.
// `carry` is the direction still applied on the first free frame (input lag).
function canStillLand(plats, s, h, hits, carry) {
  let { y, dy, mf } = s;
  let lo = s.x, hi = s.x;
  for (let f = 1; f <= MAX_FRAMES; f++) {
    if (dy >= 0) {
      for (const p of plats) {
        if (hi + 1 > p.left && lo < p.right && y - h < p.bot && y > p.top) {
          if (!hits) return true;
          hits.add(p);
        }
      }
    }
    dy += CFG.catFallingAcceleration;
    y += dy;
    if (f === 1 && carry !== undefined) {
      const c = carry === "left" ? -CFG.catWalkSpeed : carry === "right" ? CFG.catWalkSpeed : 0;
      lo += c;
      hi += c;
    } else {
      lo -= CFG.catWalkSpeed;
      hi += CFG.catWalkSpeed;
    }
    mf += 1;
    const b = bounds(mf);
    if (y >= b.bottom || y - h <= b.top) break;
    lo = Math.max(lo, b.left);
    hi = Math.min(hi, b.right);
    if (lo > hi) break; // a single point (lo === hi, after a carried frame) is still a position
  }
  return hits ? hits.size > 0 : false;
}

// action: left | right | none | jump | jump_left | jump_right
// Frames committed per cadence.cjs: walk K, jump 1 + AIR_REDECIDE_FRAMES,
// airborne AIR_REDECIDE_FRAMES.
function isFatal(snap, action, K = WALK_FRAMES) {
  const h = snap.cat.height;
  if (!(h > 0)) throw new Error(`survival.isFatal: cat height ${h}`);
  if (!snap.drones || !snap.drones.tl) throw new Error("survival.isFatal: snapshot has no drones");
  const plats = platformBoxes(snap.level);
  const dir = /left/.test(action) ? "left" : /right/.test(action) ? "right" : null;
  const wantJump = /jump/.test(action);
  const frames = !snap.onPlatform ? AIR_REDECIDE_FRAMES : wantJump ? 1 + AIR_REDECIDE_FRAMES : K;
  let s = {
    x: snap.cat.x, y: snap.cat.y, dy: snap.onPlatform ? 0 : snap.cat.dy || 0,
    grounded: !!snap.onPlatform, jumped: false,
    mf: (snap.drones.tl.y - 1) / CFG.droneSpeed,
  };
  // The game applies a new steering input one frame late: in the logged airborne
  // decisions `right` after `left` moved +1.75 over 3 frames, not +5.25 (32 of 32),
  // and `right` after `none` +3.5 (26 of 26). So the first frame carries the
  // previous move's direction when the runner knows it.
  const carried = snap.prevMove === undefined ? dir
    : /left/.test(snap.prevMove) ? "left" : /right/.test(snap.prevMove) ? "right" : null;
  for (let f = 0; f < frames; f++) {
    s = stepFrame(plats, s, h, f === 0 ? carried : dir, wantJump);
    if (s.dead) return true;
  }
  if (s.grounded) return false;
  return !canStillLand(plats, s, h, undefined, dir);
}

// The platforms an airborne action can still end on: the action for the
// committed frames, then free steering. Same optimistic bounds as isFatal.
function landingPlatforms(snap, action) {
  if (snap.onPlatform) throw new Error("survival.landingPlatforms: airborne states only");
  const h = snap.cat.height;
  const plats = platformBoxes(snap.level);
  const dir = /left/.test(action) ? "left" : /right/.test(action) ? "right" : null;
  let s = { x: snap.cat.x, y: snap.cat.y, dy: snap.cat.dy || 0, grounded: false, jumped: false, mf: (snap.drones.tl.y - 1) / CFG.droneSpeed };
  for (let f = 0; f < AIR_REDECIDE_FRAMES; f++) {
    const prev = s;
    s = stepFrame(plats, s, h, dir, false);
    if (s.dead) return [];
    if (s.grounded) return plats.filter((p) => s.x < p.right && s.x + 1 > p.left && Math.abs(p.y - s.y) < 1e-6);
  }
  const hits = new Set();
  canStillLand(plats, s, h, hits, dir);
  return [...hits];
}

// Drops the fatal actions from a menu, unless every action is fatal: then the
// menu is left whole, because there is nothing true to choose between.
function pruneFatal(snap, menu, K = WALK_FRAMES) {
  const keep = {};
  for (const [a, label] of Object.entries(menu)) if (!isFatal(snap, a, K)) keep[a] = label;
  return Object.keys(keep).length ? keep : menu;
}

module.exports = { isFatal, pruneFatal, canStillLand, landingPlatforms };
