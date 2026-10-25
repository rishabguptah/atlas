# Live a life: the life rules (data/life/rules.json), the real lives with their choices (data/life/lives/*.json)
# and the famines, epidemics and climate shocks that can strike you. Travel comes from the shared motion model
# (lenses/motion.py data, views/atlas/world/route.js). The game itself is views/atlas/lenses/life.js.
import glob, json, os


def rows(repo, *p):
    f = os.path.join(repo, 'data', *p)
    return [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.exists(f) else []


def build(repo):
    d = os.path.join(repo, 'data', 'life')
    rules = json.load(open(os.path.join(d, 'rules.json'), encoding='utf-8'))
    lives = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(d, 'lives', '*.json')))]
    # Famines, epidemics and climate shocks with a place: [name, start, end, lon, lat, subtype, deaths, cite, what].
    shocks = []
    for f in ('events.jsonl', 'bulk_famines.jsonl'):
        for e in rows(repo, 'disease-climate', f):
            if e.get('kind') != 'event' or e.get('lat') is None or e.get('start') is None: continue
            if e.get('subtype') not in ('famine', 'epidemic', 'climate_shift', 'eruption'): continue
            dl = e.get('deaths'); dl = dl[-1] if isinstance(dl, list) else dl
            src = (e.get('sources') or [{}])[0]
            shocks.append([e['name'], e['start'], e.get('end') or e['start'], round(e['lon'], 2), round(e['lat'], 2), e['subtype'], dl,
                           src.get('cite', ''), (e.get('what') or '')[:220]])
    return {'rules': rules, 'lives': lives, 'shocks': shocks}
