#!/bin/bash
# Compose the README artwork from the raw macOS window captures.
#
# ImageMagick here is built without Freetype, so nothing can be typeset into
# these images — they are pure composition: crop, round, shadow, gradient mat.
# All wording lives in the README markdown beside them.
#
# Panel aspect is fixed by the capture: 2114/3390 = 0.6236, so a panel W wide is
# 0.6236*W tall. Every canvas below is sized from that so nothing is clipped and
# the gaps clear the drop shadow.
set -euo pipefail

RAW="${RAW:-$HOME/Documents/Marky-Screenshots-Source}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/images"
TMP=/tmp/readme-art
CROP="3390x2114+111+75"
LIGHT="gradient:#f6f2e9-#eae4d6"
DARK="gradient:#24241f-#151514"

mkdir -p "$OUT" "$TMP"
rm -f "$OUT"/*.png "$TMP"/*.png

# panel <src> <width> <radius> <destination>
panel() {
  local src="$1" w="$2" r="$3" dest="$4" h
  h=$(magick "$RAW/$src.png" -crop "$CROP" +repage -resize "${w}x" -format '%h' info:)
  magick "$RAW/$src.png" -crop "$CROP" +repage -resize "${w}x" \
    \( -size "${w}x${h}" xc:none -draw "roundrectangle 0,0,$((w - 1)),$((h - 1)),$r,$r" \) \
    -alpha set -compose DstIn -composite \
    -compose over \
    \( +clone -background '#00000090' -shadow 50x26+0+14 \) +swap \
    -background none -layers merge +repage \
    "$dest"
}

# ---- 1. Hero: the graph, matted on the site's warm canvas --------------------
# 1900 wide -> 1185 tall, 155 margin top and bottom.
panel note-graph 1900 16 "$TMP/hero.png"
magick -size 2400x1500 "$LIGHT" \
  \( -size 2400x1500 radial-gradient:'#6d5ce033-none' \) -compose over -composite \
  "$TMP/hero.png" -gravity center -compose over -composite \
  -strip "$OUT/hero.png"

# ---- 2. Source vs reading, the same note side by side ------------------------
# 1080 wide -> 673 tall. 80 margin + 1080 + 80 gap + 1080 + 80 margin = 2400.
panel graphnote-source 1080 14 "$TMP/m-a.png"
panel graphnote-read 1080 14 "$TMP/m-b.png"
magick -size 2400x860 "$LIGHT" \
  "$TMP/m-a.png" -gravity west -geometry +80+0 -compose over -composite \
  "$TMP/m-b.png" -gravity east -geometry +80+0 -compose over -composite \
  -strip "$OUT/modes.png"

# ---- 3. Feature grid: four views on a dark board -----------------------------
# 1080 wide -> 673 tall. 80 + 673 + 84 gap + 673 + 80 = 1590.
panel daily-note 1080 14 "$TMP/g-tl.png"
panel settings-appearance 1080 14 "$TMP/g-tr.png"
panel architecture-read 1080 14 "$TMP/g-bl.png"
panel note-graph 1080 14 "$TMP/g-br.png"
magick -size 2400x1590 "$DARK" \
  "$TMP/g-tl.png" -gravity northwest -geometry +80+80 -compose over -composite \
  "$TMP/g-tr.png" -gravity northeast -geometry +80+80 -compose over -composite \
  "$TMP/g-bl.png" -gravity southwest -geometry +80+80 -compose over -composite \
  "$TMP/g-br.png" -gravity southeast -geometry +80+80 -compose over -composite \
  -strip "$OUT/grid.png"

# GitHub serves these raw, so keep them light.
for f in "$OUT"/*.png; do
  magick "$f" -strip -define png:compression-level=9 "$f"
  printf '%-12s %-12s %s\n' "$(basename "$f")" \
    "$(magick identify -format '%wx%h' "$f")" "$(du -h "$f" | cut -f1)"
done

rm -rf "$TMP"
