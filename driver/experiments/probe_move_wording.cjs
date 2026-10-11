// Move-call wording probe: render the real move call at one state (airborne
// allowed, with an explicit dy), apply each candidate edit to the state text
// (a list of [find, replace] pairs; find must occur exactly once; a find of
// "@crit:<move>" replaces that option's label instead), and ask the
// endpoint for the move distribution. Prints the probability of each move.
//   node experiments/probe_move_wording.cjs <spec.json>
// spec: {"level":2,"x":71.5,"y":64.4,"dy":0.4,"mf":81,"onPlatform":false,"objective":"gem_c",
//        "env":{"AIR_EDGE":"1"},"candidates":{"name":[["find","replace"]]}}
// Env: the shipped flags plus SYSTEMONE_BASE_URL / SYSTEMONE_MODEL, exported by the caller.
const fs = require("fs");
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const [k, v] of Object.entries(spec.env || {})) process.env[k] = v;
const CFG = require("../config.cjs");
const D = require("../decision.cjs");
const { makeClient } = require("../jev.cjs");
const all = require("./gem_table.cjs")()[spec.level];
const mf = spec.mf;
const keep = spec.keep || all.map((_, i) => i);
const gp = keep.map((i) => ({ x: all[i][0], y: all[i][1] }));
const snap = { level: spec.level, gemsCollected: all.length - gp.length, aliveGems: gp.length, gemPositions: gp, moving: !spec.onPlatform,
  onPlatform: !!spec.onPlatform, cat: { x: spec.x, y: spec.y, dx: 0, dy: spec.dy || 0, height: 18 },
  drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const call = D.buildMoveCall(snap, all, spec.objective, []);
const client = makeClient({ baseUrl: CFG.SYSTEMONE_BASE_URL, path: "/v1/systemone", model: CFG.SYSTEMONE_MODEL, minIntervalMs: 0, logger: () => {} });
(async () => {
  console.log(`L${spec.level} (${spec.x},${spec.y}) dy ${spec.dy} mf ${mf} obj ${spec.objective}; moves ${Object.keys(call.questions.move.criteria).join(",")}`);
  for (const [name, edits] of Object.entries(spec.candidates)) {
    let state = call.state;
    const questions = JSON.parse(JSON.stringify(call.questions));
    for (const [find, rep] of edits) {
      // "@crit:<move>" replaces that option's label instead of editing the state text.
      if (find.startsWith("@crit:")) {
        const k = find.slice(6);
        if (!(k in questions.move.criteria)) throw new Error(`${name}: no option ${k}`);
        questions.move.criteria[k] = rep;
        continue;
      }
      const n = state.split(find).length - 1;
      if (n !== 1) throw new Error(`${name}: "${find.slice(0, 50)}" occurs ${n} times`);
      state = state.replace(find, rep);
    }
    const r = await client.classify(state, questions);
    const p = {};
    for (const [k, v] of Object.entries(r.move.probabilities)) p[k] = +v.toFixed(3);
    console.log(name.padEnd(16), JSON.stringify(p));
  }
})().catch((e) => { console.error(e); process.exit(1); });
