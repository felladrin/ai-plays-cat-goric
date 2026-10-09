"use strict";
// Standalone on purpose: appended to another suite, this block never executed,
// because an earlier assert threw and killed the process first.
//
// What this pins down. On a failing level-4 run the objective changed on 106 of
// 257 decisions. 63 of those followed a FLOOR change and are legitimate. 31 were
// same-floor, same-menu, no reset: the model scoring +/-7px steps differently,
// e.g. p(descent_right) 0.034 -> 0.962 -> 0.015 on consecutive decisions, which
// makes the cat reverse, which reverses the flip. The lock damps exactly that.
// An earlier unconditional version held one objective for all 466 decisions and
// failed worse, so "it releases" is as load-bearing as "it holds".
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const lg4 = [[289, 156], [105, 164], [182, 226]];
const alive = [{ x: 289, y: 156 }, { x: 105, y: 164 }, { x: 182, y: 226 }];
const at = (x, y) => ({
  level: 4, gemsCollected: 0, aliveGems: 3, gemPositions: alive,
  moving: true, onPlatform: true, cat: { x, y, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 9 }, tr: { x: 351, y: 0 }, bl: { x: 9, y: 310 }, br: { x: 360, y: 302 } },
});
const FLOOR_A = 81;    // spawn floor, y=93 platform -> cat anchor 81
const FLOOR_D = 229;   // gem_c's floor, y=241 platform

let asked = 0;
const client = {
  classify: async (_s, questions) => {
    const q = questions.objective || questions.move;
    if (questions.objective) asked += 1;
    const names = Object.keys(q.criteria);
    const p = {}; names.forEach((n, i) => (p[n] = i === 0 ? 0.9 : 0.1 / (names.length - 1)));
    const body = { choice: names[0], probabilities: p };
    return questions.objective ? { objective: body } : { move: body };
  },
};

const decideWith = async (sticky, memo, snap) => {
  const prev = process.env.STICKY_OBJECTIVE;
  if (sticky) process.env.STICKY_OBJECTIVE = "1"; else delete process.env.STICKY_OBJECTIVE;
  delete require.cache[require.resolve("./decision.cjs")];
  const d = require("./decision.cjs");
  asked = 0;
  const out = await d.decide(client, snap, lg4, () => {}, [], new Map(), memo);
  if (prev === undefined) delete process.env.STICKY_OBJECTIVE; else process.env.STICKY_OBJECTIVE = prev;
  return { out, asked };
};

(async () => {
  // 1. Flag OFF: every grounded decision consults the model. No behaviour change.
  {
    const memo = {};
    const a = await decideWith(false, memo, at(121, FLOOR_A));
    const b = await decideWith(false, memo, at(128, FLOOR_A));
    assert(a.asked > 0 && b.asked > 0, "flag off: grounded decisions must still ask");
  }

  // 2. Flag ON: the FIRST decision in a situation asks; the SECOND is held.
  const memo = {};
  const first = await decideWith(true, memo, at(121, FLOOR_A));
  assert(first.asked > 0, "first decision in a new situation must ask");
  const second = await decideWith(true, memo, at(128, FLOOR_A));
  assert(second.asked === 0, "same floor + same menu must be held, not re-asked");
  assert(second.out.objective === first.out.objective,
    `held objective must persist: ${first.out.objective} -> ${second.out.objective}`);

  // 3. RELEASE on floor change. This is the half that matters most: 63 of 106
  //    real flips followed a floor change, and freezing them failed worse.
  const moved = await decideWith(true, memo, at(182, FLOOR_D));
  assert(moved.asked > 0, "a floor change must release the lock and re-ask");

  // 4. RELEASE when the locked objective is no longer offered.
  const stale = await decideWith(true, { lockedObjective: "gem_zzz",
    lockFloorKey: FLOOR_A, lockMenuKey: "x" }, at(121, FLOOR_A));
  assert(stale.asked > 0, "a lock naming an objective off the menu must release");
  assert(stale.out.objective !== "gem_zzz", "a stale lock must not survive");

  // 5-7. WAYPOINT COMMITMENT. On level 4 floor 81 the menu genuinely differs
  //      along the floor: x=101 offers {descent_left,descent_right,gem_b,gem_c}
  //      and x=199 offers {descent_left,descent_right,gem_a,gem_c}. Both offer
  //      descent_right. Under the floor+menu key that difference released the
  //      lock, which is how the run turned into an exact 31-decision limit cycle
  //      where descent_right was picked and dropped after one or two decisions,
  //      eight times over, without the cat ever reaching the edge.
  const MENU_101 = "descent_left,descent_right,gem_b,gem_c";
  const MENU_199 = "descent_left,descent_right,gem_a,gem_c";
  assert(MENU_101 !== MENU_199, "the two probe positions must differ in menu");

  // 5. A locked WAYPOINT survives a same-floor menu change: reaching an edge
  //    takes several decisions, and the laser edits the menu underfoot meanwhile.
  const wp = await decideWith(true, { lockedObjective: "descent_right",
    lockFloorKey: FLOOR_A, lockMenuKey: MENU_101, lockHeldFor: 1 }, at(199, FLOOR_A));
  assert(wp.asked === 0, "a locked waypoint must survive a same-floor menu change");
  assert(wp.out.objective === "descent_right", "the waypoint must still be the objective");

  // 6. A locked GEM does NOT: a gem is reachable or it is not, so a menu edit is
  //    real news for it. gem_c is on both menus, so only the key can release it.
  const gm = await decideWith(true, { lockedObjective: "gem_c",
    lockFloorKey: FLOOR_A, lockMenuKey: MENU_101, lockHeldFor: 1 }, at(199, FLOOR_A));
  assert(gm.asked > 0, "a locked gem must still release on a same-floor menu change");

  // 7. The cap. Without it this is the 466-decision failure with extra steps.
  const capped = await decideWith(true, { lockedObjective: "descent_right",
    lockFloorKey: FLOOR_A, lockMenuKey: MENU_199, lockHeldFor: 30 }, at(199, FLOOR_A));
  assert(capped.asked > 0, "a waypoint held past the commit cap must release");

  console.log("sticky objective lock (floor key, waypoint commitment): PASS");
})().catch((e) => { console.log("FAIL: " + e.message); process.exitCode = 1; });
