// Mirror of src/scripts/constants/config.ts physics constants, for driver-side
// fall/reach integration. Keep in sync with config.ts (catWalkSpeed=1.75,
// catJumpSpeed=6.8, catFallingAcceleration=0.4). The driver integrates these the
// same discrete way the game steps velocity; never hardcode derived values like a
// reach distance — derive them from these.
module.exports = {
  catWalkSpeed: 1.75,
  catJumpSpeed: 6.8,
  catFallingAcceleration: 0.4,
  // Laser closing speed (px/frame) — mirrors droneSpeed in config.ts. The top
  // drone's y increases by this each moving frame; the bottom's decreases. Used
  // to turn a live pixel margin into a countdown in the cat's own time units.
  droneSpeed: 0.2,
  // Grounded decision cadence (frames walked per non-jump decision), mirrors K in
  // run_level.cjs. Used to derive "within a short walk of an edge".
  decisionIntervalFrames: 6,
  // Countdown relevance threshold. A warning is only useful if it arrives while
  // the escape it warns about is still AFFORDABLE. The cheapest escape from the L2
  // top floor (walk to an end + fall) costs ~120 moving frames from a standing
  // start. A threshold below that cost shows the warning only once descent is
  // already unaffordable — correct, timely, and useless. So the threshold must sit
  // comfortably ABOVE the cost of the cheapest escape, not just above one jump arc.
  // 200 frames gives margin over the ~120-frame descent. L0 completes at ~76 max
  // moving frames, so it never gets within 200 of death and stays noise-free.
  countdownWarnFrames: 200,
  // Platform collision box, MEASURED from the live sprites (52x16, anchor
  // {x:0.5, y:0.4}) rather than assumed. updateCatSprite.ts collides the cat
  // against the platform SPRITE, so these are the numbers that decide where the
  // cat can stand and where it falls off.
  //
  // Do not take these from checkPlatformsCollisionWithLasers.ts. That file builds
  // its own hand-written box (40 wide, 8 tall) for laser-vs-platform hits only.
  // Copying those numbers here made every platform 12px narrower than it really
  // is, so the driver named descent points 6px INSIDE the real edge: the cat
  // walked to the stated "step off here" x, stayed on the platform, and re-decided.
  // Mirrors maximumLaserY in config.ts: the bottom laser starts here and closes
  // upward at droneSpeed per moving frame.
  maximumLaserY: 310,
  // Laser thickness. getRandomLaserSize (src/scripts/functions/getters/
  // getRandomLaserSize.ts) is `Math.random() * minimumLaserSize +
  // minimumLaserSize` with minimumLaserSize = 1.5, REDRAWN EVERY FRAME and NOT
  // seeded, and isCollidingWithLaser collides the cat against the laser SPRITE,
  // not against the drone. All four lasers get one; the top laser's is its
  // HEIGHT, so it is the thickness a jump has to clear.
  //
  // The bridge snapshot exports drone POSITIONS only (bridge.ts:76-85), so the
  // driver cannot see the thickness at all and models the ceiling at the top
  // drone's y. This also makes runs irreproducible: two runs of one commit with
  // one seed can differ, because the death geometry is a fresh random draw every
  // frame.
  minimumLaserSize: 1.5,
  maxLaserSize: 3,
  // How much of that thickness actually points at the playfield: HALF of it.
  // isCollidingWithLaser collides against the laser sprite, and every laser is
  // anchored on its own drone's centreline on the axis that points inward
  // (instances.ts:103-117: topLeft and bottomRight are anchor {x:0, y:0.5}, so
  // their height straddles the drone's y; topRight and bottomLeft are anchor
  // {x:0.5, y:0}, so their width straddles the drone's x). A thickness t
  // therefore reaches 0.75 to 1.5px into the field, not 1.5 to 3.0px.
  minLaserHalfSize: 0.75,
  maxLaserHalfSize: 1.5,
  platformWidth: 52,
  platformHeight: 16,
  platformAnchorY: 0.4,
};
