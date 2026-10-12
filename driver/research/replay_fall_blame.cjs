// replay_fall_blame.cjs — offline replay of the fixadv_s6 L4 death sequence.
// Rebuilds each life's fall tracker from the ladder log lines, forms the
// deathHistory with FALL_BLAME off and on, and renders the move prompt at the
// fork state (140.25,93 mf 12 obj gem_a) that every L4 life walked right from.
// Reports: (a) flag off = 0 prompt diffs (blast), (b) which death first changes
// the prompt and what line it adds. No endpoint calls.
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const { deathEntries } = require("../run_stats.cjs");
const { createFallBlame } = require("../fall_blame.cjs");
const GEMS = require("./gem_table.cjs")();

const LOG = path.join(__dirname, "..", "..", "out", "byom", "PurpleMIST-Flash-1.0-FULL", "fixadv_s6", "full_fixadv_s6.log");
const lines = fs.readFileSync(LOG, "utf8").split("\n");
const key10 = (v) => Math.round(v / 10) * 10;

// Collect lives: arrays of grounded decisions {posKey,y,move} then a death {deathY,cause}.
const lives = [];
let life = { obs: [], deathY: null, cause: "was hit by the laser" };
for (const ln of lines) {
  let m = ln.match(/L4 step \d+ obj=\S+\s+move=(\S+)\s+cat=\(([\d.]+),([\d.]+)\) ground/);
  if (m) {
    life.obs.push({ posKey: key10(+m[2]) + "," + key10(+m[3]), y: +m[3], move: m[1] });
    continue;
  }
  m = ln.match(/L4 DEATH #\d+ @ step \d+\] PRE\(cat=[\d.]+,([\d.]+)/);
  if (m) {
    life.deathY = +m[1];
    lives.push(life);
    life = { obs: [], deathY: null, cause: "was hit by the laser" };
    continue;
  }
  m = ln.match(/L4 unwinnable @ step \d+\] .* \(death \d+\)/);
  if (m && life.obs.length) {
    life.deathY = life.obs[life.obs.length - 1].y;
    life.cause = "unwinnable reset: 2 collected + 0 alive cannot reach 3";
    lives.push(life);
    life = { obs: [], deathY: null, cause: "was hit by the laser" };
  }
}

// The fork state every L4 life faces after spawn (from the log).
const snap = {
  level: 4, onPlatform: true, gemsCollected: 0, aliveGems: 3,
  gemPositions: GEMS[4].map(([x, y], i) => ({ x, y, name: "gem_" + "abc"[i] })),
  moving: false, cat: { x: 140.25, y: 93, dx: 0, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 1 }, tr: { x: 359, y: 0 }, bl: { x: 1, y: 310 }, br: { x: 360, y: 310 } },
};
for (const k of ["PRUNE_FATAL", "MOVE_INSTR", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
delete process.env.ROUTE_ASCENT;

function forkPrompt(hist) {
  return dec.buildMoveCall(snap, GEMS[4], "gem_a", hist).state;
}

// Replay: accumulate deathHistory the way the runners do (STORE cap 12).
const STORE = 12;
for (const flag of ["off", "on"]) {
  if (flag === "on") process.env.FALL_BLAME = "1"; else delete process.env.FALL_BLAME;
  const hist = [];
  let firstChange = null;
  const base = forkPrompt([]);
  let n = 0;
  for (const L of lives) {
    n++;
    const fb = createFallBlame();
    for (const o of L.obs) fb.observe(o.posKey, o.y, o.move);
    hist.push(...deathEntries({ key: L.obs.length ? L.obs[L.obs.length - 1].posKey : "0,0", action: L.obs.length ? L.obs[L.obs.length - 1].move : "(route)" }, null, L.cause));
    for (const b of fb.blameKeys(L.deathY)) hist.push(...deathEntries({ key: b.key, action: b.move }, null, L.cause));
    while (hist.length > STORE) hist.shift();
    if (firstChange === null && forkPrompt(hist) !== base) firstChange = n;
  }
  const p = forkPrompt(hist);
  const extra = p.split("\n").filter((l) => l.includes("140,90") || l.includes("140, 90"));
  console.log(`FALL_BLAME ${flag}: ${lives.length} deaths replayed; first prompt change at death #${firstChange}; fork prompt differs from clean: ${p !== base}`);
  for (const l of extra.slice(0, 2)) console.log(`   line: ${l.trim().slice(0, 160)}`);
}
