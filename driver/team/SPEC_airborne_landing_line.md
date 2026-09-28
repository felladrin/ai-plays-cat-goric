# Spec — airborne landing line in buildMoveCall

**Status: specified, NOT implemented, NOT measured.** Produced by the
`ling-3.0-flash-fin-free` instance; captured by the supervisor from its pane.

> **Transcription warning.** Captured from a rendered terminal pane, not written
> to disk by its author. Re-grep every line number by symbol before use.

## The case it exists to fix

On level 4, the best life this project has produced died descending toward
platform D. Four consecutive airborne decisions, objective `gem_c`, holding
left throughout:

```
step 2950  x=261.00  y=189.0
step 2953  x=255.75  y=202.2
step 2956  x=250.50  y=219.0
step 2959  x=245.25  y=239.4   died
```

D spans x 156..208, surface just above y=241. The cat crossed D's altitude
about 37px right of D's right edge. Lateral movement was a dead constant
5.25px per decision while the drop accelerated 13.2, 16.8, 20.4 — it steered
correctly the whole way and the fall outran it. **By step 2950 the outcome may
already have been fixed**, which is the hard part of the design: a landing line
that only becomes accurate near the ground is useless.

`buildMoveCall`'s grounded branch pushes `jumpLandingNote` and
`walkOffFatalNote`; its airborne branch pushes only a generic line about
steering being instant and reversible, plus `sideSnapNote`. The model gets no
landing information while airborne. Meanwhile `arc.heldActionIsSafe` already
calls `simulate` for exactly that state and discards the verdict.

This is an instance of [[cat-goric-computed-then-discarded]].

## Two corrections that postdate the original draft

1. **`arc.simulate`'s laser bounds are optimistic.** All four bounds at
   `arc.cjs` ~line 70 are computed from drone position with no thickness term,
   while the game collides against a sprite 1.5–3.0px thick. Every `landed`
   outcome near a laser boundary may in truth be `laser`. Landing verdicts are
   affected; geometric wording is not.
2. **The prediction is a distribution, not a value.** Runs are irreproducible
   where the route passes near a laser — see
   [[cat-goric-runs-are-irreproducible]]. Measured: L8 byte-identical across
   five runs, L2 varying 2.2x.


> **DEFECT WARNING added 2026-09-26 by the supervisor — affects the rendered
> wording.** `arc.simulate` returns a landing **x that is one walk-step past the
> actual snap position**. The overlap test snaps at the current x, then
> `x += dx` runs unconditionally on the same frame before the `landed` return.
> `y` is correct; only `x` is wrong, by exactly `catWalkSpeed` (1.75px) in the
> direction of travel. Verified: L11 `jump_left` from 181.5 returns x=111.50
> when the snap was at 113.25.
>
> **This spec renders the landing position into the prompt.** Implementing it
> against the returned `x` tells the model a position 1.75px wrong in every
> case, and within 1.75px of a platform edge it will name the **wrong
> platform**. Use the snapped x, not the returned x.

---


Let me write the compact spec now.

Airborne Landing Line — Implementation Spec for buildMoveCall

File: driver/decision.cjs. Insertion point: inside buildMoveCall's airborne else branch (lines 876–882), after if (snapNote) lines.push(snapNote); (line 881), before
the closing } (line 882). buildLayaMoveCall is not the live path.

1. Simulate call per legal airborne action

legalActions(snap) airborne returns {left, right, none}. For each, call arc.cjs's simulate with every argument from snap:

const { simulate } = require("./arc.cjs");
const CFG = require("./physics.cjs");
const mf = (snap.drones && snap.drones.tl) ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
const r_left  = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, "left",  mf, { grounded: false });
const r_right = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, "right", mf, { grounded: false });
const r_none  = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, "none",  mf, { grounded: false });

none → dx=0, dy+=0.4/frame, cat falls straight down. mf is the moving-frame count from drone position, identical to heldActionIsSafe.

2. Rendered wording per outcome

Reuse jumpLandingNote's where() helper (lines 689–692) for platform descriptions: x X..Y at y Z. Three cases:

- Lands on a platform: "Holding left from here lands on x 156..208 at y 241."
- Lands nowhere and dies: "Holding left from here lands nowhere: the cat passes x 79..131 at y 180 on its left and falls to the bottom laser."
- Several actions landing on the same platform: "Holding left and holding right both land on x 156..208 at y 241. Keeping current trajectory falls into the bottom
  laser."

3. Every option ends in laser or void

Do not say "all three choices kill the cat." Instead emit a factual line naming the nearest reachable platform and each option's surviving frames: "Every option ends
the cat here: it falls past every platform below and reaches the bottom laser. The nearest platform is x X..Y at y Z, still Npx of descent away. Left survives N₁ more
frames, right N₂, none N₃." The model needs the frames field to pick the longest-surviving trajectory.

4. sideSnapNote fix (inside the function, both callers)

sideSnapNote (line 1282) has two defects. Fix both inside the function:

- Guard: remove snap.cat.dy < 0 from the early return. Keep only if (snap.onPlatform) return null;.
- Gap measurement: replace current-x gap with projected-x. projectedX = snap.cat.x + snap.cat.dx * ((p[1] - snap.cat.y) / snap.cat.dy). Compute gap at projectedX
  instead of cx. Use projectedX in the rendered string. The formula is a linear projection assuming constant horizontal velocity dx over the time (platform_y − cat_y) /
   dy to reach the platform's altitude.

5. Falsifiable prediction against the four decisions (steps 2950–2959, level 4, obj gem_c, holding left)

At step 2950 the cat is at (261.00, 189.0), falling toward D (x 156..208, y 241). Projected x for left is ≈240, still ~32px right of D's right edge. simulate("left", ..
.) from (261, 189) should return "laser" or "void", not "landed". The behaviour should first change at step 2950 — the model should switch from left to none or right.

Correction 1 — arc.simulate's laser bounds are optimistic by up to 3px. simulate computes all four bounds from drone position with no thickness term, while the game
collides against a sprite 1.5–3.0px thick (redrawn every frame). This touches every "landed" verdict that passes within 3px of any laser boundary — some "landed"
outcomes in §1 may flip to "laser". The geometric wording in §2 (platform coordinates, distances) is unaffected. jumpHitsCeiling is also affected: needed should be
rise + droneSpeed·frames + thickness = 59.1–60.6px, not 57.6px. heldActionIsSafe returns true for arcs that would actually die.

Correction 2 — state the prediction as a distribution. Runs are irreproducible near lasers because getRandomLaserSize uses unseeded Math.random() redrawn every frame (
measured 2.2x spread on unchanged L2). L8 was byte-identical across five runs (deterministic class — far from lasers). L4's descent toward D passes near platform edges
within laser range, so it is in the variable class. The prediction is therefore: across N runs, the proportion of lives where left is pruned at step 2950 should be
significantly above 0%, and the step at which behaviour first changes should cluster around 2950 with a spread determined by laser-thickness variance. If the
proportion is near 0%, the projected-x calculation is wrong or the landing occurs on a platform not in simulate's database.

Unaffected: everything geometric — platform spans, apex snap, six-actions finding, heldActionIsSafe discarding pattern, posKey10 bucketing, the jumpApex integration-
order correction. None depend on simulate's laser bounds.

▣  Plan · Ling 3.0 Flash Fin Free · 11.8s

  ┃
  ┃
  ┃
  ┃  Plan · Ling 3.0 Flash Fin Free OpenCode Zen
  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   /Users/victor/Repositories/js13k-2021                                                                                                         95.0K (36%)  ctrl+p commands
