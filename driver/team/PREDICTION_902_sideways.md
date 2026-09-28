# Prediction — decision.cjs:902 Sideways Distance Fix

**Status: pre-registered.** Written before any implementation or measurement.

---

## The Change

**File:** `driver/decision.cjs:902`  
**Current:** `"A jump lifts the cat up to ${jumpApex().rise.toFixed(1)}px and carries it up to about 59px sideways while a direction is held."`  
**Proposed:** `"A jump lifts the cat up to ${jumpApex().rise.toFixed(1)}px and carries it up to about 58px sideways if landing at the same height; more if landing lower."`

---

## Physics Basis

| Phase | Frames | Horizontal (1.75px/frame) |
|-------|--------|---------------------------|
| Rise (dy -6.8 → 0) | 16 | 28.0px |
| Fall (0 → +6.8 equivalent) | ~17 | ~29.8px |
| **Total same-height** | **~33** | **~57.75px** |

Current literal "59px" is within 1.25px for same-height landings.

Measured variance across levels (via `arc.simulate` on real geometry):
- L7 (lands higher): 43.75px
- Same-height: 57.75px
- L4 (lands lower): 85.75px

The quantity varies by **factor of 2** depending on fall distance.

---

## Predicted Effects by Level Class

### Deterministic Levels (L5, L8 — byte-identical runs)
- **Expectation:** No measurable change in decisions or deaths.
- **Reason:** The sentence is read on every grounded decision, but the model's jump vs walk choice is dominated by objective proximity, stranding warnings, and gapMsg. A 1px correction to an "about" claim on a variable quantity should not flip argmax.
- **Validation:** Zero argmax flips expected at jump decision points.

### Mixed Levels (L4 — start floor deterministic, A-floor & y=171 laser-proximal)
- **Expectation:** No measurable change on start floor. Possible noise on A-floor/y=171 but direction unpredictable.
- **Reason:** On start floor the model already jumps correctly (gapMsg dominates). On A-floor the jump is already fatal due to laser proximity; the sideways claim is not the binding constraint.
- **Validation:** Record jump_right probability at A-floor x=289. Expect ≤0.05 change.

### Laser-Proximal Levels (L2, L3, L6, L10 — 2.2× spread)
- **Expectation:** Distribution shift indistinguishable from noise.
- **Reason:** Irreproducibility is confined to laser-proximal routes. A one-word change in a constant sentence cannot overcome 2.2× variance.
- **Validation:** Report median death count; expect overlap with baseline CI.

---

## Falsification Criterion

**The change was WRONG if any of these occur:**

1. **Deterministic level regression:** L5 or L8 clear rate drops, or new death pattern appears (e.g., walking off edges that were previously jumped).
2. **Argmax flip on jump decision:** On any level, a grounded decision that previously chose `jump_left`/`jump_right` now chooses `left`/`right` (or vice versa) AND the flip correlates with the sentence change.
3. **L4 A-floor deterioration:** Deaths at A-floor (x=289) increase by >2 per run median.
4. **New failure mode:** A level that previously cleared now fails, and the failure trace shows the model "believing" the 58px number and jumping short.

**The change was NEUTRAL if:**
- All deterministic levels show zero decision changes at jump points.
- Laser-proximal levels show median death counts within baseline variance.
- No new failure traces cite the sideways distance as a factor.

**The change was RIGHT if:**
- No measurable effect anywhere (the sentence was noise all along).
- This is the expected outcome — the fix is honesty, not leverage.

---

## Why This Prediction Is Pre-Registered

The supervisor's discipline: "A prediction written after the numbers arrive is worth nothing, and this team has already used that discipline twice to catch itself." This prediction is recorded before any measurement is executed.

---

## Measurement Protocol (Revised)

**No flag. No level runs.**

1. Create `driver/decision.patched902.cjs` as a copy of `decision.cjs` with the single-line change at line 902.
2. Run `driver/experiments/probe_move.cjs --patched driver/decision.patched902.cjs` against every archived decision state we hold.
3. Report:
   - Total decisions re-scored
   - Number of argmax flips (choice changed)
   - List of flipped decisions: level, step, old choice → new choice, probability delta
   - Largest probability delta across all decisions (even non-flips)
   - Breakdown by decision type: grounded jump decisions, grounded walk decisions, airborne
4. **Only if** the probe shows argmax flips on grounded jump decisions do we spend level runs, and only on the levels where they appear.

**Rationale:** The probe replays archived decisions offline, reconstructing prompts field-by-field. It scored 280/289 L11 decisions byte-exact and reproduces the d108 A/B probability vectors. A claim of "no argmax flips at grounded jump decisions" is a population claim — test it over the population (hundreds of states) in seconds, not by inferring from death counts across dozens of runs. An argmax flip at a named decision on a known state is attributable; a death count moving by two is not.

---

## Related Work (Sequencing)

Per supervisor: "The worker's floor-continuity clause lands first and is measured alone. Yours goes second, measured alone."

This change is **second in queue** behind the floor-continuity clause (which has a measured failure: L11 d108, jump_right 0.85228 over right 0.11933). This change has no named failing decision — it is a truthfulness fix.