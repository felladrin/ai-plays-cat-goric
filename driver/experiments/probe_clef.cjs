#!/usr/bin/env node
// Ask the clef endpoint one reconstructed decision: the move call, or with
// --objective the objective call scored in both menu orders and averaged, as
// decide() does. The build comes from the env flags (run_stats.BUILD_FLAGS).
//
//   GEM_FACTS=1 node driver/experiments/probe_clef.cjs --objective \
//     --spawn-from out/clef_baseline/run_level_11_clef.json \
//     '{"x":176.25,"y":231,"ground":1,"mf":138,"alive":[0]}'
//   MOVE_INSTR=2 node driver/experiments/probe_clef.cjs --spawn-from <archive> \
//     '{"x":319.5,"y":240,"ground":1,"mf":23,"obj":"gem_c"}' --print
//
// The state is rebuilt from the logged fields, so it reproduces a live prompt
// only when the gem spawn order matches: take it from an archive of the same
// level (--spawn-from), never from a hand-typed list, which named the wrong gem
// gem_c on level 10 and gave a different answer than the run.
"use strict";
const fs = require("fs");
const d = require("../decision.cjs");
const CFG = require("../config.cjs");
const { makeClient } = require("../jev.cjs");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const spawnFrom = val("--spawn-from");
const stateArg = args.find((a) => a.startsWith("{"));
if (!spawnFrom || !stateArg) { console.error("usage: probe_clef.cjs [--objective] [--print] --spawn-from <archive.json> '<state json>'"); process.exit(2); }
const run = JSON.parse(fs.readFileSync(spawnFrom, "utf8"));
const level = run.levelIndex;
const spawn = run.log[0].gemPositions.map((p) => [p.x, p.y]);
const a = JSON.parse(stateArg);
const mf = a.mf;
const alive = (a.alive || [0, 1, 2]).map((i) => ({ x: spawn[i][0], y: spawn[i][1] }));
const snap = {
  level, onPlatform: !!a.ground, cat: { x: a.x, y: a.y, dy: a.dy || 0, height: 18 },
  gemPositions: alive, gemsCollected: 3 - alive.length,
  drones: { tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } },
};
const c = makeClient({ baseUrl: CFG.INFERADA_BASE_URL, path: "/v1/systemone", auth: CFG.INFERADA_API_KEY, model: "clef", maxRetries: 2 });
(async () => {
  if (flag("--objective")) {
    const call = d.buildObjectiveCall(snap, spawn, []);
    if (flag("--print")) { console.log(call.state); console.log(JSON.stringify(call.questions.objective.criteria, null, 1)); }
    const rev = {};
    for (const n of [...call.objectiveNames].reverse()) rev[n] = call.questions.objective.criteria[n];
    const f = await c.classify(call.state, call.questions);
    const r = await c.classify(call.state, { objective: { ...call.questions.objective, criteria: rev } });
    const p = {};
    for (const n of call.objectiveNames) p[n] = +(((f.objective.probabilities[n] || 0) + (r.objective.probabilities[n] || 0)) / 2).toFixed(3);
    console.log(JSON.stringify(p));
  } else {
    const call = d.buildMoveCall(snap, spawn, a.obj, []);
    if (flag("--print")) { console.log(call.state); console.log(JSON.stringify(call.questions.move.criteria)); }
    const ans = await c.classify(call.state, call.questions);
    console.log(JSON.stringify(ans.move.probabilities));
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
