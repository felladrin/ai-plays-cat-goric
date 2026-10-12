# Flash L4: the four-decision loop, measured 2026-10-10

Flash fails L4 at every seed (1 gem, 17-24 deaths). Clef clears it. This is the
paired-comparison analysis: residency, the loop mechanism, and what the prompts
actually say at the loop states. Scripts: `research/residency_l4.cjs`,
`research/l4_loop_census.cjs`.

## 1. Residency: where the decisions are spent

Flash s1-s4 spend 40-49% of all decisions on the spawn floor `floor(95..147@93)`
and 23-42% on `floor(199..251@93)`; Clef's clear spends 4% on the spawn floor and
53% airborne. Flash's residency never contains gem_c's floor `floor(156..208@241)`;
Clef's does, twice. On `floor(199..251@93)` Flash's objective is gem_c (66-110 of
~80-140 decisions) and the moves split right-heavy (right 54-88 vs left 24-50);
Clef on the same floor walks left (left 15 vs right 5) and picks `descent_left`
as the objective 6 times. Full tables: run `node research/residency_l4.cjs`.

## 2. The loop

`floor(199..251@93)` obj gem_c -> walk RIGHT to x 251 (2px from the cat's typical
x 249) -> step off RIGHT, keep holding right -> land on `floor(263..315@171>` ->
the only way off that floor (measured, and the prompt says it verbatim: "a jump
left from around x 285 lands on the platform x 199..251 at y 93") is the jump whose
APEX SNAP puts the cat back on `floor(199..251@93)`. Four decisions, repeat. The
apex snap (a jumping cat snaps onto any platform its arc touches at the apex) is
not modeled by `reachability.cjs` or `arc.simulate`; the prompt's floor note at
the trap floor states the snap outcome correctly, so the loop is visible in the
prompt text but not in the route graph.

## 3. What the prompts say at the loop floor (rebuilt with the real builders)

`node research/l4_loop_census.cjs --dump 1` at s1 step 269 (cat (248.75,93),
mf 122, obj gem_c "67px left, 133px down"):

- The objective menu offers `descent_left` ("straight-line 50px ... lands on x
  156..208 at y 241" - gem_c's floor, no steering needed), `gem_c` ("straight-line
  149px"), `descent_right` ("straight-line 2px ... lands on x 263..315 at y 171
  **or x 156..208 at y 241**").
- The move state's floor note repeats it: "Step off the RIGHT end (x 251) and you
  steer to land on platform x 263..315 at y 171; steer to land on platform x
  156..208 at y 241."
- Aggregate over s1-s4 (333 grounded gem_c decisions on that floor): `descent_left`
  offered 332/333, `descent_right` 332/333. **Not a menu-coverage failure.**
- The model walks right 188/333 (left 145). Nearest-descent wins: the right end is
  2px away, the left end 50px, and the right descent's text advertises that it
  ALSO reaches gem_c's floor.

## 4. The reversal-only overclaim

The right descent's "or x 156..208 at y 241" is the `landingsFrom` band envelope
over-claiming again (the same defect that invalidated census v2 on L2): reaching
156..208 from x 251 requires releasing/REVERSING to left in the air. Measured:
holding left the whole fall from x 199 lands at x~143 (past the floor, laser);
the productive descents need a release, and Flash does not reverse in the air -
airborne residency is right-heavy (right 43 vs left 18 in s1) and the loop's
second half proves the cat arrives at the trap floor, i.e. it held right.
So for this model the right descent is a trap door that the prompt advertises as
a second route.

## 5. EXIT_FACT is silent here (checked, per supervisor)

`exitDirection` on all 333 grounded gem_c decisions on `floor(199..251@93)`:
**0 fire, 332 sideMatchesDir, 1 noExits.** The graph scores the left descent d=1
(lands on the holder directly) and the right d=2 (via the graph edge
`floor(263..315@171) -> floor(156..208@241)`, which the game does NOT honor - the
trap floor's only real exit is the apex snap up), and the bearing is left, so the
predicate stays silent. The gap is not the bearing; it is that the graph and the
floor note both count the reversal-only right landing as a route.

## 6. Escalation already fires and does not escape

The revisit machinery is NOT silent on this loop (this updates open-problems §2's
"unmeasured"): s1 has 105 SAMPLE decisions and revisits up to 5. SAMPLE picks
left when argmax is right ("move=left(argmax right) mode=SAMPLE T=1.50"), so the
escape hatch exists and sometimes fires - but the loop persists because walking
left off x 199 while HOLDING left also misses gem_c's floor (lands x~143, laser):
both of the model's habitual executions (hold-right off the right end, hold-left
off the left end) miss; the productive one is step-off-then-release, which no
held-action prompt teaches. Deaths: the left-exit misses are a share of the 17-24.

## 7. Probes at the archetype (decision 22, step 275: floor(199..251@93), obj gem_c, archived move=right)

`probe_move.cjs` reproduces decision 22 EXACTLY (max abs delta 0.0) once the probe
env carries the shipped build flags (`PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1
HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1 SEED=1`) - without them the
reconstruction is off by 0.39 and the argmax flips; the probe's parlog guard wants
the log under `out/runs/`, satisfied by a copy of the archived sweep log.

A/B at that decision, objective arm (order-debiased, anchored to the archived
presented order):

| arm | descent_right | gem_c | descent_left | obj argmax | chained move |
| --- | --- | --- | --- | --- | --- |
| baseline (envelope) | 0.218 | 0.671 | 0.111 | gem_c | right 0.514 |
| `LANDDESC_HELD=1` | 0.222 | 0.667 | 0.111 | gem_c | right 0.514 |

**Negative: the held-arc crit does not move Flash here.** The false-D disjunct is
not what pulls the choice - greedy gem_c dominates the objective menu either way,
and the chained move (obj gem_c) is unchanged because the MOVE state's floor note
(the "steer to land on platform X or Y" text, decision.cjs:1422) is a separate
ungated path that neither LANDDESC variant touches.

## 8. DESC_HONEST census (2026-10-10, `research/census_desc_honest.cjs`)

Predicate: grounded, gem objective whose holder is a different floor; the NEARER
descent advertises the objective's floor among its landings, but that landing is
reachable by NO single hold from just past the edge (reverse-only or band-only -
`arc.simulate` hold/release/reverse classification); the OTHER descent reaches it
by hold or release (reliable). Compliance = archived move headed to the reliable
side. One-option menus excluded (the portal-prune lesson). Archetype check: s1
decision 22 FIRES (nearSide=right, nearKinds=band-only, comply=false) - the right
descent's D claim is produced by no single hold at all, worse than reversal-only.

Fire rate x outcome x model (rows with firings; total = decisions in that cell):

```
level | outcome | endpoint                          | total | fire (rate) | comply
  L 4 | failed  | Phocinae-Largha-150M-v1         |   523 |   29 ( 5.5%) | 10.3%
  L 4 | failed  | PurpleMIST-Flash-1.0-EXIT       |   330 |   47 (14.2%) | 46.8%
  L 4 | failed  | PurpleMIST-Flash-1.0            |  1343 |  215 (16.0%) | 46.5%
  L 4 | failed  | clef                            |   983 |    1 ( 0.1%) | 100.0%
  L 4 | cleared | clef                            |  1388 |    1 ( 0.1%) | 100.0%
  L 5 | failed  | Phocinae-Largha-150M-v1         |   279 |    3 ( 1.1%) | 100.0%
  L 5 | failed  | PurpleMIST-Flash-1.0            |   437 |    6 ( 1.4%) | 100.0%
  L 5 | failed  | clef                            |   978 |    9 ( 0.9%) | 100.0%
  L 5 | cleared | PurpleMIST-Flash-1.0-EXIT       |   108 |    3 ( 2.8%) | 100.0%
  L 5 | cleared | PurpleMIST-Flash-1.0            |   394 |    4 ( 1.0%) | 100.0%
  L 5 | cleared | clef                            |   419 |    2 ( 0.5%) | 100.0%
  L 6 | failed  | Phocinae-Largha-150M-v1         |   501 |   26 ( 5.2%) | 53.8%
  L 6 | cleared | PurpleMIST-Flash-1.0            |   580 |    2 ( 0.3%) | 100.0%
  L 7 | failed  | Darwin-27B-ZTC                  |   565 |   82 (14.5%) | 53.7%
  L 7 | cleared | clef                            |   257 |   12 ( 4.7%) | 41.7%
  L 8 | failed  | Phocinae-Largha-150M-v1         |   445 |   67 (15.1%) | 25.4%
  L 8 | failed  | PurpleMIST-Flash-1.0            |   365 |   15 ( 4.1%) | 100.0%
  L 8 | failed  | clef                            |  2153 |  222 (10.3%) | 64.9%
  L 8 | cleared | PurpleMIST-Flash-1.0-EXIT       |    89 |   25 (28.1%) | 36.0%
  L 8 | cleared | PurpleMIST-Flash-1.0            |   444 |   12 ( 2.7%) | 100.0%
  L 8 | cleared | clef                            |  1185 |  102 ( 8.6%) | 89.2%
```

Reading against the build criteria:

1. **Flash L4: fires often with low compliance** - 16.0% of decisions, comply
   46.5% (Phocinae 10.3%). The criterion is met on the target level.
2. **Clef's L4 clear is near-silent** (1 firing in 1388, comply 100%) - the
   specificity check passes on the level the lever targets, but on n=1: the L4
   signal rests on a single Clef firing.
3. **Counterexamples on clearing levels**: Clef L7 (4.7%, comply 41.7%), Clef L8
   (10.3% failed / 8.6% cleared), and Flash-EXIT L8 cleared with 28.1% firing and
   36.0% compliance - on L8 compliance does not separate outcomes (failed runs
   100%, the won run 36%). The predicate is L4-centric (293 of 885 firings) with
   an L8 tail (443) whose compliance signal is inverted.
4. Consequence for the build (per supervisor): change text ONLY at firing states,
   never re-attribute every descent, so the blast radius equals the firing count;
   judge on L4 first, and treat L8 as a required regression check.

## 9. Third variant, and how it differs from both

`DESC_HONEST=1` (gated, byte-identical off) edits the MOVE floor note at 1422 (and
the descent crit to match), attributing each envelope landing to its release
style, per the r7 physics finding ("whether the cat releases or keeps pressing
through the fall is what decides the landing"):

- right end (x 251): "lands on x 263..251 at y 171 if you keep holding right; x
  156..208 at y 241 only if you reverse to left in the air" (measured: hold-right
  lands ~287,171 = the trap; release falls at ~251 into the laser; reverse-left
  reaches D per the envelope band).
- left end (x 199): "lands on x 156..208 at y 241 if you release in the air;
  holding left drifts past it to the laser" (measured: held-left from 199 lands
  x~143, laser - the r7 death class).

Difference from the two tried variants: ENVELOPE lists both landings with no
attribution (the false-D that drove r5/r6); HELD picks ONE arc model and drops the
release landing (the r7 regression, 21d vs 13d). HONEST keeps the full envelope
set and adds the attribution - it changes no fact, it says WHICH fact needs WHICH
execution. It also edits the text the model actually acts on (the move state after
it has already picked gem_c, which the probe shows it always does), which neither
existing variant reaches.

Census: DONE (§8). Next: gated build, text only at firing states, then A/B probe
at decision 22 (objective arm).

## 10. DESC_HONEST built (gated) and probed at the archetype (2026-10-10)

Implementation (`decision.cjs`, `DESC_HONEST=1`, byte-identical off): the suffix
" (only by changing direction mid-air)" / " (only by reversing mid-air)" is
appended ONLY to a descent claim that no single hold from just past that edge
produces, ONLY when the sibling end reaches the same platform by hold or release,
ONLY when a live gem sits on that platform, and ONLY on the nearer end - the
census predicate, in the descent crit (descentPoints landDesc) and the move floor
note (dropFrom). `blast_gates_head.cjs` (HEAD vs worktree, all gates off): 929
diffs, all L4/L6, all gem-added menu diffs from the routeBlocked fix, zero text
diffs - the gates are inert off. `blast_desc_honest.cjs` (off vs on): 6,062 text
diffs (L4 2179, L5 722, L6 825, L7 94, L8 2218, L12 24) - WIDER than the census
firing count (885) because the text gate fires for ANY live gem's floor while the
census keyed on the single selected objective. Scope decision pending supervisor.

Probe at s1 decision 22 (objective arm, order-debiased, REPRODUCED baseline):

| arm | descent_right | gem_c | descent_left | obj argmax | chained move |
| --- | --- | --- | --- | --- | --- |
| baseline | 0.218 | 0.671 | 0.111 | gem_c | right 0.514 |
| DESC_HONEST=1 | 0.190 | 0.708 | 0.102 | gem_c | **left 0.575** |

The objective argmax does not flip (and should not: gem_c IS the objective the
loop needs while executing correctly); the MOVE for gem_c flips from the trap
side to the productive side, right 0.514 -> left 0.575. That is the loop's exact
failure decision reversed at the archetype state. Awaiting supervisor live runs
(L4 + L8 regression, two seeds each).

## The loop vs the existing airborne facts (2026-10-10, `census_l4_loop_facts.cjs`)

Question: do NEG_HOLD or REACH_FACT speak at the loop decisions, and does the
model take the bad hold? Archives: base s1-s4 + EXIT s3/s4, obj gem_c.

* **Loop-arc airborne** (y 93..171, x 195..320): 124 decisions. **NEG_HOLD fires
  13, bad=left(dies in the laser) in all 13, and the model took the bad hold
  13/13.** REACH_FACT fires **0** - correctly, no hold reaches gem_c from the arc.
* **But flipping mid-arc does not break the loop.** `arc.simulate` from the firing
  state (269.75,120.6) dy-2 mf110: hold left -> laser @(210.3,290.6); hold right
  -> **lands back on the LOWER floor(263..315@171)** @(308.3,171); hold none ->
  same lower floor @(269.8,171). Right or none just returns the cat to the floor
  it jumps_left from - the loop is intact either way. The mid-arc `left` IS the
  loop's own return mechanism (the game re-decides every 6 frames, so the apex
  snap catches the cat before the laser; TOOK-BAD here is not a death sentence).
* **The loop's real decisions are GROUNDED**: loop floor(199..251@93) 537
  decisions (move=right 300), lower floor(263..215@171) 147 (move=jump_left 82).
  Both airborne facts are silent on grounded states by construction.

**Verdict: neither existing fact can break the L4 loop.** The fact the loop needs
is the grounded trap fact - "the right descent is not a descent: jump_left from
floor(263..315@171) apex-snaps back to floor(199..251@93); the left edge of this
floor is the way down to gem_c" - which is the DESC_HONEST shape, measured and
REJECTED (L8 regressed with it, dead-ends.md). EXIT_FACT cannot say it either: it
is silenced by `sideMatchesDir` (the bearing to gem_c already matches the left
route), and the model walks right anyway - the loop is the model ignoring its own
correct bearing, which no bearing-shaped fact can fix.

## The jump-landing note: already live, and its L4 window IS the loop (2026-10-10)

The same-floor jump-landing note is ALREADY ENABLED in the uncommitted tree
(un-gated; `test_objective_lock` is the red-by-design gate on it). Census
(`census_jump_landing.cjs`, 16 archives L1-L4):

* **L1/L2/L3: ZERO same-floor firings in actual play** across every archive,
  clearing and failing. The historical L2 cost (48 firings -> fail) does not
  reproduce under the current build (holder-guard + GOALS_ONLY/ROUTE_FIRST menus).
  The test's only sweep violation is the synthetic L1 (50,230) gem_b state - a
  position no archived run ever visits. The dead-ends condition "keeps level 2's
  firings at zero" is met in play; only the synthetic sweep blocks it.
* **L4: the note fires 3-4x per run at the trap state** (e.g. s4 step 142,
  (289,171) obj gem_c): "A jump from x 289 holding left reaches no platform: the
  arc passes below every platform and the cat drops to the bottom laser. A jump
  from x 263..284 on this same floor reaches a platform from which gem_c can
  still be reached... walk left to around x 284, then jump left there."

**The window claim is an envelope artifact.** Exact `arc.simulate` at the loop
clock (mf 97), x 263..284 step 1: **held jump_left lands on floor(199..251@93 -
the loop floor - for EVERY x in the window**; `jump` lands back on @171; two-phase
probes (jump_left k frames, then none/right, k=6..18, dy captured via onFrame)
land on @93, @171, or the laser - **no hold or release combination from any x in
the window lands on gem_c's floor(156..208@241)**. The note's `keeps()` test
accepts @93 because the graph says @93 reaches gem_c (true - via its LEFT EDGE,
the descent the model never takes). So the note's advice at the trap walks the
cat to 284, jumps left, and apex-snaps back to @93: **the window IS the loop**.
That is why the loop persisted in archives where the note fired.

**Consequence.** The fact the loop needs is not on @171 at all - it is on @93:
"walking left off this floor lands on the platform that holds gem_c" (the
left-edge descent, landing 156..208@241, is the only productive exit and the
model walks right 300/537 there). EXIT_FACT is silent on @93 by `sideMatchesDir`
(bearing already matches left). A positive same-floor descent-to-holder fact on
@93 is the untried shape; the @171 note needs no change (it is true, just
loop-preserving). Do NOT re-gate or re-probe the @171 note: a flip there lands
on @93 either way.

## Objective-layer census #2: the descent waypoint is offered 225/225 and never picked (2026-10-10)

Clef's mechanism at @93 is the OBJECTIVE pick: its objective while walking left
is `descent_left` (the waypoint), not gem_c. Flash: the descent_* entries were on
the objective menu at @93 in **225/225 grounded decisions (base s1 + EXIT s3) and
picked 0 times.** The exact menu at (247,93) gc1 (EXIT s3 step 295):

```
- left descent point (x 199): step off the left end of your floor to descend - lands on x 156..208 at y 241; nearest closing laser 58px away (top side).
- gem_c at (182,226): straight-line 148px (65px left, 133px down); nearest closing laser 50px away (bottom side).
- right descent point (x 251): step off the right end of your floor to descend - lands on x 263..315 at y 171 or x 156..208 at y 241; nearest closing laser 58px away (top side).
```

What differs from gem_c's entry: the left descent already names the landing
(156..208@241 = gem_c's floor) but NOT that gem_c sits there; gem_c's entry gives
a straight-line distance the cat cannot walk (the gem is below the floor). The
right descent ALSO advertises the 241 landing (envelope over-claim - the exact
step-off from x 251 lands on @171; the 241 claim needs the @171 jump_left, which
is the loop). So the menu as written gives gem_c the only "pointing" text and
both descents equal landing claims - consistent with gem_c winning 225/225.

Prior art (decision.cjs comment at descentPoints, after landOn): landing-gem
annotation was tried on the 27B classifier - "still picks the right descent 24 of
24 menu orderings" on L4-with-gem_a, and on L4's START floor it INVERTED a
working decision (advertised two gems against the one-way-loses-gem_a warning).
Not automatically dead for Flash (different model, different floor, different
state), and the probe has now run. Scratch copy `decision_annot_scratch.cjs`
appends " (gem_c is there)" to a descent label iff EVERY platform the step-off can
land on is that live gem's holder (the right descent at @93 claims @171 OR @241, so
it gets no note - the overclaim guard). Probe at EXIT s3 L4, baselines REPRODUCED
0.0 with the EXIT build flags: idx25 gap 0.61->0.12 no flip; idx33, 50, 200 FLIP the
objective to descent_left (deltas 0.29-0.32); idx300 no flip (0.167). 3 of 5 probed
@93 states flip. The 27B prior art (decision.cjs comment near descentPoints) was
no-move 24/24 - Flash is different.

## DESC_ANNOT built and blasted (2026-10-10)

The probe's annotation is now gated in `decision.cjs` (`DESC_ANNOT=1`, off by
default): a descent label gets ` (gem_x is there)` only when EVERY platform the
step-off can land on is that live gem's holder floor (the envelope-overclaim guard;
"any live gem" is the right semantics because the objective menu is built before an
objective is chosen). The annotation rides the descent label into the objective
criterion text.

Blast (`research/blast_desc_annot.cjs`, objective-call state + criteria, old =
pre-gate copy vs new, over every archived decision under `out/`):

- gate unset: **compared 80,000, diffs 0** - prompts byte-identical.
- `DESC_ANNOT=1`: **diffs 13,711, all 13,711 pure descent-crit additions** (menu
  unchanged, every diff is the annotation insertion). Per level: **L2 4,452,
  L4 4,346, L6 401, L7 62, L8 3,802, L11 648** (all endpoints pooled).

The radius is not L4-only: any floor whose descent lands exclusively on a gem's
floor fires, and L2/L8 carry that shape heavily - so the live test must include the
L2/L5/L8/L13 regression, not just L4. The gate shifted `decision.cjs` line numbers
by +16; `docs/research/simulate-clock-audit.md` pins re-pinned (exitDirection 2026,
reachHolds 2078, negHoldTargets 2120, negHold 2143). `npm test`: green except the
expected-red `test_objective_lock`.

## The one-option menu at x=250.5 is a CORRECT prune (2026-10-10)

Base s1 idx110 (step 1052, cat (250.5,93) on floor(199..251@93), mf=361, gc=1):
`moveProbs {"right":1}` looked like the L13 portal-prune bug's sibling, but it is
not. At mf=361 the safe-rect top is 73.95 and the cat's head is at 75.00 - 1.05px
of clearance, closing 0.2/frame. `isFatal(left)=isFatal(none)=true` (anything that
stays on @93 is cut by the top laser within ~5 committed frames), `isFatal(right)=
false` (right steps off the 251 edge and falls to a lower floor). The prune deleted
only the moves that truly die; the model had no choice to refuse. Verified by
rebuilding the snap from the archive and calling `survival.isFatal` per action.

## The gap note is what points Flash right at @93 (2026-10-10, A/B probe)

The move state at the dither states carries an asymmetry: the LEFT end arrives
with a warning (`The gap to the LEFT is 52px wide; walking cannot cross it, only
a jump can.`) while the RIGHT end arrives with two landing options and no
warning. The gap note fires because gem_c (182,226) is horizontally beyond the
left end of floor(199..251@93) - but gem_c is reached by DROPPING off that end,
not by crossing the gap, so the warning argues against the productive move.

A/B at four Flash s1 @93 obj=gem_c decisions where the archived choice was
`right` (all baselines REPRODUCED 0.0; scratch arms = `--patched` copies,
gap_off removes the gap sentences, gap_ext appends to the gap sentence
`; stepping off this end drops onto <that end's landing list>`):

```
idx  x       as-is (arch)        gap_off             gap_ext           flip
34   234.75  L 0.262 R 0.738    L 0.924 R 0.076    L 0.681 R 0.319   both FLIP -> left
24   238.25  L 0.328 R 0.672    L 0.931 R 0.069    L 0.777 R 0.223   both FLIP -> left
30   234.75  L 0.302 R 0.698    L 0.891 R 0.109    L 0.742 R 0.258   both FLIP -> left
39   245.25  L 0.495 R 0.505    L 0.952 R 0.048    L 0.856 R 0.144   both FLIP -> left
```

8 of 8 arms flip right->left; gap_off is decisive (left 0.89-0.95), gap_ext
strong (left 0.68-0.86). The right end's two-landing text (`x 263..315 at y 171;
x 156..208 at y 241`) is the envelope overclaim DESC_HONEST already measured and
rejected - deliberately NOT touched here. Next: census when the gap note fires
while the objective is reached by stepping off that same edge
(research/census_gap_note.cjs).

## GAP_DROP: the gap note, completed instead of removed (2026-10-10, gated)

`GAP_DROP=1` (off by default) appends to the gap sentence, when it fires on an
edge, `; stepping off this end drops onto <lands>. ` - but ONLY when EVERY
landing off that edge (dropFrom lands, own floor excluded by construction) is the
objective's own holder floor (x-containment + the vertical-overlap rule). The
narrow form cannot fire where crossing the gap really is the route: if any
landing is not the objective's floor, the warning may be doing real work. The
extended wording was chosen over removal because it stays true and still flips
(see the A/B table above: 8 of 8 arms flip right->left).

Blast + census in one pass (`research/blast_gap_drop.cjs`, move-state text,
gate off vs on per decision, pure-insertion verification by removing the exact
clause and requiring byte equality): **1,603 firings of 51,942 grounded
decisions (3.1%), ALL on L4** (firedW 41 - Clef's clearing archives, whose gem_c
states already walk left - firedL 1,562). **Every other level is byte-identical
gate-on**: the all-landings-holder condition is exactly the L4 @93 gem_c shape.
Non-pure diffs: 0. Gate-off is byte-identical to the shipped text (env guard;
spot-checked against the archived probe text at idx34; npm test green, audit
re-pinned +24).

Live test (2026-10-10, best build + GAP_DROP=1): **L4 CLEARED at s3 (5 deaths,
86 decisions, 829 steps) and s4 (1 death, 49 decisions, 444 steps)** - Flash had
never held more than 1 gem on L4 at any seed before this gate. **FINAL: 5 of 5**
(s3 5 deaths, s4 1, s5 3, s6 1, s7 3); the full ladder with the whole stack follows. No regression needed on other
levels (the blast fires nowhere else).

## L4 in the ladder loops on a DIFFERENT floor than isolated (2026-10-10)

gapstack_s9 (cleared L0-L3, failed L4: 10 deaths, 2 gems, 324 decisions): the
residency is y=180 (96 decisions) and y=241 (94) - NOT the @93 dither that
GAP_DROP fixed in isolation (22 decisions at @93). gem_c (182,226) sits on
floor(156..208@241); the ladder loop lives around the gem_c floor and @180, i.e.
the ladder run never reaches the @93 state where GAP_DROP fires - the isolated
fix and the ladder failure are different states. Measuring the death-history
hypothesis there is BLOCKED on reconstruction: the exact live prompt needs the
death lines, which carry the launch ACTION, and the ladder archive's deathLog
records no action (only reason + pre/post snapshots); airborne entries also lack
cat.dy. The only exact path is replay.cjs (in-process replay with the real
recorder) - expensive but correct. Next step belongs there, not at a rebuilt
prompt.
