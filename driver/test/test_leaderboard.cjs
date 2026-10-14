"use strict";
// The leaderboard columns, the version check a benchmark must pass to be listed,
// the ranking, and that the committed tables match docs/leaderboard/.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { score, offVersion, DEFAULT_SEEDS } = require("../benchmark.cjs");
const { rank, splice, START, END } = require("../leaderboard.cjs");
const { PRESETS } = require("../preset.cjs");

const seed = (s, won, lastLevel, totalDeaths) => ({ seed: s, won, lastLevel, totalDeaths, build: Object.assign({ SEED: String(s), PRESET: "winning", ATTRIB: "1" }, PRESETS.winning) });
const five = [seed(1, true, 14, 60), seed(2, true, 14, 30), seed(3, false, 12, 150), seed(4, false, 2, 100), seed(5, true, 14, 40)];

assert.deepStrictEqual(score(five), { seeds: 5, wins: 3, pass1: 0.6, pass5: true, levelsCleared: 11.2, medianDeaths: 40 });
assert.strictEqual(score([five[0], five[1], five[2]]).medianDeaths, 45, "even count: mean of the middle two");
assert.deepStrictEqual(score([five[2], five[3]]), { seeds: 2, wins: 0, pass1: 0, pass5: false, levelsCleared: 7, medianDeaths: null });

assert.deepStrictEqual(DEFAULT_SEEDS, ["1", "2", "3", "4", "5"]);
const seeds = DEFAULT_SEEDS.slice();
assert.deepStrictEqual(offVersion(five, seeds, {}, []), [], "the default preset on seeds 1-5 counts");
assert.deepStrictEqual(offVersion(five, seeds, { MAX_DEATHS_PER_LEVEL: "100" }, []), [], "the default cap, set explicitly, counts");
assert.deepStrictEqual(offVersion(five, ["6", "7"], {}, []), ["seeds 6 7, not 1 2 3 4 5"]);
assert.deepStrictEqual(offVersion(five, seeds, { MAX_DEATHS_PER_LEVEL: "200" }, []), ["MAX_DEATHS_PER_LEVEL=200"]);
assert.deepStrictEqual(offVersion(five, seeds, {}, ["decision.cjs"]), ["uncommitted driver changes: decision.cjs"]);
const extra = five.map((r) => Object.assign({}, r, { build: Object.assign({}, r.build, { CONF_ARGMAX: "2" }) }));
assert.strictEqual(offVersion(extra, seeds, {}, []).length, 5, "a flag outside the preset");
const off = five.map((r) => Object.assign({}, r, { build: Object.assign({}, r.build, { HOLD_LIVE: "0" }) }));
assert.ok(offVersion(off, seeds, {}, []).includes("seed 1: HOLD_LIVE=0"), "a preset flag turned off");
const none = five.map((r) => Object.assign({}, r, { build: { SEED: String(r.seed), PRESET: "none", ATTRIB: "1" } }));
assert.ok(offVersion(none, seeds, {}, []).includes("seed 1: PRESET=none"), "the bare baseline");

const entry = (model, results) => ({ model, results, score: score(results) });
const order = rank([
  entry("c", [five[2], five[3]]),
  entry("a", five),
  entry("b", [five[0], five[1], five[2], five[3], seed(5, true, 14, 400)]),
  entry("d", [five[3], five[3]]),
]).map((e) => e.model);
assert.deepStrictEqual(order, ["a", "b", "c", "d"], "more wins, then more levels, then fewer deaths");

assert.strictEqual(splice(`x\n${START}\nold\n${END}\ny`, "new", "f"), `x\n${START}\nnew\n${END}\ny`);
assert.throws(() => splice("no markers", "t", "f.md"), /f.md: the leaderboard markers are missing/);

// The ladder's L0 gate (stop when L0 costs a life) guards prompt work on the reference
// model; in a benchmark an L0 death is a result. The benchmark turns it off, and the
// gate honours that.
const src = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
assert.ok(/env: Object\.assign\(\{\}, process\.env, \{[^}]*REGRESSION_GATE: "0"/.test(src("benchmark.cjs")), "benchmark.cjs runs the ladder with REGRESSION_GATE=0");
assert.ok(/if \(process\.env\.REGRESSION_GATE !== "0" && lastLevel === 0/.test(src("run_full.cjs")), "run_full.cjs skips the L0 gate when REGRESSION_GATE=0");

const check = spawnSync(process.execPath, [path.join(__dirname, "..", "leaderboard.cjs"), "--check"], { encoding: "utf8" });
assert.strictEqual(check.status, 0, `the committed leaderboard is stale or invalid: ${check.stderr}`);

console.log("test_leaderboard: score, version check, ranking and committed tables checked. Failed: 0");
