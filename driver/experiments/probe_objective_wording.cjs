// Objective-call wording probe: render the real objective call at one state,
// append a candidate sentence to one gem's menu entry (state line and criterion),
// and ask the endpoint in both menu orders, averaged as decide() does. Prints the
// averaged probability of each objective per candidate. ROUTE_BURN stays off: the
// candidates are the only difference between rows.
//   node experiments/probe_objective_wording.cjs <spec.json>
// spec: {"level":10,"x":321.25,"y":290,"mf":6,"onPlatform":true,"gem":"gem_c",
//        "candidates":{"none":"","window":" It can be collected only during the next 136 moving frames."}}
// Env: the shipped flags plus SYSTEMONE_BASE_URL / SYSTEMONE_MODEL, exported by the caller.
const fs = require("fs");
const CFG = require("../config.cjs");
const D = require("../decision.cjs");
const { makeClient } = require("../jev.cjs");
const GEMS = require("./gem_table.cjs")();

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const all = GEMS[spec.level];
const mf = spec.mf;
const snap = { level: spec.level, gemsCollected: 0, aliveGems: all.length, gemPositions: all.map(([gx, gy]) => ({ x: gx, y: gy })),
  moving: false, onPlatform: !!spec.onPlatform, cat: { x: spec.x, y: spec.y, dx: 0, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const call = D.buildObjectiveCall(snap, all, []);
if (!call.objectiveNames.includes(spec.gem)) throw new Error(`${spec.gem} is not on the menu: ${call.objectiveNames}`);
const lines = call.state.split("\n");
const at = lines.findIndex((l) => l.startsWith(`- ${spec.gem} at `));
if (at < 0) throw new Error(`no menu line for ${spec.gem}`);
const client = makeClient({ baseUrl: CFG.SYSTEMONE_BASE_URL, path: "/v1/systemone", model: CFG.SYSTEMONE_MODEL, minIntervalMs: 0, logger: () => {} });
(async () => {
  console.log(`L${spec.level} (${spec.x},${spec.y}) mf ${mf} gem ${spec.gem}; menu ${call.objectiveNames.join(",")}`);
  for (const [name, text] of Object.entries(spec.candidates)) {
    const ls = lines.slice();
    ls[at] += text;
    const crit = { ...call.questions.objective.criteria, [spec.gem]: call.questions.objective.criteria[spec.gem] + text };
    const rev = {};
    for (const k of [...call.objectiveNames].reverse()) rev[k] = crit[k];
    const q = (c) => ({ objective: { ...call.questions.objective, criteria: c } });
    const state = ls.join("\n");
    const [a, b] = [await client.classify(state, q(crit)), await client.classify(state, q(rev))];
    const p = {};
    for (const k of call.objectiveNames) p[k] = +(((a.objective.probabilities[k] || 0) + (b.objective.probabilities[k] || 0)) / 2).toFixed(3);
    console.log(name.padEnd(14), JSON.stringify(p));
  }
})().catch((e) => { console.error(e); process.exit(1); });
