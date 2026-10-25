#!/usr/bin/env python3
"""Check every scholarship citation against the outside world, and write the result onto the record.

  source with a doi       -> Crossref: the title, year and first author must match what we wrote
  article without a doi   -> Crossref bibliographic search; a strong match fills in the doi
  book                    -> OpenLibrary (by isbn, else by title and author); fills olid, isbn, first year
  quote with check_url    -> fetch the public-domain text and find every fragment of the excerpt in it, verbatim

Each record gets `verified: {via, on, score, ...}` or `verified: {failed: reason, on}`. Results are cached in
raw/scholarship/ (ignored by git), so a rerun only asks about what changed. Failures are printed; a full run
(no files given) also writes data/scholarship/VERIFY.md.

Usage: python3 ingest/scholarship/verify.py [files...] [--force] [--offline]
       (no files = every data/scholarship/*.jsonl)
"""
import json, os, re, sys, glob, time, unicodedata, urllib.request, urllib.parse, hashlib, datetime
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'scholarship')
CACHE = os.path.join(ROOT, 'raw', 'scholarship')
TODAY = datetime.date.today().isoformat()
UA = 'AtlasScholarship/0.1 (https://github.com/rishabguptah/atlas; history atlas citation check)'
OFFLINE = '--offline' in sys.argv
FORCE = '--force' in sys.argv


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def sim(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    # A subtitle is often dropped on one side: compare the shorter against the start of the longer too.
    short, long_ = sorted((a, b), key=len)
    head = SequenceMatcher(None, short, long_[:len(short)]).ratio()
    return max(SequenceMatcher(None, a, b).ratio(), head if len(short) >= 12 else 0)


def get(url, kind='json', tries=3):
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ('.json' if kind == 'json' else '.txt'))
    if os.path.exists(key) and not FORCE:
        txt = open(key, encoding='utf-8').read()
        return json.loads(txt) if kind == 'json' and txt else (txt or None)
    if OFFLINE:
        return None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json' if kind == 'json' else '*/*'})
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read()
            txt = raw.decode('utf-8', 'replace')
            open(key, 'w', encoding='utf-8').write(txt)
            return json.loads(txt) if kind == 'json' else txt
        except urllib.error.HTTPError as e:
            if e.code == 404:
                open(key, 'w').write('')
                return None
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def surname(a):
    a = str(a or '')
    return norm(a.split(',')[0] if ',' in a else a.split()[-1] if a.split() else a)


def crossref_doi(r):
    m = get('https://api.crossref.org/works/' + urllib.parse.quote(r['doi']) + '?mailto=atlas@example.org')
    if not m or 'message' not in m:
        return {'failed': 'doi not found at Crossref'}
    w = m['message']
    title = ' '.join(w.get('title') or []) + ' ' + ' '.join(w.get('subtitle') or [])
    ts = max(sim(r['title'], ' '.join(w.get('title') or [])), sim(r['title'], title))
    years = [p['date-parts'][0][0] for k in ('published-print', 'published-online', 'issued', 'published') if (p := w.get(k)) and p.get('date-parts') and p['date-parts'][0] and p['date-parts'][0][0]]
    yok = not years or any(abs(y - r['year']) <= 2 for y in years)
    fams = [norm(a.get('family') or a.get('name') or '') for a in w.get('author') or w.get('editor') or []]
    aok = not r.get('authors') or not fams or surname(r['authors'][0]) in fams or any(surname(r['authors'][0]) in f for f in fams)
    score = round(ts, 2)
    out = {'via': 'crossref', 'score': score, 'title': (w.get('title') or [''])[0][:200]}
    if w.get('container-title'):
        out['container'] = w['container-title'][0]
    for k in ('volume', 'issue', 'page'):
        if w.get(k):
            out[k] = w[k]
    if years:
        out['year'] = years[0]
    if ts < 0.6 or not yok or not aok:
        out['failed'] = 'Crossref metadata does not match: ' + ', '.join(x for x, ok in (('title', ts >= 0.6), ('year', yok), ('first author', aok)) if not ok)
    return out


def crossref_search(r):
    q = f"{r['title']} {' '.join(surname(a) for a in r.get('authors', [])[:2])} {r['year']}"
    m = get('https://api.crossref.org/works?rows=5&mailto=atlas@example.org&query.bibliographic=' + urllib.parse.quote(q))
    if not m:
        return None
    best = None
    for w in (m.get('message') or {}).get('items') or []:
        ts = sim(r['title'], ' '.join(w.get('title') or []))
        fams = [norm(a.get('family') or '') for a in w.get('author') or []]
        aok = not r.get('authors') or surname(r['authors'][0]) in fams
        y = ((w.get('issued') or {}).get('date-parts') or [[None]])[0][0]
        if ts >= 0.85 and aok and (y is None or abs(y - r['year']) <= 2) and (not best or ts > best[0]):
            best = (ts, w)
    if not best:
        return None
    w = best[1]
    return {'via': 'crossref-search', 'score': round(best[0], 2), 'doi': w['DOI'], 'title': (w.get('title') or [''])[0][:200],
            **({'container': w['container-title'][0]} if w.get('container-title') else {})}


def openlibrary(r):
    if r.get('isbn'):
        isbn = re.sub(r'[^0-9X]', '', str(r['isbn']).upper())
        m = get(f'https://openlibrary.org/isbn/{isbn}.json')
        if m and m.get('title'):
            ts = max(sim(r['title'], m['title']), sim(r['title'], m['title'] + ' ' + (m.get('subtitle') or '')))
            out = {'via': 'openlibrary-isbn', 'score': round(ts, 2), 'title': m['title'][:200], 'olid': (m.get('key') or '').split('/')[-1]}
            if ts < 0.6:
                out['failed'] = 'the isbn belongs to a different title'
            return out
    a = surname(r['authors'][0]) if r.get('authors') else ''
    t = re.split(r'[:.?]', r['title'])[0]
    m = get('https://openlibrary.org/search.json?limit=8&fields=key,title,subtitle,author_name,first_publish_year,isbn,edition_count&title='
            + urllib.parse.quote(t) + ('&author=' + urllib.parse.quote(a) if a else ''))
    best = None
    for d in (m or {}).get('docs') or []:
        ts = max(sim(r['title'], d.get('title', '')), sim(r['title'], f"{d.get('title', '')} {d.get('subtitle', '')}"))
        names = [norm(x) for x in d.get('author_name') or []]
        aok = not a or any(a in n.split() or n.endswith(a) for n in names)
        if ts >= 0.7 and aok and (not best or (ts, d.get('edition_count', 0)) > (best[0], best[1].get('edition_count', 0))):
            best = (ts, d)
    if not best:
        return {'failed': 'no matching book at OpenLibrary' if m is not None else 'OpenLibrary unreachable'}
    d = best[1]
    out = {'via': 'openlibrary', 'score': round(best[0], 2), 'title': d.get('title', '')[:200], 'olid': d['key'].split('/')[-1]}
    if d.get('first_publish_year'):
        out['first_year'] = d['first_publish_year']
    isbns = [i for i in d.get('isbn') or [] if len(i) == 13 and i.startswith('97')]
    if isbns:
        out['isbn_seen'] = isbns[0]
    return out


def textify(t):
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r'\1', t)   # wiki links
    t = re.sub(r"'{2,}", '', t)
    return norm(t)


def check_quote(r):
    url = r.get('check_url')
    if not url:
        return {'failed': 'no check_url to verify the excerpt against'}
    page = get(url, kind='text')
    if not page:
        return {'failed': 'could not fetch ' + url}
    hay = textify(page)
    frags = [norm(f) for f in re.split(r'\.\.\.|…|\[[^\]]*\]', r['text'])]
    frags = [f for f in frags if len(f) >= 12]
    if not frags:
        return {'failed': 'excerpt too short to check'}
    found = sum(1 for f in frags if f in hay)
    if found == len(frags):
        return {'via': 'verbatim', 'score': 1.0, 'url': url}
    # Report how close we got: the share of 6-word shingles found in the text.
    words = norm(r['text']).split()
    sh = [' '.join(words[i:i + 6]) for i in range(max(1, len(words) - 5))]
    share = sum(1 for s in sh if s in hay) / len(sh)
    out = {'via': 'verbatim', 'score': round(share, 2), 'url': url}
    out['failed'] = f'{found} of {len(frags)} fragments found verbatim ({round(share * 100)}% of 6-word runs)'
    return out


def verify(r):
    k = r.get('kind')
    if k == 'quote':
        return check_quote(r)
    if k != 'source':
        return None
    t = r.get('type')
    if r.get('doi'):
        return crossref_doi(r)
    if t in ('article', 'chapter'):
        hit = crossref_search(r)
        if hit:
            return hit
        if t == 'chapter':
            return openlibrary({**r, 'title': r.get('container') or r['title']}) | {'note': 'checked the book the chapter is in'}
        return {'failed': 'no doi and no confident Crossref match'}
    if t in ('book', 'primary'):
        out = openlibrary(r)
        if out.get('failed') and t == 'book':
            hit = crossref_search(r)   # many scholarly books have DOIs too
            if hit:
                return hit
        if out.get('failed') and t == 'primary' and r.get('url'):
            return {'via': 'url', 'score': 0.5, 'note': 'primary source with a public text; edition not matched in OpenLibrary', 'url': r['url']}
        return out
    if t in ('dataset', 'web') and r.get('url'):
        page = get(r['url'], kind='text')
        return {'via': 'url', 'score': 1.0 if page else 0, **({} if page else {'failed': 'url did not load'})}
    return {'failed': 'nothing to check against'}


def main():
    given = [a for a in sys.argv[1:] if not a.startswith('--')]
    files = given or sorted(glob.glob(os.path.join(DATA, '*.jsonl')))
    report, n_ok, n_fail = [], 0, 0
    for path in files:
        rows = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
        changed = False
        for r in rows:
            if r.get('kind') not in ('source', 'quote'):
                continue
            old = r.get('verified')
            if old and not old.get('failed') and not FORCE:
                n_ok += 1
                continue
            v = verify(r)
            if v is None:
                continue
            if v.get('via') == 'crossref-search' and not v.get('failed') and not r.get('doi'):
                r['doi'] = v['doi']
            if v.get('isbn_seen') and not r.get('isbn'):
                r['isbn'] = v.pop('isbn_seen')
            v.pop('isbn_seen', None)
            v['on'] = TODAY
            r['verified'] = v
            changed = True
            if v.get('failed'):
                n_fail += 1
                report.append(f"- `{r['id']}` ({os.path.basename(path)}): {v['failed']}" + (f" — found: {v.get('title')}" if v.get('title') else ''))
            else:
                n_ok += 1
        if changed:
            with open(path, 'w', encoding='utf-8') as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(f'{os.path.relpath(path, ROOT)}: checked', flush=True)
    print('\n'.join(report))
    print(f'{n_ok} verified, {n_fail} not verified')
    if not given:   # a full run writes the report; a run on some files only prints
        with open(os.path.join(DATA, 'VERIFY.md'), 'w', encoding='utf-8') as f:
            f.write(f'# Citation check, {TODAY}\n\n{n_ok} verified, {n_fail} not verified.\n\n' + ('## Not verified\n\n' + '\n'.join(report) + '\n' if report else ''))


if __name__ == '__main__':
    main()
