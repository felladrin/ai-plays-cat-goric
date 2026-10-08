// OBJ_SAMPLE: at a demonstrably failed key (prior death or revisit), the
// objective call samples its own debiased distribution at the same temperature
// the move call already uses, and the sticky lock releases. Off unless
// OBJ_SAMPLE=1.
const assert = require("assert");
const d = require("./decision.cjs");

// The L12 oscillation state: cat ping-ponging on floor y 125 at x~270 while
// gem_a (279,169) sits 44px below near the floor's right edge.
const L12_GEMS = [[279, 169], [43, 129], [207, 203]];
const snap = {
  level: 12,
  cat: { x: 270, y: 125, dy: 0, height: 18 },
  onPlatform: true,
  drones: { tl: { x: 1, y: 1 + 0.2 * 200 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
  gemsCollected: 1,
  aliveGems: 2,
  gemPositions: [{ x: 279, y: 169 }, { x: 207, y: 203 }],
};
// A death recorded AT this key: the position is demonstrably failed.
const deathHistory = [{ key: "270,130", action: "right", cause: "laser" }];
const visitCounts = new Map();

// Stub endpoint: objective call always answers gem_a 0.99 / gem_c 0.01; the
// move call always answers right. The objective menu at this state contains at
// least gem_a and gem_c (both alive).
const stub = {
  async classify(state, questions) {
    if (questions.objective) {
      return { objective: { choice: "gem_a", probabilities: { gem_a: 0.99, gem_c: 0.01 } } };
    }
    return { move: { choice: "right", probabilities: { right: 0.99, left: 0.01 } } };
  },
};

(async () => {
  const saved = process.env.OBJ_SAMPLE;
  const savedSticky = process.env.STICKY_OBJECTIVE;
  try {
    process.env.STICKY_OBJECTIVE = "1";

    // Flag off: argmax every time, even at the failed key.
    delete process.env.OBJ_SAMPLE;
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const r = await d.decide(stub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, {});
      seen.add(r.objective);
    }
    assert.strictEqual(seen.size, 1, "flag off: argmax only, got " + [...seen]);
    assert.ok(seen.has("gem_a"));

    // Flag on: the debiased distribution is sampled at T=1.5 (one prior death),
    // so the 0.01 tail must be drawn at least once in 200 independent decisions.
    process.env.OBJ_SAMPLE = "1";
    let alt = 0;
    for (let i = 0; i < 200; i++) {
      const r = await d.decide(stub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, {});
      if (r.objective !== "gem_a") alt++;
    }
    assert.ok(alt >= 1, "flag on: tail never drawn in 200 samples");

    // The release is named in the log once the lock has actually engaged:
    // first decision locks (fresh memo), second decision releases on escalation.
    const logs = [];
    const memo = {};
    await d.decide(stub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, memo);
    await d.decide(stub, snap, L12_GEMS, (m) => logs.push(m), deathHistory, visitCounts, memo);
    assert.ok(logs.some((l) => l.includes("lock released (gem_a): objective escalation")), "release not logged: " + logs.join(" | "));

    // WPT_ARGMAX: while the objective is a waypoint, the move is the argmax even
    // at an escalating key - the commitment executes instead of wobbling.
    const savedWpt = process.env.WPT_ARGMAX;
    process.env.WPT_ARGMAX = "1";
    const wpStub = {
      async classify(state, questions) {
        if (questions.objective) {
          return { objective: { choice: "descent_right", probabilities: { descent_right: 0.99, gem_a: 0.01 } } };
        }
        return { move: { choice: "right", probabilities: { right: 0.9, left: 0.1 } } };
      },
    };
    for (let i = 0; i < 50; i++) {
      const r = await d.decide(wpStub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, {});
      if (r.objective.match(/^(descent|ascent)_/)) {
        assert.strictEqual(r.move, "right", "waypoint move must be argmax, got " + r.move);
      }
    }
    // A locked WAYPOINT survives escalation: the commitment executes instead of
    // being re-asked every decision (the bug that made the combo run's 17
    // descent_right draws execute nothing).
    const wpMemo = {};
    const wpLogs = [];
    await d.decide(wpStub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, wpMemo);
    await d.decide(wpStub, snap, L12_GEMS, (m) => wpLogs.push(m), deathHistory, visitCounts, wpMemo);
    assert.ok(!wpLogs.some((l) => l.includes("lock released")), "waypoint lock must survive escalation: " + wpLogs.join(" | "));
    assert.ok(wpLogs.some((l) => l.includes("held")), "waypoint must be held at the escalation key");
    // And without the flag the same key must still sample (tail drawn).
    delete process.env.WPT_ARGMAX;
    let tail = 0;
    for (let i = 0; i < 100; i++) {
      const r = await d.decide(wpStub, snap, L12_GEMS, () => {}, deathHistory, visitCounts, {});
      if (r.objective.match(/^(descent|ascent)_/) && r.move !== "right") tail++;
    }
    assert.ok(tail >= 1, "without WPT_ARGMAX the move sampler must still roll");
    if (savedWpt === undefined) delete process.env.WPT_ARGMAX;
    else process.env.WPT_ARGMAX = savedWpt;
    console.log("test_obj_sample: ok");
  } finally {
    if (saved === undefined) delete process.env.OBJ_SAMPLE;
    else process.env.OBJ_SAMPLE = saved;
    if (savedSticky === undefined) delete process.env.STICKY_OBJECTIVE;
    else process.env.STICKY_OBJECTIVE = savedSticky;
  }
})();
