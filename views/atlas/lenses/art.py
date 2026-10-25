"""Art & architecture lens for the one-page Atlas: styles, the monuments and works that define them,
Wikidata's styled buildings, and which styles shaped which. Reads data/art-architecture/ and the
Living Atlas wonders it reuses."""
import json, os

FAMILY_COLOR = {
    'prehistoric': '#8a6f4e', 'ancient_near_east': '#b8862f', 'classical': '#6f7fa8', 'south_asia': '#c0602c',
    'east_asia': '#b23a3a', 'islamic': '#2f8a7a', 'christian_medieval': '#6b4f9e', 'european_early_modern': '#a8577a',
    'americas': '#7a8f2f', 'africa': '#9a5a2a', 'pacific': '#3f7fa0', 'modern': '#4a4a58', 'painting': '#c48a1e',
}


def rows(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()] if os.path.exists(path) else []


def build(repo):
    d = os.path.join(repo, 'data/art-architecture')
    styles = rows(os.path.join(d, 'styles.jsonl'))
    six = {s['id']: i for i, s in enumerate(styles)}
    fams = sorted({s['family'] for s in styles}, key=list(FAMILY_COLOR).index)
    fix = {f: i for i, f in enumerate(fams)}
    src = lambda r: [[s['cite'], s.get('url')] for s in r.get('sources', [])]
    out = {
        'families': [[f, next(s['family_name'] for s in styles if s['family'] == f), FAMILY_COLOR[f]] for f in fams],
        'styles': [{'id': s['id'], 'n': s['name'], 'f': fix[s['family']], 's': s['start'], 'e': s['end'], 'a': int(bool(s.get('start_approx'))),
                    'lat': s['lat'], 'lon': s['lon'], 'o': s['origin'], 'w': s['what'], 'y': s['why'], 'sp': s['spread'], 'src': src(s)} for s in styles],
        'infl': [], 'mons': [],
    }
    wonders = {r['id']: r for r in rows(os.path.join(repo, 'data/living-atlas/places.jsonl'))}
    # Monument rows: [id, name, [style idx], start, end, lat, lon, kind 0 building / 1 artwork, curated 1/0, what, sitelinks, styled_from, sources, causes]
    for r in rows(os.path.join(d, 'relations.jsonl')):
        if r['type'] == 'influenced':
            out['infl'].append([six[r['from']], six[r['to']], r['confidence'], r['note']])
        elif r['type'] == 'part_of' and r['from'] in wonders:
            w = wonders[r['from']]
            prev = next((m for m in out['mons'] if m[0] == w['id']), None)
            if prev:
                prev[2].append(six[r['to']]); continue
            out['mons'].append([w['id'], w['name'], [six[r['to']]], w.get('start'), w.get('end'), round(w['lat'], 3), round(w['lon'], 3),
                                0, 1, r.get('note') or w.get('what'), None, None, src(w), w.get('causes')])
    for f in ('monuments.jsonl', 'wikidata.jsonl'):
        for r in rows(os.path.join(d, f)):
            cur = f == 'monuments.jsonl'
            out['mons'].append([r['id'], r['name'], [six[s] for s in r['styles']], r['start'], r.get('end'), round(r['lat'], 3), round(r['lon'], 3),
                                int(r['subtype'] == 'artwork'), int(cur), r.get('what') if cur else r.get('today'), r.get('sitelinks'),
                                r.get('styled_from'), src(r) if cur else r.get('wikidata'), r.get('causes')])
    return out
