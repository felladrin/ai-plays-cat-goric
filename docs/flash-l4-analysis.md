# Flash L4: the four-decision loop, measured 2026-10-10

Flash fails L4 at every seed (1 gem, 17-24 deaths). Clef clears it. This is the
paired-comparison analysis: residency, the loop mechanism, and what the prompts
actually say at the loop states. Scripts: `experiments/residency_l4.cjs`,
`experiments/l4_loop_census.cjs`.

## 1. Residency: where the decisions are spent

Flash s1-s4 spend 40-49% of all decisions on the spawn floor `floor(95..147@93)`
and 23-42% on `floor(199..251@93)`; Clef's clear spends 4% on the spawn floor and
53% airborne. Flash's residency never contains gem_c's floor `floor(156..208@241)`;
Clef's does, twice. On `floor(199..251@93)` Flash's objective is gem_c (66-110 of
~80-140 decisions) and the moves split right-heavy (right 54-88 vs left 24-50);
Clef on the same floor walks left (left 15 vs right 5) and picks `descent_left`
as the objective 6 times. Full tables: run `node experiments/residency_l4.cjs`.

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

`node experiments/l4_loop_census.cjs --dump 1` at s1 step 269 (cat (248.75,93),
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

## 8. DESC_HONEST census (2026-10-10, `experiments/census_desc_honest.cjs`)

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
