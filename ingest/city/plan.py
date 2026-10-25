# City plans by date: walls, gates, towers, harbours and landmark buildings for each city in data/cities/cities.json,
# written to data/cities/plans/<id>.json for the city layer (views/pixel/city.js).
#   walls      OpenStreetMap wall lines and gates (via Overture Maps: city_wall, city_gate, fortification), dated through the
#              Wikidata item they carry or name, else left undated (conf unknown, drawn faint)
#   landmarks  Wikidata items with coordinates in the city box and a start date (inception or opening), with an end
#              date when destroyed or dissolved, kind from their class
#   drafts     data/cities/plans/drafts/<id>.json: features written by Claude from named sources (conf estimated or
#              worse, status draft) for what neither source has, e.g. the chain across the Golden Horn in 1453, built-up
#              areas by period (k extent), lost walls, water since filled (k water); plus patches: k wall_dates
#              {match: wall name, t0, t1} and k rename {wd, names: [[t0, t1, name]], kinds: [[t0, t1, kind]]}
# Feature: {k, name, wd, t0, t1, conf, sl, at: [lon, lat]} or, for walls, {..., line: [[lon, lat], ...]}.
# conf: 0 attested, 1 estimated, 2 approximate, 3 unknown (the Atlas grammar).
# Usage: python3 ingest/city/plan.py [city_id ...]
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'europe-19c'))
import fetch as F  # noqa: E402
import wdq  # noqa: E402

wdq.RAW = F.RAW
OUT = os.path.join(F.REPO, 'data', 'cities', 'plans')
MAX_LANDMARKS = 400  # per city, the best known (most Wikipedia articles) first

# Kind from the English labels of an item's classes (first match wins).
KINDS = [
    ('gate', r'\bgate|gateway|porta\b'), ('wall', r'city wall|\bwalls?\b|rampart|fortification line|defensive wall'),
    ('fort', r'castle|fortress|\bfort\b|citadel|kremlin|bastion|redoubt|kasbah'), ('tower', r'\btower|minaret|belfry|campanile|lighthouse'),
    ('mosque', r'mosque|masjid|madrasa|külliye'), ('church', r'church|cathedral|basilica|chapel|monastery|abbey|convent|priory'),
    ('temple', r'temple|shrine|pagoda|stupa|synagogue|gurdwara|mandir'), ('palace', r'palace|residence|château|villa|mansion|imperial'),
    ('bridge', r'bridge|viaduct'), ('aqueduct', r'aqueduct|cistern|reservoir|fountain|well\b|bath|hammam|thermae'),
    ('forum', r'forum|square|plaza|hippodrome|stadium|circus|theatre|amphitheat|arena|agora'),
    ('tomb', r'tomb|mausoleum|cemetery|necropolis|türbe|pyramid'), ('market', r'market|bazaar|bazar|caravanserai|han\b|khan\b|souq|exchange'),
    ('column', r'column|obelisk|statue|monument|memorial|triumphal arch|arch\b'), ('harbour', r'harbou?r|port\b|dock|quay|arsenal|shipyard'),
    ('school', r'university|college|school|library|academy|observatory|museum'), ('house', r'house|building|hall|hospital|hotel|tower block'),
]
SKIP = r'neighbourhood|quarter|district|street|road|human settlement|city|municipality|metro station|railway station|bus|tram|park\b|garden|business|company|organization|event|human\b'


def kind_of(classes):
    s = ' | '.join(classes).lower()
    if re.search(SKIP, s) and not re.search(r'palace|church|mosque|temple|wall|gate|fort|tower|bridge|aqueduct|forum|tomb|market|column|harbou?r', s):
        return None
    if re.search(r'\bsiege|battle|war\b|council|treaty|empire|province|pogrom|riot|uprising|massacre|election|sports club|team\b|line\b|system\b', s):
        return None
    for k, rx in KINDS:
        if re.search(rx, s):
            return k
    return None  # not a structure the city plan can draw


def year_of(v):
    if not v or v[0] not in '+-0123456789':
        return None
    neg = v.startswith('-'); y = int(v.lstrip('+-').split('-')[0])
    return -(y + 1) if neg else y  # WDQS writes 1 BCE as year 0; the Atlas writes 480 BCE as -480


def box_items(city):
    """Wikidata items with coordinates in the box and a start date, with their classes, end date, sitelinks, labels."""
    w, s, e, n = city['bbox']
    q = f'''SELECT ?item ?lab ?coord ?start ?end ?sl (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?classes) WHERE {{
  SERVICE wikibase:box {{ ?item wdt:P625 ?coord . bd:serviceParam wikibase:cornerSouthWest "Point({w} {s})"^^geo:wktLiteral .
                          bd:serviceParam wikibase:cornerNorthEast "Point({e} {n})"^^geo:wktLiteral . }}
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= 2)
  OPTIONAL {{ ?item wdt:P571 ?inc . }} OPTIONAL {{ ?item wdt:P1619 ?open . }} OPTIONAL {{ ?item wdt:P580 ?st . }}
  BIND(COALESCE(?inc, ?open, ?st) AS ?start) FILTER(BOUND(?start))
  OPTIONAL {{ ?item wdt:P576 ?d1 . }} OPTIONAL {{ ?item wdt:P3999 ?d2 . }} OPTIONAL {{ ?item wdt:P582 ?d3 . }}
  BIND(COALESCE(?d1, ?d2, ?d3) AS ?end)
  OPTIONAL {{ ?item wdt:P31 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en") }}
  OPTIONAL {{ ?item rdfs:label ?lab . FILTER(LANG(?lab) = "en") }}
}} GROUP BY ?item ?lab ?coord ?start ?end ?sl'''
    return wdq.sparql(q, cache=f'wd_box_{city["id"]}')


def tagged_items(qids, city):
    """Dates, classes and labels for the Wikidata ids that OSM features carry."""
    out = []
    qids = sorted(qids)
    for i in range(0, len(qids), 300):
        vals = ' '.join('wd:' + q for q in qids[i:i + 300])
        q = f'''SELECT ?item ?lab ?start ?end ?sl (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?classes)
  (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {{
  VALUES ?item {{ {vals} }}
  ?item wikibase:sitelinks ?sl .
  OPTIONAL {{ ?item wdt:P571 ?inc . }} OPTIONAL {{ ?item wdt:P1619 ?open . }} OPTIONAL {{ ?item wdt:P580 ?st . }}
  BIND(COALESCE(?inc, ?open, ?st) AS ?start)
  OPTIONAL {{ ?item wdt:P576 ?d1 . }} OPTIONAL {{ ?item wdt:P3999 ?d2 . }} OPTIONAL {{ ?item wdt:P582 ?d3 . }}
  BIND(COALESCE(?d1, ?d2, ?d3) AS ?end)
  OPTIONAL {{ ?item wdt:P31 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en") }}
  OPTIONAL {{ ?item rdfs:label ?lab . FILTER(LANG(?lab) = "en") }}
  OPTIONAL {{ ?item rdfs:label ?alt . }}
}} GROUP BY ?item ?lab ?start ?end ?sl'''
        out += wdq.sparql(q, cache=f'wd_tags_{city["id"]}_{i}')
    return out


def r5(v):
    return round(v, 5)


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower().replace('ı', 'i')).strip()


def wall_rows(city):
    """Walls, gates, forts and towers from Overture (OpenStreetMap) as {kind, name, wd, tags, lines, at, id}."""
    out = []
    for f in json.load(open(f'{F.RAW}/ov_walls_{city["id"]}.json'))['features']:
        t, g = f.get('tags') or {}, f['geometry']
        name = f.get('name') or t.get('name') or ''
        wd = f.get('wikidata') or t.get('wikidata') or ''
        cl, hist = f.get('class') or '', t.get('historic', '')
        if cl in ('city_gate', 'sally_port') or hist == 'city_gate' or (cl in ('gate', 'entrance', 'defensive') and re.search(r'gate|porta|kap[ıi]|tor\b|puerta|porte|darwaza|mon\b', name, re.I)):
            kind = 'gate'
        elif cl == 'city_wall' or hist in ('citywalls', 'fortification') or t.get('barrier') == 'city_wall':
            kind = 'wall'
        elif hist in ('castle', 'fort'):
            kind = 'fort'
        elif hist == 'tower':
            kind = 'tower'
        else:
            continue
        ls = []
        def walk(gg):
            ty = gg.get('type')
            if ty == 'LineString': ls.append(gg['coordinates'])
            elif ty == 'MultiLineString': ls.extend(gg['coordinates'])
            elif ty == 'Polygon': ls.extend(gg['coordinates'][:1])
            elif ty == 'MultiPolygon': ls.extend(c[0] for c in gg['coordinates'] if c)
            elif ty == 'GeometryCollection':
                for x in gg['geometries']: walk(x)
        walk(g)
        pts = [c for L in ls for c in L]
        at = g['coordinates'][:2] if g.get('type') == 'Point' else ([sum(c[0] for c in pts) / len(pts), sum(c[1] for c in pts) / len(pts)] if pts else None)
        out.append({'kind': kind, 'name': name, 'wd': wd if re.fullmatch(r'Q\d+', wd) else '', 'tags': t, 'lines': [L for L in ls if len(L) > 1], 'at': at, 'id': f['id']})
    return out


def build(city):
    W = wall_rows(city)
    tag_q = {r['wd'] for r in W if r['wd']}
    T = {wdq.qid(r['item']): r for r in tagged_items(tag_q, city)} if tag_q else {}
    by_name = {}
    for q, r in T.items():
        for nm in [r.get('lab', '')] + (r.get('alts') or '').split('|'):
            if nm:
                by_name.setdefault(norm(nm), q)
    feats, seen_q = [], set()

    def dates(r):
        a, b = year_of(r.get('start')), year_of(r.get('end'))
        return a, (b if b is None or a is None or b >= a else None)  # an end before the start is an earlier building's

    # Walls first (OpenStreetMap lines), dated through their Wikidata item or name, else left undated.
    for w_ in W:
        q = w_['wd'] if w_['wd'] in T else by_name.get(norm(w_['name']))
        r = T.get(q) if q else None
        a, b = dates(r) if r else (None, None)
        sd = re.match(r'-?\d{1,4}', w_['tags'].get('start_date', '') or '')
        if a is None and sd:
            a = int(sd.group())
        conf = 0 if a is not None and r else 2 if a is not None else 3
        if w_['kind'] == 'wall':
            for L in w_['lines']:
                feats.append({'k': 'wall', 'name': w_['name'] or (r or {}).get('lab') or '', 'wd': q or None, 't0': a, 't1': b, 'conf': conf,
                              'line': [[r5(c[0]), r5(c[1])] for c in L]})
        elif w_['at'] and (a is not None or w_['name']):
            feats.append({'k': w_['kind'], 'name': w_['name'] or (r or {}).get('lab') or '', 'wd': q or None, 't0': a, 't1': b, 'conf': conf,
                          'sl': int(r['sl']) if r else 0, 'at': [r5(w_['at'][0]), r5(w_['at'][1])]})
        if q:
            seen_q.add(q)
    # Landmarks from the Wikidata box query.
    for r in box_items(city):
        q = wdq.qid(r['item'])
        k = kind_of((r.get('classes') or '').split('|'))
        a, b = dates(r)
        if not k or a is None or q in seen_q or a > 2025:
            continue
        lon, lat = wdq.point(r['coord'])
        feats.append({'k': k, 'name': r.get('lab') or q, 'wd': q, 't0': a, 't1': b, 'conf': 0, 'sl': int(r['sl']), 'at': [r5(lon), r5(lat)]})
        seen_q.add(q)
    # Claude's drafts.
    dp = os.path.join(OUT, 'drafts', city['id'] + '.json')
    nd = 0
    if os.path.exists(dp):
        for f in json.load(open(dp))['features']:
            f = dict(f); f['conf'] = max(1, int(f.get('conf', 1))); f['status'] = 'draft'
            if f['k'] == 'wall_dates':
                # Dates for OpenStreetMap wall lines that Wikidata leaves undated, matched by name.
                for w_ in feats:
                    if w_['k'] == 'wall' and w_['t0'] is None and norm(w_['name']) == norm(f['match']):
                        w_.update(t0=f['t0'], t1=f.get('t1'), conf=f['conf'], src=f.get('src'), status='draft')
                        if f.get('label'): w_['name'] = f['label']
                continue
            if f['k'] == 'rename':
                # Names (and kinds) by period for a landmark: a church that became a mosque, a street renamed.
                for g in feats:
                    if g.get('wd') == f.get('wd'):
                        g['names'] = f['names']
                        if f.get('kinds'): g['kinds'] = f['kinds']
                        if f.get('t0') is not None and (g.get('t0') is None or f.get('fix_dates')): g['t0'] = f['t0']
                        if f.get('fix_dates'): g['t1'] = f.get('t1')
                continue
            if f.get('wd') and f['wd'] in seen_q:
                continue
            feats.append(f); nd += 1
    feats.sort(key=lambda f: (f['k'] != 'wall', -(f.get('sl') or 0)))
    walls = [f for f in feats if f['k'] == 'wall']
    feats = walls + [f for f in feats if f['k'] != 'wall'][:MAX_LANDMARKS]
    out = {'id': city['id'], 'name': city['name'], 'bbox': city['bbox'], 't0': city['t0'], 't1': city['t1'], 'features': feats,
           'sources': {'walls': 'OpenStreetMap contributors (ODbL), via Overture Maps', 'landmarks': 'Wikidata (CC0): items with coordinates and dates in the box',
                       'drafts': 'data/cities/plans/drafts (Claude, from the sources named on each feature; unchecked)'}}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, city['id'] + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'  {city["id"]}: {len(walls)} wall lines ({sum(1 for f in walls if f["t0"] is not None)} dated), '
          f'{len(feats) - len(walls) - nd} landmarks, {nd} drafts', file=sys.stderr)


def main():
    for city in F.cities(sys.argv[1:] or None):
        if not os.path.exists(f'{F.RAW}/ov_walls_{city["id"]}.json'):
            print(f'  {city["id"]}: walls not downloaded yet (ingest/city/fetch.py), skipped', file=sys.stderr); continue
        build(city)


if __name__ == '__main__':
    main()
