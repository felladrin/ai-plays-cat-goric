// Assert-based check: every state builder must surface death-history for the
// position it is asked about. Fails loudly if a builder drops the deathHistory
// parameter again (a silent regression that otherwise only shows as a crash).
const assert = require("assert");
const d = require("./decision.cjs");

const snap = {
  level: 1,
  cat: { x: 306, y: 286, dy: 9.2, height: 12 },
  onPlatform: false,
  drones: { bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 }, tl: { x: 1, y: 1 }, br: { x: 359, y: 310 } },
  gemsCollected: 0,
  aliveGems: 3,
  gemPositions: [{ x: 306, y: 250 }, { x: 250, y: 210 }, { x: 200, y: 170 }],
};
const gems = [[306, 250], [250, 210], [200, 170]];
// Key matches snap.cat rounded to 10px: (310,290).
const hist = [{ key: "310,290", action: "jump_right", cause: "fell out of bounds below y=310" }];

function hasHistory(state) {
  return typeof state === "string" && state.includes("previous attempt") && state.includes("jump_right");
}

// Objective builder
assert(hasHistory(d.buildObjectiveCall(snap, gems, hist).state), "buildObjectiveCall dropped death history");
// Laya move builder
assert(hasHistory(d.buildLayaMoveCall(snap, gems, "gem_a", hist).state), "buildLayaMoveCall dropped death history");
// Halogen/demo move builder
assert(hasHistory(d.buildMoveCall(snap, gems, "gem_a", hist).state), "buildMoveCall dropped death history");

// Airborne reversibility wording present in BOTH move builders.
const airLaya = d.buildLayaMoveCall(snap, gems, "gem_a", []).state;
const airMove = d.buildMoveCall(snap, gems, "gem_a", []).state;
assert(/instant and reversible/.test(airLaya), "buildLayaMoveCall missing reversibility wording");
assert(/instant and reversible/.test(airMove), "buildMoveCall missing reversibility wording");

// `wait` must be gone from the grounded halogen/demo menu (strictly dominated).
// legalActions now needs the full snapshot: it prunes a jump that would put the
// cat's head into the ceiling laser, which requires cat height and drone positions.
const grounded = d.legalActions({ ...snap, onPlatform: true, cat: { ...snap.cat, y: 240 } });
assert(!("wait" in grounded), "legalActions still offers `wait`");
assert("jump_right" in grounded && "left" in grounded, "legalActions lost a real action");

// catMargins must THROW (not silently fall back) when cat.height is missing/zero,
// otherwise headTop collapses to the feet margin and the ceiling bug returns
// with no signal.
const noH = { ...snap, cat: { ...snap.cat, height: undefined } };
assert.throws(() => d.catMargins(noH), /cat.height missing or non-positive/, "catMargins silently fell back on missing height");
const zeroH = { ...snap, cat: { ...snap.cat, height: 0 } };
assert.throws(() => d.catMargins(zeroH), /cat.height missing or non-positive/, "catMargins silently fell back on zero height");
// With a real height, headTop must be feet-margin minus height (not equal to it).
const hSnap = { ...snap, cat: { ...snap.cat, height: 12 } };
const m = d.catMargins(hSnap);
assert(Math.abs(m.headTop - (m.top - 12)) < 1e-6, "headTop is not feet-margin minus height");

// Ceiling-death warning must appear in both move builders when head clearance < 61.2.
// Put the cat near the top laser so headTop < 61.2.
const lowCeil = {
  ...hSnap,
  cat: { x: 180, y: 60, dy: 0, height: 12 },
  onPlatform: true,
  drones: { bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 }, tl: { x: 1, y: 1 }, br: { x: 359, y: 310 } },
};
// buildMoveCall no longer warns that a jump would hit the ceiling: legalActions
// has already pruned every jump by then (it prunes below 64.6px of clearance, the
// warning fired below 61.2px), so the warning could never be about an offered
// action. It must instead explain why the menu has no jump in it.
assert(/jumping is no longer possible from this floor/.test(d.buildMoveCall(lowCeil, gems, "gem_a", []).state),
  "buildMoveCall must explain that the closed ceiling removed the jump options");
assert(!/A jump lifts the cat up to/.test(d.buildMoveCall(lowCeil, gems, "gem_a", []).state),
  "buildMoveCall must not describe a jump the action menu does not offer");
assert(/head into the top laser|drive the cat's head/.test(d.buildLayaMoveCall(lowCeil, gems, "gem_a", []).state), "buildLayaMoveCall missing ceiling warning");

// --- Call-path guard: the three decide() functions must actually thread the
// deathHistory argument through to the prompt. Testing builders alone let an
// arity bug (deathHistory landing in the wrong parameter) pass unnoticed.
// A stub client records every (state, questions) it is asked about.
function stubClient() {
  const asked = [];
  return {
    asked,
    async classify(state, questions) {
      asked.push({ state, questions });
      // Return a plausible answer shape for any question set.
      const answers = {};
      for (const [k, q] of Object.entries(questions)) {
        if (q.type === "noul") answers[k] = { type: "noul", noul: 0.9 };
        else {
          const names = Object.keys(q.criteria);
          answers[k] = { type: "choice", choice: names[0], probabilities: Object.fromEntries(names.map((n) => [n, 1 / names.length])) };
        }
      }
      return answers;
    },
    async ask(prompt) {
      asked.push({ state: prompt, questions: {} });
      return "A"; // first menu letter
    },
  };
}

async function assertDecideThreadsHistory(fn, extraArgs) {
  const c = stubClient();
  const hist = [{ key: posKey10(snap.cat.x, snap.cat.y), action: "jump_right", cause: "fell out of bounds below y=310" }];
  // objective call is asked first; move call second. Both should carry history.
  await fn(c, snap, gems, () => {}, ...extraArgs, hist);
  const anyWithHistory = c.asked.some((a) => a.state.includes("previous attempt") && a.state.includes("jump_right"));
  assert(anyWithHistory, `${fn.name}: death history did NOT reach the prompt via the decide call path`);
}

// layaDecide signature: (client, snap, levelGems, logger, deathHistory)
// halogenDecide: (client, snap, levelGems, logger, deathHistory)
// decide: (client, snap, levelGems, logger, deathHistory)
// All take deathHistory as the 5th arg (no jumpThreshold). Assert layaDecide's
// arity is 5, not 6 — the old jumpThreshold param is what caused the misalignment.
assert(d.layaDecide.length === 5, `layaDecide arity is ${d.layaDecide.length}, expected 5 (jumpThreshold must be removed)`);
assert(d.halogenDecide.length === 5, `halogenDecide arity is ${d.halogenDecide.length}, expected 5`);
// decide() takes a 6th param (visitCounts) and a 7th (memo, the runner-owned
// objective lock) that layaDecide/halogenDecide do not: it is the only path with
// revisit-based escalation and the only one that holds an objective across a
// jump arc. The runners pass the extra args to all three; the other two ignore
// them, which is safe only because the FIRST five stay aligned. That alignment
// is what these three asserts protect.
assert(d.decide.length === 7, `decide arity is ${d.decide.length}, expected 7 (deathHistory, visitCounts, memo)`);

const posKey10 = (x, y) => `${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`;

(async () => {
  await assertDecideThreadsHistory(d.layaDecide, []);
  await assertDecideThreadsHistory(d.halogenDecide, []);
  await assertDecideThreadsHistory(d.decide, []);
  console.log("decide call-path death-history threading: PASS");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

console.log("death-history + air-control wiring: PASS");

// --- run_full.cjs must carry the same death-history wiring as run_level.cjs ---
// This is the exact hole that opened when the fix lived only in run_level.cjs.
const fs = require("fs");
const full = fs.readFileSync(require.resolve("./run_full.cjs"), "utf8");
const need = [
  "const deathHistory = []",
  "DEATH_HISTORY_STORE",
  "recordDeath",
  "deathHistory.length = 0", // per-level reset on transition
  "decideFn(client, s, levelGems, () => {}, deathHistory, visitCounts, decideMemo)", // passed to the model
  "decideMemo.lockedObjective = null", // the objective lock is dropped on reset
];
for (const needle of need) {
  assert(full.includes(needle), `run_full.cjs missing wiring: ${needle}`);
}
// The unwinnable path must NOT be the only reset; the death handler must record,
// and must attribute the death to the grounded LAUNCH as well as the last decision
// (so a doomed jump's launch key accrues prior deaths and exploration activates).
assert(/recordDeath\(lastChosen, pre, lastGrounded\)/.test(full), "run_full.cjs death handler must record against lastChosen AND lastGrounded launch");
assert(/if \(s\.onPlatform\) lastGrounded =/.test(full), "run_full.cjs must track the last grounded (launch) decision");
console.log("run_full.cjs death-history wiring: PASS");

// --- bridge.ts must filter the pool by ttl > 0 (fourth bug of the "read at an
// inconsistent moment" family: destroyGem sets ttl=0 but kontra's getAliveObjects
// slices by the size counter, so a just-collected gem is still "alive" until the
// next pool.update()). Guard both the snapshot aliveGems and the trace alive count.
const bridgeSrc = require("fs").readFileSync(
  require("path").resolve(__dirname, "../bridge/bridge.ts"),
  "utf8"
);
const ttlFilters = (bridgeSrc.match(/getAliveObjects\(\)\.filter\(\(g\)\s*=>\s*g\.ttl\s*>\s*0\)/g) || []).length;
assert(ttlFilters >= 2, `bridge.ts must filter getAliveObjects by ttl>0 in BOTH snapshot and trace (found ${ttlFilters})`);
// And it must NOT force a sweep by calling pool.update() from the observer.
assert(!/gemsPool\.update\(/.test(bridgeSrc), "bridge.ts must stay read-only: do not call gemsPool.update()");
console.log("bridge ttl>0 alive filter: PASS");

// --- L2 right-edge drop must report a SURVIVABLE steered landing, not the laser.
// Regression guard: the straight-drop version wrongly marked both ends fatal and
// caused the edge oscillation. With air control, the right end reaches the
// y=240 platform (reach 52.5px over 30 frames).
//
// The x values here are the platform sprite's real 52px width: the y=64 run ends
// at 286 and the landing platform spans 214..266. They previously read 280 and
// 220..260, which came from the laser box's 40px width -- see platformWidth in
// physics.cjs.
const l2edge = {
  level: 2, cat: { x: 282, y: 64, dy: 0, height: 12 }, onPlatform: true,
  drones: { bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 }, tl: { x: 1, y: 1 }, br: { x: 359, y: 310 } },
  gemsCollected: 0, aliveGems: 3, gemPositions: [{ x: 240, y: 240 }, { x: 110, y: 240 }, { x: 180, y: 200 }],
};
const l2gems = [[240, 240], [110, 240], [180, 200]];
const l2state = d.buildLayaMoveCall(l2edge, l2gems, "gem_b", []).state;
assert(/RIGHT end \(x 286\) and you steer to land on platform x 214\.\.266 at y 240/.test(l2state),
  "L2 right-edge drop must report a steered landing on 214..266@y240, not the laser");
assert(!/RIGHT end \(x 286\) and you fall to the bottom laser/.test(l2state),
  "L2 right-edge drop must NOT claim certain death (air control makes it survivable)");
console.log("L2 right-edge air-controlled drop: PASS");

// --- Halogen menu-letter parser: must NOT take first char; must refuse ambiguity.
const P = d.parseMenuLetter;
const M = ["A", "B", "C"];
assert(P("B", M) === "B", "bare letter must parse");
assert(P("The answer is B", M) === "B", "polite single-letter sentence must parse");
assert(P("Answer: C", M) === "C", "word-boundary single letter must parse");
assert(P("Not A, choose C", M) === null, "multi-letter response is AMBIGUOUS -> null (must not pick A by menu order)");
assert(P("I would pick C over A", M) === null, "multi-letter response is AMBIGUOUS -> null (must not pick A)");
assert(P("D", M) === null, "out-of-menu letter must NOT parse (no blanket A-H)");
assert(P("hello", M) === null, "garbage must not parse");
assert(P("", M) === null, "empty must not parse");
assert(P("The answer is B", M) !== "T", "must not take first character (the T bug)");
// askMenuLetter must RAISE (HalogenParseError) on an ambiguous response, not guess.
const ambiguousClient = { async ask() { return "Not A, choose C"; } };
(async () => {
  let raised = false;
  try { await d.askMenuLetter(ambiguousClient, "p", M); } catch (e) { raised = e.name === "HalogenParseError"; }
  assert(raised, "askMenuLetter must RAISE on ambiguous multi-letter response, not pick a letter");
  console.log("halogen menu-letter parser: PASS (incl. ambiguity refusal)");
})();

// --- HalogenParseError must not crash on a STRING menu (menu.letters.slice() is a
// string, not an array). This exact .join-on-string crash aborted a ladder run.
let joinCrash = null;
try { throw new d.HalogenParseError("xyz", "ABC"); } catch (e) { joinCrash = e; }
assert(joinCrash && joinCrash.name === "HalogenParseError", "HalogenParseError with string menu must construct");
assert(/menu=\[A,B,C\]/.test(joinCrash.message), "string menu must render as [A,B,C] not crash on .join");
assert(Array.isArray(joinCrash.menuLetters) && joinCrash.menuLetters.length === 3, "menuLetters normalized to array");
// askMenuLetter must accept a string menu too (call sites pass menu.letters.slice()).
(async () => {
  const okClient = { async ask() { return "B"; } };
  const got = await d.askMenuLetter(okClient, "p", "ABC");
  assert(got === "B", "askMenuLetter works with a string menu");
  console.log("HalogenParseError string-menu normalization: PASS");
})();

// --- Descent points as selectable objectives (flat-menu widening).
// L2: cat on floor y=64, gems below -> descent points appear in the menu.
const l2o = { level: 2, cat: { x: 180, y: 64, dy: 0, height: 12 }, onPlatform: true,
  drones: { bl:{x:1,y:310}, tr:{x:359,y:1}, tl:{x:1,y:1}, br:{x:359,y:310} },
  gemsCollected: 0, aliveGems: 3, gemPositions: [{x:180,y:188},{x:110,y:240},{x:240,y:240}] };
const oc2 = d.buildObjectiveCall(l2o, [[180,188],[110,240],[240,240]], []);
assert(oc2.objectiveNames.includes("descent_left"), "L2 must offer descent_left as an objective");
assert(oc2.objectiveNames.includes("descent_right"), "L2 must offer descent_right as an objective");
// Flat menu: gems still present alongside descent points (simultaneous, not replaced).
assert(oc2.objectiveNames.filter((n) => /^gem_/.test(n)).length === 3, "gems remain in the menu alongside descent points");
// L0: gems above the cat / reachable -> NO descent points.
const l0o = { level: 0, cat: { x: 30, y: 278, dy: -3, height: 12 }, onPlatform: false,
  drones: { bl:{x:1,y:310}, tr:{x:359,y:1}, tl:{x:1,y:1}, br:{x:359,y:310} },
  gemsCollected: 0, aliveGems: 3, gemPositions: [{x:66,y:235},{x:112,y:195},{x:160,y:165}] };
const oc0 = d.buildObjectiveCall(l0o, [[66,235],[112,195],[160,165]], []);
assert(!oc0.objectiveNames.some((n) => /^descent_/.test(n)), "L0 (gems above) must NOT offer descent points");
// General-rule property: a synthetic level with the SAME geometry (floor with a gem
// below) yields descent points from the same code path, not a level-specific list.
// (We assert the rule fires on the geometry, not on level===2.)
const l2b = Object.assign({}, l2o, { level: 2 });
const dp = d.descentPoints ? d.descentPoints(l2b, [[180,188],[110,240],[240,240]]) : null;
if (dp) {
  assert(dp.length >= 1, "descentPoints() returns ends when objective is below the floor");
  assert(dp.every((p) => p.name === "descent_left" || p.name === "descent_right"), "descent point names are left/right");
}
// Move builder resolves a descent objective to the end x (walk-to-edge target).
const mc = d.buildLayaMoveCall(l2o, [[180,188],[110,240],[240,240]], "descent_left", []);
// 74, not 80: the leftmost y=64 platform is centred at x=100 and the sprite is
// 52 wide, so its real left edge is 74. The old 80 came from the laser box's 40.
assert(mc.target.x === 74, "descent_left target x must be the real left end (74), got " + mc.target.x);
console.log("descent-points-as-objectives: PASS");

// --- STRUCTURAL GUARD: every builder must render every required fact.
// This catches the recurring bug class where a fact is added to one builder and
// forgotten in the others (run_full vs run_level on death history; buildMoveCall
// vs buildLayaMoveCall on death history AND on the countdown). One shared
// synthetic snapshot triggers ALL facts; each builder's rendered state is asserted
// to contain each required fact by name. Add a fact to one builder and forget the
// rest -> this fails immediately and loudly.
const d2 = require("./decision.cjs");
const GEMS2 = [[180, 188], [110, 240], [240, 240]];
// Snapshot chosen so EVERY fact fires: on the y=64 floor, a gem below (descent
// relevant -> floor ends + drop outcomes), head clearance 43px < 61.2 (warning),
// and a death-history entry keyed to this position.
const SNAP = {
  level: 2, cat: { x: 180, y: 64, dy: 0, height: 20 }, onPlatform: true,
  // tl.y=30 puts the top laser close enough that the countdown is 70 frames
  // (< needed frames to reach gem_a at walking speed), so the affordability-
  // gated countdown line actually renders.
  drones: { bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 }, tl: { x: 1, y: 30 }, br: { x: 359, y: 310 } },
  gemsCollected: 0, aliveGems: 3,
  gemPositions: [{ x: 180, y: 188 }, { x: 110, y: 240 }, { x: 240, y: 240 }],
};
const HIST = [{ key: "180,60", action: "left", cause: "was hit by the laser" }];
// Facts required in EVERY builder (objective + both move paths).
const REQUIRED_ALL = {
  deathHistory: /On a previous attempt from here/i,
  floorEnds: /end of your floor|floor you stand on is continuous/i,
  dropSteering: /lands on|steer to land/i,
};
// Facts required in the MOVE builders (a jump decision and the chosen-objective
// countdown live there, not in the goal-choice prompt).
const REQUIRED_MOVE = {
  headClearance: /head clearance/i,
  countdown: /cannot reach .* before the laser|closing laser reaches the cat in/i,
};
const BUILDERS = [
  { name: "buildObjectiveCall", move: false, render: (s, h) => d2.buildObjectiveCall(s, GEMS2, h).state },
  { name: "buildMoveCall", move: true, render: (s, h) => d2.buildMoveCall(s, GEMS2, "gem_a", h).state },
  { name: "buildLayaMoveCall", move: true, render: (s, h) => d2.buildLayaMoveCall(s, GEMS2, "gem_a", h).state },
];
let structFail = [];
for (const b of BUILDERS) {
  const st = b.render(SNAP, HIST);
  const req = Object.assign({}, REQUIRED_ALL, b.move ? REQUIRED_MOVE : {});
  for (const [fact, re] of Object.entries(req)) {
    if (!re.test(st)) structFail.push(`${b.name} is MISSING required fact: ${fact}`);
  }
}
assert(structFail.length === 0, "STRUCTURAL GUARD failed:\n  " + structFail.join("\n  "));
console.log("structural guard (all builders render all required facts): PASS");

// --- a provably fatal jump must not be on the menu --------------------------
// Level 2 killed the run 8 times out of 10 with the cat moving UPWARD (dy<0) into
// the ceiling laser from the top row. The jump was offered there, the model rated
// it low, and exploration sampled it anyway — and each death escalated the
// temperature that made the next fatal jump likelier.
{
  const CFGp = require("./physics.cjs");
  const apex = d.jumpApex();
  // Game integration order (kontra advance(): velocity += acceleration; position
  // += velocity, confirmed against updateCatSprite.ts), so the first frame's
  // displacement is -(catJumpSpeed - catFallingAcceleration) = -6.4, not -6.8.
  // The old 61.2px counted the full -6.8 as the first step and over-reported the
  // rise by one gravity step. See jumpApex in decision.cjs.
  assert(Math.abs(apex.rise - 54.4) < 1e-9, `jump apex rise should be 54.4px (game order), got ${apex.rise}`);
  assert(apex.frames === 16, `jump apex frames should be 16 (game order), got ${apex.frames}`);
  const needed = apex.rise + CFGp.droneSpeed * apex.frames;

  const mf = 26;
  const drones = {
    tl: { x: 1, y: 1 + CFGp.droneSpeed * mf },
    tr: { x: 359 - CFGp.droneSpeed * mf, y: 1 },
    bl: { x: 1 + CFGp.droneSpeed * mf, y: 310 },
    br: { x: 359, y: 310 - CFGp.droneSpeed * mf },
  };
  const top = { onPlatform: true, cat: { x: 200, y: 64, dy: 0, height: 12 }, drones };
  assert(d.catMargins(top).headTop < needed, "setup: top row must have too little head clearance");
  assert(d.jumpHitsCeiling(top), "a jump from the L2 top row must be recognised as fatal");
  const topMenu = Object.keys(d.legalActions(top));
  assert(!topMenu.some((a) => a.includes("jump")),
    `fatal jump still offered on the top row: ${topMenu.join(",")}`);
  assert(topMenu.includes("left") && topMenu.includes("right"),
    "pruning must never empty the menu");

  // A platform with room overhead keeps every action.
  const low = { ...top, cat: { ...top.cat, y: 240 } };
  assert(!d.jumpHitsCeiling(low), "a jump from a low platform must not be fatal");
  assert(Object.keys(d.legalActions(low)).length === 5, "low platform must keep all five actions");
  console.log("OK: provably fatal jumps pruned from the action menu");
}

// survival.cjs: an action is fatal only when no later steering can land the cat.
// State from level 13's first life on clef: falling at (112,236), dy 11.6, 44
// moving frames. Only `left` still reaches floor 59..111 at y 249; the run held
// `right` here and died.
{
  const S = require("./survival.cjs");
  const fall = { level: 13, onPlatform: false, cat: { x: 112, y: 236, dy: 11.6, height: 18 }, drones: { tl: { y: 1 + 0.2 * 44 } } };
  assert(!S.isFatal(fall, "left"), "survival: steering left from (112,236) lands on floor 59..111");
  assert(S.isFatal(fall, "right") && S.isFatal(fall, "none"), "survival: right and none from (112,236) miss every floor");
  assert.deepStrictEqual(Object.keys(S.pruneFatal(fall, { left: "", right: "", none: "" })), ["left"], "pruneFatal keeps only the survivor");
  // Nothing survives: the menu is left whole rather than emptied.
  const doomed = { ...fall, cat: { ...fall.cat, x: 117.25, y: 273.2, dy: 12.8 }, drones: { tl: { y: 1 + 0.2 * 47 } } };
  assert.strictEqual(Object.keys(S.pruneFatal(doomed, { left: "", right: "", none: "" })).length, 3, "pruneFatal must not empty the menu");
  // The walk frames survival.cjs assumes must be the ones the runners execute.
  const { WALK_FRAMES } = require("./cadence.cjs");
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const k = fs.readFileSync(require.resolve(`./${f}`), "utf8").match(/^const K = (\d+);/m);
    assert(k && Number(k[1]) === WALK_FRAMES, `${f} K must equal cadence.WALK_FRAMES (${WALK_FRAMES})`);
  }
  // Steering lag: the game applies a new direction one frame late. Level 6, clef
  // candidate seed 1, step 162: falling at (204.25,176), still carrying `left`.
  // Only `right` reaches floor 211..263@220; ignoring the lag, `none` looked safe.
  const lag = { level: 6, onPlatform: false, cat: { x: 204.25, y: 176, dy: 6.4, height: 18 }, drones: { tl: { y: 1 + 0.2 * 161 } }, prevMove: "left" };
  assert(!S.isFatal(lag, "right") && S.isFatal(lag, "none") && S.isFatal(lag, "left"),
    "survival: with `left` carried, only `right` survives at level 6 (204.25,176)");
  console.log("OK: survival.cjs prunes only certain deaths; runners' K matches cadence.WALK_FRAMES");
}

// heldActionIsSafe must judge a jump in flight by what it does in the air. Called
// with the launch action (`jump_left`) it simulated a second jump on landing, so a
// jump never counted as safe and every one was re-asked 3 frames after launch.
// Level 3, 4 frames after jump_left from (161,290): the arc lands on 93..145@249.
if (process.env.HOLD_FIX === "1") {
  const { heldActionIsSafe } = require("./arc.cjs");
  const mid = { level: 3, onPlatform: false, cat: { x: 154.25, y: 272, dy: -5.6, height: 18 }, drones: { tl: { y: 1 + 0.2 * 9 } } };
  assert.strictEqual(heldActionIsSafe(mid, "jump_left"), heldActionIsSafe(mid, "left"), "a held jump_left in flight must be judged as left");
  assert.strictEqual(heldActionIsSafe(mid, "jump_left"), true, "level 3's jump_left arc lands safely");
  console.log("OK: a jump in flight is judged by its air steering");
}

// PRUNE_NOOP drops a straight jump that lands back on the same spot, and keeps
// one that climbs (level 10's right column) or could touch a gem.
{
  const prev = process.env.PRUNE_NOOP;
  process.env.PRUNE_NOOP = "1";
  const dr = (mf) => ({ tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } });
  const at = (level, x, y, mf, gems) => ({ level, onPlatform: true, cat: { x, y, dy: 0, height: 18 }, gemPositions: gems, drones: dr(mf) });
  assert(!("jump" in d.legalActions(at(13, 108.5, 249, 93, [{ x: 180, y: 51 }]))), "PRUNE_NOOP keeps a jump that lands back in place");
  assert("jump" in d.legalActions(at(10, 330, 240, 21, [{ x: 287, y: 68 }])), "PRUNE_NOOP dropped a jump onto the platform above");
  assert("jump" in d.legalActions(at(13, 108.5, 249, 93, [{ x: 109, y: 215 }])), "PRUNE_NOOP dropped a jump that touches a gem overhead");
  if (prev === undefined) delete process.env.PRUNE_NOOP; else process.env.PRUNE_NOOP = prev;
  console.log("OK: PRUNE_NOOP drops only a jump that changes nothing");
}

// Death attribution is one shared function, and both runners must use it and
// clear the launch tracker after a death. run_level.cjs went without the launch
// entry while run_full.cjs had it, so the two runners explored at different keys.
{
  const { deathEntries } = require("./run_stats.cjs");
  const chosen = { key: "120,270", action: "right" };
  const launch = { key: "50,60", action: "right" };
  const prev = process.env.ATTRIB;
  delete process.env.ATTRIB;
  assert.strictEqual(deathEntries(chosen, launch, "c").length, 2, "an airborne death must also blame the launch");
  assert.strictEqual(deathEntries(chosen, chosen, "c").length, 1, "a grounded death must not count twice");
  assert.strictEqual(deathEntries(chosen, null, "c").length, 1, "no launch, one entry");
  process.env.ATTRIB = "0";
  assert.strictEqual(deathEntries(chosen, launch, "c").length, 1, "ATTRIB=0 must collapse to the chosen key alone");
  if (prev === undefined) delete process.env.ATTRIB; else process.env.ATTRIB = prev;
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(require.resolve(`./${f}`), "utf8");
    assert(/deathHistory\.push\(\.\.\.deathEntries\(/.test(src), `${f} does not record deaths through run_stats.deathEntries`);
    assert(/build: buildFlags\(\)/.test(src), `${f} does not stamp the build flags into its run file`);
  }
  assert(/recordDeath\(lastChosen, pre, lastGrounded\);\s*(\/\/[^\n]*\n\s*)*lastChosen = null;\s*lastGrounded = null;/.test(
    fs.readFileSync(require.resolve("./run_full.cjs"), "utf8")), "run_full.cjs must clear the launch tracker after a death");
  assert(/deathLog\.push[\s\S]{0,400}lastGroundedKey = null;/.test(
    fs.readFileSync(require.resolve("./run_level.cjs"), "utf8")), "run_level.cjs must clear the launch tracker after a death");
  console.log("OK: both runners attribute deaths through deathEntries; ATTRIB=0 gives one entry");
}

// An unwinnable reset (a gem burned; collected + alive < 3) burns a life, and
// until now it recorded nothing: level 13 ran 11 resets with an empty deathLog
// and 0 decisions with priorDeaths above 0, so every life replayed the
// identical route. Both runners must now record it through one shared blame
// rule, or they explore at different keys (the deathEntries lesson again).
{
  const { unwinnableDeath } = require("./run_stats.cjs");
  const s = { gemsCollected: 1, aliveGems: 1 };
  const a = unwinnableDeath(s, { key: "120,240", action: "right" }, "300,100");
  assert.strictEqual(a.key, "120,240", "an unwinnable reset blames the last grounded decision");
  assert.strictEqual(a.action, "right");
  assert(a.cause.includes("1 collected + 1 alive cannot reach 3"), `cause must state the counts: ${a.cause}`);
  const b = unwinnableDeath(s, null, "300,100");
  assert.strictEqual(b.key, "300,100", "with no grounded decision yet, blame the cat's own position");
  assert.strictEqual(b.action, "(route)");
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(require.resolve(`./${f}`), "utf8");
    const branch = src.match(/if \(s\.gemsCollected \+ s\.aliveGems < 3\) \{[\s\S]*?\n    \}/);
    assert(branch, `${f}: unwinnable branch not found`);
    assert(/unwinnableDeath\(/.test(branch[0]), `${f}: unwinnable branch must blame through run_stats.unwinnableDeath`);
    assert(/recordDeath\(|deathHistory\.push\(/.test(branch[0]), `${f}: unwinnable reset must reach deathHistory`);
  }
  console.log("OK: unwinnable resets are recorded as deaths, same blame rule in both runners");
}

// decide() must hand the move it returned last to the survival check, so the
// steering lag is modelled live. It never did: the frame count divided by
// CFG.droneSpeed, which config.cjs does not export, so the guard compared NaN
// and the previous move was dropped on every decision.
(async () => {
  const prev = process.env.PRUNE_FATAL;
  process.env.PRUNE_FATAL = "1";
  const mf = 161;
  const drones = { tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } };
  const snap6 = { level: 6, onPlatform: false, cat: { x: 204.25, y: 176, dy: 6.4, height: 18 }, gemPositions: [{ x: 135, y: 143 }], gemsCollected: 2, drones };
  let menu = null;
  const stub = { classify: async (_s, q) => {
    if (q.objective) { const n = Object.keys(q.objective.criteria); const p = {}; n.forEach((k) => (p[k] = 1 / n.length)); return { objective: { choice: n[0], probabilities: p } }; }
    menu = Object.keys(q.move.criteria);
    const p = {}; menu.forEach((k) => (p[k] = 1 / menu.length));
    return { move: { choice: menu[0], probabilities: p } };
  } };
  const memo = { lastMove: "left", lastMoveMF: 158 };
  await d.decide(stub, snap6, [[135, 143], [225, 181], [221, 108]], () => {}, [], new Map(), memo);
  if (prev === undefined) delete process.env.PRUNE_FATAL; else process.env.PRUNE_FATAL = prev;
  assert.deepStrictEqual(menu, ["right"], `decide() lost the carried move: menu was ${JSON.stringify(menu)}`);
  console.log("OK: decide() passes the carried move to the survival check");
})().catch((e) => { console.error(e); process.exitCode = 1; });

// A top-level `return` ends module execution, so every async check below must
// chain onto this instead of returning, or later checks silently never run.
let __pending = Promise.resolve();

// --- decide() must escalate out of a death loop -----------------------------
// Regression: decide() (the demo / qwen_local path) was argmax-only. Because a
// death resets the level to an identical state, an identical argmax answer
// replays forever. Observed on level 1 as four byte-identical attempts
// (n=20, maxMF=373, gems=2, same final position). layaDecide already sampled;
// decide() did not.
{
  const stub = (moveProbs) => ({
    classify: async (_state, questions) => {
      if (questions.objective) {
        const names = Object.keys(questions.objective.criteria);
        const p = {}; names.forEach((n, i) => (p[n] = i === 0 ? 0.9 : 0.1 / (names.length - 1)));
        return { objective: { choice: names[0], probabilities: p } };
      }
      const keys = Object.keys(moveProbs);
      const argmax = keys.reduce((a, b) => (moveProbs[a] >= moveProbs[b] ? a : b));
      return { move: { choice: argmax, probabilities: moveProbs } };
    },
  });

  const legal = d.legalActions(snap);
  const names = Object.keys(legal);
  assert(names.length >= 2, "need >=2 legal actions for the escalation check");
  const probs = {};
  names.forEach((n, i) => (probs[n] = i === 0 ? 0.8 : 0.2 / (names.length - 1)));
  const top = names[0];

  const run = (hist) => d.decide(stub(probs), snap, gems, () => {}, hist);

  // No prior death here -> exploit the argmax, unchanged.
  __pending = run([]).then(async (clean) => {
    assert.strictEqual(clean.policyMode, "ARGMAX", "decide() must exploit argmax with no prior death");
    assert.strictEqual(clean.move, top, "decide() must return the argmax when not exploring");

    // THE behavioural assertion, checked before any metadata field: with prior
    // deaths at this exact 10px key the chosen move must not always be the
    // argmax, or the death loop is permanent by construction.
    const twice = [hist[0], hist[0]];
    let deviations = 0;
    for (let i = 0; i < 40; i++) {
      const r = await run(twice);
      if (r.move !== top) deviations += 1;
    }
    assert(deviations > 0,
      "decide() never deviated from the argmax across 40 calls with 2 prior deaths here: the death loop stays permanent");

    // Then the reported metadata must match what it actually did.
    assert.strictEqual(clean.priorDeathsHere, 0, "priorDeathsHere wrong with empty history");
    const hot = await run(twice);
    assert.strictEqual(hot.argmaxMove, top, "stub argmax drifted");
    assert.strictEqual(hot.policyMode, "SAMPLE", "decide() must report SAMPLE after a death at this position");
    assert.strictEqual(hot.priorDeathsHere, 2, "priorDeathsHere must count deaths at this key");
    assert(Math.abs(hot.samplingTemperature - 2.0) < 1e-9,
      `temperature must escalate to 1.0 + 0.5*2 = 2.0, got ${hot.samplingTemperature}`);

    console.log(`OK: decide() escalates out of a death loop (${deviations}/40 sampled calls deviated from argmax)`);
  });
}

// --- decide() must escalate out of a DEATHLESS livelock ---------------------
// Regression: on level 2 the cat oscillated between x=283.25 and x=276.25 for
// 10+ decisions and never died, so the death-keyed escalation never engaged.
// The candidate set flips across a proximity gate (5 objectives at one x, 3 at
// the other), flipping the objective and cancelling the walk. Revisits to the
// same 10px key must count as the same evidence of a failed argmax.
{
  const stubFor = (moveProbs) => ({
    classify: async (_state, questions) => {
      if (questions.objective) {
        const names = Object.keys(questions.objective.criteria);
        const p = {}; names.forEach((n, i) => (p[n] = i === 0 ? 0.9 : 0.1 / (names.length - 1)));
        return { objective: { choice: names[0], probabilities: p } };
      }
      const keys = Object.keys(moveProbs);
      const argmax = keys.reduce((a, b) => (moveProbs[a] >= moveProbs[b] ? a : b));
      return { move: { choice: argmax, probabilities: moveProbs } };
    },
  });
  const names = Object.keys(d.legalActions(snap));
  const probs = {};
  names.forEach((n, i) => (probs[n] = i === 0 ? 0.8 : 0.2 / (names.length - 1)));
  const top = names[0];
  const hereKey = "310,290"; // snap.cat (306,286) rounded to 10px

  return __pending.then(() => (async () => {
    // At or below the threshold: normal play, still exploiting the argmax.
    const atThreshold = new Map([[hereKey, d.VISIT_STUCK_THRESHOLD]]);
    const calm = await d.decide(stubFor(probs), snap, gems, () => {}, [], atThreshold);
    assert.strictEqual(calm.policyMode, "ARGMAX",
      "decide() must not explore at or below the revisit threshold (normal back-and-forth play)");
    assert.strictEqual(calm.revisitsHere, 0, "revisitsHere must be 0 at the threshold");

    // Past the threshold with NO deaths at all: must explore anyway.
    const stuck = new Map([[hereKey, d.VISIT_STUCK_THRESHOLD + 2]]);
    let deviations = 0;
    for (let i = 0; i < 40; i++) {
      const r = await d.decide(stubFor(probs), snap, gems, () => {}, [], stuck);
      if (r.move !== top) deviations += 1;
    }
    assert(deviations > 0,
      "decide() never deviated from the argmax across 40 calls with no deaths but " +
      (d.VISIT_STUCK_THRESHOLD + 2) + " visits here: a deathless livelock stays permanent");

    const hot = await d.decide(stubFor(probs), snap, gems, () => {}, [], stuck);
    assert.strictEqual(hot.policyMode, "SAMPLE", "decide() must report SAMPLE when stuck without dying");
    assert.strictEqual(hot.priorDeathsHere, 0, "this case must have no deaths");
    assert.strictEqual(hot.revisitsHere, 2, "revisitsHere must be visits minus the threshold");

    // Both runners must actually pass visitCounts through. This is the exact
    // shape of the earlier arity bug, where a builder silently received the
    // wrong positional argument.
    const fs = require("fs");
    assert.strictEqual(d.decide.length, 7, "decide() arity changed; runners pass 7 positional args");
    // Resolve against this file, not the cwd, so `npm test` works from driver/.
    const path = require("path");
    for (const f of ["run_level.cjs", "run_full.cjs"]) {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      // The logger argument contains parentheses in run_level.cjs, so this must
      // not use a [^)]* class.
      assert(/decideFn\(client, s, levelGems,[\s\S]*?, deathHistory, visitCounts, decideMemo\)/.test(src),
        `${f} does not pass visitCounts and decideMemo to decideFn`);
      // The objective lock must be dropped when the level resets, or the cat
      // carries a dead objective from the attempt that just killed it.
      assert(/decideMemo\.lockedObjective = null/.test(src),
        `${f} never clears the held objective on reset`);
      assert(/visitCounts\.clear\(\)/.test(src), `${f} never clears visitCounts on reset`);

      // visitCounts must be a SLIDING WINDOW of recent decisions, not a running
      // total for the attempt. A lifetime count fired on positions the cat
      // legitimately re-crosses during a long level: on level 2 that flipped the
      // policy to SAMPLE mid-route and drew a 34-frame standing jump over the
      // argmax, and the cat then died 49 frames short of the portal.
      assert(/visitWin\.push\(visitKey\)/.test(src),
        `${f} does not record decision positions in a sliding window`);
      assert(/if \(visitWin\.length > VISIT_WINDOW\) visitWin\.shift\(\)/.test(src),
        `${f} does not trim the visit window to VISIT_WINDOW`);
      // The rebuild must read the window, and must not wipe it first.
      assert(/visitCounts\.clear\(\);\n\s*for \(const k of visitWin\)/.test(src),
        `${f} must rebuild visitCounts from the window without clearing the window itself`);
    }
    assert(Number.isInteger(d.VISIT_WINDOW) && d.VISIT_WINDOW > d.VISIT_STUCK_THRESHOLD,
      `VISIT_WINDOW (${d.VISIT_WINDOW}) must exceed VISIT_STUCK_THRESHOLD (${d.VISIT_STUCK_THRESHOLD}), or escalation can never fire`);
    // The stall detector must give the revisit escalation room to work. It is a
// diagnostic abort, not a game rule: a hasty one reports a livelock while the
// escape hatch is still winding up. Level 2 oscillated between two positions and
// was aborted at 10 decisions, when escalation needs ~8 to start sampling.
__pending = __pending.then(async () => {
  const fs = require("fs"), path = require("path");
  // run_level's distinct-position abort must outlast the escalation: the shared
  // window it imports has to exceed 2 * (VISIT_STUCK_THRESHOLD + 1).
  const shared = require("./stall_window.cjs");
  const win = shared.STALL_WINDOW;
  const needed = 2 * (d.VISIT_STUCK_THRESHOLD + 1);
  assert(Number.isInteger(win) && win > needed,
    `Shared STALL_WINDOW (${win}) must exceed the ${needed} decisions a two-position ` +
    `oscillation needs before escalation fires, or the abort always wins`);
  const rl = fs.readFileSync(path.join(__dirname, "run_level.cjs"), "utf8");
  assert(/require\("\.\/stall_window\.cjs"\)/.test(rl),
    "run_level.cjs must import STALL_WINDOW from stall_window.cjs");
  // run_level must NOT declare its own STALL_WINDOW (shadowing the import).
  // test_runner_parity.cjs counts declarations; here we assert zero to close
  // the hole where a local const would pass the import check but shadow it.
  // Match at any indentation (module or function scope) to catch shadowing.
  const rlStallDecls = (rl.match(/^\s*const STALL_WINDOW = /gm) || []).length;
  assert.strictEqual(rlStallDecls, 0,
    "run_level.cjs must have ZERO const STALL_WINDOW declarations (import only)");
  // run_full's stall detector is progress-based, not position-distinct; its
  // window is a measured ladder value, deliberately NOT the shared one
  // (reverted 2026-10-09, see docs/open-problems.md). Pin the documented shape:
  // local 10, no import of the shared module.
  const rf = fs.readFileSync(path.join(__dirname, "run_full.cjs"), "utf8");
  assert(!/require\("\.\/stall_window\.cjs"\)/.test(rf),
    "run_full.cjs must NOT import the shared stall window (progress-based detector, measured value)");
  assert(/const STALL_WINDOW = 10;/.test(rf),
    "run_full.cjs keeps its local STALL_WINDOW = 10 until a live ladder measurement justifies a change");
  console.log(`OK: run_level stall abort (${win}) outlasts escalation (${needed}); run_full keeps its measured local 10`);
});

// Hop points: reachable neighbouring platforms, for when the route on is not the
// greedy direction. Measured on level 3: on the platform at (263,246) with gem_c
// up and to the LEFT, the cat jumped left, fell back onto the same platform and
// repeated for nine identical attempts and zero gems, while jump_right from any x
// on that platform lands on the y=200 platform.
__pending = __pending.then(async () => {
  const l3gems = [[186, 118], [216, 103], [242, 119]];
  const stuck = {
    level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    cat: { x: 263, y: 246, dy: 0, height: 18 },
    gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }],
    drones: { tl: { x: 1, y: 41 }, br: { x: 359, y: 270 }, bl: { x: 1, y: 270 }, tr: { x: 359, y: 41 } },
  };
  const pts = d.ascentPoints(stuck, l3gems);
  assert(pts.length >= 1, "an ascent point must be offered from the level 3 platform the cat looped on");
  const right = pts.find((p) => p.name === "ascent_right");
  assert(right, `the way on from (263,246) is to the RIGHT; got ${pts.map((p) => p.name).join(",") || "nothing"}`);
  assert(/y 200/.test(right.label), `the ascent must name the y=200 platform it reaches; got "${right.label}"`);

  // Gems stay in the menu beside it: a flat simultaneous set, not a replacement.
  const oc = d.buildObjectiveCall(stuck, l3gems, []);
  assert(oc.objectiveNames.includes("ascent_right"), "ascent_right must appear in the objective menu");
  assert(oc.objectiveNames.filter((n) => /^gem_/.test(n)).length === 3,
    "gems must remain selectable alongside ascent points");

  // BOTH move builders must resolve it, or one path throws at runtime. This is the
  // same hole that opened three times today (death history, video, overlay).
  for (const build of ["buildMoveCall", "buildLayaMoveCall"]) {
    const mc = d[build](stuck, l3gems, "ascent_right", []);
    assert.strictEqual(mc.target.x, right.x, `${build} must steer to the ascent target`);
    // The target must be the DESTINATION platform, i.e. ABOVE the cat. Aiming at a
    // launch spot on the cat's own floor satisfies the move question on arrival and
    // the cat never jumps: measured as 86 ascent_right selections and no climb.
    assert(mc.target.y < stuck.cat.y - 20,
      `${build} ascent target must be above the cat (got y=${mc.target.y} vs cat y=${stuck.cat.y})`);
  }

  // The rule is general, not level-specific: with everything already ON this
  // floor, offer nothing. (The gate is NOT "nothing above" -- see hop_points.cjs:
  // level 4's gem_a is below this floor yet reached via a same-height platform.)
  const nothingAbove = Object.assign({}, stuck, {
    gemPositions: [{ x: 250, y: 280 }, { x: 260, y: 285 }, { x: 270, y: 288 }],
  });
  assert.strictEqual(d.ascentPoints(nothingAbove, [[250, 280], [260, 285], [270, 288]]).length, 0,
    "nothing above this floor means no ascent points");
  // Level 4's gem_a is reachable only via a SAME-HEIGHT platform, which this
  // above-only rule deliberately does not offer. Widening it to cover that was
  // measured and reverted (see hop_points.cjs): it failed levels 2 and 3 and level
  // 4 never selected the entry anyway. Assert the narrow rule so the widening is
  // not reapplied without re-measuring.
  {
    const l4gems = [[289, 156], [105, 164], [182, 226]];
    const start = {
      level: 4, onPlatform: true, gemsCollected: 0, aliveGems: 3,
      cat: { x: 121, y: 93, dy: 0, height: 18 },
      gemPositions: [{ x: 289, y: 156 }, { x: 105, y: 164 }, { x: 182, y: 226 }],
      drones: { tl: { x: 1, y: 5 }, br: { x: 359, y: 306 }, bl: { x: 1, y: 306 }, tr: { x: 359, y: 5 } },
    };
    assert.strictEqual(d.ascentPoints(start, l4gems).length, 0,
      "level 4's start floor has nothing above it: the above-only rule offers nothing there");
  }
  console.log("OK: ascent points offered when the route up is not the greedy direction");
});

// BOTH runners must drive the on-page decision panel. This is the third feature
// to exist in run_full.cjs and not run_level.cjs (death-history wiring and video
// recording were the first two), and the failure is silent: the run is correct,
// the recording just shows empty "objective" and "move" boxes.
__pending = __pending.then(async () => {
  const fs = require("fs"), path = require("path");
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert(/window\.overlay\s*&&\s*window\.overlay\.thinking\(true\)/.test(src),
      `${f} never puts the decision panel into its thinking state`);
    assert(/window\.overlay\.update\(/.test(src), `${f} never pushes a decision to the panel`);
    // The panel reads these three; a payload missing them renders empty boxes.
    for (const field of ["objectiveProbs", "moveProbs", "policyMode"]) {
      assert(src.includes(field), `${f} overlay payload is missing ${field}`);
    }
    // decide() and layaDecide() name the policy fields differently. Reading only
    // one silently blanks the readout on the other path.
    assert(/samplingTemperature/.test(src) && /temperatureUsed/.test(src),
      `${f} must read BOTH samplingTemperature (decide) and temperatureUsed (layaDecide)`);
    assert(/priorDeathsHere/.test(src) && /priorDeathsAtPosition/.test(src),
      `${f} must read BOTH priorDeathsHere (decide) and priorDeathsAtPosition (layaDecide)`);
  }
  console.log("OK: both runners drive the decision panel, with fields for both decide paths");
});

// BOTH runners must stamp every decision, death and level boundary with epoch
// wall-clock ms, because that is the clock Playwright's screencast is timestamped
// with (videoRecorder.ts: _creationTimeMs = Date.now(), each frame written at
// frameSwapWallTime - _creationTimeMs, and that zero point lands in the file as
// the `creation_time` tag). Without these stamps an editor has no way to line a
// decision up with the frame that shows it, so the cut can only be an even split
// of the runtime -- which is exactly what is wrong with a uniform speedup.
// STRUCTURAL, not behavioural: it proves the fields are wired and in the right
// order in the source, not that a run produced sane numbers (that needs a run).
__pending = __pending.then(async () => {
  const fs = require("fs"), path = require("path");
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    // epoch ms, not performance.now(): the screencast's zero point is a Date.now()
    // in the Playwright server process, so only Date.now() is comparable to it.
    assert(/videoEpochHintMs\s*=\s*Date\.now\(\)/.test(src),
      `${f} does not stamp a video epoch with Date.now()`);
    for (const field of ["endWallMs"]) {
      assert(new RegExp(`${field}\\s*=\\s*Date\\.now\\(\\)`).test(src),
        `${f} does not stamp ${field} with Date.now()`);
      assert(new RegExp(`${field}[\\s\\S]{0,400}video\\s*:\\s*\\{`).test(src) ||
            new RegExp(`video\\s*:\\s*\\{[\\s\\S]{0,400}${field}`).test(src),
        `${f} declares ${field} but never puts it in the flushed video block`);
    }
    // The stamp must be taken AFTER the panel is painted. Taken before, it
    // records the moment the model was asked rather than the moment the answer
    // became visible, which is the frame the editor holds.
    const paint = src.indexOf("window.overlay.update(");
    const stamp = src.indexOf("decisionWallMs = Date.now()");
    assert(paint > 0 && stamp > paint,
      `${f} takes decisionWallMs before the panel is painted; it must follow overlay.update()`);
    assert(/wallMs:\s*decisionWallMs/.test(src),
      `${f} does not put the painted-at stamp on the decision log entry`);
    assert(/deathLog\.push\(\{[^}]*wallMs/.test(src) || /deathLog\.push\(\{\s*\n?\s*wallMs/.test(src),
      `${f} does not stamp deathLog entries; deaths are the cuts played at real time`);
  }
  // A full ladder is ONE continuous recording, so level boundaries are not file
  // boundaries: they exist only as timestamps in the log. run_level.cjs runs one
  // level per file and does not need them.
  const full = fs.readFileSync(path.join(__dirname, "run_full.cjs"), "utf8");
  assert(/transitions\.push\(\{[^}]*level:[^}]*wallMs/.test(full),
    "run_full.cjs must record each level transition as {level, wallMs}: a single continuous video has no per-level files to cut on");
  assert(/victoryWallMs\s*=\s*Date\.now\(\)/.test(full),
    "run_full.cjs must stamp the victory screen; it is the one beat played at real time");
  // The video work must not have softened the VIDEO=1 confound guard.
  const lvl = fs.readFileSync(path.join(__dirname, "run_level.cjs"), "utf8");
  assert(/SPAWN STATE VIOLATED/.test(lvl),
    "run_level.cjs lost its SPAWN STATE VIOLATED assertion");
  console.log("OK: both runners stamp decisions, deaths and boundaries on the screencast clock");
});

// A committed airborne arc must be HELD while the geometry says it lands safely,
// and must still terminate. Re-deciding direction every 3 frames with no memory of
// the commitment made the cat reverse mid-air on 39.6% of airborne decisions on
// level 3 (zero gems in 3000 steps) against 7.5% on level 2 (cleared, no deaths).
__pending = __pending.then(async () => {
  const c = require("./cadence.cjs");
  const arc = require("./arc.cjs");

  // The simulator must reproduce what we actually observed, or it must not be
  // trusted to suppress a model call.
  const death = arc.simulate(4, 178.75, 241, 0, 18, "jump_right", 87, { grounded: true });
  assert(death.outcome === "laser" || death.outcome === "void",
    `L4 jump_right off the pit platform killed the cat; simulator says ${death.outcome}`);
  const win = arc.simulate(2, 251.75, 240, 0, 18, "jump_left", 302, { grounded: true });
  assert.strictEqual(win.outcome, "landed", "L2 jump_left from (251.75,240) landed; simulator must agree");
  assert(Math.abs(win.y - 200) < 0.01, `it landed on the y=200 platform, simulator says y=${win.y}`);
  assert(Math.abs(win.x - 201) <= 3, `it landed near x=201, simulator says x=${win.x.toFixed(1)}`);

  // A safe hold extends past the plain airborne cadence...
  let frames = 0;
  const held = await c.stepBatch({
    grounded: false, isJump: false, K: 6,
    step: async () => { frames += 1; return { done: false, airborne: true, snap: {} }; },
    holdIsSafe: () => true,
  });
  assert(held > c.AIR_REDECIDE_FRAMES,
    `a safe committed arc must be held longer than the ${c.AIR_REDECIDE_FRAMES}-frame re-decide, got ${held}`);
  // ...but is capped, so "safe forever" cannot loop.
  assert.strictEqual(held, c.MAX_HELD_FRAMES,
    `a hold must stop at MAX_HELD_FRAMES (${c.MAX_HELD_FRAMES}), got ${held}`);

  // An unsafe or unknown trajectory must re-decide at the normal cadence, so the
  // steering that level 4 needs still happens.
  for (const [name, verdict] of [["unsafe", false], ["unknown", null]]) {
    const n = await c.stepBatch({
      grounded: false, isJump: false, K: 6,
      step: async () => ({ done: false, airborne: true, snap: {} }),
      holdIsSafe: () => verdict,
    });
    assert.strictEqual(n, c.AIR_REDECIDE_FRAMES,
      `an ${name} trajectory must re-decide after ${c.AIR_REDECIDE_FRAMES} frames, got ${n}`);
  }

  // No predicate at all = previous behaviour, unchanged.
  assert.strictEqual(await c.stepBatch({ grounded: false, isJump: false, K: 6,
    step: async () => ({ done: false, airborne: true }) }), c.AIR_REDECIDE_FRAMES,
    "without holdIsSafe the airborne cadence must be unchanged");

  // Holding an arc that returns to the departure platform is DELIBERATE. Denying it
  // was tried and reverted: it fixed a level-2 edge livelock but regressed level 3
  // from 3 deaths / 178 decisions (cleared) to 16 deaths / 543 decisions (failed),
  // because a forced re-decide on every returning arc reintroduces the mid-air
  // flip-flop the hold exists to prevent. Guard the revert so it is not re-applied
  // without re-measuring level 3.
  {
    const air = {
      level: 2, onPlatform: false,
      cat: { x: 66.25, y: 66.4, dy: 1.2, height: 18 },
      drones: { tl: { x: 1, y: 1 + 0.2 * 105 }, br: { x: 359, y: 310 - 0.2 * 105 } },
    };
    const landsBack = arc.simulate(2, 66.25, 66.4, 1.2, 18, "right", 105, { grounded: false });
    assert.strictEqual(landsBack.outcome, "landed", "setup: steering right lands it back on the top row");
    assert.strictEqual(arc.heldActionIsSafe(air, "right"), true,
      "a safe landing is held even when it returns to the departure platform (see level 3)");
    assert.strictEqual(arc.heldActionIsSafe.length, 2,
      "heldActionIsSafe must not take a departure-platform argument again without re-measuring L3");
  }

  // heldActionIsSafe must FAIL OPEN: missing data means ask the model, never hold.
  assert.strictEqual(arc.heldActionIsSafe({ onPlatform: true }, "right"), null, "grounded -> not applicable");
  assert.strictEqual(arc.heldActionIsSafe({ onPlatform: false, cat: { x: 1, y: 1 }, level: 2 }, "right"), null,
    "missing cat height must return null (ask), not a guess");
  console.log("OK: safe arcs are held and capped; unsafe/unknown still re-decide");
});

// A landing the cat cannot STAND on is not a safe landing.
// heldActionIsSafe answers "does the held arc land?" and reads "landed" as safe
// without asking whether the cat is still on the platform once it gets there. On
// level 6 that is the whole difference between a decision and a death.
//
// Every coordinate below is READ OFF A RUN, not derived.
//   out/runs/PRE_L6_run_level_6_halogen_20260926-223926.json, log entry 4:
//     step 36, cat (120.25, 110), onPlatform TRUE, move "right", movingFrames 35.
//   the same archive, log entry 5, 21 frames later:
//     step 57, cat (157.00, 184.40), onPlatform FALSE, move "right", mf 56.
//   and the run then holds "right" into the bottom laser, and does it again: 38
//   entries sit on that state with a grounded entry before each, and the run
//   records 37 deaths.
// 21 frames is K=6 plus five AIR_REDECIDE_FRAMES extensions, so the hold extended
// itself FIVE times off the state it was consulted on -- the six re-decides
// cadence.cjs exists to provide.
//
// The walk is the game's own rule (a 1px column overlapping the platform box,
// applied only while dy >= 0) over arc.platformBoxes. It is pinned to the run by
// asserting its own endpoint against entry 5, so it cannot quietly become a
// private physics model without the test saying so.
__pending = __pending.then(async () => {
  const arc = require("./arc.cjs");
  const CFG = require("./physics.cjs");
  const LEVEL = 6, H = 18;
  const plats = arc.platformBoxes(LEVEL);
  const groundAt = (x, y, dy) => {
    if (dy < 0) return null;                       // the game only re-grounds while falling
    for (const p of plats) {
      if (x < p.right && x + 1 > p.left && y - H < p.bot && y > p.top) return p;
    }
    return null;
  };
  const snapAt = (x, y, dy, mf, onPlatform) => ({
    level: LEVEL, onPlatform, cat: { x, y, dy, height: H },
    drones: {
      tl: { x: 1, y: 1 + CFG.droneSpeed * mf },
      br: { x: 359, y: CFG.maximumLaserY - CFG.droneSpeed * mf },
    },
  });

  const START = { x: 120.25, y: 110, dy: 0, mf: 35, step: 36 };   // run entry 4
  const HELD_FOR = 21;                                            // entry 5 is at step 57
  const END = { x: 157.00, y: 184.40, onPlatform: false };         // run entry 5

  // Setup, and the verdict being challenged: the arc lands, and that is the whole
  // of what the predicate looks at.
  const believes = arc.simulate(LEVEL, START.x, START.y, START.dy, H, "right", START.mf, { grounded: true });
  assert.strictEqual(believes.outcome, "landed",
    `setup: the predicate's belief is that this arc lands; simulate says ${believes.outcome}`);

  // Setup guard, NOT a claim about the fix: the trajectory was survivable, so
  // calling it safe is a verdict and not a description. From the recorded entry-5
  // state the model was never asked, and steering LEFT lands 3 frames later.
  const steer = arc.simulate(LEVEL, END.x, END.y, 0.4, H, "left", END.onPlatform ? 0 : 56, { grounded: false });
  assert.strictEqual(steer.outcome, "landed",
    `setup: from the recorded state holding left must be a survivable alternative; simulate says ${steer.outcome}`);

  const frames = [];
  let { x, y, dy, mf } = START, step = START.step, onPlatform = true;
  for (let f = 1; f <= HELD_FOR; f++) {
    onPlatform = false;
    const g = groundAt(x, y, dy);
    if (g) { onPlatform = true; y = g.y; dy = 0; }
    x += CFG.catWalkSpeed;
    dy = onPlatform ? 0 : dy + CFG.catFallingAcceleration;
    y += dy; mf += 1; step += 1;
    frames.push({
      f, step, x, y, dy, mf, onPlatform,
      safe: arc.heldActionIsSafe(snapAt(x, y, dy, mf, onPlatform), "right"),
    });
  }
  const last = frames[frames.length - 1];
  assert(Math.abs(last.x - END.x) < 0.005 && Math.abs(last.y - END.y) < 0.005
      && last.onPlatform === END.onPlatform,
    `the walk must reproduce the run: entry 5 is (${END.x}, ${END.y}) onPlatform ${END.onPlatform}, ` +
    `the walk gives (${last.x.toFixed(2)}, ${last.y.toFixed(2)}) onPlatform ${last.onPlatform}`);

  // THE ASSERTION. The run's own record has the cat off the platform and falling
  // to its death, 38 times over. No frame of that trajectory may be reported
  // safe, because reporting it safe is what removed the model's chance to steer.
  const unsafe = frames.filter((fr) => fr.safe === true);
  assert.strictEqual(unsafe.length, 0,
    `heldActionIsSafe reported SAFE on ${unsafe.length} of ${frames.length} frames of a trajectory ` +
    `the run did not survive (first: frame ${unsafe.length ? unsafe[0].f : "-"}, step ` +
    `${unsafe.length ? unsafe[0].step : "-"}, cat (${unsafe.length ? unsafe[0].x.toFixed(2) : "-"}, ` +
    `${unsafe.length ? unsafe[0].y.toFixed(2) : "-"})). The y=184 platform ends at x=155; the arc is ` +
    `predicted to arrive at x=155.25, so the cat is already off the platform by the time it is ` +
    `declared landed. Five extensions of 3 frames each is every re-decide the arc could have used.`);
  console.log(`OK: a trajectory the run did not survive is never reported safe (${frames.length} frames walked)`);
});

// Platform geometry must match the sprite the cat actually collides with.
// updateCatSprite.ts collides the cat against the platform SPRITE (52x16, anchor
// y=0.4). checkPlatformsCollisionWithLasers.ts builds a DIFFERENT hand-written box
// (40 wide, 8 tall) for laser hits only; taking those numbers made every platform
// 12px narrower than it is, which put every stated descent point 6px inside the
// real edge -- the cat walked there, did not fall, and re-decided.
__pending = __pending.then(async () => {
  const phys = require("./physics.cjs");
  assert.strictEqual(phys.platformWidth, 52,
    "platform width must be the sprite's 52, not the laser box's 40");
  assert.strictEqual(phys.platformHeight, 16,
    "platform height must be the sprite's 16, not the laser box's 8");
  const e = d.platformEdges(182);
  assert.strictEqual(e.left, 156, `platform at x=182 spans from 156, got ${e.left}`);
  assert.strictEqual(e.right, 208, `platform at x=182 spans to 208, got ${e.right}`);
  // The edges must be DERIVED from the measured width, not re-hardcoded.
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "decision.cjs"), "utf8");
  assert(!/left: x - 20, right: x \+ 20/.test(src),
    "platformEdges still uses the laser box's half-width of 20");
  assert(/platformWidth/.test(src), "platformEdges must derive its half-width from physics.platformWidth");

  // A descent point must sit ON the real edge, or stepping off it does nothing.
  // L4's pit platform is at x=182: its left edge is 156, not 162.
  const snap = {
    level: 4, onPlatform: true, gemsCollected: 0,
    cat: { x: 178.75, y: 241, dy: 0, height: 18 },
    gemPositions: [{ x: 289, y: 156 }, { x: 105, y: 164 }],
    drones: { tl: { y: 1 }, br: { y: 310 } },
  };
  const pts = d.descentPoints(snap, [[289, 156], [105, 164], [182, 226]]);
  const leftPt = pts.find((q) => q.name === "descent_left");
  if (leftPt) {
    assert.strictEqual(leftPt.x, 156,
      `the left descent point of the x=182 platform is its real edge 156, got ${leftPt.x}`);
  }
  console.log("OK: platform geometry matches the sprite the cat collides with");
});

// Reachability facts: "NO ROUTE" on an objective that cannot be reached from the
// platform the cat stands on, and "ONE-WAY" on a descent that would strand one.
// Level 4's lower platforms have no edge back up, so descending before taking
// gem_a loses the level; the state said only "107px right, 85px up" and the cat
// walked off the edge at x=208 in 11 of 13 attempts.
__pending = __pending.then(async () => {
  const R = require("./reachability.cjs");
  const l4gems = [[289, 156], [105, 164], [182, 226]];

  const lower = R.reachableFrom(4, R.platformKeyUnder(4, 182, 241), 18);
  assert(lower, "setup: the cat stands on a real platform at (182,241)");
  assert(!lower.has(R.platformHolding(4, 289, 156)),
    "gem_a must be unreachable from the lower platform, or the premise is wrong");
  const spawn = R.reachableFrom(4, R.platformKeyUnder(4, 121, 93), 18);
  assert(spawn.has(R.platformHolding(4, 289, 156)),
    "gem_a must be reachable from spawn, or the level is unwinnable");

  const stranded = {
    level: 4, onPlatform: true, gemsCollected: 2, aliveGems: 1,
    cat: { x: 182, y: 241, dy: 0, height: 18 },
    gemPositions: [{ x: 289, y: 156 }],
    drones: { tl: { x: 1, y: 41 }, br: { x: 359, y: 270 }, bl: { x: 1, y: 270 }, tr: { x: 359, y: 41 } },
  };
  assert(/NO ROUTE/.test(d.buildObjectiveCall(stranded, l4gems, []).state),
    "an unreachable objective must be marked NO ROUTE");

  const atSpawn = {
    level: 4, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    cat: { x: 121, y: 93, dy: 0, height: 18 },
    gemPositions: [{ x: 289, y: 156 }, { x: 105, y: 164 }, { x: 182, y: 226 }],
    drones: { tl: { x: 1, y: 5 }, br: { x: 359, y: 306 }, bl: { x: 1, y: 306 }, tr: { x: 359, y: 5 } },
  };
  assert(/ONE-WAY[^\n]*gem_a can no longer be reached/.test(d.buildObjectiveCall(atSpawn, l4gems, []).state),
    "the one-way descent must name the gem it strands");

  // SILENCE where it does not apply. A true fact surfaced where it does not bear
  // on the decision has regressed levels here before, so assert the quiet case.
  for (const [lvl, gems, cat] of [
    [0, [[66, 235], [112, 195], [160, 165]], { x: 30, y: 290 }],
    [3, [[186, 118], [216, 103], [242, 119]], { x: 263, y: 246 }],
  ]) {
    const q = {
      level: lvl, onPlatform: true, gemsCollected: 0, aliveGems: 3,
      cat: { x: cat.x, y: cat.y, dy: 0, height: 18 },
      gemPositions: gems.map(([x, y]) => ({ x, y })),
      drones: { tl: { x: 1, y: 1 }, br: { x: 359, y: 310 }, bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 } },
    };
    assert(!/NO ROUTE|ONE-WAY|POINT OF NO RETURN/.test(d.buildObjectiveCall(q, gems, []).state),
      `level ${lvl} has no stranding, so it must carry none of the reachability annotations`);
  }
  // Gems must NOT carry a stranding annotation. Adding one was measured and
  // reverted: level 4 went from 10 deaths / 2 gems to 24 deaths / 1 gem, and all
  // 25 attempts still opened with the nearest gem. The classifier picks by
  // proximity; the ordering signal belongs in the policy, not the prompt.
  const spawnLines = d.buildObjectiveCall(atSpawn, l4gems, []).state.split("\n");
  for (const n of ["gem_a", "gem_b", "gem_c"]) {
    const line = spawnLines.find((l) => l.startsWith(`- ${n} `)) || "";
    assert(!/POINT OF NO RETURN/.test(line),
      `${n} must not carry a stranding annotation (measured: it makes level 4 worse)`);
  }
  console.log("OK: NO ROUTE and ONE-WAY fire on level 4 only, and name the stranded gem");
});

// A same-height platform ACROSS A GAP must be visible. The nearby list used to
// exclude every platform at the cat's own height, which hid level 4's P(225,93)
// entirely: the state said "next platform: right 52px" and then listed only the
// platforms BELOW, so walking off the right edge was the reasonable answer. 14 of
// 15 attempts died at x=140..154, the launch point for the jump across.
// Platforms that are part of the cat's OWN merged floor must stay excluded, or
// level 2's five-platform top row would list itself back to the model.
__pending = __pending.then(async () => {
  const l4gems = [[289, 156], [105, 164], [182, 226]];
  const atEdge = {
    level: 4, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    cat: { x: 140, y: 93, dy: 0, height: 18 },
    gemPositions: [{ x: 289, y: 156 }, { x: 105, y: 164 }, { x: 182, y: 226 }],
    drones: { tl: { x: 1, y: 9 }, br: { x: 359, y: 302 }, bl: { x: 1, y: 302 }, tr: { x: 359, y: 9 } },
  };
  const st4 = d.buildLayaMoveCall(atEdge, l4gems, "gem_a", []).state;
  assert(/x 199\.\.251 at y 93 \(same height, right\)/.test(st4),
    "the platform across level 4's 52px gap must be listed, at the same height");

  const l2gems = [[180, 188], [260, 189], [90, 188]];
  const onTopRow = {
    level: 2, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    cat: { x: 180, y: 64, dy: 0, height: 12 },
    gemPositions: [{ x: 180, y: 188 }, { x: 260, y: 189 }, { x: 90, y: 188 }],
    drones: { tl: { x: 1, y: 1 }, br: { x: 359, y: 310 }, bl: { x: 1, y: 310 }, tr: { x: 359, y: 1 } },
  };
  const st2 = d.buildLayaMoveCall(onTopRow, l2gems, "gem_a", []).state;
  assert(!/same height/.test(st2),
    "level 2's top row is ONE merged floor; it must not list its own platforms back as neighbours");
  console.log("OK: a same-height platform across a gap is visible; the cat's own floor is not");
});

// The airborne re-decide must actually happen. The extension used to be
// re-assigned on every iteration of the step loop, so the budget grew in lockstep
// with the counter and the loop only ended on death/advance/cap: after a jump the
// cat held its launch action for the whole arc. On level 4 that was a 40-frame
// commitment to an arc over a void, with eleven skipped chances to steer back.
__pending = __pending.then(async () => {
  const c = require("./cadence.cjs");
  // A jump that leaves the ground and never lands: the batch must still END, and
  // end after 1 launch frame + AIR_REDECIDE_FRAMES, so the model re-decides.
  let frames = 0;
  const n = await c.stepBatch({
    grounded: true,
    isJump: true,
    K: 6,
    step: async () => {
      frames += 1;
      if (frames > 500) return { done: true }; // guard so a regression fails, not hangs
      return { done: false, airborne: true };
    },
  });
  assert.strictEqual(n, 1 + c.AIR_REDECIDE_FRAMES,
    `a jump must run for 1 launch frame + ${c.AIR_REDECIDE_FRAMES} airborne frames then re-decide; ran ${n}`);
  assert(frames <= 500, "step batch never terminated: the airborne extension is unbounded again");

  // Grounded non-jump uses K, airborne uses the airborne cadence, and a batch
  // stops the moment an event is consumed.
  assert.strictEqual(await c.stepBatch({ grounded: true, isJump: false, K: 6,
    step: async () => ({ done: false, airborne: false }) }), 6, "grounded non-jump must run K frames");
  assert.strictEqual(await c.stepBatch({ grounded: false, isJump: false, K: 6,
    step: async () => ({ done: false, airborne: true }) }), c.AIR_REDECIDE_FRAMES,
    "airborne must re-decide every AIR_REDECIDE_FRAMES");
  assert.strictEqual(await c.stepBatch({ grounded: true, isJump: true, K: 6,
    step: async () => ({ done: true }) }), 1, "a death on the launch frame must stop the batch");

  // Both runners must go through the shared module, or the bug can come back in
  // one copy only — which is exactly how it survived: it was present in both.
  const fs = require("fs"), path = require("path");
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert(/require\("\.\/cadence\.cjs"\)/.test(src), `${f} does not use the shared cadence module`);
    assert(!/n = i \+ 1 \+ AIR_REDECIDE_FRAMES/.test(src),
      `${f} still re-assigns the step budget inside its own loop`);
    // Both runners must feed the live snapshot to the hold predicate, or a safe
    // arc can never be recognised and the mid-air flip-flop comes back.
    assert(/holdIsSafe:\s*\(\w+\)\s*=>\s*heldActionIsSafe\(\w+, d\.move\)/.test(src),
      `${f} does not check whether the committed arc is still safe`);
    assert(/snap:\s*\w+(\.\w+)?\s*[,}]/.test(src), `${f} does not pass the snapshot to stepBatch`);
  }
  console.log("OK: airborne re-decide happens; step batch is bounded; both runners share cadence.cjs");
});

// Escalation sources must COMBINE BY MAX, not by sum. run_full.cjs pushes a
    // synthetic failure per key into deathHistory on a stall, so both terms fire
    // for the same livelock there. Summing drove T to the cap, flattening a
    // 0.99-confidence answer to near-uniform (observed: 178 deaths on one level,
    // the cat jumping into the ceiling at random).
    const bothKey = "310,290";
    const both = await d.decide(
      stubFor(probs), snap, gems, () => {},
      [hist[0], hist[0]],                                  // 2 prior deaths
      new Map([[bothKey, d.VISIT_STUCK_THRESHOLD + 2]])    // and 2 revisits
    );
    assert.strictEqual(both.priorDeathsHere, 2, "setup: expected 2 prior deaths");
    assert.strictEqual(both.revisitsHere, 2, "setup: expected 2 revisits");
    assert(Math.abs(both.samplingTemperature - 2.0) < 1e-9,
      `two sources of stuckness must combine by max (1.0 + 0.5*2 = 2.0), not by sum (3.0); got ${both.samplingTemperature}`);

    // run_full.cjs must actually stop at the death cap. The flag was set inside a
    // helper that cannot break the main loop, so the cap never fired.
    const full = fs.readFileSync(path.join(__dirname, "run_full.cjs"), "utf8");
    assert(/if \(stopped\) break;/.test(full),
      "run_full.cjs main loop never breaks on `stopped`: MAX_DEATHS_PER_LEVEL is dead code");

    console.log(`OK: decide() escalates out of a deathless livelock (${deviations}/40 deviated), runners wired`);
    console.log("OK: escalation combines by max; run_full honours the death cap");
  })());
}

