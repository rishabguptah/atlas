#!/usr/bin/env python3
"""Lay out the pixel map's terrain tiles and precise borders for publishing next to a page: OUT_DIR/tiles/l0_0_0.png,
l1_<col>_<row>.png (L1 cut into 30-degree tiles), l2_<col>_<row>.png and OUT_DIR/borders/l0|l1|l2/world_<year>.json.
Skips work already done.

Usage: python3 views/pixel/tiles.py OUT_DIR [TERRAIN_DIR]   (TERRAIN_DIR default /mnt/project-files/atlas/pixel/terrain)
The page asks for tiles/<level>_<col>_<row>.png, col 0 = 180W, row 0 = 90N.
"""
import glob, os, shutil, sys
from PIL import Image

out = sys.argv[1].rstrip('/') + '/tiles/'
src = (sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files/atlas/pixel/terrain').rstrip('/') + '/'
os.makedirs(out, exist_ok=True)
if not os.path.exists(out + 'l0_0_0.png'):
    shutil.copy(src + 'terrain_l0.png', out + 'l0_0_0.png')
if not os.path.exists(out + 'l1_11_5.png'):
    l1 = Image.open(src + 'terrain_l1.png')
    for c in range(12):
        for r in range(6):
            l1.crop((c * 450, r * 450, c * 450 + 450, r * 450 + 450)).save(f'{out}l1_{c}_{r}.png', optimize=True)
for f in glob.glob(src + 'z2_*.png'):
    t = out + 'l2_' + os.path.basename(f)[3:]
    if not os.path.exists(t):
        shutil.copy(f, t)
# Precise borders (ingest/geography/precise_borders.py) go to OUT_DIR/borders/l0|l1|l2/ for views/pixel/borders.js.
bsrc = os.path.join(os.path.dirname(os.path.dirname(src)), 'borders-precise')
if os.path.isdir(bsrc):
    for lv in ('l0', 'l1', 'l2'):
        os.makedirs(os.path.join(out, '..', 'borders', lv), exist_ok=True)
        for f in glob.glob(os.path.join(bsrc, lv, 'world_*.json')):
            t = os.path.join(out, '..', 'borders', lv, os.path.basename(f))
            if not os.path.exists(t):
                shutil.copy(f, t)
print(out, len(os.listdir(out)), 'tiles')
