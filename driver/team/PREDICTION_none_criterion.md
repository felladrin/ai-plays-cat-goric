# PREDICTION — the `none` criterion, and the L9 falsifiable test

Written before the L9 run. No endpoint call has been made against the patch.

## The change

`driver/decision.patched_none.cjs`, a byte-identical copy of `decision.cjs` (md5
`46f12d914a49f02c6d34828a0a539af6`) with exactly two string literals changed and nothing
else. Verified by diffing the two files with comment lines stripped: two lines, both the
literal. No logic touched.

Two sites, because the false text existed twice and one of them is the scored text:

| site | role |
|---|---|
| `legalActions` airborne branch (`:316` in HEAD) | the option label |
| `dirCriteria.none` (`:1571` in HEAD) | **the scored criterion** — this is what the classifier ranks |

```
-  none: "keep current trajectory, no steering",
+  none: "no sideways movement; up or down unchanged",
```

Same replacement at both sites.

## Why that string, and what was rejected

`src/scripts/functions/commands/updateCatSprite.ts:42` is
`catSprite.dx = isMovingLeft ? -catWalkSpeed : isMovingRight ? catWalkSpeed : 0;`. It sets
`dx` and nothing else. Choosing `none` zeroes the HORIZONTAL component; the vertical is
left to gravity exactly as it would be under `left` or `right`.

So the true sentence is about sideways motion and must be **silent about up and down**.
Measured by the supervisor across L3/L6/L10/L11: of 1204 airborne decisions, **617 have the
cat RISING** — 51.2 percent. A jump's ascent is ~16 frames and the airborne cadence is 3, so
this criterion is shown repeatedly while the cat is still going up. Any claim about vertical
direction is therefore false about half the time.

Rejected intermediate: `"stop steering, fall straight down"`. It is false in the same way the
text it replaces was — a false claim about vertical direction instead of a false claim about
horizontal momentum — and it fires on the majority of decisions rather than the minority. My
first draft of the accompanying comment made the same error ("pins x and the cat keeps
falling") and was corrected with the string.

This is the third criterion in this project found asserting something the game does not do:
the `ascentCost` union bug, the `none` momentum claim, and now nearly a third introduced by
the fix for the second. The pattern is that these strings get written from intent rather than
from the physics line that implements them, and they are scored text, not documentation.

## Baseline provenance, and the confound

There is exactly ONE L9 archive on disk:

```
PRE_L9_run_level_9_halogen_20260926-190421.json   2 deaths, 107 dec, 1313 steps,
                                                    39 airborne, none chosen 0
```

It is **pre-arcfix** (the arc.cjs fix committed 13:53:10; this run is stamped 20260926-190421).
So a scoreboard comparison of the new run against it spans two changes — the `none` text AND
the arc fix. That is the same confound that produced the wrong L3 attribution, and I am
recording it here rather than discovering it after the run.

**The test survives the confound because it is a mechanism test, not a scoreboard test.** The
predictions below are about what the model does INSIDE the run — whether it ever selects
`none`, and whether the cat descends to the portal — both directly observable in the run's own
log. Neither needs a clean A/B. I am NOT predicting a deaths count, and no deaths number from
this run should be read as attributable to the `none` text.

## The case, so the prediction is falsifiable

L9 collects all three gems across four stretches, selects `portal` in 56 of 59 decisions in
those stretches, and each stretch ENDS with the cat GROUNDED at (180,101) / (166,101) /
(160,101) — holding three gems, on a platform whose right edge is x=182, directly above a
portal at (180,150) 49px below, unable to descend.

The portal box is `[164..196] x [134..166]`. Walking right off the edge at 182, the cat keeps
its 1.75px/frame drift and is at ~209 by the time it reaches the box's y range — 27px past
the right edge. `platformKeyUnder(9,180,150)` is null: the portal hangs in the gap between
the y157 platforms at 67..119 and 198..250.

`none` is the only action that stops the drift, and holding it after stepping off drops the
cat straight down from x≈183.5, which is inside the box.

## Predictions

**P-A — the model selects `none` at least once.** Baseline: chosen 0 times in 39 airborne
decisions on the one L9 archive; the supervisor's wider count over the dumps is 0 of 80
offered, mean P 0.0231, max 0.2868.

> Falsifier: `none` chosen 0 times again. Then the corrected text did not move the choice at
> all, and the defect is not the wording — it would be either that the state text dominates
> the criteria, or that the model has no reason to prefer stopping. Either way this change is
> refuted as a fix and I will say so rather than try a third wording without a measurement
> that distinguishes it.

**P-B — at least one gem-complete stretch that ended grounded at (180,101) instead ends with
the cat airborne past the platform's right edge, descending toward the portal box.**

> Falsifier: the cat still parks grounded at (180,101) and never enters the box. Then the
> wording change alone does not fix L9, and whatever blocks the descent is elsewhere — most
> likely the grounded move call never walks to the edge at all, in which case `none` is never
> even offered on the relevant decision and P-A becomes vacuous.

**Explicitly NOT predicted:** the level clearing, the deaths count, or any scoreboard
number. And not predicted: that `none` is chosen *often*. If the cat needs to stop drifting
twice per level and takes it twice, that is a pass. Choosing it constantly would be a new
problem, not a success.

## If both hold

The next step is NOT to enable `LANDDESC_HELD`. He set that order earlier: correct the `none`
criterion on its own, re-run L9, and only then consider `LANDDESC_HELD`, and not without
re-running L4 both ways — his r7 measurement made L4 worse, 21 deaths against 13, with a new
dominant class of 16 deaths at (76,115) missing E's left edge at 79 by 3px, which is the same
overshoot shape.
