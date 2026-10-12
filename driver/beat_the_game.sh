#!/bin/sh
# The whole ladder (L0-L13) with the prompt levers that beat the game: PurpleMIST-Flash-1.0
# cleared every level in one run with this set at SEED 9, 11 and 7 (docs/results.md,
# "GAME BEATEN" and the entries after it). Start the harness first (npm run harness).
#
#   SYSTEMONE_BASE_URL=http://127.0.0.1:8000 SYSTEMONE_MODEL=PurpleMIST-Flash-1.0 driver/beat_the_game.sh [seed]
#
# The flag set is the runners' default preset (preset.cjs), with up to 100 lives per
# level, so this is `node run_full.cjs systemone` at SEED 9 unless a seed is given.
# The ladder ends with "won (reached level 14): true" when the game is beaten. It takes
# about an hour on one GPU.
set -eu
cd "$(dirname "$0")"
export PRESET=winning
export SEED="${1:-9}"
exec node run_full.cjs systemone
