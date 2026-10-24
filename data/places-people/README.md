# places-people

Owner: workstream 2 (places and people). Rebuild with:

```
./ingest/places-people/fetch.sh            # downloads into raw/places-people/ (git-ignored)
# Reba et al. is not downloadable from the cloud container: copy historical_urban_population.csv
# (from /mnt/project-files/atlas/raw/reba/ or Harvard Dataverse doi:10.7910/DVN/LMCQGX) into raw/places-people/reba/
# Likewise copy wikidata/{cities,pleiades_wd,lost_cities}.csv into raw/places-people/wikidata/ and the
# pleiades-places-*.csv.gz dump into raw/places-people/pleiades/ (queries in /mnt/project-files/atlas/raw/wikidata/queries/)
pip install pycountry
python3 ingest/places-people/build_records.py
python3 tools/build.py
python3 ingest/places-people/view/make_page.py LAND_50M.json who-could-have-met.html   # the viewable page
```

## What is here

| File | Records | What |
| --- | --- | --- |
| `people.jsonl` | 3,000 `person` | The most-remembered people in Pantheon who have died and have a mapped birthplace, ranked by Pantheon's Historical Popularity Index (kept as `fame`). `born`/`died` carry year and place; `roles` comes from Pantheon's occupation. |
| `places.jsonl` | ~14,000 `place` | Every GeoNames city of 100,000+ people, every birth and death place of those 3,000 people, every Reba et al. city, ~5,300 Pleiades settlements that also have a Wikidata item, ~1,350 Wikidata ancient cities and well-known archaeological sites (15+ Wikipedia languages), and 15 ancient cities from the largest-city tables. Existing places get `wikidata`, `ext.pleiades` and a founding year (`start`, approximate) from Wikidata where one matches by id or by name within 20 km. 29 Living Atlas stubs are now owned here.
| `measures.jsonl` | ~6,200 `measure` | Population by year for 1,722 cities from Reba et al. 2016 (`:reba2016`, 3700 BCE to 2000), modern population per city from GeoNames (one point, census years vary), and the world's-largest-city figures by source (Chandler, Modelski, Morris). |

Places that GeoNames does not list as a populated place (estates, ancient sites, regions Pantheon uses as birthplaces) have `subtype: "site"` and cite Pantheon for their coordinates.

## Sources and licences

| Source | Licence | Used for |
| --- | --- | --- |
| [Pantheon](https://pantheon.world) 2025 update (`person_2025_update.csv`, public GCS bucket) | CC BY 4.0 (Pantheon's stated data licence; confirm before redistributing the raw file) | people, birth/death places and years |
| [GeoNames](https://www.geonames.org) cities1000, via the `all-the-cities` 3.1.0 npm package (2020 snapshot) | CC BY 4.0 | city names, coordinates, modern population |
| Reba, Reitsma & Seto 2016, [Historical Urban Population 3700 BC to AD 2000](https://doi.org/10.7910/DVN/LMCQGX) | Dataverse says CC BY 4.0, SEDAC metadata says attribution, non-commercial, share-alike; treat as the stricter | city population by year |
| [Wikidata](https://www.wikidata.org) queries of 2026-10-24 | CC0 | ids, founding and end years, ancient cities |
| [Pleiades](https://pleiades.stoa.org) dump of 2026-10-24 | CC BY 3.0 | ancient settlements, coordinates, attested date ranges |
| Wikipedia, [List of largest cities throughout history](https://en.wikipedia.org/wiki/List_of_largest_cities_throughout_history), after Chandler 1987, Modelski 2003, Morris 2010 | CC BY-SA 4.0 (the figures themselves are facts from the books) | largest city by year |

## Status and caveats

- Largest-city measures and the ancient-city coordinates are `draft`: the table was transcribed through a summarising web fetch, and the coordinates were written from general knowledge. The judge should check them against the page. Ambiguous rows (1000 BCE) and "< 10,000" rows were left out. Haojing and Chang'an are both filed under `place:xian`.
- Pantheon's birthplaces for ancient people are often a modern settlement or a region, and some birth years are conventional estimates (`start_approx: true` when Pantheon has no full date).
- Reba lists a city only in years when it made Chandler's or Modelski's tables, so gaps mean "not listed". Reba's Memphis mixes Egypt and Tennessee under one id; points from 1800 on are filed under `place:memphis_united_states` (`REBA_SPLITS` in the script). Ao (Shang) is filed with Zhengzhou and St. Louis 1000 CE is really Cahokia, as in the source.
- Pleiades `minDate`/`maxDate` are the span of attestation, not founding and abandonment, so new Pleiades places carry them as approximate `start`/`end` (no `end` when Pleiades runs past 1900). Wikidata SPARQL years are astronomical (-0752 = 753 BCE) and are converted.
- The people list leans modern (about 1,900 of 3,000 were born after 1500) because it follows Pantheon's fame ranking.

## To do next

1. Wikidata people pull (when it lands in raw/wikidata/): residences and positions held, for real journeys beyond birth and death.
2. Wikidata city population history, to fill the gaps between Reba listings.
3. Match more Pleiades places by their ancient names (only ~200 matched existing places by English name).
