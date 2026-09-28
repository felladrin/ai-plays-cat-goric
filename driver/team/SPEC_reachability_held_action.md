# Revised spec — reachability held-action delegation

**Status: specified, cross-checked, NOT implemented.** Stage behind `REACH_HELD=1`.

Provenance: drafted by the `nemotron-3-ultra-free` instance, attacked by the
`space-bunny-free` instance which had independently scanned L6/L7/L10 by hand,
then revised. Five of six cross-check findings accepted; one rebutted and the
rebuttal then overturned by measurement (see the supervisor note below).

> **Transcription warning.** The body below was captured from a terminal pane,
> not written to disk by its author. Rendered panes can mangle tables and long
> lines. Treat any oddity as a capture artifact and re-derive it rather than
> implementing it literally. Every line number must be re-grepped by symbol
> before use — the file moves whenever a change lands.

## Supervisor verification notes

**Finding 1 (six actions, not four) — CONFIRMED by independent measurement.**
Distinct platform-to-platform edges built both ways on a 0.25px grid:

```
L4:  6 actions -> 8 edges,   4 actions -> 8 edges,   lost 0
L6:  6 actions -> 20 edges,  4 actions -> 12 edges,  lost 8
L8:  6 actions -> 22 edges,  4 actions -> 20 edges,  lost 2
```

The defect is invisible on L4 and costs 40% of L6's edges. A spec validated
only against its own L4 prediction would have shipped this.

**Finding 2 (cache key needs movingFrames) — the author REBUTTED this, arguing
the graph is time-invariant geometric connectivity. The rebuttal is WRONG.**
Measured distinct edges against `movingFrames`:

```
L4:  mf=0 -> 8    mf=50 -> 8    mf=100 -> 5   mf=200 -> 5   mf=300 -> 5   mf=400 -> 0   mf=500 -> 0
L6:  mf=0 -> 23   mf=100 -> 19  mf=300 -> 10  mf=500 -> 0
```

The edge set is strongly time-dependent, because `arc.simulate` takes
`movingFrames` and kills arcs that meet the closing laser. A graph cached at
mf=50 and reused at mf=400 reports 8 edges on L4 where there are none. The
abstraction "floor A connects to floor B" is time-invariant; **this graph is not
that abstraction**, because its edges are lethality-filtered.

The author's counter-concern is still valid and unresolved: a key containing a
monotonically increasing counter is barely a cache. Bucketing `mf` is the
obvious mitigation and the bucket width is unchosen. Cost data for that
decision: 245 `simulate` calls measured at 2ms, so a 0.25px six-action grid is
roughly 50ms per level per distinct key.

---

Now let me produce the revised spec.

Now I have all the context to evaluate each finding. Let me analyze them systematically.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 1: FOUR ACTIONS IS WRONG — THE GRID NEEDS SIX

ACCEPTED. My spec only enumerated 4 actions (jump_left, jump_right, walk_left, walk_right) but arc.simulate supports 6 distinct action strings that produce different
trajectories:

┌─────────────────────────────────────────────┬─────────────────────────────────┬────────────────────────────┬─────────────────────────────────────────────────────────┐
│Action                                       │Horizontal                       │Jump?                       │Produces                                                 │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"jump"                                       │none                             │yes                         │Vertical jump (apex-snap candidate)                      │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"jump_left"                                  │left                             │yes                         │Jump + held left                                         │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"jump_right"                                 │right                            │yes                         │Jump + held right                                        │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"left" / "walk_left"                         │left                             │no                          │Walk-off descent                                         │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"right" / "walk_right"                       │right                            │no                          │Walk-off descent                                         │
├─────────────────────────────────────────────┼─────────────────────────────────┼────────────────────────────┼─────────────────────────────────────────────────────────┤
│"none" / "release"                           │none                             │no                          │Released fall                                            │
└─────────────────────────────────────────────┴─────────────────────────────────┴────────────────────────────┴─────────────────────────────────────────────────────────┘

The current graph() calls landingsFrom with only jump=true/false — no horizontal direction. This misses all walk-off descent edges (left/right without jump), which are
the primary way down on stacked-wall levels (L6/L7/L10). On L4 every edge happens to be a jump, so the defect was invisible in my L4-only validation.

Correction: The enumeration must be all 6 actions (or 5 if we merge left/walk_left which are identical in simulate — both set goLeft=true, wantJump=false).

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 2: THE CACHE KEY NEEDS movingFrames

REBUTTED. The graph represents geometric connectivity between floors — "from a grounded launch on floor A, can you reach floor B?" This is a time-invariant property of
the level geometry.

- graph() builds edges by calling heldActionLandings (née landingsFrom) with movingFrames=0 (game-start laser positions)
- simulate with movingFrames=0 checks the laser at its initial position (top=1, bottom=310)
- An edge that exists at mf=0 is a true geometric path. At mf=400 the same arc would hit the laser, but the cat would never be launching from a grounded floor at
  mf=400 if it's still alive — it would have descended or died earlier.
- The stranding/ONE-WAY checks use reachableFrom on the current floor (which the cat is standing on now). The question "from this floor, can I reach that floor?" is
  geometric; the laser countdown is a separate, orthogonal constraint handled by jumpHitsCeiling and the prompt's countdown warnings.

Cache key remains: ${level}:${catHeight}. The cross-checker conflated the graph (geometric) with airborne simulation (time-dependent). The graph is correctly cached
once per level.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 3: GRID SPACING 0.25px, NOT 1.75px

ACCEPTED. Phase sensitivity is real. The current grid x += 2 (≈catWalkSpeed) can miss launch windows narrower than the step. A 0.25px grid (7× denser) eliminates this.

Cost: L4 has ~5 runs × 50px / 0.25px = 1000 samples × 6 actions = 6000 simulate calls. At 2ms per 245 calls (measured), that's 50ms per level — once per process,
cached. Negligible.

Correction: Grid step = 0.25px.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 4: timeout IS STRUCTURALLY UNREACHABLE

ACCEPTED. arc.simulate returns "timeout" only after 240 frames without landing, hitting laser, or falling past y=420. In practice every arc resolves to "landed",
"laser", or "void" (y > 420) well before 240 frames. The cross-checker confirmed 0 timeouts in 179k simulations.

The unhandled branch is "void" (arc.cjs:79) — falls past all platforms. This must be mapped to "no edge" (same as laser).

Correction: simulate outcomes → edge mapping:

- "landed" → add edge
- "laser" / "void" / "timeout" → no edge (not an error)

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 5: YOUR C→D MECHANISM IS WRONG

ACCEPTED (with correction on my part). Two errors in my spec:

1. C→D false edge cause: The handover §9 says "the held-arc scan finds no held action from any x on C that lands on D". The cross-checker clarifies: the held-action
   arc from C never terminates (falls to void/laser), not that horizontal/vertical decoupling is the issue. The envelope incorrectly adds D because at some frame
   during descent the horizontal span overlaps D's x-range — but the actual held-action x at that frame is far to the right (holding right moves away from D).

2. B→D apex-snap edge: I predicted jump_right from B's right edge. Wrong direction. B is at x=199..251, D is at x=156..208 (LEFT of B). The correct action is jump_left
   from x∈241,251. The handover §8 explicitly: "B→D: jump_left lands on D only from x 241..251".

   The cross-checker says this edge already exists in the envelope model (since the envelope's horizontal span at the descent frame covers D's x-range). So my
   falsifiable prediction "B→D apex-snap edge appears" is not falsifiable — it's already there.

New falsifiable predictions needed:

- Walk-off descent edges appear on stacked-wall levels (L6/L7/L10): e.g., walk_left from a floor's left end reaches the floor below
- False jump edges disappear where held-action diverges from envelope (e.g., C→D, A→E, B→E on L4)
- jump (no horizontal) edges may appear/disappear — the envelope currently treats jump=true as "jump + free steering"; held-action jump commits to zero horizontal

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Finding 6: CONSERVATISM IS NOT SAFE AT EVERY LAYER

ACCEPTED. Three callers use the graph in ways where missing an edge = false positive guidance:

┌────────────────────────────┬────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────┐
│Caller                      │Location                            │Behavior with missing edge                                                                          │
├────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│routeBlocked                │decision.cjs:485                    │continue — silently removes goal from menu                                                          │
├────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│stranding(g)                │decision.cjs:393–408                │Emits "TAKING THIS FIRST LOSES X PERMANENTLY" — stronger instruction                                │
├────────────────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│Descent cost                │decision.cjs:518–538                │Emits "ONE-WAY: after this descent there is no route back up" — stronger instruction                │
└────────────────────────────┴────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┘

A conservative graph (subset of true edges) causes:

- Goals reachable only via mid-air steering → NO ROUTE or silently dropped
- Descents that can return via mid-air steering → false ONE-WAY warnings
- Stranding annotations that fire incorrectly

Mitigation required: The graph must not be strictly conservative for these callers. Options:

- Keep the envelope model for reachableFrom/stranding/descent-cost (optimistic, safe for warnings)
- Use held-action graph ONLY for jumpLandingNote and ROUTE_FIRST firstHop (where over-reporting was the bug)
- Or: add a "mid-air steering recovery" margin to the held-action graph before using it for stranding/route-blocking

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Revised Spec: Reachability Delegation to arc.simulate

1. Replacement for landingsFrom — heldActionLandings

function heldActionLandings(level, runs, x0, y0, catHeight) {
  // Enumerates all 6 held actions from a GROUNDED launch at (x0, y0)
  // Returns Set<runKey> of floors where the arc lands (first landing only)
}

Enumeration:

- Start positions: Every 0.25px from r.left to r.right inclusive
- Actions (6): "jump", "jump_left", "jump_right", "left", "right", "none"
  - "left" ≡ "walk_left" (both: goLeft=true, wantJump=false)
  - "right" ≡ "walk_right"
  - "none" ≡ "release" (released fall, no horizontal)
- Call: simulate(level, x, y0, 0, catHeight, action, 0, { grounded: true })
- Moving frames: 0 (game-start laser positions — geometric edge)

Outcome mapping:

┌──────────────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────┐
│Outcome                                                                           │Edge?                                                                              │
├──────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────┤
│"landed"                                                                          │Yes — add runKey(landed floor)                                                     │
├──────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────┤
│"laser" / "void" / "timeout"                                                      │No                                                                                 │
└──────────────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────┘

Returns: Set<runKey> — same signature as landingsFrom for drop-in compatibility.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

2. Cache Strategy

Key: ${level}:${catHeight} (string)

Invalidation: None — graph is geometric, time-invariant. Built once per level per process.

Cache structure:

const graphCache = new Map(); // key -> { runs, edges }

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

3. Caller Migration Strategy (Dual-Model Approach)

Do NOT replace the envelope globally. The envelope is optimistic (safe for warnings); held-action is exact (safe for action-menu pruning). Use each where its bias is
correct:

┌───────────────────────────────────────────┬───────────────────────────┬───────────────────────────────────┬──────────────────────────────────────────────────────────┐
│Caller                                     │Current Model              │New Model                          │Rationale                                                 │
├───────────────────────────────────────────┼───────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────────────────┤
│jumpLandingNote                            │envelope                   │held-action                        │Was over-reporting reach; caused fatal jump on L4         │
├───────────────────────────────────────────┼───────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ROUTE_FIRST firstHop                       │envelope                   │held-action                        │Was claiming jumps available that ceiling pruned          │
├───────────────────────────────────────────┼───────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────────────────┤
│reachableFrom / canReach / NO ROUTE        │envelope                   │KEEP envelope                      │Conservative graph drops goals silently (line 485)        │
├───────────────────────────────────────────┼───────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────────────────┤
│stranding(g) / ONE-WAY                     │envelope                   │KEEP envelope                      │Conservative graph = false "loses permanently"            │
├───────────────────────────────────────────┼───────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────────────────┤
│Descent cost ONE-WAY                       │envelope + simulate        │KEEP envelope for after set        │Same — false stranding warning                            │
└───────────────────────────────────────────┴───────────────────────────┴───────────────────────────────────┴──────────────────────────────────────────────────────────┘

Implementation: Add heldActionLandings alongside landingsFrom. Switch only the two callers above. Export both.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

4. Staging (Unchanged)

- Gate behind REACH_HELD=1 env flag, default OFF
- Implement heldActionLandings, cache key, dual-model caller split
- Write test_reachability_held.cjs with falsifiable assertions (below)
- Full 14-level sweep with flag ON; rollback on any passing-level regression

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

5. Falsifiable Test Assertions (L4 + L6)

const REACH = require("./reachability.cjs");
const runs = REACH.runsOf(4);

// --- L4: Three verified false edges GONE ---
assert(!REACH.heldActionLandings(4, runs, 121, 93, 18).has("floor(79..131@180)"), "A→E false edge removed");
assert(!REACH.heldActionLandings(4, runs, 199, 93, 18).has("floor(79..131@180)"), "B→E false edge removed");
assert(!REACH.heldActionLandings(4, runs, 289, 171, 18).has("floor(156..208@241)"), "C→D false edge removed");

// --- L4: Walk-off descent edges APPEAR (new) ---
// A floor (95..147@93) left end walk_left should reach E (79..131@180)
const aLeftDescents = REACH.heldActionLandings(4, runs, 95, 93, 18);
assert(aLeftDescents.has("floor(79..131@180)"), "A left walk-off descent to E appears");

// B floor (199..251@93) right end walk_right should reach C (263..315@171)
const bRightDescents = REACH.heldActionLandings(4, runs, 251, 93, 18);
assert(bRightDescents.has("floor(263..315@171)"), "B right walk-off descent to C appears");

// --- L6: Stacked-wall descent edges (the real target) ---
const l6Runs = REACH.runsOf(6);
// Verify at least one walk-off descent edge exists on L6 that envelope missed
const l6Edges = new Set();
for (const r of l6Runs) {
  for (let x = r.left; x <= r.right; x += 0.25) {
    for (const k of REACH.heldActionLandings(6, l6Runs, x, r.y, 18)) {
      if (k !== REACH.runKey(r)) l6Edges.add(`${REACH.runKey(r)} -> ${k}`);
    }
  }
}
assert(l6Edges.size > 0, "L6 has held-action descent edges");

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

6. Conservatism Mitigation

The dual-model approach (envelope for stranding/route-blocking, held-action for jump-landing/firstHop) preserves:

- No silent goal removal — reachableFrom stays optimistic
- No false ONE-WAY — stranding uses envelope
- Accurate jump-landing note — uses held-action (fixes L4 fatal jump)
- Accurate firstHop — uses held-action (fixes ceiling-pruned jumps)

This isolates the held-action graph to where over-reporting was the bug, and keeps the envelope where under-reporting would be the bug.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

End of revised spec. Ready for implementation behind REACH_HELD=1.

▣  Plan · Nemotron 3 Ultra Free · 2m 7s

  ┃
  ┃
  ┃
  ┃  Plan · Nemotron 3 Ultra Free OpenCode Zen
  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   /Users/victor/Repositories/js13k-2021                                                                                                          88.1K (9%)  ctrl+p commands

---

# ADDENDUM — cache-key resolution and replacement falsifiable prediction

Added after the supervisor's measurement overturned the author's finding-2
rebuttal. The author accepted the measurement and chose a resolution.

**Chosen: store `deathMf` per edge, filter at query time.** Rejected: bucketing
`movingFrames` (poor hit rate, and the edge count is a step function so a bucket
straddling a step is the harmful case), and not caching at all.

**Also replaced: the falsifiable prediction.** The original predicted a new
apex-snap edge, B's right edge to D, which the cross-checker showed already
exists in both edge sets as a 148px clean descent — so it was unfalsifiable. The
replacement targets the walk-off descent edges that the four-action enumeration
missed, which is the defect that was actually found.

Transcription warning from the header applies to everything below.

---


Let me now write the response addressing all points.

You're right on finding 2 — my rebuttal was wrong. The arc.simulate call includes laser checks parameterized by movingFrames, so the edge set is time-dependent. I
measured it at mf=0; you measured it across the timeline and the edges vanish as the laser closes. A graph cached at mf=50 and reused at mf=400 is simply wrong.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Cache Resolution: Store Death-mf Per Edge, Filter at Query Time

Chosen: Option 2 — precompute each edge's deathMf (the movingFrames at which the arc first hits the laser), store it in the cache, filter at query time.

Why this wins

┌────────────────────────────┬────────────────────────────────────────────────┬───────────────────────────────────────────────────┬────────────────────────────────────┐
│Criterion                   │Bucket mf                                       │Store deathMf                                      │No cache                            │
├────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────────┤
│Cache hit rate              │Poor (bucket misses at boundaries)              │Perfect (single cache entry per level)             │N/A                                 │
├────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────────┤
│Query cost                  │O(1)                                            │O(edges) filter — trivial (≤50 edges)              │50ms rebuild every call             │
├────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────────┤
│Correctness                 │Fails if bucket straddles step                  │Exact — each edge has its true deathMf             │Correct but slow                    │
├────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────────┤
│Implementation              │Moderate                                        │Simple — one extra field per edge                  │Simple but slow                     │
└────────────────────────────┴────────────────────────────────────────────────┴───────────────────────────────────────────────────┴────────────────────────────────────┘

How it works

function graph(level, catHeight) {
  const key = `${level}:${catHeight}`;
  if (graphCache.has(key)) return graphCache.get(key);

  const runs = runsOf(level);
  const edges = {};
  const deathMf = {};  // NEW: edge -> movingFrames where laser kills it

  for (const r of runs) {
    const out = new Set();
    const outDeath = new Map();  // edge key -> deathMf
    for (let x = r.left; x <= r.right; x += 0.25) {
      for (const action of ACTIONS) {  // 6 actions
        // Binary search or linear scan to find deathMf for this (x, action)
        // simulate with increasing mf until outcome == "laser"
        const dmf = findDeathMf(level, runs, x, r.y, catHeight, action);
        if (dmf > 0) {
          // Simulate at mf=0 to get the landing floor
          const r0 = simulate(level, x, r.y, 0, catHeight, action, 0, { grounded: true });
          if (r0.outcome === "landed") {
            const k = REACH.platformKeyAt(level, r0.x, r0.y);
            if (k && k !== runKey(r)) {
              out.add(k);
              // Keep the MAX deathMf across all launch x that produce this edge
              outDeath.set(k, Math.max(outDeath.get(k) || 0, dmf));
            }
          }
        }
      }
    }
    edges[runKey(r)] = [...out];
    deathMf[runKey(r)] = outDeath;
  }
  const g = { runs, edges, deathMf };
  graphCache.set(key, g);
  return g;
}

function reachableFrom(level, startKey, catHeight = CAT_H_DEFAULT, currentMf = 0) {
  const { edges, deathMf } = graph(level, catHeight);
  // Filter edges: only keep those where deathMf > currentMf
  const filteredEdges = {};
  for (const [from, tos] of Object.entries(edges)) {
    filteredEdges[from] = tos.filter(t => (deathMf[from]?.get(t) || Infinity) > currentMf);
  }
  // BFS on filteredEdges...
}

Cost

- Build time: ~50ms/level (6000 simulates × binary search for deathMf ≈ 2-3× base cost). Still once per process.
- Query time: reachableFrom filters ~50 edges — microseconds.
- Cache hit rate: 100% after first build per level.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Falsifiable Apex-Snap Prediction (Corrected)

My original prediction (B→D apex-snap) was wrong — it already exists in the envelope. The new edges that held-action finds and envelope misses are walk-off descents
lost to the one-frame-behind bug in landingsFrom (span = v·(f-1) but walk-off moves v·f).

Specific test assertion (implementer runs this to discover the exact edge, then hardcodes it):

// In test_reachability_held.cjs
const REACH = require("./reachability.cjs");
const runs6 = REACH.runsOf(6);

// Discover: held-action finds walk-off descent edges on L6 that envelope misses
const envelopeEdges = new Set();
const heldEdges = new Set();
for (const r of runs6) {
  for (let x = r.left; x <= r.right; x += 0.25) {
    for (const jump of [true, false]) {
      for (const k of REACH.landingsFrom(6, runs6, x, r.y, jump, 18)) {
        if (k !== REACH.runKey(r)) envelopeEdges.add(`${REACH.runKey(r)} -> ${k}`);
      }
    }
    for (const k of REACH.heldActionLandings(6, runs6, x, r.y, 18)) {
      if (k !== REACH.runKey(r)) heldEdges.add(`${REACH.runKey(r)} -> ${k}`);
    }
  }
}
const newWalkEdges = [...heldEdges].filter(e => !envelopeEdges.has(e) && /left|right/.test(e));
assert(newWalkEdges.length > 0, `Expected new walk-off descent edges, got: ${newWalkEdges.join(", ")}`);

// After first run, hardcode the specific edge found, e.g.:
// assert(REACH.heldActionLandings(6, runs6, 148.25, 180, 18).has("floor(128..180@203)"),
//   "L6 walk-off right from (122,180) right edge reaches (154,203) — envelope misses due to 1-frame span bug");

The implementer runs the discovery once, captures the concrete edge (level, start run, launch x, action, target run), and hardcodes it as the permanent regression test.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Updated Spec Section (Cache + Prediction)

Replace the Cache Strategy and Falsifiable Test Assertions sections in the spec with:

Cache Strategy (revised)

// Key: `${level}:${catHeight}` (time-invariant geometry)
// Value: { runs, edges, deathMf }
//   edges: runKey -> [runKey...]
//   deathMf: runKey -> Map<targetRunKey, deathMf>
//     deathMf = movingFrames at which arc first hits laser (Infinity if never)
//
// Build once per level per process. Query-time filter:
function reachableFrom(level, startKey, catHeight = CAT_H_DEFAULT, currentMf = 0) {
  const { edges, deathMf } = graph(level, catHeight);
  const filtered = {};
  for (const [from, tos] of Object.entries(edges)) {
    filtered[from] = tos.filter(t => (deathMf[from]?.get(t) || Infinity) > currentMf);
  }
  // BFS on filtered...
}

Falsifiable Test Assertions (revised)

// 1. L4: three verified false edges GONE
assert(!REACH.heldActionLandings(4, runs, 121, 93, 18).has("floor(79..131@180)"));
assert(!REACH.heldActionLandings(4, runs, 199, 93, 18).has("floor(79..131@180)"));
assert(!REACH.heldActionLandings(4, runs, 289, 171, 18).has("floor(156..208@241)"));

// 2. L4: walk-off descent edges APPEAR (new)
assert(REACH.heldActionLandings(4, runs, 95, 93, 18).has("floor(79..131@180)"));  // A left walk-off -> E
assert(REACH.heldActionLandings(4, runs, 251, 93, 18).has("floor(263..315@171)")); // B right walk-off -> C

// 3. L6: at least one walk-off descent edge found by held-action, missed by envelope
// (Discover programmatically, then hardcode the specific edge)
const runs6 = REACH.runsOf(6);
const env = new Set(), held = new Set();
for (const r of runs6) {
  for (let x = r.left; x <= r.right; x += 0.25) {
    for (const j of [true, false]) for (const k of REACH.landingsFrom(6, runs6, x, r.y, j, 18))
      if (k !== REACH.runKey(r)) env.add(`${REACH.runKey(r)}->${k}`);
    for (const k of REACH.heldActionLandings(6, runs6, x, r.y, 18))
      if (k !== REACH.runKey(r)) held.add(`${REACH.runKey(r)}->${k}`);
  }
}
const newEdges = [...held].filter(e => !env.has(e) && /->/.test(e));
assert(newEdges.length > 0, `L6 held-action finds ${newEdges.length} edges envelope misses: ${newEdges.join(", ")}`);

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

This resolves both issues. The cache is now correct and fast; the prediction is falsifiable and targets the actual defect (walk-off one-frame bug) not the phantom apex-
snap.

▣  Plan · Nemotron 3 Ultra Free · 2m 55s

  ┃
  ┃
  ┃
  ┃  Plan · Nemotron 3 Ultra Free OpenCode Zen
  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   /Users/victor/Repositories/js13k-2021                                                                                                        102.1K (10%)  ctrl+p commands

---

# ADDENDUM 2 — the dual-model split is WITHDRAWN

Added 2026-09-26, late. **This supersedes the dual-model recommendation in the
body and in Addendum 1, and it makes the change larger, not smaller.**

## What changed

The spec, the handover's §9, and every summary written tonight describe
`landingsFrom` as an **optimistic** envelope: it invents edges the driver's
one-held-direction control cannot produce, and misses apex-snap edges. The
entire "conservative is safe" argument, and the dual-model split that followed
from it, assume `envelope ⊇ true edges`.

**Measured, and it breaks that assumption.** On L11 from grounded state
x=181.5, y=187:

```
landingsFrom(11, runs, 181.5, 187, jump=true, h=18)  ->  3 floors:
    floor(181..233@187), floor(222..274@228), floor(145..197@231)

arc.simulate, same state, grounded:
    left        landed  x=153.50  y=231.00   16 frames
    right       landed  x=185.00  y=187.00    2 frames
    jump        landed  x=181.50  y=187.00   34 frames
    jump_left   landed  x=111.50  y=211.00   40 frames   <- MISSING from landingsFrom
    jump_right  landed  x=249.75  y=228.00   39 frames
    wait        landed  x=181.50  y=187.00    2 frames
```

`jump_left` reaches `floor(62..114@211)`. `landingsFrom` does not list it and
the graph has no such edge. This is **under-reporting on an ordinary grounded
jump**, with no apex snap involved.

## Consequences, per the spec's author

1. The envelope both over- and under-reports, so `envelope ⊇ true edges` is
   false.
2. **The dual-model split is invalid.** It kept the envelope for stranding and
   route-blocking *precisely because* under-reporting is the dangerous
   direction there. That is the layer now known to under-report.
3. **"Conservative is safe" is unsound.** A conservative subset of a set that
   was already missing edges misses them too, while adding false warnings for
   edges the envelope falsely held. The "only adds warnings" guarantee
   collapses.

## Revised prescription

`heldActionLandings` (with `deathMf` filtering) must replace `landingsFrom`
**everywhere**, not only for `jumpLandingNote` and `firstHop`. **Retire the
envelope.** The conservatism-mitigation section of the body is wrong and should
be read as withdrawn.

This is a larger change than the body describes. It still stages behind
`REACH_HELD=1`, and it still needs the full sweep — but there is no longer a
partial-migration option that is defensible.

---

# ADDENDUM 3 — the missing mid-air re-decide dimension

Added 2026-09-27. **This is a known gap in the spec's edge model, not a defect
in the implementation, and it is not fixed by the 0.25px six-action grid.**

`arc.simulate` models **one held action to termination**. The driver does not
do that: `cadence.cjs` re-decides every `AIR_REDECIDE_FRAMES` (3) while
airborne, so the cat can **abandon a fatal arc mid-flight** and steer onto a
different outcome. A single `simulate` call is therefore a *lower bound* on
what the cat can reach, and any claim of the form "every action from here
dies" is unsafe.

**This has already invalidated real conclusions**, all found by the instance
that raised it, against its own prior work:

- **L10 step 6** — proposed as the hinge decision. Refuted: the fatal arc is
  abandoned at frame 3.
- **L10 step 10** — invalid on a second ground: `grounded: true` was passed for
  a state whose log says `onPlatform: false`.
- **L6 / L13 "all five actions die"** — over-claimed, same limitation.
- **L6 gem_c** — the 897 two-segment solutions, all releasing at frames 7–11,
  are exactly this dimension. It was identified hours earlier as an L6 quirk.
  It is not an L6 quirk.

> **"It is the single largest gap between `arc.simulate` and the driver, and it
> has now invalidated two of my own target claims."**

## What this means for the migration

The held-action edge set this spec proposes is built from single held arcs, so
it inherits the same lower-bound property. That is *safe* in the sense that it
never invents an edge — but combined with Addendum 2 (the envelope both over-
and under-reports, 341 / 213) it means **neither model represents what the
driver can actually do**. One is optimistic about steering it cannot commit to;
the other is pessimistic about steering it can.

Before implementing, decide explicitly whether the edge set should model
multi-segment arcs. Not doing so is defensible — it is conservative and
bounded — but it must be a recorded decision rather than an omission, because
three separate findings have now failed on exactly this assumption.

## What still stands

Only claims read from **observed run logs** rather than derived from
`simulate`: the L11 decision-108 state (`jump_right` 0.852 against `right`
0.119, observed four times) and the L12 `x=282.5, y=125` target (`onPlatform`
true in the log; the 2-frame landing is a grounded cadence fact, not an
arc-length artefact).
