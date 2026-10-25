# Tiny Wikidata SPARQL client with retries and a file cache (copy of ingest/europe-19c/wdq.py, caching in raw/coverage).
import json, os, time, urllib.request, urllib.parse

UA = 'AtlasHistoryBot/0.1 (private history map; https://github.com/rishabguptah/atlas)'
RAW = os.environ.get('ATLAS_RAW', '/mnt/project-files/atlas/raw') + '/coverage'


PREFIXES = '''PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
'''
# QLever answers the big joins (every person born in China) that time out on query.wikidata.org.
ENDPOINT = os.environ.get('ATLAS_SPARQL', 'https://qlever.dev/api/wikidata')


def sparql(q, cache=None, tries=5, timeout=300):
    """Run a query and return the bindings as plain dicts {var: value}. Cached under RAW/<cache>.json."""
    path = os.path.join(RAW, cache + '.json') if cache else None
    if path and os.path.exists(path):
        return json.load(open(path))
    if 'qlever' in ENDPOINT and 'PREFIX wd:' not in q:
        q = PREFIXES + q
    body = urllib.parse.urlencode({'query': q}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(ENDPOINT, data=body, headers={
                'User-Agent': UA, 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'})
            d = json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8'), strict=False)
            rows = [{k: v['value'] for k, v in b.items()} for b in d['results']['bindings']]
            if path:
                os.makedirs(RAW, exist_ok=True)
                json.dump(rows, open(path, 'w'), ensure_ascii=False)
            return rows
        except Exception as e:  # timeouts and 429s: back off and retry
            print('  retry', cache, i, str(e)[:120])
            time.sleep(5 * 2 ** i)
    raise RuntimeError('query failed: ' + (cache or q[:80]))


def qid(uri):
    return uri.rsplit('/', 1)[-1]


def point(wkt):
    """'Point(lon lat)' -> (lon, lat)."""
    a = wkt[wkt.index('(') + 1:wkt.index(')')].split()
    return float(a[0]), float(a[1])
