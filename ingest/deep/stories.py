# Study storylines for Up close, for every era and continent: checks the storyline files in data/deep/stories/,
# resolves each step's English Wikipedia article to its Wikidata id (cached), and writes the Europe 1789-1914
# storylines from data/europe-19c/ in the same shape.
#   python3 ingest/deep/stories.py [incoming.json ...]   copies new storyline files in first, then checks them all
# Shape: {"stories": [{id, title, region, start, end, view: {lon, lat, span}, blurb, status, steps: [{date, end_date?,
#   date_note?, name, place_name, lat, lon, family, subtype, who: [], what, why, wikipedia, wikidata?, sources?, debate?}]}]}
# The text is a draft written from the Wikipedia article on each step (status "draft"), waiting for the judge.
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DIR = os.path.join(REPO, 'data', 'deep', 'stories')
CACHE = os.environ.get('ATLAS_RAW', '/mnt/project-files/atlas/raw') + '/deep/enwiki-qids.json'
UA = 'AtlasHistoryBot/0.1 (private history map; https://github.com/rishabguptah/atlas)'
DATE = re.compile(r'^-?\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$')
FAMS = {'war', 'diplomacy', 'unrest', 'disaster', 'culture'}


def key(d):
    neg = d.startswith('-')
    p = (d[1:] if neg else d).split('-')
    y = -int(p[0]) if neg else int(p[0])
    return (y, int(p[1]) if len(p) > 1 else 0, int(p[2]) if len(p) > 2 else 0)


def qids(titles):
    """English Wikipedia titles -> Wikidata ids, through the Wikidata query service (sitelinks; 150 a query, cached).
    The Wikidata action API rate-limits the shared address; the query service does not."""
    sys.path.insert(0, os.path.join(REPO, 'ingest', 'europe-19c'))
    from wdq import sparql
    cache = {k: v for k, v in (json.load(open(CACHE)) if os.path.exists(CACHE) else {}).items() if v}
    todo = sorted({t for t in titles if t and t not in cache})
    url = lambda t: '<https://en.wikipedia.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'), safe="_(),'!*:-.~") + '>'
    for i in range(0, len(todo), 150):
        batch = todo[i:i + 150]
        q = 'SELECT ?a ?item WHERE { VALUES ?a { %s } ?a schema:about ?item }' % ' '.join(url(t) for t in batch)
        try:
            rows = sparql(q, tries=4)
        except Exception as e:
            print('  qid lookup failed', str(e)[:80]); continue
        for r in rows:
            t = urllib.parse.unquote(r['a'].split('/wiki/', 1)[1]).replace('_', ' ')
            cache[t] = r['item'].rsplit('/', 1)[1]
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)
    return cache


def check(s, f):
    errs = []
    for k in ('id', 'title', 'start', 'end', 'view', 'blurb', 'steps'):
        if k not in s: errs.append(f'{f}:{s.get("id")}: missing {k}')
    prev = None
    for i, st in enumerate(s.get('steps', [])):
        w = f'{f}:{s.get("id")}#{i} {st.get("name")}'
        if not DATE.match(st.get('date', '')): errs.append(f'{w}: bad date {st.get("date")!r}')
        elif prev and key(st['date'])[0] < key(prev)[0]: errs.append(f'{w}: out of order')
        if st.get('end_date') and not DATE.match(st['end_date']): errs.append(f'{w}: bad end_date')
        if not (isinstance(st.get('lat'), (int, float)) and isinstance(st.get('lon'), (int, float)) and -90 <= st['lat'] <= 90 and -180 <= st['lon'] <= 180):
            errs.append(f'{w}: bad coordinates')
        if st.get('family') not in FAMS: errs.append(f'{w}: family {st.get("family")!r}')
        if not st.get('what'): errs.append(f'{w}: no what')
        prev = st.get('date') or prev
    return errs


def e19():
    """The ten Europe 1789-1914 storylines (data/europe-19c/) in the shared shape."""
    d = os.path.join(REPO, 'data', 'europe-19c')
    recs = {}
    for f in ('events.jsonl', 'story.jsonl'):
        for l in open(os.path.join(d, f), encoding='utf-8'):
            r = json.loads(l); recs[r['id']] = r
    # Steps that are stubs of another workstream's record keep their own date but borrow the owner's place.
    owners = {}
    for f in ('battles.jsonl', 'battles-wikidata.jsonl'):
        for l in open(os.path.join(REPO, 'data', 'states-war', f), encoding='utf-8'):
            r = json.loads(l)
            if r.get('kind') == 'event': owners[r['id']] = r
    out = []
    for s in json.load(open(os.path.join(d, 'stories.json'), encoding='utf-8'))['stories']:
        steps = []
        for sid in s['steps']:
            r = recs.get(sid)
            if not r: continue
            o = owners.get(sid, {})
            src = (r.get('study_sources') or r.get('sources') or [{}])[0]
            wiki = src.get('url', '').split('/wiki/')[-1].replace('_', ' ') if 'wikipedia.org/wiki/' in src.get('url', '') else ''
            st = {'date': r['date'], 'name': r.get('name') or o.get('name'), 'place_name': r.get('place_name', ''), 'lat': r.get('lat', o.get('lat')),
                  'lon': r.get('lon', o.get('lon')), 'family': r.get('family') or 'war', 'subtype': r.get('subtype', 'event'), 'who': [],
                  'what': r.get('what') or o.get('what') or r.get('name'), 'why': r.get('why', ''), 'wikipedia': urllib.parse.unquote(wiki)}
            if r.get('end_date'): st['end_date'] = r['end_date']
            if r.get('date_note'): st['date_note'] = r['date_note']
            if r.get('wikidata'): st['wikidata'] = r['wikidata']
            if st['lat'] is None: continue
            steps.append(st)
        steps.sort(key=lambda st: key(st['date']))
        out.append({'id': 'e19_' + s['id'], 'title': s['title'], 'region': 'Europe', 'start': s['start'], 'end': s['end'],
                    'view': {'lon': 14, 'lat': 50, 'span': 34}, 'blurb': s['blurb'], 'status': 'draft', 'steps': steps})
    return {'stories': out}


if __name__ == '__main__':
    os.makedirs(DIR, exist_ok=True)
    for f in sys.argv[1:]:
        name = re.sub(r'^[a-z]_', '', os.path.basename(f))
        json.dump(json.load(open(f, encoding='utf-8')), open(os.path.join(DIR, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(e19(), open(os.path.join(DIR, 'europe_1789_1914.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    files = sorted(f for f in os.listdir(DIR) if f.endswith('.json'))
    data = {f: json.load(open(os.path.join(DIR, f), encoding='utf-8')) for f in files}
    cache = qids([st.get('wikipedia') for d in data.values() for s in d['stories'] for st in s['steps']])
    errs, n, ids, miss = [], 0, set(), []
    for f, d in data.items():
        for s in d['stories']:
            if s['id'] in ids: errs.append(f'{f}: duplicate story id {s["id"]}')
            ids.add(s['id'])
            s.setdefault('status', 'draft')
            for st in s['steps']:
                n += 1
                for k in ('date', 'end_date'):
                    if st.get(k): st[k] = re.sub(r'^(-?)(\d{1,3})(?=$|-)', lambda m: m.group(1) + m.group(2).zfill(4), st[k])
                q = cache.get(st.get('wikipedia') or '')
                if q and not st.get('wikidata'): st['wikidata'] = q
                if st.get('wikipedia') and not q: miss.append(f'{s["id"]}: {st["wikipedia"]}')
            errs += check(s, f)
        json.dump(d, open(os.path.join(DIR, f), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(ids), 'storylines', n, 'steps')
    print('\n'.join(errs) or 'no errors')
    if miss: print(len(miss), 'Wikipedia titles not found:\n  ' + '\n  '.join(miss))
