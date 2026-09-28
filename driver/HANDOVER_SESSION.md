# Level 4 session notes

Two fixes landed, both verified against the game's own code and both with a
regression test that fails on the pre-fix code.

## 1. The objective is held across a jump arc

`decide()` takes a runner-owned `memo` and re-asks the objective only while the
cat is grounded. Airborne frames reuse the objective the jump was launched for
and make no objective call. The lock is dropped when the held objective leaves
the menu (gem collected mid-arc, or a descent waypoint that airborne states do
not offer) and cleared on every death/reset.

Why: the airborne prompt is strictly less informed than the grounded one. The
stranding annotations ("TAKING THIS FIRST LOSES gem_a PERMANENTLY") are anchored
by `REACH.platformKeyUnder`, whose 14px tolerance stops resolving a few frames
into a jump. Measured on level 4:

| state | annotations | objective chosen |
|---|---|---|
| grounded (129.75, 93) | present | gem_a, 35 of 40 orderings |
| airborne (136.75, 75)  | absent  | gem_b, 6 of 6 orderings at p=1.000 |

gem_b is the nearest gem and the one whose collection strands gem_a forever, so
the mid-arc re-ask reliably swapped the correct objective for the losing one and
the steer that followed cancelled the jump.

## 2. The jump-landing note

`jumpLandingNote()` in `decision.cjs` states, for a grounded cat, where a jump
from its current x can land and whether the objective survives it. Emitted only
when the current x cannot reach a floor that keeps the objective AND some x on
the same floor can.

Level 4's start floor spans x 95..147 at y=93; the floor across the 52px gap
spans x 199..251 at the same height. A jump reaches it only from x>=137.
Simulated outcomes by launch position:

| launch x | outcome |
|---|---|
| 118-123 | lands on the floor at y=241 (one-way; gem_a lost) |
| 125-134 | falls past everything into the bottom laser |
| 135.5-147 | lands at (200-204, 93), the intended floor |

The cat launched from 129.75 in 14 of 16 deaths.

Reachability comes from `REACH.landingsFrom`, the air-control model, NOT from a
held-action arc replay. A held action under-reports badly and a fact derived
from one has been wrong here before.

Offline sweep over every floor of every level, at walk-speed granularity, for
every gem objective: the note fires on level 4 only, on the start floor only,
for gem_a only, at x 95..135. Levels 0-3 and 5-13 are untouched. That sweep is
kept as an assertion in `test_objective_lock.cjs`.

## Measured effect on level 4

| build | deaths | peak gems | behaviour |
|---|---|---|---|
| before | 11-16 | 1 | never crossed the gap; jump reversed mid-air |
| + objective lock | 16 | 1 | crosses and reaches gem_a; still launches from the death band |
| + jump-landing note | 7 | 1 | every launch now at x=140.25; reaches gem_a reliably |

Still not cleared.

## 3. landingsFrom was one frame optimistic

`reachability.cjs` tied the horizontal reach interval to the same frame index as
the vertical position. The launch frame applies the jump and the position update
without a horizontal step, so the budget at vertical frame f is f-1 frames of
walking, not f.

Validated against 179 airborne samples from real level 2/3/4 runs: the vertical
frame index matches the horizontal index plus one in 119 cases, against 1 for no
offset. The remaining 59 are arcs that reversed direction mid-flight, where
horizontal displacement is not monotonic in f.

The error is exactly 1.75px, which is the width that decides a boundary case: the
model claimed a jump from (285.5,171) on level 4 grazes the floor at y=93 by
0.5px, and the cat fell past it on every attempt. With the fix that landing is
correctly gone, and the launch window on the start floor moves from x>=137 to
x>=139.

Levels 0-3 were re-run after this change: all four still clear, and level 3
reproduces bit-exactly (3 deaths, 81 decisions).

## Rejected, with the measurement that rejected each

- **Stricter note trigger** (fire whenever a jump cannot reach the objective's own
  floor directly, rather than only when the objective becomes unreachable):
  fires 37/65/76/275 times on levels 0/1/2/12. Multi-hop routes are normal, so
  the fact is true but not special, and it would flood prompts on levels that
  pass today.
- **Cadence-derived landing margin** (require the reachable-x interval to overlap
  a platform by at least one decision interval, 5.25px): rejected because the
  interval's extremes are exactly what the driver CAN hit by holding one
  direction. Requiring a margin penalises the achievable extreme: it discarded a
  landing at x=284 that holding left reaches exactly. Changed 1115 of 7144 launch
  points.
- **"Lands nowhere" wording** ("a jump from here reaches no platform at all: the
  cat falls past every floor"): false. `landingsAt` drops the cat's own floor, and
  a jump almost always lands back on it, because the reachable interval still
  covers the launch floor on the way down. The claim fired on six levels, three
  of which pass today. A weaker true version ("reaches no platform other than
  this one") is still available and unmeasured.

## The remaining blocker

With gem_a collected the cat stands on floor(263..315@171) and must reach gem_c
on floor(156..208@241). Optimal leftward steering from a jump at x0:

| x0 | x when crossing the y=241 band | lands on 156..208? |
|---|---|---|
| 263-284 | 186-207 | yes |
| 285.5 | 208.5-213.75 | no |
| 290 | 213-218.25 | no |

The cat jumps from 285.5 and misses by about 1px of head clearance against the
side-snap test. This is a knife-edge, not a missing fact: `landingsFrom` models
the game's side-snap correctly and reports the y=93 floor as a landing, which
keeps gem_c reachable via a detour, so the note correctly stays silent. The
result is a livelock (deaths flat at 7 while steps climb), not a death loop.

Deliberately NOT added: another heuristic for this case. Two of the four fixes
that previously regressed an untargeted level were exactly this shape.

## The level 4 loop after gem_a (diagnosed, fix in flight)

With gem_a collected the cat sits on floor(199..251@93) and loops:

```
(238.25,93) gems=1 -> obj=descent_right -> walks right
(287.25,171) back on the floor gem_a came from -> obj=gem_c -> jump_left
(215.5,246.6) -> dies -> respawn
```

Two separate causes.

**descent_right is genuinely preferred, not a list-position artifact.** Probed over
24 distinct menu orderings at (238.25,93): descent_right wins 24 of 24, and the
pick equals the first-listed entry in only 6 of 24. It is the nearer descent
(12.75px away against 39.25px for descent_left) and its line does list gem_c's
floor among its landings:

    right descent point (x 251): ... lands on x 263..315 at y 171
                                     or x 156..208 at y 241

Both landings are real, but reaching the second requires reversing direction
during the fall, while the cat arrives at a right-end descent point moving right
and keeps going. The "or" offers a choice the move policy does not take. Listing
a descent point's landings without regard to the direction the cat arrives in is
a modelling gap, NOT yet fixed: descentPoints feeds every level and the change
is too broad to make on one level's evidence.

**Nothing warned about the fatal jump band on the y=171 floor.** From x>=284.5 a
jump reaches no platform other than the floor it started on, and the cat holding
left off the left edge dies. The note stayed silent because its landing list
drops the cat's own floor and was therefore empty. Re-added with wording that
says "reaches no platform other than this one" rather than the earlier false
"falls past every floor".

That variant fires on levels 1, 2, 7, 8, 9 and 13 as well as 4. The statements
are true, but levels 1 and 2 pass today, so it must be measured on them before
it is kept. The scoping assertion in test_objective_lock.cjs currently FAILS on
level 1 by design, and is the gate on that decision.

## The level-advance detector reported a clear that did not happen

`run_level.cjs` treated ANY change of level index away from the target as a
clear:

```
[level 4 CLEARED -> advanced to level 0 @ step 1667]
gems collected (this level, PEAK): 1
```

The game had restarted to level 0. Clearing needs 3 gems and the portal. Fixed
in both runners: a clear now requires a FORWARD transition (level 13 excepted,
because the index may wrap), a backward jump is reported as RESTARTED, and a
"cleared" level with fewer than 3 gems raises instead of banking the result.

Every earlier run in this session was re-checked for the same false positive:
all were genuine forward transitions (0->1, 1->2, 2->3, 3->4), so the levels 0-3
regression results stand.

## Prepared and measured, NOT yet shipped: interception-aware landings

`landingsFrom` asks, per platform independently, whether the reachable-x interval
overlaps it at a frame whose y is in that platform's band. It never removes
trajectories that already landed somewhere earlier, so it reports landings that
can only be reached by flying THROUGH a platform.

Level 4: it claims a jump from floor(263..315@171) reaches gem_c's floor at
y=241. It cannot. Moving left puts the cat inside the y=93 floor's x-span
(199..251) exactly while its head is in that floor's collision box, so it
side-snaps onto the y=93 floor; staying right avoids the snap but then there is
not enough time to get left of x=208. The edge is unreachable either way, and
that false edge is what makes the driver believe the right descent is productive.

The prototype carries the reachable set as a list of intervals and, on each
descending frame, records a landing where the set overlaps a platform and
SUBTRACTS that range from the set, because those trajectories stop there. The
floor the cat starts on is excluded, or at f=1 its own box consumes everything.

Measured across all 14 levels: 68 edges removed, 0 added. Every removal is a
trajectory that would have to pass through a platform.

Validated against the known-good case that the direction-restriction experiment
broke: stepping off level 2's top floor at its left end (x=74) and steering right
still reaches floor(84..136@240), under both the shipped and the intercepting
model.

NOT shipped: it changes the stranding annotations on levels that pass today, and
removing edges makes more objectives look unreachable, so a false removal would
be worse than the false edges it fixes. It needs a levels 0-3 regression run of
its own. Prototype: scratchpad proto_intercept.cjs / graph_diff.cjs.

## REGRESSION: level 2 stopped clearing

Levels 0-4 sweep on the build carrying the same-floor note plus the gem
annotation on descent landings:

| level | cleared | deaths | decisions | baseline |
|---|---|---|---|---|
| 0 | yes | 0 | 5 | identical |
| 1 | yes | 0 | 36 | identical |
| 2 | **NO** | 10 | 435 | cleared, 5 deaths, 221 decisions |

Level 2 ran out its 3000-step budget with all 3 gems collected but never reached
the portal; the baseline finished in 1565 steps. Its deaths have always been
noisy (5, 12, 10 on identical builds) but it CLEARED every time, so failing to
clear is a different kind of result and is being treated as a real regression.

Two candidates, both added as "true facts":

- the same-floor note ("a jump from here reaches no platform other than this
  one"), which fires 48 times on level 2;
- the gem annotation on descent landings ("... at y 241 (gem_c is there)"),
  which changed 125 level 2 lines.

True is not the same as useful: more text competes with what was already
working. Bisect the two on level 2 rather than reverting both, since levels 0, 1
and 3 are unaffected either way. The same-floor note is the more invasive of the
two and is the one to test first.

## Bisect result and the bug it exposed

The level 2 regression was the same-floor variant of the jump-landing note, not
the gem annotation:

| build | level 2 |
|---|---|
| baseline | cleared, 5 deaths, 221 decisions |
| + same-floor note | FAILED, 10 deaths, 435 decisions |
| - same-floor note (gem annotation kept) | cleared, 7 deaths, 319 decisions |

The note is load-bearing for level 4 though: with it off, the cat launches from
x=285.5 on the y=171 floor again, inside the band where a jump reaches nothing
and holding left kills it.

Reading what the note actually SAID on level 2 found a real bug rather than a
scoping preference. platformHolding's 70px tolerance assigns a gem hovering above
a floor to that floor, so level 2's gem_c at (90,188) belongs to the very floor
the cat stands on at y=240 -- 52px up, inside a 61.2px jump. The note was
therefore telling the cat to walk to a different launch window for a gem directly
overhead. Guarded with `if (holder === here) return null`, which is correct
independently of any level: there is nothing to say about jumping to another
floor when the objective is on this one.

That guard takes level 2 from 48 firings to 32. The remaining 32 are true and
plausibly useful (walk right before jumping, for gems on other floors). Whether
32 is still enough to cost the level is UNMEASURED and needs its own level 2 run.

That run was made and FAILED: level 2 with the guard produced cleared=false, 10
deaths, 435 decisions -- numerically identical to the unguarded run. The guard is
a real bug fix and stays, but it does not rescue level 2; the remaining 32
firings still cost the level.

DECISION: the same-floor variant is OFF. Level 2 clears without it and level 4
does not clear either way, so there is no trade to make. It is load-bearing for
level 4's y=171 launch band and should be re-enabled only with a scope that
keeps level 2's firings at zero.

Measured matrix:

| build | level 2 | level 4 |
|---|---|---|
| baseline | cleared, 5 deaths, 221 dec | never cleared |
| + same-floor note (48 firings) | FAILED, 10 deaths, 435 dec | 22 deaths, 484 dec |
| + note + holder guard (32 firings) | FAILED, 10 deaths, 435 dec | (not run) |
| note off (guard kept) | cleared, 7 deaths, 319 dec | 26 deaths, 558 dec |

## Open, unmeasured

- `top_logprobs` truncation: a permitted label that falls outside the requested
  top-k silently scores 0 and the distribution is normalised over a different
  set. No guard exists; raised by the reviewer, never verified.
- Menu-membership normalisation: probabilities are normalised over a set whose
  size changes between calls (5 grounded, 3 airborne), so confidence is not
  comparable across calls.
- Levels 5-13 have never been measured on a good build.

## Testing policy: scope runs by blast radius, don't sweep by habit

Cost of a levels 0-4 sweep, by decisions (each decision is 2 model calls):

| level | decisions | share |
|---|---|---|
| 0 | 5 | 0.5% |
| 1 | 36 | 3.6% |
| 3 | 81 | 8.1% |
| 2 | 319 | 31.9% |
| 4 | 558 | 55.9% |

Levels 0 and 1 are 4% of the sweep and effectively free; the waste is re-running
2 and 3 (40%) when the change provably cannot reach them.

`scratchpad/sweep_note.cjs` answers that in milliseconds: it walks every floor of
every level at walk-speed granularity, for every gem objective, and prints which
levels a prompt change fires on. A change whose firing profile is "L4 only"
cannot alter levels 0-3, and running them measures nothing.

Procedure: run the offline firing sweep first, then run the level being fixed
plus any level the offline sweep says the change can reach. Full sweeps are for
changes with no provable blast radius -- anything touching reachability.cjs, the
physics, or the runners, because those alter the graph and the cadence globally
rather than one prompt line.
