#!/usr/bin/env python3
"""Precise historical borders: full-resolution historical-basemaps polygons fitted to real coastlines,
with stable ids and three zoom levels per snapshot.

Usage: python3 ingest/geography/precise_borders.py HB_DIR NE_DIR MAPSHAPER OUT_DIR [year ...]
  HB_DIR     full-resolution world_<year>.geojson from github.com/aourednik/historical-basemaps (GPL-3.0)
  NE_DIR     Natural Earth ne_10m_land.geojson and ne_10m_lakes.geojson
  MAPSHAPER  path to the mapshaper CLI (npm i mapshaper), used for shared-arc topology and simplification
Writes OUT_DIR/<level>/world_<year>.json TopoJSON for level l0 (world view, 5 km detail), l1 (regional,
1.5 km) and l2 (close, 400 m), plus OUT_DIR/realms.json: one stable numeric id per realm name across all
snapshots, for id buffers. Each feature has properties id (slug), n (numeric id), name, subject_of,
part_of and precision (1 approximate, 2 moderate, 3 legally defined, from the source).

Coasts: each polygon is clipped to Natural Earth 10m land (minus big lakes), and small coastal slivers the
source left unclaimed are given to the realm they touch most, so realms meet the real coastline.
"""
import json, os, re, subprocess, sys, tempfile, unicodedata
import numpy as np
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

HB, NE, MAPSHAPER, OUT = sys.argv[1:5]
YEARS = sys.argv[5:]
LEVELS = {'l0': 5000, 'l1': 1500, 'l2': 400}  # simplification interval in metres
SLIVER = 0.6  # square degrees: unclaimed coastal pieces smaller than this join a neighbour


# a few source names arrive with U+FFFD where an accent was lost upstream; restore the known ones
FIX = {'Arag\ufffdn': 'Aragón', 'Teotihuac\ufffdn': 'Teotihuacán', 'Monte Alb\ufffdn': 'Monte Albán'}


def clean(v):
    if not isinstance(v, str) or '\ufffd' not in v:
        return v
    for bad, good in FIX.items():
        v = v.replace(bad, good)
    return v.replace('\ufffd', '')


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'unnamed'


def polys(path, filt=None):
    out = []
    for f in json.load(open(path, encoding='utf-8'))['features']:
        if f['geometry'] and (not filt or filt(f['properties'])):
            out.append(shapely.make_valid(shape(f['geometry'])))
    return out


print('land')
land_parts = polys(os.path.join(NE, 'ne_10m_land.geojson'))
lakes = unary_union(polys(os.path.join(NE, 'ne_10m_lakes.geojson'), lambda p: (p.get('scalerank') or 0) <= 4))
land_parts = [g.difference(lakes) if g.intersects(lakes) else g for g in land_parts]
land_parts = [p for g in land_parts for p in getattr(g, 'geoms', [g]) if p.area > 0]
land_tree = shapely.STRtree(land_parts)

realms_path = os.path.join(OUT, 'realms.json')
realms = json.load(open(realms_path)) if os.path.exists(realms_path) else {}
years = YEARS or sorted((f[6:-8] for f in os.listdir(HB) if f.startswith('world_') and f.endswith('.geojson')),
                        key=lambda y: -int(y[2:]) if y.startswith('bc') else int(y))
for y in years:
    src = json.load(open(os.path.join(HB, f'world_{y}.geojson'), encoding='utf-8'))
    feats, geoms = [], []
    for f in src['features']:
        p = {k: clean(v) for k, v in f['properties'].items()}
        if not f['geometry']:
            continue
        name = p.get('NAME') or p.get('SUBJECTO')
        if not name:
            continue  # land nobody held: left out, so it shows as bare land
        g = shapely.make_valid(shape(f['geometry']))
        idx = land_tree.query(g, predicate='intersects')
        g = unary_union([g.intersection(land_parts[i]) for i in idx]) if len(idx) else shapely.Polygon()
        g = shapely.make_valid(g)
        if g.is_empty:
            continue
        sid = slug(name)
        if sid not in realms:
            realms[sid] = {'n': len(realms) + 1, 'name': name}
        feats.append({'id': sid, 'n': realms[sid]['n'], 'name': name, 'subject_of': p.get('SUBJECTO'),
                      'part_of': p.get('PARTOF'), 'precision': p.get('BORDERPRECISION')})
        geoms.append(g)
    # coastal slivers the source left between its polygons and the real coast
    cov = unary_union(geoms)
    near = shapely.buffer(cov, 0.3)
    idx = land_tree.query(near, predicate='intersects')
    gaps = unary_union([land_parts[i].intersection(near) for i in idx]).difference(cov)
    pieces = [p for p in getattr(gaps, 'geoms', [gaps]) if 0 < p.area < SLIVER]
    tree = shapely.STRtree(geoms)
    gained = [[] for _ in geoms]
    for piece in pieces:
        cand = tree.query(shapely.buffer(piece, 0.02), predicate='intersects')
        if not len(cand):
            continue
        edge = shapely.buffer(piece.boundary, 0.02)
        best = max(cand, key=lambda i: geoms[i].intersection(edge).area)
        gained[best].append(piece)
    geoms = [shapely.make_valid(unary_union([g] + extra)) if extra else g for g, extra in zip(geoms, gained)]
    fc = {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': pr, 'geometry': mapping(g)} for pr, g in zip(feats, geoms)]}
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as tmp:
        json.dump(fc, tmp)
    for lv, interval in LEVELS.items():
        os.makedirs(os.path.join(OUT, lv), exist_ok=True)
        out = os.path.join(OUT, lv, f'world_{y}.json')
        q = {'l0': 1e5, 'l1': 4e5, 'l2': 2e6}[lv]
        subprocess.run([MAPSHAPER, '-i', tmp.name, 'name=realms', '-clean', 'snap-interval=0.0005',
                        '-simplify', f'interval={interval}', 'keep-shapes',
                        '-o', out, 'format=topojson', f'quantization={int(q)}', 'precision=0.00001'],
                       check=True, capture_output=True)
    os.unlink(tmp.name)
    sizes = ', '.join(f'{lv} {os.path.getsize(os.path.join(OUT, lv, f"world_{y}.json")) // 1024} KB' for lv in LEVELS)
    print(f'{y}: {len(feats)} realms, {len(pieces)} coastal slivers filled; {sizes}', flush=True)
    json.dump(realms, open(realms_path, 'w'), ensure_ascii=False, indent=0)
