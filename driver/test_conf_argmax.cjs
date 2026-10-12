"use strict";
// CONF_ARGMAX: while exploring, keep a confident argmax unless it has died here repeatedly.
const assert = require("assert");
const d = require("./decision.cjs");
const L12_GEMS = [[279, 169], [43, 129], [207, 203]];
const snap = { level: 12, cat: { x: 270, y: 125, dy: 0, height: 18 }, onPlatform: true,
  drones: { tl: { x: 1, y: 1 + 0.2 * 200 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
  gemsCollected: 1, aliveGems: 2, gemPositions: [{ x: 279, y: 169 }, { x: 207, y: 203 }] };
const stub = (p) => ({ async classify(state, questions) {
  if (questions.objective) return { objective: { choice: "gem_a", probabilities: { gem_a: 0.99, gem_c: 0.01 } } };
  return { move: { choice: "right", probabilities: { right: p, left: 1 - p } } };
} });
const deaths = (n) => Array.from({ length: n }, () => ({ key: "270,130", action: "right", cause: "laser" }));
const tally = async (p, n) => { let left = 0; for (let i = 0; i < 300; i++) { const r = await d.decide(stub(p), snap, L12_GEMS, () => {}, deaths(n), new Map(), {}); if (r.move === "left") left++; } return left; };
(async () => {
  delete process.env.CONF_ARGMAX;
  assert.ok(await tally(0.7, 1) > 0, "gate off: one prior death samples the 0.3 tail");
  process.env.CONF_ARGMAX = "1";
  assert.strictEqual(await tally(0.7, 1), 0, "gate on: a 0.7 argmax is kept at one prior death");
  assert.ok(await tally(0.5, 1) > 0, "gate on: a 0.5 argmax still samples");
  assert.ok(await tally(0.7, 3) > 0, "gate on: three deaths at the key sample again");
  delete process.env.CONF_ARGMAX;
  console.log("test_conf_argmax: Failed: 0");
})().catch((e) => { console.error(e); process.exit(1); });
