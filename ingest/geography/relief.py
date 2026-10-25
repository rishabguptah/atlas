#!/usr/bin/env python3
"""Paint the illustrated relief basemap: hypsometric tints + soft hillshade + engraved coast lines,
reprojected to d3.geoNaturalEarth1 (no rotation) so it lines up with every view's vector layers.

Usage: python3 ingest/geography/relief.py RAW_DIR OUT_DIR [--political] [width ...]
--political paints the strategy-game variant: neutral parchment land with strong relief, made to sit under
flat country colours blended with multiply, on a deep painted sea. It writes relief-political-<width>.webp.
RAW_DIR holds ETOPO2v2c_f4.nc (NOAA) and Natural Earth geojson (ne_50m_land, ne_50m_lakes,
ne_50m_glaciated_areas, ne_50m_antarctic_ice_shelves_polys, ne_50m_geography_regions_polys).
Writes OUT_DIR/relief-<width>.webp for each width (default 4096 and 8192).
Needs numpy, scipy, netCDF4 and Pillow.
"""
import json, os, sys
import numpy as np
import netCDF4
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

RAW, OUT = sys.argv[1], sys.argv[2]
POLITICAL = '--political' in sys.argv
WIDTHS = [int(w) for w in sys.argv[3:] if w.isdigit()] or [4096, 8192]

# Belle Epoque atlas palette: elevation (m) -> colour on land, depth (m) -> colour at sea.
LAND = [(-400, '#c7cf9c'), (0, '#c7cf9c'), (200, '#d3d6a6'), (500, '#e0d8ab'), (1000, '#dcc89a'),
        (1800, '#d0b086'), (2800, '#c19a72'), (4000, '#b48d6c'), (5000, '#bf9f84'), (6000, '#e6dccd'), (7500, '#f6f1e8')]
SEA = [(0, '#dbe8e1'), (-150, '#d0e2dc'), (-1000, '#bfd6d4'), (-3000, '#b0cacc'), (-6000, '#a3bfc4'), (-11000, '#98b6bd')]
SAND, ICE = '#eed39b', '#f4f3ee'
SHADE, SHADE_MIN, SAND_MIX, COAST_LINE, COAST_GLOW = 2.4, .55, .85, '#6f8f98', '#e6efe9'
if POLITICAL:
    LAND = [(-400, '#ebe2c8'), (0, '#ebe2c8'), (300, '#e9dfc2'), (800, '#e2d4b4'), (1600, '#d6c3a0'),
            (2800, '#c9b18f'), (4200, '#bea889'), (5400, '#d8cdbd'), (7000, '#f3eee6')]
    SEA = [(0, '#8eb1b6'), (-150, '#7fa3ab'), (-800, '#5f8796'), (-2500, '#4c7487'), (-5000, '#40667b'), (-11000, '#375b70')]
    SAND, ICE = '#ecdcb2', '#f2f0ea'
    SHADE, SHADE_MIN, SAND_MIX, COAST_LINE, COAST_GLOW = 3.0, .42, .45, '#cfe0dc', '#a9c6c6'


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def ramp(z, stops):
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    cs = np.stack([hexrgb(s[1]) for s in stops])
    order = np.argsort(xs)
    xs, cs = xs[order], cs[order]
    return np.stack([np.interp(z, xs, cs[:, k]) for k in range(3)], axis=-1).astype(np.float32)


def raster_polys(paths, shape, filt=None):
    """Rasterise geojson polygons onto the equirectangular grid (row 0 = north)."""
    h, w = shape
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    for p in paths:
        for f in json.load(open(os.path.join(RAW, p + '.geojson')))['features']:
            if filt and not filt(f['properties']):
                continue
            g = f['geometry']
            polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
            for poly in polys:
                for i, ring in enumerate(poly):
                    pts = [((x + 180) / 360 * w, (90 - y) / 180 * h) for x, y in ring]
                    if len(pts) > 2:
                        d.polygon(pts, fill=255 if i == 0 else 0)
    return np.asarray(img, dtype=np.float32) / 255


print('reading ETOPO2')
z = netCDF4.Dataset(os.path.join(RAW, 'ETOPO2v2c_f4.nc')).variables['z'][:].astype(np.float32)
z = np.flipud(np.asarray(z))  # row 0 = north
H, W = z.shape
lat = np.radians(90 - (np.arange(H) + .5) * 180 / H)

print('masks')
land = raster_polys(['ne_50m_land'], z.shape)
lakes = raster_polys(['ne_50m_lakes'], z.shape)
ice = np.clip(raster_polys(['ne_50m_glaciated_areas', 'ne_50m_antarctic_ice_shelves_polys'], z.shape), 0, 1)
ice = np.maximum(ice, (np.arange(H) > H * 0.93)[:, None] * land)  # Antarctica interior
desert = raster_polys(['ne_50m_geography_regions_polys'], z.shape,
                      lambda p: p.get('FEATURECLA') == 'Desert' and p.get('NAME') not in ('PUNJAB', 'CAATINGAS'))
desert = ndimage.gaussian_filter(desert, 6) * land
land = np.clip(land - lakes, 0, 1)

print('hillshade')
zl = np.where(land > .5, np.maximum(z, 0), z * 0.15)  # flatten the sea floor so coasts stay calm
zs = ndimage.gaussian_filter(zl, 1.2)
cell = 2 / 60 * 111320.0  # metres per cell north-south
dy = np.gradient(zs, axis=0) / cell
dx = np.gradient(zs, axis=1) / (cell * np.maximum(np.cos(lat), .05))[:, None]


def shade(dx, dy, az, alt, ex):
    az, alt = np.radians(az), np.radians(alt)
    nx, ny = -dx * ex, dy * ex  # row index runs south, so flip dy
    n = np.sqrt(nx * nx + ny * ny + 1)
    return (np.sin(alt) + np.cos(alt) * (nx * np.sin(az) + ny * np.cos(az))) / n


fine = 0.7 * shade(dx, dy, 315, 40, 14) + 0.3 * shade(dx, dy, 270, 50, 14)
zb = ndimage.gaussian_filter(zl, 8)
broad = shade(np.gradient(zb, axis=1) / (cell * np.maximum(np.cos(lat), .05))[:, None],
              np.gradient(zb, axis=0) / cell, 315, 35, 40)
flat = np.sin(np.radians(40))
hs = 0.65 * (fine - flat) + 0.35 * (broad - flat)  # 0 on flat ground, + lit, - shadow
del dx, dy, zb, fine, broad

print('colour')
zt = ndimage.gaussian_filter(z, 2)
col_land = ramp(zt, LAND)
col_land = col_land * (1 - desert[..., None] * SAND_MIX) + hexrgb(SAND) * desert[..., None] * SAND_MIX
col_land = col_land * (1 - ice[..., None]) + hexrgb(ICE) * ice[..., None]
k_land = np.clip(1 + hs * SHADE, SHADE_MIN, 1.18)[..., None]
col_land = np.clip(col_land * k_land + (k_land > 1) * 18 * (k_land - 1), 0, 255)
col_sea = ramp(np.minimum(zt, 0), SEA)
col_sea = col_sea * np.clip(1 + hs * .5, .9, 1.06)[..., None]
col_lake = hexrgb('#7fa3ab' if POLITICAL else '#c4dcda')
m = land[..., None]
img = col_land * m + col_sea * (1 - m)
img = img * (1 - lakes[..., None]) + col_lake * lakes[..., None]
del col_land, col_sea, hs, zt, zs, zl


def ne1_inverse(x, y):
    """d3.geoNaturalEarth1 raw inverse (unit scale), vectorised Newton iteration."""
    phi = y.copy()
    for _ in range(25):
        p2 = phi * phi
        p4 = p2 * p2
        f = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - y
        df = 1.007226 + p2 * (0.015085 * 3 + p4 * (-0.044475 * 7 + 0.028874 * 9 * p2 - 0.005916 * 11 * p4))
        phi -= f / df
    p2 = phi * phi
    p4 = p2 * p2
    lam = x / (0.8707 + p2 * (-0.131979 + p2 * (-0.013791 + p4 * p2 * (0.003971 - 0.001529 * p2))))
    return lam, phi


XMAX = np.pi * 0.8707
P2 = (np.pi / 2) ** 2
YMAX = np.pi / 2 * (1.007226 + P2 * (0.015085 + P2 * P2 * (-0.044475 + 0.028874 * P2 - 0.005916 * P2 * P2)))

os.makedirs(OUT, exist_ok=True)
for ow in WIDTHS:
    s = ow / (2 * XMAX)
    oh = int(round(2 * YMAX * s))
    print(f'project {ow}x{oh}')
    px = (np.arange(ow) + .5 - ow / 2) / s
    py = (oh / 2 - (np.arange(oh) + .5)) / s
    X, Y = np.meshgrid(px.astype(np.float64), py.astype(np.float64))
    lam, phi = ne1_inverse(X, Y)
    inside = (np.abs(lam) <= np.pi) & (np.abs(Y) <= YMAX)
    col = (np.degrees(lam) + 180) / 360 * W - .5
    row = (90 - np.degrees(phi)) / 180 * H - .5
    col, row = np.clip(col, 0, W - 1), np.clip(row, 0, H - 1)
    out = np.stack([ndimage.map_coordinates(img[..., k], [row, col], order=1) for k in range(3)], -1)
    lm = ndimage.map_coordinates(m[..., 0], [row, col], order=1) > .5
    # engraved water lines: three thin rings following each coast, fading out to sea
    dist = ndimage.distance_transform_edt(~lm) * (ow / 4096)
    for r, a in ((3.0, .30), (6.5, .20), (11.0, .12)):
        ring = np.clip(1 - np.abs(dist - r) / .7, 0, 1) * (~lm)
        out = out * (1 - ring[..., None] * a) + hexrgb(COAST_LINE) * ring[..., None] * a
    glow = np.exp(-dist / 5.0) * (~lm)
    out = out * (1 - glow[..., None] * .25) + hexrgb(COAST_GLOW) * glow[..., None] * .25
    if POLITICAL:  # painted swell: faint wavy lines across open water
        yy, xx = np.mgrid[0:oh, 0:ow].astype(np.float32) * (4096 / ow)
        wave = np.clip((np.sin(yy * 2 * np.pi / 7 + 1.4 * np.sin(xx / 37) + .8 * np.sin(xx / 11 + yy / 23)) - .86) / .14, 0, 1)
        wave *= (~lm) * np.clip((dist - 14) / 20, 0, 1)
        out = out * (1 - wave[..., None] * .10) + hexrgb('#d5e4e4') * wave[..., None] * .10
    # paper grain
    rng = np.random.default_rng(7)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (oh, ow)).astype(np.float32), .8) * 3.5
    out = out + grain[..., None]
    alpha = (inside * 255).astype(np.uint8)
    im = Image.fromarray(np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha]), 'RGBA')
    path = os.path.join(OUT, f'relief-{"political-" if POLITICAL else ""}{ow}.webp')
    im.save(path, 'WEBP', quality=82, method=6)
    print(path, os.path.getsize(path) // 1024, 'KB', f'scale={s:.6f}', f'height={oh}')
