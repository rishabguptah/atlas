# Tiny Wikidata SPARQL client with retries and a file cache, shared by the europe-19c fetch scripts.
import json, os, time, urllib.request, urllib.parse

UA = 'AtlasHistoryBot/0.1 (private history map; https://github.com/rishabguptah/atlas)'
RAW = os.environ.get('ATLAS_RAW', '/mnt/project-files/atlas/raw') + '/europe-19c'


def sparql(q, cache=None, tries=5, timeout=300):
    """Run a query and return the bindings as plain dicts {var: value}. Cached under RAW/<cache>.json."""
    path = os.path.join(RAW, cache + '.json') if cache else None
    if path and os.path.exists(path):
        return json.load(open(path))
    body = urllib.parse.urlencode({'query': q}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request('https://query.wikidata.org/sparql', data=body, headers={
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
