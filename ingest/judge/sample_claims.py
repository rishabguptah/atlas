#!/usr/bin/env python3
"""Red-team sampler: break the kernel into single checkable claims and draw a reproducible sample.

Usage: python3 ingest/judge/sample_claims.py dist/kernel.json 2026-W44 > data/judge/reports/2026-W44/sample.jsonl
The week string seeds the draw, so anyone can redraw the same sample. The draw is stratified by claim
type (dates, events, populations, polity facts), favours draft records, and skips claims already
judged in earlier weeks (any data/judge/reports/*/verdicts.jsonl).
"""
import json, sys, random, hashlib, glob, os

QUOTA = {"start": 5, "end": 4, "text": 5, "event": 7, "population": 5, "polity_dates": 2, "polity_peak": 2}


def yr(y):
    return f"{-y} BCE" if y < 0 else f"{y} CE"


def claims(kernel):
    R = kernel["records"]
    names = {x["id"]: x.get("name", x["id"]) for xs in R.values() for x in xs}
    for p in R.get("place", []):
        rough = " (approx.)" if p.get("start_approx") else ""
        if p.get("start") is not None:
            yield "start", p, f"{p['name']} ({p.get('today', '')}) was founded or first settled around {yr(p['start'])}{rough}."
        if p.get("end") is not None:
            yield "end", p, f"{p['name']} ended or was abandoned around {yr(p['end'])}."
        if p.get("what") or p.get("why"):
            yield "text", p, f"{p['name']}: {p.get('what', '')} {p.get('why', '')}".strip()
    for ev in R.get("event", []):
        yield "event", ev, f"{names.get(ev.get('place'), '?')}, {yr(ev['start'])}: {ev['name']}."
    for m in R.get("measure", []):
        if m.get("metric") == "population":
            for pt in m["points"]:
                if pt[0] < 1950:
                    yield "population", dict(m, _point=pt[0]), f"{names.get(m['of'], m['of'])} had about {pt[1]:,} people in {yr(pt[0])}."
    for p in R.get("polity", []):
        end = yr(p["end"]) if p.get("end") is not None else "today"
        yield "polity_dates", p, f"{p['name']} lasted from {yr(p['start'])} to {end}."
        if p.get("peak"):
            yield "polity_peak", p, f"{p['name']} peaked around {yr(p['peak'][0])} at about {p['peak'][1]} million km²."


def main():
    kernel = json.load(open(sys.argv[1]))
    week = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    done = set()
    for f in glob.glob(os.path.join(here, "../../data/judge/reports/*/verdicts.jsonl")):
        for line in open(f):
            v = json.loads(line)
            done.add((v["type"], v["ref"], v.get("point")))
    rng = random.Random(int(hashlib.sha256(week.encode()).hexdigest(), 16))
    pool = {}
    for t, rec, text in claims(kernel):
        key = (t, rec["id"], rec.get("_point"))
        if key in done:
            continue
        weight = 3 if rec.get("status") == "draft" else 1
        pool.setdefault(t, []).extend([(rec["id"], rec.get("_point"), text)] * weight)
    n = 0
    for t, q in QUOTA.items():
        picked, seen = [], set()
        cands = pool.get(t, [])
        rng.shuffle(cands)
        for c in cands:
            if c not in seen and len(picked) < q:
                seen.add(c)
                picked.append(c)
        for rid, pt, text in picked:
            n += 1
            row = {"claim": f"{week}-{n:02d}", "type": t, "ref": rid, "text": text}
            if pt is not None:
                row["point"] = pt
            print(json.dumps(row, ensure_ascii=False))
    print(f"pool: {sum(len(set(v)) for v in pool.values())} unjudged claims", file=sys.stderr)


main()
