# Living world: travellers on the move, who meets whom, stories of the road (views/atlas/world/agents.js, L3 in WORLD.md).
# build(repo) is LENS_DATA.living: documented journeys (data/world/journeys/*.json), recurring travel systems that
# generated travellers come from (data/world/flows.json, plus the trade routes in data/economy-trade/routes.jsonl as
# low-rate systems), names by culture and era (data/world/names.json) and documented meetings (data/world/meetings.json).
# Over 40 KB, so the page build puts it in atlas-files/lens-living.json, loaded after the first paint.
import json, os, glob


def _load(p, default):
    try:
        return json.load(open(p, encoding='utf-8'))
    except (OSError, ValueError):
        return default


def _r(v, n=2):
    return round(v, n) if isinstance(v, (int, float)) else v


def _src(s):
    return [{k: x[k] for k in ('cite', 'url') if x.get(k)} for x in (s or []) if isinstance(x, dict) and x.get('cite')][:3]


def build(repo):
    d = os.path.join(repo, 'data', 'world')
    journeys = []
    for f in sorted(glob.glob(os.path.join(d, 'journeys', '*.json'))):
        j = _load(f, None)
        if not j or not j.get('stops'):
            continue
        journeys.append({
            'id': j['id'], 'name': j['name'], 'person': j.get('person'), 'kind': j.get('kind', 'traveller'), 'summary': j.get('summary', ''),
            'stops': [{k: (_r(s[k]) if k in ('lon', 'lat') else s[k]) for k in ('place', 'lon', 'lat', 'date', 'until', 'mode', 'note', 'conf', 'via') if s.get(k) is not None}
                      for s in j['stops'] if s.get('lon') is not None and s.get('lat') is not None],
            'sources': _src(j.get('sources')), 'status': j.get('status', 'draft')})
    flows = []
    for f in (_load(os.path.join(d, 'flows.json'), {}) or {}).get('flows', []):
        if not f.get('stops') or f.get('start') is None:
            continue
        keep = {k: f[k] for k in ('id', 'name', 'kind', 'role', 'sprite', 'mode', 'start', 'end', 'depart', 'return', 'return_months', 'per_year', 'party', 'days',
                                   'days_range', 'goods_out', 'goods_back', 'culture', 'note', 'conf') if f.get(k) is not None}
        keep['stops'] = [{'name': s['name'], 'lon': _r(s['lon']), 'lat': _r(s['lat'])} for s in f['stops'] if s.get('lon') is not None]
        keep['sources'] = _src(f.get('sources'))
        flows.append(keep)
    # Trade routes from the economy workstream: a few merchant groups a year along their stops, approximate.
    places = {}
    for p in glob.glob(os.path.join(repo, 'data', '*', 'places.jsonl')):
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            if r.get('lat') is not None and r['id'] not in places:
                places[r['id']] = r
    covered = {f.get('route') for f in flows}
    p = os.path.join(repo, 'data', 'economy-trade', 'routes.jsonl')
    for l in (open(p, encoding='utf-8') if os.path.exists(p) else []):
        r = json.loads(l)
        if r.get('subtype') != 'trade' or 'relay' in (r.get('tags') or []) or r['id'] in covered:
            continue
        st = [places[s] for s in r.get('stops') or [] if isinstance(s, str) and s in places]
        if len(st) < 2:
            continue
        nm = r['name']
        sea = any(w in nm.lower() for w in ('sea', 'monsoon', 'galleon', 'cape', 'spice', 'triangular', 'opium', 'cotton', 'suez', 'panama', 'container', 'tin', 'grain', 'baltic', 'swahili', 'hansa'))
        flows.append({'id': 'auto_' + r['id'].split(':', 1)[1], 'name': nm, 'kind': 'ship' if sea else 'caravan', 'role': 'merchant', 'mode': 'mixed' if sea else 'land',
                      'start': r['start'], 'end': r.get('end') or 2025, 'per_year': 2, 'party': 25, 'goods_out': r.get('goods') or [], 'return': True,
                      'stops': [{'name': s['name'], 'lon': _r(s['lon']), 'lat': _r(s['lat'])} for s in st],
                      'note': (r.get('why') or r.get('what') or '')[:200], 'conf': 'approximate', 'auto': True,
                      'sources': _src(r.get('sources')) or [{'cite': 'Atlas trade route ' + r['id']}]})
    names = _load(os.path.join(d, 'names.json'), {'cultures': []})
    cultures = [{k: c[k] for k in ('id', 'name', 'start', 'end', 'regions', 'male', 'female', 'family', 'bynames', 'pattern') if c.get(k) is not None} for c in names.get('cultures', [])]
    meetings = []
    for m in _load(os.path.join(d, 'meetings.json'), []) or []:
        if m.get('lon') is None or not m.get('date'):
            continue
        meetings.append({k: (_r(m[k]) if k in ('lon', 'lat') else m[k]) for k in ('id', 'a', 'b', 'a_person', 'b_person', 'date', 'date_approx', 'place', 'lon', 'lat', 'what', 'why', 'conf') if m.get(k) is not None})
        meetings[-1]['sources'] = _src(m.get('sources'))
    return {'journeys': journeys, 'flows': flows, 'names': {'cultures': cultures}, 'meetings': meetings}


if __name__ == '__main__':
    import sys
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    d = build(repo)
    print({k: len(v) if isinstance(v, list) else len(v.get('cultures', [])) for k, v in d.items()}, len(json.dumps(d)), file=sys.stderr)
