# City-scale terrain: L3 patches for the pixel map (views/pixel/SPEC.md format at 1/2400 degree, about 45 m), one
# image per city in data/cities/cities.json covering its box plus a margin (one file per city keeps the publish small).
#   R  terrain class: water from OpenStreetMap via Overture Maps (sea, lakes, river and canal areas and lines),
#      land classes from the L2 tile under it (where L2 called a coastal cell sea, the nearest L2 land class)
#   G  hillshade from Terrarium elevation (sun 315, altitude 45, 128 = flat or sea)
#   B  land elevation m / 25, sea depth m / 40 (L2 depth, at least 1)
# Inputs from ingest/city/fetch.py (raw/city/ov_water_<id>.json, raw/city/dem/) and the L2 terrain tiles. Writes OUT/l3_<city>.png and OUT/l3.json
# (each patch's box, so the page only asks for a patch where one exists).
# Usage: python3 ingest/city/tiles.py [OUT_DIR]   (default /mnt/project-files/atlas/pixel/terrain/l3)
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch as F  # noqa: E402

TERRAIN = '/mnt/project-files/atlas/pixel/terrain'
CELL = 1 / 2400          # degrees per pixel
MARGIN = F.MARGIN        # degrees of terrain kept around a city's box
NX = NY = 1200           # the patch being built (set by build)
SEA, SHELF, LAKE, RIVER = 1, 2, 3, 4
WATER = {0, 1, 2, 3, 4}

_l2 = {}


def l2(c, r):
    if (c, r) not in _l2:
        p = f'{TERRAIN}/z2_{c}_{r}.png'
        _l2[(c, r)] = np.array(Image.open(p).convert('RGB')) if os.path.exists(p) else None
    return _l2[(c, r)]


def l2_block(w, s, e, n, pad=6):
    """The L2 cells (2 arc-min) under a box, with a margin, as (R, B) arrays and the block's origin."""
    cell = 1 / 30
    c0, c1 = math.floor((w + 180) / cell) - pad, math.floor((e + 180) / cell) + pad
    r0, r1 = math.floor((90 - n) / cell) - pad, math.floor((90 - s) / cell) + pad
    R = np.zeros((r1 - r0 + 1, c1 - c0 + 1), np.uint8); B = np.zeros_like(R)
    for rr in range(r0, r1 + 1):
        for cc in range(c0, c1 + 1):
            t = l2(cc // 900, rr // 900)
            if t is not None:
                px = t[rr % 900, cc % 900]
                R[rr - r0, cc - c0], B[rr - r0, cc - c0] = px[0], px[2]
    return R, B, (-180 + c0 * cell, 90 - r0 * cell, cell)


def nearest_land(R):
    """Each L2 cell's class, with water cells given the class of the nearest land cell (for land that OSM adds)."""
    out = R.copy(); land = ~np.isin(R, list(WATER))
    if not land.any():
        out[:] = 10; return out
    for _ in range(40):
        if land.all():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1); shl = np.roll(np.roll(land, dy, 0), dx, 1)
            take = ~land & shl
            out[take] = sh[take]; land = land | take
    out[~land] = 10
    return out


def px(lon, lat, x0, y0):
    return ((lon - x0) / CELL, (y0 - lat) / CELL)


def polys(geom):
    """GeoJSON (Multi)Polygon or GeometryCollection -> [(outer ring, [holes])]."""
    t = geom.get('type')
    if t == 'Polygon':
        return [(geom['coordinates'][0], geom['coordinates'][1:])] if geom['coordinates'] else []
    if t == 'MultiPolygon':
        return [(c[0], c[1:]) for c in geom['coordinates'] if c]
    if t == 'GeometryCollection':
        return [p for g in geom['geometries'] for p in polys(g)]
    return []


def lines(geom):
    t = geom.get('type')
    if t == 'LineString':
        return [geom['coordinates']]
    if t == 'MultiLineString':
        return geom['coordinates']
    if t == 'GeometryCollection':
        return [l for g in geom['geometries'] for l in lines(g)]
    return []


def fill(d, geom, v, x0, y0, min_px=0):
    for outer, holes in polys(geom):
        P = [px(c[0], c[1], x0, y0) for c in outer]
        if len(P) < 3 or (min_px and abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(P, P[1:] + P[:1]))) / 2 < min_px):
            continue
        d.polygon(P, fill=v)
        for hole in holes:
            H = [px(c[0], c[1], x0, y0) for c in hole]
            if len(H) >= 3:
                d.polygon(H, fill=9)


# Overture water (OpenStreetMap natural=water and friends). Natural water only: reservoirs, basins, pools, ponds,
# drains and ditches are mostly modern, and a city plan for 1453 should not show them.
MODERN = {'reservoir', 'basin', 'pond', 'swimming_pool', 'wastewater', 'fountain', 'reflecting_pool', 'fishpond', 'water_storage', 'drain', 'ditch', 'lock', 'stream'}
RIVERISH = {'river', 'canal'}


def dem_grid(w, s, e, n, z=12):
    """Elevation in metres on the L3 grid, from Terrarium tiles (Web Mercator), nearest sample."""
    lon = w + (np.arange(NX) + 0.5) * CELL
    lat = n - (np.arange(NY) + 0.5) * CELL
    X, Y = F.lonlat_to_tile(lon, 0, z)[0], np.array([F.lonlat_to_tile(0, la, z)[1] for la in lat])
    E = np.zeros((NY, NX), np.float32)
    tiles = {}
    tx, ty = np.floor(X).astype(int), np.floor(Y).astype(int)
    for yy in np.unique(ty):
        for xx in np.unique(tx):
            p = f'{F.RAW}/dem/{z}_{xx}_{yy}.png'
            if not os.path.exists(p):
                continue
            t = np.array(Image.open(p).convert('RGB')).astype(np.float32)
            tiles[(xx, yy)] = t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    for (xx, yy), T in tiles.items():
        rows = np.where(ty == yy)[0]; cols = np.where(tx == xx)[0]
        if not len(rows) or not len(cols):
            continue
        pi = np.clip(((Y[rows] - yy) * 256).astype(int), 0, 255); pj = np.clip(((X[cols] - xx) * 256).astype(int), 0, 255)
        E[np.ix_(rows, cols)] = T[np.ix_(pi, pj)]
    return E, len(tiles)


def hillshade(E, lat):
    """Lambert shading of the surface normal against a sun at azimuth 315, altitude 45; flat ground = 128."""
    dy = CELL * 110540.0; dx = CELL * 111320.0 * math.cos(math.radians(lat))
    g_row, g_col = np.gradient(E.astype(np.float64), dy, dx)  # rows run south, columns east
    ex, ny = g_col, -g_row
    norm = np.sqrt(ex * ex + ny * ny + 1)
    alt, az = math.radians(45), math.radians(315)
    sx, sy, sz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    sh = (-ex * sx - ny * sy + sz) / norm
    return np.clip(128 + (sh - sz) * 190, 0, 255)


def snap(v):
    return round(v / CELL) * CELL


def build(city, out):
    global NX, NY
    bw, bs, be, bn = city['bbox']
    w, s, e, n = snap(bw - MARGIN), snap(bs - MARGIN), snap(be + MARGIN), snap(bn + MARGIN)
    NX, NY = round((e - w) / CELL), round((n - s) / CELL)
    feats = json.load(open(f'{F.RAW}/ov_water_{city["id"]}.json'))['features']
    R2, B2, (bx0, by0, bcell) = l2_block(w, s, e, n)
    R2land = nearest_land(R2)
    ii = ((w + (np.arange(NX) + 0.5) * CELL - bx0) / bcell).astype(int)
    jj = ((by0 - (n - (np.arange(NY) + 0.5) * CELL)) / bcell).astype(int)
    Rl2, Bl2, Rland = R2[np.ix_(jj, ii)], B2[np.ix_(jj, ii)], R2land[np.ix_(jj, ii)]
    # Sea: Overture's ocean polygons (OpenStreetMap coastline, processed); with none in the box the city is inland.
    simg = Image.new('L', (NX, NY), 0); sd = ImageDraw.Draw(simg)
    ocean = [f for f in feats if f['subtype'] == 'ocean']
    for f in ocean:
        fill(sd, f['geometry'], 1, w, n)
    sea = np.array(simg) == 1
    cls = np.where(sea, np.where(np.isin(Rl2, [0, 1]), Rl2, SHELF), np.where(np.isin(Rl2, [LAKE, RIVER]), 10, Rland)).astype(np.uint8)
    cls[~sea & np.isin(cls, [0, 1, 2, 3, 4])] = 10
    # Inland water: areas (over 25 pixels, 0.05 square km), then river and canal lines.
    wimg = Image.new('L', (NX, NY), 0); d = ImageDraw.Draw(wimg)
    for f in feats:
        if f['subtype'] in ('ocean', 'physical', 'reservoir', 'pond') or f['class'] in MODERN:
            continue
        fill(d, f['geometry'], RIVER if f['subtype'] in RIVERISH else LAKE, w, n, min_px=25)
    for f in feats:
        if f['subtype'] in RIVERISH and f['class'] in RIVERISH:
            for L in lines(f['geometry']):
                pts = [px(c[0], c[1], w, n) for c in L]
                if len(pts) > 1:
                    d.line(pts, fill=RIVER, width=3 if f['class'] == 'river' else 2)
    W = np.array(wimg)
    inland = np.isin(W, [LAKE, RIVER]) & ~sea
    cls[inland] = W[inland]
    E, nd = dem_grid(w, s, e, n)
    G = np.where(np.isin(cls, list(WATER)), 128, hillshade(E, (s + n) / 2)).astype(np.uint8)
    B = np.where(sea, np.maximum(Bl2, 1), np.clip(np.maximum(E, 0) / 25, 0, 255)).astype(np.uint8)
    f = f'l3_{city["id"]}.png'
    Image.fromarray(np.dstack([cls, G, B]).astype(np.uint8), 'RGB').save(f'{out}/{f}', optimize=True)
    print(f'  {f}: {NX}x{NY}, sea {int(sea.sum())} ({len(ocean)} ocean parts), inland water {int(inland.sum())}, {nd} elevation tiles', file=sys.stderr)
    return {'id': city['id'], 'f': f, 'box': [round(w, 6), round(s, 6), round(e, 6), round(n, 6)], 'w': NX, 'h': NY}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else TERRAIN + '/l3'
    ids = sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    idx = f'{out}/l3.json'
    have = {p['id']: p for p in json.load(open(idx))['patches']} if os.path.exists(idx) else {}
    for city in F.cities(ids or None):
        if not os.path.exists(f'{F.RAW}/ov_water_{city["id"]}.json'):
            print(f'  {city["id"]}: water not downloaded yet (ingest/city/fetch.py), skipped', file=sys.stderr); continue
        have[city['id']] = build(city, out)
    json.dump({'cell': CELL, 'patches': sorted(have.values(), key=lambda p: p['id']),
               'source': 'OpenStreetMap contributors (ODbL) water and coastline; Mapzen Terrarium elevation; L2 terrain classes'}, open(idx, 'w'))
    print(f'{len(have)} L3 patches -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
