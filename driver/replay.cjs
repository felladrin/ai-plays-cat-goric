"use strict";
// Shared by run_level.cjs and run_full.cjs (test_runner_parity.cjs asserts the
// ENDPOINTS blocks are textually identical, so the replay endpoint must live in
// both and be written identically).
//
// Replay a recorded run offline against the live harness, no model. The
// endpoint's decide is a wrapper around the real decide(): it keys the archive
// by decide-CALL ORDER (not step number - laser thickness is unseeded, so steps
// drift), answers every classify() call with the archived answer (probability 1
// on the logged choice), and compares the live snap against the archive entry
// before each call. A mismatch of more than 0.5px in cat position or a different
// gem count throws a divergence error with both values: the replayed run has
// left the archived trajectory and its answers no longer correspond to the
// positions the model saw.
//
// When the archive is exhausted the next decision is the one the recorded run
// died on (the adapter's 422). The wrapper runs the real decide against a stub
// that rejects every request the way the adapter did - with the request body
// attached - so anything that fires BEFORE the request (an empty menu, the
// guard in decide()) throws first and dumps the state.
//
// On a wrapper-level error (including the guard), the live snap, levelGems and
// deathHistory are written verbatim to REPLAY_DUMP (default
// out/empty_menu_snap.json) so the failing state is a fixture on disk instead
// of a hand reconstruction. driver/fixtures/empty_objective_menu_l6.json is one
// such dump, consumed by test_empty_objective_menu.cjs.

const fs = require("fs");
const path = require("path");

function makeReplayDecideFn(decideImpl) {
  const archiveFile = process.env.REPLAY_JSON;
  if (!archiveFile) {
    throw new Error("replay endpoint needs REPLAY_JSON=<run_level_*_systemone.json>");
  }
  const archive = JSON.parse(fs.readFileSync(archiveFile, "utf8")).log;
  let i = 0;
  return async (client, snap, ...rest) => {
    const a = archive[i];
    if (!a) {
      const stub = {
        classify: async (state, questions) => {
          throw new Error(
            `replay: archive exhausted at decide ${i}; request that would have been sent ` +
            `was rejected as in the recorded run. questions: ` +
            JSON.stringify({ state: typeof state === "string" ? state.slice(0, 400) : state, questions })
          );
        },
      };
      // The guard in decide() throws BEFORE the first classify call, so the
      // stub never sees the failing state. Catch the wrapper-level errors and
      // dump the live snap verbatim.
      try {
        return await decideImpl(stub, snap, ...rest);
      } catch (err) {
        const dumpPath = process.env.REPLAY_DUMP
          || path.join(__dirname, "..", "out", "empty_menu_snap.json");
        try {
          fs.writeFileSync(dumpPath, JSON.stringify({
            error: err.message,
            snap, levelGems: rest[0], deathHistory: rest[2] || [],
          }, null, 2));
          console.log(`  [replay dump] failing state written to ${dumpPath}`);
        } catch (dumpErr) {
          console.log(`  [replay dump] failed to write: ${dumpErr.message}`);
        }
        throw err;
      }
    }
    const dx = Math.abs(snap.cat.x - a.cat.x);
    const dy = Math.abs(snap.cat.y - a.cat.y);
    if (dx > 0.5 || dy > 0.5 || snap.gemsCollected !== a.gemsCollected) {
      throw new Error(
        `replay DIVERGENCE at decide ${i} (archive step ${a.step}): live cat ` +
        `(${snap.cat.x},${snap.cat.y}) gems=${snap.gemsCollected} vs archived ` +
        `cat (${a.cat.x},${a.cat.y}) gems=${a.gemsCollected}; ` +
        `laser thickness is unseeded, the replayed trajectory has left the archive`
      );
    }
    const stub = {
      classify: async (_state, questions) => {
        const answers = {};
        for (const [qname, q] of Object.entries(questions)) {
          const choice = qname === "objective" ? a.objective : a.move;
          const names = Object.keys(q.criteria || {});
          const probs = {};
          for (const n of names) probs[n] = n === choice ? 1 : 0;
          answers[qname] = { type: "choice", choice, confidence: 1, probabilities: probs };
        }
        return answers;
      },
    };
    const d = await decideImpl(stub, snap, ...rest);
    i += 1;
    return d;
  };
}

module.exports = { makeReplayDecideFn };
