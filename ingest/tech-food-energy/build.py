#!/usr/bin/env python3
"""Build data/tech-food-energy/*.jsonl from the curated tables and three open datasets.

Usage: sh ingest/tech-food-energy/fetch.sh && python3 ingest/tech-food-energy/build.py
Raw files (raw/tech-food-energy/, ignored by git):
  subst.csv  Our World in Data, global primary energy by source (Smil 2017 before 1965, Energy Institute after)
  chat.xls   Comin & Hobijn, Historical Cross-Country Technology Adoption dataset (NBER, 2003)
  wheat.csv  Our World in Data, wheat yields (Broadberry et al. 2015 for England since 1270s; FAO since 1961)
Needs xlrd for the .xls (pip install xlrd). A missing raw file skips its outputs and keeps the old JSONL.
"""
import csv, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.path.join(ROOT, 'raw', 'tech-food-energy')
OUT = os.path.join(ROOT, 'data', 'tech-food-energy')
sys.path.insert(0, HERE)
import curated as C

slug = lambda s: re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
DRAFT = 'draft'  # curated from cited works by a model: the judge should check before promoting to sourced
OWID_ENERGY = {"cite": "Our World in Data (2026), Global primary energy by source, from Smil, V. (2017) Energy Transitions (before 1965) and Energy Institute, Statistical Review of World Energy (2026).",
               "url": "https://ourworldindata.org/grapher/global-energy-substitution"}
OWID_WHEAT = {"cite": "Our World in Data (2025), Wheat yields, from Broadberry et al. (2015) British Economic Growth 1270-1870 (England before 1850), Brassley (2000), and FAO (1961 on).",
              "url": "https://ourworldindata.org/grapher/wheat-yields"}
HCCTA = {"cite": "Comin, D. & Hobijn, B. (2004). Cross-country technology adoption: making the theories face the facts. Journal of Monetary Economics 51, 39-83. HCCTA dataset v1 (2003), from Mitchell, International Historical Statistics.",
         "url": "https://www.nber.org/research/data/historical-cross-country-technology-adoption-hccta-dataset"}


def write(name, rows):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{name}: {len(rows)}')


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


# Kernel places that already exist: reuse the id only when it is the same spot.
known = {}
for path in [os.path.join(ROOT, 'data', d, f) for d in os.listdir(os.path.join(ROOT, 'data')) if d != 'tech-food-energy'
             for f in (os.listdir(os.path.join(ROOT, 'data', d)) if os.path.isdir(os.path.join(ROOT, 'data', d)) else []) if f.endswith('.jsonl')]:
    for line in open(path, encoding='utf-8'):
        if '"place:' not in line[:40]:
            continue
        r = json.loads(line)
        if r.get('kind') == 'place' and r.get('lat') is not None:
            known.setdefault(r['id'], (r['lat'], r['lon']))

used, places = set(), []


def place_id(key):
    name, lat, lon = C.PLACES[key]
    pid = 'place:' + key
    if pid in known and km(known[pid], (lat, lon)) > 60:
        pid = 'place:tfe_' + key  # same slug, different spot: keep our own id
    if pid not in used:
        used.add(pid)
        places.append({"id": pid, "kind": "place", "name": name, "stub": True, "lat": lat, "lon": lon,
                       "lenses": ["geography"], "sources": [{"cite": "Atlas tech-food-energy workstream (coordinates for a diffusion step)"}], "status": DRAFT})
    return pid


ideas, rels, news, measures = [], [], [], []
CAT_TAG = {"tech": "technology", "war": "technology", "comms": "communication", "energy": "energy", "food": "food"}


def add_steps(rid, rec, cat):
    for i, (key, year, approx, note) in enumerate(rec['steps']):
        r = {"id": f"rel:{rid.split(':', 1)[1]}_to_{key}_{abs(year)}{'bc' if year < 0 else ''}", "kind": "relation", "type": "spread_to",
             "from": rid, "to": place_id(key), "start": year, "note": note, "step": i,
             "lenses": rec['lenses'], "sources": rec['sources'], "status": DRAFT, "tags": [CAT_TAG[cat]]}
        if approx:
            r['start_approx'] = True
        rels.append(r)


for t in C.TECH:
    rid = 'idea:tech_' + t['slug']
    first = min(s[1] for s in t['steps'])
    ideas.append({"id": rid, "kind": "idea", "subtype": "technology", "name": t['name'], "start": first, "start_approx": True,
                  "place": place_id(min(t['steps'], key=lambda s: s[1])[0]), "what": t['what'], "why": t['why'], "category": t['cat'],
                  "lenses": t['lenses'], "tags": [CAT_TAG[t['cat']]], "wikidata": t.get('wikidata'), "sources": t['sources'], "status": DRAFT})
    add_steps(rid, t, t['cat'])
for c in C.CROPS:
    rid = 'idea:crop_' + c['slug']
    c['lenses'] = ["economy", "population", "geography"]
    first = c['steps'][0]
    ideas.append({"id": rid, "kind": "idea", "subtype": "technology", "name": c['name'], "start": first[1], "start_approx": True,
                  "place": place_id(first[0]), "what": c['what'], "why": c['why'], "category": "food",
                  "lenses": c['lenses'], "tags": ["food", "crop", "domestication"], "wikidata": c.get('wikidata'), "sources": c['sources'], "status": DRAFT})
    add_steps(rid, c, 'food')

ideas.append({"id": "event:columbian_exchange", "kind": "event", "subtype": "exchange", "name": "Columbian Exchange", "start": 1492, "end": 1800, "end_approx": True,
              "lat": 20.0, "lon": -40.0, "what": "The transfer of crops, animals, people and diseases between the Americas and the rest of the world after 1492.",
              "why": "Maize, potatoes and cassava fed Old World population growth; wheat, sugar, horses and cattle remade the Americas; Old World diseases killed most Native Americans.",
              "links": ["idea:crop_maize", "idea:crop_potato", "idea:crop_cassava", "idea:crop_sugarcane", "idea:crop_coffee", "idea:tech_horse_riding", "event:smallpox_aztec"],
              "lenses": ["economy", "population", "disease"], "tags": ["food"],
              "sources": [{"cite": "Crosby, A. W. (1972). The Columbian Exchange. Greenwood."},
                          {"cite": "Nunn, N. & Qian, N. (2010). The Columbian Exchange: a history of disease, food, and ideas. Journal of Economic Perspectives 24, 163-188.", "url": "https://doi.org/10.1257/jep.24.2.163"}],
              "status": DRAFT})
for step in ("maize", "potato", "cassava", "sugarcane", "coffee"):
    rels.append({"id": f"rel:columbian_exchange_{step}", "kind": "relation", "type": "part_of", "from": f"idea:crop_{step}", "to": "event:columbian_exchange",
                 "lenses": ["economy", "population"], "sources": ideas[-1]['sources'], "status": DRAFT})

for _, typ, a, b, conf, view, note, src in C.LINKS:
    r = {"id": f"rel:{a.split(':', 1)[1]}_{typ}_{b.split(':', 1)[1]}", "kind": "relation", "type": typ, "from": a, "to": b, "note": note,
         "lenses": ["ideas", "economy"], "sources": src, "status": DRAFT}
    if conf is not None:
        r['confidence'] = conf
    if view:
        r['view'] = view
    rels.append(r)

for n in C.NEWS:
    o, d = C.PLACES[n['origin']], C.PLACES[n['to']]
    r = {"id": "event:news_" + n['slug'], "kind": "event", "subtype": "news", "name": n['name'], "start": n['year'],
         "place": place_id(n['to']), "origin": place_id(n['origin']), "lat": d[1], "lon": d[2], "days": n['days'],
         "km": round(km((o[1], o[2]), (d[1], d[2]))), "what": n['what'], "lenses": ["ideas", "economy"], "tags": ["communication"],
         "sources": n['sources'], "status": DRAFT}
    if n.get('low') is not None:
        r['days_range'] = [n['low'], n['high']]
    if n.get('approx'):
        r['start_approx'] = True
    if n.get('links'):
        r['links'] = n['links']
    news.append(r)
rs = C.RELAY_SPEED
news.append({"id": "m:message_relay_speed:world:curated", "kind": "measure", "of": "place:world", "metric": "message_relay_speed", "unit": "km/day",
             "points": rs['points'], "notes": {str(k): v for k, v in rs['notes'].items()}, "lenses": ["ideas", "economy"], "tags": ["communication"],
             "sources": rs['sources'], "status": DRAFT})
news.append({"id": "m:news_days:calcutta_london:kaukiainen", "kind": "measure", "of": "place:kolkata", "metric": "news_days", "unit": "days",
             "to": "place:london", "points": [[1820, 154], [1860, 39]], "lenses": ["ideas", "economy"], "tags": ["communication"],
             "sources": C.NEWS[6]['sources'], "status": DRAFT})
place_id('kolkata'); place_id('london')

write('ideas.jsonl', ideas)
write('relations.jsonl', rels)
write('news.jsonl', news)

# ---- World energy mix, 1800-2025 ----
f = os.path.join(RAW, 'subst.csv')
if os.path.exists(f):
    cols = {"traditional_biomass_twh": "Traditional biomass (wood, crop waste, dung)", "coal_twh": "Coal", "oil_twh": "Oil", "gas_twh": "Natural gas",
            "hydro_twh": "Hydropower", "nuclear_twh": "Nuclear", "wind_twh": "Wind", "solar_twh": "Solar", "biofuels_twh": "Modern biofuels",
            "other_renewables_twh": "Other renewables"}
    rows = [r for r in csv.DictReader(open(f)) if r['entity'] == 'World']
    out = []
    for c, label in cols.items():
        pts = [[int(r['year']), round(float(r[c]), 1)] for r in rows if r[c] not in ('', None)]
        src = c.replace('_twh', '')
        out.append({"id": f"m:primary_energy_{src}:world:owid", "kind": "measure", "of": "place:world", "metric": f"primary_energy_{src}", "unit": "TWh",
                    "name_hint": label, "points": pts, "lenses": ["economy"], "tags": ["energy"], "sources": [OWID_ENERGY], "status": "sourced"})
    write('energy.jsonl', out)

# ---- Wheat yields ----
f = os.path.join(RAW, 'wheat.csv')
if os.path.exists(f):
    keep = {'World', 'China', 'India', 'United States', 'Mexico', 'Pakistan', 'Egypt', 'Argentina', 'Australia', 'Canada', 'Japan', 'Turkey', 'Iran', 'Ukraine'}
    series = {}
    for r in csv.DictReader(open(f)):
        series.setdefault(r['entity'], []).append([int(r['year']), round(float(r['wheat_yield']), 3)])
    out = []
    for ent, pts in sorted(series.items()):
        if ent not in keep and min(p[0] for p in pts) >= 1961:
            continue
        of = 'place:world' if ent == 'World' else 'place:country_' + slug(ent)
        out.append({"id": f"m:wheat_yield:{of.split(':', 1)[1]}:owid", "kind": "measure", "of": of, "metric": "wheat_yield", "unit": "t/ha",
                    "points": sorted(pts), "lenses": ["economy"], "tags": ["food"], "sources": [OWID_WHEAT], "status": "sourced"})
        if of not in known and of != 'place:world':
            places.append({"id": of, "kind": "place", "subtype": "region", "name": ent, "stub": True, "today": ent,
                           "lenses": ["economy"], "sources": [OWID_WHEAT], "status": "sourced"})
            known[of] = None
    write('yields.jsonl', out)

# ---- Technology adoption by country (HCCTA) ----
CAPITALS = {"Australia": (-35.28, 149.13), "Austria": (48.21, 16.37), "Belgium": (50.85, 4.35), "Canada": (45.42, -75.70), "Denmark": (55.68, 12.57),
            "Finland": (60.17, 24.94), "France": (48.86, 2.35), "Germany": (52.52, 13.40), "Greece": (37.98, 23.73), "Iceland": (64.15, -21.94),
            "Ireland": (53.35, -6.26), "Italy": (41.90, 12.50), "Japan": (35.68, 139.69), "Luxembourg": (49.61, 6.13), "Netherlands": (52.37, 4.90),
            "New Zealand": (-41.29, 174.78), "Norway": (59.91, 10.75), "Portugal": (38.72, -9.14), "Spain": (40.42, -3.70), "Sweden": (59.33, 18.07),
            "Switzerland": (46.95, 7.45), "United Kingdom": (51.51, -0.13), "United States": (38.90, -77.04)}
HV = {"Length of Railway line open": ("railway_km", "km"), "Telegraph": ("telegrams", "thousand telegrams"), "Phones": ("telephones", "thousand lines"),
      "Private Cars": ("private_cars", "thousand cars"), "Tonnage-Steamships": ("steamship_tonnage", "registered tons"),
      "Tonnage-Sailships": ("sailship_tonnage", "registered tons"), "Energy output": ("electricity_output", "10 MWh")}
f = os.path.join(RAW, 'chat.xls')
if os.path.exists(f):
    import xlrd
    sh = xlrd.open_workbook(f).sheet_by_name('HCCTADRawData')
    head = sh.row_values(0)
    data = {}
    for i in range(1, sh.nrows):
        row = sh.row_values(i)
        if row[0] not in HV:
            continue
        for j, ctry in enumerate(head[2:], 2):
            v = row[j]
            if v not in ('', None):
                data.setdefault((row[0], ctry), []).append([int(row[1]), round(float(v), 1)])
    out = []
    for (var, ctry), pts in sorted(data.items()):
        metric, unit = HV[var]
        of = 'place:country_' + slug(ctry)
        out.append({"id": f"m:{metric}:{of.split(':', 1)[1]}:hccta", "kind": "measure", "of": of, "metric": metric, "unit": unit,
                    "points": sorted(pts), "lenses": ["economy", "ideas"], "tags": ["technology"], "sources": [HCCTA], "status": "sourced"})
        if of not in known:
            places.append({"id": of, "kind": "place", "subtype": "region", "name": ctry, "stub": True, "today": ctry,
                           "lenses": ["economy"], "sources": [HCCTA], "status": "sourced"})
            known[of] = None
    write('adoption.jsonl', out)
    # The first year with railway track open becomes a diffusion step, unless a curated step covers that country or
    # the series starts with a long network already built (then it marks where the data begins, not the first line).
    # Car series start when statistics start, not when cars arrived, so they stay measures only.
    covered = {'tech_railway': {'United Kingdom', 'Japan'}}
    for tslug, var in (('tech_railway', "Length of Railway line open"),):
        rec = next(t for t in C.TECH if 'tech_' + t['slug'] == tslug)
        for ctry in CAPITALS:
            pts = [p for p in data.get((var, ctry), []) if p[1] > 0]
            if not pts or ctry in covered[tslug] or pts[0][1] > 150:
                continue
            y = pts[0][0]
            of = 'place:country_' + slug(ctry)
            what = 'km of railway open'
            rels.append({"id": f"rel:{tslug}_to_country_{slug(ctry)}_{y}", "kind": "relation", "type": "spread_to", "from": 'idea:' + tslug, "to": of,
                         "start": y, "note": f"First year with a figure in HCCTA: {pts[0][1]:g} {what} in {ctry}.", "at": list(CAPITALS[ctry]),
                         "lenses": rec['lenses'], "sources": [HCCTA], "status": "sourced", "tags": ["energy"]})
    write('relations.jsonl', rels)

write('places.jsonl', places)
