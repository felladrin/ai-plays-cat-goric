// How many frames one decision is executed for, and when the model gets to
// re-decide. Shared by both runners: this logic was duplicated, and the same bug
// was present in both copies.
//
// The bug: the airborne extension was re-assigned on every iteration
//
//   for (let i = 0; i < n; i++) { ...; if (justLaunched) n = i + 1 + AIR; }
//
// so n grew in lockstep with i and `i < n` never became false. After a jump the
// cat therefore held its launch action until it died or the level ended, and the
// airborne re-decide never happened at all — the opposite of what the comment
// beside it promised. On level 4 that is a 40-frame commitment to an arc that
// leaves the platform over a void, with eleven skipped chances to steer back.
const AIR_REDECIDE_FRAMES = 3;

// Grounded walk frames per decision. The runners each declare `K = 6`; this is the
// same number for survival.cjs, and test_death_history.cjs asserts all three agree.
const WALK_FRAMES = 6;

// Upper bound on how long a committed airborne action may run without the model
// being re-asked. A safe-looking arc still has to terminate, so this caps the
// hold even if the geometry keeps saying "fine". A jump is 34 frames; 120 covers
// a long fall with room to spare.
const MAX_HELD_FRAMES = 120;

// Frames to run before re-deciding, given the state the decision was made from.
//  - Grounded + jump: 1 frame to launch, then the airborne cadence (see stepBatch).
//  - Grounded, no jump: K frames.
//  - Airborne: AIR_REDECIDE_FRAMES, so the model can steer onto a platform.
function initialBudget(grounded, isJump, K) {
  if (grounded && isJump) return 1;
  if (grounded) return K;
  return AIR_REDECIDE_FRAMES;
}

// Execute one decision. `step()` advances a frame and resolves to
// {done, airborne, snap}: done=true stops the batch (death/advance/win/cap).
//
// `holdIsSafe(snap)` is optional and answers "is the action we are already
// holding heading somewhere safe?" -> true keeps the arc (no model call), false
// or null re-decides. It may only ever EXTEND a hold, never shorten one, and the
// hold is capped at MAX_HELD_FRAMES so the batch always terminates.
//
// Without it the cat re-decides direction every AIR_REDECIDE_FRAMES with no
// memory of what it committed to, and near-ties oscillate: measured at a 39.6%
// mid-air reversal rate on level 3 (which then took zero gems in 3000 steps)
// against 7.5% on level 2 (which cleared with no deaths).
// Returns the number of frames actually stepped.
// WALKOFF_CLEAR (gated in the runners): a walk that carries the cat off its
// floor ends at the edge. Measured on L2's left end, L8's right end and L12's y108
// (docs/results.md, 2026-10-11): the airborne re-decide 3 frames after stepping
// off came while the cat was still beside the floor it left, and the model's steer
// toward its objective touched that floor's side and put it back on top, over and
// over until the lasers closed. With `walkOff`, the keys are released at the edge
// and the model is asked again once the cat's head is below that floor's
// underside (it can no longer side-snap onto it), or it lands, or WALKOFF_MAX
// frames pass - but only when arc.simulate says the no-input fall survives until
// then; otherwise the normal cadence applies. The model still makes every choice;
// this only moves WHEN it is asked after a walk-off.
const WALKOFF_MAX = 20;
function walkOffDropSafe(snap, floorY) {
  const PHYS = require("./physics.cjs");
  const { simulate } = require("./arc.cjs");
  const h = snap.cat.height;
  const under = floorY + PHYS.platformHeight * (1 - PHYS.platformAnchorY);
  const mf = (snap.drones.tl.y - 1) / PHYS.droneSpeed;
  // Safe when the no-input fall lands, or clears the floor's side at least
  // AIR_REDECIDE_FRAMES before it would die: after clearing, the model is asked
  // and can steer, which is the point (L8's right end only survives that way).
  let clearF = null;
  const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, "none", mf, {
    grounded: false, maxFrames: 60, onFrame: (x, y, f) => { if (clearF == null && y - h > under) clearF = f; },
  });
  if (r.outcome === "laser" || r.outcome === "void") return clearF != null && r.frames - clearF >= AIR_REDECIDE_FRAMES;
  return true;
}

async function stepBatch({ grounded, isJump, K, step, holdIsSafe, walkOff }) {
  let n = initialBudget(grounded, isJump, K);
  let extended = false;
  let i = 0;
  for (; i < n; i++) {
    const res = await step(i);
    if (res && res.done) return i + 1;
    if (walkOff && grounded && !isJump && res && res.airborne === true && res.snap) {
      if (walkOffDropSafe(res.snap, walkOff.floorY) === true) {
        const PHYS = require("./physics.cjs");
        const under = walkOff.floorY + PHYS.platformHeight * (1 - PHYS.platformAnchorY);
        await walkOff.release();
        let k = 0;
        for (; k < WALKOFF_MAX; k++) {
          const r = await step(i + 1 + k);
          if (r && r.done) return i + 2 + k;
          if (!r || r.airborne !== true || (r.snap && r.snap.cat.y - r.snap.cat.height > under)) { k++; break; }
        }
        if (walkOff.log) walkOff.log(k);
        return i + 1 + k;
      }
    }
    // The jump actually left the ground: give it the airborne cadence, ONCE.
    // Extending more than once is what made the loop unbounded.
    if (!extended && grounded && isJump && res && res.airborne === true) {
      n = i + 1 + AIR_REDECIDE_FRAMES;
      extended = true;
    }
    // Airborne and the committed action is still heading for a landing: keep it
    // rather than spending a call to (often) flip direction on a near-tie.
    if (holdIsSafe && res && res.airborne === true && i + 1 >= n && n < MAX_HELD_FRAMES) {
      if (holdIsSafe(res.snap) === true) n = Math.min(n + AIR_REDECIDE_FRAMES, MAX_HELD_FRAMES);
    }
  }
  return i;
}

module.exports = { AIR_REDECIDE_FRAMES, WALK_FRAMES, MAX_HELD_FRAMES, WALKOFF_MAX, initialBudget, stepBatch, walkOffDropSafe };
