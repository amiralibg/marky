#!/bin/bash
# Build web-ready screenshot assets from the raw macOS window captures.
#
# The captures include the OS drop shadow in an alpha margin; we crop to the
# opaque window bounds and re-round the corners ourselves so the site can apply
# its own shadow consistently with the rest of the design.
set -euo pipefail

RAW="${RAW:-$HOME/Documents/Marky-Screenshots-Source}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/website/public/screenshots"
CROP="3390x2114+111+75"
WIDTH=1800   # 2x for a ~900px display width
RADIUS=14

rm -f "$OUT"/*.webp "$OUT"/*.png 2>/dev/null || true

emit() {
  local src="$1" name="$2"
  local h
  h=$(magick "$RAW/$src.png" -crop "$CROP" +repage -resize "${WIDTH}x" -format '%h' info:)

  # Rounded-corner mask, then copy it into the alpha channel.
  magick "$RAW/$src.png" -crop "$CROP" +repage -resize "${WIDTH}x" \
    \( -size "${WIDTH}x${h}" xc:none -draw "roundrectangle 0,0,$((WIDTH-1)),$((h-1)),$RADIUS,$RADIUS" \) \
    -alpha set -compose DstIn -composite \
    -quality 82 -define webp:method=6 "$OUT/$name.webp"

  printf '%-14s %s  %s\n' "$name" "$(magick identify -format '%wx%h' "$OUT/$name.webp")" \
    "$(du -h "$OUT/$name.webp" | cut -f1)"
}

emit note-graph          graph
emit graphnote-read      reading
emit graphnote-source    source
emit settings-appearance themes
emit daily-note          daily
emit architecture-read   code

echo "---"
du -sh "$OUT"
