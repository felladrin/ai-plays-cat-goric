# Build agent's running notes

Kept by the worker (`build`), not the supervisor. Newest facts last. The
authoritative verdicts live in `/tmp/lvl<N>.out` (wrapper line, written only
after `node` exits) and in `out/runs/`; this file is orientation, not evidence.

## Passing levels: 8 of 14
Was 7 when this session started.

    L0 L1 L2 L3 L5 L7 L8 L9

Not passing: L4, L6, L10, L11, L12, L13. The handover's goal is all 14, which
means clearing the level-14 victory screen, not 13 levels.

## The honest summary of the physics corrections: one level out of four moved
All three corrections are real and were each verified against game source: the
`frames -> frames+1` peak correction, `maxLaserHalfSize` on the ceiling, and the
arc bound inset. Measured against the four never-measured levels:

| level | before | after | moved? |
|---|---|---|---|
| L10 | FAIL 40 deaths 0 gems | 40 deaths 0 gems, 360 dec, 1680 steps | **no** |
| L6  | FAIL ~37 deaths 1 gem  | 37 deaths 1 gem, 493 dec, 3000 steps (step cap) | **no** |
| L12 | FAIL 14 deaths 0 gems  | 14 deaths 0 gems, 384 dec, 3000 steps (step cap) | **no** |
| L7  | FAIL 10 deaths 2 gems  | clears, 0 deaths 3 gems 308 steps, 5 of 5 runs | **yes** |

Three of four are byte-for-byte unchanged in outcome, L12's death count included.
L7 is the only one that moved. This is a smaller return than the work suggests,
and it is the kind of thing that gets quietly rounded up in a handover, so it is
written here in the flat form on purpose.

## L7 is deterministic as observed, and the branch is between BUILDS not runs
Every completed non-video run on the current build cleared, and all five are
byte-identical (md5 `6dc8c71e6cb946d9e1b11506afd52de2`, 0 deaths / 33 dec /
3 gems / 308 steps): 21:47:33, 22:39:29, 22:41:39, 23:19:55, 23:22:05. The only
two L7 failures ever observed are the 25 September **pre-fix** artifact
(`459ed044`, 10 deaths) and the confounded `VIDEO=1` run (`fb41269c`, 40 deaths).

> **CORRECTION, superseding the "branch point" reading in `3d34022`.** I reported
> that L7 is a branch point whose outcome is a run-to-run coin-flip at decision 6.
> That is wrong, and wrong in the favourable direction. The two runs I compared
> were the **pre-fix** artifact and a current-build run, not two runs of one
> build. There is no observed run-to-run variation on the current build at all.
> Two further claims in that same report are also wrong:
> * "d0-d5 are identical" — identical in *state and move*, but **not** in
>   `moveProbs`, which differ from **d1** onward. First divergence index is 1.
> * the d6 choice was a "near coin-flip" — no. Within each build it is a clear
>   preference, and the *build* moved it:
>       pre-fix  d6: jump_left 0.5518  vs left 0.4312   -> jump_left (12 pts)
>       current  d6: left      0.4935  vs jump_left 0.4883 -> left (0.5 pts)
>   The fix shifted `left` up ~6.2 points and flipped a clear preference into a
>   near-tie, which is what moved the outcome.

**The fix's whole effect on L7 is the prompt literal** `61.2px` -> `54.4px`
(decision.cjs:860). Move-menu widths are identical at every decision d0-d8
(3, then 5,5,5,5,5,5,5,5), no arc changed, and the route takes **zero jumps** —
consistent with the zero ticket count. Nothing about lasers, arcs or reachability
was exercised on this route.

**The residual risk is the margin, not the variance.** n=5 identical is not proof
of determinism, and at d6 the two competing moves are 0.5 points apart
(0.4935 vs 0.4883). Any change in the endpoint's logprobs can flip it back to
`jump_left`, which is the pre-fix trajectory and fails. Quote L7 as passing and
deterministic-as-observed at n=5, with that margin on the record.

## L7 — first new pass this session
    before  25 Sep artifact   10 deaths  280 decisions  2 gems  3000 steps (MAX_STEPS, capped)  no advance
    now     21:49:41          0 deaths    33 decisions  3 gems   308 steps                  advanced
`STALLED false`, peak moving frames 306, no page errors, `level now 8`.
Artifacts `out/runs/PASS_L7_first_20260926-214941.{json,log,out}`; the log
carries the RESULT block and all 33 decision lines.

> **CORRECTION to the commit message of `226e2e9`, which is left as history and
> not rewritten.** That message says this file records "the L7 pass" and calls the
> result a pass. Retracted. L7 **cleared once, at n=1, in the measured 360x360
> configuration**. Its second run was a different configuration entirely and
> tells us nothing about it: `VIDEO=1` used to widen the viewport to 1280x720, and
> the two runs diverged at **decision 0**, the recorded run starting 4 moving
> frames later (airborne at (219,152) against grounded at (219,164)). Fixed in
> `8629b9e`. The L7 pass is **n = 1 and unclassified** until the two clean
> headless runs land. `226e2e9`'s wording and this note must be read together.

**Ticket count: 0, in both runs.** The pass and the video failure each have zero
standing tickets (head clearance in [0, 1.5)px) and **zero jump launches at all** —
L7's clear route uses no jumps. So the laser-proximity predictor that explains
L8 and L5 predicts nothing here: two runs with identical ticket counts and
completely different outcomes. Whatever varies on L7 is not laser thickness. The
video run's 39 deaths were all at a single site, (156,183), the same
one-transition-repeated shape as L10.

**n = 1. Not yet classified as reproducible.** L8 and L5 were observed-identical
5/5, but both have zero tickets too, so they are confirmations of the
route-clearance argument rather than evidence that levels are deterministic in
general. Treat the L7 pass as provisional until the two clean runs land.

Corroborates the stacked-wall analysis, which ranked L7 first of the three
stacked-wall levels and said it needed only search visibility — a complete route
with no mid-air re-decide and gap-robust margins. 33/0/3/308 is the shape that
predicts, so the mechanism is corroborated; the exact number is not.

**Not attributable to one commit.** Three landed since the 25 Sep artifact: the
`frames -> frames+1` peak correction, `maxLaserHalfSize` on the ceiling, and the
arc inset. Isolating which one is a three-run experiment on a two-minute level,
deferred until the five never-measured levels are done.

## The three physics corrections, all local and unpushed
    e94a58d  ceiling-tie epsilon            (later deleted in 53e0a9e)
    53e0a9e  frames+1 peak, maxLaserHalfSize, epsilon deleted
    c93f9e2  arc.cjs four bounds inset by maxLaserHalfSize
    b611c51  arc comment correction (documentation only)

Ceiling model, final: peak closure is at f=17, not f=16, and equals 57.8px. The
per-frame requirement on launch clearance is rise + laser descent, which peaks at
f=17 and is strictly lower at every neighbour (f15 57.0, f16 57.6, f17 57.8,
f18 57.6, f19 57.0), so the peak alone binds and
`needed = 54.4 + 0.2*17 + 1.5 = 59.3px` is already the certainty bound.
Laser half-thickness is uniform on [0.75, 1.5) — **range width 0.75**, not 1.5.

## Two errors of mine, both toward over-pruning, both retracted in place
1. Used the full thickness range 1.5 as the denominator instead of the
   half-thickness range 0.75, halving every per-frame survival probability.
2. Read the near-apex frames' offsets 0.8/0.2/0/0.2/0.8 *below* the peak as
   "tighter" and added them instead of subtracting, producing a bogus 2.3px
   correction and a bogus "75.11% predicted vs 75% observed" validation.
   Retracted in `PREDICTION_arc_inset.md` and in `b611c51`'s message.
The two deaths still unexplained at L4 y=93 mf=70 are not explained by the
ceiling model; side and bottom laser exposure has never been measured.

## Measured cost of the arc inset
L8 unchanged at 1/45/3/643. L5 2/98/3/908 against 2/94/3/908, both cleared,
both reproduced twice. All four extra L5 decisions are airborne, all in life 1,
all `modelAsked=false`, all choosing the same held `left` as the decision the
pre-change run made and died from; lives 2 and 3 identical in decision count,
step range and every position. Cost: four extra move classifications on one arc,
no change in where the cat goes.

`modelAsked` **cannot** detect this class: it is
`!held && objCall.objectiveNames.length > 1` and reports whether the *objective*
was re-asked. The move is classified unconditionally at decision.cjs:1931-1933,
so a `modelAsked=false` decision still costs a model call.

### RESOLVED: the inset changes the CADENCE, not the arc (found by me, mechanism read by the supervisor, both verified in source)

I flagged the L5 result as unexplainable: a monotone-pessimistic arc model (1,375
flips in 144,450 probes, every one `landed` -> `laser`, never the reverse) should
make the cat abandon a fatal arc *sooner*, yet life 1 survived **12 steps longer**
(ends at step 351 instead of 339) and then died at the same place. I localised it
to the frame-budget path before the code was read. The mechanism, verified at
`cadence.cjs:60-61` and `arc.cjs:155-157`:

    // cadence.cjs, inside stepBatch
    n = i + 1 + AIR_REDECIDE_FRAMES;                       // line 55, the baseline
    if (holdIsSafe && res && res.airborne === true && i + 1 >= n && n < MAX_HELD_FRAMES) {
      if (holdIsSafe(res.snap) === true)                    // strict === true
        n = Math.min(n + AIR_REDECIDE_FRAMES, MAX_HELD_FRAMES);
    }

    // arc.cjs heldActionIsSafe
    if (r.outcome === "landed") return true;
    if (r.outcome === "laser" || r.outcome === "void") return false;
    return null;                                           // and null on !h, non-finite mf

A hold is extended **only** on `true`. Not on `false`, not on `null`. So the inset
does not make the cat bail out of an arc: it makes `heldActionIsSafe` return true
less often, which removes the *extension*, which ends the batch at the plain
3-frame cadence and hands control back to the model sooner. The arc is unchanged;
the consultation rate is what moved. The twelve extra L5 steps and the four extra
decisions are the same finding.

**Precision worth keeping:** line 55 already sets the baseline to
`AIR_REDECIDE_FRAMES`, so the inset can only pull the budget *back to* 3 frames,
never below. The effect is bounded, not open-ended.

**The implication, which cuts against the intuition we had all night:** the arc
model has two independent effects — it changes which actions are offered and
annotated, and it changes how often the model is consulted. The second is not a
side effect; on L5 it was the whole observed difference. A *more accurate* arc
bought more model calls, not better arcs.

**Open, not actioned:** how much of the driver's behaviour is sensitive to
consultation frequency rather than to prompt content? If three extra frames of
hold versus a re-ask is worth twelve steps of survival, then `AIR_REDECIDE_FRAMES`
(=3) and `MAX_HELD_FRAMES` (=120) are untuned policy parameters sitting next to a
prompt surface we have spent all night correcting.

## One runner, not five
`driver/experiments/run.sh <level> [video] [out]` is the only launcher:
archive-then-run, optional `VIDEO=1` at the measured 360x360, background launch,
one-line summary in `/tmp/lvl<L>.out`. It replaces `runl.sh`, `sweep6.sh`,
`sweep6b.sh`, `sweep6c.sh` and `sweep6d.sh` — five generations of the same idea,
which cost a killed L6 launch and a permission round-trip for `pkill` before they
were collapsed. The four dead ones are in `/tmp/superseded_runners/`, moved rather
than deleted. `sweep6d.sh` survives only because it was mid-queue when the
collapse happened; **delete it when the sweep lands.** Do not add a sixth.

## Harness facts that cost artifacts
- `out/run_level_<N>_*.json` is written **incrementally during a run**.
- `lvl.sh` truncates `/tmp/par_L<N>_flash.log` **on launch**.
- `/tmp/lvl<N>.out` is the only safe completion signal: the wrapper writes it
  after `node` exits, so it is empty while a run is in flight.
- Always `stat` mtimes before reading either artifact.
- The harness is **not reproducible**: laser thickness is `Math.random()` per
  frame, unseeded, so identical commits diverge. L8 and L5 are observed-identical
  5/5; L2 gave 342 and 153 decisions on the same commit and seed.
- Pass/fail comes from `cleared=` in the wrapper line, never the JSON `won`
  field, which is the level-14 win-screen flag and reads false on every
  mid-ladder level.
- On macOS, `ps -o command=` truncates in a pipe and `pgrep -c` does not exist.
  Use `pgrep -f '^node run_level' | wc -l`. Anchor at `^node`: a shell whose
  command line merely mentions `node run_level.cjs` will otherwise be killed.

## Queue
`driver/experiments/sweep6b.sh` is live: it took over from `sweep6.sh` at L10's
completion, then runs L7 with `VIDEO=1`, then L6, L12, L11, L13 one at a time
with an archive before each, then a headless L7 re-run. Launching the next level
no longer depends on me polling; the watcher does it.
Outstanding and not started: the L3 divergence probe against the surviving 16:46
`par_L3_flash.log`.
