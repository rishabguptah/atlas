# States, war and chokepoints

Workstream 3. Records land in `data/states-war/`; the page is built by `views/states-war/build_page.py`.

## Run

```sh
python3 ingest/states-war/cliopatria.py    # downloads Cliopatria into raw/states-war/, simplifies with npx mapshaper
python3 ingest/states-war/battles.py
python3 ingest/states-war/chokepoints.py   # needs the borders from cliopatria.py
python3 ingest/states-war/wikidata_battles.py raw/states-war/wikidata/   # battles.json + participants.json from battles.rq / participants.rq
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
| `battles.jsonl` | 169 key battles and sieges with sides, winner and why, plus `participant_in` links to polities. 151 carry their Wikidata id. | draft |
| `battles-wikidata.jsonl` | 10,951 battles and sieges from Wikidata with coordinates and a year, their wars and participants, plus 4,703 `participant_in` links to polities and people matched by Wikidata id | sourced |
| `chokepoints.jsonl` | 37 straits, canals, capes and passes as `place:` stubs (places-people owns places; its fields win where it has the same id, e.g. `place:bosporus`), plus 667 computed `controls` spans | places draft, spans sourced |

## Sources and licences

- **Cliopatria v0.2.1**, Seshat Global History Databank. CC BY 4.0. Bennett et al. 2025, *Scientific Data*,
  doi:10.1038/s41597-025-04516-9. https://github.com/Seshat-Global-History-Databank/cliopatria.
  Covers 3400 BCE to 2024, about 1,600 polities in 13,800 rows. Changes made: geometry simplified to 2% of
  vertices with mapshaper, coordinates rounded to 0.01°, and sampled every 25 years.
- **Wikidata** (CC0), queried 2026-10-24: every item that is a battle or siege (34 classes) with coordinates. 926 of
  12,028 items were dropped for having no date or no English name. WDQS years are astronomical (-0479 is 480 BCE)
  and converted. Dates before 1582 may be Julian.
- **Key battles and chokepoint descriptions** are written from general knowledge and each cites the Wikipedia article
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

- Wikidata does not say who won. The 169 key battles keep a hand-written winner (draft) until the judge checks them.
- CShapes 2.0 (borders from 1886) is now in /mnt/project-files/atlas/raw/cshapes/ and could sharpen the modern borders.
- Chokepoint holders use one point per place. A strait with two shores held by different states records only the
  nearer one.
