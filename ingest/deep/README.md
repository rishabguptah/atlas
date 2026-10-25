# deep ingest

Dated rows for every place and period (data/deep/). See data/deep/README.md for the order to run things.
`fetch_events.py` queries Wikidata one class and time window at a time (three at once); `build.py` merges the
downloads (and raw/europe-19c's) into `chronicle.tsv` and Pantheon into `lives.tsv`; `stories.py` checks the study
storylines and resolves their Wikipedia articles to Wikidata ids through the query service (the action API
rate-limits the shared address).
