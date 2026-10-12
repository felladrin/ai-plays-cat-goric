// Render one archived state's OBJECTIVE call under two gate sets and print the
// lines that differ, to see which gate changed what the objective call read.
//   node research/cmp_obj.cjs <run_full.json> <level> <step> '<json gates A>' '<json gates B>'
const fs = require("fs");
const [file, level, step, ga, gb] = process.argv.slice(2);
const T = require("./gem_table.cjs")()[Number(level)];
const d = JSON.parse(fs.readFileSync(file, "utf8"));
const e = d.levels[level].decisionsLog.find((x) => x.step === Number(step));
const mf = e.movingFrames;
const snap = { level: Number(level), gemsCollected: e.gemsCollected, aliveGems: e.gemPositions.length, gemPositions: e.gemPositions, moving: false, onPlatform: e.onPlatform,
  cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: 18 },
  drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const env = process.env;
const render = (gates) => {
  for (const [k, v] of Object.entries(gates)) { if (v == null) delete env[k]; else env[k] = v; }
  for (const m of Object.keys(require.cache)) if (m.includes("/driver/") && !m.includes("node_modules")) delete require.cache[m];
  const c = require("../decision.cjs").buildObjectiveCall(snap, T, []);
  return (c.state + "\n" + JSON.stringify(c.questions.objective.criteria, null, 1)).split("\n");
};
const a = render(JSON.parse(ga)), b = render(JSON.parse(gb));
console.log("archived objective", e.objective);
for (const l of a) if (!b.includes(l)) console.log("A only:", l);
for (const l of b) if (!a.includes(l)) console.log("B only:", l);
