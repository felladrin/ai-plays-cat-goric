#!/bin/sh
# The whole ladder (L0-L13) with the prompt levers that beat the game: PurpleMIST-Flash-1.0
# cleared every level in one run with this set at SEED 9, 11 and 7 (docs/results.md,
# "GAME BEATEN" and the entries after it). Start the harness first (npm run harness).
#
#   SYSTEMONE_BASE_URL=http://127.0.0.1:8000 SYSTEMONE_MODEL=PurpleMIST-Flash-1.0 driver/beat_the_game.sh [seed]
#
# The ladder ends with "won (reached level 14): true" when the game is beaten. It takes
# about an hour on one GPU; up to 100 lives per level.
set -eu
cd "$(dirname "$0")"
export PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1 HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1
export EXIT_FACT=1 RISE_LABEL=1 NEG_HOLD=1 PORTAL_DESC=1 GAP_DROP=1 FALL_BLAME=1 GAP_JUMP=1
export COLLECT_WINDOW=2 ROUTE_ASCENT=1 PORTAL_JUMP=1 GEMJUMP_VERIFY=2 CORRIDOR_CLOCK=1
export GAP_WALK=1 FLOOR_FIX=1 OVERSHOT_FIX=1 DESC_UPSNAP=1
export WALKOFF_CLEAR=3 JUMP_NOCOLLECT=1 LAND_LATE=2 STALL_OBJ=1 PORTAL_WALK=1 LAUNCH_LABEL=2
export MAX_DEATHS_PER_LEVEL=100 MAX_TOTAL_STEPS=150000
export SEED="${1:-9}"
exec node run_full.cjs systemone
