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
`religion-ideas`, `disease-climate`, `guide`, `order-chaos`, `judge`, `geography`, `art-architecture`, `law`, `europe-19c`, `peoples-languages`, `scholarship`, `travels`.

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
| `conf` | string | Optional confidence class: `attested` (a source says so: drawn solid) · `estimated` (inferred from evidence: hatched) · `approximate` (place, path or date roughly known, or disputed: dashed) · `unknown` (fog). Views never invent their own scale. |

A `sources` entry is `{cite, url?}` and may also carry `src` (the id of a `source` record, the full citation),
`pages` (`"112-15"`) and `quote` (a few words the claim rests on). Prefer `src` for anything scholarly: the citation
is then checked once, against Crossref or OpenLibrary, and every record that cites it shares the result.

### Time

Years are integers. Negative is BCE, and there is no year 0 (-1 is 1 BCE).

| Field | Rule |
| --- | --- |
| `start`, `end` | Year it began and ended. `end: null` means it still exists. Omit when unknown. |
| `start_approx`, `end_approx` | `true` when the year is a rough estimate. |
| `start_range`, `end_range` | Optional `[low, high]` when historians give a range. |
| `date`, `end_date` | Optional ISO date, `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, as precise as the source; the year must equal `start` / `end`. |

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
| `idea` | `idea:` | religion-ideas | `subtype`: religion, school, theory, technology, institution, movement, style (art and architecture: `idea:style:<slug>`, with `family`, `origin`, `spread`). |
| `work` | `work:` | religion-ideas | `subtype`: book, poem, scripture, artwork, map, building. `author`: person id. `styles`: `idea:style:` ids (art). `styled_from`: year a building founded earlier was rebuilt in its style. `made_at`: where an artwork was made, when lat/lon is that place rather than today's museum. |
| `route` | `route:` | economy-trade | `subtype`: trade, migration, campaign, pilgrimage, epidemic_spread. `stops`: place ids in order, or `geo`. `goods`: string[]. |
| `language` | `lang:` | peoples-languages | Id is `lang:<glottocode>`. `subtype`: family, branch, language. `family`, `branch`: lang ids. `endangerment`: Glottolog AES (not endangered … extinct). `attested`: `[first, last]` years of documentation as Glottolog gives them. `isolate` / `unclassified`: true. |
| `script` | `script:` | peoples-languages | A writing system. `subtype`: abjad, alphabet, abugida, syllabary, logographic, undeciphered... `origin`: place name. `ext.iso15924`. Parent script via a `derived_from` relation. |
| `sample` | `dna:` | peoples-languages | One ancient genome (AADR). `start` = median date, `start_range`, `group` (AADR group label), `site`, `country`, `sex`, `y_haplogroup`, `mt_haplogroup`. |
| `relation` | `rel:` | anyone | See below. |
| `measure` | `m:` | anyone | See below. |
| `source` | `src:` | scholarship | A real work: see Scholarship below. |
| `debate` | `debate:` | scholarship | A question historians argue about, with the positions. |
| `quote` | `quote:` | scholarship | A primary-source excerpt, checked verbatim. |
| `chain` | `chain:` | scholarship | An ordered path of causal relations across lenses. |

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
| `type` | One of: `controls`, `capital_of`, `part_of`, `located_in`, `born_in`, `died_in`, `ruled`, `participant_in`, `fought`, `allied_with`, `trades_with`, `founded`, `destroyed`, `succeeded`, `influenced`, `teacher_of`, `translated`, `wrote`, `spread_to`, `migrated_to`, `caused`, `contributed_to`, `prevented`, `governed_as`, `derived_from` (a script or language from its parent), `present_at`. Ask the kernel thread to add one. |
| `from`, `to` | Ids. Read as "from TYPE to": `place:damascus capital_of polity:umayyad`, `event:x caused event:y`. |
| `start`, `end` | Optional time window. |
| `weight` | Optional number: strength, volume, or troop count, depending on type. |
| `confidence` | Optional 0 to 1. **Required for `caused`, `contributed_to` and `prevented`.** |
| `view` | Optional. Whose explanation this is (a historian, school or theory), for contested causes. Competing explanations are separate relations with different `view`s. |
| `note` | Optional short text. |
| `mech` | Optional, for causal relations: the mechanism in one sentence (how `from` acted on `to`). |
| `lag` | Optional, for causal relations: years between cause and effect. |
| `debate` | Optional: the `debate:` id this explanation belongs to. |
| `role` | For `present_at`: what they were doing there (`qadi`, `student`, `ambassador`, `prisoner`, ...). |

**Presence.** `present_at` says someone or something was somewhere for a while:
`{"kind":"relation","type":"present_at","from":"person:ibn_battuta","to":"place:delhi","start":1334,"end":1341,"date":"1334-06","role":"qadi","conf":"attested"}`.
Births and deaths are presences of zero length; residence, work, study and battles fought all become presences.

### Measures

```json
{"id":"m:population:rome:chandler","kind":"measure","of":"place:rome","metric":"population","unit":"people","points":[[1,800000],[100,1000000,800000,1200000]],"lenses":["population"],"sources":[{"cite":"Chandler 1987"}],"status":"sourced"}
```

`points` are `[year, value]` or `[year, value, low, high]`, in year order. Metrics so far: `population`,
`gdp`, `gdp_per_capita`, `area`, `urban_share`, `deaths`, `stability`, `temperature_anomaly`. Units are
free text but must be consistent per metric (`people`, `2011 int$`, `million_km2`, `share`, `°C`).
One measure record per (thing, metric, source), with id `m:<metric>:<thing slug>:<source slug>`, e.g. `m:population:rome:chandler`. Several sources for the same metric are fine; views pick one or show the spread.

### Journeys

A `route` with `subtype: "journey"` is an ordered trip. `carrier` is who or what moved (a person, ship, object, idea or
disease id, or free text), and `legs` lists the stages:

```json
{"id":"route:journey:ibn_battuta_1325","kind":"route","subtype":"journey","name":"Ibn Battuta's first hajj","carrier":"person:ibn_battuta",
 "legs":[{"from":"place:tangier","to":"place:alexandria","start_date":"1325-06","end_date":"1326-04","mode":"land","conf":"attested","via":[[-5.8,35.8],[10.2,36.8]]}],
 "lenses":["people"],"sources":[{"cite":"Ibn Battuta, Rihla, tr. Gibb"}],"status":"sourced"}
```

A leg's `from` / `to` are place ids or `[lon, lat]`; `start_date` / `end_date` are ISO (`-0480-08` for BCE); `mode` is
`land | river | sea | caravan | rail | air | road | foot | horse`; `conf` is the class above. Unknown legs are
`approximate` and get a path from the motion model.

## Scholarship

Owned by `data/scholarship/` (contract and authoring rules: data/scholarship/README.md). The Atlas reads it through the
`scholar` lens and `ATLAS.world.why`.

- **source** `src:<surname>_<year>_<word>`: `type` (`book | article | chapter | primary | dataset | thesis | web`),
  `authors` (`["Pomeranz, Kenneth"]`, `[]` if anonymous), `year`, `title`, `container` (journal or book a chapter is
  in), `publisher`, `doi` (bare, `10.xxxx/...`), `isbn`, `url`, `school`. `verified` is written by
  `ingest/scholarship/verify.py`: `{via: crossref | crossref-search | openlibrary | openlibrary-isbn | url, score, on}` or
  `{failed, on}`. A source needs no `sources` of its own.
- **debate** `debate:<slug>`: `name` (the question), `start`, `end`, `bbox` `[W,S,E,N]`, `lat`/`lon`, `about` (kernel ids),
  `positions` (at least two: `{id, school, scholars, claim, mech, for: [...], against: [...], works: [src ids],
  lenses, standing: leading | strong | contested | minority | discredited, rels: [rel ids]}`), `state` (where the
  field stands now), `settle` (what evidence would decide it), `quotes`, `series` (measure ids), `fun` (one line
  that makes you want to open it).
- **quote** `quote:<slug>`: `text` (an excerpt of at most 900 characters, verbatim from a public-domain translation),
  `author`, `work`, `written` (year), `start` (the year it describes), `lat`/`lon` or `place`, `src` (the edition),
  `check_url` (a plain-text copy the verifier searches), `about` (ids), `lens`, `witness` (source criticism: who wrote it,
  when, why, and what to discount).
- **chain** `chain:<slug>`: `name`, `blurb`, `start`, `end`, `links` (rel ids in order; each `to` is the next `from`
  or a branch), `debates`, `question` (which of Rishi's questions it answers). Each chain crosses at least two lenses.

Measures carry uncertainty as `[year, value, low, high]` points; a scholarship measure adds `method` (how the number was
made) and `src`.

## Lenses

`geography` (land, rivers, chokepoints, climate) · `military` · `economy` (wealth, trade) ·
`population` (size, migration) · `disease` · `religion` · `ideas` (philosophy, science, technology) ·
`literature` · `people` · `order` (stability, crisis, collapse) · `art` (buildings, works of art, styles) · `law` (forms of government, law codes, rights and policies such as slavery and suffrage) · `language` (languages, scripts, peoples and ancient DNA).

## Causes (for dead places, and anything that ended)

`war`, `fire`, `earthquake`, `river`, `sea`, `climate`, `trade`, `capital`, `quarried`, `volcano`,
`silt`, `faith`, `disease`, `unknown`.

## Changes

v0.6 · 2026-10-25 · `scholarship` workstream (with the world-engine contract, views/atlas/WORLD.md): kinds `source`,
`debate`, `quote`, `chain`; `src` / `pages` / `quote` on any sources entry (checked as references); `conf` class on any
record and journey leg; relation `present_at` (with `role`); route subtype `journey` with `legs` and `carrier`; causal
relation fields `mech`, `lag`, `debate`.
v0.5 · 2026-10-25 · `peoples-languages` workstream: kinds `language`, `script`, `sample`; lens `language`; relation `derived_from`; event subtypes `language_spread` (with `hypotheses` and `stages`), `attestation`, `language_death`, `script_reform`, `genetic_finding` (with `ancestry_share` [low, high] %). The build now also checks `language` references, and `family` / `branch` on language records.
v0.4 · 2026-10-25 · `europe-19c` workstream (deep zoom): `date` and `end_date` on any record, ISO `YYYY`, `YYYY-MM` or `YYYY-MM-DD` as precise as the source, and always in the same year as `start` / `end`; `date_note` when sources disagree. Event subtypes `siege`, `campaign`, `expedition`, `revolution`, `coup`, `mutiny`, `riot`, `protest`, `strike`, `massacre`, `pogrom`, `assassination`, `congress`, `independence`, `referendum`, `coronation`, `exhibition`, `fire`, `shipwreck`, `disaster`; `family` groups them (war, diplomacy, unrest, disaster, culture). `sitelinks` = how many Wikipedias cover a record. Place field `admin` / `admin_of` for provinces. See data/europe-19c/README.md.
v0.3 · 2026-10-25 · `law` workstream: lens `law`; relation `governed_as` (polity -> `idea:gov:<form>`, time-bounded, with `basis`: curated or wikidata); event subtype `law` with `by` (polity id), `policy` (`idea:policy:<slug>`) and `effect` (adopt, abolish, restrict, extend); `by` and `policy` are checked as references; measures `regime_lied` (Lexical Index class 0-7, `step: true` = value holds until the next point) and Seshat presence metrics (`legal_code`, `courts`, `judges`, `lawyers`, `bureaucrats`, `divine_rulers`, `divine_legitimation`, `exec_constraint_gov`, `exec_constraint_nongov`). See data/law/README.md.
v0.2 · 2026-10-25 · `art-architecture` workstream: `art` lens; idea subtype `style` (`family`, `origin`, `spread`); work fields `styles`, `styled_from`, `made_at`.

v0.1 · 2026-10-24 · `geography` workstream: physical-feature subtypes, `tier`, `label_line`, `elevation_m` on places.

v0 · 2026-10-24 · first version. Breaking changes will bump the version and come with a migration script.
