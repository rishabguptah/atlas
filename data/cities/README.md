# Cities up close

City scale for the story cities: past about 3 degrees across, the pixel map switches to 45 m terrain around each city
in `cities.json`, and the city layer (`views/pixel/city.js`) draws its walls, gates, towers, harbours, built-up area
and landmark buildings as they stood in the year on the map.

Adding a city is one line in `cities.json` (`id`, `name`, `bbox` [west, south, east, north], `t0`, `t1`), then:

```
pip install duckdb                       # once
python3 ingest/city/fetch.py <id>        # Overture Maps water and walls (OpenStreetMap), Terrarium elevation
python3 ingest/city/tiles.py             # terrain patch -> /mnt/project-files/atlas/pixel/terrain/l3/
python3 ingest/city/plan.py <id>         # dated plan -> data/cities/plans/<id>.json
```

`views/pixel/tiles.py` copies the patches beside the page (`tiles/l3.json`, `tiles/l3_<id>.png`), and
`views/atlas/world/build_index.py` bundles the plans into `atlas-files/world/cities.json`.

## Plans

`plans/<id>.json` is built from three sources, in this order:

1. **Walls and gates** from OpenStreetMap (via Overture Maps), dated through the Wikidata item each carries or names.
   Undated walls are drawn faint.
2. **Landmarks**: Wikidata items with coordinates in the box and a start date (inception, opening or start time), an
   end date when demolished or dissolved, and a kind from their classes. At most 400 per city, best known first.
3. **Drafts** in `plans/drafts/<id>.json`, written by Claude for what the two sources miss. Every draft feature names
   its source in `src`, carries `conf` 1 (estimated) or worse, and is marked `status: draft` until the judge checks it.

A feature is one of:

| k | geometry | meaning |
|---|---|---|
| `wall` | `line` | a city wall (a lost one in a draft: the Wall of Constantine, the Round City of Baghdad) |
| `gate`, `tower`, `fort`, `palace`, `church`, `mosque`, `temple`, `forum`, `market`, `harbour`, `column`, `aqueduct`, `bridge`, `tomb`, `school`, `house` | `at` | a building or place |
| `extent` | `area` | the built-up area for a period (one polygon per period, periods not overlapping) |
| `district` | `area` | a named quarter for a period |
| `road` | `line` | a main street (the Mese, the Via Sacra, Chandni Chowk) |
| `canal`, `chain` | `line` | water lines: a canal, the chain across the Golden Horn |
| `water` | `area` | water that is land today (a filled harbour, Lake Texcoco, Edo's shore before reclamation), with `t1` when it went |

Every feature has `name`, `t0`, `t1` (years, 480 BCE = -480, null = open), `conf` (0 attested, 1 estimated,
2 approximate, 3 unknown) and, from Wikidata, `wd` and `sl` (sitelinks). Coordinates are `[lon, lat]`.

Drafts may also patch built features:

- `{"k": "wall_dates", "match": "<wall name as in the plan>", "t0": 413, "t1": null, "label": "Theodosian Walls", "conf": 1, "src": "..."}`
  dates every undated wall line with that name (an optional `box` [west, south, east, north] limits it to lines inside, for unnamed fragments).
- `{"k": "rename", "wd": "Q...", "names": [[null, 1453, "Church of the Holy Apostles"], [1453, null, "..."]], "kinds": [[null, 1453, "church"], [1453, null, "mosque"]], "src": "..."}`
  gives a landmark its names and kinds by period (with `fix_dates: true`, also its `t0`/`t1`).

Sources: OpenStreetMap contributors (ODbL), via Overture Maps; Wikidata (CC0); Mapzen Terrarium elevation; Claude
drafts (unchecked).
