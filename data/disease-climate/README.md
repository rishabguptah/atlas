# Disease and climate (workstream 6)

Pandemics, famines, volcanic winters and climate shifts, plus three epidemics traced city by city:
the Black Death (1338-1353), cholera (1826-1832) and smallpox in the Americas (1518-1528).

| File | What |
| --- | --- |
| `events.jsonl` | 89 events (30 epidemics, 28 famines, 13 eruptions, 14 climate shifts, 3 collapses, 1 riot) and event stubs other records point at. |
| `relations.jsonl` | 41 cause links (`caused` / `contributed_to`, each with a `confidence` and a named `view`) and 89 `spread_to` links. |
| `places.jsonl` | 80 city stubs the epidemics reached (owned by places-people; their fields win on merge). |
| `stubs.jsonl` | Polity and work stubs the cause links point at (Akkadian, Ming, Aztec, Frankenstein...). |
| `routes.jsonl` + `geo/spread_routes.geojson` | One route record per epidemic and 86 line segments, each with `ref`, `from`, `to`, `year`, `month`, `mode`. |

| `bulk_eruptions.jsonl` | 746 Smithsonian GVP confirmed eruptions with VEI 4 or more (10 more are merged into curated records). |
| `bulk_wikidata.jsonl` | 345 Wikidata epidemics, outbreaks and famines with a date and a place (COVID regional items, flu seasons and duplicates of curated records left out). |
| `bulk_famines.jsonl` | 59 World Peace Foundation famines since 1870 with deaths (country-centre locations). |
| `bulk_measures.jsonl` | PAGES 2k global temperature 1-2000 CE (yearly, with 95% range, and 31-year smoothed), plague outbreaks per year (Biraben), world famine deaths per decade, plus `event:second_plague_pandemic` and `place:earth`. |
| `geo/plague_outbreaks.geojson` | 15,136 geocoded plague outbreaks 1347-1900 (Biraben and Sticker), each with `year`, `name`, `src`. |

Curated records come from `ingest/disease-climate/records.py`; bulk records from `ingest/disease-climate/bulk.py`, which reads
the raw downloads in `/mnt/project-files/atlas/raw/disease-climate/` (see SOURCES.txt there) and drops rows that duplicate a
curated record. Edit the scripts, not the JSONL, then run
`python3 ingest/disease-climate/records.py && python3 ingest/disease-climate/bulk.py && python3 tools/build.py`.

## Sources and licences

Curated records cite published books and papers. Bulk datasets:

| Dataset | Licence |
| --- | --- |
| Smithsonian Global Volcanism Program, Volcanoes of the World 5.x | Free to use with citation |
| Wikidata | CC0 |
| World Peace Foundation famines via Our World in Data | CC BY 4.0 |
| PAGES 2k Consortium 2019 temperature (NOAA NCEI) | Public, cite the paper |
| Krauer and Schmid 2022 plague outbreaks (Biraben 1975, Sticker 1908) | **CC BY-NC 4.0**: fine for this private, non-commercial atlas; drop or replace it before any commercial use |
Curated records are `status: "draft"` because a model wrote them from those works; the judge workstream should
check them before they are promoted to `sourced`.

## Schema notes for the kernel

- New event subtype `climate_shift` for long climate periods (Little Ice Age, 4.2 ka drought). Schema v0 has no subtype for these.
- `spread_to` relations carry three extra fields: `month` (1-12, approximate), `via` (place id it most likely came from) and `mode` (`sea`, `river` or `land`). The `via` links are a model's reading of the trade network and are the weakest part of the data.
- Event records with a global footprint (Industrial-era warming) use lat 0, lon 0; views should skip those on maps.

## Gaps and next steps

- Black Death arrival months follow Benedictow (2004) at season-level precision; Christakos et al. (2005) has a finer city table worth ingesting.
- eVolv2k volcanic sulfur series (Toohey and Sigl 2017) needs a free WDCC login to download.
- Some Wikidata and famine records sit at a country's centre (tagged `location: country centroid`).
- More spread maps: cholera 1817-1824, the 1918 flu.
