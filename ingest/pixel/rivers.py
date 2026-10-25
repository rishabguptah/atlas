#!/usr/bin/env python3
"""Compact river lines for the pixel map: Natural Earth 10m river centerlines -> [{rank, name, line}].

Usage: python3 ingest/pixel/rivers.py ne_10m_rivers_lake_centerlines.geojson OUT.json
rank is Natural Earth's scalerank (0 = greatest); the renderer shows more ranks as you zoom in.
"""
import json, sys

src, out = sys.argv[1], sys.argv[2]
rows = []
for f in json.load(open(src))['features']:
    p, g = f['properties'], f['geometry']
    if not g or p.get('featurecla') not in ('River', 'Lake Centerline'):
        continue
    for line in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
        pts = []
        for x, y in line:
            q = [round(x, 2), round(y, 2)]
            if not pts or pts[-1] != q:
                pts.append(q)
        if len(pts) > 1:
            rows.append({'rank': p.get('scalerank', 9), 'name': p.get('name') or '', 'line': pts})
rows.sort(key=lambda r: r['rank'])
json.dump(rows, open(out, 'w'), separators=(',', ':'))
print(out, len(rows), 'lines')
