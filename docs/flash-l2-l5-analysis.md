# Flash L2 / L5 failure analysis (offline, 2026-10-10)

Work-in-progress notes while the seed-3 failing-level sweep (levels 2,4,5,10,11,12,13)
runs in the background. Reference model: PurpleMIST-Flash-1.0 (tunnel :8000).

## L2 (fails both seeds at the 3000-step cap; Clef and Darwin clear it in ~28 decisions)

Gems (level 2): gem_a (180,188), gem_b (260,189), gem_c (90,188). ALL three gems sit at
y≈188; the cat spawns on the top floors (y=64). The only route is DOWN: collect the gems
at y≈188, then climb back to the portal.

Measured from out/byom/PurpleMIST-Flash-1.0/s1/run_level_2_systemone.json (s2 same shape):
- 504 decisions (s1), 496 (s2); 12 deaths (s1), 11 (s2); peakGems=2.
- The cat is on the y=64 floor for 440 of 504 decisions (first one at step 6). It never
  descends. The whole run is oscillation on the top floor (keys (90,60),(80,60),(100,60)
  dominate the last 80 decisions).
- Objective sequence: gem_c chosen at step 0 and held. Objective transitions are rare
  (7 in the whole run). **descent_* is NEVER the chosen objective: 0 of 504.**
- The menu DOES offer descent_left and descent_right (cands=5 at the top floor, e.g.
  step 0: {left,right,none} move, objective menu with 2 descent points). The model's
  order-debiased objective probabilities when descent is on the menu:

      gem_c 0.61, descent_right 0.13, descent_left 0.12, gem_a 0.08, gem_b 0.06
      gem_c 0.45, gem_a 0.19, gem_b 0.15, descent_left 0.13, descent_right 0.09
      gem_c 0.38, gem_a 0.19, gem_b 0.12, descent_right 0.22, descent_left 0.18
      gem_c 0.46, gem_a 0.20, descent_left 0.18, gem_b 0.04, descent_right 0.12

  So gem_c is the argmax every time, but the descent mass (0.1-0.2 each) is NOT negligible.
  The model is told the gems are at (180,188) etc. but does not connect "gem is below"
  to "I must use a descent point". The stranding/ONE-WAY annotations are about LOSING
  gems, not about the fact that ALL gems are below and there is no other route.

The gap vs Clef/Darwin: they clear L2 in ~28 decisions, i.e. they descend almost
immediately. Flash refuses to descend and flails on the top floor until the lasers
close. This is an objective-selection problem: the model must pick a descent point as
the objective, but every prompt frames gems as the goals and descent points as
"descent off the floor, not a collectible".

Candidate levers (rule 4: no new state facts; prefer objective-layer / menu shape):
- The objective question already lists descent points flat and simultaneous (rule 2 OK).
- Why the model won't pick them: proximity. gem_c is 128px away, the descent point is
  "straight-line Npx ... a descent off the floor". The model scores by proximity and
  picks the gem. A descent that is far in straight-line terms loses to a gem that is
  far but "looks like a goal".
- This is model-specific (Clef/Darwin descend). So it is not a menu gap; it is that
  this 8B model does not infer the descent from the gem positions the way the other
  models do. The fix likely has to make the descent the OBVIOUS next step without a new
  state fact — e.g. the existing ONE-WAY/stranding machinery already annotates descent
  cost, but nothing says "all remaining gems are below your floor and the only way
  down is the descent point". That "all gems below" clause is arguably a state fact
  (rule 4 risk) — it must be census'd offline before any live run.

## L5 (fails s1 at cap 226 decisions; cleared s2 only)

Gems (level 5): gem_a (81,71), gem_b (260,147), gem_c (170,71). The cat must reach the
top-left/top-right gems. s1 ends oscillating among (240,90),(140,180),(200,200).
Objective sequence flips gem_a/gem_b/gem_c/ascent_right a lot (menu churn). s2 cleared
(139 decisions, 4 deaths, all 3 gems) — so it is flaky, not deterministic.

## Next steps

1. Wait for the seed-3 failing-level sweep to land (levels 2,4,5,10,11,12,13) — gives a
   fresh same-build baseline on the shipped build post empty-menu fix.
2. Census offline any candidate L2 objective-layer change (firing profile over the
   clearing levels) before a live run.
3. Pick ONE lever, run L2 at a new seed, compare against the s3 baseline.

## Update 2 (2026-10-10, after paired comparison + first census attempt)

1. **Paired comparison, L2 s1, decision 9 (step 54).** Darwin and Flash in the SAME
   state: cat (87.25,64) on floor(74..286@64), mf 53, objective gem_c (90,188), same
   presentedOrder. Darwin move `left` 0.89; Flash `right` 0.84. `probe_move.cjs` gained
   `--endpoint systemone` (SYSTEMONE_BASE_URL/MODEL) and **reproduces Flash exactly**
   (left 0.15558 / right 0.84442) at that decision with the shipped build flags — it is
   a validated A/B instrument (`--patched`).
2. **Hypothesis.** The move prompt says gem_c "3px right, 124px down"; Flash follows
   the 3px horizontal; the productive exit is the LEFT edge (descent at x=74).
3. **Predicate under census** (`driver/experiments/census_exit_direction.cjs`):
   grounded; objective's platform != cat's floor; exits = `descentPoints(snap,
   levelGems)` (walk-off descents are NOT edges in g4 — g4 models jump landings only);
   per exit dist = 1 + BFS(g4.edges) from its LANDING platform (`platformKeyUnder` of
   the simulated landing) to the objective's holder (landing need not be the holder:
   on L2 the left descent lands on 84..136@240, BELOW gem_c's 188 floor); keep exits at
   minimum finite dist; fire iff they are all on one side AND that side != the
   horizontal direction to the objective.
4. **First census version was invalid** (used g4 firstHop as the exit vocabulary and a
   broken side rule `r.left < catX || r.left < catFloor.left` that was almost always
   "left"; symptom: sameSide=0 and Clef 0% compliance on a level it clears). Its
   numbers are discarded.
5. **Seed 3 baseline (shipped build + empty-menu fix), final:** L0, L1, L6, L7, L9
   cleared; L2, L3, L4, L5, L8, L10, L11, L12, L13 not. Full table in
   [results.md](results.md#purplemist-flash-10).
6. **v3 census: done 2026-10-10** (exact-arc jumps + archived gemPositions). Outputs
   below. **Next:** A/B `--patched` at decision 9 (needs the Flash container back up),
   then live L2 at seeds 6/7.

## v3 census results (2026-10-10)

`driver/experiments/census_exit_direction.cjs`, v3: exits from `descentPoints` with the
archived `gemPositions` (the `objectiveBelow` gate returns nothing without them) and
exact `arc.simulate` jump routes from `catX`; drones reconstructed at the archived
`movingFrames`. The hand-check first: the predicate fires at the Flash L2 s1 step-54
state and names the LEFT exit, which the archived move (right, 0.844) did not take:

```
step 54 cat (87.25,64) floor floor(74..286@64) mf 53 obj gem_c(90,188) holder floor(84..136@240)
routes: left d=1 lands=floor(84..136@240) | right d=3 lands=floor(214..266@240)
D=left dirToObj=right move=right comply=false probs={"left":0.15558168292045593,"right":0.8444183468818665}
```

Full census over 346 archives / 65,487 decisions (`node experiments/census_exit_direction.cjs`):

```
reason tallies: notGrounded 25739, objOnFloor 981, noHolder 9918, noExits 2267,
exitsAmbiguous 4588, sideMatchesDir 10684, waypoint 8078, fired 3232

by endpoint (fire/total over ALL levels):
  Darwin-27B-ZTC/systemone  2208/49628 ( 4.4%) comply=30.0%
  Phocinae-Largha-150M-v1/systemone  914/13015 ( 7.0%) comply=25.2%
  PurpleMIST-Flash-1.0/systemone  110/ 1456 ( 7.6%) comply=16.4%
  clef             0/ 1388 ( 0.0%) comply=-
```

Reading:

1. **The predicate fires at a low but real rate everywhere** (4.4-7.6% of decisions), so
   the state shape is not exotic; `sideMatchesDir` (the direction agrees with the exit)
   is the dominant near-miss at 10,684, which is what makes the firings informative.
2. **Clef never fires** on its L4 archive (0/1388). The predicate does not flag the
   endpoint that clears the level, which is the specificity check the v2 census failed.
3. **Compliance separates the endpoints in the predicted direction**: when the shortest
   route leaves the floor on the side opposite the objective's bearing, Clef-class
   models are not in the sample, but Darwin complies 30.0% of the time, Phocinae 25.2%,
   and Flash only 16.4%. Flash is the model that walks the wrong way off the floor.
4. **Flash L2**: the s1 step-54 record above is the archetype - gem_c is 3px right and
   124px down, the prompt says "3px right", and the only short way down is the left edge
   (left descent lands on gem_c's holder in 1 hop; the right side needs 3). This is the
   state the A/B probe targets.

## L3 in the ladder: the wall moved from L4 to L3 (2026-10-10, unit in progress)

Ladder archives `out/byom/PurpleMIST-Flash-1.0-FULL/{gapstack_s6,s7,s8,stack_s6}`:
L3 stops all four on the 10-death cap with 2 peak gems; per-life decisions
11-51; 195/221 objectives are gem_b (216,103); residency concentrates on
floor(237..289@246) + the air above it. All 10 deaths are laser_or_bounds. The
productive route (from the isolated s3 clear, 44 decisions): @290 jump_right ->
@289 jump_right (0.61) -> @246 -> jump_right from x~243.5 -> @200 -> jump_left ->
@152 -> gems. The ladder RUNS this route correctly (identical first two decisions
per life, same probs) and still dies: the deaths are at the bottom-left of @246
(212-220, 282-284) and at @246's right edge (289-291, 246-253).

The death-loop state is AIRBORNE at (233,246) falling with left held: the menu is
{left,right,none} only and left wins at 0.91-0.93; holding left drifts the cat
left of @289's left end (206) and it falls out of bounds. The grounded text just
before it advertises `Step off the LEFT end (x 237) and you steer to land on
platform x 206..258 at y 289` - true only with mid-air steering, false with the
objective bearing (gem_b is 17px LEFT) held: the envelope-overclaim class
(DESC_HONEST territory, docs/dead-ends.md).

Measured so far: (a) at the grounded (243.5,246,mf77) state the isolated winner
and the ladder loser have the SAME probs (left ~0.58-0.60) - the build text did
not flip this state; (b) death-history A/B at that state (clean vs three
"previous attempt ... was hit by the laser" lines): left 0.526 clean vs
0.452-0.480 with lines, NO argmax flip - death history is not the L3 flip here
(script experiments/ab_death_history_l3.cjs). (c) A/B of the left-descent claim
at (233,246) grounded reconstruction: jump_left holds argmax both ways - but
the reconstruction is NOT the live state (live was airborne; the ladder archive
records cat.dy=undefined for airborne entries, so the airborne prompt is NOT
reconstructible from this archive - a logging gap to fix before this state can
be probed with REPRODUCED).

Supervisor data: gapstack_s9 cleared L0-L3 (L3 with 9 deaths) then FAILED L4
(10 deaths, 2 gems) although isolated L4+GAP_DROP was 5/5 - the ladder-vs-isolated
gap hits L4 too, which revives the death-history hypothesis at the L4 stuck
states: probe as-is vs death-lines-removed there first (REPRODUCED required; the
L4 ladder archive is run_full levels['4'].decisionsLog).

### Death-history measurement at the stuck states (2026-10-10, supervisor unit)

(1) Text diff at the L3 dither state (243.5,246,mf77,gem_b,gc0): the isolated-win
build (EXIT-era flags) and the ladder build (+RISE_LABEL +NEG_HOLD +PORTAL_DESC
+GAP_DROP, EXIT_FACT v1.1) produce BYTE-IDENTICAL move-state text there. The
only live-prompt difference is the death line the ladder carries (death at
(238.25,246) step 2097, key 240,250, action none, laser).

(2) A/B at that state (experiments/ab_death_history_l3.cjs, systemone):

| arm                        | argmax | left  | jump_left | jump_right |
|----------------------------|--------|-------|-----------|------------|
| archive ladder (1 line)    | left   | 0.578 | 0.138     | 0.158      |
| archive isolated (0 lines) | left   | 0.600 | 0.169     | 0.138      |
| rebuilt clean              | left   | 0.526 | 0.289     | 0.038      |
| + "chose none, laser"      | left   | 0.452 | 0.335     | 0.058      |
| + "chose jump, laser"      | left   | 0.480 | 0.338     | 0.055      |
| + "chose jump_left, laser" | left   | 0.456 | 0.371     | 0.056      |

No arm flips the argmax; the death lines move mass between the jump options but
left wins everywhere. REPRODUCED FAILS (rebuilt clean 0.526 vs archive 0.578):
the run_full archive does not record cat.dx (a walking cat has dx=+-2.2 and the
prompt's momentum facts differ), and L4 entries also lack gemsCollected/
gemPositions. Exact live prompts are NOT reconstructible from run_full archives;
the .log files are summary lines only. The only exact instrument is replay.cjs
(in-process replay with the real recorder). Verdict at the states measured: the
death-history lines do NOT flip the stuck decisions - hypothesis not supported
at L3 (243.5,246); the L4 (180.5,241,ascent_left) state carries three death
lines (right/oob, left/laser, left/oob at key 180,240) and the archive still
shows left 0.966 - the lines are inert there too.

## Isolated L3 winners vs losers (2026-10-10, supervisor unit)

Archives: EXIT/{s3,s6,s7,s10} + RISE/{s8,s12,s13} sawAdvance=true (the clear
flag; won/reachedWin stay false - L3 advances, it does not win the game);
EXIT/{s8,s9} + RISE/{s9,s11} sawAdvance=false.

Decision residency at the hot keys (decisions at key x,y rounded to 10):

| run | 240,250 | 250,250 | outcome |
|---|---|---|---|
| W EXIT/s3 | 4 | 4 | advance |
| W EXIT/s6 | 24 | 10 | advance |
| W EXIT/s7 | 6 | 0 | advance |
| W EXIT/s10 | 8 | 3 | advance |
| W RISE/s8 | 19 | 14 | advance |
| W RISE/s12 | 0 | 0 | advance |
| W RISE/s13 | 6 | 6 | advance |
| L EXIT/s8 | 38 | 18 | no advance |
| L EXIT/s9 | 46 | 20 | no advance |
| L RISE/s9 | 51 | 25 | no advance |
| L RISE/s11 | 35 | 25 | no advance |

The losers' sink is the same @246 edge zone as the ladder analysis (240,250 =
the x~243.5 descent-claim dither). All eleven runs are deterministic-identical
through the first gem (gem_b at mf 151) and the first ~12 keys after it.
First divergence (RISE build, W s8 vs losers): s11 diverges at seq idx 4 - the
winner is already at (289,200) jumping left toward @152 at mf 197; the loser is
still at (243.5,246) at mf 181 with obj ascent_right. The loser's text there is
CORRECT and it picked the productive move (jump_right 0.637) - but at mf 181 the
right laser is 41px from the objective and the jump dies at the wall; the winner
made the same transit ~35 frames earlier. s9 diverges at idx 19 at mf 444 -
safe rect inset 89, the chamber nearly closed.

Verdict: the text is not the lever at the first divergence. L3 is a clock trap:
the @246 left/jump dither burns frames, and every frame spent there closes the
laser window for the @200/@152 climb. Seeds only shuffle the menu order, which
flips the dither; losers lose the dither, linger, and the clock finishes them.
Plain per-level variance, as the supervisor suspected - the lever would be
cadence at the @246 dither (fewer frames spent there), not a new fact.

## Escalation mode at the @246 dither keys (2026-10-10, supervisor unit)

Counted from the per-level L3.log files at the two dither keys (240,250 /
250,250), pairing each `move=X(argmax Y) mode=M T=T priorDeaths=P` line with the
`step ... cat=(x,y)` line that follows it:

| group | ARGMAX | SAMPLE | SAMPLE share | SAMPLE draws != argmax |
|---|---|---|---|---|
| winners (EXIT s3,s6,s7,s10; RISE s8,s12,s13) | 58 | 69 | 54% | 46/69 (67%) |
| losers (EXIT s8,s9; RISE s9,s11) | 63 | 195 | 76% | 128/195 (66%) |

Per-run loser shares: 66%, 68%, 83%, 83% SAMPLE. T at those keys runs 1.5-3.0
(priorDeaths up to 10). The losers' dither is mostly SAMPLE, and two thirds of
the samples land off-argmax: the escalation is self-feeding the dither. The
loop is closed by its own cause - deaths AT the dither key raise priorDeaths,
which raise T (T = 1.0 + 0.5*priorDeaths), which makes the off-argmax jump/left
variants likely, which keeps the cat at the key where it dies again. Winners
spend fewer decisions there and escape before priorDeaths compounds (their max
T at the key is also 3.0 but reached later). The lever is how escalation treats
a 2-key oscillation, not the prompt text.
