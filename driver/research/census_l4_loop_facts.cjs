// L4 loop census vs the EXISTING airborne facts: at the loop's airborne decisions
// (the jump_left arc from floor(263..315@171) that apex-snaps back to
// floor(199..251@93)) and at the loop's grounded decisions, does NEG_HOLD or
// REACH_FACT fire, and does the model take the bad hold / follow the reach claim?
// Archives: Flash base s1-s4 + EXIT s3/s4 (HONEST is the rejected build; NEG has
// no L4 run). Loop scope: obj gem_c (the never-held gem whose floor the loop
// orbits).   node research/census_l4_loop_facts.cjs
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const REACH = require("../reachability.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const ARCHIVES = [];
for (const [tag, rel] of [
  ["base", "out/byom/PurpleMIST-Flash-1.0"],
  ["EXIT", "out/byom/PurpleMIST-Flash-1.0-EXIT"],
]) {
  for (const s of ["s1", "s2", "s3", "s4"]) {
    const p = path.join(ROOT, rel, s, "run_level_4_systemone.json");
    if (fs.existsSync(p)) ARCHIVES.push([`${tag}/${s}`, p]);
  }
}
const GEMS = require("./gem_table.cjs")()[4]; // L4: a(289,156) b(105,164) c(182,226)
const IDX = { gem_a: 0, gem_b: 1, gem_c: 2 };

function snapOf(e, level) {
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  return {
    level, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
    __mf: mf,
  };
}

let air = { n: 0, nhFire: 0, nhBad: 0, rhFire: 0, rhComply: 0 };
const rows = [];
const grounded = { loopFloor: 0, loopFloorRight: 0, lowerJumpLeft: 0, lowerFloor: 0 };
for (const [tag, p] of ARCHIVES) {
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const e of d.log) {
    if (e.objective !== "gem_c") continue;
    const snap = snapOf(e, 4);
    const { __mf: mf } = snap;
    if (!e.onPlatform) {
      // the loop arc: between the two floors, x between their spans
      if (e.cat.y > 93 && e.cat.y < 171 && e.cat.x >= 195 && e.cat.x <= 320) {
        air.n++;
        const [gx, gy] = GEMS[IDX.gem_c];
        const nh = dec.negHold(snap, "gem_c", gx, gy, mf);
        const rh = dec.reachHolds(snap, "gem_c", gx, gy, mf);
        if (nh.fire) {
          air.nhFire++;
          if (e.move === nh.bad) air.nhBad++;
          rows.push(`${tag} step ${e.step} (${e.cat.x},${e.cat.y}) dy${e.cat.dy} NEG bad=${nh.bad}(${nh.badVia}) move=${e.move} ${e.move === nh.bad ? "TOOK-BAD" : "avoided"}`);
        }
        if (rh.fire) {
          air.rhFire++;
          if (e.move === rh.hold) air.rhComply++;
          rows.push(`${tag} step ${e.step} (${e.cat.x},${e.cat.y}) dy${e.cat.dy} REACH hold=${rh.hold}(${rh.frames}f) move=${e.move} ${e.move === rh.hold ? "comply" : "ignore"}`);
        }
      }
    } else {
      const k = REACH.platformKeyUnder(4, e.cat.x, e.cat.y);
      if (k === "floor(199..251@93)") {
        grounded.loopFloor++;
        if (e.move === "right") grounded.loopFloorRight++;
      }
      if (k === "floor(263..315@171)") {
        grounded.lowerFloor++;
        if (e.move === "jump_left") grounded.lowerJumpLeft++;
      }
    }
  }
}
console.log(`loop-arc airborne decisions (obj gem_c, y 93..171, x 195..320): ${air.n}`);
console.log(`  NEG_HOLD fires ${air.nhFire}; model TOOK the bad hold ${air.nhBad} of ${air.nhFire}`);
console.log(`  REACH_FACT fires ${air.rhFire}; model followed the named hold ${air.rhComply} of ${air.rhFire}`);
console.log(`grounded loop decisions: loop floor(199..251@93) ${grounded.loopFloor} (move=right ${grounded.loopFloorRight}); lower floor(263..315@171) ${grounded.lowerFloor} (move=jump_left ${grounded.lowerJumpLeft})`);
console.log("\nper-firing detail:");
for (const r of rows.slice(0, 40)) console.log("  " + r);
if (rows.length > 40) console.log(`  ... ${rows.length - 40} more`);
