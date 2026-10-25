# Epidemics: data for the one-page Atlas, read straight from data/disease-climate/.
# Plague returns (15k geocoded outbreaks 1347-1900, Biraben and Sticker), the cholera (1826-1832) and smallpox (1518-1528)
# spreads city by city, and the Wikidata epidemics. The Black Death itself is drawn by the page's built-in disease layer.
import json, os

SPREADS = {'event:cholera_1826': 'route:cholera_1826_spread', 'event:smallpox_aztec': 'route:smallpox_americas_spread'}
OUTBREAK_SRC = [
    ['Krauer, F. and Schmid, B. V. (2022). Mapping the plague through natural language processing. Epidemics 41. Data v1.0, digitised from Biraben (1975).', 'https://doi.org/10.5281/zenodo.6587267'],
    ['Krauer, F. and Schmid, B. V. (2022). Mapping the plague through natural language processing. Epidemics 41. Data v1.0, digitised from Sticker (1908).', 'https://doi.org/10.5281/zenodo.6587267'],
]


def build(repo):
    d = os.path.join(repo, 'data', 'disease-climate')
    rows = lambda f: [json.loads(l) for l in open(os.path.join(d, f), encoding='utf-8') if l.strip()] if os.path.exists(os.path.join(d, f)) else []
    src = []  # shared source list; records point at indexes
    def S(lst):
        out = []
        for s in lst or []:
            k = [s.get('cite'), s.get('url')]
            if k not in src:
                src.append(k)
            out.append(src.index(k))
        return out
    r2 = lambda x: round(x, 2)

    # Outbreaks: [lon, lat, year, name index, 0 Biraben | 1 Sticker], one row per place and year (Biraben wins a tie).
    names, nid, seen, ob = [], {}, set(), []
    gp = os.path.join(d, 'geo', 'plague_outbreaks.geojson')
    feats = json.load(open(gp, encoding='utf-8'))['features'] if os.path.exists(gp) else []
    for f in sorted(feats, key=lambda f: (f['properties']['src'] != 'biraben', f['properties']['year'])):
        p = f['properties']
        if (p['name'], p['year']) in seen:
            continue
        seen.add((p['name'], p['year']))
        if p['name'] not in nid:
            nid[p['name']] = len(names); names.append(p['name'])
        lon, lat = f['geometry']['coordinates']
        ob.append([r2(lon), r2(lat), p['year'], nid[p['name']], 0 if p['src'] == 'biraben' else 1])
    ob.sort(key=lambda r: r[2])

    # Spreads: each stop is where the disease arrived, when, from where and how.
    ev = {r['id']: r for r in rows('events.jsonl')}
    places = {r['id']: r for r in rows('places.jsonl')}
    rels = [r for r in rows('relations.jsonl') if r['type'] == 'spread_to']
    routes = {r['id']: r for r in rows('routes.jsonl')}
    gr = os.path.join(d, 'geo', 'spread_routes.geojson')
    lines = json.load(open(gr, encoding='utf-8'))['features'] if os.path.exists(gr) else []
    spreads = []
    for eid, rid in SPREADS.items():
        if eid not in ev:
            continue
        e = ev[eid]
        st = sorted((r for r in rels if r['from'] == eid and r['to'] in places), key=lambda r: (r['start'], r.get('month') or 0))
        idx = {r['to']: i for i, r in enumerate(st)}
        route = routes.get(rid)
        stops = []
        for r in st:
            p = places[r['to']]
            stops.append([p['name'], r2(p['lon']), r2(p['lat']), r['start'], r.get('month') or 0, r.get('mode') or '',
                          idx.get(r.get('via'), -1), r.get('note') or '', S(r.get('sources'))])
        legs = [[idx[f['properties']['to']], [[r2(x), r2(y)] for x, y in f['geometry']['coordinates']]]
                for f in lines if route and f['properties']['ref'] == route['id'] and f['properties']['to'] in idx]
        spreads.append({'id': eid, 'n': (route or e)['name'], 's': e['start'], 'e': e.get('end') or e['start'],
                        'what': (route or {}).get('what') or e.get('what') or '', 'why': (route or {}).get('why') or e.get('why') or '',
                        'src': S(e.get('sources')), 'stops': stops, 'legs': legs})

    # Wikidata epidemics with a date and a place: [name, start, end, lat, lon, deaths low, deaths high, wikidata id, source].
    epi = []
    for r in rows('bulk_wikidata.jsonl'):
        if r['subtype'] != 'epidemic' or r.get('lat') is None:
            continue
        dl, dh = (r.get('deaths') or [None, None])
        epi.append([r['name'], r['start'], r.get('end') or r['start'], r2(r['lat']), r2(r['lon']), dl, dh, r.get('wikidata') or '', S(r['sources'])[0]])
    return {'names': names, 'ob': ob, 'obsrc': OUTBREAK_SRC, 'spreads': spreads, 'epi': epi, 'src': src}


if __name__ == '__main__':
    import sys
    out = build(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
    print({k: len(v) for k, v in out.items()}, len(json.dumps(out, separators=(',', ':'), ensure_ascii=False)), file=sys.stderr)
