// FALL_BLAME v2 (air) census: for each L6 life in a run_full archive, apply the
// EXISTING blame rule (highest floor the life fell from and never got back up
// to) and additionally extract the steering HELD during that fall - the moves
// chosen at the airborne decisions between leaving the edge and landing. The v2
// death line would append "(steering <held>)". Question: does it name the left
// steer at the fork (127.25,112.4), and how many lives would carry it?
const fs = require("fs");
const f = process.argv[2] || "/tmp/fbs6_snap.json";
const LEVEL = Number(process.argv[3] || 6);
const d = JSON.parse(fs.readFileSync(f, "utf8"));
const L = d.levels[LEVEL];
const dl = [...L.decisionsLog].sort((a, b) => a.step - b.step);
const deaths = L.deathLog.map((x) => x.step).sort((a, b) => a - b);
let leftAtFork = 0, lives = 0;
for (let i = 0; i < deaths.length; i++) {
  const lo = i === 0 ? -1 : deaths[i - 1];
  const life = dl.filter((x) => x.step > lo && x.step < deaths[i]);
  if (!life.length) continue;
  lives++;
  // falls: consecutive grounded decisions where y increased; held = airborne moves between
  const falls = [];
  let lastG = null;
  let pending = [];
  for (const e of life) {
    if (e.onPlatform) {
      if (lastG && e.cat.y > lastG.y) falls.push({ edge: `${lastG.cat.x},${lastG.cat.y}`, fromY: lastG.y, move: lastG.move, held: pending.map((p) => p.move) });
      else if (lastG) pending = [];
      lastG = e; pending = [];
    } else pending.push(e);
  }
  const deathY = (L.deathLog[i].preStep && L.deathLog[i].preStep.cathy) || 999;
  const ys = life.filter((x) => x.onPlatform).map((x) => x.cat.y);
  const cands = falls.filter((fl) => {
    if (fl.fromY >= deathY) return false;
    const idx = ys.indexOf(fl.fromY); // rough: got back up check via full ys after the fall
    return true;
  });
  // proper rule: recompute with index semantics like fall_blame
  const gdec = life.filter((x) => x.onPlatform);
  const proper = [];
  for (let j = 1; j < gdec.length; j++) {
    if (gdec[j].cat.y > gdec[j - 1].cat.y) {
      const fromY = gdec[j - 1].cat.y;
      const returned = gdec.slice(j + 1).some((g) => g.cat.y <= fromY);
      if (!returned && fromY < deathY) {
        const held = life.slice(life.indexOf(gdec[j - 1]) + 1, life.indexOf(gdec[j])).map((e) => e.move);
        proper.push({ edge: `${gdec[j - 1].cat.x},${gdec[j - 1].cat.y}`, fromY, move: gdec[j - 1].move, held });
      }
    }
  }
  proper.sort((a, b) => a.fromY - b.fromY);
  const b = proper[0];
  const forkHeld = b && b.held.length ? b.held : b ? ["(none held)"] : [];
  const namesLeft = !!b && b.held.includes("left");
  if (namesLeft) leftAtFork++;
  console.log(`life ${i}: death@${deaths[i]} deathY=${deathY} | blame ${b ? b.edge + " (y" + b.fromY + ", walked " + b.move + ")" : "(none)"} | held during fall: ${forkHeld.join(",") || "-"}`);
}
console.log(`\n${lives} lives, ${leftAtFork} would carry "steering left" in the death line`);
