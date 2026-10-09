#!/bin/zsh
# Run one level on the current build and print a one-line summary.
# Distinct levels only: two runs of the same level collide on out/run_level_N_*.json.
set -u
lvl=$1
log=/tmp/par_L${lvl}_qwen.log
root="$(cd "$(dirname "$0")/../.." && pwd)"
export PLAYWRIGHT_MODULE="$root/driver/node_modules/playwright"
export LLAMA_BASE_URL=http://127.0.0.1:1235
unset GOALS_ONLY 2>/dev/null || true
cd "$root/driver"
node run_level.cjs qwen_local "$lvl" > "$log" 2>&1
printf "L%s: cleared=%s deaths=%s decisions=%s gems=%s steps=%s\n" "$lvl" \
  "$(grep -oE 'observed advance out of target\): (true|false)' "$log" | grep -oE 'true|false')" \
  "$(grep -oE '^deaths: [0-9]+' "$log" | grep -oE '[0-9]+')" \
  "$(grep -oE '^decisions made: [0-9]+' "$log" | grep -oE '[0-9]+')" \
  "$(grep -oE 'gems collected \(this level, PEAK\): [0-9]+' "$log" | grep -oE '[0-9]+$')" \
  "$(grep -oE '^total steps: [0-9]+' "$log" | grep -oE '[0-9]+')"
