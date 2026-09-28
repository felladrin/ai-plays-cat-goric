# Prediction — will the model prefer the climb when the ascent crit says WHERE the climb LEADS?

**Written before the probe and before any endpoint call against the patch.** The change is
built and its output is verified offline; no number below is coloured by a model result.
`decision.cjs` and `hop_points.cjs` are both untouched.

## What changed, and what did not

Two files, one change between the two arms of the A/B:

| file | change |
|---|---|
| `driver/hop_points.patched.cjs` | `hop_points.cjs:116` `landed[1] >= curY - 20` → `>`. One line. This is the GATE change, already measured: one cell on one level, L11 `y231[145..197]`, purely additive, 14 menus changed over 1753 states on 15 levels, nothing lost anywhere. |
| `driver/decision.patched_ascent.cjs` | the gate change alone: `require("./hop_points.cjs")` → `require("./hop_points.patched.cjs")`, one line. **This is the A/B BASELINE.** |
| `driver/decision.patched_ascent_crit.cjs` | the gate change **plus** the ascent crit. This is the A/B arm under test. |

The crit change is the mirror of what `decision.cjs:610` already does for descents, where
the landing and the ONE-WAY cost travel in `crit` "so the label being scored carries them".
`decision.cjs:620`, the ascent, had only ever carried the straight-line distance.

## THE ORDER CONFOUND IS ABSENT THIS TIME, and that is a real improvement

The previous A/B added a menu entry, so the arms had 4 and 5 options, the archived order
could not be a permutation of the patched menu, and no delta could be called order-free.
**Here the gate change is in BOTH arms**, so the two arms differ by the crit text alone and
the menu size is equal. Verified, not assumed — `driver/experiments/check_ascent_crit.cjs`:

```
d173  gate-only [ascent_left, gem_a, ascent_right]  (3)
      gate+crit [ascent_left, gem_a, ascent_right]  (3)   menu size EQUAL
d249  gate-only [ascent_right, gem_a, gem_b, ascent_left, gem_c]  (5)
      gate+crit [ascent_right, gem_a, gem_b, ascent_left, gem_c]  (5)   menu size EQUAL
```

The presented order is even identical at both states, so the two arms are the same prompt
with the same option order and one option's description changed. No draw-index anchor is
needed and no `*** ORDER NOT HELD CONSTANT` note will appear.

## The fact the crit now states

`decision.cjs:620` scored an ascent on straight-line distance to the LANDING point, so on
L11's y231 run at cat x=183.25 the climbing dead end scored **0px** and the hop that starts
the gem_a route scored **72px** — a distance the cat cannot travel in one jump, since the
launch must come from x 145..171. Measured consequence of that, from the previous A/B: the
correct waypoint was offered and scored **0.0000357** against the trap's 0.000283.

The new crit appends the landing geometry and what the climb buys:

```
ascent_left   ...; the platform at x 62..114, y 211 (20px above this floor), reachable by
                 jumping left from around x 173; from that floor gem_a is still 2 floors of
                 climbing away
ascent_right  ...; the platform at x 181..233, y 187 (44px above this floor), reachable by
                 jumping right from around x 183; from that floor the climb stops: nothing is
                 reachable by going higher, and gem_a can no longer be reached by climbing from
                 it (its only other floors are y 231 and y 228)
```

The straight-line px is **kept**, as agreed. Dropping it is change two, and only if this
one fails.

## P1 — the weak form, which is the actual claim

**At states where both ascents are offered on L11's y231 run, P(ascent_left) > P(ascent_right).**

Last time this same claim lost by 8x. What is different now, in one sentence: the crit no
longer contains only the field that pointed at the trap.

**I do not claim the strong form** — that `ascent_left` becomes the objective argmax,
beating `gem_a` at d173. The distance is still in the crit, 0px against 72px, and the whole
result of the last A/B is consistent with the model weighting that field above a
consequence sentence appended after it. If the strong form fails while the weak one holds,
that is the answer and change two is already justified: the model weighs distance, not
consequence.

**Falsified for the weak form if** P(ascent_left) ≤ P(ascent_right) at either state. I will
report the numbers whatever they are and will not re-describe a null as a partial pass.

## P2 — d249, where the claim is NOT extended

d249 has all three gems live and `gem_c` held 0.9922 in the gate-only arm. Nothing in this
change touches a gem criterion, so **I predict `gem_c` remains the argmax and the ascents
stay in the noise.** d249 is in the A/B to confirm the change does no harm off the
decision-relevant state, not because I expect it to move. If `gem_c` falls at d249 that is
a finding I did not predict and will report as one.

## Threshold, from the measured null control

`--patched` pointed at the A/B baseline itself must return max abs delta **0.000e+0** on the
objective question. That is the noise floor this project has measured twice, and it is the
threshold for every number below.

## Third: the offline census, and what it will and will not decide

`driver/experiments/census_route_hint.cjs` over the nine dumps, comparing the objective call
as a sorted line multiset. It must additionally compare the `criteria` map, because for this
change the criteria ARE the change and a state-text-only diff would report zero. Predicted
crit-fire rate: every ascent entry on every level, and nothing else — the crit is written
only inside the ascent loop, so no gem line, descent line, or state line can move. If the
census shows any other line changing, that is a bug in my edit, not a result.

L0 L1 L2 L5 L7 L8 are the levels a regression on them would mean. L3 and L9 scoreboards are
not trustworthy and their diffs are only evidence about text. L4 L6 L10 L12 L13 have no
dump, which is a recorded gap and not a pass.

## OUTCOME — the weak form HELD, and the strong form I declined to claim held too

Measured after the registration above, artifact at
`out/runs/PROBE_L11_ascent_crit_20260927-085342.md`. Noise floor 0.000e+0, order confound
absent (equal menu sizes, identical presented order in both arms).

| d173 (cat 183.25,231, mf=225, only gem_a alive) | gate-only | gate+crit |
|---|---|---|
| ascent_left | 0.030337603789691525 | **0.6488117280218857** |
| ascent_right | 0.9144410327650875 | 0.07153830518350977 |
| gem_a | 0.055221363445221036 | 0.2796499667946045 |
| objective argmax | ascent_right | **ascent_left** |
| chained move | jump 0.8190991201062756 | **jump_left 0.9567727029237677** |

max abs delta 8.429e-1.

**P1, the weak form, was the actual claim and it held.** **The strong form, which I
explicitly declined to claim on the grounds that the model might weigh the 0px/72px distance
above a consequence clause appended after it, ALSO held — the argmax flipped.** I was wrong
about that, and the way I was wrong is the useful part: the model weighs the consequence
**above** the distance when both are present. So change two, dropping the straight-line px,
is **not** justified by this result and I am not proposing it.

**P2 held as predicted:** at d249 `gem_c` kept the argmax (0.9994 → 0.9618) and the chained
move was unchanged at 0.000e+0. The finding I did not predict: `ascent_right` rose 117x
there, 0.00031 → 0.0368, because at that state the clause is *true* — all three gems really
are collectible from the y187 run — so the criterion made the trap more attractive. That is
the criterion working, at the one state where the trap does lead somewhere.

**Census prediction held exactly:** `stateText` 0 on every one of the nine levels, criteria
fires on eight of them, and no non-ascent criteria moved. A state-text-only diff would have
reported zero everywhere, which is why the census now compares the criteria map.

## Two of my own errors, caught offline before any endpoint call

Both in the first version of the consequence clause, both found by printing the graph:

1. "Reachable" over the full graph is not the question. The dead end is not dead: y187's
   only edges point back DOWN, and from y231 the route re-opens, so the full graph reported
   gem_a *"4 more floors"* from the trap — through the cat's own floor — and *"0 more
   floors"* when a gem happened to be collectible from it. The clause asks whether the climb
   can CONTINUE, which restricts the edges to floors above the source.
2. The 20px gate threshold does not belong in the continuation question; it made the fact
   table exclude y211, the very edge the gate had just opened. Both thresholds agree on both
   landing floors, so the choice is not load-bearing for the result.

## What must not change

- `decision.cjs` and `hop_points.cjs` stay untouched.
- `decision.patched_route.cjs` stays parked, uncommitted.
- `reachability.cjs` keeps only the additive `opts.dir` / `opts.box`; its null control
  stands (sha256 `8da23e12a0c30f0eddf98d1ac1878590884a1cc12ce4e10c5e7a06a8b8727550`).
- No live L11 run before the probe moves a number.

## LIVE L11 RUN — registered by the supervisor before the run (msg m0248)

Arm under test: `driver/decision.patched_ascent_crit.cjs` (gate + crit),
md5 `fe2b06214cee857800df4f8c26947496`. Baseline build for comparison:
330 decisions, 3000 steps, 7 deaths, 2 gems, not cleared.

The supervisor's prediction, verbatim:

- the cat reaches **y=114 at least once**. It never has — zero grounded decisions there
  across every L11 run on record.
- **gem_a gets collected.** Also never has.
- **deaths rise above 7**, because it will be traversing three floors it has never stood
  on and two of them are laser-proximal.
- **whether it CLEARS will not be called.** Three gems is necessary and not sufficient —
  it still needs the portal afterwards, and the step budget is the same 3000 it has been
  hitting.

Stated falsifiers, so the run cannot be read charitably afterwards:

- Reaches y114 and collects gem_a → the mechanism is proven end to end, even if the level
  does not clear, because that is the hop chain nothing has ever completed.
- Reaches y211 and stalls there → the next floor's ascent crit is the same fix one level
  up, and we will know exactly where to look.

## How the run is launched, and why it is not a bare `run.sh 11`

`driver/run_level.cjs:27` hard-requires `./decision.cjs`. There is no module override in
the live path, so a bare `run.sh 11` measures the UNPATCHED build and answers nothing
about the crit. The run is therefore launched with the patched module swapped into
`driver/decision.cjs` using run.sh's own `gemonly` mechanism, invoked ad hoc so that
`run.sh` itself is not modified:

1. refuse if `driver/decision.cjs` differs from HEAD (checked clean first, above);
2. back up to `/tmp/decision.ascentcrit.inflight` and record the md5;
3. copy the variant in and refuse unless the md5 on disk matches the variant;
4. `trap` the restore on EXIT, as run.sh does, because a trailing step does not fire on
   a failing command or an interrupt;
5. `zsh driver/experiments/run.sh 11` (which archives the previous artifacts first,
   refuses a concurrent run, and writes a fresh prompt dump per launch);
6. after exit, the tree is checked against HEAD and reported.

Known gap in that mechanism, unchanged from run.sh's own: a `trap` does not fire on
SIGKILL, so if the run is killed hard the tree can be left on the variant. The md5 of the
real build is recorded above and the backup path is fixed, so the restore is exact. The
tree is verified after the run either way.
