const CFG = require("./config.cjs");
const { chromium } = CFG.resolvePlaywright();
const EXEC = CFG.browserExecutablePath();
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXEC });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(CFG.HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.overlay, { timeout: 15000 });
  await page.evaluate(() => {
    window.overlay.update({
      level: 1, gems: 2, deaths: 1, movingFrames: 142.5, countdown: 310,
      objective: { question: "Which objective to pursue?", probs: { gem_a: 0.12, gem_b: 0.71, gem_c: 0.09, portal: 0.08 }, chosen: "gem_b" },
      move: { question: "How to move toward it?", probs: { left: 0.05, right: 0.83, jump: 0.06, jump_left: 0.02, jump_right: 0.04 }, chosen: "right" },
      policyMode: "SAMPLE", temperature: 1.5, priorDeaths: 2, latencyMs: 287,
    });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: CFG.outPath("overlay_direct.png") });
  await b.close();
  console.log("done");
})().catch(e => { console.error(e.message); process.exit(1); });
