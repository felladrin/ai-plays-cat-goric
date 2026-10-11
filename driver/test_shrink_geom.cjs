"use strict";
// SHRINK_GEOM: platforms shrink under the lasers (platform_live.cjs). Pins the
// live widths to the probe, the archived L10 landing the static simulator got
// wrong, stable floor names, and the gate-off identity.
const assert = require("assert");

delete process.env.SHRINK_GEOM;
const LIVE = require("./platform_live.cjs");
const A = require("./arc.cjs");
const R = require("./reachability.cjs");

// Gate off: full width, no clock needed, the static landing on @140.
assert.deepStrictEqual(A.platformBoxes(10).filter((p) => p.y === 140).map((p) => [p.left, p.right]), [[304, 356]]);
const off = A.simulate(10, 251.25, 150, 0, 18, "jump_right", 80);
assert.strictEqual(off.outcome, "landed");
assert.strictEqual(off.y, 140, "gate off keeps the static landing on @140");

process.env.SHRINK_GEOM = "1";
LIVE.setClock(null);
assert.throws(() => A.platformBoxes(10), /no laser clock/, "gate on without a clock must throw, not default to full width");

// Probe (experiments/probe_platform_shrink.cjs): tower x 330 at scale 0.63 at mf 79, 0.83 at mf 59.
for (const [mf, probe] of [[79, 0.63], [59, 0.83]]) {
  LIVE.setClock(mf);
  const [b] = A.platformBoxes(10).filter((p) => p.y === 140);
  const half = (b.right - b.left) / 2;
  assert.ok(Math.abs(half - 26 * probe) < 0.5, `mf ${mf}: half width ${half} vs probe ${26 * probe}`);
}

// The archived launch: all 22 L10 cases from (251.25,150) mf ~80 holding jump_right
// were next seen grounded at (328.25,240), not on @140.
LIVE.setClock(80);
const on = A.simulate(10, 251.25, 150, 0, 18, "jump_right", 80);
assert.strictEqual(on.outcome, "landed");
assert.strictEqual(on.y, 240);
assert.strictEqual(on.x, 328.25);

// Floor names stay the full-width ones while the extents are live.
const t140 = R.runsOf(10).find((r) => r.y === 140 && r.left > 300);
assert.strictEqual(R.runKey(t140), "floor(304..356@140)");
assert.ok(t140.left > 313 && t140.right < 347, `live extent ${t140.left}..${t140.right}`);
assert.strictEqual(R.platformKeyUnder(10, 330, 140), "floor(304..356@140)");

// Destroyed platforms are gone: the five tower floors vanish by mf 150.
LIVE.setClock(150);
assert.strictEqual(R.runsOf(10).filter((r) => r.left > 300).length, 0);

LIVE.setClock(null);
delete process.env.SHRINK_GEOM;
console.log("test_shrink_geom: Failed: 0");
