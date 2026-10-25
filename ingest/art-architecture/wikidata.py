#!/usr/bin/env python3
"""Pull notable buildings with an architectural style (P149) that maps to one of our styles.
Writes raw/art/wikidata_buildings.json. Usage: python3 ingest/art-architecture/wikidata.py [MIN_SITELINKS]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curated import STYLES
from resolve import sparql, ROOT

MIN = int(sys.argv[1]) if len(sys.argv) > 1 else 12
qids = sorted({q for s in STYLES.values() for q in s['wd']})
q = f'''SELECT ?b ?bLabel ?style ?coord ?inc ?end ?sl ?a ?cLabel WHERE {{
  VALUES ?style {{ {' '.join('wd:' + x for x in qids)} }}
  ?b wdt:P149 ?style ; wdt:P625 ?coord ; wikibase:sitelinks ?sl . FILTER(?sl >= {MIN})
  OPTIONAL {{ ?b wdt:P571 ?inc }} OPTIONAL {{ ?b wdt:P576 ?end }}
  OPTIONAL {{ ?a schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?b rdfs:label ?bLabel FILTER(lang(?bLabel) = "en") }}
  OPTIONAL {{ ?b wdt:P17 ?c . ?c rdfs:label ?cLabel FILTER(lang(?cLabel) = "en") }}
}}'''
rows = sparql(q)
os.makedirs(os.path.join(ROOT, 'raw/art'), exist_ok=True)
json.dump({'query': q, 'rows': rows}, open(os.path.join(ROOT, 'raw/art/wikidata_buildings.json'), 'w'))
print(len(rows), 'rows,', len({r['b']['value'] for r in rows}), 'buildings')
