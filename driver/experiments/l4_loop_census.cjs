// Flash L4 loop census: on floor(199..251@93) with objective gem_c (which is
// LEFT and below), Flash walks RIGHT ~60-90 decisions per run: descend right ->
// floor(263..315@171) -> jump_left -> apex snap back to (225,93). Why right?
// Rebuild the REAL prompts (buildObjectiveCall + buildMoveCall) at those exact
// archived states and inspect what the state text recommends.
//   node experiments/l4_loop_census.cjs [--dump N]
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const REACH = require("../reachability.cjs");
const { simulate } = require("../arc.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const LEVEL = 4;
const LEVEL_GEMS = [[289, 156], [105, 164], [182, 226]]; // gem_a,b,c spawns
const ARCHIVES = ["s1", "s2", "s3", "s4"].map((s) =>
  path.join(ROOT, `out/byom/PurpleMIST-Flash-1.0/${s}/run_level_4_systemone.json`));

function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}
function snapFrom(e) {
  return {
    level: LEVEL, gemsCollected: e.gemsCollected, aliveGems: (e.gemPositions || []).length,
    gemPositions: e.gemPositions || [], onPlatform: e.onPlatform, moving: true,
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: dronesAt(e.movingFrames || 0),
  };
}

const DUMP = process.argv[2] === "--dump" ? +process.argv[3] : 0;
const LOOP_FLOOR = process.env.LOOP_FLOOR || "floor(199..251@93)";
let dumped = 0;
const tally = { n: 0, descLeftOffered: 0, descRightOffered: 0, stateMentionsLeftDesc: 0, stateMentionsRightDesc: 0, moveRight: 0, moveLeft: 0, other: 0 };

for (const arch of ARCHIVES) {
  if (!fs.existsSync(arch)) continue;
  const d = JSON.parse(fs.readFileSync(arch, "utf8"));
  for (const e of d.log) {
    if (!e.onPlatform) continue;
    if (REACH.platformKeyUnder(LEVEL, e.cat.x, e.cat.y) !== LOOP_FLOOR) continue;
    if (e.objective !== "gem_c") continue;
    const snap = snapFrom(e);
    const dps = dec.descentPoints(snap, LEVEL_GEMS);
    const names = dps.map((p) => p.name);
    const mc = dec.buildMoveCall(snap, LEVEL_GEMS, "gem_c", []);
    const state = mc.state || "";
    tally.n++;
    if (names.includes("descent_left")) tally.descLeftOffered++;
    if (names.includes("descent_right")) tally.descRightOffered++;
    if (/left descent|descent_left/.test(state)) tally.stateMentionsLeftDesc++;
    if (/right descent|descent_right/.test(state)) tally.stateMentionsRightDesc++;
    if (e.move === "right") tally.moveRight++;
    else if (e.move === "left") tally.moveLeft++;
    else tally.other++;
    if (dumped < DUMP) {
      console.log(`\n===== ${path.basename(path.dirname(arch))} step ${e.step} cat (${e.cat.x},${e.cat.y}) mf ${e.movingFrames} move=${e.move} =====`);
      console.log(`descentPoints offered: ${names.join(", ") || "(none)"}`);
      const oc = dec.buildObjectiveCall(snap, LEVEL_GEMS, []);
      for (const [nm, crit] of Object.entries(oc.questions.objective.criteria)) console.log(`  obj ${nm}: ${crit}`);
      console.log(`MOVE STATE:\n${state}`);
      dumped++;
    }
  }
}
console.log(`\nfloor(199..251@93) + obj gem_c across Flash L4 s1-s4: ${JSON.stringify(tally)}`);
// what the left step-off actually does at those clocks (held left = drifts past gem_c's floor):
for (const mf of [100, 200]) {
  const held = simulate(LEVEL, 199, 93, 0, 18, "left", mf, { grounded: true });
  const none = simulate(LEVEL, 199, 93, 0, 18, "none", mf, { grounded: true });
  console.log(`step-off x=199 mf=${mf}: held-left -> ${held.outcome} @(${held.x && held.x.toFixed(0)},${held.y && held.y.toFixed(0)})  none -> ${none.outcome} @(${none.x && none.x.toFixed(0)},${none.y && none.y.toFixed(0)})`);
}
