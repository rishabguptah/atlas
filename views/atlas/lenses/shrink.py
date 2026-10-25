# Watch the world shrink: how far you could get from a great city in a week, a month and a season, how fast news
# travelled, and where the centre of the world sat for 5,000 years. The travel-time rings themselves are not stored:
# the page draws them live with the shared router (ATLAS.world.reach, views/atlas/world/route.js). This file
# gathers what the rings are compared with:
#   hubs     the seven starting cities and the seven benchmark years
#   news     dated news arrivals (data/world/news.json when present, plus data/tech-food-energy/news.jsonl)
#   trips    documented journeys with their day counts (data/world/speeds.json when present), to check the router
#   centres  three wandering centres of the world, one point a century from 3000 BCE:
#            cities (Reba, Reitsma and Seto 2016 city sizes), trade (the two trade-hub relays in
#            data/economy-trade/routes.jsonl) and ideas (thinkers' birthplaces and where great works were made)
import glob, json, math, os

HUBS = [
    # id, name, lon, lat, founded, note
    ("rome", "Rome", 12.48, 41.89, -753, ""),
    ("baghdad", "Baghdad", 44.37, 33.31, 762, "Founded 762; before that the spot between Ctesiphon and Babylon."),
    ("changan", "Chang'an (Xi'an)", 108.94, 34.26, -202, ""),
    ("delhi", "Delhi", 77.21, 28.63, 736, ""),
    ("venice", "Venice", 12.33, 45.44, 421, ""),
    ("london", "London", -0.12, 51.51, 47, ""),
    ("new_york", "New York", -74.0, 40.71, 1624, "New Amsterdam from 1624; before that Lenape country at the mouth of the Hudson."),
]
ERAS = [100, 1300, 1500, 1800, 1870, 1914, 1960]
DAYS = [7, 30, 90]


def jd(y, m=7, d=1):
    # Day number in the proleptic Gregorian calendar (astronomical years: 44 BCE is -43); only differences matter.
    a = (14 - m) // 12; yy = y + 4800 - a; mm = m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045


def parse(s):
    # "-44-03-15" -> (-44, 3, 15, precision); BCE years in the files are historical (no year zero), which cancels out
    # in a difference as long as both ends use the same year.
    neg = s.startswith('-'); parts = (s[1:] if neg else s).split('-')
    y = int(parts[0]) * (-1 if neg else 1)
    m = int(parts[1]) if len(parts) > 1 else None
    d = int(parts[2]) if len(parts) > 2 else None
    return y, m, d


def lag(a, b):
    # Days from event date a to arrival date b, and whether that number is rough (a month or year only).
    ya, ma, da = parse(a); yb, mb, db = parse(b)
    rough = ma is None or mb is None or da is None or db is None
    if ma is None or mb is None:
        return None, True
    if db is None and (yb, mb) == (ya, ma):
        return -1, True          # arrived the same month, day unknown
    return max(0, jd(yb, mb, db or 15) - jd(ya, ma, da or 15)), rough


def sph(points):
    # Weighted centre of points on the sphere, projected back to the surface. Returns (lon, lat, spread 0..1) or None.
    x = y = z = w = 0.0
    for lon, lat, wt in points:
        if wt <= 0: continue
        la, lo = math.radians(lat), math.radians(lon)
        x += wt * math.cos(la) * math.cos(lo); y += wt * math.cos(la) * math.sin(lo); z += wt * math.sin(la); w += wt
    if not w: return None
    r = math.sqrt(x * x + y * y + z * z) / w
    return round(math.degrees(math.atan2(y, x)), 2), round(math.degrees(math.atan2(z, math.sqrt(x * x + y * y))), 2), round(r, 3)


def build(repo):
    D = lambda *p: os.path.join(repo, 'data', *p)
    rows = lambda f: [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.exists(f) else []
    places = {}
    for f in sorted(glob.glob(D('*', 'places.jsonl'))):
        for r in rows(f):
            if r.get('lat') is not None and r['id'] not in places: places[r['id']] = r
    src = lambda ss: [[s.get('cite', ''), s.get('url', '')] for s in (ss or [])][:3]

    # ---------- news ----------
    news = []
    wn = D('world', 'news.json')
    if os.path.exists(wn):
        for e in json.load(open(wn, encoding='utf-8')):
            arr = []
            for a in e['arrivals']:
                d, rough = (a['lag_days'], False) if a.get('lag_days') is not None else lag(e['date'], a['date'])
                if d is None: continue
                p = a.get('date_precision')
                arr.append([a['lon'], a['lat'], a['place'], d, 1 if rough or p in ('approx', 'month', 'year') else 0, 1 if p == 'terminus_ante_quem' else 0,
                            a.get('how', ''), a.get('conf', 'likely'), src(a.get('sources'))])
            if arr:
                news.append({"id": e['id'], "n": e['event'], "y": parse(e['date'])[0], "date": e['date'], "o": [e['lon'], e['lat'], e['place']],
                             "a": sorted(arr, key=lambda r: r[3]), "note": e.get('note', '')})
    # The same arrival in both files (Constantinople to Venice, Trafalgar to London): keep the dated one.
    seen = {(round(a[0]), round(a[1]), n['y']) for n in news for a in n['a']}
    for r in rows(D('tech-food-energy', 'news.jsonl')):
        if r.get('origin') not in places or r.get('place') not in places: continue
        o, t = places[r['origin']], places[r['place']]
        if (round(t['lon']), round(t['lat']), r['start']) in seen: continue
        news.append({"id": r['id'], "n": r['name'], "y": r['start'], "date": str(r['start']), "o": [o['lon'], o['lat'], o['name']],
                     "a": [[t['lon'], t['lat'], t['name'], r['days'], 1 if r.get('days_range') else 0, 0, r.get('what', ''), 'documented' if r.get('status') == 'sourced' else 'likely', src(r.get('sources'))]],
                     "note": r.get('what', '')})
    news.sort(key=lambda n: n['y'])

    # ---------- documented trips (to check the router against) ----------
    trips = []
    ws = D('world', 'speeds.json')
    if os.path.exists(ws):
        for s in json.load(open(ws, encoding='utf-8')):
            # Relay couriers and planes beat any traveller; a round trip has no route.
            if s.get('days') is None or s.get('mode') in ('courier', 'air') or s['from'] == s['to']: continue
            trips.append([s['from'], s['from_lon'], s['from_lat'], s['to'], s['to_lon'], s['to_lat'], s['year'], s['days'], s['mode'], s.get('who', ''), s.get('conf', ''), src(s.get('sources'))])

    # ---------- centres of the world ----------
    years = list(range(-3000, 2001, 100))
    # Cities: each city's size in the list year nearest to y (Reba et al. give snapshots; a gap means not listed).
    pops = []
    for m in rows(D('places-people', 'measures.jsonl')):
        if m.get('metric') != 'population' or not m['id'].endswith(':reba2016'): continue
        p = places.get(m['of'])
        if p: pops.append((p['lon'], p['lat'], p['name'], sorted((pt[0], pt[1]) for pt in m['points'])))
    cities = []
    for y in years:
        pts, top = [], None
        for lon, lat, name, ser in pops:
            near = [v for (yy, v) in ser if abs(yy - y) <= 50]
            if not near: continue
            v = near[0]; pts.append((lon, lat, v))
            if not top or v > top[1]: top = (name, v)
        c = sph(pts)
        if c and len(pts) >= 3: cities.append([y, c[0], c[1], len(pts), top[0], int(top[1]), c[2]])
    # Trade: the hubs the two relays (west and east) name for that year.
    trade = []
    relays = [r for r in rows(D('economy-trade', 'routes.jsonl')) if r.get('legs') and 'relay' in r.get('name', '').lower()]
    for y in years:
        hubs = []
        for r in relays:
            for leg in r['legs']:
                p = places.get(leg['place'])
                if p and leg['start'] <= y and (leg.get('end') is None or y < leg['end']): hubs.append((p['lon'], p['lat'], p['name']))
        c = sph([(h[0], h[1], 1) for h in hubs])
        if c: trade.append([y, c[0], c[1], " and ".join(h[2] for h in hubs)])
    # Ideas: where thinkers were born and where great works were made, within 150 years.
    marks = []
    for r in rows(D('religion-ideas', 'people.jsonl')):
        b = r.get('born') or {}; p = places.get(b.get('place') or r.get('place'))
        if p and r.get('start') is not None: marks.append((r['start'] + 35, p['lon'], p['lat'], r['name']))
    for f in ('works.jsonl', 'ideas.jsonl'):
        for r in rows(D('religion-ideas', f)):
            p = places.get(r.get('place'))
            if p and r.get('start') is not None: marks.append((r['start'], p['lon'], p['lat'], r['name']))
    ideas = []
    for y in years:
        near = [m for m in marks if abs(m[0] - y) <= 150]
        c = sph([(m[1], m[2], 1) for m in near])
        if c and len(near) >= 2: ideas.append([y, c[0], c[1], len(near), ", ".join(m[3] for m in sorted(near, key=lambda m: abs(m[0] - y))[:3])])

    return {
        "hubs": [{"id": i, "n": n, "lon": lo, "lat": la, "from": f, "note": t} for i, n, lo, la, f, t in HUBS],
        "eras": ERAS, "days": DAYS, "news": news, "trips": trips,
        "centres": {"cities": cities, "trade": trade, "ideas": ideas},
    }


if __name__ == '__main__':
    import sys
    d = build(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
    print(len(json.dumps(d, separators=(',', ':'))), 'bytes;', len(d['news']), 'news,', len(d['trips']), 'trips,', {k: len(v) for k, v in d['centres'].items()})
    for k, v in d['centres'].items(): print(k, v[::10])
