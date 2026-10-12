// ESC_FIX effect estimate, offline: a synthetic model of the measured L3 @246
// dither (docs/research/flash-l2-l5-analysis.md), driven by decide() itself with the
// archived move distribution, gate off vs gate on.
//
// Transition model from the gapstack_s6 L3 archive at the dither key (240,250),
// x~243.5 on floor(237..289@246), obj gem_b (probs from the archive entry at
// mf 77: left .578 right .017 jump .109 jump_left .138 jump_right .158):
//   left / right / jump  -> the cat stays at the key (walk along the floor,
//                           vertical hop back onto it)
//   jump_left            -> steps off the left end, misses @289, DIES (10/10
//                           ladder deaths were this class)
//   jump_right           -> lands on @200: ESCAPE toward the climb
// The dither is "decisions at the key until escape or death".
"use strict";
const d = require("../decision.cjs");

const mf = 100;
const drones = { tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } };
const gems = [[186, 118], [216, 103], [242, 119]];
const K = { level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
  gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }], moving: false,
  cat: { x: 243.5, y: 246, dx: 0, dy: 0, height: 18 }, drones, movingFrames: mf };
const moveProbs = { left: 0.578, right: 0.017, jump: 0.109, jump_left: 0.138, jump_right: 0.158 };
const stub = { classify: async (_s, q) => {
  if (q.objective) { const n = Object.keys(q.objective.criteria); const p = {}; n.forEach((k) => (p[k] = 1 / n.length)); return { objective: { choice: n[0], probabilities: p } }; }
  return { move: { choice: "left", probabilities: moveProbs } };
} };

const TRIALS = Number(process.env.TRIALS || 2000);
const MAX = 200;

async function trial(osc) {
  const vc = new Map([["240,250", 5]]); // past VISIT_STUCK_THRESHOLD: exploring from the start
  for (let steps = 1; steps <= MAX; steps++) {
    const r = await d.decide(stub, K, gems, () => {}, [], vc, {}, osc);
    const m = r.move;
    vc.set("240,250", vc.get("240,250") + 1);
    if (m === "jump_right") return { result: "escape", steps };
    if (m === "jump_left") return { result: "death", steps };
  }
  return { result: "cap", steps: MAX };
}

(async () => {
  for (const [tag, mk] of [["gate-off", () => null], ["gate-on", () => d.createOscHistory()]]) {
    const runs = [];
    for (let i = 0; i < TRIALS; i++) runs.push(await trial(mk()));
    const esc = runs.filter((r) => r.result === "escape");
    const dead = runs.filter((r) => r.result === "death");
    const steps = runs.map((r) => r.steps).sort((a, b) => a - b);
    const mean = steps.reduce((s, x) => s + x, 0) / steps.length;
    const p = (q) => steps[Math.floor(q * (steps.length - 1))];
    console.log(
      `${tag}: escape ${(100 * esc.length / TRIALS).toFixed(1)}%  death ${(100 * dead.length / TRIALS).toFixed(1)}%  cap ${TRIALS - esc.length - dead.length} | ` +
      `decisions-at-key mean ${mean.toFixed(1)} median ${p(0.5)} p90 ${p(0.9)} max ${steps[steps.length - 1]}`
    );
  }
})();
