#!/usr/bin/env bash
# itch.io page art, end to end: renders the itch-* sandboxes and the world, then composes the files in
# release/itch/ (cover.png, cover@2x.png, icon.png, background.png, banner.gif) and copies the icon to
# tools/desktop/icon.png (the desktop builds' exe / app icon). page.md is hand-written.
#   bash tools/itch/make.sh [cover] [banner] [bg]      (no argument = all three)
# Chromium runs on SwiftShader here: the cover takes ~10 min, the banner (30 frames) ~20-40 min.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=release/itch
SH=.shots/itch
mkdir -p "$OUT" "$SH"
want() { [ $# -eq 0 ] && return 0; for a in "${ARGS[@]}"; do [ "$a" = "$1" ] && return 0; done; return 1; }
ARGS=("$@")
all=$([ $# -eq 0 ] && echo 1 || echo 0)

if [ "$all" = 1 ] || want cover; then
  # Ton turned back in the driver's seat, the woman in white staring into the lens (rear-right camera)
  node tools/itch/render.mjs --sandbox=itch-cover --size=1260x1000 --single --out=$SH/cover-raw.png \
    --params="exp=0.6&views=0.5,1.16,1.1;-0.12,1.12,0.45;56"
  python3 tools/itch/compose.py cover $SH/cover-raw.png $OUT --title-y=0.045 --title-w=0.6
  python3 tools/itch/compose.py icon $OUT/cover@2x.png $OUT --box=300,250,330
  cp $OUT/icon.png tools/desktop/icon.png
fi

if [ "$all" = 1 ] || want banner; then
  # the ghosts' synchronized dance at the shrine: one 2 s loop at 15 fps
  rm -rf $SH/banner && mkdir -p $SH/banner
  node tools/itch/render.mjs --sandbox=itch-banner --size=960x360 --out=$SH/banner/f.png \
    --params="title=0&exp=0.7&fog=0.06&scatter=0.06"
  python3 tools/itch/compose.py gif $SH/banner $OUT --fps=15 --width=960 --colors=128
fi

if [ "$all" = 1 ] || want bg; then
  # the shrine fork in the fog, from the real world build
  node tools/shot.mjs --sandbox=world --size=1920x1080 --frames=2 --timeout=1800000 --out=$SH/bg-raw.png \
    --params="lm=shrineMaRuay&ds=-38&cam=drive&hour=23.5&fog=0.7&headlights=0"
  python3 tools/itch/compose.py bg $SH/bg-raw.png $OUT
fi
ls -l $OUT
