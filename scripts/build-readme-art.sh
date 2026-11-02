#!/bin/bash
# Compose the README artwork from the raw macOS window captures.
#
# ImageMagick here is built without Freetype, so nothing can be typeset into
# these images — they are pure composition: crop, round, shadow, gradient mat.
# All wording lives in the README markdown beside them.
#
# Captures are 2880x1800 (1440x900 @2x) shots of the app itself, with no OS
# window chrome, so a panel W wide is 0.625*W tall. Every canvas below is sized
# from that so nothing is clipped and the gaps clear the drop shadow. Set CROP
# (e.g. "3390x2114+111+75") to cut a window out of a raw macOS window capture.
set -euo pipefail

RAW="${RAW:-$HOME/Documents/Marky-Screenshots-Source}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/images"
TMP=/tmp/readme-art
CROP="${CROP:-}"
LIGHT="gradient:#f6f2e9-#eae4d6"
DARK="gradient:#24241f-#151514"

# The drop shadow (sigma 26, offset +0+14) pads every panel image by 2*26 = 52
# on each side, shifted 14 down: 52 left/right, 38 top, 66 bottom. Placement
# offsets subtract that so the margins and gaps below are measured from the
# window edge, not the shadow edge.
PX=$((80 - 52))   # 80 margin from the left/right edge
PT=$((80 - 38))   # 80 margin from the top
PB=$((80 - 66))   # 80 margin from the bottom

mkdir -p "$OUT" "$TMP"
rm -f "$OUT"/*.png "$TMP"/*.png

# panel <src> <width> <radius> <destination>
panel() {
  local src="$1" w="$2" r="$3" dest="$4" h
  local crop=()
  [ -n "$CROP" ] && crop=(-crop "$CROP" +repage)
  h=$(magick "$RAW/$src.png" ${crop[@]+"${crop[@]}"} -resize "${w}x" -format '%h' info:)
  magick "$RAW/$src.png" ${crop[@]+"${crop[@]}"} -resize "${w}x" \
    \( -size "${w}x${h}" xc:none -draw "roundrectangle 0,0,$((w - 1)),$((h - 1)),$r,$r" \) \
    -alpha set -compose DstIn -composite \
    -compose over \
    \( +clone -background '#00000090' -shadow 50x26+0+14 \) +swap \
    -background none -layers merge +repage \
    "$dest"
}

# ---- 1. Hero: the graph, matted on the site's warm canvas --------------------
# 1900 wide -> 1188 tall, 156 margin top and bottom.
panel note-graph 1900 16 "$TMP/hero.png"
magick -size 2400x1500 "$LIGHT" \
  \( -size 2400x1500 radial-gradient:'#6d5ce033-none' \) -compose over -composite \
  "$TMP/hero.png" -gravity center -compose over -composite \
  -strip "$OUT/hero.png"

# ---- 2. Source vs reading, the same note side by side ------------------------
# 1080 wide -> 675 tall. 80 margin + 1080 + 80 gap + 1080 + 80 margin = 2400.
panel graphnote-source 1080 14 "$TMP/m-a.png"
panel graphnote-read 1080 14 "$TMP/m-b.png"
magick -size 2400x860 "$LIGHT" \
  "$TMP/m-a.png" -gravity west -geometry +$PX+0 -compose over -composite \
  "$TMP/m-b.png" -gravity east -geometry +$PX+0 -compose over -composite \
  -strip "$OUT/modes.png"

# ---- 3. Feature grid: four views on a dark board -----------------------------
# 1080 wide -> 675 tall. 80 + 675 + 84 gap + 675 + 80 = 1594.
panel daily-note 1080 14 "$TMP/g-tl.png"
panel settings-appearance 1080 14 "$TMP/g-tr.png"
panel architecture-read 1080 14 "$TMP/g-bl.png"
panel note-graph 1080 14 "$TMP/g-br.png"
magick -size 2400x1594 "$DARK" \
  "$TMP/g-tl.png" -gravity northwest -geometry +$PX+$PT -compose over -composite \
  "$TMP/g-tr.png" -gravity northeast -geometry +$PX+$PT -compose over -composite \
  "$TMP/g-bl.png" -gravity southwest -geometry +$PX+$PB -compose over -composite \
  "$TMP/g-br.png" -gravity southeast -geometry +$PX+$PB -compose over -composite \
  -strip "$OUT/grid.png"

# GitHub serves these raw, so keep them light.
for f in "$OUT"/*.png; do
  magick "$f" -strip -define png:compression-level=9 "$f"
  printf '%-12s %-12s %s\n' "$(basename "$f")" \
    "$(magick identify -format '%wx%h' "$f")" "$(du -h "$f" | cut -f1)"
done

rm -rf "$TMP"
