# Rule & law ingest

```sh
python3 ingest/law/build_law.py [RAW_DIR] [SESHAT_DIR]   # writes data/law/*.jsonl; then python3 tools/build.py
```

Hand-written content lives in Python files here: `forms.py` (families, forms, policies, the Wikidata label map),
`government.py` (curated government spans) and `laws.py` (curated laws and notes for suffrage firsts).
Edit those and rerun; never edit data/law by hand.

Raw inputs (kept out of git, in `/mnt/project-files/atlas/raw/law/` and `.../raw/seshat/`):

- `p122.json`: Wikidata, for every polity Wikidata id in data/*/polities.jsonl, in batches of 200:
  ```sparql
  SELECT ?p ?g ?gLabel ?s ?e WHERE { VALUES ?p { wd:Q12536 ... } ?p p:P122 ?st. ?st ps:P122 ?g.
    OPTIONAL {?st pq:P580 ?s} OPTIONAL {?st pq:P582 ?e}
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }
  ```
- `iso.json`: polity Wikidata id -> own ISO 3166 alpha-3 (P298) and its P17 country's code; only the own code is used.
- `iso_capitals.json`: ISO3 -> capital coordinates (P36, P625), to pin suffrage firsts.
- `political-regime-lied.csv`, `universal-suffrage-lied.csv`, `universal-suffrage-women-lied.csv`: Our World in Data
  grapher downloads (`https://ourworldindata.org/grapher/<slug>.csv?useColumnShortNames=true`, slugs
  political-regime-lexical, universal-suffrage-lexical, universal-suffrage-women-lexical), LIED v6.9.
- Seshat: `Equinox_data-1.0.zip` and `api/core_polities.jsonl`. Equinox uses old polity codes (e.g. `ItRomPr`);
  they are matched to new Seshat ids by start/end years and name, then to Cliopatria polities through `ext.seshat`.
  Needs openpyxl for this one step.
