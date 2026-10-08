// Driver: prove the harness can read + step the real game deterministically.
// No classifier here. Loads /harness.html, waits for images, stops the
// wall-clock loop, resets to a clean level-0 slate, then steps frames by hand
// and prints the observable state each step.

const CFG = require("./config.cjs");
const { chromium } = CFG.resolvePlaywright();

const URL = CFG.HARNESS_URL;
const DT = 1 / 60;

function fmt(s) {
  const r = (n) => Math.round(n * 100) / 100;
  const d = s.drones;
  const movingFrames = (d.tl.y - 1) / 0.2;
  return {
    level: s.level,
    collected: s.gemsCollected,
    aliveGems: s.aliveGems,
    onPlatform: s.onPlatform,
    moving: s.moving,
    cat: { x: r(s.cat.x), y: r(s.cat.y), dx: r(s.cat.dx), dy: r(s.cat.dy) },
    drones: {
      tl: { x: r(d.tl.x), y: r(d.tl.y) },
      tr: { x: r(d.tr.x), y: r(d.tr.y) },
      bl: { x: r(d.bl.x), y: r(d.bl.y) },
      br: { x: r(d.br.x), y: r(d.br.y) },
    },
    movingFramesUsed: r(movingFrames),
    lastEvent: s.lastEvent.type,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CFG.browserExecutablePath() });
  const page = await browser.newPage({ viewport: { width: 360, height: 360 } });

  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto(URL, { waitUntil: "load" });

  // Wait until the bridge exists and the game has initialized (level 0 has 3 gems
  // and the cat is positioned). resetCurrentLevel runs after images load.
  await page.waitForFunction(
    () =>
      window.bridge &&
      window.bridge.gemsPool &&
      window.bridge.gemsPool.getAliveObjects().length === 3 &&
      window.bridge.catSprite.x !== 0,
    { timeout: 15000 }
  );

  // Stop the wall-clock loop and reset to a pristine level-0 start.
  await page.evaluate(() => {
    window.bridge.gameLoop.stop();
    window.bridge.resetCurrentLevel();
    window.bridge.resync();
  });

  const init = await page.evaluate(() => window.bridge.getState());
  console.log("INIT (after stop + reset):");
  console.log(JSON.stringify(fmt(init), null, 2));

  // Step 12 frames with 'wait' held. The cat should fall ~12px onto the start
  // platform, then sit still. Drones close only while the cat is moving.
  console.log("\nSTEPPING 12 frames with action=wait:");
  for (let i = 1; i <= 12; i++) {
    await page.evaluate((dt) => {
      window.bridge.setAction("wait");
      window.bridge.stepFrame(dt);
    }, DT);
    const s = await page.evaluate(() => window.bridge.getState());
    console.log(`frame ${String(i).padStart(2)}: ` + JSON.stringify(fmt(s)));
  }

  console.log("\npage errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => {
  console.error("DRIVER ERROR:", e);
  process.exit(1);
});
