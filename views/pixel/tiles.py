#!/usr/bin/env python3
"""Lay out the pixel map's terrain tiles and precise borders for publishing next to a page: OUT_DIR/tiles/l0_0_0.png,
l1_<col>_<row>.png (L1 cut into 30-degree tiles), l2_<col>_<row>.png, l3.json + l3.png (city-scale patches, packed), OUT_DIR/borders/l0|l1|l2/world_<year>.json
and OUT_DIR/detail/ (zoom detail tiles).
Skips work already done.

Usage: python3 views/pixel/tiles.py OUT_DIR [TERRAIN_DIR]   (TERRAIN_DIR default /mnt/project-files/atlas/pixel/terrain)
The page asks for tiles/<level>_<col>_<row>.png, col 0 = 180W, row 0 = 90N.
"""
import glob, json, os, shutil, sys
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
# City-scale terrain patches (ingest/city/tiles.py), packed into one image so the page ships two files, not one per
# city: tiles/l3.png, and tiles/l3.json with each patch's crop [x, y, w, h] in it. Shelf packing, tallest first.
if os.path.exists(src + 'l3/l3.json'):
    ix = json.load(open(src + 'l3/l3.json'))
    ps = sorted(ix['patches'], key=lambda p: -p['h'])
    width, x, y, row = 2400, 0, 0, 0
    for p in ps:
        if x + p['w'] > width:
            x, y, row = 0, y + row, 0
        p['crop'] = [x, y, p['w'], p['h']]; x += p['w']; row = max(row, p['h'])
    sheet = Image.new('RGB', (width, y + row))
    for p in ps:
        sheet.paste(Image.open(src + 'l3/' + p['f']).convert('RGB'), tuple(p['crop'][:2]))
        p['f'] = 'l3.png'
    sheet.save(out + 'l3.png', optimize=True)
    json.dump(ix, open(out + 'l3.json', 'w'))
    for f in glob.glob(out + 'l3_*.png'):
        os.remove(f)
FFFD_FIXES = {'Arag\ufffdn': 'Arag\u00f3n', 'Teotihuac\ufffdn': 'Teotihuac\u00e1n', 'Monte Alb\ufffdn': 'Monte Alb\u00e1n'}
# Precise borders (ingest/geography/precise_borders.py) go to OUT_DIR/borders/l0|l1|l2/ for views/pixel/borders.js.
bsrc = os.path.normpath(os.path.join(src, '..', '..', 'borders-precise'))
if os.path.isdir(bsrc):
    for lv in ('l0', 'l1', 'l2'):
        os.makedirs(os.path.join(out, '..', 'borders', lv), exist_ok=True)
        for f in glob.glob(os.path.join(bsrc, lv, 'world_*.json')):
            t = os.path.join(out, '..', 'borders', lv, os.path.basename(f))
            if not os.path.exists(t):
                # Some source names carry U+FFFD (a lost accent), which the Artifact publish rejects: restore the known ones, drop the rest.
                txt = open(f, encoding='utf-8').read()
                for bad, good in FFFD_FIXES.items():
                    txt = txt.replace(bad, good)
                open(t, 'w', encoding='utf-8').write(txt.replace('\ufffd', ''))
# Zoom detail (ingest/pixel/detail.py) goes to OUT_DIR/detail/ for views/pixel/detail.js: 30-degree tiles, pop.json, countries.png.
dsrc = os.path.normpath(os.path.join(src, '..', 'detail'))
if os.path.isdir(dsrc):
    dout = os.path.join(out, '..', 'detail')
    os.makedirs(dout, exist_ok=True)
    for f in glob.glob(os.path.join(dsrc, '*')):
        if f.endswith(('.json', '.png')):
            t = os.path.join(dout, os.path.basename(f))
            if not os.path.exists(t) or os.path.getmtime(t) < os.path.getmtime(f):
                open(t, 'w', encoding='utf-8').write(open(f, encoding='utf-8').read().replace('\ufffd', '')) if f.endswith('.json') else shutil.copy(f, t)
print(out, len(os.listdir(out)), 'tiles')
