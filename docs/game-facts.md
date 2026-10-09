# Verified game facts

Everything here was read from the game source or measured from the live sprites. Do not re-derive it, and do not hardcode anything derived from it: derive it from the constants in `driver/physics.cjs`.

## Constants

| Constant | Value | Source |
| --- | --- | --- |
| `catWalkSpeed` | 1.75 px/frame | `config.ts` |
| `catJumpSpeed` | 6.8 | `config.ts` |
| `catFallingAcceleration` | 0.4 | `config.ts` |
| `droneSpeed` | 0.2 px/moving frame | `config.ts` |
| `maximumLaserY` | 310 | `config.ts` |
| `minimumLaserSize` / `maxLaserSize` | 1.5 / 3.0 | `getRandomLaserSize.ts` |
| Platform collision box | 52 x 16, anchor y 0.4 | measured from the live sprite |

**Platform geometry was wrong for two sessions.** `platformEdges` used `x ± 20`, copied from `checkPlatformsCollisionWithLasers.ts`, which builds its own hand-written 40x8 box for laser-vs-platform hits only. The cat collides with the platform *sprite*, measured live at 52x16. Every platform was 12px narrower than reality, so every stated descent point sat 6px inside the real edge: the cat walked there, did not fall, and re-decided. That false fact is the likely source of an oscillation chased across two sessions.

## Jump

34 frames of airtime, about 61.2px of rise, about 59px of one-way horizontal drift under full air control. Airtime counts as movement (`setCatMoving(dx !== 0 || dy !== 0)`), so a wasted jump burns 34 frames of laser budget.

`jumpApex` was corrected once for integration order: the game applies the jump and the position update on the launch frame without a horizontal step, so the rise was over-reported by one gravity step. Measured effect across levels: it moved one level out of six.

`landingsFrom` had the same one-frame error horizontally. The budget at vertical frame `f` is `f - 1` frames of walking, not `f`. Validated against 179 airborne samples from real level 2, 3 and 4 runs: the vertical frame index matches the horizontal index plus one in 119 cases against 1 for no offset (the remaining 59 are arcs that reversed direction mid-flight, where horizontal displacement is not monotonic in `f`). The error is exactly 1.75px, which is the width that decides a boundary case: level 4's launch window on the start floor moved from x >= 137 to x >= 139.

## Lasers and the clock

Moving frames used: `mf = (topLeftDrone.y - 1) / 0.2`. `tl.y` is monotonically non-decreasing during play and resets to 1, which also makes it the reliable death signal.

Safe box after F moving frames: `x ∈ [1 + 0.2F, 359 − 0.2F]`, `y ∈ [1 + 0.2F, 310 − 0.2F]`. The lasers meet at F = 772.5.

The driver cannot see laser thickness. The bridge snapshot exports drone positions only, and `isCollidingWithLaser` collides the cat against the laser *sprite*, which is anchored on its drone's centreline on the inward axis. A thickness `t` therefore reaches 0.75 to 1.5px into the field, not 1.5 to 3.0px. The driver models the ceiling at the top drone's y.

## Other mechanics

- The portal is fixed at (180, 150) on every level, box x 164..196 / y 134..166. It opens at 3 gems, and only then does it enter the objective menu.
- `resetCat` spawns the cat **airborne**, at `platform.y - 12`.
- **Side snap.** While falling, a collision with any platform snaps the cat's feet to that platform's top with no check that it came from above (`updateCatSprite.ts:32-38`). Brushing a platform's side mid-fall teleports the cat on top of it. It is both a hazard (it undoes a descent) and a tool (free height). The fact is surfaced only when the cat is airborne, falling, and a platform is within 24px laterally and below.
- `none` does not conserve horizontal momentum. `updateCatSprite.ts:42` does not implement it, and a criterion string that asserted it was corrected.
- Winning means reaching level index 14, the victory screen ("CATEGORIC ESCAPE! / PLAY AGAIN?"), by clearing 0 to 13. Index 14 is a terminal win state, not a fifteenth clearable level, though `config.ts` carries a layout for it.

## The game is nondeterministic

`getRandomLaserSize` calls `Math.random()` per beam per frame (1.5 to 3.0px thickness), unseeded and redrawn every frame, and the game collides against the sprite. Runs do not reproduce exactly frame for frame. The driver's RNG is seeded on the policy side only.

The practical consequence is in [method.md](method.md): classify a level by running it more than once.

## Gem deadlines: collection order is forced

`checkGemsCollisionWithLasers` destroys any gem a laser passes, and the portal needs 3. Collect out of order on level 7, 12 or 13 and the level becomes unwinnable within seconds.

The deadline of a gem at (x, y), in moving frames, is `min((y−1)/0.2, (310−y)/0.2, (x−1)/0.2, (359−x)/0.2)`. Recomputed from `cat-goric-game/src/scripts/constants/config.ts`:

```
L0  (66,235)@325   (112,195)@555  (160,165)@725
L1  (76,215)@375   (254,215)@475  (121,140)@600
L2  (90,188)@445   (260,189)@495  (180,188)@610
L3  (216,103)@510  (186,118)@585  (242,119)@585
L4  (289,156)@350  (182,226)@420  (105,164)@520
L5  (81,71)@350    (170,71)@350   (260,147)@495
L6  (221,108)@535  (225,181)@645  (135,143)@670
L7  (139,269)@205  (52,159)@255   (142,68)@335   <- tightest
L8  (301,251)@290  (74,231)@365   (123,198)@560
L9  (66,235)@325   (112,101)@500  (202,101)@500
L10 (287,68)@335   (253,91)@450   (229,123)@610
L11 (180,76)@375   (191,212)@490  (180,110)@545
L12 (43,129)@210   (279,169)@400  (207,203)@535
L13 (180,51)@250   (72,152)@355   (129,200)@550
```

**Do not hardcode this order.** It is made inferable by putting each gem's own pixel margin in the state.

All 15 levels are feasible on a near-direct path. The worst case is level 7, which needs about 283 of its 335 frames.

## Every level is geometrically solvable

Verified offline with the corrected geometry: on all 14 playable levels, every platform is reachable from the entry platform, and all gems and the portal sit on the reachable set. No level is impossible by layout, so remaining failures are policy or timing.

That check assumes full air control and ignores laser timing, so it is an upper bound.
