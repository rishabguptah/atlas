# Scholarship lens data: the debates historians have, the works they cite, primary sources, and the why graph.
# Reads every record through tools/build.py (so stubs are merged and every causal relation in the kernel joins the
# graph, not only data/scholarship/), and the judge's verdicts from data/judge/reports/.
# Over 40 KB, so a page build with the load budget puts it in atlas-files/lens-scholar.json, loaded after the first
# paint; scholar.js copes with it not being there yet.
import glob, importlib.util, json, os, re, sys

CAUSAL = {'caused': 0, 'contributed_to': 1, 'prevented': 2}
CONF = {'attested': 0, 'estimated': 1, 'approximate': 2, 'unknown': 3}


def _kernel(repo):
    spec = importlib.util.spec_from_file_location('atlas_build', os.path.join(repo, 'tools', 'build.py'))
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)
    recs, _ = b.load()
    return b.merge(recs, [])


def _short(s):
    """Pomeranz 2000, Eltis and Richardson 2010, McCormick et al. 2012."""
    a = [x.split(',')[0].strip() for x in s.get('authors') or []]
    who = a[0] if len(a) == 1 else f'{a[0]} and {a[1]}' if len(a) == 2 else f'{a[0]} et al.' if a else (s.get('title') or '')[:30]
    return f"{who} {s.get('year', '')}".strip()


def _full(s):
    a = s.get('authors') or []
    who = '; '.join(a[:3]) + (' et al.' if len(a) > 3 else '')
    v = s.get('verified') or {}
    cont = s.get('container') or v.get('container')
    bits = [who + f" ({s.get('year')})" if who else str(s.get('year')), s.get('title', '').rstrip('.') + '.']
    if cont:
        bits.append(f"{'In ' if s.get('type') == 'chapter' else ''}{cont}" + (f" {v['volume']}" if v.get('volume') else '') + (f", {v['page']}" if v.get('page') else '') + '.')
    elif s.get('publisher'):
        bits.append(s['publisher'] + '.')
    if s.get('translator'):
        bits.append('Tr. ' + s['translator'] + '.')
    return ' '.join(b for b in bits if b)


def _url(s):
    if s.get('doi'):
        return 'https://doi.org/' + s['doi']
    if s.get('url'):
        return s['url']
    olid = (s.get('verified') or {}).get('olid')
    if olid:
        return f'https://openlibrary.org/works/{olid}' if olid.endswith('W') else f'https://openlibrary.org/books/{olid}'
    return ''


def _point(r, recs, depth=0):
    """lon, lat for any record: its own, its place's, its capital's, its birthplace's, or what it relates to."""
    if r is None or depth > 2:
        return None
    if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float)):
        return round(r['lon'], 2), round(r['lat'], 2)
    for f in ('place', 'capital'):
        if isinstance(r.get(f), str) and r[f] in recs:
            p = _point(recs[r[f]], recs, depth + 1)
            if p:
                return p
    for f in ('born', 'died'):
        if isinstance(r.get(f), dict) and r[f].get('place') in recs:
            p = _point(recs[r[f]['place']], recs, depth + 1)
            if p:
                return p
    for f in ('of', 'to'):   # a measure's subject; a relation's object
        if isinstance(r.get(f), str) and r[f] in recs:
            p = _point(recs[r[f]], recs, depth + 1)
            if p:
                return p
    return None


def _year(r):
    for f in ('start', 'year', 'written'):
        if isinstance(r.get(f), int):
            return r[f]
    b = r.get('born')
    if isinstance(b, dict) and isinstance(b.get('year'), int):
        return b['year'] + 30
    return None


def _srcs(r):
    return [s['src'] for s in r.get('sources') or [] if isinstance(s, dict) and s.get('src')]


def _judge(repo):
    out = {}
    for f in sorted(glob.glob(os.path.join(repo, 'data', 'judge', 'reports', '*', 'verdicts.jsonl'))):
        week = os.path.basename(os.path.dirname(f))
        for l in open(f, encoding='utf-8'):
            if l.strip():
                v = json.loads(l)
                if v.get('ref'):
                    out[v['ref']] = [week, v.get('verdict', ''), (v.get('fix') or v.get('evidence') or '')[:220]]
    return out


def build(repo):
    recs = _kernel(repo)
    by = lambda k: [r for r in recs.values() if r.get('kind') == k]
    sources = {r['id']: r for r in by('source')}
    S = {sid: [_short(s), _full(s), _url(s), 0 if (s.get('verified') or {}).get('failed') or not s.get('verified') else 1, s.get('type', '')]
         for sid, s in sources.items()}

    nodes, need = {}, set()

    def node(i):
        if i in nodes or i not in recs:
            return i in nodes
        r = recs[i]
        p = _point(r, recs)
        nodes[i] = [r.get('name') or i.split(':')[-1].replace('_', ' '), _year(r), p[0] if p else None, p[1] if p else None,
                    (r.get('lenses') or ['order'])[0], (r.get('what') or '')[:160]]
        return True

    L = []
    for r in sorted((r for r in recs.values() if r.get('kind') == 'relation' and r.get('type') in CAUSAL), key=lambda r: r['id']):
        if not (node(r['from']) and node(r['to'])):
            continue
        ls = r.get('lenses') or []
        lf = ls[0] if ls else nodes[r['from']][4]
        lt = ls[1] if len(ls) > 1 else nodes[r['to']][4]
        st = r.get('start') if isinstance(r.get('start'), int) else nodes[r['from']][1]
        en = r.get('end') if isinstance(r.get('end'), int) else nodes[r['to']][1]
        L.append([r['id'], r['from'], r['to'], CAUSAL[r['type']], round(float(r.get('confidence', 0.5)), 2), CONF.get(r.get('conf'), 1 if r.get('status') == 'sourced' else 2),
                  r.get('view') or '', (r.get('mech') or r.get('note') or '')[:240], r.get('lag'), r.get('debate') or '', st, en, lf, lt,
                  _srcs(r) or [s.get('cite', '')[:120] for s in (r.get('sources') or [])[:1]], 1 if r.get('status') == 'sourced' else 0])

    D = []
    for r in sorted(by('debate'), key=lambda r: r.get('start') or 0):
        for a in r.get('about') or []:
            node(a)
        pos = [{k: p.get(k) for k in ('id', 'school', 'scholars', 'claim', 'mech', 'for', 'against', 'works', 'lenses', 'standing', 'rels') if p.get(k) is not None}
               for p in r.get('positions') or []]
        D.append({'id': r['id'], 'n': r['name'], 's': r.get('start'), 'e': r.get('end'), 'lon': r.get('lon'), 'lat': r.get('lat'), 'bbox': r.get('bbox'),
                  'about': r.get('about') or [], 'lenses': r.get('lenses') or [], 'pos': pos, 'state': r.get('state', ''), 'settle': r.get('settle', ''),
                  'fun': r.get('fun', ''), 'quotes': r.get('quotes') or [], 'series': r.get('series') or [], 'src': _srcs(r)})

    Q = []
    for r in sorted(by('quote'), key=lambda r: r.get('start') or r.get('written') or 0):
        p = _point(r, recs)
        v = r.get('verified') or {}
        for a in r.get('about') or []:
            node(a)
        Q.append([r['id'], r.get('name', ''), r['text'], r.get('author_name') or (recs.get(r.get('author')) or {}).get('name') or r.get('author', ''), r.get('work', ''), r.get('written'), r.get('start') or r.get('written'),
                  p[0] if p else None, p[1] if p else None, r.get('about') or [], r.get('witness', ''), r.get('src', ''),
                  0 if v.get('failed') or not v else 1, r.get('check_url') or '', (r.get('lenses') or ['ideas'])[0]])

    C = []
    lid = {l[0] for l in L}
    for r in sorted(by('chain'), key=lambda r: r.get('start') or 0):
        links = [x for x in r.get('links') or [] if x in lid]
        if len(links) >= 2:
            C.append([r['id'], r['name'], r.get('blurb', ''), r.get('start'), r.get('end'), links, r.get('debates') or [], r.get('question', '')])

    M = {}
    for r in by('measure'):
        if r.get('src') or any(s.get('src') for s in r.get('sources') or []) or r['id'] in {x for d in D for x in d['series']}:
            M[r['id']] = [r.get('of'), r.get('metric'), r.get('unit'), r['points'], (r.get('method') or '')[:240], r.get('src') or (_srcs(r) or [''])[0]]

    # Only the sources something here cites, plus every source a debate position names.
    used = {s for l in L for s in l[14] if s in S} | {w for d in D for p in d['pos'] for w in p.get('works') or []} | {x for d in D for x in d['src']} \
        | {q[11] for q in Q} | {m[5] for m in M.values()}
    return {'S': {k: v for k, v in S.items() if k in used}, 'N': nodes, 'L': L, 'D': D, 'Q': Q, 'C': C, 'M': M, 'J': _judge(repo),
            'n': {'sources': len(S), 'verified': sum(v[3] for v in S.values()), 'links': len(L), 'debates': len(D), 'quotes': len(Q), 'chains': len(C)}}


if __name__ == '__main__':
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    d = build(repo)
    print(json.dumps(d['n']), len(json.dumps(d, ensure_ascii=False, separators=(',', ':'))), 'bytes')
