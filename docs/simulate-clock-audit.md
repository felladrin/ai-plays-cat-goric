# simulate() Clock Audit

`arc.simulate` takes a `movingFrames` argument. Passing a constant (0 or 1) tests the most favourable laser state that ever existed and can report a fatal action as safe. This document audits every call site in `driver/decision.cjs`.

**Total call sites: 9** — 4 pass real `movingFrames`, 5 pass a constant.

---

## Real-clock sites (defensible by construction)

### 1. `floorBelow` — line 398
```js
const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, dir, mf, { grounded: false });
```
**What it gates:** The "falling floor" remedy note (steering toward the nearest floor below while airborne). The note claims a specific direction brings the cat over that floor; `simulate` verifies the held arc actually lands on it.
**Verdict:** DEFENSIBLE. Uses live drone positions to derive the current laser clock. The note is only emitted when the remedy survives at the *real* clock.

### 2. `jumpIsNoop` — line 443
```js
const mf = (snap.drones.tl.y - 1) / require("./physics.cjs").droneSpeed;
const r = simulate(snap.level, snap.cat.x, snap.cat.y, 0, snap.cat.height, "jump", mf, { grounded: true });
```
**What it gates:** PRUNE_NOOP — removes a straight-up jump that lands back on the same floor and touches no gem.
**Verdict:** DEFENSIBLE. Uses live drone positions. A noop jump is defined by geometry (lands on same floor), not by laser survival; the laser clock only affects whether the *apex* hits the ceiling, which is already checked by `jumpHitsCeiling` before this runs.

### 3. `jumpLandingNote` empty branch — line 1014
```js
const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
const arc = simulate(snap.level, snap.cat.x, run.y, 0, snap.cat.height, dir, mf, { grounded: true });
```
**What it gates:** The "lands" clause when the optimistic envelope reaches nothing — describes the held-arc outcome (laser/void/landed) so the model knows the jump is fatal.
**Verdict:** DEFENSIBLE. Uses live drone positions. This is the laser-survival check for the jump the model might actually pick.

### 4. `descentPoints` gate — line 1801
```js
const mfNow = require("./route_clock.cjs").movingFramesOf(snap);
const survives = (hold) => {
  const r = simulate(snap.level, endX, curY, 0, snap.cat.height, hold, mfNow, { grounded: true });
  return r.outcome === "landed";
};
```
**What it gates:** Whether a descent point is offered at all. The descent is only added to the menu if stepping off (or holding `none`) survives the laser at the *current* clock.
**Verdict:** DEFENSIBLE. Uses `route_clock.movingFramesOf(snap)` for the real clock. This was the fix for the defect where a descent stayed on the menu after becoming instant laser death (open-problems.md §3, "descentPoints offered an edge that is death at the current laser state — FIXED 2026-10-08").

---

## Constant-clock sites (require audit)

### 5. `buildObjectiveCall` descent cost — line 791
```js
const r = simulate(snap.level, dp.x, snap.cat.y, 0, snap.cat.height, dir, 0, { grounded: true });
```
**What it gates:** The `ONE-WAY` cost annotation on descent points — computes whether the landing platform loses access to other live gems.
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** The simulation checks reachability *from the landing platform* at mf=0. At real movingFrames the side lasers have closed in; the cat may not be able to walk as far on the landing floor before the laser cuts it off, or the jump from that floor may hit the side laser. The `ONE-WAY` verdict (stranding other gems) could be wrong in either direction: a gem declared reachable at mf=0 may be cut off by the laser at real mf, or a gem declared stranded may actually be reachable if the laser hasn't closed that far yet.
**What would settle it:** Measure the firing set of the `ONE-WAY` annotation at real mf vs mf=0 across a census of archived states. If the set of gems reported as lost changes, the defect is live.

### 6. `jumpLandingNote` held-arc scan — line 979 — **FIXED 2026-10-09**
```js
const r = simulate(snap.level, x, run.y, 0, snap.cat.height, dir, 1, { grounded: true });
```
**What it gates:** Selection of the imperative launch x (`namedX`) — picks the x in the good window whose *held* arc (steering held through the jump) actually lands on a platform that keeps the objective reachable.
**Clock passed:** `1` (one frame in, nearly most favourable).
**Verdict:** DEFENSIBLE.
**Reasoning:** This scan verifies air-control reachability (the held-arc physics), not laser survival. The laser at mf=1 is barely different from mf=0; the side lasers move ~0.2px per frame. The purpose is to distinguish envelope reachability (optimistic, instantaneous steering) from held-arc reachability (what the cat actually does when the player holds a key). The actual laser survival for the chosen `namedX` is checked at real mf in the empty branch (line 1014). A constant of 1 is a pragmatic approximation for "the physics model without laser interference".
**What would settle it:** Census the `namedX` chosen at mf=1 vs real mf across archives. If they differ, the defect is live.

### 7. `walkOffFatalNote` walk check — line 1088
```js
const r = simulate(snap.level, endX, run.y, 0, snap.cat.height, dir, 0, { grounded: true });
```
**What it gates:** The "Walking off this end kills you" warning note. If the simulation returns `landed`, the warning is suppressed (`return null`).
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** At mf=0 the side lasers are at maximum width. At real movingFrames they have closed in. A walk that `lands` at mf=0 may hit the side laser at real mf, making the warning a **false negative** (the note is suppressed but the walk is actually fatal). This is the dangerous direction: the model is not warned about a lethal walk.
**What would settle it:** Census archived states where the cat is near a floor edge (within `reachEnd`). Compare `simulate` outcome at mf=0 vs real mf. Count false negatives (mf=0 lands, real mf laser).

### 8. `walkOffFatalNote` jump check — line 1090
```js
const jmp = simulate(snap.level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, 0, { grounded: true });
```
**What it gates:** The escape clause "A jump left/right from that end lands safely on x..., y..." appended to the walk-off warning.
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** Same clock as site 7. A jump that `lands` at mf=0 may hit the side laser at real mf. The model is told a jump escape exists when it does not at the current clock — a **false positive** escape route.
**What would settle it:** Same census as site 7. Count cases where the jump escape is reported at mf=0 but the real-mf outcome is `laser`.

### 9. `descentPoints` LANDDESC_HELD — line 1839
```js
const hr = simulate(snap.level, endX, curY, 0, snap.cat.height, side, 0, { grounded: true });
```
**What it gates:** The landing description text for descent points (only when `LANDDESC_HELD=1`, not the default). Describes where the held arc lands when stepping off the descent end.
**Clock passed:** `0` (most favourable).
**Verdict:** DEFENSIBLE (guarded).
**Reasoning:** This code path is only active under `LANDDESC_HELD=1` (opt-in env flag). The *offer* of the descent point is already gated by the real-clock check at line 1801 (site 4). This site only affects the descriptive text shown to the model. At mf=0 the held arc may land on a platform that at real mf would be cut by the laser, but the descent itself would not be offered if it didn't survive at real mf. The text may be slightly optimistic about *where* the cat lands, but the safety of the descent is already verified.
**What would settle it:** Enable `LANDDESC_HELD=1` and census the described landing platform at mf=0 vs real mf. If the described platform changes, the text is optimistic.

---

### 10. `exitDirection` jump arc — line 1937 (real clock; added with EXIT_FACT, 2026-10-10)
```js
const r = require("./arc.cjs").simulate(snap.level, catX, catY, 0, h, act, mf, { grounded: true });
```
**What it gates:** The jump_left/jump_right routes of the EXIT_FACT predicate (docs/flash-l2-l5-analysis.md): whether a jump from the cat's own x lands on a floor that routes to the objective's holder at the current laser state.
**Clock passed:** `mf`, the real clock, caller-supplied: the driver passes `route_clock.movingFramesOf(snap)`; the census passes the archived `movingFrames`.
**Verdict:** DEFENSIBLE. Real clock at every call site; the parameter only exists so the census can replay the archived clock.

---

### 11. `reachHolds` steering traces — line 1981 (real clock; added with REACH_FACT, 2026-10-10)
```js
const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, hold, mf, {
  grounded: false, onFrame: ... });
```
**What it gates:** The REACH_FACT predicate (docs/flash-l13-analysis.md): which steering holds pass the objective's collision box before landing or dying.
**Clock passed:** `mf`, the real clock, caller-supplied: the driver passes `route_clock.movingFramesOf(snap)`; the census passes the archived `movingFrames`.
**Verdict:** DEFENSIBLE. Real clock at every call site.

---

## Summary Table

| Site | Function | Line | Clock | Verdict |
|------|----------|------|-------|---------|
| 1 | `floorBelow` | 398 | real `mf` | DEFENSIBLE |
| 2 | `jumpIsNoop` | 443 | real `mf` | DEFENSIBLE |
| 3 | `jumpLandingNote` empty | 1014 | real `mf` | DEFENSIBLE |
| 4 | `descentPoints` gate | 1801 | real `mfNow` | DEFENSIBLE |
| 5 | `buildObjectiveCall` descent cost | 791 | `0` | **LATENT-DEFECT** |
| 6 | `jumpLandingNote` held scan | 979 | real `mfNow` | **FIXED** |
| 7 | `walkOffFatalNote` walk | 1088 | `0` | **LATENT-DEFECT** |
| 8 | `walkOffFatalNote` jump | 1090 | `0` | **LATENT-DEFECT** |
| 9 | `descentPoints` LANDDESC_HELD | 1839 | `0` | DEFENSIBLE-guarded |
| 10 | `exitDirection` jump arc | 1937 | real `mf` (caller) | DEFENSIBLE |
| 11 | `reachHolds` steering traces | 1981 | real `mf` (caller) | DEFENSIBLE |

**Latent defects: 3** (sites 5, 7, 8). Site 6 is constant-clock but now judged DEFECT-LIVE (census-confirmed); site 9 is DEFENSIBLE-guarded.

---

## Census (2026-10-09)

Synthetic state-space census across all playable levels (0..13), every platform geometry, and a real-mf grid (0, 20, 40, ..., 600). No live archives exist; states are enumerated from the level geometry using the same idioms as `driver/experiments/census_gem_from.cjs` and `firing_counts.cjs`.

**NOTE:** The word "live" in this census means "exists in synthetic geometry", not "fires in play". There are no run archives behind these numbers.

### Site 5 — `buildObjectiveCall` descent cost (line 791)
**Methodology corrected:** Enumerates descent points exactly as `descentPoints()` does (same gates, same "remaining objective below" condition). Conditions each candidate on the site-4 offer gate (the descent is only on the menu if the held walk survives at the REAL mf — the `survives()` gate at line 1800). Compares the LOST-GEM SET at mf=0 vs real mf (using `reachableFrom` from the landing platform). **Crucial fix:** states where the descent is NEVER offered at any real mf are EXCLUDED (no ONE-WAY note is emitted at all). The "none" fallback for MISSED warnings was an artifact — lasers only close as mf rises, so a held arc dead at mf=0 is dead at every mf.

- **States examined (descent offered at some real mf):** 97
- **Divergent states (mf=0 vs real mf LOST-GEM SET differs):** 0
- **States excluded (descent never offered at any real mf):** 1
- **States where mf=0 descent dies (no ONE-WAY note at mf=0 either):** 18
- **Verdict:** **DEFECT-THEORETICAL** — when conditioned on the descent actually being offered at real mf, the lost-gem set at mf=0 matches the lost-gem set at real mf in all 97 states. The defect is theoretical (exists in synthetic geometry only as a constant-clock assumption) with no evidence of a live divergence in the offered states.

### Site 6 — `jumpLandingNote` held scan (line 979; 970 pre-fix; 964 earlier) — FIXED 2026-10-09
**Methodology corrected:** The audit doc called this DEFENSIBLE on a false premise (claiming the chosen namedX is re-checked at real mf in the empty branch; that branch only runs when there are no landings and simulates from `snap.cat.x`, not `namedX`). Census: for states where the held scan picks a namedX at mf=1, does the pick change at real mf (and would the real-mf arc from the picked namedX survive)? **Fixes applied:** (1) pick rule matches real code — chooses the good x NEAREST THE CAT whose held arc lands on a keeping floor (not first/leftmost); (2) survival check simulates the JUMP action (heldDir) from the picked x, not a walk; (3) added alive-at-start filter like sites 7/8.

- **States examined (alive-at-start filter):** 194
- **States filtered (start inside laser at all mf):** 0
- **Divergent states (mf=1 vs real-mf):** 194
- **Breakdown:** pick shifts = 0, pick dies at real mf = 194
- **Example divergent states:**
  - L1 catX=50 y=230 target=gem_b: mf=1 pick x=52 plat=floor(109..161@212) → mf=260 pick dies (held right)
  - L1 catX=278 y=230 target=gem_a: mf=1 pick x=275 plat=floor(154..206@270) → mf=400 pick dies (held left)
  - L2 catX=84 y=240 target=gem_a: mf=1 pick x=103 plat=floor(154..206@200) → mf=360 pick dies (held right)
- **Verdict:** **DEFECT-LIVE** — all 194 states show divergence. The namedX pick does not shift (0 pick shifts), but in every case the mf=1 pick is killed by the side laser at real mf when the JUMP action is simulated. The audit's DEFENSIBLE verdict rested on a false premise (the empty branch does not re-check namedX).

### Site 7 — `walkOffFatalNote` walk check (line 1073)
**Methodology corrected:** Adds alive-at-start filter — at high mf the side laser bounds close ~120px per side (see arc.cjs line 112 bounds test); a start position already inside the laser at that mf is a state the cat cannot be alive in and is excluded. Stops inflating the denominator: catX is enumerated but simulate is called at endX, so states are deduped by (level, floor, endX, side) and the distinct count is reported.

- **States examined (deduped by level,floor,endX,side, alive-at-start):** 230
- **States filtered (start inside laser at all mf):** 0
- **Divergent states (mf=0 vs real mf):** 74
- **Direction:** 74 false-safe (mf=0 → `landed`, real mf → `laser`), 0 false-fatal
- **Example divergent states:**
  - L0 side=left endX=40 y=250 mf=60 → mf=0:landed mf=60:laser (false-safe)
  - L0 side=left endX=86 y=210 mf=280 → mf=0:landed mf=280:laser (false-safe)
  - L1 side=right endX=102 y=230 mf=380 → mf=0:landed mf=380:laser (false-safe)
- **Verdict:** **DEFECT-LIVE** — the walk-off warning is suppressed in 74/230 distinct end-state geometries where the real side laser kills the cat. The model receives no warning for a lethal walk.

### Site 8 — `walkOffFatalNote` jump escape clause (line 1075)
**Methodology corrected:** The jump clause is only appended when the site-7 walk is NOT landed. Census conditions on that — counts jump divergence only where the walk is fatal.

- **States examined (deduped, alive-at-start, walk fatal only):** 107
- **States filtered (start inside laser at all mf):** 0
- **States skipped (walk lands at mf=0, jump clause not appended):** 123
- **Divergent states (mf=0 vs real mf):** 10
- **Direction:** 10 false-safe escape (mf=0 → `landed`, real mf → `laser`), 0 false-fatal escape
- **Example divergent states:**
  - L3 side=left endX=118 y=203 mf=420 → mf=0:landed mf=420:laser (false-safe-escape)
  - L4 side=left endX=199 y=93 mf=80 → mf=0:landed mf=80:laser (false-safe-escape)
  - L4 side=left endX=263 y=171 mf=360 → mf=0:landed mf=360:laser (false-safe-escape)
- **Verdict:** **DEFECT-LIVE** — the jump escape clause is appended in 10/107 states where the real side laser kills the jump. The model is told a safe jump escape exists when it does not.

**Methodology re-verified against the real code (2026-10-09, second pass).** `walkOffFatalNote` fires only when the cat is on a platform, within `reachEnd` of the floor end in the direction of the chosen objective (imminence gate), and the mf=0 walk from that end is fatal; it then evaluates the jump from the same end. Those gates decide *when* the two `simulate()` calls happen in play, but both calls take exactly `(level, endX, run.y, 0, catHeight, dir, mf, {grounded:true})` — the clock is the only varying input. The census enumerates and dedupes by precisely that input space, `(level, floor, endX, side)`, both sides for every floor, so coverage is complete and the denominators are the distinct simulation inputs, not the (larger) set of firing cat-positions. Site 8's conditioning on walk-fatal-at-mf=0 matches the real gate (the jump clause is only appended when the walk is not landed). No methodology change needed; the counts stand. `test_census_pins.cjs` now pins these outputs.

**Blast radius of the candidate fix, measured 2026-10-09 — NOT applied.** `driver/experiments/blast_site78_clock.cjs` compiles a variant passing `movingFramesOf(snap)` at both sites (same in-memory method and grid as `blast_site6_clock.cjs`, deterministic across reruns): **1,855/29,916 prompts change (6.2%)** — twelve times the site-6 radius — every one via the walk-off note line, zero menu entry-count changes, and **every level is affected** (L0 15, L1 93, L3 290, L7 264, L13 225 …). Site 6 was merged on a 0.5% radius with the clearing levels bit-identical; at 6.2% across all levels including the clearing ones, the live regression would have to cover the full clearing set on the production endpoint (clef), which this box cannot reach (no `DECISIONS_BASE_URL`). Left as a measured decision for the maintainer: the numbers say the fix is mechanically safe (no menu/RNG hazard) but behaviourally wide.

### Updated Summary Table

| Site | Function | Line | Clock | Verdict (pre-census) | Verdict (post-census) |
|------|----------|------|-------|----------------------|-----------------------|
| 5 | `buildObjectiveCall` descent cost | 791 | `0` | LATENT-DEFECT | **DEFECT-THEORETICAL** |
| 6 | `jumpLandingNote` held scan | 979 | real `mfNow` | DEFENSIBLE | **FIXED 2026-10-09** (census had it DEFECT-LIVE) |
| 7 | `walkOffFatalNote` walk | 1088 | `0` | LATENT-DEFECT | **DEFECT-LIVE** |
| 8 | `walkOffFatalNote` jump escape | 1075 | `0` | LATENT-DEFECT | **DEFECT-LIVE** |

Three of four constant-clock sites are **DEFECT-LIVE** (sites 6, 7, 8): divergent states exist in reachable synthetic geometry, and the divergence is exclusively in the dangerous direction (false-safe — the constant clock reports survival where the real laser kills). Site 5's verdict changed from LATENT-DEFECT to DEFECT-THEORETICAL because when conditioned on the descent actually being offered at real mf, the lost-gem set at mf=0 matches the lost-gem set at real mf in all 97 states. Site 6's verdict changed from DEFENSIBLE to DEFECT-LIVE because the audit's reasoning was based on a false premise (the empty branch does not re-check the held-scan pick at real mf).