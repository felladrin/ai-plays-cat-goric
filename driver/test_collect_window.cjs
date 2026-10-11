"use strict";
// COLLECT_WINDOW: the window is the last clock any collector can touch the gem.
const assert = require("assert");
delete process.env.COLLECT_WINDOW;
delete process.env.SHRINK_GEOM;
const W = require("./collect_window.cjs");
const G = require("./experiments/gem_table.cjs")();

// L11 gem_a: the @114 jump_right is laser-blocked from mf ~179 (corridor census).
assert.strictEqual(W.windowClose(11, ...G[11][0]), 178);
// L10 gem_c: the tower collector floors are gone near mf 142.
assert.strictEqual(W.windowClose(10, ...G[10][2]), 144);
// A gem with no earlier window closes at its own deadline (L0 gem_a, deadline 325).
assert.strictEqual(W.windowClose(0, ...G[0][0]), 324);

assert.strictEqual(W.collectWindowLine(11, ...G[11][0], 5, []), "", "gate off: no line");
process.env.COLLECT_WINDOW = "1";
const others11 = [G[11][1], G[11][2]].map(([x, y]) => ({ x, y }));
assert.strictEqual(W.collectWindowLine(11, ...G[11][0], 5, others11),
  " It can be collected only during the next 173 moving frames, before any other gem's time runs out.");
// Window already closed: no line. Gem whose window is its deadline: no line.
assert.strictEqual(W.collectWindowLine(11, ...G[11][0], 190, others11), "");
assert.strictEqual(W.collectWindowLine(0, ...G[0][0], 5, []), "");
// The second clause only when every other live gem's window closes later.
// L13 gem_b closes at 222; gem_c's deadline 250 is later, gem_a's window 328 too -> clause on.
const o13 = [G[13][0], G[13][2]].map(([x, y]) => ({ x, y }));
assert.ok(W.collectWindowLine(13, ...G[13][1], 30, o13).includes("before any other gem"));
// L13 gem_a closes at 328, but gem_b (222) and gem_c (250) close first -> no clause.
const o13a = [G[13][1], G[13][2]].map(([x, y]) => ({ x, y }));
assert.strictEqual(W.collectWindowLine(13, ...G[13][0], 150, o13a), " It can be collected only during the next 178 moving frames.");
delete process.env.COLLECT_WINDOW;
console.log("test_collect_window: Failed: 0");
