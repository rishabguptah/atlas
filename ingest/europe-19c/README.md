# europe-19c ingest

Europe 1789-1914 up close. Raw downloads go to `/mnt/project-files/atlas/raw/europe-19c/` (cached; delete a file to refetch).

```sh
python3 ingest/europe-19c/fetch_events.py      # Wikidata events by class, 1789-1914 (about 10 min)
python3 ingest/europe-19c/fetch_rail.py        # stations and lines with opening dates, one query per country (about 25 min)
python3 ingest/europe-19c/fetch_provinces.py   # first-level divisions with dates
python3 ingest/europe-19c/fetch_cities.py      # dated city populations, then which items are towns
python3 ingest/europe-19c/fetch_spine.py       # the storylines' Wikipedia articles -> Wikidata ids
python3 ingest/europe-19c/build.py             # writes data/europe-19c/
python3 tools/build.py
```

`spine.py` holds the ten storylines (hand-written, draft). `wdq.py` is the small SPARQL client the fetchers share.
Lives come from the Pantheon file in `raw/pantheon/`.
