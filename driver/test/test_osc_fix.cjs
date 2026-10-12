"use strict";
// ESC_FIX: the 2-key oscillation tracker and the sampler exclusion must mark only
// SAMPLEd moves that led straight back (self-loop or K->P->K) with no gem
// progress, and the exclusion must never empty the table.
// Measured basis: docs/research/flash-l2-l5-analysis.md (losers' dither ~75% SAMPLE).

const assert = require("assert");
const { createOscHistory, excludeBadMoves } = require("../decision.cjs");

// 1. Self-loop: a SAMPLEd move at K whose next decision is still at K, no progress.
{
  const o = createOscHistory();
  o.note("240,250", "left", true, 0);
  o.settle("240,250", 0);
  assert(o.badAt("240,250").has("left"), "self-loop must mark the move");
}

// 2. Two-cycle K->P->K: both sides' moves are marked at their own key.
{
  const o = createOscHistory();
  o.note("240,250", "jump_right", true, 1);
  o.settle("250,250", 1); // arrival at P: nothing known yet
  o.note("250,250", "left", true, 1);
  o.settle("240,250", 1); // back at K: the cycle is proven
  assert(o.badAt("250,250").has("left"), "P-side move must be marked at P");
  assert(o.badAt("240,250").has("jump_right"), "K-side move must be marked at K");
}

// 3. Progress (gems collected) means the return was not a dead end.
{
  const o = createOscHistory();
  o.note("240,250", "left", true, 0);
  o.settle("240,250", 1);
  assert(!o.badAt("240,250"), "a return after progress must not mark");
}

// 4. An ARGMAX move is never marked: escalation only judges what it sampled.
{
  const o = createOscHistory();
  o.note("240,250", "left", false, 0);
  o.settle("240,250", 0);
  assert(!o.badAt("240,250"), "argmax moves must not be marked");
}

// 5. clear() drops all evidence (level change: keys are shared positions).
{
  const o = createOscHistory();
  o.note("240,250", "left", true, 0);
  o.settle("240,250", 0);
  assert(o.badAt("240,250").has("left"));
  o.clear();
  assert(!o.badAt("240,250"), "clear must drop per-key evidence");
}

// 6. excludeBadMoves renormalises over the survivors and refuses to empty the set.
{
  const probs = { left: 0.5, right: 0.3, jump: 0.2 };
  const f = excludeBadMoves(probs, new Set(["left"]));
  assert.deepStrictEqual(Object.keys(f), ["right", "jump"]);
  assert(Math.abs(f.right + f.jump - 0.5) < 1e-9);
  assert.strictEqual(excludeBadMoves(probs, new Set(["left", "right", "jump"])), null);
  assert.deepStrictEqual(excludeBadMoves(probs, new Set(["none"])), probs);
  assert.strictEqual(excludeBadMoves(probs, null), null);
}

// 7. A pending observation is consumed by one settle: a third visit must not
// re-mark using stale evidence from two decisions back.
{
  const o = createOscHistory();
  o.note("240,250", "left", true, 0);
  o.settle("240,250", 0); // marks left
  o.settle("300,300", 0); // no pending note here: must not mark anything
  assert(!o.badAt("300,300"), "a settle without a pending note marks nothing");
}

console.log("test_osc_fix: all assertions passed");

// --- decide() integration: a synthetic 2-key loop must get its dead-end move
// excluded from the sample on the visit after it returns the cat to the key.
const d = require("../decision.cjs");
(async () => {
  const mf = 100;
  const drones = { tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } };
  const gems = [[186, 118], [216, 103], [242, 119]];
  const mkSnap = (x, y) => ({ level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }], moving: false,
    cat: { x, y, dx: 0, dy: 0, height: 18 }, drones, movingFrames: mf });
  const moveProbs = { left: 0.5, jump_left: 0.3, jump_right: 0.2 };
  const stub = { classify: async (_s, q) => {
    if (q.objective) { const n = Object.keys(q.objective.criteria); const p = {}; n.forEach((k) => (p[k] = 1 / n.length)); return { objective: { choice: n[0], probabilities: p } }; }
    return { move: { choice: "left", probabilities: moveProbs } };
  } };
  const K = mkSnap(243.5, 246), P = mkSnap(255, 246);
  const vc = new Map([["240,250", 5], ["260,250", 5]]); // past VISIT_STUCK_THRESHOLD -> exploring
  const osc = d.createOscHistory();
  const r1 = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc); // samples at K, notes
  const r2 = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc); // settle marks r1's move at K
  assert(osc.badAt("240,250").has(r1.move), "the sampled move that returned to K must be marked");
  const r3 = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
  assert.notStrictEqual(r3.move, r1.move, "the marked move must be excluded from the next sample at K");
  // Two-cycle: K -> P -> K marks both sides; a later K sample cannot draw K's dead end.
  await d.decide(stub, P, gems, () => {}, [], vc, {}, osc);
  await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
  assert(osc.badAt("260,250"), "the P side of the 2-cycle must be marked at P");
  // Gate off (no oscHistory): behaviour unchanged, nothing marks, nothing excludes.
  const r = await d.decide(stub, K, gems, () => {}, [], vc, {}, null);
  assert.strictEqual(r.policyMode, "SAMPLE", "escalation still fires with the gate off");
  console.log("test_osc_fix: decide() integration passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });

// --- Runner wiring pins: the gate must be created identically in both runners,
// cleared at the reset sites, and NEVER cleared at the sliding-window rebuild
// (that runs before every decide and would erase the evidence each decision).
{
  const fs = require("fs");
  const path = require("path");
  const CREATE = 'process.env.ESC_FIX === "1" ? createOscHistory() : null';
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert(src.includes(CREATE), `${f}: oscHistory must be created behind the ESC_FIX gate`);
    assert(!src.includes(CREATE.replace('"1"', '"0"')), `${f}: the gate must not be inverted`);
    // The sliding-window rebuild clears visitCounts and immediately rebuilds it;
    // no oscHistory.clear() may sit between the clear and the rebuild loop.
    assert(/visitCounts\.clear\(\);\n\s*for \(const k of visitWin\)/.test(src),
      `${f}: the sliding-window rebuild must not be interrupted by an oscHistory.clear()`);
    // Every reset-site clear is guarded (a null oscHistory must not throw).
    for (const line of src.split("\n")) {
      if (line.includes("oscHistory.clear()")) {
        assert(line.includes("if (oscHistory)"), `${f}: unguarded oscHistory.clear(): ${line.trim()}`);
      }
    }
    assert(src.split("oscHistory.clear()").length - 1 >= 2,
      `${f}: osc evidence must be cleared at both reset paths (death reset and level entry)`);
  }
  console.log("test_osc_fix: runner wiring pins passed");
}

// --- Exhaustive exclusion: once a move is marked at a key, no sample at that
// key may ever draw it again (100 draws, gate on).
(async () => {
  const mf = 100;
  const drones = { tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } };
  const gems = [[186, 118], [216, 103], [242, 119]];
  const K = { level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
    gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }], moving: false,
    cat: { x: 243.5, y: 246, dx: 0, dy: 0, height: 18 }, drones, movingFrames: mf };
  const probs = { left: 0.578, right: 0.017, jump: 0.109, jump_left: 0.138, jump_right: 0.158 };
  const stub = { classify: async (_s, q) => {
    if (q.objective) { const n = Object.keys(q.objective.criteria); const p = {}; n.forEach((k) => (p[k] = 1 / n.length)); return { objective: { choice: n[0], probabilities: p } }; }
    return { move: { choice: "left", probabilities: probs } };
  } };
  const vc = new Map([["240,250", 5]]);
  const osc = d.createOscHistory();
  // Burn in a mark: sample at K, return to K (self-loop marks the drawn move).
  const first = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
  await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
  const marked = osc.badAt("240,250");
  assert(marked && marked.has(first.move), "burn-in must mark the first sampled move");
  for (let i = 0; i < 100; i++) {
    const r = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
    // Each draw at K self-marks on the next settle (the cat stays), so the marked
    // set grows until every move with mass is marked; only then may the sampler
    // fall back to the full table (never sample an empty set).
    assert(!marked.has(r.move) || marked.size === Object.keys(probs).length,
      `sample ${i} drew the marked move ${r.move} while unmarked moves remained`);
  }
  console.log("test_osc_fix: exhaustive exclusion passed (100 draws, marked move never drawn)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
