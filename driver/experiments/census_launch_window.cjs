// LAUNCH_WINDOW census (L10 @150): for every grounded jump_right on floor(212..264@150),
// record the launch x and the next grounded floor y (or death before landing), and the
// held-right arc.simulate landing at the real clock. Question: does the floor the jump
// reaches depend on launch x in live play the way the simulator says (x<226 fatal,
// 244..255 -> @140), and do the model's launches sit outside the @140 window?
//   node experiments/census_launch_window.cjs
const fs = require("fs");
const path = require("path");
const A = require("../arc.cjs");
const ROOT = path.resolve(__dirname, "..", "..", "out", "byom");
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^(run_level_10_|run_full_).*\.json$/.test(f) && /PurpleMIST-Flash/.test(p)) files.push(p); } })(ROOT);
const byBucket = {};
let n = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  const log = d.log ? (d.levelIndex === 10 ? d.log : null) : d.levels && d.levels["10"] ? d.levels["10"].decisionsLog : null;
  if (!log) continue;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e.onPlatform || e.cat.y !== 150 || e.move !== "jump_right") continue;
    let next = "dead";
    for (let j = i + 1; j < log.length; j++) {
      const g = log[j];
      if (g.movingFrames < e.movingFrames) break; // respawn
      if (g.onPlatform && g.step > e.step + 3) { next = `@${g.cat.y}`; break; }
    }
    const sim = A.simulate(10, e.cat.x, 150, 0, 18, "jump_right", e.movingFrames);
    const simT = sim.outcome === "landed" ? `@${Math.round(sim.y)}` : sim.outcome;
    const b = e.cat.x < 226 ? "x<226" : e.cat.x < 231 ? "226-231" : e.cat.x < 242 ? "231-242" : e.cat.x < 257 ? "242-257" : "257+";
    const k = `${b} sim:${simT}`;
    (byBucket[k] = byBucket[k] || {})[next] = (byBucket[k][next] || 0) + 1;
    n++;
  }
}
console.log(`files ${files.length}, jump_right launches on @150: ${n}`);
for (const k of Object.keys(byBucket).sort()) console.log(k.padEnd(24), JSON.stringify(byBucket[k]));
