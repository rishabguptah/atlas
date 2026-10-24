#!/usr/bin/env python3
"""Turn Natural Earth physical layers into kernel records for the terrain basemap.

Usage: python3 ingest/geography/features.py RAW_DIR
RAW_DIR holds the Natural Earth geojson files (10m regions polys, marine polys, elevation points;
50m lakes, rivers with scale ranks). Writes data/geography/features.jsonl (one place record per
mountain range, desert, plateau, sea, strait, lake, river and peak) and
data/geography/geo/terrain.geojson (simplified shapes, properties.ref = record id).
Needs shapely and numpy.
"""
import json, os, re, sys, unicodedata
import numpy as np
from shapely.geometry import shape, mapping, MultiLineString, LineString
from shapely.ops import polylabel, linemerge, unary_union

RAW = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'geography')
HERE = os.path.dirname(os.path.abspath(__file__))
NE = {'cite': 'Natural Earth 1:10m and 1:50m physical vectors, v5.1.2 (public domain)',
      'url': 'https://www.naturalearthdata.com/'}

REGION_KIND = {'Range/mtn': ('mountain_range', 'mtn'), 'Desert': ('desert', 'desert'), 'Plateau': ('plateau', 'plateau'),
               'Plain': ('plain', 'plain'), 'Basin': ('basin', 'basin'), 'Valley': ('valley', 'valley'),
               'Lowland': ('lowland', 'lowland'), 'Depression': ('depression', 'depression'),
               'Gorge': ('gorge', 'gorge'), 'Isthmus': ('isthmus', 'isthmus'), 'Wetlands': ('wetland', 'wetland'),
               'Delta': ('delta', 'delta'), 'Tundra': ('tundra', 'tundra'), 'Peninsula': ('peninsula', 'peninsula')}
MARINE_KIND = {'ocean', 'sea', 'gulf', 'bay', 'strait', 'channel', 'sound', 'lagoon', 'fjord', 'inlet'}
SKIP = {'PUNJAB', 'CAATINGAS', 'Central Highlands', 'Dragons-be-here'}
RENAME = {'Península Ibérica': 'Iberian Meseta', 'S. Nevada': 'Sierra Nevada', 'Al Furat': 'Euphrates',
          'Firat': 'Euphrates', 'Dicle': 'Tigris', 'Chang Jiang': 'Yangtze', 'Huang': 'Yellow River',
          'Amazonas': 'Amazon', 'Donau': 'Danube', 'Dnepre': 'Dnieper', 'Dnipro': 'Dnieper', 'Rhein': 'Rhine',
          'Rhin': 'Rhine', 'Heilong Jiang': 'Amur', 'Ayeyarwady': 'Irrawaddy', 'Ertis': 'Irtysh', 'Ertix': 'Irtysh',
          'El Bahr el Abyad': 'White Nile', 'El Bahr el Azraq': 'Blue Nile', 'Abay': 'Blue Nile', 'Sénégal': 'Senegal',
          'Lancang': 'Mekong', 'Nu': 'Salween', 'Yarlung': 'Brahmaputra', 'Dihang': 'Brahmaputra',
          'Bénoué': 'Benue', 'Xi': 'Xi River', 'Severnaya Dvina': 'Northern Dvina', 'Yellow': 'Yellow River',
          'Jinsha': 'Yangtze', 'Tongtian': 'Yangtze', 'Tuotuo He': 'Yangtze', 'Shiquan He': 'Indus',
          'Damqogkanbab': 'Brahmaputra', 'Za': 'Mekong', "Derung N'mai": 'Irrawaddy', 'Lesser Abay': 'Blue Nile',
          'Syr Dar': 'Syr Darya', 'Enugu, Nigeria': 'Niger Delta', 'Enugu Nigeria': 'Niger Delta', 'Ahag': 'Ahaggar Mountains',
          'Iberian Peninsula': 'Iberian Meseta', 'Nyanza': 'Victoria', 'Crystal Mountain': 'Crystal Mountains', 'Paraná River': 'Paraná'}
# Rivers whose history outweighs their map rank, with the tier they should label at.
RIVER_TIER = {'Nile': 1, 'Yangtze': 1, 'Amazon': 1, 'Mississippi': 1, 'Tigris': 2, 'Euphrates': 2, 'Indus': 2,
              'Ganges': 2, 'Yellow River': 2, 'Danube': 2, 'Rhine': 2, 'Volga': 2, 'Amu Darya': 2, 'Mekong': 2,
              'Niger': 2, 'Congo': 2, 'Syr Darya': 3, 'Dnieper': 3, 'Don': 3, 'Zambezi': 3, 'Brahmaputra': 2,
              'Jordan': 4, 'Elbe': 4, 'Vistula': 4, 'Oder': 4, 'Po': 4, 'Rhône': 4, 'Loire': 4, 'Seine': 4,
              'Tagus': 4, 'Ebro': 4, 'Helmand': 4, 'Sutlej': 4, 'Han': 4, 'Dniester': 4, 'Thames': 4}
# Segments drawn but never labelled: delta branches, connecting channels, minor headwaters.
NO_LABEL = re.compile(r'(?i)branch|protoka|bratul|canal|^(Madison|Weir|St\. Clair|Niagara|Borcea|Lek|Waal|Nederrijn|'
                      r'Chilia|Sulina|Sfântu Gheorghe|Kibali|Uele|Ider|Shishged|Little Yenisei|Verkhniy Yenisey|Indaiá)$')


def srank(p):
    v = p.get('scalerank')
    return 9 if v is None else v



def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


def tidy(name):
    name = RENAME.get(name, name)
    if name.isupper():
        name = ' '.join(w if w in ('OF', 'DE', 'DU', 'DES', 'LA', 'EL') and i else w.capitalize()
                        for i, w in enumerate(name.split())).replace(' Of ', ' of ').replace('’', '’')
        name = re.sub(r'\bOf\b', 'of', name)
    for a, b in ((r'\bMts\.?(?=\s|$)', 'Mountains'), (r'\bMts \.', 'Mountains'), (r'\bRa\.', 'Range'),
                 (r'\bPlat\.', 'Plateau'), (r'\bCord\.', 'Cordillera'), (r'\bAppennini\b', 'Apennines'),
                 (r'\bS\.\s', 'Sierra '), (r'\bN\.\s', 'North '), (r'\bMt\.', 'Mount')):
        name = re.sub(a, b, name)
    return re.sub(r'\s+', ' ', name).strip()


def r2(c):
    return [round(c[0], 2), round(c[1], 2)]


def label_line(geom):
    """A gently curved line along an area's long axis, for spaced-out atlas lettering.
    Returns (points, horizontal) in lon/lat; west-to-east, or south-to-north when steep."""
    poly = max(geom.geoms, key=lambda g: g.area) if geom.geom_type == 'MultiPolygon' else geom
    xs, ys = np.array(poly.exterior.coords).T
    if xs.max() - xs.min() > 180:  # wraps the antimeridian: a plain horizontal label
        p = polylabel(poly, 0.1)
        return [r2((p.x - 3, p.y)), r2((p.x + 3, p.y))], True
    lat0 = np.radians(ys.mean())
    pts = np.c_[(xs - xs.mean()) * np.cos(lat0), ys - ys.mean()]
    # sample the interior on a grid so the axis follows the area, not the coastline wiggles
    minx, miny, maxx, maxy = poly.bounds
    gx, gy = np.meshgrid(np.linspace(minx, maxx, 40), np.linspace(miny, maxy, 40))
    from shapely import contains_xy
    inside = contains_xy(poly, gx.ravel(), gy.ravel())
    if inside.sum() >= 8:
        pts = np.c_[(gx.ravel()[inside] - xs.mean()) * np.cos(lat0), gy.ravel()[inside] - ys.mean()]
    c = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c, full_matrices=False)
    axis = vt[0]
    aspect = s[0] / max(s[1], 1e-9)
    t = (pts - c) @ axis
    lo, hi = np.percentile(t, 8), np.percentile(t, 92)
    if aspect < 1.5:  # compact: horizontal through the visual centre
        p = polylabel(poly, 0.05)
        half = max((hi - lo) / 2 * .8, .4)
        return [r2((p.x - half / np.cos(lat0), p.y)), r2((p.x + half / np.cos(lat0), p.y))], True
    if abs(axis[0]) < .45:  # steep: read upwards
        axis = axis if axis[1] > 0 else -axis
    elif axis[0] < 0:
        axis = -axis
    t = (pts - c) @ axis
    lo, hi = np.percentile(t, 8), np.percentile(t, 92)
    normal = np.array([-axis[1], axis[0]])
    n = (pts - c) @ normal
    bend = np.polyfit(t, n, 2) if len(t) > 6 else [0, 0, 0]
    out = []
    for tt in np.linspace(lo, hi, 7):
        off = float(np.clip(np.polyval(bend, tt), -s[1] / np.sqrt(len(t)) * 1.2, s[1] / np.sqrt(len(t)) * 1.2))
        x, y = c + axis * tt + normal * off
        out.append(r2((x / np.cos(lat0) + xs.mean(), y + ys.mean())))
    return out, False


def load(name):
    feats = json.load(open(os.path.join(RAW, name + '.geojson')))['features']
    for f in feats:
        f['properties'] = {k.lower(): v for k, v in f['properties'].items()}
    return feats


notes = json.load(open(os.path.join(HERE, 'notes.json')))
records, geo, seen = [], [], {}


def add(kind_slug, subtype, name, tier, geom, props, lat, lon, line=None, horizontal=None, extra=None):
    rid = f'place:{kind_slug}:' + re.sub(r'^lake_|_lake$', '', slug(name))
    if rid in seen:
        return seen[rid]
    tier = int(max(1, min(6, tier)))
    r = {'id': rid, 'kind': 'place', 'subtype': subtype, 'name': name, 'lat': round(lat, 3), 'lon': round(lon, 3),
         'lenses': ['geography'], 'sources': [NE], 'status': 'sourced', 'geo': 'geo/terrain.geojson', 'tier': tier}
    if props.get('wikidataid'):
        r['wikidata'] = props['wikidataid']
    if line:
        r['label_line'] = line
    if extra:
        r.update(extra)
    n = notes.get(rid)
    if n:
        r.update({k: v for k, v in n.items() if k in ('what', 'why', 'links', 'alt_names', 'tier')})
        r['status'] = 'draft'  # the sentences are model-written until the judge checks them
    records.append(r)
    seen[rid] = r
    if geom is not None:
        geo.append({'type': 'Feature', 'properties': {'ref': rid, 'subtype': subtype, 'tier': tier}, 'geometry': mapping(geom)})
    return r


# areas: ranges, deserts, plateaus, plains, basins ...
for f in load('ne_10m_geography_regions_polys'):
    p = f['properties']
    if p['featurecla'] not in REGION_KIND and not (p['featurecla'] == 'Geoarea' and p['name'] in ('ANATOLIA',)):
        continue
    raw = p.get('name_en') or p['name']
    if p['name'] in SKIP or raw in SKIP or srank(p) > 6:
        continue
    sub, pre = REGION_KIND.get(p['featurecla'], ('region', 'region'))
    g = shape(f['geometry']).buffer(0)
    line, horiz = label_line(g)
    pt = polylabel(max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g, 0.05)
    add(pre, sub, tidy(raw), p['scalerank'], g.simplify(0.04, preserve_topology=True), p, pt.y, pt.x, line, horiz)

# seas, gulfs, straits
for f in load('ne_10m_geography_marine_polys'):
    p = f['properties']
    if p['featurecla'] not in MARINE_KIND or srank(p) > 5:
        continue
    name = tidy(p.get('name_en') or p['name'])
    g = shape(f['geometry']).buffer(0)
    line, horiz = label_line(g) if p['featurecla'] != 'ocean' else (None, True)
    big = max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g
    pt = polylabel(big, 0.2)
    if p['featurecla'] == 'ocean':
        line = [r2((pt.x - 8, pt.y)), r2((pt.x + 8, pt.y))]
    tier = p['scalerank'] + (1 if p['featurecla'] in ('bay', 'sound', 'lagoon', 'fjord', 'inlet') else 0)
    add(p['featurecla'], p['featurecla'], name, max(tier, 1), g.simplify(0.04, preserve_topology=True), p, pt.y, pt.x, line, horiz)

# lakes
for f in load('ne_50m_lakes'):
    p = f['properties']
    name = p.get('name_en') or p.get('name')
    g = shape(f['geometry']).buffer(0)
    if not name or g.area < .4:  # by area, so big reservoirs don't outrank old lakes
        continue
    big = max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g
    pt = polylabel(big, 0.05)
    tier = 2 if g.area > 5 else 3 if g.area > 1.5 else 4
    name = tidy(name)
    if not re.search(r'(?i)\blake\b|\bsea\b|\blac\b|\blago\b|\breservoir\b', name):
        name = 'Lake ' + name
    add('lake', 'lake', name, tier, g.simplify(0.02, preserve_topology=True), p, pt.y, pt.x)

# rivers: group the Natural Earth segments by Wikidata id (else by English name)
groups = {}
for f in load('ne_50m_rivers_lake_centerlines_scale_rank'):
    p = f['properties']
    if p['featurecla'] not in ('River', 'Lake Centerline', 'Canal') or srank(p) > 6:
        continue
    name = tidy(p.get('name_en') or p.get('name') or '')
    if NO_LABEL.search(name):
        name = ''
    key = name or p.get('wikidataid') or p['dissolve']
    gr = groups.setdefault(key, {'names': [], 'lines': [], 'rank': 9, 'props': p})
    if name:
        gr['names'].append(name)
    gr['rank'] = min(gr['rank'], p['scalerank'])
    g = shape(f['geometry'])
    gr['lines'] += list(g.geoms) if g.geom_type == 'MultiLineString' else [g]
unnamed = []
for key, gr in groups.items():
    merged = linemerge(MultiLineString(gr['lines']))
    if not gr['names']:
        unnamed.append((gr['rank'], merged))
        continue
    name = max(set(gr['names']), key=gr['names'].count)
    longest = max(merged.geoms, key=lambda x: x.length) if merged.geom_type == 'MultiLineString' else merged
    # label along the middle stretch of the main stem
    a, b = longest.length * .3, longest.length * .7
    seg = [longest.interpolate(a + (b - a) * i / 8) for i in range(9)]
    line = [r2((q.x, q.y)) for q in seg]
    if line[0][0] > line[-1][0]:
        line = line[::-1]
    mid = longest.interpolate(.5, normalized=True)
    add('river', 'river', name, RIVER_TIER.get(name, max(gr['rank'], 3)), merged.simplify(0.03), gr['props'], mid.y, mid.x, line, False)
for rank, g in unnamed:
    geo.append({'type': 'Feature', 'properties': {'ref': None, 'subtype': 'river', 'tier': rank}, 'geometry': mapping(g.simplify(0.03))})

# peaks and named passes
for f in load('ne_10m_geography_regions_elevation_points'):
    p = f['properties']
    if p['featurecla'] != 'mountain' or srank(p) > 3:  # passes come from the states-war chokepoints
        continue
    name = tidy(p.get('name_en') or p['name'])
    sub = 'peak' if p['featurecla'] == 'mountain' else 'pass'
    add(sub, sub, name, p['scalerank'] + 1, None, p, p['lat_y'], p['long_x'],
        extra={'elevation_m': p['elevation']} if p.get('elevation') else None)

missing = sorted(set(notes) - set(seen))
if missing:
    print('notes without a feature:', missing)
records.sort(key=lambda r: (r['tier'], r['id']))
os.makedirs(os.path.join(OUT, 'geo'), exist_ok=True)
with open(os.path.join(OUT, 'features.jsonl'), 'w', encoding='utf-8') as f:
    for r in records:
        f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')


def rnd(o):
    if isinstance(o, float):
        return round(o, 2)
    if isinstance(o, (list, tuple)):
        return [rnd(x) for x in o]
    if isinstance(o, dict):
        return {k: rnd(v) for k, v in o.items()}
    return o


with open(os.path.join(OUT, 'geo', 'terrain.geojson'), 'w', encoding='utf-8') as f:
    json.dump({'type': 'FeatureCollection', 'features': rnd(geo)}, f, ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(records), 'records', dict(Counter(r['subtype'] for r in records)))
print('geo KB', os.path.getsize(os.path.join(OUT, 'geo', 'terrain.geojson')) // 1024)
