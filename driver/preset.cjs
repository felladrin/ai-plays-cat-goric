// The default flag set for the runners. Every prompt lever stays an env gate that
// is off when unset (decision.cjs, test_gate_off_values.cjs), so a gate off still
// renders the byte-identical prompt. The runners call applyPreset() as their first
// require, before decision.cjs or anything else reads the environment at load,
// and it fills in each preset flag that the caller left unset. An explicit value
// always wins, so FALL_BLAME=0 turns one lever off and PRESET=none turns them all
// off (the bare baseline).
//
// "winning" is the set PurpleMIST-Flash-1.0 cleared the whole ladder with, at
// SEED 9, 11 and 7 (docs/results.md, "GAME BEATEN" and the entries after it).
"use strict";

const PRESETS = {
  winning: {
    PRUNE_FATAL: "1", MOVE_INSTR: "2", JUMP_FACTS: "1", HOLD_FIX: "1", COL_FACTS: "1", GEM_FACTS: "1",
    STICKY_OBJECTIVE: "1", EXIT_FACT: "1", RISE_LABEL: "1", NEG_HOLD: "1", PORTAL_DESC: "1", GAP_DROP: "1",
    FALL_BLAME: "1", GAP_JUMP: "1", COLLECT_WINDOW: "2", ROUTE_ASCENT: "1", PORTAL_JUMP: "1",
    GEMJUMP_VERIFY: "2", CORRIDOR_CLOCK: "1", GAP_WALK: "1", FLOOR_FIX: "1", OVERSHOT_FIX: "1",
    DESC_UPSNAP: "1", WALKOFF_CLEAR: "3", JUMP_NOCOLLECT: "1", LAND_LATE: "2", STALL_OBJ: "1",
    PORTAL_WALK: "1", LAUNCH_LABEL: "2", HOLD_LIVE: "1",
  },
  none: {},
};

// The ladder caps the wins were measured with (up to 100 lives per level).
// run_full.cjs only: run_level.cjs has its own fixed caps.
const LADDER_CAPS = { winning: { MAX_DEATHS_PER_LEVEL: "100", MAX_TOTAL_STEPS: "150000" }, none: {} };

const DEFAULT_PRESET = "winning";

// Sets each preset key that is unset in env, records the preset name in
// env.PRESET (stamped into the run file's build by run_stats.cjs) and returns it.
function applyPreset(opts = {}, env = process.env) {
  const name = env.PRESET || DEFAULT_PRESET;
  if (!PRESETS[name]) {
    throw new Error(`PRESET=${name} is not a preset. Use one of: ${Object.keys(PRESETS).join(", ")}.`);
  }
  const flags = Object.assign({}, PRESETS[name], opts.ladder ? LADDER_CAPS[name] : {});
  for (const k of Object.keys(flags)) if (env[k] === undefined) env[k] = flags[k];
  env.PRESET = name;
  return name;
}

module.exports = { PRESETS, LADDER_CAPS, DEFAULT_PRESET, applyPreset };
