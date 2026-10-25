#!/usr/bin/env python3
"""Travel grid for the Live a life tab: the pixel map's terrain raster cut to half-degree cells.

Usage: python3 ingest/life/grid.py [TERRAIN_L0_PNG]   (default /mnt/project-files/atlas/pixel/terrain/terrain_l0.png)
Writes data/life/grid.json: 720 x 360 cells (0.5 degree, row 0 at 90N, column 0 at 180W), one value per cell:
  0 deep ocean, 1 sea or shelf, 2 lake, 3 ice, 4 tundra, 5 boreal forest, 6 temperate forest, 7 tropical forest,
  8 grassland, 9 steppe or savanna, 10 sand desert, 11 rock desert, 12 wetland, 13 hills, 14 mountains, 15 high peaks;
  +16 when a mapped river runs through the cell.
Rows are run-length coded: a letter (A-Z then a-f = 0..31) followed by its run length when longer than 1.
The source raster is the terrain workstream's L0 tile (10 arc-minutes, classes from SPEC.md in views/pixel/).
"""
import json, os, sys
from collections import Counter
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/atlas/pixel/terrain/terrain_l0.png'
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
step = W // 720
assert W == 720 * step and H == 360 * step, (W, H)
# SPEC class -> grid value (water 0-2, land 3-15)
LAND = {5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 12: 10, 13: 11, 14: 12, 15: 13, 16: 14, 17: 15}
AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'
rows = []
for r in range(360):
    vals = []
    for c in range(720):
        cls = [px[c * step + i, r * step + j][0] for i in range(step) for j in range(step)]
        n = len(cls)
        water = [x for x in cls if x in (0, 1, 2, 3)]
        river = any(x == 4 for x in cls)
        if len(water) * 2 > n:
            sea = Counter(water).most_common(1)[0][0]
            v = 0 if sea == 0 else 2 if sea == 3 else 1
        else:
            land = [LAND[x] for x in cls if x in LAND] or [8]
            hi = sum(1 for x in land if x >= 14)
            v = max(land) if hi * 3 >= len(land) else Counter(land).most_common(1)[0][0]
            if river: v += 16
        vals.append(v)
    s, i = [], 0
    while i < 720:
        j = i
        while j < 720 and vals[j] == vals[i]: j += 1
        s.append(AL[vals[i]] + (str(j - i) if j - i > 1 else '')); i = j
    rows.append(''.join(s))
out = os.path.join(root, 'data', 'life', 'grid.json')
json.dump({'cell': 0.5, 'cols': 720, 'rows': 360, 'source': 'views/pixel terrain L0 (terrain workstream, Natural Earth + Koppen biomes)', 'grid': rows},
          open(out, 'w'), separators=(',', ':'))
print(out, os.path.getsize(out))
