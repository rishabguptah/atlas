#!/usr/bin/env python3
"""Write data/art-architecture/*.jsonl from the curated tables plus the Wikidata pulls in raw/art/.

  python3 ingest/art-architecture/resolve.py     # curated monuments -> Wikidata ids, coordinates, inception
  python3 ingest/art-architecture/wikidata.py    # notable buildings tagged with a style we map
  python3 ingest/art-architecture/build.py       # -> styles.jsonl, monuments.jsonl, wikidata.jsonl, relations.jsonl

Prints every curated date that disagrees with Wikidata's inception by more than 60 years, for checking.
"""
import json, os, re, sys
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curated import STYLES, FAMILIES, M, INFLUENCE, MADE_AT

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data/art-architecture')
RAW = os.path.join(ROOT, 'raw/art')
WP = lambda t: 'https://en.wikipedia.org/wiki/' + t.replace(' ', '_')
NOTE = 'Art and architecture workstream: written from general knowledge, check against this article'

# The English Wikipedia article each style's text should be checked against.
STYLE_ARTICLE = {
    'cave_art': 'Cave painting', 'megalithic': 'Megalith', 'mesopotamian': 'Architecture of Mesopotamia',
    'egyptian': 'Ancient Egyptian architecture', 'kushite': 'Nubian pyramids', 'aegean': 'Minoan palaces',
    'achaemenid': 'Achaemenid architecture', 'sasanian': 'Sasanian architecture', 'greek': 'Ancient Greek architecture',
    'hellenistic': 'Hellenistic art', 'roman': 'Ancient Roman architecture', 'indus': 'Indus Valley Civilisation',
    'buddhist': 'Buddhist architecture', 'gandhara': 'Greco-Buddhist art', 'hindu_temple': 'Hindu temple architecture',
    'indo_islamic': 'Mughal architecture', 'chinese': 'Chinese architecture', 'japanese': 'Japanese architecture',
    'khmer': 'Khmer architecture', 'early_islamic': 'Umayyad architecture', 'moorish': 'Moorish architecture',
    'persianate': 'Persian architecture', 'ottoman': 'Ottoman architecture', 'sahel': 'Sudano-Sahelian architecture',
    'swahili': 'Swahili architecture', 'byzantine': 'Byzantine architecture', 'russian': 'Russian church architecture',
    'romanesque': 'Romanesque architecture', 'gothic': 'Gothic architecture', 'ethiopian': 'Ethiopian architecture',
    'zimbabwe': 'Great Zimbabwe', 'renaissance': 'Renaissance architecture', 'baroque': 'Baroque architecture',
    'neoclassical': 'Neoclassical architecture', 'mesoamerican': 'Mesoamerican architecture', 'andean': 'Inca architecture',
    'puebloan': 'Ancestral Puebloans', 'mississippian': 'Mississippian culture', 'pacific': 'Moai',
    'gothic_revival': 'Gothic Revival architecture', 'beaux_arts': 'Beaux-Arts architecture', 'art_nouveau': 'Art Nouveau',
    'art_deco': 'Art Deco', 'modernism': 'Modern architecture', 'contemporary': 'Contemporary architecture',
    'chinese_landscape': 'Shan shui', 'persian_miniature': 'Persian miniature', 'ukiyo_e': 'Ukiyo-e',
    'impressionism': 'Impressionism', 'modern_art': 'Modern art', 'african_bronze': 'Benin Bronzes',
}


def wd_year(t):
    """Wikidata time string ('+1163-01-01T00:00:00Z', '-0600-...') to our integer year (no year 0)."""
    if not t:
        return None
    m = re.match(r'^([+-]?)(\d+)-', t.lstrip('+') if t.startswith('+') else t)
    if not m:
        return None
    y = int(m.group(2))
    if t.startswith('-'):
        return -y if y else -1
    return y or 1


def km(a, b):
    from math import radians, sin, cos, asin, sqrt
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def write(name, rows):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{name}: {len(rows)}')


def main():
    os.makedirs(OUT, exist_ok=True)
    resolved = json.load(open(os.path.join(RAW, 'resolved.json')))
    sid = lambda s: 'idea:style:' + s

    styles = []
    for slug, s in STYLES.items():
        lat, lon, where = s['origin']
        r = {'id': sid(slug), 'kind': 'idea', 'subtype': 'style', 'name': s['name'], 'lenses': ['art'],
             'family': s['family'], 'family_name': FAMILIES[s['family']], 'start': s['start'], 'end': s['end']}
        if s.get('approx'):
            r['start_approx'] = True
        r.update({'lat': lat, 'lon': lon, 'origin': where, 'what': s['what'], 'why': s['why'], 'spread': s['spread']})
        if s['wd']:
            r['wikidata'] = s['wd'][0]
            r['ext'] = {'wikidata_styles': s['wd']}
        r['sources'] = [{'cite': 'Wikipedia: ' + STYLE_ARTICLE[slug], 'url': WP(STYLE_ARTICLE[slug]), 'note': NOTE}]
        r['status'] = 'draft'
        styles.append(r)

    mons, rels, curated_q, curated_pts, off = [], [], set(), [], []
    for slug, title, sts, start, end, what, x in M:
        for s in sts:
            assert s in STYLES, (slug, s)
        if x.get('place'):  # a Living Atlas wonder: link it to its style instead of copying it
            for s in sts:
                rels.append({'id': f'rel:art:{slug}_{s}', 'kind': 'relation', 'type': 'part_of', 'from': x['place'], 'to': sid(s),
                             'lenses': ['art'], 'note': what, 'start': start,
                             'sources': [{'cite': 'Wikipedia: ' + STYLE_ARTICLE[s], 'url': WP(STYLE_ARTICLE[s]), 'note': NOTE}], 'status': 'draft'})
            continue
        res = resolved.get(title) or {}
        r = {'id': 'work:art:' + slug, 'kind': 'work', 'subtype': x.get('kind', 'building'), 'name': title.split(' (')[0] if x.get('kind') == 'artwork' else title,
             'lenses': ['art'], 'styles': [sid(s) for s in sts], 'start': start, 'end': end}
        if x.get('approx'):
            r['start_approx'] = True
        if title in MADE_AT:
            lat, lon, where = MADE_AT[title]
            r.update({'lat': lat, 'lon': lon, 'made_at': where})
        elif res.get('coord'):
            r.update({'lat': res['coord'][0], 'lon': res['coord'][1]})
        else:
            raise SystemExit(f'no coordinates for {title}')
        if x.get('causes'):
            r['causes'] = x['causes']
        r['what'] = what
        if res.get('qid'):
            r['wikidata'] = res['qid']
            curated_q.add(res['qid'])
        src = [{'cite': 'Wikipedia: ' + title, 'url': res.get('url') or WP(title), 'note': NOTE}]
        if res.get('qid'):
            src.append({'cite': 'Wikidata ' + res['qid'] + ' (coordinates' + (', inception' if res.get('inc') else '') + ')',
                        'url': 'https://www.wikidata.org/wiki/' + res['qid']})
        r['sources'] = src
        r['status'] = 'draft'
        wy = wd_year(res.get('inc'))
        if wy is not None and abs(wy - start) > 60:
            off.append(f'  {title}: curated {start}, Wikidata inception {wy}')
        mons.append(r)
        curated_pts.append((r['lat'], r['lon']))

    for a, b, conf, note in INFLUENCE:
        rels.append({'id': f'rel:art:influence:{a}__{b}', 'kind': 'relation', 'type': 'influenced', 'from': sid(a), 'to': sid(b),
                     'lenses': ['art'], 'confidence': conf, 'note': note,
                     'sources': [{'cite': 'Wikipedia: ' + STYLE_ARTICLE[b], 'url': WP(STYLE_ARTICLE[b]), 'note': NOTE}], 'status': 'draft'})

    # Wikidata buildings: one record per item, every mapped style it carries.
    q2style = {q: slug for slug, s in STYLES.items() for q in s['wd']}
    wd = defaultdict(lambda: {'styles': set()})
    path = os.path.join(RAW, 'wikidata_buildings.json')
    rows = json.load(open(path))['rows'] if os.path.exists(path) else []
    for r in rows:
        q = r['b']['value'].rsplit('/', 1)[1]
        d = wd[q]
        d['styles'].add(q2style[r['style']['value'].rsplit('/', 1)[1]])
        d.setdefault('name', r.get('bLabel', {}).get('value'))
        if 'coord' not in d:
            lon, lat = map(float, r['coord']['value'][6:-1].split()[:2])
            d['coord'] = (round(lat, 4), round(lon, 4))
        for k in ('inc', 'end'):
            y = wd_year(r.get(k, {}).get('value'))
            if y is not None:
                d[k] = min(d.get(k, y), y) if k == 'inc' else max(d.get(k, y), y)
        d['sl'] = int(r['sl']['value'])
        if r.get('a'):
            d['a'] = r['a']['value']
        if r.get('cLabel'):
            d['country'] = r['cLabel']['value']
    wrows, skipped = [], Counter()
    for q, d in sorted(wd.items(), key=lambda kv: -kv[1]['sl']):
        if q in curated_q:
            skipped['already curated'] += 1; continue
        if not d.get('name') or d.get('inc') is None:
            skipped['no English name or no inception date'] += 1; continue
        lat, lon = d['coord']
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            skipped['bad coordinates'] += 1; continue
        if any(km((lat, lon), p) < 0.15 for p in curated_pts):
            skipped['same spot as a curated monument'] += 1; continue
        end = d.get('end')
        if end is not None and end < d['inc']:
            end = None
        r = {'id': 'work:art:' + q.lower(), 'kind': 'work', 'subtype': 'building', 'name': d['name'], 'lenses': ['art'],
             'styles': sorted(sid(s) for s in d['styles']), 'start': d['inc']}
        if end is not None:
            r['end'] = end
        first = min(STYLES[x]['start'] for x in d['styles'])
        if d['inc'] < first - 25 and (end is None or end > first):
            # Founded before its style existed: rebuilt or remodelled in it later. Show it in the style from then.
            r['styled_from'] = first
            skipped['founded before its style (kept, styled_from set)'] += 1
        r.update({'lat': lat, 'lon': lon, 'wikidata': q})
        if d.get('country'):
            r['today'] = d['country']
        r['sitelinks'] = d['sl']
        src = [{'cite': f'Wikidata {q}: architectural style (P149), inception (P571), coordinates (P625)', 'url': 'https://www.wikidata.org/wiki/' + q}]
        if d.get('a'):
            src.append({'cite': 'Wikipedia: ' + d['a'].rsplit('/', 1)[1].replace('_', ' '), 'url': d['a']})
        r['sources'] = src
        r['status'] = 'sourced'
        wrows.append(r)

    write('styles.jsonl', styles)
    write('monuments.jsonl', mons)
    write('wikidata.jsonl', wrows)
    write('relations.jsonl', rels)
    print('wikidata skipped:', dict(skipped))
    print('curated dates far from Wikidata inception (often Wikidata dates a rebuild or a later phase):')
    print('\n'.join(off) or '  none')


if __name__ == '__main__':
    main()
