// Test harness bridge. Adds NO game logic and NO decision-making. It only
// re-exports the live game singletons onto `window` so an external driver
// (Playwright) can read state, stop the wall-clock loop, and step frames by
// hand. ES module singletons: because harness.html loads main.ts first, these
// imports resolve to the exact same instances the running game uses. No edits
// to any existing game file are required.
//
// The bridge lives outside the game tree on purpose: `cat-goric-game` is a
// submodule pinned to the archived upstream, so the game cannot be edited at all.
// That is why the specifiers below reach across the boundary instead of using
// paths relative to src/scripts/.

import {
  canvas,
  gameLoop,
  catSprite,
  portalSprite,
  entryPortalSprite,
  platformsPool,
  gemsPool,
  topLeftDroneSprite,
  topRightDroneSprite,
  bottomLeftDroneSprite,
  bottomRightDroneSprite,
  laserFromTopLeftDrone,
  laserFromTopRightDrone,
  laserFromBottomLeftDrone,
  laserFromBottomRightDrone,
  leftKeyButton,
  upKeyButton,
  rightKeyButton,
} from "../cat-goric-game/src/scripts/constants/instances";

import {
  getCurrentLevel,
  setCurrentLevel,
  getGemsCollectedOnCurrentLevel,
  getEscapeTime,
  isCatMoving,
  getPlatformWhichCatIsOn,
} from "../cat-goric-game/src/scripts/constants/stores";

import {
  propagateGameLoopUpdate,
  propagateGameLoopRender,
} from "../cat-goric-game/src/scripts/constants/events";

import { resetCurrentLevel } from "../cat-goric-game/src/scripts/functions/commands/resetCurrentLevel";
import { isOutOfLasersBounds } from "../cat-goric-game/src/scripts/functions/getters/isOutOfLasersBounds";
import { isCollidingWithLaser } from "../cat-goric-game/src/scripts/functions/getters/isCollidingWithLaser";
import { getCatCollisionObject } from "../cat-goric-game/src/scripts/functions/getters/getCatCollisionObject";
import { platformsPositionsPerLevel } from "../cat-goric-game/src/scripts/constants/config";
import { gemsPositionsPerLevel } from "../cat-goric-game/src/scripts/constants/config";

const ctx = canvas.getContext("2d");

// Snapshot the full observable game state as plain numbers.
function snapshot() {
  // destroyGem only sets gem.ttl = 0; it does NOT remove the gem from the pool.
  // kontra Pool.getAliveObjects() returns objects.slice(0, size) and never checks
  // ttl — size only shrinks in pool.update(). So in the window between a collect
  // (destroyGem) and the next pool.update(), a collected gem is STILL returned by
  // getAliveObjects with its old x/y. Filter by ttl > 0 so the observer sees the
  // gem as dead immediately. Read-only: we do NOT call pool.update() ourselves.
  const aliveGems = gemsPool.getAliveObjects().filter((g) => g.ttl > 0);
  return {
    level: getCurrentLevel(),
    gemsCollected: getGemsCollectedOnCurrentLevel(),
    aliveGems: aliveGems.length,
    // Live gem positions, so the driver can match each surviving gem back to its
    // fixed spawn index (gem_a/b/c) and compute its per-laser margin. Gems do not
    // move (animation-only), so positions equal their spawn coordinates.
    gemPositions: aliveGems.map((g) => ({ x: g.x, y: g.y })),
    moving: isCatMoving(),
    onPlatform: !!getPlatformWhichCatIsOn(),
    cat: {
      x: catSprite.x,
      y: catSprite.y,
      dx: catSprite.dx,
      dy: catSprite.dy,
      height: catSprite.height,
    },
    drones: {
      tl: { x: topLeftDroneSprite.x, y: topLeftDroneSprite.y },
      tr: { x: topRightDroneSprite.x, y: topRightDroneSprite.y },
      bl: { x: bottomLeftDroneSprite.x, y: bottomLeftDroneSprite.y },
      br: { x: bottomRightDroneSprite.x, y: bottomRightDroneSprite.y },
    },
  };
}

// Track the previous snapshot so we can detect the two transitions the driver
// cannot otherwise see: a level ADVANCE (level index changed) and a DEATH
// (resetCurrentLevel fired internally on laser contact, which respawns all three
// gems and zeroes gemsCollected WITHOUT changing the level index).
let prev = snapshot();
let lastEvent = { type: "none", fromLevel: prev.level, toLevel: prev.level };
let deathCount = 0;

// Counts resets initiated by the DRIVER (via bridge.resetCurrentLevel), so we can
// tell a driver-initiated reset apart from the game's own internal kill reset.
let driverResetCount = 0;

// Per-step trace of the game's OWN kill predicates + geometry, so a death can be
// diagnosed at the exact frame tl.y flips, not inferred at end-of-hold.
const trace = [];
function traceStep(tag) {
  trace.push({
    tag,
    lvl: getCurrentLevel(),
    tly: +topLeftDroneSprite.y.toFixed(3),
    catx: +catSprite.x.toFixed(2),
    cathy: +catSprite.y.toFixed(2),
    catdy: +catSprite.dy.toFixed(2),
    cath: catSprite.height,
    alive: gemsPool.getAliveObjects().filter((g) => g.ttl > 0).length,
    coll: getGemsCollectedOnCurrentLevel(),
    oob: isOutOfLasersBounds(catSprite),
    laser: isCollidingWithLaser(getCatCollisionObject()),
  });
  if (trace.length > 400) trace.shift();
}

const bridge = {
  canvas,
  gameLoop,
  catSprite,
  portalSprite,
  entryPortalSprite,
  platformsPool,
  gemsPool,
  topLeftDroneSprite,
  topRightDroneSprite,
  bottomLeftDroneSprite,
  bottomRightDroneSprite,
  laserFromTopLeftDrone,
  laserFromTopRightDrone,
  laserFromBottomLeftDrone,
  laserFromBottomRightDrone,

  getCurrentLevel,
  setCurrentLevel,
  getGemsCollectedOnCurrentLevel,
  getEscapeTime,
  isCatMoving,
  getPlatformWhichCatIsOn,

  propagateGameLoopUpdate,
  propagateGameLoopRender,
  resetCurrentLevel,

  leftKeyButton,
  upKeyButton,
  rightKeyButton,

  platformsPositionsPerLevel,
  gemsPositionsPerLevel,

  // Set one of: left | right | jump | jump_left | jump_right | wait
  // Maps to the three boolean button flags. jump_left/right hold jump + a
  // direction so the cat steers in the air (confirmed real in updateCatSprite).
  setAction(action: string) {
    const left = action === "left" || action === "jump_left";
    const right = action === "right" || action === "jump_right";
    const jump = action === "jump" || action === "jump_left" || action === "jump_right";
    leftKeyButton.pressed = left;
    rightKeyButton.pressed = right;
    upKeyButton.pressed = jump;
  },

  clearAction() {
    leftKeyButton.pressed = false;
    rightKeyButton.pressed = false;
    upKeyButton.pressed = false;
  },

  // Re-baseline the death/advance detector after an EXTERNAL resetCurrentLevel
  // (e.g. the driver resetting to a clean slate). Without this, the next
  // stepFrame diffs against a stale pre-reset snapshot and reports a phantom
  // death. Call this immediately after any resetCurrentLevel you invoke from
  // outside the game loop.
  resync() {
    prev = snapshot();
    lastEvent = { type: "none", fromLevel: prev.level, toLevel: prev.level };
  },

  // One deterministic frame.
  stepFrame(dt: number) {
    // FIX 1: GameLoop defaults clearCanvas=true and clears before render, but we
    // call propagateGameLoopRender directly, so clear here or frames smear.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Pre-update snapshot of the game's own kill predicates (before this frame's
    // update mutates anything). This is the state the game's kill check sees.
    traceStep("pre");
    const preStep = trace[trace.length - 1];

    propagateGameLoopUpdate(dt);

    // FIX 2: held-jump leak. If a jump was requested and the cat has left the
    // ground, the jump has fired; release the jump bit so that when the cat
    // lands we do NOT immediately re-jump and silently burn another 34 frames.
    // Keep the direction bit so the cat still steers in the air.
    if (upKeyButton.pressed && !getPlatformWhichCatIsOn()) {
      upKeyButton.pressed = false;
    }

    propagateGameLoopRender();

    // FIX 3: death / advance detection by diffing snapshots.
    // A level-index change is always progress (portal), so check it first.
    // Otherwise a resetCurrentLevel (death) is detected by ANY of three
    // independent monotonic signals reversing:
    //   PRIMARY  topLeftDrone.y only ever increases during play (dy is 0 or
    //            +0.2, never negative) and resetDrones snaps it back to 1.
    //   SECOND   gemsCollected only ever rises during play, drops on reset.
    //   THIRD    aliveGems only ever falls during play (collected or destroyed),
    //            rises on reset. (Weak on its own: a 0-gem death keeps it at 3.)
    const cur = snapshot();
    if (cur.level !== prev.level) {
      lastEvent = { type: "advance", fromLevel: prev.level, toLevel: cur.level };
    } else {
      const droneReset = cur.drones.tl.y < prev.drones.tl.y;
      const collectedDrop = cur.gemsCollected < prev.gemsCollected;
      const gemsRespawn = cur.aliveGems > prev.aliveGems;
      if (droneReset || collectedDrop || gemsRespawn) {
        deathCount += 1;
        lastEvent = {
          type: "death",
          fromLevel: prev.level,
          toLevel: cur.level,
          signals: { droneReset, collectedDrop, gemsRespawn },
          // The state the game TESTED before it reset (pre-step), vs the
          // post-reset spawn we otherwise wrongly print. Never confuse them again.
          preStep,
          postReset: {
            catx: +catSprite.x.toFixed(2),
            cathy: +catSprite.y.toFixed(2),
            tly: +topLeftDroneSprite.y.toFixed(3),
          },
        };
      } else {
        lastEvent = { type: "none", fromLevel: prev.level, toLevel: cur.level };
      }
    }
    prev = cur;
  },

  // Read the current state plus the transition that the most recent stepFrame
  // produced, so the driver can branch on death vs advance vs normal.
  getState() {
    return { ...snapshot(), lastEvent, deathCount };
  },

  // Dump the per-step predicate trace (last N entries) for death diagnosis.
  getTrace(n = 20) {
    return trace.slice(-n);
  },
  clearTrace() {
    trace.length = 0;
  },

  // Expose the raw snapshot helper too.
  snapshot,
};

(window as any).bridge = bridge;

export default bridge;
