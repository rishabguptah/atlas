# Compile the world index (L1) beside the page:
#   OUT/atlas-files/world/index.json      table of contents: time slices, packs, storylines (a few KB, fetched at start)
#   OUT/atlas-files/world/base-<i>.json   the whole world in time slices of at most ~3,000 rows (chronicle, Pantheon, kernel)
#   OUT/atlas-files/world/stories.json    the study storylines (data/deep/stories/)
#   OUT/atlas-files/world/density.json    the coverage grid, when data/coverage/geo/density.json exists
#   OUT/atlas-files/packs/<id>.json       dense packs (data/deep/packs/, from assemble.py)
# views/atlas/build.py calls write() for every page build; run it alone with
#   python3 views/atlas/world/build_index.py OUT_DIR
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import assemble as A  # noqa: E402

SLICE = 3000          # rows per time slice, at most (a slice never splits one year)
LIVES_MODERN_HPI = 62  # after 1700, Pantheon people below this fame wait for a pack (Pantheon's modern tail is mostly sport and screen)


def J(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def base_rows():
    everywhere = lambda lon, lat, d: True
    rows = A.chronicle_rows(everywhere)
    keep_person = lambda r: float(r['hpi'] or 0) >= LIVES_MODERN_HPI or (A.year_of(r['born'] or r['died']) or 9999) < 1700
    rows += A.lives_rows(everywhere, keep_person)
    have = {r[8] for r in rows if isinstance(r[8], int) and r[8]}
    rows += A.kernel_rows(everywhere, have)
    # Kernel people who are not in Pantheon's export (other workstreams' biographies).
    K = A.kernel()
    for r in K.get('person', []):
        q = int(r['wikidata'][1:]) if r.get('wikidata', '')[1:].isdigit() else 0
        if q and q in have:
            continue
        for k, ev in (('b', r.get('born') or {}), ('d', r.get('died') or {})):
            if ev.get('lat') is None:
                continue
            d = ev.get('date') or (A.ystr(ev['year']) if ev.get('year') else '')
            if not d:
                continue
            out = {'place': ev.get('name', ''), 'role': (r.get('roles') or [''])[0]}
            rows.append([k, 'p', out['role'], r['name'], ev['lon'], ev['lat'], d, '', q or r['id'], r.get('fame', 0), 0 if len(d) >= 7 else 1, out])
    out = []
    for r in rows:
        if not r[6]:
            continue
        # Two decimals (about a kilometre) is plenty for a world slice; packs keep their full precision.
        r[4], r[5] = round(r[4], 2), round(r[5], 2)
        x = r[11]
        if x.get('desc') and len(x['desc']) > 90:
            x['desc'] = x['desc'][:88].rsplit(' ', 1)[0] + '…'
        x.pop('role', None)
        out.append(r)
    return out


def slices(rows):
    rows.sort(key=lambda r: (A.sortkey(r[6]), -r[9]))
    out, cur, y0 = [], [], None
    for r in rows:
        y = A.year_of(r[6])
        if cur and len(cur) >= SLICE and y != A.year_of(cur[-1][6]):
            out.append((y0, A.year_of(cur[-1][6]), cur)); cur = []
        if not cur:
            y0 = y
        cur.append(r)
    if cur:
        out.append((y0, A.year_of(cur[-1][6]), cur))
    # Slices cover every year between them, so a quiet stretch belongs to the slice before it.
    fixed = []
    for i, (a, b, rs) in enumerate(out):
        nxt = out[i + 1][0] - 1 if i + 1 < len(out) else 2100
        fixed.append((a if i else -10000, max(b, nxt), rs))
    return fixed


def stories(repo):
    d = os.path.join(repo, 'data', 'deep', 'stories')
    out = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith('.json'):
            out += json.load(open(os.path.join(d, f), encoding='utf-8'))['stories']
    return out


def write(repo, side_dir):
    wd, pd = os.path.join(side_dir, 'world'), os.path.join(side_dir, 'packs')
    os.makedirs(wd, exist_ok=True); os.makedirs(pd, exist_ok=True)
    base = []
    for i, (a, b, rs) in enumerate(slices(base_rows())):
        f = f'base-{i}.json'
        open(os.path.join(wd, f), 'w', encoding='utf-8').write(J(rs))
        base.append({'f': f, 't0': a, 't1': b, 'n': len(rs)})
    packs = []
    src = os.path.join(repo, 'data', 'deep', 'packs')
    for f in sorted(os.listdir(src)) if os.path.isdir(src) else []:
        if not f.endswith('.json'):
            continue
        pk = json.load(open(os.path.join(src, f), encoding='utf-8'))
        open(os.path.join(pd, f), 'w', encoding='utf-8').write(J(pk))
        packs.append({k: pk[k] for k in ('id', 'name', 'bbox', 't0', 't1', 'n', 'kinds')} | {'f': f})
    S = stories(repo)
    open(os.path.join(wd, 'stories.json'), 'w', encoding='utf-8').write(J({'stories': S}))
    dens = os.path.join(repo, 'data', 'coverage', 'geo', 'density.json')
    if os.path.exists(dens):
        shutil.copy(dens, os.path.join(wd, 'density.json'))
    ix = {'built': A.time.strftime('%Y-%m-%d'), 'base': base, 'packs': packs, 'stories_file': 'stories.json',
          'stories': [{'id': s['id'], 'title': s['title'], 'region': s.get('region', ''), 'start': s['start'], 'end': s['end'], 'view': s['view'],
                       'blurb': s['blurb'], 'n': len(s['steps'])} for s in S],
          'sources': {'chronicle': 'Wikidata (CC0), dated events of 38 classes, queried 2026-10-25', 'lives': 'Pantheon 2025 update (Yu et al. 2016), CC BY-SA 4.0',
                      'kernel': 'Atlas kernel (dist/kernel.json), each record with its own sources',
                      'stories': 'Study storylines: draft text written from the English Wikipedia article named on each step, waiting for the judge'}}
    open(os.path.join(wd, 'index.json'), 'w', encoding='utf-8').write(J(ix))
    tot = sum(os.path.getsize(os.path.join(wd, f)) for f in os.listdir(wd)) + sum(os.path.getsize(os.path.join(pd, f)) for f in os.listdir(pd))
    print(f'world index: {len(base)} slices ({sum(c["n"] for c in base)} rows), {len(packs)} packs, {len(S)} storylines, {tot // 1024} KB', file=sys.stderr)
    return ix


if __name__ == '__main__':
    write(A.REPO, os.path.join(sys.argv[1], 'atlas-files'))
