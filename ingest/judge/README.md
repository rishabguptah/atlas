# Outside judge (workstream 9)

The judge checks the atlas from outside. It does three jobs:

1. **Audit** (`audit.py`): plausibility and sourcing checks on the built kernel, on top of the shape
   checks in `tools/build.py`. It flags records that contradict each other (an event before its city
   exists, a population after a city ended, a peak outside an empire's own dates, a cause after its
   effect) and counts how much of the kernel rests on a real, linked source. Errors fail CI; warnings
   are listed for a human.
2. **Red-team sampling** (`sample_claims.py`): splits the kernel into single checkable claims (dates,
   events, populations, descriptions, empire dates and areas), and draws a stratified sample seeded by
   the ISO week, so anyone can redraw it. Drafts are three times as likely to be drawn, and claims
   judged in an earlier week are skipped. Each claim is then checked against an outside source and
   written to `data/judge/reports/<week>/verdicts.jsonl` with a verdict, the evidence, the source and a
   suggested fix.
3. **Forecast scoring** (`score_forecasts.py`): Brier score, skill against the base rate, and
   calibration, for the Order and Chaos lab's backtested forecasts once they exist.

4. **Sourcing** (`source_records.py`): every record that still cites only "not yet checked" is searched on
   English Wikipedia; Claude judges the claim against the excerpts only (never its own memory as the source).
   Supported records get the article as their source; a plain wrong year is corrected; anything else stays a
   draft with a `judge_note`. Population series are compared with the Reba et al. (2016) points instead.
   `check_sample.py` does the same for the weekly sample, so the weekly run needs no hand checking.
5. **Benchmark** (`bench/`): 40 questions across every lens and region (`data/judge/bench/questions.jsonl`, written
   by `build_questions.py`), each with a rubric: points a strong answer makes, myths it must not repeat, and the
   scholars it should weigh. `bench/run.mjs` opens the real built Atlas in headless Chromium and asks the live
   panel each question, with the page's `sample` capability swapped for the local `claude` CLI, so the chair,
   specialists and closing run exactly the prompts a reader's question runs. `bench/grade.mjs` scores each answer
   out of 100: content 40 (rubric points), accuracy 20 (errors and myths), why 15 (causal chain, competing views,
   honesty, premise), map 15 (stops inside the question's years and region, each marking something), sources 10.
   `bench/history.py` collects every run into `data/judge/bench/history.json`, the score over time, so a prompt or
   data change can be judged by whether the score moved.
6. **Stub adoption** (`adopt_stubs.py`): stubs no owner ever replaced become full records in
   `data/<owner>/adopted.jsonl`, so nothing in the kernel is ownerless.

Confidence: `tools/conf.py` gives every record a `conf` class (attested, estimated, approximate, unknown) from
per-workstream rules; `tools/build.py` writes it into `dist/kernel.json`. A record's own `conf` wins.

## Weekly run

```sh
sh ingest/judge/weekly.sh            # this ISO week; or: sh ingest/judge/weekly.sh 2026-W44
```

It builds the kernel, audits it, draws and checks the week's sample, sources unchecked records, then builds the
Atlas page and runs and grades the benchmark. It needs the `claude` CLI signed in, Playwright and access to
en.wikipedia.org. A full benchmark is about 280 Claude calls (40 questions, a chair, 3-4 specialists, a closing
and a grader each), so it uses the same plan limits as everything else: if the limit is hit, each step stops,
keeps what it finished, and resumes when rerun.

Report page: https://claude.ai/artifact/8SCQjw3P1WjdtrN4FxSthN

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `supported` | A source says the same thing, within the claim's own stated precision. |
| `partly` | Close, but a date, a number or the wording is off in a way a reader would care about. |
| `contradicted` | A source says something else. |
| `unverified` | No source found either way. Not counted in the share right, but counted as a sourcing gap. |

Share right = supported / (claims checked − unverified).

## Where things live

Reports sit in `data/judge/reports/<week>/`, one folder down, so `tools/build.py` (which reads
`data/*/*.jsonl`) does not take them for kernel records. The judge writes no kernel records and
never edits another workstream's folder: fixes go back to the owner as a suggestion.

## Licences

Verdicts quote a sentence or two from each source with a link (Wikipedia text is CC BY-SA 4.0).
No dataset is bulk-ingested here.

## Forecast format (proposed, for the Order and Chaos lab)

One JSON object per line: `{"id", "question", "made", "p", "outcome": true|false|null, "model"}`.
`made` is the year the forecast is made "as of" in a backtest; `p` is the probability that the
question resolves yes.
