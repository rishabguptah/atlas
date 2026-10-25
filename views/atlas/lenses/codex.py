# Codex and quests: the discoveries the viewer can find on the map (lost cities and sites, wonders, battles) and
# the quests built from them, from the guide's tours and from the what-if turning points. Progress lives in the
# viewer's browser (views/atlas/lenses/codex.js); this only ships the records and the quest rules.
import glob, json, math, os

# Lost buildings in the art workstream that read better as wonders than as lost sites.
ART_WONDERS = {'Cluny Abbey', 'Templo Mayor'}
AMERICAS = ('Mexico', 'Guatemala', 'Peru', 'Bolivia', 'USA', 'Honduras', 'Belize', 'Chile', 'Ecuador', 'Colombia')
SILK_ROAD = ('place:merv', 'place:sarai', 'place:karakorum', 'place:rayy', 'place:ctesiphon', 'work:art:ai_khanoum')


def rows(repo, *p):
    f = os.path.join(repo, 'data', *p)
    return [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.exists(f) else []


def km(a, b):
    la1, la2 = math.radians(a['lat']), math.radians(b['lat'])
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(math.radians(b['lon'] - a['lon']) / 2) ** 2
    return 12742 * math.asin(math.sqrt(d))


def src(r):
    return [{k: s[k] for k in ('cite', 'url') if s.get(k)} for s in (r.get('sources') or [])[:2]]


def site(r, k, **more):
    out = {'id': r['id'], 'k': k, 'n': r['name'], 'lon': round(r['lon'], 3), 'lat': round(r['lat'], 3),
           's': r.get('start'), 'e': r.get('end'), 't': r.get('today'), 'w': r.get('what'), 'y': r.get('why'),
           'st': r.get('status'), 'src': src(r)}
    out.update(more)
    return {a: b for a, b in out.items() if b not in (None, '', [])}


def build(repo):
    S = []
    for p in rows(repo, 'living-atlas', 'places.jsonl'):
        if p.get('lat') is None: continue
        if p.get('subtype') == 'wonder': S.append(site(p, 'w', tags=p.get('tags')))
        elif p.get('subtype') == 'city' and p.get('end') is not None: S.append(site(p, 'c'))
    # Lost buildings and sites from the art workstream, unless the city list already has them.
    for m in rows(repo, 'art-architecture', 'monuments.jsonl'):
        if m.get('end') is None or m.get('lat') is None or m.get('subtype') != 'building': continue
        if any(km(m, s) < 40 for s in S): continue
        S.append(site(m, 'w' if m['name'] in ART_WONDERS else 'c'))
    for b in rows(repo, 'states-war', 'battles.jsonl'):
        if b.get('kind') != 'event' or b.get('lat') is None or b.get('start') is None: continue
        sides = [' and '.join(x['name'] for x in side) for side in b.get('sides') or []]
        won = b.get('winner')
        what = ' against '.join(sides) + (f'; {sides[won]} won.' if isinstance(won, int) and won < len(sides) else '.') if sides else None
        S.append(site(b, 'b', w=what, sub=b.get('subtype')))

    ids = {s['id'] for s in S}
    pick = lambda f: [s['id'] for s in S if f(s)]
    Q = [
        {'id': 'wonders7', 'n': 'The Seven Wonders', 'd': 'Find every wonder on the ancient Greek list, standing or gone.',
         'ids': pick(lambda s: 'seven_wonders' in (s.get('tags') or [])), 'mode': 'found'},
        {'id': 'standing', 'n': 'While they stood', 'd': 'Visit five lost wonders in a year when they were still standing.',
         'ids': pick(lambda s: s['k'] == 'w' and s.get('e') is not None), 'need': 5, 'mode': 'alive'},
        {'id': 'first', 'n': 'The first cities', 'd': 'Find six cities that were already standing by 2500 BCE and are now ruins.',
         'ids': pick(lambda s: s['k'] == 'c' and (s.get('s') or 0) <= -2500), 'need': 6, 'mode': 'found'},
        {'id': 'collapse', 'n': 'When the Bronze Age ended', 'd': 'Be in each of these cities in its last century, as the Bronze Age world came apart (about 1300 to 1050 BCE).',
         'ids': pick(lambda s: s['k'] == 'c' and -1300 <= (s.get('e') or 9999) <= -1050), 'mode': 'fall', 'win': 100},
        {'id': 'americas', 'n': 'Lost cities of the Americas', 'd': 'Find eight abandoned cities and sites from Illinois to the Andes.',
         'ids': pick(lambda s: s['k'] == 'c' and any(a in (s.get('t') or '') for a in AMERICAS) or s['k'] == 'c' and s['lon'] < -30), 'need': 8, 'mode': 'found'},
        {'id': 'silk', 'n': 'Ghosts of the Silk Road', 'd': 'Find the caravan cities the Mongols, rivers and shifting trade left empty.',
         'ids': [i for i in SILK_ROAD if i in ids], 'mode': 'found'},
        {'id': 'fall', 'n': 'Witness the end', 'd': 'Stand in five lost cities in the 30 years before they were abandoned or destroyed.',
         'ids': pick(lambda s: s['k'] == 'c'), 'need': 5, 'mode': 'fall'},
        {'id': 'alive', 'n': 'See them alive', 'd': 'Visit ten lost cities in a year when people still lived there.',
         'ids': pick(lambda s: s['k'] == 'c'), 'need': 10, 'mode': 'alive'},
        {'id': 'ancientwar', 'n': 'Ancient battlefields', 'd': 'Be at ten battles fought before 1 CE, in the year they happened.',
         'ids': pick(lambda s: s['k'] == 'b' and s['s'] < 0), 'need': 10, 'mode': 'found'},
        {'id': 'war', 'n': 'War correspondent', 'd': 'Be at 25 battles anywhere, in the year they were fought.',
         'ids': pick(lambda s: s['k'] == 'b'), 'need': 25, 'mode': 'found'},
    ]
    Q = [q for q in Q if q['ids']]

    # Trails: walk a tour or the turning points of the what-ifs, one stop at a time.
    T = []
    for f in sorted(glob.glob(os.path.join(repo, 'data', 'guide', 'tours', '*.json'))):
        t = json.load(open(f, encoding='utf-8'))
        T.append({'id': t['id'], 'n': t['question'], 'd': 'Walk the guide’s tour, one stop at a time.', 'tour': t['id'],
                  'steps': [{'n': s['title'], 'year': s['year'], **s['view'], 'x': (s.get('text') or '')[:160]} for s in t['steps'] if s.get('view')]})
    turns = []
    for f in sorted(glob.glob(os.path.join(repo, 'data', 'whatif', 'scenarios', '*.json'))):
        w = json.load(open(f, encoding='utf-8'))
        st = [s for s in w.get('steps') or [] if s.get('view')]
        at = next((s for s in st if s.get('branch')), st[-1] if st else None)
        if not at: continue
        turns.append({'n': w['question'], 'year': w['divergence']['year'], **at['view'], 'x': w['divergence'].get('text', '')[:160], 'wi': w['id']})
    if turns:
        T.append({'id': 'turns', 'n': 'Turning points', 'd': 'Stand where and when each what-if splits from real history.', 'steps': sorted(turns, key=lambda s: s['year'])})
    return {'sites': S, 'quests': Q, 'trails': T}
