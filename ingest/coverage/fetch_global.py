#!/usr/bin/env python3
"""People known only through the state they served: Wikidata humans before 1600 with no birth place we can use,
placed by their country of citizenship (P27) or by the seat of an office they held (P39 -> P1001), where that
polity or jurisdiction has coordinates. Catches Maya kings, Kanem mais, Chola officials and the like.

Usage: python3 ingest/coverage/fetch_global.py RAW_DIR   (cache: RAW_DIR/global_<name>.json; QLever endpoint)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wdq

COMMON = '''?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . FILTER(?sl >= 3)
  OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d } OPTIONAL { ?p wdt:P1317 ?fl } OPTIONAL { ?p wdt:P2031 ?ws }
  BIND(YEAR(COALESCE(?b, ?fl, ?ws, ?d)) AS ?y) FILTER(BOUND(?y) && ?y < 1600)
  OPTIONAL { ?p rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "en") }'''
Q = {
    'citizenship': f'''SELECT ?p ?sl ?b ?d ?fl ?ws ?plc ?coord ?label ?desc ?plcLabel WHERE {{
  ?p wdt:P27 ?plc . ?plc wdt:P625 ?coord .
  OPTIONAL {{ ?plc rdfs:label ?plcLabel FILTER(LANG(?plcLabel) = "en") }}
  {COMMON} }}''',
    'office': f'''SELECT ?p ?sl ?b ?d ?fl ?ws ?plc ?coord ?label ?desc ?plcLabel WHERE {{
  ?p wdt:P39 ?pos . ?pos wdt:P1001 ?plc . ?plc wdt:P625 ?coord .
  OPTIONAL {{ ?plc rdfs:label ?plcLabel FILTER(LANG(?plcLabel) = "en") }}
  {COMMON} }}''',
}

if __name__ == '__main__':
    wdq.RAW = sys.argv[1]
    for name, q in Q.items():
        print(name, len(wdq.sparql(q, cache='global_' + name, tries=4, timeout=280)))
