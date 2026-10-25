#!/bin/sh
# Build the Atlas into DIR with local d3/topojson and pixel tiles, and serve it on :8765 for tools/art/shots.js.
# Usage: sh tools/art/serve.sh DIR   (needs network once for the npm tarballs; borders-time comes from /mnt/project-files/atlas)
set -e
D=${1:?usage: sh tools/art/serve.sh DIR}; mkdir -p "$D/lib"
for p in d3@7.8.5 topojson-client@3.1.0; do n=${p%@*}; v=${p#*@}
  [ -d "$D/lib/$n-$v" ] || { mkdir -p "$D/lib/$n-$v"; curl -sSL "https://registry.npmjs.org/$n/-/$n-$v.tgz" | tar xz -C "$D/lib/$n-$v"; }; done
python3 views/atlas/build.py "$D/atlas.html" --local "$D/lib"
sed -i "s#file://$D/lib/#lib/#g" "$D/atlas.html"
[ -d "$D/tiles" ] || python3 views/pixel/tiles.py "$D"
ln -sfn /mnt/project-files/atlas/borders-time "$D/borders-time"
cd "$D" && exec python3 -m http.server 8765
