# States, war and chokepoints

Workstream 3. Records land in `data/states-war/`; the page is built by `views/states-war/build_page.py`.

## Run

```sh
python3 ingest/states-war/cliopatria.py    # downloads Cliopatria into raw/states-war/, simplifies with npx mapshaper
python3 ingest/states-war/battles.py
python3 ingest/states-war/chokepoints.py   # needs the borders from cliopatria.py
python3 tools/build.py
python3 views/states-war/build_page.py path/to/land-50m.json borders-and-battles.html
```

## What it writes

| File | Records | Status |
| --- | --- | --- |
| `polities.jsonl` | 1,587 polities, one per Cliopatria name, with Wikidata and Seshat ids | sourced |
| `polity-area.jsonl` | `m:area:<polity>:cliopatria`, area in million km² at each Cliopatria row. Skips the 618 series order-chaos already publishes under the same id. | sourced |
| `polity-relations.jsonl` | `part_of` (members of composite empires, vassals, allegiances), `allied_with` (alliances, personal unions) | sourced |
| `geo/borders.geojson` | 5,397 border polygons, sampled every 25 years from 3400 BCE to 2024 | sourced |
| `battles.jsonl` | 169 decisive battles and sieges, plus `participant_in` links to polities | draft |
| `chokepoints.jsonl` | 37 straits, canals, capes and passes as `place:` stubs (places-people owns places; its fields win where it has the same id, e.g. `place:bosporus`), plus 667 computed `controls` spans | places draft, spans sourced |

## Sources and licences

- **Cliopatria v0.2.1**, Seshat Global History Databank. CC BY 4.0. Bennett et al. 2025, *Scientific Data*,
  doi:10.1038/s41597-025-04516-9. https://github.com/Seshat-Global-History-Databank/cliopatria.
  Covers 3400 BCE to 2024, about 1,600 polities in 13,800 rows. Changes made: geometry simplified to 2% of
  vertices with mapshaper, coordinates rounded to 0.01°, and sampled every 25 years.
- **Battles and chokepoint descriptions** are written from general knowledge and each cites the Wikipedia article
  to check against, so they are `draft` until the judge checks them.
- **CDB90** (jrnold/CDB90, ODC-BY, 660 battles 1600 to 1973) was checked but has no coordinates, so it is not used yet.

## Schema notes (fields added, not bent)

- Border features carry `ref`, `name`, `from`, `to` (the Cliopatria row's years), `years` (every snapshot year the
  polygon is drawn in, instead of a single `year`), `area_km2`, and `group` (the composite empire it belongs to).
- Battle events carry `sides` (two lists of `{name, polity?}`) and `winner` (0, 1 or null).
- Polities reuse the Living Atlas ids where the empire matches (for example `polity:roman`, `polity:mongol`), so
  those stubs merge into these records. `polity:dutch` and `polity:french` have no single Cliopatria match and stay stubs.
- Battle ids that would clash with Living Atlas city events get a longer slug (`event:siege_of_baghdad_1258`).

## Overlap with order-chaos

`data/order-chaos/` ships 682 Cliopatria polity stubs and area series. Their stubs merge into these records
where the ids match. Two kinds don't match yet: the 64 Living Atlas empires (they use `polity:roman_empire`,
this folder uses the Living Atlas id `polity:roman`), and names with accents (`polity:ch_mpa` vs `polity:champa`).

## Gaps and next steps

- **Wikidata is blocked** from this environment (query.wikidata.org and www.wikidata.org are refused by the network
  policy), as are Harvard Dataverse (the Historical Conflict Event Dataset) and ETH Zurich (CShapes). Allowing them
  would let a pull replace the 169 hand-written battles with thousands of sourced ones.
- Chokepoint holders use one point per place. A strait with two shores held by different states records only the
  nearer one.
