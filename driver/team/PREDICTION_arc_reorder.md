# Prediction — arc.simulate collision/laser reorder

**Written before the change, before the runs.** Recorded so it cannot be
reinterpreted afterwards. Hypothesis and framing are the `space-bunny-free`
instance's; the supervisor captured it and verified the supporting numbers.

## The change

`arc.cjs` evaluates the platform collision at `x`, then does `x += dx`, then
evaluates the laser — **two positions inside one frame**. The game never does
this: `updateCatSprite` runs the collision (`:32-38`) and the laser test
(`:65`) on one position, with no x mutation between them. Move the return above
the increment so both tests and the reported landing share a position.

**Not `x - dx`.** That makes the returned number honest while leaving the split
evaluation in place.

## Why it is justified (measured, before the change)

```
                   drops fixed   misattributions fixed   invented
reorder                 41                21                0
widen ±1 -> ±2          30                 0                0
```

`hop_points.cjs:56,104` attributes landings with a **±1px tolerance against a
1.75px offset**, then `continue`s silently. `higherLandings`/`hopPoints` feed
the objective menu at `decision.cjs:1128` and `:1310`, so a dropped hop is an
ascent point the model is never offered, and a **misattributed** hop names a
platform the cat will not reach.

Widening the tolerance was measured, not assumed: it invents nothing, but it
recovers **none** of the 21 misattributions. A confident wrong answer is worse
than silence, so the reorder wins.

**Caveats carried from the census:** 41 is an upper bound (counted at mf=0);
downstream filters mean **at most ~20** menu entries are actually restored; the
laser-response column was omitted because its expression was broken and a zero
that isn't trusted is worth less than no column.

## THE FALSIFIABLE PREDICTION

L12 carries **4 material drops and all 7 misattributions**, and is measured
**deterministic and stuck at 0 gems** across two samples on this build
(2905/14/384/0 and 2984/14/383/0).

**Hypothesis: L12's zero gems is downstream of its ascent points naming the
wrong platform.**

- **If the reorder lands and L12 collects ≥1 gem** — the misattributions were
  the blocker, and the same defect is worth checking on every level.
- **If the reorder lands and L12 still returns 0 gems** — the misattributions
  were *not* the blocker. The change is then justified by the L10 drops alone,
  and that is a materially weaker case which must be stated as such rather than
  quietly kept.

L14's 14 misattributions are excluded from the justification: it is never
played. Both halves of the case rest on L10 and L12, which are real failures.

## What must not change

The reorder alters frame counts on ~13.9% of calls and outcomes on 0.16%
(measured over 157,320 calls). L8 and L5 are the observed-identical pair
(45/1/643 and 94/2/908 → 98 after the inset) and must be re-run after.
