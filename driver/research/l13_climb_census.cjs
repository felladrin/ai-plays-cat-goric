// L13 climb-life census: in the losing lives (gc==2, objective gem_c, the
// two-gem clock race), WHERE are the decisions spent and WHICH moves are
// chosen, against gem_c's deadline (250)? Paired: the winning lives (s3, s4,
// s10) did the same climb and made it - same table for them.
//   node research/l13_climb_census.cjs
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const SEEDS = ["s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"];
const DEADLINE_C = 250; // route_clock.gemDeadline(13, gem_c)

for (const s of SEEDS) {
  const p = path.join(ROOT, `out/byom/PurpleMIST-Flash-1.0-EXIT/${s}/run_level_13_systemone.json`);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const won = !!d.won;
  // mode/revisits come from the text log next to the JSON: one indented
  // 'move=... mode=X T=... priorDeaths=N revisits=N probs=' line per decision,
  // in decide-call order = archive log order (verified 1:1 on s5: 293=293).
  let meta = [];
  const logp = p.replace(/run_level_13_systemone\.json$/, "L13.log");
  if (fs.existsSync(logp)) {
    const t = fs.readFileSync(logp, "utf8");
    for (const m of t.matchAll(/mode=(\S+) T=([\d.]+) priorDeaths=(\d+) revisits=(\d+)/g))
      meta.push({ mode: m[1], T: +m[2], revisits: +m[4] });
  }
  // lives: EXACT split from the deathLog, which lists every reset (deaths AND
  // unwinnable resets) with its step. The entry AT the reset step is already the
  // post-reset state, so the life ENDS before it. Independent of mf, which can
  // restart at a HIGHER value after a reset and silently merge two lives.
  const resets = (d.deathLog || []).map((e) => e.step).sort((a, b) => a - b);
  const lives = [];
  let cur = [], ri = 0;
  for (const e of d.log) {
    while (ri < resets.length && e.step >= resets[ri]) { if (cur.length) lives.push(cur); cur = []; ri++; }
    cur.push(e);
  }
  if (cur.length) lives.push(cur);
  console.log(`\n== ${s} (won=${won}, ${lives.length} lives) ==`);
  for (const life of lives) {
    const wonLife = life[life.length - 1].gemsCollected >= 3;
    const climb = life.filter((e) => e.gemsCollected === 2 && e.objective === "gem_c");
    if (climb.length < (wonLife ? 1 : 5)) continue;
    const mf0 = climb[0].movingFrames, mfN = climb[climb.length - 1].movingFrames;
    const by = {};
    let modeN = { ARGMAX: 0, SAMPLE: 0 }, revMax = 0;
    for (const e of climb) {
      const m = meta[d.log.indexOf(e)];
      if (m) { modeN[m.mode] = (modeN[m.mode] || 0) + 1; revMax = Math.max(revMax, m.revisits); }
      const k = e.onPlatform ? REACH.platformKeyUnder(13, e.cat.x, e.cat.y) : "airborne";
      if (!by[k]) by[k] = { n: 0, move: {} };
      by[k].n++;
      by[k].move[e.move] = (by[k].move[e.move] || 0) + 1;
    }
    const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 4);
    const last = life[life.length - 1];
    const end = last.gemsCollected >= 3 ? "COLLECTED" : last.movingFrames >= DEADLINE_C ? "MISSED-250" : `ended gc${last.gemsCollected} mf${last.movingFrames}`;    console.log(`  climb life: ${climb.length} decisions mf ${mf0}..${mfN} mode[${modeN.ARGMAX || 0}ARGMAX/${modeN.SAMPLE || 0}SAMPLE] revMax=${revMax} -> ${end}`);
    for (const [k, b] of rows) {
      const mv = Object.entries(b.move).sort((a, z) => z[1] - a[1]).map(([m, n]) => `${m}:${n}`).join(" ");
      console.log(`      ${String(b.n).padStart(3)} ${String(k).padEnd(20)} move[${mv}]`);
    }
  }
}
