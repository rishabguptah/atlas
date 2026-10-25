# Geography: the terrain basemap

Physical features (mountain ranges, deserts, plateaus, plains, seas, straits, lakes, rivers, peaks) as kernel
`place:` records, plus a painted relief image every map view can sit on.

| File | What |
| --- | --- |
| `features.py` | Natural Earth vectors -> `data/geography/features.jsonl` and `data/geography/geo/terrain.geojson` |
| `notes.json` | Hand-written "what / why it mattered" notes and tier overrides for ~75 historically key features (status `draft` until the judge checks them) |
| `relief.py` | NOAA ETOPO2 + Natural Earth masks -> the relief image in d3.geoNaturalEarth1 |
| `chokepoints.json` | The 37 straits and passes from the states-war chokepoint map, drawn as markers |

Raw downloads (keep out of git):

```sh
B=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_10m_geography_regions_polys ne_10m_geography_marine_polys ne_10m_geography_regions_elevation_points \
         ne_50m_lakes ne_50m_rivers_lake_centerlines_scale_rank ne_50m_land ne_50m_glaciated_areas \
         ne_50m_antarctic_ice_shelves_polys ne_50m_geography_regions_polys; do curl -sSO $B/$f.geojson; done
curl -sSO https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2/ETOPO2v2-2006/ETOPO2v2c/netCDF/ETOPO2v2c_f4_netCDF.zip && unzip ETOPO2v2c_f4_netCDF.zip
```

Build (needs numpy, scipy, shapely, netCDF4, Pillow):

```sh
python3 ingest/geography/features.py RAW
python3 ingest/geography/relief.py RAW OUT 4096          # -> OUT/relief-4096.webp (copied to views/terrain/terrain-relief.webp)
python3 ingest/geography/relief.py RAW OUT --political 4096   # -> strategy-game texture (views/terrain/terrain-political.webp)
python3 views/terrain/export.py LAYER views/terrain/terrain-relief.webp views/terrain/terrain-political.webp
python3 views/terrain/build.py LAYER terrain.html        # standalone preview page
```

`views/terrain/terrain.js` has `drawRelief`, `drawTerrain` and `drawRealms` (the political, strategy-game look) for any d3 + SVG view; see the comment at its top.
Tiers: 1 always named, 2 from zoom 1.6x, 3 from 2.5x, 4 from 4x, 5 from 6x, 6 from 9x.

## For the pixel-art map and precise borders

| File | What |
| --- | --- |
| `pixel_terrain.py` | ETOPO2 + Natural Earth + Köppen-Geiger climate + NE1 colour -> terrain-class rasters in plain lon/lat: `terrain_l0.png` (2160x1080), `terrain_l1.png` (5400x2700) and 30° tiles `z2_<col>_<row>.png` for the full 10800x5400 grid. R = class id (18 classes, listed in `terrain.json`), G = hillshade, B = elevation/25 m or depth/40 m |
| `precise_borders.py` | Full-resolution historical-basemaps snapshots fitted to Natural Earth 10m coasts, at three zoom levels (`l0` 5 km, `l1` 1.5 km, `l2` 400 m) with a stable `id`/`n` per realm across snapshots (`realms.json`) |

Extra raw downloads: Natural Earth 10m land, lakes and rivers (same URL pattern as above), `NE1_50M_SR_W.zip` from
naciscdn.org, `Koeppen-Geiger-ASCII.zip` from koeppen-geiger.vu-wien.ac.at, and the full-resolution
`world_<year>.geojson` files from `raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/` (GPL-3.0).

```sh
python3 ingest/geography/pixel_terrain.py RAW Koeppen-Geiger-ASCII.txt NE1_50M_SR_W.tif OUT   # add L0 / L1 / L2 to build only some levels
npx mapshaper@0.6.102 -v
python3 ingest/geography/precise_borders.py HB RAW node_modules/.bin/mapshaper OUT [year ...]
```

The views load border levels by zoom: `l0` below 3x, `l1` from 3x, `l2` from 9x.

## Border timeline (a frame for every year a border changed)

`timeline_borders.py` turns Seshat Cliopatria (v0.2.1, CC BY 4.0, `raw/cliopatria/cliopatria.geojson.zip`) into a border
for every year one changed: 508 frames from 3400 BCE to 2024 instead of the 49 historical-basemaps snapshots. Each
Cliopatria row (one polity over a span of years) is clipped to Natural Earth 10m land, grows into the unclaimed coast
within 20 km that no other row of those years claims, and is written once into a time chunk (about 450 rows each),
at the same `l0`/`l1`/`l2` levels. The page keeps the rows with `s <= year <= e`.

```sh
python3 ingest/geography/timeline_borders.py raw/cliopatria/cliopatria.geojson.zip RAW node_modules/.bin/mapshaper OUT
# -> OUT/index.json (frame years, chunks), OUT/l0|l1|l2/c_<year>.json, OUT/realms.json,
#    data/states-war/geo/border-changes.json (rises, ends, gains and losses with who from, for the Border changes lens)
```

The full run takes about 1.5 to 2 hours on 4 cores (`TB_CHANGES_ONLY=1` skips the chunk files; `TB_SPAN=1000,1100` for a test).
Publish OUT beside the Atlas page as `borders-time/`; `views/pixel/borders.js` and the page fall back to `borders/` when it is missing.
Sizes: l0 28 MB, l1 45 MB, l2 86 MB, 38 files each.
