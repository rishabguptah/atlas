#!/usr/bin/env python3
"""Build the pixel-map preview: OUT_DIR/index.html plus OUT_DIR/tiles/ (terrain tiles the page loads on demand).

Usage: python3 views/pixel/build.py OUT_DIR [ATLAS_DIR] [--local D3_DIR]
ATLAS_DIR (default /mnt/project-files/atlas) holds entries*.js, empires.js, borders/, pixel/terrain/ and pixel/rivers.json.
"""
import base64, glob, json, os, sys

args = sys.argv[1:]
local = None
if '--local' in args:
    i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
out = args[0]
atlas = (args[1] if len(args) > 1 else '/mnt/project-files/atlas').rstrip('/') + '/'
here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.dirname(os.path.dirname(here))
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
b64 = lambda p, mime: f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode()

s = open(os.path.join(here, 'preview.src.html'), encoding='utf-8').read()
js = '\n'.join(open(os.path.join(here, f), encoding='utf-8').read() for f in ('palette.js', 'sprites.js', 'era.js', 'terrain-art.js', 'pixelmap.js', 'borders.js', 'geolabels.js'))
lib = os.path.join(here, 'sprites-library.js')
if os.path.exists(lib):
    js = open(lib, encoding='utf-8').read() + '\n' + js
ent = '\n'.join(open(atlas + f, encoding='utf-8').read() for f in ['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'])
pol = {}
for f in sorted(glob.glob(atlas + 'borders/world_*.json')):
    y = os.path.basename(f)[6:-5]
    y = -int(y[2:]) if y.startswith('bc') else int(y)
    if y >= -3000: pol[y] = json.load(open(f))

# Terrain tiles: L0 whole, L1 cut into 30-degree tiles, L2 as the terrain thread ships them.
T = atlas + 'pixel/terrain/'
import subprocess
subprocess.run([sys.executable, os.path.join(here, 'tiles.py'), out, T], check=True)
rasters = [[1 / 6, 360, 'l0'], [1 / 15, 30, 'l1'], [1 / 30, 30, 'l2']]
rivers = [r for r in json.load(open(atlas + 'pixel/rivers.json')) if r['rank'] <= 8]

rows = lambda f: [json.loads(l) for l in open(os.path.join(repo, 'data/states-war', f)) if l.strip()]
battles = [{k: e.get(k) for k in ('name', 'start', 'lat', 'lon', 'sides', 'winner', 'why')} for e in rows('battles.jsonl')
           if e['kind'] == 'event' and e.get('lat') is not None]
money = json.load(open(atlas + 'unified/layers/money.json'))
plague = json.load(open(atlas + 'unified/layers/plague.json'))
shocks = [{k: e.get(k) for k in ('name', 'subtype', 'start', 'end', 'lat', 'lon', 'what')} for e in plague['events'] if e.get('lat') is not None]
# Geographic names (views/terrain/export.py): label lines and peaks only, for views/pixel/geolabels.js.
tj = atlas + 'unified/layers/terrain.json'
terrain = {k: v for k, v in json.load(open(tj)).items() if k in ('labels', 'points')} if os.path.exists(tj) else None

data = (ent + '\nconst POLITIES = ' + J(pol) + ';\nconst RASTERS = ' + J(rasters) + ';\nconst RIVERS = ' + J(rivers) +
        ';\nconst BATTLES = ' + J(battles) + ';\nconst TRADE = ' + J(money['trade']) + ';\nconst SHOCKS = ' + J(shocks) + ';\nconst TERRAIN = ' + J(terrain) + ';\n')
land = J(json.load(open(atlas + 'borders/land-50m.json')))
s = s.replace('/*__PIXEL_JS__*/', js).replace('/*__DATA__*/', data).replace('/*__LAND__*/', land)
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3-7.8.5/package/dist/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client-3.1.0/package/dist/topojson-client.min.js')
open(out + '/index.html', 'w', encoding='utf-8').write(s)
print(out, len(s))
