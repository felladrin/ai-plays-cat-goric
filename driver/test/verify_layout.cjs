// Verification for the layout move: does the bridge still reach the LIVE game
// singletons after bridge.ts moved out of the game tree and the game became a
// submodule? The proof is that a flag the bridge writes is the same object the
// game's own update loop reads, so stepping frames moves the real cat.
const { chromium } = require("playwright");

const URL = process.env.HARNESS_URL || "http://127.0.0.1:5173/harness.html";

(async () => {
  const exec = process.env.CHROME || process.env.PLAYWRIGHT_CHROMIUM;
  const browser = await chromium.launch(exec ? { executablePath: exec } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.bridge, null, { timeout: 20000 });

  const before = await page.evaluate(() => window.bridge.getState());
  const canvasInfo = await page.evaluate(() => {
    const c = window.bridge.canvas;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
    return { w: c.width, h: c.height, paintedRatio: +(painted / (c.width * c.height)).toFixed(3) };
  });

  // Singleton proof: the bridge writes the button flag, the GAME's update reads it.
  await page.evaluate(() => window.bridge.setAction("right"));
  const moved = await page.evaluate(() => {
    const B = window.bridge;
    const x0 = B.catSprite.x;
    for (let i = 0; i < 20; i++) B.stepFrame(1 / 60);
    return { x0: +x0.toFixed(2), x1: +B.catSprite.x.toFixed(2), dx: +(B.catSprite.x - x0).toFixed(2) };
  });

  // And the game's own level store answers through the bridge.
  const lvl = await page.evaluate(() => {
    const B = window.bridge;
    const l0 = B.getCurrentLevel();
    B.setCurrentLevel(3);
    const l3 = B.getCurrentLevel();
    B.setCurrentLevel(l0);
    return { l0, l3 };
  });

  await page.screenshot({ path: "out/verify_harness.png" });
  await browser.close();

  // Threshold calibrated against the pre-move harness on :5173, which paints
  // 0.062 at this same moment. The canvas is mostly transparent by design (the
  // gradient background is CSS, outside the canvas), so this only proves the
  // game actually rendered. The exact ratio moves with the sprite animation.
  const ok =
    errors.length === 0 &&
    canvasInfo.paintedRatio > 0.02 &&
    moved.dx > 10 &&
    lvl.l3 === 3;

  console.log(JSON.stringify({ url: URL, before, canvasInfo, moved, lvl, errors, ok }, null, 2));
  process.exit(ok ? 0 : 1);
})();
