# PREDICTION — attribution: is L0's 32-decision regression the crit or the lock?

Written BEFORE the run. No run has been made against `decision.patched_lockonly.cjs`.

## The stack under test

| arm | file | change 1 (gate) | change 2 (ascent crit) | change 3 (airborne lock) |
|---|---|---|---|---|
| baseline (shipped) | `driver/decision.cjs` | no | no | no |
| **this run** | `driver/decision.patched_lockonly.cjs` | YES | **NO** | YES |
| (the run that regressed) | `driver/decision.patched_airborne.cjs` | YES | YES | YES |

`decision.patched_lockonly.cjs` was built by applying ONLY hunks 3, 4 and 5 of the
ascent->airborne diff to the gate-only arm, then verified two ways: it differs
from `decision.patched_airborne.cjs` in hunks 610 and 617 ONLY (i.e. the crit is
the sole thing removed) and from `decision.patched_ascent.cjs` in hunks 854, 2008
and 2064 ONLY (i.e. the three lock hunks and nothing else). It loads
`./hop_points.patched.cjs` at :1420. So the crit and the lock are separable by
construction, not by assertion.

## Why the attribution is open at all

L0 under gate+crit+lock: `ascent_right x31` between `gem_a x1` and `gem_c x3`,
37 decisions, 294 steps, still cleared. Baseline: 5 decisions, 78 steps, cleared.
L0 has one distinct outcome across seven files all session.

The 31 decisions split 15 airborne / 16 grounded (airborne indices 7, 9, 16, 18,
19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 31). `STICKY_OBJECTIVE` is set nowhere in
run.sh, lvl.sh or run_level.cjs, so `STICKY` is false in every run we have done,
so `(STICKY && sameSituation)` is false at every decision, so **a grounded
decision is never held**. Therefore the 16 grounded `ascent_right` decisions were
RE-PICKED by the model, and the lock can account for at most the 15 airborne ones.
The earlier "held 31 times until the cap released it" reading was wrong, and the
31-against-30 coincidence is what produced it.

## Registered prediction

**L0 under gate+lock, NO crit, will NOT return to 5 decisions / 78 steps.**

Reasoning: the 16 grounded re-picks happened with no lock in force, so the lock is
not a candidate explanation for them. The only change in this arm that can move a
grounded decision is the crit's absence — but the crit is REMOVED here, so if the
crit were the magnet, removing it should return L0 to 5/78. My prediction is that
it will not, which means the re-picks have a third cause I have not identified, and
that cause is present in the SHIPPED build rather than in this session's changes.

This is the refutable form, and the refutation is the informative outcome:

| L0 result | reading |
|---|---|
| **5 / 78** | PREDICTION REFUTED. The crit was the magnet. The lock is exonerated and the release condition becomes a separate correctness fix. |
| ~37 / ~294 | PREDICTION HOLDS. Not the lock, not the crit — a third cause in the shipped build, and the first hypothesis that survives is that the ascent_right candidate is simply what the model picks on L0 and the change stopped mattering. |
| cleared, but not 5 / 78 | partial. The number is the measurement; report it as measured and do not re-describe it as a pass. |

A run that does not clear is a regression by the gate and stops the sequence
regardless of which arm is guilty.

## Stop condition (unchanged)

Do not start L2, L5, L7, L8 or L11. L0 alone, one run, not a loop.
