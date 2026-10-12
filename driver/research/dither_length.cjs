// Dither/bounce EPISODE LENGTH census: how long does a local oscillation last
// before death, burn, or escape? Decides whether a cadence trigger can be fast
// enough (existing STALL shape = 10-decision window; the L13 s5 endgame dither
// was ~5 decisions). Episode: a maximal run of >=3 consecutive decisions in one
// life whose cat positions fit a 60x60 box (the bounce/dither signature; the
// L13 s5 dither x 161-166, the L13 bottom bounce x 157-166).
// Lives split EXACTLY by deathLog steps (entry AT a reset step is post-reset).
//   node research/dither_length.cjs
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DIRS = [
  ["EXIT", "out/byom/PurpleMIST-Flash-1.0-EXIT"],
  ["NEG", "out/byom/PurpleMIST-Flash-1.0-NEG"],
  ["base", "out/byom/PurpleMIST-Flash-1.0"],
];
const LEVELS = [10, 13];
const W = 60, MINLEN = 3;

const hist = {}, rows = [];
for (const [tag, rel] of DIRS) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) continue;
  for (const s of fs.readdirSync(dir).sort()) {
    for (const lvl of LEVELS) {
      const p = path.join(dir, s, `run_level_${lvl}_systemone.json`);
      if (!fs.existsSync(p)) continue;
      let d; try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
      if (!d.log || !d.log.length) continue;
      const resets = (d.deathLog || []).map((e) => e.step).sort((a, b) => a - b);
      const lives = [];
      let cur = [], ri = 0;
      for (const e of d.log) {
        while (ri < resets.length && e.step >= resets[ri]) { if (cur.length) lives.push(cur); cur = []; ri++; }
        cur.push(e);
      }
      if (cur.length) lives.push(cur);
      const burnSteps = new Set((d.deathLog || []).filter((e) => /unwinnable/.test(e.cause || "")).map((e) => e.step));
      for (const life of lives) {
        let i = 0;
        while (i < life.length) {
          let j = i, xs = [life[i].cat.x], ys = [life[i].cat.y];
          while (j + 1 < life.length) {
            const nx = Math.min(...xs, life[j + 1].cat.x), ny = Math.min(...ys, life[j + 1].cat.y);
            const fx = Math.max(...xs, life[j + 1].cat.x), fy = Math.max(...ys, life[j + 1].cat.y);
            if (fx - nx > W || fy - ny > W) break;
            xs.push(life[j + 1].cat.x); ys.push(life[j + 1].cat.y); j++;
          }
          const len = j - i + 1;
          if (len >= MINLEN) {
            hist[len] = (hist[len] || 0) + 1;
            const tail = life.length - 1 - j; // decisions from episode end to life end
            const endStep = life[life.length - 1].step;
            const end = d.won && life === lives[lives.length - 1] ? "WIN"
              : [...burnSteps].some((bs) => bs <= endStep + 1 && bs > life[0].step) ? "burn"
              : "death";
            rows.push({ tag, seed: s, lvl, len, tail, end });
            i = j + 1;
          } else i = j + 1;
        }
      }
    }
  }
}
const lens = rows.flatMap((r) => Array(r.len).fill(0)).map((_, k) => k); // unused
const all = rows.map((r) => r.len).sort((a, b) => a - b);
console.log(`episodes (>=${MINLEN} dec, ${W}px box): ${rows.length}`);
console.log("len histogram:", JSON.stringify(hist));
const med = all[Math.floor(all.length / 2)];
console.log(`median ${med}, p90 ${all[Math.floor(all.length * 0.9)]}, max ${all[all.length - 1]}`);
const byEnd = {};
for (const r of rows) byEnd[r.end] = (byEnd[r.end] || 0) + 1;
console.log("episode end context:", JSON.stringify(byEnd));
// how fast does the life end after the episode?
for (const k of [0, 2, 4, 6, 10]) {
  const n = rows.filter((r) => r.end !== "WIN" && r.tail <= k).length;
  const bad = rows.filter((r) => r.end !== "WIN").length;
  console.log(`life ends within ${k} dec of episode end: ${n}/${bad}`);
}
// escape episodes (life continued long after): the false-fire risk for a trigger
const esc = rows.filter((r) => r.tail > 6);
console.log(`escaped episodes (life continued >6 dec): ${esc.length} (lens ${esc.map((r) => r.len).sort((a, b) => a - b).join(",")})`);
