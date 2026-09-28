# PREDICTION — arrival release, gate+lock+arrival on L0

Written BEFORE the run. No run has been made against the arrival build.

## The stack under test

| arm | file | change 1 gate | change 2 ascent crit | change 3 airborne lock | change 4 arrival release |
|---|---|---|---|---|---|
| pinned baseline (06:16) | `driver/decision.cjs` @ HEAD | no | no | no | no |
| last run (37/294) | `decision.patched_lockonly.cjs` | YES | no | YES | no |
| **this run** | `driver/decision.patched_lockonly.cjs` + the arrival hunk | YES | no | YES | **YES** |

The arrival hunk is a single change inside the existing `if (memo)` block: when
the chosen waypoint's carried target names the floor the cat is standing on, the
lock is not re-established (`memo.lockedObjective = null`, `lockTarget` cleared).
`carriedTarget` is non-null only for a waypoint, so gems and the portal are
bit-identical. The commit cap stays as the backstop.

## THE TWO PREDICTIONS, WHICH DISAGREE

**Supervisor's prediction: L0 returns to 5 decisions / 78 steps**, because the
feedback loop has no other entry point than arrival.

**My prediction: L0 does NOT return to 5/78. I expect 37/294 again, or within
two decisions of it.**

I am recording the disagreement rather than deferring to it, because the
reasoning behind mine is checked against the run's own dump and the reasoning
behind the supervisor's is not. Read the two apart:

**FACT, read off `/tmp/prompt_dump_L0_20260927-100057.jsonl`:** the cat is
grounded on y=210 for decisions 8, 17, 23 and 30, on y=250 for 2-6 and 10-15,
and on y=290 for decision 1. It is **never grounded on y=180 anywhere in
decisions 1-31**. y=180 first appears grounded at decision 33, by which point
the objective is already gem_c.

**FACT:** L0's runs are y290 x4..56, y250 x40..92, y210 x86..138, y180 x134..186.
The cat loops on y210, so the only run above it is y180 — the floor
`ascent_right` names.

**FACT:** at decisions 19-22 the cat is airborne at y=177.6, 166.8, 159.6 and
156. It goes **above** the y180 run and comes back down to y210.

**INFERENCE (mine, and the only step that is not a fact):** the arrival
condition — grounded on the floor the waypoint names — is therefore never true
while the lock is live, so it cannot fire, so the loop is not broken, and the
only thing that breaks it is the 30-decision cap. That is the same 31 the
supervisor's own tick-212 reading reported, arrived at from the opposite
direction: I called 31-against-30 a coincidence when the mechanism was the cap;
it is not a coincidence, it is the cap working as designed.

**What would make me wrong, stated so it can be used against me:** if the cat
grounds on y180 at some decision the dump does not show me, or if `ascent_right`
from y210 does not name the y180 run, the arrival condition can fire and the
supervisor's prediction stands. I checked the second by reading the L0 run
table; I could not check the first directly because `hop_points` exports
`hopPoints` only and `edgesOf` is module-local, so the target point is not
readable from outside. That gap is the honest limit of my claim.

**Falsifiers, both directions:**

| L0 result | reading |
|---|---|
| **5 / 78** | BOTH wrong about the mechanism, and the supervisor right for the fourth time on a loop diagnosis. The cap was never what ended it. I report it as measured and do not re-describe it as a partial pass. |
| **~37 / ~294** | MY PREDICTION HOLDS. The arrival release is correct in principle and inert here, which means the L0 loop is not a lock problem at all: the cat overshoots the y180 run and the real defect is the STEERING, not the memory. |
| cleared, other count | report the number as measured; name which prediction it supports and which it does not. |

## What this run cannot tell me either way
Whether arrival helps where the cat DOES land on the target floor. On L0 it
never does, so L0 is the wrong level to measure this change on, and a 5/78 here
would be a pass on a level where the new code path is never exercised. The six
solid levels, and L11, are where the path is reachable — 166 of 170 affected
records have the target reachable with the jump held.

## For the write-up, and not to be lost
The crit is **exonerated on L0**, not proven safe. It was measured at tick 201
flipping L11's argmax 0.0303 -> 0.6488, and now measured at zero effect on L0.
Two levels, opposite results, no contradiction. "Exonerated" is not "safe".

## OPEN ITEM — one backward step on arrival (NOT closed, NOT a pass)

Measured on L0 under gate+lock+arrival: `cleared=true deaths=0 decisions=6 steps=90`
against the pinned baseline 5/78 and against 37/294 for the same arm without the
release. The release is what closed the loop: 31 consecutive `ascent_right`
became 3, and the four separate descents to y210 that the broken arm made
(decisions 8, 10, 17, 23, 30) are gone.

**Residual:** a single 7px backward step, `2 (82.5,250) -> 3 (75.5,250)`, on
arriving at 82.5 on the y250 run. It is present in the broken arm too, at its
decision 3, so the release does not introduce it - it stops it repeating. Left
OPEN deliberately: on L0 it costs 7px, but the same class of thing on a level
with a laser under the floor is a different cost, and nothing measured here
bounds that. Do not close this item on the strength of an L0 pass.

## The gate, relaxed explicitly, by the supervisor who set it
The registered stop condition was "L0 or L8 produces a different trajectory at
all". 6 decisions is not 5, so by the letter the gate is not passed. The
supervisor relaxed it on the record: the mechanism is understood (one surviving
oscillation step, not an unexplained difference), the magnitude is 1 decision
and 12 steps against a regression of 32 decisions and 216 steps, and a level
that clears in 6 instead of 5 is not damaged. Recorded here so it cannot later
read as a silent slip.
