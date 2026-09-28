# L4: a jump that undoes the descent, and four hypotheses that died

Measured 2026-09-27 from the pre-rerun L4 archive, preserved at
`out/run_level_4_halogen.PRE_RERUN_20260926.json`, md5
`6836dd1d8c015559afbb97dd399fa12c`. That archive is dated 09-26 against 09-27
for all thirteen others and is the only one missing `gemPositions` and
`presentedOrder` - an artifact of its age, not a property of L4. A rerun on
current HEAD was spent to fix exactly that.

Reviews of this file live in `REVIEW_L4_backward_jump.md` and
`REVIEW_L4_backward_jump_v2.md`. Do not write them here.

## The level is a standing problem, not a dying one

70.4% of the run's 375 decisions are spent standing on one 52px platform, the
(225,93) box spanning x 199-251. The lower half of the map is reached 3 times;
max y is 239.4. 8 of 9 deaths are grounded on that platform at x 221-247, where
a laser eventually sweeps. The deaths are the timer, not the disease.

## Regime one: the jump that undoes the descent

Grounded-to-grounded platform transitions, respawns excluded: 15 climbs
(171->93) and 16 drops, distributed 11/0/4 by third of the run.

```
i=11  x=248.75 y=93   grounded  obj=descent_right  move=right   -> off the right edge
i=12  x=287.25 y=171  grounded  obj=gem_c          move=left    -> the descent WORKED
i=13  x=280.25 y=171  grounded  obj=gem_c          move=jump_left
i=14  x=273.25 y=153  airborne  obj=gem_c          move=left
i=15  x=247.00 y=93   grounded  obj=descent_right  move=right   -> back where it started
```

y increases downward, so i=13..i=15 is a climb. The two boxes at y=93 are
separate, (121,93) and (225,93), with a 52px gap. gem_c is at (182,226), down
and to the left; `jump_left` reads like progress toward it and is not.

The driver already knows:

```
$ node -e 'const {simulate}=require("./arc.cjs");
  console.log(simulate(4, 280.25, 171, 0, 18, "jump_left", 0, {grounded:true}))'
{ outcome: "landed", x: 248.75, y: 93, frames: 18 }
```

That is the observed landing to the pixel, computed before the key is pressed
and never put where the model scores it. Same shape as
[[cat-goric-computed-then-discarded]].

## Regime two: RETRACTED

A middle third with zero climbs and 89% standing residency appeared in the
09-26 archive. It does not reproduce. A rerun on current HEAD, tonight:

```
                        on y=93 by third      climbs by third   totals
  stale (09-26, 375 dec)   70% / 89% / 69%       11 /  0 /  4    15 climbs, 16 drops
  fresh (HEAD,   256 dec)   41% / 40% / 41%       14 / 13 / 14    41 climbs, 42 drops
```

The fresh run is uniform. There is no stalled block anywhere in it. The
middle-third lock was a single-run artifact - the known failure mode on this
project, where a level must be run twice before it is classified.

Everything derived from it goes too, including "the objective layer keeps
offering a gem that has become unreachable and never re-targets". That may still
be true. It is not shown, and the evidence I offered for it was one run.

What the rerun strengthens instead is regime one: 41 climbs and 42 drops in 256
decisions, against 15 and 16 in 375. The cycle is not a phase of L4. It is what
L4 does.

Separately and unaffected, because it is a code reading rather than a run
finding: every `simulate()` call site in `decision.cjs` except `:773` passes
`movingFrames = 0`, and `reachability.cjs` caches its graph per level with no
laser term. `:847/:849` uses that to build the sentence "A jump {dir} from that
end lands safely", which is computed at the most favourable laser state in the
run. Whether that sentence reaches a prompt is untraced; the par logs carry no
prompt text.

## What this is NOT

- Not "descents scored on bare distance". The descent works every time.
- Not a distance defect. A landing-further-from-the-objective gate fires on
  1125 of 1137 measurable grounded decisions project-wide (98.9%), and 100% on
  nine levels of which six clear. Measured and rejected.
- Not a menu-rate defect. Two-option rate does not predict failure: L2 clears at
  83.3% (40 of 48 grounded) and L9 at 49.3%, the two highest in the project.
  The mechanism above is local to one gap on one level; a rate cannot test it.

## Three misreads to not repeat

1. A filtered list of edge decisions is not a consecutive sequence.
2. `simulate`'s action argument is the full action string. Passing `"left"`
   where the driver pressed `"jump_left"` sets `wantJump` false and returns a
   2-frame walk, which reads as a simulator bug and is not one.
3. The climb passes through an airborne decision, so a consecutive-pair test on
   grounded 171 -> grounded 93 finds zero. Walk the grounded sequence with
   airborne entries skipped, and exclude the (121,81) respawn.
4. `simulate`'s `movingFrames` argument is the laser clock. Passing 0 tests the
   most favourable laser state in the run and will tell you a fatal jump is
   safe. Pass the `movingFrames` from the decision being examined.
