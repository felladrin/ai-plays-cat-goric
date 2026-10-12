// Render one archived decision under two gate sets and print the gem-jump note and
// the option labels for each, to see which gate changed what the model read.
//   node experiments/cmp_gates.cjs <run_full.json> <level> <step> '<json gates A>' '<json gates B>'
// Base flags are exported by the caller; a gate value of null unsets it.
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
  return require("../decision.cjs").buildMoveCall(snap, T, e.objective, []);
};
console.log("archived", e.objective, e.move, JSON.stringify(e.moveProbs));
for (const [name, g] of [["A", JSON.parse(ga)], ["B", JSON.parse(gb)]]) {
  const c = render(g);
  const notes = c.state.split("\n").filter((l) => /jump from this floor|can no longer|cannot be collected/.test(l));
  console.log(name, notes.join(" | "));
  console.log(name, JSON.stringify(c.questions.move.criteria));
}
