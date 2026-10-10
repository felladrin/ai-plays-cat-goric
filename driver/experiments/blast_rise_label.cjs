// RISE_LABEL blast: rebuild every archived decision's MOVE state text with
// RISE_LABEL off vs on and diff. Expected: the ONLY diffs are airborne-rising
// decisions, and each diff is exactly the word swap "in the air, falling" ->
// "in the air, rising". Run with no args; spawns itself twice.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (!process.env.BLAST_INNER) {
  const ROOT = path.resolve(__dirname, "..", "..");
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/^run_level_\d+_.*\.json$/.test(f)) files.push(p);
    }
  })(path.join(ROOT, "out"));
  // Drop archives a live sweep may still be writing (mtime within 2 min): a file
  // that fails to parse in one inner pass and parses in the other breaks line
  // alignment.
  const fresh = files.filter((f) => Date.now() - fs.statSync(f).mtimeMs < 120000);
  if (fresh.length) console.log(`(skipping ${fresh.length} archive(s) modified in the last 2 min)`);
  const stable = files.filter((f) => Date.now() - fs.statSync(f).mtimeMs >= 120000);
  // Snapshot the file list ONCE: a live sweep writing archives between the two
  // inner runs would otherwise change the set mid-blast.
  const env = { ...process.env, BLAST_INNER: "1", BLAST_FILES: JSON.stringify(stable),
    PRUNE_FATAL: "1", MOVE_INSTR: "2", JUMP_FACTS: "1", HOLD_FIX: "1", COL_FACTS: "1", GEM_FACTS: "1", STICKY_OBJECTIVE: "1", EXIT_FACT: "1" };
  const out = {};
  for (const mode of ["off", "on"]) {
    const e = { ...env };
    if (mode === "on") e.RISE_LABEL = "1";
    const r = execFileSync(process.execPath, [__filename], { env: e, maxBuffer: 1 << 28 }).toString();
    out[mode] = r.split("\n").filter(Boolean);
  }
  const off = out.off, on = out.on;
  if (off.length !== on.length) { console.log("LENGTH MISMATCH", off.length, on.length); process.exit(1); }
  let diffs = 0, swaps = 0;
  for (let i = 0; i < off.length; i++) {
    if (off[i] === on[i]) continue;
    diffs++;
    const a = off[i].split("\t"), b = on[i].split("\t");
    // pure word swap check (airborne rows carry the full escaped state)
    if (a[2] === "1" && a[4] && a[4].split("in the air, falling").join("in the air, rising") === b[4]) swaps++;
    else if (diffs <= 5) console.log("NON-SWAP DIFF:", (a[4] || a[3]).slice(0, 160), "||", (b[4] || b[3]).slice(0, 160));
  }
  console.log(`states compared: ${off.length}, diffs: ${diffs}, pure word swaps: ${swaps}, non-swap diffs: ${diffs - swaps}`);
  process.exit(0);
}

// inner: print one line per archived decision: tab-separated archive, step, state hash
const crypto = require("crypto");
const dec = require("../decision.cjs");
const GEMS = require("./gem_table.cjs")();
const ROOT = path.resolve(__dirname, "..", "..");
const files = JSON.parse(process.env.BLAST_FILES);
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log) continue;
  const lvl = d.levelIndex;
  for (const e of d.log) {
    const mf = e.movingFrames || 0;
    const snap = {
      level: lvl, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
      gemPositions: e.gemPositions || [],
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } },
    };
    let state;
    try { state = dec.buildMoveCall(snap, GEMS[lvl], e.objective, []).state; } catch { state = "SKIP"; }
    const md5 = crypto.createHash("md5").update(state).digest("hex");
    // full text only for airborne rows (the label only appears there); grounded
    // rows compare by hash, so a grounded diff is still caught as NON-SWAP
    console.log(`${path.relative(ROOT, f)}\t${e.step}\t${e.onPlatform ? 0 : 1}\t${md5}\t${e.onPlatform ? "" : state.replace(/\n/g, "\\n")}`);
  }
}
