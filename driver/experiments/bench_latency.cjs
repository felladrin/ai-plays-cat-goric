// Time single endpoint calls: the move call and the objective call at one fixed
// L12 state (the fork on x 58..215 at y 165), N times each, sequentially.
//   SYSTEMONE_BASE_URL=... SYSTEMONE_MODEL=... node experiments/bench_latency.cjs [N]
// Env: the shipped flags, exported by the caller (they shape the prompt).
const CFG = require("../config.cjs");
const D = require("../decision.cjs");
const { makeClient } = require("../jev.cjs");
const N = Number(process.argv[2] || 20);
const all = require("./gem_table.cjs")()[12];
const mf = 177;
const snap = { level: 12, gemsCollected: 1, aliveGems: 2, gemPositions: [0, 2].map((i) => ({ x: all[i][0], y: all[i][1] })), moving: false, onPlatform: true,
  cat: { x: 179.25, y: 165, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const move = D.buildMoveCall(snap, all, "gem_a", []);
const obj = D.buildObjectiveCall(snap, all, []);
const client = makeClient({ baseUrl: CFG.SYSTEMONE_BASE_URL, path: "/v1/systemone", model: CFG.SYSTEMONE_MODEL, minIntervalMs: 0, logger: () => {} });
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
(async () => {
  for (const [name, c] of [["move", move], ["objective", obj]]) {
    await client.classify(c.state, c.questions); // warm-up, not timed
    const ms = [];
    for (let i = 0; i < N; i++) { const t = process.hrtime.bigint(); await client.classify(c.state, c.questions); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
    console.log(`${CFG.SYSTEMONE_MODEL} ${name}: n ${N}, median ${pct(ms, 0.5).toFixed(0)} ms, p10 ${pct(ms, 0.1).toFixed(0)}, p90 ${pct(ms, 0.9).toFixed(0)}, state ${c.state.length} chars, ${Object.keys(c.questions[Object.keys(c.questions)[0]].criteria).length} options`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
