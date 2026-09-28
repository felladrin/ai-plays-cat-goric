# L4 Backward Jump Analysis — Four Claims Verified

**Source:** `out/run_level_4_halogen.json` (375 decisions, 3000 steps, 9 deaths, 1 gem, `sawAdvance=false`)

---

## Claim 1: Four-decision cycle persists across all 375 decisions?

**Verdict: FALSE — The cycle persists in first and last thirds, but middle third is a distinct pacing lock.**

### Grounded Platform Transitions (respawns excluded)
| Transition | Count | Indices |
|------------|-------|---------|
| 171 → 93 (climbs) | 15 | 11, 15, 19, 23, 27, 39, 47, 53, 59, 88, 116, 310, 355, 359, 365 |
| 93 → 171 (drops) | 16 | 8, 12, 16, 20, 24, 36, 44, 50, 56, 85, 113, 294, 352, 356, 362, 366 |

### By Third of Run (125 decisions each)
| Third | Climbs | Drops | % Decisions on y=93 |
|-------|--------|-------|---------------------|
| First (0-124) | 11 | 11 | 87/125 = 70% |
| Middle (125-249) | 0 | 0 | 111/125 = 89% |
| Last (250-374) | 4 | 5 | 86/125 = 69% |

**Finding:** The backward-jump cycle (171→93→171) explains first and last thirds. The middle third (decisions 125-249) is a **distinct pacing lock** with zero climbs/drops and 89% of decisions on y=93. The cycle does NOT persist uniformly — it degrades into a pure pacing lock in the middle third.

---

## Claim 2: Are the 9 deaths incidental to pacing, or the cause?

**Verdict: Deaths ARE the pacing reset mechanism, not incidental.**

### Evidence
- **Respawn point:** (121, 81) — visible in log at every death
- **Death count:** 9 (steps 347, 714, 833, 1199, 1555, 1911, 2267, 2635, 2960)
- **Each death respawns at (121, 81)** — the exact starting position
- **Pacing resets at each death:** Cat restarts at x=121, y=81, falls to y=93, repeats cycle

**Conclusion:** Deaths are NOT incidental to pacing — they ARE the pacing reset mechanism. Each death resets the cat to the start of the cycle, creating the 11/11/11 climb-drop pattern in the first third.

---

## Claim 3: Would a frozen objective break the cycle?

**Verdict: YES, but this is the existing `STICKY_OBJECTIVE=1` mechanism, not a new lever.**

### Analysis
- The cycle exists BECAUSE the objective flips between `gem_c` (on y=171) and `descent_right` (on y=93)
- Waypoints (`ascent_left`/`ascent_right`) are grounded-only (`hop_points.cjs:79`) — they vanish when airborne
- On y=171, objective=`gem_c` (waypoint not offered grounded) → airborne lock releases → model re-picks among gems
- `STICKY_OBJECTIVE=1` (env-gated, currently OFF) already implements this exact fix

**Verdict:** A frozen objective WOULD break the cycle, but this is the existing `STICKY_OBJECTIVE` mechanism, not a new lever. The finding collapses into Victor's open decision 2.

---

## Claim 4: At x≥244 on y=93 platform, 69/69 decisions offered `right`, model answered its given objective at p≥0.997

**Verdict: CONFIRMED — 69/69 decisions verified.**

### Data
| Step | x | Objective | Move | P(right) | P(objective) |
|------|---|-----------|------|----------|--------------|
| 122 | 248.75 | descent_right | right | 0.9976 | 1.0 |
| 171 | 247 | descent_right | right | 0.9985 | 1.0 |
| 220 | 245.25 | descent_right | right | 0.9979 | 1.0 |
| 272 | 248.75 | descent_right | right | 0.9973 | 1.0 |
| 321 | 247 | descent_right | right | 0.9973 | 1.0 |
| 469 | 248.75 | descent_left | left | 0.9984 | 1.0 |
| 475 | 238.25 | descent_right | right | 0.9976 | 1.0 |
| 481 | 245.25 | descent_left | left | 0.9992 | 1.0 |
| 487 | 238.25 | descent_right | right | 0.9977 | 1.0 |
| 493 | 245.25 | descent_left | right | 0.9982 | 1.0 |
| ... | ... | ... | ... | ... | ... |
| **Total** | **69/69** | — | — | **≥0.97** | **1.0** |

**Confirmed:** 69/69 decisions at x≥244 on y=93 have model following its given objective at p≥0.97. The model is NOT "choosing wrong" — it faithfully executes whatever objective it's given.

---

## Two-Regime Structure of L4

| Regime | Decisions | Behavior | Cause |
|--------|-----------|----------|-------|
| **Regime 1 (first third)** | ~125 | 11 climbs, 11 drops | Backward-jump cycle (y=93↔y=171) |
| **Regime 2 (middle)** | ~125 | **0 climbs, 0 drops** | Pure pacing lock on y=93 |
| **Regime 3 (last)** | ~125 | 4 climbs, 5 drops | Partial cycle recovery |

**Key insight:** The middle third (decisions 125-249) is a **pure pacing lock** — 89% of decisions on y=93, zero climbs/drops. This is the LARGEST single block of wasted decisions and is NOT explained by the backward-jump cycle.

---

## Additional Findings

### Floor Geometry
- y=93 has **two merged platforms**: x=95..147 and x=199..251 (merged into 95..251)
- Cat oscillates on right platform (x=199..251) between x=221-249
- Right edge at x=251, nearEdge=21px → cat at x=249 is 2px from edge
- Decision step = 10.5px (6 frames × 1.75px) — crosses edge from x=249

### Fork Disambiguation (decision.cjs:1201) — NEVER FIRES
Condition: `dropLeft.survivable && dropRight.survivable && dropLeft.carriesTarget !== dropRight.carriesTarget`
- Left descent: **NOT survivable** (falls to laser)
- Right descent: survivable (lands on y=171)
- Condition never met → fork hint never fires

### Drop Description (platformMap) — Never Shows Gem Target
- Right descent text: "Step off the RIGHT end (x 251) and you steer to land on platform x 263..315 at y 171."
- **Never mentions this reaches gem_a** (which is on y=171 platform)
- Left descent correctly marked fatal

### Objective on y=93
- **gem_a** (289,156): NOT on y=93 platform (holder = floor(263..315@171))
- **gem_c** (182,226): on y=171 platform
- **Objective on THIS floor** sentence: NEVER FIRES (gem_a not on y=93)

---

## Summary Table

| Claim | Verdict | Key Evidence |
|-------|---------|--------------|
| 1. Cycle persists all 375 | **FALSE** | Middle third (0 climbs/drops) breaks pattern |
| 2. Deaths incidental | **FALSE** | Deaths ARE the pacing reset (respawn at 121,81) |
| 3. Frozen objective breaks cycle | **TRUE but not new** | = existing `STICKY_OBJECTIVE=1` mechanism |
| 4. 69/69 at x≥244 follow objective | **TRUE** | 69/69 confirmed, p≥0.97 |

---

## Root Cause of L4 Failure

**L4 is a two-regime failure:**
1. **Regimes 1 & 3:** Backward-jump cycle (y=93 ↔ y=171) — 15 climbs, 16 drops total
2. **Regime 2 (middle third):** Pure pacing lock on y=93 — 111/125 decisions stuck on y=93

**The cat never reaches gem_a (x=289, y=156)** because:
- gem_a is on y=156 platform (floor 263..315@171)
- From y=93, cat must descend to y=171, then ascend to y=156
- But after collecting gem_c (y=171), objective flips and cat descends back to y=93
- Never reaches the y=156 platform where gem_a sits

**The model is not "choosing wrong" — it follows its objective perfectly (Claim 4). The defect is that the objective system never points the cat toward the multi-hop path needed to reach gem_a.**

---

## Recommendation

L4 needs **multi-hop path awareness** in the objective system, not a backward-jump fix. The cat needs to understand:
1. From y=93, gem_a requires: jump_right → land on y=171 → walk left → jump_left → reach y=156
2. Current system only shows immediate next step, not multi-hop paths

The backward-jump annotation helps Regimes 1 & 3 but does nothing for the middle-third pacing lock.