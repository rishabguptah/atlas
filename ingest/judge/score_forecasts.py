#!/usr/bin/env python3
"""Score forecasts once their outcomes are known (for the Order and Chaos lab's backtests).

Usage: python3 ingest/judge/score_forecasts.py FILE.jsonl [...]
Each line: {"id": "...", "question": "...", "made": 1900, "p": 0.7, "outcome": true|false|null, "model": "..."}
Lines with outcome null are still open and are only counted. Reports, per model:
  Brier score (0 is perfect, 0.25 is always saying 50%), the same for a base-rate guess,
  skill = 1 - Brier / base-rate Brier (above 0 beats the base rate), and calibration in five bins.
"""
import json, sys
from collections import defaultdict


def score(rows):
    done = [r for r in rows if r.get("outcome") is not None]
    if not done:
        return {"n": 0, "open": len(rows)}
    ys = [1.0 if r["outcome"] else 0.0 for r in done]
    base = sum(ys) / len(ys)
    brier = sum((r["p"] - y) ** 2 for r, y in zip(done, ys)) / len(done)
    base_brier = sum((base - y) ** 2 for y in ys) / len(ys)
    bins = defaultdict(lambda: [0, 0.0, 0.0])
    for r, y in zip(done, ys):
        b = min(int(r["p"] * 5), 4)
        bins[b][0] += 1
        bins[b][1] += r["p"]
        bins[b][2] += y
    cal = [{"bin": f"{b * 20}-{b * 20 + 20}%", "n": n, "said": round(sp / n, 2), "happened": round(sy / n, 2)}
           for b, (n, sp, sy) in sorted(bins.items())]
    return {"n": len(done), "open": len(rows) - len(done), "brier": round(brier, 4), "base_rate": round(base, 3),
            "base_brier": round(base_brier, 4), "skill": round(1 - brier / base_brier, 3) if base_brier else None,
            "calibration": cal}


def main():
    rows = [json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
    by_model = defaultdict(list)
    for r in rows:
        if not 0 <= r.get("p", -1) <= 1:
            sys.exit(f"forecast {r.get('id')} has p={r.get('p')!r}, not a probability")
        by_model[r.get("model", "unnamed")].append(r)
    print(json.dumps({m: score(rs) for m, rs in by_model.items()}, indent=1))


if __name__ == "__main__":
    main()
