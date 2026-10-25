# deep: dated rows for every place and period

What the world index (views/atlas/world/, WORLD.md L1) is built from. Compact files, not kernel records: BCE days
("-0480-09-28") do not fit the kernel's date field and a hundred thousand rows would swamp dist/kernel.json. Other
workstreams may turn rows into kernel records (the coverage thread does); the index dedupes by Wikidata id.

| File | What | Status |
| --- | --- | --- |
| `chronicle.tsv` | About 44,000 dated events everywhere, 5000 BCE to today, from Wikidata (38 classes with subclasses: battles, sieges, wars, revolts, treaties, councils, coronations, elections, epidemics, famines, earthquakes, eruptions, floods, fires, shipwrecks, ...): date to the day where Wikidata has it, end date, family, sitelinks. Flags: `a` date good only to the decade, `l` pinned at its location item (P276) | sourced |
| `lives.tsv` | 121,800 people from Pantheon 2025 with birth and death date and place | sourced |
| `packs/<id>.json` | Dense packs, one per line of views/atlas/world/packs.json, from the generic assembler | sourced, plus draft rows |
| `packs/drafts/<id>.json` | A pack's draft layer, written by Claude where Wikidata and Pantheon are thin; every row names the Wikipedia article it was written from | draft |
| `stories/*.json` | 75 study storylines (title, region, span, view, steps with date, place, people, what, why, Wikipedia article, Wikidata id) | draft |

Rebuild:

```sh
python3 ingest/deep/fetch_events.py      # Wikidata, cached in /mnt/project-files/atlas/raw/deep/ (about an hour)
python3 ingest/deep/build.py             # chronicle.tsv, lives.tsv
python3 views/atlas/world/assemble.py    # packs/*.json (Wikidata box queries cached in raw/deep/packs/)
python3 ingest/deep/stories.py           # checks stories/*.json, adds Wikidata ids
```

Gaps, so the map does not overclaim: Wikidata's dated events and Pantheon's people lean heavily to Europe and the
last two centuries; Song China, Mughal India and Abbasid Iraq have a few hundred rows each before their draft layer.
Storyline and draft text is written from the named Wikipedia article and waits for the judge.
