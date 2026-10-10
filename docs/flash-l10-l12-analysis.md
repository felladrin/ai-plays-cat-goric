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
