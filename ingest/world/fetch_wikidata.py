#!/usr/bin/env python3
"""Pull dated places and relationships for the Atlas's people from Wikidata (CC0).

For every person in data/places-people/people.jsonl with a wikidata id: residences (P551), work locations (P937),
educated at (P69), positions held (P39, with jurisdiction/location), burial (P119), plus who they were
students/teachers of (P1066/P802), spouses (P26), influences (P737) and documented acquaintances (P3342).
Writes OUT_DIR/wd_places.json and OUT_DIR/wd_links.json.  Usage: fetch_wikidata.py OUT_DIR
"""
import json, os, sys, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EP = 'https://query.wikidata.org/sparql'
UA = 'AtlasHistoryBuild/0.1 (research; contact via github.com/rishabguptah/atlas)'

def q(sparql, tries=5):
    data = urllib.parse.urlencode({'query': sparql, 'format': 'json'}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EP, data=data, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)['results']['bindings']
        except Exception as e:
            print('retry', i, e, file=sys.stderr); time.sleep(5 * (i + 1))
    return []


def places_query(ids):
    vals = ' '.join('wd:' + i for i in ids)
    return f"""SELECT ?p ?prop ?place ?placeLabel ?coord ?s ?e ?pit ?loc ?locLabel ?locCoord WHERE {{
 VALUES ?p {{ {vals} }}
 VALUES (?prop ?ps) {{ (p:P551 ps:P551) (p:P937 ps:P937) (p:P69 ps:P69) (p:P39 ps:P39) (p:P119 ps:P119) (p:P108 ps:P108) }}
 ?p ?prop ?st . ?st ?ps ?place .
 OPTIONAL {{ ?place wdt:P625 ?coord }}
 OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }} OPTIONAL {{ ?st pq:P585 ?pit }}
 OPTIONAL {{ ?st pq:P1001|pq:P276 ?loc . OPTIONAL {{ ?loc wdt:P625 ?locCoord }} OPTIONAL {{ ?loc rdfs:label ?locLabel FILTER(lang(?locLabel)='en') }} }}
 OPTIONAL {{ ?place rdfs:label ?placeLabel FILTER(lang(?placeLabel)='en') }}
}}"""

def links_query(ids):
    vals = ' '.join('wd:' + i for i in ids)
    return f"""SELECT ?p ?rel ?o ?s ?e WHERE {{
 VALUES ?p {{ {vals} }}
 VALUES (?rel ?pr ?ps) {{ (\"student_of\" p:P1066 ps:P1066) (\"teacher_of\" p:P802 ps:P802) (\"spouse\" p:P26 ps:P26)
   (\"influenced_by\" p:P737 ps:P737) (\"knew\" p:P3342 ps:P3342) (\"father\" p:P22 ps:P22) (\"mother\" p:P25 ps:P25) (\"sibling\" p:P3373 ps:P3373) (\"child\" p:P40 ps:P40) }}
 ?p ?pr ?st . ?st ?ps ?o .
 OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }}
}}"""

def v(b, k):
    return b[k]['value'] if k in b else None

def main(out):
    people = [json.loads(l) for l in open(os.path.join(ROOT, 'data/places-people/people.jsonl'))]
    ids = [p['wikidata'] for p in people if p.get('wikidata')]
    P, L = [], []
    for i in range(0, len(ids), 80):
        chunk = ids[i:i + 80]
        rows = q(places_query(chunk))
        for b in rows:
            P.append({k: v(b, k) for k in ('p', 'prop', 'place', 'placeLabel', 'coord', 's', 'e', 'pit', 'loc', 'locLabel', 'locCoord')})
        rows = q(links_query(chunk))
        for b in rows:
            L.append({k: v(b, k) for k in ('p', 'rel', 'o', 's', 'e')})
        print(i, len(P), len(L), file=sys.stderr)
        time.sleep(1)
    json.dump(P, open(os.path.join(out, 'wd_places.json'), 'w'))
    json.dump(L, open(os.path.join(out, 'wd_links.json'), 'w'))

if __name__ == '__main__':
    main(sys.argv[1])
