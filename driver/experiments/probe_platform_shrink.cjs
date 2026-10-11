// Platform shrink probe (no model, no GPU): the game shrinks a platform while it
// touches a laser (checkPlatformsCollisionWithLasers.ts: scaleX -= 0.01 per frame,
// destroyed below 0, or at once when out of the laser bounds). The driver's
// geometry (level_data.cjs, arc.cjs, reachability.cjs) is static full width.
// This drives a real harness page with the cat jumping in place (so the lasers
// advance) and logs each platform's live scaleX against movingFrames, then idles
// to show that contact keeps shrinking a platform while the lasers stand still.
//   node experiments/probe_platform_shrink.cjs <level> [jumpFrames] [idleFrames]
const CFG = require("../config.cjs");
const { chromium } = CFG.resolvePlaywright();
const level = Number(process.argv[2] || 10);
const JUMP_FRAMES = Number(process.argv[3] || 200);
const IDLE_FRAMES = Number(process.argv[4] || 0);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
  const page = await browser.newPage();
  await page.goto(CFG.HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.bridge);
  const rows = await page.evaluate(({ level, JUMP_FRAMES, IDLE_FRAMES }) => {
    const b = window.bridge;
    b.gameLoop.stop();
    b.resetCurrentLevel();
    if (level > 0) b.setCurrentLevel(level);
    b.resync();
    const out = [];
    const snapPlats = (tag, i) => {
      const s = b.getState();
      const mf = (s.drones.tl.y - 1) / 0.2;
      out.push({ tag, i, mf: +mf.toFixed(1), plats: b.platformsPool.getAliveObjects().filter((p) => p.ttl !== 0)
        .map((p) => [Math.round(p.x), Math.round(p.y), +p.scaleX.toFixed(2)]) });
    };
    for (let i = 0; i < JUMP_FRAMES; i++) {
      b.setAction("jump"); b.stepFrame(1 / 60);
      if (i % 10 === 0) snapPlats("move", i);
      if (b.getState().level !== level) break;
    }
    b.clearAction();
    for (let i = 0; i < IDLE_FRAMES; i++) { b.stepFrame(1 / 60); if (i % 10 === 0) snapPlats("idle", i); }
    snapPlats("end", -1);
    return out;
  }, { level, JUMP_FRAMES, IDLE_FRAMES });
  await browser.close();
  // Print only platforms whose scale has changed, so the log stays readable.
  for (const r of rows) {
    const changed = r.plats.filter((p) => p[2] !== 1);
    console.log(`${r.tag.padEnd(4)} i=${String(r.i).padStart(3)} mf=${String(r.mf).padStart(5)} alive=${r.plats.length} shrunk: ${changed.map((p) => `${p[0]},${p[1]}x${p[2]}`).join(" ")}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
