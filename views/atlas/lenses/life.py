# Live a life: the rules (data/life/rules.json), the real lives with their choices (data/life/lives/*.json),
# the half-degree travel grid (data/life/grid.json, from ingest/life/grid.py) and the dated plague outbreaks
# and famines that can strike you. The game itself is views/atlas/lenses/life.js.
import glob, json, os


def rows(repo, *p):
    f = os.path.join(repo, 'data', *p)
    return [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.exists(f) else []


def build(repo):
    d = os.path.join(repo, 'data', 'life')
    rules = json.load(open(os.path.join(d, 'rules.json'), encoding='utf-8'))
    lives = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(d, 'lives', '*.json')))]
    grid = json.load(open(os.path.join(d, 'grid.json')))
    # Plague outbreaks (Biraben and others), one per half-degree cell and year.
    # Packed by year as base-36 grid cell numbers (row * 720 + column, as in grid.json), joined by '.'.
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
    # Famines, epidemics and climate shocks with a place: [name, start, end, lon, lat, subtype, deaths, cite].
    shocks = []
    for f in ('events.jsonl', 'bulk_famines.jsonl'):
        for e in rows(repo, 'disease-climate', f):
            if e.get('kind') != 'event' or e.get('lat') is None or e.get('start') is None: continue
            if e.get('subtype') not in ('famine', 'epidemic', 'climate_shift', 'eruption'): continue
            dl = e.get('deaths'); dl = dl[-1] if isinstance(dl, list) else dl
            src = (e.get('sources') or [{}])[0]
            shocks.append([e['name'], e['start'], e.get('end') or e['start'], round(e['lon'], 2), round(e['lat'], 2), e['subtype'], dl,
                           src.get('cite', ''), (e.get('what') or '')[:220]])
    return {'rules': rules, 'lives': lives, 'grid': grid['grid'], 'plague': plague, 'shocks': shocks}
