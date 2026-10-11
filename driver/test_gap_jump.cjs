// GAP_JUMP: a same-height graph neighbour gets its crossing landing named, but
// only when the crossing is ON THE ROUTE to the current gem objective (the
// landing floor is strictly closer to that gem's collector floors on the
// directed graph). Live evidence for the route gate: at L10 step 25 the line at
// (319.5,240) with obj gem_c flipped the climb argmax jump 0.379 -> jump_left
// 0.395 toward a crossing that is off gem_c's route, and the run's whole laser
// phase at the fatal @150 fork cascaded from that flip (docs/results.md).
// The two states below are those real archived states.
const assert = require("assert");
// decision.cjs snapshots JUMP_FACTS at module load; GAP_JUMP is read per call.
process.env.JUMP_FACTS = "1";
for (const k of ["PRUNE_FATAL", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
const CUR = require("./decision.cjs");
const GEMS = require("./experiments/gem_table.cjs")();

function mk(level, levelGems) {
  return {
    level, gemsCollected: 0, aliveGems: levelGems.length,
    gemPositions: levelGems.map((p) => ({ x: p[0], y: p[1] })),
    moving: false, onPlatform: true,
    cat: { x: 0, y: 0, dx: 0, dy: 0, height: 18 },
    drones: { tl: { x: 0, y: 1 }, tr: { x: 359, y: 0 }, bl: { x: 1, y: 310 }, br: { x: 360, y: 310 } },
  };
}
function line(level, x, y, obj) {
  const snap = mk(level, GEMS[level]);
  snap.cat.x = x; snap.cat.y = y;
  const prev = process.env.GAP_JUMP;
  process.env.GAP_JUMP = "1";
  const state = CUR.buildMoveCall(snap, GEMS[level], obj, []).state;
  if (prev === undefined) delete process.env.GAP_JUMP; else process.env.GAP_JUMP = prev;
  const m = state.match(/ From this floor,[^]*?at y [\d.]+\./g);
  return m ? m.join(" | ") : null;
}

// 1. L4 gap edge, obj gem_a: the crossing to x199..251@93 IS gem_a's route
// (the live 3/3 clear: jump_right argmax p=0.809-0.811 at this state).
const l4 = line(4, 140.25, 93, "gem_a");
assert.ok(l4 && l4.includes("a jump to the RIGHT crosses to platform x 199..251 at y 93"), "L4 gap edge must name the on-route crossing: " + l4);

// 2. L10 step 25 state, obj gem_c: the left crossing is off gem_c's route
// (both @240 floors are the same graph distance from gem_c's collectors), so
// the tightened gate must be silent here.
assert.strictEqual(line(10, 319.5, 240, "gem_c"), null, "L10 @240 off-route crossing must be suppressed");
assert.strictEqual(line(10, 220, 240, "gem_c"), null, "L10 left @240 off-route crossing must be suppressed");

// 3. Non-gem objectives get no crossing line (no route to measure).
assert.strictEqual(line(10, 319.5, 240, "portal"), null, "portal objective must not get a crossing line");

// 4. Gate off: the sentence never appears.
const prev = process.env.GAP_JUMP;
delete process.env.GAP_JUMP;
const snap = mk(4, GEMS[4]);
snap.cat.x = 140.25; snap.cat.y = 93;
const off = CUR.buildMoveCall(snap, GEMS[4], "gem_a", []).state;
assert.ok(!off.includes("From this floor"), "gate off must name no crossing");
if (prev !== undefined) process.env.GAP_JUMP = prev;

console.log("test_gap_jump: all assertions passed");
