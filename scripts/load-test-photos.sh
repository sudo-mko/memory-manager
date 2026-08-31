#!/usr/bin/env bash
#
# Pushes the bundled test photographs (test-photos/) into a connected Android
# device or emulator and registers them with the media store, so "Scan my
# photos" has something real to index.
#
# The photos are Creative Commons licensed; sources and attribution are in
# test-photos/SOURCES.json.
#
# Usage:  ./scripts/load-test-photos.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v adb >/dev/null; then
  echo "adb not found — install Android platform-tools and connect a device/emulator." >&2
  exit 1
fi

adb shell mkdir -p /sdcard/Pictures/SiftTest
adb push "$ROOT/test-photos/." /sdcard/Pictures/SiftTest/

# Files pushed over adb land in the media store marked "pending", which hides
# them from every app. A volume scan clears the flag.
adb shell "content call --uri content://media --method scan_volume --arg external_primary" >/dev/null

COUNT=$(adb shell content query --uri content://media/external/images/media --projection _id 2>/dev/null | wc -l | tr -d ' ')
echo "Done — media store now reports $COUNT images. Open Sift and tap the scan button."
