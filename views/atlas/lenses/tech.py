# Technology, food & energy: data for the one-page Atlas, read straight from data/tech-food-energy/.
# Diffusion steps (one per place and year), news journeys, the world energy mix, English wheat yields
# and railway, car and phone counts for the 23 HCCTA countries.
import glob, json, os, re

CAPITALS = {"australia": (149.13, -35.28), "austria": (16.37, 48.21), "belgium": (4.35, 50.85), "canada": (-75.70, 45.42), "denmark": (12.57, 55.68),
            "finland": (24.94, 60.17), "france": (2.35, 48.86), "germany": (13.40, 52.52), "greece": (23.73, 37.98), "iceland": (-21.94, 64.15),
            "ireland": (-6.26, 53.35), "italy": (12.50, 41.90), "japan": (139.69, 35.68), "luxembourg": (6.13, 49.61), "netherlands": (4.90, 52.37),
            "new_zealand": (174.78, -41.29), "norway": (10.75, 59.91), "portugal": (-9.14, 38.72), "spain": (-3.70, 40.42), "sweden": (18.07, 59.33),
            "switzerland": (7.45, 46.95), "united_kingdom": (-0.13, 51.51), "united_states": (-77.04, 38.90)}
ENERGY = ["traditional_biomass", "coal", "oil", "gas", "hydro", "nuclear", "wind", "solar", "biofuels", "other_renewables"]


def build(repo):
    d = os.path.join(repo, 'data', 'tech-food-energy')
    rows = lambda f: [json.loads(l) for l in open(os.path.join(d, f), encoding='utf-8') if l.strip()] if os.path.exists(os.path.join(d, f)) else []
    places = {r['id']: r for r in rows('places.jsonl')}
    ideas = [r for r in rows('ideas.jsonl') if r['kind'] == 'idea']
    rels = rows('relations.jsonl')
    names = {r['id']: r['name'] for r in ideas}
    for f in ('ideas.jsonl', 'news.jsonl'):
        names.update({r['id']: r['name'] for r in rows(f) if r.get('name')})
    # Names for the other end of cause links (records owned by other workstreams).
    want = {r[k] for r in rels if r['type'] != 'spread_to' for k in ('from', 'to')} - set(names)
    for f in sorted(glob.glob(os.path.join(repo, 'data', '*', '*.jsonl'))):
        for line in open(f, encoding='utf-8'):
            m = re.match(r'\{"id": ?"([^"]+)"', line)
            if m and m.group(1) in want:
                r = json.loads(line)
                if r.get('name'):
                    names[r['id']] = r['name']
    src = []  # shared source list; records point at indexes
    def S(lst):
        out = []
        for s in lst or []:
            k = [s.get('cite'), s.get('url')]
            if k not in src:
                src.append(k)
            out.append(src.index(k))
        return out
    idx = {r['id']: i for i, r in enumerate(ideas)}
    items = [{"id": r['id'], "n": r['name'], "c": r.get('category', 'tech'), "w": r.get('what'), "y": r.get('why'), "s": S(r['sources']), "l": []} for r in ideas]
    steps = []
    for r in rels:
        if r['type'] == 'spread_to' and r['from'] in idx:
            p = places.get(r['to'], {})
            lon, lat = (r['at'][1], r['at'][0]) if r.get('at') else (p.get('lon'), p.get('lat'))
            if lon is None:
                continue
            steps.append([idx[r['from']], r['start'], round(lon, 2), round(lat, 2), p.get('name') or r['to'].split('_', 1)[-1].replace('_', ' ').title(),
                          1 if r.get('start_approx') else 0, r.get('note', ''), S(r['sources']) if r.get('at') else None])
        elif r['type'] in ('contributed_to', 'influenced', 'caused', 'prevented'):
            # Cause links, shown on both ends' cards: "Potato -> contributed to -> Great Irish Famine".
            for end, other in (('from', 'to'), ('to', 'from')):
                if r[end] in idx:
                    items[idx[r[end]]]['l'].append({"dir": end, "type": r['type'].replace('_', ' '), "other": names.get(r[other], r[other].split(':', 1)[1].replace('_', ' ')),
                                                    "note": r.get('note'), "conf": r.get('confidence'), "view": r.get('view'), "s": S(r['sources'])})
    steps.sort(key=lambda s: (s[0], s[1]))
    news = []
    for r in rows('news.jsonl'):
        if r['kind'] == 'event':
            o, t = places[r['origin']], places[r['place']]
            news.append({"n": r['name'], "y": r['start'], "d": r['days'], "dr": r.get('days_range'), "o": [o['lon'], o['lat'], o['name']], "t": [t['lon'], t['lat'], t['name']],
                         "km": r.get('km'), "w": r['what'], "s": S(r['sources'])})
        elif r['metric'] == 'message_relay_speed':
            relay = {"p": r['points'], "notes": r.get('notes', {}), "s": S(r['sources'])}
    en = {r['metric'].replace('primary_energy_', ''): dict(r['points']) for r in rows('energy.jsonl')}
    years = sorted({y for v in en.values() for y in v})
    energy = {"keys": ENERGY, "rows": [[y] + [round(en.get(k, {}).get(y, 0)) for k in ENERGY] for y in years],
              "s": S(rows('energy.jsonl')[0]['sources']) if en else []}
    wheat = next(([p[:2] for p in r['points']] for r in rows('yields.jsonl') if r['of'] == 'place:country_united_kingdom'), [])
    wheat_s = next((S(r['sources']) for r in rows('yields.jsonl')), [])
    countries = {}
    for r in rows('adoption.jsonl'):
        c = r['of'].split('_', 1)[1]
        if c in CAPITALS and r['metric'] in ('railway_km', 'private_cars', 'telephones'):
            cc = countries.setdefault(c, {"n": c.replace('_', ' ').title(), "at": CAPITALS[c]})
            pts = r['points']
            cc[r['metric']] = [p[:2] for p in pts[::5]] + ([pts[-1][:2]] if (len(pts) - 1) % 5 else [])  # every 5th year keeps it small
            cc['s'] = S(r['sources'])
    return {"items": items, "steps": steps, "news": news, "relay": relay if news else None, "energy": energy, "wheat": wheat, "wheat_s": wheat_s,
            "countries": list(countries.values()), "src": src}
