# Art & architecture

Styles and how they spread, and the buildings and works of art that define them. Feeds the
`art` lens (Art & architecture, in the Mind family of the one-page Atlas).

| File | Records | What |
| --- | --- | --- |
| `styles.jsonl` | 51 `idea:style:*` | One style each (Gothic, Ottoman imperial mosque, Ukiyo-e...), with `family` (13 coarse groups the map colours by), `origin` and lat/lon of its birthplace, start/end, `what`, `why`, `spread`. Drafts, each citing the Wikipedia article to check. |
| `monuments.jsonl` | 241 `work:art:*` | Hand-picked key buildings (subtype `building`) and works (`artwork`), each with `styles`, dates, `what`, and Wikidata id and coordinates (236 of 241 pinned). Artworks sit where they were made (`made_at`), not today's museum. |
| `wikidata.jsonl` | 3,914 `work:art:q*` | Every Wikidata item with an architectural style (P149) we map, coordinates, an inception date and at least 12 language editions. `styled_from` is set when the building is older than its style (rebuilt in it later). Sourced. |
| `relations.jsonl` | 55 | 41 `influenced` links between styles with confidence and a note; 14 `part_of` links tying the Living Atlas wonders (Giza, Hagia Sophia, Bamiyan...) to their style instead of copying them. |

Rebuild: `python3 ingest/art-architecture/resolve.py && python3 ingest/art-architecture/wikidata.py && python3 ingest/art-architecture/build.py`
(edit the tables in `ingest/art-architecture/curated.py`). build.py lists curated dates that differ from Wikidata's
inception by more than 60 years; nearly all are Wikidata dating a site's founding rather than the phase in that style
(Florence Cathedral 1296 vs the dome 1420). Wikidata's P149 is Europe-heavy, so Asia, Africa and the Americas rely on the
curated rows.
