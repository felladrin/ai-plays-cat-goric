// A/B the death-history line at the L3-in-ladder dither state (243.5,246) obj gem_b.
// The ladder prompt carries "On a previous attempt from here you chose <action> and
// was hit by the laser" from the death at (238.25,246) mf 314 - a CLOCK-SPECIFIC
// death (top laser closed at mf 314) replayed at every clock. The isolated clear's
// deaths were elsewhere, so its prompt at this state was clean and it jumped right
// through to @200. This script scores the same state with clean vs death-line prompts.
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const { makeClient } = require("../jev.cjs");

const d = JSON.parse(fs.readFileSync(path.join(__dirname, "../../out/byom/PurpleMIST-Flash-1.0-FULL/gapstack_s6/run_full_systemone.json"), "utf8"));
const l3 = d.levels["3"];
const e = l3.decisionsLog.find((x) => Math.abs(x.cat.x - 243.5) < 0.01 && Math.abs(x.cat.y - 246) < 2);
const mf = e.movingFrames, inset = 0.2 * mf;
const snap = {
  level: 3, onPlatform: true, gemsCollected: 0, aliveGems: 3,
  gemPositions: [{ x: 186, y: 118 }, { x: 216, y: 103 }, { x: 242, y: 119 }],
  moving: false,
  cat: { x: 243.5, y: 246, dx: 0, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } },
};
const LG = [[186, 118], [216, 103], [242, 119]];
const KEY = "240,250";
const arms = {
  clean: [],
  "death(jump)": [{ step: 2097, cause: "was hit by the laser", key: KEY, action: "jump" }],
  "death(jump_left)": [{ step: 2097, cause: "was hit by the laser", key: KEY, action: "jump_left" }],
  "death(none)": [{ step: 2097, cause: "was hit by the laser", key: KEY, action: "none" }],
};
const client = makeClient({ baseUrl: process.env.SYSTEMONE_BASE_URL, path: "/v1/systemone", model: process.env.SYSTEMONE_MODEL || "systemone", minIntervalMs: 0, logger: () => {} });
(async () => {
  for (const [tag, dh] of Object.entries(arms)) {
    const call = dec.buildMoveCall(snap, LG, "gem_b", dh);
    const ans = await client.classify(call.state, call.questions);
    const p = ans.move.probabilities;
    const s = Object.entries(p).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(" | ");
    console.log(tag.padEnd(16), "argmax", ans.move.choice.padEnd(10), s);
  }
})();
