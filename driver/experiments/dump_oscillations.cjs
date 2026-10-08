#!/usr/bin/env node
// Standing dump checks for the floor-objective clause, per the supervisor's orders.
//
// Usage: node driver/experiments/dump_oscillations.cjs <dump.jsonl> [label]
//
// Reports three things, all per dump:
//   1. Grounded repeat count. A grounded decision whose (x, y, objective) triple
//      has already been seen in the same run. This is the supervisor's
//      definition, and the one his L2 run 1 number of twelve was measured with.
//   2. The three-way firing split for the clause sentence "is on THIS floor":
//      grounded-gem / grounded-non-gem / airborne. Only the grounded half can
//      fire by construction, because the clause is gated on snap.onPlatform.
//   3. Any PORTAL firing, which is a stop-and-report condition, not a datum.
//
// Nothing here decides anything. It counts.

const fs = require("fs");

const CLAUSE = "is on THIS floor";
const path = process.argv[2];

if (!path) {
  console.error("usage: node dump_oscillations.cjs <dump.jsonl> [label]");
  process.exit(2);
}

const label = process.argv[3] || path.split("/").pop();

let rows;
try {
  rows = fs
    .readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        throw new Error(`line ${i + 1}: ${e.message}`);
      }
    });
} catch (e) {
  console.error(`  cannot read ${path}: ${e.message}`);
  process.exit(2);
}

const isGem = (o) => /^gem_/i.test(o);
const isPortal = (o) => /portal/i.test(o);

const seen = new Map();
const repeats = [];
let fired = { gem: 0, nonGem: 0, airborne: 0 };
const portalFirings = [];
const objectives = new Map();

rows.forEach((r, i) => {
  const dec = i + 1;
  const grounded = r.onPlatform === true;
  const objective = r.objective;

  objectives.set(objective, (objectives.get(objective) || 0) + 1);

  if (grounded) {
    const key = `${r.cat.x},${r.cat.y},${objective}`;
    const first = seen.get(key);
    if (first !== undefined) {
      repeats.push({ dec, x: r.cat.x, y: r.cat.y, objective, firstDec: first });
    } else {
      seen.set(key, dec);
    }
  }

  const firedClause = String(r.moveState || "").includes(CLAUSE);
  if (firedClause) {
    if (!grounded) fired.airborne += 1;
    else if (isGem(objective)) fired.gem += 1;
    else fired.nonGem += 1;
    if (isPortal(objective)) {
      portalFirings.push({ dec, x: r.cat.x, y: r.cat.y, objective });
    }
  }
});

const byObjective = [...repeats.reduce((m, r) => {
  const k = `${r.x},${r.y},${r.objective}`;
  m.set(k, (m.get(k) || 0) + 1);
  return m;
}, new Map())].sort((a, b) => b[1] - a[1]);

console.log(`\n  ${label}`);
console.log(`  ${"-".repeat(Math.max(label.length, 40))}`);
console.log(`  decisions           ${rows.length}`);
console.log(
  `  grounded repeats    ${repeats.length}   (${byObjective.length} distinct triples)`
);

if (byObjective.length) {
  console.log("    triple (x,y,objective)".padEnd(46) + "repeats");
  for (const [k, n] of byObjective) console.log("    " + k.padEnd(44) + n);
}

console.log(
  `  clause firings      gem ${fired.gem}   non-gem ${fired.nonGem}   airborne ${fired.airborne}`
);
console.log(
  `  objective mix       ${[...objectives.entries()]
    .map(([k, v]) => `${k} ${v}`)
    .join("  ")}`
);
if (portalFirings.length) {
  console.log(`\n  PORTAL FIRING: ${portalFirings.length} -- stop and report`);
  for (const p of portalFirings) {
    console.log(`    dec ${p.dec} (${p.x},${p.y}) ${p.objective}`);
  }
}
console.log();
