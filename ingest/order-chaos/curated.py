"""Hand-entered records for the Order and Chaos lab: secular cycles and big shocks.

These are model-written from the cited works, so every record is status "draft" until the judge
checks it against the source. Phase dates are rounded to the decade.
Output: data/order-chaos/secular-cycles.jsonl, data/order-chaos/shocks.jsonl
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "data/order-chaos"
SC = {"cite": "Turchin & Nefedov, Secular Cycles (Princeton UP, 2009)",
      "url": "https://press.princeton.edu/books/paperback/9780691136967/secular-cycles"}
WIKI = "https://en.wikipedia.org/wiki/"

# name, polity id, phases: (phase, start, end). Phases follow Turchin & Nefedov:
# expansion (population grows, elites few, state solvent), stagflation (land runs short, elites multiply),
# crisis (state breakdown, civil war), depression or intercycle (recovery is slow, elite conflict lingers).
CYCLES = [
    ("Plantagenet England", "polity:kingdom_of_england", [("expansion", 1150, 1260), ("stagflation", 1260, 1310), ("crisis", 1310, 1400), ("depression", 1400, 1485)]),
    ("Tudor-Stuart England", "polity:kingdom_of_england", [("expansion", 1485, 1580), ("stagflation", 1580, 1640), ("crisis", 1640, 1660), ("depression", 1660, 1730)]),
    ("Capetian France", "polity:kingdom_of_france", [("expansion", 1150, 1250), ("stagflation", 1250, 1315), ("crisis", 1315, 1360), ("depression", 1360, 1450)]),
    ("Valois France", "polity:kingdom_of_france", [("expansion", 1450, 1520), ("stagflation", 1520, 1560), ("crisis", 1560, 1600), ("depression", 1600, 1660)]),
    ("Roman Republic", "polity:roman_rep", [("expansion", -350, -180), ("stagflation", -180, -130), ("crisis", -130, -30)]),
    ("Roman Principate", "polity:roman", [("expansion", -30, 165), ("stagflation", 165, 235), ("crisis", 235, 285)]),
    ("Muscovy", "polity:grand_principality_of_moscow", [("expansion", 1460, 1530), ("stagflation", 1530, 1565), ("crisis", 1565, 1615)]),
    ("Romanov Russia", "polity:tsardom_of_russia", [("expansion", 1620, 1690), ("stagflation", 1690, 1725), ("crisis", 1725, 1762)]),
]

# Owned by disease-climate: these are stubs that merge into their records (theirs win).
OWNED_ELSEWHERE = {"antonine_plague", "plague_of_cyprian", "plague_of_justinian", "black_death",
                   "cocoliztli_1545", "late_antique_lia", "tambora"}

# id slug, name, subtype, start, end, lat, lon, lenses, deaths [low, high] or None, wiki page, what
SHOCKS = [
    ("antonine_plague", "Antonine Plague", "epidemic", 165, 180, 41.9, 12.5, ["disease", "order"], [5_000_000, 10_000_000], "Antonine_Plague", "Pandemic, possibly smallpox, across the Roman Empire."),
    ("plague_of_cyprian", "Plague of Cyprian", "epidemic", 249, 262, 36.8, 10.2, ["disease", "order"], None, "Plague_of_Cyprian", "Pandemic during Rome's Crisis of the Third Century."),
    ("late_antique_lia", "Late Antique Little Ice Age", "climate_shift", 536, 660, 50.0, 10.0, ["geography", "order"], None, "Late_Antique_Little_Ice_Age", "Volcanic winters from 536 cooled the northern hemisphere for over a century."),
    ("plague_of_justinian", "Plague of Justinian", "epidemic", 541, 549, 41.0, 28.98, ["disease", "order"], [15_000_000, 100_000_000], "Plague_of_Justinian", "First recorded bubonic plague pandemic, centred on Constantinople."),
    ("black_death", "Black Death", "epidemic", 1346, 1353, 45.0, 15.0, ["disease", "order", "population"], [25_000_000, 50_000_000], "Black_Death", "Bubonic plague killed perhaps a third to a half of Europe."),
    ("cocoliztli_1545", "Cocoliztli epidemic", "epidemic", 1545, 1548, 19.4, -99.1, ["disease", "order"], [5_000_000, 15_000_000], "Cocoliztli_epidemics", "Epidemic that devastated the population of New Spain."),
    ("huaynaputina_1600", "Huaynaputina eruption", "eruption", 1600, 1601, -16.6, -70.85, ["geography", "order"], None, "1600_Huaynaputina_eruption", "Largest eruption in recorded South American history, followed by famine in Russia."),
    ("general_crisis_17c", "General Crisis of the 17th century", "famine", 1618, 1680, 48.0, 15.0, ["geography", "order"], None, "General_Crisis", "Little Ice Age cold, wars and revolts across Eurasia."),
    ("tambora", "Tambora eruption", "eruption", 1815, 1816, -8.25, 118.0, ["geography", "order"], None, "1815_eruption_of_Mount_Tambora", "Caused the Year Without a Summer (1816)."),
    ("flu_1918", "1918 influenza pandemic", "epidemic", 1918, 1920, 39.0, -98.0, ["disease", "order"], [17_000_000, 50_000_000], "Spanish_flu", "Influenza pandemic at the end of the First World War."),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cyc = []
    for name, pol, phases in CYCLES:
        slug = name.lower().replace(" ", "_").replace("-", "_")
        cyc.append({"id": f"event:secular_cycle_{slug}", "kind": "event", "subtype": "secular_cycle", "name": f"Secular cycle: {name}",
                    "start": phases[0][1], "end": phases[-1][2], "lenses": ["order", "population", "economy"],
                    "phases": [{"phase": p, "start": a, "end": b} for p, a, b in phases],
                    "polity": pol, "sources": [SC], "status": "draft"})
    shocks = []
    for slug, name, sub, a, b, lat, lon, lenses, deaths, wiki, what in SHOCKS:
        r = {"id": f"event:{slug}", "kind": "event", "subtype": sub, "name": name, "start": a, "end": b,
             "lat": lat, "lon": lon, "lenses": lenses, "what": what,
             "sources": [{"cite": f"Wikipedia: {wiki.replace('_', ' ')}", "url": WIKI + wiki}], "status": "draft"}
        if deaths:
            r["deaths"] = deaths
        if slug in OWNED_ELSEWHERE:
            r["stub"] = True
        shocks.append(r)
    for fn, recs in (("secular-cycles.jsonl", cyc), ("shocks.jsonl", shocks)):
        (OUT / fn).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))
    print(len(cyc), "cycles,", len(shocks), "shocks")


if __name__ == "__main__":
    main()
