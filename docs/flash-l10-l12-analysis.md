# Flash L10 / L11 / L12: residency and route analysis (2026-10-10)

**STATUS (2026-10-10).** With the portal prune fix + `EXIT_FACT=1`, Flash clears
**10 of 14** at seed 3: L0, L1, L2 (5 of 5 seeds with the gate), L3, L5, L6, L7,
L8, L9, and **L13 WON (2 of 3 seeds)** - the first wins by playing. Remaining:
**L4, L10, L11, L12**, none with a working lever yet. L4: six-plus levers null
(including DESC_HONEST, [flash-l4-analysis.md](flash-l4-analysis.md)). L10/L11/L12:
residency censuses done (`experiments/residency.cjs`); L11 = the objective pins an
unreachable floating gem while the cat ping-pongs two floors; L12 = ~60% of decisions
on `floor(247..299@125)` oscillating directly over gem_a, `EXIT_FACT` fires there but
does not bite (refusals at p(right) 0.87-0.94); L12 has never been cleared by any
endpoint. FLOAT_EXIT (the L11-shaped lever) was censused and rejected - see the
section at the end and [dead-ends.md](dead-ends.md). Paired references: L10 Clef +
Flash s1 clear, L11 Darwin s2 clear, L12 none.

Offline census of the three remaining Flash failures after L13 was fixed
(`experiments/residency.cjs <level> <archives...>`, `experiments/l11_route_census.cjs`).
Baselines: `out/byom/PurpleMIST-Flash-1.0/s3|s4`. Paired clears: L10 Clef
(`out/exp_lag2_s1/raw/run_level_10_clef.json`, 16 decisions) and Flash's own s1;
L11 Darwin s2 (the only L11 clear in the archive). L12 has never been cleared by
any endpoint - no paired reference exists.

## Shared signature

Each failing level loses exactly one gem that is **never collected** (checked by
mapping live `gemPositions` to the game-source spawn table every decision):

- **L10 s3/s4**: gem_a, gem_b collected every life (mf 84/107); **gem_c never collected**, never burned. Flash spends 53-57% of decisions airborne (obj gem_c:65-75) vs Clef's clear at 16 decisions total.
- **L11 s3/s4**: gem_b, gem_c collected every life (mf 64/121); **gem_a never collected**. Flash spends 41-42% on `floor(181..233@187)` + 21-26% on `floor(145..197@231)`, obj gem_a on ~109 of each run's decisions.
- **L12 s3/s4**: only gem_b collected (mf 78); **gem_a and gem_c never collected**. 58-62% of decisions on `floor(247..299@125)` at mf~295-302, obj gem_a, moves split right/left (oscillation).

## L11: the floating-gem route gap (decisive, `l11_route_census.cjs`)

L11 gem_a spawns at **(180,76)** (game source via `experiments/gem_table.cjs`) and
**has no holder** - it floats; `platformHolding` returns null. That is why
`exitDirection` is silent on L11 (reason `noHolder`): the predicate routes to the
holder, which does not exist.

Exact-arc census (arc.simulate with `onFrame`, gem box 16x16 centered, cat box
[x,x+1]x[y-h,y]): **the only platform from which any grounded action collects
gem_a is `floor(88..140@114)` via `jump_right`** (mf 150). Flash never visits that
floor in either seed. Darwin's clear spends 12% of its decisions on it.

Distance census (g4 BFS from the cat's floor to the collect platform, per
archived decision with obj gem_a, 155 decisions):

| floor | BFS dist to collect platform | decisions |
| --- | --- | --- |
| floor(181..233@187) | 4 | 109 |
| floor(145..197@231) | 3 | 45 |

At **47** of the 155 decisions an offered move's simulated landing strictly
decreases the distance; the archived move did so at **9** of those 47 (19%
compliance). The oscillation: from `floor(181..233@187)` walking left descends to
`floor(145..197@231)` (dist 4->3, decreasing, taken 92x), but from
`floor(145..197@231)` gem_a's x (180) is straight above, so the bearing pulls
right (right:37 + jump_right:20 back up to dist 4). The productive continuation
is LEFT again (231 -> 211 -> 152 -> 114 -> jump_right collects).

Snap check (supervisor, resolved against the game source). The game's snap is
`updateCatSprite.ts`: with `isMovingDown = dy >= 0` (true AT the apex, dy == 0),
any overlap of the cat's collision box (1px wide, full height, head included)
with a platform's box teleports the cat to the platform's y - the measured +78px
on L4. Both offline models already implement this rule: `arc.simulate` ("includes
the side-snap, which the game applies to ANY overlap while dy >= 0", and its
frame loop tests the snap at dy >= 0 including the apex frame) and
`reachability.landingsFrom` (band test + "only snaps while moving down"; its
ONE-FRAME-BEHIND comment documents the L4 y=93 boundary case). So the 108
`noDecrease` decisions are NOT a modeling gap, and direct verification closes
it: the snap-aware landing set from `floor(181..233@187)` over every launch x
and every steer direction is exactly {itself, floor(222..274@228),
floor(145..197@231)} - all at or below - and no launch x on that floor has a
jump_left snap edge onto `floor(88..140@114)` (the apex band misses its right
edge by ~6px: the reachable column starts at x=146 against the platform's
right edge at 140). The loop floor is a genuine dead end for gem_a; the
productive route runs through `floor(145..197@231)` and its left chain.

**Candidate lever (censused 2026-10-10 and REJECTED - see the FLOAT_EXIT census
below and [dead-ends.md](dead-ends.md)):** generalize
`exitDirection` to holderless gems - replace the holder target with the
arc-computed COLLECT platform set and fire when all shortest routes to it leave
opposite the gem's bearing. On L11's loop floors the bearing to gem_a points at
the gem's x while every shortest route goes left - the same shape EXIT_FACT was
built for, one level up (route-to-collector instead of route-to-holder).

## L12: EXIT_FACT already fires; the model still declines

`floor(247..299@125)` obj gem_a (279,169, holder floor(255..307@209)): the
existing `exitDirection` predicate FIRES there - all min-length routes leave the
LEFT end (d=2, landing directly on gem_a's holder) while the bearing says right.
Archived refusals: p(right) 0.87-0.94 against p(left) 0.05-0.13. The fixed-build
L12 s3 run (EXIT_FACT=1) still failed (peak 1 gem, 53% on the same floor), so
the one-sentence gate did not flip this state - unlike L2, where the same gate
cleared 5/5. L12's refusals are stronger (0.94 vs L2's 0.84) and the level has
no clearing reference at any endpoint.

## L10: airborne gem_c chase, no prompt-shape lead yet

53-57% airborne with obj gem_c; the clearing runs (Clef 16 decisions, Flash s1
96) pass through the same floors quickly. No predicate fires; no paired
divergence identified yet. Parked: L11 has the clearest mechanism and a concrete
candidate lever, L12's gate exists but doesn't bite, L10 has no lead.

## Next

1. Census the floating-gem generalization of `exitDirection` offline (firing rate
   on L11 loop floors, zero-fire check on clearing levels' archives), then gate
   it (FLOAT_EXIT=1) and A/B at an L11 archetype decision.
2. Live L4/L8 DESC_HONEST results from the supervisor -> record in results.md.
3. L10: paired first-divergence once a better reference than a 16-decision run exists.

## FLOAT_EXIT census (2026-10-10) - predicate built, gate NOT built, bar NOT met

`dec.floatExit(snap, levelGems, objName, objX, objY, mf)` (decision.cjs, exported,
NO prompt wiring): the holderless sibling of `exitDirection`. Target = the
COLLECT platform set (platforms from which some jump's traced `arc.simulate`
arc passes the gem's 16x16 box; game boxes, cached per level+gem). Routes =
`descentPoints` landings + exact jump arcs from catX, BFS over g4 to the set.
Fire iff all min-length routes leave one side, opposite the gem's bearing.
Census: `experiments/census_float_exit.cjs` (requires the predicate; one source
of truth), 372 archives / 70,351 decisions:

```
reasons: notGrounded 25679, hasHolder 23725, notGem 10900, sideMatchesDir 3786,
collectFromHere 1466, exitsAmbiguous 1313, noExits 1141, unreachable 321

level | cleared/failed: fire/total (comply%, excl. one-option menus)
 3 CLEARED   67/  251 comply=22%   3 failed   753/7639 comply=30%
 5 CLEARED    1/  972 comply= 0%   5 failed    19/1947 comply=21%
 6 failed   133/ 8275 comply=21%
10 CLEARED    7/  316 comply= 0%  10 failed    90/3454 comply= 2%
11 CLEARED   13/  198 comply=31%  11 failed   870/6402 comply= 4%
13 failed    67/ 9261 comply= 0%
```

**Verdict: does not pass the EXIT_FACT bar, two reasons.** (Supervisor's read,
final: clearing-run compliance 0-31% is no better than failing-run compliance,
so the fact does not describe what winners do - recorded in
[dead-ends.md](dead-ends.md); no gate built.) (1) It fires on CLEARING runs at
real rates (L3 cleared 67/251 = 27%, L10 cleared 7/316, L11 cleared 13/198):
EXIT_FACT's specificity check was zero fires on the endpoint that clears; this
predicate fires while models clear, so the sentence would have been saying the
wrong thing on runs that win. (2) A design flaw found in
the dump: the single-move route vocabulary (one descent or one jump from the
cat's x) cannot see walk-then-jump routes, so when the cat stands far from the
productive end the predicate can name the DEAD-END side as the shortest route
(L11 s1 step 128: cat (183.25,231), gem_a bearing left, fire says D=right -
the jump_right route to the dead-end floor(181..233@187), d=5 - because
jump_left from x=183 lands nowhere and the productive walk-left-then-jump-left
is two moves). The compliance floor of 4% on L11 failed is partly this flaw,
not all model stubbornness. The step-171 firing (cat near the left edge,
D=left, model answered jump_right 0.61) is the good shape.

Candidate refinements (NOT built, supervisor's call): end-based routing (for
each floor END, the best exit from that end plus the walk to it, so the route
vocabulary sees walk-then-jump); or restrict firing to states within a jump's
carry of the productive end; or drop the lever and treat L11 as the same
execution-oscillation family as L6/L12 (open-problems §2b), where six prompt
levers have already gone null.

## L12: EXIT_FACT flips live, but the LEFT route it names snaps the cat UP (2026-10-10)

The "EXIT_FACT fires but the model refuses" reading is **outdated**. Comparing the
baseline and the fixed build (`EXIT_FACT=1`) at the identical archetype state
(`floor(247..299@125)`, obj gem_a, mf 303, cat 263.25): baseline `move=right`
p(right)=0.945; fixed build `move=left` p(left)=0.648. The sentence moves the
distribution live, exactly as it did on L2. All logged firings on that floor in
the fixed archive are ARGMAX left (0.65-0.70). The level still fails, and the
trace says why:

Fixed-build s3 trace, decisions 28-40: the cat complies, walks left off the end
at x=247 - and the NEXT decision finds it at (242.25,**108**) on
`floor(193..245@108)`, the floor ABOVE. It ping-pongs 108<->125 until it falls at
mf 399 and dies one frame before gem_a's deadline (400). `arc.simulate` confirms
the up-snap: held-left from (247.5,125) mf 309 lands at (242.3,**108**). The
game's snap (full cat box vs platform box at dy>=0, `updateCatSprite.ts`) catches
the upper floor's side as the cat steps off, and teleports it UP.

**So the EXIT_FACT sentence is FALSE at this state**: "the shortest way down to it
is off the left end" - the left end snaps up, it is not a way down at all. The
cause is the predicate's descent landings: `descentPoints`' `lands` keys come from
the `landingsFrom` envelope, which lists the DOWNWARD landings (255..307@209,
220..272@231, 173..225@243) and misses the upward side-snap onto
`floor(193..245@108)`. exitDirection then routes d=2 through floors the cat can
never land on. Fix direction (supervisor-approved, not yet built): take descent
landings from `arc.simulate` (the held-side walk-off from catX, plus the
release-at-edge drop), the same source the jump routes already use - so a descent
that snaps up is not counted as a way down. This may also touch L4, whose loop
floor has the same up-floor-adjacent geometry.

Simulator caveat found on the way: `simulate(12, 252.75, 125, 0, 18, 'left', 309,
{grounded:true})` returns landed at (249.3,125) - re-snapped to the cat's OWN
floor mid-walk-off - while the live game reached the 108 floor from that exact
state. The 1px column convention (`hi + 1 > box.left`) against the own floor's
left edge needs checking before the descent-landing fix is trusted; the same
convention is documented as decisive in `reachability.landingsFrom`'s comment.

DeathLog (archive `deathLog`, the authoritative record): L12 s3 8 entries, s4 7
entries - all "fell out of bounds or was hit by the laser" with action left/right
at the pacing floor, plus one unwinnable reset each ("1 collected + 1 alive
cannot reach 3"). L12 is not a burn-loss: each life paces until the closing laser
reaches the floor. L10 s3/s4: NO unwinnable resets and NO burns - gem_c (287,68,
deadline 335) is alive at every run end; deaths reset mf before it can burn. L10
is a pure never-collected failure. (`experiments/burn_context.cjs` keeps the
per-run context; `deathLog` is the authoritative source for deaths.)

## L12 up-snap: exitDirection v2 (2026-10-10, `EXIT_FACT=2`, not shipped)

The live flip at step 304 sent the cat left off `floor(247..299@125)` and the game
SNAPPED IT UP to `floor(193..245@108)` - the EXIT_FACT sentence ("the shortest way
down is off the left end") was false there. Ground truth on how step-offs really land
(Clef's L2 CLEAR archive, `out/clef_baseline/run_level_2_clef.json`): the cat steps
off the left edge holding left (76.75 -> airborne 66.25), then STEERS RIGHT mid-fall
(step 69) and lands at 99.5 on `floor(84..136@240)` - the envelope's "steer to land"
claim is real and is produced by a mid-air reversal.

v2 computes descent landings with `survival.landingPlatforms` (committed side-hold
from just past the edge, then free steering - the same bounds `isFatal` uses). The
edge x is computed, not hand-derived: step outward 0.25px from the edge until
`platformKeyUnder` stops returning the cat's floor. Answers on L12 step 304 state:
the left step-off's ONLY landing is the up-snap floor(193..245@108) (free steering
included); the right step-off dies. v2 also fires only when every min-route landing
is strictly BELOW the cat's floor (the sentence says "down"). Effect: the L12
up-snap firings (steps 262/268/304) go silent (`noDownExits`); the remaining L12
firings (steps 220/232/244, cat right above gem_a) claim the right end, whose
landings include the holder - a true claim.

Census, both versions, 396 archives / 73,505 decisions (per-endpoint table fixed:
it used to merge archives sharing level+outcome under the first-seen endpoint):

```
v1 (live, envelope): fired 4226; Flash 1021/11648 (8.8%) comply 18.2%;
  EXIT archives 786/6658 (11.8%) comply 52.8%; clef 1665/37552 (4.4%) comply 34.3%
v2 (landingPlatforms + down-filter): fired 2622 (+ noDownExits 6090);
  Flash 813/11648 (7.0%) comply 19.6%; EXIT archives 513/6447 (8.0%) comply 55.8%
```

The L2 assert state fires `D=left` identically in both versions (routes byte-equal).
v1 stays the live `EXIT_FACT=1` (it is the version proven live: L2 5/5, part of the
L13 wins); v2 is `EXIT_FACT=2`, honest about up-snaps, awaiting a live L2+L12 A/B
before it can ship. `CENSUS_EXIT_MODE=v2` runs the census against v2.

## L10: the floor(304..356@140) diagnosis (2026-10-10, decisive)

Archives: baseline s1-s4 and fixed-build EXIT s3/s4 (`residency.cjs` + per-life
deathLog split). EXIT s3/s4 are decision-identical to baseline s3/s4 - EXIT_FACT
is silent on L10 (grounded-only, and the objective is above). All deaths in every
run are "fell out of bounds or was hit by the laser" (17 per failing run); no
unwinnable resets: gem_c's deadline is mf 335 (gem_b 450, gem_a 610) and lives
end at mf <= 218, so **gem_c never burns - L10 is not a clock problem**. s1
CLEARED (96 decisions, 6 deaths, portal at mf 195); s2-s4 peak at gc2.

**The route.** gem_c(287,68) floats (`platformHolding` = null). The ONLY touch
jump is **jump_left from floor(304..356@140)**: `arc.simulate` touches the gem
box from every x on that floor (f 11-17) and lands back on floor(212..264@150).
s1's winning collection matches the sim exactly: jump_left from (323,140) ->
collected mf 148, recorded at (261.75,150) = the sim's landing. The arrival is
**jump_right from the right end of floor(212..264@150)**; the arc side-snaps onto
@140 at exactly (323,140) in all three seeds that landed it (s1's win, s4 twice).

**The model already aims gem_c.** First objective is gem_c in 34 of 36 lives, and
URGENCY (DESTROYED FIRST) annotates gem_c on 8/8 spawn-life decisions
(`l13_urgency_gate.cjs 48 10`) - ordering is not the problem, execution is.

**Two distinct failure modes, one lucky win:**
- **s3: mid-air steering abandons the landing (6/6 attempts).** The jump_right arc
  is on track for the tower, but a mid-air decision at the apex - cat (309,117.6)
  dy +4, gem_c 22px to the LEFT and far above - answers `left`, the cat slides
  off the towers left edge (@140 and @90 both start at x=304) and dies. s3 has
  ZERO grounded visits to @140 or @90. Same family as the L13 bounce: steering
  toward the gem's horizontal bearing while airborne.
- **s4: right floor, wrong jump (2/2 landings).** s4 landed on @140 twice (same
  (323,140)) and answered `left` both times - walking off instead of the jump_left
  that touches the gem. One of the two had objective gem_c. The winning move was
  on the menu: s1 at the identical state answered jump_left with p=0.81.
- **s1's win had no mid-air decision inside the arc** (37 steps between the jump
  and the landing - timing luck), landed @140, and took the jump_left.

**Why the rejected airborne predicates would not have helped here.** At the s3
apex state the needed fact is "holding left DIES" - but right and none tie (both
land on the tower), so the strict-minimum `airRoute` and the unique-survivor
`airSurvival` both stay silent. The s4 state needs a grounded jump fact (jump_left
from @140 touches gem_c) - JUMP_FACTS territory, not airborne. No prompt-shape
lever proposed from this census; the two failure modes are different and each
needs its own measured fact.

**NEG_HOLD probe on L10 (2026-10-10): heard, no flip.** Correction first: the s3
apex state (309,117.6) dy+4 does NOT fire NEG_HOLD - holding left AND right both
die there (d = Infinity, Infinity, 0), so there is no unique bad hold and the
predicate is silent (`notTwoBest`). The firing L10 state is one decision earlier
in the same approach: s3 step 143 (309,189.6) dy-2 mf138, where left dies in the
laser and right/none tie at d=1 - and the model answered the bad hold (left,
0.971). Probe with NEG_HOLD=1: left 0.971 -> 0.861, none 0.020 -> 0.098 - the
sentence is heard (delta 0.11) but the argmax does not move. The prior at the
apex approach is too strong for one appended fact; L10 mode-1 stays open.

## L12 @125 residency: the objective layer keeps the under-floor gem (2026-10-10)

Full print of every grounded decision on `floor(247..299@125)` across the six Flash
L4-analog archives (baseline s1-s4, EXIT s3/s4), tallied:

- **Objective layer:** `obj=gem_a` in **896 of 982** decisions (91.2%). gem_a
  (279,169) sits on `floor(255..307@209)` - directly BELOW the pacing floor, its
  x inside the floor's span. A descent was offered in **982/982** and picked as
  objective **16 times (1.6%)**.
- **Move layer:** not a dither - high-confidence oscillation (argmax 0.92-0.96)
  between x≈258 and x≈291, i.e. around gem_a's x=279, never reaching the edges
  (247/299). "Head toward gem_a" is satisfied by pacing under it; mf burns
  207→383 into the closing laser. This is the same objective-layer shape as L4's
  @93 (gem kept, waypoint refused), with the twist that the gem's horizontal
  bearing points at the MIDDLE of the floor, so the walk has no productive end.
- **DESC_ANNOT: 0 fires here.** Both descents claim three landing floors each
  (envelope: left → @209/@231/@243, right → @165/@209/@231); gem_a's holder @209
  is among them but never the ONLY one, so the overclaim guard refuses.
- **EXIT_FACT v1: fires ~28%** of these decisions (173/982 across archives, all
  `D=left`); v2 fires ~9% (75/982) after the up-snap honesty filter. (An earlier
  tally in chat said 0 - that call passed undefined objective coords; corrected
  here.) The v1 firings are the known FALSE ones: the left step-off up-snaps to
  `floor(193..245@108)` (section above), which is why the live flip ping-pongs
  108<->125 instead of descending.

The uncovered fact: **objective's holder is below AND its x-span overlaps the
current floor** - the gem is under the floor, reachable only off an edge, and the
horizontal bearing is a trap. Census: `experiments/census_below_fact.cjs`.

## EXIT_FACT v1.1: the up-snap correction, now live as EXIT_FACT=1 (2026-10-10)

v1.1 = v1 exactly, minus any descent exit whose EXACT step-off (`arc.simulate`
held toward the edge from just past it, `grounded:false`) lands on a floor HIGHER
than the cat's. It exists because v1's envelope misses the up-snap, so on L12
@125 v1 fired `D=left` on 173/982 decisions where stepping off the left end
teleports the cat UP to floor(193..245@108) - a false "way down". Checks, all
pass: the L2 assert state (s1 step 54) still fires `D=left` byte-equal; the L12
@125 up-snap firings are gone; blast vs v1 (`experiments/blast_exit_v11.cjs`,
40,849 rebuilt predicate calls over every archived grounded decision):

```
v1-vs-v1.1 firing diffs 1318, explained by up-snap 1318, per level {"12":1318}
per level (removed/added/sideChanged): {"12":{"removed":998,"added":320,"sideChanged":0}}
```

Every other level, including all clearing levels (L2/L5/L8/L9), is byte-identical
to v1. The 320 ADDITIONS are v1's `exitsAmbiguous` ties collapsing to the one real
side once the up-snap half is dropped - legitimate but new live behaviour, so v1.1
gets its own live check: L12 at seeds 3/4/5 (no other regression needed; nothing
else changed). LIVE RESULT (full stack, seeds 3/4/5): NOT cleared - 2, 1, 1 gems.
The 320 added firings did not break anything (s3 peaked 2 gems vs 1 at the s3
baseline) but did not clear the level either: the up-snap correction is honest
but not sufficient; L12 stays unclosed at every endpoint tried. `EXIT_FACT=1` now selects v1.1; `EXIT_FACT=2` stays v2. The audit
doc gained site 14 (`exitDirection` v1.1 step-off simulate, line 2049).

## BELOW_FACT census: target under the floor (2026-10-10, `census_below_fact.cjs`, NOT gated)

Predicate: grounded, and the objective's holder (or the live portal) is BELOW the
cat's floor with the target's x INSIDE the floor's span - only an end leads down.
41,384 grounded decisions with a gem/portal objective, 346 archives: fires on
**8,698 (21.0%)** - broad, as expected.

Bar = winners vs losers at firing states (compliance = the move heads to an end
that leads down; `exitsAmbiguous` = either end, counted compliant):

- **L12: no separation, because L12 has no winners** - Clef fails it too
  (51.6% fire, 12.2% comply; Flash 52-58% fire, 21-22% comply; NEG build 64%).
  The pacing floor is a level-wide trap, not a model gap.
- **L2: no separation** - Flash cleared runs comply 21-46%, failed runs 25%;
  Clef clears at 14% compliance. Winners do NOT head down more than losers.
- **L8: reversed** - Clef's cleared runs comply 5.6% vs 30% in its failed runs.
- **L13: the endgame dither DOES fire** (corrected 2026-10-10 after the
  supervisor's read). The dither is on `floor(156..208@63)` (gem_c's floor),
  portal x=180 inside the span - the NEG/s5 and RISE/s5 archives' 5 gc=3 grounded
  decisions at x 185.5/175/164.5/171.5/182 are exactly the census's 5 NEG/RISE
  firings (the 206..258@136 floor is a different, older dither). And there IS a
  winner-vs-loser separation at these states, in the OBJECTIVE layer: the s8
  WINNER passed through with `obj=descent_right` and committed right at 0.90-0.98
  (3 decisions), the s5 loser kept `obj=portal` and oscillated (5 decisions,
  compliance 0%). Caveats that keep the verdict: one winner/loser pair only; the
  gem levels show no separation (L2) or reversed (L8); and `exitDirection` returns
  `noHolder` at every portal state (the portal floats, `platformHolding(180,150)`
  is null) so v1.1 can never speak there - a portal sentence would be new text.
- descent-as-objective at firing states: **0 everywhere** - same refusal pattern
  as L4's @93.

EXIT_FACT v1.1 overlap: at firing states v1.1 already speaks or adjudicates on
30-35% of L12, 32-56% of L2, 54-98% of L8, ~0% of L11/L13 - the one-sided cases
are its; the BELOW-only remainder is mostly `exitsAmbiguous` (both ends lead
down) and `sideMatchesDir`. An honest sentence for the remainder exists
("<target> is directly below this floor; only the left/right/either end leads
down to it"), but with no winners-vs-losers separation on the gem levels the fact
is NOT specific enough to gate: it is true at 21% of all decisions and the gem-
level winners comply no more than the losers. Verdict: censused, NOT gated. The
one surviving lead inside this shape is the L13 portal endgame specifically (the
winner picked descent_right, the loser kept portal, and v1.1 is structurally
silent there via `noHolder`) - a portal-only sentence would be a separate,
narrowly-targeted probe, not this fact. Script:
experiments/census_below_fact.cjs.

## L12 @125: the ascent note is NOT the gap-note analogue (2026-10-10)

The @125 pacing text has no gap note (gem_a's x is inside the floor span, so
`gapMsg` never fires); the only asymmetric side note is the JUMP_FACTS ascent
note naming two up-left platforms while the objective is 44px below. Census
(`experiments/census_ascent_note.cjs`, shipped flags, 52,179 grounded decisions):
the note fires at **19,395 decisions (37.2%)**, of which the objective is below
the floor at **3,632 (7.0%)** - L12: 1,728 fired / 911 obj-below / firedW 0
(no L12 winner exists anywhere in the archive). A/B at the two @125 pacing
decisions (NEG/s5 idx15 chose left, idx16 chose right; baselines REPRODUCED 0.0;
patched = ascent note removed): **no flip at either state.** idx15: left holds
argmax (0.474 -> 0.331, jump_left 0.421 -> 0.138); idx16: right holds (0.538 ->
0.558) and left DROPS when the note is removed (0.291 -> 0.091) - the note was
slightly helping the left side, the opposite of the L4 gap note's role. The
@125 coin-flip is not caused by a misleading side note; no gate proposed.
Scratch: decision_ascent_off_scratch.cjs (untracked).

## L11 @231: the loop is route-vs-bearing, and a graph-verified route clause flips it (2026-10-10, A/B)

Flash's L11 loop (EXIT/s3, 119 grounded @187 + 76 @231 decisions): obj=gem_a
(180,76, floating; 2 gems already collected). Cycle: @231 jump_right (0.34-0.64,
bearing "28px right") -> lands @187 x192 (arc.simulate agrees: (192,187)) ->
@187 walk LEFT (0.62-0.79, bearing "26px left") -> falls off the left edge ->
@231 -> repeat. Darwin's s2 clear ran the SAME loop for 9 cycles, then escaped
with jump_left from @231: @211 -> @152 -> @114 -> jump_right collects gem_a
(read from its log, frames idx 184-190). The reachability graph confirms:
route @231->@211->@152->@114 (LEFT); @187's only edges are DOWN (@228, @231) -
it is a dead end for the climb.

What the notes get right (checked, not guessed): the @231 ascent note lists BOTH
@187 (right) and @211 (left) and both are true FROM THE CAT'S X (arc.simulate:
jump_left from 148-170 all land @211; jump_right from 151.75 lands @187 - and
the live jump did land there). The @187 note "No higher platform can be reached
by a jump from this floor" is TRUE (Darwin's jump_left from @187 lands @231,
read from its log). So neither note is the L4-type lie; the failure is that
nothing says WHICH listed floor is the route, and the bearing points at the
dead end. The objective menu cannot help: at @231 it offers only
`[gem_a, ascent_right]` (ascent_left is never generated - hopPoints is
single-hop toward the objective), and gem_a wins 0.977.

A/B (baselines REPRODUCED 0.0; scratch appends one clause to the ascent note,
both clauses graph-verified): `The shortest route to gem_a leaves this floor by
jumping LEFT (to x 62..114 at y 211); the floor to the right (x 181..233 at y
187) does not lead to it.`

```
idx17 x151.75  jump_right 0.608 -> 0.001 | jump_left 0.011 -> 0.824   FLIP
idx20 x153.50  jump_right 0.640 -> 0.001 | jump_left 0.023 -> 0.823   FLIP
idx57 x153.50  jump_right 0.640 -> 0.001 | jump_left 0.023 -> 0.823   FLIP (death-history assumed)
```

3 of 3 flips, the largest deltas of the session. NOT yet gated: needs the
supervisor's wording call + a gate that computes both clauses (BFS route side +
dead-end check) and a census (fires only where the ascent note lists >=2 floors
AND the route side opposes the bearing - expect rare). Scratch:
decision_l11_route_scratch.cjs (untracked).

## ROUTE_ASCENT: built, gated off, parked (2026-10-10)

The A/B clause is shipped as `ROUTE_ASCENT=1` (off by default; npm test green,
audit re-pinned +56). `routeAscentClause` in decision.cjs appends to the ascent
note, only when: grounded, the objective is a live gem, the note lists >=2
floors, a forward BFS on the (DIRECTED - the first reverse-BFS draft was wrong,
A->B means "a jump from A lands on B") floor graph says the shortest route to a
collector floor (holder or runJumpWindow-collectable) leaves this floor via
first hops on exactly ONE side, the route's first hop on that side is a listed
UP floor, and every listed floor on the other side has NO route at all. Wording
as A/B'd: ` The shortest route to gem_a leaves this floor by jumping LEFT (to x
62..114 at y 211); the floor to the right (x 181..233 at y 187) does not lead to
it.` Verified offline at the @231 archetype (fires, byte-matches the probe
clause) and silent at @187. LEFT TO DO before live: the census (fire rate per
level x outcome x model + winners-vs-losers compliance at firing states) and
the blast (pure appends); the probe scratch decision_l11_route_scratch.cjs was
deleted after recording - rebuild from the gate + --patched if needed.

## L10 winner s3 vs loser s4 on the NEG_HOLD build (2026-10-10, offline)

Same build, same deterministic opening (gem_b @mf84, gem_a @mf107 in both). The
whole level is the difference: gem_c (287,68) is the top-of-tower gem and s4
never held it (14 deaths, peak 2). Three of s4's deaths are NOT laser/OOB but
`unwinnable reset: 2 collected + 0 alive cannot reach 3` (steps 793, 2390,
2890, at mf 320-334) - gem_c's DEADLINE expired while the cat sat at 2/3 with
the third gem gone. So s4 loses twice over: the apex/bob coin fails, and the
retry budget is a gem deadline, not just the death cap.

Where s4's lives end (last decision before each death): air at (288-323, 140-197)
- the RIGHT face of the tower, falling - and ground at (226-258, 150) right
after the launchpad jump_right. The launchpad text is NOT the L4-style lever:
at (220,150) obj gem_c the model already rates jump_right 0.63-0.79 in every
one of s4's 21 visits (argmax every time); no note argues against the
productive move. The 220,150 SAMPLE share (14/21) is escalation deviating FROM
jump_right after deaths there, not a dither between equals - the deviations
are the cost of the cap, not the cause of the failure.

The airborne steering states (@100 transit, right 0.77-0.89) are identical in
winner and loser at the same positions and mf; the winner's gem_c collection
(step 1157, mf 148, air at 261.75,150) is the bob-phase coin the NEG_HOLD
record already named ("the apex prior is the hard case"). No new side-note
lever found at the launch or transit states; the deadline angle (3 unwinnable
resets) is the fresh fact. Next lens candidate if L10 is revisited: whether any
prompt line states gem_c's deadline urgency at the launchpad (does the model
know the gem will die), not whether it points left/right.
