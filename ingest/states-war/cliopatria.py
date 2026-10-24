#!/usr/bin/env python3
"""Cliopatria (Seshat) -> polity records, area measures, membership relations and border snapshots.

Usage:
  python3 ingest/states-war/cliopatria.py            # downloads the release into raw/states-war/ if missing
Needs node (npx mapshaper) for the one simplification pass; everything else is the standard library.

Writes into data/states-war/:
  polities.jsonl            one polity per Cliopatria name (1,600+), with Wikidata and Seshat ids
  polity-relations.jsonl    part_of (members of a composite empire, vassals) and allied_with (alliances, unions)
  polity-area.jsonl         m:area:<polity>:cliopatria, one point per Cliopatria row
  geo/borders.geojson       border polygons sampled every 25 years from 3400 BCE to 2024
"""
import glob, json, os, re, subprocess, sys, urllib.request, zipfile
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'states-war')
OUT = os.path.join(ROOT, 'data', 'states-war')
VERSION = 'v0.2.1'
ZIP_URL = 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip'
SRC = {'cite': f'Cliopatria {VERSION}, Seshat Global History Databank (Bennett et al. 2025, Scientific Data, doi:10.1038/s41597-025-04516-9), CC BY 4.0',
       'url': 'https://github.com/Seshat-Global-History-Databank/cliopatria'}
STEP, FIRST, LAST = 25, -3400, 2024
SIMPLIFY = '2%'

# Living Atlas already uses these ids for its empires layer. Reusing them means the Living Atlas
# stubs merge into these records instead of sitting beside them as duplicates.
LIVING_ATLAS = {
    'akkad': 'Akkadian Empire', 'egypt_nk': 'New Kingdom of Egypt', 'hittite': 'Hittites',
    'assyria': 'Neo-Assyrian Empire', 'babylonia': 'Neo-Babylonian Empire', 'zhou': 'Zhou Dynasty',
    'achaemenid': 'Achaemenid Empire', 'carthage_e': 'Carthage', 'macedon': 'Macedonian Empire',
    'maurya': 'Maurya Empire', 'seleucid': 'Seleucid Empire', 'ptolemaic': 'Ptolemaic Kingdom',
    'qin': 'Qin Dynasty', 'xiongnu': 'Xiongnu', 'han': 'Han Dynasty', 'roman_rep': 'Roman Republic',
    'roman': 'Roman Empire', 'parthian': 'Parthian Empire', 'kushan': 'Kushan Empire',
    'aksum_e': 'Kingdom of Axum', 'sasanian': 'Sasanian Empire', 'gupta': 'Gupta Empire',
    'hunnic': 'Hunnic Empire', 'byzantine': 'Byzantine Empire', 'ghana_e': 'Ghana Empire',
    'sui': 'Sui Dynasty', 'tang': 'Tang Dynasty', 'tibetan': 'Tibetan Empire', 'umayyad': 'Umayyad Caliphate',
    'abbasid': 'Abbasid Caliphate', 'srivijaya': 'Srivijaya', 'carolingian': '(Carolingian Empire)',
    'khmer': 'Khmer Empire', 'chola': 'Chola Empire', 'fatimid': 'Fatimid Caliphate', 'liao': 'Liao Dynasty',
    'hre': 'Holy Roman Empire', 'song': 'Northern Song', 'seljuk': 'Great Seljuk Empire',
    'almohad': 'Almohad Caliphate', 'delhi_s': '(Delhi Sultanate)', 'mongol': 'Mongol Empire',
    'mali': 'Mali Empire', 'mamluk': 'Mamluk Sultanate', 'ottoman': 'Ottoman Empire',
    'vijayanagara_e': 'Vijayanagara Empire', 'timurid': 'Timurid Empire', 'ming': 'Ming Dynasty',
    'aztec': 'Aztec Triple Alliance', 'inca': 'Inca Empire', 'songhai': 'Songhai Empire',
    'portuguese': 'Portuguese Empire', 'spanish': 'Spanish Empire', 'safavid': 'Safavid Dynasty',
    'mughal': 'Mughal Empire', 'british': '(British Empire)', 'plc': 'Polish-Lithuanian Commonwealth',
    'qing': 'Qing Dynasty', 'russian': 'Russian Empire', 'usa': 'United States of America',
    'japan_e': 'Empire of Japan', 'german_e': 'German Empire', 'habsburg': 'Habsburg Monarchy',
    'austria_h': 'Austria-Hungary', 'ussr': 'Union of Soviet Socialist Republics',
}

SUBTYPES = [('caliphate', 'caliphate'), ('sultanate', 'kingdom'), ('khaganate', 'empire'), ('khanate', 'kingdom'),
            ('empire', 'empire'), ('dynasty', 'empire'), ('kingdom', 'kingdom'), ('kingdoms', 'kingdom'),
            ('republic', 'republic'), ('confederation', 'confederation'), ('confederacy', 'confederation'),
            ('league', 'confederation'), ('city', 'city_state'), ('city-states', 'city_state')]


def slug(s):
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', s.lower().replace('ü', 'u').replace('ö', 'o')
                                     .replace('é', 'e').replace('á', 'a').replace('ç', 'c'))).strip('_')


def yr(y, end=False):
    """Cliopatria uses year 0; the kernel has none."""
    return (-1 if end else 1) if y == 0 else y


def subtype(name):
    words = re.findall(r'[a-z-]+', name.lower())
    for w, t in SUBTYPES:
        if w in words:
            return t
    return None


def fetch():
    os.makedirs(RAW, exist_ok=True)
    gj = [f for f in os.listdir(RAW) if f.endswith('.geojson') and 'simplified' not in f]
    if not gj:
        z = os.path.join(RAW, 'cliopatria.geojson.zip')
        if not os.path.exists(z):
            print('downloading', ZIP_URL)
            urllib.request.urlretrieve(ZIP_URL, z)
        zipfile.ZipFile(z).extractall(RAW)
        gj = [f for f in os.listdir(RAW) if f.endswith('.geojson') and 'simplified' not in f]
    src = os.path.join(RAW, gj[0])
    simp = os.path.join(RAW, f'simplified-{SIMPLIFY.strip("%")}.geojson')
    if not os.path.exists(simp):
        print('simplifying with mapshaper (about a minute)')
        subprocess.run(['npx', '--yes', 'mapshaper@0.6.102', src, '-filter', "Type=='POLITY'",
                        '-simplify', SIMPLIFY, 'keep-shapes', '-o', simp, 'precision=0.01'],
                       check=True, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=8000'})
    return src, simp


def main():
    src, simp = fetch()
    rows = [f['properties'] for f in json.load(open(src))['features']]
    by_name = defaultdict(list)
    for p in rows:
        by_name[p['Name']].append(p)

    # ids: Living Atlas ids first, then slugs; composites "(X)" get a _group suffix
    ids, taken = {}, set()
    for lid, name in LIVING_ATLAS.items():
        assert name in by_name, f'Living Atlas mapping: no Cliopatria polity named {name!r}'
        ids[name] = 'polity:' + lid
        taken.add(lid)
    for name in sorted(by_name):
        if name in ids:
            continue
        s = slug(name) + ('_group' if name.startswith('(') else '')
        base, n = s, 2
        while s in taken:
            s, n = f'{base}_{n}', n + 1
        taken.add(s)
        ids[name] = 'polity:' + s

    polities, measures, rels = [], [], []
    for name, rs in sorted(by_name.items(), key=lambda kv: ids[kv[0]]):
        rs.sort(key=lambda p: p['FromYear'])
        kind = rs[0]['Type']
        if kind == 'RELATION':
            rels += relation_records(name, rs, ids)
            continue
        start, end = yr(rs[0]['FromYear']), max(yr(p['ToYear'], True) for p in rs)
        peak = max(rs, key=lambda p: p['Area'])
        wd = Counter(p['Wikidata'] for p in rs if p['Wikidata']).most_common(1)
        wp = Counter(p['Wikipedia'] for p in rs if p['Wikipedia']).most_common(1)
        seshat = sorted({s for p in rs for s in p['SeshatID'].split(';') if s})
        r = {'id': ids[name], 'kind': 'polity', 'name': name.strip('()'), 'lenses': ['order', 'military'],
             'start': start, 'end': None if end >= LAST else end}
        st = subtype(name)
        if st:
            r['subtype'] = st
        r['peak'] = [yr(peak['FromYear']), max(round(peak['Area'] / 1e6, 6), 1e-6)]
        if wd:
            r['wikidata'] = wd[0][0]
        ext = {'cliopatria': name}
        if seshat:
            ext['seshat'] = seshat
        if wp:
            ext['wikipedia'] = wp[0][0]
        r['ext'] = ext
        if name.startswith('('):
            r['tags'] = ['composite']
            r['what'] = f'A grouping of polities in Cliopatria, drawn as one realm: {r["name"]}.'
        r['sources'] = [SRC]
        r['status'] = 'sourced'
        polities.append(r)
        pts = {}
        for p in rs:
            y = yr(p['FromYear'])
            pts[y] = max(pts.get(y, 0), round(p['Area'] / 1e6, 4))
        measures.append({'id': f'm:area:{ids[name][7:]}:cliopatria', 'kind': 'measure', 'of': ids[name],
                         'metric': 'area', 'unit': 'million_km2', 'points': [[y, v] for y, v in sorted(pts.items())],
                         'lenses': ['order', 'geography'], 'sources': [SRC], 'status': 'sourced'})
        # membership of composite empires, merged into contiguous spans
        spans = defaultdict(list)
        for p in rs:
            for g in p['MemberOf'].split(';'):
                if g:
                    spans[g].append((yr(p['FromYear']), yr(p['ToYear'], True)))
        for g, sp in spans.items():
            for a, b in merge_spans(sp):
                rels.append({'id': f'rel:{ids[name][7:]}_part_of_{ids[g][7:]}_{fmt(a)}', 'kind': 'relation',
                             'type': 'part_of', 'from': ids[name], 'to': ids[g], 'start': a, 'end': b,
                             'lenses': ['order'], 'sources': [SRC], 'status': 'sourced'})

    os.makedirs(os.path.join(OUT, 'geo'), exist_ok=True)
    write(os.path.join(OUT, 'polities.jsonl'), polities)
    # order-chaos already publishes the same Cliopatria area series for its 682 polities; don't clash with it
    taken_m = set()
    for path in glob.glob(os.path.join(ROOT, 'data', '*', '*.jsonl')):
        if os.path.dirname(path) != OUT:
            taken_m |= {json.loads(l).get('id') for l in open(path, encoding='utf-8') if l.strip()}
    write(os.path.join(OUT, 'polity-area.jsonl'), [m for m in measures if m['id'] not in taken_m])
    write(os.path.join(OUT, 'polity-relations.jsonl'), rels)
    snapshots(simp, ids)
    print(f'{len(polities)} polities, {len(measures)} area series, {len(rels)} relations')


def relation_records(name, rs, ids):
    """'(Alliance between A and B)', '(Allegiance of A to B)', '(Vassalage of A to B)', '(Personal union of A with B)'."""
    comps = [c for c in rs[0]['Components'].split(';') if c]
    inner = name.strip('()')
    m = re.match(r'(Allegiance|Vassalage) of (.+) to (.+)$', inner)
    if m:
        a, b, typ, note = m.group(2), m.group(3), 'part_of', m.group(1).lower()
    else:
        m = re.match(r'(?:Alliance between (.+) and (.+)|Personal union of (.+) with (.+))$', inner)
        a, b = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        typ, note = 'allied_with', 'alliance' if m.group(1) else 'personal union'
    if a not in ids or b not in ids:  # fall back on the Components column
        a, b = comps[0], comps[1]
    out = []
    for s, e in merge_spans([(yr(p['FromYear']), yr(p['ToYear'], True)) for p in rs]):
        out.append({'id': f'rel:{ids[a][7:]}_{typ}_{ids[b][7:]}_{fmt(s)}', 'kind': 'relation', 'type': typ,
                    'from': ids[a], 'to': ids[b], 'start': s, 'end': e, 'note': note,
                    'lenses': ['order', 'military'], 'sources': [SRC], 'status': 'sourced'})
    return out


def merge_spans(sp):
    sp = sorted(sp)
    out = [list(sp[0])]
    for a, b in sp[1:]:
        if a <= out[-1][1] + 1 or (out[-1][1] == -1 and a == 1):
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def fmt(y):
    return f'bc{-y}' if y < 0 else str(y)


def snapshots(simp, ids):
    """Every 25 years, the rows in force that year. Members of a composite are drawn and carry the
    composite's id as `group`; a composite's own polygon is drawn only when none of its members is."""
    feats = json.load(open(simp))['features']
    years = [y if y != 0 else 1 for y in range(FIRST, LAST, STEP)] + [LAST]
    keep = {}
    for y in years:
        live = [i for i, f in enumerate(feats) if f['properties']['FromYear'] <= y <= f['properties']['ToYear']]
        groups_with_members = {g for i in live for g in feats[i]['properties']['MemberOf'].split(';') if g}
        for i in live:
            n = feats[i]['properties']['Name']
            if n.startswith('(') and n in groups_with_members:
                continue
            keep.setdefault(i, []).append(y)
    out = []
    for i in sorted(keep, key=lambda i: (feats[i]['properties']['FromYear'], feats[i]['properties']['Name'])):
        p = feats[i]['properties']
        g = p['MemberOf'].split(';')[0]
        props = {'ref': ids[p['Name']], 'name': p['Name'].strip('()'), 'from': yr(p['FromYear']),
                 'to': yr(p['ToYear'], True), 'years': keep[i], 'area_km2': round(p['Area'])}
        if g:
            props['group'] = ids[g]
        out.append({'type': 'Feature', 'properties': props, 'geometry': feats[i]['geometry']})
    path = os.path.join(OUT, 'geo', 'borders.geojson')
    with open(path, 'w') as f:
        f.write('{"type":"FeatureCollection","source":' + json.dumps(SRC) + ',"years":' + json.dumps(years) +
                ',"features":[\n' + ',\n'.join(json.dumps(x, separators=(',', ':')) for x in out) + '\n]}\n')
    print(f'{len(out)} border polygons across {len(years)} snapshots -> {os.path.relpath(path, ROOT)}')


def write(path, recs):
    with open(path, 'w', encoding='utf-8') as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
