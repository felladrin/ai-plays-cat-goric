# Dead ends

Measured and rejected. Re-running any of these costs a night and returns the same answer.

## Arm D: annotate each option with its consequence

The most expensive experiment in the project, and the most instructive.

Arm D annotated every move option with its consequence (where it lands, and how much closer or further that is from the objective) and named the remedy on the others: "left is the only offered action that gets closer to gem_c".

The instrument was validated first, which is what makes the rest trustworthy. The unchanged arm reproduced the archive at 41 of 42 states bit-exactly, 205 of 210 probability keys identical to the last digit, argmax agreeing at all 42.

**The effect was the largest ever measured on this pipeline.** 42 of 42 level-4 states flipped away from `jump_left` to `left`. Mean p(jump_left) fell 0.996556 to 0.004501, the largest single delta was 0.996936, which is 11.25x the run-to-run spread, and the mass moved as one body.

**It destroyed three of the seven clearing levels.**

| Level | Baseline | Arm D (armd2) | |
| --- | --- | --- | --- |
| 2 | 74 dec, 517 steps, 1 death, 3 gems, cleared | 465 dec, 3000 steps, 11 deaths, 3 gems, not cleared | destroyed |
| 5 | 98 dec, 908 steps, 2 deaths, 3 gems, cleared | 266 dec, 3000 steps, 8 deaths, 2 gems, not cleared | destroyed |
| 9 | 74 dec, 919 steps, 1 death, 3 gems, cleared | 215 dec, 975 steps, 40 deaths, 0 gems, not cleared | destroyed |
| 4 (the target) | 256 dec, 8 deaths, 1 gem | 377 dec, 22 deaths, 1 gem | worse |

**The reason is the lesson: the behaviour it removed was load-bearing.** Walking left off level 4's y=171 floor is fatal at every laser state (simulated at moving frames 100, 200 and 300: laser death every time). The backward jump from (280.25, 171) lands safely at (248.8, 93), and gem_c *is* reachable from y=171 through that jump, up to y=93 and down the left chain. The backward jump is step one of the only route to the gem. Under arm D the cat walked left 230 times against a baseline of 97, dropped to y=171 twenty-two times and died twenty-two times.

The intervention worked perfectly at the decision level and was wrong about the world. A ranking sentence can only be as good as the objective it ranks toward.

Two thresholds were then tried and both failed: a 1.75px per-option floor (`catWalkSpeed`) still broke levels 2 and 5, and a 10.5px spread gate was never run because it does not separate the populations (level 2's spread reaches 110px against level 4's 37.7px minimum).

### The one positive finding, and it survives

Arm C annotated every option with the bare landing **coordinate** and made the model *more* confident in its existing wrong choice: argmax unchanged at 42 of 42, mean p rising, maximum delta 38x *below* the noise floor, so inert rather than weak.

Both arms annotated all five options, so coverage was held constant and the only variable was coordinate versus consequence. **The classifier does not read a coordinate as a reason.** That is a fact about how this model scores text and it outlives everything built on it.

## Four candidate predicates killed by census

Each was meant to tell the model which option makes progress. Each fires on levels that already clear, so it cannot be what distinguishes a failing level.

| Candidate | Firing rate | Why it died |
| --- | --- | --- |
| Euclidean "lands closer to the objective" | 98.9% (1125 / 1137) | 100% on nine levels, six of which clear |
| Vertical-dominant distance | 56.3% (640 / 1137) | 55 to 77% on five clearing levels |
| Recent-visit ("landing on a floor just left") | 44.0% (3265 / 7413) | fires *more* on levels that clear, 46.5% against 43.3% |
| Route hint | 82.8% | same shape |

## Other things that are measured dead

- **`STICKY_OBJECTIVE=1` is inert on level 4.** 0 of 256 decisions differ. The lock requires `sameFloor`, and level 4's objective changes accompany floor changes, so it releases by design. Whatever the lock is worth on levels 10 and 11, level 4 is not evidence for it. It is not dead: on `clef` it clears level 8, where the objective flaps on one floor (see the Clef section of [results.md](results.md)).
- **Two-option menu rate does not predict failure.** Level 2 clears at 83.3%, the project's highest.
- **The `none` criterion correction is not the fix for level 4.** The string asserted a horizontal momentum the game does not implement, and correcting it is right, but level 4 on the corrected build gave 256 dec / 8 deaths / 1 gem, identical to the build before it. The route needs a state the cat never reaches.
- **The return-arc rule** (denying the hold to arcs that land back on the departure platform) bought level 2 and cost level 3. Raising `STALL_WINDOW` from 10 to 24 in `run_level.cjs` cleared both with fewer deaths and fewer decisions. The livelock never needed a policy change: the revisit escalation already breaks oscillations and was losing a race with the stall detector, which is a diagnostic abort rather than a game rule. A two-position oscillation hits a given 10px key every other decision, so escalation needs about `2 * (VISIT_STUCK_THRESHOLD + 1) = 8` decisions to start sampling, and the abort was firing at 10.
- **`wait` as an action.** Removed, and it is strictly dominated. See [game-facts.md](game-facts.md).
- **A fixed frame threshold for the countdown.** It cannot separate level 0's healthy climb from level 2's trap, because in raw frames they look identical. The countdown is surfaced only when `frames_remaining_at_cat < straight_line_distance_to_chosen_objective / catWalkSpeed`. The right side is a strict lower bound on time to reach, so when the inequality holds the warning is provable. It uses only the objective already chosen, so it ranks nothing.
- **`--rope-factor 2` on Laya.** The README warns it does not establish calibration beyond training length, and it is unnecessary.
- **MPS for local model serving.** Loading weights through `device_map` segfaults nondeterministically (139 / 134) for both 4B and 2B. Not a dtype issue. Use CPU.
- **Precision as a lever on Laya.** bfloat16 gave 32 deaths on level 0, float32 gave 30. Within noise at n=1 each.

- **The route-clock DEAD/ALIVE verdicts do not fire.** `waypoint_verdict_audit.cjs` on two `clef` archives from 2026-10-07 (level 11 and level 6): 0 doomed descent picks, 0 mixed states and 0 all-dead states over 114 and 156 grounded decisions. With the optimistic bounds plus `DEAD_MARGIN`, the cat is never provably doomed while it still has any route, so a binary verdict is a zero-firing clause. The gem first-pick audit gave the same zero earlier. Measured on two archives, not on every failing level.

## The implied-relevance pattern

A **true** statement can make the model worse purely by appearing where it does not bear on the decision. Three instances, all caught by a regression on a level that already worked and never by anything failing outright.

1. **Zero-gap floor lines.** Stating the full platform map while the cat was mid-floor with the objective at the same height flipped Laya's argmax the wrong way. Gated: suppress the map unless descent is relevant.
2. **Drop-from-end fact.** "Step off the end and you land on X", shown while the cat was far from any edge. Gated on being near an end or the objective being below.
3. **The countdown.** Ungated it made level 2 descend but broke level 0 to 1 death and 38 decisions, because on level 0 the cat climbs toward the descending ceiling as correct play and a short countdown fires during a climb that is going fine. Resolved with the affordability rule above.

A fourth instance, measured later: the non-gem half of the same-floor clause is **exactly neutral** on level 1 (identical trajectory, 24 decisions and 331 steps both ways) and **net harmful** on level 2, costing 18 decisions and 168 steps. Twenty-five true, accurate statements about descent points made level 2 measurably worse.

## Prompt sentences tried and rejected, with the measurement

- **Same-floor jump-landing note** ("a jump from here reaches no platform other than this one"). Fires 48 times on level 2 and takes it from cleared / 5 deaths / 221 decisions to failed / 10 deaths / 435 decisions. A real bug was found while reading it (`platformHolding`'s 70px tolerance assigns a gem hovering above a floor to that floor, so level 2's gem_c at (90,188) belonged to the floor the cat was standing on, 52px up and inside a 61.2px jump). The guard `if (holder === here) return null` is correct independently of any level and stays, but it only takes the firings from 48 to 32 and level 2 still fails. **The note is off.** It is load-bearing for level 4's y=171 launch band and should be re-enabled only with a scope that keeps level 2's firings at zero. `test_objective_lock.cjs` fails on level 1 by design as the gate on that decision.
- **Stricter note trigger** (fire whenever a jump cannot reach the objective's own floor directly). Fires 37 / 65 / 76 / 275 times on levels 0, 1, 2, 12. Multi-hop routes are normal, so the fact is true but not special.
- **Cadence-derived landing margin** (require the reachable-x interval to overlap a platform by at least one decision interval, 5.25px). The interval's extremes are exactly what the driver *can* hit by holding one direction, so requiring a margin penalises the achievable extreme. It discarded a landing at x=284 that holding left reaches exactly, and changed 1115 of 7144 launch points.
- **"Lands nowhere"** ("a jump from here reaches no platform at all: the cat falls past every floor"). False. `landingsAt` drops the cat's own floor, and a jump almost always lands back on it because the reachable interval still covers the launch floor on the way down.

## Menu-position bias: fixed, do not reintroduce

With a fixed menu (gem_a first, gem_c third), gem_c was selected **zero** times on level 2 across about 500 decisions. That is letter and list-position bias in instruct-model multiple-choice prompting, an artifact introduced by the harness.

The fix is one seeded permutation per decision, drawn in `buildObjectiveCall` and used for **both** the state listing and the letter menu.

The correct bias test is conditional on slot, not raw counts. Raw "chosen at slot p" conflates choice with how often an option was presented at p. The measure is `P(choose | slot) = choices_at_slot / presentations_at_slot`, grouped by option count n, with a uniform baseline of 1/n.

```
n=3 (gems only),  baseline 33.3%:  slot0 33.6%  slot1 31.3%  slot2 35.1%   FLAT
n=5 (gems + 2 descents), baseline 20.0%:  slot0 26.3%  slot1 14.6%  slot2 17.2%  slot3 19.6%  slot4 22.4%
```

n=3 is dead flat across 134 presentations per slot. n=5 shows a mild residual first-slot lean over 419 presentations per slot, far smaller than the original bias and partly confounded by which option lands in which slot. The ordering artifact is gone.

## Prepared and measured, not shipped: interception-aware landings

`landingsFrom` asks, per platform independently, whether the reachable-x interval overlaps it at a frame whose y is in that platform's band. It never removes trajectories that already landed somewhere earlier, so it reports landings reachable only by flying *through* a platform.

On level 4 it claims a jump from floor(263..315@171) reaches gem_c's floor at y=241. It cannot: moving left puts the cat inside the y=93 floor's x-span while its head is in that floor's collision box, so it side-snaps onto y=93, and staying right leaves no time to get left of x=208. That false edge is what makes the driver believe the right descent is productive.

The prototype carries the reachable set as a list of intervals and, on each descending frame, records a landing where the set overlaps a platform and **subtracts** that range, because those trajectories stop there. Measured across all 14 levels: **68 edges removed, 0 added**, every removal a trajectory that would have to pass through a platform. Validated against the known-good case that a direction-restriction experiment broke.

Not shipped: it changes the stranding annotations on levels that pass today, and removing edges makes more objectives look unreachable, so a false removal would be worse than the false edges it fixes. It needs a levels 0 to 3 regression run of its own.
