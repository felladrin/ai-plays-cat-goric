// Four-state probe. Runs the two-call (objective -> move) decision against a
// chosen endpoint on four fixed level-0 states, and prints the objective choice
// and the move choice with full probabilities. Identical states are used for both
// endpoints so the comparison is apples-to-apples.
//
// Usage: node driver/probe.cjs [demo|local]
//
// These four states are hand-built snapshots matching the bridge's shape. They
// exercise: jump_right to a gem, airborne steer-right, move-left, and
// jump_right to the portal after 3 gems.

"use strict";

const CFG = require("./config.cjs");

const { makeClient } = require("./jev.cjs");
const { decide } = require("./decision.cjs");

const LEVEL0_GEMS = [
  [66, 235],
  [112, 195],
  [160, 165],
];

// Helper to build a snapshot with drones advanced by F moving frames.
function dronesAt(F) {
  return {
    tl: { x: 0, y: 1 + 0.2 * F },
    tr: { x: 359 - 0.2 * F, y: 0 },
    bl: { x: 1 + 0.2 * F, y: 310 },
    br: { x: 360, y: 310 - 0.2 * F },
  };
}

function snap(o) {
  return {
    level: 0,
    gemsCollected: o.collected || 0,
    aliveGems: (o.gemPositions || []).length,
    gemPositions: o.gemPositions || [],
    moving: !!o.moving,
    onPlatform: !!o.onPlatform,
    cat: o.cat,
    drones: dronesAt(o.F || 0),
  };
}

const ALL_GEMS = [
  { x: 66, y: 235 },
  { x: 112, y: 195 },
  { x: 160, y: 165 },
];

const STATES = [
  {
    label: "S1 grounded, gem_a up-right (want jump_right)",
    snap: snap({
      collected: 0,
      gemPositions: ALL_GEMS,
      onPlatform: true,
      cat: { x: 30, y: 290, dx: 0, dy: 0 },
      F: 4,
    }),
    wantMove: "jump_right",
  },
  {
    label: "S2 airborne, target clearly to the right (want right)",
    snap: snap({
      collected: 0,
      gemPositions: ALL_GEMS,
      onPlatform: false,
      moving: true,
      cat: { x: 40, y: 250, dx: 1.75, dy: 2 },
      F: 20,
    }),
    wantMove: "right",
  },
  {
    label: "S3 grounded, only gem_a alive and to the left (want left)",
    snap: snap({
      collected: 2,
      gemPositions: [{ x: 66, y: 235 }],
      onPlatform: true,
      cat: { x: 160, y: 235, dx: 0, dy: 0 },
      F: 10,
    }),
    wantMove: "left",
  },
  {
    label: "S4 three gems, portal to the right (want jump_right)",
    snap: snap({
      collected: 3,
      gemPositions: [],
      onPlatform: true,
      cat: { x: 160, y: 180, dx: 0, dy: 0 },
      F: 10,
    }),
    wantMove: "jump_right",
  },
];

const ENDPOINTS = {
  demo: {
    baseUrl: CFG.DEMO_BASE_URL,
    model: "featherless-ai/Qwen3.8-27B-classifier",
  },
  local: {
    baseUrl: CFG.SIMPLE_JEV_BASE_URL,
    model: "Qwen/Qwen3.5-4B",
  },
};

(async () => {
  const which = process.argv[2] || "demo";
  const ep = ENDPOINTS[which];
  if (!ep) {
    console.error(`unknown endpoint '${which}' (demo|local)`);
    process.exit(1);
  }
  const client = makeClient({
    baseUrl: ep.baseUrl,
    model: ep.model,
    minIntervalMs: which === "demo" ? 600 : 100,
    logger: (m) => console.log("  [" + which + "] " + m),
  });

  console.log(`\n=== PROBE against ${which}: ${ep.model} @ ${ep.baseUrl} ===\n`);

  for (const st of STATES) {
    console.log(st.label + `   [want move=${st.wantMove}]`);
    try {
      const res = await decide(client, st.snap, LEVEL0_GEMS, (m) =>
        console.log("    " + m)
      );
      const ok = res.move === st.wantMove ? "MATCH" : "MISS";
      console.log(
        `    => objective=${res.objective}  move=${res.move}  [${ok}]\n`
      );
    } catch (e) {
      console.log("    ERROR: " + e.message + "\n");
    }
  }
})().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(1);
});
