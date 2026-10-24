"""Order and Chaos lab: territorial stability signals and a backtested fragility forecast.

Input:  raw/order-chaos/cliopatria_polities_only_v021.geojson (Seshat Cliopatria v0.2.1, CC BY 4.0)
Output: data/order-chaos/polities.jsonl   polity stubs (states-war owns polity records)
        data/order-chaos/area.jsonl       m:area measures per polity
        data/order-chaos/fragility.jsonl  m:fragility measures (out-of-sample risk of breaking within 50 years)
        data/order-chaos/endings.jsonl    event:collapse records, each classed as withered or snapped
        data/order-chaos/backtest.json    hit rates, AUC, calibration
        data/order-chaos/lab.json         compact bundle for the lab page

Question: does a state's territorial record (size, distance from its peak, recent shrinkage, age)
say anything about whether it will break in the next 50 years? Every score is out of sample:
polities are split into two halves by a hash of their name, and each half is scored by a model
fit only on the other half. A second test fits on years before 1500 and scores 1500 onward.
"""
import hashlib, json, math, re, sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw/order-chaos/cliopatria_polities_only_v021.geojson"
OUT = ROOT / "data/order-chaos"
H = 50          # forecast horizon, years
STEP = 10       # sample every STEP years
LAST = 2024     # Cliopatria's last year
MIN_PEAK = 50_000   # km2: ignore tiny polities
MIN_LIFE = 50       # years
SRC = [{"cite": "Seshat Global History Databank, Cliopatria v0.2.1 (Bennett et al. 2025, Scientific Data 12:247), CC BY 4.0",
        "url": "https://github.com/Seshat-Global-History-Databank/cliopatria"}]
FEATURES = ["log_area", "share_of_peak", "change_25y", "change_100y", "log_age", "era"]


# Polity ids must match states-war's (ingest/states-war/cliopatria.py), which owns polity records:
# Living Atlas ids first, then its slug rule, "(X)" names get _group, clashes get _2, _3...
LIVING_ATLAS = {
    'akkad': 'Akkadian Empire', 'egypt_nk': 'New Kingdom of Egypt', 'hittite': 'Hittites',
    'assyria': 'Neo-Assyrian Empire', 'babylonia': 'Neo-Babylonian Empire', 'zhou': 'Zhou Dynasty',
    'achaemenid': 'Achaemenid Empire', 'carthage_e': 'Carthage', 'macedon': 'Macedonian Empire',
    'maurya': 'Maurya Empire', 'seleucid': 'Seleucid Empire', 'ptolemaic': 'Ptolemaic Kingdom',
    'qin': 'Qin Dynasty', 'xiongnu': 'Xiongnu', 'han': 'Han Dynasty', 'roman_rep': 'Roman Republic',
    'roman': 'Roman Empire', 'parthian': 'Parthian Empire', 'kushan': 'Kushan Empire',
    'aksum_e': 'Kingdom of Axum', 'sasanian': 'Sasanian Empire', 'gupta': 'Gupta Empire',
    'hunnic': 'Hunnic Empire', 'byzantine': 'Byzantine Empire', 'ghana_e': 'Ghana Empire',
    'sui': 'Sui Dynasty', 'tang': 'Tang Dynasty', 'tibetan': 'Tibetan Empire', 'umayyad': 'Umayyad Caliphate',
    'abbasid': 'Abbasid Caliphate', 'srivijaya': 'Srivijaya', 'carolingian': 'Carolingian Empire',
    'khmer': 'Khmer Empire', 'chola': 'Chola Empire', 'fatimid': 'Fatimid Caliphate', 'liao': 'Liao Dynasty',
    'hre': 'Holy Roman Empire', 'song': 'Northern Song', 'seljuk': 'Great Seljuk Empire',
    'almohad': 'Almohad Caliphate', 'delhi_s': '(Delhi Sultanate)', 'mongol': 'Mongol Empire',
    'mali': 'Mali Empire', 'mamluk': 'Mamluk Sultanate', 'ottoman': 'Ottoman Empire',
    'vijayanagara_e': 'Vijayanagara Empire', 'timurid': 'Timurid Empire', 'ming': 'Ming Dynasty',
    'aztec': 'Aztec Triple Alliance', 'inca': 'Inca Empire', 'songhai': 'Songhai Empire',
    'portuguese': 'Portuguese Empire', 'spanish': 'Spanish Empire', 'safavid': 'Safavid Dynasty',
    'mughal': 'Mughal Empire', 'british': '(British Empire)', 'plc': 'Polish-Lithuanian Commonwealth',
    'qing': 'Qing Dynasty', 'russian': 'Russian Empire', 'usa': 'United States of America',
    'japan_e': 'Empire of Japan', 'german_e': 'German Empire', 'habsburg': 'Habsburg Monarchy',
    'austria_h': 'Austria-Hungary', 'ussr': 'Union of Soviet Socialist Republics',
}


def slug(s):
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", s.lower().replace("ü", "u").replace("ö", "o")
                                     .replace("é", "e").replace("á", "a").replace("ç", "c"))).strip("_")


def polity_ids(names):
    ids, taken = {}, set()
    for lid, name in LIVING_ATLAS.items():
        ids[name] = "polity:" + lid
        taken.add(lid)
    for name in sorted(names):
        if name in ids:
            continue
        s = slug(name) + ("_group" if name.startswith("(") else "")
        base, n = s, 2
        while s in taken:
            s, n = f"{base}_{n}", n + 1
        taken.add(s)
        ids[name] = "polity:" + s
    return ids


def ring_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        c = x0 * y1 - x1 * y0
        a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    return cx / (3 * a), cy / (3 * a), abs(a) / 2


def centroid(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    best = max((ring_centroid(p[0]) for p in polys if p and len(p[0]) > 2), key=lambda c: c[2])
    return round(best[1], 2), round(best[0], 2)


def km_between(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def load():
    d = json.loads(RAW.read_text())
    pol = defaultdict(list)
    global ALL_NAMES
    ALL_NAMES = {f["properties"]["Name"] for f in d["features"]}
    for f in d["features"]:
        p = f["properties"]
        if p["Name"].startswith("(") or p.get("Type") != "POLITY":
            continue
        pol[p["Name"]].append({"from": p["FromYear"], "to": p["ToYear"], "area": p["Area"],
                               "geom": f["geometry"], "wd": p.get("Wikidata") or "",
                               "wiki": p.get("Wikipedia") or "", "seshat": p.get("SeshatID") or ""})
    out = {}
    for name, rows in pol.items():
        rows.sort(key=lambda r: r["from"])
        peak = max(rows, key=lambda r: r["area"])
        out[name] = {"name": name, "rows": rows, "start": rows[0]["from"], "end": rows[-1]["to"],
                     "peak_area": peak["area"], "peak_year": peak["from"],
                     "first_c": centroid(rows[0]["geom"]), "last_c": centroid(rows[-1]["geom"]),
                     "peak_c": centroid(peak["geom"]),
                     "wd": next((r["wd"] for r in rows if r["wd"]), ""),
                     "wiki": next((r["wiki"] for r in rows if r["wiki"]), ""),
                     "seshat": next((r["seshat"] for r in rows if r["seshat"]), "")}
    for p in out.values():
        for r in p["rows"]:
            del r["geom"]
    return out


def classify_endings(pols):
    """An ending is a 'handoff' (the same state continuing under a new name, reform or revolution)
    when a new polity starts within 2 years, its first centroid is within 800 km of the dying
    polity's last centroid, and it starts with 60% to 170% of the dying polity's last area.
    Otherwise it is a break (collapse, conquest or partition). Cliopatria cannot tell a revolution
    from a renaming, so revolutions that kept the territory (Russia 1917, Qing 1912) count as handoffs."""
    starts = defaultdict(list)
    for p in pols.values():
        starts[p["start"]].append(p)
    for p in pols.values():
        p["ended"] = p["end"] < LAST
        p["handoff_to"] = None
        p["broke"], p["end_share"], p["end_style"] = False, None, None
        if not p["ended"]:
            continue
        last_area = p["rows"][-1]["area"]
        for y in range(p["end"] - 1, p["end"] + 3):
            for q in starts.get(y, []):
                if q is p:
                    continue
                if km_between(p["last_c"], q["first_c"]) < 800 and 0.6 * last_area <= q["rows"][0]["area"] <= 1.7 * last_area:
                    p["handoff_to"] = q["name"]
        p["broke"] = p["ended"] and p["handoff_to"] is None
        share = last_area / p["peak_area"]
        p["end_share"] = share
        p["end_style"] = "withered" if share < 0.5 else "snapped"


def area_at(p, t):
    for r in p["rows"]:
        if r["from"] <= t <= r["to"]:
            return r["area"]
    return None


def samples(p):
    """Yield (t, features, label) every STEP years while the polity exists."""
    peak = 0.0
    t0 = p["start"] - p["start"] % STEP + STEP
    for t in range(t0, min(p["end"], LAST) + 1, STEP):
        a = area_at(p, t)
        if t == 0 or a is None or a <= 0:   # the kernel has no year 0
            continue
        peak = max(peak, max(r["area"] for r in p["rows"] if r["from"] <= t))
        a25 = area_at(p, max(p["start"], t - 25)) or a
        a100 = area_at(p, max(p["start"], t - 100)) or a
        x = [math.log10(a), a / peak, max(-3, min(3, math.log(a / a25))),
             max(-3, min(3, math.log(a / a100))), math.log1p(t - p["start"]), t / 1000]
        known = t + H <= LAST or (p["ended"] and p["end"] <= LAST)
        y = 1 if (p["broke"] and t < p["end"] <= t + H) else 0
        yield t, x, y, known


def fit_logit(X, y, l2=1.0, iters=400):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    w = np.zeros(Z.shape[1])
    for _ in range(iters):   # Newton steps
        p = 1 / (1 + np.exp(-Z @ w))
        g = Z.T @ (p - y) + l2 * np.r_[0, w[1:]]
        Hm = (Z * (p * (1 - p))[:, None]).T @ Z + l2 * np.diag(np.r_[0, np.ones(len(w) - 1)])
        step = np.linalg.solve(Hm, g)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return {"w": w, "mu": mu, "sd": sd}


def predict(m, X):
    Z = np.hstack([np.ones((len(X), 1)), (X - m["mu"]) / m["sd"]])
    return 1 / (1 + np.exp(-Z @ m["w"]))


def auc(y, s):
    order = np.argsort(s)
    ranks = np.empty(len(s)); ranks[order] = np.arange(1, len(s) + 1)
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else float("nan")


def scorecard(y, s, flag_share=0.2):
    thr = float(np.quantile(s, 1 - flag_share))
    flag = s >= thr
    base = float(y.mean())
    prec = float(y[flag].mean())
    bins = np.quantile(s, np.linspace(0, 1, 11))
    cal = []
    for lo, hi in zip(bins, bins[1:]):
        m = (s >= lo) & (s <= hi)
        if m.any():
            cal.append([round(float(s[m].mean()), 4), round(float(y[m].mean()), 4), int(m.sum())])
    return {"n": int(len(y)), "breaks": int(y.sum()), "base_rate": round(base, 4), "auc": round(auc(y, s), 3),
            "flag_share": flag_share, "threshold": round(thr, 4), "precision_when_flagged": round(prec, 4),
            "lift": round(prec / base, 2) if base else None,
            "recall": round(float(flag[y == 1].mean()), 3),
            "brier": round(float(((s - y) ** 2).mean()), 4),
            "brier_base": round(float(((base - y) ** 2).mean()), 4), "calibration": cal}


def main():
    pols = load()
    classify_endings(pols)
    keep = {n: p for n, p in pols.items()
            if p["peak_area"] >= MIN_PEAK and (min(p["end"], LAST) - p["start"]) >= MIN_LIFE}
    ids = polity_ids(ALL_NAMES)
    for p in keep.values():
        p["id"] = ids[p["name"]]
        p["fold"] = int(hashlib.md5(p["name"].encode()).hexdigest(), 16) % 2

    rows = []   # (polity, t, x, y, known)
    for p in keep.values():
        for t, x, y, known in samples(p):
            rows.append((p, t, x, y, known))
    X = np.array([r[2] for r in rows]); Y = np.array([r[3] for r in rows]); K = np.array([r[4] for r in rows])
    F = np.array([r[0]["fold"] for r in rows]); T = np.array([r[1] for r in rows])

    # 2-fold cross-fitting by polity: every score is out of sample
    score = np.zeros(len(rows)); base_score = np.zeros(len(rows))
    models = {}
    for k in (0, 1):
        tr = (F != k) & K
        models[k] = fit_logit(X[tr], Y[tr])
        score[F == k] = predict(models[k], X[F == k])
        mb = fit_logit(X[tr][:, [4, 5]], Y[tr])        # baseline: age and era only
        base_score[F == k] = predict(mb, X[F == k][:, [4, 5]])
    # time split: fit before 1500, test 1500 onward
    tr = (T < 1500) & K & (T + H < 1500)
    te = (T >= 1500) & K
    mt = fit_logit(X[tr], Y[tr])
    time_sc = scorecard(Y[te], predict(mt, X[te]))

    # early warning: for each polity that broke, was it flagged in the 10-40 years before?
    thr = float(np.quantile(score[K], 0.8))
    warn = []
    by_pol = defaultdict(list)
    for i, r in enumerate(rows):
        by_pol[r[0]["name"]].append(i)
    for p in keep.values():
        if not p["broke"]:
            continue
        idx = [i for i in by_pol[p["name"]] if p["end"] - 40 <= rows[i][1] < p["end"] - 5]
        if idx:
            warn.append({"name": p["name"], "end": p["end"], "max_risk": round(float(score[idx].max()), 3),
                         "flagged": bool(score[idx].max() >= thr), "style": p["end_style"]})
    ew_rate = sum(w["flagged"] for w in warn) / len(warn)
    styles = defaultdict(lambda: [0, 0])
    for w in warn:
        styles[w["style"]][0] += w["flagged"]; styles[w["style"]][1] += 1

    full = fit_logit(X[K], Y[K])
    backtest = {
        "question": f"Will this polity break (end without a handoff to a successor) within {H} years?",
        "unit": f"polity-years sampled every {STEP} years; {len(keep)} polities with peak area >= {MIN_PEAK} km2 and life >= {MIN_LIFE} years",
        "features": FEATURES,
        "coefficients_standardised": dict(zip(["intercept"] + FEATURES, [round(float(v), 3) for v in full["w"]])),
        "cross_fit": scorecard(Y[K], score[K]),
        "baseline_age_era": scorecard(Y[K], base_score[K]),
        "time_split_pre1500_to_post1500": time_sc,
        "early_warning": {"threshold": round(thr, 4), "breaks_checked": len(warn),
                          "flagged_5_to_40y_before": round(ew_rate, 3),
                          "by_style": {k: {"flagged": v[0], "of": v[1]} for k, v in styles.items()}},
        "caveats": [
            "Territory is only one signal. Turchin's structural-demographic variables (population pressure, elite overproduction, state finances) are not yet in open data the lab can reach.",
            "Cliopatria polygons are sampled at uneven time steps, so small changes can be missed.",
            "A handoff (renaming, reform, or a revolution that kept the territory) is detected by a heuristic: a successor starting within 2 years, within 800 km, with 60% to 170% of the area. So Russia 1917 and Qing 1912 count as handoffs, not breaks.",
            "Many short-lived polities are absent, so base rates are for the big, well-recorded states.",
        ],
        "sources": SRC,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    pol_lines, area_lines, frag_lines, end_lines, lab = [], [], [], [], []
    for p in sorted(keep.values(), key=lambda p: p["start"]):
        rec = {"id": p["id"], "kind": "polity", "name": p["name"], "stub": True, "lenses": ["order"],
               "start": p["start"], "end": None if p["end"] >= LAST else p["end"],
               "lat": p["peak_c"][0], "lon": p["peak_c"][1],
               "peak": [p["peak_year"], round(p["peak_area"] / 1e6, 3)], "sources": SRC, "status": "sourced"}
        if p["wd"]: rec["wikidata"] = p["wd"]
        if p["seshat"]: rec["ext"] = {"seshat": p["seshat"]}
        pol_lines.append(rec)
        pts = []
        for r in p["rows"]:
            for y in ([r["from"], r["to"]] if r["to"] != r["from"] else [r["from"]]):
                y = y or 1   # Cliopatria counts a year 0; the kernel does not
                if not pts or y > pts[-1][0]:
                    pts.append([y, round(r["area"] / 1e6, 4)])
        area_lines.append({"id": "m:area:" + p["id"][7:] + ":cliopatria", "kind": "measure", "of": p["id"], "metric": "area",
                           "unit": "million_km2", "points": pts, "lenses": ["order", "geography"],
                           "sources": SRC, "status": "sourced"})
        idx = by_pol[p["name"]]
        fpts = [[rows[i][1], round(float(score[i]), 4)] for i in idx]
        if fpts:
            frag_lines.append({"id": "m:fragility:" + p["id"][7:] + ":atlas_lab", "kind": "measure", "of": p["id"],
                               "metric": "fragility", "unit": f"probability_break_within_{H}y",
                               "points": fpts, "lenses": ["order"],
                               "sources": SRC + [{"cite": "Atlas Order and Chaos lab, ingest/order-chaos/fragility.py (out-of-sample logistic model)"}],
                               "status": "sourced",
                               "note": "Model output, not a historical fact. Scored by a model fit on the other half of polities."})
        if p["ended"]:
            end_lines.append({"id": "event:end_" + p["id"][7:], "kind": "event", "subtype": "collapse" if p["broke"] else "succession",
                              "name": ("End of " if p["broke"] else "Handoff of ") + p["name"], "start": p["end"], "end": p["end"],
                              "lat": p["last_c"][0], "lon": p["last_c"][1], "lenses": ["order"],
                              "tags": [p["end_style"]] if p["broke"] else ["handoff"],
                              "what": (f"Ended holding {p['end_share']:.0%} of its peak territory ({p['end_style']})." if p["broke"]
                                       else f"Handed off to {p['handoff_to']}."),
                              "sources": SRC, "status": "sourced"})
        lab.append({"id": p["id"], "n": p["name"], "s": p["start"], "e": p["end"], "pk": [p["peak_year"], round(p["peak_area"] / 1e6, 3)],
                    "c": p["peak_c"], "b": int(p["broke"]), "st": p["end_style"] if p["broke"] else ("handoff" if p["ended"] else "alive"),
                    "h": p["handoff_to"], "wd": p["wd"], "wiki": p["wiki"],
                    "a": [[pt[0], pt[1]] for pt in pts], "f": fpts})

    def dump(name, recs):
        (OUT / name).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))
    # states-war owns polity area series: skip any measure id another workstream already publishes
    taken = set()
    for path in (ROOT / "data").glob("*/*.jsonl"):
        if path.parent != OUT:
            taken |= {json.loads(l).get("id") for l in path.read_text(encoding="utf-8").splitlines() if l.strip()}
    dump("polities.jsonl", pol_lines); dump("area.jsonl", [m for m in area_lines if m["id"] not in taken])
    dump("fragility.jsonl", frag_lines); dump("endings.jsonl", end_lines)
    (OUT / "backtest.json").write_text(json.dumps({**backtest, "warnings": warn}, indent=1, ensure_ascii=False))
    (OUT / "lab.json").write_text(json.dumps({"backtest": backtest, "polities": lab}, ensure_ascii=False, separators=(",", ":")))
    cf = backtest["cross_fit"]
    print(f"{len(keep)} polities, {len(rows)} samples, {sum(p['broke'] for p in keep.values())} breaks, "
          f"{sum(1 for p in keep.values() if p['handoff_to'])} handoffs")
    print("cross-fit", {k: v for k, v in cf.items() if k != "calibration"})
    print("baseline", {k: v for k, v in backtest["baseline_age_era"].items() if k != "calibration"})
    print("time split", {k: v for k, v in time_sc.items() if k != "calibration"})
    print("early warning", backtest["early_warning"])
    print("coef", backtest["coefficients_standardised"])


if __name__ == "__main__":
    sys.exit(main())
