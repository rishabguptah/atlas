# Travels: presences, journeys and voyages

Owner: the "Set history's travellers in motion" workstream (L0 movement data in views/atlas/WORLD.md). Shapes are schema
v0.5: relation `present_at`, route subtype `journey` with `legs`, and the `conf` class (`attested`, `estimated`,
`approximate`, `unknown`). Consumers: the Journeys, VOC ships and Middle Passage lenses and the Who was there tab
(views/atlas/lenses/travels.*), and through `ATLAS.travel` the living-world simulation, the life RPG and objects.

| File | What | Built by |
| --- | --- | --- |
| `presences_wikidata.jsonl` | 16,217 presences for 3,443 people: residence P551 (`lived`), work location P937 (`worked`), educated at P69, employer P108, positions held P39 at the office's location or its jurisdiction's capital, and battles (P607 with their own coordinates, under two years). Undated stays get `conf: unknown` and a `window` instead of start/end; the finder ignores them. | `fetch_wikidata.py` then `presences.py` |
| `presences_travels.jsonl` | Long stays on the hand-entered journeys, plus co-presence clusters people ask about (Vienna 1913, Zurich 1916, Florence 1504, Paris 1920s, Weimar). Drafts with a cited biography each. | `itineraries.py` |
| `journeys.jsonl` | Ibn Battuta, Xuanzang, Marco Polo, Mansa Musa's hajj, Faxian, Zheng He's 1st, 5th and 7th voyages, Evliya Çelebi, Humboldt. Drafts from the cited accounts. | `itineraries.py` |
| `journeys_world.jsonl`, `presences_world.jsonl` | 43 journeys researched by the living-world thread (data/world/journeys on its branch): Zhang Qian to Ho Chi Minh. | `world_journeys.py DIR` |
| `voyages_das.jsonl` | 8,157 Dutch East India Company voyages 1595-1795 (Dutch-Asiatic Shipping): ports and dates, the Cape call, the ship and master, and the people aboard, the people who died and the people who arrived. Sea lanes between ports are `via` points with `via_conf: approximate`. Ships that never arrived end in a leg with `conf: unknown`. | `das.py` |
| `slave_routes.jsonl` | 262 Middle Passage routes (African region to American region) with people embarked, landed and dead at sea, and `by_decade`. | `slave.py` |
| `voyages/slave.json` | All 64,852 SlaveVoyages voyages (trans-Atlantic and intra-American) as compact columns: year, ship, captain, flag, ports, people embarked and landed (imputed), resistance. Not kernel records (too many). | `slave.py` |
| `places.jsonl`, `people.jsonl` | Stub places and two stub people (Trotsky, Evliya Çelebi) the records above need. | all |

House rules for the slave trade: the people in these voyages are people, never cargo. Count "people forced aboard",
"people who died on the crossing", "survivors landed"; say the counts cover documented voyages only (about 12.5 million
people were forced aboard in the whole trade, 1501-1866); point to the African Names Database.

## Rebuild

```sh
python3 tools/build.py                                   # the scripts read dist/kernel.json for places and people
python3 ingest/travels/fetch_wikidata.py                 # ~10 min; caches in /mnt/project-files/atlas/raw/travels/
python3 ingest/travels/presences.py
python3 ingest/travels/das.py
python3 ingest/travels/slave.py                          # needs pdftotext for the codebook's place codes
python3 ingest/travels/itineraries.py
python3 ingest/travels/world_journeys.py DIR             # DIR = a checkout of data/world/journeys
python3 tools/build.py
```

`fetch_wikidata.py` takes every person in the kernel, so rerun it (and `presences.py`) when the coverage thread adds
people. Next: route legs with unknown paths through `ATLAS.world.route` once views/atlas/world/route.js is on main.

One journey dataset: the living-world simulation reads these journeys through `views/atlas/lenses/travels.py`
`journeys_as_stops(repo)` (its stop format), and the page through `ATLAS.travel.journey(id).legs[].path`. On the page each
leg is routed lazily through `ATLAS.world.route` (land, sea or air by leg mode) once the motion model is ready; until
then, or if routing fails, the leg is drawn straight.

`presences_cbdb.jsonl`: dated office postings from the China Biographical Database (CBDB, CC BY-NC-SA 4.0) for kernel
people matched by `ext.cbdb` or Wikidata, one presence per posting at its geocoded address (`ingest/travels/cbdb.py`;
unzip raw/coverage/cbdb/latest.zip first). Both years given: attested; one: estimated; neither: skipped.
