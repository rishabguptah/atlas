# Build data/deep/: the dated chronicle for every place and period (from the Wikidata event downloads in
# /mnt/project-files/atlas/raw/deep/ and raw/europe-19c/, plus Wikidata battles from data/states-war/), and the
# Pantheon births and deaths. Compact tab-separated files, not kernel records: BCE days ("-0480-09-28") do not
# fit the kernel's date field, and a hundred thousand rows would swamp dist/kernel.json.
#   python3 ingest/deep/build.py        then  python3 ingest/deep/stories.py
import bz2, csv, glob, io, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'europe-19c'))
from wdq import qid, point

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
RAWS = ['/mnt/project-files/atlas/raw/deep', '/mnt/project-files/atlas/raw/europe-19c']
OUT = os.path.join(REPO, 'data', 'deep')
PANTHEON = '/mnt/project-files/atlas/raw/pantheon/person_2025_update.csv.bz2'

# Raw class -> (subtype, family). Earlier classes win when an item is in several.
CLS = {
    'battle': ('battle', 'war'), 'siege': ('siege', 'war'), 'invasion': ('invasion', 'war'),
    'conquest': ('conquest', 'war'), 'war': ('war', 'war'), 'campaign': ('campaign', 'war'), 'expedition': ('expedition', 'war'),
    'revolution': ('revolution', 'unrest'), 'rebellion': ('revolt', 'unrest'), 'coup': ('coup', 'unrest'), 'mutiny': ('mutiny', 'unrest'),
    'genocide': ('genocide', 'unrest'), 'massacre': ('massacre', 'unrest'), 'pogrom': ('pogrom', 'unrest'), 'riot': ('riot', 'unrest'),
    'protest': ('protest', 'unrest'), 'strike': ('strike', 'unrest'), 'assassination': ('assassination', 'unrest'),
    'treaty': ('treaty', 'diplomacy'), 'peace_conference': ('congress', 'diplomacy'), 'conference': ('congress', 'diplomacy'),
    'congress': ('congress', 'diplomacy'), 'council': ('council', 'culture'), 'synod': ('council', 'culture'),
    'independence': ('independence', 'diplomacy'), 'referendum': ('referendum', 'diplomacy'), 'election': ('election', 'diplomacy'),
    'coronation': ('coronation', 'diplomacy'), 'worlds_fair': ('exhibition', 'culture'),
    'epidemic': ('epidemic', 'disaster'), 'famine': ('famine', 'disaster'), 'earthquake': ('earthquake', 'disaster'),
    'eruption': ('eruption', 'disaster'), 'tsunami': ('tsunami', 'disaster'), 'flood': ('flood', 'disaster'), 'fire': ('fire', 'disaster'),
    'shipwreck': ('shipwreck', 'disaster'), 'disaster': ('disaster', 'disaster'),
}
PRI = list(CLS)
FAM = {'war': 'w', 'diplomacy': 'd', 'unrest': 'u', 'disaster': 'x', 'culture': 'c'}


def iso(t, p):
    """WDQS time + precision -> '[-]YYYY[-MM[-DD]]', historical years (WDQS counts 1 BCE as year 0), and whether it is
    only good to the decade. None when coarser than a decade."""
    p = int(p)
    if p < 8:
        return None, False
    neg = t.startswith('-')
    y, rest = (t[1:] if neg else t).split('-', 1)
    y = int(y)
    if neg or y == 0:
        y = -(y + 1) if neg else -1
    if y == 0:
        return None, False
    s = ('-%04d' % -y) if y < 0 else '%04d' % y
    if p >= 11: s += '-' + rest[:5]
    elif p == 10: s += '-' + rest[:2]
    return s, p == 8


def key(d):
    """Sort key: month index (year * 12 + month - 1) and day."""
    neg = d.startswith('-')
    parts = (d[1:] if neg else d).split('-')
    y = -int(parts[0]) if neg else int(parts[0])
    return (y * 12 + (int(parts[1]) - 1 if len(parts) > 1 else 0), int(parts[2]) if len(parts) > 2 else 0)


GENERIC = re.compile(r'^(\d{1,4}s?( BCE| BC| AD| CE)?|[a-z ]*century( BCE| BC)?)?\s*(battle|siege|war|treaty|riot|conflict|armed conflict|military conflict|event|earthquake|epidemic|famine|election|coup|revolt|rebellion|massacre|fire|shipwreck|strike|protest|disaster|flood)\.?$', re.I)


def load_events():
    items = {}
    files = []
    for raw in RAWS:
        files += sorted(glob.glob(os.path.join(raw, 'ev_*.json')))
    for f in files:
        b = os.path.basename(f)[3:-5]
        cls = next((c for c in sorted(CLS, key=len, reverse=True) if b == c or b.startswith(c + '_')), None)
        # raw/europe-19c's mutiny download used a wrong class (Q211364, "principle"); raw/deep has the right one.
        if not cls or (cls == 'mutiny' and 'europe-19c' in f):
            continue
        for r in json.load(open(f)):
            c = r.get('coord') or r.get('lcoord')
            if not c or 'Point(' not in c:
                continue
            try:
                lon, lat = point(c)
            except ValueError:
                continue
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue
            q = qid(r['item'])
            if not r.get('itemLabel') or r['itemLabel'] == q:
                continue
            it = items.setdefault(q, {'q': q, 'name': r['itemLabel'], 'what': r.get('itemDescription'), 'cls': set(), 'dates': {},
                                      'ends': set(), 'lon': lon, 'lat': lat, 'direct': bool(r.get('coord')), 'links': int(r.get('links', 0)), 'part': {}})
            it['cls'].add(cls)
            if r.get('coord') and not it['direct']:
                it['lon'], it['lat'], it['direct'] = lon, lat, True
            d, approx = iso(r['t'], r['p'])
            if d: it['dates'][d] = approx and it['dates'].get(d, True)
            if r.get('e') and r.get('ep'):
                e, _ = iso(r['e'], r['ep'])
                if e: it['ends'].add(e)
            if r.get('part') and r.get('partLabel') and not re.match(r'^Q\d+$', r['partLabel']):
                it['part'][qid(r['part'])] = r['partLabel']
    out = []
    for it in items.values():
        if not it['dates']:
            continue
        # The most precise date wins, then the earliest; the latest end.
        best = max(len(d.lstrip('-')) for d in it['dates'])
        it['date'] = min((d for d in it['dates'] if len(d.lstrip('-')) == best), key=key)
        it['approx'] = it['dates'][it['date']]
        if key(it['date'])[0] // 12 > 2026:
            continue
        ends = sorted((e for e in it['ends'] if key(e) >= key(it['date'])), key=key)
        it['end'] = ends[-1] if ends and ends[-1] != it['date'] else ''
        it['cls'] = min(it['cls'], key=PRI.index)
        out.append(it)
    return out


def battles_extra(have):
    """Wikidata battles and sieges in data/states-war/ that the event download missed (year only)."""
    out = []
    p = os.path.join(REPO, 'data', 'states-war', 'battles-wikidata.jsonl')
    for l in open(p, encoding='utf-8'):
        r = json.loads(l)
        if r.get('kind') != 'event' or r.get('lat') is None or not r.get('start') or r.get('wikidata') in have:
            continue
        y = r['start']
        out.append({'q': r.get('wikidata') or '', 'name': r['name'], 'what': None, 'cls': 'siege' if r.get('subtype') == 'siege' else 'battle',
                    'date': ('-%04d' % -y) if y < 0 else '%04d' % y, 'approx': False, 'end': '', 'lon': r['lon'], 'lat': r['lat'],
                    'direct': True, 'links': 0, 'part': {w['wikidata']: w['name'] for w in (r.get('wars') or [])[:1] if w.get('wikidata')}})
    return out


def clean(s):
    return re.sub(r'[\t\n\r]+', ' ', s or '').strip()


def write_chronicle(ev):
    ev.sort(key=lambda it: (key(it['date']), -it['links']))
    path = os.path.join(OUT, 'chronicle.tsv')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('date\tend\tfamily\tsubtype\tname\tlon\tlat\twikidata\tsitelinks\tpart_of\tdesc\tflags\n')
        for it in ev:
            sub, fam = CLS[it['cls']]
            what = clean(it['what'])
            if GENERIC.match(what) or re.match(r'^\d{1,4}s? ', what) and len(what) < 40:
                what = ''
            flags = ('a' if it['approx'] else '') + ('' if it['direct'] else 'l')
            part = next(iter(it['part'].values()), '')
            f.write('\t'.join([it['date'], it['end'], FAM[fam], sub, clean(it['name']), '%.3f' % it['lon'], '%.3f' % it['lat'], it['q'][1:] if it['q'] else '',
                               str(it['links']), clean(part), what[:140], flags]) + '\n')
    return path


def write_lives():
    """Pantheon births and deaths with a place: one row per person."""
    path = os.path.join(OUT, 'lives.tsv')
    rows = []
    with bz2.open(PANTHEON, 'rt', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r.get('is_group') == 'TRUE':
                continue
            def d(date, year):
                if date:
                    bc = date.endswith(' BC')
                    date = date.replace(' BC', '')
                    return ('-' + date) if bc else date
                if year:
                    y = int(float(year))
                    return ('-%04d' % -y) if y < 0 else '%04d' % y
                return ''
            bd, dd = d(r['birthdate'], r['birthyear']), d(r['deathdate'], r['deathyear'])
            if not bd and not dd:
                continue
            hpi = float(r['hpi'] or 0)
            def ll(a, b):
                try: return '%.3f' % float(a), '%.3f' % float(b)
                except ValueError: return '', ''
            blon, blat = ll(r['bplace_lon'], r['bplace_lat'])
            dlon, dlat = ll(r['dplace_lon'], r['dplace_lat'])
            if not blon and not dlon:
                continue
            rows.append((hpi, [clean(r['name']), r['occupation'].lower().replace(' ', '_'), bd, blon, blat, clean(r['bplace_name']), dd, dlon, dlat,
                               clean(r['dplace_name']), '%.1f' % hpi, (r['wd_id'] or '')[1:]]))
    rows.sort(key=lambda x: -x[0])
    with open(path, 'w', encoding='utf-8') as f:
        f.write('name\trole\tborn\tblon\tblat\tbplace\tdied\tdlon\tdlat\tdplace\thpi\twikidata\n')
        for _, r in rows:
            f.write('\t'.join(r) + '\n')
    return path, len(rows)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ev = load_events()
    have = {'' + it['q'] for it in ev}
    ex = battles_extra(have)
    p = write_chronicle(ev + ex)
    print(p, len(ev), '+', len(ex), 'battles', os.path.getsize(p))
    p, n = write_lives()
    print(p, n, os.path.getsize(p))
