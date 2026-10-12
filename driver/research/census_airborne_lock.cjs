#!/usr/bin/env node
// Offline census for the airborne lock in decision.patched_airborne.cjs.
// WHAT, not WHETHER: the supervisor's revised order makes the six solid levels
// the gate, because the change alters which objective is HELD and a held
// objective is never re-asked, so no offline text diff can see it. What an
// offline pass CAN establish is where the change acts and what it would aim at.
//
// The affected set is exactly computable, with no model in the loop. With
// STICKY_OBJECTIVE unset the first disjunct of the held test
// (`STICKY && sameSituation`) is false, so the airborne disjunct is the ONLY one
// that can ever hold: with STICKY off, an airborne hold is the whole feature.
// And every decision overwrites memo.lockedObjective with its chosen objective,
// airborne ones included. So the lock present at an airborne decision is exactly
// the PREVIOUS decision's objective, and the affected records are exactly the
// airborne records whose previous decision chose a waypoint. That is the 170
// (25 on the six solid) the supervisor verified independently on L7.
//
// For each one: the waypoint that would now be held, the (x,y) that would be
// carried, and whether the cat can still reach that run from where it is in the
// air. The last column is the one that decides whether holding the lock is
// steering or just delaying the loss.

const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..", "..");
const DEC = require(path.join(REPO, "driver", "decision.patched_airborne.cjs"));
const REACH = require(path.join(REPO, "driver", "reachability.cjs"));
const CFG = require(path.join(REPO, "driver", "physics.cjs"));

const WP = /^(?:descent|ascent)_(?:left|right)$/;
const LEVELS = [0, 1, 2, 3, 5, 7, 8, 9, 11];
const SOLID = new Set([0, 1, 2, 5, 7, 8]);

// levelGems is the SPAWN table as [x,y] PAIRS (config.ts gemsPositionsPerLevel).
// Passing objects here silently yields objectives=[{}] and a one-option menu.
function levelGemsOf() {
  const src = fs.readFileSync(path.join(REPO, "cat-goric-game/src/scripts/constants/config.ts"), "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let dep = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") dep++;
    else if (seg[i] === "]") { dep--; if (!dep) break; }
  }
  return eval(seg.slice(st, i + 1));
}
const GEMS = levelGemsOf();

// The dump's own drones, so the moving-laser inset needs no assumption. The level
// is NOT a record field - the dumps carry calls, cat, onPlatform, drones,
// objective, moveState, moveQuestions, objectiveState - so it is passed in. A
// missing snap.level silently resolves runsOf(undefined) to no platforms and makes
// every waypoint unresolvable, which reads as a finding and is not one.
function snapOf(r, level) {
  return {
    level,
    gemsCollected: 0,
    gemPositions: GEMS[level],
    aliveGems: GEMS[level].length,
    moving: false,
    onPlatform: r.onPlatform,
    cat: { x: r.cat.x, y: r.cat.y, dx: 0, dy: r.cat.dy || 0, height: r.cat.h || 18 },
    drones: r.drones,
  };
}

let totalAffected = 0, solidAffected = 0, carriedNull = 0, reachable = 0, reachableJump = 0;
const perLevel = [];

console.log("WHAT WOULD NOW BE HELD, AND WHERE IT WOULD STEER");
console.log("solid levels are marked *\n");

for (const L of LEVELS) {
  const files = fs.readdirSync("/tmp")
    .filter((f) => f.startsWith(`prompt_dump_L${L}_`) && f.endsWith(".jsonl")).sort();
  if (!files.length) { console.log(`L${L}  (no dump)`); continue; }
  const recs = fs.readFileSync(path.join("/tmp", files[files.length - 1]), "utf8")
    .trim().split("\n").map(JSON.parse);

  const rows = [];
  for (let i = 1; i < recs.length; i++) {
    const air = recs[i], prev = recs[i - 1];
    if (air.onPlatform !== false) continue;
    const wpn = prev && prev.onPlatform === true ? prev.objective : null;
    if (!WP.test(wpn || "")) continue;
    totalAffected++; if (SOLID.has(L)) solidAffected++;

    // Resolve the waypoint from the PREVIOUS, GROUNDED state: that is the
    // resolution the lock was made against, and the one the memo carries.
    const ps = snapOf(prev, L);
    ps.gemPositions = GEMS[L];
    const pts = /^ascent_/.test(wpn) ? DEC.ascentPoints(ps, GEMS[L]) : DEC.descentPoints(ps, GEMS[L]);
    const p = pts.find((q) => q.name === wpn);
    if (!p) { rows.push({ i, air, wpn, target: null, ok: false, note: "no point on the ground" }); carriedNull++; continue; }

    const runs = REACH.runsOf(L);
    const tr = runs.find((r) => r.y === Math.round(p.y) && p.x >= r.left - 26 && p.x <= r.right + 26);
    const key = tr ? REACH.runKey(tr) : null;
    // Two tests, because the archive does not record the key the cat is holding.
    // okFall models a fall from the airborne position (jump=false); okJump models
    // the CONTINUATION of the jump that put the cat there. An ascent target needs
    // okJump, so reporting only okFall scores every ascent unreachable by
    // construction.
    const landFall = REACH.landingsFrom(L, runs, air.cat.x, air.cat.y, false, air.cat.h || 18);
    const landJump = REACH.landingsFrom(L, runs, air.cat.x, air.cat.y, true, air.cat.h || 18);
    const ok = key ? landFall.has(key) : false;
    const okJump = key ? landJump.has(key) : false;
    if (ok) reachable++;
    if (okJump) reachableJump++;
    rows.push({
      i, air, wpn, target: p, key, ok, okJump,
      note: key
        ? okJump ? "" : ok ? "needs the jump held, not a fall" : "target run NOT reachable from the air here"
        : "target off every run",
    });
  }

  const tag = SOLID.has(L) ? "*" : " ";
  const nOk = rows.filter((r) => r.ok).length;
  perLevel.push({ L, n: rows.length, ok: nOk, nJ: rows.filter((r) => r.okJump).length });
  console.log(`L${String(L).padStart(2)}${tag} affected ${String(rows.length).padStart(3)}   reachable if the jump is HELD ${rows.filter((r) => r.okJump).length}/${rows.length}   reachable on a fall only ${nOk}/${rows.length}`);
  for (const r of rows) {
    const t = r.target ? `(${r.target.x}, ${r.target.y})` : "NULL";
    console.log(`     dec ${String(r.i).padStart(3)}  air (${r.air.cat.x}, ${r.air.cat.y})  hold ${r.wpn.padEnd(13)} -> ${t.padEnd(16)} ${r.key || "-"}  ${r.okJump ? "REACHABLE" : r.ok ? "FALL-ONLY" : "UNREACHABLE"} ${r.note ? "[" + r.note + "]" : ""}`);
  }
}

console.log(`\naffected: ${totalAffected} across nine levels, ${solidAffected} on the six solid`);
console.log(`carried target null: ${carriedNull}\nreachable holding the jump: ${reachableJump}/${totalAffected}   reachable on a fall only: ${reachable}/${totalAffected}`);
console.log("\nP1 was 25 of 25 non-null on the six solid; the count above is the same prediction over all nine levels.");
console.log("A target marked UNREACHABLE is not a defect of the change: it is a state where");
console.log("holding the waypoint steers the cat toward a run it cannot land on, which is");
console.log("the abort pattern this change exists to remove, still present at that state.");
void CFG;
