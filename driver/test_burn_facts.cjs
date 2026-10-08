// BURN_FACTS: the chosen gem's remaining lifetime in moving frames, stated in
// the move call for the ALREADY-CHOSEN objective only. Gated by BURN_FACTS=1.
// Level 12 gem deadlines: gem_a=400, gem_b=210, gem_c=295 (route_clock.gemDeadline).
const assert = require("assert");
const d = require("./decision.cjs");

const L12_GEMS = [[279, 169], [43, 129], [160, 60]];
// mf -> drones.tl.y: y = 1 + 0.2*mf
const snapAt = (mf) => ({
  level: 12,
  cat: { x: 240, y: 169, dy: 0, height: 18 },
  onPlatform: true,
  drones: { tl: { x: 1, y: 1 + 0.2 * mf }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
  gemsCollected: 1,
  aliveGems: 1,
  gemPositions: [{ x: 279, y: 169 }],
});
const burnLines = (call) => call.state.split("\n").filter((l) => l.includes("destroyed by the closing laser"));

const saved = process.env.BURN_FACTS;
try {
  // Gate off by default: the line must not appear at all.
  delete process.env.BURN_FACTS;
  assert.strictEqual(burnLines(d.buildMoveCall(snapAt(300), L12_GEMS, "gem_a", [])).length, 0, "gate off: no burn line");

  process.env.BURN_FACTS = "1";
  // burn = 400 - 300 = 100 <= 120: fires with the exact figure.
  let lines = burnLines(d.buildMoveCall(snapAt(300), L12_GEMS, "gem_a", []));
  assert.strictEqual(lines.length, 1, "burn 100: one line");
  assert.ok(lines[0].includes("gem_a") && lines[0].includes("100 moving frames"), "exact figure: " + lines[0]);

  // burn = 400 - 200 = 200 > 120: suppressed.
  assert.strictEqual(burnLines(d.buildMoveCall(snapAt(200), L12_GEMS, "gem_a", [])).length, 0, "burn 200: suppressed");

  // burn = 400 - 410 = -10: the gem is already gone; the unwinnable bookkeeping
  // owns that case, the line must not fire.
  assert.strictEqual(burnLines(d.buildMoveCall(snapAt(410), L12_GEMS, "gem_a", [])).length, 0, "burn <= 0: suppressed");

  // Waypoint objectives have no burn clock. L6 floor(211..263@220) offers
  // ascent_right@(255,176) at mf 168 (verified against ascentPoints).
  const L6_GEMS = [[135, 143], [225, 181], [221, 108]];
  const l6 = {
    level: 6,
    cat: { x: 215, y: 220, dy: 0, height: 18 },
    onPlatform: true,
    drones: { tl: { x: 1, y: 1 + 0.2 * 168 }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
    gemsCollected: 2,
    aliveGems: 1,
    gemPositions: [{ x: 135, y: 143 }],
  };
  const wp = d.buildMoveCall(l6, L6_GEMS, "ascent_right", []);
  assert.ok(wp.state.includes("ascent_right"), "waypoint call built");
  assert.strictEqual(burnLines(wp).length, 0, "waypoint: no burn line");
} finally {
  if (saved === undefined) delete process.env.BURN_FACTS;
  else process.env.BURN_FACTS = saved;
}
console.log("test_burn_facts: ok");
