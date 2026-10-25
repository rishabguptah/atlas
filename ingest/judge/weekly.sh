#!/bin/sh
# The judge's weekly run: audit, red-team sample checked against Wikipedia, sourcing pass, benchmark.
#   sh ingest/judge/weekly.sh [WEEK]        (WEEK defaults to this ISO week, e.g. 2026-W44)
# Needs the `claude` CLI signed in (it stands in for the reader's Claude), Playwright, and network access to
# en.wikipedia.org. Every step resumes where it stopped if the Claude usage limit cuts it short: rerun it.
set -e
cd "$(dirname "$0")/../.."
W=${1:-$(date +%G-W%V)}
D=data/judge/reports/$W
mkdir -p "$D"
python3 tools/build.py
python3 ingest/judge/audit.py --json "$D/audit.json" > /dev/null || true
[ -s "$D/sample.jsonl" ] || python3 ingest/judge/sample_claims.py dist/kernel.json "$W" > "$D/sample.jsonl"
[ -s "$D/verdicts.jsonl" ] || python3 ingest/judge/check_sample.py "$W"
python3 ingest/judge/report_data.py "$W"
# Records still citing only 'not yet checked': source them against Wikipedia (and Reba for populations).
python3 ingest/judge/source_records.py "$W" --apply
python3 tools/build.py
# Benchmark: the real page, the real panel, 40 questions, graded against rubrics.
OUT=${TMPDIR:-/tmp}/atlas-bench
mkdir -p "$OUT"
python3 views/atlas/build.py "$OUT/atlas.html" > /dev/null
R=data/judge/bench/runs/$(date +%F)
node ingest/judge/bench/run.mjs "$OUT/atlas.html" "$R" --jobs 3
node ingest/judge/bench/grade.mjs "$R" --jobs 3
python3 ingest/judge/bench/history.py
