// FALL_BLAME: when a life dies on a floor it reached by falling, the death
// history must ALSO name the edge key the life fell from, so the model sees the
// fatal edge key after deaths that happened downstream of it. Fixture is the
// real fixadv_s6 L4 life before death #7 (laser at 161.25,241), taken from
// full_fixadv_s6.log lines: the life spawns at 121,81, walks right at 140.25,93
// (the gap edge floor), falls to @241, wanders @241/@180, and dies at 161.25,241.
// The blame must include 140,90 - the edge it fell from - not just the last
// grounded key. Rule (refined against all 30 fixadv_s6 L4 deaths, every one of
// which blames 140,90): keep the list of falls of the current life; at death,
// blame the fall from the HIGHEST floor the life never got back up to (never
// again grounded at y <= that floor's y). The "most recent fall" variant fails
// death #7: by then the life had fallen 93->241->180->241 and the most recent
// fall started at @180, so the honest origin is the never-returned-to floor.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const FB = require("../fall_blame.cjs");

// Grounded decisions of the life (from the log lines), then the death.
const LIFE = [
  { step: 3747, x: 129.75, y: 93, move: "right" },
  { step: 3753, x: 140.25, y: 93, move: "right" }, // walks right off the gap edge
  { step: 3786, x: 198, y: 241, move: "left" },    // landed on @241 (fell from 140,90)
  { step: 3792, x: 191, y: 241, move: "left" },
  { step: 3829, x: 126.25, y: 180, move: "jump" }, // fell again @241 -> @180
  { step: 3992, x: 187.5, y: 241, move: "left" },  // back down to @241
  { step: 4029, x: 126.25, y: 180, move: "jump" },
  { step: 4063, x: 124.5, y: 180, move: "right" }, // last grounded before death
];
const DEATH = { x: 161.25, y: 241, cause: "laser" };
const key10 = (v) => Math.round(v / 10) * 10;

function runFixture(flag) {
  if (flag) process.env.FALL_BLAME = "1"; else delete process.env.FALL_BLAME;
  const fb = FB.createFallBlame();
  for (const s of LIFE) fb.observe(key10(s.x) + "," + key10(s.y), s.y, s.move);
  return fb.blameKeys(DEATH.y);
}

// 1. The requirement: death #7's blamed keys must include the fall edge 140,90.
{
  const keys = runFixture(true).map((b) => b.key);
  assert(keys.includes("140,90"), `FALL_BLAME on: blamed keys ${JSON.stringify(keys)} must include 140,90`);
}

// 2. The fall-blame entry names the move that left the edge (truthful line input).
{
  const b = runFixture(true).find((b) => b.key === "140,90");
  assert(b && b.move === "right", "fall-blame entry must carry the move taken from the edge (right)");
}

// 3. Flag off: no extra blame, byte-identical behavior for the runners.
{
  assert.deepStrictEqual(runFixture(false), [], "FALL_BLAME off must add no blame entries");
}

// 4. A life that never fell below its first grounded floor gets no fall blame.
{
  delete process.env.FALL_BLAME; process.env.FALL_BLAME = "1";
  const fb = FB.createFallBlame();
  fb.observe("130,90", 93, "right");
  fb.observe("140,90", 93, "left");
  assert.deepStrictEqual(fb.blameKeys(93), [], "no fall, no fall blame");
}

// 5. A life that fell but died ABOVE the edge it fell from is not blamed to it.
{
  process.env.FALL_BLAME = "1";
  const fb = FB.createFallBlame();
  fb.observe("140,90", 93, "right");
  fb.observe("198,241", 241, "left");   // fell from 140,90
  fb.observe("126,180", 180, "jump");   // fell further (chain continues)
  fb.observe("187,240", 241, "left");
  fb.observe("124,180", 180, "right");
  assert.deepStrictEqual(fb.blameKeys(81), [], "dying above the fall edge must not blame it");
}

// 5b. A life that got back up to the floor it fell from is not blamed to the
// first edge - but if it falls from that floor AGAIN and never returns, the
// second edge is the honest blame.
{
  process.env.FALL_BLAME = "1";
  const fb = FB.createFallBlame();
  fb.observe("140,90", 93, "right");
  fb.observe("198,241", 241, "left");   // fell from 140,90
  fb.observe("130,90", 93, "left");     // climbed back to y93 - first fall off the hook
  fb.observe("150,241", 241, "right");  // fell again from 130,90, never back up
  const b = fb.blameKeys(241);
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].key, "130,90", "the never-returned second fall is the blame");
}

// 6. reset() (respawn) clears the chain: the next life starts fresh.
{
  process.env.FALL_BLAME = "1";
  const fb = FB.createFallBlame();
  for (const s of LIFE) fb.observe(key10(s.x) + "," + key10(s.y), s.y, s.move);
  fb.reset();
  fb.observe("130,90", 93, "right");
  assert.deepStrictEqual(fb.blameKeys(241), [], "after reset the new life has no fall history");
}

// 7. Parity: both runners must use the same module and gate the extra entry on
// blameKeys output (identical code path).
{
  for (const f of ["run_level.cjs", "run_full.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert(src.includes("fall_blame.cjs"), `${f} must require fall_blame.cjs`);
    assert(src.includes("blameKeys"), `${f} must call blameKeys at the death site`);
  }
}

console.log("fall_blame: all assertions passed");
