# Prediction: 53e0a9e "Charge the ceiling prune for the laser it cannot see"

Written 20:56, batch launched 20:54:10, runs not yet complete.

## What changed
`needed` for the ceiling prune went 57.6px → 59.3px:
`rise + droneSpeed*(frames+1) + maxLaserHalfSize` instead of
`rise + droneSpeed*frames`. `CEILING_TIE_EPSILON_PX` deleted, no tolerance on
the comparison. The band the fix newly prunes is head clearance in
**[57.6, 59.3)**; within it, [57.6, 58.55) is certain death and (58.55, 59.3) is
the model's 0.75px uncertainty.

## Prediction, from the archived variance artifacts not from a guess
For every one of the 10 archived runs, count grounded decisions with head
clearance in [57.6, 59.3):

- **L5, all 5 runs: 0.** Min clearance 55.60, already pruned by the old rule.
- **L8, all 5 runs: 0.** Min clearance 20.60, already pruned by the old rule.
- Gradient band (58.55, 59.3): **0 on both levels.**

So the fix changes no decision these two levels reach, and both re-runs must
come back at 2/94/3/908 (L5) and 1/45/3/643 (L8), identical to the archived
twins. L8 run 1's known 4th-decimal `moveProbs` quirk may reappear; argmax and
all counts must not move.

**Falsifier:** any decision, death, or step-count difference between the new
runs and `out/runs/var_*` would mean the fix changed a reachable state, and the
band count above is wrong.

## Correction to the variance report
That report gave L8's minimum head clearance as 11.00px. Recomputed from the
same artifacts it is **20.60px**. The 11.00 figure is not reproducible and should
not be cited. L5's 20.00px is likewise superseded by 55.60px. Neither affects
the ticket counts, which are measured on the individual jumps.
