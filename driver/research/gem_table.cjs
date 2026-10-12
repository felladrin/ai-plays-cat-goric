// Shared gem table, loaded from the game source (same parser as
// census_route_hint.cjs loadGemTable). One source of truth for all blasts/censuses.
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
module.exports = function loadGemTable() {
  const p = path.join(REPO, "cat-goric-game", "src", "scripts", "constants", "config.ts");
  const src = fs.readFileSync(p, "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  if (at < 0) throw new Error("gemsPositionsPerLevel not found in " + p);
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let depth = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") depth++;
    else if (seg[i] === "]") { depth--; if (!depth) break; }
  }
  return eval(seg.slice(st, i + 1));
};
