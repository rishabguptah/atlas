#!/usr/bin/env python3
"""Border timeline: every change year in Cliopatria (about 500 frames from 3400 BCE to 2024) instead of the
49 historical-basemaps snapshots, fitted to real coastlines, at the same three zoom levels as precise_borders.py.

Usage: python3 ingest/geography/timeline_borders.py CLIOPATRIA NE_DIR MAPSHAPER OUT_DIR [CHANGES_JSON]
  CLIOPATRIA  cliopatria_polities_only_v021.geojson or the release zip (Seshat, CC BY 4.0)
  NE_DIR      Natural Earth ne_10m_land.geojson and ne_10m_lakes.geojson
  MAPSHAPER   path to the mapshaper CLI (npm i mapshaper), for shared arcs and simplification
  CHANGES_JSON  where to write the dated border changes for the Atlas (default data/states-war/geo/border-changes.json)

Cliopatria has one polygon per (polity, year range). A frame is a year where any range starts or ends; the
realms of year y are the rows with s <= y <= e. Rows are grouped into time chunks so a chunk file holds every
row alive in its span once, and the page filters by year:

  OUT_DIR/index.json            {years: [change years], chunks: [[a, b, file]], levels, source}
  OUT_DIR/l0|l1|l2/<file>.json  TopoJSON, one object "realms"; feature properties id (slug), n (stable numeric id,
                                OUT_DIR/realms.json), name, s, e (first and last year), part_of (slug of the empire
                                or kingdom it belongs to, for shared colours), la (Living Atlas empire id), wiki
Features are ordered biggest first, so vassals and enclaves drawn later sit on top of the realm around them.

Coasts: each row is clipped to Natural Earth 10m land (minus big lakes), and the strip of coast within 20 km
that the source left unclaimed, and that no other row of the same years claims, joins it.
"""
import json, math, os, re, subprocess, sys, tempfile, unicodedata, zipfile
from collections import defaultdict
from multiprocessing import Pool
import shapely
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC, NE, MAPSHAPER, OUT = sys.argv[1:5]
CHANGES = sys.argv[5] if len(sys.argv) > 5 else os.path.join(ROOT, 'data', 'states-war', 'geo', 'border-changes.json')
LEVELS = {'l0': (5000, 1e5), 'l1': (1500, 4e5), 'l2': (400, 2e6)}  # simplification interval (m), quantization
COAST = 0.2       # degrees of unclaimed coast a realm may grow into
CELL = 10         # degrees: land is cut into cells so clipping stays fast
MAX_ROWS = 450    # rows per time chunk
LAST = 2024
CITE = 'Cliopatria v0.2.1, Seshat Global History Databank (Bennett et al. 2025, Scientific Data, doi:10.1038/s41597-025-04516-9), CC BY 4.0'

# Living Atlas empire ids (views/atlas EMPIRES) for Cliopatria names, as in ingest/states-war/cliopatria.py
sys.path.insert(0, os.path.join(ROOT, 'ingest', 'states-war'))
sys.argv, _argv = sys.argv[:1], sys.argv
from cliopatria import LIVING_ATLAS  # noqa: E402
sys.argv = _argv
LA = {v: k for k, v in LIVING_ATLAS.items()}


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'unnamed'


def label(y):
    return f'bc{-y}' if y < 0 else str(y)


def group_of(member):
    """The realm a row is coloured with: the empire or kingdom it is part of, not an alliance partner."""
    for m in (member or '').split(';'):
        inner = m.strip().strip('()')
        if not inner or re.match(r'(Alliance between|Personal union of)', inner):
            continue
        v = re.match(r'(?:Vassalage|Allegiance|Tributary|Suzerainty) of .+ (?:to|of) (.+)$', inner)
        return (v.group(1) if v else inner), m.strip()
    return None, None


def load_rows():
    if SRC.endswith('.zip'):
        with zipfile.ZipFile(SRC) as z:
            name = next(n for n in z.namelist() if n.endswith('.geojson'))
            feats = json.load(z.open(name))['features']
    else:
        feats = json.load(open(SRC, encoding='utf-8'))['features']
    rows = []
    for f in feats:
        p = f['properties']
        if p.get('Type') != 'POLITY' or not f['geometry']:
            continue
        rows.append({'name': p['Name'], 's': int(p['FromYear']), 'e': int(p['ToYear']), 'area': p.get('Area') or 0,
                     'wiki': p.get('Wikipedia') or '', 'member': p.get('MemberOf') or '', 'geom': f['geometry']})
    return rows


# ---------- land and coast, shared with the worker processes ----------
LAND, LAND_TREE, BAND, BAND_TREE = [], None, [], None


def build_land():
    global LAND, LAND_TREE, BAND, BAND_TREE
    def polys(path, filt=None):
        out = []
        for f in json.load(open(path, encoding='utf-8'))['features']:
            if f['geometry'] and (not filt or filt(f['properties'])):
                out.append(shapely.make_valid(shape(f['geometry'])))
        return out
    land = polys(os.path.join(NE, 'ne_10m_land.geojson'))
    lakes = unary_union(polys(os.path.join(NE, 'ne_10m_lakes.geojson'), lambda p: (p.get('scalerank') or 0) <= 4))
    land = unary_union([g.difference(lakes) if g.intersects(lakes) else g for g in land])
    coast = land.boundary
    for x in range(-180, 180, CELL):
        for y in range(-90, 90, CELL):
            c = box(x, y, x + CELL, y + CELL)
            piece = land.intersection(c)
            if piece.is_empty:
                continue
            LAND.append(piece)
            band = coast.intersection(c.buffer(COAST)).buffer(COAST, quad_segs=4).intersection(piece)
            if not band.is_empty:
                BAND.append(band)
    LAND_TREE, BAND_TREE = shapely.STRtree(LAND), shapely.STRtree(BAND)


def polygonal(g):
    g = shapely.make_valid(g)
    if g.geom_type in ('Polygon', 'MultiPolygon'):
        return g
    parts = [p for p in getattr(g, 'geoms', []) if p.geom_type in ('Polygon', 'MultiPolygon')]
    return unary_union(parts) if parts else shapely.Polygon()


def clip(geom):
    g = shapely.make_valid(shape(geom))
    idx = LAND_TREE.query(g, predicate='intersects')
    return polygonal(unary_union([g.intersection(LAND[i]) for i in idx])) if len(idx) else shapely.Polygon()


CLIPPED, TIMES, CLIP_TREE = [], [], None


def grow(i):
    """Row i plus the unclaimed coast strip next to it."""
    g = CLIPPED[i]
    if g.is_empty:
        return g
    near = g.buffer(COAST, quad_segs=4)
    idx = BAND_TREE.query(near, predicate='intersects')
    if not len(idx):
        return g
    extra = unary_union([BAND[j].intersection(near) for j in idx]).difference(g)
    if extra.is_empty:
        return g
    s, e = TIMES[i]
    others = [CLIPPED[j] for j in CLIP_TREE.query(near, predicate='intersects')
              if j != i and TIMES[j][0] <= e and TIMES[j][1] >= s]
    if others:
        extra = extra.difference(unary_union(others))
    return polygonal(unary_union([g, extra])) if not extra.is_empty else g


def sq_km(g):
    if g.is_empty:
        return 0.0
    lat = g.centroid.y
    return g.area * 111.32 * 111.32 * math.cos(math.radians(lat))


def main():
    rows = load_rows()
    if os.environ.get('TB_SPAN'):  # quick test run: TB_SPAN=1000,1100
        lo, hi = map(int, os.environ['TB_SPAN'].split(','))
        rows = [r for r in rows if r['s'] <= hi and r['e'] >= lo]
    print(f'{len(rows)} polity rows', flush=True)
    build_land()
    print(f'land: {len(LAND)} cells, {len(BAND)} coast bands', flush=True)
    global CLIPPED, TIMES, CLIP_TREE
    with Pool(4) as pool:
        CLIPPED = pool.map(clip, [r['geom'] for r in rows], chunksize=40)
    print('clipped', flush=True)
    TIMES = [(r['s'], r['e']) for r in rows]
    CLIP_TREE = shapely.STRtree(CLIPPED)
    with Pool(4) as pool:
        grown = pool.map(grow, range(len(rows)), chunksize=40)
    print('coasts filled', flush=True)

    realms_path = os.path.join(OUT, 'realms.json')
    realms = json.load(open(realms_path)) if os.path.exists(realms_path) else {}
    keep = []
    for r, g, c in zip(rows, grown, CLIPPED):
        if g.is_empty:
            continue
        sid = slug(r['name'])
        if sid not in realms:
            realms[sid] = {'n': len(realms) + 1, 'name': r['name']}
        grp, rel = group_of(r['member'])
        r.update(id=sid, n=realms[sid]['n'], part_of=slug(grp) if grp else None,
                 la=LA.get(r['name']) or (LA.get(rel) if rel else None), g=g, c=c, km2=sq_km(g))
        keep.append(r)
    rows = keep
    os.makedirs(OUT, exist_ok=True)
    json.dump(realms, open(realms_path, 'w'), ensure_ascii=False, indent=0)

    # Frames: every year a row starts or the year after one ends.
    years = sorted({r['s'] for r in rows} | {r['e'] + 1 for r in rows if r['e'] < LAST})
    # Time chunks: consecutive frames while the rows they touch stay under MAX_ROWS.
    chunks, a = [], 0
    while a < len(years):
        b = a
        while b + 1 < len(years):
            lo, hi = years[a], years[b + 2] - 1 if b + 2 < len(years) else LAST
            if sum(1 for r in rows if r['s'] <= hi and r['e'] >= lo) > MAX_ROWS:
                break
            b += 1
        lo, hi = years[a], (years[b + 1] - 1 if b + 1 < len(years) else LAST)
        chunks.append([lo, hi, f'c_{label(lo)}'])
        a = b + 1
    print(f'{len(years)} frames in {len(chunks)} chunks', flush=True)
    if os.environ.get('TB_CHANGES_ONLY'):
        return write_changes(rows)
    for lo, hi, name in chunks:
        part = sorted([r for r in rows if r['s'] <= hi and r['e'] >= lo], key=lambda r: -r['km2'])
        fc = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': mapping(r['g']),
             'properties': {k: v for k, v in (('id', r['id']), ('n', r['n']), ('name', r['name']), ('s', r['s']), ('e', r['e']),
                                               ('part_of', r['part_of']), ('la', r['la']), ('wiki', r['wiki'])) if v not in (None, '')}}
            for r in part]}
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as tmp:
            json.dump(fc, tmp)
        sizes = []
        for lv, (interval, q) in LEVELS.items():
            os.makedirs(os.path.join(OUT, lv), exist_ok=True)
            out = os.path.join(OUT, lv, name + '.json')
            subprocess.run([MAPSHAPER, '-i', tmp.name, 'snap', 'snap-interval=0.0005', 'name=realms',
                            '-simplify', f'interval={interval}', 'keep-shapes',
                            '-o', out, 'format=topojson', f'quantization={int(q)}', 'precision=0.00001'],
                           check=True, capture_output=True)
            sizes.append(f'{lv} {os.path.getsize(out) // 1024} KB')
        os.unlink(tmp.name)
        print(f'{name} {lo}..{hi}: {len(part)} rows; {", ".join(sizes)}', flush=True)
    json.dump({'source': CITE, 'levels': {lv: v[0] for lv, v in LEVELS.items()}, 'years': years, 'chunks': chunks},
              open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
    write_changes(rows)


CH_ROWS, CH_TREE = [], None


def holder(piece, year, skip):
    """Who held most of piece in year (other than skip), if anyone held at least 30% of it."""
    best, ba = None, 0
    for j in CH_TREE.query(piece, predicate='intersects'):
        o = CH_ROWS[j]
        if o['id'] == skip or not (o['s'] <= year <= o['e']):
            continue
        a = o['m'].intersection(piece).area
        if a > ba:
            best, ba = o, a
    return best['name'] if best and ba > 0.3 * piece.area else None


def biggest(g):
    return max(getattr(g, 'geoms', [g]), key=lambda p: p.area)


def at(g):
    p = g.representative_point()
    return round(p.x, 2), round(p.y, 2)


def changes_of(rs):
    """Rows: [year, kind, realm, other, km2, pct, lon, lat]; kind r rise, f fall, g gain, l loss."""
    out = []
    for k, r in enumerate(rs):
        prev = rs[k - 1] if k else None
        sid = r['id']
        if prev is None or r['s'] > prev['e'] + 1:
            big = biggest(r['m'])
            out.append([r['s'], 'r', r['name'], holder(big, r['s'] - 1, sid), round(r['km2']), None, *at(big)])
        else:
            for kind, piece, who_year in (('g', r['m'].difference(prev['m']), r['s'] - 1), ('l', prev['m'].difference(r['m']), r['s'])):
                piece = polygonal(piece)
                km = sq_km(piece)
                if km < max(3000, 0.04 * prev['km2']):
                    continue
                big = biggest(piece)
                out.append([r['s'], kind, r['name'], holder(big, who_year, sid), round(km), round(100 * km / max(prev['km2'], 1)), *at(big)])
        nxt = rs[k + 1] if k + 1 < len(rs) else None
        if r['e'] < LAST and (nxt is None or nxt['s'] > r['e'] + 1):
            big = biggest(r['m'])
            out.append([r['e'] + 1, 'f', r['name'], holder(big, r['e'] + 1, sid), round(r['km2']), None, *at(big)])
    return out


def write_changes(rows):
    """Dated border changes for the Atlas: a realm appears, ends, or gains or loses land, with where and from whom.
    Compared on shapes simplified to about 2 km, which is plenty for areas over 3,000 km2."""
    global CH_ROWS, CH_TREE
    for r in rows:
        r['m'] = polygonal(shapely.simplify(r['c'], 0.02))
    CH_ROWS = [{k: r[k] for k in ('id', 'name', 's', 'e', 'km2', 'm')} for r in rows]
    CH_TREE = shapely.STRtree([r['m'] for r in CH_ROWS])
    by = defaultdict(list)
    for r in CH_ROWS:
        by[r['id']].append(r)
    groups = [sorted(rs, key=lambda r: r['s']) for rs in by.values()]
    with Pool(4) as pool:
        found = [c for part in pool.map(changes_of, groups, chunksize=8) for c in part]
    names, ix = [], {}
    def nid(n):
        if n is None:
            return -1
        if n not in ix:
            ix[n] = len(names); names.append(n)
        return ix[n]
    out = [[y, k, nid(a), nid(b), *rest] for y, k, a, b, *rest in found]
    out.sort(key=lambda x: (x[0], -x[4]))
    wiki = {r['name']: r['wiki'] for r in rows}
    os.makedirs(os.path.dirname(CHANGES), exist_ok=True)
    json.dump({'source': CITE, 'names': names, 'wiki': [wiki.get(n, '') for n in names], 'rows': out},
              open(CHANGES, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} border changes -> {CHANGES} ({os.path.getsize(CHANGES) // 1024} KB)', flush=True)


if __name__ == '__main__':
    main()
