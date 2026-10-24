#!/usr/bin/env python3
"""Build the standalone terrain preview page.

Usage: python3 views/terrain/build.py LAYER_DIR OUT.html [--local D3_DIR] [--borders BORDERS_DIR]
LAYER_DIR holds terrain.json, terrain-relief.webp and terrain-political.webp from views/terrain/export.py.
BORDERS_DIR holds the historical-basemaps snapshots world_<year>.json (default: the project's atlas/borders).
--local swaps the CDN d3 for a local file, for screenshots without network.
"""
import base64, os, sys

args = sys.argv[1:]
local = None
if '--local' in args:
    i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
borders = '/mnt/project-files/atlas/borders'
if '--borders' in args:
    i = args.index('--borders'); borders = args[i + 1]; del args[i:i + 2]
layer, out = args
import json
snaps = {y: json.load(open(os.path.join(borders, f'world_{"bc" + str(-y) if y < 0 else y}.json'))) for y in (-500, 100, 800, 1200, 1600, 1914)}
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, 'preview.src.html'), encoding='utf-8').read()
relief = 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(layer, 'terrain-relief.webp'), 'rb').read()).decode()
s = (s.replace('/*__TERRAIN_JS__*/', open(os.path.join(here, 'terrain.js'), encoding='utf-8').read())
      .replace('/*__TERRAIN__*/', open(os.path.join(layer, 'terrain.json'), encoding='utf-8').read())
      .replace('/*__RELIEF_POLITICAL__*/', 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(layer, 'terrain-political.webp'), 'rb').read()).decode())
      .replace('/*__BORDERS__*/', json.dumps(snaps, separators=(',', ':')))
      .replace('/*__RELIEF__*/', relief))
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client.min.js')
    s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + s + '</body></html>'
open(out, 'w', encoding='utf-8').write(s)
print(out, os.path.getsize(out) // 1024, 'KB')
