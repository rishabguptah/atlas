# The shared motion model's data (no map layer of its own): travel rules (data/motion/rules.json), the half-degree
# terrain grid (data/motion/grid.json, from ingest/motion/grid.py) and the dated plague outbreaks a route can pass
# through. views/atlas/world/route.js reads it as LENS_DATA.motion and serves ATLAS.world.route and reach.
import json, os


def build(repo):
    d = os.path.join(repo, 'data', 'motion')
    rules = json.load(open(os.path.join(d, 'rules.json'), encoding='utf-8'))
    grid = json.load(open(os.path.join(d, 'grid.json')))
    # Plague outbreaks (Biraben and others), one per half-degree cell and year, packed by year as base-36 cell
    # numbers (row * 720 + column, as in grid.json) joined by '.'.
    by = {}
    g = os.path.join(repo, 'data', 'disease-climate', 'geo', 'plague_outbreaks.geojson')
    if os.path.exists(g):
        for f in json.load(open(g))['features']:
            y = f['properties'].get('year'); lon, lat = f['geometry']['coordinates'][:2]
            if y is None: continue
            c = min(719, max(0, int((lon + 180) * 2))) + 720 * min(359, max(0, int((90 - lat) * 2)))
            by.setdefault(int(y), set()).add(c)
    b36 = lambda n: '0' if n == 0 else ''.join('0123456789abcdefghijklmnopqrstuvwxyz'[n // 36 ** i % 36] for i in range(4, -1, -1)).lstrip('0')
    plague = {y: '.'.join(b36(c) for c in sorted(cs)) for y, cs in sorted(by.items())}
    return {'rules': rules, 'grid': grid['grid'], 'plague': plague}
