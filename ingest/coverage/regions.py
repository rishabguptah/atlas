#!/usr/bin/env python3
"""Rasterise Natural Earth countries into the coverage regions (0.5 degree grid).

Usage: python3 ingest/coverage/regions.py RAW_DIR
  RAW_DIR holds ne_50m_admin_0_countries.geojson (raw.githubusercontent.com/nvkelso/natural-earth-vector).
Writes data/coverage/geo/regions.json: {"cell": 0.5, "codes": [...], "rows": [run-length rows, north to south]}.
Needs shapely (pip install shapely); everything downstream is standard library.
Sea cells within 1.5 degrees of land take the nearest land region, so coastal and island points classify.
"""
import json, os, sys
from shapely.geometry import shape, box
from shapely.prepared import prep
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CELL = 0.5
# Historical regions, not UN ones: the Caucasus and Anatolia go with West Asia, Afghanistan and Mongolia
# with the steppe (Central Asia), Asian Russia splits at the Urals.
CODES = ['europe', 'west_asia', 'north_africa', 'west_africa', 'east_africa', 'central_south_africa',
         'south_asia', 'central_asia', 'east_asia', 'southeast_asia', 'north_america', 'mesoamerica',
         'south_america', 'oceania']
NAMES = {'europe': 'Europe', 'west_asia': 'West Asia', 'north_africa': 'North Africa', 'west_africa': 'West Africa',
         'east_africa': 'East Africa & Horn', 'central_south_africa': 'Central & Southern Africa',
         'south_asia': 'South Asia', 'central_asia': 'Central Asia & steppe', 'east_asia': 'East Asia',
         'southeast_asia': 'Southeast Asia', 'north_america': 'North America',
         'mesoamerica': 'Mesoamerica & Caribbean', 'south_america': 'South America', 'oceania': 'Oceania'}
BY_ISO = {
    'west_asia': 'TUR CYP SYR LBN ISR PSX PSE JOR IRQ IRN SAU YEM OMN ARE QAT BHR KWT GEO ARM AZE',
    'central_asia': 'KAZ UZB TKM KGZ TJK AFG MNG',
    'south_asia': 'IND PAK BGD LKA NPL BTN MDV',
    'east_asia': 'CHN TWN JPN KOR PRK HKG MAC',
    'north_africa': 'EGY LBY TUN DZA MAR SAH ESH SDN',
    'west_africa': 'MRT MLI NER SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NGA CPV TCD',
    'east_africa': 'ETH ERI DJI SOM SOL SSD KEN UGA TZA RWA BDI SYC COM MDG MUS',
    'mesoamerica': 'MEX GTM BLZ SLV HND NIC CRI PAN',
    'north_america': 'USA CAN GRL SPM BMU',
}
ISO = {i: r for r, s in BY_ISO.items() for i in s.split()}


def region_of(p, geom_centroid):
    iso = p.get('ADM0_A3') or p.get('ISO_A3')
    if iso == 'RUS':
        return None  # split by longitude below
    if iso in ISO:
        return ISO[iso]
    reg, sub = p['REGION_UN'], p['SUBREGION']
    if reg == 'Europe':
        return 'europe'
    if reg == 'Oceania' or sub == 'Australia and New Zealand':
        return 'oceania'
    if reg == 'Antarctica':
        return None
    if reg == 'Africa':
        return {'Northern Africa': 'north_africa', 'Western Africa': 'west_africa', 'Eastern Africa': 'east_africa'}.get(sub, 'central_south_africa')
    if reg == 'Americas':
        return {'Caribbean': 'mesoamerica', 'Central America': 'mesoamerica', 'South America': 'south_america'}.get(sub, 'north_america')
    if reg == 'Asia':
        return {'South-Eastern Asia': 'southeast_asia', 'Southern Asia': 'south_asia', 'Eastern Asia': 'east_asia',
                'Central Asia': 'central_asia'}.get(sub, 'west_asia')
    return None


def main(raw):
    feats = json.load(open(os.path.join(raw, 'ne_50m_admin_0_countries.geojson')))['features']
    geoms, regs = [], []
    for f in feats:
        g = shape(f['geometry'])
        r = region_of(f['properties'], g.centroid)
        if f['properties'].get('ADM0_A3') == 'RUS':
            geoms += [g.intersection(box(-180, -90, 60, 90)), g.intersection(box(60, -90, 180, 90))]
            regs += ['europe', 'central_asia']
            continue
        if r:
            geoms.append(g); regs.append(r)
    tree = STRtree(geoms)
    pg = [prep(g) for g in geoms]
    W, H = int(360 / CELL), int(180 / CELL)
    grid = [[-1] * W for _ in range(H)]
    for y in range(H):
        lat0 = 90 - (y + 1) * CELL
        for x in range(W):
            lon0 = -180 + x * CELL
            c = box(lon0, lat0, lon0 + CELL, lat0 + CELL)
            best, area = -1, 0
            for i in tree.query(c):
                if pg[i].intersects(c):
                    a = geoms[i].intersection(c).area
                    if a > area:
                        best, area = i, a
            if best >= 0:
                grid[y][x] = CODES.index(regs[best])
    # coastal fill: up to 3 cells from land
    for _ in range(3):
        new = [row[:] for row in grid]
        for y in range(H):
            for x in range(W):
                if grid[y][x] < 0:
                    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        yy, xx = y + dy, (x + dx) % W
                        if 0 <= yy < H and grid[yy][xx] >= 0:
                            new[y][x] = grid[yy][xx]; break
        grid = new
    rows = []
    for row in grid:
        runs, prev, n = [], row[0], 0
        for v in row:
            if v == prev:
                n += 1
            else:
                runs += [prev, n]; prev, n = v, 1
        runs += [prev, n]
        rows.append(runs)
    out = os.path.join(ROOT, 'data/coverage/geo/regions.json')
    json.dump({'cell': CELL, 'codes': CODES, 'names': NAMES, 'rows': rows,
               'source': 'Natural Earth 1:50m admin-0 (public domain), regrouped into historical regions'},
              open(out, 'w'), separators=(',', ':'))
    print(out, os.path.getsize(out))


if __name__ == '__main__':
    main(sys.argv[1])
