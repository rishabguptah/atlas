# religion-ideas

Religion, philosophy and literature: faiths, schools, institutions of learning, works, the people
behind them, teacher/influence/translation links, and "journeys" showing how an idea moved.

Built by `python3 ingest/religion-ideas/build.py` from the curated tables in `ingest/religion-ideas/curated_*.py`.
View: `python3 views/religion-ideas/build_page.py <land-50m.json> out.html` (Atlas of Ideas page).

| File | Records |
| --- | --- |
| ideas.jsonl | 52 faiths, schools, movements and institutions (owned here) |
| works.jsonl | 87 scriptures, books and poems with author and place written (owned here) |
| people.jsonl | 126 stubs (places-people owns people); adds `roles` and `active_place` |
| places.jsonl | stubs for every place used; places-people's fields win |
| relations.jsonl | `founded`, `teacher_of`, `influenced`, `translated`, and `spread_to` journey steps |
| routes.jsonl | 17 journeys, `subtype: idea_spread` (new subtype) |

## Sources and licence

Every record is `status: draft`. Wikidata and Wikipedia were not reachable from the build machine,
so records were written from general knowledge and each cites the English Wikipedia article that
should confirm it (CC BY-SA text; we store only short facts and links). The judge should check them;
On 2026-10-24 the dataset-fetch thread looked up every cited title on Wikidata. `resolve_wikidata.py`
turned that into `ingest/religion-ideas/wikidata_ids.json`: 454 of 469 records now carry a `wikidata` id
and a Wikidata source, and redirected citations point at the final article. Dates and coordinates were
compared with Wikidata; the 16 disagreements and what was decided are in `wikidata-check.md`.
Records stay `draft` because their prose has not been checked.

## Schema additions (proposed)

- `route.subtype: idea_spread` with `carrier` (the idea or work that travels).
- `spread_to` relations carry `route`, `step` and `via` (the place the idea came from).
- Person stubs carry `active_place` so a view can place someone where they worked.
