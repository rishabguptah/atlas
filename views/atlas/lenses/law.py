# Rule & law lens data: who governed how, in which years, and the laws that changed it.
# Reads data/law/*.jsonl (built by ingest/law/build_law.py) and places each polity at the centre of its
# Cliopatria borders for the years they cover.
import json, os
from collections import defaultdict


def _rows(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()] if os.path.exists(path) else []


def _centre(geom):
    """Centre of the largest polygon ring, by planar area in degrees (good enough to hang a pin on)."""
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    best, ba = None, -1
    for p in polys:
        ring = p[0]
        a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0
            a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
        if abs(a) > ba and a:
            ba, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return best


def build(repo):
    law = os.path.join(repo, 'data', 'law')
    forms = _rows(os.path.join(law, 'forms.jsonl'))
    fams = [r for r in forms if r['id'].startswith('idea:gov_family:')]
    fam_ix = {r['id']: i for i, r in enumerate(fams)}
    gov_forms = {r['id'].split(':')[-1]: [r['name'], fam_ix[r['family']], r['what']] for r in forms if r['id'].startswith('idea:gov:')}
    policies = {r['id'].split(':')[-1]: r['name'] for r in forms if r['id'].startswith('idea:policy:')}

    names, life, place = {}, {}, {}
    for f in ('states-war/polities.jsonl', 'living-atlas/polities.jsonl', 'order-chaos/polities.jsonl', 'law/forms.jsonl'):
        for r in _rows(os.path.join(repo, 'data', f)):
            if r.get('kind') != 'polity':
                continue
            names.setdefault(r['id'], r.get('name'))
            life.setdefault(r['id'], (r.get('start'), r.get('end')))
            if r.get('lat') is not None:
                place.setdefault(r['id'], [[r.get('start'), round(r['lon'], 2), round(r['lat'], 2)]])

    spans = []
    for r in _rows(os.path.join(law, 'government.jsonl')):
        src = r['sources'][0]
        spans.append([r['from'], r.get('start'), r.get('end'), r['to'].split(':')[-1], 0 if r['basis'] == 'curated' else 1,
                      r.get('note') or '', src.get('url', ''), r.get('wikidata_label', '')])
    lied = {r['of']: r['points'] for r in _rows(os.path.join(law, 'regimes.jsonl'))}
    classes = next((r['classes'] for r in _rows(os.path.join(law, 'regimes.jsonl'))), [])
    seshat = defaultdict(dict)
    for r in _rows(os.path.join(law, 'seshat.jsonl')):
        seshat[r['of']][r['metric']] = r['points']
    used = {s[0] for s in spans} | set(lied)

    # Where to pin each polity: centre of its border polygon in each snapshot, else the Order lab's centre.
    geo = os.path.join(repo, 'data', 'states-war', 'geo', 'borders.geojson')
    if os.path.exists(geo):
        cent = defaultdict(list)
        for f in json.load(open(geo, encoding='utf-8'))['features']:
            pr = f['properties']
            if pr.get('ref') in used and f.get('geometry'):
                c = _centre(f['geometry'])
                if c:
                    cent[pr['ref']].append([pr['from'], round(c[0], 2), round(c[1], 2), pr.get('area_km2') or 0])
        for pid, cs in cent.items():
            byy = {}
            for y, lon, lat, a in cs:  # one point per snapshot start: the biggest piece
                if y not in byy or a > byy[y][3]:
                    byy[y] = [y, lon, lat, a]
            place[pid] = [v[:3] for _, v in sorted(byy.items())]
    lab = os.path.join(repo, 'data', 'order-chaos', 'lab.json')
    if os.path.exists(lab):
        for p in json.load(open(lab))['polities']:
            if p['id'] in used and p['id'] not in place and p.get('c'):
                place[p['id']] = [[p['s'], round(p['c'][1], 2), round(p['c'][0], 2)]]

    pol = {pid: [names.get(pid) or pid.split(':', 1)[1].replace('_', ' '), life.get(pid, (None, None))[0], life.get(pid, (None, None))[1], place.get(pid, [])]
           for pid in sorted(used)}
    laws = []
    for r in _rows(os.path.join(law, 'laws.jsonl')):
        src = r['sources']
        laws.append({'id': r['id'].split(':', 2)[2], 'n': r['name'], 'y': r['start'], 'a': 1 if r.get('start_approx') else 0,
                     'lon': r['lon'], 'lat': r['lat'], 'by': r.get('by'), 'p': r['policy'].split(':')[-1], 'e': r['effect'],
                     'what': r['what'], 'why': r['why'], 'src': [[s['cite'], s.get('url', '')] for s in src],
                     'cur': 1 if r['status'] == 'draft' else 0})
    return {'fams': [[r['id'].split(':')[-1], r['name'], r['color'], r['what']] for r in fams], 'forms': gov_forms,
            'policies': policies, 'pol': pol, 'spans': spans, 'lied': lied, 'classes': classes,
            'seshat': seshat, 'laws': laws}
