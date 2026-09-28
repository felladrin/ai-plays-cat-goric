# ARM D — negative result

**Status: rejected. Three of seven clearing levels destroyed. Nothing committed, nothing on disk in the tree.**

## What it was

Arm D annotated every option on the move menu with the *consequence* of taking it — where it lands, and how much closer or further that is from the objective — and named the remedy on every other option ("left is the only offered action that gets closer to gem_c"). It was built from `decision.cjs` as `decision.patched_armd.cjs`, md5 `4760c548b8e56de6351ad5d7953b4d67`, 89 diff lines, and it never touched `decision.cjs`.

The instrument was validated first, and the validation is the part that makes the rest trustworthy. **Arm A is the unchanged prompt, and it reproduced the archive at 41 of 42 states bit-exactly — 205 of 210 individual probability keys identical to the last digit.** The one imperfect state missed by a maximum absolute delta of **0.000228**, which is 388x under the 0.088627 run-to-run spread, and its argmax agreed. The argmax agreed at all 42. The instrument reproduces the run it is measuring, so a difference it reports is a difference in the text and not in the plumbing.

## The result, and why it was not enough

**42 of 42 states flipped away from `jump_left`, to `left`.** Mean p(jump_left) fell 0.996556 → 0.004501. The mass moved as one body: summed over all 42 states, `left` gained 41.649 and `jump_left` lost 41.666, while `right`, `jump` and `jump_right` together moved +0.015, −0.017 and +0.019 — noise. The largest single delta was **0.996936**, which is **11.25x the run-to-run spread**, the largest effect measured anywhere in this project.

It was real, it was large, and it was correct: at every one of the 42 states `simulate`, called at that decision's own `movingFrames`, showed `left` landing 3.0–3.5px closer to gem_c and `jump_left` landing 34.7–37.0px further, back up on the floor the cat had just descended from. The model was choosing a 31% loss over a 3% gain, and the text told it so.

It bought nothing. The cat still walked left along a floor it could walk off the end of, still never reached the gem, still died on the 3000-step cap. One flip in a run that never finishes is not progress.

**L4 under armd2: 377 dec, 3000 steps, 22 deaths, 1 gem, never cleared.** Against a HEAD baseline of 256 dec, 3000 steps, 8 deaths, 1 gem, never cleared. **Arm D made worse the one level it was built for.** Eight deaths to twenty-two, 121 more decisions, the same single gem, the same step cap. The 42-of-42 flip at delta 0.996936 — the largest effect measured in this project, 11.25x the run-to-run spread — translated into nearly three times the deaths. That is the cleanest possible statement of the whole night: the intervention did exactly what the probe said it would do, to the correct action, at every one of 42 identical states, and the level got worse. It is a stronger result than "we could not tell".

## The three variants

| variant | md5 | what it changed | what it measured |
|---|---|---|---|
| `armd` | `4760c548b8e56de6351ad5d7953b4d67` | the consequence line, ungated | L2 emits 82 clauses, many stating **0.2px and 0.3px** differences with the same confident uniqueness claim. The sub-pixel class. |
| `armd2` | `81d460d4f53c46cec9a9f5ad4b47607e` | a **1.75px floor** (`catWalkSpeed`, one frame of the cat's own travel) — below it, silence on that option | The floor worked as built: L2's emitted magnitudes ran 2.0px to 78.4px, nothing below 2.0. The 0.2/0.3 claims were gone. **And L2 still failed.** The 2.1/2.2px clauses that remained were true and above the floor. |
| `armd3` | `6b526e7476d071ece18aad2ae72fe1a0` | a **spread gate** (10.5px = 6 frames × walk) on top of the floor | **Never run.** It does not separate the two populations: L2's spread reaches 110.21px against L4's 37.73px minimum, so the gate opens on 30 of the 44 states where armd2 speaks. It would have silenced the 14-state small-spread pacing cluster and left the rest. |

Two thresholds rejected by measurement rather than taste, both recorded in the code: **10.5px on the winner** silences the one case that works (`left` is 3.0–3.1px better at all 42 states), and a **10px position-key test** fails because the landing sits in the same key as the cat at all 42 — the reason it looks right is the reason it is wrong.

## What armd2 did to the seven clearing levels

| level | baseline | armd2 | |
|---|---|---|---|
| **L2** | 74 dec, 517 steps, 1 death, 3 gems, **CLEARED** | **465 dec, 3000 steps, 11 deaths, 3 gems, NOT cleared** | **destroyed** |
| **L5** | 98 dec, 908 steps, 2 deaths, 3 gems, **CLEARED** | **266 dec, 3000 steps, 8 deaths, 2 gems, NOT cleared** | **destroyed** |
| **L9** | 74 dec, 919 steps, 1 death, 3 gems, **CLEARED** | **215 dec, 975 steps, 40 deaths, 0 gems, NOT cleared** | **destroyed** |
| L1 | 24 dec, 331 steps, 0 deaths, 3 gems, cleared | 27 dec, 344 steps, 0 deaths, 3 gems, still clears | moved |
| L8 | 45 dec, 643 steps, 1 death, 3 gems, cleared | 42 dec, 665 steps, 1 death, 3 gems, still clears | moved |
| L0 | 5 dec, 78 steps, 0 deaths, 3 gems, cleared | identical | unchanged |
| L7 | 27 dec, 258 steps, 0 deaths, 3 gems, cleared | identical | unchanged |
| **L4** | 256 dec, 3000 steps, 8 deaths, 1 gem, never cleared (the level arm D was built for) | **377 dec, 3000 steps, 22 deaths, 1 gem, never cleared** | **WORSE — 8 deaths to 22, +121 decisions, same single gem, same cap** |

**Three clears lost to buy one flip, and the target level degraded.** No threshold on magnitude or spread rescues that. L9 is the worst of the three and it is not a marginal case: it went from one death and three gems to **the 40-death cap and no gems at all**, and at 975 steps it terminated on the death cap rather than the step cap, so it did not merely run long, it died. One death to forty is not run variance. This is the fifth form of one failure: Euclidean 98.9%, vertical-dominant 56.3%, visit-form 44.0%, route hint 82.8%, and now arm D. The other four were killed by census; arm D was measured by running, which is why it cost actual levels to learn the same thing.

## The one positive finding, and it survives

**Arm C annotated every option with the bare landing coordinate and made the model MORE confident in its existing choice.** Argmax `jump_left` at 42 of 42, zero flips, and mean p(jump_left) **rose** from 0.996556 to 0.997390. The maximum absolute delta was **0.002321**, 38x below the run-to-run spread — inert, not a weak effect.

Both arms annotated all five options, so annotation coverage was held constant and symmetry was never the variable. What differed was coordinate versus consequence, and the outcome reversed completely. **The classifier does not read a coordinate as a reason.** A stated position carries no preference and the model weights it as nothing; a stated consequence with a named remedy on the same menu moved 42 of 42. That is a fact about how this model scores text, it does not depend on arm D shipping, and it is the most transferable thing in this document.

*(Two figures in earlier conversation were my own transcription drift and are corrected here: arm C's mean is 0.997390, not 0.997513; arm D's maximum delta is 0.996936, not 0.9916. Both above are read from `/tmp/l4arms_out.json`.)*

## The thing we spent the night removing was load-bearing

Arm D did exactly what it was built to do. `jump_left` went from 42 occurrences to **zero**, and the 41 climbs from y=171 back up to y=93 went to **0**. The cycle is gone. The level got worse: 8 deaths to 22, 256 decisions to 377.

The mechanism, verified with `simulate` at the run's own movingFrames. L4's platforms are `[121,93] [225,93] [289,171 spanning 263..315] [182,241] [105,180]`. Walking **left** off the y=171 platform at its left edge x=263:

| movingFrames | outcome |
|---|---|
| 100 | **laser**, dies at (219, 291) |
| 200 | **laser**, dies at (223, 272) |
| 300 | **laser**, dies at (228, 247) |

`jump_left` from (280.25, 171) lands at (248.8, 93) — **safe, at every one of those laser states.** Walking left off that platform is fatal everywhere; the backward jump was the only non-fatal way off its left side.

Under armd2 the cat **walked left 230 times** (baseline: 97), spent **221 of its 377 decisions airborne** (baseline: 68 of 256), dropped to y=171 **twenty-two** times and died **twenty-two** times. **The drops are the deaths.**

**So the backward jump was not a defect. It was a survival behaviour, and the model sat at 0.9966 on it because it was right.** Arm D's claim — "left lands 3.1px closer to gem_c than staying here" — was locally true and globally fatal, and a 42-of-42 flip is the model correctly following advice that kills it. A ranking sentence can only be as good as the objective it ranks toward, and on L4 **the objective was unreachable from where the cat was standing.** gem_c sits at (182, 226) on a platform spanning 156..208; from y=171 the cat cannot get there, and the only exit that is not the laser is back up to y=93.

This **retracts the finding that motivated the whole line of work** — that "the driver computes the landing that undoes the move and the model takes it anyway" — and it retracts it in the opposite direction from the one I argued. The jump undoes the descent because **the descent is a dead end.** Arm D is therefore not "a good idea that fired too broadly." It is an intervention that **worked perfectly at the decision level and was wrong about the world**, and three destroyed clears is what that costs.

The prediction I registered before arm D measured positive, and then read in my own favour, was the correct one. I wrote then: *"If L4 walks left 35 times, falls off the end of the y=171 floor and collects nothing, what arm D proved is that the model takes a 3% improvement over a 31% loss — not that it takes a 3% improvement over a 4% one. Nothing sits between those two cases."* Arm D came back at 42 of 42, I recorded the ambiguity as resolving my way, and the level run then walked left 230 times and died twenty-two times. **The probe measured the decision correctly and the decision was still wrong, because the decision was correct and the world was not.**

## The handoff, which is an observation and not a proposal

I would not try another threshold, and I am not proposing a fix. If the harm is specific to the small-magnitude class then the discriminator is magnitude, not spread, and I have no magnitude gate that is not the 1.75px floor already tried and already refuted — that is the honest terminal state of this idea, and it is a dead end rather than a near miss. What follows is the thing Victor has to decide, not something to build.

**The 42 states are only 10 distinct (x, movingFrames) pairs, each repeated up to eight times, and the move call is handed the same prompt every time** — so L4 is not a case of a model choosing wrongly, it is a case of a model answering the same question 42 times and never being able to give a different answer. Breaking the degeneracy is a `cadence.cjs` question about how often the driver asks, not a `decision.cjs` question about what it says, and I have no measurement that says which is right.

The new section above sharpens this rather than replacing it. The 42 states were not merely repeated — they were repeated on a question whose correct answer was constant, and the degeneracy is what let a 0.9966 survive for 42 decisions and then, once the ranking was removed, let the cat rediscover a fact the model had been holding all along: on that floor, going back up is how you stay alive.

And if I were starting fresh with no data from this: I would not begin here. L4's model is at 0.9966 on a state where the best action gains 3.1px and the worst costs 34.7px, and no rephrasing of a menu is the right tool for a level whose only progress is a floor the cat can walk off the end of. The level-run cost of finding that out was 43 minutes on L2 and a second 3000-step cap on L5, and the run was the only instrument that could have told us — which is the argument I would make for spending runs, against every argument I made for censusing.

**One mechanism note, so nobody distrusts the swap harness wholesale.** The `gemonly` EXIT trap restored cleanly on this run's normal exit — `restored 83d884f9…, tree agrees with HEAD`. Every mid-run `decision.cjs` divergence observed during this regression was a supervisor swap with its trap pending, and the one genuine failure mode is narrower than it looks: a run **interrupted while piped through `tee`** skips the trap, which the refuse-if-dirty guard on the next run then catches. The trap itself is sound.

---

## Correction appended by the supervisor, 05:31, after this document was written

One claim above is wrong and it is mine, not the author's — it repeats a framing
I gave and later disproved. The document was written at 02:58; the refutation
came at 03:05.

**Wrong:** "the objective was unreachable from where the cat was standing …
from y=171 the cat cannot get there."

**Right:** gem_c IS reachable from y=171. `reachability.cjs` says so:

```
reachableFrom(floor(263..315@171)) includes:
   floor(199..251@93)  floor(95..147@93)  floor(79..131@180)  floor(156..208@241)
gem_c (182,226) sits on floor(156..208@241)   ->   reachable: true
```

The driver's `NO ROUTE` and `ONE-WAY` annotations correctly stay silent at those
84 states, because a route exists. It runs *through* the backward jump: up to
y=93, across to the left floor, down the left chain. So the jump is not merely a
survival behaviour, which is how this document frames it — **it is step one of
the only route to the gem.** That makes arm D's error larger than stated here,
not smaller.

Everything else in the document stands, including its central result and the
degeneracy observation at the end, which I verified independently: the 42 states
are 10 distinct (x, movingFrames) pairs, maximum eight repeats.

The fuller picture, found after this was written: L4's cat spawns on
`floor(95..147@93)`, from which gem_c needs only a walk left, a step off the
edge, `none` while airborne, and a walk right — every step surviving at
movingFrames 300, no deadline anywhere. It never goes below x=129.8 against an
edge at 95, because its objective on that floor is `gem_a` on 18 of 18
decisions. See `driver/AWAY_DECISIONS.md`, ticks 23 and 26.
