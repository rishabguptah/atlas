# Build the Europe 1789-1914 deep-zoom records from the raw Wikidata and Pantheon downloads and the study spine.
# Usage: python3 ingest/europe-19c/build.py      (reads /mnt/project-files/atlas/raw/europe-19c/, writes data/europe-19c/)
#
# One record per real thing: when another workstream already has a record with the same Wikidata id (a battle in
# states-war, a city in places-people), this writes a stub with that id that adds the day-level date and the study
# fields; the owner's fields win when the build merges them.
import bz2, csv, glob, json, math, os, re, sys, unicodedata
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from wdq import RAW, qid, point
from spine import STORIES, QIDS, SAME

REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'data', 'europe-19c')
Y0, Y1 = 1789, 1914
BOX = (-25, 34, 50, 72)          # lon0, lat0, lon1, lat1: Europe, Anatolia's west and the Caucasus' edge
TODAY = '2026-10-25'
WD = lambda q: {'cite': f'Wikidata (CC0), query of {TODAY}', 'url': f'https://www.wikidata.org/wiki/{q}'}
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')[:60] or 'x'


def inbox(lon, lat):
    return BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]


def iso(t, p):
    """Wikidata time + precision -> 'YYYY-MM-DD' (day), 'YYYY-MM' (month), 'YYYY' (year) or None (coarser)."""
    p = int(p)
    if p >= 11: return t[:10]
    if p == 10: return t[:7]
    if p == 9: return t[:4]
    return None


def owners():
    """Wikidata id -> existing record id, from every other workstream's records."""
    idx = {}
    for f in sorted(glob.glob(os.path.join(REPO, 'data', '*', '*.jsonl'))):
        if os.path.dirname(f) == OUT:
            continue
        for line in open(f, encoding='utf-8'):
            r = json.loads(line)
            if r.get('wikidata') and not r.get('stub') and r['kind'] != 'measure':
                idx.setdefault(r['wikidata'], r['id'])
    return idx


# ---------- events ----------
# Raw class -> (subtype, lenses, family). Family drives the map shape and the chronicle filter.
CLS = {
    'battle': ('battle', ['military'], 'war'), 'siege': ('siege', ['military'], 'war'),
    'war': ('war', ['military', 'order'], 'war'), 'campaign': ('campaign', ['military'], 'war'), 'expedition': ('expedition', ['military'], 'war'),
    'revolution': ('revolution', ['order'], 'unrest'), 'rebellion': ('revolt', ['order', 'military'], 'unrest'), 'coup': ('coup', ['order'], 'unrest'),
    'mutiny': ('mutiny', ['order', 'military'], 'unrest'), 'riot': ('riot', ['order'], 'unrest'), 'protest': ('protest', ['order'], 'unrest'),
    'strike': ('strike', ['order', 'economy'], 'unrest'), 'massacre': ('massacre', ['order'], 'unrest'), 'pogrom': ('pogrom', ['order', 'religion'], 'unrest'),
    'assassination': ('assassination', ['order', 'people'], 'unrest'),
    'treaty': ('treaty', ['law'], 'diplomacy'), 'peace_conference': ('congress', ['law'], 'diplomacy'), 'conference': ('congress', ['law'], 'diplomacy'),
    'congress': ('congress', ['law', 'ideas'], 'diplomacy'), 'independence': ('independence', ['law', 'order'], 'diplomacy'),
    'referendum': ('referendum', ['law'], 'diplomacy'), 'coronation': ('coronation', ['order', 'people'], 'diplomacy'),
    'worlds_fair': ('exhibition', ['economy', 'ideas'], 'culture'),
    'epidemic': ('epidemic', ['disease'], 'disaster'), 'famine': ('famine', ['disease', 'population'], 'disaster'),
    'earthquake': ('earthquake', ['geography'], 'disaster'), 'fire': ('fire', ['geography'], 'disaster'),
    'shipwreck': ('shipwreck', ['economy'], 'disaster'), 'disaster': ('disaster', ['geography'], 'disaster'),
}
PRI = list(CLS)  # earlier classes win when an item is in several


def load_events():
    items = {}
    for f in sorted(glob.glob(os.path.join(RAW, 'ev_*.json'))):
        cls = os.path.basename(f)[3:-5]
        if cls not in CLS:
            continue
        for r in json.load(open(f)):
            c = r.get('coord') or r.get('lcoord')
            if not c or 'Point(' not in c:
                continue
            try:
                lon, lat = point(c)
            except ValueError:
                continue
            if not inbox(lon, lat):
                continue
            q = qid(r['item'])
            if not r.get('itemLabel') or r['itemLabel'] == q:
                continue
            it = items.setdefault(q, {'q': q, 'name': r['itemLabel'], 'what': r.get('itemDescription'), 'cls': set(), 'dates': set(),
                                      'ends': set(), 'lon': lon, 'lat': lat, 'direct': bool(r.get('coord')), 'links': int(r.get('links', 0)), 'part': {}})
            it['cls'].add(cls)
            if r.get('coord') and not it['direct']:
                it['lon'], it['lat'], it['direct'] = lon, lat, True
            d = iso(r['t'], r['p'])
            if d: it['dates'].add(d)
            if r.get('e') and r.get('ep'):
                e = iso(r['e'], r['ep'])
                if e: it['ends'].add(e)
            if r.get('part') and r.get('partLabel'):
                it['part'][qid(r['part'])] = r['partLabel']
    out = []
    for it in items.values():
        if not it['dates']:
            continue
        # The most precise date wins, then the earliest; the latest end.
        best = max(len(d) for d in it['dates'])
        it['date'] = min(d for d in it['dates'] if len(d) == best)
        y = int(it['date'][:4])
        if not Y0 <= y <= Y1:
            continue
        ends = sorted(e for e in it['ends'] if e >= it['date'])
        it['end'] = ends[-1] if ends else None
        it['cls'] = min(it['cls'], key=PRI.index)
        out.append(it)
    return out


def event_record(it, own):
    sub, lenses, fam = CLS[it['cls']]
    y = int(it['date'][:4])
    rid = own.get(it['q'])
    rec = {'id': rid or f"event:{slug(it['name'])}_{it['q'].lower()}", 'kind': 'event', 'subtype': sub, 'name': it['name'],
           'lenses': lenses, 'start': y, 'end': int(it['end'][:4]) if it['end'] else y, 'date': it['date']}
    if it['end'] and it['end'] != it['date']:
        rec['end_date'] = it['end']
    rec.update({'lat': round(it['lat'], 4), 'lon': round(it['lon'], 4), 'wikidata': it['q'], 'family': fam, 'sitelinks': it['links']})
    if not it['direct']:
        rec['place_note'] = 'pinned at its location (Wikidata P276)'
    if it['what']:
        rec['what'] = it['what'][0].upper() + it['what'][1:] + ('' if it['what'].endswith('.') else '.')
    if it['part']:
        rec['part_of'] = [{'name': n, 'wikidata': q} for q, n in sorted(it['part'].items())][:3]
    rec['sources'] = [WD(it['q'])]
    rec['status'] = 'sourced'
    if rid:
        rec['stub'] = True
    return rec


# ---------- spine ----------
def spine_records(own, by_q):
    rows = json.load(open(os.path.join(RAW, 'spine_qids.json'))) if os.path.exists(os.path.join(RAW, 'spine_qids.json')) else []
    import urllib.parse
    title_q = {urllib.parse.unquote(r['a'].rsplit('/wiki/', 1)[1]).replace('_', ' '): qid(r['i']) for r in rows}
    title_q.update(QIDS)
    recs, stories, checks, used = [], [], [], set()
    for sid, title, s, e, blurb, steps in STORIES:
        ids = []
        for date, place, lon, lat, name, what, why, wiki, lenses in sorted(steps, key=lambda x: x[0]):
            q = title_q.get(wiki)
            # A Wikipedia article can cover a whole war; only reuse its Wikidata id when this step is that thing.
            wd = by_q.get(q)
            same = wd is not None and (wiki in SAME or wd['date'][:7] == date[:7] or wd['date'][:4] == date[:4] and len(date) == 4)
            if wd is not None and not same:
                checks.append(f'{sid}: "{name}" {date} vs Wikidata {q} "{wd["name"]}" {wd["date"]}: kept as its own step (article covers more)')
                q = None
            rid = own.get(q) if q else None
            about = None
            if rid and not rid.startswith('event:'):   # the article is about a person, work or state: link it, keep the step
                about, rid = rid, None
            if not rid and q and q in by_q:
                rid = by_q[q]['rid']
            rid = rid or f'event:e19_{slug(name)}'
            while rid in used and rid.startswith('event:e19_'):
                rid += '_2'
            used.add(rid)
            y = int(date[:4])
            rec = {'id': rid, 'kind': 'event', 'subtype': 'event', 'name': name, 'lenses': lenses, 'start': y, 'end': y, 'date': date,
                   'lat': lat, 'lon': lon, 'place_name': place, 'what': what, 'why': why, 'story': sid,
                   'sources': [{'cite': f'Wikipedia: {wiki} (study spine written from it; check)', 'url': 'https://en.wikipedia.org/wiki/' + wiki.replace(' ', '_')}],
                   'status': 'draft'}
            if about:
                rec['links'] = [about]
            elif q:
                rec['wikidata'] = q
                if wd is not None and wd['date'] != date:
                    checks.append(f'{sid}: "{name}" spine {date}, Wikidata {wd["date"]}')
            if not about and (rid in own.values() or (q and q in by_q)):
                rec['stub'] = True  # same id as a sourced record: add the study text, keep its facts
            recs.append(rec)
            ids.append(rid)
        stories.append({'id': sid, 'title': title, 'start': s, 'end': e, 'blurb': blurb, 'steps': ids})
    return recs, stories, checks


def main():
    os.makedirs(os.path.join(OUT, 'geo'), exist_ok=True)
    own = owners()
    evs = load_events()
    recs, by_q = [], {}
    for it in evs:
        r = event_record(it, own)
        recs.append(r)
        by_q[it['q']] = {'rid': r['id'], 'date': r['date'], 'name': r['name']}
    spine, stories, checks = spine_records(own, by_q)
    # Spine steps that reuse a Wikidata event's id: merge into that record instead of a second line with the same id.
    by_id = {r['id']: r for r in recs}
    for s in spine:
        r = by_id.get(s['id'])
        if r is not None:
            for k in ('what', 'why', 'story', 'place_name'):
                r[k] = s[k]
            r['study_sources'] = s['sources']
            if s['date'] != r['date'] and (s['date'].startswith(r['date']) or s['date'][:7] != r['date'][:7]):
                # The spine is more precise, or (listed in SAME) Wikidata dates another stage of the same thing.
                if not s['date'].startswith(r['date']):
                    r['date_note'] = f"Wikidata gives {r['date']}; the study spine uses {s['date']} ({s['sources'][0]['cite'].split(' (')[0]})"
                r['date'], r['start'] = s['date'], int(s['date'][:4])
            s['merged'] = True
    spine = [s for s in spine if not s.get('merged')]
    with open(os.path.join(OUT, 'events.jsonl'), 'w', encoding='utf-8') as f:
        for r in sorted(recs, key=lambda r: (r['date'], r['id'])):
            f.write(J(r) + '\n')
    with open(os.path.join(OUT, 'story.jsonl'), 'w', encoding='utf-8') as f:
        for r in spine:
            f.write(J(r) + '\n')
    json.dump({'region': 'europe-1789-1914', 'stories': stories}, open(os.path.join(OUT, 'stories.json'), 'w'), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, 'date-checks.txt'), 'w').write('Study spine dates compared with Wikidata\n\n' + '\n'.join(checks) + '\n')
    print('events', len(recs), Counter(CLS[it['cls']][2] for it in evs), 'stubs', sum(1 for r in recs if r.get('stub')))
    print('spine records', len(spine), 'checks', len(checks))
    for extra in [a for a in sys.argv[1:] if a != 'events'] or ['provinces', 'people', 'cities', 'rail']:
        globals()['build_' + extra](own)


# ---------- provinces ----------
# Raw class -> (what to call it, polity it belongs to). STABLE classes kept even without an inception date in Wikidata
# because they all existed through the period (with changes noted in their own articles).
PROV = {
    'fr_department': ('department', 'France'), 'ru_governorate': ('governorate', 'Russian Empire'), 'ru_oblast': ('oblast', 'Russian Empire'),
    'it_province': ('province', 'Italy'), 'gr_prefecture': ('prefecture', 'Greece'), 'es_province': ('province', 'Spain'),
    'at_crown_land': ('crown land', 'Austria'), 'ot_vilayet': ('vilayet', 'Ottoman Empire'), 'ot_sanjak': ('sanjak', 'Ottoman Empire'),
    'de_regbez': ('government region', 'Germany'), 'en_county': ('county', 'England'), 'ie_county': ('county', 'Ireland'),
    'ch_canton': ('canton', 'Switzerland'), 'se_county': ('county', 'Sweden'), 'pt_district': ('district', 'Portugal'),
    'no_county': ('county', 'Norway'), 'dk_county': ('county', 'Denmark'), 'dk_amt': ('county', 'Denmark'),
    'nl_province': ('province', 'Netherlands'), 'be_province': ('province', 'Belgium'), 'pr_province': ('province', 'Prussia'),
    'de_conf_state': ('state', 'German Confederation'), 'ro_county': ('county', 'Romania'), 'hu_county': ('county', 'Hungary'),
}
STABLE = {'fr_department', 'it_province', 'en_county', 'ie_county', 'ch_canton', 'se_county', 'no_county', 'nl_province', 'be_province',
          'es_province', 'pt_district', 'dk_amt'}


def build_provinces(own):
    items = {}
    for name, (what, of) in PROV.items():
        f = os.path.join(RAW, f'prov_{name}.json')
        if not os.path.exists(f):
            continue
        for r in json.load(open(f)):
            q = qid(r['item'])
            lab = r.get('itemLabel') or q
            if lab == q:
                continue
            try:
                lon, lat = point(r['coord'])
            except ValueError:
                continue
            if not inbox(lon, lat):
                continue
            inc = int(r['inc'][:4]) if r.get('inc', '')[:4].isdigit() else None
            dis = int(r['dis'][:4]) if r.get('dis', '')[:4].isdigit() else None
            it = items.setdefault(q, {'q': q, 'name': lab, 'lon': lon, 'lat': lat, 'cls': name, 'what': what, 'of': of,
                                      'inc': inc, 'dis': dis, 'links': int(r.get('links', 0)), 'parent': set()})
            if inc is not None and (it['inc'] is None or inc < it['inc']): it['inc'] = inc
            if dis is not None and (it['dis'] is None or dis > it['dis']): it['dis'] = dis
            if r.get('parentLabel') and not re.match(r'^Q\d+$', r['parentLabel']): it['parent'].add(r['parentLabel'])
    out = []
    for it in items.values():
        if it['inc'] is not None and it['inc'] > Y1: continue
        if it['dis'] is not None and it['dis'] < Y0: continue
        if it['inc'] is None and it['cls'] not in STABLE: continue
        if it['inc'] is not None and it['dis'] is not None and it['inc'] > it['dis']: continue
        rid = own.get(it['q'])
        if rid and not rid.startswith('place:'):
            rid = None
        rec = {'id': rid or f"place:prov:{slug(it['name'])}_{it['q'].lower()}", 'kind': 'place', 'subtype': 'region', 'name': it['name'],
               'lenses': ['geography', 'law'], 'admin': it['what'], 'admin_of': it['of'], 'tier': 5,
               'lat': round(it['lat'], 3), 'lon': round(it['lon'], 3), 'wikidata': it['q'], 'sitelinks': it['links']}
        if it['inc'] is not None: rec['start'] = it['inc']
        if it['dis'] is not None: rec['end'] = it['dis']
        if not it['inc'] and it['cls'] in STABLE: rec['start_note'] = 'no founding date in Wikidata; this kind of division existed throughout 1789-1914'
        if it['parent']: rec['part_of_name'] = sorted(it['parent'])[0]
        rec.update({'sources': [WD(it['q'])], 'status': 'sourced'})
        if rid: rec['stub'] = True
        out.append(rec)
    out.sort(key=lambda r: (r['admin_of'], r['name']))
    with open(os.path.join(OUT, 'provinces.jsonl'), 'w', encoding='utf-8') as f:
        for r in out: f.write(J(r) + '\n')
    print('provinces', len(out), Counter(r['admin_of'] for r in out).most_common())


# ---------- people ----------
PANTHEON = '/mnt/project-files/atlas/raw/pantheon/person_2025_update.csv.bz2'
PSRC = {'cite': 'Pantheon 2025 update (Yu et al. 2016, pantheon.world), CC BY-SA 4.0', 'url': 'https://pantheon.world/data/datasets'}


def build_people(own, top=2000):
    rows = []
    for p in csv.DictReader(bz2.open(PANTHEON, 'rt', encoding='utf-8')):
        try:
            by, lat, lon, hpi = int(p['birthyear']), float(p['bplace_lat']), float(p['bplace_lon']), float(p['hpi'] or 0)
        except ValueError:
            continue
        dy = int(p['deathyear']) if p['deathyear'].lstrip('-').isdigit() else None
        # Alive and at least 15 during the period, born in Europe.
        if not (Y0 - 90 <= by <= Y1 - 15) or (dy is not None and dy < Y0) or not inbox(lon, lat):
            continue
        rows.append((hpi, p))
    rows.sort(key=lambda x: -x[0])
    out = []
    for hpi, p in rows[:top]:
        q = p['wd_id']
        rid = own.get(q)
        if rid and not rid.startswith('person:'):
            rid = None
        by = int(p['birthyear'])
        dy = int(p['deathyear']) if p['deathyear'].lstrip('-').isdigit() else None
        born = {'year': by, 'name': p['bplace_name'], 'lat': round(float(p['bplace_lat']), 3), 'lon': round(float(p['bplace_lon']), 3)}
        if len(p['birthdate']) == 10 and p['birthdate'][:4] == str(by).zfill(4): born['date'] = p['birthdate']
        rec = {'id': rid or f"person:{slug(p['name'])}_{q.lower()}", 'kind': 'person', 'name': p['name'], 'lenses': ['people'],
               'roles': [p['occupation'].lower().replace(' ', '_')], 'start': by, 'born': born}
        if dy is not None:
            rec['end'] = dy
            died = {'year': dy}
            if p['dplace_name']:
                try:
                    died.update({'name': p['dplace_name'], 'lat': round(float(p['dplace_lat']), 3), 'lon': round(float(p['dplace_lon']), 3)})
                except ValueError:
                    pass
            if len(p['deathdate']) == 10 and p['deathdate'][:4] == str(dy).zfill(4): died['date'] = p['deathdate']
            rec['died'] = died
        rec.update({'wikidata': q, 'fame': round(hpi, 1), 'sources': [PSRC], 'status': 'sourced'})
        if rid: rec['stub'] = True
        out.append(rec)
    with open(os.path.join(OUT, 'people.jsonl'), 'w', encoding='utf-8') as f:
        for r in out: f.write(J(r) + '\n')
    print('people', len(out), 'stubs', sum(1 for r in out if r.get('stub')))


# ---------- cities ----------
def build_cities(own):
    """Dated city populations from Wikidata (census-year statements), as measures; REBA's come from places-people."""
    series = defaultdict(dict)
    meta = {}
    # Only towns and cities: P17 also matches countries and regions (fetch_cities.settlements()).
    towns = {qid(r['c']) for f in glob.glob(os.path.join(RAW, 'pop_settle_*.json')) for r in json.load(open(f))}
    for f in sorted(glob.glob(os.path.join(RAW, 'pop_*.json'))):
        if 'settle' in f:
            continue
        for r in json.load(open(f)):
            q = qid(r['c'])
            if q not in towns:
                continue
            try:
                lon, lat = point(r['coord'])
                pop = int(float(r['pop']))
            except ValueError:
                continue
            y = int(r['t'][:4])
            if not inbox(lon, lat) or not Y0 - 10 <= y <= Y1 or pop < 10000:
                continue
            series[q][y] = max(pop, series[q].get(y, 0))
            meta[q] = (r.get('cLabel') or q, round(lon, 3), round(lat, 3), int(r.get('links', 0)))
    recs = []
    for q, s in series.items():
        name, lon, lat, links = meta[q]
        if name == q:
            continue
        pid = own.get(q)
        if not pid or not pid.startswith('place:'):
            pid = f'place:{slug(name)}_{q.lower()}'
            recs.append({'id': pid, 'kind': 'place', 'stub': True, 'subtype': 'city', 'name': name, 'lenses': ['geography', 'population'],
                         'lat': lat, 'lon': lon, 'wikidata': q, 'sources': [WD(q)], 'status': 'sourced'})
        recs.append({'id': f"m:population:{pid.split(':', 1)[1]}:wikidata", 'kind': 'measure', 'of': pid, 'metric': 'population', 'unit': 'people',
                     'points': [[y, v] for y, v in sorted(s.items())], 'lenses': ['population'],
                     'note': 'Population statements with a census or estimate year in Wikidata; sources vary by country',
                     'sources': [WD(q)], 'status': 'sourced'})
    with open(os.path.join(OUT, 'cities.jsonl'), 'w', encoding='utf-8') as f:
        for r in recs: f.write(J(r) + '\n')
    print('city measures', sum(1 for r in recs if r['kind'] == 'measure'))


# ---------- railways ----------
def build_rail(own):
    """Stations with their opening date and the track between neighbouring stations, opened when both ends were open.
    Not kernel records (27k stations): a compact geo file the views read, every station traceable to its Wikidata id."""
    st = {}
    adj = defaultdict(set)
    for f in sorted(glob.glob(os.path.join(RAW, 'rail_st_*.json'))):
        cc = os.path.basename(f)[8:-5]
        for r in json.load(open(f)):
            if int(r['p']) < 9:
                continue
            try:
                lon, lat = point(r['coord'])
            except ValueError:
                continue
            if not inbox(lon, lat):
                continue
            q = qid(r['s'])
            d = iso(r['t'], r['p'])
            s = st.setdefault(q, {'n': r.get('sLabel') or '', 'lon': round(lon, 4), 'lat': round(lat, 4), 'd': d, 'cc': cc})
            if d < s['d']: s['d'] = d
            if r.get('adj'): adj[q].add(qid(r['adj']))
    ids = sorted(st, key=lambda q: (st[q]['d'], q))
    ix = {q: i for i, q in enumerate(ids)}
    edges = set()
    for a, bs in adj.items():
        for b in bs:
            if a in ix and b in ix and a != b:
                i, j = sorted((ix[a], ix[b]))
                # Neighbours more than 60 km apart are usually a data gap, not one stretch of track.
                A, B = st[ids[i]], st[ids[j]]
                if math.hypot((A['lon'] - B['lon']) * math.cos(math.radians(A['lat'])), A['lat'] - B['lat']) * 111 <= 60:
                    edges.add((i, j))
    # Stations: [lon, lat, opened (YYYY, YYYY-MM or YYYY-MM-DD), name, wikidata number, country]
    out = {'source': f'Wikidata (CC0): railway stations with an opening date (P1619) and adjacent stations (P197), query of {TODAY}',
           'note': 'Coverage follows Wikidata: dense for Britain, France, Italy, Switzerland, Belgium, Poland and Russia; thin for Austria-Hungary and the Balkans. Track is drawn only between stations Wikidata lists as neighbours.',
           'stations': [[st[q]['lon'], st[q]['lat'], st[q]['d'], st[q]['n'], int(q[1:]), st[q]['cc']] for q in ids],
           'edges': sorted(edges)}
    json.dump(out, open(os.path.join(OUT, 'geo', 'railways.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('rail stations', len(ids), 'edges', len(edges), 'bytes', os.path.getsize(os.path.join(OUT, 'geo', 'railways.json')))


if __name__ == '__main__':
    main()
