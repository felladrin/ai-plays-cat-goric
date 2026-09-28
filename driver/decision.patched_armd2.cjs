// Decision construction for the Simple Jev driver.
//
// Two sequential classifier calls per decision (NOT one two-question request,
// because each question in a single request is scored independently against the
// same shared state and cannot see the other's answer):
//
//   Call 1 (OBJECTIVE): which remaining goal to pursue. Criteria are the live
//     gems named by fixed spawn order (gem_a/b/c), plus "portal" once 3 are
//     collected. The state lists every goal with its offset from the cat and its
//     own margin in pixels to the laser closing on it. The MODEL picks the goal.
//
//   Call 2 (MOVE): given the chosen goal, which command to issue. Criteria are
//     ONLY the actions legal in the current state (grounded vs airborne). The
//     MODEL picks the move.
//
// The harness computes no nearest-neighbor, no ranking, no tie-break, no path.
// It only renders observable geometry into text and lists legal actions.

"use strict";

const CFG = require("./config.cjs");

const PORTAL = { x: 180, y: 150 };

// Half the gem sprite's height (getGemAnimations.ts:9-10, frameHeight 16), used to
// decide when a gem lies within the cat's collision box on the floor it stands on.
// NOT a tuned constant: it is half the sprite the game itself collides against.
const GEM_HALF_HEIGHT = 8;

// THE vertical-overlap rule, in one place. Is a target at (target.x, target.y)
// standing on a floor at fy? The cat's collision box is 1px wide and extends
// cat.height UPWARD from its feet (getCatCollisionObject.ts:3-4), and the gem's box
// is y in [ty-8, ty+8] (getGemAnimations.ts:9-10). Overlap needs BOTH edges, so the
// window is ASYMMETRIC -- up to cat.height+8 ABOVE the floor, 8 BELOW it:
//
//   fy - ty <= catHeight + GEM_HALF_HEIGHT   gem's bottom reaches the cat's head
//   fy >= ty - GEM_HALF_HEIGHT                the cat's feet are not above the gem
//
// With cat.height 18 that is [fy-26, fy+8], NOT [fy-8, fy+8]. Do not re-derive this
// at a new call site. Three bounds in this file have been wrong by hand: a one-sided
// version, an invented 36, and a symmetric +/-8 that silently disabled the descent
// annotation on the one level it was written for.
function targetOverlapsFloor(target, fy, catHeight) {
  return fy - target.y <= catHeight + GEM_HALF_HEIGHT && fy >= target.y - GEM_HALF_HEIGHT;
}

// Safe rectangle from the four live drones.
//   left wall  = bottomLeft.x  (increases from 1)
//   right wall = topRight.x    (decreases from 359)
//   top wall   = topLeft.y     (increases from 1)
//   bottom wall= bottomRight.y (decreases from 310)
function safeRect(snap) {
  return {
    left: snap.drones.bl.x,
    right: snap.drones.tr.x,
    top: snap.drones.tl.y,
    bottom: snap.drones.br.y,
  };
}

// Cat margins to each wall, using cat.x and cat.y (feet), matching
// isOutOfLasersBounds exactly.
function catMargins(snap) {
  const r = safeRect(snap);
  const h = snap.cat.height;
  if (!(typeof h === "number" && h > 0)) {
    throw new Error(
      `catMargins: snap.cat.height missing or non-positive (${h}); harness is broken. ` +
        `Refusing to compute head clearance from a silent fallback (would collapse to feet margin).`
    );
  }
  return {
    left: snap.cat.x - r.left,
    right: r.right - snap.cat.x,
    top: snap.cat.y - r.top,
    bottom: r.bottom - snap.cat.y,
    // Head clearance to the top laser. The collision box is getCatCollisionObject,
    // which returns y = catSprite.y - catSprite.height (anchor y=1, so cat.y is
    // the FEET). The part that touches the top laser is the HEAD at cat.y-height.
    // Feet margin (top) overstates headroom by exactly cat.height.
    headTop: snap.cat.y - h - r.top,
  };
}

// A gem is destroyed the moment any laser reaches it. Its margin is the smallest
// distance to any of the four walls.
function gemMargin(gem, snap) {
  const r = safeRect(snap);
  const m = {
    top: gem.y - r.top,
    bottom: r.bottom - gem.y,
    left: gem.x - r.left,
    right: r.right - gem.x,
  };
  let min = Infinity;
  let side = "none";
  for (const k of ["top", "bottom", "left", "right"]) {
    if (m[k] < min) {
      min = m[k];
      side = k;
    }
  }
  return { min, side, all: m };
}

// Moving frames remaining before the closing laser reaches the cat AT ITS CURRENT
// POSITION. Derived from the LIVE drone positions (safeRect) and droneSpeed, not
// from a precomputed mf, so it stays correct if the level state is anything other
// than the nominal start. The cat's collision box is head = y - height to feet = y
// (width ~1 at x). The top laser (r.top) moves DOWN and hits the head; the bottom
// (r.bottom) moves UP and hits the feet; the side lasers hit x. The cat dies when
// the FIRST of these reaches the box, so the countdown is the minimum. This is
// pure observable physics — a clock, not a plan — and it is given for the CURRENT
// position only, never for hypothetical options (a per-option forecast would start
// to look like us evaluating the options for the model).
function framesUntilLaserAtCat(snap) {
  const CFG = require("./physics.cjs");
  const sp = CFG.droneSpeed;
  const r = safeRect(snap);
  const head = snap.cat.y - snap.cat.height;
  const feet = snap.cat.y;
  const cand = [
    { side: "top", frames: (head - r.top) / sp },
    { side: "bottom", frames: (r.bottom - feet) / sp },
    { side: "left", frames: (snap.cat.x - r.left) / sp },
    { side: "right", frames: (r.right - snap.cat.x) / sp },
  ];
  let min = Infinity;
  let side = "none";
  for (const c of cand) if (c.frames < min) { min = c.frames; side = c.side; }
  return { frames: min, side };
}

// Render the countdown line, or "" if it should be suppressed. Relevance rule:
// surface the countdown ONLY when the frames remaining at the cat's CURRENT
// POSITION are FEWER than the frames needed to reach its CURRENT OBJECTIVE by the
// most direct possible route (straight-line distance / catWalkSpeed). That route
// time is a STRICT LOWER BOUND — the cat cannot travel faster than a straight line
// at walking speed — so when remaining < bound, the warning is provable: even by
// the most direct route possible, the objective cannot be reached before the
// laser arrives. This uses only the objective the model has ALREADY chosen (the
// move call's target), so it evaluates no options and ranks nothing. Because the
// bound is deliberately optimistic, we only ever UNDER-warn, never cry wolf — the
// right direction for a fact that has broken two levels by being too eager
// (implied-relevance bug; see HANDOVER).
function countdownLine(snap, target) {
  if (typeof process !== "undefined" && process.env.COUNTDOWN === "0") return "";
  if (!target) return "";
  const CFG = require("./physics.cjs");
  const cd = framesUntilLaserAtCat(snap);
  const remaining = Math.max(0, Math.round(cd.frames));
  const needed = Math.ceil(Math.hypot(target.x - snap.cat.x, target.y - snap.cat.y) / CFG.catWalkSpeed);
  // Only warn when the objective provably cannot be reached in time.
  if (remaining >= needed) return "";
  return `Even by the most direct route possible, the cat cannot reach ${target.name} before the laser: the closing laser reaches the cat in ${remaining} moving frames (from the ${cd.side}), but the objective is at least ${needed} frames away at walking speed.`;
}

// Match live gem positions back to their fixed spawn index (gem_a/b/c).
// Gems never move, so a live gem equals its spawn coordinate exactly.
function matchGemsToSpawn(levelGems, livePositions) {
  const names = ["gem_a", "gem_b", "gem_c"];
  // Match each LIVE gem to its NEAREST spawn coordinate, each spawn used at most
  // once. Robust to anchor/rounding offsets: we no longer require a live gem to
  // sit within a fixed tiny epsilon of its spawn on both axes. A spawn counts as
  // collected only when no live gem maps to it.
  const usedSpawn = new Array(levelGems.length).fill(false);
  const spawnName = (i) => names[i];
  // Greedy nearest: for each live gem, pick the closest not-yet-taken spawn.
  const matched = new Array(levelGems.length).fill(null); // spawnIdx -> live pos
  const live = livePositions.map((p) => ({ x: p.x, y: p.y }));
  // Sort (live, spawn) pairs by distance so nearest assignments win first.
  const pairs = [];
  live.forEach((lp, li) => {
    levelGems.forEach((sp, si) => {
      pairs.push({ li, si, d: Math.hypot(lp.x - sp[0], lp.y - sp[1]) });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const liveTaken = new Array(live.length).fill(false);
  for (const pr of pairs) {
    if (matched[pr.si] == null && !liveTaken[pr.li]) {
      matched[pr.si] = live[pr.li];
      liveTaken[pr.li] = true;
    }
  }
  const alive = [];
  levelGems.forEach((spawn, idx) => {
    if (matched[idx] != null) alive.push({ name: spawnName(idx), x: spawn[0], y: spawn[1] });
  });
  return alive;
}

// Height a jump gains before gravity wins, integrated the same discrete way the
// game steps velocity (never hardcode the derived value — see physics.cjs).
// dy starts at -catJumpSpeed and gains catFallingAcceleration each frame.
function jumpApex() {
  const CFG = require("./physics.cjs");
  // Game integration order, confirmed against the real game: kontra's advance()
  // is `velocity += acceleration; position += velocity` (node_modules/kontra/
  // kontra.js:1435-1443) and updateCatSprite.ts sets dy=-catJumpSpeed then
  // ddy=catFallingAcceleration, so gravity is added BEFORE the position update.
  // The first frame's displacement is therefore -(catJumpSpeed -
  // catFallingAcceleration) = -6.4, NOT -6.8. The previous loop counted the
  // full -6.8 as the first step and over-reported the rise by one gravity step
  // (61.2 vs the true 54.4). That inflated `needed` in jumpHitsCeiling to
  // 64.6px, pruning jumps from the menu in a 6.8px clearance band where the
  // game still permits them -- the structural cause of the L4 B<->C cycle
  // (B->D is jump-only, was pruned from mf>47 where physics allows until
  // mf>81). arc.simulate already uses the game's order; this reconciles
  // jumpApex to it.
  let dy = -CFG.catJumpSpeed;
  let rise = 0;
  let frames = 0;
  while (true) {
    dy += CFG.catFallingAcceleration;
    if (dy >= 0) break;
    rise -= dy;
    frames += 1;
  }
  return { rise, frames };
}

// Diagnostic only, CEILING_TRACE=1, default off so it cannot perturb a measured
// run. Records the numbers the ceiling prune turns on, so a run is diagnosable
// from its own log instead of reconstructed afterwards. `headTop` is measured to
// the top DRONE, but the top laser is a sprite of random thickness (see
// minLaserHalfSize in physics.cjs), so the outcome is not decided by a single
// comparison: `fatalHeadTop` is the clearance below which every possible draw
// kills the cat somewhere in the arc, `safeHeadTop` the clearance at or above
// which no draw can. The 0.75px between them is the model's real uncertainty.
const CEILING_TRACE = !!process.env.CEILING_TRACE;

function ceilingTrace(snap) {
  const CFG = require("./physics.cjs");
  const needed = jumpClearanceNeeded();
  const headTop = catMargins(snap).headTop;
  return {
    headTop,
    needed,
    diff: headTop - needed,
    pruned: jumpHitsCeiling(snap),
    fatalHeadTop: needed - CFG.minLaserHalfSize,
    safeHeadTop: needed,
  };
}

// Clearance the cat's head must have ABOVE THE TOP DRONE for a jump to survive
// with certainty. Three terms, all of them load-bearing, and dropping any one of
// them is what put 9 moving frames of certain death on the L4 menu:
//
//   rise            the cat's own climb, from jumpApex
//   droneSpeed * (frames + 1)
//                   the laser does not stop when the cat's climb does. The
//                   closing gap is at its maximum on frame 17, not 16: by then
//                   the cat's per-frame displacement has already turned positive
//                   (dy = +1.665e-15) so it is falling again, but the laser has
//                   gained another 0.2px. f15..f19 sit within 1.8px of that peak,
//                   with f17 alone at it. Counting `frames` under-counts by 0.2px
//                   on every floor, every frame, always in the unsafe direction.
//   maxLaserHalfSize
//                   getRandomLaserSize redraws the thickness every frame from
//                   Math.random (unseeded), and isCollidingWithLaser tests
//                   against the sprite, not the drone. Five frames of the arc
//                   are within a half-thickness of the peak, so survival needs
//                   the WORST of five draws, not the mean. Every laser is
//                   anchored on its drone's centreline (instances.ts:103-117),
//                   so what points into the field is half the thickness.
//
// That makes the certain-survival threshold 59.3px and certain death 58.55px, a
// 0.75px band the model cannot resolve; inside it the honest answer is the
// expected cost of a death, ~50 decisions, against a detour of ~10.
function jumpClearanceNeeded() {
  const CFG = require("./physics.cjs");
  const { rise, frames } = jumpApex();
  return rise + CFG.droneSpeed * (frames + 1) + CFG.maxLaserHalfSize;
}

// A jump is FATAL when the cat's head would reach the ceiling laser at the apex.
// Compared against jumpClearanceNeeded, so the only jumps that survive this
// filter are the ones no draw of the per-frame laser thickness can kill. There
// is no epsilon on the comparison: at 59.3px the two sides are sums of 0.2px
// steps and a residue of a few times 1e-14 is eight orders of magnitude inside
// the 0.75px the model itself is unsure by, so it decides nothing. The tie this
// file used to break at 1e-9 no longer exists as a concept -- the answer is a
// band, not a point.
function jumpHitsCeiling(snap) {
  return catMargins(snap).headTop < jumpClearanceNeeded();
}

// THE FALLING FLOOR. On level 13 the cat's only death, 22 times in 552 decisions,
// is one fall: it commits a gem_a arc, and six decisions later it is dead at
// (154, 278.6) having passed y=249 at x=147, while floor(59..111@249) -- the floor
// directly beneath it -- ends at x=111. Holding `left` on that same fall reaches
// y=249 at x=108.5, inside the floor, and lands. Both directions are on the menu.
//
// The move state text ALREADY says "next platform: left nothing, right nothing" at
// that state, and the model picks `right` six times running. So this is not a
// missing-fact case: it is a present-and-ignored case, and that is written into the
// prediction file before the measurement rather than discovered after it.
//
// Everything below is read from the run list, not derived by hand. The platform box
// is the same construction reachability.cjs uses: a 52-wide platform on anchor
// {x:0.5, y:0.4}, so the span is x-26..x+26 and the collision band is y-6.4..y+9.6.
// `dir` is the action being described. It is NOT decoration: the sentence claims that
// action brings the cat over the floor, so whether it can is a property of that
// direction, and the claim has to be tested per direction or it is asserted.
function floorBelow(snap, dir) {
  if (snap.onPlatform) return null;            // grounded: the arc is not committed
  if (!(snap.cat.dy > 0)) return null;         // rising: nothing is being missed
  const h = snap.cat.height;
  // buildObjectiveCall keeps its own function-local REACH, so this is its own require.
  // Reached only on airborne falling states, which are a small fraction of decisions.
  const REACH = require("./reachability.cjs");
  // runsOf takes ONE argument (reachability.cjs:38). The second one is silently
  // ignored. Passing it asserted a dependency on cat height that does not exist,
  // and a reader who believed it would reason wrongly about which floors are below.
  const below = REACH.runsOf(snap.level)
    .filter((r) => r.y > snap.cat.y)
    .sort((a, b) => a.y - b.y);
  if (!below.length) return null;
  const first = below[0];
  // "The nearest floor below" is a claim about ONE floor, and the span it quotes is
  // that floor's. An earlier wording said "the only floor below" and was FALSE at
  // L12 (279,100): the nearest is y 108, but two more sit at y 165 beneath it. Found
  // by the offline guard check before any endpoint call, which is the check's purpose.
  // Two floors sharing the NEAREST height make the span ambiguous, so stay silent.
  if (below.length > 1 && below[1].y === first.y) return null;
  const drop = Math.round(first.y - snap.cat.y);
  // Beyond this the fact is true but useless, and it would fire on every long fall.
  if (drop > 140) return null;
  if (snap.cat.x >= first.left && snap.cat.x <= first.right) return null;  // already over it

  // THE REMEDY MUST STILL BE LIVE. Knowing which way is downhill is not knowing
  // that there is time to get there. On L13 decision 23 the cat is at
  // (136.50, 216.60) falling at dy +4.0, 25.50px right of the same floor's right
  // edge; holding `left` reaches y=249 at x=126.0, which is 15px PAST the edge, and
  // the arc keeps going. So the sentence asserted "steering left brings the cat over
  // it" where that was false, and the probe measured the model scoring `right`
  // HIGHER for having been told a remedy existed (0.9836 -> 0.9997) at a state
  // where the correct answer was silence. Silence is strictly better there.
  //
  // simulate is the check, and it is the right instrument for one specific reason:
  // arc.cjs:115 returns "landed" only when its own `grounded` flag is set, and
  // `grounded` is set only by the game's overlap test putting the cat ON a platform.
  // A fall that brushes past a floor never sets it. reachability.landingsFrom
  // cannot do this job -- it is a pass-through set that adds every floor the swept
  // arc touches, so a graze would read as a landing, which is exactly the case
  // (a cat at dy +4.0 and accelerating) where a graze happens.
  //
  // Three tests, not one, and all three are needed: it must be `landed`, it must
  // have landed on THIS floor rather than some other one on the way down, and it
  // must have landed with its column over the floor rather than beside it.
  const { simulate } = require("./arc.cjs");
  // The same derivation the rest of this file uses (:834), not a second one: the
  // top-left drone's y is the closing box's position, and 0.2 is its speed.
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
  const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, dir, mf, {
    grounded: false,
  });
  if (!r || r.outcome !== "landed") return null;
  if (r.y !== first.y) return null;                        // landed on a different floor
  if (r.x < first.left || r.x > first.right) return null;  // landed beside this one
  return { left: first.left, right: first.right, y: first.y, drop, landX: Math.round(r.x) };
}

function fallFloorNote(snap, dir) {
  // Per direction, deliberately. The remedy check inside floorBelow is what decides,
  // so a direction that cannot reach the floor is simply not described: at state A
  // the note appears on `left` and `right` is left with its bare label. That is a
  // consequence of testing the claim instead of asserting it, not a separate choice
  // -- but it is a visible change from the first version, which described the losing
  // direction as "carries the cat further from it". A sentence that names a dead end
  // still spends the model's attention on the dead end.
  const f = floorBelow(snap, dir);
  if (!f) return "";
  const fx = Math.round(snap.cat.x);
  // WHERE THE CAT IS relative to the floor is one fact and does not depend on the
  // direction being described. Computed once, here, so no per-direction phrasing can
  // put it on the wrong side of the platform.
  const side = fx > f.right ? "right of its right edge" : "left of its left edge";
  const away = Math.round(Math.abs(fx > f.right ? fx - f.right : f.left - fx));
  return `; the nearest floor below spans x ${f.left}..${f.right} at y ${f.y}, ${f.drop}px below, and the cat at x ${fx} is ${away}px ${side}, so steering ${dir} brings the cat over it at x ${f.landX}`;
}

function legalActions(snap) {
  if (snap.onPlatform) {
    // `wait` REMOVED: laser closure is a movement-distance budget, so standing
    // still conserves nothing and only inflates escape time. Strictly dominated.
    const walk = {
      left: "walk left",
      right: "walk right",
    };
    // Prune a jump that provably kills, for the same reason `wait` is pruned: an
    // action that cannot help should not be on the menu. The model already rates
    // these low, but exploration samples exactly the low-probability options, and
    // each resulting death escalates the temperature that made it likelier — a
    // death spiral. Observed on level 2: 8 of 10 deaths were the cat moving
    // upward (dy<0) into the ceiling laser from the top row.
    if (jumpHitsCeiling(snap)) return walk;
    return {
      ...walk,
      jump: "jump straight up",
      jump_left: "jump and steer left",
      jump_right: "jump and steer right",
    };
  }
  // Airborne: cannot jump (needs ground), cannot truly stand still (still falling).
  // The note goes on BOTH steering options, each stating its own relation to the
  // floor, so the remedy is a different option on the same menu -- the shape the
  // window sentence had and the three inert sentences did not. `none` is left bare
  // on purpose: it is not a remedy, it is the absence of one, and naming it as
  // anything else would be a claim about an action the sentence does not argue for.
  return {
    left: `steer left in the air${fallFloorNote(snap, "left")}`,
    right: `steer right in the air${fallFloorNote(snap, "right")}`,
    none: "keep current trajectory, no steering",
  };
}

function dirWord(delta, axis) {
  const a = Math.abs(Math.round(delta));
  if (a === 0) return `0px ${axis}`;
  if (axis === "x") return `${a}px ${delta > 0 ? "right" : "left"}`;
  return `${a}px ${delta > 0 ? "down" : "up"}`;
}

function offsetPhrase(fromX, fromY, toX, toY) {
  return `${dirWord(toX - fromX, "x")}, ${dirWord(toY - fromY, "y")}`;
}

function buildObjectiveCall(snap, levelGems, deathHistory) {
  const r = safeRect(snap);
  const alive = matchGemsToSpawn(levelGems, snap.gemPositions);
  const collected = snap.gemsCollected;

  // Loud invariant: matched-live + collected must equal the 3 gems this level has.
  // A short list here means the matcher dropped a gem and the model would be
  // silently denied it. Throw rather than continue.
  if (alive.length + collected !== 3) {
    throw new Error(
      `matchGemsToSpawn invariant FAILED: matched=${alive.length} ` +
        `[${alive.map((g) => g.name).join(",")}] + collected=${collected} != 3. ` +
        `livePositions=${JSON.stringify(snap.gemPositions)} spawn=${JSON.stringify(levelGems)}`
    );
  }
  // Instrumentation: log the raw live positions and resolved names every decision.
  if (typeof process !== "undefined" && process.env.JEV_VERBOSE) {
    console.log(
      `      [obj-match] live=${JSON.stringify(snap.gemPositions)} -> alive=[${alive
        .map((g) => `${g.name}@${g.x},${g.y}`)
        .join(",")}] collected=${collected}`
    );
  }

  const lines = [];
  lines.push(
    `Cat Goric is in a 360x360 warp chamber. He must collect 3 gems, then reach the exit portal at (180,150).`
  );
  lines.push(
    `Lasers close inward from all four walls as he moves. Safe rectangle right now: x ${Math.round(
      r.left
    )}..${Math.round(r.right)}, y ${Math.round(r.top)}..${Math.round(r.bottom)}.`
  );
  lines.push(
    `The cat is at (${Math.round(snap.cat.x)},${Math.round(snap.cat.y)}), ${
      snap.onPlatform ? "standing on a platform" : "in the air"
    }. Gems collected: ${collected}.`
  );
  // Countdown in the cat's own time units: if it stays exactly where it is, the
  // closing laser reaches its body in this many moving frames. The model reads a
  // shrinking pixel margin poorly; a countdown it can compare against its own
  // movement budget is direct. Current position only — not per-option.
  lines.push(`Remaining objectives:`);

  const criteria = {};
  // The platform the cat is currently standing on (feet within ~14px of its top,
  // x within the +/-20 span). Used to flag walk-reachable gems.
  const P = require("./level_data.cjs");
  const plats = P.platforms(snap.level);
  let curPlat = null;
  if (snap.onPlatform) {
    for (const p of plats) {
      if (Math.abs(snap.cat.x - p[0]) <= 20 && Math.abs(snap.cat.y - p[1]) <= 14) {
        curPlat = p;
        break;
      }
    }
  }
  const CAT_REACH_UP = 24; // cat collision body height above its feet
  const describe = (name, gx, gy) => {
    const dx = gx - snap.cat.x;
    const dy = gy - snap.cat.y;
    const dist = Math.round(Math.hypot(dx, dy));
    const gm = gemMargin({ x: gx, y: gy }, snap);
    let walk = false;
    if (curPlat) {
      const withinSpan = Math.abs(gx - curPlat[0]) <= 20;
      const withinReach = gy <= snap.cat.y && snap.cat.y - gy <= CAT_REACH_UP;
      walk = withinSpan && withinReach;
    }
    // Overshot: the gem is on the cat's current platform but on the far side from
    // where the cat entered, i.e. the cat has passed its x. Flag when the gem is
    // behind relative to the staircase direction (gem x < cat x on same platform).
    const overshot = curPlat && Math.abs(gx - curPlat[0]) <= 20 && dx < 0;
    const flags = [];
    if (walk) flags.push("REACHABLE BY WALKING (no jump needed)");
    if (overshot) flags.push("OVERSHOT: it is BEHIND you to the left on your platform");
    const flagStr = flags.length ? " **" + flags.join("; ") + "**" : "";
    return {
      line: `- ${name} at (${gx},${gy}): straight-line ${dist}px (${offsetPhrase(
        snap.cat.x,
        snap.cat.y,
        gx,
        gy
      )}); nearest closing laser ${Math.round(gm.min)}px away (${gm.side} side).${flagStr}`,
      crit: `${name}: straight-line ${dist}px${walk ? ", reachable by walking (no jump)" : ""}${overshot ? ", overshot/behind on your platform" : ""}`,
    };
  };
  // Build every objective entry (gems, portal, descent points) as {name, line,
  // crit}, then draw ONE permutation and use it for BOTH the state listing and the
  // menu. Previously the menu was shuffled but the state text listed objectives in
  // fixed order, leaving a list-position bias and an inconsistency between two
  // parts of the same prompt. One permutation, applied to both, removes that.
  // Reachability, from the same validated simulator the hold uses. The model
  // cannot derive this: it would have to integrate a jump arc and compare it
  // against a platform height, which is arithmetic, not next-token matching. On
  // level 4 the cat stood on P(182,241) -- from which gem_a is unreachable, the
  // lower platforms having no edge back up -- and the state still described gem_a
  // as "107px right, 85px up", so it walked right and off the edge in 11 of 13
  // attempts. This states a property of the geometry; it picks no route.
  const REACH = require("./reachability.cjs");
  // NOT gated on snap.onPlatform. The cat SPAWNS AIRBORNE -- level 4 starts it at
  // (121,81) falling onto P(121,93) -- and its first objective choice is made
  // there. Gating on onPlatform suppressed the annotation for exactly that
  // decision, so all 25 attempts opened with the nearest gem and were off the
  // platform before any grounded decision could show the cost. platformKeyUnder's
  // 14px tolerance resolves (121,81) to P(121,93); high in the air it returns null
  // and the annotation is simply omitted.
  const here = REACH.platformKeyUnder(snap.level, snap.cat.x, snap.cat.y);
  const reachable = here ? REACH.reachableFrom(snap.level, here, snap.cat.height) : null;
  const canReach = (x, y) => {
    if (!reachable) return true; // airborne or off-platform: no claim
    const holder = REACH.platformHolding(snap.level, x, y);
    return holder ? reachable.has(holder) : true;
  };

  // What does taking this objective FIRST cost? Measured directly against the
  // classifier on level 4's spawn state, one call per variant:
  //
  //   no annotation                      gem_a 0.007  gem_b 0.722  -> picks gem_b
  //   "Taking this first permanently..." gem_a 0.762  gem_b 0.068  -> picks gem_a
  //   "TAKING THIS FIRST LOSES x ..."    gem_a 0.963  gem_b 0.005  -> picks gem_a
  //
  // The model reads it and reverses decisively. An earlier attempt appeared to do
  // nothing only because it was gated on snap.onPlatform and the first choice is
  // made mid-spawn-fall; see the reachability block above.
  const stranding = (g) => {
    if (!reachable) return "";
    const home = REACH.platformHolding(snap.level, g.x, g.y);
    if (!home || !reachable.has(home)) return "";
    const after = REACH.reachableFrom(snap.level, home, snap.cat.height);
    if (!after) return "";
    const lost = alive
      .filter((o) => o.name !== g.name)
      .filter((o) => {
        const h = REACH.platformHolding(snap.level, o.x, o.y);
        return h && reachable.has(h) && !after.has(h);
      })
      .map((o) => o.name);
    if (!lost.length) return "";
    return ` TAKING THIS FIRST LOSES ${lost.join(" and ")} PERMANENTLY: there is no route back up from ${g.name}.`;
  };
  // ROUTE_FIRST: do not offer a goal whose route passes through another live
  // goal's platform. Two gems that are nearly equidistant are chosen by noise, and
  // on level 4 that is fatal: standing on floor 199..251 with gem_a collected,
  // gem_b is 132.6px away and gem_c 137.5px, a 5px difference, but gem_b sits two
  // hops away THROUGH gem_c's platform. Picking gem_b walks the cat off the left
  // edge to its death; picking gem_c makes the descent the model already steers
  // correctly (probed: the airborne moves self-correct and land inside 156..208).
  // Once the cat is on gem_c's platform, gem_b is one hop away and is offered
  // again, so nothing is permanently hidden.
  const ROUTE_FIRST = process.env.ROUTE_FIRST !== "0";
  const routeBlocked = new Set();
  if (ROUTE_FIRST && here) {
    const g4 = REACH.graph(snap.level, snap.cat.height);
    const holders = new Map();
    for (const g of alive) {
      const h = REACH.platformHolding(snap.level, g.x, g.y);
      if (h) holders.set(g.name, h);
    }
    const otherHolders = (name) =>
      new Set([...holders.entries()].filter(([n, h]) => n !== name && h !== here).map(([, h]) => h));
    for (const [name, holder] of holders) {
      if (holder === here) continue;
      // Shortest path here -> holder that avoids every OTHER live goal's platform.
      const blocked = otherHolders(name);
      // The FIRST hop must respect whether a jump is actually available right now.
      // legalActions prunes every jump below 64.6px of head clearance, which on
      // level 4's y=93 floors happens at 48 moving frames -- and the cat gets back
      // there with gem_a long after that. The static graph builds jump edges
      // unconditionally, so it kept claiming gem_b's platform was one hop from
      // floor B when walking off was the only move left and walking off kills.
      const firstHop = (() => {
        if (!jumpHitsCeiling(snap)) return g4.edges[here] || [];
        const runs = REACH.runsOf(snap.level);
        const run = runs.find((r) => r.left <= snap.cat.x && snap.cat.x <= r.right && Math.abs(r.y - snap.cat.y) <= 14);
        if (!run) return g4.edges[here] || [];
        const out = new Set();
        for (let x = run.left; x <= run.right; x += 2) {
          for (const t of REACH.landingsFrom(snap.level, runs, x, run.y, false, snap.cat.height)) {
            if (t !== here) out.add(t);
          }
        }
        return [...out];
      })();
      const seen = new Set([here]);
      let frontier = [here];
      let firstPass = true;
      let found = false;
      while (frontier.length && !found) {
        const next = [];
        for (const k of frontier) {
          for (const t of (firstPass && k === here ? firstHop : g4.edges[k] || [])) {
            if (t === holder) { found = true; break; }
            if (seen.has(t) || blocked.has(t)) continue;
            seen.add(t); next.push(t);
          }
          if (found) break;
        }
        frontier = next;
        firstPass = false;
      }
      // Only DEFER a goal that is reachable but only by crossing another goal's
      // platform. A goal with no route at all must stay on the menu and keep its
      // NO ROUTE annotation: that is what tells the model the attempt is spent,
      // and the runner's stranding detector reads the same condition.
      if (!found) {
        const reachableAtAll = canReach(
          alive.find((g) => g.name === name).x,
          alive.find((g) => g.name === name).y
        );
        if (reachableAtAll) routeBlocked.add(name);
      }
    }
  }

  const entries = [];
  for (const g of alive) {
    if (routeBlocked.has(g.name)) continue;
    const d = describe(g.name, g.x, g.y);
    const line = canReach(g.x, g.y)
      ? `${d.line}${stranding(g)}`
      : `${d.line} NO ROUTE: from the platform you are standing on there is no sequence of jumps that reaches ${g.name}.`;
    entries.push({ name: g.name, line, crit: d.crit });
  }
  if (collected >= 3) {
    const d = describe("portal", PORTAL.x, PORTAL.y);
    entries.push({ name: "portal", line: d.line, crit: d.crit });
  }
  // Descent points as selectable objectives (see descentPoints for the rule and
  // the flat-menu guarantee). Part of the same flat simultaneous set.
  // GOALS_ONLY: leave waypoints out of the objective menu and let the move
  // question do the routing. The menu otherwise mixes GOALS (gems, portal) with
  // WAYPOINTS (descent/ascent points), and they are scored against each other on
  // proximity, which is a category error: a waypoint is only meaningful relative
  // to a goal. On level 4 with gem_a collected the cat stands on floor 199..251
  // and picks the right descent 17 times out of 17 (and 24 of 24 across shuffled
  // menu orderings, so this is preference, not position bias) because that end is
  // 13px away against 39px for the left one -- and the right descent drops it back
  // onto the floor it has already emptied. Asked instead to move toward gem_c or
  // gem_b as a GOAL, the move question answers `left` at 0.98-0.99 from every
  // position on that floor, which is the correct way off it.
  const GOALS_ONLY = process.env.GOALS_ONLY === "1";
  const descents = GOALS_ONLY ? [] : descentPoints(snap, levelGems);
  for (const dp of descents) {
    const gm = gemMargin({ x: dp.x, y: dp.y }, snap);
    // What does this descent COST? On level 4 the lower platforms have no edge
    // back up, so descending before taking gem_a loses the level outright. The
    // consequence is computable from the landing platform's own reachable set, so
    // state it where the choice is actually made.
    let cost = "";
    if (reachable) {
      const CFGp = require("./physics.cjs");
      const { simulate } = require("./arc.cjs");
      const dir = /left/.test(dp.name) ? "left" : "right";
      const r = simulate(snap.level, dp.x, snap.cat.y, 0, snap.cat.height, dir, 0, { grounded: true });
      if (r.outcome === "landed") {
        const landKey = REACH.platformKeyUnder(snap.level, r.x, r.y);
        const after = landKey ? REACH.reachableFrom(snap.level, landKey, snap.cat.height) : null;
        if (after) {
          const lost = alive
            .filter((g) => {
              const h = REACH.platformHolding(snap.level, g.x, g.y);
              return h && reachable.has(h) && !after.has(h);
            })
            .map((g) => g.name);
          if (lost.length) {
            cost = ` ONE-WAY: after this descent there is no route back up, and ${lost.join(" and ")} can no longer be reached.`;
          }
        }
      }
    }
    entries.push({
      name: dp.name,
      line: `- ${dp.label}; nearest closing laser ${Math.round(gm.min)}px away (${gm.side} side).${cost}`,
      // The bare distance could not separate two descents: the model picked the
      // nearer edge, which on L4/L5 is the one that strands or kills the cat. The
      // landing (and the ONE-WAY warning in `cost`) now travel in `crit` so the
      // label being scored carries them. Experiment change 1.
      crit: `straight-line ${Math.round(Math.hypot(dp.x - snap.cat.x, dp.y - snap.cat.y))}px to the ${dp.name} (a descent off the floor, not a collectible); ${dp.label.slice(dp.label.indexOf("lands on "))}${cost}`,
    });
  }
  // Ascent points, the mirror of the descents above. Same flat simultaneous set.
  const ascents = GOALS_ONLY ? [] : ascentPoints(snap, levelGems);
  for (const ap of ascents) {
    const gm = gemMargin({ x: ap.x, y: ap.y }, snap);
    entries.push({
      name: ap.name,
      line: `- ${ap.label}; nearest closing laser ${Math.round(gm.min)}px away (${gm.side} side).`,
      crit: `straight-line ${Math.round(Math.abs(ap.x - snap.cat.x))}px to the ${ap.name} (a platform above this floor, not a collectible)`,
    });
  }
  // ONE permutation per decision, shared by state text and menu.
  const presented = shuffleArray(entries, RNG);
  for (const e of presented) {
    lines.push(e.line);
    criteria[e.name] = e.crit;
  }

  const state = lines.concat(deathHistoryLines(deathHistory, snap)).join("\n");
  const objectiveNames = presented.map((e) => e.name);
  const questions = {
    objective: {
      type: "choice",
      instructions:
        "Which single objective should the cat pursue right now to escape?",
      criteria,
    },
  };
  return { state, questions, alive, hasPortal: collected >= 3, objectiveNames, presentedOrder: objectiveNames };
}

// Where a jump from the cat's CURRENT x can land, and whether the objective
// survives it. Level 4 is the case this exists for: the start floor spans x
// 95..147 at y=93 and the floor across the 52px gap spans x 199..251 at the same
// height, but a jump only carries far enough to reach it from x>=137. Jumping
// from further left clears the gap yet arrives BELOW the far floor's top, so the
// cat lands on a lower floor (or, steering hard right the whole way, falls past
// everything into the bottom laser). Both lower floors are one-way, so the jump
// silently costs gem_a. Nothing in the prompt distinguished x=130 from x=140, and
// the cat launched from x=129.75 in 14 of 16 deaths.
//
// Reachability comes from REACH.landingsFrom, the air-control model (reachable x
// at frame f is an interval widening at catWalkSpeed), NOT from a held-action arc
// replay. A held action under-reports badly -- it flies straight past floors the
// cat can reach by easing off -- and a "fact" derived from one was wrong before.
// Stated only when the cat's current x cannot reach a floor that keeps the
// objective AND some x on this same floor can; otherwise there is nothing true
// and useful to say, and the stranding annotations already cover the rest.
function jumpLandingNote(snap, target) {
  if (!snap.onPlatform || !target) return null;
  // Claude r5: cached so platformMap's gapMsg can share the SAME window numbers
  // instead of deriving a second copy of the same fact. Reset per call site pair
  // (buildMoveCall calls this once before platformMap in the same tick).
  jumpLandingNote._lastSnap = null;
  jumpLandingNote._window = null;
  const REACH = require("./reachability.cjs");
  const CFG = require("./physics.cjs");
  const runs = REACH.runsOf(snap.level);
  const here = REACH.platformKeyUnder(snap.level, snap.cat.x, snap.cat.y);
  const holder = REACH.platformHolding(snap.level, target.x, target.y);
  if (!here || !holder) return null;
  const run = runs.find((r) => r.left <= snap.cat.x && snap.cat.x <= r.right && Math.abs(r.y - snap.cat.y) <= 14);
  if (!run) return null;
  // The objective is ON this floor: there is nothing useful to say about jumping
  // to a different one. platformHolding's 70px tolerance puts a gem hovering above
  // its floor on that floor, so level 2's gem_c at (90,188) belongs to the very
  // floor the cat stands on at y=240 -- 52px up, inside a 61.2px jump. Without
  // this guard the note fired 48 times on level 2 telling the cat to walk to a
  // different launch window for a gem that was directly overhead, and the level
  // stopped clearing: 10 deaths and 435 decisions against 5 and 221, out of step
  // budget with all 3 gems collected and the portal never reached.
  if (holder === here) return null;
  const keeps = (key) => {
    if (key === holder) return true;
    const set = REACH.reachableFrom(snap.level, key, snap.cat.height);
    return set ? set.has(holder) : false;
  };
  const landingsAt = (x) =>
    [...REACH.landingsFrom(snap.level, runs, x, run.y, true, snap.cat.height)].filter((k) => k !== here);
  const nowLandings = landingsAt(snap.cat.x);
  // An empty list means "no platform OTHER than this one", never "no platform at
  // all": landingsAt drops the cat's own floor, and the reachable-x interval
  // still covers the launch floor on the way down, so the cat can always steer
  // less and come back. An earlier version of this note said "the cat falls past
  // every floor" here, which is false, and it fired on six levels. The jump is
  // still worth reporting as useless -- on level 4's y=171 floor a jump from
  // x>=284.5 reaches nothing new, and the cat holding left off the edge dies --
  // but it must be worded as reaching nothing NEW.
  // An empty list means "no platform OTHER than this one", never "no platform at
  // all": landingsAt drops the cat's own floor and a jump almost always lands back
  // on it. Reporting that case was tried and MEASURED, and it costs level 2 the
  // level: 48 firings there, 10 deaths and 435 decisions against 5 and 221, out of
  // step budget with all 3 gems and the portal never reached. The `holder === here`
  // guard above is a genuine bug fix but only takes level 2 from 48 firings to 32,
  // and a run with it produced the identical 10 deaths / 435 decisions failure.
  // It IS load-bearing for level 4 -- without it the cat launches from x=285.5 on
  // the y=171 floor, where a jump reaches nothing and holding left kills it -- but
  // level 4 does not clear either way, so levels 0-3 clearing wins. Re-enable only
  // with a scope that keeps level 2's firings at zero.
  // An empty list means "no platform OTHER than this one", never "no platform at
  // all". Re-enabled: this same-floor case is what the level 4 endgame needs. From
  // gem_c's floor a jump reaches gem_b's floor only from x<=170, and the cat jumps
  // from 184 and reaches nothing. It was disabled earlier because it cost level 2
  // the level (48 firings, 10 deaths / 435 decisions against 5 / 221) -- but that
  // was measured before GOALS_ONLY and ROUTE_FIRST changed what the menus contain,
  // so it is being re-measured rather than assumed.
  if (nowLandings.some(keeps)) return null;
  // Somewhere else on this same floor that does keep the objective reachable?
  const good = [];
  for (let x = run.left; x <= run.right; x += CFG.catWalkSpeed) {
    if (landingsAt(x).some(keeps)) good.push(x);
  }
  if (!good.length) return null;
  const lo = Math.round(Math.min(...good));
  const hi = Math.round(Math.max(...good));
  // Claude r5 finding 3: the imperative's named x must come from the HELD-arc
  // model (arc.simulate), not the envelope edge. The envelope over-reports by up
  // to a 1.75px step; naming 139 on L4's A floor sits ~2px inside a boundary
  // where x=140 lands 2.3px inside B's edge. Among the good xs, pick the one
  // nearest the cat whose held arc actually lands on a keeping floor; the jump
  // direction is the landing platform's side relative to the CAT (run keys hold
  // y, so test the platform x, not the key).
  const { simulate } = require("./arc.cjs");
  let heldX = null, heldPlat = null;
  for (const x of good) {
    for (const dir of ["jump_left", "jump", "jump_right"]) {
      const r = simulate(snap.level, x, run.y, 0, snap.cat.height, dir, 1, { grounded: true });
      if (r.outcome !== "landed") continue;
      const rKey = REACH.platformKeyUnder(snap.level, r.x, r.y);
      if (rKey && rKey !== here && keeps(rKey)) {
        const got = heldX != null ? Math.abs(heldX - snap.cat.x) : Infinity;
        if (Math.abs(x - snap.cat.x) < got) { heldX = x; heldPlat = rKey; }
        break;
      }
    }
  }
  const namedX = heldX != null ? Math.round(heldX) : (snap.cat.x > hi ? hi : lo);
  const platRun = heldPlat ? runs.find((q) => `floor(${Math.round(q.left)}..${Math.round(q.right)}@${q.y})` === heldPlat) : null;
  const heldDir = platRun ? (platRun.left < snap.cat.x ? "left" : "right") : (target.x < snap.cat.x ? "left" : "right");
  jumpLandingNote._lastSnap = snap;
  jumpLandingNote._window = { lo, hi, namedX, dir: heldDir, plat: platRun, here: run };
  const where = (key) => {
    const r = runs.find((q) => `floor(${Math.round(q.left)}..${Math.round(q.right)}@${q.y})` === key);
    return r ? `x ${Math.round(r.left)}..${Math.round(r.right)} at y ${r.y}` : key;
  };
  let lands;
  if (nowLandings.length) {
    lands = `lands on ${nowLandings.map(where).join(" or ")}; ${target.name} cannot be reached from there`;
  } else {
    // Claude r4 (2026-09-25): the empty-envelope branch used to read "reaches no
    // platform other than this one" -- a stated no-op -- while the held arc (the
    // action the move menu can actually pick) passes BELOW the target platform
    // and drops the cat to the laser. On L4 (289,171) obj gem_c the note called
    // the fatal jump harmless and the escape clause endorsed it, so jump_left
    // p=0.79 was the CORRECT argmax of that text (6 identical deaths). Word the
    // empty branch from the held-arc outcome instead. Firing condition is
    // unchanged (this is wording only), which is what kept level 2's firing
    // count stable across the three earlier re-measurements (48x -> 10d/435d).
    const dir = target.x < snap.cat.x ? "jump_left" : "jump_right";
    const { simulate } = require("./arc.cjs");
    const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
    const arc = simulate(snap.level, snap.cat.x, run.y, 0, snap.cat.height, dir, mf, { grounded: true });
    lands =
      arc.outcome === "laser"
        ? `holding ${dir === "jump_left" ? "left" : "right"} reaches no platform: the arc passes below every platform and the cat drops to the bottom laser`
        : arc.outcome === "void"
          ? `holding ${dir === "jump_left" ? "left" : "right"} reaches no platform and the cat falls into the gap`
          : `reaches no platform other than this one, so it cannot bring the cat closer to ${target.name}`;
  }
  // PROBED (2026-09-25, 27B, exact step-390 state): the arc fact alone left
  // jump_left at 0.89 (worse than the pre-change 0.79). Adding the computed
  // walk-then-jump instruction -- the rejected E1 of Claude r4 -- flipped the
  // argmax to left at 0.986 with jump_left 0.014 (acceptance <= 0.05). The race
  // is immediacy, not harmlessness: the model needs the walk framed as the
  // required step, with all numbers computed from the state (cat x, the window,
  // the nearest edge), so no level-specific literal is baked in.
  // Claude r5: the `!nowLandings.length` clause here is the bug for L4's A floor
  // -- there the jump DOES reach platforms (D and E), so the imperative was
  // suppressed exactly where the cat dies: 25/31 deaths were the cat jumping
  // from A's left half (x 95..116 jump_right lands safely on D, x~180..195) and
  // getting the stranded-reset "gem_a unreachable from floor(156..208@241)".
  // Wording-only on already-firing positions: the note's firing set is untouched.
  // Claude r6 Q2: NO +/-2 tolerance. This line is only reached when the
  // envelope (the optimistic model) from the cat's CURRENT x already reaches
  // nothing that keeps the objective -- so "close enough to the window" is a
  // state that cannot reach here. The old `> hi + 2` band suppressed the
  // imperative at exactly x=285..286 on L4's y=171 floor, where the held
  // jump_left overshoots B's right end by 1-2px: 16 deaths, all from x=286.
  // Direction comes from namedX (held-arc-verified), not the envelope edge:
  // the lo..hi scan is discrete at catWalkSpeed and not guaranteed contiguous.
  const windowTail =
    ` You are at x ${Math.round(snap.cat.x)}, outside the launch window; walk ` +
    `${snap.cat.x > namedX ? "left" : "right"} to around x ${namedX}, then jump ${heldDir} there.`;
  return (
    `A jump from x ${Math.round(snap.cat.x)} ${lands}. A jump from x ${lo}..${hi} on this same floor ` +
    `reaches a platform from which ${target.name} can still be reached.` + windowTail
  );
}

// Holding the direction of the objective walks the cat off this floor to its
// death. Narrow on purpose: "a jump is needed rather than a walk" is true almost
// everywhere (it fires on all 14 levels, 150+ times on some), so it says nothing.
// What is rare and worth saying is that the move the cat is ABOUT to make is
// lethal from where it stands.
//
// Level 4: standing on floor 199..251 with gem_a collected, gem_b is the nearer
// gem in a straight line (124px against 135px) so the cat targets it and holds
// left; the arc simulator puts held `left` from (199,93) at (141,304), in the
// bottom laser. Easing off lands on gem_c's floor instead, and a jump reaches
// gem_b's floor, but neither happens while the cat simply walks.
//
// This also restores protection the goals-only menu removed: descentPoints
// refuses to offer an end that drops into the laser ("not a descent, it is
// death"), and dropping waypoints from the menu dropped that filter with them.
function walkOffFatalNote(snap, target) {
  if (!snap.onPlatform || !target) return null;
  const { simulate } = require("./arc.cjs");
  const REACH = require("./reachability.cjs");
  const runs = REACH.runsOf(snap.level);
  const run = runs.find((r) => r.left <= snap.cat.x && snap.cat.x <= r.right && Math.abs(r.y - snap.cat.y) <= 14);
  if (!run) return null;
  const dir = target.x < snap.cat.x ? "left" : "right";
  // Evaluate at the END the cat is walking toward, not where it stands: simulate
  // stops at the first landing, and a step from mid-floor just re-lands on the
  // same floor two frames later.
  const endX = dir === "left" ? run.left : run.right;
  // IMMINENCE GATE. "Walking off this end kills you" is true on most floors of
  // most levels -- ungated it fires 510 times on level 0 and 1092 on level 2, which
  // is noise, and noise has already cost a level once this session. It is only
  // worth saying when the cat could actually leave the floor before it is asked
  // again: one decision interval of walking, K frames at catWalkSpeed.
  const CFGp = require("./physics.cjs");
  const CAD = require("./cadence.cjs");
  const reachEnd = (CAD.GROUND_DECIDE_FRAMES || 6) * CFGp.catWalkSpeed;
  if (Math.abs(snap.cat.x - endX) > reachEnd) return null;
  const r = simulate(snap.level, endX, run.y, 0, snap.cat.height, dir, 0, { grounded: true });
  if (r.outcome === "landed") return null;
  const jmp = simulate(snap.level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, 0, { grounded: true });
  return (
    `Walking off the ${dir} end of this floor (x ${Math.round(endX)}) does not reach any platform: the cat falls past ` +
    `everything below and dies` +
    `${jmp.outcome === "landed" ? `. A jump ${dir} from that end lands safely on x ${Math.round(r.x) === Math.round(jmp.x) ? "" : ""}${Math.round(jmp.x)}, y ${Math.round(jmp.y)}` : ""}.`
  );
}

// ---------------------------------------------------------------------------
// ARM D -- the consequence clause on every grounded move option.
//
// THE DEFECT IT FIXES. On level 4 the cat stands at (282,171) chasing gem_c at
// (182,226) and takes `jump_left` at p=0.996 on 42 of 42 decisions. That jump
// lands at (248.75, 93) -- 78px UP, back on the platform the cat just descended
// from, and 34.7px FURTHER from gem_c than standing still. The driver computes
// that landing and discards it. Fourth instance of the recurring shape, after
// L3, L10 and L13.
//
// WHY A COORDINATE WAS NOT ENOUGH. An earlier probe arm annotated every option
// with the landing COORDINATE ("lands the cat at x 249, y 93"). It moved
// nothing: 0 of 42 flipped, and the annotated option's probability went UP
// (0.996556 -> 0.997513). A coordinate states no reason to prefer anything, so
// the annotation only made its own option more attractive. Replacing the
// coordinate with a CONSEQUENCE relative to the current objective, and naming
// the action that does serve it, flipped 42 of 42 (p(jump_left) 0.996556 ->
// 0.013650, max abs delta 0.9916, 11.2x the 0.088627 run-to-run spread).
//
// EVERY option is annotated, including the correct one, on purpose. The mass in
// the coordinate arm went to whichever option carried text; annotating all of
// them removes that asymmetry, so what decides is the CONTENT rather than the
// presence of an annotation. Options are never removed -- this describes the
// menu, it does not prune it, so a high firing rate is not the harm it was for
// the four gate-shaped predicates (Euclidean 98.9%, vertical-dominant 56.3%,
// visit-form 44.0%, route hint 82.8%), all of which PRUNED good actions off
// menus on levels that clear.
//
// NEVER mf = 0. Every call passes this decision's own laser clock, derived with
// the same idiom as the rest of this file. The mf=0 form is a real defect
// elsewhere in this file (walkOffFatalNote passes 0 twice) and it reports a
// fatal jump as safe.
function armDNotes(snap, target, menu) {
  const keys = Object.keys(menu);
  if (!keys.length) return menu;
  // A distance to "the objective" is only meaningful against a gem. A descent or
  // ascent point is a launch position, not a goal, and the portal is a different
  // kind of target; this arm has no measurement for either, so it says nothing
  // rather than measuring against the wrong thing.
  if (!target || !/^gem_/.test(target.name)) return menu;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return menu;
  if (snap.onPlatform === false) return menu;          // airborne: the fall-floor sentence owns it
  const { simulate } = require("./arc.cjs");
  // physics.cjs, NOT the module-scope CFG. `CFG` at file scope is config.cjs (line 21),
  // which exports no `droneSpeed`; the correct value lives in physics.cjs and is only
  // in scope where a function re-binds CFG locally (lines 117, 149). Copying the
  // `(tl.y - 1) / CFG.droneSpeed` idiom from the call at :872 -- where CFG is the
  // config.cjs one -- yields NaN, and `simulate` with NaN movingFrames never matches a
  // laser, so a fatal jump is reported as falling out of the world. Verified: with NaN
  // the L4 jump_right arc returns `void`; at the real mf it returns `laser`.
  const PHYS = require("./physics.cjs");
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / PHYS.droneSpeed : 0;
  if (!Number.isFinite(mf)) throw new Error(`armDNotes: movingFrames is not finite (mf=${mf}); refusing to describe arcs with no laser clock`);
  const h = snap.cat.height;
  const d0 = Math.hypot(snap.cat.x - target.x, snap.cat.y - target.y);
  const r = {};
  for (const k of keys) r[k] = simulate(snap.level, snap.cat.x, snap.cat.y, 0, h, k, mf, { grounded: true });
  // THE THRESHOLD, and why it is not a number chosen for taste.
  //
  // On L2 this sentence read "left lands 0.3px further from gem_a" and "right lands
  // 0.2px closer", and the cat paced: because "closer" flips side as it walks, a
  // sub-pixel steer reverses every decision. The clause was TRUE and it decided
  // nothing, which is the failure the fall-floor sentence avoids by silence.
  //
  // A margin below one frame of the cat's own travel is not a smaller advantage, it
  // is not an advantage. Two independent reasons, both from the game:
  //   1. catWalkSpeed is 1.75, so one frame of walk is the smallest non-zero
  //      displacement the driver can command. A landing closer by less than that
  //      is closer by an amount the cat cannot execute.
  //   2. getCatCollisionObject() is a 1px-wide column, so overlap is a comparison of
  //      a 1px interval against another. A displacement below the column's own
  //      width can only change an answer where the cat already straddles an edge
  //      inside its own width -- a coin flip, not a fact about the world.
  //
  // So the threshold is a MAGNITUDE floor and nothing else: one frame of the cat's own
  // travel, 1.75px, read from physics.cjs rather than written.
  //
  // I first tried to make it structural instead of numeric -- require the landing to
  // change the 10px POSITION KEY the driver's visit detector uses (posKey10,
  // run_level.cjs:521) -- because a key cannot be half a step. It is a category error
  // at this magnitude, and it SILENCES the one state where the family is known to work:
  // at L4's 42 target states the cat stands at x 278.5-282 and `left` lands at
  // x 275-279.5, so the landing is in the SAME 10px key as the cat at every single one.
  // A 3px improvement is real and is below the key granularity. Measured, then removed.
  // Recorded here because the reason it looks right is the same reason it is wrong.
  //
  // The 6-frame cadence anchor (10.5px) fails the same test and was rejected on the same
  // measurement. What survives is 1.75px, and its margin on L4 is 3.0px against 1.75px
  // -- 1.71x -- with the minimum measured across all 42 states rather than the mean.
  const FLOOR = Math.max(1, PHYS.catWalkSpeed); // 1.75px: one frame of the cat's own travel
  const better = keys.filter((k) => {
    if (r[k].outcome !== "landed") return false;
    return Math.hypot(r[k].x - target.x, r[k].y - target.y) < d0 - FLOOR;
  });
  const out = { ...menu };
  for (const k of keys) {
    const s = r[k];
    let note = "";
    if (s.outcome !== "landed") {
      // An outcome with no magnitude: fatal, or out of the world. Not a comparison,
      // so the magnitude threshold does not apply to it.
      note = `; from here ${k} does not land: the cat ${s.outcome === "laser" ? "meets a laser and dies" : "falls out of the world"}`;
    } else {
      const d1 = Math.hypot(s.x - target.x, s.y - target.y);
      const delta = d0 - d1;
      const material = Math.abs(delta) >= FLOOR;
      if (material && delta > 0) note = `; from here ${k} lands ${delta.toFixed(1)}px closer to ${target.name} than staying here`;
      else if (material) note = `; from here ${k} lands ${Math.abs(delta).toFixed(1)}px further from ${target.name} than staying here${s.y !== snap.cat.y ? `, back up on the floor at y ${Math.round(s.y)}` : ""}`;
      // Below the floor: NO comparative clause. Not a hedge, not "about the same" --
      // silence, because the fall-floor precedent is silence over a statement that
      // decides nothing.
    }
    // The remedy clause names options OTHER than the one being described, so a
    // described option never names itself as the fix. It is emitted only when some
    // option actually cleared the threshold.
    const others = better.filter((b) => b !== k);
    if (others.length === 1) note += `; ${others[0]} is the only offered action that gets closer to ${target.name}`;
    else if (others.length > 1) note += `; ${others.join(" and ")} both get closer to ${target.name}`;
    out[k] = `${menu[k]}${note}`;
  }
  return out;
}

function buildMoveCall(snap, levelGems, objectiveName, deathHistory) {
  const alive = matchGemsToSpawn(levelGems, snap.gemPositions);
  let target;
  if (objectiveName === "portal") {
    target = { name: "the exit portal", x: PORTAL.x, y: PORTAL.y };
  } else if (/^descent_(left|right)$/.test(objectiveName)) {
    // Descent point: steer to that end of the current floor and step off. Target is
    // the end x at the cat's current y (walk to the edge; the fall follows).
    const dp = descentPoints(snap, levelGems).find((p) => p.name === objectiveName);
    if (!dp) throw new Error(`buildMoveCall: descent objective ${objectiveName} no longer available`);
    target = { name: objectiveName, x: dp.x, y: dp.y };
  } else if (/^ascent_(left|right)$/.test(objectiveName)) {
    // Ascent point: walk to that launch x on this floor; the jump does the rest.
    const ap = ascentPoints(snap, levelGems).find((p) => p.name === objectiveName);
    if (!ap) throw new Error(`buildMoveCall: ascent objective ${objectiveName} no longer available`);
    target = { name: objectiveName, x: ap.x, y: ap.y };
  } else {
    const g = alive.find((a) => a.name === objectiveName);
    target = g ? { name: objectiveName, x: g.x, y: g.y } : null;
  }
  if (!target) {
    throw new Error(`buildMoveCall: unknown objective ${objectiveName}`);
  }

  const r = safeRect(snap);
  const cm = catMargins(snap);
  const tm = gemMargin(target, snap);

  const lines = [];
  lines.push(
    `Cat Goric is in a 360x360 warp chamber. Safe rectangle: x ${Math.round(
      r.left
    )}..${Math.round(r.right)}, y ${Math.round(r.top)}..${Math.round(r.bottom)}.`
  );
  lines.push(
    `The cat is at (${Math.round(snap.cat.x)},${Math.round(snap.cat.y)}), ${
      snap.onPlatform ? "standing on a platform" : "in the air, falling"
    }.`
  );
  lines.push(
    `The cat's objective is ${target.name} at (${Math.round(target.x)},${Math.round(
      target.y
    )}): ${offsetPhrase(snap.cat.x, snap.cat.y, target.x, target.y)} from the cat.`
  );
  lines.push(
    `The objective's nearest closing laser is ${Math.round(tm.min)}px away (${tm.side} side).`
  );
  // Countdown at the cat's CURRENT position (see framesUntilLaserAtCat): the clock
  // the model is racing if it does not move. Current position only, not per-option.
  const _cl = countdownLine(snap, target);
  if (_cl) lines.push(_cl);
  lines.push(
    `The cat's own margins to the walls: left ${Math.round(cm.left)}px, right ${Math.round(
      cm.right
    )}px, up ${Math.round(cm.top)}px, down ${Math.round(cm.bottom)}px.`
  );
  if (snap.onPlatform) {
    // Only describe a jump when one is actually on the menu. legalActions prunes
    // every jump once head clearance drops below rise + droneSpeed*frames (64.6px),
    // but this text and the warning below both used the bare 61.2px rise, so
    // between 61.2 and 64.6 the jump options vanished from the menu with nothing
    // in the prompt saying why. On level 4 that band is reached at 48 moving
    // frames on the y=93 floors, which is well before the cat gets back there
    // with gem_a.
    const jumpGone = jumpHitsCeiling(snap);
    if (!jumpGone) {
      lines.push(
        `A jump lifts the cat up to ${jumpApex().rise.toFixed(1)}px and carries it up to about 59px sideways while a direction is held.`
      );
    } else {
      lines.push(
        `Head clearance to the top laser is ${Math.round(cm.headTop)}px, less than a jump needs, so ` +
        `jumping is no longer possible from this floor: the only moves left here are walking.`
      );
    }
    const _jl = jumpLandingNote(snap, target);
    if (_jl) lines.push(_jl);
    const _jr = walkOffFatalNote(snap, target);
    if (_jr) lines.push(_jr);
    // The old "WARNING: a jump would drive the cat's head into the top laser" is
    // gone: it is unreachable. legalActions prunes every jump below 64.6px of head
    // clearance, so any state with less than the 61.2px rise has no jump on the
    // menu to warn about, and the branch above already says why the menu shrank.
  } else {
    lines.push(
      `The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.`
    );
    const snapNote = sideSnapNote(snap);
    if (snapNote) lines.push(snapNote);
  }
  lines.push(platformMap(snap, 3, target.y > snap.cat.y, target));
  lines.push(`Which single command moves the cat toward the objective?`);

  const state = lines.concat(deathHistoryLines(deathHistory, snap)).join("\n");
  const questions = {
    move: {
      type: "choice",
      instructions: "Which single command should the cat issue now?",
      criteria: armDNotes(snap, target, legalActions(snap)),
    },
  };
  return { state, questions, target };
}

// Platforms span x +/- 20 around their stored coordinate (observed geometry).
function platformEdges(x) {
  const CFG = require("./physics.cjs");
  const half = CFG.platformWidth / 2;
  return { left: x - half, right: x + half };
}

// Compact platform map: observable game geometry (like the laser distances), not
// a plan. Gives the cat what it is standing on, the gaps to the nearest platform
// on each side, and the nearby platforms it could land on. Without this the model
// chooses a direction blind to whether there is ground under it, which is why it
// walks off edges into unrecoverable gaps. `maxNear` bounds the list for the
// 1024-token Laya budget.
function platformMap(snap, maxNear, objectiveBelow, target) {
  const P = require("./level_data.cjs");
  const plats = P.platforms(snap.level);
  if (!plats || !plats.length) return "";
  const cx = snap.cat.x;
  const cy = snap.cat.y;
  const Y_TOL = 14; // a platform is "at the cat's level" if its y is within this of the feet

  // Descent rule (pure geometry, never a level check): the cat "has to descend"
  // when its objective lies below the floor it is standing on. Descent information
  // is surfaced when the cat has to descend.
  let mustDescend = objectiveBelow; // the S1 route gate below may narrow it
  // The endpoint's context budget carries the whole decision about how much state
  // to include. A tight budget (maxNear <= 2, the small-context model) carries
  // only descent-relevant map; a richer budget keeps the full description always.
  const tightBudget = maxNear <= 2;
  if (tightBudget && !mustDescend) return "";

  // Match the platform the cat stands on on BOTH x and y (not x alone: L2 has
  // x 160..200 at both y=64 and y=200).
  let cur = null;
  for (const p of plats) {
    const e = platformEdges(p[0]);
    if (cx >= e.left && cx <= e.right && Math.abs(p[1] - cy) <= Y_TOL) { cur = p; break; }
  }
  if (!cur) {
    // Fallback: nearest by x among platforms at the cat's y; else nearest by x.
    for (const p of plats)
      if (Math.abs(p[1] - cy) <= Y_TOL && (!cur || Math.abs(p[0] - cx) < Math.abs(cur[0] - cx))) cur = p;
    if (!cur)
      for (const p of plats) if (!cur || Math.abs(p[0] - cx) < Math.abs(cur[0] - cx)) cur = p;
  }
  const curY = cur[1];

  // Merge contiguous platforms at the SAME y into one run (L2's five y=64
  // platforms abut into a single floor x=80..280). A run boundary is where the
  // cat dies by walking off the end.
  const sameY = plats
    .filter((p) => p[1] === curY)
    .map((p) => platformEdges(p[0]))
    .sort((a, b) => a.left - b.left);
  const runs = [];
  for (const e of sameY) {
    if (runs.length && e.left <= runs[runs.length - 1].right) {
      runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
    } else runs.push({ left: e.left, right: e.right });
  }
  const run = runs.find((r) => cx >= r.left && cx <= r.right) || runs[0];

  // S1 (Claude r3, 2026-09-25): a descent block is only on the route when some
  // floor BELOW this one still keeps the objective's floor reachable.
  // objectiveBelow is a cat-relative y test: on level 4 gem_a sits 63px below
  // the spawn floor while being reached by a SIDEWAYS hop, so the descent block
  // named the floor's two ends -- the only two moves that lose gem_a for good --
  // as "the ONLY descents" in the prompt that says to jump the 52px gap. One-
  // sided: it can only suppress the block, never add it. Airborne/unresolved
  // keeps today's behaviour, matching canReach's no-claim convention.
  const REACH = require("./reachability.cjs");
  const hereKey = REACH.platformKeyUnder(snap.level, cx, cy);
  const objHolder = target ? REACH.platformHolding(snap.level, target.x, target.y) : null;
  const g = REACH.graph(snap.level, snap.cat.height);
  const runByKey = new Map(g.runs.map((r) => [REACH.runKey(r), r]));
  const keepsObjective = (k) =>
    k === objHolder ||
    (REACH.reachableFrom(snap.level, k, snap.cat.height) || new Set()).has(objHolder);
  if (objectiveBelow && hereKey && objHolder) {
    mustDescend = (g.edges[hereKey] || []).some((k) => {
      const kr = runByKey.get(k);
      return kr && kr.y > curY && keepsObjective(k);
    });
  }
  // Gaps only among same-y runs: distance from the run's edges to the next run.
  let leftGap = null, rightGap = null;
  for (const r of runs) {
    if (r === run) continue;
    if (r.right <= run.left) {
      const gg = run.left - r.right;
      if (leftGap == null || gg < leftGap) leftGap = gg;
    } else if (r.left >= run.right) {
      const gg = r.left - run.right;
      if (rightGap == null || gg < rightGap) rightGap = gg;
    }
  }

  // Nearby platforms, y-aware. Exclude the current run's y. Prefer BELOW the cat
  // when the objective is below (the descent route). Report each relative to the
  // cat: how far down/up and which side.
  // Exclude platforms that ARE the floor the cat stands on (already described as
  // "the floor you stand on is continuous from..."), NOT every platform at the same
  // height. A same-height platform ACROSS A GAP is a distinct destination, and
  // hiding it is why level 4 failed: the state said "next platform: right 52px" and
  // then listed only the two platforms BELOW, so walking off the right edge was the
  // reasonable answer to the state the model was given. 14 of 15 attempts died at
  // x=140..154 doing exactly that, at the launch point for the jump across.
  const inThisRun = (p) => p[1] === curY && platformEdges(p[0]).right >= run.left && platformEdges(p[0]).left <= run.right;
  const others = plats.filter((p) => !inThisRun(p) && Math.abs(p[0] - cx) <= 140);
  const score = (p) => {
    const horiz = Math.abs(p[0] - cx);
    const below = p[1] > cy;
    // When descending, below-platforms get priority (lower score).
    const vertBias = objectiveBelow ? (below ? 0 : 200) : (below ? 200 : 0);
    return vertBias + horiz + Math.abs(p[1] - cy) * 0.3;
  };
  const near = others.sort((a, b) => score(a) - score(b)).slice(0, maxNear);
  const nearStr = near
    .map((p) => {
      const e = platformEdges(p[0]);
      const dy = Math.round(p[1] - cy);
      const vert = dy === 0 ? "same height" : `${Math.abs(dy)}px ${dy > 0 ? "below" : "above"}`;
      const side = p[0] > cx ? "right" : p[0] < cx ? "left" : "centred";
      return `x ${Math.round(e.left)}..${Math.round(e.right)} at y ${p[1]} (${vert}, ${side})`;
    })
    .join("; ");

  const gapL = leftGap == null ? "nothing" : `${Math.round(leftGap)}px`;
  const gapR = rightGap == null ? "nothing" : `${Math.round(rightGap)}px`;
  // Stated only when the objective is BEYOND the gap on that side; mid-floor, or
  // with the objective on this floor, it is a true fact that does not bear on the
  // decision, and those have flipped the argmax the wrong way here before.
  let gapMsg = "";
  if (snap.onPlatform && target) {
    // Claude r5 finding 1 (BLOCKING): "only a jump can" from EVERY x on the floor
    // is the sentence that measured 0.987 for the fatal launch. Qualify it with
    // the SAME window jumpLandingNote computed (shared via the function cache),
    // so the persuasive fact stops endorsing a launch x where the jump does not
    // cross to the objective's route. Not pruning: all five moves stay on the menu.
    const win = jumpLandingNote._window && jumpLandingNote._lastSnap === snap ? jumpLandingNote._window : null;
    const qualify = (side) => win && win.plat && win.dir === side ? `; a jump crosses it only from x ${win.lo}..${win.hi}` : "";
    if (rightGap != null && target.x > run.right) {
      gapMsg += `The gap to the RIGHT is ${Math.round(rightGap)}px wide; walking cannot cross it, only a jump can${qualify("right")}. `;
    }
    if (leftGap != null && target.x < run.left) {
      gapMsg += `The gap to the LEFT is ${Math.round(leftGap)}px wide; walking cannot cross it, only a jump can${qualify("left")}. `;
    }
  }
  // Straight-drop outcome for each end of the run, WITH full instant air control.
  // The cat steps off with dy=0 and falls under catFallingAcceleration; every
  // frame it can steer horizontally at catWalkSpeed. So the reachable x interval
  // at a given fall height is [endX - reach, endX + reach] where reach = frames * walk.
  // Frame count is INTEGRATED (the game steps velocity discretely), not closed-form.
  const CFG = require("./physics.cjs");
  const framesToFall = (dist) => {
    if (dist <= 0) return 0;
    let dy = 0, y = 0, f = 0;
    while (y < dist) { dy += CFG.catFallingAcceleration; y += dy; f += 1; }
    return f;
  };
  const dropFrom = (endX) => {
    const reachable = [];
    for (const p of plats) {
      if (p[1] <= curY) continue; // only platforms below
      const reach = framesToFall(p[1] - curY) * CFG.catWalkSpeed;
      const lo = endX - reach, hi = endX + reach;
      const e = platformEdges(p[0]);
      if (e.right >= lo && e.left <= hi) reachable.push({ p, e });
    }
    if (!reachable.length)
      return { survivable: false, carriesTarget: false, text: `fall to the bottom laser (no platform reachable by steering)` };
    const best = reachable
      .map((r) => `steer to land on platform x ${Math.round(r.e.left)}..${Math.round(r.e.right)} at y ${r.p[1]}`)
      .join("; ");
    // Does ANY landing reachable from this end stand under the objective? Horizontal
    // containment in the run's x span, plus THE vertical-overlap rule (above) applied
    // to the landing run's y in place of the cat's current y.
    const carriesTarget = !!target && reachable.some((r) =>
      target.x >= r.e.left && target.x <= r.e.right && targetOverlapsFloor(target, r.p[1], snap.cat.height)
    );
    return { survivable: true, carriesTarget, text: best };
  };
  const dropLeft = dropFrom(run.left);
  const dropRight = dropFrom(run.right);
  // Whether ANY end of this floor is a survivable descent. When both are dead the
  // "ONLY descents are at its ends" line below would name two cliffs as the route
  // (measured on level 4: emitted ~30x per cycle on the y=171 floor, where both
  // ends drop to the laser, against one correct warning). Gate it on a real route.
  const anySurvivableEnd = dropLeft.survivable || dropRight.survivable;
  // (D) escape clause: a strictly-highest platform reachable from this run by a held
  // jump, used only when the both-ends-dead negative above fires. Computed with the
  // same held-action scan hopPoints uses, so it never asserts a landing the driver
  // cannot actually produce.
  let escapeNote = null;
  if (mustDescend && !anySurvivableEnd) {
    const { higherLandings } = require("./hop_points.cjs");
    const esc = higherLandings(snap.level, run, curY, snap.cat.height, platformEdges, 1, cx);
    if (esc.size) {
      const e = esc.get(esc.keys().next().value);
      escapeNote = { plat: e.plat, e: platformEdges(e.plat[0]), x: e.x, dir: e.dir };
    }
  }

  // GATE: the drop-from-end fact is decision-relevant only when stepping off is
  // something the cat could actually do from here, OR when descending is the whole
  // point (objective below this floor). "A short walk" = a couple of decision
  // intervals at catWalkSpeed, derived not hardcoded. Mid-floor with the objective
  // at the same height must NOT see it — surfacing a true-but-irrelevant fact here
  // flips the argmax away from the correct direction (see HANDOVER: implied relevance).
  const nearEdge = 2 * CFG.decisionIntervalFrames * CFG.catWalkSpeed;
  const nearLeftEnd = snap.onPlatform && Math.abs(cx - run.left) <= nearEdge;
  const nearRightEnd = snap.onPlatform && Math.abs(cx - run.right) <= nearEdge;
  const showDrop = mustDescend || nearLeftEnd || nearRightEnd;
  let dropMsg = "";
  if (showDrop) {
    if (nearLeftEnd || mustDescend)
      dropMsg += `Step off the LEFT end (x ${Math.round(run.left)}) and you ${dropLeft.text}. `;
    if (nearRightEnd || mustDescend)
      dropMsg += `Step off the RIGHT end (x ${Math.round(run.right)}) and you ${dropRight.text}. `;
    // FORK DISAMBIGUATION. When both ends are survivable descents the two drops are
    // described symmetrically above, each naming where it lands, and nothing says
    // which landing reaches the objective. Meanwhile the objective line still pulls
    // toward whichever side is nearer, which can be the far end. Say which end is
    // the route. SILENT unless the two ends differ, for the L2 reason: twenty-five
    // true descent sentences cost that level eighteen decisions. This sentence earns
    // its place only when being on the route is the fact that decides.
    //
    // The test is "is the objective ON the landing run", not graph reachability. On
    // L11 reachability is trivially true -- reachableFrom returns all six runs from
    // all six, both directions -- so a bare reachable test would mark BOTH ends and
    // say nothing. The distinguishing fact is that the objective stands on one floor
    // and not the other.
    if (dropLeft.survivable && dropRight.survivable && dropLeft.carriesTarget !== dropRight.carriesTarget) {
      dropMsg += `Of the two, only stepping off the ${dropLeft.carriesTarget ? "LEFT" : "RIGHT"} end lands on a floor carrying ${target.name}. `;
    }
  }
  const runMsg =
    `The floor you stand on is continuous from x ${Math.round(run.left)} to x ${Math.round(run.right)} at y ${curY}. ` +
    // State that the objective is ALREADY on this floor, when the floor spans it
    // and the cat's own collision box standing here overlaps it. Without this the
    // prompt gives the objective as a two-axis offset whose vertical component
    // reads as unmet, and a jump is the only action that can close both axes at
    // once (d108, L11: jump_right 0.852 vs right 0.119, four times out of four;
    // adding this sentence moved right to 0.9996 and jump_right to 0.0002).
    //
    // The vertical bound is derived, not chosen. The game collects a gem by
    // collides(getCatCollisionObject(), gem) -- checkCatCollisionWithGems.ts:10-11 --
    // where the cat is a 1px-wide box from head to feet, y in [cat.y-height, cat.y]
    // (getCatCollisionObject.ts:3-4), and the gem is a 16x16 frame anchored at its
    // centre (getGemAnimations.ts:9-10, anchor in resetGems.ts:11-16), so its box
    // is y in [gy-8, gy+8]. OVERLAP NEEDS BOTH EDGES, so this is a two-sided test:
    //     curY - target.y <= cat.height + GEM_HALF_HEIGHT   gem's bottom reaches cat's head
    //     curY >= target.y - GEM_HALF_HEIGHT                cat's feet are not above gem's top
    //
    // The second leg is not optional. Screen y grows downward, so a gem BELOW this
    // floor makes the first leg negative and trivially true; with only it, every
    // platform asserted "walk to it" about every gem below it. Measured per level
    // over all 15 (config.ts:187 gems x level_data.cjs platforms, |gx-px| <= 26):
    // the one-sided test accepted 55 pairs of which 18 were FALSE, as far as -209;
    // the two-sided test accepts 26 with none false. All 26 are kept, d108 among
    // them -- curY 231: 19 <= 26 and 231 >= 204. The same gem from the y=187 floor
    // one level up is the case that proves the second leg: 187-212 = -25 <= 26 is
    // true, but 187 >= 204 is false, so the clause stays silent and the descent is
    // still described as a descent.
    //
    // SCOPE: restricted to gems, and the bound above is why that is not a narrowing
    // but a correction. The 16x16 box is a gem's (getGemAnimations.ts:9-10); a
    // descent point has no sprite and no measured box, so the +8 this adds to the
    // overlap test is a gem's half-height and means nothing for a descent. The
    // clause was asserting gem geometry about descent points.
    //
    // Measured before restricting, on the unrestricted build, removing this sentence
    // for non-gems only (/^gem_/.test(target.name)):
    //     lvl   unrestricted   gem-only     non-gem firings   verdict
    //     L1        24/331      24/331            10          identical
    //     L2        92/684      74/516            25          gem-only better 1.24x/1.33x
    //     L7        27/258      27/258             5          identical
    //     L8        45/643      45/643            17          identical
    // Across the levels measured, the non-gem half has never once been shown to help.
    // It costs 18 decisions and 168 steps on L2 and is free on the other three. That
    // is a statement about what was measured, NOT that it is harmful: the harm rests
    // on n=1. Firing count does not predict the effect -- L8 fired 17 and moved
    // nothing, L1 fired 10 and went 158 -> 24, L2 fired 25 and went 153 -> 92.
    // Levels with no gem within a run at standing height cannot fire here at all
    // (sites: L0 3, L1 3, L2 1, L4 3, L7 3, L8 3, L11 1, L13 1), so L3, L5 and L9
    // are untouched by construction, not by measurement.
    //
    // Known limit, deliberately not handled here: this asserts that walking reaches
    // the gem and says nothing about a laser or a gap on the way. It is louder than
    // its own evidence. If a level regresses, the first thing to test is whether the
    // cat walked confidently into something -- the answer is a guard on this clause,
    // not a revert, because the clause is right about the geometry.
      (target && /^gem_/.test(target.name) && snap.onPlatform &&
       target.x >= run.left && target.x <= run.right &&
       targetOverlapsFloor(target, curY, snap.cat.height)
      ? `The objective ${target.name} is on THIS floor, ${Math.round(Math.abs(target.x - cx))}px along it — walking ${target.x >= cx ? "right" : "left"} reaches it without jumping. `
      : "") +
    `Beyond those x values there is nothing at this height (next platform: left ${gapL}, right ${gapR}). ` +
    // When the objective is below this floor, state the conclusion that follows
    // from the floor being continuous here: there is no descent at the cat's
    // current x, and the only ways down from this floor are at its two ends. This
    // is pure observable geometry — it names no plan, no ordering, no target — it
    // just stops requiring the model to derive a two-step inference it repeatedly
    // fails. Without it a greedy local policy walks toward the gem's x, finds no
    // drop there, and never leaves the floor.
    (mustDescend && anySurvivableEnd
      ? `There is NO way down at your current x (the floor is unbroken here). The ONLY descents from this floor are at its ends: x ${Math.round(run.left)} (left) and x ${Math.round(run.right)} (right). `
      : mustDescend
        ? `There is NO way down at your current x (the floor is unbroken here), and neither end of this floor is a survivable descent: stepping off either one drops the cat to the bottom laser. There is no safe way down from this floor. ` +
          // Claude round-2 (2026-09-25), change (D): a pure negative leaves the move
          // question with no escape to turn toward — measured on level 4's y=171 floor
          // the model answered 'left' (into the void) against this sentence ~30x per
          // cycle. Name the one higher platform a held jump reaches from this run,
          // in the stated-fact register. Fires only when such a landing exists (else
          // the floor is genuinely a dead end and the negative above stands alone);
          // the L5/L8 regression sweep is re-measured on this build because the
          // firing set is not limited to level 4.
          (escapeNote ? `The only way off this floor is a jump: a jump ${escapeNote.dir} from around x ${Math.round(escapeNote.x)} lands on the platform x ${Math.round(escapeNote.e.left)}..${Math.round(escapeNote.e.right)} at y ${escapeNote.plat[1]}. ` : "")
        : "") +
    // A gap only matters when the objective is on the far side of it. Measured
    // directly against the classifier on level 4's launch point, one call each:
    //
    //   shipped                              right 0.711  jump_right 0.240 -> right
    //   "stepping off loses gem_a"           right 0.100  jump_right 0.043 -> jump_left
    //   "the gap is 52px, walking can't"     right 0.006  jump_right 0.987 -> jump_right
    //
    // The cat had been walking to the floor's end and falling: 9 of 12 attempts
    // died at x=140..154. jump_right from there lands at (201,93) and crosses.
    // Note the middle variant made it WORSE, which is why this is the fact stated
    // and not the consequence.
    gapMsg +
    dropMsg;
  return (
    runMsg + " " + (nearStr ? `Other platforms: ${nearStr}.` : "No other platform nearby.")
  );
}

// Descent points: the two ends of the floor the cat stands on, offered as
// SELECTABLE OBJECTIVES when a remaining objective is below that floor. This is a
// deliberate widening — the model is OFFERED the descent points as things it may
// choose to pursue, exactly as it chooses a gem. It is NOT a plan handed over:
//   * generated ONLY from the general rule "a remaining objective is below the
//     floor the cat stands on" — never level-specific; the same code path yields
//     them on any level with the same geometry.
//   * the menu stays a flat, simultaneously-present set of observable positions.
//   * we do NOT auto-switch the objective when the cat reaches an end, do NOT
//     order the ends, and do NOT let reaching one change what the next menu offers.
// A goal pursued greedily (walk to the descent point) produces the descent as a
// consequence; that is different from the driver sequencing the steps.
function descentPoints(snap, levelGems) {
  if (!snap.onPlatform) return [];
  const P = require("./level_data.cjs");
  const plats = P.platforms(snap.level);
  const cx = snap.cat.x;
  const cy = snap.cat.y;
  const Y_TOL = 14;
  // Current floor platform (x within span, feet within Y_TOL of its top).
  let cur = null;
  for (const p of plats) {
    const e = platformEdges(p[0]);
    if (cx >= e.left && cx <= e.right && Math.abs(p[1] - cy) <= Y_TOL) { cur = p; break; }
  }
  if (!cur) return [];
  const curY = cur[1];
  // Merge contiguous same-y platforms into one run (L2's five y=64 platforms).
  const sameY = plats.filter((p) => p[1] === curY).map((p) => platformEdges(p[0])).sort((a, b) => a.left - b.left);
  const runs = [];
  for (const e of sameY) {
    if (runs.length && e.left <= runs[runs.length - 1].right) runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
    else runs.push({ left: e.left, right: e.right });
  }
  const run = runs.find((r) => cx >= r.left && cx <= r.right) || runs[0];
  // General rule: is any REMAINING objective below this floor? Include the portal
  // when all gems are collected. "Below" = clearly lower on screen than the floor.
  const alive = matchGemsToSpawn(levelGems, snap.gemPositions);
  const objectives = alive.map((g) => ({ x: g.x, y: g.y }));
  if (snap.gemsCollected >= 3) objectives.push({ x: PORTAL.x, y: PORTAL.y });
  const objectiveBelow = objectives.some((o) => o.y > curY + 20);
  if (!objectiveBelow) return [];
  // What does stepping off each end land on? (integrated fall + full air control)
  const CFG = require("./physics.cjs");
  const framesToFall = (dist) => { let dy = 0, y = 0, f = 0; while (y < dist) { dy += CFG.catFallingAcceleration; y += dy; f += 1; } return f; };
  const landOn = (endX) => {
    const out = [];
    for (const p of plats) {
      if (p[1] <= curY) continue;
      const reach = framesToFall(p[1] - curY) * CFG.catWalkSpeed;
      const e = platformEdges(p[0]);
      if (e.right >= endX - reach && e.left <= endX + reach) out.push({ p, e });
    }
    return out;
  };
  const pts = [];
  for (const [side, endX] of [["left", run.left], ["right", run.right]]) {
    const land = landOn(endX);
    // Only offer an end that actually lands on a platform. An end that drops to the
    // bottom laser is not a descent, it is death; do not offer it as a route.
    if (!land.length) continue;
    // Landings are NOT annotated with the gem that sits on them. It was tried:
    // it did not move the descent choice it was aimed at (level 4 with gem_a
    // collected still picks the right descent 24 of 24 menu orderings), and on
    // level 4's START floor it inverted a decision that was working. The right
    // descent there is one-way and loses gem_a, and annotating it made the line
    // advertise TWO gems against that warning:
    //   "lands on x 156..208 at y 241 (gem_c is there) or x 79..131 at y 180
    //    (gem_b is there); ONE-WAY: ... gem_a can no longer be reached."
    // At x=140.25 that took descent_right to 0.521 against gem_a 0.398, and the
    // cat walked off the edge into the stranded state instead of jumping the gap.
    const landDesc = (() => {
      // Claude r6/r7: describe the HELD-ARC landing, not landOn's steer
      // envelope. The envelope lists every floor the reachable-x band ever
      // crosses, so B's right end advertised "x 263..315 at y 171 or x
      // 156..208 at y 241" -- naming gem_c's own floor (D) as a landing the
      // cat produced ZERO times in 9 laps (the held arc lands on C, ~287,171).
      // That false D disjunct is why descent_right won ~85% of on-B decisions
      // and drove the B<->C cycle (measured r5/r6, L4). LANDDESC_ENVELOPE=1
      // restores the old envelope disjunction for A/B.
      const envDesc = land.map((r) => `x ${Math.round(r.e.left)}..${Math.round(r.e.right)} at y ${r.p[1]}`).join(" or ");
      // MEASURED r7 (L4, 27B, 3000 steps): held-arc landDesc made L4 WORSE
      // (21d vs 13d on r6). The new dominant death class was 16x at (76,115)
      // obj=gem_b: on A with gem_b on E below-left, the cat walks off A's left
      // end HOLDING left, drifts to x=76, misses E's left edge (79) by 3px and
      // lasers. The held arc is the wrong model for a descent: a descent is
      // "walk to the edge and step off", and whether the cat releases or keeps
      // pressing through the fall is what decides the landing. Default is the
      // r6 envelope text; LANDDESC_HELD=1 opts into the held-arc description
      // for A/B. See AWAY_DECISIONS.md and Claude round 7.
      if (process.env.LANDDESC_HELD !== "1") return envDesc;
      const { simulate } = require("./arc.cjs");
      const hr = simulate(snap.level, endX, curY, 0, snap.cat.height, side, 0, { grounded: true });
      if (hr.outcome !== "landed") return envDesc; // fail open to old text
      const hp = plats.find((p) => p[1] === Math.round(hr.y) && platformEdges(p[0]).left <= hr.x && platformEdges(p[0]).right >= hr.x);
      if (!hp) return envDesc;
      const he = platformEdges(hp[0]);
      return `x ${Math.round(he.left)}..${Math.round(he.right)} at y ${Math.round(hr.y)}`;
    })();
    pts.push({
      name: `descent_${side}`,
      x: endX,
      y: cy,
      label: `${side} descent point (x ${Math.round(endX)}): step off the ${side} end of your floor to descend — lands on ${landDesc}`,
    });
  }
  return pts;
}

// Hop points: reachable neighbouring platforms (LEVEL or ABOVE) offered as
// selectable objectives. See hop_points.cjs for the rule and why "ascent" was too
// narrow: level 4's gem_a is reachable only via a platform at exactly the same
// height, across a 52px gap, which is neither a descent nor an ascent.
// Going DOWN off the ends of this floor stays descentPoints' job.
function ascentPoints(snap, levelGems) {
  const { hopPoints } = require("./hop_points.cjs");
  const alive = matchGemsToSpawn(levelGems, snap.gemPositions);
  const objectives = alive.map((g) => ({ x: g.x, y: g.y }));
  if (snap.gemsCollected >= 3) objectives.push({ x: PORTAL.x, y: PORTAL.y });
  return hopPoints(snap, objectives, platformEdges);
}

// Side-snap: while FALLING, updateCatSprite.ts:32-38 snaps the cat's feet to the
// top of ANY platform its 1px-wide, full-height collision box touches — there is
// no check that the cat came from above or which side it hit. So brushing a
// platform's SIDE mid-fall teleports the cat onto it. That is a hazard (it silently
// undoes a descent) and a tool (free height without a jump). Observable, deterministic
// physics, same class as the jump height. Surfaced ONLY while airborne and falling,
// and only for platforms actually within lateral reach, or it is noise.
function sideSnapNote(snap) {
  if (snap.onPlatform || snap.cat.dy < 0) return null;
  const plats = require("./level_data.cjs").platforms(snap.level);
  if (!plats || !plats.length) return null;
  const cx = snap.cat.x, cy = snap.cat.y;
  const near = [];
  for (const p of plats) {
    const e = platformEdges(p[0]);
    if (p[1] <= cy) continue;                     // must be below the feet
    const gap = cx < e.left ? e.left - cx : cx > e.right ? cx - e.right : 0;
    if (gap <= SIDE_SNAP_REACH_PX) near.push({ e, y: p[1], gap });
  }
  if (!near.length) return null;
  near.sort((a, b) => a.y - b.y);
  const n = near[0];
  return (
    `While falling, touching ANY part of a platform puts the cat on top of it, including from the side. ` +
    `Platform x ${Math.round(n.e.left)}..${Math.round(n.e.right)} at y ${n.y} is ${Math.round(n.y - cy)}px below and ` +
    `${n.gap === 0 ? "directly beneath you" : Math.round(n.gap) + "px to the " + (cx < n.e.left ? "right" : "left")}: ` +
    `steering into it lands the cat on top rather than passing it.`
  );
}
const SIDE_SNAP_REACH_PX = 24;

// Death history: observable record of the model's OWN prior actions and their
// outcomes from a given position. NOT a plan or a hint about what to do instead.
// Keyed by cat position rounded to 10px. When the model is asked again from a
// position it previously died from, we surface a terse line so the deterministic
// retry sees a DIFFERENT input and can pick differently. Capped to keep the
// 1024-token Laya budget (prompts are ~136 tokens today).
function posKey10(x, y) {
  return `${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`;
}
// Render cap: how many death-history lines reach the prompt per position. This is
// the token-budget guard (Laya context is 1024 tokens; prompts ~136 today). The
// STORE cap (in the runner) is a different, larger bound — do not conflate them.
const DEATH_HISTORY_SHOWN = 3;
function deathHistoryLines(deathHistory, snap) {
  if (!deathHistory || !deathHistory.length) return [];
  const here = posKey10(snap.cat.x, snap.cat.y);
  const hits = deathHistory.filter((h) => h.key === here).slice(-DEATH_HISTORY_SHOWN);
  return hits.map(
    (h) =>
      `On a previous attempt from here you chose ${h.action} and ${h.cause}.`
  );
}

// Laya move call: TWO independent questions in ONE request (simple-jev scores
// each separately against shared state). Q1 jump-needed (noul), Q2 direction
// (choice). Composed mechanically into the game's action encoding. When airborne,
// the jump question is omitted (cannot jump without ground).
function buildLayaMoveCall(snap, levelGems, objectiveName, deathHistory) {
  const alive = matchGemsToSpawn(levelGems, snap.gemPositions);
  let target;
  if (objectiveName === "portal") {
    target = { name: "the exit portal", x: PORTAL.x, y: PORTAL.y };
  } else if (/^descent_(left|right)$/.test(objectiveName)) {
    const dp = descentPoints(snap, levelGems).find((p) => p.name === objectiveName);
    if (!dp) throw new Error(`buildLayaMoveCall: descent objective ${objectiveName} no longer available`);
    target = { name: objectiveName, x: dp.x, y: dp.y };
  } else if (/^ascent_(left|right)$/.test(objectiveName)) {
    // Ascent point: walk to that launch x on this floor; the jump does the rest.
    const ap = ascentPoints(snap, levelGems).find((p) => p.name === objectiveName);
    if (!ap) throw new Error(`buildLayaMoveCall: ascent objective ${objectiveName} no longer available`);
    target = { name: objectiveName, x: ap.x, y: ap.y };
  } else {
    const g = alive.find((a) => a.name === objectiveName);
    target = g ? { name: objectiveName, x: g.x, y: g.y } : null;
  }
  if (!target) throw new Error(`buildLayaMoveCall: unknown objective ${objectiveName}`);

  const r = safeRect(snap);
  const tm = gemMargin(target, snap);
  const rising = snap.cat.dy < 0;
  const falling = snap.cat.dy >= 0;
  const dx = Math.round(target.x - snap.cat.x);
  const dy = Math.round(target.y - snap.cat.y);
  const needHeight = dy < 0; // target above the cat's feet

  // Compact platform map (observable geometry). Laya budget: 2 nearest platforms.
  // Was maxNear 2 (which also tripped the tightBudget trim) on the assumption that
  // Laya's 1024-token window could not hold the full map. Measured 2026-09-23: the
  // complete Qwen-grade state classifies fine on Laya, so the handicap was costing
  // it three lines of geometry for no reason.
  const platNote = platformMap(snap, 3, target.y > snap.cat.y, target);

  const lines = [];
  lines.push(
    `Cat at (${Math.round(snap.cat.x)},${Math.round(snap.cat.y)}), ${
      snap.onPlatform ? "on the ground" : rising ? "rising in the air" : "falling in the air"
    }. Safe box x ${Math.round(r.left)}..${Math.round(r.right)}, y ${Math.round(r.top)}..${Math.round(r.bottom)}.`
  );
  lines.push(
    `Objective ${target.name} at (${Math.round(target.x)},${Math.round(target.y)}): ${dx}px ${dx >= 0 ? "right" : "left"}, ${Math.abs(dy)}px ${needHeight ? "above" : "below"}. Closing laser ${Math.round(tm.min)}px away.`
  );
  // Countdown at the cat's CURRENT position (see framesUntilLaserAtCat): the clock
  // the model is racing if it does not move. Current position only, not per-option.
  const _cl = countdownLine(snap, target);
  if (_cl) lines.push(_cl);
  if (platNote) lines.push(platNote.trim());
  lines.push(`Cat vertical velocity ${Math.round(snap.cat.dy * 10) / 10} (${rising ? "rising" : "falling"}).`);
  if (snap.onPlatform) {
    const lcm = catMargins(snap);
    const apex = jumpApex();
    lines.push(
      `A jump rises ${apex.rise.toFixed(1)}px. Head clearance to the top laser is ${Math.round(lcm.headTop)}px.`
    );
    if (lcm.headTop < apex.rise + require("./physics.cjs").droneSpeed * apex.frames) {
      lines.push(
        `WARNING: a jump from here would drive the cat's head into the top laser and kill it.`
      );
    }
  }
  if (!snap.onPlatform) {
    lines.push(
      `Airborne: steering is instant and reversible — you can reverse direction or stop horizontally on any frame.`
    );
    const snapNoteL = sideSnapNote(snap);
    if (snapNoteL) lines.push(snapNoteL
    );
  }
  const state = lines.concat(deathHistoryLines(deathHistory, snap)).join("\n");

  const questions = {};
  if (snap.onPlatform) {
    questions.jump = {
      type: "noul",
      instructions: "Does the cat need to jump to gain height to reach the objective?",
    };
  }
  // Direction menu, filtered by state and geometry.
  //  - GROUNDED: only `left` / `right`. `wait` and `none` are REMOVED: laser
  //    closure is a MOVEMENT-distance budget (updateDronesVelocity sets drone speed
  //    0.2 only while isCatMoving), so standing still conserves nothing and only
  //    inflates escape time. `wait` is strictly dominated and never offered.
  //  - AIRBORNE: `left` / `right` / `none` — declining to steer mid-arc is a
  //    distinct and sometimes correct choice.
  const dirCriteria = {};
  if (snap.onPlatform) {
    dirCriteria.left = "move left";
    dirCriteria.right = "move right";
  } else {
    dirCriteria.left = "steer left in the air";
    dirCriteria.right = "steer right in the air";
    dirCriteria.none = "keep current trajectory, no steering";
  }
  questions.dir = {
    type: "choice",
    instructions: "Which horizontal direction should the cat move to reach the objective?",
    criteria: dirCriteria,
  };
  return { state, questions, target, needHeight };
}

// Compose (jumpNoul, dir) into a game action. Threshold on the noul for jump.
// GROUNDED yields exactly four actions: left, right, jump_left, jump_right. The
// bare `jump` (rise without travelling) is only produced when the horizontal
// offset is ~0 (<3px), the only case where rising in place is meaningful.
// `wait` is NEVER produced (dominated). AIRBORNE yields left/right/none.
function composeLayaMove(onPlatform, jumpNoul, dir, threshold = 0.5, dx = 0) {
  if (!onPlatform) {
    if (dir === "left") return "left";
    if (dir === "right") return "right";
    return "none";
  }
  const jump = jumpNoul != null && jumpNoul >= threshold;
  if (jump) {
    if (Math.abs(dx) < 3) return "jump";
    if (dir === "left") return "jump_left";
    return "jump_right";
  }
  if (dir === "left") return "left";
  return "right";
}

// Laya decision: objective call (same as before) then the decomposed move call.
// Jump decision threshold on the noul (probability that height is needed).
// Named module constant — no magic default threaded through the call path.
const JUMP_NOUL_THRESHOLD = 0.5;

// Stochastic policy: SAMPLE the model's own distribution instead of taking the
// argmax. A deterministic argmax over an unchanged state gives a byte-identical
// loop no matter what prose we add; sampling makes the post-death retry genuinely
// different. This keeps the model as the decider — we draw from ITS distribution,
// we do not override it or substitute a heuristic.
//
// SIGN WARNING: sampleDistribution uses p^(1/T). T < 1 SHARPENS toward the argmax
// (MORE deterministic), T = 1 samples the model's reported distribution exactly,
// T > 1 FLATTENS toward uniform (MORE exploratory). This is the opposite of the
// LLM-sampling idiom where 0.7 reads as "tame". Do NOT set T < 1 to "be
// conservative" — that is the opposite of conservative for exploration.
const SAMPLE_TEMPERATURE = 1.0; // sample the model's own distribution, no bias
const TEMP_PER_PRIOR_DEATH = 0.5; // escalate exploration per prior death at this position
const TEMP_MAX = 3.0;

// Seeded RNG (mulberry32) so a run is reproducible. Seed via SEED env, else 12345.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RNG = makeRng(Number(process.env.SEED || 12345));

// Fisher-Yates shuffle using a provided seeded RNG (reproducible under SEED).
function shuffleArray(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Temperature-scale a probability distribution and sample one key.
// p_i' = p_i^(1/T) / sum. T=1 samples the raw distribution; T->0 -> argmax;
// T>1 flattens. Weights guard against log(0) by clamping tiny probs.
function sampleDistribution(probs, T, rng) {
  const keys = Object.keys(probs);
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  const w = keys.map((k) => Math.pow(Math.max(probs[k] || 0, 1e-9), 1 / T));
  const sum = w.reduce((s, x) => s + x, 0);
  let r = rng() * sum;
  for (let i = 0; i < keys.length; i++) {
    r -= w[i];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}

// Sample a binary noul (P(jump needed)) under temperature.
function sampleNoul(noul, T, rng) {
  const p = Math.max(noul || 0, 1e-9);
  const q = Math.max(1 - p, 1e-9);
  const wp = Math.pow(p, 1 / T);
  const wq = Math.pow(q, 1 / T);
  return rng() * (wp + wq) < wp;
}

async function layaDecide(client, snap, levelGems, logger, deathHistory) {
  const log = logger || (() => {});
  const objCall = buildObjectiveCall(snap, levelGems, deathHistory);
  let objective, objectiveProbs, calls = 0;
  if (objCall.objectiveNames.length === 1) {
    objective = objCall.objectiveNames[0];
    objectiveProbs = { [objective]: 1 };
    log(`[objective SKIPPED: only 1 candidate (${objective}) after collected=${snap.gemsCollected}; model NOT asked]`);
  } else {
    // buildObjectiveCall already drew ONE permutation shared by the state text and
    // the criteria order, so we pass objCall through unchanged. The Jev classifier
    // returns the chosen NAME (name-keyed), so the mapping back is exact.
    const a = await client.classify(objCall.state, objCall.questions);
    calls += 1;
    objective = a.objective.choice;
    objectiveProbs = a.objective.probabilities;
    log(`[menu-order] presented=[${objCall.presentedOrder.join(",")}] chose -> ${objective}`);
  }
  const moveCall = buildLayaMoveCall(snap, levelGems, objective, deathHistory);
  const m = await client.classify(moveCall.state, moveCall.questions);
  calls += 1;
  const argmaxDir = m.dir.choice;
  const jumpNoul = m.jump ? m.jump.noul : null;
  // Adaptive policy: EXPLOIT the argmax where the model is succeeding (no prior
  // death at this position), and only SAMPLE its distribution where its top choice
  // has already killed the cat. We never override the model — we stop discarding
  // its uncertainty only at positions that have demonstrably failed. Temperature
  // escalates with prior deaths at this 10px key, converging back to argmax where
  // the cat has not died.
  const hereKey = posKey10(snap.cat.x, snap.cat.y);
  const priorDeaths = (deathHistory || []).filter((h) => h.key === hereKey).length;
  const exploring = priorDeaths >= 1;
  const T = Math.min(SAMPLE_TEMPERATURE + TEMP_PER_PRIOR_DEATH * priorDeaths, TEMP_MAX);
  let dir, sampledJump;
  if (!exploring) {
    dir = argmaxDir;
    sampledJump = jumpNoul != null && jumpNoul >= JUMP_NOUL_THRESHOLD;
  } else {
    dir = sampleDistribution(m.dir.probabilities, T, RNG);
    sampledJump = jumpNoul != null ? sampleNoul(jumpNoul, T, RNG) : false;
  }
  const jumpNoulEffective = sampledJump ? Math.max(jumpNoul || 0, JUMP_NOUL_THRESHOLD + 0.01) : Math.min(jumpNoul || 0, JUMP_NOUL_THRESHOLD - 0.01);
  const dxTarget = Math.round(moveCall.target.x - snap.cat.x);
  const move = composeLayaMove(snap.onPlatform, jumpNoulEffective, dir, JUMP_NOUL_THRESHOLD, dxTarget);
  log(`obj=${objective} dir=${dir}(argmax ${argmaxDir}) jump=${sampledJump}(noul ${jumpNoul}) mode=${exploring ? "SAMPLE" : "ARGMAX"} T=${T.toFixed(2)} priorDeaths=${priorDeaths} -> ${move}`);
  // Verbatim dump of every Laya decision (append, never overwrite), for byte-level
  // comparison against a faithful reconstruction.
  try {
    const fs = require("fs");
    let prev = [];
    try { prev = JSON.parse(fs.readFileSync(CFG.outPath("laya_prompt_dump.json"), "utf8")); if (!Array.isArray(prev)) prev = []; } catch (_) {}
    prev.push({
      cat: { x: snap.cat.x, y: snap.cat.y, dy: snap.cat.dy, onPlatform: snap.onPlatform },
      objective,
      objectiveState: objCall.state,
      objectiveQuestions: objCall.questions,
      objectiveProbs,
      candidatesOffered: objCall.objectiveNames.length,
      ...(CEILING_TRACE ? { ceiling: ceilingTrace(snap) } : {}),
      modelAsked: objCall.objectiveNames.length > 1,
      moveState: moveCall.state,
      moveQuestions: moveCall.questions,
      moveRawAnswers: m,
      argmaxDir,
      sampledDir: dir,
      sampledJump,
      policyMode: exploring ? "SAMPLE" : "ARGMAX",
      temperatureUsed: T,
      priorDeathsAtPosition: priorDeaths,
      dxTarget,
      composedAction: move,
    });
    fs.writeFileSync(CFG.outPath("laya_prompt_dump.json"), JSON.stringify(prev, null, 2));
  } catch (_) {}
  return {
    objective,
    objectiveProbs,
    move,
    targetPos: { x: moveCall.target.x, y: moveCall.target.y },
    presentedOrder: objCall.presentedOrder,
    moveProbs: { dir: m.dir.probabilities, jumpNoul },
    calls,
    candidatesOffered: objCall.objectiveNames.length,
    modelAsked: objCall.objectiveNames.length > 1,
  };
}

// Halogen control decision: same observable state as the Laya path, but Halogen
// is a plain instruct model, so we append a single-letter menu and take the greedy
// argmax. NOT a Jev classifier — a run driven by this does not satisfy the
// challenge; it is a diagnostic control only. Objective and move are still two
// separate asks so the move sees the chosen objective.
function letterMenu(names) {
  const letters = "ABCDEFGH";
  const lines = names.map((n, i) => `  ${letters[i]}) ${n}`);
  return { letters, text: lines.join("\n") };
}

// Typed error for a malformed (unparseable) model response. The runner catches this
// specially: one malformed response records a failed decision at the position and
// continues (feeding exploration), rather than ending the whole ladder.
class HalogenParseError extends Error {
  constructor(raw, menuLetters) {
    const arr = Array.isArray(menuLetters) ? menuLetters : String(menuLetters || "").split("");
    super(`halogen response not parseable to a menu letter; raw=${JSON.stringify(raw)} menu=[${arr.join(",")}]`);
    this.name = "HalogenParseError";
    this.raw = raw;
    this.menuLetters = arr;
  }
}

// Parse a model response into a menu letter WITHOUT guessing.
//  1. Accept if the whole trimmed response is exactly one in-menu letter.
//  2. Else collect the set of DISTINCT standalone menu letters in the response
//     (word-boundary matched against the ACTUAL menu letters, not a blanket A-H).
//     - exactly one distinct letter -> take it.
//     - more than one -> AMBIGUOUS -> return null. Scanning by menu order or by
//       text position both silently pick wrong on "Not A, choose C"; a coin flip
//       between two named options is the silent-wrong-answer case we never allow.
//  3. None -> return null (caller retries then throws with the raw content).
function parseMenuLetter(raw, menuLetters) {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (t.length === 1 && menuLetters.includes(t)) return t;
  const found = new Set();
  for (const L of menuLetters) {
    const re = new RegExp(`(^|[^A-Z])${L}([^A-Z]|$)`);
    if (re.test(t)) found.add(L);
  }
  if (found.size === 1) return [...found][0];
  return null; // ambiguous (multiple distinct menu letters) or none
}

// Ask + parse with ONE retry. On persistent failure throw HalogenParseError(raw).
async function askMenuLetter(client, prompt, menuLetters) {
  let lastRaw = "";
  for (let i = 0; i < 2; i++) {
    const raw = await client.ask(prompt);
    lastRaw = raw;
    const letter = parseMenuLetter(raw, menuLetters);
    if (letter) return letter;
  }
  // Dump the exact failing prompt + raw so we can see what the model was asked and
  // what it actually returned (diagnosing the "To" truncation class).
  try {
    const fs = require("fs");
    fs.writeFileSync(CFG.outPath("halogen_parse_fail.json"), JSON.stringify({ prompt, raw: lastRaw, menuLetters }, null, 2));
  } catch (_) {}
  throw new HalogenParseError(lastRaw, menuLetters);
}

async function halogenDecide(client, snap, levelGems, logger, deathHistory) {
  const log = logger || (() => {});
  const LETTERS = "ABCDEFGH";
  const dump = [];

  // --- Objective ---
  const objCall = buildObjectiveCall(snap, levelGems, deathHistory);
  let objective, calls = 0;
  if (objCall.objectiveNames.length === 1) {
    objective = objCall.objectiveNames[0];
    log(`[objective SKIPPED: only 1 candidate (${objective}) after collected=${snap.gemsCollected}; model NOT asked]`);
    dump.push({ phase: "objective", skipped: true, names: objCall.objectiveNames, chosen: objective });
  } else {
    // buildObjectiveCall drew ONE permutation shared by the state text and
    // objectiveNames, so the menu built from objectiveNames matches the state
    // listing exactly. The chosen letter maps back through objectiveNames.
    const presented = objCall.objectiveNames;
    const menu = letterMenu(presented);
    const prompt =
      objCall.state +
      "\nPick the single best objective to pursue now.\n" +
      menu.text +
      "\nAnswer with ONE letter only.";
    const letter = await askMenuLetter(client, prompt, menu.letters.slice(0, presented.length));
    const idx = LETTERS.indexOf(letter);
    if (idx < 0 || idx >= presented.length) {
      throw new HalogenParseError(letter, menu.letters.slice(0, presented.length));
    }
    objective = presented[idx]; // map chosen letter back via the presented order
    calls += 1;
    log(`[menu-order] presented=[${presented.join(",")}] chose ${letter} -> ${objective}`);
    dump.push({
      phase: "objective",
      objectiveNames: objCall.objectiveNames,
      presentedOrder: presented,
      state: objCall.state,
      menu: menu.text,
      prompt,
      letter,
      chosen: objective,
    });
  }

  // --- Move (same state string as Laya, letter menu over legal actions) ---
  const moveCall = buildLayaMoveCall(snap, levelGems, objective, deathHistory);
  const legal = legalActions(snap);
  const actionNames = Object.keys(legal);
  const menu = letterMenu(actionNames);
  const prompt =
    moveCall.state +
    "\nChoose the single best movement action.\n" +
    menu.text +
    "\nAnswer with ONE letter only.";
  const letter = await askMenuLetter(client, prompt, menu.letters.slice(0, actionNames.length));
  const idx = LETTERS.indexOf(letter);
  if (idx < 0 || idx >= actionNames.length) {
    throw new HalogenParseError(letter, menu.letters.slice(0, actionNames.length));
  }
  const move = actionNames[idx];
  calls += 1;
  const _result = {
    objective,
    objectiveProbs: null,
    move,
    targetPos: { x: moveCall.target.x, y: moveCall.target.y },
    presentedOrder: objCall.presentedOrder,
    moveProbs: { letter },
    calls,
    candidatesOffered: objCall.objectiveNames.length,
    modelAsked: objCall.objectiveNames.length > 1,
  };
  dump.push({
    phase: "move",
    objective,
    actionNames,
    state: moveCall.state,
    menu: menu.text,
    prompt,
    letter,
    chosen: move,
  });
  // Verbatim dump of every prompt actually sent, for byte-level comparison.
  try {
    const fs = require("fs");
    const all = JSON.parse(fs.readFileSync(CFG.outPath("halogen_prompt_dump.json"), "utf8"));
    (Array.isArray(all) ? all : []).push({ cat: { x: snap.cat.x, y: snap.cat.y, onPlatform: snap.onPlatform }, dump });
  } catch (_) {}
  try {
    const fs = require("fs");
    const prev = (() => { try { return JSON.parse(fs.readFileSync(CFG.outPath("halogen_prompts_all.json"), "utf8")); } catch (_) { return []; } })();
    prev.push({ cat: { x: snap.cat.x, y: snap.cat.y, onPlatform: snap.onPlatform }, dump });
    fs.writeFileSync(CFG.outPath("halogen_prompts_all.json"), JSON.stringify(prev, null, 2));
  } catch (_) {}
  log(`obj=${objective} dirLetter=${letter} -> ${move}`);
  return _result;
}

// Run both calls. Returns { objective, objectiveProbs, move, moveProbs }.
// When only ONE objective remains there is no choice to make, so the objective
// classifier call is skipped (the API also rejects a 1-item choice). This is not
// a planner: with a single surviving goal there is literally nothing to decide.
// Visits to the same 10px key WITHIN THE LAST VISIT_WINDOW DECISIONS before the
// argmax is treated as demonstrably failed. A couple of revisits are normal play
// (walking back along a platform to line up a jump); a fourth inside one short
// window means the cat is not making progress.
//
// The window is the point. Counting visits over the whole attempt fired on
// positions the cat legitimately passes through several times during a long
// level: on level 2 the cat crossed the y=240 floor four times in one attempt,
// which flipped the policy to SAMPLE and drew `jump` (p=0.35) over the argmax
// `jump_left` (p=0.51). A standing jump costs 34 moving frames; the cat then
// reached the third gem with 49 frames of life left and needed 49 just to walk
// back to the portal, so it died with the level effectively already lost. The
// escape hatch was spending the budget it was supposed to protect.
const VISIT_WINDOW = 12;
const VISIT_STUCK_THRESHOLD = 3;
const TEMP_PER_REVISIT = 0.5;

async function decide(client, snap, levelGems, logger, deathHistory, visitCounts, memo) {
  const log = logger || (() => {});
  const objCall = buildObjectiveCall(snap, levelGems, deathHistory);

  let objective;
  let objectiveProbs;
  let calls = 0;
  // AIRBORNE: carry the objective the jump was launched for instead of re-asking.
  // The airborne prompt is strictly LESS informed than the grounded one. The
  // stranding annotations ("TAKING THIS FIRST LOSES gem_a PERMANENTLY") are
  // anchored by REACH.platformKeyUnder, whose 14px tolerance stops resolving a
  // few frames into a jump; from there the listing is bare distances, so the
  // nearest gem wins -- and on level 4 the nearest gem is the one that strands
  // the cat. Measured at the launch point (129.75,93) with the warnings present,
  // gem_a is chosen 35 of 40 orderings; 18px into the jump at (136.75,75) with
  // them absent, gem_b is chosen 6 of 6 at p=1.000 regardless of list position.
  // The steer that follows then cancels the jump that was just launched, which
  // is the loop that kept level 4 from ever clearing.
  // Re-asking cannot help even in principle: the arc is fixed once the cat
  // leaves the ground, and only horizontal air control remains, which should
  // serve the objective the jump was launched for. The lock is dropped when the
  // held objective is no longer on the menu (gem collected mid-arc, or a
  // descent/ascent waypoint that airborne states do not offer), and the runner
  // clears it on death/reset.
  // STICKY_OBJECTIVE widens the same lock to grounded decisions. Measured on a
  // failing level-4 run: 106 of 257 decisions changed objective, 67 of them when
  // the MENU ITSELF had changed between calls. Waypoints exist only near certain
  // spots, so walking makes options appear and vanish underfoot; the cat reverses,
  // the menu reverts, and it flips back. A 7px step moved p(descent_left) from
  // 0.018 to 0.473 with the same five labels on offer. The flips are confident
  // (median margin 0.913), so a score threshold cannot damp them; only refusing
  // to re-ask can. The lock still releases on its own terms below.
  // Keyed to what actually changed. Measured on a failing level-4 run: of 106
  // objective flips, 63 followed a FLOOR change (legitimate - different floor,
  // different options) and 31 were same-floor, same-menu, no reset: pure scoring
  // noise off +/-7px steps, e.g. p(descent_right) 0.034 -> 0.962 -> 0.015 on
  // consecutive decisions. That is a closed loop: the objective flips, the cat
  // reverses, the flip reverses. Holding the objective UNCONDITIONALLY instead
  // (an earlier attempt) locked gem_b for all 466 decisions and failed worse, so
  // the key must release on a real change and only damp the noise.
  // The floor+menu key above was still too brittle for a WAYPOINT. Measured on
  // level 4 with it enabled: 281 decisions, 8 deaths, and an exact limit cycle of
  // 31 decisions repeated 8 times -
  //   gem_b, gem_a x9, gem_c x3, descent_right, gem_c x4, descent_right x2, ...
  // descent_right is chosen and then abandoned after one or two decisions, every
  // time, so the cat never reaches the edge it was heading for. The menu key is
  // what releases it: the laser descends between decisions, so the reachable set
  // changes underfoot even when the cat has not moved and its floor has not
  // changed. A gem's key can release on that - a gem is reachable or it is not.
  // A waypoint's cannot: the whole point of "walk to this edge and step off" is
  // that it takes several decisions to execute, and its completion condition is a
  // FLOOR CHANGE, not a menu that held still. So a locked waypoint releases on a
  // floor change, on vanishing from the menu, on death (the runner clears memo),
  // or on the cap below - never on an unrelated menu edit.
  const STICKY = process.env.STICKY_OBJECTIVE === "1";
  const WAYPOINT = /^(?:descent|ascent)_(?:left|right)$/;
  // Bounds the commitment so a waypoint that is never reachable cannot eat the
  // run, which is exactly how the unconditional lock failed (466 decisions on one
  // objective). Level 4 clears in 54 decisions TOTAL when it clears, so a single
  // waypoint still pending after 30 is not being executed, it is stuck.
  const WAYPOINT_COMMIT_CAP = 30;
  const menuKey = [...objCall.objectiveNames].sort().join(",");
  const floorKey = snap.onPlatform ? Math.round(snap.cat.y) : null;
  const lockedWaypoint = !!(memo && memo.lockedObjective && WAYPOINT.test(memo.lockedObjective));
  const sameFloor = !!(memo && floorKey !== null && memo.lockFloorKey === floorKey);
  const sameSituation =
    sameFloor &&
    (lockedWaypoint
      ? (memo.lockHeldFor || 0) < WAYPOINT_COMMIT_CAP
      : memo.lockMenuKey === menuKey);
  const held =
    memo && memo.lockedObjective &&
    ((STICKY && sameSituation) || !snap.onPlatform) &&
    objCall.objectiveNames.includes(memo.lockedObjective)
      ? memo.lockedObjective
      : null;
  if (memo && STICKY && !held && memo.lockedObjective && snap.onPlatform) {
    // Named so the next run's log says which release fired, instead of leaving it
    // to be guessed from the objective sequence again.
    const why = !sameFloor
      ? "floor changed"
      : !objCall.objectiveNames.includes(memo.lockedObjective)
        ? "off menu"
        : lockedWaypoint
          ? "commit cap"
          : "menu changed";
    log(`lock released (${memo.lockedObjective}): ${why}`);
  }
  if (held) {
    objective = held;
    objectiveProbs = { [objective]: 1 };
    log(`objective=${objective} (held${snap.onPlatform ? " from last decision; sticky" : " from launch; airborne"}, not re-asked)`);
  } else if (objCall.objectiveNames.length === 1) {
    objective = objCall.objectiveNames[0];
    objectiveProbs = { [objective]: 1 };
    log(`objective=${objective} (only goal, call skipped)`);
  } else {
    // POSITION DEBIAS. The objective is scored twice, once with the labels in the
    // drawn order and once with that order REVERSED, and the two distributions are
    // averaged. Whatever is listed first in one pass is last in the other.
    //
    // A single draw is not safe here. Measured on level 4's launch position
    // (140.25,93) over 20 distinct menu orderings: the single draw picked a
    // one-way descent in 2 of 20, and in both the descent was listed FIRST;
    // averaging with the reverse picked gem_a 20 of 20. An earlier 40-ordering
    // sweep put the same effect at 5 of 40, with descent points scoring 0.41 and
    // 0.28 in first position against 0.005-0.025 anywhere else.
    //
    // 35 of 40 looked robust and was not: on this level the losing draws are
    // UNRECOVERABLE. A one-way descent strands gem_a for the rest of the attempt,
    // and the choice is re-rolled every time the cat stands on that floor, so a
    // 10% per-decision chance of an irreversible mistake is a certainty, not an
    // edge case. The average was fine; the tail was what mattered.
    const revNames = [...objCall.objectiveNames].reverse();
    const revCriteria = {};
    for (const n of revNames) revCriteria[n] = objCall.questions.objective.criteria[n];
    const [fwd, rev] = [
      await client.classify(objCall.state, objCall.questions),
      await client.classify(objCall.state, { objective: { ...objCall.questions.objective, criteria: revCriteria } }),
    ];
    calls += 2;
    objectiveProbs = {};
    for (const n of objCall.objectiveNames) {
      objectiveProbs[n] = ((fwd.objective.probabilities[n] || 0) + (rev.objective.probabilities[n] || 0)) / 2;
    }
    objective = Object.keys(objectiveProbs).reduce((a, b) => (objectiveProbs[a] >= objectiveProbs[b] ? a : b));
    log(`objective=${objective} probs=${JSON.stringify(objectiveProbs)} (order-debiased)`);
  }
  if (memo) {
    memo.lockHeldFor = memo.lockedObjective === objective ? (memo.lockHeldFor || 0) + 1 : 0;
    memo.lockedObjective = objective;
    if (snap.onPlatform) { memo.lockFloorKey = floorKey; memo.lockMenuKey = menuKey; }
  }

  const moveCall = buildMoveCall(snap, levelGems, objective, deathHistory);
  // The exact prompt text is the thing under test, and the log does not record
  // it. The driver knows the string; the archive does not. That gap is the same
  // shape as dy, cat.height and presentedOrder, and it is why an offline probe
  // had to guess at a grounded prompt and reproduce 0 of 197 of them.
  // Off unless PROMPT_DUMP names an output file, so an unset env var cannot
  // change behaviour. Write is append-only, one JSON object per line.
  if (process.env.PROMPT_DUMP) {
    require("fs").appendFileSync(process.env.PROMPT_DUMP, JSON.stringify({
      calls,
      cat: { x: snap.cat.x, y: snap.cat.y, dy: snap.cat.dy, h: snap.cat.height },
      onPlatform: snap.onPlatform,
      // Raw, not the derived movingFrames: the 0.2 platform speed that formula
      // needs belongs to run_level.cjs, and duplicating it here would let the
      // dump disagree with the archive silently if that speed ever changed.
      drones: snap.drones,
      objective,
      moveState: moveCall.state,
      moveQuestions: moveCall.questions,
      objectiveState: objCall.state,
    }) + "\n");
  }
  const moveAns = await client.classify(moveCall.state, moveCall.questions);
  calls += 1;
  const argmaxMove = moveAns.move.choice;
  const moveProbs = moveAns.move.probabilities;
  // Same adaptive policy as layaDecide: EXPLOIT the argmax where the model has not
  // yet died at this 10px position, and SAMPLE its own distribution only where its
  // top choice has demonstrably killed the cat. Argmax alone makes a death loop
  // permanent: the level resets to an identical state, so the identical answer
  // replays forever (observed as byte-identical attempts on level 1).
  // A livelock does not need a death. On level 2 the cat oscillated between two
  // positions 7px apart for 10+ decisions because the offered candidate set flips
  // across a proximity gate (5 objectives at one x, 3 at the other), so the
  // objective flips and the walk cancels out. Revisits to the same key are
  // therefore treated as the same evidence of a failed argmax that a death is.
  const hereKey = posKey10(snap.cat.x, snap.cat.y);
  const priorDeaths = (deathHistory || []).filter((h) => h.key === hereKey).length;
  const visits = visitCounts ? visitCounts.get(hereKey) || 0 : 0;
  const revisits = Math.max(0, visits - VISIT_STUCK_THRESHOLD);
  const exploring = priorDeaths >= 1 || revisits >= 1;
  // MAX, not sum. run_full.cjs has its own progress-based stall detector that
  // pushes a synthetic failure per key into deathHistory, so on that runner both
  // terms fire for the same livelock. Summing them drove T to the cap, which
  // flattens a 0.99-confidence answer to near-uniform and discards the model's
  // judgement entirely — observed as the cat jumping into the ceiling at random.
  const stuckness = Math.max(
    TEMP_PER_PRIOR_DEATH * priorDeaths,
    TEMP_PER_REVISIT * revisits
  );
  const T = Math.min(SAMPLE_TEMPERATURE + stuckness, TEMP_MAX);
  const move = exploring ? sampleDistribution(moveProbs, T, RNG) : argmaxMove;
  log(`move=${move}(argmax ${argmaxMove}) mode=${exploring ? "SAMPLE" : "ARGMAX"} T=${T.toFixed(2)} priorDeaths=${priorDeaths} revisits=${revisits} probs=${JSON.stringify(moveProbs)}`);

  return {
    objective,
    objectiveProbs,
    move,
    targetPos: { x: moveCall.target.x, y: moveCall.target.y },
    presentedOrder: objCall.presentedOrder,
    moveProbs,
    calls,
    candidatesOffered: objCall.objectiveNames.length,
    // Honest for the overlay and the log: a held objective was not asked for.
    modelAsked: !held && objCall.objectiveNames.length > 1,
    objectiveHeld: !!held,
    // The overlay reads this to label the policy honestly.
    policyMode: exploring ? "SAMPLE" : "ARGMAX",
    argmaxMove,
    samplingTemperature: T,
    priorDeathsHere: priorDeaths,
    revisitsHere: revisits,
    visitsHere: visits,
    objectiveQuestion: (objCall.questions.objective || {}).instructions,
    moveQuestion: (moveCall.questions.move || {}).instructions,
  };
}

module.exports = {
  PORTAL,
  safeRect,
  catMargins,
  gemMargin,
  framesUntilLaserAtCat,
  matchGemsToSpawn,
  legalActions,
  buildObjectiveCall,
  buildMoveCall,
  decide,
  buildLayaMoveCall,
  layaDecide,
  composeLayaMove,
  halogenDecide,
  descentPoints,
  ascentPoints,
  HalogenParseError,
  parseMenuLetter,
  askMenuLetter,
  platformEdges,
  VISIT_WINDOW,
  VISIT_STUCK_THRESHOLD,
  jumpApex,
  jumpHitsCeiling,
  ceilingTrace,
};
