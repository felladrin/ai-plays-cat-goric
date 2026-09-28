# r9 prediction — level 4, flash, after the CEILING_TIE_EPSILON_PX fix

Written 2026-09-26, before the run, by the worker. The measurement it scores
against is `out/run_level_4_halogen.json` written by this exact command:

```
nohup zsh driver/experiments/lvl.sh 4 > /tmp/lvl4.out 2>&1 &
```

No VIDEO, no SEED, no other flag. The baseline it is compared to is the
pre-fix run of 2026-09-26 17:26–17:31: `cleared=false deaths=5 decisions=139
gems=1 steps=1268`, terminated on the stall detector, lives of 28/39/8/14/14/36
decisions, deaths 4 and 5 both apex deaths at movingFrames 95.

The change under test: `jumpHitsCeiling` in `driver/decision.cjs` now returns
`catMargins(snap).headTop - needed < CEILING_TIE_EPSILON_PX` with
`CEILING_TIE_EPSILON_PX = 1e-9`, so a jump on a float tie is refused instead of
offered. Nothing else changed.

## The six points, verbatim as predicted

1. **Lives 1, 2 and 3 come out byte-identical.** Their last ground decisions
   were on C at mf 96/97 and on B at mf ≤ 70, none at the tie, and the objective
   menu is untouched, so every prompt string and every menu in those three lives
   is unchanged. This is the sharpest falsifier available: if any step, position
   or move in lives 1–3 differs from the logged run, my claim that the epsilon
   only bites at the exact tie is wrong or something else consumes
   `jumpHitsCeiling`.

2. **Both apex deaths disappear.** At step 912 and step 1010 the menu drops from
   5 keys to `left|right`, so no `jump` and no `jump_right` exist to commit.
   Deaths 5 → 3.

3. **Lives 4 and 5 get long, not short.** With the jump gone, both continue on B
   with the 2-key menu and objective `gem_a`, which at x=238.25 already had
   p(left) ≈ 0.99. The likely end is the B treadmill death of lives 1–2 at
   mf ≈ 320–362, or the 24-decision stall detector first. So total decisions
   should exceed 139, and the run should end at 3 deaths or on the stall, not at
   5 deaths.

4. **Lives 4 and 5 stop being identical to each other.** The 14/14 byte-identical
   pair was a death-loop replay. Remove the deaths and the replays lose their
   cause, so the two lives should differ.

5. **Unchanged: gem count 1, B↔C 9 and 9, D and E never visited, objMenu
   5/4/3 pattern.** The tie had nothing to do with why lives 3–6 never left the
   A–B corridor. That regression still stands, and it is still the deepest thing
   in this data.

6. **The one thing that would make me wrong about #2:** the arc can commit to a
   jump from the *previous* decision and hold it across frames (`modelAsked` was
   false on 21 of 27 airborne decisions). If the runner holds an arc committed
   from a decision at mf ≤ 81 rather than re-deriving from the menu at mf 82, the
   apex death can survive a menu that no longer offers the jump. The mf=95 y=42.6
   death reappearing is the signature of that.
