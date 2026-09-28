# Prediction: arc.cjs four bounds inset by maxLaserHalfSize

Written before the change, before the runs. Following the rule that has held all
session: a prediction on disk that a later run can be judged against.

## The change
`driver/arc.cjs:71-74` inset by `maxLaserHalfSize` (1.5), inward on all four:
top and bottom on y, left and right on x.

## Why 1.5 and not the expected-cost figures
Expected cost, prune unless P(survive) >= 0.8: **1.351px** single-draw, and
1.467px if the five near-apex frames were all equal. 1.5 is above both, it is
certain rather than probabilistic, it needs no assumption about detour cost that
we have one measurement of, and the gap to either figure is under one frame of
laser travel (0.2px). Certainty is the simpler rule and it is the one in.

## What this fixes
The two files disagreed. decision.cjs modelled the ceiling as
`peak closure 57.8 + 1.5 = 59.3px`; arc.cjs modelled it as the bare drone
centreline. States in that 1.5px band had `jumpHitsCeiling` pruning the jump
from the menu while `simulate`, asked about the same jump, reported a landing.
After this change both use 1.5 and the menu and the annotations agree.

## The deeper finding, since RETRACTED
This section originally claimed the top bound needed 2.301 rather than 1.5, and
reported a "75.11% predicted against 75.0% observed" match at L4 y=93 mf=70 as
validation. **Both were wrong, and from the same cause.** The per-frame
requirement peaks at frame 17 and every neighbour is strictly below it, so the
peak alone binds and 1.5 is the certainty bound; the 2.301 came from *adding*
the neighbours' 0.8px gap below the peak instead of subtracting it. The same
inverted sign put a spurious survival probability in the per-frame product,
which is where the 75.11% came from. Computed correctly, mf=70 at headTop 60.0
is **certain** survival of the top laser, not 75%.

That leaves the two deaths recorded at mf=70 unexplained by the ceiling model,
which is consistent with the standing caveat that side and bottom laser exposure
has never been measured. It is not evidence for any particular bound.

**Falsifier:** any change in deaths, decisions, gems or steps on either level.
The runs are observed-identical, so a difference means the inset reached a state
these levels actually visit, and the affected-arc count in the report is wrong.

## Result
L8 `1/45/3/643` and L5 `2/98/3/908`, both `cleared=true`, both reproduced twice.

L8 unchanged. L5 gained four decisions and nothing else: same 908 steps, same 2
deaths, same clear. All four are airborne (52 -> 56; grounded 42 -> 42), all in
life 1, all `modelAsked=false`, all choosing the same held `left` as the
decision the pre-change run made and died from. Lives 2 and 3 are identical in
decision count, step range and every position.

So the inset costs four extra move classifications on one arc, and changes
nothing about where the cat goes. Note that `modelAsked` cannot detect this:
it reports whether the *objective* was re-asked, and the move is classified
unconditionally at decision.cjs:1931-1933.

