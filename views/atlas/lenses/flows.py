# Flows for the data grammar (views/atlas/VIZ.md): every migration and trade route in the economy-trade kernel records,
# with its line, its span and, where the sources give one, how many people moved ([low, high]).
# No .js beside it: the page's Trade & migration layer reads LENS_DATA.flows and draws them as Minard ribbons.
import json, os


def build(repo):
    d = os.path.join(repo, 'data/economy-trade')
    rows = [json.loads(l) for l in open(os.path.join(d, 'routes.jsonl')) if l.strip()]
    geo = json.load(open(os.path.join(d, 'geo/routes.geojson')))
    lines = {}
    for f in geo['features']:
        g = f['geometry']
        cs = g['coordinates'] if g['type'] == 'LineString' else [p for part in g['coordinates'] for p in part]
        pts = []
        for x, y in cs:
            q = [round(x, 2), round(y, 2)]
            if not pts or pts[-1] != q:
                pts.append(q)
        lines[f['properties']['ref']] = pts
    names = {}
    for f in ('places.jsonl', 'groups.jsonl'):
        p = os.path.join(d, f)
        if os.path.exists(p):
            for l in open(p):
                if l.strip():
                    r = json.loads(l)
                    names[r['id']] = r.get('name')
    out = []
    for r in rows:
        if r['id'] not in lines or len(lines[r['id']]) < 2 or r.get('start') is None:
            continue
        o = {'id': r['id'], 'n': r['name'], 'k': 'm' if r['subtype'] == 'migration' else 't', 's': r['start'], 'e': r.get('end'),
             'line': lines[r['id']], 'why': r.get('why') or r.get('what') or '',
             'src': [{'c': s.get('cite'), 'u': s.get('url')} if s.get('url') else {'c': s.get('cite')} for s in (r.get('sources') or [])[:2]]}
        if r.get('start_approx') or r.get('end_approx'):
            o['ap'] = 1
        if r.get('status') == 'draft':
            o['dr'] = 1
        if r.get('people'):
            o['p'] = r['people']
        if r.get('forced'):
            o['f'] = 1
        if r.get('goods'):
            o['g'] = r['goods'][:6]
        if r.get('group'):
            o['grp'] = names.get(r['group']) or r['group'].split(':', 1)[1].replace('_', ' ')
        st = [names.get(x) for x in r.get('stops') or []]
        if any(st):
            o['st'] = [x for x in st if x][:8]
        out.append(o)
    return {'flows': out}
