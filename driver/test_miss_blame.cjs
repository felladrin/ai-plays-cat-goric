// MISS_BLAME: when a life ends with a gem still uncollected, the death history
// names the life's CLOSEST APPROACH to that gem: position, the move held at the
// decision that got closest, and the distance. Fixture: the real fb_s6 L6 life 0
// (26 logged decisions, death at step 15016 with gem_a uncollected). The life's
// closest logged approach to gem_a (135,143) is the airborne fork decision at
// 127.25,112.4 holding left, 32px - the decision that skipped the gem and, per
// the L6 census (28/30 lives), doomed every life. gem_b was collected first
// (coll 1), then gem_c (coll 2); gem_a stayed alive.
const assert = require("assert");
const fs = require("fs");
const MB = require("./fall_blame.cjs");
const LIFE = [
  {"x":59,"y":63,"m":"right","c":0},
  {"x":67.75,"y":75,"m":"right","c":0},
  {"x":78.25,"y":75,"m":"right","c":0},
  {"x":109.75,"y":110,"m":"right","c":0},
  {"x":120.25,"y":110,"m":"jump_right","c":0},
  {"x":127.25,"y":112.4,"m":"left","c":0},
  {"x":120.25,"y":110,"m":"jump_right","c":0},
  {"x":165.75,"y":79,"m":"right","c":0},
  {"x":176.25,"y":79,"m":"right","c":0},
  {"x":228.75,"y":220,"m":"jump_right","c":1},
  {"x":272.5,"y":176,"m":"left","c":1},
  {"x":265.5,"y":176,"m":"jump_left","c":1},
  {"x":258.5,"y":158,"m":"left","c":1},
  {"x":253.25,"y":143.6,"m":"left","c":1},
  {"x":248,"y":132.8,"m":"left","c":1},
  {"x":242.75,"y":125.6,"m":"left","c":1},
  {"x":237.5,"y":122,"m":"left","c":1},
  {"x":232.25,"y":122,"m":"left","c":1},
  {"x":227,"y":125.6,"m":"left","c":2},
  {"x":221.75,"y":132.8,"m":"left","c":2},
  {"x":216.5,"y":143.6,"m":"left","c":2},
  {"x":211.25,"y":158,"m":"left","c":2},
  {"x":206,"y":176,"m":"none","c":2},
  {"x":204.25,"y":197.6,"m":"right","c":2},
  {"x":213,"y":220,"m":"jump_right","c":2},
  {"x":256.75,"y":176,"m":"jump_right","c":2}
];const L6_GEMS = [[135, 143], [225, 181], [221, 108]];
const NAMES = ["gem_a", "gem_b", "gem_c"];
// collection order in life 0: gem_b then gem_c
const COLLECTED = { 1: "gem_b", 2: "gem_c" };
function liveAt(c) {
  const dead = Object.entries(COLLECTED).filter(([k]) => c >= Number(k)).map(([, n]) => n);
  return NAMES.map((n, i) => ({ name: n, x: L6_GEMS[i][0], y: L6_GEMS[i][1] })).filter((g) => !dead.includes(g.name));
}
function runFixture(flag) {
  if (flag) process.env.MISS_BLAME = "1"; else delete process.env.MISS_BLAME;
  const mb = MB.createMissBlame();
  for (const r of LIFE) mb.observeAll(r.x, r.y, r.m, liveAt(r.c));
  return mb.lines();
}
// 1. gate off: no lines
assert.deepStrictEqual(runFixture(false), [], "gate off must produce no lines");
// 2. gate on: the gem_a fork line
const lines = runFixture(true);
assert.strictEqual(lines.length, 1, "exactly one line for the one gem left alive");
assert.ok(/gem_a/.test(lines[0]), "line names gem_a: " + lines[0]);
assert.ok(/32px/.test(lines[0]), "line states the 32px distance: " + lines[0]);
assert.ok(/127\.25,112\.4/.test(lines[0]), "line states the fork position: " + lines[0]);
assert.ok(/holding left/.test(lines[0]), "line states the held move: " + lines[0]);
// 3. reset clears the record
const mb = MB.createMissBlame();
process.env.MISS_BLAME = "1";
for (const r of LIFE) mb.observeAll(r.x, r.y, r.m, liveAt(r.c));
mb.reset();
assert.deepStrictEqual(mb.lines(), [], "reset must clear");
// 4. runner parity: both runners wire the same code path
for (const f of ["run_level.cjs", "run_full.cjs"]) {
  const src = fs.readFileSync(f, "utf8");
  assert.ok(src.includes("createMissBlame"), f + " must create the tracker");
  assert.ok(src.includes("missBlame.observeAll("), f + " must observe every decision");
  assert.ok(src.includes("missBlame.lines("), f + " must append lines at death");
  assert.ok(src.includes("missBlame.reset()"), f + " must reset on respawn");
}
console.log("test_miss_blame: all assertions passed");
