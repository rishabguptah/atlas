# The People lens outside Europe: people from data/coverage/ (Pantheon, Wikidata, CBDB) in the page's compact row shape,
# and a region for every row so the map can pick the most remembered people of each region instead of Europe's top 450.
# Used by build.py; standard library only.
import json, math, os, re, sys


def _regions(repo):
    sys.path.insert(0, os.path.join(repo, 'ingest/coverage'))
    from coverage import Regions
    return Regions(os.path.join(repo, 'data/coverage/geo/regions.json'))


def _jsonl(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()] if os.path.exists(path) else []


def fame(r):
    """Pantheon's HPI when there is one, else a rough HPI-like score from Wikipedia sitelinks."""
    if isinstance(r.get('fame'), (int, float)):
        return round(r['fame'], 1)
    sl = r.get('fame_sitelinks') or 0
    return round(min(85, 30 + 24 * math.log10(sl + 1)), 1)


KEYS = [('power', 'ruler|politic|noble|monarch|official|diplomat|judge|lawyer|activist|business|merchant|explorer'),
        ('war', 'general|military|soldier|warrior'),
        ('ideas', 'philosoph|scien|mathemat|physic|astronom|chemist|biolog|economist|inventor|engineer|doctor|geograph|psycholog|historian'),
        ('words', 'writer|poet|journalist|comic'), ('arts', 'paint|sculpt|architect|music|sing|actor|actress|compos|film|danc|artist|design|photograph'),
        ('faith', 'religio|monk|saint|priest')]


def group(roles):
    t = ' '.join(roles)
    for g, rx in KEYS:
        if re.search(rx, t):
            return g
    return 'other'


def add(repo, people_layer):
    """Tag PEOPLE.people rows with a region index (r[9]); return (region names, world rows for the late file)."""
    R = _regions(repo)
    codes = R.codes + ['sea']
    ix = {c: i for i, c in enumerate(codes)}
    pl = people_layer['places']
    for r in people_layer['people']:
        bp = pl[r[3]] if isinstance(r[3], int) and 0 <= r[3] < len(pl) else None
        r[9:] = [ix.get(R.at(bp[2], bp[1]) or 'sea', len(codes) - 1) if bp else len(codes) - 1]
    places = {}
    for f in ('data/places-people/places.jsonl', 'data/coverage/places.jsonl', 'data/living-atlas/places.jsonl'):
        for p in _jsonl(os.path.join(repo, f)):
            if isinstance(p.get('lat'), (int, float)) and p['id'] not in places:
                places[p['id']] = (p.get('name') or '', p['lat'], p['lon'])
    out = []
    for r in _jsonl(os.path.join(repo, 'data/coverage/people.jsonl')):
        bp = places.get((r.get('born') or {}).get('place'))
        pk = 0  # 0 born there, 1 lived or worked there (or CBDB native place), 2 only the state they served is placed
        if not bp:
            bp, pk = places.get(r.get('place')), 1
        lat, lon = (bp[1], bp[2]) if bp else (r.get('lat'), r.get('lon'))
        if lat is None or not isinstance(r.get('start'), int):
            continue
        dp = places.get((r.get('died') or {}).get('place'))
        roles = r.get('roles') or []
        occ = (roles[0] if roles else 'notable person').replace('_', ' ')
        src = r['wikidata'] if r.get('wikidata') else ('cbdb:' + r['ext']['cbdb'] if (r.get('ext') or {}).get('cbdb') else '')
        wiki = (r.get('ext') or {}).get('wikipedia') or ''
        g = R.at(lon, lat) or 'sea'
        out.append([r['name'], r['start'], r.get('end'), occ, group(roles), fame(r), wiki,
                    round(lat, 3), round(lon, 3), bp[0] if bp else (r.get('state') or ''), dp[0] if dp else '', ix[g],
                    (r.get('what') or '')[:140], src, 2 if 'placed_by_state' in (r.get('tags') or []) else pk])
    out.sort(key=lambda x: -x[5])
    return [R.names.get(c, 'At sea') for c in codes], out
