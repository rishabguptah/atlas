#!/usr/bin/env python3
"""Terrain-class raster pyramid for the pixel-art map (plain lon/lat, row 0 = 90N, col 0 = 180W).

Usage: python3 ingest/geography/pixel_terrain.py RAW_DIR KOPPEN_TXT NE1_TIF OUT_DIR [L0] [L1] [L2]
  RAW_DIR     ETOPO2v2c_f4.nc and Natural Earth geojson (10m land, lakes, rivers, regions; 50m glaciers, ice shelves)
  KOPPEN_TXT  Kottek et al. 2006 Koppen-Geiger 0.5 degree grid (Koeppen-Geiger-ASCII.txt)
  NE1_TIF     Natural Earth I raster (NE1_50M_SR_W.tif), used only for how green or sandy the land looks
Writes OUT_DIR/terrain_l0.png (2160x1080), terrain_l1.png (5400x2700) and z2_<col>_<row>.png tiles
(30x30 degrees, 900x900) for the full 10800x5400 grid. Pixels: R = class id, G = hillshade (128 flat),
B = land elevation / 25 m or sea depth / 40 m, capped at 255. Class ids are in CLASSES below.
Needs numpy, scipy, netCDF4 and Pillow.
"""
import json, os, sys
import numpy as np
import netCDF4
from PIL import Image, ImageDraw
from scipy import ndimage

RAW, KOPPEN, NE1, OUT = sys.argv[1:5]
LEVELS = set(sys.argv[5:]) or {'L0', 'L1', 'L2'}
Image.MAX_IMAGE_PIXELS = None
CLASSES = ['deep_ocean', 'sea', 'shelf', 'lake', 'river', 'ice', 'tundra', 'boreal_forest', 'temperate_forest',
           'tropical_forest', 'grassland', 'steppe_savanna', 'sand_desert', 'rock_desert', 'wetland', 'hills',
           'mountains', 'high_peaks']
C = {n: i for i, n in enumerate(CLASSES)}


def raster(paths, shape, filt=None, lines=False, width=1):
    h, w = shape
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    xy = lambda ring: [((x + 180) / 360 * w, (90 - y) / 180 * h) for x, y in ring]
    for p in paths:
        for f in json.load(open(os.path.join(RAW, p + '.geojson')))['features']:
            pr = {k.lower(): v for k, v in f['properties'].items()}
            if filt and not filt(pr):
                continue
            g = f['geometry']
            if g is None:
                continue
            if lines:
                for ln in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
                    d.line(xy(ln), fill=255, width=width)
                continue
            for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
                for i, ring in enumerate(poly):
                    if len(ring) > 2:
                        d.polygon(xy(ring), fill=255 if i == 0 else 0)
    return np.asarray(img) > 127


print('elevation')
z = np.flipud(np.asarray(netCDF4.Dataset(os.path.join(RAW, 'ETOPO2v2c_f4.nc')).variables['z'][:], dtype=np.float32))
H, W = z.shape  # 5400 x 10800, 2 arc-minutes
lat = 90 - (np.arange(H) + .5) * 180 / H

print('masks')
land = raster(['ne_10m_land'], z.shape)
lakes = raster(['ne_10m_lakes'], z.shape, lambda p: (p.get('scalerank') or 0) <= 6)
ice = raster(['ne_50m_glaciated_areas', 'ne_50m_antarctic_ice_shelves_polys'], z.shape) | (land & (lat < -60)[:, None])
wet = raster(['ne_10m_geography_regions_polys'], z.shape, lambda p: p.get('featurecla') in ('Wetlands', 'Delta'))
erg = raster(['ne_10m_geography_regions_polys'], z.shape,
             lambda p: p.get('featurecla') == 'Desert' and any(w in (p.get('name') or '') for w in
                                                               ('Erg', 'Rub', 'Nafud', 'Sands', 'Taklimakan', 'Garagum',
                                                                'Qizilqum', 'Thar', 'Namib', 'Great Sandy', 'Great Victoria',
                                                                'Ténéré', 'Idhän', 'Sarïr', 'Kalahari', 'Simpson')))

print('climate')
kg = {}
for line in open(KOPPEN).readlines()[1:]:
    a = line.split()
    if len(a) == 3:
        kg[(int(round((89.75 - float(a[0])) * 2)), int(round((float(a[1]) + 179.75) * 2)))] = a[2]
# biome groups from the climate code; forest vs open land is decided later from how green the land looks
GROUP = {'EF': 'ice', 'ET': 'tundra', 'BWh': 'desert', 'BWk': 'desert', 'BSh': 'steppe', 'BSk': 'steppe',
         'Af': 'tropical', 'Am': 'tropical', 'Aw': 'savanna', 'As': 'savanna',
         'Dfc': 'boreal', 'Dfd': 'boreal', 'Dwc': 'boreal', 'Dwd': 'boreal', 'Dsc': 'boreal', 'Dsd': 'boreal'}
groups = ['ice', 'tundra', 'desert', 'steppe', 'tropical', 'savanna', 'boreal', 'temperate']
coarse = np.full((360, 720), -1, np.int8)
for (r, c), code in kg.items():
    coarse[r, c] = groups.index(GROUP.get(code, 'temperate'))
# spread climate into coastal cells the 0.5 degree grid leaves empty
idx = ndimage.distance_transform_edt(coarse < 0, return_distances=False, return_indices=True)
coarse = coarse[idx[0], idx[1]]
rng = np.random.default_rng(11)
warp = ndimage.gaussian_filter(rng.normal(0, 1, (H // 10, W // 10)), 3)
warp = ndimage.zoom(warp, 10, order=1) * 9
# smooth each climate group's share up to 2 arc-minutes, then wobble the sampling so edges look natural
rr = np.clip(np.arange(H, dtype=np.float32)[:, None] + warp, 0, H - 1)
cc = np.clip(np.arange(W, dtype=np.float32)[None, :] - warp, 0, W - 1)
best, biome = np.full(z.shape, -1e9, np.float32), np.zeros(z.shape, np.int8)
for gi in range(len(groups)):
    p = ndimage.gaussian_filter(ndimage.zoom((coarse == gi).astype(np.float32), 15, order=1), 4)
    p = ndimage.map_coordinates(p, [rr, cc], order=1)
    m = p > best
    best[m], biome[m] = p[m], gi
del best, warp, rr, cc

print('land cover look')
ne1 = np.asarray(Image.open(NE1).convert('RGB'), dtype=np.float32)
s = ne1.sum(-1) + 1
green = ne1[..., 1] / s - (ne1[..., 0] + ne1[..., 2]) / (2 * s)  # > 0 means greener than grey
bright = s / 3
green = ndimage.gaussian_filter(green, 1.5)
del ne1, s

print('relief')
zl = np.where(land, np.maximum(z, 0), 0)
relief = ndimage.maximum_filter(zl, 5) - ndimage.minimum_filter(zl, 5)  # ~ 18 km window
relief = ndimage.gaussian_filter(relief, 1.5)

cls = np.full(z.shape, C['sea'], np.uint8)
cls[(~land) & (z > -200)] = C['shelf']
cls[(~land) & (z <= -2000)] = C['deep_ocean']
G = lambda name: biome == groups.index(name)
L = land
forest = green > .035
cls[L & G('tundra')] = C['tundra']
cls[L & G('boreal')] = C['boreal_forest']
cls[L & G('temperate')] = np.where(forest[L & G('temperate')], C['temperate_forest'], C['grassland'])
cls[L & G('tropical')] = np.where((green > .02)[L & G('tropical')], C['tropical_forest'], C['steppe_savanna'])
cls[L & G('savanna')] = np.where((green > .07)[L & G('savanna')], C['tropical_forest'], C['steppe_savanna'])
cls[L & G('steppe')] = C['steppe_savanna']
sandy = erg | ((relief < 70) & (zl < 900) & (bright > 150))  # flat low desert reads as sand sea
cls[L & G('desert')] = np.where(sandy[L & G('desert')], C['sand_desert'], C['rock_desert'])
cls[L & wet & ~G('desert')] = C['wetland']
# relief overrides biome
cls[L & ((relief > 380) | ((zl > 1300) & (relief > 220)))] = C['hills']
cls[L & ((relief > 750) | ((zl > 2200) & (relief > 380)))] = C['mountains']
cls[L & (((zl > 4300) & (relief > 700)) | (zl > 5600))] = C['high_peaks']
cls[L & (ice | G('ice'))] = C['ice']
cls[lakes] = C['lake']
del relief, green, bright, biome


def shade(zz, cell_km):
    """Hillshade, sun 315 degrees, altitude 45; 128 = flat ground and all sea."""
    zz = np.where(zz > 0, zz, 0)
    la = np.radians(90 - (np.arange(zz.shape[0]) + .5) * 180 / zz.shape[0])
    dy = np.gradient(zz, axis=0) / (cell_km * 1000)
    dx = np.gradient(zz, axis=1) / (cell_km * 1000 * np.maximum(np.cos(la), .05))[:, None]
    nx, ny = -dx * 3, dy * 3  # mild exaggeration so pixel art can read it
    az, alt = np.radians(315), np.radians(45)
    hs = (np.sin(alt) + np.cos(alt) * (nx * np.sin(az) + ny * np.cos(az))) / np.sqrt(nx * nx + ny * ny + 1)
    return np.clip(128 * hs / np.sin(alt), 0, 255).astype(np.uint8)


def depth_b(zz):
    return np.clip(np.where(zz > 0, zz / 25, -zz / 40), 0, 255).astype(np.uint8)


def mode_down(a, f):
    """Majority class in each f x f block; water classes win ties so coasts stay put."""
    h, w = a.shape[0] // f, a.shape[1] // f
    blocks = a[:h * f, :w * f].reshape(h, f, w, f).transpose(0, 2, 1, 3).reshape(h, w, f * f)
    counts = np.stack([(blocks == c).sum(-1) for c in range(len(CLASSES))], -1)
    return counts.argmax(-1).astype(np.uint8)


def rivers(shape, level):
    if level == 'L0':
        return raster(['ne_50m_rivers_lake_centerlines_scale_rank'], shape, lambda p: (p.get('scalerank') or 9) <= 3, lines=True)
    if level == 'L1':
        return raster(['ne_50m_rivers_lake_centerlines_scale_rank'], shape, lambda p: (p.get('scalerank') or 9) <= 6, lines=True)
    return raster(['ne_10m_rivers_lake_centerlines'], shape, lambda p: (p.get('scalerank') or 9) <= 8, lines=True)


os.makedirs(OUT, exist_ok=True)
for level, f in (('L0', 5), ('L1', 2), ('L2', 1)):
    if level not in LEVELS:
        continue
    print('level', level)
    c = cls if f == 1 else mode_down(cls, f)
    zz = z if f == 1 else z[:H // f * f, :W // f * f].reshape(H // f, f, W // f, f).mean((1, 3))
    c = c.copy()
    rv = rivers(c.shape, level)
    c[rv & (c > C['ice'])] = C['river']  # rivers only over land
    img = np.dstack([c, shade(zz, 3.7 * f), depth_b(zz)])
    if level != 'L2':
        Image.fromarray(img, 'RGB').save(os.path.join(OUT, f'terrain_{level.lower()}.png'), optimize=True)
    else:
        for col in range(12):
            for row in range(6):
                Image.fromarray(img[row * 900:(row + 1) * 900, col * 900:(col + 1) * 900], 'RGB').save(
                    os.path.join(OUT, f'z2_{col}_{row}.png'), optimize=True)
    print(level, c.shape, np.bincount(c.ravel(), minlength=len(CLASSES)).tolist())
json.dump({'classes': CLASSES, 'channels': {'R': 'class id', 'G': 'hillshade, sun 315 alt 45, 128 = flat or sea',
                                            'B': 'land elevation m / 25, sea depth m / 40, capped 255'},
           'grid': 'equirectangular lon/lat, row 0 = 90N, col 0 = 180W',
           'levels': {'L0': 'terrain_l0.png 2160x1080 (10 arc-min)', 'L1': 'terrain_l1.png 5400x2700 (4 arc-min)',
                      'L2': 'z2_<col>_<row>.png, 900x900 tiles of 30x30 degrees (2 arc-min), col 0 = 180W, row 0 = 90N'},
           'sources': ['NOAA ETOPO2v2c', 'Natural Earth 10m/50m vectors and NE1 raster', 'Kottek et al. 2006 Koppen-Geiger 0.5 deg'],
           'notes': 'Present-day land cover. Biomes from Koppen climate groups; forest vs open land from how green the Natural Earth I raster looks; relief classes override biome.'},
          open(os.path.join(OUT, 'terrain.json'), 'w'), indent=1)
