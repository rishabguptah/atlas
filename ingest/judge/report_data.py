#!/usr/bin/env python3
"""Turn a week's judge output into the four tables the accuracy report page reads.

Usage: python3 ingest/judge/report_data.py 2026-W43
Reads data/judge/reports/<week>/verdicts.jsonl and audit.json (and every earlier week for the trend),
writes data/judge/reports/<week>/dash/{verdicts,weeks,sourcing,audit}.json.
"""
import json, sys, os, glob

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../data/judge/reports")
VERDICTS = ["supported", "partly", "contradicted", "unverified"]


def load(week):
    return [json.loads(l) for l in open(os.path.join(ROOT, week, "verdicts.jsonl")) if l.strip()]


def main():
    week = sys.argv[1]
    out = os.path.join(ROOT, week, "dash")
    os.makedirs(out, exist_ok=True)
    rows = [{"claim": v["claim"], "type": v["type"], "ref": v["ref"], "text": v["text"], "verdict": v["verdict"],
             "evidence": v["evidence"], "source": v["sources"][0]["cite"], "url": v["sources"][0].get("url", ""),
             "fix": v.get("fix", "")} for v in load(week)]
    weeks = []
    for d in sorted(glob.glob(os.path.join(ROOT, "*", "verdicts.jsonl"))):
        w = os.path.basename(os.path.dirname(d))
        vs = load(w)
        row = {"week": w, "checked": len(vs)}
        row.update({k: sum(v["verdict"] == k for v in vs) for k in VERDICTS})
        judged = row["checked"] - row["unverified"]
        row["accuracy"] = round(row["supported"] / judged, 4) if judged else None
        weeks.append(row)
    audit = json.load(open(os.path.join(ROOT, week, "audit.json")))
    sourcing = [{"kind": k, **v} for k, v in sorted(audit["sourcing"]["by_kind"].items())]
    findings = audit["findings"]
    for name, data in [("verdicts", rows), ("weeks", weeks), ("sourcing", sourcing), ("audit", findings)]:
        json.dump(data, open(os.path.join(out, name + ".json"), "w"), ensure_ascii=False, indent=1)
    print(out, len(rows), "claims;", len(findings), "audit findings")


main()
