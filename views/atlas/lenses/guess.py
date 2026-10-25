# Guess the past: a calibration game. Every question is a number the kernel already holds, read from a sourced
# measure or record at a year it actually gives (no interpolation, so no answer is invented): a city's size from
# Reba et al. (after Chandler and Modelski), a continent's people from HYDE, a country's share of world GDP and its
# income per head from the Maddison Project, an empire's area at its peak from Cliopatria, railway length from
# CHAT, and how many days news took from the tech workstream's dated dispatches. The page (guess.js) asks for an
# 80% range, scores calibration over time and plays the reveal as a Director scene. Context lines on the reveal
# are computed here from the same data (rank that year, the biggest city then, today's size, km per day).
import json, math, os

CITY_YEARS = [-430, -100, 800, 900, 1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1850, 1900]
CITY_TOP = 14            # the biggest cities on each year's list become questions
REGION_YEARS = [-3000, -1000, 1, 1000, 1500, 1700, 1800, 1900]
GDP_YEARS = [1820, 1870, 1900, 1950]
RAIL_YEARS = [1840, 1850, 1870, 1900, 1913]
EARTH_LAND = 149.0       # million km2, for the area comparison

# Map framing only (never an answer): where to fly for a country or region-level question.
VIEWS = {
    'country_india': (79, 22, 30), 'country_china': (104, 34, 40), 'country_united_kingdom': (-2.5, 54, 12),
    'country_united_states': (-98, 39, 50), 'country_france': (2.5, 46.5, 12), 'country_germany': (10.4, 51, 10),
    'country_japan': (137, 37, 16), 'country_russia': (60, 58, 80), 'country_italy': (12.5, 42.5, 12),
    'country_spain': (-3.7, 40.2, 12), 'country_netherlands': (5.3, 52.2, 5), 'country_brazil': (-52, -12, 45),
    'country_mexico': (-102, 23, 30), 'country_egypt': (30, 27, 16), 'country_turkey': (35, 39, 18),
    'country_indonesia': (118, -2, 45), 'country_belgium': (4.5, 50.6, 4), 'country_sweden': (16, 62, 16),
    'country_canada': (-100, 58, 60), 'country_australia': (134, -26, 45), 'country_argentina': (-64, -36, 35),
    'country_austria': (14, 47.6, 7), 'country_switzerland': (8.2, 46.8, 4), 'country_poland': (19, 52, 10),
    'region_africa': (20, 3, 80), 'region_asia': (90, 35, 110), 'region_europe': (15, 52, 50),
    'region_north_and_central_america': (-95, 35, 90), 'region_south_america': (-60, -18, 60), 'region_oceania': (140, -22, 60),
}
GDP_COUNTRIES = ['country_india', 'country_china', 'country_united_kingdom', 'country_united_states', 'country_france',
                 'country_germany', 'country_japan', 'country_russia', 'country_italy', 'country_spain', 'country_netherlands',
                 'country_brazil', 'country_mexico', 'country_egypt', 'country_turkey', 'country_indonesia']
PROPER = {'country_united_kingdom': 'Britain', 'country_united_states': 'the United States', 'country_netherlands': 'the Netherlands',
          'region_north_and_central_america': 'North and Central America', 'region_south_america': 'South America'}

# Hand-written context for a few kinds of question: what the number is and why it moved (generic, true of the data).
KIND_WHY = {
    'city': "Chandler and Modelski built these numbers from travellers' counts, tax rolls, house and hearth counts, grain imports and the area inside the walls, so treat them as good estimates rather than censuses. Cities this big needed a hinterland or a sea lane to feed them, which is why the largest ones were capitals and ports.",
    'region': "HYDE reconstructs population from censuses where they exist and from land use, farming technology and historians' estimates where they do not, so early figures are wide guesses. Farming, then the Columbian exchange, then industrial medicine and food drove the big jumps.",
    'gdpshare': "The Maddison Project rebuilds old economies from wages, prices, harvests and population. Before industry, output tracked people, so the most populous regions made most of the world's goods; after 1820, machines let a few countries pull away.",
    'gdppc': "Income per head in 2011 dollars, from the Maddison Project: before 1800 almost everyone lived on a few dollars a day. The gap between rich and poor countries is mostly a story of the last two centuries.",
    'area': "Cliopatria draws each polity's territory year by year from historical atlases, so area at the peak is an estimate of the land a state claimed, not land it governed closely. Horse and sea empires could claim enormous spaces that they ruled lightly.",
    'rail': "Railway length from the Cross-country Historical Adoption of Technology dataset (Comin and Hobijn). Rail spread with coal, iron and capital; a decade could double a network.",
    'news': "How fast news travelled was how fast a person, horse or ship carrying it could move, until the telegraph cut the tie between information and transport.",
}
CONF = {'city': 'estimated', 'region': 'estimated', 'area': 'estimated', 'rail': 'attested', 'news': 'attested'}
DOM = {  # slider domains by unit, wide enough not to hint at the answer
    'people_city': [1000, 30e6], 'people_region': [1e5, 5e9], 'share': [0.001, 1.0], 'usd': [200, 100000],
    'mkm2': [0.05, 50], 'km': [10, 1e6], 'days': [0.5, 500],
}


def rows(repo, *p):
    f = os.path.join(repo, 'data', *p)
    return [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.exists(f) else []


def src(r):
    return [{k: s[k] for k in ('cite', 'url') if s.get(k)} for s in (r.get('sources') or [])[:2]]


def pt(r, y):
    """The measure's own point for year y, as (value, low, high), or None."""
    for p in r.get('points') or []:
        if p[0] == y:
            return p[1], (p[2] if len(p) > 2 else None), (p[3] if len(p) > 3 else None)
    return None


def fmt_year(y):
    return f"{-y} BCE" if y < 0 else (f"{y} CE" if y < 1000 else str(y))


def nice(v):
    if v >= 1e9: return f"{v / 1e9:.3g} billion"
    if v >= 1e6: return f"{v / 1e6:.3g} million"
    if v >= 1e4: return f"{round(v, -3):,.0f}"
    return f"{v:,.0f}"


def name_of(pid, places):
    p = places.get(pid) or {}
    return PROPER.get(pid.split(':', 1)[1], p.get('name') or pid.split(':', 1)[1].replace('_', ' ').title())


def build(repo):
    places, measures, polities = {}, {}, {}
    for f in (('living-atlas', 'places.jsonl'), ('places-people', 'places.jsonl'), ('economy-trade', 'maddison.jsonl'),
              ('economy-trade', 'owid.jsonl'), ('tech-food-energy', 'places.jsonl')):
        for p in rows(repo, *f):
            if p.get('kind') != 'place': continue
            cur = places.setdefault(p['id'], {})
            for k in ('name', 'lat', 'lon', 'what', 'why', 'today'):
                if cur.get(k) is None and p.get(k) is not None: cur[k] = p[k]
    for f in (('places-people', 'measures.jsonl'), ('economy-trade', 'owid.jsonl'), ('economy-trade', 'maddison.jsonl'),
              ('states-war', 'polity-area.jsonl'), ('tech-food-energy', 'adoption.jsonl')):
        for r in rows(repo, *f):
            if r.get('kind') == 'measure': measures[r['id']] = r
    for f in (('order-chaos', 'polities.jsonl'), ('states-war', 'polities.jsonl'), ('living-atlas', 'polities.jsonl')):
        for p in rows(repo, *f):
            cur = polities.setdefault(p['id'], {})
            for k in ('name', 'what', 'peak', 'start', 'end', 'lat', 'lon', 'sources'):
                if cur.get(k) is None and p.get(k) is not None: cur[k] = p[k]
    Q = []

    def add(**q):
        q = {k: v for k, v in q.items() if v not in (None, '', [])}
        Q.append(q)

    # ---------- cities (Reba et al. 2016) ----------
    reba = {m['of']: m for m in measures.values() if m['id'].endswith(':reba2016') and m.get('metric') == 'population'}
    modern = {m['of']: m for m in measures.values() if m['id'].endswith(':geonames')}
    for y in CITY_YEARS:
        that = sorted(((pt(m, y)[0], pid) for pid, m in reba.items() if pt(m, y)), reverse=True)
        top = that[0]
        for rank, (v, pid) in enumerate(that[:CITY_TOP], 1):
            p = places.get(pid) or {}
            if p.get('lat') is None or v < 5000: continue
            n = p.get('name') or name_of(pid, places)
            ctx = [f"#{rank} of the {len(that)} cities on the list for {fmt_year(y)}."]
            if rank > 1: ctx.append(f"The biggest was {name_of(top[1], places)}, at {nice(top[0])}.")
            elif len(that) > 1: ctx.append(f"Next came {name_of(that[1][1], places)}, at {nice(that[1][0])}.")
            mo = modern.get(pid)
            if mo and mo['points']: ctx.append(f"Today (GeoNames, 2020): {nice(mo['points'][-1][1])}.")
            m = reba[pid]
            o = top if rank > 1 else (that[1] if len(that) > 1 else None)
            op = places.get(o[1]) if o else None
            cmp = {'n': name_of(o[1], places), 'v': o[0], 'lon': round(op['lon'], 2), 'lat': round(op['lat'], 2),
                   'c': 'The biggest city on the list' if rank > 1 else 'The runner-up'} if op and op.get('lat') is not None else None
            add(id=f"city:{pid[6:]}:{y}", k='city', y=y, of=pid, n=n,
                p=f"How many people lived in {n} in {fmt_year(y)}?", u='people_city',
                v=v, lon=round(p['lon'], 3), lat=round(p['lat'], 3), span=8, layers=['places'], lens='population',
                ctx=ctx, cmp=cmp, what=' '.join(x for x in (p.get('what'), p.get('why')) if x), conf='estimated', src=src(m),
                ask=f"Why did {n} have about {nice(v)} people in {fmt_year(y)}?")

    # ---------- continents (HYDE) ----------
    hyde = {m['of']: m for m in measures.values() if m['id'].endswith(':hyde') and m['of'][6:] in VIEWS and m.get('metric') == 'population'}
    for y in REGION_YEARS:
        vals = {pid: pt(m, y)[0] for pid, m in hyde.items() if pt(m, y)}
        world = sum(vals.values())
        for pid, v in vals.items():
            lon, lat, span = VIEWS[pid[6:]]
            n = name_of(pid, places)
            add(id=f"region:{pid[6:]}:{y}", k='region', y=y, of=pid, n=n,
                p=f"How many people lived in {n} in {fmt_year(y)}?", u='people_region', v=round(v),
                lon=lon, lat=lat, span=span, layers=['money'], lens='population',
                ctx=[f"{v / world:.0%} of the {nice(world)} people in HYDE's six continents that year."],
                conf='estimated', src=src(hyde[pid]), ask=f"Why did {n} have about {nice(v)} people in {fmt_year(y)}?")

    # ---------- share of world GDP and income per head (Maddison Project 2020) ----------
    wg, wpc = measures.get('m:gdp:world:mpd2020'), measures.get('m:gdp_per_capita:world:mpd2020')
    for c in GDP_COUNTRIES:
        g, pc = measures.get(f'm:gdp:{c}:mpd2020'), measures.get(f'm:gdp_per_capita:{c}:mpd2020')
        lon, lat, span = VIEWS[c]
        n = name_of('place:' + c, places)
        for y in GDP_YEARS:
            a, w = g and pt(g, y), wg and pt(wg, y)
            if a and w:
                uk = pt(measures.get('m:gdp:country_united_kingdom:mpd2020') or {}, y)
                add(id=f"gdpshare:{c}:{y}", k='gdpshare', y=y, of='place:' + c, n=n,
                    p=f"What share of the world's GDP did {n} make in {y}?", u='share',
                    v=round(a[0] / w[0], 4), lon=lon, lat=lat, span=span, layers=['money'], lens='economy',
                    ctx=[f"Computed from the Maddison Project: {n} {a[0] / 1e9:,.0f} billion of {w[0] / 1e9:,.0f} billion 2011 dollars."] +
                        ([f"Britain's share that year: {uk[0] / w[0]:.1%}."] if uk and c != 'country_united_kingdom' else []),
                    conf='estimated' if y < 1950 else 'attested', src=src(g), ask=f"Why did {n} make {a[0] / w[0]:.0%} of the world's output in {y}?")
            b, wb = pc and pt(pc, y), wpc and pt(wpc, y)
            if b and wb:
                add(id=f"gdppc:{c}:{y}", k='gdppc', y=y, of='place:' + c, n=n,
                    p=f"What was the average income per person in {n} in {y}, in today's dollars (2011 prices)?", u='usd',
                    v=round(b[0]), lon=lon, lat=lat, span=span, layers=['money'], lens='economy',
                    ctx=[f"{b[0] / wb[0]:.1f} times the world average of ${wb[0]:,.0f} that year.", f"That is about ${b[0] / 365:,.1f} a day."],
                    conf='estimated' if y < 1950 else 'attested', src=src(pc), ask=f"Why was income per person in {n} about ${b[0]:,.0f} in {y}?")

    # ---------- empires at their peak (Cliopatria, via the order-and-chaos polity records) ----------
    peaks = sorted(((p['peak'][1], p['peak'][0], pid, p) for pid, p in polities.items()
                    if p.get('peak') and p.get('lat') is not None and p['peak'][0] <= 1920 and p['peak'][1] >= 1.5), reverse=True)[:50]
    seen = set()
    for v, y, pid, pol in peaks:
        n = pol.get('name') or pid[7:].replace('_', ' ').title()
        if n in seen: continue
        seen.add(n)
        the = '' if n.lower().startswith('the ') or "'" in n else 'the '
        add(id=f"area:{pid[7:]}:{y}", k='area', y=y, of=pid, n=n,
            p=f"How much land did {the}{n} hold at its height, in {fmt_year(y)}? (million km²)",
            u='mkm2', v=round(v, 2), lon=pol['lon'], lat=pol['lat'], span=max(20, min(140, math.sqrt(v) * 18)),
            layers=['order'], lens='order', ctx=[f"About {v / EARTH_LAND:.0%} of the world's land.", f"Cliopatria maps it from {fmt_year(pol.get('start', y))} to {fmt_year(pol.get('end', y))}; this was its largest year."],
            what=pol.get('what'), conf='estimated', src=src(pol), ask=f"How did {the}{n} come to hold {v:.1f} million km² by {fmt_year(y)}?")

    # ---------- railways (CHAT, Comin and Hobijn) ----------
    for c in GDP_COUNTRIES + ['country_belgium', 'country_sweden', 'country_canada', 'country_australia', 'country_argentina', 'country_austria']:
        m = measures.get(f'm:railway_km:{c}:hccta')
        if not m or c not in VIEWS: continue
        lon, lat, span = VIEWS[c]
        n = name_of('place:' + c, places)
        for y in RAIL_YEARS:
            a = pt(m, y)
            if not a or a[0] < 20: continue
            earlier = next((pt(m, e) for e in (y - 20, y - 10) if pt(m, e)), None)
            add(id=f"rail:{c}:{y}", k='rail', y=y, of='place:' + c, n=n,
                p=f"How many kilometres of railway did {n} have in {y}?", u='km', v=round(a[0]),
                lon=lon, lat=lat, span=span, layers=['tech'], lens='technology',
                ctx=[f"{a[0] / earlier[0]:.1f} times what it had twenty years before." if earlier and earlier[0] else "Among the first networks anywhere."],
                conf='attested', src=src(m), ask=f"Why did {n} have about {a[0]:,.0f} km of railway in {y}?")

    # ---------- news (dated dispatches) ----------
    for r in rows(repo, 'tech-food-energy', 'news.jsonl'):
        if r.get('kind') != 'event' or r.get('days') is None or not r.get('days') or r.get('lat') is None: continue
        o = places.get(r.get('origin')) or {}
        route = [[o['lon'], o['lat']], [r['lon'], r['lat']]] if o.get('lat') is not None else None
        nm = r['name']
        add(id=f"news:{r['id'][6:]}", k='news', y=r['start'], of=r['id'], n=nm,
            p=f"{nm}, {fmt_year(r['start'])}: how many days did it take?", u='days', v=r['days'],
            lon=r['lon'] if not route else (route[0][0] + route[1][0]) / 2, lat=r['lat'] if not route else (route[0][1] + route[1][1]) / 2,
            span=max(8, min(120, (r.get('km') or 1000) / 70)), layers=['tech'], lens='technology', route=route,
            ctx=[f"About {r['km'] / r['days']:,.0f} km a day over {r['km']:,} km." if r.get('km') else ""],
            what=r.get('what'), conf='attested', src=src(r), ask=f"Why did it take {r['days']} days: {nm}?")

    # Sources repeat across hundreds of questions: ship each once and point at it.
    S, at = [], {}
    for q in Q:
        q['lon'], q['lat'] = round(q['lon'], 2), round(q['lat'], 2)
        ix = []
        for x in q.pop('src', []):
            key = json.dumps(x, sort_keys=True)
            if key not in at: at[key] = len(S); S.append(x)
            ix.append(at[key])
        q['s'] = ix
    return {'q': Q, 'src': S, 'why': KIND_WHY, 'dom': DOM, 'v': 1}


if __name__ == '__main__':
    import sys, collections
    d = build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', '..'))
    print(len(d['q']), dict(collections.Counter(q['k'] for q in d['q'])), len(json.dumps(d, separators=(',', ':'))) // 1024, 'KB')
    for q in d['q'][::40]: print(q['p'], q['v'], q.get('ctx'))
