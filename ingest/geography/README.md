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
python3 views/terrain/export.py LAYER views/terrain/terrain-relief.webp   # -> LAYER/terrain.json + image
python3 views/terrain/build.py LAYER terrain.html        # standalone preview page
```

`views/terrain/terrain.js` has `drawRelief` and `drawTerrain` for any d3 + SVG view; see the comment at its top.
Tiers: 1 always named, 2 from zoom 1.6x, 3 from 2.5x, 4 from 4x, 5 from 6x, 6 from 9x.
