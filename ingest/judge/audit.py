#!/usr/bin/env python3
"""Outside judge: plausibility and sourcing audit of the built kernel.

tools/build.py checks that records have the right shape. This checks whether they make sense
together: a population before a city exists, a cause that comes after its effect, a peak outside
an empire's own dates, a source that is really "written by Claude, not yet checked".

Usage: python3 ingest/judge/audit.py [dist/kernel.json] [--json OUT] [--strict]
Exit code 1 on any error (impossible data), or on warnings too with --strict.
"""
import json, sys, argparse

NOW = 2026
UNCHECKED = ("not yet checked", "written by claude", "general knowledge")


class Audit:
    def __init__(self):
        self.findings = []

    def add(self, level, rule, rid, msg):
        self.findings.append({"level": level, "rule": rule, "id": rid, "msg": msg})

    def err(self, *a): self.add("error", *a)
    def warn(self, *a): self.add("warning", *a)


def yr(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def lifespan(x):
    """(start, end, start_is_rough) with end = NOW for things still standing."""
    s, e = yr(x.get("start")), x.get("end")
    e = NOW if e is None else yr(e)
    return s, e, bool(x.get("start_approx") or x.get("start_range"))


def audit(kernel):
    a = Audit()
    recs = [x for xs in kernel["records"].values() for x in xs]
    by_id = {x["id"]: x for x in recs}

    for x in recs:
        rid, kind = x["id"], x["kind"]
        s, e, rough = lifespan(x)

        if kind == "place":
            for l in x.get("links", []):
                if l not in by_id:
                    a.warn("link.dangling", rid, f"links to '{l}', which is not in the kernel")
            if x.get("end") is not None and not x.get("causes"):
                a.warn("place.no_cause", rid, f"ended in {x['end']} with no cause of decline")
            if x.get("lat") == 0 and x.get("lon") == 0:
                a.err("geo.null_island", rid, "lat/lon is 0,0, almost certainly a missing value")

        if kind == "polity":
            pk = x.get("peak")
            if pk and s is not None and e is not None and not (s <= pk[0] <= e):
                a.err("polity.peak_outside", rid, f"peak year {pk[0]} is outside its own dates {s} to {x.get('end')}")
            if pk and not (0 < pk[1] < 40):
                a.err("polity.peak_area", rid, f"peak area {pk[1]} million km² is impossible (the largest empire ever was about 35)")
            cap = by_id.get(x.get("capital"))
            if cap:
                cs, ce, _ = lifespan(cap)
                if cs is not None and e is not None and cs > e:
                    a.err("polity.capital_too_young", rid, f"capital {cap['name']} starts in {cs}, after the polity ended ({e})")
                if ce is not None and s is not None and ce < s:
                    a.warn("polity.capital_gone", rid, f"capital {cap['name']} ended in {ce}, before the polity began ({s})")

        if kind == "event":
            pl = by_id.get(x.get("place"))
            if pl and s is not None:
                ps, pe, prough = lifespan(pl)
                slack = 100 if prough else 0
                if ps is not None and s < ps - slack:
                    a.warn("event.before_place", rid, f"'{x['name']}' ({s}) is before {pl['name']} begins ({ps})")
                if x.get("destructive") and pe is not None and pl.get("end") is not None and s > pe + 100:
                    a.warn("event.after_place", rid, f"destructive event '{x['name']}' ({s}) long after {pl['name']} ended ({pe})")

        if kind == "measure":
            of = by_id.get(x.get("of"))
            pts = x.get("points") or []
            for p in pts:
                if p[1] is None or (x.get("metric") == "population" and p[1] <= 0):
                    a.err("measure.value", rid, f"value {p[1]!r} in {p[0]}")
                if len(p) == 4 and not (p[2] <= p[1] <= p[3]):
                    a.err("measure.range", rid, f"point {p} has its value outside [low, high]")
            if of and x.get("metric") == "population":
                os_, oe, orough = lifespan(of)
                for y, n, *_ in pts:
                    if os_ is not None and y < os_ - (100 if orough else 0):
                        a.warn("pop.before_place", rid, f"{n:,} people in {y}, before {of['name']} begins ({os_})")
                    if of.get("end") is not None and oe is not None and y > oe + 50:
                        a.warn("pop.after_place", rid, f"{n:,} people in {y}, after {of['name']} ended ({oe})")
                    if of["kind"] == "place" and n > 40_000_000:
                        a.warn("pop.implausible", rid, f"{n:,} people in one place in {y}")
                for (y1, n1, *_), (y2, n2, *_) in zip(pts, pts[1:]):
                    if y2 - y1 <= 10 and min(n1, n2) > 0 and max(n1, n2) / min(n1, n2) > 5:
                        a.warn("pop.jump", rid, f"{n1:,} to {n2:,} within {y2 - y1} years ({y1}-{y2})")

        if kind == "relation":
            f, t = by_id.get(x.get("from")), by_id.get(x.get("to"))
            if x.get("type") == "caused" and f and t and yr(f.get("start")) is not None and yr(t.get("start")) is not None \
                    and f["start"] > t["start"]:
                a.err("rel.cause_after_effect", rid, f"cause starts {f['start']}, after its effect ({t['start']})")

        if kind == "person":
            b, d = yr((x.get("born") or {}).get("year")), yr((x.get("died") or {}).get("year"))
            if b is not None and d is not None:
                if d < b:
                    a.err("person.died_before_born", rid, f"died {d}, born {b}")
                elif d - b > 115:
                    a.warn("person.lifespan", rid, f"lived {d - b} years")

    # Sourcing: how much of the kernel rests on a real, checkable source?
    src = {"records": len(recs), "draft": 0, "sourced": 0, "unchecked_cite": 0, "with_url": 0, "by_kind": {}}
    for x in recs:
        k = src["by_kind"].setdefault(x["kind"], {"records": 0, "draft": 0, "with_url": 0})
        k["records"] += 1
        cites = x.get("sources") or []
        if x.get("status") == "draft":
            src["draft"] += 1
            k["draft"] += 1
        else:
            src["sourced"] += 1
        if cites and all(any(u in c.get("cite", "").lower() for u in UNCHECKED) for c in cites):
            src["unchecked_cite"] += 1
        if any(c.get("url") for c in cites):
            src["with_url"] += 1
            k["with_url"] += 1
    return a, src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kernel", nargs="?", default="dist/kernel.json")
    ap.add_argument("--json")
    ap.add_argument("--strict", action="store_true")
    o = ap.parse_args()
    a, src = audit(json.load(open(o.kernel)))
    errs = [f for f in a.findings if f["level"] == "error"]
    warns = [f for f in a.findings if f["level"] == "warning"]
    print(f"judge audit: {src['records']} records, {len(errs)} errors, {len(warns)} warnings")
    print(f"sourcing: {src['draft']} draft, {src['sourced']} sourced, {src['with_url']} with a url, "
          f"{src['unchecked_cite']} cite only 'not yet checked'")
    rules = {}
    for f in a.findings:
        rules[(f["level"], f["rule"])] = rules.get((f["level"], f["rule"]), 0) + 1
    for (lvl, rule), n in sorted(rules.items()):
        print(f"  {lvl:7} {rule:26} {n}")
    for f in errs + warns[:40]:
        print(f"  {f['level'].upper():7} {f['id']}: {f['msg']}")
    if o.json:
        json.dump({"sourcing": src, "findings": a.findings}, open(o.json, "w"), indent=1, ensure_ascii=False)
    sys.exit(1 if errs or (o.strict and warns) else 0)


if __name__ == "__main__":
    main()
