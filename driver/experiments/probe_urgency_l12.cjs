"use strict";
// probe_urgency_l12.cjs — does a DESTROYED-FIRST superlative on gem_b flip the
// classifier's objective choice at the L12 spawn state?
//
// The model picks gem_b 0 times across a full L12 run (GOALS_ONLY) and ~0 in the
// baseline; it chases gem_a/gem_c while the far-left gem_b burns at mf 210. The
// ONE-WAY loss-framed superlative ("LOSES X PERMANENTLY") is the one annotation
// the docs show actually flipping the model. This tests its urgency mirror:
// "DESTROYED FIRST ... if not collected before the others it is gone."
//
// Cheap: two classify calls at one state, base vs mutated crit. No run.

const path = require("path");
const DRIVER = path.join(__dirname, "..");
const { buildObjectiveCall } = require(path.join(DRIVER, "decision.cjs"));
const { makeHalogenLogprobsClient } = require(path.join(DRIVER, "jev.cjs"));

const SPAWN = [
  [279, 169], // gem_a
  [43, 129],  // gem_b  (deadline 210)
  [207, 203], // gem_c
];
const rectInset = 0.2 * 6;
const snap = {
  level: 12,
  gemsCollected: 0,
  gemPositions: SPAWN.map(([x, y]) => ({ x, y })),
  moving: false,
  onPlatform: true,
  cat: { x: 182.75, y: 87, dx: 0, dy: 0, height: 18 },
  drones: {
    tl: { x: 0, y: 1 + rectInset },
    tr: { x: 359 - rectInset, y: 0 },
    bl: { x: 1 + rectInset, y: 310 },
    br: { x: 360, y: 310 - rectInset },
  },
};

const URGENCY =
  " DESTROYED FIRST: the closing lasers reach this gem before any other. If it is not collected before the others, it is gone and the level can never be won.";

async function main() {
  const client = makeHalogenLogprobsClient({
    baseUrl: "http://gpu-server.proxy:1234",
    model: "Halogen-Qwen3.8-Flash-Next-Instruct",
  });

  const base = buildObjectiveCall(snap, SPAWN, []);
  const baseAns = await client.classify(base.state, base.questions);
  console.log("BASELINE objective probs:", JSON.stringify(baseAns.objective.probabilities));
  console.log("BASELINE gem_b crit:", base.questions.objective.criteria.gem_b);

  // Mutate: append the urgency superlative to gem_b's crit AND its state line.
  const patched = buildObjectiveCall(snap, SPAWN, []);
  patched.questions.objective.criteria.gem_b += URGENCY;
  const patchedState = patched.state.replace(
    /^(- gem_b [^\n]*)$/m,
    "$1" + URGENCY
  );
  const patchAns = await client.classify(patchedState, patched.questions);
  console.log("\nPATCHED objective probs:", JSON.stringify(patchAns.objective.probabilities));
  console.log("PATCHED gem_b crit:", patched.questions.objective.criteria.gem_b);

  const b0 = baseAns.objective.probabilities.gem_b || 0;
  const b1 = patchAns.objective.probabilities.gem_b || 0;
  console.log(`\ngem_b: ${b0.toFixed(4)} -> ${b1.toFixed(4)}  (delta ${(b1 - b0).toFixed(4)})`);
  console.log(b1 > 0.4 ? "VERDICT: annotation moves gem_b substantially" : "VERDICT: annotation does NOT move gem_b");
}
main().catch((e) => { console.error(e); process.exit(1); });
