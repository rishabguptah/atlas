#!/usr/bin/env python3
"""Ice-age world rasters for the Atlas: sea depth and ice-sheet extents, plus the sea-level curve that drives them.

Usage: python3 ingest/deep-time/paleo.py RAW_DIR OUT_DIR
  RAW_DIR  ETOPO2v2c_f4.nc (NOAA), spratt2016.txt (NOAA NCEI paleo, Spratt & Lisiecki 2016) and
           batchelor/<slice>/<slice>_best_estimate.shp (Batchelor et al. 2019, OSF 7jen3)
  OUT_DIR  writes paleo-sea.png, paleo-ice.png (equirectangular, row 0 = 90N, col 0 = 180W, CELL arc-min)
           and sealevel.json.

paleo-sea.png (grey): 0 = present land, 1..254 = sea depth in metres, 255 = deeper than 254 m.
  At sea level S (metres, negative in an ice age) a sea cell is dry land when its depth < -S.
paleo-ice.png (RGB): R = ice in slices 0-7, G low 4 bits = ice in slices 8-11 (bit n = slice n, see sealevel.json
  "slices"), G high 4 bits = which LGM ice sheet (sealevel.json "sheets"), B = deglaciation rank inside the Last Glacial Maximum ice (0 = never ice; 1..254 = the share of its sheet's LGM area that
  lies closer to the margin than this cell). After 19 ka a sheet keeps cells with rank >= 254 * (1 - its area left).
Needs numpy, scipy, netCDF4, Pillow, pyshp, pyproj.
"""
import json, os, sys
import numpy as np
import netCDF4, shapefile
from PIL import Image, ImageDraw
from pyproj import Transformer
from scipy import ndimage

RAW, OUT = sys.argv[1:3]
CELL = 6  # arc-minutes
W, H = 360 * 60 // CELL, 180 * 60 // CELL

# ---- sea depth ----
z = np.flipud(np.asarray(netCDF4.Dataset(os.path.join(RAW, 'ETOPO2v2c_f4.nc')).variables['z'][:], dtype=np.float32))
f = CELL // 2
z = z[:H * f, :W * f].reshape(H, f, W, f)
land = (z >= 0).mean(axis=(1, 3)) >= 0.5
depth = np.clip(-z.mean(axis=(1, 3)), 1, 255)
sea = np.where(land, 0, np.round(depth)).astype(np.uint8)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(sea, 'L').save(os.path.join(OUT, 'paleo-sea.png'), optimize=True)

# ---- ice sheets (Batchelor et al. 2019 best estimates, North Pole Lambert azimuthal equal area) ----
# [folder, label, ka]: ka is the moment the slice stands for (the peak of the stage).
SLICES = [['MIS 8', 'MIS 8', 260], ['MIS 6', 'MIS 6, the penultimate glacial maximum', 150], ['MIS 5d', 'MIS 5d', 112],
          ['MIS 5c', 'MIS 5c', 100], ['MIS 5b', 'MIS 5b', 89], ['MIS 5a', 'MIS 5a', 79], ['MIS 4', 'MIS 4', 65],
          ['45 ka', '45,000 years ago', 45], ['40 ka', '40,000 years ago', 40], ['35 ka', '35,000 years ago', 35],
          ['30 ka', '30,000 years ago', 30], ['LGM', 'Last Glacial Maximum', 23]]
G = 5000.0  # metres per cell of the polar grid
N = int(2 * 7.0e6 / G)
lon = -180 + (np.arange(W) + .5) * CELL / 60
lat = 90 - (np.arange(H) + .5) * CELL / 60
LON, LAT = np.meshgrid(lon, lat)
north = LAT > 25
tr = Transformer.from_crs('EPSG:4326', '+proj=laea +lat_0=90 +lon_0=0 +datum=WGS84 +units=m', always_xy=True)
px, py = tr.transform(LON[north], LAT[north])
pi = np.clip(((px + 7.0e6) / G).astype(int), 0, N - 1)
pj = np.clip(((7.0e6 - py) / G).astype(int), 0, N - 1)

def mask(folder):
    tag = folder.replace(' ', '') if folder != 'LGM' else 'LGM'
    base = os.path.join(RAW, 'batchelor', folder, tag + '_best_estimate')
    r = shapefile.Reader(base + '.shp')
    # Most slices are in the polar projection; the LGM file is plain lon/lat.
    geo = open(base + '.prj').read().startswith('GEOGCS')
    img = Image.new('L', (W, H) if geo else (N, N), 0); d = ImageDraw.Draw(img)
    for s in r.shapes():
        parts = list(s.parts) + [len(s.points)]
        rings = [s.points[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]
        # Rings in shapefile order: clockwise outer rings, counter-clockwise holes.
        for ring in rings:
            xy = [((x + 180) * 60 / CELL, (90 - y) * 60 / CELL) if geo else ((x + 7.0e6) / G, (7.0e6 - y) / G) for x, y in ring]
            area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
            if len(xy) > 2: d.polygon(xy, fill=255 if area < 0 else 0)
    a = np.asarray(img) > 127
    if geo: return a
    out = np.zeros((H, W), bool); out[north] = a[pj, pi]
    return out

# Patagonian Ice Sheet at the LGM (Batchelor covers the north only): a band along the Andes, after Davies et al. 2020
# (PATICE), traced coarsely; marked approximate in the lens.
PATAGONIA = [(-72.6, -38.5), (-71.0, -38.5), (-70.6, -41.0), (-70.6, -44.0), (-70.9, -46.5), (-70.6, -49.0),
             (-70.2, -51.5), (-69.0, -52.6), (-67.6, -54.2), (-66.6, -55.2), (-69.0, -56.0), (-72.5, -55.0),
             (-75.6, -53.0), (-76.0, -49.5), (-75.8, -46.0), (-74.8, -43.0), (-74.0, -40.5)]
img = Image.new('L', (W, H), 0)
ImageDraw.Draw(img).polygon([((x + 180) * 60 / CELL, (90 - y) * 60 / CELL) for x, y in PATAGONIA], fill=255)
pat = np.asarray(img) > 127

masks = []
for folder, label, ka in SLICES:
    m = mask(folder)
    if folder in ('MIS 6', 'MIS 8', 'MIS 4', 'LGM'): m |= pat
    masks.append(m)
    print(folder, int(m.sum()), 'cells', file=sys.stderr)
R = np.zeros((H, W), np.uint8); Gc = np.zeros((H, W), np.uint8)
for i, m in enumerate(masks):
    if i < 8: R |= (m.astype(np.uint8) << i)
    else: Gc |= (m.astype(np.uint8) << (i - 8))
# Deglaciation: the LGM ice is cut into its ice sheets (nearest centre, within 2,500 km) and each sheet ranks its
# cells by how far inside its own margin they lie (as a percentile of the sheet's area, on the equal-area polar grid).
# The top 4 bits of G hold the sheet; each sheet retreats on its own timetable (SHEETS in sealevel.json).
SHEETS = [['other', None], ['laurentide', (-85, 60)], ['cordilleran', (-125, 55)], ['innuitian', (-85, 78)],
          ['greenland', (-40, 73)], ['iceland', (-18, 65)], ['british_irish', (-4, 55.5)], ['fennoscandian', (17, 63)],
          ['barents_kara', (50, 75)]]
# Share of each sheet's LGM area still ice-covered, by ka (Dyke 2004 for North America; Hughes et al. 2016 DATED-1
# for Eurasia; Clark et al. 2012 for the British-Irish ice), read coarsely: approximate.
RETREAT = {
    'other': [[11, 0], [12, .1], [14, .2], [16, .4], [17, .6], [19, 1]],
    'laurentide': [[6.8, 0], [7.5, .05], [8, .13], [9, .3], [10, .45], [11.5, .6], [13, .7], [14, .8], [16, .92], [19, 1]],
    'cordilleran': [[11, 0], [12, .08], [13, .2], [14, .5], [15, .8], [16, .95], [19, 1]],
    'innuitian': [[7, 0], [8, .1], [9, .2], [10, .4], [11, .6], [13, .9], [19, 1]],
    'greenland': [[8, 0], [9, .2], [10, .4], [11, .7], [14, .85], [19, 1]],
    'iceland': [[9, 0], [10, .1], [11, .3], [12, .5], [15, .7], [19, 1]],
    'british_irish': [[11.5, 0], [13, .03], [14, .05], [15, .15], [16, .4], [17, .6], [19, 1]],
    'fennoscandian': [[9.5, 0], [9.7, .02], [10, .08], [10.5, .2], [11, .35], [12, .5], [13, .55], [15, .75], [17, .9], [19, 1]],
    'barents_kara': [[12, 0], [14, .05], [15, .15], [16, .35], [17, .6], [19, .95]],
}
lgm = masks[-1]
polar = np.zeros((N, N), bool)
polar[pj[lgm[north]], pi[lgm[north]]] = True
polar = ndimage.binary_closing(polar, iterations=2)
yy, xx = np.mgrid[0:N, 0:N]
px_m, py_m = xx * G - 7.0e6 + G / 2, 7.0e6 - yy * G - G / 2
best = np.full((N, N), 9e12); sheet_p = np.zeros((N, N), np.uint8)
for i, (name, at) in enumerate(SHEETS):
    if not at: continue
    sx, sy = tr.transform(*at)
    dd = (px_m - sx) ** 2 + (py_m - sy) ** 2
    take = (dd < best) & (dd < 2.5e6 ** 2)
    best = np.where(take, dd, best); sheet_p = np.where(take, i, sheet_p)
sheet_p = np.where(polar, sheet_p, 0)
dist = np.zeros((N, N))
for i in range(len(SHEETS)):
    m = polar & (sheet_p == i)
    if m.any(): dist = np.where(m, ndimage.distance_transform_edt(m), dist)
d = np.zeros((H, W)); d[north] = dist[pj, pi]
sh = np.zeros((H, W), np.uint8); sh[north] = sheet_p[pj, pi]
sh = np.where(lgm, sh, 0)
# Outside the polar grid (Patagonia) or in small sheets: distance in from the margin on the lon/lat grid.
rest = lgm & (d == 0)
d = np.where(rest, ndimage.distance_transform_edt(lgm), d)
B = np.zeros((H, W), np.uint8)
wts_all = np.cos(np.radians(LAT))
for i in range(len(SHEETS)):
    m = lgm & (sh == i)
    if not m.any(): continue
    vals, wts = d[m], wts_all[m]
    order = np.argsort(vals, kind='stable')
    cum = np.cumsum(wts[order]); cum /= cum[-1]
    pct = np.empty_like(cum); pct[order] = cum
    B[m] = np.clip(np.round(1 + 253 * pct), 1, 254).astype(np.uint8)
    print(SHEETS[i][0], int(m.sum()), 'cells', file=sys.stderr)
Gc |= (sh << 4).astype(np.uint8)
Image.fromarray(np.dstack([R, Gc, B]), 'RGB').save(os.path.join(OUT, 'paleo-ice.png'), optimize=True)

# ---- sea level: Lambeck et al. 2014 for the last 29,000 years, Spratt & Lisiecki 2016 (short PC1 stack) before ----
# Lambeck points read from the paper's ice-volume-equivalent curve (Fig. 4 and abstract): approximate to a few metres.
LAMBECK = [[0, 0], [4, -0.5], [6, -2], [7, -4], [8.2, -12], [9, -22], [10, -38], [11, -50], [11.7, -58], [12.9, -66],
           [14.3, -78], [14.7, -96], [16.5, -118], [19, -128], [21, -134], [26, -132], [29, -125]]
sp = []
for line in open(os.path.join(RAW, 'spratt2016.txt')):
    if line.startswith('#') or line.startswith('age'): continue
    a = line.split()
    if len(a) > 2 and a[1] != 'NaN' and 30 <= float(a[0]) <= 310: sp.append([float(a[0]), round(float(a[1]), 1)])
curve = LAMBECK + sp
json.dump({
    'cell': CELL / 60, 'w': W, 'h': H,
    'sea': curve,  # [ka before present, metres relative to today]
    'slices': [{'label': l, 'ka': ka} for _, l, ka in SLICES],
    'sheets': [n for n, _ in SHEETS], 'retreat': RETREAT,
    'sources': [
        {'cite': 'Batchelor, C.L. et al., "The configuration of Northern Hemisphere ice sheets through the Quaternary", Nature Communications 10, 3713 (2019); shapefiles OSF 7jen3', 'url': 'https://doi.org/10.1038/s41467-019-11601-2'},
        {'cite': 'Spratt, R.M. & Lisiecki, L.E., "A Late Pleistocene sea level stack", Climate of the Past 12, 1079-1092 (2016)', 'url': 'https://doi.org/10.5194/cp-12-1079-2016'},
        {'cite': 'Lambeck, K. et al., "Sea level and global ice volumes from the Last Glacial Maximum to the Holocene", PNAS 111, 15296-15303 (2014)', 'url': 'https://doi.org/10.1073/pnas.1411762111'},
        {'cite': 'NOAA National Geophysical Data Center, ETOPO2v2 Global Gridded 2-minute Database (2006)', 'url': 'https://www.ncei.noaa.gov/products/etopo-global-relief-model'},
        {'cite': 'Davies, B.J. et al., "The evolution of the Patagonian Ice Sheet from 35 ka to the present day (PATICE)", Earth-Science Reviews 204, 103152 (2020)', 'url': 'https://doi.org/10.1016/j.earscirev.2020.103152'},
    ],
}, open(os.path.join(OUT, 'sealevel.json'), 'w'), separators=(',', ':'))
for f in ('paleo-sea.png', 'paleo-ice.png', 'sealevel.json'): print(f, os.path.getsize(os.path.join(OUT, f)), file=sys.stderr)
