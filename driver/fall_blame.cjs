// FALL_BLAME: fall-edge attribution for the death history. When a life dies on
// a floor it reached by falling, the death history also names the edge it fell
// from - the fall from the HIGHEST floor the life never got back up to. This is
// a truthful history line ("this life left floor y93 at 140,90 and never
// returned"), not a policy: the model still decides. Measured on the fixadv_s6
// L4 ladder life sequence: all 30 deaths blame the gap edge 140,90 (move
// right), the decision that actually doomed every life; lastGrounded alone
// blamed only the @241/@180 wandering positions.
//
// Usage (identical in both runners):
//   const fb = createFallBlame();
//   on each grounded decision: fb.observe(posKey10(x,y), y, move)
//   on respawn:                fb.reset()
//   at death:                  for (const b of fb.blameKeys(deathY)) push entry
function createFallBlame() {
  let prev = null;                 // { posKey, y, move } of the previous grounded decision
  const falls = [];                // { edge, move, fromY, idx } - idx = ys.length at the fall
  const ys = [];                   // grounded y of every decision, in order
  return {
    observe(posKey, y, move) {
      if (prev && y > prev.y) falls.push({ edge: prev.posKey, move: prev.move, fromY: prev.y, idx: ys.length });
      ys.push(y);
      prev = { posKey, y, move };
    },
    reset() { prev = null; falls.length = 0; ys.length = 0; },
    // Extra blame entries for a death at floor y (empty when the gate is off).
    blameKeys(deathY) {
      if (!process.env.FALL_BLAME) return [];
      const cands = [];
      for (const f of falls) {
        if (f.fromY >= deathY) continue;                             // died at or above the edge
        if (ys.slice(f.idx + 1).some((g) => g <= f.fromY)) continue; // the life got back up
        cands.push(f);
      }
      if (!cands.length) return [];
      cands.sort((a, b) => a.fromY - b.fromY);                       // highest floor = smallest y
      return [{ key: cands[0].edge, move: cands[0].move }];
    },
  };
}
// MISS_BLAME: the air sibling of FALL_BLAME. A life that ends with a gem still
// alive passed it by: record, per live gem, the logged decision of closest
// approach (position + the move held at that decision + distance), and at death
// state it as history: "the previous life passed within Dpx of gem_X at K
// holding M and never collected it". True by construction, fires only after a
// death that left the gem uncollected, and names no policy. Motivated by L6:
// 28/30 fb_s6 lives died with gem_a alive and their closest approach was the
// airborne fork at 127.25,112.4 holding left, 32px (docs/results.md).
function createMissBlame() {
  let best = {};                 // gem name -> { dist, x, y, move }
  let lastAlive = [];            // names alive at the most recent observation
  return {
    // Call on EVERY decision (grounded or airborne). liveGems: [{name,x,y}].
    observeAll(x, y, move, liveGems) {
      if (!process.env.MISS_BLAME) return;
      lastAlive = (liveGems || []).map((g) => g.name);
      for (const g of liveGems || []) {
        const d = Math.hypot(x - g.x, y - g.y);
        const cur = best[g.name];
        if (!cur || d < cur.dist) best[g.name] = { dist: d, x, y, move };
      }
    },
    // History lines for the gems still alive at the last observation.
    lines() {
      if (!process.env.MISS_BLAME) return [];
      const out = [];
      for (const name of lastAlive) {
        const b = best[name];
        if (!b) continue;
        out.push(`The previous life passed within ${Math.round(b.dist)}px of ${name} at ${b.x},${b.y} holding ${b.move} and never collected it.`);
      }
      return out;
    },
    reset() { best = {}; lastAlive = []; },
  };
}
module.exports = { createFallBlame, createMissBlame };

