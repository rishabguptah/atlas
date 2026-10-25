#!/usr/bin/env python3
"""Build data/coverage/: people, places and events from outside Europe, so every region-century has its own record.

Usage: python3 ingest/coverage/build.py [RAW_DIR]      (RAW_DIR default /mnt/project-files/atlas/raw)
Reads (all optional except the first two; a missing source is skipped and reported):
  RAW_DIR/pantheon/person_2025_update.csv.bz2          Pantheon 2025 (famous people, birth places)
  RAW_DIR/coverage/people/<country>.json                Wikidata people per country (fetch_people.py)
  RAW_DIR/coverage/cbdb_people.json, cbdb_wikidata.json CBDB notable people (extract_cbdb.py) and their Wikidata ids
  RAW_DIR/coverage/chgis/v6_time_*_pts_utf_wgs84.*     CHGIS v6 time-series prefecture and county seats (needs pyshp)
  RAW_DIR/coverage/thurayya/places.geojson              al-Thurayya gazetteer of the early Islamic world
  RAW_DIR/coverage/things/<country>.json                Wikidata dated sites, buildings, settlements, events (fetch_things.py)
  RAW_DIR/deep/ev_<type>_<t0>_<t1>.json                 Wikidata events by type (fetched by the deep-anywhere thread)
  RAW_DIR/coverage/place_labels.json                    labels for Wikidata places (fetched here, cached)
Existing records in every other data/ folder win: anything already there (same Wikidata id, or a place of the same
name within a few km) is linked, not duplicated.

Selection, per region and century (regions: data/coverage/geo/regions.json):
  people  every Pantheon person born outside Europe before 1800, the most remembered after; then Wikidata people
          (CBDB for China) by sitelinks until the region-century has max(40, half of Europe's people that century),
          and anyone with 25+ sitelinks regardless.
  events  every non-European event from the deep dump with 6+ sitelinks, then more by sitelinks until the
          region-century has max(30, a third of Europe's events).
  places  CHGIS seats, al-Thurayya towns and Wikidata dated sites with 6+ sitelinks (8+ for settlements founded after 1500).
The thresholds differ by region because Wikipedia's attention does: a third-tier Song official has fewer
sitelinks than a minor Victorian MP. That is the point of setting them per region rather than globally.
"""
import bz2, csv, glob, json, os, re, sys, unicodedata, math
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'data/coverage')
sys.path.insert(0, HERE)
from coverage import Regions, century  # noqa: E402

RAW = (sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/atlas/raw').rstrip('/')
CR = RAW + '/coverage'
TODAY = '2026-10-25'
R = Regions()
log = []


def say(*a):
    s = ' '.join(str(x) for x in a)
    print(s)
    log.append(s)


# ---------------------------------------------------------------- helpers
def slug(s, n=60):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s[:n].strip('_') or 'x'


def norm(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower())


def wd_year(t):
    """'-0480-09-28T00:00:00Z' (astronomical) -> -481; returns (year, iso date or None)."""
    if not t or 'T' not in t:
        return None, None
    m = re.match(r'^(-?)(\d+)-(\d\d)-(\d\d)T', t)
    if not m:
        return None, None
    y = int(m.group(2)) * (-1 if m.group(1) else 1)
    if y <= 0:
        y -= 1
    date = None
    if 0 < y < 10000 and (m.group(3), m.group(4)) != ('01', '01'):
        date = f'{y:04d}-{m.group(3)}-{m.group(4)}'
    return (y if -100000 < y < 2100 else None), date


def point(wkt):
    try:
        a = wkt[wkt.index('(') + 1:wkt.index(')')].split()
        lon, lat = float(a[0]), float(a[1])
        return (lon, lat) if -180 <= lon <= 180 and -90 <= lat <= 90 else None
    except (ValueError, AttributeError):
        return None


def qid(uri):
    return uri.rsplit('/', 1)[-1] if uri else None


def km(a, b):
    dlat = math.radians(b[1] - a[1]); dlon = math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dlon / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(h)))


def wd_src(q, what):
    return {'cite': f'Wikidata (CC0), query of {TODAY}: {what} ({q})', 'url': f'https://www.wikidata.org/wiki/{q}'}


# ---------------------------------------------------------------- what already exists
existing, by_qid, ids = {}, {}, set()
for path in glob.glob(os.path.join(ROOT, 'data', '*', '*.jsonl')):
    if os.path.basename(os.path.dirname(path)) == 'coverage':
        continue
    for line in open(path, encoding='utf-8'):
        if not line.strip():
            continue
        r = json.loads(line)
        ids.add(r['id'])
        if r.get('stub') and r['id'] in existing:
            continue
        existing[r['id']] = r
        if r.get('wikidata') and not r.get('stub'):
            by_qid.setdefault(r['wikidata'], r['id'])
for r in list(existing.values()):
    if r.get('wikidata') and r['wikidata'] not in by_qid:
        by_qid[r['wikidata']] = r['id']
grid = defaultdict(list)  # 1-degree buckets of existing places, for "same place nearby"
for r in existing.values():
    if r['kind'] == 'place' and isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float)):
        grid[(int(r['lon'] // 1), int(r['lat'] // 1))].append((r['id'], (r['lon'], r['lat']), norm(r.get('name'))))
say(f'existing: {len(existing)} records, {len(by_qid)} with Wikidata ids')

new = {}  # id -> record, everything this build writes


def uid(base):
    i, rid = 2, base
    while rid in ids or rid in new:
        rid, i = f'{base}_{i}', i + 1
    return rid


def near_place(lon, lat, name, rkm=6, any_km=0):
    """An existing or new place of the same name within rkm (or any place within any_km)."""
    n = norm(name)
    best = None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for pid, pt, pn in grid.get((int(lon // 1) + dx, int(lat // 1) + dy), []):
                d = km((lon, lat), pt)
                if (d <= rkm and n and pn and (pn == n or (len(n) > 4 and (pn.startswith(n) or n.startswith(pn))))) or d <= any_km:
                    if not best or d < best[0]:
                        best = (d, pid)
    return best[1] if best else None


def add_place(rec):
    new[rec['id']] = rec
    if rec.get('wikidata'):
        by_qid.setdefault(rec['wikidata'], rec['id'])
    grid[(int(rec['lon'] // 1), int(rec['lat'] // 1))].append((rec['id'], (rec['lon'], rec['lat']), norm(rec['name'])))
    return rec['id']


def place_id(name, lon, lat, q=None, src=None, subtype='city', extra=None):
    """Find or make the place record for a birth place, residence or event location."""
    if q and q in by_qid:
        return by_qid[q]
    if not name:
        return None
    hit = near_place(lon, lat, name)
    if hit:
        return hit
    rec = {'id': uid('place:' + slug(name)), 'kind': 'place', 'subtype': subtype, 'name': name,
           'lat': round(lat, 4), 'lon': round(lon, 4), 'lenses': ['geography'], 'status': 'sourced',
           'sources': [src or wd_src(q, 'place coordinates')]}
    if q:
        rec['wikidata'] = q
    if extra:
        rec.update(extra)
    return add_place(rec)


ROLE_WORDS = [  # description keyword -> role, lens
    (r'\b(president|emperor|empress|king|queen|sultan|sultana|shah|caliph|khan|maharaja|raja|rani|pharaoh|monarch|ruler|tsar|chief|chieftain|mansa|negus|oba|regent|prince|princess)\b', 'ruler', 'law'),
    (r'\b(general|admiral|warrior|commander|military|soldier|conqueror|samurai|shogun)\b', 'general', 'military'),
    (r'\b(philosopher|thinker)\b', 'philosopher', 'ideas'),
    (r'\b(mathematician|astronomer|physician|scientist|engineer|alchemist|geographer|inventor|botanist|chemist)\b', 'scientist', 'ideas'),
    (r'\b(poet|poetess|writer|novelist|playwright|dramatist|author|historian|chronicler|scholar|lexicographer|grammarian|calligrapher|translator|essayist)\b', 'writer', 'literature'),
    (r'\b(monk|nun|priest|saint|bishop|imam|rabbi|guru|lama|patriarch|pope|theologian|mystic|sufi|missionary|prophet|religious|cleric|abbot|ascetic)\b', 'religious_figure', 'religion'),
    (r'\b(painter|sculptor|architect|artist|musician|composer|singer|dancer)\b', 'artist', 'art'),
    (r'\b(merchant|trader|banker|businessman|businesswoman|explorer|navigator|traveller|traveler)\b', 'merchant', 'economy'),
    (r'\b(politician|official|minister|statesman|diplomat|governor|bureaucrat|chancellor|vizier|magistrate|jurist|judge|lawyer)\b', 'official', 'law'),
]


def roles_of(text):
    t = (text or '').lower()
    out = []
    for rx, role, lens in ROLE_WORDS:
        if re.search(rx, t):
            out.append((role, lens))
    return out


# ---------------------------------------------------------------- counts as they stand (to set per-region targets)
def region_at(pt):
    return R.at(*pt) if pt else None


placept = {rid: (r['lon'], r['lat']) for rid, r in existing.items() if r['kind'] == 'place' and isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float))}


def where(r):
    if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float)):
        return (r['lon'], r['lat'])
    for p in (r.get('place'), (r.get('born') or {}).get('place')):
        if isinstance(p, str):
            if p in placept:
                return placept[p]
            if p in new and 'lat' in new[p]:
                return (new[p]['lon'], new[p]['lat'])
    return None


def when(r):
    for v in (r.get('start'), (r.get('born') or {}).get('year')):
        if isinstance(v, int):
            return v
    return None


def tally(kind):
    t = defaultdict(Counter)
    for src in (existing, new):
        for r in src.values():
            if r['kind'] != kind or r.get('stub'):
                continue
            pt, y = where(r), when(r)
            if pt and y is not None:
                t[region_at(pt) or 'sea'][century(y)] += 1
    return t


# ================================================================ people
pan_n = 0
pan_path = RAW + '/pantheon/person_2025_update.csv.bz2'
PAN_CITE = {'cite': 'Pantheon 2025 update (Yu et al. 2016, pantheon.world), CC BY 4.0', 'url': 'https://pantheon.world/data/datasets'}
cand_pan = []
pan_name = {}  # Wikidata id -> English name, for CBDB people Pantheon also knows
if os.path.exists(pan_path):
    for r in csv.DictReader(bz2.open(pan_path, 'rt', encoding='utf-8')):
        pan_name[r['wd_id']] = r['name']
        if r['alive'] == 'TRUE' or not r['bplace_lat'] or not r['birthyear'] or r['wd_id'] in by_qid or r.get('is_group') == 'TRUE':
            continue
        pt = (float(r['bplace_lon']), float(r['bplace_lat']))
        g = region_at(pt)
        if not g or g == 'europe':
            continue
        cand_pan.append((g, int(float(r['birthyear'])), float(r['hpi'] or 0), r, pt))
    cap = Counter()
    for g, by, hpi, r, pt in sorted(cand_pan, key=lambda x: -x[2]):
        c = century(by)
        lim = 10 ** 6 if by < 1800 else (500 if by < 1900 else 300)
        if cap[(g, c)] >= lim:
            continue
        cap[(g, c)] += 1
        bp = place_id(r['bplace_name'], pt[0], pt[1], None, PAN_CITE)
        dp = None
        if r['dplace_lat'] and r['dplace_name']:
            dp = place_id(r['dplace_name'], float(r['dplace_lon']), float(r['dplace_lat']), None, PAN_CITE)
        occ = (r['occupation'] or '').lower()
        rl = roles_of(occ)
        rec = {'id': uid('person:' + slug(r['name'])), 'kind': 'person', 'name': r['name'],
               'lenses': sorted({'people'} | {l for _, l in rl}), 'roles': [occ.replace(' ', '_')] if occ else [],
               'start': by, 'born': {'year': by, 'place': bp}, 'wikidata': r['wd_id'],
               'ext': {'pantheon': r['id'], 'wikipedia': r['slug']}, 'fame': round(hpi, 1), 'region': g,
               'sources': [PAN_CITE], 'status': 'sourced'}
        if not r['birthdate']:
            rec['start_approx'] = True
        if r['deathyear']:
            dy = int(float(r['deathyear']))
            if by <= dy <= by + 110:  # longer lives are data errors (calendar slips, wrong person)
                rec['end'] = dy
                rec['died'] = {'year': dy, 'place': dp} if dp else {'year': dy}
        new[rec['id']] = rec
        by_qid[r['wd_id']] = rec['id']
        pan_n += 1
say(f'pantheon: {pan_n} people added (of {len(cand_pan)} non-European candidates)')

# ---- Wikidata people, with CBDB enrichment for China
cbdb = {}
if os.path.exists(CR + '/cbdb_people.json'):
    for p in json.load(open(CR + '/cbdb_people.json')):
        cbdb[p['pid']] = p
cb_by_q = {p['qid']: p for p in cbdb.values() if p.get('qid')}
people = {}
for f in glob.glob(CR + '/people/*.json'):
    for row in json.load(open(f)):
        q = qid(row['p'])
        p = people.setdefault(q, {'q': q, 'sl': int(row.get('sl', 0)), 'label': row.get('label'), 'desc': row.get('desc'), 'pl': {}})
        for k in ('b', 'd', 'fl', 'ws'):
            if row.get(k) and k not in p:
                p[k] = row[k]
        pt = point(row.get('coord'))
        prop = qid(row['prop'])
        if pt:
            p['pl'].setdefault(prop, (qid(row['plc']), pt))
for name, prop in (('office', 'P39'), ('citizenship', 'P27')):
    f = f'{CR}/global_{name}.json'
    if not os.path.exists(f):
        continue
    for row in json.load(open(f)):
        q = qid(row['p'])
        p = people.setdefault(q, {'q': q, 'sl': int(row.get('sl', 0)), 'label': row.get('label'), 'desc': row.get('desc'), 'pl': {}})
        for k in ('b', 'd', 'fl', 'ws'):
            if row.get(k) and k not in p:
                p[k] = row[k]
        pt = point(row.get('coord'))
        if pt and prop not in p['pl']:
            p['pl'][prop] = (qid(row['plc']), pt, row.get('plcLabel'))
say(f'wikidata people pool: {len(people)}')

cands = []  # (region, year, score, builder)
for q, p in people.items():
    if q in by_qid or not p.get('label') or re.match(r'^Q\d+$', p['label'] or ''):
        continue
    by = wd_year(p.get('b'))[0]
    y = by if by is not None else (wd_year(p.get('fl'))[0] or wd_year(p.get('ws'))[0] or wd_year(p.get('d'))[0])
    if y is None or y >= 1900:
        continue
    loc = p['pl'].get('P19') or p['pl'].get('P937') or p['pl'].get('P551') or p['pl'].get('P20') or p['pl'].get('P39') or p['pl'].get('P27')
    if not loc:
        continue
    g = region_at(loc[1])
    if not g or g == 'europe':
        continue
    cb = cb_by_q.get(q)
    cands.append((g, y, p['sl'] + (0.5 if cb else 0), ('wd', p, y, by, cb)))
inpool = {c[3][1]['q'] for c in cands}
for p in cbdb.values():
    if p.get('qid') and (p['qid'] in inpool or p['qid'] in by_qid):
        continue
    y = p['by'] or p['iy'] or p['dy']
    if not y or y >= 1900:
        continue
    g = region_at((p['x'], p['y']))
    if g != 'east_asia':
        continue
    cands.append((g, y, max(p['sl'], min(4, p['posts'] / 6)), ('cb', p, y, p['by'], p)))
say(f'person candidates outside Europe: {len(cands)}')

label_cache_path = CR + '/place_labels.json'
place_labels = json.load(open(label_cache_path)) if os.path.exists(label_cache_path) else {}


def make_wd_person(p, y, by, cb):
    q = p['q']
    loc = p['pl'].get('P19')
    born = {'year': by} if by is not None else None
    rec = {'id': uid('person:' + slug(p['label'])), 'kind': 'person', 'name': p['label'], 'wikidata': q,
           'start': y, 'sources': [wd_src(q, 'people tied to places outside Europe')], 'status': 'sourced', 'fame_sitelinks': p['sl']}
    if by is None:
        rec['start_approx'] = True
        rec['tags'] = ['floruit']
    for prop in ('P19', 'P937', 'P551', 'P20'):
        if prop in p['pl']:
            pq, pt = p['pl'][prop][:2]
            pid = place_id(place_labels.get(pq), pt[0], pt[1], pq)
            if pid:
                if prop == 'P19':
                    born = dict(born or {}, place=pid)
                elif 'place' not in rec:
                    rec['place'] = pid
                if prop == 'P20':
                    rec.setdefault('_dplace', pid)
            if prop == 'P19' and not pid:
                rec['lat'], rec['lon'] = round(pt[1], 4), round(pt[0], 4)
    if 'place' not in rec and not (born or {}).get('place') and 'lat' not in rec:
        for prop in ('P19', 'P937', 'P551', 'P20', 'P39', 'P27'):
            if prop in p['pl']:
                v = p['pl'][prop]
                rec['lat'], rec['lon'] = round(v[1][1], 4), round(v[1][0], 4)
                if prop in ('P39', 'P27'):
                    # only the state or office seat is known: the point is that polity's, not the person's
                    rec['conf'] = 'approximate'
                    rec['tags'] = rec.get('tags', []) + ['placed_by_state']
                    if len(v) > 2 and v[2]:
                        rec['state'] = v[2]
                break
    if born:
        rec['born'] = born
    dy = wd_year(p.get('d'))[0]
    if dy is not None and y <= dy <= y + 110:
        rec['end'] = dy
        rec['died'] = {'year': dy}
        if rec.get('_dplace'):
            rec['died']['place'] = rec['_dplace']
    rec.pop('_dplace', None)
    if p.get('desc'):
        rec['what'] = p['desc'][:1].upper() + p['desc'][1:]
    rl = roles_of(p.get('desc'))
    if cb:
        rec['alt_names'] = [cb['chn']] if cb.get('chn') else []
        rec['ext'] = {'cbdb': str(cb['pid'])}
        rec['sources'].append(CB_CITE(cb['pid']))
        if cb.get('office'):
            rl.append(('official', 'law'))
            rec.setdefault('what', f"{cb.get('dyn') or ''} official; last recorded post: {cb['office']}".strip())
    rec['roles'] = sorted({r for r, _ in rl})
    rec['lenses'] = sorted({'people'} | {l for _, l in rl})
    return rec


def CB_CITE(pid):
    return {'cite': f'China Biographical Database (CBDB), Harvard/Academia Sinica/Peking University, SQLite of 2026-10-24, person {pid} (CC BY-NC-SA 4.0)',
            'url': f'https://projects.iq.harvard.edu/cbdb'}


def make_cb_person(p):
    y = p['by'] or p['iy'] or p['dy']
    pid = place_id(p['addr'], p['x'], p['y'], None, CB_CITE(p['pid']), extra={'alt_names': [p['addr_chn']]} if p.get('addr_chn') else None)
    name = pan_name.get(p.get('qid')) or (people.get(p.get('qid')) or {}).get('label') or p['name']
    rec = {'id': uid('person:' + slug(name)), 'kind': 'person', 'name': name, 'start': y,
           'alt_names': [x for x in (p['chn'], p['name'] if name != p['name'] else None) if x], 'ext': {'cbdb': str(p['pid'])},
           'sources': [CB_CITE(p['pid'])], 'status': 'sourced', 'fame_sitelinks': p.get('sl', 0)}
    if p.get('qid'):
        rec['wikidata'] = p['qid']
    if p['by']:
        rec['born'] = {'year': p['by']}
    else:
        rec['start_approx'] = True
        rec['tags'] = ['index_year']
    # CBDB's index address is the native place (jiguan) for most people, not always the birth place
    rec['place'] = pid
    if p['dy'] and y <= p['dy'] <= y + 110:
        rec['end'] = p['dy']
        rec['died'] = {'year': p['dy']}
    bits = [p.get('dyn')]
    if p.get('office'):
        bits.append(f"official; last recorded post: {p['office']}")
    elif p.get('status'):
        bits.append(p['status'])
    rec['what'] = ' '.join(b for b in bits if b)
    rl = roles_of(p.get('status')) + ([('official', 'law')] if p.get('office') else [])
    rec['roles'] = sorted({r for r, _ in rl})
    rec['lenses'] = sorted({'people'} | {l for _, l in rl})
    return rec


# labels for the places the chosen people will need: fetch missing ones once (cached)
def need_labels(chosen):
    want = set()
    for kind, p, *_ in chosen:
        if kind == 'wd':
            for prop, v in p['pl'].items():
                pq = v[0]
                if prop in ('P19', 'P937', 'P551', 'P20') and pq not in by_qid and pq not in place_labels:
                    want.add(pq)
    if not want:
        return
    import wdq
    wdq.RAW = CR
    wdq.ENDPOINT = 'https://query.wikidata.org/sparql'  # plain label lookups are quick there; QLever rate-limits big VALUES lists
    want = sorted(want)
    say(f'fetching labels for {len(want)} places')
    for i in range(0, len(want), 200):
        vals = ' '.join('wd:' + q for q in want[i:i + 200])
        try:
            rows = wdq.sparql(f'SELECT ?i ?l WHERE {{ VALUES ?i {{ {vals} }} ?i rdfs:label ?l FILTER(LANG(?l) = "en") }}', tries=4, timeout=120)
        except Exception as e:
            say('  label batch failed', e)
            continue
        for r in rows:
            place_labels[qid(r['i'])] = r['l']
    json.dump(place_labels, open(label_cache_path, 'w'), ensure_ascii=False)


eu_people = tally('person')['europe']
have = tally('person')
chosen, take = [], Counter()
for g, y, score, b in sorted(cands, key=lambda c: -c[2]):
    c = century(y)
    target = min(400, max(40, eu_people[c] // 2))
    if score >= 25 or have[g][c] + take[(g, c)] < target:
        take[(g, c)] += 1
        chosen.append(b)
need_labels(chosen)
wd_n = cb_n = 0
for kind, p, y, by, cb in chosen:
    if kind == 'wd':
        rec = make_wd_person(p, y, by, cb if cb and cb.get('qid') == p['q'] else None)
        wd_n += 1
    else:
        rec = make_cb_person(p)
        cb_n += 1
    new[rec['id']] = rec
    if rec.get('wikidata'):
        by_qid[rec['wikidata']] = rec['id']
say(f'people: {wd_n} from Wikidata, {cb_n} from CBDB only')

# ================================================================ places
# CHGIS v6 seats: one place per seat (points within ~2 km), with its names through time
chgis_n = 0
try:
    import shapefile
    seats = defaultdict(list)
    for n in ('pref', 'cnty'):
        base = f'{CR}/chgis/v6_time_{n}_pts_utf_wgs84'
        if not os.path.exists(base + '.shp'):
            continue
        s = shapefile.Reader(base, encoding='utf-8')
        for sh, r in zip(s.shapes(), s.records()):
            if not sh.points or r['BEG_YR'] is None:
                continue
            x, y = sh.points[0]
            seats[(round(x / 0.02), round(y / 0.02))].append((x, y, r))
    CH_CITE = {'cite': 'CHGIS, Version 6 (Harvard Yenching Institute and Fudan Center for Historical Geography, 2016), time series prefecture and county points', 'url': 'https://doi.org/10.7910/DVN/WW1PD6'}
    for key, rows in seats.items():
        rows.sort(key=lambda t: (t[2]['BEG_YR'], -(t[2]['END_YR'] or 0)))
        x, y = rows[0][0], rows[0][1]
        names = [[t[2]['BEG_YR'], t[2]['END_YR'], t[2]['NAME_PY'], t[2]['NAME_CH'], t[2]['TYPE_PY']] for t in rows]
        longest = max(rows, key=lambda t: (t[2]['END_YR'] or 1911) - t[2]['BEG_YR'])[2]
        base_name = re.sub(r'\s+(Zhou|Fu|Jun|Xian|Jian|Lu|Dao|Ting|Wei|Junmin Fu|Zhili Zhou|Zhili Ting|Guo)$', '', longest['NAME_PY'] or '') or longest['NAME_PY']
        if not base_name:
            continue
        if near_place(x, y, base_name, rkm=8, any_km=1.5):
            continue
        b0 = min(t[2]['BEG_YR'] for t in rows)
        e0 = max(t[2]['END_YR'] or 1911 for t in rows)
        b0 = b0 - 1 if b0 <= 0 else b0
        e0 = e0 - 1 if e0 <= 0 else e0
        rec = {'id': uid('place:cn:' + slug(base_name)), 'kind': 'place', 'subtype': 'city', 'name': base_name,
               'lat': round(y, 4), 'lon': round(x, 4), 'start': b0, 'lenses': ['geography', 'law'], 'tags': ['admin_seat'],
               'alt_names': sorted({n[2] for n in names if n[2]} | {n[3] for n in names if n[3]}),
               'what': 'Seat of ' + ', then '.join(f"{n[2]} ({n[0] if n[0] > 0 else str(1 - n[0]) + ' BCE'}–{n[1]})" for n in names[:4]) + ('…' if len(names) > 4 else ''),
               'ext': {'chgis': str(longest['SYS_ID'])}, 'sources': [CH_CITE], 'status': 'sourced'}
        if longest['PRES_LOC']:
            rec['today'] = longest['PRES_LOC']
        if e0 < 1911 and e0 >= b0:
            rec['end'] = e0
        add_place(rec)
        chgis_n += 1
except ImportError:
    say('chgis: skipped (pip install pyshp)')
say(f'chgis: {chgis_n} seats added')

# al-Thurayya: the towns and stations of the 10th-century geographers
th_n = 0
thp = CR + '/thurayya/places.geojson'
TH_TYPES = {'metropoles': 'city', 'capitals': 'city', 'towns': 'city', 'villages': 'city', 'waystations': 'site', 'sites': 'site'}
if os.path.exists(thp):
    TH_CITE = {'cite': 'al-Thurayya Gazetteer (Masoumeh Seydi and Maxim Romanov), after Georgette Cornu, Atlas du monde arabo-islamique à l’époque classique (1983)', 'url': 'https://althurayya.github.io/'}
    for f in json.load(open(thp))['features']:
        c = f['properties']['cornuData']
        t = c.get('top_type_hom')
        if t not in TH_TYPES:
            continue
        lon, lat = f['geometry']['coordinates'][:2]
        name = c.get('toponym_search') or c.get('toponym_buckwalter')
        if not name or near_place(lon, lat, name, rkm=10, any_km=1):
            continue
        rec = {'id': uid('place:thurayya:' + slug(name)), 'kind': 'place', 'subtype': TH_TYPES[t], 'name': c.get('toponym_translit') or name,
               'lat': round(lat, 4), 'lon': round(lon, 4), 'lenses': ['geography'] + (['economy'] if t == 'waystations' else []),
               'attested': [900, 1000], 'alt_names': [x for x in {c.get('toponym_arabic'), name} if x],
               'what': f"{ {'metropoles': 'Metropolis', 'capitals': 'Provincial capital', 'towns': 'Town', 'villages': 'Village', 'waystations': 'Way station', 'sites': 'Site'}[t] } of {c.get('region_spelled') or c.get('region_code')} in the classical Arabic geographies",
               'ext': {'thurayya': c.get('cornu_URI')}, 'tags': ['thurayya', t], 'sources': [TH_CITE], 'status': 'sourced'}
        if c.get('coord_certainty') and c['coord_certainty'] != 'certain':
            rec['tags'].append('location_uncertain')
        add_place(rec)
        th_n += 1
say(f'al-thurayya: {th_n} places added')

# ================================================================ Wikidata dated things: sites, buildings, settlements, events
EV_WORDS = r'battle|war\b|siege|treaty|earthquake|eruption|flood|famine|rebellion|revolt|uprising|massacre|council|synod|conference|expedition|coronation|epidemic|plague|fire\b|conquest|invasion|raid|sack\b|mutiny|revolution|riot|coup|assassination|tsunami|cyclone|typhoon|shipwreck|pogrom'
SETTLE = r'\b(city|town|village|settlement|capital|port|municipality|commune|ancient city|human settlement|oasis|metropolis|county seat)\b'
SITE = r'archaeolog|ruin|temple|mosque|church|palace|fort|castle|stupa|pagoda|monaster|tomb|mausoleum|shrine|cathedral|bridge|wall|dam\b|canal|pyramid|cave|citadel|madrasa|gate|tower|observatory|garden|basilica|minaret|step ?well|rock-cut|inscription|stele|monument|caravanserai|aqueduct|vihara|matha|gurdwara|synagogue|necropolis|mound|geoglyph|statue|library|school|university|college|market|bazaar|bath|lighthouse|harbour|harbor|reservoir|tank|lake|irrigation'
th_rows = {}
for f in glob.glob(CR + '/things/*.json') + glob.glob(CR + '/things2/*.json'):
    for row in json.load(open(f)):
        q = qid(row['i'])
        if q in th_rows or q in by_qid:
            continue
        th_rows[q] = row
thing_counts = Counter()
eu_pl, have_pl, take_pl = tally('place')['europe'], tally('place'), Counter()
for q, row in sorted(th_rows.items(), key=lambda kv: -int(kv[1].get('sl', 0))):
    label, cls, sl = row.get('label'), (row.get('cls') or '').lower(), int(row.get('sl', 0))
    pt = point(row.get('coord'))
    y = int(row['y']) if row.get('y') not in (None, '') else None
    if not label or not pt or y is None or re.match(r'^Q\d+$', label):
        continue
    y = y - 1 if y <= 0 else y
    g = region_at(pt)
    if not g or g == 'europe':
        continue
    end = int(row['end']) if row.get('end') not in (None, '') else None
    if end is not None:
        end = end - 1 if end <= 0 else end
        if end < y:
            end = None
    text = cls + ' ' + (row.get('desc') or '').lower()
    if re.search(EV_WORDS, cls):
        continue  # events come from the deep dump below, with their own classes
    if re.search(SETTLE, cls):
        sub, need = 'city', (6 if y < 1500 else 8)
    elif re.search(SITE, text):
        sub, need = 'site', 6
    else:
        continue
    c = century(y)
    if sl < need and have_pl[g][c] + take_pl[(g, c)] >= max(30, eu_pl[c] // 5):
        continue  # below the global bar, and this region-century already has enough places
    if near_place(pt[0], pt[1], label, rkm=3):
        continue
    take_pl[(g, c)] += 1
    rec = {'id': uid('place:' + slug(label)), 'kind': 'place', 'subtype': sub, 'name': label, 'lat': round(pt[1], 4), 'lon': round(pt[0], 4),
           'start': y, 'start_approx': True, 'wikidata': q, 'lenses': ['geography'] + (['art'] if sub == 'site' and re.search(r'temple|mosque|church|palace|stupa|pagoda|tomb|mausoleum|shrine|cathedral|basilica|minaret|madrasa', text) else []),
           'sources': [wd_src(q, 'dated sites and settlements outside Europe')], 'status': 'sourced', 'fame_sitelinks': sl}
    if re.search(r'temple|mosque|church|stupa|pagoda|monaster|shrine|cathedral|vihara|matha|synagogue|gurdwara|madrasa', text):
        rec['lenses'].append('religion')
    if end is not None:
        rec['end'] = end
    if row.get('desc'):
        rec['what'] = row['desc'][:1].upper() + row['desc'][1:]
    if cls:
        rec['tags'] = [slug(cls, 40)]
    add_place(rec)
    thing_counts[sub] += 1
say(f'wikidata things: {dict(thing_counts)} added from {len(th_rows)} rows')

# ================================================================ events from the deep dump
FAMILY = {  # deep type -> (subtype, lenses)
    'battle': ('battle', ['military']), 'siege': ('siege', ['military']), 'war': ('war', ['military']), 'campaign': ('campaign', ['military']),
    'conquest': ('conquest', ['military', 'order']), 'invasion': ('invasion', ['military']), 'expedition': ('expedition', ['military', 'geography']),
    'massacre': ('massacre', ['military', 'order']), 'genocide': ('genocide', ['order']), 'pogrom': ('pogrom', ['order', 'religion']),
    'rebellion': ('revolt', ['order']), 'revolution': ('revolution', ['order', 'law']), 'riot': ('riot', ['order']), 'coup': ('coup', ['order', 'law']),
    'mutiny': ('mutiny', ['military', 'order']), 'protest': ('protest', ['order']), 'strike': ('strike', ['order', 'economy']),
    'assassination': ('assassination', ['order', 'people']), 'coronation': ('coronation', ['law', 'people']), 'independence': ('independence', ['law', 'order']),
    'treaty': ('treaty', ['law']), 'conference': ('conference', ['law']), 'peace_conference': ('treaty', ['law']), 'congress': ('conference', ['law']),
    'election': ('election', ['law']), 'referendum': ('referendum', ['law']), 'council': ('council', ['religion']), 'synod': ('council', ['religion']),
    'earthquake': ('earthquake', ['geography']), 'eruption': ('eruption', ['geography']), 'flood': ('flood', ['geography']), 'tsunami': ('tsunami', ['geography']),
    'disaster': ('disaster', ['geography']), 'fire': ('fire', ['order']), 'famine': ('famine', ['disease', 'population']), 'epidemic': ('epidemic', ['disease']),
    'shipwreck': ('shipwreck', ['economy']), 'worlds_fair': ('fair', ['economy', 'ideas']),
}
ev = {}
for f in sorted(glob.glob(RAW + '/deep/ev_*.json')):
    typ = re.match(r'ev_(.+?)_-?\d+_-?\d+\.json$', os.path.basename(f)).group(1)
    if typ == 'crusade' or typ not in FAMILY:
        continue  # the crusade files hold ecumenical councils (a class mix-up), councils come from ev_council
    try:
        rows = json.load(open(f))
    except ValueError:
        continue
    for row in rows:
        q = qid(row.get('item'))
        if not q or q in by_qid or q in ev:
            continue
        pt = point(row.get('coord')) or point(row.get('lcoord'))
        y, date = wd_year(row.get('t'))
        label = row.get('itemLabel')
        if not pt or y is None or not label or re.match(r'^Q\d+$', label):
            continue
        g = region_at(pt)
        if not g or g == 'europe':
            continue
        ev[q] = (g, y, date, int(row.get('links') or 0), typ, label, pt, row)
eu_ev = tally('event')['europe']
have_ev = tally('event')
take_ev = Counter()
ev_n = 0
for q, (g, y, date, sl, typ, label, pt, row) in sorted(ev.items(), key=lambda kv: -kv[1][3]):
    c = century(y)
    target = max(30, eu_ev[c] // 3)
    if not (sl >= 6 or have_ev[g][c] + take_ev[(g, c)] < target):
        continue
    if sl < 2:
        continue
    take_ev[(g, c)] += 1
    sub, lenses = FAMILY[typ]
    rec = {'id': uid('event:' + slug(label) + '_' + q.lower()), 'kind': 'event', 'subtype': sub, 'name': label, 'start': y,
           'lat': round(pt[1], 4), 'lon': round(pt[0], 4), 'lenses': lenses, 'wikidata': q,
           'sources': [wd_src(q, f'{typ.replace("_", " ")} events with a date and a place')], 'status': 'sourced', 'fame_sitelinks': sl}
    if date:
        rec['date'] = date
    if row.get('p') and int(row['p']) < 9:
        rec['start_approx'] = True
    if row.get('itemDescription'):
        rec['what'] = row['itemDescription'][:1].upper() + row['itemDescription'][1:]
    if row.get('partLabel'):
        rec['part_of'] = row['partLabel']
    if sub in ('siege', 'massacre', 'fire', 'earthquake', 'tsunami', 'eruption', 'genocide', 'pogrom', 'conquest'):
        rec['destructive'] = True
    new[rec['id']] = rec
    by_qid[q] = rec['id']
    ev_n += 1
say(f'events: {ev_n} added from {len(ev)} non-European candidates in the deep dump')

# ================================================================ curated rows
cur = os.path.join(HERE, 'curated.jsonl')
cur_n = 0
if os.path.exists(cur):
    for line in open(cur, encoding='utf-8'):
        if line.strip() and not line.startswith('//'):
            r = json.loads(line)
            if r['id'] in existing and not existing[r['id']].get('stub'):
                continue  # someone already owns a full record; adopt only stubs
            new[r['id']] = r
            cur_n += 1
say(f'curated: {cur_n} records')

# ================================================================ write
for r in new.values():
    r.pop('region', None)
files = defaultdict(list)
for r in new.values():
    if r.get('status') == 'draft':
        files['curated'].append(r)
    else:
        files[{'person': 'people', 'place': 'places', 'event': 'events'}.get(r['kind'], 'other')].append(r)
for old in glob.glob(OUT + '/*.jsonl'):
    os.remove(old)
for name, rs in files.items():
    with open(f'{OUT}/{name}.jsonl', 'w', encoding='utf-8') as f:
        for r in sorted(rs, key=lambda r: r['id']):
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    say(f'wrote data/coverage/{name}.jsonl: {len(rs)}')
open(os.path.join(OUT, 'report', 'build-log.txt'), 'w').write('\n'.join(log) + '\n')
