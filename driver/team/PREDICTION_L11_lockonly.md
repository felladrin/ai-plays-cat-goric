# PREDICTION — L11 on the lock-only arm (gate + lock + release, NO ascent crit)

Written before L7, L8 and L11 run, so it precedes every result it describes.

## The stack being run

| change | module | in this arm |
|---|---|---|
| 1 gate off-by-one | `driver/hop_points.patched.cjs` (required directly at `decision.cjs:1420`) | YES |
| 2 ascent crit | in the decision variant | **NO** |
| 3 airborne lock | `decision.patched_lockonly.cjs` :854 / :2017 / :2064 | YES |
| 4 release on arrival | same file, the `arrived` hunk in the memo block | YES |

## Supervisor's prediction, unchanged from tick 218

- the cat reaches **y152** at least once (never, in any L11 run on record)
- **gem_a** is collected (never, in any L11 run on record)
- **deaths rise above 7**, because it will traverse floors it has never stood on
- whether L11 **clears**, he declines to call

## My prediction — I disagree on the first three, and the reason is measurable

**P-A: the cat does NOT reach y152 and gem_a is NOT collected.**
**P-B: deaths do NOT rise above 7.**

Reason, from a number already on disk: **change 3 is inert without change 2.**
The lock only ever holds a waypoint the model actually picked. The gate (change 1)
puts `ascent_left` on the y231 menu, but on the 289-decision archive the model
chose `ascent_right` 37 times against `gem_c` 32 and `ascent_left` **0** times —
and that was on a menu where `ascent_left` did not exist. The only thing ever
measured to make `ascent_left` win is the ascent crit, and at d173 it moved the
argmax from 0.0303 to 0.6488 while the menu order was held constant. **The crit is
not in this arm.** So the menu gains an option the model has no measured reason to
take, the lock has nothing to hold, and the L11 fix does not fire.

The 6/90 on L0 is consistent with this and is not evidence against it: on L0 the
two arms were digit-identical, i.e. the crit changed nothing there, so removing it
could not either. L11 is the one level where the crit was measured to matter, and
L11 is the level where it is missing.

**Falsifiers, so this cannot be adopted afterwards for being convenient:**

| observation | reading |
|---|---|
| y152 reached, gem_a collected | **P-A refuted.** The lock fires without the crit; the crit is genuinely unnecessary and the stack lands as it stands. |
| y152 reached, gem_a NOT collected | P-A half-refuted: the climb works, the pickup does not. |
| `ascent_left` chosen at least once on y231 | P-A's premise fails but P-A may still hold: a lock that is taken and then stalls is a different failure. |
| y187 visited, `ascent_right` chosen, y152 never reached | **P-A HELD**, and the dump should show the same pre-change signature. |
| deaths > 7 | **P-B refuted**, and I would be wrong for a reason I have not modelled. |

## What would make me drop P-A

If the dump shows `ascent_left` on the y231 menu and taken, then the gate alone
does move the choice and the crit was a convenience rather than the mechanism. In
that case the L11 run is a genuine test of changes 3 and 4 and I will say so.

## What this prediction is NOT

It is not a claim that the lock or the release is wrong. Both are measured on
other levels (L0 6/90 against a 37/294 loop, L1 exact, L2 and L5 clearing). It is
a claim about **whether they ever get invoked on L11**, which is a different
question and the one the run answers.

## Supervisor's prediction, posted before L11 runs (his tick 218, unchanged)

- the cat reaches **y152** at least once — never, in any L11 run on record
- **gem_a** is collected — never, in any L11 run on record
- **deaths rise above 7**, because it will traverse floors it has never stood on
- whether L11 **clears**, he declines to call: three gems is necessary and not
  sufficient, the portal follows, and the budget is the same 3000 steps

## His addition after the L7 result — the headroom question

L7 went 258 -> 1552 steps against a 3000 cap, so it has room and survives. A
level already pressing the cap would not. **L11 sits at exactly 3000 and has done
in every run tonight.** If the lock costs L11 the same multiple it cost L7, L11
cannot absorb it. So the reading that matters is not only WHETHER y152 is reached
but WHETHER it happens inside the budget: reaching the third gem at step 2900 and
running out is a different result from failing to reach it, and only the step count
distinguishes them.

## My answer to the headroom question, in advance

I predict L11 does NOT reach y152 and does NOT collect gem_a (P-A above), so the
step count will land near the 3000 cap for the pre-existing reason — it runs out
of budget on the same dead-end cycle it has always run out on — and NOT because the
lock spent the budget getting somewhere. **Those two look identical in the summary
line and are told apart by where the cat is standing at step 3000.** If it is on
y231 or y187, the cap is pre-existing; if it is on y211 or y152, the lock is
consuming the budget.

**Falsifier:** gem_a collected at any step, or the cat grounded on y211/y152 in
the final records, refutes my reading and makes the headroom concern real.
