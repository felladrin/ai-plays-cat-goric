// Assert-based check: every CFG.<field> read in decision.cjs must resolve to a
// real export. decision.cjs binds CFG to config.cjs at module level, and many
// functions shadow it locally with `const CFG = require("./physics.cjs")`. A
// physics field read OUTSIDE a shadowing function is undefined -- NaN in
// arithmetic -- which is how the laser clock in floorBelow was NaN: the game's
// own physics silently vanished from arc.simulate's laser bounds. The shadowing
// idiom makes the mistake easy to repeat, so the guard is mechanical.
//
// The scan: for each CFG.<field> occurrence, find the enclosing top-level
// function. If that function contains `const CFG = require("./physics.cjs")`
// before the occurrence, CFG is physics.cjs there and the field must exist in
// physics.cjs; otherwise CFG is config.cjs and the field must exist in
// config.cjs. Both directions are checked: a config field read inside a
// shadowing function is the same bug mirrored.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CFG_CONFIG = require("./config.cjs");
const CFG_PHYSICS = require("./physics.cjs");

let src = fs.readFileSync(path.join(__dirname, "decision.cjs"), "utf8");
// Comments cannot execute. No string in this file contains "//" (checked when
// this test was written; the strip below would otherwise need a real lexer).
src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// Top-level function starts: `function name(` at column 0. Every CFG. read in
// this file is either at module top level or inside one of these.
const fnStarts = [];
for (const m of src.matchAll(/^function /gm)) fnStarts.push(m.index);

const SHADOW = /const CFG = require\("\.\/physics\.cjs"\)/;
const violations = [];
for (const m of src.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
  const field = m[1];
  const inConfig = field in CFG_CONFIG;
  const inPhysics = field in CFG_PHYSICS;
  if (inConfig && inPhysics) continue; // resolves either way
  // Enclosing top-level function: the last `function` start before the read.
  let start = -1;
  for (const s of fnStarts) {
    if (s < m.index) start = s;
    else break;
  }
  const body = start === -1 ? src.slice(0, m.index) : src.slice(start, m.index);
  const shadowed = SHADOW.test(body);
  if (shadowed && !inPhysics) {
    violations.push(`CFG.${field} at a shadowed site (physics.cjs has no "${field}")`);
  } else if (!shadowed && !inConfig) {
    violations.push(`CFG.${field} at an unshadowed site (config.cjs has no "${field}")`);
  }
}

assert.deepStrictEqual(violations, [],
  `decision.cjs reads CFG fields that resolve to undefined:\n  ${violations.join("\n  ")}`);

// The regression this guard was written for: floorBelow must shadow CFG before
// deriving the laser clock, or mf is NaN and simulate() never sees a laser.
const floor = src.slice(src.indexOf("function floorBelow"), src.indexOf("function fallFloorNote"));
assert(SHADOW.test(floor.slice(0, floor.indexOf("CFG.droneSpeed"))),
  "floorBelow must read droneSpeed off physics.cjs (local CFG shadow)");

console.log("OK: every CFG.<field> in decision.cjs resolves to a real export");
