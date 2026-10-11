// Platform-shrink census (offline): how often does the static simulator promise a
// landing on a platform the game has already shrunk or removed?
//
// The game (checkPlatformsCollisionWithLasers.ts) shrinks a platform's scaleX by
// 0.01 per frame while its hand-made 40x8 laser box touches a laser, and destroys
// it at scale 0 or when its centre leaves the laser bounds. The cat collides with
// the 52x16 SPRITE, whose width is 52 * scaleX about the centre (kontra world rect).
// For a side laser the box edge tracks the beam exactly (20px * 0.01 = 0.2px per
// frame = droneSpeed), so scale = (359 - 0.2 mf - x) / 20 on the right and
// (x - 1 - 0.2 mf) / 20 on the left, measured live by probe_platform_shrink.cjs
// (L10 tower x 330: 0.83 at mf 59, 0.63 at mf 79). A top/bottom beam shrinks it
// 0.01 per frame from first contact; frames are approximated by moving frames.
//
// For every archived GROUNDED decision, simulate holding the chosen move with the
// static geometry (arc.simulate) and with shrinking geometry, and count where they
// disagree.   node experiments/census_shrink.cjs
const fs = require("fs");
const path = require("path");
const CFG = require("../physics.cjs");
const LEVELS = require("../level_data.cjs");
const A = require("../arc.cjs");

const HALF_W = CFG.platformWidth / 2;
const TOP_OFF = CFG.platformHeight * CFG.platformAnchorY;
const BOT_OFF = CFG.platformHeight * (1 - CFG.platformAnchorY);

function scaleAt(x, y, mf) {
  const d = CFG.droneSpeed * mf;
  let s = 1;
  s = Math.min(s, (359 - d - x) / 20, (x - 1 - d) / 20);
  const topContact = (y - 4 - 1) / CFG.droneSpeed;
  const botContact = (CFG.maximumLaserY - (y + 4)) / CFG.droneSpeed;
  const contact = Math.min(topContact, botContact);
  if (mf > contact) s = Math.min(s, 1 - 0.01 * (mf - contact));
  // centre outside the drone lines: destroyed at once
  if (x <= 1 + d || x >= 359 - d || y <= 1 + d || y >= CFG.maximumLaserY - d) s = 0;
  return Math.max(0, s);
}

function boxesAt(level, mf) {
  const out = [];
  for (const [x, y] of LEVELS.platforms(level)) {
    const s = scaleAt(x, y, mf);
    if (s <= 0) continue;
    out.push({ x, y, left: x - HALF_W * s, right: x + HALF_W * s, top: y - TOP_OFF, bot: y + BOT_OFF });
  }
  return out;
}

const overlaps = (cx, cy, h, p) => cx < p.right && cx + 1 > p.left && cy - h < p.bot && cy > p.top;

// arc.simulate with per-frame shrinking platforms; same frame order.
function simulateShrink(level, x, y, dy, h, action, mf0, maxFrames = 240) {
  const goLeft = action.includes("left"), goRight = action.includes("right"), wantJump = action.includes("jump");
  let grounded = dy === 0, jumped = false, mf = mf0;
  for (let f = 1; f <= maxFrames; f++) {
    const plats = boxesAt(level, mf);
    if (goLeft || goRight) grounded = false;
    if (dy >= 0) for (const p of plats) if (overlaps(x, y, h, p)) { grounded = true; y = p.y; dy = 0; break; }
    // standing still on a platform that shrank out from under the cat
    if (grounded && !goLeft && !goRight && !plats.some((p) => overlaps(x, y, h, p))) grounded = false;
    const dx = goLeft ? -CFG.catWalkSpeed : goRight ? CFG.catWalkSpeed : 0;
    if (wantJump && grounded && !jumped) { dy = -CFG.catJumpSpeed; grounded = false; jumped = true; }
    if (grounded) dy = 0; else dy += CFG.catFallingAcceleration;
    x += dx; y += dy;
    if (dx !== 0 || dy !== 0) mf += 1;
    const top = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
    const bottom = CFG.maximumLaserY - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
    const left = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
    const right = 359 - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
    if (y >= bottom || y - h <= top || x <= left || x >= right) return { outcome: "laser", x, y, frames: f };
    if (grounded && f > 1 && (jumped || !wantJump)) return { outcome: "landed", x, y, frames: f };
    if (y > 420) return { outcome: "void", x, y, frames: f };
  }
  return { outcome: "timeout", x, y, frames: maxFrames };
}

if (require.main === module) {
  const ROOT = path.resolve(__dirname, "..", "..", "out", "byom");
  const files = [];
  (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) w(p); else if (/^(run_level_\d+_|run_full_).*\.json$/.test(f) && /PurpleMIST-Flash/.test(p)) files.push(p); } })(ROOT);
  const lv = {};
  const tag = (r) => (r.outcome === "landed" ? `@${Math.round(r.y)}` : r.outcome);
  const examples = {};
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    const sets = d.log ? [[d.levelIndex, d.log]] : Object.entries(d.levels || {}).map(([k, l]) => [Number(k), l.decisionsLog || []]);
    for (const [level, log] of sets) {
      if (level == null) continue;
      for (const e of log) {
        if (!e.onPlatform || !e.cat || e.movingFrames == null || !e.move) continue;
        const S = (lv[level] = lv[level] || { n: 0, standGone: 0, diff: 0 });
        S.n++;
        const mf = e.movingFrames;
        // the floor the cat stands on, at its live width
        if (!boxesAt(level, mf).some((p) => overlaps(e.cat.x, e.cat.y + 0.01, 18, p))) S.standGone++;
        const a = A.simulate(level, e.cat.x, e.cat.y, 0, 18, e.move, mf);
        const b = simulateShrink(level, e.cat.x, e.cat.y, 0, 18, e.move, mf);
        if (tag(a) !== tag(b)) {
          S.diff++;
          const k = `L${level} ${e.move} static ${tag(a)} -> live ${tag(b)}`;
          examples[k] = (examples[k] || 0) + 1;
        }
      }
    }
  }
  console.log(`files ${files.length}`);
  for (const k of Object.keys(lv).map(Number).sort((a, b) => a - b)) {
    const S = lv[k];
    console.log(`L${String(k).padStart(2)} grounded decisions ${String(S.n).padStart(6)}  held-move outcome differs ${String(S.diff).padStart(5)} (${(100 * S.diff / S.n).toFixed(1)}%)  standing floor already gone in the model ${S.standGone}`);
  }
  console.log("\nmost common disagreements:");
  for (const [k, v] of Object.entries(examples).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(5), k);
}
module.exports = { scaleAt, boxesAt, simulateShrink };
