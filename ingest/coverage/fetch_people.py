#!/usr/bin/env python3
"""Wikidata people tied to places outside Europe, before 1900 (birth, death, residence or work place).

Usage: python3 ingest/coverage/fetch_people.py RAW_DIR      (RAW_DIR = /mnt/project-files/atlas/raw/coverage)
Four queries per modern country (one per property) (Natural Earth WIKIDATAID), every person with 3+ Wikipedia sitelinks whose
P19 / P20 / P551 / P937 place lies in it and whose first known year (birth, floruit, work start, death) is before 1900.
Splits a property by era when the endpoint times out. Results cached in RAW_DIR/people/<QID>*.json.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wdq

PROPS = ['P19', 'P20', 'P551', 'P937']
ERAS = [(-5000, 500), (500, 1200), (1200, 1600), (1600, 1800), (1800, 1900)]


def query(country, props, era):
    prop = props[0]
    return f'''SELECT ?p ?sl ?b ?d ?fl ?ws ?prop ?plc ?coord ?label ?desc WHERE {{
  ?plc wdt:P17 wd:{country} .
  BIND(wdt:{prop} AS ?prop)
  ?p wdt:{prop} ?plc . ?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . FILTER(?sl >= 3)
  OPTIONAL {{ ?p wdt:P569 ?b }} OPTIONAL {{ ?p wdt:P570 ?d }} OPTIONAL {{ ?p wdt:P1317 ?fl }} OPTIONAL {{ ?p wdt:P2031 ?ws }}
  BIND(YEAR(COALESCE(?b, ?fl, ?ws, ?d)) AS ?y) FILTER(BOUND(?y) && ?y >= {era[0]} && ?y < {era[1]})
  ?plc wdt:P625 ?coord .
  OPTIONAL {{ ?p rdfs:label ?label FILTER(LANG(?label) = "en") }}
  OPTIONAL {{ ?p schema:description ?desc FILTER(LANG(?desc) = "en") }}
}}'''


def fetch(country):
    out = os.path.join(wdq.RAW, 'people', country + '.json')
    if os.path.exists(out):
        return country, len(json.load(open(out)))
    rows = []
    for p in PROPS:
        try:
            rows += wdq.sparql(query(country, [p], (-5000, 1900)), tries=2, timeout=200)
        except Exception:
            for era in ERAS:
                try:
                    rows += wdq.sparql(query(country, [p], era), tries=3, timeout=200)
                except Exception as e:
                    print('  gave up', country, p, era, e)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(rows, open(out, 'w'), ensure_ascii=False)
    return country, len(rows)


def main(raw):
    wdq.RAW = raw
    feats = json.load(open(os.path.join(raw, 'ne_50m_admin_0_countries.geojson')))['features']
    cs = sorted({f['properties']['WIKIDATAID'] for f in feats
                 if f['properties'].get('WIKIDATAID') and (f['properties']['REGION_UN'] != 'Europe' or f['properties']['ADM0_A3'] in ('RUS', 'TUR', 'CYP'))})
    print(len(cs), 'countries')
    with ThreadPoolExecutor(4) as ex:
        for c, n in ex.map(fetch, cs):
            print(c, n, flush=True)


if __name__ == '__main__':
    main(sys.argv[1])
