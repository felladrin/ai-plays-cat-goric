# Flash level 13: the portal near-miss (measured 2026-10-10)

Flash collects all 3 gems on L13 at every seed and never clears. The failure is not
the gems and not the objective layer (with one live objective the objective call is
skipped; `candidates=1` throughout the endgame). It is one airborne steering decision,
measured with `driver/research/trace_l13_portal.cjs` (arc.cjs `simulate` +
`opts.onFrame`, every arc from the archived state, nothing hand-estimated).

## Collision geometry, from the game source (not assumed)

- Cat: `getCatCollisionObject` = 1px-wide column `[cx, cx+1] x [cy-h, cy]`.
- Portal: `getPortalCollisionObject` = 32x32 centred on the sprite at (180,150):
  `[164,196] x [134,166]`; checked only when `gemsCollected >= 3`.
- Gem: 16x16 sprite, anchor 0.5 (`resetGems.ts`, `getGemAnimations.ts`):
  16x16 centred on the spawn coordinate.
- `collides` (kontra) = plain AABB overlap, once per game-loop frame.

## The loop the model cannot leave (s3 steps 2557-2619, s4 steps 2052-2171)

The cat stands on floor [232,136] (spans 206..258), portal 52px left and 14px below.
It chooses `jump_left` (probs 0.60-0.67 vs `left` 0.26-0.29), then reverses to `right`
near the apex and lands back on the same floor. Measured:

- **Held `jump_left` from every launch state dies at the TOP laser** (f13-f22, head at
  y=45..52 vs the top bound at those clocks). At mf>=221 the jump lands on [182,63]
  whose headroom is already inside the closing box. The apex reversal to `right` is
  therefore NOT the failure - it is what keeps the cat alive. The earlier hand-arc
  guess that the held jump passes through the portal was wrong; the trace killed it.
- The productive route is the walk: step off the LEFT edge (x=206) and keep holding
  left. Measured from the s4 step-2138 step-off: **the trace hits the portal box at
  f6 (194.25,147.2)**.

## The actual failure: a PRUNE that deleted the winning move (corrected 2026-10-10)

**This section first said "the model steers right". That was wrong.** In s4 steps
2144 and 2162 `moveProbs` is `{"right":1}` - a softmax over a ONE-option menu.
`right` was the only option `PRUNE_FATAL` left; the model never chose to refuse the
portal. The prune is `survival.cjs isFatal`: after the committed frames it returns
`!canStillLand(...)`, i.e. "an airborne hold that cannot land on a platform is
fatal". At (197.75,140) with mf=313 the bottom bound (~246.6) burns every floor
below before the cat reaches it, so left and none could not land and were deleted -
but holding left crosses the portal box at f6, and touching the portal ENDS THE
LEVEL AS A WIN. The prune deleted the winning move. The cat did the walk-off twice,
met the one-option menu twice, and died at the deadline.

s4 steps 2138-2171, with the menu each decision actually saw:

```
step 2138 obj=portal move=left   cat=(208.25,136) on   mf=307   (steps off the left edge)
step 2144 obj=portal move=right  cat=(197.75,140) air mf=313   menu: right ONLY
step 2153 obj=portal move=left   cat=(210.00,136) on   mf=322   (landed back on the floor)
step 2159 obj=portal move=left   cat=(203.00,136) air mf=328
step 2162 obj=portal move=right  cat=(197.75,140) air mf=331   menu: right ONLY
```

**Fix (driver correctness, not a prompt fact), `survival.cjs`:** with
`gemsCollected >= 3`, an action is NOT fatal if any simulated frame before death
puts the cat's box in overlap with the portal box (`getPortalCollisionObject`: 32x32
centred on 180,150). Applied in both death paths of `isFatal`: the committed-frame
loop (checked on every frame including the death frame - `stepFrame` now returns the
position with `{dead}`) and `canStillLand` (new `portal` arg: the reachable-x
interval [lo,hi] crossing the portal box counts, same optimistic interval semantics
as the landing test). `landingPlatforms` (hits mode) is unchanged. Test:
`test_portal_prune_l13.cjs` + `fixtures/portal_pruned_l13.json` (the verbatim step-2144
entry): RED on the old rule (left/none fatal, prune keeps only right), GREEN after;
control gc=2 keeps left fatal (portal not live). `npm test` green.

## The candidate fact: REACH_FACT

The reaching hold is exactly computable at every airborne decision: for each hold in
{left, right, none}, `simulate` the hold from the live state with a frame trace and
test the trace against the objective's collision box. When EXACTLY ONE hold reaches
the objective before landing or dying, say so once, consequence-framed, no
coordinates: `Holding left reaches the portal in 2 frames; right lands back on the
floor.` Gated `REACH_FACT=1`, off by default, byte-identical prompt when off - same
discipline as EXIT_FACT.

The predicate lives in `decision.cjs` (`reachHolds`), exported; the census
(`driver/research/census_reach_fact.cjs`) requires it, one source of truth.
Census question (the refined version of the airborne-reversal question): when exactly
one hold reaches the objective, how often does the archived move take it? Split by
level and model; the L13 prediction is that Flash fails exactly these states and
Clef/Darwin take them.

## Status

- [x] Trace tool: `research/trace_l13_portal.cjs` (arc.cjs gained an opt-in
      `opts.onFrame(x,y,f,dy)` callback, a no-op when absent; physics unchanged).
- [x] `reachHolds` predicate in decision.cjs + REACH_FACT sentence in buildMoveCall.
- [x] Census over all archives (`research/census_reach_fact.cjs`): below, with
      single-option menus excluded from compliance.
- [x] PRUNE_FATAL portal exemption in survival.cjs + `test_portal_prune_l13.cjs`.
- [ ] Live A/B on L13 (needs the Flash container back up): the prune fix alone may
      be enough - the archetype states now keep `left` on the menu.

## Census (2026-10-10, corrected): 350 archives, 65,952 decisions

Single-option menus are excluded from compliance (`singleOptionMenu` 1,004): a
one-option menu is not a choice - that was the L13 lesson.

```
reason tallies: grounded 40098, noneReach 22525, fired 2175, singleOptionMenu 1004,
multipleReach 150

by endpoint:
  Darwin-27B-ZTC/systemone          1631/50062 ( 3.3%) comply=88.7%
  Phocinae-Largha-150M-v1/systemone  231/13046 ( 1.8%) comply=64.9%
  PurpleMIST-Flash-1.0/systemone     206/ 1456 (14.1%) comply=85.9%
  clef                               107/ 1388 ( 7.7%) comply=92.5%

level 13, Flash only (s1-s5):  25/2383 (1.0%) comply=24.0%   (multi-option menus only)

pruned portal-reaching holds (blast radius of the PRUNE_FATAL bug): TOTAL 66
  L13 Flash 13 (steps 2144,2162,2180,2210,2213,2228,...)  L4 clef 30
  L10 PurpleMIST-Mini 16   L4 Darwin 5   L10 Flash 1   L6 Flash 1
```

Readings:

1. **The prune bug was real but narrow**: 66 archived decisions across all levels had
   a portal-reaching hold deleted from the menu - 13 of them Flash L13 (including
   both archetype steps). Even Clef was hit 30 times on L4 and still cleared, so a
   pruned winning move costs a level only when no other route exists. The fix's own
   blast radius (`blast_portal_prune.cjs`, old vs new `pruneFatal` menus): 78 of
   66,166 archived decisions change, all at gc>=3 (L4 40, L10 17, L13 13, L0 6,
   L6 1, L9 1); no clearing level's prompts are touched.
2. **A model gap remains after the correction**: with one-option menus excluded,
   Flash L13 compliance is still 24.0% (19 refusals of 25 genuine states). The
   archetype states were the prune bug; the remaining 19 are the model steering
   away from a reachable portal.
3. **Compliance separates the models**: Clef (clears) 92.5%, Darwin 88.7%, Flash
   85.9% overall but 24.0% on L13. Flash fires 14.1% of the time (vs Darwin 3.3%):
   it loiters airborne near objectives in exactly-one-hold-reaches states.
4. Verification: `REACH_FACT` unset leaves all 65,463 rebuilt move states
   byte-identical (`blast_exit_fact.cjs`); with the gate on, exactly the census
   firings change, each a pure one-line insertion. `npm test` green; the new
   simulate call site is audited as site 11 in simulate-clock-audit.md.

## The spawn life: URGENCY fires, the geometry forces the fall, the climb loses the clock (2026-10-10)

The supervisor's head start said every life takes gem_b(72,152) then gem_a(129,200) and then gem_c(180,51) burns (deadline 250). The gate census (`research/l13_urgency_gate.cjs`, all EXIT seeds s3-s10, every gc=0 decision to step 48) killed the objective-layer hypothesis outright: **the DESTROYED FIRST annotation fires at every spawn-life decision** (all four gates pass: gem_c strictly earliest at deadline 250 vs 355/550, canReach true, stranding empty, not the nearest - gem_b is), **and the objective call already picks gem_c at step 0**. The failure is downstream.

The geometry (`reachability.platformKeyUnder`, verbatim archives): the cat spawns at (35,50) onto `floor(9..61@62)`; gem_c sits on `floor(156..208@63)` - same height, but a 95px gap between x=61 and x=156. The top-level hop needs a jump up to `floor(75..127@25)`, and the jump is correctly pruned: head clearance to the top laser is 42-43px from mf 0, under the 54.4px the jump needs - jumping off the spawn floor dies. So the only way off the spawn floor toward gem_c is to walk right and fall into the gap, which is exactly what the model does (obj=gem_c held by STICKY, move=right at p=0.90 at step 6, off the edge by step 18). The fall passes through gem_b at (72,152) - collected by collision, not by choice - and the objective then flips to the nearest, gem_a.

`route_clock.orderFeasibleN` from the spawn state (startX snapped to the X_STEP=2 grid - off-grid startX silently returns infeasible, a trap worth remembering): collecting gem_c FIRST is feasible at collect-time mf 97 (deadline 250), and even the accidental order b,a,c stays feasible with gem_c at mf 145. The route exists with the spawn jump pruned - it goes down into the lower floors and climbs the right chain back to 156..208@63. The winning lives are exactly this: s3's gem_c was collected at step 2010, mf 188, on gem_c's floor, after several unwinnable resets. The losing lives (s5/s6/s7) execute the climb too slowly: obj=gem_c from step 113 with the cat oscillating left at (161,208) away from the chain, and the top laser burns gem_c at 250 before the climb finishes. Same mechanism as L6/L12: a feasible clock, lost to execution cadence on a multi-hop climb - not a menu gap, not an objective-layer failure, and not the URGENCY gate.

## The rising/falling label is wrong in every shipped prompt (RISE_LABEL, 2026-10-10)

The s5 oscillation state (161,208.8) dy=-3.2 is RISING, but the reconstructed move
prompt said "in the air, falling". Cause (`decision.cjs` line 1138): the word is
`AIR_FACTS && dy < 0 ? "rising" : "falling"` - the sign test is correct, but
AIR_FACTS is OFF in the shipped build, so every airborne prompt says "falling"
regardless of dy. AIR_FACTS was dropped historically for losing L5, but it bundled
TWO changes: this label and `airborneMap` (a rewrite of the airborne platform
listing). The label alone was never measured.

Split out as its own gate, `RISE_LABEL=1` (implies nothing else; AIR_FACTS implies
it). Census of the shipped-build error: **11,399 archived airborne decisions across
all endpoints have dy < 0 and were told "falling"** (Flash 1462 + Flash-EXIT 1242,
Darwin 799, Phocinae 826, Mini 505, older archives 6467). Blast
(`research/blast_rise_label.cjs`, shipped flags, rebuilt move states off vs on
over 74,008 archived decisions): **11,389 diffs, every one the pure word swap
"in the air, falling" -> "in the air, rising", zero other diffs** (the 10 fewer than
the census are two archives a live sweep was mid-write, excluded).

Probe at the s5 archetype (`probe_move.cjs`, decision 16, step 119, parlog
priorDeaths=0, mode=ARGMAX): baseline REPRODUCED exactly (max abs delta 0.0);
`RISE_LABEL=1` moves the distribution - left 0.542 -> 0.506, none 0.119 -> 0.161,
right 0.339 -> 0.333, max delta 4.2e-2 - but the argmax stays `left`. The label is
heard (the distribution moves) yet does not by itself flip this oscillation state;
the same state repeats 7 times in s5 with the same left choice. Live L13 (seeds 6+)
and the L5 regression run decide whether the correction helps, hurts, or is neutral
end to end.

## The climb census: losers burn out at the bottom, winners are already high (2026-10-10)

`research/l13_climb_census.cjs` - every life with >=5 gc==2 obj-gem_c decisions in the eight EXIT archives (mode/revisits parsed from the run's text log, 1:1 with the archive). Lives are split EXACTLY from the archive's deathLog, which lists every reset (deaths and unwinnable resets) with its step; the entry at a reset step is already the post-reset state, so a life ends before it. (An earlier version split on mf decreases and merged lives - it reported COLLECTED for s5, whose max gemsCollected is 2.) gem_c's deadline is mf 250.

The winning lives (s3, s4, s10 - identical in all three) are short:

```
climb life: 2 decisions mf 164..182 mode[2ARGMAX/0SAMPLE] revMax=0 -> COLLECTED
      1 floor(206..258@136)  move[jump_left:1]
      1 floor(156..208@63)   move[left:1]
```

By mf 164 the winning life already stands on `floor(206..258@136)`, one jump_left from gem_c's floor; collected at mf 182, 68 frames inside the deadline.

The losing lives (every losing seed, and the losing lives of the winning seeds) share one shape:

- **The time is spent airborne at the bottom**: 4-23 of 6-27 decisions airborne, the grounded ones on `floor(158..210@252)` / `floor(59..111@249)` - the two floors directly above the rising bottom laser.
- **The moves point away from the climb**: airborne `left` beats `right` in 60 of 60 losing lives with an airborne row (typically 7 left vs 2 right), grounded `left`/`jump_left` on the bottom floors. The climb chain is to the RIGHT and UP; the cat drifts LEFT and DOWN, bounces, repeats. The archetype state (161,208.8) rising is this bounce.
- **The clock runs out at the bottom**: the 63 losing climb lives (889 decisions) end at mf 149-249, median 242, with gc2 - gem_c burns (the run log prints `unwinnable @ step N collected=2 alive=0 -> reset` once per losing life).
- **The oscillation is the model's own greedy choice, not sampling noise, and escalation never engages**: 789 of 889 losing-climb decisions (88.8%) are mode=ARGMAX; revMax is 0 in 54 of 63 lives, 1 in 8, 2 in 1. The revisit/stuck machinery counts repeats at the SAME position; the bounce wanders over a wide area, so nothing fires. This is open-problems §2's cadence gap measured on L13: the oscillation is spatially distributed, not pointwise, and the current escalation is blind to it.

The determinism is total: the first losing climb life is byte-identical across seeds (same spawn, same argmax answers). What separates a seed is whether some life's bounce breaks right instead of left near the bottom - the winners' COLLECTED life is the same 2-decision finish in all three, so the break happens earlier, off the census's gc==2 window start.

**Verdict.** L13's remaining failure is execution cadence on the climb, not the menu, not the objective layer, not the clock annotation (URGENCY fires at every spawn-life decision, the route is feasible per `orderFeasibleN`). A cadence lever for a distributed oscillation (re-ask harder when the objective's clock burns and the cat's net displacement over the last N decisions is away from the route, not just same-position revisits) is the unmeasured family - `cadence.cjs` territory.

## AIR_ROUTE: the airborne route fact and the narrow survival fact both fail the EXIT_FACT bar (2026-10-10)

The airborne twin of EXIT_FACT, tried in two versions. Both predicates live in
`decision.cjs` (`airRoute`, `airSurvival`); the census is
`research/census_air_route.cjs` (default = route mode, `AIR_MODE=survival` =
narrow). **Neither was ever wired into the prompt** - the census killed both
before a gate was built, which is the process working: 405 archives, 29,631
airborne decisions, no live run spent.

**Broad `airRoute`.** For each hold {left, right, none}: the exact held arc from
the airborne state (`arc.simulate`, as `reachHolds` does), scored by remaining
route length - 0 if the arc collects the objective or lands on the holder floor,
else BFS hops from the landing floor to the holder, Infinity if the arc dies.
Fire iff exactly one hold gives the strict minimum. No bearing or prior-side
condition (the prompt is built before the answer, and a bearing filter would
suppress the L13 case: the model answers left against a right-hand gem).

- Fires on **9,381 of 29,631 airborne decisions (31.8%)** (tie 5,194, noHolder 12,793, allDie 2,121).
- Compliance is bimodal: Flash-EXIT L2 **87.5%** and L8 **86.4%** (levels that clear - the model already follows the good hold there), L13 ~30%.
- L13 climb window (gc2/gem_c): winners 32.4/36.0/33.3% (s3/s4/s10) vs losers 25.0-38.1% - **no winner/loser gap**.

Verdict (supervisor): fails the bar we used for EXIT_FACT; it would rewrite a
third of airborne prompts - the shape that regressed L8 with DESC_HONEST.

**Narrow `airSurvival`.** Fire iff exactly one hold SURVIVES when held to the
end (the other two end in laser/void); a trace touching the live portal box
counts as survival, same rule as the portal prune (both L13 wins' last decision
is airborne left INTO the portal - without this the sentence would steer away
from the winning hold). Objective-independent: a survival fact, not a route
preference.

- Fires on **8,871 of 29,631 airborne decisions (29.9%)** (multipleSurvive 17,332, noneSurvive 3,428). Not rare.
- L13 climb window: winners 39.3/39.1/38.9% vs losers 32.8-44.4% (the best complier is the s5 loser) - **no gap**.

Verdict: fails both criteria (rare AND winners comply high). Not built.

The motivating state is real: s5 step 116 (cat (166.25,219.6) dy -4.4, mf 115)
- holding left or right to the end dies in the laser, only `none` lands, and the
model answered `left`. `isFatal` does NOT prune left there because it allows
free steering after the committed frames, so the sentence would have been the
only signal. But the census shows the fact is not specific to winning play: it
names a hold in 3 of 10 airborne decisions everywhere, and winners follow it no
more than losers. State noise, not signal.

## NEG_HOLD: the negative airborne fact flips the bounce (2026-10-10, gated, probe-verified)

`negHold` (decision.cjs, gate `NEG_HOLD=1`): fire iff exactly ONE hold is strictly
worse (dies, or lands strictly farther from the objective's target set) and the
other two tie at best. The sentence names the bad hold and how it is bad
("Holding left until landing dies in a laser."). Held-to-landing wording, so it
cannot overclaim about mid-air re-steering. Census: `research/census_neg_hold.cjs`
(one source of truth - it calls the live predicate).

Blast (`research/blast_neg_hold.cjs`, shipped flags, NEG_HOLD off vs on):
**76,906 states, 6,852 predicate fires, 6,852 diffs, all pure appends of the one
sentence line, 0 non-append diffs, 0 fires with no diff. BLAST OK.**

Probes (Flash via systemone client, baselines REPRODUCED at max abs delta 0.0):

| state | archived | NEG_HOLD=1 | verdict |
|---|---|---|---|
| s10 step 119 (161,208.8) dy-3.2 mf118, BAD=left(dies laser) | left 0.542 right 0.339 | left 0.369 **right 0.477** | **ARGMAX FLIPS to the good hold** |
| s10 step 236 (162.75,208.8) dy-3.2 mf235, same bounce later | left 0.580 right 0.288 | left 0.370 **right 0.447** | **ARGMAX FLIPS** |
| L10 s3 step 143 (309,189.6) dy-2 mf138, BAD=left(dies laser) | left 0.971 | left 0.861 | heard (delta 0.11), no flip |

The two L13 states are the climb census's bounce itself: airborne at the bottom,
`left` dominating 60/60 losing lives, and left is exactly the hold that dies in
the rising laser. The fact is true, rare-ish (6,852/76,906 = 8.9% of all states;
24.1% of airborne gem-obj decisions), and at the archetype it moves the model off
the suicidal hold. The census avoid-rate at L13 was 5.0% - the model takes the
bad hold 95% of firings there - so there is full dynamic range for the fact to
act on. What it cannot do is measure the trajectory: only a live run answers
whether the flipped bounce reaches the climb chain before gem_c's deadline.

## The endgame dither is real; the portal-reach fact is true but not rare (2026-10-10)

Live NEG_HOLD s5 proved the shape: the climb worked (gem_c at step 713, mf 188,
on floor(156..208@63)), then the cat dithered on that floor - left 0.91, left
0.52, right 0.68, right 0.55, left 0.93 (x 185 -> 164 -> 182), never stepped off,
life ended. The portal (180,150) floats 87px under the floor's middle.

Premise correction (census, not hand-check): at those states EXIT_FACT is silent
with reason **noHolder**, not exitsAmbiguous - `platformHolding(13,180,150)` is
null, the portal floats between floors, the same gap as L11's floating gem. The
real both-sides ties of EXIT_FACT are a different population: 5,361/78,037
decisions overall (heaviest: clef L12 39%, Darwin L7 70%, Flash L12 ~37%, L13
~15%; model at tie states picks right 3,116 vs left 1,797). `research/census_exit_tie.cjs`.

The portal-reach candidate (`research/census_portal_reach.cjs`, predicate
local): grounded + obj portal + gc3; for each floor end, the airborne state just
past the edge (step outward until platformKeyUnder leaves the floor), and
survival.canStillLand with a hits Set so the ONLY true return is a portal-box
touch under free steering. At all five dither states: L=true R=true - both ends
reach, the "either end" case.

Census over all archives: 1,349 grounded portal-obj gc3 decisions, **1,323 fire
(98%), and nearly all are both-ends** (the portal sits mid-map, so from almost
any floor at least one - usually both - step-offs can steer onto it). It fires
on CLEARED runs at full rate (Darwin L5 10/10, Flash L2/L8/L10 clears, clef L10
8/8). Model moves at firing states: left 509, right 343, jump_left 208, jump 135,
jump_right 128.

**Verdict: true, but it fails the specificity bar the same way FLOAT_EXIT did -
a fact that fires on 98% of the population and on every clearing run says
nothing the state description does not already allow.** The dither is not
missing-information: the cat knows the floor ends exist (the floor note names
them) and still ping-pongs. That points at the cadence/escalation family (the
cat is not making progress toward the portal over N decisions - a net-
displacement trigger, same gap as the L13 climb bounce), not at a new state
fact. No gate built.

## The endgame dither: descent IS offered; the lock, not the menu, keeps portal (2026-10-10)

NEG/s5 steps 713-737 (gc=3, floor(156..208@63), portal below, x inside the span):
the objective menu carries BOTH descents at all five decisions
(`[descent_left, descent_right, portal]` in some order). Objective probs from
`probe_move --objective` (baselines REPRODUCED 0.0, NEG build flags):

```
idx64 step713 x185.5  asked=true   portal 0.415 | descent_left 0.351 | descent_right 0.234  (narrow, 0.064)
idx65 step719 x175    asked=false  portal 0.834 | dl 0.102 | dr 0.064
idx66 step725 x164.5  asked=false  portal 0.714 | dl 0.106 | dr 0.180
idx67 step731 x171.5  asked=false  portal 0.763 | dl 0.039 | dr 0.198
idx68 step737 x182    asked=false  portal 0.175 | dl 0.397 | descent_right 0.428  <- FRESH PICK FLIPS
```

Only idx64 was actually asked; the STICKY lock then held `portal` for the rest
(same menu set, floor unchanged -> no release). At idx68 a FRESH ask picks
`descent_right` outright (0.428 vs portal 0.175) - the model's own preference
flipped two decisions before the death, and the lock never let it show. The s8
winner is the mirror image: its first gc=3 fresh pick WAS descent_right (0.98
commit), and the lock held the productive side.

So the L13 endgame lever is NOT a sentence: the descent is offered and, at the
decisive late states, preferred. It is the objective-lock CADENCE (open-problems
section 6): a lock that holds a 0.064-margin pick through five decisions can
lock in the losing side. Any gate here must respect rule 2 (menu stays flat and
simultaneous) - a re-ask cadence does; a menu rewrite would not. Unproven; the
cheap live test is a re-ask-every-N-decisions A/B at N=2/3 on L13, not a prompt
change.

## PORTAL_DESC: the descent-carries-the-portal sentence (2026-10-10, gated, live-pending)

`PORTAL_DESC=1` (off by default) appends to a descent objective entry: `; dropping
off this end, the cat can steer into the exit portal on the way down` - only when
`gemsCollected >= 3` AND `survival.canStillLand(..., portal=true)` proves a
trajectory from just past THAT edge can touch the portal box (per-edge proof, not
a global claim). Blast (`research/blast_portal_desc.cjs`, objective-call text,
old = pre-gate copy): gate off **0 of 82,486**; gate on **323 diffs, all pure
sentence appends**, per level L7 152, L9 110, L13 31, L8 25, L5 5 (~0.4% of
decisions - the gc>=3 endgames).

Probe at the five dither states (NEG/s5 idx64-68, baselines all REPRODUCED 0.0,
patched arm = gate forced on):

```
idx64 x185.5  portal 0.415 -> 0.119 | descent_left 0.351 -> 0.641   FLIP
idx65 x175    portal 0.834 -> 0.457 | dl 0.102 -> 0.274             no flip (narrowed)
idx66 x164.5  portal 0.714 -> 0.136 | dl 0.106 -> 0.460             FLIP
idx67 x171.5  portal 0.763 -> 0.558 | dr 0.198 -> 0.383             no flip (narrowed)
idx68 x182    (fresh baseline already descent_right) -> descent_left stronger
```

The sentence lowers `portal` at every state and raises the descents at every
state; 2 of 4 asked-fresh states flip outright. Live test: L13 at 4 seeds plus
regression on L2/L5/L8 (their gc=3 endgames are where the blast fires).
Probe scratch: a gate-forced copy of decision.cjs (deleted after recording).

## Sticky-lock audit: how often does the lock fight a fresh preference? (2026-10-10)

Archives: gc=3 portal-objective decisions split **264 asked / 2,723 held** (the
lock holds `portal` without re-asking in 91% of endgame decisions; biggest
piles: Clef L2 169, Clef L4 variants ~110-166, Mini L10 111, Flash L6 s2 71).
Sampled 12 held states across five archives (NEG/s5 L13 x3, RISE/s5 L13 x3,
Flash/s2 L6 x3, EXIT/s3 L13 x3; every baseline REPRODUCED 0.0; Mini/s1 L10 not
probeable - Mini is not the served model):

- **10 of 12: fresh pick = portal** - the lock agrees with the model.
- **2 of 12: fresh pick = descent_right** (NEG/s5 idx68, RISE/s5 idx70) - and
  both are the LAST held decision before the life ended, the same tail-flip
  pattern as the original idx68 finding.

So the lock is not fighting the model across the endgame; it agrees with a fresh
ask ~83-100% of the time except at the dither tail, where the model's own
preference flips too late. The lock is not the lever; the sentence that moves
the fresh preference (PORTAL_DESC) is, and it is under live test now. No cadence
change proposed.

## PORTAL_DESC live result (2026-10-10): 2 of 4 on seeds that were 0 of 4

Full stack + PORTAL_DESC=1, L13 seeds 5/6/7/9 (all four had failed without it):
**s5 WON, s9 WON (7 deaths), s6 and s7 not cleared** - both stuck at 2 gems and
never reached the endgame, where the gate can fire at all (it is gc>=3-only, so
s6/s7 ran the pre-gate prompt; their failure is the earlier-floor problem, not a
regression). 2 of 4 vs 0 of 4 on the same seeds. Regression on the blast-touched
levels (L7/L9/L8/L5 at s3/s6) running at report time.
