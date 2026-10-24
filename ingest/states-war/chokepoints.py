#!/usr/bin/env python3
"""Straits, passes and other chokepoints -> data/states-war/chokepoints.jsonl, plus who held each one.

Usage: python3 ingest/states-war/chokepoints.py   (run cliopatria.py first)

The places are hand-curated (status "draft", each citing its Wikipedia article). The "controls"
relations are computed: for every 25-year border snapshot, the polity whose polygon contains the
point, or else the nearest polygon within 60 km (a strait's point sits in the water between shores).
A member of a composite empire counts for the composite (British Raj -> British Empire).
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'states-war')
NEAR_KM = 60

STRAIT, PASS, CANAL, CAPE = 'chokepoint', 'pass', 'chokepoint', 'chokepoint'
SEA = ['geography', 'economy', 'military']
LAND = ['geography', 'military']
# slug, name, subtype, lat, lon, lenses, Wikipedia title, start (for canals), what, why
POINTS = [
    ('strait_of_gibraltar', 'Strait of Gibraltar', STRAIT, 35.97, -5.5, SEA, 'Strait_of_Gibraltar', None,
     'The 14 km gap between Europe and Africa that joins the Mediterranean to the Atlantic.',
     'Whoever holds it decides who enters the Mediterranean; Carthage, the Umayyads, Spain and Britain all fought for it.'),
    ('bosporus', 'Bosporus', STRAIT, 41.12, 29.07, SEA, 'Bosporus', None,
     'The narrow strait at Constantinople between the Black Sea and the Sea of Marmara.',
     'It made Constantinople rich and nearly impregnable for 1,500 years, and it is still Russia\'s only warm-water exit.'),
    ('dardanelles', 'Dardanelles', STRAIT, 40.2, 26.4, SEA, 'Dardanelles', None,
     'The Hellespont, joining the Sea of Marmara to the Aegean; Troy guarded its mouth.',
     'Xerxes bridged it, Athens\'s grain came through it, and the Allies failed to force it at Gallipoli in 1915.'),
    ('strait_of_hormuz', 'Strait of Hormuz', STRAIT, 26.57, 56.25, SEA, 'Strait_of_Hormuz', None,
     'The exit of the Persian Gulf, about 40 km wide at its narrowest.',
     'About a fifth of the world\'s oil passes through it; Hormuz island was a great medieval trade port.'),
    ('bab_el_mandeb', 'Bab-el-Mandeb', STRAIT, 12.58, 43.33, SEA, 'Bab-el-Mandeb', None,
     'The "Gate of Grief" between Arabia and the Horn of Africa, joining the Red Sea to the Indian Ocean.',
     'The southern door of the Red Sea route from India to Egypt and, since 1869, to the Suez Canal.'),
    ('strait_of_malacca', 'Strait of Malacca', STRAIT, 2.5, 101.2, SEA, 'Strait_of_Malacca', None,
     'The long channel between Sumatra and the Malay Peninsula.',
     'The main sea road between the Indian Ocean and China; Srivijaya, Malacca, Portugal, the Dutch and Britain each rose by holding it.'),
    ('sunda_strait', 'Sunda Strait', STRAIT, -5.95, 105.8, SEA, 'Sunda_Strait', None,
     'The strait between Java and Sumatra, beside Krakatoa.',
     'The Dutch East India Company\'s route to Batavia and the alternative to Malacca.'),
    ('suez_canal', 'Suez Canal', CANAL, 30.6, 32.33, SEA, 'Suez_Canal', 1869,
     'A sea-level canal across the isthmus of Suez, opened in 1869.',
     'It cut the voyage from Europe to India by about 7,000 km and drew Britain into Egypt; the 1956 crisis ended Britain\'s great-power pretensions.'),
    ('panama_canal', 'Panama Canal', CANAL, 9.08, -79.68, SEA, 'Panama_Canal', 1914,
     'A lock canal across the Isthmus of Panama, opened in 1914.',
     'It joined the Atlantic and Pacific and made the United States a two-ocean naval power.'),
    ('strait_of_dover', 'Strait of Dover', STRAIT, 51.0, 1.45, SEA, 'Strait_of_Dover', None,
     'The narrowest point of the English Channel, 33 km wide.',
     'Britain\'s moat: the Armada, Napoleon and Hitler all needed to cross it and none did.'),
    ('oresund', 'Oresund', STRAIT, 55.9, 12.7, SEA, '%C3%98resund', None,
     'The sound between Denmark and Sweden, the main entrance to the Baltic.',
     'Denmark charged the Sound Dues on every passing ship from 1429 to 1857.'),
    ('strait_of_messina', 'Strait of Messina', STRAIT, 38.25, 15.63, SEA, 'Strait_of_Messina', None,
     'The 3 km strait between Sicily and mainland Italy, home of Scylla and Charybdis.',
     'The First Punic War began over Messina, and every power in the central Mediterranean has had to hold it.'),
    ('strait_of_otranto', 'Strait of Otranto', STRAIT, 40.3, 18.9, SEA, 'Strait_of_Otranto', None,
     'The mouth of the Adriatic between Italy and Albania.',
     'Venice\'s lifeline to the east; the Allies blockaded the Austrian fleet here in the First World War.'),
    ('korea_strait', 'Korea Strait', STRAIT, 34.5, 129.5, SEA, 'Korea_Strait', None,
     'The strait between Korea and Japan, with Tsushima in the middle.',
     'The invasion road both ways: the Mongols in 1274 and 1281, Hideyoshi in 1592, and Tsushima in 1905.'),
    ('taiwan_strait', 'Taiwan Strait', STRAIT, 24.5, 119.5, SEA, 'Taiwan_Strait', None,
     'The 130 km strait between Taiwan and mainland China.',
     'Koxinga crossed it to expel the Dutch in 1662; since 1949 it has separated two Chinas.'),
    ('cape_of_good_hope', 'Cape of Good Hope', CAPE, -34.36, 18.47, SEA, 'Cape_of_Good_Hope', None,
     'The rocky headland at the south-west tip of Africa.',
     'Rounded by Dias in 1488, it opened the sea route to India; the Dutch and then the British held the Cape to guard it.'),
    ('drake_passage', 'Cape Horn and Drake Passage', CAPE, -55.98, -67.27, SEA, 'Cape_Horn', None,
     'The stormy southern tip of South America and the passage to Antarctica.',
     'The only sea route between the Atlantic and Pacific until 1914, and a graveyard of ships.'),
    ('kerch_strait', 'Kerch Strait', STRAIT, 45.3, 36.5, SEA, 'Kerch_Strait', None,
     'The Cimmerian Bosporus, joining the Black Sea to the Sea of Azov.',
     'Greek grain cities grew on its shores; it still decides access to the Sea of Azov.'),
    ('khyber_pass', 'Khyber Pass', PASS, 34.08, 71.1, LAND, 'Khyber_Pass', None,
     'The mountain pass between the Afghan plateau and the plains of the Indus.',
     'The gate of India: Persians, Alexander\'s generals, Kushans, Ghaznavids and Babur came through here or nearby.'),
    ('bolan_pass', 'Bolan Pass', PASS, 29.6, 67.4, LAND, 'Bolan_Pass', None,
     'A pass through the Toba Kakar range from Kandahar toward the Indus.',
     'The southern alternative to the Khyber for armies and caravans entering India.'),
    ('thermopylae_pass', 'Thermopylae', PASS, 38.796, 22.536, LAND, 'Thermopylae', None,
     'The "Hot Gates", a narrow coastal path between mountains and sea in central Greece.',
     'The only easy road from northern into southern Greece, defended in 480 BCE, 279 BCE and 191 BCE.'),
    ('isthmus_of_corinth', 'Isthmus of Corinth', PASS, 37.93, 22.98, LAND, 'Isthmus_of_Corinth', None,
     'The 6 km neck of land joining the Peloponnese to mainland Greece.',
     'Corinth grew rich hauling ships across it on the diolkos; Greeks walled it against Persians and Slavs.'),
    ('brenner_pass', 'Brenner Pass', PASS, 47.0, 11.5, LAND, 'Brenner_Pass', None,
     'The lowest main pass over the Alps between Italy and Austria.',
     'The road German emperors took to Rome, and the main north-south route through the Alps.'),
    ('great_st_bernard', 'Great St Bernard Pass', PASS, 45.87, 7.17, LAND, 'Great_St_Bernard_Pass', None,
     'A high Alpine pass between the Aosta valley and the Rhone.',
     'Napoleon crossed it in 1800 before Marengo; Roman legions and medieval pilgrims used it.'),
    ('roncevaux_pass', 'Roncevaux Pass', PASS, 43.02, -1.32, LAND, 'Roncevaux_Pass', None,
     'A pass over the western Pyrenees between France and Navarre.',
     'Charlemagne\'s rearguard died here in 778, the story of the Song of Roland.'),
    ('cilician_gates', 'Cilician Gates', PASS, 37.28, 34.78, LAND, 'Cilician_Gates', None,
     'A pass through the Taurus Mountains from the Anatolian plateau to the Cilician plain.',
     'Cyrus the Younger, Alexander and the Crusaders all marched through it toward Syria.'),
    ('darial_gorge', 'Darial Gorge', PASS, 42.75, 44.62, LAND, 'Darial_Gorge', None,
     'The main pass through the central Caucasus.',
     'The "Caspian Gates" of legend that Alexander was said to have closed against the northern nomads.'),
    ('derbent_gate', 'Caspian Gates at Derbent', PASS, 42.06, 48.29, LAND, 'Derbent', None,
     'The narrow strip between the Caucasus and the Caspian Sea, walled by the Sasanians.',
     'Persians, Arabs and Khazars fought over this wall against the steppe for centuries.'),
    ('dzungarian_gate', 'Dzungarian Gate', PASS, 45.25, 82.5, LAND, 'Dzungarian_Gate', None,
     'A windy valley between the Dzungarian Alatau and the Barlik mountains.',
     'The steppe highway between Mongolia and Kazakhstan, used by Turks and Mongols heading west.'),
    ('hexi_corridor', 'Hexi Corridor', PASS, 39.0, 100.0, LAND, 'Hexi_Corridor', None,
     'A strip of oases between the Tibetan plateau and the Gobi.',
     'The Silk Road\'s Chinese end; Han, Tang and Ming all fought nomads and Tibetans for it.'),
    ('jade_gate', 'Jade Gate (Yumen Pass)', PASS, 40.35, 93.86, LAND, 'Yumen_Pass', None,
     'The Han dynasty frontier post at the western end of the Great Wall.',
     'The point where China ended and the Western Regions began.'),
    ('shanhai_pass_gate', 'Shanhai Pass', PASS, 40.0, 119.75, LAND, 'Shanhai_Pass', None,
     'The gate where the Great Wall meets the sea, between Manchuria and the North China Plain.',
     'In 1644 its commander opened it to the Manchus, who went on to found the Qing.'),
    ('wakhan_corridor', 'Wakhan Corridor', PASS, 37.0, 73.5, LAND, 'Wakhan_Corridor', None,
     'A thin finger of Afghanistan between Tajikistan and Pakistan, reaching China.',
     'Drawn in the Great Game as a buffer so Russian and British India would not touch.'),
    ('fulda_gap', 'Fulda Gap', PASS, 50.6, 9.9, LAND, 'Fulda_Gap', None,
     'Lowland corridors through the hills of central Germany.',
     'NATO expected a Soviet tank attack here throughout the Cold War.'),
    ('iron_gates', 'Iron Gates', PASS, 44.67, 22.5, LAND, 'Iron_Gates', None,
     'The Danube\'s gorge through the Carpathians between Serbia and Romania.',
     'Trajan built a road and bridge here to conquer Dacia; it divided Ottoman and Habsburg Europe.'),
    ('first_cataract', 'First Cataract of the Nile', PASS, 24.08, 32.89, LAND, 'Cataracts_of_the_Nile', None,
     'Granite rapids at Aswan that blocked river boats.',
     'The ancient southern border of Egypt, beyond which lay Nubia.'),
    ('persian_gates', 'Persian Gates', PASS, 30.6, 51.7, LAND, 'Persian_Gate', None,
     'A narrow pass in the Zagros on the road to Persepolis.',
     'Ariobarzanes held Alexander here in 330 BCE until shepherds showed a way round.'),
]


def contains(rings, x, y):
    inside = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i][:2]
            xj, yj = ring[j][:2]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def polys(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else []


def dist_km(g, lat, lon):
    """Distance from a point to the nearest polygon edge (equirectangular, fine at 60 km)."""
    k = math.cos(math.radians(lat))
    best = 1e9
    for poly in polys(g):
        for ring in poly:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                ax, ay, bx, by = (x1 - lon) * k, y1 - lat, (x2 - lon) * k, y2 - lat
                dx, dy = bx - ax, by - ay
                t = 0 if dx == dy == 0 else max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
                best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best * 111.2


def holder(feats, lat, lon):
    near = None
    for f in feats:
        g = f['geometry']
        for poly in polys(g):
            if contains(poly, lon, lat):
                return f, 0
    for f in feats:
        d = dist_km(f['geometry'], lat, lon)
        if d <= NEAR_KM and (near is None or d < near[1]):
            near = (f, d)
    return near or (None, None)


def main():
    geo = json.load(open(os.path.join(OUT, 'geo', 'borders.geojson')))
    years = geo['years']
    by_year = {y: [] for y in years}
    for f in geo['features']:
        for y in f['properties']['years']:
            by_year[y].append(f)
    places, rels = [], []
    for slug, name, sub, lat, lon, lenses, wiki, opened, what, why in POINTS:
        url = 'https://en.wikipedia.org/wiki/' + wiki
        rec = {'id': f'place:{slug}', 'kind': 'place', 'subtype': sub, 'name': name, 'lenses': lenses,
               'lat': lat, 'lon': lon, 'what': what, 'why': why,
               'sources': [{'cite': f'Wikipedia: {name} (written from general knowledge; check)', 'url': url}],
               'status': 'draft'}
        if opened:
            rec['start'] = opened
        places.append(rec)
        # run-length the holder across snapshots
        runs = []
        for i, y in enumerate(years):
            f, d = holder(near_bbox(by_year[y], lat, lon), lat, lon)
            who = (f['properties'].get('group') or f['properties']['ref'], f['properties']['name']) if f else None
            nxt = (years[i + 1] - 1 or -1) if i + 1 < len(years) else 2024
            if runs and runs[-1][0] and who and runs[-1][0][0] == who[0]:
                runs[-1][2] = nxt
            else:
                runs.append([who, y, nxt])
        for who, a, b in runs:
            if not who or (opened and b < opened):
                continue
            a = max(a, opened or a)
            rels.append({'id': f'rel:{who[0][7:]}_controls_{slug}_{"bc%d" % -a if a < 0 else a}', 'kind': 'relation',
                         'type': 'controls', 'from': who[0], 'to': f'place:{slug}', 'start': a, 'end': b,
                         'note': f'computed from Cliopatria borders every 25 years (point inside or within {NEAR_KM} km)',
                         'lenses': ['geography', 'military'],
                         'sources': [geo['source']], 'status': 'sourced'})
    with open(os.path.join(OUT, 'chokepoints.jsonl'), 'w', encoding='utf-8') as fh:
        for r in places + rels:
            fh.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(places)} chokepoints, {len(rels)} control spans')


_bb = {}


def near_bbox(feats, lat, lon):
    """The features whose bounding box comes within reach of the point."""
    pad, hit = NEAR_KM / 100, []
    for f in feats:
        b = _bb.get(id(f))
        if b is None:
            pts = [p for poly in polys(f['geometry']) for ring in poly for p in ring]
            b = _bb[id(f)] = (min(p[0] for p in pts), min(p[1] for p in pts),
                              max(p[0] for p in pts), max(p[1] for p in pts)) if pts else (0, 0, -1, -1)
        if b[0] - pad <= lon <= b[2] + pad and b[1] - pad <= lat <= b[3] + pad:
            hit.append(f)
    return hit


if __name__ == '__main__':
    main()
