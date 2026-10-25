# Brief for scholarship authors (one batch each)

You are writing one batch of the Atlas's scholarship layer: the part that makes Rishi's history map argue like a
seminar and cite like a monograph, across every lens (geography/climate, disease, economy, population, military,
order, law, religion, ideas, literature, art, people). Read `data/scholarship/README.md` (rules and shapes) and the
"Scholarship" and "Relations" sections of `schema/SCHEMA.md` first. They bind.

## Your output

Write only these files (your batch name is given in your task): `data/scholarship/sources-<batch>.jsonl`,
`debates-<batch>.jsonl`, `quotes-<batch>.jsonl`, `links-<batch>.jsonl`, `chains-<batch>.jsonl`,
`nodes-<batch>.jsonl`, and if you have them `series-<batch>.jsonl`. Other authors write other batches in the same
folder at the same time: never touch their files, never run git (no commit, no checkout, no stash).

Targets for one batch (quality first; drop a target before you invent anything):

- 8 to 10 **debates**, each with 3 to 5 positions, named scholars, real works, `for` / `against` evidence,
  `state`, `settle`, and a `fun` line (one sentence that makes you want to open it: the two-sided card on the map).
- 60 to 120 **sources** (everything the debates, quotes and links cite), as source records.
- 8 to 15 **quotes**, verbatim from public-domain translations fetched from Project Gutenberg or Wikisource, each with
  a `witness` note (source criticism). Fetch the text with curl, find the passage, copy it exactly.
- 150 to 250 **causal links** (`caused` / `contributed_to` / `prevented`), each crossing lenses where it honestly
  does, with `confidence`, `conf`, `view`, `mech`, `lag` where sensible, `debate` where it belongs to one, `start` /
  `end`, and sources that use `src`. Competing explanations of the same effect are separate links with different
  `view`s and confidences. Ids: `rel:why:<batch>:<short_slug>`.
- 6 to 12 **chains**: ordered paths through your links that cross at least two lenses (climate → harvest → prices →
  revolt → ideas). Ids `chain:<slug>`. Give each a `question` field naming the big question it helps answer.
- **series** with uncertainty where the debates turn on a number (population estimates, mortality, wages, prices,
  temperature, silver flows): `measure` records with `[year, value, low, high]` points, `method`, `src`.

## How

1. `cd /home/user/atlas && python3 tools/build.py >/dev/null; wc -l dist/ids.txt` gives you every existing id in
   `dist/ids.txt`. Grep it (`grep -i potosi dist/ids.txt`) and reuse ids for `from`, `to`, `about`, `place`.
   `python3 -c "import json;k=json.load(open('dist/kernel.json'))['records'];..."` shows a record's fields.
   Add nodes only when nothing fits: full `event` records with `start`, `lat`, `lon`, `lenses`, a `src` source and
   `status: "sourced"` (or `stub: true` for a place, polity or person someone else owns, with name and lat/lon).
   Prefix new event ids with your batch (`event:<batch>_<slug>`) so authors do not collide.
2. Source ids: `src:<firstauthor surname>_<year>_<one word>`, lowercase ascii. Another batch may cite the same
   work; before adding one, `grep -h '"id": "src:<surname>_' data/scholarship/sources-*.jsonl` and reuse an
   existing id instead of writing a duplicate record.
3. After writing, run `python3 ingest/scholarship/verify.py data/scholarship/sources-<batch>.jsonl data/scholarship/quotes-<batch>.jsonl`.
   It checks DOIs at Crossref, finds DOIs for articles, finds books at OpenLibrary, and searches each quote's
   `check_url` for the excerpt verbatim. It prints every failure. For each one: fix the metadata
   (title, year, first author) if you made a slip; delete the source and its uses if it may not exist; re-copy a
   quote that did not match. A real book OpenLibrary misses may stay with `"note": "..."` saying why you are sure.
   Rerun until only those remain.
4. `python3 tools/build.py --check 2>&1 | grep -- '-<batch>'` must print nothing (errors in other batches' files
   are not yours). Then `python3 ingest/judge/audit.py dist/kernel.json 2>&1 | tail -5` after a full build.
5. Write JSON with `ensure_ascii=False`, one record per line. Python scripts in your scratch area are fine for
   generating the files, but every fact in them comes from your knowledge of the literature checked against the
   verifier and, where you are unsure, the web (curl works for Wikipedia's REST API, Crossref, OpenLibrary,
   Gutenberg and Wikisource).

## Voice

Plain, vivid English: a smart friend who has read the whole literature. Claims in one or two sentences, numbers
with units and ranges, the scholar named. No hedging filler, no em-dash chains. Fun and rigorous at once: the
reader should want to tap the next link.

## Report back

When done, reply with: counts per file, how many sources verified vs not (and which unverified ones you kept and
why), the chains' names, and any id you needed but could not find.
