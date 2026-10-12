// Benchmark a model on the whole ladder: run run_full.cjs once per seed against
// one endpoint and write a compact, comparable result. The ladder itself is
// run_full.cjs, unchanged; this only launches it and reads its run file.
//
//   node benchmark.cjs <endpoint> [seed...]      (from driver/; npm run benchmark -- <endpoint> [seed...])
//
// <endpoint> is any run_full.cjs endpoint: `systemone` (SYSTEMONE_BASE_URL,
// SYSTEMONE_MODEL) or `chat` (CHAT_BASE_URL, CHAT_MODEL) for your own model.
// Seeds default to the standard set below. Output, under out/benchmark/<endpoint>-<time>/:
// s<seed>/ (the run file, the ladder log, screenshots, video) and benchmark.json.
// See docs/bring-your-own-model.md.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const CFG = require("./config.cjs");

const DEFAULT_SEEDS = ["6", "7", "9", "11"];

// One seed's result from a run_full.cjs run file.
function summarizeRun(run, seed, wallMs) {
  const levels = Object.values(run.levels || {}).sort((a, b) => a.level - b.level);
  const deathsPerLevel = {};
  for (const L of levels) deathsPerLevel[L.level] = L.deaths;
  return {
    seed: Number(seed),
    won: run.won === true,
    lastLevel: run.finalLevel,
    deathsPerLevel,
    totalDeaths: levels.reduce((a, L) => a + L.deaths, 0),
    steps: run.steps,
    classifierCalls: run.totalCalls,
    wallSeconds: Math.round(wallMs / 1000),
    stopped: run.stopped,
    model: run.model,
    endpoint: run.which,
    build: run.build,
  };
}

function seedLine(r) {
  const outcome = r.won ? "won" : `lost on L${r.lastLevel}`;
  return `seed ${r.seed}: ${outcome}, ${r.totalDeaths} deaths, ${r.steps} steps, ${r.classifierCalls} calls, ${r.wallSeconds}s`;
}

function summaryLine(results) {
  const r0 = results[0];
  const wins = results.filter((r) => r.won).length;
  const deaths = results.reduce((a, r) => a + r.totalDeaths, 0);
  const per = results.map((r) => `s${r.seed} ${r.won ? "won" : "L" + r.lastLevel}`).join(", ");
  return `${r0.model} (${r0.endpoint}, preset ${r0.build.PRESET}): won ${wins}/${results.length} seeds [${per}], ${deaths} deaths in total`;
}

function main(argv) {
  const [endpoint, ...seedArgs] = argv;
  if (!endpoint) {
    console.error("usage: node benchmark.cjs <endpoint> [seed...]   e.g. node benchmark.cjs systemone 9 11");
    process.exit(2);
  }
  const seeds = seedArgs.length ? seedArgs : DEFAULT_SEEDS;
  for (const s of seeds) if (!/^\d+$/.test(s)) throw new Error(`seed '${s}' is not a whole number`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = path.join(CFG.OUT_DIR, "benchmark", `${endpoint}-${stamp}`);
  const results = [];
  // Ctrl-C reaches run_full.cjs too, which stops gracefully and writes its run
  // file; stay alive to record that seed, then stop before the next one.
  let stopRequested = false;
  process.on("SIGINT", () => { stopRequested = true; });
  process.on("SIGTERM", () => { stopRequested = true; });
  for (const seed of seeds) {
    if (stopRequested) break;
    const dir = path.join(root, `s${seed}`);
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, "ladder.log");
    console.log(`seed ${seed}: running the ladder, log at ${log}`);
    const fd = fs.openSync(log, "w");
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [path.join(__dirname, "run_full.cjs"), endpoint], {
      cwd: __dirname,
      env: Object.assign({}, process.env, { SEED: seed, OUT_DIR: dir }),
      stdio: ["ignore", fd, fd],
    });
    fs.closeSync(fd);
    const wallMs = Date.now() - t0;
    const runFile = path.join(dir, `run_full_${endpoint}.json`);
    if (res.status !== 0 || !fs.existsSync(runFile)) {
      throw new Error(`seed ${seed}: run_full.cjs exited with status ${res.status} and ${fs.existsSync(runFile) ? "a" : "no"} run file. Read ${log}.`);
    }
    const r = summarizeRun(JSON.parse(fs.readFileSync(runFile, "utf8")), seed, wallMs);
    results.push(r);
    console.log(seedLine(r));
    // Rewritten after every seed, so an interrupted benchmark keeps the seeds it finished.
    fs.writeFileSync(path.join(root, "benchmark.json"), JSON.stringify({ summary: summaryLine(results), results }, null, 2));
  }
  console.log(summaryLine(results));
  console.log(`result: ${path.join(root, "benchmark.json")}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { summarizeRun, seedLine, summaryLine, DEFAULT_SEEDS };
