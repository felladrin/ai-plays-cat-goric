# PREDICTION — drop the straight-line distance from the ASCENT crit only

Written before any endpoint call against the new arm. No level run is authorised.

## What is left in the text, and why this is now evidenced rather than speculative

After the per-gem fix the ascent sentence is TRUE, and it still loses. Measured on the
current arm (`decision.patched_lockcrit.cjs`, md5 `ba696758e0325450a1ae481a98bee472`),
both arms at draw 0 with identical order `[gem_b, ascent_left, gem_a, ascent_right]`,
endpoint noise floor exactly 0.000e+0:

| state | cat x | P(ascent_right) | P(ascent_left) | right/left | crit distance, right vs left |
|---|---|---|---|---|---|
| idx 9 | 192 | 0.8080371572 | 0.0197955668 | 40.8 | **1px vs 80px** |
| idx 11 | 150 | 0.7565987260 | 0.1386879567 | 5.5 | **39px vs 54px** |

Once the appended sentence is true, the ONLY other thing distinguishing the two ascent
entries is the straight-line distance. At idx 9 that distance is 80:1 against the good
ascent and the probability gap is 40.8:1 — the same direction and the same order of
magnitude. The module's own comment already records why that number is meaningless for
an ascent: it is the distance to the LANDING, and the landing is not where the cat has
to be. y211 lands at x 111.75 but must be LAUNCHED from x 145..171, so 80px is a
distance the cat cannot travel in one jump. y187 lands at x 183, 1px from a cat at 192,
so the trap looks trivially reachable and the route's first hop looks impossible.

This is change two, which I declined twice. Both times the REASONING was retracted (first
"y187 has no upward edges so the BFS returns 0", then "one probe state at d173 does not
generalise"). The reasoning is still retracted. The EVIDENCE is new: the false sentence
is gone, so the distance is no longer competing with a lie, and it loses anyway.

## The change

`driver/decision.patched_nodist.cjs`, a copy of `decision.patched_lockcrit.cjs` with ONE
edit: the ascent crit's leading `straight-line ${Math.round(Math.abs(ap.x - snap.cat.x))}px to the `
removed, so an ascent entry reads `ascent_left (a platform above this floor, not a
collectible); the platform at ... ; from that floor ...`.

**The descent crit's distance is KEPT** (line 610) and so is every gem's (line 416). The
descent distance is the precedent and is not implicated: a descent point is a launch
position on a floor the cat is already on, so the distance to it is a walk. The ascent
is the branch where the distance is meaningless.

Menu size is unchanged, so the RNG position and the presented order are unchanged and
the two arms are order-clean. That is checked, not assumed: the probe prints every arm's
presented order and warns `*** ORDER NOT HELD CONSTANT` if they differ.

## P-A — idx 9: the argmax FLIPS to ascent_left

Reason: at idx 9 the distance carries 80:1 of the signal against the good ascent. Remove
the field and the residual difference between the two entries is the consequence
clause, which now says the trap's floor hands over gem_b and strands gem_a.

Falsifier: ascent_right still above ascent_left at idx 9. Then the distance was not the
deciding quantity, the consequence clause loses on its own, and the objective call is
not where L11 is lost — we go to the candidate set.

## P-B — idx 11: the argmax does NOT flip

Reason: the distance gap at idx 11 is 39px vs 54px, 1.38:1. The distance was never
carrying that state's gap, and the residual text there favours the trap lexically —
its sentence is shorter and contains the word `collectible` while the good ascent's
carries two clauses of "still 2 floors of climbing away". So idx 11 should move much
less than idx 9 and may not cross.

Falsifier: ascent_left wins at idx 11 as well. Then the consequence clause does decide,
and a full L11 run is earned on this arm.

## P-C — chained move delta is 0.000e+0 unless an argmax flips

The move call is unchanged by this edit, so the only path to a move delta is an argmax
change feeding a different `buildMoveCall`. Anything else is noise at the 0.000e+0 floor.

## Threshold

The null control, measured, exactly 0.000e+0 for an identical prompt on this endpoint.
Anything smaller is not a result.

## What this arm does NOT claim

- Not a level run. Authorised: two-state probe only.
- The descent branch is untouched and therefore unmeasured by this change.
- A flip at idx 9 is a two-state result. It is the first thing all session to move the
  trap, and it is still one state on one level.

---

# OUTCOME (appended after the measurement)

**P-A REFUTED. P-B HELD. P-C HELD. No level run made.**

Null control (lockcrit vs itself, idx 9): objective avg `0.000e+0`, chained move `0.000e+0`.
Truth table 6/6 + mutation caught on the new arm. Both arms at draw 0 with identical order
`[gem_b, ascent_left, gem_a, ascent_right]` at both states.

| state | crit distance right vs left | P(ascent_right) lockcrit -> nodist | P(ascent_left) lockcrit -> nodist | ratio | argmax |
|---|---|---|---|---|---|
| idx 9 | 1px vs 80px | 0.8080371572 -> 0.7213830241 | 0.0197955668 -> 0.0205068390 | 40.8 -> 35.2 | ascent_right BOTH |
| idx 11 | 39px vs 54px | 0.7565987260 -> 0.7475992976 | 0.1386879567 -> 0.0662370274 | 5.5 -> 11.3 | ascent_right BOTH |

max abs delta 8.665e-2 (idx 9), 7.955e-2 (idx 11). Chained move delta 0.000e+0 at both,
argmax `jump_right` both arms.

**P-A's falsifier fired:** `ascent_right` is still above `ascent_left` at idx 9, so the
distance was not the deciding quantity.

**The two states falsify it by contrast, and this is the part I would keep.** If the distance
were deciding, idx 9 (80:1 against the good ascent) would move most and idx 11 (1.38:1) least.
Measured on P(ascent_left): idx 9 moved +0.0007112722372738627, idx 11 moved
−0.07245092934399523. The state with the smaller distance gap moved **101.9x more**, in the
opposite direction.

**Where the mass went: `gem_b`, at both states.** +0.0828 at idx 9 against `ascent_right`'s
−0.0867; +0.0796 at idx 11 against `ascent_left`'s −0.0725. The argmax never moved.

**P-B held, but not for the reason I gave.** I predicted idx 11 would move *less*; it moved a
lot and in the wrong direction for the good ascent. The prediction's argmax component was
right and its reasoning was wrong, which is the same shape as the rest of this session.

**Not claimed: a mechanism for the order-dependence.** At idx 9 the fwd and rev passes move
in opposite directions on all three of `ascent_right`, `ascent_left` and `gem_b`. I have the
numbers and no mechanism, and I am not writing one down until it is measured.
