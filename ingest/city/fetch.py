# Download what city-scale terrain and city plans need, for every city in data/cities/cities.json:
#   raw/city/ov_water_<id>.json  water in the city box plus margin: sea, lakes, rivers and canals (areas and lines)
#   raw/city/ov_walls_<id>.json  city walls, gates, forts and towers in the city box
#   raw/city/dem/12_<x>_<y>.png  Terrarium elevation tiles (Mapzen / AWS open data) at zoom 12, about 30 m a pixel
# Water and walls come from Overture Maps (base theme, built from OpenStreetMap: (c) OpenStreetMap contributors, ODbL),
# read straight from its GeoParquet release on S3 with DuckDB and clipped to the box: seconds a city. (The public
# Overpass servers are unreachable or overloaded from the cloud environment.) Needs `pip install duckdb`.
# Skips what is already downloaded. Usage: python3 ingest/city/fetch.py [city_id ...]
import json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
RAW = os.environ.get('ATLAS_RAW', '/mnt/project-files/atlas/raw') + '/city'
OVERTURE = os.environ.get('OVERTURE', 's3://overturemaps-us-west-2/release/2026-10-21.0')
DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
MARGIN = 0.04  # degrees of terrain kept around a city box (tiles.py MARGIN)
UA = {'User-Agent': 'history-atlas/0.1 (city terrain ingest; https://github.com/rishabguptah/atlas)'}


def cities(ids=None):
    C = json.load(open(os.path.join(REPO, 'data', 'cities', 'cities.json')))['cities']
    return [c for c in C if not ids or c['id'] in ids]


def padded(city):
    w, s, e, n = city['bbox']
    return [w - MARGIN, s - MARGIN, e + MARGIN, n + MARGIN]


_con = None


def con():
    global _con
    if _con is None:
        import duckdb
        _con = duckdb.connect()
        for x in ('httpfs', 'spatial'):
            _con.execute(f'INSTALL {x}; LOAD {x};')
        _con.execute("SET s3_region='us-west-2'"); _con.execute('SET enable_progress_bar=false')
    return _con


def overture(typ, box, where):
    """Rows of one Overture base type in a box, geometry clipped to it, as dicts with GeoJSON geometry."""
    w, s, e, n = box
    q = f"""SELECT id, subtype, class, names."primary" AS name, wikidata, source_tags,
      ST_AsGeoJSON(ST_Intersection(geometry, ST_MakeEnvelope({w}, {s}, {e}, {n}))) AS g
    FROM read_parquet('{OVERTURE}/theme=base/type={typ}/*', hive_partitioning=1)
    WHERE bbox.xmin < {e} AND bbox.xmax > {w} AND bbox.ymin < {n} AND bbox.ymax > {s} AND ({where})"""
    for i in range(3):
        try:
            rows = con().execute(q).fetchall()
            break
        except Exception as err:  # noqa: BLE001 (S3 hiccups)
            print('  overture retry', typ, i, str(err)[:160], file=sys.stderr); time.sleep(5 * (i + 1))
    else:
        raise SystemExit('overture failed: ' + typ)
    out = []
    for (i, sub, cl, name, wd, tags, g) in rows:
        if not g:
            continue
        geom = json.loads(g)
        if geom.get('type') == 'GeometryCollection' and not geom.get('geometries'):
            continue
        out.append({'id': i, 'subtype': sub, 'class': cl, 'name': name, 'wikidata': wd, 'tags': dict(tags or {}), 'geometry': geom})
    return out


WATER_WHERE = "subtype IN ('ocean', 'lake', 'river', 'canal', 'water', 'reservoir', 'pond', 'physical')"
WALL_WHERE = ("class IN ('city_wall', 'city_gate', 'fortification') OR source_tags['historic'] IN ('citywalls', 'city_gate', 'fortification', 'castle', 'fort', 'tower')"
              " OR source_tags['barrier'] = 'city_wall'")


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def dem_tiles(w, s, e, n, z=12):
    x0, y0 = lonlat_to_tile(w, n, z); x1, y1 = lonlat_to_tile(e, s, z)
    return [(z, x, y) for x in range(int(x0), int(x1) + 1) for y in range(int(y0), int(y1) + 1)]


def get_dem(t):
    z, x, y = t
    out = f'{RAW}/dem/{z}_{x}_{y}.png'
    if os.path.exists(out):
        return
    for i in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(DEM.format(z=z, x=x, y=y), headers=UA), timeout=60).read()
            open(out, 'wb').write(data)
            return
        except Exception as e:  # noqa: BLE001
            print('  dem retry', t, e, file=sys.stderr); time.sleep(3 * (i + 1))


def one(city):
    for kind, typ, box, where in (('water', 'water', padded(city), WATER_WHERE), ('walls', 'infrastructure', city['bbox'], WALL_WHERE)):
        out = f'{RAW}/ov_{kind}_{city["id"]}.json'
        if not os.path.exists(out):
            rows = overture(typ, box, where)
            json.dump({'source': f'Overture Maps base/{typ} {OVERTURE.rsplit("/", 1)[-1]} (OpenStreetMap, ODbL)', 'features': rows}, open(out, 'w'))
            print(f'  {kind} {city["id"]}: {len(rows)} features', file=sys.stderr)
    dem = dem_tiles(*padded(city))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(get_dem, dem))
    print(f'  dem {city["id"]}: {len(dem)} tiles', file=sys.stderr)


def main():
    os.makedirs(RAW + '/dem', exist_ok=True)
    for city in cities(sys.argv[1:]):
        one(city)


if __name__ == '__main__':
    main()
