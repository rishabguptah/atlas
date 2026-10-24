#!/usr/bin/env python3
"""Turn the raw places-people datasets into kernel records in data/places-people/.

Run ingest/places-people/fetch.sh first, then: python3 ingest/places-people/build_records.py
Needs pycountry (pip install pycountry) for modern country names.

Writes:
  people.jsonl    the most famous people in Pantheon (by HPI) who have died and have a mapped birthplace
  places.jsonl    every GeoNames city of 100,000+ people, every birth/death place of those people,
                  and the ancient cities in the largest-city tables
  measures.jsonl  GeoNames modern population per city, and largest-city population figures by source
"""
import csv, json, math, os, re, sys, unicodedata
from collections import Counter, defaultdict

import pycountry

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, 'raw', 'places-people')
OUT = os.path.join(ROOT, 'data', 'places-people')

N_PEOPLE = 3000
CITY_MIN_POP = 100000

PANTHEON = {'cite': 'Pantheon 2025 update (Yu et al. 2016, pantheon.world), CC BY 4.0',
            'url': 'https://pantheon.world/data/datasets'}
GEONAMES = {'cite': 'GeoNames cities1000 via the all-the-cities 3.1.0 npm package (2020 snapshot), CC BY 4.0',
            'url': 'https://www.geonames.org/'}
LARGEST = {'cite': 'Wikipedia, "List of largest cities throughout history", tables after Morris 2010, Modelski 2003 '
                   'and Chandler 1987; transcribed 2026-10-24',
           'url': 'https://en.wikipedia.org/wiki/List_of_largest_cities_throughout_history'}
REBA = {'cite': 'Reba, Reitsma & Seto 2016, Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000, '
                'Scientific Data 3:160034 (after Chandler 1987 and Modelski 2003). Attribution, non-commercial, share-alike',
        'url': 'https://doi.org/10.7910/DVN/LMCQGX'}
BOOKS = {'chandler': 'Chandler, Four Thousand Years of Urban Growth (1987)',
         'modelski': 'Modelski, World Cities: -3000 to 2000 (2003)',
         'morris': 'Morris, The Measure of Civilization / Why the West Rules (2010)'}

# Same slugs the Living Atlas already uses, so its stubs merge into these records.
ALIASES = {'saint_petersburg': 'st_petersburg', 'kiev': 'kyiv', 'rio_de_janeiro': 'rio', 'xi_an': 'xian',
           'mohenjo_daro': 'mohenjo', 'new_york_city': 'new_york', 'benin': 'benin_city'}
# Reba series that mix two places under one city id: from this year on, points belong to another place.
REBA_SPLITS = {'Memphis_29.8_31.3': (1800, 'place:memphis_united_states')}
COUNTRY_NAMES = {'IR': 'Iran', 'RU': 'Russia', 'KR': 'South Korea', 'KP': 'North Korea', 'SY': 'Syria',
                 'TW': 'Taiwan', 'VN': 'Vietnam', 'BO': 'Bolivia', 'VE': 'Venezuela', 'TZ': 'Tanzania',
                 'MD': 'Moldova', 'LA': 'Laos', 'CD': 'DR Congo', 'CG': 'Congo', 'PS': 'Palestine',
                 'XK': 'Kosovo', 'CZ': 'Czechia', 'GB': 'United Kingdom', 'US': 'United States'}

# Pantheon occupation -> (role, extra lenses). Every person also gets the `people` lens.
ROLE_LENSES = {
    'POLITICIAN': ('ruler_or_politician', ['order']), 'NOBLEMAN': ('noble', ['order']),
    'COMPANION': ('consort_or_companion', ['order']), 'DIPLOMAT': ('diplomat', ['order']),
    'PUBLIC WORKER': ('official', ['order']), 'EXTREMIST': ('extremist', ['order']),
    'JUDGE': ('judge', ['order']), 'LAWYER': ('lawyer', ['order']), 'SOCIAL ACTIVIST': ('activist', ['order']),
    'MILITARY PERSONNEL': ('general', ['military']), 'PIRATE': ('pirate', ['military']),
    'RELIGIOUS FIGURE': ('religious_figure', ['religion']), 'OCCULTIST': ('occultist', ['religion']),
    'WRITER': ('writer', ['literature']), 'JOURNALIST': ('journalist', ['literature']),
    'PHILOSOPHER': ('philosopher', ['ideas']), 'HISTORIAN': ('historian', ['ideas', 'literature']),
    'PHYSICIAN': ('physician', ['ideas', 'disease']), 'BIOLOGIST': ('biologist', ['ideas', 'disease']),
    'ECONOMIST': ('economist', ['ideas', 'economy']), 'BUSINESSPERSON': ('merchant_or_business', ['economy']),
    'EXPLORER': ('explorer', ['geography']), 'GEOGRAPHER': ('geographer', ['ideas', 'geography']),
    'ASTRONAUT': ('astronaut', ['ideas']),
}
IDEAS = {'PHYSICIST', 'CHEMIST', 'MATHEMATICIAN', 'ASTRONOMER', 'INVENTOR', 'ENGINEER', 'PSYCHOLOGIST',
         'LINGUIST', 'SOCIOLOGIST', 'ARCHAEOLOGIST', 'ANTHROPOLOGIST', 'COMPUTER SCIENTIST', 'GEOLOGIST',
         'POLITICAL SCIENTIST', 'STATISTICIAN', 'ARCHITECT'}


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s or 'x'


def country(cc):
    if cc in COUNTRY_NAMES:
        return COUNTRY_NAMES[cc]
    c = pycountry.countries.get(alpha_2=cc)
    return (getattr(c, 'common_name', None) or c.name) if c else None


def yr(v):
    """Pantheon year string -> kernel year (no year 0)."""
    if v in ('', None):
        return None
    y = int(float(v))
    return -1 if y == 0 else y


def dist(lat1, lon1, lat2, lon2):
    """Great-circle distance in km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def reba_series(places, la):
    """Match each Reba city to a place record by name within 30 km, or add a new place. Returns [(place id, points)]."""
    path = os.path.join(RAW, 'reba', 'historical_urban_population.csv')
    if not os.path.exists(path):
        print('no Reba data in raw/places-people/reba/, skipping')
        return []
    cities = defaultdict(lambda: {'pts': {}})
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if not int(r['pop'] or 0):
            continue
        c = cities[r['cityid']]
        c.update(name=r['City'], other=r['OtherName'], today=r['Country'], lat=float(r['Latitude']),
                 lon=float(r['Longitude']), certainty=int(r['Certainty']))
        y = int(r['year'])
        c['pts'][y] = max(c['pts'].get(y, 0), int(r['pop']))
    by_base = defaultdict(list)  # name slug -> place records carrying it (plain or suffixed id)
    pool = places + [p for p in la if 'lat' in p]
    for p in pool:
        by_base[p['id'][6:]].append(p)
        by_base[slug(p['name'])].append(p)
    taken = {p['id'][6:] for p in pool}
    out, matched = [], 0
    for cid, c in sorted(cities.items()):
        names = [ALIASES.get(slug(n), slug(n)) for n in (c['name'], *c['other'].split(',')) if n.strip()]
        near = [(dist(c['lat'], c['lon'], p['lat'], p['lon']), p['id']) for n in names for p in by_base.get(n, [])]
        near = [n for n in near if n[0] < 30]
        if near:
            pid = min(near)[1]
            matched += 1
        else:
            base = names[0]
            for s in (base, f'{base}_{slug(c["today"])}', f'{base}_{slug(cid)}'):
                if s not in taken:
                    break
            taken.add(s)
            pid = 'place:' + s
            rec = {'id': pid, 'kind': 'place', 'name': c['name'], 'subtype': 'city', 'lenses': ['geography', 'population'],
                   'today': c['today'], 'lat': round(c['lat'], 4), 'lon': round(c['lon'], 4),
                   'ext': {'reba': cid}, 'sources': [REBA], 'status': 'sourced'}
            if c['certainty'] > 1:
                rec['note'] = f'Reba geocoding certainty {c["certainty"]} of 3 (1 is best)'
            places.append(rec)
            by_base[s].append(rec)
        pts = [[y, c['pts'][y]] for y in sorted(c['pts'])]
        if cid in REBA_SPLITS:
            cut, other = REBA_SPLITS[cid]
            out.append((other, [p for p in pts if p[0] >= cut]))
            pts = [p for p in pts if p[0] < cut]
        out.append((pid, pts))
    # Two Reba cities can land on one place (e.g. old and new names); keep one series per place, the longer one.
    best = {}
    for pid, pts in out:
        if pid not in best or len(pts) > len(best[pid]):
            best[pid] = pts
    print(f'reba: {len(cities)} cities, {matched} matched to existing places, {len(best)} series')
    return sorted(best.items())


def dump(name, recs):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{name}: {len(recs)} records')


def main():
    os.makedirs(OUT, exist_ok=True)

    # ---- People -------------------------------------------------------------------------------------
    rows = list(csv.DictReader(open(os.path.join(RAW, 'pantheon_person_2025.csv'), encoding='utf-8')))
    rows = [r for r in rows if r['alive'] == 'FALSE' and r['is_group'] == 'FALSE' and r['birthyear']
            and r['bplace_lat'] and r['bplace_geonameid']]
    rows.sort(key=lambda r: -float(r['hpi'] or 0))
    rows = rows[:N_PEOPLE]

    # ---- Places: candidates keyed by GeoNames id ---------------------------------------------------
    geo = {g[0]: g for g in json.load(open(os.path.join(RAW, 'geonames_cities.json')))}
    cand = {}  # geonameid -> dict(name, lat, lon, cc, pop, fcode, uses)

    def add_place(gid, name=None, lat=None, lon=None, today=None):
        gid = int(float(gid))
        if gid not in cand:
            g = geo.get(gid)
            if g:
                cand[gid] = dict(name=g[1], lat=g[5], lon=g[6], today=country(g[2]), pop=g[4], fcode=g[3], uses=0)
            else:
                cand[gid] = dict(name=name, lat=float(lat), lon=float(lon), today=today or None, pop=0, fcode=None, uses=0)
        return gid

    for g in geo.values():
        if g[4] >= CITY_MIN_POP:
            add_place(g[0])
    for r in rows:
        cand[add_place(r['bplace_geonameid'], r['bplace_name'], r['bplace_lat'], r['bplace_lon'], r['bplace_country'])]['uses'] += 1
        if r['dplace_geonameid'] and r['dplace_lat']:
            cand[add_place(r['dplace_geonameid'], r['dplace_name'], r['dplace_lat'], r['dplace_lon'], r['dplace_country'])]['uses'] += 1

    # Living Atlas places keep their ids: a living city takes over the nearby GeoNames record of the same name,
    # and every other Living Atlas slug (Memphis in Egypt, Carthage, Troy...) is reserved so namesakes elsewhere
    # get a suffix. The ancient cities in ancient_cities.csv are reserved the same way.
    ids, taken, where = {}, set(), {}  # where: slug -> (lat, lon) of the place holding it
    la_path = os.path.join(ROOT, 'data', 'living-atlas', 'places.jsonl')
    la = [json.loads(l) for l in open(la_path, encoding='utf-8')] if os.path.exists(la_path) else []
    for p in la:
        s = p['id'][6:]
        taken.add(s)
        if p.get('subtype') != 'city' or p.get('end') is not None or 'lat' not in p:
            continue
        near = [(dist(p['lat'], p['lon'], c['lat'], c['lon']), -c['pop'], gid) for gid, c in cand.items()
                if abs(c['lat'] - p['lat']) < 0.3 and gid not in ids
                and (ALIASES.get(slug(c['name']), slug(c['name'])) == s or slug(c['name'])[:3] == s[:3])]
        near = [n for n in near if n[0] < 20]
        if near:
            ids[min(near)[2]] = p['id']
        where[s] = (p['lat'], p['lon'])
    ancient = {a['id']: a for a in csv.DictReader(open(os.path.join(HERE, 'ancient_cities.csv'), encoding='utf-8'))}
    taken |= set(ancient)
    where.update({k: (float(a['lat']), float(a['lon'])) for k, a in ancient.items()})

    # Most famous / biggest place with a name gets the plain slug; later ones get a country or GeoNames suffix.
    for gid in sorted(cand, key=lambda k: (-cand[k]['uses'], -cand[k]['pop'], k)):
        if gid in ids:
            continue
        c = cand[gid]
        base = slug(c['name'])
        base = ALIASES.get(base, base)
        if base in where and dist(*where[base], c['lat'], c['lon']) < 15:
            ids[gid] = 'place:' + base  # same place under another GeoNames/Pantheon id
            continue
        for s in (base, f'{base}_{slug(c["today"] or "")}', f'{base}_{gid}'):
            if s not in taken:
                break
        taken.add(s)
        where[s] = (c['lat'], c['lon'])
        ids[gid] = 'place:' + s

    places, seen = [], set()
    for gid, pid in ids.items():
        if pid in seen:
            continue
        seen.add(pid)
        c = cand[gid]
        rec = {'id': pid, 'kind': 'place', 'name': c['name'],
               'subtype': 'city' if (c['fcode'] or '').startswith('PPL') or c['pop'] else 'site',
               'lenses': ['geography', 'population'] if c['pop'] >= CITY_MIN_POP else ['geography', 'people'],
               'lat': round(c['lat'], 4), 'lon': round(c['lon'], 4), 'ext': {'geonames': str(gid)},
               'sources': [GEONAMES if c['fcode'] else PANTHEON], 'status': 'sourced'}
        if c['today']:
            rec['today'] = c['today']
        if c['uses']:
            rec['tags'] = ['pantheon_birth_or_death_place']
        places.append(rec)
    for aid, a in ancient.items():
        pid = 'place:' + aid
        if pid in seen:  # a GeoNames or Pantheon record already sits here
            continue
        rec = {'id': pid, 'kind': 'place', 'name': a['name'], 'subtype': 'city', 'lenses': ['geography', 'population'],
               'today': a['today'], 'lat': float(a['lat']), 'lon': float(a['lon']),
               'sources': [{'cite': 'Coordinates written by Claude from general knowledge of the site; not yet checked'}],
               'status': 'draft'}
        places.append(rec)
    places.sort(key=lambda r: r['id'])
    reba = reba_series(places, la)
    places.sort(key=lambda r: r['id'])
    place_ids = {p['id'] for p in places} | {p['id'] for p in la}

    # ---- Person records ---------------------------------------------------------------------------
    people, pids = [], set()
    for r in rows:
        pid = 'person:' + slug(r['name'])
        if pid in pids:
            pid = f'{pid}_{slug(str(r["birthyear"]))}'
        pids.add(pid)
        occ = r['occupation'] or 'UNKNOWN'
        role, extra = ROLE_LENSES.get(occ, (slug(occ), ['ideas'] if occ in IDEAS else []))
        b, d = yr(r['birthyear']), yr(r['deathyear'])
        rec = {'id': pid, 'kind': 'person', 'name': r['name'], 'lenses': ['people'] + [l for l in extra if l != 'people'],
               'roles': [role], 'start': b, 'born': {'year': b, 'place': ids[int(float(r['bplace_geonameid']))]}}
        if not r['birthdate']:
            rec['start_approx'] = True
        if d is not None:
            if d < b:  # a handful of rows have the years swapped or garbled; keep the birth year only
                d = None
            else:
                rec['end'] = d
                rec['died'] = {'year': d}
                if r['dplace_geonameid'] and r['dplace_lat']:
                    rec['died']['place'] = ids[int(float(r['dplace_geonameid']))]
                if not r['deathdate']:
                    rec['end_approx'] = True
        if r['wd_id']:
            rec['wikidata'] = r['wd_id']
        rec['ext'] = {'pantheon': r['id'], 'wikipedia': r['slug']}
        rec['fame'] = round(float(r['hpi']), 1)  # Pantheon Historical Popularity Index, 0-100
        rec['sources'] = [PANTHEON]
        rec['status'] = 'sourced'
        people.append(rec)

    # ---- Measures ---------------------------------------------------------------------------------
    measures, measured = [], set()
    for gid, pid in sorted(ids.items(), key=lambda kv: -cand[kv[0]]['pop']):
        c = cand[gid]
        if c['fcode'] and c['pop'] >= CITY_MIN_POP and pid not in measured:
            measured.add(pid)
            measures.append({'id': f'm:population:{pid[6:]}:geonames', 'kind': 'measure', 'of': pid,
                             'metric': 'population', 'unit': 'people', 'points': [[2020, c['pop']]],
                             'lenses': ['population'], 'note': 'GeoNames figure; census years vary by country',
                             'sources': [GEONAMES], 'status': 'sourced'})

    # Largest-city tables: one measure per (city, source book).
    series = defaultdict(dict)
    for row in csv.DictReader(open(os.path.join(HERE, 'largest_cities.csv'), encoding='utf-8')):
        pid = 'place:' + row['place']
        if pid not in place_ids:
            sys.exit(f'largest_cities.csv: unknown place {pid}')
        pt = [int(row['year']), int(row['value'])]
        if row['low']:
            pt += [int(row['low']), int(row['high'])]
        series[(pid, row['source'])][pt[0]] = pt
    for (pid, src), pts in sorted(series.items()):
        measures.append({'id': f'm:population:{pid[6:]}:{src}', 'kind': 'measure', 'of': pid, 'metric': 'population',
                         'unit': 'people', 'points': [pts[y] for y in sorted(pts)], 'lenses': ['population'],
                         'note': 'Years when this was the largest city in the world, per this source. Transcribed '
                                 'through a summarising web fetch, so draft until checked against the page',
                         'sources': [{'cite': BOOKS[src]}, LARGEST], 'status': 'draft'})
    for pid, pts in reba:
        measures.append({'id': f'm:population:{pid[6:]}:reba2016', 'kind': 'measure', 'of': pid, 'metric': 'population',
                         'unit': 'people', 'points': pts, 'lenses': ['population'],
                         'note': 'Years when the city made Chandler\'s or Modelski\'s lists; gaps mean not listed, not empty',
                         'sources': [REBA], 'status': 'sourced'})
    measures.sort(key=lambda r: r['id'])

    dump('places.jsonl', places)
    dump('people.jsonl', people)
    dump('measures.jsonl', measures)
    print('people by era:', sorted(Counter((p['start'] // 500) * 500 for p in people).items()))


if __name__ == '__main__':
    main()
