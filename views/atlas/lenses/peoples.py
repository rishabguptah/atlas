# Peoples & languages lens data: languages (Glottolog), ancient genomes (AADR), and the curated
# spreads, scripts, language deaths and ancient-DNA findings, compacted for the page.
import json, os

FAM_COLORS = ['#c9604d', '#4f8fc0', '#d19a2e', '#5aa36b', '#9b6bb8', '#c77aa0', '#3fa3a0', '#a7a14a',
              '#e08a5a', '#6f7fd0', '#b5865e', '#7fb04f', '#d46a8a', '#5e9db8', '#c2a46e', '#8f6fa0']
AES = {'not endangered': 0, 'threatened': 1, 'shifting': 2, 'moribund': 3, 'nearly extinct': 4, 'extinct': 5}


def build(repo):
    d = os.path.join(repo, 'data', 'peoples-languages')
    rows = lambda f: [json.loads(l) for l in open(os.path.join(d, f), encoding='utf-8') if l.strip()]
    r2 = lambda v: round(v, 2)
    langs = rows('languages.jsonl')
    fams = sorted((r for r in langs if r['subtype'] == 'family'), key=lambda r: -r['n_languages'])
    fi = {r['id']: i for i, r in enumerate(fams)}
    out = {'fams': [[r['id'], r['name'], r['n_languages'], FAM_COLORS[i] if i < len(FAM_COLORS) else None] for i, r in enumerate(fams)]}
    br = [r for r in langs if r['subtype'] == 'branch']
    bi = {r['id']: i for i, r in enumerate(br)}
    out['branches'] = [r['name'] for r in br]
    # [lon, lat, family index or -1, branch index or -1, endangerment 0-5 or -1, first written, last written, name, glottocode]
    out['langs'] = [[r2(r['lon']), r2(r['lat']), fi.get(r.get('family'), -1), bi.get(r.get('branch'), -1),
                     AES.get(r.get('endangerment'), -1), (r.get('attested') or [None, None])[0], (r.get('attested') or [None, None])[1],
                     r['name'], r['id'][5:]] for r in langs if r['subtype'] == 'language' and 'lat' in r]
    # Ancient genomes: [lon, lat, year, group index, paper index]; tables hold the strings once.
    groups, gi, pubs, pi = [], {}, [], {}
    dna = []
    for r in rows('dna.jsonl'):
        g = r['group']
        if g not in gi:
            gi[g] = len(groups); groups.append(g)
        p = r['sources'][0]
        k = p['cite']
        if k not in pi:
            pi[k] = len(pubs); pubs.append([p['cite'], p.get('url')])
        dna.append([r2(r['lon']), r2(r['lat']), r['start'], gi[g], pi[k]])
    out.update(dna=dna, groups=groups, pubs=pubs)
    keep = lambda r, ks: {k: r[k] for k in ks if k in r}
    base = ('id', 'name', 'subtype', 'start', 'end', 'lat', 'lon', 'what', 'why', 'sources', 'links', 'language')
    out['spread'] = [keep(r, base + ('hypotheses', 'stages', 'start_range')) for r in rows('spread.jsonl')]
    sc = rows('scripts.jsonl')
    parent = {r['from']: r['to'] for r in sc if r['kind'] == 'relation'}
    out['scripts'] = [{**keep(r, base + ('origin',)), 'parent': parent.get(r['id']), 'iso': (r.get('ext') or {}).get('iso15924')}
                      for r in sc if r['kind'] == 'script']
    out['events'] = [keep(r, base) for r in rows('events.jsonl')]
    out['findings'] = [keep(r, base + ('ancestry_share',)) for r in rows('findings.jsonl')]
    return out


if __name__ == '__main__':
    import sys
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    s = json.dumps(build(repo), ensure_ascii=False, separators=(',', ':'))
    print(len(s), 'bytes')
    if len(sys.argv) > 1:
        open(sys.argv[1], 'w', encoding='utf-8').write(s)
