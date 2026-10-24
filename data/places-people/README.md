# places-people

Owner: workstream 2 (places and people). Rebuild with:

```
./ingest/places-people/fetch.sh            # downloads into raw/places-people/ (git-ignored)
# Reba et al. is not downloadable from the cloud container: copy historical_urban_population.csv
# (from /mnt/project-files/atlas/raw/reba/ or Harvard Dataverse doi:10.7910/DVN/LMCQGX) into raw/places-people/reba/
pip install pycountry
python3 ingest/places-people/build_records.py
python3 tools/build.py
python3 ingest/places-people/view/make_page.py LAND_50M.json who-could-have-met.html   # the viewable page
```

## What is here

| File | Records | What |
| --- | --- | --- |
| `people.jsonl` | 3,000 `person` | The most-remembered people in Pantheon who have died and have a mapped birthplace, ranked by Pantheon's Historical Popularity Index (kept as `fame`). `born`/`died` carry year and place; `roles` comes from Pantheon's occupation. |
| `places.jsonl` | ~7,400 `place` | Every GeoNames city of 100,000+ people, every birth and death place of those 3,000 people, every Reba et al. city (1,185 of 1,728 matched to an existing place by name within 30 km, the rest added with Reba's coordinates), and 15 ancient cities from the largest-city tables. Living Atlas ids are kept: a living Living Atlas city takes over the matching GeoNames record, and the other Living Atlas slugs are reserved so namesakes elsewhere get a suffix (`place:memphis` stays Egypt; Tennessee is `place:memphis_united_states`). |
| `measures.jsonl` | ~6,200 `measure` | Population by year for 1,722 cities from Reba et al. 2016 (`:reba2016`, 3700 BCE to 2000), modern population per city from GeoNames (one point, census years vary), and the world's-largest-city figures by source (Chandler, Modelski, Morris). |

Places that GeoNames does not list as a populated place (estates, ancient sites, regions Pantheon uses as birthplaces) have `subtype: "site"` and cite Pantheon for their coordinates.

## Sources and licences

| Source | Licence | Used for |
| --- | --- | --- |
| [Pantheon](https://pantheon.world) 2025 update (`person_2025_update.csv`, public GCS bucket) | CC BY 4.0 (Pantheon's stated data licence; confirm before redistributing the raw file) | people, birth/death places and years |
| [GeoNames](https://www.geonames.org) cities1000, via the `all-the-cities` 3.1.0 npm package (2020 snapshot) | CC BY 4.0 | city names, coordinates, modern population |
| Reba, Reitsma & Seto 2016, [Historical Urban Population 3700 BC to AD 2000](https://doi.org/10.7910/DVN/LMCQGX) | Dataverse says CC BY 4.0, SEDAC metadata says attribution, non-commercial, share-alike; treat as the stricter | city population by year |
| Wikipedia, [List of largest cities throughout history](https://en.wikipedia.org/wiki/List_of_largest_cities_throughout_history), after Chandler 1987, Modelski 2003, Morris 2010 | CC BY-SA 4.0 (the figures themselves are facts from the books) | largest city by year |

## Status and caveats

- Largest-city measures and the ancient-city coordinates are `draft`: the table was transcribed through a summarising web fetch, and the coordinates were written from general knowledge. The judge should check them against the page. Ambiguous rows (1000 BCE) and "< 10,000" rows were left out. Haojing and Chang'an are both filed under `place:xian`.
- Pantheon's birthplaces for ancient people are often a modern settlement or a region, and some birth years are conventional estimates (`start_approx: true` when Pantheon has no full date).
- Reba lists a city only in years when it made Chandler's or Modelski's tables, so gaps mean "not listed". Reba's Memphis mixes Egypt and Tennessee under one id; points from 1800 on are filed under `place:memphis_united_states` (`REBA_SPLITS` in the script). Ao (Shang) is filed with Zhengzhou and St. Louis 1000 CE is really Cahokia, as in the source.
- The people list leans modern (about 1,900 of 3,000 were born after 1500) because it follows Pantheon's fame ranking.

## Blocked, to do next

The cloud environment cannot reach Wikidata, Wikipedia, SEDAC or Dataverse (Reba et al. 2016 urban population, Chandler/Modelski city tables), Pleiades or Zenodo (Stadestér, 41,000 cities since 3000 BCE). With those hosts allowed:

1. Pleiades: ancient places with date ranges and coordinates, matched to `ext.pleiades`.
2. Wikidata: founding dates (`start`) for places, and people's residences for real journeys beyond birth and death.
