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
async function stepBatch({ grounded, isJump, K, step, holdIsSafe }) {
  let n = initialBudget(grounded, isJump, K);
  let extended = false;
  let i = 0;
  for (; i < n; i++) {
    const res = await step(i);
    if (res && res.done) return i + 1;
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

module.exports = { AIR_REDECIDE_FRAMES, MAX_HELD_FRAMES, initialBudget, stepBatch };
