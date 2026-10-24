#!/usr/bin/env python3
"""Compile the terrain layer that views draw under everything else.

Usage: python3 views/terrain/export.py OUT_DIR [RELIEF_WEBP [POLITICAL_WEBP]]
Reads data/geography/features.jsonl, data/geography/geo/terrain.geojson and the 37 straits and passes
from the states-war chokepoint map (ingest/geography/chokepoints.json). Writes OUT_DIR/terrain.json and,
when RELIEF_WEBP is given, copies it to OUT_DIR/terrain-relief.webp.
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)

recs = [json.loads(l) for l in open(os.path.join(ROOT, 'data/geography/features.jsonl'), encoding='utf-8')]
geo = json.load(open(os.path.join(ROOT, 'data/geography/geo/terrain.geojson'), encoding='utf-8'))
choke = json.load(open(os.path.join(ROOT, 'ingest/geography/chokepoints.json'), encoding='utf-8'))


def words(s):
    return set(re.sub(r'[^a-z ]', ' ', s.lower()).split()) - {'strait', 'of', 'the', 'channel', 'passage', 'and'}


choke_words = [words(c['name']) for c in choke if c['sub'] == 'chokepoint']
WATER = {'ocean', 'sea', 'gulf', 'bay', 'strait', 'channel', 'sound', 'lagoon', 'fjord', 'inlet', 'lake', 'river'}

labels, points = [], []
for r in recs:
    if r['subtype'] in ('strait', 'channel') and any(words(r['name']) & w for w in choke_words):
        continue  # the chokepoint marker already names it
    item = {'id': r['id'], 'name': r['name'], 't': r['subtype'], 'tier': r['tier']}
    for k in ('what', 'why', 'wikidata', 'elevation_m'):
        if r.get(k):
            item[k] = r[k]
    if r['subtype'] == 'peak':
        item['at'] = [r['lon'], r['lat']]
        points.append(item)
    else:
        item['line'] = r.get('label_line') or [[r['lon'] - 1, r['lat']], [r['lon'] + 1, r['lat']]]
        item['water'] = r['subtype'] in WATER
        labels.append(item)
for c in choke:
    item = {'id': c['id'], 'name': c['name'], 't': 'strait' if c['sub'] == 'chokepoint' else 'pass', 'tier': 2,
            'at': [c['lon'], c['lat']], 'what': c['what'], 'why': c['why'], 'src': 'states-war'}
    points.append(item)

rivers = []
for f in geo['features']:
    if f['properties']['subtype'] != 'river':
        continue
    g = f['geometry']
    lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    rivers.append({'ref': f['properties']['ref'], 'tier': f['properties']['tier'], 'lines': lines})

tiers = {'1': 'always', '2': 'zoom 1.6+', '3': 'zoom 2.5+', '4': 'zoom 4+', '5': 'zoom 6+', '6': 'zoom 9+'}
data = {
    'version': 1,
    'image': {'file': 'terrain-relief.webp', 'political': 'terrain-political.webp', 'projection': 'd3.geoNaturalEarth1, unrotated',
              'covers': 'path.bounds({type:"Sphere"}); transparent outside the sphere'},
    'tiers': tiers,
    'sources': ['Natural Earth physical vectors v5.1.2 (public domain)', 'NOAA ETOPO2v2c relief (public domain)',
                'Straits and passes: the states-war chokepoint map'],
    'labels': labels, 'points': points, 'rivers': rivers,
}
path = os.path.join(out_dir, 'terrain.json')
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
if len(sys.argv) > 2:
    shutil.copy(sys.argv[2], os.path.join(out_dir, 'terrain-relief.webp'))
if len(sys.argv) > 3:
    shutil.copy(sys.argv[3], os.path.join(out_dir, 'terrain-political.webp'))
print(f'{path}: {len(labels)} labels, {len(points)} points, {len(rivers)} rivers, {os.path.getsize(path) // 1024} KB')
