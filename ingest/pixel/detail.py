#!/usr/bin/env python3
"""Zoom detail for the pixel map: dated roads, walls, places and province names, plus a population grid.

The pixel map gains authored detail as you zoom (views/pixel/detail.js). This script gathers it from sourced,
dated records and writes 30 x 30 degree tiles that the page loads beside itself, only for the tiles in view:

  OUT/d_<col>_<row>.json   col 0..11 from 180W, row 0..5 from 90N (same grid as the terrain L2 tiles)
  OUT/pop.json             people per country and epoch (HYDE via OWID) and arable km2 per country
  OUT/countries.png        10' grid of country indexes into pop.json (R channel), for fields and villages
  OUT/SOURCES.md           what came from where, with licences

Tile shape (all dates are years, negative = BCE; 9999 = still there):
  lines: [[kind, from, to, flags, coords]]   coords = flat [lon0*1000, lat0*1000, dlon, dlat, ...] (integers)
     kind: rr Roman road | hw modern highway | rd modern road | rw railway | wl wall
     flags: bit 0 main road, bits 1-2 certainty (0 certain, 1 conjectured, 2 hypothetical / approximate)
  pts:   [[kind, lon*1000, lat*1000, from, to]]
     kind: v village/settlement | x villa/estate | p port/harbour | f fort | c castle | l lighthouse | w city walls | z centuriation
  names: [[name, lon*1000, lat*1000, from, to, rank]]   rank 1 (big province) .. 4 (small region)

Inputs (see /mnt/project-files/atlas/raw/README.md and raw/zoom-detail/):
  raw/zoom-detail/roman/   Itiner-e Roman roads (de Soto et al. 2025, via Pazout et al. roman-road-networks, CC BY-SA 4.0)
                           and AWMC Roman provinces in 200 CE
  raw/zoom-detail/ne_10m_* Natural Earth roads, railroads, ports, admin-1 (public domain)
  raw/zoom-detail/wikidata-*.json  Wikidata provinces, castles, forts, walls, ports, lighthouses (CC0), fetched by --fetch
  raw/pleiades/            Pleiades places (CC BY 3.0)
  raw/hyde/owid-population.csv  HYDE 3.x country population via Our World in Data (CC BY 4.0)
  pixel/terrain/terrain_l0.png  terrain classes, for arable land

Usage: python3 ingest/pixel/detail.py [--fetch] [OUT]   (default OUT /mnt/project-files/atlas/pixel/detail)
"""
import csv, gzip, json, math, os, sys, time, urllib.parse, urllib.request, collections

ATLAS = '/mnt/project-files/atlas/'
RAW = ATLAS + 'raw/'
ZD = RAW + 'zoom-detail/'
ROMAN = None
for d in os.listdir(ZD + 'roman') if os.path.isdir(ZD + 'roman') else []:
    ROMAN = ZD + 'roman/' + d + '/data/'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = args[0] if args else ATLAS + 'pixel/detail'
FETCH = '--fetch' in sys.argv

import shapefile
from shapely.geometry import shape, LineString, Point
from shapely.prepared import prep
from PIL import Image, ImageDraw

tiles = collections.defaultdict(lambda: {'lines': [], 'pts': [], 'names': []})
tkey = (lambda lon, lat: (min(11, max(0, int((lon + 180) // 30))), min(5, max(0, int((90 - lat) // 30)))))
Q = lambda v: int(round(v * 1000))


def enc(coords):
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(coords):
        qx, qy = Q(x), Q(y)
        if i == 0: out += [qx, qy]
        elif qx == px and qy == py: continue
        else: out += [qx - px, qy - py]
        px, py = qx, qy
    return out


def add_line(kind, a, b, flags, coords):
    if len(coords) < 2: return
    xs = [c[0] for c in coords]; ys = [c[1] for c in coords]
    c0, r0 = tkey(min(xs), max(ys)); c1, r1 = tkey(max(xs), min(ys))
    rec = [kind, int(a), int(b), flags, enc(coords)]
    for c in range(c0, c1 + 1):
        for r in range(r0, r1 + 1): tiles[(c, r)]['lines'].append(rec)


def add_pt(kind, lon, lat, a, b):
    tiles[tkey(lon, lat)]['pts'].append([kind, Q(lon), Q(lat), int(a), int(b)])


def add_name(name, lon, lat, a, b, rank):
    tiles[tkey(lon, lat)]['names'].append([name, Q(lon), Q(lat), int(a), int(b), rank])


def lines_of(geom, tol):
    g = geom.simplify(tol, preserve_topology=False)
    if g.is_empty: return []
    if g.geom_type == 'LineString': return [list(g.coords)]
    if g.geom_type == 'MultiLineString': return [list(p.coords) for p in g.geoms]
    return []


stats = collections.Counter()

# ---------------------------------------------------------------- Roman roads (Itiner-e) and provinces in 200 CE
# When Rome took each province (roads start then, or at 312 BCE, the Via Appia, whichever is later) and when
# Roman (incl. Byzantine) upkeep ended there. Itiner-e's own dates win where a segment has them (about 3%).
PROV = {  # name: (annexed, end of Roman rule)
    'Achaia': (-146, 1204), 'Aegyptus': (-30, 641), 'Aemilia (Regio VIII)': (-191, 568), 'Africa Proconsularis': (-146, 698),
    'Alpes Cottiae': (-14, 476), 'Alpes Graiae': (-15, 476), 'Alpes Maritimae': (-14, 476), 'Alpes Poeninae': (-15, 476),
    'Apulia et Calabria (Regio II)': (-272, 568), 'Aquitania': (-51, 476), 'Arabia': (106, 636), 'Asia': (-129, 1071),
    'Baetica': (-197, 476), 'Belgica': (-51, 476), 'Bithynia et Pontus': (-74, 1071), 'Britannia': (43, 410),
    'Bruttium et Lucania (Regio III)': (-272, 568), 'Cappadocia': (17, 1071), 'Cilicia': (-64, 1071), 'Corsica': (-238, 456),
    'Creta': (-67, 824), 'Cyprus': (-58, 1191), 'Cyrene': (-74, 643), 'Dacia': (106, 271), 'Dalmatia': (9, 480),
    'Epirus': (-146, 1204), 'Etruria (Regio VII)': (-264, 568), 'Galatia': (-25, 1071), 'Germania Inferior': (-12, 459),
    'Germania Superior': (-12, 459), 'Hispania Citerior': (-197, 476), 'Iudaea': (6, 636), 'Latium et Campania (Regio I)': (-312, 568),
    'Liguria (Regio IX)': (-155, 568), 'Lugdunensis': (-51, 476), 'Lusitania': (-138, 476), 'Lycia et Pamphylia': (43, 1071),
    'Macedonia': (-146, 1204), 'Mauretania Caesariensis': (42, 430), 'Mauretania Tingitana': (42, 430), 'Moesia Inferior': (6, 680),
    'Moesia Superior': (6, 600), 'Narbonensis': (-121, 476), 'Noricum': (-16, 488), 'Numidia': (-46, 698),
    'Pannonia Inferior': (9, 433), 'Pannonia Superior': (9, 433), 'Picenum (Regio V)': (-268, 568), 'Raetia': (-15, 476),
    'Roma': (-312, 568), 'Samnium (Regio IV)': (-290, 568), 'Sardinia': (-238, 456), 'Sicilia': (-241, 827), 'Syria': (-64, 636),
    'Thracia': (46, 1204), 'Transpadana (Regio XI)': (-191, 568), 'Umbria (Regio VI)': (-295, 568), 'Venetia et Histria (Regio X)': (-181, 568),
}
provinces = []
if ROMAN:
    r = shapefile.Reader(ROMAN + 'roman_provinces_simple/roman_provinces')
    for sr in r.iterShapeRecords():
        g = shape(sr.shape.__geo_interface__).buffer(0)
        provinces.append((sr.record['province'], g, prep(g)))
    R_E = 6378137.0
    merc = lambda x, y: (math.degrees(x / R_E), math.degrees(2 * math.atan(math.exp(y / R_E)) - math.pi / 2))
    r = shapefile.Reader(ROMAN + 'roman_roads/roman_roads')
    for sr in r.iterShapeRecords():
        rec = sr.record
        parts = list(sr.shape.parts) + [len(sr.shape.points)]
        for i in range(len(parts) - 1):
            pts = [merc(*p) for p in sr.shape.points[parts[i]:parts[i + 1]]]
            if len(pts) < 2: continue
            ln = LineString(pts)
            mid = ln.interpolate(0.5, normalized=True)
            pv = next((n for n, g, pg in provinces if pg.contains(mid)), None)
            if pv is None:
                best = min(provinces, key=lambda p: p[1].distance(mid))
                pv = best[0] if best[1].distance(mid) < 1.5 else None
            a, b = PROV.get(pv, (-27, 476))
            a = max(a, -312)
            if rec['Lower_Date']: a = int(rec['Lower_Date'])
            if rec['Upper_Date'] and rec['Upper_Date'] > a: b = max(b, int(rec['Upper_Date']))
            cert = {'Certain': 0, 'Conjectured': 1, 'Hypothetical': 2}.get(rec['Segment_s'], 1)
            main = 1 if rec['Type'] == 'Main Road' else 0
            for c in lines_of(ln, 0.003):
                add_line('rr', a, b, main | cert << 1, c); stats['roman road'] += 1
    # Province names at a label point inside each 200 CE province, from annexation to the Diocletian reform (293).
    for n, g, pg in provinces:
        if n == 'Roma': continue
        a, b = PROV.get(n, (-27, 293))
        p = g.representative_point()
        area = g.area
        add_name(n.split(' (')[0], p.x, p.y, max(a, -27), min(b, 293), 1 if area > 20 else 2 if area > 6 else 3)
        stats['roman province'] += 1

# ---------------------------------------------------------------- Pleiades: settlements, villas, ports, forts, walls, provinces
def pleiades():
    f = RAW + 'pleiades/pleiades-places-20261024.csv.gz'
    if not os.path.exists(f): return
    for row in csv.DictReader(gzip.open(f, 'rt', encoding='utf-8')):
        ft = [t.strip() for t in (row['featureTypes'] or '').split(',')]
        try: lat, lon = float(row['reprLat']), float(row['reprLong']); a, b = int(float(row['minDate'])), int(float(row['maxDate']))
        except ValueError: continue
        if row.get('locationPrecision') == 'rough' and 'province' not in ' '.join(ft) and 'region' not in ft: continue
        # Pleiades closes ranges at 2100 for places that still exist; Roman-type sites (villas, forts) end with antiquity.
        ant = min(b, 640)
        t = row['title']
        if 'villa' in ft: add_pt('x', lon, lat, a, ant); stats['villa'] += 1
        elif 'centuriation' in ft: add_pt('z', lon, lat, a, ant); stats['centuriation'] += 1
        elif 'port' in ft or 'harbor' in ft: add_pt('p', lon, lat, a, b); stats['ancient port'] += 1
        elif {'fort', 'fort-2', 'fortlet', 'fortified-camp'} & set(ft): add_pt('f', lon, lat, a, ant); stats['ancient fort'] += 1
        elif 'settlement' in ft or 'fortified-settlement' in ft or 'village' in ft:
            if 'city-wall' in ft or 'fortified-settlement' in ft: add_pt('w', lon, lat, a, ant)
            add_pt('v', lon, lat, a, b); stats['ancient settlement'] += 1
        if 'province' in ft or 'province-2' in ft:
            name = t.replace(' (province)', '').strip()
            if name and not name.startswith('Untitled'):
                add_name(name, lon, lat, a, ant, 2); stats['ancient province'] += 1
        elif 'region' in ft and 'settlement' not in ft:
            name = t.replace(' (region)', '').strip()
            if name and not name.startswith('Untitled') and len(name) < 26:
                add_name(name, lon, lat, a, ant, 4); stats['ancient region'] += 1
pleiades()

# ---------------------------------------------------------------- Wikidata (CC0): provinces and castles, forts, walls, ports, lighthouses
def sparql(q):
    for _ in range(4):
        try:
            req = urllib.request.Request('https://query.wikidata.org/sparql', data=urllib.parse.urlencode({'query': q, 'format': 'json'}).encode(),
                                         headers={'User-Agent': 'AtlasZoomDetail/0.1 (history map)', 'Accept': 'application/sparql-results+json'})
            return json.load(urllib.request.urlopen(req, timeout=300))['results']['bindings']
        except Exception as e:
            print('  wikidata retry:', e, file=sys.stderr); time.sleep(15)
    raise SystemExit('Wikidata query failed')

# Classes of historical subdivisions, with the period an undated item is assumed to cover (None = skip undated).
PROV_CLASSES = {
    'Q1620908': ('historical region', 800, 9999, 3), 'Q208500': ('principality', None, None, 2), 'Q517267': ('commandery', None, None, 2),
    'Q330425': ('sanjak', None, None, 3), 'Q1336152': ('princely state', None, None, 3), 'Q3567586': ('Byzantine theme', None, None, 2),
    'Q154547': ('duchy', None, None, 2), 'Q718570': ('circuit', None, None, 2), 'Q852231': ('county', None, None, 3),
    'Q47530375': ('governorate', None, None, 2), 'Q860290': ('province of Japan', 701, 1871, 3), 'Q209495': ('province of France', 1500, 1790, 2),
    'Q28575': ('county', None, None, 3), 'Q217177': ('taifa', None, None, 2), 'Q1053916': ('theme', None, None, 2),
    'Q4379644': ('province of Russia', None, None, 2), 'Q44565': ('eyalet', None, None, 2), 'Q162620': ('province of Spain', 1833, 9999, 3),
    'Q223706': ('nome', -3000, 641, 3), 'Q1462047': ('vilayet', None, None, 2), 'Q1138494': ('historic county of England', 1086, 1974, 3),
    'Q3950801': ('satrapy', -550, -330, 1), 'Q1615742': ('province of China', None, None, 1), 'Q188604': ('county of Hungary', None, None, 3),
    'Q15646712': ('province of British India', None, None, 1), 'Q3772949': ('subah', None, None, 1), 'Q853697': ('province of Finland', 1200, 9999, 3),
    'Q15649504': ('satrapy', None, None, 1), 'Q1065927': ('theme', None, None, 2), 'Q133156': ('colony', None, None, 2),
}
POINT_CLASSES = {'Q16748868': 'w', 'Q23413': 'c', 'Q57821': 'c', 'Q1785071': 'f', 'Q57831': 'f', 'Q44782': 'p', 'Q283202': 'p', 'Q39715': 'l'}


def wd_year(v):
    if not v: return None
    s = v['value']
    try: y = int(s[:5]) if s.startswith('-') else int(s[:4])
    except ValueError: return None
    return y


def wikidata():
    f1, f2 = ZD + 'wikidata-provinces.json', ZD + 'wikidata-sites.json'
    if FETCH or not os.path.exists(f1):
        q = '''SELECT ?item ?label ?coord ?start ?end ?sl ?type WHERE { VALUES ?type { %s }
          ?item wdt:P31 ?type ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
          OPTIONAL { ?item wdt:P571 ?start } OPTIONAL { ?item wdt:P576 ?end }
          ?item rdfs:label ?label FILTER(lang(?label)="en") }''' % ' '.join('wd:' + k for k in PROV_CLASSES)
        json.dump(sparql(q), open(f1, 'w'))
    if FETCH or not os.path.exists(f2):
        q = '''SELECT ?item ?coord ?start ?end ?sl ?type WHERE { VALUES ?type { %s }
          ?item wdt:P31 ?type ; wdt:P625 ?coord ; wikibase:sitelinks ?sl . FILTER(?sl >= 3)
          OPTIONAL { ?item wdt:P571 ?start } OPTIONAL { ?item wdt:P576 ?end } }''' % ' '.join('wd:' + k for k in POINT_CLASSES)
        json.dump(sparql(q), open(f2, 'w'))
    # Undated historical regions: classical names (those Pleiades knows) belong to antiquity, the rest from 800 on.
    # A few are dated by hand where the name itself is younger; broad culture areas and city districts are left out.
    ancient = set()
    pf = RAW + 'pleiades/pleiades-places-20261024.csv.gz'
    if os.path.exists(pf):
        for row in csv.DictReader(gzip.open(pf, 'rt', encoding='utf-8')):
            if 'region' in row['featureTypes'] or 'province' in row['featureTypes'] or 'people' in row['featureTypes']:
                ancient.add(row['title'].split(' (')[0].strip())
    REGION_DATES = {'Sudetenland': (1918, 1945), 'Donbas': (1870, 9999), 'Wild Fields': (1400, 1780), 'Balkans': (1830, 9999), 'Rumelia': (1360, 1912),
                    'Turkestan': (1000, 9999), 'Western Ukraine': (1918, 9999), 'German Bohemia': (1918, 1919), 'Czech lands': (1918, 9999),
                    'Outer Manchuria': (1858, 9999), 'Land of Israel': (-1000, 9999), 'Hlučín Region': (1920, 9999), 'Dąbrowa Basin': (1850, 9999),
                    'Bessarabia': (1812, 1940), 'Prekmurje': (1919, 9999), 'Gaul': (-400, 486), 'Hispania': (-200, 711), 'Germania': (-100, 500),
                    'Caledonia': (80, 400), 'Mesopotamia': (-3500, 9999), 'Bactria': (-600, 700), 'Parthia': (-250, 650), 'Transoxiana': (650, 1500),
                    'Ottoman Palestine': (1516, 1917), 'Ottoman Syria': (1516, 1918), 'German Coast': (1721, 9999)}
    SKIP = {'Ancient Greece', 'Mesoamerica', 'Low Countries', 'Asakusa', 'Ueno', 'Kanda', 'Aizu', 'Southern Netherlands', 'Asia Minor', 'Syria',
            'Macedonia', 'Galicia', 'Prussia', 'Palestine', 'Northern Bulgaria', 'Argentine Northwest'}
    seen = {}
    for x in json.load(open(f1)):
        it = x['item']['value']; c = x['type']['value'].rsplit('/', 1)[1]
        cls = PROV_CLASSES.get(c)
        if not cls: continue
        a, b = wd_year(x.get('start')), wd_year(x.get('end'))
        name = x['label']['value']
        if name in SKIP: continue
        if name in REGION_DATES: a, b = REGION_DATES[name]
        elif a is None and b is None and c == 'Q1620908':
            a, b = (-800, 640) if name in ancient else (800, 9999)
        if a is None and b is None:
            if cls[1] is None: continue
            a, b = cls[1], cls[2]
        elif a is None: a = b - 300 if cls[1] is None else max(cls[1], b - 600)
        elif b is None: b = 9999 if cls[2] in (None, 9999) else cls[2]
        if b < a: continue
        try: lon, lat = map(float, x['coord']['value'][6:-1].split())
        except ValueError: continue
        sl = int(x['sl']['value'])
        rank = max(1, min(4, cls[3] + (1 if sl < 15 else 0) - (1 if sl > 60 else 0)))
        if it in seen: continue
        seen[it] = 1
        add_name(name, lon, lat, a, b, rank); stats['wikidata province'] += 1
    seen = set()
    for x in json.load(open(f2)):
        it = x['item']['value']
        if it in seen: continue
        a, b = wd_year(x.get('start')), wd_year(x.get('end'))
        if a is None: continue  # undated castles and ports are left out rather than guessed
        seen.add(it)
        try: lon, lat = map(float, x['coord']['value'][6:-1].split())
        except ValueError: continue
        k = POINT_CLASSES[x['type']['value'].rsplit('/', 1)[1]]
        add_pt(k, lon, lat, a, b if b is not None and b >= a else 9999); stats['wikidata ' + k] += 1
wikidata()

# ---------------------------------------------------------------- Long walls (hand-traced from well-known forts and ends; approximate)
WALLS = [  # name, from, to, certainty (0 traced from known sites, 2 approximate), [(lat, lon), ...]
    ("Hadrian's Wall", 122, 410, 0, [(54.988, -1.532), (54.99, -1.75), (55.025, -2.139), (55.013, -2.331), (54.99, -2.47), (54.989, -2.602), (54.95, -2.80), (54.902, -2.94), (54.93, -3.10), (54.953, -3.214)]),
    ("Antonine Wall", 142, 162, 0, [(55.922, -4.45), (55.94, -4.30), (55.96, -4.07), (55.99, -3.95), (55.998, -3.85), (56.0, -3.70), (56.012, -3.56)]),
    ("Upper German-Raetian Limes", 160, 260, 0, [(50.50, 7.33), (50.33, 7.75), (50.27, 8.10), (50.27, 8.57), (50.40, 8.80), (50.30, 8.95), (50.08, 8.98), (49.70, 9.25), (49.58, 9.37), (49.20, 9.55), (48.80, 9.69), (48.84, 10.09), (48.97, 10.45), (49.11, 10.75), (49.05, 11.20), (48.85, 11.78)]),
    ('Anastasian Wall', 500, 640, 0, [(41.48, 28.23), (41.35, 28.20), (41.22, 28.16), (41.08, 28.13)]),
    ('Great Wall of Gorgan', 420, 650, 2, [(37.03, 54.02), (37.10, 54.50), (37.22, 54.95), (37.35, 55.40), (37.55, 55.85)]),
    ('Derbent Wall', 552, 9999, 2, [(42.06, 48.30), (42.03, 48.10), (42.00, 47.90)]),
    ('Danevirke', 650, 1864, 0, [(54.45, 9.40), (54.47, 9.50), (54.50, 9.60), (54.51, 9.67)]),
    ("Offa's Dyke", 785, 9999, 2, [(53.34, -3.40), (53.0, -3.07), (52.65, -3.13), (52.34, -3.05), (52.05, -3.02), (51.80, -2.70), (51.63, -2.65)]),
    ('Han Great Wall (Hexi)', -121, 220, 2, [(40.36, 93.86), (40.25, 95.0), (40.0, 97.0), (39.80, 98.3), (39.2, 100.2), (38.7, 101.8), (37.95, 102.9), (37.2, 103.9)]),
    ('Qin Great Wall', -214, 220, 2, [(37.2, 103.9), (37.9, 105.2), (38.9, 106.7), (40.9, 107.6), (41.0, 109.8), (40.8, 111.6), (41.2, 113.6), (41.5, 115.8), (41.7, 117.9), (42.0, 120.6), (41.8, 123.4), (41.2, 124.6)]),
    ('Ming Great Wall', 1474, 9999, 2, [(39.80, 98.21), (39.55, 99.3), (39.0, 100.5), (38.5, 101.6), (37.95, 102.75), (37.35, 103.9), (37.15, 104.7), (37.45, 105.5), (38.45, 106.1), (38.0, 107.0), (37.75, 107.9), (38.28, 109.73), (38.85, 110.45), (39.43, 111.48), (39.70, 112.3), (40.20, 113.3), (40.55, 114.4), (40.83, 114.9), (40.36, 116.02), (40.43, 116.56), (40.69, 117.15), (40.43, 118.3), (40.25, 119.0), (39.97, 119.80)]),
    ('Ming Liaodong Wall', 1442, 1644, 2, [(39.97, 119.80), (40.6, 120.6), (41.3, 121.2), (41.9, 122.4), (42.3, 123.4), (41.9, 124.1), (41.0, 124.4), (40.22, 124.52)]),
    ('Maginot Line', 1936, 1940, 0, [(49.52, 5.76), (49.40, 6.05), (49.36, 6.40), (49.20, 6.90), (49.05, 7.43), (48.97, 8.18), (48.60, 7.80), (48.10, 7.58), (47.56, 7.59)]),
    ('Berlin Wall', 1961, 1989, 0, [(52.66, 13.29), (52.62, 13.39), (52.55, 13.40), (52.51, 13.42), (52.47, 13.48), (52.40, 13.53), (52.38, 13.45), (52.38, 13.30), (52.39, 13.12), (52.45, 13.11), (52.53, 13.13), (52.58, 13.13), (52.64, 13.20), (52.66, 13.29)]),
    ('Korean DMZ', 1953, 9999, 0, [(37.77, 126.68), (37.956, 126.677), (38.10, 126.95), (38.25, 127.2), (38.30, 127.6), (38.30, 127.9), (38.33, 128.1), (38.61, 128.36)]),
]
for name, a, b, cert, pts in WALLS:
    add_line('wl', a, b, cert << 1, [(lon, lat) for lat, lon in pts]); stats['wall'] += 1

# ---------------------------------------------------------------- country grid and population (HYDE via OWID)
W, H = 2160, 1080
countries, cidx = [], {}
cimg = Image.new('L', (W, H), 0)
wab = ROMAN + 'world_administrative_boundaries/world_administrative_boundaries' if ROMAN else None
if wab and os.path.exists(wab + '.shp'):
    dr = ImageDraw.Draw(cimg)
    r = shapefile.Reader(wab)
    for sr in r.iterShapeRecords():
        code = sr.record['iso3'] or sr.record['color_code']
        if not code: continue
        if code not in cidx:
            if len(countries) >= 254: continue
            countries.append(code); cidx[code] = len(countries)
        s = sr.shape; parts = list(s.parts) + [len(s.points)]
        for i in range(len(parts) - 1):
            ring = [((x + 180) * W / 360, (90 - y) * H / 180) for x, y in s.points[parts[i]:parts[i + 1]]]
            if len(ring) > 2: dr.polygon(ring, fill=cidx[code])
cgrid = cimg.load()


def country_at(lon, lat):
    x = min(W - 1, max(0, int((lon + 180) * W / 360))); y = min(H - 1, max(0, int((90 - lat) * H / 180)))
    i = cgrid[x, y]
    return countries[i - 1] if i else None


# ---------------------------------------------------------------- Natural Earth: modern roads, railways, ports, admin-1
# Natural Earth draws today's network, so each line gets the year its kind of road or railway became common in its country.
RAIL = {'GBR': 1840, 'BEL': 1843, 'DEU': 1850, 'FRA': 1852, 'NLD': 1860, 'CHE': 1860, 'AUT': 1855, 'CZE': 1855, 'ITA': 1865, 'ESP': 1866,
        'PRT': 1870, 'DNK': 1870, 'SWE': 1870, 'NOR': 1880, 'FIN': 1880, 'POL': 1865, 'HUN': 1865, 'IRL': 1855, 'RUS': 1875, 'UKR': 1875,
        'BLR': 1875, 'ROU': 1880, 'BGR': 1890, 'SRB': 1890, 'GRC': 1895, 'TUR': 1895, 'IND': 1875, 'PAK': 1880, 'BGD': 1890, 'LKA': 1890,
        'EGY': 1860, 'ZAF': 1890, 'DZA': 1880, 'TUN': 1890, 'JPN': 1890, 'CHN': 1910, 'KOR': 1910, 'PRK': 1910, 'TWN': 1905, 'MEX': 1885,
        'ARG': 1885, 'URY': 1885, 'CHL': 1885, 'BRA': 1890, 'PER': 1895, 'CUB': 1860, 'CAN': 1880, 'AUS': 1885, 'NZL': 1890, 'IDN': 1900,
        'VNM': 1910, 'THA': 1910, 'MMR': 1900, 'IRN': 1935, 'IRQ': 1920, 'SYR': 1910, 'SAU': 1955, 'KAZ': 1910, 'UZB': 1900, 'MNG': 1955}
ROAD = {'DEU': 1935, 'ITA': 1925, 'USA': 1925, 'GBR': 1930, 'FRA': 1930, 'NLD': 1935, 'BEL': 1935, 'CAN': 1935, 'JPN': 1960, 'CHN': 1970}


def ne_lines():
    p = ZD + 'ne_10m_railroads/ne_10m_railroads'
    if os.path.exists(p + '.shp'):
        for sr in shapefile.Reader(p).iterShapeRecords():
            if sr.record['scalerank'] > 9: continue
            ln = shape(sr.shape.__geo_interface__)
            for c in lines_of(ln, 0.004):
                m = c[len(c) // 2]; cc = country_at(*m)
                a = RAIL.get(cc, 1920)
                if cc == 'USA': a = 1855 if m[0] > -95 else 1885
                if cc == 'RUS' and m[0] > 60: a = 1905
                if cc == 'CAN' and m[0] < -95: a = 1890
                add_line('rw', a, 9999, (sr.record['scalerank'] <= 6) | 1 << 1, c); stats['railway'] += 1
    p = ZD + 'ne_10m_roads/ne_10m_roads'
    if os.path.exists(p + '.shp'):
        for sr in shapefile.Reader(p).iterShapeRecords():
            t = sr.record['type']; sc = sr.record['scalerank']
            if t in ('Major Highway', 'Beltway'): kind, main = 'hw', 1
            elif t == 'Secondary Highway' and sc <= 8: kind, main = 'hw', 0
            elif t == 'Road' and sc <= 6: kind, main = 'rd', 0
            else: continue
            ln = shape(sr.shape.__geo_interface__)
            for c in lines_of(ln, 0.004):
                cc = sr.record['sov_a3'] or country_at(*c[len(c) // 2])
                a = ROAD.get(cc, 1950) + (0 if main else 10)
                if sr.record['expressway']: a = max(a, {'DEU': 1935, 'ITA': 1925, 'USA': 1956, 'NLD': 1937}.get(cc, 1965))
                add_line(kind, a, 9999, main | 1 << 1, c); stats['modern road'] += 1
    p = ZD + 'ne_10m_ports/ne_10m_ports'
    if os.path.exists(p + '.shp'):
        for sr in shapefile.Reader(p).iterShapeRecords():
            x, y = sr.shape.points[0]; add_pt('p', x, y, 1900, 9999); stats['modern port'] += 1
    p = ZD + 'ne_10m_admin_1/ne_10m_admin_1_states_provinces'
    if os.path.exists(p + '.shp'):
        for sr in shapefile.Reader(p).iterRecords():
            if not sr['name'] or sr['scalerank'] > 6: continue
            rank = 1 if sr['labelrank'] <= 2 else 2 if sr['labelrank'] <= 4 else 3
            add_name(sr['name'], sr['longitude'], sr['latitude'], 1994, 9999, rank); stats['admin-1'] += 1
ne_lines()

# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.startswith('d_') and f.endswith('.json'): os.remove(os.path.join(OUT, f))
total = 0
for (c, r), t in sorted(tiles.items()):
    # Draw order inside a tile: most important first so the renderer can stop early under a budget.
    t['lines'].sort(key=lambda l: (l[0] != 'wl', -(l[3] & 1)))
    s = json.dumps(t, separators=(',', ':'), ensure_ascii=False)
    open(os.path.join(OUT, f'd_{c}_{r}.json'), 'w', encoding='utf-8').write(s); total += len(s)

# Population per country and epoch, and arable km2 per country from terrain classes (grassland, steppe, forest, wetland, hills).
EPOCHS = [-5000, -3000, -2000, -1000, 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1750, 1800,
          1850, 1900, 1925, 1950, 1975, 2000, 2020]
pop = collections.defaultdict(dict)
pf = RAW + 'hyde/owid-population.csv'
if os.path.exists(pf):
    for row in csv.DictReader(open(pf)):
        if row['Code'] and len(row['Code']) == 3: pop[row['Code']][int(row['Year'])] = float(row['Population'])


def at(series, y):
    ys = sorted(series)
    if not ys: return 0
    if y <= ys[0]: return series[ys[0]]
    for i in range(1, len(ys)):
        if y <= ys[i]:
            a, b = ys[i - 1], ys[i]; return series[a] + (series[b] - series[a]) * (y - a) / (b - a)
    return series[ys[-1]]
terr = Image.open(ATLAS + 'pixel/terrain/terrain_l0.png').convert('RGB').load()
arable = collections.Counter()
ARABLE = {6: 0.3, 7: 0.5, 8: 1, 9: 0.6, 10: 1, 11: 0.7, 14: 0.6, 15: 0.8, 4: 1}
for y in range(H):
    lat = 90 - (y + 0.5) * 180 / H; km2 = (111.32 * 180 / H) ** 2 * math.cos(math.radians(lat))
    for x in range(W):
        i = cgrid[x, y]
        if not i: continue
        c, _, elev = terr[x, y]
        wgt = ARABLE.get(c, 0.02 if c in (12, 13) else 0)
        if elev * 25 > 3200: wgt *= 0.2
        arable[i] += wgt * km2
pj = {'epochs': EPOCHS, 'countries': [], 'source': 'HYDE 3.x country population via Our World in Data (CC BY 4.0)'}
for i, code in enumerate(countries, 1):
    pj['countries'].append({'c': code, 'km2': round(arable[i]), 'pop': [round(at(pop[code], e)) for e in EPOCHS] if code in pop else None})
json.dump(pj, open(os.path.join(OUT, 'pop.json'), 'w'), separators=(',', ':'))
rgb = Image.merge('RGB', (cimg, cimg, cimg))
rgb.save(os.path.join(OUT, 'countries.png'), optimize=True)
open(os.path.join(OUT, 'SOURCES.md'), 'w').write('''# Pixel map zoom detail: sources

- Roman roads: Itiner-e (de Soto et al. 2025, https://doi.org/10.5281/zenodo.17122148), as exported in Pazout et al., roman-road-networks v1.0.0 (https://doi.org/10.5281/zenodo.20446953), CC BY-SA 4.0. Dates: the segment's own dates where given, else the province's annexation (not before 312 BCE) to the end of Roman or Byzantine rule there.
- Roman provinces in 200 CE: Ancient World Mapping Center, corrected by A. Pazout (same package).
- Ancient settlements, villas, ports, forts, centuriation, provinces and regions: Pleiades (CC BY 3.0), minDate to maxDate; villas and forts capped at 640 CE.
- Historical provinces (duchies, themes, eyalets, satrapies, commanderies...), castles, forts, city walls, ports, lighthouses: Wikidata (CC0), inception to dissolution; undated sites left out.
- Long walls: traced through well-known forts and end points (approximate lines are flagged).
- Modern roads, railways, ports and first-level divisions: Natural Earth 10m (public domain). These are today's networks, shown from the year that kind of line became common in each country (estimate).
- Fields and villages: density from HYDE 3.x country population (via Our World in Data, CC BY 4.0) spread over arable land from the terrain classes; drawn procedurally.
''')
print(dict(stats))
print(f'{len(tiles)} tiles, {total / 1e6:.1f} MB; countries {len(countries)}')
