#!/usr/bin/env python3
"""Dated, located Wikidata items (not people) in every country outside Europe, before 1850.

Usage: python3 ingest/coverage/fetch_things.py RAW_DIR
Per modern country: items with coordinates (P625), country (P17), a first year from inception (P571),
start (P580), point in time (P585) or earliest date (P1319), 4+ sitelinks, not a human. Keeps the first
instance-of class label so the build can sort sites, settlements, buildings and events.
Splits by era when the endpoint times out. Cache: RAW_DIR/things/<QID>.json; thin regions again at 2+ sitelinks in things2/.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wdq

ERAS = [(-10000, 0), (0, 800), (800, 1300), (1300, 1600), (1600, 1850)]


def query(country, era, minsl=4):
    return f'''SELECT ?i ?sl ?y ?coord ?label ?desc (SAMPLE(?cl) AS ?cls) (SAMPLE(?ey) AS ?end) WHERE {{
  ?i wdt:P17 wd:{country} ; wdt:P625 ?coord ; wikibase:sitelinks ?sl . FILTER(?sl >= {minsl})
  OPTIONAL {{ ?i wdt:P571 ?a }} OPTIONAL {{ ?i wdt:P580 ?b }} OPTIONAL {{ ?i wdt:P585 ?c }} OPTIONAL {{ ?i wdt:P1319 ?d }}
  BIND(YEAR(COALESCE(?a, ?b, ?c, ?d)) AS ?y) FILTER(BOUND(?y) && ?y >= {era[0]} && ?y < {era[1]})
  FILTER NOT EXISTS {{ ?i wdt:P31 wd:Q5 }}
  OPTIONAL {{ ?i wdt:P31 ?c31 . ?c31 rdfs:label ?cl FILTER(LANG(?cl) = "en") }}
  OPTIONAL {{ ?i wdt:P576 ?e1 }} OPTIONAL {{ ?i wdt:P582 ?e2 }} BIND(YEAR(COALESCE(?e1, ?e2)) AS ?ey)
  OPTIONAL {{ ?i rdfs:label ?label FILTER(LANG(?label) = "en") }}
  OPTIONAL {{ ?i schema:description ?desc FILTER(LANG(?desc) = "en") }}
}} GROUP BY ?i ?sl ?y ?coord ?label ?desc'''


def fetch(country, minsl=4, sub='things'):
    out = os.path.join(wdq.RAW, sub, country + '.json')
    if os.path.exists(out):
        return country, len(json.load(open(out)))
    try:
        rows = wdq.sparql(query(country, (-10000, 1850), minsl), tries=2, timeout=200)
    except Exception:
        rows = []
        for era in ERAS:
            try:
                rows += wdq.sparql(query(country, era, minsl), tries=3, timeout=250)
            except Exception as e:
                print('  gave up', country, era, e)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(rows, open(out, 'w'), ensure_ascii=False)
    return country, len(rows)


def main(raw):
    wdq.RAW = raw
    feats = json.load(open(os.path.join(raw, 'ne_50m_admin_0_countries.geojson')))['features']
    cs = sorted({f['properties']['WIKIDATAID'] for f in feats
                 if f['properties'].get('WIKIDATAID') and (f['properties']['REGION_UN'] != 'Europe' or f['properties']['ADM0_A3'] in ('RUS', 'TUR', 'CYP'))})
    with ThreadPoolExecutor(2) as ex:
        for c, n in ex.map(fetch, cs):
            print(c, n, flush=True)
    # The thin regions (Africa south of the Sahara, the Americas, Oceania, South and Southeast Asia) again at 2+ sitelinks:
    # Wikipedia covers them in fewer languages, so the global bar misses most of what is known there.
    thin = sorted({f['properties']['WIKIDATAID'] for f in feats if f['properties'].get('WIKIDATAID') and (
        f['properties']['REGION_UN'] in ('Americas', 'Oceania') or (f['properties']['REGION_UN'] == 'Africa' and f['properties']['SUBREGION'] != 'Northern Africa')
        or f['properties']['SUBREGION'] in ('Southern Asia', 'South-Eastern Asia')) and f['properties']['ADM0_A3'] not in ('USA', 'CAN')})
    with ThreadPoolExecutor(2) as ex:
        for c, n in ex.map(lambda c: fetch(c, 2, 'things2'), thin):
            print('thin', c, n, flush=True)


if __name__ == '__main__':
    main(sys.argv[1])
