"use strict";
// Guard for the pruned winning move (PurpleMIST-Flash-1.0 L13, s4 steps 2144 and
// 2162): the cat is airborne at (197.75,140) dy=1.6 with all 3 gems, 1.75px from
// the portal box [164,196]x[134,166]. Holding left crosses the portal at f6 - a
// WIN - but survival.isFatal only asked "can any trajectory land on a platform",
// and at mf=313 the bottom bound (~246.6) burns every floor below before the cat
// reaches it. So PRUNE_FATAL deleted left and none from the menu and the model,
// shown a single option (moveProbs {"right":1}), "chose" right. Twice.
//
// The rule: with gemsCollected >= 3, an action is NOT fatal if any simulated
// frame before death puts the cat's box (getCatCollisionObject: [x,x+1]x[y-h,y])
// in overlap with the portal box (getPortalCollisionObject: 32x32 centred on
// 180,150). Touching the portal ends the level as a win; a winning trajectory is
// not certain death.
//
// The failing state is a fixture (fixtures/portal_pruned_l13.json), the verbatim
// archived decision entry. Run with: node test_portal_prune_l13.cjs
const fs = require("fs");
const path = require("path");
const { isFatal, pruneFatal } = require("./survival.cjs");

let failures = 0;
const fail = (m) => { failures++; console.log("FAIL:", m); };

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "portal_pruned_l13.json"), "utf8"));
const e = fix.entry;
const mf = e.movingFrames;
const snap = {
  level: 13, onPlatform: false, gemsCollected: e.gemsCollected,
  cat: { x: e.cat.x, y: e.cat.y, dy: e.cat.dy, height: e.cat.h },
  drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } },
};

// 1) The recorded failing state: holding left crosses the portal box at f6
// (measured, trace_l13_portal.cjs). It must NOT be fatal. RED on the old rule.
if (isFatal(snap, "left") !== false) fail('recorded L13 state: isFatal(left) is true - the portal-reaching hold was pruned (the bug)');

// 2) 'none' cannot land either, but free steering after the committed frames
// expands the reachable x into the portal box while y is inside it. Not fatal.
if (isFatal(snap, "none") !== false) fail("recorded L13 state: isFatal(none) is true - free steering reaches the portal, so it is not certain death");

// 3) Sanity, green before and after: right re-grounds on [232,136] via the side-snap.
if (isFatal(snap, "right") !== false) fail("recorded L13 state: isFatal(right) should be false (it lands back on the floor)");

// 4) Control: with only 2 gems the portal is not live; falling past every platform
// IS certain death again. The exemption must be gated on gemsCollected >= 3.
{
  const snap2 = { ...snap, gemsCollected: 2 };
  if (isFatal(snap2, "left") !== true) fail("control gc=2: isFatal(left) must stay true - the portal is not collidable below 3 gems");
}

// 5) The menu the runner would have shown: left must survive the prune.
{
  const menu = { left: "steer left", right: "steer right", none: "no sideways movement" };
  const kept = Object.keys(pruneFatal(snap, menu));
  if (!kept.includes("left")) fail(`pruneFatal dropped the portal-reaching hold; kept [${kept}]`);
}

console.log(failures ? `\n${failures} FAILURES` : "all portal-prune assertions passed");
process.exit(failures ? 1 : 0);
