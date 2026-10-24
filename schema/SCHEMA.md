# Atlas kernel schema v0

Every workstream writes records in this shape. The build reads them all, checks them, merges them
and compiles one bundle that the guide and every view load. When in doubt, add a field rather than
bending an existing one, and say so in your PR.

## Files

- Records are **JSON Lines**: one JSON object per line, in `data/<workstream>/*.jsonl`.
  Only touch your own workstream's folder.
- Ingest scripts go in `ingest/<workstream>/`. Raw downloads stay out of git (put them in `raw/`, which is ignored).
- Geometry too big for a record (border polygons, route lines) goes in `data/<workstream>/geo/*.geojson`.
  Each feature carries `properties.ref` = the id of the record it belongs to, and `properties.year`
  when it is a time snapshot.
- Run `python3 tools/build.py` before you push. It fails on any error, and CI runs the same check.

Workstream folders: `kernel`, `living-atlas`, `places-people`, `states-war`, `economy-trade`,
`religion-ideas`, `disease-climate`, `guide`, `order-chaos`, `judge`, `geography`.

## Common fields (every record)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | `<prefix>:<slug>`, slug is lowercase `a-z0-9_`, more `:` segments allowed. Example: `place:damascus`. Never reuse or rename one; others link to it. |
| `kind` | string | One of the kinds below. Must match the id prefix (`rel:` for relation, `m:` for measure). |
| `name` | string | Display name in English. Not needed on relations and measures. |
| `lenses` | string[] | One or more of the lenses below. Says which lens switches this record on. |
| `sources` | object[] | At least one `{ "cite": "...", "url": "..." }` (url optional, cite required). |
| `status` | string | `sourced` (from a dataset or a cited work) or `draft` (model-written, waiting for the judge). |
| `stub` | bool | Optional. `true` = a placeholder for a record another workstream owns (see Ownership). |
| `wikidata` | string | Optional `Q...` id. Strongly preferred for places, polities, people, events, ideas, works. |
| `ext` | object | Optional ids in other datasets, e.g. `{ "pleiades": "658381", "seshat": "it_roman_principate" }`. |
| `what` | string | Optional. One sentence: what it is. |
| `why` | string | Optional. One sentence: why it matters. |
| `tags` | string[] | Optional free tags. |
| `alt_names` | string[] | Optional other names. |
| `links` | string[] | Optional ids of related records, shown as "see also". |
| `legacy` | object | Optional bookkeeping from older data. Views may ignore it. |

### Time

Years are integers. Negative is BCE, and there is no year 0 (-1 is 1 BCE).

| Field | Rule |
| --- | --- |
| `start`, `end` | Year it began and ended. `end: null` means it still exists. Omit when unknown. |
| `start_approx`, `end_approx` | `true` when the year is a rough estimate. |
| `start_range`, `end_range` | Optional `[low, high]` when historians give a range. |

### Place on the map

| Field | Rule |
| --- | --- |
| `lat`, `lon` | Decimal degrees (WGS84) for anything with a point. |
| `place` | For events, works and so on: the id of a `place:` record, instead of or as well as lat/lon. |
| `geo` | Optional path to a GeoJSON file under your data folder, for areas and lines. |

## Kinds

| Kind | Id prefix | Owner | Extra fields |
| --- | --- | --- | --- |
| `place` | `place:` | places-people (physical features: geography) | `subtype`: city, site, wonder, chokepoint, river, pass, region; physical features also use mountain_range, desert, plateau, plain, basin, valley, lowland, delta, ocean, sea, gulf, bay, strait, channel, lake, peak (ids `place:<type>:<slug>`, e.g. `place:mtn:zagros_mountains`). `tier`: 1-6, the zoom level a map should name it at. `label_line`: `[[lon, lat], ...]` to letter the name along. `today`: modern country. `causes`: why it died, from the cause list. |
| `polity` | `polity:` | states-war | `subtype`: empire, kingdom, city_state, republic, confederation, caliphate, nation_state. `capital`: place id, or use `capital_of` relations when it moved. `peak`: `[year, area_million_km2]`. |
| `person` | `person:` | places-people | `born`, `died`: `{ "year", "place" }`. `roles`: e.g. ruler, philosopher, general, merchant, poet. |
| `group` | `group:` | economy-trade | A people or population, e.g. Bantu speakers, Mongols, Vikings. |
| `event` | `event:` | whoever needs it first | `subtype`: battle, siege, sack, war, revolt, earthquake, eruption, famine, epidemic, founding, treaty, collapse, migration. `deaths`: `[low, high]`. `destructive`: true for sacks, disasters and the like. |
| `idea` | `idea:` | religion-ideas | `subtype`: religion, school, theory, technology, institution, movement. |
| `work` | `work:` | religion-ideas | `subtype`: book, poem, scripture, artwork, map, building. `author`: person id. |
| `route` | `route:` | economy-trade | `subtype`: trade, migration, campaign, pilgrimage, epidemic_spread. `stops`: place ids in order, or `geo`. `goods`: string[]. |
| `relation` | `rel:` | anyone | See below. |
| `measure` | `m:` | anyone | See below. |

### Ownership

Each kind has one owning workstream. When you need a record that doesn't exist yet (say a city for a
battle), add it to your own file with `"stub": true` and the fields you know. The build merges stubs
into the owner's record when one exists, and the owner's fields win. Run the build on
the latest main and check `dist/ids.txt` first; it lists every id that already exists.

The current Living Atlas data lives in `data/living-atlas/` as stubs, so any owner can take over
`place:rome` or `polity:assyria` by writing a full record with the same id.

### Relations

```json
{"id":"rel:umayyad_capital_damascus","kind":"relation","type":"capital_of","from":"place:damascus","to":"polity:umayyad","start":661,"end":750,"lenses":["geography"],"sources":[{"cite":"Kennedy, The Prophet and the Age of the Caliphates"}],"status":"sourced"}
```

| Field | Rule |
| --- | --- |
| `type` | One of: `controls`, `capital_of`, `part_of`, `located_in`, `born_in`, `died_in`, `ruled`, `participant_in`, `fought`, `allied_with`, `trades_with`, `founded`, `destroyed`, `succeeded`, `influenced`, `teacher_of`, `translated`, `wrote`, `spread_to`, `migrated_to`, `caused`, `contributed_to`, `prevented`. Ask the kernel thread to add one. |
| `from`, `to` | Ids. Read as "from TYPE to": `place:damascus capital_of polity:umayyad`, `event:x caused event:y`. |
| `start`, `end` | Optional time window. |
| `weight` | Optional number: strength, volume, or troop count, depending on type. |
| `confidence` | Optional 0 to 1. **Required for `caused`, `contributed_to` and `prevented`.** |
| `view` | Optional. Whose explanation this is (a historian, school or theory), for contested causes. Competing explanations are separate relations with different `view`s. |
| `note` | Optional short text. |

### Measures

```json
{"id":"m:population:rome:chandler","kind":"measure","of":"place:rome","metric":"population","unit":"people","points":[[1,800000],[100,1000000,800000,1200000]],"lenses":["population"],"sources":[{"cite":"Chandler 1987"}],"status":"sourced"}
```

`points` are `[year, value]` or `[year, value, low, high]`, in year order. Metrics so far: `population`,
`gdp`, `gdp_per_capita`, `area`, `urban_share`, `deaths`, `stability`, `temperature_anomaly`. Units are
free text but must be consistent per metric (`people`, `2011 int$`, `million_km2`, `share`, `°C`).
One measure record per (thing, metric, source), with id `m:<metric>:<thing slug>:<source slug>`, e.g. `m:population:rome:chandler`. Several sources for the same metric are fine; views pick one or show the spread.

## Lenses

`geography` (land, rivers, chokepoints, climate) · `military` · `economy` (wealth, trade) ·
`population` (size, migration) · `disease` · `religion` · `ideas` (philosophy, science, technology) ·
`literature` · `people` · `order` (stability, crisis, collapse).

## Causes (for dead places, and anything that ended)

`war`, `fire`, `earthquake`, `river`, `sea`, `climate`, `trade`, `capital`, `quarried`, `volcano`,
`silt`, `faith`, `disease`, `unknown`.

## Changes

v0.1 · 2026-10-24 · `geography` workstream: physical-feature subtypes, `tier`, `label_line`, `elevation_m` on places.

v0 · 2026-10-24 · first version. Breaking changes will bump the version and come with a migration script.
