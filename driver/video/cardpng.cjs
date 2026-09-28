// Renders the title card and the per-level cards to 1280x720 PNGs.
//
// The text is laid out by a real browser rather than by ffmpeg's drawtext, because the
// ffmpeg on this machine is built without --enable-libfreetype and has no drawtext filter
// at all. Playwright is resolved through driver/config.cjs, the same two functions
// run_level.cjs and run_full.cjs call, so this adds no dependency and no install: it
// reuses whatever PLAYWRIGHT_MODULE already points at (see driver/experiments/lvl.sh:7) and
// the chromium already in ~/Library/Caches/ms-playwright.
//
// This renders a static HTML string. It does not open the harness, the game, or any model
// endpoint, so it cannot perturb a measurement or count as a level run.
//
// Env: BG FG SUB GAME SUBTITLE TAGLINE TOTAL_LEVELS  (same names cards.sh uses)
// Usage:
//   node cardpng.cjs --out <dir> [--levels 0,1,2] [--files a.card,b.card]
//     --levels  writes level<n>.card.png for each n
//     --files   writes <name>.png for each name; the level number is parsed out of it,
//               so file mode needs no change

"use strict";

const path = require("path");
const fs = require("fs");

const CFG = require(path.join(__dirname, "..", "config.cjs"));

const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}
const out = opt("--out") || path.join(__dirname, "cards");
const levels = opt("--levels");
const files = opt("--files");

if (!levels && !files) {
  console.error("cardpng.cjs: pass --levels n,n,n or --files a.card,b.card");
  process.exit(1);
}

const BG = process.env.BG || "0d1117";
const FG = process.env.FG || "e6edf3";
const SUB = process.env.SUB || "9aa5b1";
const GAME = process.env.GAME || "CAT GORIC";
const SUBTITLE = process.env.SUBTITLE || "Escape from the Warp Chamber";
const TAGLINE = process.env.TAGLINE || "an LLM plays all 14 levels";
const TOTAL_LEVELS = process.env.TOTAL_LEVELS || "14";

// The rule under the title. A 1px line in SUB at 40% opacity, so it reads as a divider
// rather than as text, and it is the only element on the card that is not one of the
// three text lines.
const RULE = `<div class="rule"></div>`;

function page(inner) {
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box }
    html,body { width:1280px; height:720px; background:#${BG}; overflow:hidden }
    body { display:flex; align-items:center; justify-content:center; flex-direction:column;
           font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
           -webkit-font-smoothing:antialiased; text-align:center }
    .big   { font-size:112px; font-weight:800; letter-spacing:-3px; color:#${FG}; line-height:1 }
    .mid   { font-size:34px;  font-weight:400;  letter-spacing:1px;  color:#${SUB}; margin-top:26px }
    .small { font-size:25px;  font-weight:400;  letter-spacing:2px;  color:#${SUB}; margin-top:34px }
    .num   { font-size:132px; font-weight:800; letter-spacing:-4px; color:#${FG}; line-height:1 }
    .of    { font-size:30px;  font-weight:400;  letter-spacing:3px;  color:#${SUB}; margin-top:28px }
    .rule  { width:180px; height:1px; background:#${SUB}; opacity:.4; margin:34px 0 0 }
  </style><body>${inner}</body>`;
}

const titleHtml = page(
  `${RULE}<div class="big" style="margin-top:0">${GAME}</div>` +
    `<div class="mid">${SUBTITLE}</div>` +
    `<div class="small">${TAGLINE}</div>`,
);

// A level card reads LEVEL n / of 14, because nothing in the repo carries a per-level name:
// src/scripts has no level table and driver/harness.html has no names metadata.
function levelHtml(n) {
  return page(
    `${RULE}<div class="num" style="margin-top:0">${n}</div>` +
      `<div class="of">LEVEL ${n} OF ${TOTAL_LEVELS}</div>`,
  );
}

const jobs = [];
jobs.push(["title", titleHtml]);
if (levels) {
  for (const n of levels.split(",").filter(Boolean)) {
    jobs.push([`level${n.trim()}.card`, levelHtml(n.trim())]);
  }
}
if (files) {
  for (const f of files.split(",").filter(Boolean)) {
    const m = f.match(/(\d+)/);
    if (!m) throw new Error(`cardpng.cjs: no level number in card name "${f}"`);
    jobs.push([f, levelHtml(m[1])]);
  }
}

(async () => {
  const pw = CFG.resolvePlaywright();
  const exec = CFG.browserExecutablePath();
  const browser = await pw.chromium.launch(exec ? { executablePath: exec } : {});
  try {
    fs.mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const [name, html] of jobs) {
      await page.setContent(html, { waitUntil: "load" });
      const p = path.join(out, `${name}.png`);
      await page.screenshot({ path: p, type: "png" });
      console.log(`  ${name}.png`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(`cardpng.cjs: ${e.message}`);
  process.exit(1);
});
