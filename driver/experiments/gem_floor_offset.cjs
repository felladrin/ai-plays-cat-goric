// Why the "on THIS floor" clause in decision.cjs is bounded by 26 and not by a
// chosen constant, and how many platform/gem pairs each bound accepts.
//
// It exists because a comment in decision.cjs cites four source files for the
// geometry. A comment whose numbers cannot be re-derived on demand loses the
// authority of its own citations, so the numbers are computed here instead.
//
//   node driver/experiments/gem_floor_offset.cjs
//
// Every constant is read from the game, none is chosen here:
//   platform half-width 26  <- physics.cjs platformWidth 52 / 2
//   cat height 18           <- the 72x72 catSheet at frameHeight 18
//   gem half-height 8       <- getGemAnimations.ts:9-10 frameHeight 16 / 2
const fs = require("fs");
const path = require("path");

const { platforms } = require("../level_data.cjs");
const PHYSICS = require("../physics.cjs");

const PLATFORM_HALF_WIDTH = PHYSICS.platformWidth / 2;
const CAT_HEIGHT = 18;
const GEM_HALF_HEIGHT = 8;

// gemsPositionsPerLevel is TypeScript, so the array literal is extracted by
// bracket matching rather than by a regex that would truncate on the first "]".
function gemsFromConfig() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "scripts", "constants", "config.ts"),
    "utf8",
  );
  const at = src.indexOf("gemsPositionsPerLevel");
  if (at < 0) throw new Error("gemsPositionsPerLevel not found in config.ts");
  const start = src.indexOf("[", src.indexOf("=", at));
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "[") depth++;
    else if (src[k] === "]") {
      depth--;
      if (!depth) return JSON.parse(src.slice(start, k + 1).replace(/\s+/g, " ").replace(/,\s*]/g, "]"));
    }
  }
  throw new Error("gemsPositionsPerLevel: unbalanced brackets");
}

const gems = gemsFromConfig();
const rows = [];
for (let li = 0; li < gems.length; li++) {
  for (const p of platforms(li) || []) {
    for (const g of gems[li]) {
      if (Math.abs(g[0] - p[0]) > PLATFORM_HALF_WIDTH) continue;
      const d = p[1] - g[1]; // floorY - gemY; negative means the gem is BELOW
      const leg1 = d <= CAT_HEIGHT + GEM_HALF_HEIGHT; // gem's bottom reaches cat's head
      const leg2 = p[1] >= g[1] - GEM_HALF_HEIGHT; // cat's feet are not above gem's top
      rows.push({ lvl: li + 1, plat: p, gem: g, d, leg1, leg2 });
    }
  }
}

const inSpan = rows.filter((r) => Math.abs(r.gem[0] - r.plat[0]) <= PLATFORM_HALF_WIDTH);
const oneSided = inSpan.filter((r) => r.leg1);
const falsePos = oneSided.filter((r) => !r.leg2);
const twoSided = oneSided.filter((r) => r.leg2);

console.log(`platforms  : ${platforms.length ? "levels " + gems.length : "?"}  half-width ${PLATFORM_HALF_WIDTH}`);
console.log(`gems       : ${gems.reduce((a, g) => a + g.length, 0)} over ${gems.length} levels`);
console.log(`pairs in x : ${inSpan.length}`);
console.log();
console.log(`one-sided  (leg1 only)          : ${oneSided.length}`);
console.log(`  of which FALSE (gem below)   : ${falsePos.length}`);
console.log(`two-sided  (leg1 && leg2)       : ${twoSided.length}`);
console.log(`  FALSE                       : ${twoSided.filter((r) => !r.leg2).length}`);
console.log();
const byLvl = {};
for (const r of twoSided) (byLvl[r.lvl] ||= []).push(r.d);
for (const l of Object.keys(byLvl).map(Number).sort((a, b) => a - b)) {
  console.log(`  L${String(l).padStart(2)}  ${byLvl[l].length}  d=${byLvl[l].sort((a, b) => a - b).join(",")}`);
}
console.log();
console.log("d range among accepted (both legs):", [...new Set(twoSided.map((r) => r.d))].sort((a, b) => a - b).join(","));
console.log("d range of the FALSE positives   :", [...new Set(falsePos.map((r) => r.d))].sort((a, b) => a - b).join(","));
console.log();
// The band the clause deliberately leaves to the descent logic, and the one the
// 20px objectiveBelow literal also leaves open. See decision.cjs objectiveBelow.
const band = inSpan.filter((r) => !r.leg2 && r.d <= 0 && r.d >= -20);
console.log(`neither on-this-floor nor "below" (d in -20..-1, i.e. the objectiveBelow gap): ${band.length}`);
for (const r of band) console.log(`  L${r.lvl} plat ${r.plat} gem ${r.gem} d=${r.d}`);
