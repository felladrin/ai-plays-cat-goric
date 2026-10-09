#!/usr/bin/env bash
# Splice a title card and one card per level into the speed plan, and produce the mp4s for
# them. The cards are what fills a 14-level cut out to the 8-12 minute window: the holds
# alone land near 6.5 minutes at HOLD=12, so the extra time has to be deliberate content
# rather than longer holds nobody needs to read for.
#
# Reads driver/video/speedplan.tsv (the same six TAB separated columns assemble.sh consumes)
# and writes a second plan with a card row before the first row of each source file, plus a
# title card row at the head. Card rows carry an ABSOLUTE path in the file column,
# start=0, end=duration, speed=1, class=card, out_frames=frames -- the same shape as a hold
# row, so assemble.sh needs no special case beyond honouring an absolute path. That is
# deliberate: a card is a video like any other and goes through the identical
# trim/encode/concat path, so there is no second mechanism to keep in sync.
#
#   ./cards.sh && PLAN=speedplan_cards.tsv ./assemble.sh
#
# TWO SETS OF CUT POINTS, because there are two sources of recordings.
#
# File mode (the default, and the fallback) treats the first row of each source file as a
# level boundary. That is only true for the per-level recordings, where one file is one
# level.
#
# Align mode (ALIGN=1) is the run_full.cjs case, and it is the primary path. run_full.cjs
# records the whole ladder into ONE webm, so a level boundary is a moment inside the
# stream and not a file boundary, and the only thing that knows where those moments are is
# the run log. align.cjs turns the log's wall-clock stamps into frame indices against the
# container's creation_time tag, and this script cuts on those frames.
#
# A boundary does not usually land on a plan row edge. A level transition is discovered
# by a state read, which happens while the model is thinking, so the boundary frame falls
# inside a hold row -- and that hold belongs to the level that just ENDED. So any row that
# straddles a boundary is split in two, and the card goes between the halves. Putting the
# card before the whole row instead would push the previous level's hold to after the new
# level's card, which is the wrong order for the viewer.
#
# HOW THE TEXT GETS RENDERED. Not by ffmpeg: the ffmpeg on this machine has no drawtext
# filter and no subtitles (built without --enable-libfreetype/--enable-libass), so ffmpeg
# cannot draw a letter. It is cardpng.cjs, which lays the cards out in a real browser and
# screenshots them, resolving Playwright through driver/config.cjs exactly as
# run_level.cjs and run_full.cjs do. That reuses the PLAYWRIGHT_MODULE install the project
# already depends on (driver/experiments/lvl.sh:7) and the chromium already cached in
# ~/Library/Caches/ms-playwright, so nothing is installed and nothing outside the repo
# changes. A pre-rendered cards/<name>.png is used as-is and never re-rendered.
#
# Env:
#   ALIGN         1 = use ./align.json for level boundaries (run_full.cjs path)
#                 unset or 0 = one card per source file (per-level fallback)
#                 any other value = that path is the align.json
#   CARDS         card image and mp4 dir (default ./cards)
#   PLAN          input plan  (default ./speedplan.tsv)
#   OUTPLAN       output plan (default ./speedplan_cards.tsv)
#   TITLE_SECS    title card length    (default 3.0)
#   CARD_SECS     per-level card length (default 2.0)
#   TOTAL_LEVELS  denominator on the level card (default 14)
#   BG            card background hex, no leading # (default 0d1117)
#   FG            card text hex, no leading # (default e6edf3)
#   SUB           secondary text hex, no leading # (default 9aa5b1)
#   GAME          main title line  (default CAT GORIC)
#   SUBTITLE      second title line (default Escape from the Warp Chamber)
#   TAGLINE       third title line (default an LLM plays all 14 levels)
#   MIN_INK       bright pixels a card image must have, or it is rejected as blank
#                 (default 2000. Measured: the thinnest real card, LEVEL 1, is 2941 px
#                 because the digit 1 is far thinner than 0 or 8, and the worst blank
#                 render measured 1518. 2000 sits in that gap. Drawing it from the title
#                 card alone would have set it near 26000 and rejected every level card.)
#   CRF           x264 quality, must match assemble.sh (default 20)

set -euo pipefail

FFMPEG=${FFMPEG:-/opt/homebrew/bin/ffmpeg}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CARDS=${CARDS:-$HERE/cards}
# CARDS is a directory, never the flag. pipeline.sh's opt-in is WITH_CARDS=1, kept as a
# separate name precisely so this cannot collide; tolerate a literal 1 anyway rather than
# mkdir -p a directory called "1".
if [ "$CARDS" = 1 ]; then CARDS=$HERE/cards; fi
PLAN=${PLAN:-$HERE/speedplan.tsv}
OUTPLAN=${OUTPLAN:-$HERE/speedplan_cards.tsv}
ALIGN=${ALIGN:-0}
if [ "$ALIGN" = 1 ]; then ALIGN=$HERE/align.json; fi
TITLE_SECS=${TITLE_SECS:-3.0}
CARD_SECS=${CARD_SECS:-2.0}
TOTAL_LEVELS=${TOTAL_LEVELS:-14}
BG=${BG:-0d1117}
FG=${FG:-e6edf3}
SUB=${SUB:-9aa5b1}
GAME=${GAME:-CAT GORIC}
SUBTITLE=${SUBTITLE:-Escape from the Warp Chamber}
TAGLINE=${TAGLINE:-an LLM plays all 14 levels}
# cardpng.cjs reads the design from the environment rather than from argv, so these seven
# are exported rather than left as shell locals. They are the whole interface between the
# two scripts; nothing else consumes them.
export TOTAL_LEVELS BG FG SUB GAME SUBTITLE TAGLINE
MIN_INK=${MIN_INK:-2000}
CRF=${CRF:-20}

if [ ! -f "$PLAN" ]; then echo "no speed plan at $PLAN" >&2; exit 1; fi

# The ordered level keys, and in align mode the frame each level starts on. Two parallel
# comma separated lists rather than a file, because awk needs them as -v arguments and
# macOS bash 3.2 has no mapfile.
LEVELS=""
LEVEL_FRAMES=""
BOUNDARIES=""

if [ "$ALIGN" != 0 ]; then
  if [ ! -f "$ALIGN" ]; then
    echo "ALIGN=$ALIGN but there is no such file. Run align.cjs <run_full_*.json> <webm> first." >&2
    exit 1
  fi
  read_out=$(node -e '
const a = require(process.argv[1]);
const fps = a.video.fps;
const lv = (a.levels || []).filter((l) => l.frame != null);
if (!lv.length) { console.error("align.json has no placed levels"); process.exit(1); }
const missing = lv.filter((l) => l.missingStamp);
if (missing.length) { console.error("align.json levels missing a stamp: " + missing.map((l) => l.level).join(",")); process.exit(1); }
if (lv[0].frame !== 0) {
  console.error(`align.json does not start at frame 0 (level ${lv[0].level} is at frame ${lv[0].frame}); a card cannot precede the start of the file, and the mapping is suspect`);
  process.exit(1);
}
process.stdout.write(lv.map((l) => l.level).join(",") + "\n" + lv.map((l) => l.frame).join(",") + "\n" + lv.slice(1).map((l) => (l.frame / fps).toFixed(6)).join(","));
' "$ALIGN") || exit 1
  LEVELS=$(printf '%s\n' "$read_out" | sed -n 1p)
  LEVEL_FRAMES=$(printf '%s\n' "$read_out" | sed -n 2p)
  BOUNDARIES=$(printf '%s\n' "$read_out" | sed -n 3p)
  echo "  align mode: levels $(printf '%s' "$LEVELS" | tr ',' ' ')" >&2
  echo "  align mode: boundaries at frames $(printf '%s' "$LEVEL_FRAMES" | cut -d, -f2- | tr ',' ' ')" >&2
  NAMES="title"
  for n in $(printf '%s' "$LEVELS" | tr ',' ' '); do NAMES="$NAMES level$n.card"; done
else
  NAMES=title
  DONE=" "
  while IFS=$'\t' read -r f _ _ _ _ _; do
    [ -n "$f" ] || continue
    case "$DONE" in *" $f "*) continue ;; esac
    DONE="$DONE$f "
    NAMES="$NAMES $f.card"
  done < "$PLAN"
fi

mkdir -p "$CARDS"

frames_for() {
  node -e 'process.stdout.write(String(Math.round(Number(process.argv[1]) * 25)))' "$1"
}

# The card names, in plan order, so the missing-card error can list all of them at once.

NL=$'\n'

ink_pixels() {
  "$FFMPEG" -nostdin -hide_banner -loglevel error -i "$1" -vf format=gray -f rawvideo - 2>/dev/null |
    node -e '
const d = [];
process.stdin.on("data", (c) => d.push(c)).on("end", () => {
  const b = Buffer.concat(d);
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] > 140) n++;
  process.stdout.write(String(n));
});'
}

# Render any card image that is not already on disk. cardpng.cjs lays them out in a real
# browser and screenshots them; it resolves Playwright through driver/config.cjs, the same
# way run_level.cjs does, so there is no dependency to add and no install to ask for. An
# image already on disk is never re-rendered, so a hand-supplied card survives a re-run.
WANT=""
for n in $NAMES; do
  [ "$n" = title ] && continue
  [ -f "$CARDS/$n.png" ] && continue
  WANT="$WANT $n"
done
if [ -n "$WANT" ]; then
  echo "  rendering cards:$WANT" >&2
  LIST=$(printf '%s' "$WANT" | sed -e 's/^ *//' -e 's/ /,/g')
  if ! node "$HERE/cardpng.cjs" --out "$CARDS" --files "$LIST"; then
    cat >&2 <<EOF

cardpng.cjs could not render the card images. It needs a playwright install and a chromium
binary, both of which this project already uses for its runners:

  export PLAYWRIGHT_MODULE=/path/to/node_modules/playwright
  export CHROME="/path/to/chrome-headless-shell"

driver/config.cjs:16 documents the mechanism. Alternatively, drop your own 1280x720 PNGs at
the paths listed above and re-run; existing images are never overwritten.
EOF
    exit 1
  fi
fi

# Every card image has to exist AND have something on it. A render that produces a frame
# with correct layout metrics but no visible glyphs passes every other check here and
# produces a blank card, so the ink count is verified rather than assumed.
MISSING=""
BLANK=""
for n in $NAMES; do
  if [ ! -f "$CARDS/$n.png" ]; then
    MISSING="$MISSING$NL  $CARDS/$n.png"
    continue
  fi
  ink=$(ink_pixels "$CARDS/$n.png")
  if [ "$ink" -lt "$MIN_INK" ]; then
    BLANK="$BLANK$NL  $CARDS/$n.png ($ink px, need $MIN_INK)"
  fi
done
if [ -n "$MISSING" ] || [ -n "$BLANK" ]; then
  [ -n "$MISSING" ] && cat >&2 <<EOF
cannot build cards: these images are absent and cardpng.cjs did not produce them:

$MISSING
EOF
  [ -n "$BLANK" ] && cat >&2 <<EOF

these card images are effectively blank:

$BLANK
EOF
  exit 1
fi

# encode <name> <seconds>
#
# The PNG is a finished opaque 1280x720 design, not a mask, so it is looped straight into an
# encode. An earlier version thresholded it to a luminance mask and composited that over a
# flat background, which was only necessary when the images had to be drawn without a text
# renderer. It also could not have survived this design: the 1px rule sits at roughly 40%
# of SUB over BG, which lands just above the old threshold of 60, so the divider would have
# flickered in and out of the mask.
encode() {
  local name=$1 secs=$2
  local png="$CARDS/$name.png" out="$CARDS/$name.mp4" frames
  frames=$(frames_for "$secs")
  "$FFMPEG" -nostdin -hide_banner -loglevel error -y \
    -loop 1 -framerate 25 -i "$png" \
    -frames:v "$frames" -r 25 -an \
    -c:v libx264 -preset veryfast -crf "$CRF" -bf 0 \
    -video_track_timescale 25000 \
    "$out"
  printf '  %-46s %4ss  %3s frames\n' "$name.mp4" "$secs" "$frames" >&2
}

echo "title card ${TITLE_SECS}s" >&2
encode title "$TITLE_SECS"

DONE=" "
if [ "$ALIGN" != 0 ]; then
  for n in $(printf '%s' "$LEVELS" | tr ',' ' '); do
    encode "level$n.card" "$CARD_SECS"
  done
else
  while IFS=$'\t' read -r f _ _ _ _ _; do
    [ -n "$f" ] || continue
    case "$DONE" in *" $f "*) continue ;; esac
    DONE="$DONE$f "
    encode "$f.card" "$CARD_SECS"
  done < "$PLAN"
fi

# Splice. In file mode the level number is read back out of the filename with sed rather
# than awk's match(), which is a gawk extension absent from the BSD awk on macOS. In align
# mode the level numbers come from align.json and the boundaries are frame indices.
#
# emit() recomputes out_frames from the row's own start and end rather than trusting the
# value in the plan, because a row that has just been split at a boundary no longer has
# the frame count it was written with.
TITLE_FRAMES=$(frames_for "$TITLE_SECS")
CARD_FRAMES=$(frames_for "$CARD_SECS")
if [ "$ALIGN" != 0 ]; then IS_ALIGN=1; else IS_ALIGN=0; fi

awk -v cards="$CARDS" -v titleend="$TITLE_SECS" -v titleframes="$TITLE_FRAMES" \
    -v cardend="$CARD_SECS" -v cardframes="$CARD_FRAMES" \
    -v levels="$LEVELS" -v bound="$BOUNDARIES" -v isalign="$IS_ALIGN" '
# IS_ALIGN is a bare 0 or 1 rather than the value of ALIGN itself. ALIGN is a filesystem
# path in align mode, and awk compares a non-numeric string to the number 0 by converting
# the string to 0 -- so testing the path directly made every align run take the per-file
# branch and silently weave nothing.
BEGIN {
  FS = OFS = "\t"; first = 1; bi = 1
  if (isalign == 1) {
    nl = split(levels, lv, ",")
    nb = split(bound, b, ",")   # boundaries[1..nb] is level 2 onward; level 1 is frame 0
  }
}
# A card row, named by level. In file mode the name comes off the filename.
# b[bi] is where level lv[bi+1] begins, so the card names lv[bi+1] and not lv[bi]. An
# uninitialised bi would compare as 0 and fire the first boundary loop on the very first
# row, naming a card after an empty level.
function cardrow(f) {
  if (isalign == 1) return cards "/level" lv[bi + 1] ".card.mp4"
  return cards "/" f ".card.mp4"
}
function emit(f, s, e, sp, cl) {
  if (e - s <= 0.0004) return
  print f, s, e, sp, cl, int((e - s) * 25 + 0.5)
}
{
  if (first) { print cards "/title.mp4", 0, titleend, 1, "card-title", titleframes; first = 0 }

  if (isalign == 0) {
    if (!($1 in seen)) { print cardrow($1), 0, cardend, 1, "card-level", cardframes; seen[$1] = 1 }
    print
    next
  }

  # Align mode. bi indexes boundaries[1..nb], which are levels 2 onward; level 1 starts the
  # file so there is no boundary to place a card at.
  #
  # A card goes immediately BEFORE the row that first covers its boundary, which is the
  # only rule that holds in all three cases that occur in practice: a boundary strictly
  # inside a row (the row is split), a boundary exactly on a row edge, and a boundary
  # inside a gap in the plan. The last one is not hypothetical: speedplan.tsv really does
  # contain holes, because a still gap shorter than HOLD is kept whole and a motion burst
  # can start immediately after a previous burst ended, so two rows can be adjacent in
  # time with nothing between them. Testing the closed interval and emitting at the tail of
  # the previous row lost the card whenever the boundary fell in such a gap.
  cur = $2 + 0
  while (bi <= nb && b[bi] <= cur + 0.0004) { print cardrow($1), 0, cardend, 1, "card-level", cardframes; bi++ }
  while (bi <= nb && b[bi] < $3 - 0.0004) {
    emit($1, cur, b[bi], $4, $5)
    print cardrow($1), 0, cardend, 1, "card-level", cardframes
    cur = b[bi]
    bi++
  }
  emit($1, cur, $3 + 0, $4, $5)
}' "$PLAN" > "$OUTPLAN"

echo "wrote $OUTPLAN ($(wc -l < "$OUTPLAN" | tr -d ' ') segments)" >&2
