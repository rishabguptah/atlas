"""Give records that cite only 'not yet checked' a real source, or say what is wrong with them.

For each such record (mostly the Living Atlas's Claude-written city events, places and empires):
  1. search English Wikipedia for the claim (place, event, year) and pull the sentences that mention it;
  2. ask Claude, in batches, to judge the claim against those sentences only: supported, partly,
     contradicted or unverified, with the quote, the article and a suggested fix. When the Wikipedia API
     rate-limits us (it often does on shared cloud IPs), or with --web, Claude finds the evidence itself with
     web search instead and must cite the page it relied on;
  3. population series are checked against Reba et al. (2016) points already in the kernel instead.
Verdicts go to data/judge/reports/<run>/sourcing.jsonl. With --apply, supported records get the article as their
source (status sourced) and a judge note; partly or contradicted ones get the suggested fix only when it is a
plain year, and otherwise stay drafts for the owner.

    python3 tools/build.py
    python3 ingest/judge/source_records.py RUN [--limit N] [--jobs 3] [--apply]
"""
import hashlib, json, os, re, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = 'AtlasJudge/0.1 (history atlas fact-check; https://github.com/rishabguptah/atlas)'
JUDGE = {'cite': 'Atlas judge, sourcing pass (data/judge/reports/{run}/sourcing.jsonl)'}
REBA = 'Reba, Reitsma and Seto (2016), Spatializing 6,000 years of global urbanization, Scientific Data 3:160034'


def fy(y):
    return '?' if y is None else f'{-y} BCE' if y < 0 else f'{y} CE'


def unchecked(r):
    src = r.get('sources') or []
    return bool(src) and any('not yet checked' in (s.get('cite') or '') for s in src)


CACHE = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'atlas-wiki-cache')
_lock, _last = threading.Lock(), [0.0]


def wiki(params):
    """One Wikipedia API call: cached on disk, at most ~2.5 a second overall, polite backoff on 429."""
    url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(key):
        return json.load(open(key))
    for wait in (2, 6):
        with _lock:
            time.sleep(max(0, _last[0] + 0.4 - time.time()))
            _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as f:
                out = json.load(f)
            os.makedirs(CACHE, exist_ok=True)
            json.dump(out, open(key, 'w'))
            return out
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503):
                return {}
            time.sleep(min(60, int(e.headers.get('Retry-After') or wait)))
        except Exception:
            time.sleep(wait)
    return None  # refused: the caller falls back to web search


def claim_of(r, by):
    """One checkable sentence, the search query and the words that mark a relevant sentence."""
    place = by.get(r.get('place') or '', {})
    pname = place.get('name') or r.get('place', '').split(':')[-1].replace('_', ' ')
    if r['kind'] == 'event':
        text = f"{pname}, {fy(r.get('start'))}: {r['name']}."
        return text, f"{pname} {r['name']} {abs(r.get('start') or 0)}", [str(abs(r.get('start') or 0))], [pname]
    if r['kind'] == 'place':
        span = f"from about {fy(r.get('start'))}" + (f" to about {fy(r['end'])}" if r.get('end') else ' to today')
        text = f"{r['name']} ({r.get('today', '')}) was a city {span}. {r.get('what', '')} {r.get('why', '')}".strip()
        keys = [str(abs(y)) for y in (r.get('start'), r.get('end')) if y]
        return text, r['name'], keys, [r['name']]
    if r['kind'] == 'polity':
        pk = r.get('peak')
        text = f"{r['name']} lasted from about {fy(r.get('start'))} to {fy(r.get('end'))}" + (f", peaking around {fy(pk[0])} at about {pk[1]} million km2." if pk else '.') + f" {r.get('what', '')}"
        return text, r['name'], [str(abs(y)) for y in (r.get('start'), r.get('end')) if y], [r['name']]
    return None, None, None, None


def evidence(query, keys, names, n_articles=2, n_sentences=8):
    """Excerpts from the top Wikipedia hits, or None when the API refused us."""
    found = wiki({'action': 'query', 'list': 'search', 'srsearch': query, 'srlimit': n_articles})
    if found is None:
        return None
    out = []
    for h in found.get('query', {}).get('search', []):
        title = h['title']
        got = wiki({'action': 'query', 'prop': 'extracts', 'explaintext': 1, 'titles': title, 'redirects': 1})
        if got is None:
            return None
        page = got.get('query', {}).get('pages', [{}])[0]
        txt = page.get('extract') or ''
        sents = re.split(r'(?<=[.!?])\s+', txt)
        lead = ' '.join(sents[:3])
        pick = [s for s in sents if any(k in s for k in keys)][:n_sentences] if keys else []
        out.append({'title': page.get('title', title), 'url': 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(page.get('title', title).replace(' ', '_')),
                    'lead': lead[:700], 'sentences': [s[:400] for s in pick]})
    return out


def claude(prompt, web=False):
    args = ['claude', '-p', '--tools', 'WebSearch' if web else '', *(['--allowedTools', 'WebSearch'] if web else []), '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '',
            '--system-prompt', 'You are a careful fact-checker. Follow the output format exactly.', '--output-format', 'text']
    p = subprocess.run(args, input=prompt, capture_output=True, text=True, cwd='/tmp', timeout=600)
    if re.search(r'hit your (session|usage|weekly) limit', p.stdout + p.stderr):
        raise SystemExit('Stopped: Claude usage limit hit. Rerun later; finished verdicts are kept.')
    return p.stdout


PROMPT = """Check each claim from a history atlas against the Wikipedia excerpts given with it. Use the excerpts as the
evidence; you may use your own knowledge only to judge whether an excerpt is about the same thing, never as the source.

Verdicts: supported (an excerpt says the same, within the claim's stated precision; "about" years allow a few years
for ancient dates), partly (close but a date, number or wording is off in a way a reader would care about),
contradicted (an excerpt says something else), unverified (the excerpts do not settle it).

For each claim write one JSON line, no other text:
{{"n":claim number,"verdict":"...","article":"title of the excerpt you relied on, or null","quote":"the sentence that settles it, verbatim, or null","fix":"what to change, or null","start":corrected start year if the claim's own year is wrong and the excerpt gives the right one (integer, negative for BCE), else null}}

{items}"""


def judge_batch(batch):
    items = []
    for i, (r, text, ev) in enumerate(batch, 1):
        exc = '\n'.join(f"  [{e['title']}] lead: {e['lead']}\n" + ''.join(f"    - {s}\n" for s in e['sentences']) for e in ev) or '  (no excerpts found)\n'
        items.append(f"CLAIM {i}: {text}\nEXCERPTS:\n{exc}")
    out = claude(PROMPT.format(items='\n'.join(items)))
    res = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('{'):
            try:
                o = json.loads(line)
                res[int(o['n'])] = o
            except Exception:
                pass
    return [(r, res.get(i, {'verdict': 'unverified', 'fix': None, 'article': None, 'quote': None, 'error': 'no verdict line'}), ev) for i, (r, _, ev) in enumerate(batch, 1)]


WEB_PROMPT = """Check each claim from a history atlas with web search. Search for each one (English Wikipedia, Britannica,
museum, university or other scholarly pages; not forums or AI sites) and judge it only on what a page you found says.

Verdicts: supported (a source says the same, within the claim's stated precision; "about" years allow a few years
for ancient dates), partly (close but a date, number or wording is off in a way a reader would care about),
contradicted (a source says something else), unverified (no source found either way).

When you are done, write one JSON line per claim and nothing else:
{{"n":claim number,"verdict":"...","title":"page title","url":"the page's URL as the search gave it, or null","quote":"the sentence that settles it, as the page or snippet gives it, or null","fix":"what to change, or null","start":corrected start year if the claim's own year is wrong and the source gives the right one (integer, negative for BCE), else null}}

{items}"""


def judge_batch_web(batch):
    """Same verdicts as judge_batch, but Claude finds the evidence with web search (used when the Wikipedia API refuses us)."""
    out = claude(WEB_PROMPT.format(items='\n'.join(f"CLAIM {i}: {text}" for i, (r, text, _) in enumerate(batch, 1))), web=True)
    res = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('{'):
            try:
                o = json.loads(line)
                res[int(o['n'])] = o
            except Exception:
                pass
    rows = []
    for i, (r, _, _) in enumerate(batch, 1):
        o = res.get(i, {'verdict': 'unverified', 'error': 'no verdict line'})
        ev = [{'title': o.get('title') or o.get('url'), 'url': o['url']}] if o.get('url', '') and str(o['url']).startswith('http') else []
        o['article'], o['web'] = (ev[0]['title'] if ev else None), True
        rows.append((r, o, ev))
    return rows


def cite_of(page):
    url = page['url']
    if 'wikipedia.org' in url:
        return {'cite': f"Wikipedia, {page['title']}", 'url': url}
    return {'cite': f"{page['title']} ({urllib.parse.urlparse(url).netloc.replace('www.', '')})", 'url': url}


def reba_check(r, kernel):
    """A population series against Reba points for the same place: supported when every comparable point is within 1.6x."""
    reba = next((m for m in kernel.get('measure', []) if m.get('of') == r['of'] and m['id'].endswith(':reba2016')), None)
    if not reba:
        return {'verdict': 'unverified', 'fix': None, 'note': 'no Reba series for this place'}
    rp = {p[0]: p[1] for p in reba['points']}
    pairs = []
    for y, v, *_ in r['points']:
        near = min(rp, key=lambda x: abs(x - y))
        if abs(near - y) <= 25:
            pairs.append((y, v, near, rp[near]))
    if not pairs:
        return {'verdict': 'unverified', 'fix': None, 'note': 'Reba has no point within 25 years of these'}
    bad = [p for p in pairs if not (1 / 1.6 <= p[1] / p[3] <= 1.6)]
    return {'verdict': 'supported' if not bad else 'partly' if len(bad) < len(pairs) else 'contradicted',
            'compared': pairs, 'fix': None if not bad else 'Reba differs at ' + ', '.join(f'{fy(p[0])}: {p[1]:,} vs {p[3]:,} ({fy(p[2])})' for p in bad)}


def main():
    a = sys.argv[1:]
    def opt(k, d):
        if '--' + k in a:
            i = a.index('--' + k); v = a[i + 1]; del a[i:i + 2]; return v
        return d
    limit, jobs, apply = int(opt('limit', 0)), int(opt('jobs', 3)), '--apply' in a
    a = [x for x in a if x not in ('--apply', '--web')]
    run = a[0]
    outdir = os.path.join(ROOT, 'data/judge/reports', run)
    os.makedirs(outdir, exist_ok=True)
    vpath = os.path.join(outdir, 'sourcing.jsonl')
    done = {}
    if os.path.exists(vpath):
        for l in open(vpath):
            if l.strip():
                v = json.loads(l); done[v['ref']] = v
    kernel = json.load(open(os.path.join(ROOT, 'dist/kernel.json')))['records']
    by = {r['id']: r for v in kernel.values() for r in v}
    todo = [r for v in kernel.values() for r in v if unchecked(r) and r['id'] not in done]
    if limit:
        todo = todo[:limit]
    print(f'{len(todo)} records to check ({len(done)} already done)')

    with open(vpath, 'a') as vf:
        for r in [r for r in todo if r['kind'] == 'measure']:
            v = {'ref': r['id'], 'kind': 'measure', 'text': f"population of {r['of']}: {r['points']}", **reba_check(r, kernel),
                 'sources': [{'cite': REBA}], 'checked': time.strftime('%Y-%m-%d')}
            vf.write(json.dumps(v, ensure_ascii=False) + '\n'); done[r['id']] = v
        vf.flush()
        rest = [r for r in todo if r['kind'] != 'measure']

        web = '--web' in sys.argv

        def gather(r):
            text, q, keys, names = claim_of(r, by)
            return (r, text, None if web else evidence(q, keys, names) if text else [])
        with ThreadPoolExecutor(3) as ex:
            items = []
            for i, it in enumerate(ex.map(gather, rest), 1):
                items.append(it)
                if i % 50 == 0:
                    print(f'evidence for {i} of {len(rest)}', flush=True)
        print('evidence gathered', flush=True)
        # Excerpts when Wikipedia answered; web search for the claims it refused.
        wk, wb = [x for x in items if x[2] is not None], [x for x in items if x[2] is None]
        print(f'{len(wk)} claims with Wikipedia excerpts, {len(wb)} to check by web search', flush=True)
        batches = [(judge_batch, wk[i:i + 10]) for i in range(0, len(wk), 10)] + [(judge_batch_web, wb[i:i + 8]) for i in range(0, len(wb), 8)]
        with ThreadPoolExecutor(jobs) as ex:
            for res in ex.map(lambda b: b[0](b[1]), batches):
                for r, o, ev in res:
                    art = next((e for e in ev if e['title'] == o.get('article')), None)
                    v = {'ref': r['id'], 'kind': r['kind'], 'text': claim_of(r, by)[0], 'verdict': o.get('verdict', 'unverified'),
                         'evidence': o.get('quote'), 'fix': o.get('fix'), 'start': o.get('start'),
                         'sources': [cite_of(art)] if art else [],
                         'via': 'web search' if o.get('web') else 'Wikipedia excerpts', 'checked': time.strftime('%Y-%m-%d')}
                    vf.write(json.dumps(v, ensure_ascii=False) + '\n'); vf.flush(); done[r['id']] = v
                print(f'{len(done)} verdicts', flush=True)

    from collections import Counter
    print(Counter(v['verdict'] for v in done.values()))
    if apply:
        apply_verdicts(done, run)


def apply_verdicts(done, run):
    """Rewrite the records in their own files: supported ones cite the article, plain year fixes go in."""
    import glob
    note = {'cite': JUDGE['cite'].format(run=run)}
    changed = 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', '*', '*.jsonl'))):
        lines, dirty = open(path, encoding='utf-8').read().splitlines(), False
        for i, line in enumerate(lines):
            if not line.strip() or 'not yet checked' not in line:
                continue
            r = json.loads(line)
            v = done.get(r['id'])
            if not v or not v.get('sources') or v['verdict'] == 'unverified':
                continue
            if v['verdict'] == 'contradicted' and not v.get('start'):
                continue  # the owner decides what the record should say
            if v.get('start') and isinstance(v['start'], int) and v['start'] != 0 and r['kind'] != 'measure' and r.get('start') != v['start']:
                r['start_was'] = r.get('start')
                r['start'] = v['start']
                if r.get('end') == r['start_was'] or (r.get('end') is not None and r['end'] < r['start']):
                    r['end'] = r['start']
            if v['verdict'] == 'partly' and v.get('fix') and not v.get('start'):
                r['judge_note'] = v['fix']
            r['sources'] = [s for s in r['sources'] if 'not yet checked' not in (s.get('cite') or '')] + v['sources'] + [note]
            if v['verdict'] == 'supported' or v.get('start'):
                r['status'] = 'sourced'
            lines[i] = json.dumps(r, ensure_ascii=False, separators=(',', ':'))
            dirty = True; changed += 1
        if dirty:
            open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'applied to {changed} records')


if __name__ == '__main__':
    main()
