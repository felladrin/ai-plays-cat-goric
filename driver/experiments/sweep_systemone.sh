#!/bin/zsh
# Run each level in isolation against a System One server, on the shipped build,
# and append one summary line per level. See docs/bring-your-own-model.md.
#
#   SYSTEMONE_BASE_URL=http://127.0.0.1:8000 driver/experiments/sweep_systemone.sh <model-id> <seed> [levels...]
#
# Levels default to all 14 playable ones (0-13). Output: out/byom/<model-id>/s<seed>/
set -u
model=$1 seed=$2; shift 2
if (( $# )); then levels=($@); else levels=(0 1 2 3 4 5 6 7 8 9 10 11 12 13); fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/driver"
# The build every endpoint is compared on (docs/results.md, Clef section).
export PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1 HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1
export SEED=$seed SYSTEMONE_MODEL=$model
export OUT_DIR="$root/out/byom/$model/s$seed"
mkdir -p "$OUT_DIR"
for L in $levels; do
  log="$OUT_DIR/L$L.log"
  node run_level.cjs systemone "$L" > "$log" 2>&1
  printf "L%s s%s: cleared=%s deaths=%s decisions=%s gems=%s steps=%s\n" "$L" "$seed" \
    "$(grep -oE 'observed advance out of target\): (true|false)' "$log" | grep -oE 'true|false')" \
    "$(grep -oE '^deaths: [0-9]+' "$log" | tail -1 | grep -oE '[0-9]+')" \
    "$(grep -oE '^decisions made: [0-9]+' "$log" | tail -1 | grep -oE '[0-9]+')" \
    "$(grep -oE 'gems collected \(this level, PEAK\): [0-9]+' "$log" | grep -oE '[0-9]+$')" \
    "$(grep -oE '^total steps: [0-9]+' "$log" | grep -oE '[0-9]+')" | tee -a "$OUT_DIR/summary.txt"
done
