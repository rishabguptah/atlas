# Europe 1789-1914: what this region adds on top of the world index (views/atlas/world/), which now carries its
# chronicle, lives and storylines like any other place and period (pack europe_1789_1914, data/deep/stories/).
# build(repo) is LENS_DATA.e19: provinces, city growth and railway growth by year, for the Up close numbers (the
# pixel map's zoom detail draws the railways themselves). Over 40 KB, so it loads after the first paint.
import json, os

BOX = (-25, 34, 50, 72)


def rows(repo, f):
    p = os.path.join(repo, 'data', 'europe-19c', f)
    return [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()] if os.path.exists(p) else []


def build(repo):
    d = os.path.join(repo, 'data', 'europe-19c')
    if not os.path.exists(os.path.join(d, 'stories.json')):
        return {}
    # Provinces: [name, lon, lat, start, end, kind, of, sitelinks, wikidata number]
    P = [[r['name'], r['lon'], r['lat'], r.get('start'), r.get('end'), r['admin'], r['admin_of'], r.get('sitelinks', 0), int(r['wikidata'][1:])]
         for r in rows(repo, 'provinces.jsonl')]
    return {'region': {'id': 'europe-1789-1914', 'name': 'Europe 1789–1914', 'start': 1789, 'end': 1914, 'view': {'lon': 14, 'lat': 50, 'span': 34}},
            'provinces': P, 'cities': cities(repo), 'rail': rail(repo),
            'src': {'wd': 'Wikidata (CC0), queried 2026-10-25', 'reba': 'Reba, Reitsma & Seto 2016 (after Chandler 1987), attribution, non-commercial, share-alike'}}


def cities(repo):
    """City growth 1750-1914: Wikidata census-year populations where a city has two or more, REBA (Chandler) otherwise."""
    places, series = {}, {}
    for f in ('places-people/places.jsonl', 'europe-19c/cities.jsonl'):
        p = os.path.join(repo, 'data', f)
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            if r['kind'] == 'place' and r.get('lat') is not None and r['id'] not in places:
                places[r['id']] = r
    for f, tag in (('places-people/measures.jsonl', 'r'), ('europe-19c/cities.jsonl', 'w')):
        for l in open(os.path.join(repo, 'data', f), encoding='utf-8'):
            r = json.loads(l)
            if r['kind'] != 'measure' or r.get('metric') != 'population' or not (r['id'].endswith(':reba2016') or r['id'].endswith(':wikidata')):
                continue
            pts = [p[:2] for p in r['points'] if 1700 <= p[0] <= 1914]
            if tag == 'w' and len(pts) < 2:
                continue
            if pts and (tag == 'w' or r['of'] not in series):
                series[r['of']] = (tag, pts)
    out = []
    for pid, (tag, pts) in series.items():
        pl = places.get(pid)
        if not pl or not (BOX[0] <= pl['lon'] <= BOX[2] and BOX[1] <= pl['lat'] <= BOX[3]) or max(v for _, v in pts) < 20000:
            continue
        if not any(y >= 1789 for y, _ in pts):
            continue
        out.append([pl['name'], round(pl['lon'], 3), round(pl['lat'], 3), tag, pts])
    out.sort(key=lambda c: -max(v for _, v in c[4]))
    return out


def rail(repo):
    """Railway growth by year from Wikidata station openings: [year, stations open, km of linked track, stations opened that year]."""
    import math
    p = os.path.join(repo, 'data', 'europe-19c', 'geo', 'railways.json')
    if not os.path.exists(p):
        return None
    R = json.load(open(p, encoding='utf-8'))
    st = R['stations']
    yr = lambda s: int(s[2][:4])
    def km(a, b):
        la, lb = math.radians(a[1]), math.radians(b[1])
        h = math.sin((lb - la) / 2) ** 2 + math.cos(la) * math.cos(lb) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
        return 2 * 6371 * math.asin(math.sqrt(h))
    opened, track = {}, {}
    for s in st:
        opened[yr(s)] = opened.get(yr(s), 0) + 1
    for a, b in R['edges']:
        y = max(yr(st[a]), yr(st[b]))
        track[y] = track.get(y, 0) + km(st[a], st[b])
    out, n, k = [], 0, 0.0
    for y in range(1800, 1915):
        n += opened.get(y, 0); k += track.get(y, 0)
        out.append([y, n, round(k), opened.get(y, 0)])
    return {'years': out, 'source': R.get('source'), 'note': R.get('note')}
