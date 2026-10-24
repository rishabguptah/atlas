# Usage: python3 views/guide/build.py OUT.html [ATLAS_DIR] [--local D3_DIR]
# Inlines the Living Atlas data (entries, empires, borders, land) and the curated tours into one page.
# ATLAS_DIR holds entries.js, entries-time.js, entries-more.js, empires.js and borders/ (default: the project's atlas folder).
import sys, json, glob, os

args = sys.argv[1:]
local = None
if '--local' in args:
    i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
out = args[0]
atlas = (args[1] if len(args) > 1 else '/mnt/project-files/atlas').rstrip('/') + '/'
here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.dirname(os.path.dirname(here))

s = open(os.path.join(here, 'guide.src.html')).read()
ent = '\n'.join(open(atlas + f).read() for f in ['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'])
pol = {}
for f in sorted(glob.glob(atlas + 'borders/world_*.json')):
    y = os.path.basename(f)[6:-5]
    y = -int(y[2:]) if y.startswith('bc') else int(y)
    if y >= -4000: pol[y] = json.load(open(f))
ent += '\nconst POLITIES = ' + json.dumps(pol, separators=(',', ':')) + ';\n'
land = json.dumps(json.load(open(atlas + 'borders/land-50m.json')), separators=(',', ':'))
tours = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(repo, 'data/guide/tours/*.json')))]
s = s.replace('/*__ENTRIES__*/', ent).replace('/*__LAND__*/', land).replace('/*__TOURS__*/', json.dumps(tours, ensure_ascii=False))
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3-7.8.5/package/dist/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client-3.1.0/package/dist/topojson-client.min.js')
    s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + s + '</body></html>'
open(out, 'w').write(s)
print(out, len(s))
