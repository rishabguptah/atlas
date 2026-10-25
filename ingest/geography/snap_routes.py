#!/usr/bin/env python3
"""Snap trade routes to the land: between each pair of the route's own stops, find the cheapest way a caravan or
a ship would actually go, over the pixel map's terrain rasters. Mountains are dear and passes emerge as the cheapest
crossing, rivers are roads, deserts and forests are slow, ships hug the shelf, and every change between land and
sea costs a port call. The stops stay exactly where the curated route put them.

Usage: python3 ingest/geography/snap_routes.py MONEY_JSON [TERRAIN_DIR] [RIVERS_JSON]
  MONEY_JSON   the money layer (default /mnt/project-files/atlas/unified/layers/money.json), its trade[] routes
  TERRAIN_DIR  terrain_l0.png / terrain_l1.png (default /mnt/project-files/atlas/pixel/terrain)
  RIVERS_JSON  rivers.json from ingest/pixel/rivers.py (default /mnt/project-files/atlas/pixel/rivers.json)
Writes data/economy-trade/geo/trade-paths.json: {route name: {"line": [[lon, lat], ...], "sea": [0|1 per point]}}.
views/atlas/build.py swaps each route's line for its snapped one. Needs numpy, scipy, Pillow. About a minute.
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
money = args[0] if args else '/mnt/project-files/atlas/unified/layers/money.json'
tdir = (args[1] if len(args) > 1 else '/mnt/project-files/atlas/pixel/terrain').rstrip('/') + '/'
rivers_f = args[2] if len(args) > 2 else os.path.join(tdir, '..', 'rivers.json')
OUT = os.path.join(ROOT, 'data/economy-trade/geo/trade-paths.json')

# Cost per km by terrain class (terrain.json order). Sea is the cheap road; land several times dearer.
COST = np.array([
    1.25,  # deep ocean: open-water crossings work, but ships prefer the shelf
    1.1,   # sea
    1.0,   # shelf
    1.6,   # lake
    1.5,   # river
    80,    # ice
    7,     # tundra
    6,     # boreal forest
    5,     # temperate forest
    9,     # tropical forest
    3.5,   # grassland
    3.5,   # steppe, savanna
    5.5,   # sand desert
    5,     # rock desert
    9,     # wetland
    6,     # hills
    13,    # mountains
    45,    # high peaks
], dtype=np.float32)
RIVER_COST = 1.6     # a navigable or followable river valley
CLIMB = 0.03         # km-equivalents per metre climbed or descended between neighbouring cells
PORT = 160           # km-equivalents for each change between land and sea (loading, a harbour, a portage)
OVERLAND = 40        # cost per km of open water on an overland leg (a ferry over a strait, never a sea voyage)
WATER = (0, 1, 2)


def load(level):
    a = np.asarray(Image.open(tdir + f'terrain_l{level}.png').convert('RGB'))
    cls, elev = a[..., 0].astype(np.int16), a[..., 2].astype(np.float32)
    water = np.isin(cls, WATER)
    elev = np.where(water, 0, elev * 25)
    return cls, elev, water


def burn_rivers(cls, cell, rivers, max_rank):
    """Rivers rank <= max_rank become river cells (cheap travel), drawn cell by cell along their lines."""
    h, w = cls.shape
    out = np.zeros_like(cls, dtype=bool)
    for r in rivers:
        if r['rank'] > max_rank:
            continue
        pts = r['line']
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) / cell * 2))
            for t in np.linspace(0, 1, n + 1):
                c = int((x0 + (x1 - x0) * t + 180) / cell) % w
                rr = int((90 - (y0 + (y1 - y0) * t)) / cell)
                if 0 <= rr < h:
                    out[rr, c] = True
    return out & ~np.isin(cls, WATER)


def overland(grid, a, b):
    """A leg from an inland stop whose straight line is almost all land (the Incense Route, the Royal Road) stays a
    caravan road; between two ports (Kilwa to Mombasa) the dhow may still win."""
    cls, _, water, _, cell = grid
    h, w = cls.shape
    def port(p, r=0.35):
        y0, y1 = int((90 - p[1] - r) / cell), int((90 - p[1] + r) / cell) + 1
        x0, x1 = int((p[0] - r + 180) / cell), int((p[0] + r + 180) / cell) + 1
        return water[max(0, y0):min(h, y1)][:, np.arange(x0, x1) % w].any()
    if port(a) and port(b):
        return False
    n, wet = 60, 0
    for t in np.linspace(0, 1, n):
        lon = a[0] + (((b[0] - a[0] + 180) % 360) - 180) * t
        lat = a[1] + (b[1] - a[1]) * t
        wet += water[min(h - 1, int((90 - lat) / cell)), int((lon + 180) / cell) % w]
    return wet / n < 0.15


def leg(grid, a, b):
    """Cheapest path from lon/lat a to b on one level's grid, within a box around the pair. Returns [[lon, lat, sea]]."""
    cls, elev, water, river, cell = grid
    H, Wd = cls.shape
    # Work in unwrapped longitude so a leg across the antimeridian (Manila to Acapulco) takes the short way.
    ax, bx = a[0], b[0]
    if bx - ax > 180: bx -= 360
    elif ax - bx > 180: bx += 360
    span = max(abs(bx - ax), abs(b[1] - a[1]))
    m = max(6.0, 0.45 * span)
    x0, x1 = min(ax, bx) - m, max(ax, bx) + m
    y0, y1 = max(-85.0, min(a[1], b[1]) - m), min(85.0, max(a[1], b[1]) + m)
    c0, c1 = int(math.floor((x0 + 180) / cell)), int(math.ceil((x1 + 180) / cell))
    r0, r1 = int(math.floor((90 - y1) / cell)), int(math.ceil((90 - y0) / cell))
    cols = np.arange(c0, c1) % Wd
    rows = np.arange(r0, r1)
    sub = lambda A: A[np.ix_(rows, cols)]
    C, E, Wt, R = sub(cls), sub(elev), sub(water), sub(river)
    h, w = C.shape
    cost = COST[C]
    cost = np.where(R, np.minimum(cost, RIVER_COST), cost)
    if overland(grid, a, b):
        cost = np.where(Wt, OVERLAND, cost)
    lat = 90 - (rows + 0.5) * cell
    kx = (cell * 111.32 * np.cos(np.radians(lat)))[:, None] * np.ones((1, w), np.float32)
    ky = cell * 110.57
    idx = np.arange(h * w).reshape(h, w)
    src, dst, wt = [], [], []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        ys, ye = 0, h - dy
        xs, xe = max(0, -dx), w - max(0, dx)
        A = (slice(ys, ye), slice(xs, xe))
        B = (slice(ys + dy, ye + dy), slice(xs + dx, xe + dx))
        km = np.hypot(kx[A] * dx, ky * dy)
        c = km * (cost[A] + cost[B]) / 2 + np.abs(E[A] - E[B]) * CLIMB + (Wt[A] != Wt[B]) * PORT
        src += [idx[A].ravel(), idx[B].ravel()]
        dst += [idx[B].ravel(), idx[A].ravel()]
        wt += [c.ravel(), c.ravel()]
    g = csr_matrix((np.concatenate(wt), (np.concatenate(src), np.concatenate(dst))), shape=(h * w, h * w))
    at = lambda lon, la: (int((90 - la) / cell) - r0, int((lon + 180) / cell) - c0)
    sa, sb = at(ax, a[1]), at(bx, b[1])
    s, t = idx[sa], idx[sb]
    _, pred = dijkstra(g, indices=s, return_predecessors=True)
    path, n = [], t
    while n != s and n >= 0:
        path.append(n); n = pred[n]
    path.append(s); path.reverse()
    out = []
    for n in path:
        r, c = divmod(int(n), w)
        lon = (c0 + c + 0.5) * cell - 180
        out.append([lon, 90 - (r0 + r + 0.5) * cell, int(Wt[r, c])])
    out[0][:2], out[-1][:2] = [ax, a[1]], [bx, b[1]]
    return out


def simplify(pts, tol):
    """Douglas-Peucker on lon/lat, keeping every point where the path changes between land and sea."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    for i in range(1, len(pts)):
        if pts[i][2] != pts[i - 1][2]:
            keep[i - 1] = keep[i] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        (x0, y0), (x1, y1) = pts[i][:2], pts[j][:2]
        L = math.hypot(x1 - x0, y1 - y0)
        best, bi = -1, -1
        for k in range(i + 1, j):
            # A closed loop (the triangular trade comes home) has no chord: measure from its start instead.
            d = abs((x1 - x0) * (y0 - pts[k][1]) - (x0 - pts[k][0]) * (y1 - y0)) / L if L > 1e-6 else math.hypot(pts[k][0] - x0, pts[k][1] - y0)
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def main():
    trade = json.load(open(money))['trade']
    rivers = json.load(open(rivers_f)) if os.path.exists(rivers_f) else []
    grids = {}
    for lv, cell, rank in ((0, 1 / 6, 5), (1, 1 / 15, 6)):
        cls, elev, water = load(lv)
        grids[lv] = (cls, elev, water, burn_rivers(cls, cell, rivers, rank), cell)
        print('level', lv, cls.shape, file=sys.stderr)
    out = {}
    for t in trade:
        pts = t['line']
        line = []
        for a, b in zip(pts, pts[1:]):
            span = max(abs(((b[0] - a[0] + 180) % 360) - 180), abs(b[1] - a[1]))
            seg = leg(grids[1 if span < 28 else 0], a, b)
            line += seg if not line else seg[1:]
        # Re-wrap longitudes into [-180, 180] once the leg is found.
        for p in line:
            p[0] = ((p[0] + 180) % 360) - 180
        line = simplify(line, 0.06)
        out[t['name']] = {'line': [[round(p[0], 3), round(p[1], 3)] for p in line], 'sea': [p[2] for p in line]}
        print(f"{t['name']}: {len(pts)} stops -> {len(line)} points, {sum(p[2] for p in line)} at sea", file=sys.stderr)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(OUT, os.path.getsize(OUT))


if __name__ == '__main__':
    main()
