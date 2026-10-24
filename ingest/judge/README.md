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

## Weekly run

```sh
python3 tools/build.py
W=$(date +%G-W%V)
mkdir -p data/judge/reports/$W
python3 ingest/judge/audit.py --json data/judge/reports/$W/audit.json
python3 ingest/judge/sample_claims.py dist/kernel.json $W > data/judge/reports/$W/sample.jsonl
# check each claim, write verdicts.jsonl (same fields as 2026-W43)
python3 ingest/judge/report_data.py $W        # tables for the accuracy report page
```

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
