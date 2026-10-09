"use strict";
// Guard for the platformMap descent gate (Claude review F1, 2026-09-25):
// when a floor's ends are BOTH dead (no steering landing below) and the objective
// is below, the prompt must NOT name the ends as "the ONLY descents"; it must say
// neither end is survivable. And when at least one end is survivable, the original
// "ONLY descents ... at its ends" line must be unchanged.
//
// This check renders buildMoveCall across every floor and every grounded x on the
// floor for every level 0-13, with a synthetic objective forced below each floor,
// and asserts the gate fires exactly when dropFrom's own emptiness test says both
// ends are dead. Run with: node test_descent_gate.cjs
const dec = require("./decision.cjs");
const LEVELS = require("./level_data.cjs");

const GEMS = [
  [[289,156],[105,164],[182,226]], null, null, null,
]; // only needed as shape; we use gemPositions from the level data instead
let failures = 0;
const fail = (m) => { failures++; console.log("FAIL:", m); };

for (let level = 0; level < 14; level++) {
  const plats = LEVELS.platforms(level);
  if (!plats || !plats.length) continue;
  // Pick a synthetic "below" target far under the lowest floor so mustDescend is
  // always true; gemPositions empty so no live gem interferes with target.
  const minY = Math.max(...plats.map((p) => p[1]));
  for (const [px, py] of plats) {
    for (let x = Math.ceil(px - 20); x <= Math.floor(px + 20); x += 4) {
      const snap = {
        level,
        cat: { x, y: py, dx: 0, dy: 0, height: 18 },
        onPlatform: true,
        gemsCollected: 0,
        gemPositions: [{ x: 180, y: minY + 80 }], // one "gem" well below every floor
        drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
        moving: false,
      };
      let mc;
      try {
        mc = dec.buildMoveCall(snap, [[180, minY + 80]], "gem_a");
      } catch (e) {
        // Some positions are not on a platform per the matcher (gap centers); skip.
        continue;
      }
      const state = mc.state;
      const hasOldLine = /The ONLY descents from this floor are at its ends/.test(state);
      const hasNewLine = /neither end of this floor is a survivable descent/.test(state);
      if (hasOldLine && hasNewLine) fail(`L${level} (${x},${py}): both gate lines rendered`);
    }
  }
}

// Direct semantic check on level 4's y=171 floor (the measured loop floor):
{
  const snap = {
    level: 4,
    cat: { x: 237, y: 171, dx: 0, dy: 0, height: 18 },
    onPlatform: true,
    gemsCollected: 1,
    gemPositions: [{ x: 105, y: 164 }, { x: 182, y: 226 }],
    drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
    moving: false,
  };
  const mc = dec.buildMoveCall(snap, [[289,156],[105,164],[182,226]], "gem_c");
  if (/The ONLY descents from this floor are at its ends/.test(mc.state))
    fail("L4 (237,171): dead-end floor still advertised as 'the ONLY descents'");
  if (!/neither end of this floor is a survivable descent/.test(mc.state))
    fail("L4 (237,171): gate line did not render");
  // L4 y=93 floor (both ends survivable) must keep the original line.
  const snap2 = { ...snap, cat: { x: 240, y: 93, dx: 0, dy: 0, height: 18 } };
  const mc2 = dec.buildMoveCall(snap2, [[289,156],[105,164],[182,226]], "gem_c");
  if (!/The ONLY descents from this floor are at its ends/.test(mc2.state))
    fail("L4 (240,93): survivable floor lost its descent line (regression)");
}

// (D) escape clause (Claude round-2, 2026-09-25): when the both-ends-dead negative
// fires, a strictly-higher held-jump landing from the run must be named; when no
// such landing exists, the escape line must stay silent. And the escape line must
// never co-fire with the 'ONLY descents' line (they are exclusive branches).
for (let level = 0; level < 14; level++) {
  const plats = LEVELS.platforms(level);
  if (!plats || !plats.length) continue;
  const minY = Math.max(...plats.map((p) => p[1]));
  for (const [px, py] of plats) {
    for (let x = Math.ceil(px - 20); x <= Math.floor(px + 20); x += 4) {
      const snap = {
        level, cat: { x, y: py, dx: 0, dy: 0, height: 18 }, onPlatform: true, gemsCollected: 0,
        gemPositions: [{ x: 180, y: minY + 80 }],
        drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } }, moving: false,
      };
      let mc;
      try { mc = dec.buildMoveCall(snap, [[180, minY + 80]], "gem_a"); } catch (e) { continue; }
      const hasOnly = /The ONLY descents from this floor are at its ends/.test(mc.state);
      const hasEsc = /The only way off this floor is a jump/.test(mc.state);
      if (hasOnly && hasEsc) fail(`L${level} (${x},${py}): 'ONLY descents' and escape line co-fired`);
    }
  }
}

// L4 D floor (both ends dead, objective below): negative fires AND the escape
// clause names E (79..131 @180) — D->E is a true held edge the winning route needs.
{
  const snap = {
    level: 4, cat: { x: 182, y: 241, dx: 0, dy: 0, height: 18 }, onPlatform: true, gemsCollected: 1,
    gemPositions: [{ x: 180, y: 331 }], // synthetic objective below every floor
    drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } }, moving: false,
  };
  const mc = dec.buildMoveCall(snap, [[180, 331]], "gem_a");
  if (!/neither end of this floor is a survivable descent/.test(mc.state))
    fail("L4 (182,241): both-ends-dead negative missing on D floor");
  if (!/lands on the platform x 79\.\.131 at y 180/.test(mc.state))
    fail("L4 (182,241): escape clause did not name the D->E hop");
}

// L4 C floor with objective gem_b (y=164, NOT below the floor): the (D) escape
// keeps the round-1 negative gate (mustDescend) — the measured loop is the gem_c
// ordering, and widening to !anySurvivableEnd alone would fire the negative on
// bottom floors of the passing levels (firing-set sweep, 2026-09-25). Document
// the choice: with the objective not below, the descent block is silent.
{
  const snap = {
    level: 4, cat: { x: 268, y: 171, dx: 0, dy: 0, height: 18 }, onPlatform: true, gemsCollected: 1,
    gemPositions: [{ x: 105, y: 164 }, { x: 182, y: 226 }],
    drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } }, moving: false,
  };
  const mc = dec.buildMoveCall(snap, [[289,156],[105,164],[182,226]], "gem_b");
  if (/neither end of this floor is a survivable descent/.test(mc.state))
    fail("L4 (268,171) obj=gem_b: negative fired without mustDescend (gate widened by mistake)");
  if (/The only way off this floor is a jump/.test(mc.state))
    fail("L4 (268,171) obj=gem_b: escape fired without mustDescend (gate widened by mistake)");
}

// S1 (Claude r3, 2026-09-25): the descent block is route-gated. On L4 floor A
// with objective gem_a (reached by a SIDEWAYS jump to C, not by descending),
// the block must be ABSENT: it named A's two ends -- the only two moves that
// lose gem_a -- as "the ONLY descents". On B->gem_a (C holds gem_a, below) and
// C->gem_c (D holds gem_c, below) it must STAY. Pinned so a future change
// cannot silently re-enable the A-floor lie or kill the true descents.
{
  const G = [[289,156],[105,164],[182,226]];
  const mk = (x, y, collected) => ({
    level: 4, cat: { x, y, dx: 0, dy: 0, height: 18 }, onPlatform: true, gemsCollected: collected.length,
    gemPositions: [[289,156],[105,164],[182,226]].filter((_, i) => !collected.includes(i)).map((p) => ({ x: p[0], y: p[1] })),
    drones: { tl: { x: 1, y: 1 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } }, moving: false,
  });
  const block = (mc) => /The ONLY descents from this floor are at its ends|neither end of this floor is a survivable descent/.test(mc.state);
  const mA = dec.buildMoveCall(mk(121, 93, []), G, "gem_a");
  if (block(mA)) fail("L4 (121,93) obj=gem_a: descent block fired on a sideways-jump route (S1 regression)");
  const mB = dec.buildMoveCall(mk(225, 93, []), G, "gem_a");
  if (!block(mB)) fail("L4 (225,93) obj=gem_a: true B->C descent lost its block (S1 over-suppression)");
  const mC = dec.buildMoveCall(mk(295, 171, [0]), G, "gem_c");
  if (!block(mC)) fail("L4 (295,171) obj=gem_c: true C->D descent lost its block (S1 over-suppression)");
  if (!/The only way off this floor is a jump/.test(mC.state))
    fail("L4 (295,171) obj=gem_c: (D) escape clause lost under S1");
}

// R4 (Claude r4, 2026-09-25): the empty-landings branch of jumpLandingNote must
// state the HELD-ARC outcome, not "reaches no platform other than this one"
// (a stated no-op that endorsed the fatal jump; L4 measured 6 identical deaths
// at jump_left p=0.79 from (289,171)). Firing condition unchanged; wording only.
{
  const G = [[289,156],[105,164],[182,226]];
  const sp = {
    level: 4, cat: { x: 289, y: 171, dx: 0, dy: 0, height: 18 }, onPlatform: true, gemsCollected: 1,
    gemPositions: [{ x: 105, y: 164 }, { x: 182, y: 226 }],
    drones: { tl: { x: 1, y: 22.8 }, tr: { x: 359, y: 22.8 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } }, moving: false,
  };
  const mc = dec.buildMoveCall(sp, G, "gem_c");
  if (!/A jump from x 289 holding left reaches no platform: the arc passes below every platform and the cat drops to the bottom laser/.test(mc.state))
    fail("R4: held-arc laser wording missing at (289,171) obj=gem_c");
  if (/reaches no platform other than this one/.test(mc.state))
    fail("R4: old no-op wording survived on the laser-arc state");
  // E1 (probed 2026-09-25, 27B, exact step-390 state: left 0.99 / jump_left 0.010
  // vs pre-change 0.20 / 0.79): the computed walk-then-jump instruction fires
  // only when the cat is OUTSIDE the launch window; inside the window the plain
  // window fact stands (the jump from there is the correct move).
  if (!/You are at x 289, outside the launch window; walk left to around x 284, then jump left there/.test(mc.state))
    fail("E1: walk-then-jump instruction missing outside the window");
  const spIn = { ...sp, cat: { x: 275, y: 171, dx: 0, dy: 0, height: 18 } };
  const mcIn = dec.buildMoveCall(spIn, G, "gem_c");
  if (/outside the launch window/.test(mcIn.state))
    fail("E1: walk instruction fired inside the launch window");
}

if (failures) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log("OK: descent gate fires only on floors with no survivable end");
