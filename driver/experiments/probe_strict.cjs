"use strict";
// probe_strict.cjs — does the ported STRICT decision-rule change the classifier
// on the game's CHOICE questions (objective + move)? STRICT is written for
// truth/probability propositions; the game asks preference questions ("which to
// pursue"). This measures whether the transfer is meaningful or noise.
//
// Toggles JEV_STRICT in-process around buildSystem (it reads env at call time).

const path = require("path");
const DRIVER = path.join(__dirname, "..");
const { buildObjectiveCall, buildMoveCall } = require(path.join(DRIVER, "decision.cjs"));
const { makeHalogenLogprobsClient } = require(path.join(DRIVER, "jev.cjs"));
const fs = require("fs");

const src = fs.readFileSync(path.join(DRIVER, "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"), "utf8");
const GEMS = JSON.parse(src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/)[1].replace(/,(\s*[\]\}])/g, "$1"));

function snapAt(level, x, y, mf, onPlat) {
  const inset = 0.2 * mf;
  return {
    level, gemsCollected: 0,
    gemPositions: GEMS[level].map(([gx, gy]) => ({ x: gx, y: gy })),
    moving: false, onPlatform: onPlat,
    cat: { x, y, dx: 0, dy: 0, height: 18 },
    drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } },
  };
}

const client = makeHalogenLogprobsClient({ baseUrl: "http://gpu-server.proxy:1234", model: "Halogen-Qwen3.8-Flash-Next-Instruct" });

async function probsFor(buildFn, strict) {
  process.env.JEV_STRICT = strict ? "1" : "0";
  const call = buildFn();
  const ans = await client.classify(call.state, call.questions);
  const key = Object.keys(call.questions)[0];
  return ans[key].probabilities;
}

async function run(label, buildObj, buildMove) {
  if (buildObj) {
    const off = await probsFor(buildObj, false);
    const on = await probsFor(buildObj, true);
    console.log(`\n[${label}] OBJECTIVE`);
    console.log("  STRICT off:", JSON.stringify(off));
    console.log("  STRICT on :", JSON.stringify(on));
  }
  if (buildMove) {
    const off = await probsFor(buildMove, false);
    const on = await probsFor(buildMove, true);
    console.log(`[${label}] MOVE`);
    console.log("  STRICT off:", JSON.stringify(off));
    console.log("  STRICT on :", JSON.stringify(on));
  }
}

async function main() {
  // L12 spawn: objective choice (no urgency annotation here — pure baseline vs STRICT)
  const s12 = snapAt(12, 182.75, 87, 6, true);
  await run("L12 spawn", () => buildObjectiveCall(s12, GEMS[12], []), () => buildMoveCall(s12, GEMS[12], "gem_a", []));
  // L4 spawn: the stranding-sensitive state
  const s4 = snapAt(4, 121, 81, 4, false);
  await run("L4 spawn", () => buildObjectiveCall(s4, GEMS[4], []), null);
}
main().catch((e) => { console.error(e); process.exit(1); });
