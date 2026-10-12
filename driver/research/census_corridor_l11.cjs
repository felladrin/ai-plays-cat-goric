// L11 corridor census: the "route to gem_a closes in ~N frames" line, separability
// winners vs losers. Bottleneck = the @114->gem_a jump, close mf 179 (measured
// robust: 179 at launch x 125.5, 138, 139.5; the @211->@152 hop is launch-position
// dependent - 0 at the left edge, 300 at 97.5 - so it is NOT usable as a canonical
// close; the gate must only fire on launch-stable bottleneck hops).
// Firing state: grounded, obj gem_a, gem_a alive, route exists from the current
// floor to gem_a's collector, N = 179 - mf in (0, 120]. At firing states: did the
// model take the route's next-hop jump (progress) or dawdle?
const fs = require("fs");
const REACH = require("../reachability.cjs");
const CLOSE = 179;
const archives = {
  "Darwin s2 (W)": "../out/byom/Darwin-27B-ZTC/s2/run_level_11_systemone.json",
  "ra0 s1 (L)": "../out/byom/AB-ROUTE_ASCENT/s1-ra0/run_level_11_systemone.json",
  "ra0 s2 (L)": "../out/byom/AB-ROUTE_ASCENT/s2-ra0/run_level_11_systemone.json",
  "ra1 s1 (L)": "../out/byom/AB-ROUTE_ASCENT/s1-ra1/run_level_11_systemone.json",
  "ra1 s2 (L)": "../out/byom/AB-ROUTE_ASCENT/s2-ra1/run_level_11_systemone.json",
};
const g = REACH.graph(11, 18);
// gem_a (180,76) floats above no floor (platformHolding is null: x 180 is outside
// @114's 88..140 span and @187 is 111px below, past the tolerance). The collector
// is the floor a jump from which COLLECTS it: @114 jump_right, whose apex passes
// through (180,76) - the arc-simulated winning collect.
const collector = "floor(88..140@114)";
function routeDir(level, x, y) {
  const here = REACH.platformKeyUnder(level, x, y);
  if (!here) return null;
  // BFS to collector; return first-hop direction
  const seen = new Set([here]); const q = [[here, null]];
  for (let i = 0; i < q.length; i++) {
    const [k, first] = q[i];
    if (k === collector) return first;
    for (const nk of (g.edges[k] || [])) {
      if (seen.has(nk)) continue;
      const r = g.runs.find((r) => REACH.runKey(r) === nk);
      const cur = g.runs.find((r) => REACH.runKey(r) === k);
      const dir = r && cur && (r.left + r.right) / 2 > (cur.left + cur.right) / 2 ? "jump_right" : "jump_left";
      seen.add(nk); q.push([nk, first || (k === here ? dir : first)]);
    }
  }
  return null;
}
for (const [name, f] of Object.entries(archives)) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  let fired = 0, progress = 0, dawdle = 0; const Ns = [];
  for (const e of d.log) {
    if (!e.onPlatform || e.objective !== "gem_a" || e.movingFrames == null) continue;
    const mf = Math.round(e.movingFrames);
    const N = CLOSE - mf;
    if (N <= 0 || N > 120) continue;
    const dir = routeDir(11, e.cat.x, e.cat.y);
    if (!dir) continue;
    fired++; Ns.push(N);
    if (e.move === dir) progress++; else dawdle++;
  }
  const mm = Ns.length ? Math.min(...Ns) + "-" + Math.max(...Ns) : "-";
  console.log(name.padEnd(15), "fired:", String(fired).padStart(3), "N range:", mm.padEnd(8), "took route-hop:", progress, "dawdled:", dawdle);
}
