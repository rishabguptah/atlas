#!/usr/bin/env python3
"""Build the Living Atlas page from the kernel instead of its hand-written data files.

Usage: python3 views/living-atlas/build_page.py ATLAS_DIR OUT.html
ATLAS_DIR holds the page template (atlas.src.html) and borders/, as kept by the Living Atlas thread.
Run tools/build.py first so dist/kernel.json is fresh.
"""
import glob, json, os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
atlas, out = sys.argv[1], sys.argv[2]
data_js = out + '.data.js'
subprocess.run([sys.executable, os.path.join(here, 'export.py'), data_js], check=True)
ent = open(data_js, encoding='utf-8').read()
os.remove(data_js)
pol = {}
for f in sorted(glob.glob(os.path.join(atlas, 'borders', 'world_*.json'))):
    y = os.path.basename(f)[6:-5]
    y = -int(y[2:]) if y.startswith('bc') else int(y)
    if y >= -4000:
        pol[y] = json.load(open(f))
ent += '\nconst POLITIES = ' + json.dumps(pol, separators=(',', ':')) + ';\n'
land = json.dumps(json.load(open(os.path.join(atlas, 'borders', 'land-50m.json'))), separators=(',', ':'))
page = open(os.path.join(atlas, 'atlas.src.html'), encoding='utf-8').read()
page = page.replace('/*__ENTRIES__*/', ent).replace('/*__LAND__*/', land)
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page))
