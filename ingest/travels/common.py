"""Shared helpers for the travels ingest: kernel places, place resolution, stub places, dates."""
import json, math, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'travels')
RAW = '/mnt/project-files/atlas/raw'


def slug(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'x'


def km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(a)))


def kernel():
    return json.load(open(os.path.join(ROOT, 'dist', 'kernel.json')))['records']


class Places:
    """Find a kernel place for a name / point / wikidata id, or make a stub in data/travels/places.jsonl."""

    def __init__(self, recs=None):
        recs = recs or kernel()
        own = os.path.join(DATA, 'places.jsonl')
        mine = {}
        if os.path.exists(own):  # keep stubs written by an earlier run (another ingest may need them)
            for l in open(own):
                r = json.loads(l)
                mine[r['id']] = r
        self.by_id, self.by_wd, self.grid = {}, {}, {}
        for p in recs['place']:
            if p['id'] in mine:
                continue
            self.add(p)
        self.stubs = {}
        for r in mine.values():
            self.add(r)
            self.stubs[r['id']] = r

    def add(self, p):
        self.by_id[p['id']] = p
        if p.get('wikidata'):
            self.by_wd.setdefault(p['wikidata'], p)
        if isinstance(p.get('lat'), (int, float)) and isinstance(p.get('lon'), (int, float)):
            self.grid.setdefault((int(p['lon'] // 1), int(p['lat'] // 1)), []).append(p)

    def near(self, lon, lat, r_km):
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for p in self.grid.get((int(lon // 1) + dx, int(lat // 1) + dy), []):
                    d = km(lon, lat, p['lon'], p['lat'])
                    if d <= r_km:
                        out.append((d, p))
        return sorted(out, key=lambda x: x[0])

    def resolve(self, name, lon, lat, wd=None, r_km=25, cite=None, subtype='city', today=None):
        """Return a place id. Wikidata id first, then a same-name place within r_km, then a city or site
        within r_km/2 (an institution sits in its town), else a new stub place."""
        if wd and wd in self.by_wd:
            return self.by_wd[wd]['id']
        if lon is None or lat is None:
            return None
        cands = self.near(lon, lat, r_km)
        sn = slug(name)
        for d, p in cands:
            if slug(p.get('name')) == sn or sn in [slug(a) for a in p.get('alt_names') or []]:
                return p['id']
        for d, p in cands:
            if d <= r_km / 2 and p.get('subtype') in ('city', 'site', None):
                return p['id']
        pid = 'place:' + sn
        if pid in self.by_id:
            pid = f'place:{sn}_{(wd or "").lower() or "%d_%d" % (round(lon), round(lat))}'.replace('-', 'm')
            pid = re.sub(r'[^a-z0-9_:]', '_', pid)
        rec = {'id': pid, 'kind': 'place', 'name': name, 'stub': True, 'subtype': subtype,
               'lenses': ['geography'], 'lat': round(lat, 4), 'lon': round(lon, 4),
               'sources': [{'cite': cite or 'Wikidata (CC0)', 'url': f'https://www.wikidata.org/wiki/{wd}' if wd else None}],
               'status': 'sourced'}
        if not rec['sources'][0]['url']:
            rec['sources'][0].pop('url')
        if wd:
            rec['wikidata'] = wd
        if today:
            rec['today'] = today
        self.add(rec)
        self.stubs[pid] = rec
        return pid

    def write(self):
        os.makedirs(DATA, exist_ok=True)
        with open(os.path.join(DATA, 'places.jsonl'), 'w') as f:
            for pid in sorted(self.stubs):
                f.write(json.dumps(self.stubs[pid], ensure_ascii=False) + '\n')


DATE = re.compile(r'^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?')


def iso(v):
    """Wikidata / EDTF-ish date -> (year, 'YYYY-MM-DD' trimmed to what is known) or (None, None)."""
    if not v:
        return None, None
    m = DATE.match(v.strip())
    if not m:
        return None, None
    y = int(m.group(1))
    if y == 0:
        y = -1
    mo, d = m.group(2), m.group(3)
    s = ('-' if y < 0 else '') + '%04d' % abs(int(m.group(1)))
    if mo and '01' <= mo <= '12':
        s += '-' + mo
        if d and '01' <= d <= '31':
            s += '-' + d
    return y, s


def write_jsonl(name, rows):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
