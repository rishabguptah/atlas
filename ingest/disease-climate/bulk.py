# Bulk datasets for the disease and climate workstream (schema v0).
#
# Run: python3 ingest/disease-climate/bulk.py [RAW_DIR]
# RAW_DIR defaults to /mnt/project-files/atlas/raw/disease-climate (see SOURCES.txt there).
# Run records.py first: curated events win, and bulk rows that duplicate one are dropped.
#
# Writes data/disease-climate/:
#   bulk_eruptions.jsonl   Smithsonian GVP confirmed eruptions with VEI >= 4
#   bulk_wikidata.jsonl    Wikidata epidemics, outbreaks and famines with a date and a place
#   bulk_famines.jsonl     World Peace Foundation famines 1870+ (via Our World in Data)
#   bulk_measures.jsonl    PAGES 2k global temperature, Biraben plague outbreaks per year, famine deaths per decade
#   geo/plague_outbreaks.geojson   every geocoded plague outbreak 1347-1900 (Biraben and Sticker)

import csv, json, math, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'data', 'disease-climate')
RAW = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/atlas/raw/disease-climate'

SRC = {
    'gvp': {'cite': 'Global Volcanism Program (2024). Volcanoes of the World, v. 5.x. Smithsonian Institution.', 'url': 'https://doi.org/10.5479/si.GVP.VOTW5-2024.5.2'},
    'pages2k': {'cite': 'PAGES 2k Consortium (Neukom et al.) (2019). Consistent multidecadal variability in global temperature reconstructions and simulations over the Common Era. Nature Geoscience 12, 643-649.', 'url': 'https://www.ncei.noaa.gov/pub/data/paleo/pages2k/neukom2019temp/'},
    'biraben': {'cite': 'Krauer, F. and Schmid, B. V. (2022). Mapping the plague through natural language processing. Epidemics 41. Data v1.0, digitised from Biraben (1975).', 'url': 'https://doi.org/10.5281/zenodo.6587267'},
    'sticker': {'cite': 'Krauer, F. and Schmid, B. V. (2022). Data v1.0, digitised from Sticker, G. (1908). Die Pest.', 'url': 'https://doi.org/10.5281/zenodo.6587267'},
    'wpf': {'cite': 'World Peace Foundation (2025). Famine dataset, processed by Our World in Data (Hasell and Roser).', 'url': 'https://ourworldindata.org/famines'},
}

# Rough country centroids for records that only name a country. Tagged so views can say so.
CENTROID = {
    'Afghanistan': (33.9, 67.7), 'Algeria': (28.0, 1.7), 'Angola': (-11.2, 17.9), 'Argentina': (-38.4, -63.6), 'Armenia': (40.1, 45.0),
    'Australia': (-25.3, 133.8), 'Austria': (47.5, 14.6), 'Austria-Hungary': (47.5, 17.0), 'Bangladesh': (23.7, 90.4), 'Belgium': (50.5, 4.5),
    'Bolivia': (-16.3, -63.6), 'Brazil': (-14.2, -51.9), 'Burkina Faso': (12.2, -1.6), 'Burundi': (-3.4, 29.9), 'Cambodia': (12.6, 105.0),
    'Cameroon': (7.4, 12.4), 'Canada': (56.1, -106.3), 'Cape Verde': (16.0, -24.0), 'Chad': (15.5, 18.7), 'Chile': (-35.7, -71.5),
    'China': (35.9, 104.2), "People's Republic of China": (35.9, 104.2), 'Colombia': (4.6, -74.3), 'Democratic Republic of the Congo': (-4.0, 21.8),
    'Republic of the Congo': (-0.2, 15.8), 'Cuba': (21.5, -77.8), 'Denmark': (56.3, 9.5), 'Ecuador': (-1.8, -78.2), 'Egypt': (26.8, 30.8),
    'England': (52.4, -1.5), 'Eritrea': (15.2, 39.8), 'Estonia': (58.6, 25.0), 'Ethiopia': (9.1, 40.5), 'Finland': (61.9, 25.7),
    'France': (46.2, 2.2), 'Germany': (51.2, 10.5), 'Ghana': (7.9, -1.0), 'Greece': (39.1, 21.8), 'Guatemala': (15.8, -90.2),
    'Guinea': (9.9, -9.7), 'Haiti': (19.0, -72.3), 'Hungary': (47.2, 19.5), 'Iceland': (64.9, -19.0), 'India': (20.6, 79.0),
    'British India': (22.0, 79.0), 'Indonesia': (-0.8, 113.9), 'Dutch East Indies': (-0.8, 113.9), 'Iran': (32.4, 53.7), 'Persia': (32.4, 53.7),
    'Iraq': (33.2, 43.7), 'Ireland': (53.4, -8.2), 'Israel': (31.0, 34.9), 'Italy': (41.9, 12.6), 'Japan': (36.2, 138.3),
    'Kazakhstan': (48.0, 66.9), 'Kenya': (-0.0, 37.9), 'North Korea': (40.3, 127.5), 'South Korea': (35.9, 127.8), 'Korea': (37.5, 127.5),
    'Laos': (19.9, 102.5), 'Lebanon': (33.9, 35.9), 'Liberia': (6.4, -9.4), 'Libya': (26.3, 17.2), 'Madagascar': (-18.8, 46.9),
    'Malawi': (-13.3, 34.3), 'Mali': (17.6, -4.0), 'Mauritania': (21.0, -10.9), 'Mexico': (23.6, -102.6), 'Mongolia': (46.9, 103.8),
    'Morocco': (31.8, -7.1), 'Mozambique': (-18.7, 35.5), 'Myanmar': (21.9, 95.9), 'Burma': (21.9, 95.9), 'Namibia': (-22.9, 18.5),
    'Nepal': (28.4, 84.1), 'Netherlands': (52.1, 5.3), 'Kingdom of the Netherlands': (52.1, 5.3), 'New Zealand': (-40.9, 174.9),
    'Niger': (17.6, 8.1), 'Nigeria': (9.1, 8.7), 'Norway': (60.5, 8.5), 'Ottoman Empire': (39.0, 35.0), 'Pakistan': (30.4, 69.3),
    'Peru': (-9.2, -75.0), 'Philippines': (12.9, 121.8), 'Poland': (51.9, 19.1), 'Portugal': (39.4, -8.2), 'Romania': (45.9, 25.0),
    'Russia': (61.5, 105.3), 'Russian Empire': (56.0, 45.0), 'Soviet Union': (56.0, 45.0), 'Rwanda': (-1.9, 29.9), 'Saudi Arabia': (23.9, 45.1),
    'Scotland': (56.5, -4.2), 'Senegal': (14.5, -14.5), 'Sierra Leone': (8.5, -11.8), 'Somalia': (5.2, 46.2), 'South Africa': (-30.6, 22.9),
    'South Sudan': (6.9, 31.3), 'Spain': (40.5, -3.7), 'Sri Lanka': (7.9, 80.8), 'Sudan': (12.9, 30.2), 'Sweden': (60.1, 18.6),
    'Switzerland': (46.8, 8.2), 'Syria': (34.8, 39.0), 'Taiwan': (23.7, 121.0), 'Tanzania': (-6.4, 34.9), 'Thailand': (15.9, 101.0),
    'Tunisia': (33.9, 9.5), 'Turkey': (39.0, 35.2), 'Uganda': (1.4, 32.3), 'Ukraine': (48.4, 31.2), 'United Kingdom': (55.4, -3.4),
    'United States': (37.1, -95.7), 'United States of America': (37.1, -95.7), 'Uzbekistan': (41.4, 64.6), 'Venezuela': (6.4, -66.6),
    'Vietnam': (14.1, 108.3), 'Yemen': (15.6, 48.5), 'Zambia': (-13.1, 27.8), 'Zimbabwe': (-19.0, 29.2), 'Lithuania': (55.2, 23.9),
    'Latvia': (56.9, 24.6), 'Belarus': (53.7, 27.9), 'Czech Republic': (49.8, 15.5), 'Serbia': (44.0, 21.0), 'Bosnia and Herzegovina': (43.9, 17.7),
    'Greenland': (71.7, -42.6), 'Hong Kong': (22.3, 114.2), 'Singapore': (1.35, 103.8), 'Malaysia': (4.2, 102.0), 'Gabon': (-0.8, 11.6),
    'Central African Republic': (6.6, 20.9), 'Benin': (9.3, 2.3), 'Togo': (8.6, 0.8), 'Ivory Coast': (7.5, -5.5), 'Djibouti': (11.8, 42.6),
    'Jordan': (30.6, 36.2), 'Kuwait': (29.3, 47.5), 'Qatar': (25.4, 51.2), 'United Arab Emirates': (23.4, 53.8), 'Oman': (21.5, 55.9),
    'Paraguay': (-23.4, -58.4), 'Uruguay': (-32.5, -55.8), 'Honduras': (15.2, -86.2), 'Nicaragua': (12.9, -85.2), 'El Salvador': (13.8, -88.9),
    'Costa Rica': (9.7, -83.8), 'Panama': (8.5, -80.8), 'Dominican Republic': (18.7, -70.2), 'Jamaica': (18.1, -77.3), 'Puerto Rico': (18.2, -66.6),
    'Fiji': (-17.7, 178.1), 'Samoa': (-13.8, -172.1), 'Papua New Guinea': (-6.3, 143.9), 'East Timor': (-8.9, 125.7), 'Bhutan': (27.5, 90.4),
    'Tibet': (31.0, 88.0), 'Mughal Empire': (25.0, 78.0), 'Qing dynasty': (35.0, 110.0), 'Ming dynasty': (35.0, 110.0), 'Sahel': (14.0, 0.0),
    'Biafra': (5.5, 7.5), 'Gaza Strip': (31.4, 34.4), 'Darfur': (13.5, 24.0), 'Bengal': (23.5, 88.5), 'Kingdom of Great Britain': (54.0, -2.0),
}

# Famine-dataset regions that are not countries
REGION = {
    'Congo Free State': (-2.5, 23.5), 'Democratic Republic of Congo': (-4.0, 21.8), 'East Africa': (-2.0, 36.0),
    'Eastern Europe': (51.0, 25.0), 'German East Africa': (-6.4, 34.9), 'German occupied USSR': (52.0, 30.0),
    'Greater Syria': (34.0, 37.0), 'Somaliland, African Red Sea Region': (9.5, 45.0), 'USSR': (56.0, 45.0),
    'USSR (Southern Russia & Ukraine)': (48.0, 38.0), 'USSR (Southern Russia)': (47.0, 42.0),
}

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

def shift(y, d):
    # add d years to a kernel year, skipping the missing year 0
    a = (y if y > 0 else y + 1) + d
    return a if a > 0 else a - 1

def slug(s):
    s = re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
    return s or 'x'

def jsonl(path):
    return [json.loads(l) for l in open(path) if l.strip()] if os.path.exists(path) else []

def write(name, rows):
    with open(os.path.join(OUT, name), 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(name, len(rows))

CURATED = [e for e in jsonl(os.path.join(OUT, 'events.jsonl')) if not e.get('stub') and 'lat' in e]

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def dup_of_curated(subtype, start, lat, lon, years=2, dist=800, name=None):
    for e in CURATED:
        if name and norm(e['name']) == norm(name) and abs((e.get('start') or 0) - start) <= 5:
            return e['id']
        if e['subtype'] != subtype or e.get('start') is None:
            continue
        end = e['end'] if e.get('end') is not None else 2026
        if e['start'] - years <= start <= end + years and km((lat, lon), (e['lat'], e['lon'])) < dist:
            return e['id']
    return None

# ---- Smithsonian eruptions, VEI >= 4 ----
def eruptions():
    rows, skipped = [], []
    for x in csv.DictReader(open(os.path.join(RAW, 'gvp', 'Smithsonian_VOTW_Holocene_Eruptions.csv'))):
        if x['Activity_Type'] != 'Confirmed Eruption' or not x['ExplosivityIndexMax']:
            continue
        vei = int(x['ExplosivityIndexMax'])
        if vei < 4:
            continue
        lon, lat = map(float, re.match(r'POINT \(([-\d.]+) ([-\d.]+)\)', x['GeoLocation']).groups())
        y = int(x['StartDateYear'])
        y = y - 1 if y <= 0 else y  # GVP counts 0 as 1 BCE; the kernel has no year 0
        unc = int(x['StartDateYearUncertainty'] or 0)
        d = dup_of_curated('eruption', y, lat, lon, years=max(5, unc), dist=300)
        if d:
            skipped.append((x['Volcano_Name'], y, d))
            continue
        r = {'id': 'event:gvp_eruption_' + x['Eruption_Number'], 'kind': 'event', 'subtype': 'eruption',
             'name': '%s eruption, %s' % (x['Volcano_Name'], ('%d BCE' % -y) if y < 0 else y),
             'lenses': ['geography'], 'start': y, 'lat': lat, 'lon': lon, 'vei': vei,
             'ext': {'gvp_eruption': x['Eruption_Number'], 'gvp_volcano': x['Volcano_Number']},
             'sources': [SRC['gvp']], 'status': 'sourced', 'tags': ['VEI %d' % vei]}
        if unc:
            r['start_approx'] = True
            r['start_range'] = [shift(y, -unc), shift(y, unc)]
        if x['EndDateYear']:
            ey = int(x['EndDateYear']); r['end'] = ey - 1 if ey <= 0 else ey
        rows.append(r)
    print('eruptions skipped as curated:', len(skipped), skipped[:12])
    return rows

# ---- Wikidata epidemics, outbreaks and famines ----
KEEP_TYPES = re.compile(r'outbreak|epidemic|pandemic|famine|plague|cholera|smallpox|dengue|ebola|typhus|influenza pandemic', re.I)
DROP_TYPES = re.compile(r'flu season|sexually transmitted|eruption|lava|planeze', re.I)
DROP_LABEL = re.compile(r'COVID|coronavirus|SARS-CoV-2', re.I)

def year_of(v):
    m = re.match(r'(-?)(\d+)-', v or '')
    if not m:
        return None
    y = int(m.group(2)) * (-1 if m.group(1) else 1)
    return y - 1 if y <= 0 else y

def wikidata(taken):
    items = {}
    for b in json.load(open(os.path.join(RAW, 'wikidata_epidemics_famines_eruptions.json')))['results']['bindings']:
        items.setdefault(b['item']['value'].rsplit('/', 1)[1], []).append(b)
    rows, dups, nowhere = [], [], 0
    for q, bs in items.items():
        label = bs[0].get('itemLabel', {}).get('value', q)
        types = {b['typeLabel']['value'] for b in bs if 'typeLabel' in b}
        if DROP_LABEL.search(label) or re.fullmatch(r'Q\d+', label):
            continue
        if not any(KEEP_TYPES.search(t) for t in types) or all(DROP_TYPES.search(t) for t in types):
            continue
        famine = any('famine' in t.lower() for t in types)
        get = lambda k: next((b[k]['value'] for b in bs if k in b), None)
        start = year_of(get('start') or get('date'))
        if start is None:
            continue
        end = year_of(get('end')) or start
        tags = []
        pt = get('coord') or get('locCoord')
        if pt:
            lon, lat = map(float, re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', pt).groups())
        else:
            c = next((CENTROID.get(b[k]['value']) for b in bs for k in ('countryLabel', 'locLabel') if k in b and b[k]['value'] in CENTROID), None)
            if not c:
                nowhere += 1
                continue
            lat, lon = c; tags.append('location: country centroid')
        subtype = 'famine' if famine else 'epidemic'
        d = dup_of_curated(subtype, start, lat, lon, years=1, dist=600, name=label)
        if d:
            dups.append((label, d)); taken.add(q)
            continue
        deaths = [float(b['deaths']['value']) for b in bs if 'deaths' in b]
        r = {'id': 'event:wd_' + q.lower(), 'kind': 'event', 'subtype': subtype, 'name': label,
             'lenses': ['population', 'order'] if famine else ['disease'], 'start': start, 'end': end, 'lat': round(lat, 4), 'lon': round(lon, 4),
             'wikidata': q, 'sources': [{'cite': 'Wikidata ' + q + (', English Wikipedia' if get('article') else ''), 'url': get('article') or 'https://www.wikidata.org/wiki/' + q}],
             'status': 'sourced', 'tags': tags + sorted(types)[:3]}
        if deaths:
            r['deaths'] = [int(min(deaths)), int(max(deaths))]
        rows.append(r); taken.add(q)
    print('wikidata kept', len(rows), 'duplicates of curated', len(dups), 'no location', nowhere)
    print('  e.g.', dups[:10])
    return rows

# ---- World Peace Foundation famines via OWID ----
def famines(existing):
    rows, dups = [], []
    for x in csv.DictReader(open(os.path.join(RAW, 'owid-famines', 'famines-and-the-deaths-in-them.csv'))):
        ent, y, deaths = x['Entity'], int(x['Year']), int(float(x['Deaths from famines']))
        m = re.match(r'(.+?) (\d{4})(?:-(\d{2,4}))?$', ent)
        country = m.group(1) if m else ent
        end = y
        if m and m.group(3):
            e = m.group(3); end = int(e) if len(e) == 4 else int(str(y)[:2] + e)
        inner = re.search(r'\((.+)\)', country)
        bare = re.sub(r'\s*\(.*\)', '', country).strip()
        c = (REGION.get(country) or (inner and CENTROID.get(inner.group(1))) or CENTROID.get(bare) or REGION.get(bare)
             or CENTROID.get(bare.split(',')[0].split(' and ')[0].strip()))
        if not c:
            print('  no centroid for famine', ent); continue
        lat, lon = c
        d = dup_of_curated('famine', y, lat, lon, years=1, dist=700) or next(
            (r['id'] for r in existing if r['subtype'] == 'famine' and abs(r['start'] - y) <= 1 and km((lat, lon), (r['lat'], r['lon'])) < 1000), None)
        r = {'id': 'event:wpf_famine_' + slug(ent), 'kind': 'event', 'subtype': 'famine', 'name': 'Famine in ' + ent,
             'lenses': ['population', 'order'], 'start': y, 'end': end, 'lat': lat, 'lon': lon, 'deaths': [deaths, deaths],
             'sources': [SRC['wpf']], 'status': 'sourced', 'tags': ['location: country centroid', 'region: ' + x['Region']]}
        if d:
            dups.append((ent, d)); continue
        rows.append(r)
    print('wpf famines kept', len(rows), 'duplicates', len(dups), dups[:8])
    return rows

# ---- Measures ----
def measures():
    out = []
    lines = [l.rstrip('\n').split('\t') for l in open(os.path.join(RAW, 'pages2k', 'Full_ensemble_median_and_95pct_range.txt')) if l[:1].isdigit()]
    pts = [[int(c[0]), float(c[2]), float(c[3]), float(c[4])] for c in lines if c[2] != 'NA']
    out.append({'id': 'm:temperature_anomaly:earth:pages2k_2019', 'kind': 'measure', 'of': 'place:earth', 'metric': 'temperature_anomaly', 'unit': '°C',
                'what': 'Global mean surface temperature, difference from 1961-1990, median of the full ensemble with its 95% range.',
                'points': pts, 'lenses': ['geography'], 'sources': [SRC['pages2k']], 'status': 'sourced'})
    f = [[int(c[0]), float(c[6]), float(c[7]), float(c[8])] for c in lines if c[6] != 'NA']
    out.append({'id': 'm:temperature_anomaly_31yr:earth:pages2k_2019', 'kind': 'measure', 'of': 'place:earth', 'metric': 'temperature_anomaly', 'unit': '°C',
                'what': 'The same reconstruction smoothed with a 31-year filter.', 'points': f, 'lenses': ['geography'],
                'sources': [SRC['pages2k']], 'status': 'sourced'})
    by = {}
    for x in csv.DictReader(open(os.path.join(RAW, 'plague', 'plague_biraben_v1.csv'), encoding='utf-8-sig')):
        by[int(x['year'])] = by.get(int(x['year']), 0) + 1
    out.append({'id': 'm:plague_outbreaks:europe:biraben', 'kind': 'measure', 'of': 'event:second_plague_pandemic', 'metric': 'outbreaks', 'unit': 'places',
                'what': 'Number of places with a recorded plague outbreak each year, from Biraben\'s catalogue.',
                'points': [[y, by[y]] for y in sorted(by)], 'lenses': ['disease'], 'sources': [SRC['biraben']], 'status': 'sourced'})
    dec = [x for x in csv.DictReader(open(os.path.join(RAW, 'owid-famines', 'deaths-from-famines-by-decade.csv'))) if x['Entity'] == 'World']
    if dec:
        out.append({'id': 'm:deaths:famines_world:wpf', 'kind': 'measure', 'of': 'place:earth', 'metric': 'deaths', 'unit': 'people per decade',
                    'what': 'Deaths in famines worldwide by decade, from the World Peace Foundation famine dataset.',
                    'points': [[int(x['Year']), float(x['Deaths from famines by decade'])] for x in dec], 'lenses': ['population'],
                    'sources': [SRC['wpf']], 'status': 'sourced'})
    return out

def plague_geo():
    feats = []
    for name, key in (('plague_biraben_v1.csv', 'biraben'), ('plague_sticker_v1.csv', 'sticker')):
        for x in csv.DictReader(open(os.path.join(RAW, 'plague', name), encoding='utf-8-sig')):
            if not x['lat'] or not x['year'] or (key == 'sticker' and x.get('doublecount')):
                continue
            feats.append({'type': 'Feature', 'properties': {'ref': 'event:second_plague_pandemic', 'year': int(x['year']), 'name': x['name'] or x['name_orig'], 'src': key},
                          'geometry': {'type': 'Point', 'coordinates': [round(float(x['lon']), 3), round(float(x['lat']), 3)]}})
    print('plague outbreaks', len(feats))
    return feats

def main():
    er = eruptions()
    taken = set()
    wd = wikidata(taken)
    fm = famines(wd)
    ms = measures()
    write('bulk_eruptions.jsonl', er)
    write('bulk_wikidata.jsonl', wd)
    write('bulk_famines.jsonl', fm)
    extra = [
        {'id': 'event:second_plague_pandemic', 'kind': 'event', 'subtype': 'epidemic', 'name': 'Second plague pandemic', 'start': 1346, 'end': 1900,
         'end_approx': True, 'lat': 45.03, 'lon': 35.38, 'lenses': ['disease', 'population'], 'geo': 'geo/plague_outbreaks.geojson',
         'what': 'Plague kept returning to Europe, North Africa and the Near East for more than 500 years after the Black Death.',
         'why': 'Biraben catalogued over 11,000 local outbreaks; the last big ones in western Europe were Marseille in 1720 and Moscow in 1771.',
         'sources': [SRC['biraben'], SRC['sticker']], 'status': 'sourced'},
        {'id': 'place:earth', 'kind': 'place', 'subtype': 'region', 'name': 'Earth', 'lat': 0, 'lon': 0, 'lenses': ['geography'],
         'sources': [SRC['pages2k']], 'status': 'sourced', 'stub': True},
    ]
    write('bulk_measures.jsonl', extra + ms)
    with open(os.path.join(OUT, 'geo', 'plague_outbreaks.geojson'), 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': plague_geo()}, f, separators=(',', ':'), ensure_ascii=False)

if __name__ == '__main__':
    main()
