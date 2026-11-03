#!/bin/sh
# Rebuild tools/perf/fixture from the project folder, so CI builds the page from current inputs.
#   sh tools/perf/refresh-fixture.sh [ATLAS_DIR]   (default /mnt/project-files/atlas)
set -e
A=${1:-/mnt/project-files/atlas}; F=$(cd "$(dirname "$0")" && pwd)/fixture; T=$(mktemp -d)
mkdir -p "$T/borders" "$T/pixel/terrain" "$T/unified"
cp "$A"/entries.js "$A"/entries-time.js "$A"/entries-more.js "$A"/empires.js "$T/"
cp -r "$A/unified/layers" "$T/unified/"
cp "$A/borders/land-50m.json" "$T/borders/"
# Snapshot years only: the page loads the snapshots themselves from borders/ beside it, so their contents are not needed.
for f in "$A"/borders/world_*.json; do echo null > "$T/borders/$(basename "$f")"; done
cp "$A/pixel/terrain/terrain_l0.png" "$T/pixel/terrain/"
for f in rivers.json city-lights.json; do [ -f "$A/pixel/$f" ] && cp "$A/pixel/$f" "$T/pixel/"; done
tar czf "$F/atlas-inputs.tgz" -C "$T" .
# Border timeline chunks the gate scrubs through: around 1453 (the opening tour) and 1796-1845.
mkdir -p "$F/borders-time/l0" "$F/borders-time/l1"
cp "$A/borders-time/index.json" "$F/borders-time/"
for c in c_1415 c_1796 c_1809 c_1822; do gzip -9c "$A/borders-time/l0/$c.json" > "$F/borders-time/l0/$c.json.gz"; done
for c in c_1796 c_1809 c_1822; do gzip -9c "$A/borders-time/l1/$c.json" > "$F/borders-time/l1/$c.json.gz"; done
rm -rf "$T"
du -sh "$F"
