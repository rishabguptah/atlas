# Atlas

Rishi's history engine: one sourced dataset of places, states, people, ideas, events and flows,
and an AI guide that answers questions by moving a time map through ten lenses (geography,
military, economy, population, disease, religion, ideas, literature, people, order and chaos).

Plan: https://claude.ai/artifact/EvSnuXojbyAm9zR8ZCxtYR

## Layout

| Path | What |
| --- | --- |
| `schema/SCHEMA.md` | The record format every workstream writes. Start here. |
| `data/<workstream>/*.jsonl` | Records, one JSON object per line. Each workstream owns its folder. |
| `ingest/<workstream>/` | Scripts that fetch datasets and write records. |
| `tools/build.py` | Validates everything, merges stubs into owners, writes `dist/kernel.json`. |
| `views/` | Pages generated from the kernel. `views/living-atlas/` rebuilds the Living Atlas map. |

## Build

```sh
python3 tools/build.py            # validate and write dist/
python3 tools/build.py --check    # validate only
```

CI runs the same check on every pull request.

## Living Atlas

The Living Atlas map was the first room in the house. Its records now live in `data/living-atlas/`.

```sh
node ingest/living-atlas/migrate.js /path/to/living-atlas/            # its data files -> kernel records
python3 tools/build.py
python3 views/living-atlas/export.py dist/living-atlas.js
node views/living-atlas/roundtrip.test.js /path/to/living-atlas/ dist/living-atlas.js
python3 views/living-atlas/build_page.py /path/to/living-atlas/ atlas.html   # page built from the kernel
```

`roundtrip.test.js` checks that the kernel reproduces the original data exactly.
