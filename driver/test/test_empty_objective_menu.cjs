"use strict";
// Guard for the empty objective menu (Darwin-27B-ZTC L6, both seeds, step 274):
// the ROUTE_FIRST deferral must never remove a goal such that the objective menu
// ends up EMPTY. The recorded failure: cat airborne at (302.25,132.8) dy=2.8
// falling past floor (289..341@136), mf=273, gem_a (135,143) the only live gem.
// The ceiling-restricted firstHop made the BFS fail on gem_a's holder while
// canReach said reachable, so gem_a was deferred and the objective question went
// out with zero criteria; the adapter rejected it with 422.
//
// The precise rule (see decision.cjs routeBlocked): defer only when the failure
// is caused by the blocked set (another live goal's platform), proven by a second
// BFS pass with an empty blocked set. The ceiling-restricted firstHop failing the
// BFS is NOT a deferral cause.
//
// The failing state is a fixture (fixtures/empty_objective_menu_l6.json), the
// verbatim live snap + levelGems + deathHistory dumped by the replay endpoint
// (run_level.cjs "replay") when the guard fires. It was captured against the OLD
// rule; this test asserts buildObjectiveCall keeps the menu non-empty there.
//
// Run with: node test_empty_objective_menu.cjs
process.env.ROUTE_FIRST = "1";
delete process.env.ROUTE_FIRST_LEGACY;
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

let failures = 0;
const fail = (m) => { failures++; console.log("FAIL:", m); };

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "empty_objective_menu_l6.json"), "utf8"));
const { snap, levelGems, deathHistory } = fix;

// 1) The recorded failing state: the menu must be non-empty. On the OLD rule this
// is EMPTY ([]), so this assertion is the red/green gate on the fix.
{
  const call = dec.buildObjectiveCall(snap, levelGems, deathHistory);
  if (call.objectiveNames.length === 0) {
    fail(`recorded L6 state (empty_objective_menu_l6.json): the objective menu is ` +
      `EMPTY. The sole live gem (gem_a) was deferred by the ceiling-restricted ` +
      `firstHop; the objective question would go out with zero criteria (the 422).`);
  }
  console.log(`  recorded state menu: [${call.objectiveNames.join(",")}]`);
}

// 2) The guard in decide(): an empty menu must throw with the snapshot, not send
// a zero-criteria question. Pin the guard text so a regression that re-introduces
// a silent empty send fails the suite.
{
  const src = fs.readFileSync(path.join(__dirname, "..", "decision.cjs"), "utf8");
  if (!/empty objective menu: no gem, descent or ascent point was offered/.test(src)) {
    fail("decide() guard for an empty objective menu is missing: a zero-criteria " +
      "question would go out instead of throwing with the snapshot");
  }
}

if (failures) {
  console.log(`test_empty_objective_menu: ${failures} failure(s)`);
  process.exit(1);
}
console.log("test_empty_objective_menu: ok");
