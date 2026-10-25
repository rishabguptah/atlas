#!/usr/bin/env python3
"""Fetch the Wikidata facts that place people somewhere for a while.

Usage: python3 ingest/travels/fetch_wikidata.py [RAW_DIR]     (default /mnt/project-files/atlas/raw/travels)

Reads every person with a wikidata id from dist/kernel.json (run tools/build.py first) and writes, in RAW_DIR:
  wd_stays.json    residence P551, work location P937, educated at P69, employer P108, position held P39
                   (with its location / jurisdiction qualifiers), burial P119, each with start/end/point-in-time
  wd_battles.json  conflicts the person took part in (P607) with the battle's date and place
  wd_coords.json   coordinates for every item above, with fallbacks: P625, headquarters P159, location P276,
                   located in P131, and for offices the capital (P36) of the jurisdiction (P1001)
Fetched people are kept in RAW_DIR/wd_by_person.json and placed items in wd_coords.json, so a rerun only asks\nfor new people and new places (raw query results are also cached in RAW_DIR/cache/).
"""
import json, os, sys, time, hashlib, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/atlas/raw/travels'
WDQS = 'https://query.wikidata.org/sparql'
UA = 'HistoryAtlas/0.5 (research; https://github.com/rishabguptah/atlas)'
CACHE = os.path.join(RAW, 'cache')


def sparql(q):
    key = hashlib.sha1(q.encode()).hexdigest()[:16]
    path = os.path.join(CACHE, key + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    body = urllib.parse.urlencode({'query': q}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(WDQS, data=body, headers={
                'Accept': 'application/sparql-results+json', 'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded'})
            rows = json.load(urllib.request.urlopen(req, timeout=120))['results']['bindings']
            out = [{k: v['value'] for k, v in r.items()} for r in rows]
            json.dump(out, open(path, 'w'))
            return out
        except Exception as e:  # 429 / 5xx / timeout: back off
            wait = 5 * 2 ** attempt
            print(f'  retry in {wait}s ({e})', file=sys.stderr)
            time.sleep(wait)
    raise SystemExit('Wikidata kept failing')


def q(v):
    return v.rsplit('/', 1)[-1] if v else None


STAYS = """SELECT ?p ?prop ?x ?xl ?s ?e ?pit ?loc ?jur WHERE {
  VALUES ?p { %s }
  VALUES ?prop { p:P551 p:P937 p:P69 p:P108 p:P39 p:P119 }
  ?p ?prop ?st . ?st ?ps ?x . ?propE wikibase:claim ?prop ; wikibase:statementProperty ?ps .
  OPTIONAL { ?x rdfs:label ?xl FILTER(lang(?xl) = "en") }
  OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } OPTIONAL { ?st pq:P585 ?pit }
  OPTIONAL { ?st pq:P276 ?loc } OPTIONAL { ?st pq:P1001 ?jur }
}"""

BATTLES = """SELECT ?p ?b ?bl ?d ?s ?e ?loc WHERE {
  VALUES ?p { %s }
  ?p wdt:P607 ?b .
  OPTIONAL { ?b rdfs:label ?bl FILTER(lang(?bl) = "en") }
  OPTIONAL { ?b wdt:P585 ?d } OPTIONAL { ?b wdt:P580 ?s } OPTIONAL { ?b wdt:P582 ?e }
  OPTIONAL { ?b wdt:P276 ?loc }
}"""

COORDS = """SELECT ?x ?xl ?c ?hq ?lo ?in ?cap WHERE {
  VALUES ?x { %s }
  OPTIONAL { ?x rdfs:label ?xl FILTER(lang(?xl) = "en") }
  OPTIONAL { ?x wdt:P625 ?c }
  OPTIONAL { ?x wdt:P159/wdt:P625 ?hq }
  OPTIONAL { ?x wdt:P276/wdt:P625 ?lo }
  OPTIONAL { ?x wdt:P131/wdt:P625 ?in }
  OPTIONAL { ?x wdt:P1001/wdt:P36/wdt:P625 ?cap }
}"""


def batched(ids, n):
    ids = sorted(ids)
    for i in range(0, len(ids), n):
        yield ids[i:i + n]


def main():
    os.makedirs(CACHE, exist_ok=True)
    kernel = json.load(open(os.path.join(ROOT, 'dist', 'kernel.json')))['records']
    people = sorted({p['wikidata'] for p in kernel['person'] if p.get('wikidata')})
    print(f'{len(people)} people with wikidata ids')
    # Per-person store, so adding people only asks for the new ones (batch caches shift when the list changes).
    store_path = os.path.join(RAW, 'wd_by_person.json')
    store = json.load(open(store_path)) if os.path.exists(store_path) else {}
    if not store and os.path.exists(os.path.join(RAW, 'wd_stays.json')):
        for kind, f in (('stays', 'wd_stays.json'), ('battles', 'wd_battles.json')):
            for r in json.load(open(os.path.join(RAW, f))):
                store.setdefault(q(r['p']), {'stays': [], 'battles': []})[kind].append(r)
    todo = [x for x in people if x not in store]
    print(f'{len(todo)} not fetched yet')
    for i, b in enumerate(batched(todo, 80)):
        vals = ' '.join('wd:' + x for x in b)
        for x in b:
            store[x] = {'stays': [], 'battles': []}
        for kind, tpl in (('stays', STAYS), ('battles', BATTLES)):
            for r in sparql(tpl % vals):
                store[q(r['p'])][kind].append(r)
        if i % 10 == 0:
            print(f'  people {i * 80}/{len(todo)}')
            json.dump(store, open(store_path, 'w'))
    json.dump(store, open(store_path, 'w'))
    stays = [r for x in people for r in store[x]['stays']]
    battles = [r for x in people for r in store[x]['battles']]
    for r in stays:
        r['prop'] = q(r['prop'])
    items = set()
    for r in stays:
        items.update(q(r.get(f)) for f in ('x', 'loc', 'jur') if r.get(f))
    for r in battles:
        items.update(q(r.get(f)) for f in ('b', 'loc') if r.get(f))
    items = {x for x in items if x and x.startswith('Q')}
    cpath = os.path.join(RAW, 'wd_coords.json')
    coords = json.load(open(cpath)) if os.path.exists(cpath) else {}
    items -= set(coords)
    print(f'{len(items)} new items to place')
    for i, b in enumerate(batched(items, 150)):
        for x in b:
            coords.setdefault(x, {'label': None})
        for r in sparql(COORDS % ' '.join('wd:' + x for x in b)):
            c = coords.setdefault(q(r['x']), {'label': r.get('xl')})
            c['label'] = c.get('label') or r.get('xl')
            for f in ('c', 'hq', 'lo', 'in', 'cap'):
                if r.get(f) and f not in c:
                    c[f] = r[f]
        if i % 20 == 0:
            print(f'  items {i * 150}/{len(items)}')
    json.dump(stays, open(os.path.join(RAW, 'wd_stays.json'), 'w'))
    json.dump(battles, open(os.path.join(RAW, 'wd_battles.json'), 'w'))
    json.dump(coords, open(os.path.join(RAW, 'wd_coords.json'), 'w'))
    with open(os.path.join(RAW, 'README.md'), 'w') as f:
        f.write('# Wikidata presences for Atlas people\n\nFetched %s by ingest/travels/fetch_wikidata.py from '
                'query.wikidata.org (CC0). wd_stays.json: P551/P937/P69/P108/P39/P119 with qualifiers; '
                'wd_battles.json: P607 conflicts; wd_coords.json: coordinates with fallbacks.\n' % time.strftime('%Y-%m-%d'))
    print(f'wrote {len(stays)} stays, {len(battles)} battles, {len(coords)} placed items')


if __name__ == '__main__':
    main()
