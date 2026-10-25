# Object journeys: where famous objects and kinds of things went, who held them and how sure we are.
# Reads data/objects/journeys/*.json; kinds with a `tech` id also take their diffusion steps from
# data/tech-food-energy (the same records the Technology lens draws), so the two lenses never disagree.
# Each stop's `from` (an index into the file's own stops, -1 for none) is resolved here: a single object
# comes from its previous stop, a kind from the nearest place it had already reached. A stop marked `copy` (copies or
# casts travelled) or `split` (part of it left, the rest stayed) is a branch: the object itself does not move there.
import glob, json, math, os

CONF = ('sure', 'likely', 'legend')
TYPES = ('single', 'kind')


def _km(a, b):
    la1, la2, dl = math.radians(a[1]), math.radians(b[1]), math.radians(b[0] - a[0])
    c = math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(dl)
    return 6371 * math.acos(max(-1, min(1, c)))


def _check(o, f):
    errs = []
    for k in ('id', 'name', 'type', 'what', 'stops', 'sources', 'status'):
        if not o.get(k):
            errs.append(f'missing {k}')
    if o.get('type') not in TYPES:
        errs.append(f'type must be one of {TYPES}')
    for i, s in enumerate(o.get('stops') or []):
        at = s.get('at')
        if not (isinstance(s.get('y'), int) and s['y'] != 0):
            errs.append(f'stop {i}: y must be a non-zero integer year')
        if not (isinstance(at, list) and len(at) == 2 and -180 <= at[0] <= 180 and -90 <= at[1] <= 90):
            errs.append(f'stop {i}: at must be [lon, lat]')
        if s.get('conf') not in CONF:
            errs.append(f'stop {i}: conf must be one of {CONF}')
        for k in ('place', 'by', 'note'):
            if not s.get(k):
                errs.append(f'stop {i}: missing {k}')
        fr = s.get('from')
        if fr is not None and not (isinstance(fr, int) and -1 <= fr < len(o['stops']) and fr != i):
            errs.append(f'stop {i}: from must be -1 or another stop index')
    if errs:
        raise ValueError(f'{os.path.basename(f)}: ' + '; '.join(errs))


def build(repo):
    d = os.path.join(repo, 'data', 'objects', 'journeys')
    tf = os.path.join(repo, 'data', 'tech-food-energy')
    rows = lambda p: [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()] if os.path.exists(p) else []
    places = {r['id']: r for r in rows(os.path.join(tf, 'places.jsonl'))}
    tech_rels = [r for r in rows(os.path.join(tf, 'relations.jsonl')) if r.get('type') == 'spread_to']
    tech_ideas = {r['id']: r for r in rows(os.path.join(tf, 'ideas.jsonl'))}

    src = []  # shared source list; records point at indexes
    def S(lst):
        out = []
        for s in lst or []:
            k = [s.get('cite'), s.get('url')]
            if k not in src:
                src.append(k)
            out.append(src.index(k))
        return out

    out = []
    for f in sorted(glob.glob(os.path.join(d, '*.json'))):
        o = json.load(open(f, encoding='utf-8'))
        _check(o, f)
        stops = [dict(s, _i=i) for i, s in enumerate(o['stops'])]
        if o.get('tech'):
            for r in tech_rels:
                if r['from'] != o['tech']:
                    continue
                p = places.get(r['to'], {})
                lon, lat = (r['at'][1], r['at'][0]) if r.get('at') else (p.get('lon'), p.get('lat'))
                if lon is None:
                    continue
                stops.append({'y': r['start'], 'approx': bool(r.get('start_approx')), 'at': [lon, lat],
                              'place': p.get('name') or r['to'].split(':', 1)[1].replace('_', ' ').title(),
                              'by': 'made' if r.get('step') == 0 else 'spread', 'conf': 'likely' if r.get('start_approx') else 'sure',
                              'note': r.get('note', ''), 'sources': r.get('sources'), 'tech': True, '_i': None})
            idea = tech_ideas.get(o['tech'])
            if idea:
                o['sources'] = (o.get('sources') or []) + [s for s in idea.get('sources', []) if s not in o['sources']][:3]
        # Order by year (file order breaks ties), then resolve where each leg starts.
        stops.sort(key=lambda s: s['y'])
        pos = {s['_i']: n for n, s in enumerate(stops) if s['_i'] is not None}
        st = []
        for n, s in enumerate(stops):
            fr = s.get('from')
            if fr == -1 or n == 0:
                fr = None
            elif fr is not None:
                fr = pos[fr]
            elif o['type'] == 'single':  # from the last place the object itself was (copies and parts that left are branches)
                fr = next((m for m in range(n - 1, -1, -1) if not (stops[m].get('copy') or stops[m].get('split'))), None)
            else:  # a kind arrives from the nearest place it had already reached
                prev = [m for m in range(n) if stops[m]['y'] <= s['y'] and stops[m]['at'] != s['at']]
                fr = min(prev, key=lambda m: _km(stops[m]['at'], s['at'])) if prev else None
            if fr is not None and stops[fr]['y'] > s['y']:
                raise ValueError(f"{os.path.basename(f)}: {s['place']} ({s['y']}) comes from a later stop, {stops[fr]['place']} ({stops[fr]['y']})")
            if fr is not None and stops[fr]['at'] == s['at'] and not s.get('path'):
                fr_leg = None  # stayed put: no leg to draw, but keep the link for the story
            else:
                fr_leg = fr
            row = {'y': s['y'], 'p': s['place'], 'at': [round(s['at'][0], 3), round(s['at'][1], 3)], 'by': s['by'], 'c': s['conf'], 'n': s['note']}
            for k, v in (('a', s.get('approx')), ('o', s.get('owner')), ('m', s.get('meet')), ('v', s.get('via')), ('g', s.get('gap')),
                         ('e', s.get('end')), ('cp', s.get('copy')), ('sp', s.get('split')), ('t', s.get('tech'))):
                if v:
                    row[k] = v
            if fr_leg is not None:
                row['f'] = fr_leg
                path = s.get('path') or [stops[fr_leg]['at'], s['at']]
                row['L'] = [[round(x, 2), round(y, 2)] for x, y in path]
                if not s.get('path'):
                    row['r'] = 1  # only the endpoints are known: the page may ask ATLAS.world.route for a likely path
            if s.get('sources'):
                row['s'] = S(s['sources'])
            st.append(row)
        out.append({'id': o['id'], 'n': o['name'], 't': o['type'], 'sp': o.get('sprite') or 'obj_relic', 'w': o['what'], 'why': o.get('why'),
                    'now': o.get('now'), 'dis': o.get('dispute'), 'st': st, 's': S(o['sources']), 'status': o['status']})
    # Famous objects first, then kinds of things, each by when the journey starts.
    out.sort(key=lambda o: (o['t'] != 'single', o['st'][0]['y'] if o['st'] else 0))
    return {'objects': out, 'src': src}
