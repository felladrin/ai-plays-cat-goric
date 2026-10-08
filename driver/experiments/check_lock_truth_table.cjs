// Truth table for the `held` expression in decision.cjs's lock.
//
// WHY THIS EXISTS: the expression has produced three defects in one session that
// were all invisible on inspection. The last one was an operator-precedence
// mistake - `&&` binds tighter than `||`, so a disjunction that lost its outer
// pair escaped the &&-chain and the menu-membership test stood alone. ANY
// objective on the menu was then held on EVERY decision, which showed up as a
// 228-decision single-objective oscillation on L2.
//
// This script reads the expression OUT OF THE MODULE SOURCE and evaluates it, so
// it cannot drift from the file the way a hand-copied duplicate would. It is the
// answer to "a test that runs in a second beats a level run that takes six
// minutes to tell you the same thing".
//
// Usage: node driver/experiments/check_lock_truth_table.cjs [path-to-decision-module]

const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || path.join(__dirname, "..", "decision.patched_lockonly.cjs");
const src = fs.readFileSync(FILE, "utf8");

// Pull the `const held = <expr> ? memo.lockedObjective : null;` statement out of
// the source verbatim, comments included, and compile it as a function.
function ternaryFrom(text) {
  const start = text.indexOf("const held =");
  if (start < 0) throw new Error(`no "const held =" in ${FILE}`);
  const end = text.indexOf(": null;", start);
  if (end < 0) throw new Error(`no ": null;" after "const held =" in ${FILE}`);
  return text.slice(start + "const held =".length, end + ": null;".length).replace(/;\s*$/, "");
}
const statement = ternaryFrom(src);
// The whole statement is `COND ? memo.lockedObjective : null;`. Take it verbatim
// and turn it into a return, so the ternary is evaluated as written. Slicing
// only up to the ternary's `?` and re-wrapping it is how this script shipped a
// syntax error on its first run.
const expr = statement.slice(0, statement.lastIndexOf("?")).trim();
const ternary = statement;

const held = new Function(
  "memo",
  "snap",
  "objCall",
  "STICKY",
  "sameSituation",
  "lockedWaypoint",
  "WAYPOINT_COMMIT_CAP",
  `return (${ternary});`
);

const CAP = 30;
const WAYPOINT = /^(?:descent|ascent)_(?:left|right)$/;

// A cat on a floor, and a cat in the air. `onPlatform` is the only thing that
// distinguishes them for this expression.
const grounded = { onPlatform: true, cat: { x: 100, y: 210 } };
const airborne = { onPlatform: false, cat: { x: 100, y: 180, dy: -4 } };

const cases = [
  {
    row: "grounded, gem on menu, STICKY false",
    expect: null,
    why: "HEAD holds nothing grounded when STICKY is off, so the menu-membership\n" +
         "         conjunct must not be reachable on its own. This is the row the\n" +
         "         precedence bug broke: it returned gem_a instead of null.",
    args: {
      memo: { lockedObjective: "gem_a", lockHeldFor: 0, lockMenuKey: "gem_a" },
      snap: grounded,
      objCall: { objectiveNames: ["gem_a", "gem_c"] },
      STICKY: false,
      sameSituation: false,
    },
  },
  {
    row: "airborne, waypoint, off menu",
    expect: "ascent_left",
    why: "The fix itself. hop_points.cjs returns [] in the air, so a locked\n" +
         "         waypoint is always off the airborne menu and would be starved\n" +
         "         without the left disjunct.",
    args: {
      memo: { lockedObjective: "ascent_left", lockHeldFor: 0 },
      snap: airborne,
      objCall: { objectiveNames: [] },
      STICKY: false,
      sameSituation: false,
    },
  },
  {
    row: "airborne, gem collected, off menu",
    expect: null,
    why: "A gem leaves the menu the moment it is collected. Holding it makes\n" +
         "         buildMoveCall unable to resolve the target and throws\n" +
         "         'unknown objective'. This row is the L2 abort at step 510.",
    args: {
      memo: { lockedObjective: "gem_b", lockHeldFor: 3 },
      snap: airborne,
      objCall: { objectiveNames: ["gem_a", "gem_c"] },
      STICKY: false,
      sameSituation: false,
    },
  },
  {
    row: "airborne, gem alive, on menu",
    expect: "gem_b",
    why: "Unchanged from HEAD: an airborne gem that is still collectible holds.",
    args: {
      memo: { lockedObjective: "gem_b", lockHeldFor: 3 },
      snap: airborne,
      objCall: { objectiveNames: ["gem_a", "gem_b", "gem_c"] },
      STICKY: false,
      sameSituation: false,
    },
  },
  // Two further rows, not in the four the supervisor named. Both are behaviour
  // the arm now depends on, so both are pinned here.
  {
    row: "grounded, waypoint on menu, STICKY false",
    expect: null,
    why: "Same as row 1 for a waypoint: no grounded hold without STICKY.",
    args: {
      memo: { lockedObjective: "ascent_left", lockHeldFor: 0 },
      snap: grounded,
      objCall: { objectiveNames: ["ascent_left", "gem_c"] },
      STICKY: false,
      sameSituation: false,
    },
  },
  {
    row: "airborne, waypoint, off menu, at the commit cap",
    expect: null,
    why: "WAYPOINT_COMMIT_CAP reaches the airborne disjunct for waypoints only,\n" +
         "         so one flight cannot extend a lock past 30 decisions.",
    args: {
      memo: { lockedObjective: "ascent_left", lockHeldFor: CAP },
      snap: airborne,
      objCall: { objectiveNames: [] },
      STICKY: false,
      sameSituation: false,
    },
  },
];

let failed = 0;
console.log(`truth table for the held expression in ${path.relative(process.cwd(), FILE)}\n`);
for (const c of cases) {
  const lockedWaypoint = WAYPOINT.test(c.args.memo.lockedObjective);
  const got = held(
    c.args.memo,
    c.args.snap,
    c.args.objCall,
    c.args.STY,
    c.args.sameSituation,
    lockedWaypoint,
    CAP
  );
  const pass = got === c.expect;
  if (!pass) failed++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${c.row}`);
  console.log(`        expect ${JSON.stringify(c.expect)}  got ${JSON.stringify(got)}`);
  console.log(`        ${c.why}\n`);
}

// A mutation test, which is the only thing that can answer "can this recur
// silently". Take the source, drop the outer pair from the air/menu disjunction
// - reproducing the precedence bug exactly - and assert the table above now
// FAILS. If the mutation still passed, this check would be blind to the defect
// it exists to catch, and would have to be rewritten rather than trusted.
const MUTATION = [
  "((!snap.onPlatform && lockedWaypoint) || objCall.objectiveNames.includes(memo.lockedObjective))",
  "(!snap.onPlatform && lockedWaypoint) || objCall.objectiveNames.includes(memo.lockedObjective)",
];
const idx = src.indexOf(MUTATION[0]);
if (idx < 0) {
  console.log(`  FAIL  could not find the air/menu disjunction to mutate:\n        ${MUTATION[0]}`);
  failed++;
} else {
  const mutated = src.slice(0, idx) + MUTATION[1] + src.slice(idx + MUTATION[0].length);
  const c0 = cases[0];
  const m = new Function(
    "memo",
    "snap",
    "objCall",
    "STICKY",
    "sameSituation",
    "lockedWaypoint",
    "WAYPOINT_COMMIT_CAP",
    `return (${ternaryFrom(mutated)});`
  );
  const got = m(
    c0.args.memo,
    c0.args.snap,
    c0.args.objCall,
    c0.args.STY,
    c0.args.sameSituation,
    WAYPOINT.test(c0.args.memo.lockedObjective),
    CAP
  );
  const caught = got !== c0.expect;
  if (!caught) failed++;
  console.log(
    `  ${caught ? "PASS" : "FAIL"}  mutation: with the outer pair removed, the table` +
      `\n        ${caught ? "catches it" : "does NOT catch it — this check is blind to the defect"}` +
      `\n        row 1 then returns ${JSON.stringify(got)} instead of ${JSON.stringify(c0.expect)}`
  );
}

console.log(failed === 0 ? "\nall rows pass" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
