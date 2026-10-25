# Travellers in motion: famous journeys, Dutch East India Company ships, the Middle Passage, and who was really
# where (presences). Reads the kernel (dist/kernel.json; run tools/build.py first) for data/travels/ records.
#
#   build(repo)                              itineraries + VOC voyages (the page loads this after the first paint)
#   python3 views/atlas/lenses/travels.py OUT_DIR
#                                            writes OUT_DIR/atlas-files/travels-deep.json: presences (for the
#                                            Contemporaries finder and Here) and SlaveVoyages' trans-Atlantic voyages,
#                                            fetched only when the Middle Passage lens or the finder needs them.
#
# Times are fractional years (1325.45 = mid-June 1325) rounded to 0.01, so the map can move travellers between
# whole years. Places are indexes into one table P = [[name, lon, lat], ...].
import json, os, subprocess, sys

CONF = {'attested': 0, 'estimated': 1, 'approximate': 2, 'unknown': 3}
MODES = ['land', 'river', 'sea', 'caravan', 'rail', 'air', 'road', 'foot', 'horse']
SPRITE = {'person:xuanzang': 'person_monk', 'person:faxian': 'person_monk', 'person:alexander_von_humboldt': 'person_explorer',
          'person:marco_polo': 'person_merchant', 'person:musa_i_of_mali': 'person_ruler', 'person:zheng_he': 'person_sailor',
          'person:ibn_battuta': 'person_pilgrim', 'person:evliya_celebi': 'person_scholar'}
KIND_SPRITE = {'explorer': 'person_explorer', 'naturalist': 'person_explorer', 'envoy': 'person_merchant', 'merchant': 'person_merchant',
               'scholar': 'person_scholar', 'artist': 'person_scholar', 'pilgrim': 'person_pilgrim', 'exile': 'person_pilgrim',
               'missionary': 'person_priest', 'army': 'army'}


def frac(d):
    """'1325-06-14' -> 1325.45; '1325' -> 1325.5 (mid-year when only the year is known)."""
    if not d:
        return None
    neg = d.startswith('-')
    p = d.lstrip('-').split('-')
    y = -int(p[0]) if neg else int(p[0])
    if len(p) == 1:
        return y + 0.5
    m = int(p[1])
    day = int(p[2]) if len(p) > 2 else 15
    return round(y + (m - 1) / 12 + (day - 1) / 365, 3)


def kernel(repo):
    f = os.path.join(repo, 'dist', 'kernel.json')
    if not os.path.exists(f):
        subprocess.run([sys.executable, os.path.join(repo, 'tools', 'build.py')], check=True, stdout=subprocess.DEVNULL)
    return json.load(open(f, encoding='utf-8'))['records']


class Table:
    def __init__(self, places):
        self.places, self.ix, self.rows = places, {}, []

    def __call__(self, ref):
        if isinstance(ref, list):
            key = f'{ref[0]:.2f},{ref[1]:.2f}'
            if key not in self.ix:
                self.ix[key] = len(self.rows)
                self.rows.append(['', round(ref[0], 2), round(ref[1], 2)])
            return self.ix[key]
        if ref not in self.ix:
            p = self.places.get(ref)
            if not p or p.get('lon') is None:
                return -1
            self.ix[ref] = len(self.rows)
            self.rows.append([p['name'], round(p['lon'], 3), round(p['lat'], 3)])
        return self.ix[ref]


def _people(K):
    return {p['id']: p for p in K['person']}


def build(repo):
    K = kernel(repo)
    places = {p['id']: p for p in K['place']}
    people = _people(K)
    P = Table(places)
    src, srcix = [], {}

    def S(lst):
        out = []
        for s in lst or []:
            k = (s.get('cite'), s.get('url'))
            if k not in srcix:
                srcix[k] = len(src)
                src.append(list(k))
            out.append(srcix[k])
        return out

    routes = [r for r in K['route'] if r.get('subtype') == 'journey']
    J, lanes, laneix = [], [], {}
    for r in routes:
        if r['id'].startswith('route:voyage:'):
            continue
        who = people.get(r.get('carrier'), {})
        legs = []
        for g in r['legs']:
            legs.append([P(g['from']), P(g['to']), frac(g.get('start_date')), frac(g.get('end_date')),
                         MODES.index(g.get('mode', 'land')), CONF.get(g.get('conf'), 1), g.get('note') or ''])
        J.append({'id': r['id'], 'n': r['name'], 'who': r.get('carrier'), 'wn': who.get('name') or r.get('carrier'),
                  'w': r.get('what', ''), 's': S(r.get('sources')),
                  'sp': SPRITE.get(r.get('carrier')) or KIND_SPRITE.get((r.get('tags') or [''])[0], 'person_pilgrim'),
                  'st': r.get('status'), 'legs': legs})
    # VOC voyages: columns. A voyage's path is the lanes of its legs; each distinct lane is stored once.
    cols = {k: [] for k in ('t0', 'tc', 't1', 'a', 'c', 'b', 'ship', 'master', 'on', 'died', 'arr', 'out', 'lost', 'das', 'lane')}
    ships, shipix = [], {}
    for r in sorted((r for r in routes if r['id'].startswith('route:voyage:das_')), key=lambda r: r['start']):
        L = r['legs']
        first, last = L[0], L[-1]
        cape = len(L) > 1 and L[0]['to'] == L[1]['from'] and not isinstance(L[0]['to'], list)
        path = []
        for g in L:
            a, b = g['from'], g['to']
            pa = [places[a]['lon'], places[a]['lat']] if isinstance(a, str) else a
            pb = [places[b]['lon'], places[b]['lat']] if isinstance(b, str) else b
            seg = [pa] + (g.get('via') or []) + [pb]
            path += seg if not path else seg[1:]
        key = json.dumps([[round(x, 1) for x in p] for p in path])
        if key not in laneix:
            laneix[key] = len(lanes)
            lanes.append(json.loads(key))
        v = r.get('vessel', {})
        nm = v.get('name', '')
        if nm not in shipix:
            shipix[nm] = len(ships)
            ships.append(nm)
        lost = 'lost' in r.get('tags', [])
        t0 = frac(first.get('start_date'))
        t1 = frac(last.get('end_date')) if not lost else None
        tc = frac(L[0].get('end_date')) if cape else None
        if t0 is None:
            continue
        ppl = r.get('people', {})
        cols['t0'].append(t0)
        cols['tc'].append(tc or 0)
        cols['t1'].append(t1 or 0)
        cols['a'].append(P(first['from']))
        cols['c'].append(P(L[0]['to']) if cape else -1)
        cols['b'].append(P(last['to']) if not lost else -1)
        cols['ship'].append(shipix[nm])
        cols['master'].append(v.get('master', ''))
        cols['on'].append(ppl.get('aboard', 0))
        cols['died'].append(ppl.get('died', ppl.get('died_to_cape', 0)))
        cols['arr'].append(ppl.get('arrived', 0))
        cols['out'].append(1 if 'outward' in r.get('tags', []) else 0)
        cols['lost'].append(1 if lost else 0)
        cols['das'].append(r['id'].rsplit('_', 1)[1])
        cols['lane'].append(laneix[key])
    das_src = S(next((r['sources'] for r in routes if r['id'].startswith('route:voyage:das_')), [{'cite': 'Dutch-Asiatic Shipping'}]))
    # Middle Passage: the region-to-region flows (kernel routes), by decade. Ships come from the sidecar.
    mp = []
    for r in K['route']:
        if r.get('subtype') == 'migration' and 'slave_trade' in (r.get('tags') or []):
            a, b = r['stops']
            mp.append({'id': r['id'], 'n': r['name'], 'a': P(a), 'b': P(b), 'p': r['people'], 'd': r['by_decade']})
    mp_src = S(next((r['sources'] for r in K['route'] if 'slave_trade' in (r.get('tags') or [])), [{'cite': 'SlaveVoyages'}]))
    return {'P': P.rows, 'src': src, 'J': J, 'V': cols, 'ships': ships, 'lanes': lanes, 'das_src': das_src,
            'MP': mp, 'mp_src': mp_src, 'modes': MODES}


def sidecar(repo):
    K = kernel(repo)
    places = {p['id']: p for p in K['place']}
    people = _people(K)
    P = Table(places)
    H, who, whoix, roles, roleix = {k: [] for k in ('p', 'at', 'y0', 'y1', 'r', 'c', 'v')}, [], {}, [], {}
    for r in K['relation']:
        if r.get('type') != 'present_at' or r.get('conf') == 'unknown' or r.get('start') is None:
            continue
        pid = r['from']
        if pid not in whoix:
            p = people.get(pid, {})
            whoix[pid] = len(who)
            who.append([pid, p.get('name') or pid.split(':', 1)[1].replace('_', ' ').title(), p.get('start'), p.get('end'),
                        round(p.get('fame') or 0)])
        at = P(r['to'])
        if at < 0:
            continue
        role = r.get('role') or ''
        if role not in roleix:
            roleix[role] = len(roles)
            roles.append(role)
        H['p'].append(whoix[pid])
        H['at'].append(at)
        H['y0'].append(r['start'])
        H['y1'].append(r.get('end') or r['start'])
        H['r'].append(roleix[role])
        H['c'].append(CONF.get(r.get('conf'), 1))
        H['v'].append(1 if r.get('status') == 'draft' else 0)
    # SlaveVoyages trans-Atlantic voyages (people, not cargo): year, where captives were forced aboard, where survivors
    # were landed, how many of each; the ship and its captain, so a voyage can be named and looked up.
    sv = json.load(open(os.path.join(repo, 'data', 'travels', 'voyages', 'slave.json'), encoding='utf-8'))
    V, ports = sv['voyages'], sv['ports']
    keep = [i for i, s in enumerate(V['set']) if s == 'T' and V['buy'][i] >= 0 and V['land'][i] >= 0]
    SV = {k: [V[k][i] for i in keep] for k in ('id', 'y', 'buy', 'land', 'emb', 'dis', 'resist', 'flag', 'ship', 'captain')}
    return {'P': P.rows, 'who': who, 'roles': roles, 'H': H,
            'SV': SV, 'ports': [[p[1], p[2], p[3], p[5]] for p in ports], 'flags': sv['flags'], 'resist': sv['resist'],
            'sv_src': sv['source'], 'sv_note': sv['note']}


if __name__ == '__main__':
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    out = os.path.join(sys.argv[1], 'atlas-files')
    os.makedirs(out, exist_ok=True)
    f = os.path.join(out, 'travels-deep.json')
    json.dump(sidecar(repo), open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f, os.path.getsize(f))
