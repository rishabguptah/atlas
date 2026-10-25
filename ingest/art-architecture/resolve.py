#!/usr/bin/env python3
"""Pin curated monuments to Wikidata through their English Wikipedia article (one SPARQL query):
QID, coordinates (P625), inception (P571), end (P576). Writes raw/art/resolved.json.
Usage: python3 ingest/art-architecture/resolve.py"""
import json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curated import M, QID
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPARQL = 'https://query.wikidata.org/sparql'
UA = {'User-Agent': 'atlas-ingest/0.1 (history atlas; art-architecture workstream)', 'Accept': 'application/sparql-results+json'}


def sparql(q):
    data = urllib.parse.urlencode({'query': q}).encode()
    for i in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(SPARQL, data=data, headers=UA), timeout=180))['results']['bindings']
        except Exception as e:
            print('retry', e); time.sleep(5 * 2 ** i)
    raise SystemExit('SPARQL failed')


def art_url(t):
    # Wikidata's sitelink IRIs keep commas but percent-encode apostrophes.
    return 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'), safe='()_-:.!,')


if __name__ == '__main__':
    titles = [t for _, t, *_ in M if t]
    vals = ' '.join(f'<{art_url(t)}>' for t in titles)
    rows = sparql(f'''SELECT ?a ?item ?coord ?inc ?end ?lab WHERE {{
      VALUES ?a {{ {vals} }}
      ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
      OPTIONAL {{ ?item wdt:P625 ?coord }} OPTIONAL {{ ?item wdt:P571 ?inc }} OPTIONAL {{ ?item wdt:P576 ?end }}
      OPTIONAL {{ ?item rdfs:label ?lab FILTER(lang(?lab)="en") }} }}''')
    by = {}
    for r in rows:
        u = r['a']['value']; d = by.setdefault(u, {'qid': r['item']['value'].rsplit('/', 1)[1], 'url': u, 'label': r.get('lab', {}).get('value')})
        if 'coord' in r and 'coord' not in d:
            lon, lat = map(float, r['coord']['value'][6:-1].split())
            d['coord'] = [round(lat, 4), round(lon, 4)]
        for k in ('inc', 'end'):
            if k in r: d.setdefault(k, r[k]['value'])
    out = {t: by.get(art_url(t)) for t in titles}
    ids = ' '.join('wd:' + q for t, q in QID.items() if not out.get(t))
    if ids:
        for r in sparql(f'''SELECT ?item ?coord ?inc ?end ?a WHERE {{ VALUES ?item {{ {ids} }}
          OPTIONAL {{ ?item wdt:P625 ?coord }} OPTIONAL {{ ?item wdt:P571 ?inc }} OPTIONAL {{ ?item wdt:P576 ?end }}
          OPTIONAL {{ ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }} }}'''):
            q = r['item']['value'].rsplit('/', 1)[1]; t = next(t for t, v in QID.items() if v == q)
            d = out[t] = out.get(t) or {'qid': q, 'url': r.get('a', {}).get('value') or art_url(t)}
            if 'coord' in r and 'coord' not in d:
                lon, lat = map(float, r['coord']['value'][6:-1].split()); d['coord'] = [round(lat, 4), round(lon, 4)]
            for k in ('inc', 'end'):
                if k in r: d.setdefault(k, r[k]['value'])
    json.dump(out, open(os.path.join(ROOT, 'raw/art/resolved.json'), 'w'), indent=0, ensure_ascii=False)
    print(len([v for v in out.values() if v]), 'of', len(titles), 'resolved')
    print('missing:', [t for t, v in out.items() if not v])
    print('no coordinates:', [t for t, v in out.items() if v and 'coord' not in v])
