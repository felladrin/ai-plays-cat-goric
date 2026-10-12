// A/B the left-descent claim at the L3 ladder death-loop state (233,246): the claim
// "Step off the LEFT end and you steer to land on x 206..258 at y 289" is true only
// with mid-air steering; holding left (the objective bearing) misses the floor and
// the cat falls out of bounds (10/10 ladder deaths are this class).
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const { makeClient } = require("../jev.cjs");
const mf = 87, inset = 0.2 * mf;
const snap = {
  level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
  gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }],
  moving: false,
  cat: { x: 233, y: 246, dx: 0, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } },
};
const LG = [[186, 118], [216, 103], [242, 119]];
const client = makeClient({ baseUrl: process.env.SYSTEMONE_BASE_URL, path: "/v1/systemone", model: process.env.SYSTEMONE_MODEL || "systemone", minIntervalMs: 0, logger: () => {} });
(async () => {
  const base = dec.buildMoveCall(snap, LG, "gem_b", []);
  const arms = {
    "as-is": base.state,
    "drop-claim removed": base.state.replace(/Step off the LEFT end \(x \d+\) and you steer to land on (?:(?!\. ).)*\. /, ""),
  };
  for (const [tag, state] of Object.entries(arms)) {
    const ans = await client.classify(state, base.questions);
    const p = ans.move.probabilities;
    console.log(tag.padEnd(20), "argmax", String(ans.move.choice).padEnd(6), Object.entries(p).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(" | "));
  }
})();
