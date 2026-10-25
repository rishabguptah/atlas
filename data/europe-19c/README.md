# Europe 1789-1914 up close

The first deep-zoom region: one place and period studied by the month instead of the century, as a pattern other
regions can copy (a region block, dated rows, a month cursor). Built by `python3 ingest/europe-19c/build.py` from the
downloads the `fetch_*.py` scripts there put in `/mnt/project-files/atlas/raw/europe-19c/`; do not edit by hand.
Drawn by `views/atlas/lenses/e19.py` / `e19.js` (Up close tab and the Chronicle, Railways, Provinces, Growing cities
and Lives lenses).

| File | What | Status |
| --- | --- | --- |
| `events.jsonl` | 3,579 events in Europe (lon -25..50, lat 34..72) with a date 1789-1914 from Wikidata: battles, sieges, wars, campaigns, revolutions, revolts, coups, riots, strikes, massacres, pogroms, assassinations, treaties, congresses, coronations, exhibitions, epidemics, famines, earthquakes, fires. `date` / `end_date` to the day where Wikidata has it (90%), else month or year. Where another workstream already has the event (most battles, from `states-war`), the line is a stub with that id adding the day-level date | sourced |
| `story.jsonl` | Steps of the ten study storylines that Wikidata has no matching event for (draft text written from the Wikipedia article named in `sources`). Steps that are a Wikidata event are merged into that event's line instead (`why`, `story`, `study_sources`) | draft |
| `stories.json` | The ten storylines: title, span, one-line blurb, ordered step ids | draft |
| `date-checks.txt` | Every storyline date compared with Wikidata: differences, and steps kept apart because the article covers more | |
| `provinces.jsonl` | 642 first-level divisions alive in 1789-1914 (French departments, Russian governorates, Italian provinces, Hungarian and English counties, Ottoman vilayets, Prussian provinces, Austrian crown lands, Swiss cantons, ...), with founding and ending years. Points, not outlines: Wikidata has no historical shapes for most of them | sourced |
| `people.jsonl` | The 2,000 most famous people (Pantheon HPI) born in Europe and alive in the period, with birth and death dates and places | sourced |
| `cities.jsonl` | Dated city populations 1779-1914 from Wikidata census-year statements (towns and cities only), as measures; the view adds the REBA series from `places-people` | sourced |
| `geo/railways.json` | 26,275 railway stations with their opening date and 11,719 links between stations Wikidata lists as neighbours (P197, at most 60 km apart). Not kernel records: a compact geo file; each station keeps its Wikidata number | sourced |

Fields added here (schema v0.4): `date`, `end_date` (ISO, as precise as the source), `date_note` (when the storyline
and Wikidata disagree), `family` (war, diplomacy, unrest, disaster, culture), `sitelinks` (how many Wikipedias have an
article, used to rank what shows first), `story`, `study_sources`, `part_of`, `place_name`, `place_note`; on provinces
`admin`, `admin_of`, `part_of_name`, `start_note`.

Gaps, so the map does not overclaim:

- Railway coverage follows Wikidata: dense for Britain, France, Italy, Switzerland, Belgium, Poland, Russia; thin for
  Germany's track links and very thin for Austria-Hungary and the Balkans. A missing line is missing data.
- Province outlines are not drawn. The best open source (MPIDR MOSAIC historical boundaries, 1880-1910) was not
  reachable from the build machine; German Empire states after 1871 and Scottish counties are missing from Wikidata's classes.
- Event coordinates: 10% are the event's location item (P276), not its own point; cards say so.
- Wikidata population statements are sparse for Britain and Italy; REBA (Chandler) fills 1800, 1850 and 1900.
