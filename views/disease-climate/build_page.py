# Usage: python3 views/disease-climate/build_page.py BORDERS_DIR OUT.html [local]
# Builds the Plague and Climate page from data/disease-climate/ plus the land outline and the
# 1300, 1530 and 1815 border snapshots from the Living Atlas borders folder (land-50m.json, world_<year>.json).
# With "local", d3 and topojson load from file:// paths so a headless browser can render it offline.
import sys, os, json, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data', 'disease-climate')
borders, out, local = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None

def jsonl(name):
    return [json.loads(l) for l in open(os.path.join(DATA, name)) if l.strip()]

dc = {
    'events': jsonl('events.jsonl'),
    'relations': jsonl('relations.jsonl'),
    'places': jsonl('places.jsonl'),
    'stubs': jsonl('stubs.jsonl'),
    'routes': json.load(open(os.path.join(DATA, 'geo', 'spread_routes.geojson'))),
}
J = lambda o: json.dumps(o, separators=(',', ':'), ensure_ascii=False)
s = open(os.path.join(os.path.dirname(__file__), 'page.src.html')).read()
s = s.replace('/*__DC__*/', 'const DC = ' + J(dc) + ';')
s = s.replace('/*__LAND__*/', 'const LAND = ' + J(json.load(open(os.path.join(borders, 'land-50m.json')))) + ';')
snaps = {y: json.load(open(os.path.join(borders, 'world_%d.json' % y))) for y in (1300, 1530, 1815)}
s = s.replace('/*__BORDERS__*/', 'const BORDERS = ' + J(snaps) + ';')
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3-7.8.5/package/dist/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client-3.1.0/package/dist/topojson-client.min.js')
    s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + s + '</body></html>'
open(out, 'w').write(s)
print(out, len(s))
