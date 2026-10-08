"use strict";
// Which platforms can the cat still get to from where it is standing?
//
// The driver already tells the model where every gem is. It does not tell it
// whether a gem can still be reached, and the model cannot derive that: it would
// have to integrate a jump arc and compare it against a platform's height, which
// is arithmetic, not next-token pattern matching.
//
// Level 4 is the case that forced this. Its lower platforms are a ONE-WAY TRIP:
//
//   P(121,93)  -> P(182,241), P(225,93)
//   P(225,93)  -> P(121,93), P(289,171), P(182,241)
//   P(289,171) -> P(225,93)
//   P(182,241) -> P(105,180)
//   P(105,180) -> P(182,241)
//
// gem_a sits on P(289,171). Once the cat descends to P(182,241) or P(105,180)
// there is no edge back up, so gem_a is gone and the level is lost. The cat then
// spent ~30 decisions walking toward it and off the edge at x=208, dying at
// x=217..228 in 11 of 13 attempts, because nothing in its state said so.
//
// This is observable geometry, computed from the same validated simulator the
// hold and the hop points use. It states a property; it does not pick a route.
const { simulate, platformBoxes } = require("./arc.cjs");
const CFG = require("./physics.cjs");
const PLAT_TOP = CFG.platformHeight * CFG.platformAnchorY;
const PLAT_BOT = CFG.platformHeight * (1 - CFG.platformAnchorY);

const CAT_H_DEFAULT = 18;
const graphCache = new Map(); // level -> {runs, edges}

// Contiguous platforms at the SAME height are one floor: the cat walks between
// them freely. Modelling each platform as its own node was wrong and produced a
// FALSE fact. On level 2 the five y=64 platforms merge into one floor spanning
// x 74..286, and the only ways down are its two ENDS. Simulating launches from
// within a single platform's span never reaches an end, so the graph reported no
// route to the lower gems -- on a level the cat clears routinely.
function runsOf(level) {
  const plats = platformBoxes(level);
  const byY = new Map();
  for (const p of plats) {
    if (!byY.has(p.y)) byY.set(p.y, []);
    byY.get(p.y).push(p);
  }
  const runs = [];
  for (const [y, list] of byY) {
    list.sort((a, b) => a.left - b.left);
    let cur = null;
    for (const p of list) {
      if (cur && p.left <= cur.right + 1) cur.right = Math.max(cur.right, p.right);
      else { cur = { y, left: p.left, right: p.right }; runs.push(cur); }
    }
  }
  return runs;
}

function runKey(r) { return `floor(${Math.round(r.left)}..${Math.round(r.right)}@${r.y})`; }

function runAt(level, x, y, tol = 14) {
  for (const r of runsOf(level)) {
    if (x < r.right && x + 1 > r.left && Math.abs(r.y - y) <= tol) return r;
  }
  return null;
}

// Landings reachable from one launch point WITH AIR CONTROL. Vertical motion is
// fixed once airborne; horizontal is free at +/-catWalkSpeed per frame, so the
// reachable x at frame f is the interval [x0 - v*f, x0 + v*f]. Simulating HELD
// actions instead under-reports badly: stepping off level 2's left end and
// steering reaches the 84..136 floor, which a held "left" flies straight past, and
// the graph then claimed no route to gems the cat collects on every clear.
//
// opts.dir   "left" | "right" | undefined. UNDEFINED IS THE ENVELOPE, both sides,
//            which is the right model for "can this hop be made from SOMEWHERE on
//            this floor" and the wrong one for "can the cat make it from where it
//            stands, holding which way": the envelope accepts a landing any held
//            direction could reach, so on level 11 it says the y231 run reaches the
//            y211 run from anywhere, while a direction-specific integration finds
//            the hop works from x 145..170 holding LEFT and fails from 180, 190,
//            197 -- more than half that run. Both are right about what they measure.
//            A direction narrows the interval to one side and nothing else, so
//            there is ONE vertical integration here rather than two.
// opts.box   {left, right, top, bot} tested as an extra hit target, reported in
//            the returned set under opts.boxKey. GENERIC ON PURPOSE: the caller
//            owns the box, because a box belongs to a game object and the one this
//            exists for (a gem) already has its half-extent as a constant in
//            decision.cjs. Copying that number here would be a second source for a
//            figure three bounds in this project have already got wrong by hand.
//
//            A box is NOT a landing and gets NEITHER of the two conditions a run
//            gets. Not the descending one (dy < 0), because the game's test is
//            collides(catCollisionObject, gem) with no direction in it: the cat's
//            box is head-to-feet against the gem's sprite, and a rising cat whose
//            head is level with the gem collects it. Not the run-band one either,
//            for the same reason -- the gem's box is its own, not a platform's.
//            A collect is not a landing, and conflating them marks a hop possible
//            on a condition the game never applies.
function landingsFrom(level, runs, x0, y0, jump, catHeight, opts) {
  const o = opts || {};
  const dir = o.dir || null;
  const box = o.box || null;
  const boxKey = o.boxKey || "box";
  const out = new Set();
  let dy = jump ? -CFG.catJumpSpeed : 0;
  let y = y0;
  for (let f = 1; f <= 200; f++) {
    dy += CFG.catFallingAcceleration;
    y += dy;
    if (y > 420) break;
    // ONE FRAME BEHIND. The horizontal budget at vertical frame f is f-1 frames of
    // walking, not f: the launch frame applies the jump and the position update
    // without a horizontal step. Measured against 179 airborne samples from real
    // runs (levels 2, 3, 4), the vertical frame index matches the horizontal index
    // plus one in 119 cases against 1 for no offset; the rest are arcs that
    // reversed direction mid-flight, where |dx| is not monotonic in f.
    // Without this the model over-reports reach by 1.75px, which is exactly the
    // width that decides a boundary case: it claimed a jump from (285.5,171) on
    // level 4 grazes the floor at y=93, and the cat fell past it every time.
    const span = CFG.catWalkSpeed * (f - 1);
    const lo = dir === "right" ? x0 : x0 - span;
    const hi = dir === "left" ? x0 : x0 + span;
    const head = y - catHeight;
    // Same band test as the run below, against the box's own edges.
    //
    // The horizontal test carries the cat's 1px column -- `hi + 1 > box.left`, not
    // `hi >= box.left` -- because the game's own call is collides(catCollisionObject,
    // gem) and getCatCollisionObject returns a 1px-wide column (arc.cjs:34-37 uses
    // `cx < p.right && cx + 1 > p.left` for the same reason). On a 52px platform the
    // slop is invisible; on a 16px gem box at the arc's end it decides, and it is
    // the difference between reaching gem_a from x=117 and only from x=120. The RUN
    // test below deliberately keeps the older `hi >= r.left` form: that convention
    // is the one the graph was measured against over 179 airborne samples, and
    // changing it would move every level. Two conventions, one per test, each for a
    // stated reason -- do not "tidy" one into the other.
    if (box && head < box.bot && y > box.top && hi + 1 > box.left && lo < box.right) out.add(boxKey);
    if (dy < 0) continue;              // only snaps while moving down
    for (const r of runs) {
      // The floor's collision band, same as the platform box.
      if (!(head < r.y + PLAT_BOT && y > r.y - PLAT_TOP)) continue;
      if (hi < r.left || lo > r.right) continue;
      out.add(runKey(r));
    }
  }
  return out;
}

function graph(level, catHeight) {
  if (graphCache.has(level)) return graphCache.get(level);
  const runs = runsOf(level);
  const edges = {};
  for (const r of runs) {
    const out = new Set();
    for (let x = r.left; x <= r.right; x += 2) {
      for (const jump of [true, false]) {
        for (const k of landingsFrom(level, runs, x, r.y, jump, catHeight)) {
          if (k !== runKey(r)) out.add(k);
        }
      }
    }
    edges[runKey(r)] = [...out];
  }
  const g = { runs, edges };
  graphCache.set(level, g);
  return g;
}

function platformKeyUnder(level, x, y, tol = 14) {
  const r = runAt(level, x, y, tol);
  return r ? runKey(r) : null;
}

// Transitive closure, including the starting floor.
function reachableFrom(level, startKey, catHeight = CAT_H_DEFAULT) {
  const { edges } = graph(level, catHeight);
  if (!startKey || !edges[startKey]) return null;
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    for (const next of edges[queue.shift()] || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

// The floor a point sits on or just above (a gem hovers ~15px over its floor).
// tol is generous: level 2's gems float ~51px above the floor below them and are
// taken in flight, not from a standing position.
function platformHolding(level, x, y, tol = 70) {
  let best = null, bestD = Infinity;
  for (const r of runsOf(level)) {
    if (!(x >= r.left - 1 && x <= r.right + 1)) continue;
    const dy = r.y - y;
    if (dy < -1 || dy > tol) continue;
    if (dy < bestD) { bestD = dy; best = r; }
  }
  return best ? runKey(best) : null;
}

module.exports = { graph, runsOf, reachableFrom, platformKeyUnder, platformHolding, landingsFrom, runKey };
