# guide (workstream 7)

Data owned by the AI guide.

- `tours/*.json`: curated guided answers. A tour is one question answered as a sequence of map
  scenes (year, view, highlighted ids, pins, routes) with a lens, text, confidence and sources per
  step, plus competing explanations (`views`), what-ifs and open questions. This is a guide format,
  not a kernel kind, so `tools/build.py` does not read it. `views/guide/build.py` inlines it into the page.
- `claims.jsonl`: kernel records (events and causal relations) pulled out of the tours, so the
  judge can check them and other views can use them. Competing explanations are separate relations
  with a `view`.

Everything here is `status: draft`: written by Claude with sources attached, waiting for the judge.

Licences: no third-party dataset is copied here. Sources are cited works and Wikipedia articles.
