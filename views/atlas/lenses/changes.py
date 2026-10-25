# Border changes: every dated change in the border timeline, for the one-page Atlas.
# Read from data/states-war/geo/border-changes.json (ingest/geography/timeline_borders.py, from Seshat Cliopatria):
# a realm rises, ends, or gains or loses land, with where it happened and who it came from or went to.
import json, os


def build(repo):
    p = os.path.join(repo, 'data', 'states-war', 'geo', 'border-changes.json')
    if not os.path.exists(p):
        return {'names': [], 'wiki': [], 'rows': [], 'source': ''}
    d = json.load(open(p, encoding='utf-8'))
    # [year, kind, realm, other, km2, pct, lon, lat] with coordinates to 0.1 degree, which is plenty for a pin.
    d['rows'] = [r[:6] + [round(r[6], 1), round(r[7], 1)] for r in d['rows']]
    return d
