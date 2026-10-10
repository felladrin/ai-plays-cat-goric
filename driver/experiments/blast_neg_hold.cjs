// NEG_HOLD blast: rebuild every archived decision's MOVE state text with
// NEG_HOLD off vs on and diff. Expected: the ONLY diffs are airborne decisions
// where decision.cjs's negHold predicate fires, and each diff is a PURE
// APPEND of one "Holding <x> until landing ..." line. Also asserts the diff
// count equals the predicate firing count over the same archive set.
// Run with no args; spawns itself twice.
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
  const env = { ...process.env, BLAST_INNER: "1", BLAST_FILES: JSON.stringify(stable),
    PRUNE_FATAL: "1", MOVE_INSTR: "2", JUMP_FACTS: "1", HOLD_FIX: "1", COL_FACTS: "1", GEM_FACTS: "1", STICKY_OBJECTIVE: "1", EXIT_FACT: "1" };
  const out = {};
  for (const mode of ["off", "on"]) {
    const e = { ...env };
    if (mode === "on") e.NEG_HOLD = "1";
    const r = execFileSync(process.execPath, [__filename], { env: e, maxBuffer: 1 << 28 }).toString();
    out[mode] = r.split("\n").filter(Boolean);
  }
  const off = out.off, on = out.on;
  if (off.length !== on.length) { console.log("LENGTH MISMATCH", off.length, on.length); process.exit(1); }
  const SENT = /^Holding (left|right|none) until landing .*\.$/;
  let diffs = 0, appends = 0, fires = 0, badFireNoDiff = 0;
  for (let i = 0; i < off.length; i++) {
    const a = off[i].split("\t"), b = on[i].split("\t");
    if (+a[3]) fires++;
    if (off[i] === on[i]) { if (+a[3]) { badFireNoDiff++; if (badFireNoDiff <= 3) console.log("FIRE BUT NO DIFF:", a[0], a[1]); } continue; }
    diffs++;
    const oa = (a[5] || "").split("\\n"), ob = (b[5] || "").split("\\n");
    // pure append: removing exactly one SENTENCE line from the on-text must
    // reproduce the off-text, and the removed line must be the NEG_HOLD sentence
    let ok = false;
    if (a[2] === "1" && a[5] && b[5]) {
      for (let j = 0; j < ob.length; j++) {
        if (!SENT.test(ob[j])) continue;
        if (ob.slice(0, j).concat(ob.slice(j + 1)).join("\\n") === a[5]) { ok = true; break; }
      }
    }
    if (ok) appends++;
    else if (diffs <= 5) console.log("NON-APPEND DIFF:", a[0], a[1], "fire=" + a[3], (a[5] || a[4]).slice(0, 120), "||", (b[5] || b[4]).slice(0, 120));
  }
  console.log(`states compared: ${off.length}, predicate fires: ${fires}, diffs: ${diffs}, pure appends: ${appends}, non-append diffs: ${diffs - appends}, fires with no diff: ${badFireNoDiff}`);
  console.log(fires === diffs && diffs === appends && badFireNoDiff === 0 ? "BLAST OK" : "BLAST FAILED");
  process.exit(0);
}

// inner: one line per archived decision: file, step, airborne, predicate-fire,
// state md5, full state text (airborne rows only; grounded rows compare by md5)
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
    const dd = 0.2 * mf;
    const snap = {
      level: lvl, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
      gemPositions: e.gemPositions || [],
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
    };
    let fire = 0;
    if (!e.onPlatform && /^gem_[abc]$/.test(e.objective)) {
      const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[e.objective];
      const gs = GEMS[lvl] && GEMS[lvl][idx];
      if (gs) { try { fire = dec.negHold(snap, e.objective, gs[0], gs[1], mf).fire ? 1 : 0; } catch { fire = 0; } }
    }
    let state;
    try { state = dec.buildMoveCall(snap, GEMS[lvl], e.objective, []).state; } catch { state = "SKIP"; }
    const md5 = crypto.createHash("md5").update(state).digest("hex");
    console.log(`${path.relative(ROOT, f)}\t${e.step}\t${e.onPlatform ? 0 : 1}\t${fire}\t${md5}\t${e.onPlatform ? "" : state.replace(/\n/g, "\\n")}`);
  }
}
