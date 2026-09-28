# Audit — All Numeric Values in Prompt Strings

**Status: audit complete.** Produced by `nemotron-3-ultra-free`; supervisor task: "audit ALL numeric values in prompt strings for correctness."

Context: jumpApex fix changed prompt literal 61.2→54.4px (L7 now passes 5 runs byte-identical). `arc.simulate` returns x one walk-step (1.75px) past snap position — affects `walkOffFatalNote`, `hopPoints`, `jumpLandingNote`, `descentPoints`.

---


> ## SUPERVISOR CORRECTION — the 59px rows below are wrong, 2026-09-27
>
> Rows **2** and **8** propose deriving the "about 59px sideways" literal from
> `jumpApex().frames`, i.e. **16 frames**, optionally doubled as "bidirectional".
> **Both are wrong and the proposal was rejected before implementation.**
>
> `jumpApex().frames` is the **rise only** — the frames until vertical velocity
> turns positive. The cat travels sideways for the **whole airborne duration**,
> rise *and* fall. Computed from `physics.cjs`:
>
> ```
> rise frames          16  ->  28.00px    <- what rows 2 and 8 would render
> full airborne frames 33  ->  57.75px    <- actual, same-height landing
> current literal                 "about 59px"
> ```
>
> So the existing literal is within ~1.25px of the truth and the proposed
> "fix" would **halve it**. "Bidirectional ×2" is not meaningful: the cat holds
> one direction for the arc.
>
> **The real problem is structural, not numeric.** Measured with `arc.simulate`
> on live geometry, sideways travel is **43.75px on L7 and 85.75px on L4** —
> a jump landing *lower* stays airborne longer and travels further. The prompt
> states one constant for a quantity that varies by a factor of two. The fix is
> therefore either a state-dependent value or a constant labelled honestly as
> the same-height case — not a different constant.
>
> This is the same error shape as the 61.2px literal that cost this project a
> level: a plausible number, correctly derived from a real quantity, describing
> the wrong thing.


## Categorised Findings

### 🔴 CRITICAL — Wrong Value Currently Rendered

| # | Location | Current Rendered Value | Correct Value | Source of Truth |
|---|----------|------------------------|---------------|-----------------|
| 1 | `experiments/decision.descent-experiment.cjs:766` | `"A jump lifts the cat up to 61.2px"` | 54.4px (via `jumpApex().rise`) | `decision.cjs:174-199` `jumpApex()` |
| 2 | `decision.cjs:902` | `"about 59px sideways"` | ~59px is correct for max horizontal (16 frames × 1.75 × 2 = 56px, but with steering it's variable) | Physics: max frames 16, catWalkSpeed 1.75, bidirectional |
| 3 | `decision.cjs:1429` | `${apex.rise.toFixed(1)}px` → "54.4px" | ✅ Correct (uses `jumpApex()`) | — |

### 🟠 HIGH — `arc.simulate` x-Offset Bug (1.75px)

**Root cause:** `arc.simulate` loop applies horizontal movement `x += dx` **before** the landing check at frame `f`, but the snap position is at frame 0. The returned `x` is one walk-step (1.75px) past the launch x.

**Affected functions** (all call `simulate` with `grounded: true` and use returned `x` in prompt strings):

| # | Function | File:Line | How Returned `x` Used in Prompt |
|---|----------|-----------|----------------------------------|
| 4 | `walkOffFatalNote` | `decision.cjs:810, 812` | `r.x` in "lands safely on x ${Math.round(r.x)}" |
| 5 | `hopPoints` / `higherLandings` | `hop_points.cjs:56, 104` | `r.x` in label: "reachable by jumping ${side} from around x ${Math.round(best.launchX)}" — wait, uses `launchX` not `landX`. But `best.landX = r.x` stored at line 120, used at line 138 for `x:` field (not rendered). Label uses `launchX` — **may be OK**. |
| 6 | `jumpLandingNote` | `decision.cjs:701, 716, 751` | `r.x` at line 718 for `REACH.platformKeyUnder` — internal, not rendered. At line 726 `heldX` (launch x) used for `namedX` — rendered in windowTail: "walk to around x ${namedX}". **launch x is correct**. |
| 7 | `descentPoints` | `decision.cjs:1287` | `hr.x` at line 1289 for `platformEdges` match — internal. `hr.y` at line 1292 rendered: "at y ${Math.round(hr.y)}". **y is correct** (vertical unaffected). |

**Assessment:** The x-offset primarily affects `walkOffFatalNote` rendered output. `hopPoints` uses launchX in label (correct). `jumpLandingNote` uses launch x for window (correct). `descentPoints` renders y only (correct).

### 🟡 MEDIUM — Hardcoded Approximations Should Be Computed

| # | Location | Current | Should Be |
|---|----------|---------|-----------|
| 8 | `decision.cjs:902` | `"about 59px sideways"` | Compute from `jumpApex().frames * CFG.catWalkSpeed * 2` (max bidirectional) or `jumpApex().frames * CFG.catWalkSpeed` (one direction) |
| 9 | `decision.cjs:1429` | `apex.rise.toFixed(1)` | ✅ Already computed |
| 10 | `decision.cjs:133` | `SAME_FLOOR_Y = 40` | Used in `hopPoints` gate, not directly rendered |

### 🟢 LOW — Tolerances & Constants (Verify Consistency)

| # | Constant | Value | Used In Prompts? | Consistency Check |
|---|----------|-------|------------------|-------------------|
| 11 | `Y_TOL` / `platformKeyUnder` tol | 14px | No (internal) | `decision.cjs:354, 415, 1213`; `hop_points.cjs:28`; `reachability.cjs:123` — all 14 ✅ |
| 12 | `platformHolding` tol | 70px | No (internal) | `decision.cjs:654, 145`; `reachability.cjs:145` — all 70 ✅ |
| 13 | `CAT_REACH_UP` | 24px | No (internal flag for walk-reachable) | `decision.cjs:367` only |
| 14 | `platformEdges` half-width | 20px | No (internal) | `decision.cjs:940-943` — `CFG.platformWidth / 2` |
| 15 | `SAME_FLOOR_Y` | 40px | No (internal gate) | `hop_points.cjs:26` |
| 16 | `catWalkSpeed` | 1.75px | Indirect (grid steps, reach calc) | `physics.cjs:7` — single source ✅ |
| 17 | `maxLaserHalfSize` | 1.5px | No (internal laser bounds) | `physics.cjs`; `arc.cjs:108-111`; `decision.cjs:253` — all 1.5 ✅ |

### 🔵 INFO — Computed Values Rendered Correctly (Verify Only)

These are **computed at render time** from game state — audit confirms they use correct formulas:

| # | Value | Rendered In | Formula Source |
|---|-------|-------------|----------------|
| 18 | Safe rectangle bounds | `buildObjectiveCall:338-340`, `buildMoveCall:850-852`, `buildLayaMoveCall:1414` | `safeRect(snap)` → drone positions |
| 19 | Cat position (x, y) | Multiple | `snap.cat.x`, `snap.cat.y` |
| 20 | Straight-line distance to objective | `describe:388`, `descentPoints:588`, `ascentPoints:598` | `Math.hypot(dx, dy)` |
| 21 | Laser margin (min, side) | `describe:388`, `descentPoints:583`, `ascentPoints:597` | `gemMargin()` → `safeRect` |
| 22 | Cat margins (left, right, top, bottom) | `buildMoveCall:887-889` | `catMargins(snap)` |
| 23 | Head clearance (headTop) | `buildMoveCall:906`, `buildLayaMoveCall:1429` | `catMargins(snap).headTop` |
| 24 | Jump apex rise | `buildMoveCall:902`, `buildLayaMoveCall:1429` | `jumpApex().rise` (54.4px) ✅ |
| 25 | Countdown frames | `countdownLine:129, 133` | `framesUntilLaserAtCat()` vs straight-line / catWalkSpeed |
| 26 | Vertical velocity | `buildMoveCall:1424`, `buildLayaMoveCall:1424` | `snap.cat.dy` rounded to 0.1 |
| 27 | Descent/ascent landing platform | `descentPoints:1298`, `hopPoints:141` | `simulate` result → `platformEdges` → `Math.round` |
| 28 | Jump launch window (lo..hi) | `jumpLandingNote:784` | `REACH.landingsFrom` scan at `catWalkSpeed` grid |
| 29 | Named launch x (held-arc verified) | `jumpLandingNote:784` | `arc.simulate` held-arc scan |
| 30 | Walk-off imminence distance | `walkOffFatalNote:808-809` | `CAD.GROUND_DECIDE_FRAMES * catWalkSpeed` |
| 31 | Platform x-ranges in platformMap | `platformMap:1047, 1096-1097, 1139-1140` | `platformEdges` + `Math.round` |
| 32 | Drop reachable platforms | `platformMap:1096-1097` | `framesToFall * catWalkSpeed` envelope |

---

## Specific Fixes Required

### Fix 1: Experiment File Hardcoded 61.2px
**File:** `experiments/decision.descent-experiment.cjs:766`
```javascript
// CURRENT (WRONG):
`A jump lifts the cat up to 61.2px and carries it up to about 59px sideways while a direction is held.`
// FIX: Use jumpApex() like main decision.cjs
const apex = jumpApex();
`A jump lifts the cat up to ${apex.rise.toFixed(1)}px and carries it up to about ${Math.round(apex.frames * CFG.catWalkSpeed)}px sideways while a direction is held.`
```

### Fix 2: walkOffFatalNote x-Offset
**File:** `decision.cjs:810, 812`
```javascript
// CURRENT: uses r.x from simulate (1.75px past snap)
// The simulate call at line 812 is for the JUMP from the edge, not the walk-off.
// The walk-off simulation at line 810 uses {grounded: true} with dir="left"/"right" (no jump)
// and returns r.x where the cat lands after walking off.
// The x-offset applies here too: returned x is 1.75px past the edge.
// FIX: Subtract catWalkSpeed from returned x for display, or use endX directly.
const endX = dir === "left" ? run.left : run.right;
// For the jump check at line 812, the jump launch x IS endX (correct).
// For the walk-off at line 810, the landing x is r.x - 1.75 (approximately).
// Better: use the known endX for the "step off at x" text, don't use r.x for walk-off.
```

### Fix 3: "about 59px sideways" → Computed
**File:** `decision.cjs:902`
```javascript
// CURRENT:
`A jump lifts the cat up to ${jumpApex().rise.toFixed(1)}px and carries it up to about 59px sideways while a direction is held.`
// FIX:
const apex = jumpApex();
const maxSideways = Math.round(apex.frames * CFG.catWalkSpeed);
`A jump lifts the cat up to ${apex.rise.toFixed(1)}px and carries it up to about ${maxSideways}px sideways while a direction is held.`
// maxSideways = 16 * 1.75 = 28px one way, or 56px bidirectional. "59" was approximate.
```

### Fix 4: Verify jumpHitsCeiling Threshold Consistency
**File:** `decision.cjs:253` vs `legalActions:267` vs `buildMoveCall:899, 1431`
```javascript
// jumpHitsCeiling (line 253): rise + droneSpeed * (frames + 1) + maxLaserHalfSize
// = 54.4 + 0.2 * 17 + 1.5 = 54.4 + 3.4 + 1.5 = 59.3px
// legalActions (line 267): calls jumpHitsCeiling
// buildMoveCall (line 899, 1431): compares headTop < apex.rise + droneSpeed * apex.frames
// = 54.4 + 3.4 = 57.8px (missing +1 frame and +1.5px thickness!)

// SUPERVISOR NOTE: jumpHitsCeiling now includes maxLaserHalfSize (1.5px) and +1 frame.
// buildMoveCall warning at line 1431 does NOT include these — it will warn LATE.
// line 1431: if (lcm.headTop < apex.rise + require("./physics.cjs").droneSpeed * apex.frames)
// Should be: if (lcm.headTop < apex.rise + droneSpeed * (apex.frames + 1) + maxLaserHalfSize)
```

---

## Validation Plan

| Check | Method | Expected |
|-------|--------|----------|
| Jump rise = 54.4px in all prompts | Run L7, grep prompt dump for "jump rises" | All show "54.4px" |
| Experiment file fixed | Run experiment, grep for "61.2px" | Zero matches |
| walkOffFatalNote x matches reality | Manual verify L4 y=171 floor end | "lands at x" matches actual landing |
| Sideways distance = 28px (one way) | Check prompt at L4 start | "about 28px sideways" |
| buildMoveCall warning threshold = jumpHitsCeiling | Compare line 1431 vs line 253 | Identical formula |
| No other hardcoded physics literals | Grep for `\d+\.\d+px` in prompt strings | Only computed values |

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| 🔴 Critical (wrong value rendered) | 1 | Fix experiment file hardcoded 61.2px |
| 🟠 High (simulate x-offset) | 1 | Fix walkOffFatalNote displayed x |
| 🟡 Medium (hardcoded approximations) | 1 | Compute sideways distance from apex.frames |
| 🟢 Low (tolerances) | 7 | Verify consistency — all ✅ |
| 🔵 Info (computed correctly) | 15 | No action needed |

**Total actionable fixes: 3** (plus 1 threshold consistency fix in buildMoveCall).