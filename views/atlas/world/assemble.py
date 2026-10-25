# The generic pack assembler for the world index (L1): one window (a box and a span of years) in, one dense pack out.
# Nobody hand-builds a pack. Each line of packs.json is assembled the same way from:
#   - the global chronicle (data/deep/chronicle.tsv: Wikidata events everywhere, to the day where known)
#   - Pantheon births and deaths (data/deep/lives.tsv)
#   - the kernel (dist/kernel.json: events, works, founded places, people)
#   - Wikidata box queries for the window (cached in /mnt/project-files/atlas/raw/deep/packs/): every item with a
#     coordinate in the box and a date in the span (inception, dissolution, opening, point in time, start), and every
#     person born, died, living or working in the box then.
#   python3 views/atlas/world/assemble.py [pack id ...]     writes data/deep/packs/<id>.json
#
# Row shape, shared with the global chunks (world.js reads both):
#   [k, f, sub, name, lon, lat, date, end, ref, rank, conf, extra]
#   k     e event · b birth · d death · r lived or worked here · f founded or built · z ended or destroyed · w work made
#   f     family: w war · d diplomacy and law · u unrest · x disaster · c culture, trade, faith, building · p people
#   date  ISO, as precise as the source: "1127-01-09", "1127-01", "1127", "-0480" (480 BCE); "" when unknown
#   ref   Wikidata number (int) or a kernel id (str)
#   rank  sitelinks, fame or HPI: how well known, for ranking
#   conf  0 attested · 1 estimated · 2 approximate (date to the decade, place pinned at a parent) · 3 unknown
#   extra {} or {desc, part, place, role, born, died, src}
import json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(REPO, 'ingest', 'europe-19c'))
import wdq  # noqa: E402
wdq.RAW = os.environ.get('ATLAS_RAW', '/mnt/project-files/atlas/raw') + '/deep/packs'
DEEP = os.path.join(REPO, 'data', 'deep')


def ystr(y):
    return ('-%04d' % -y) if y < 0 else '%04d' % y


def year_of(d):
    if not d:
        return None
    neg = d.startswith('-')
    y = int((d[1:] if neg else d).split('-')[0])
    return -y if neg else y


def iso(t, p):
    """WDQS time + precision -> (ISO date in historical years, approximate?) or (None, False)."""
    p = int(p)
    if p < 8 or not t or not (t[0].isdigit() or t[0] == '-'):
        return None, False
    neg = t.startswith('-')
    y, rest = (t[1:] if neg else t).split('-', 1)
    y = int(y)
    y = -(y + 1) if neg else (-1 if y == 0 else y)
    s = ystr(y)
    if p >= 11: s += '-' + rest[:5]
    elif p == 10: s += '-' + rest[:2]
    return s, p == 8


def tsv(name):
    p = os.path.join(DEEP, name)
    with open(p, encoding='utf-8') as f:
        head = f.readline().rstrip('\n').split('\t')
        for line in f:
            yield dict(zip(head, line.rstrip('\n').split('\t')))


def inbox(b, lon, lat):
    return b[0] <= lon <= b[2] and b[1] <= lat <= b[3]


def inspan(d, t0, t1, slack=0):
    y = year_of(d)
    return y is not None and t0 - slack <= y <= t1 + slack


def num(s):
    try: return float(s)
    except (TypeError, ValueError): return None


# ---------- sources shared by packs and the global chunks ----------

def chronicle_rows(keep):
    """keep(lon, lat, date) -> bool. Rows of kind e."""
    out = []
    for r in tsv('chronicle.tsv'):
        lon, lat = float(r['lon']), float(r['lat'])
        if not keep(lon, lat, r['date']):
            continue
        x = {}
        if r['desc']: x['desc'] = r['desc']
        if r['part_of']: x['part'] = r['part_of']
        conf = 2 if ('a' in r['flags'] or 'l' in r['flags']) else (0 if len(r['date'].lstrip('-')) >= 7 else 1)
        if 'l' in r['flags']: x['pin'] = 'location'
        out.append(['e', r['family'], r['subtype'], r['name'], lon, lat, r['date'], r['end'], int(r['wikidata']) if r['wikidata'] else 0,
                    int(r['sitelinks'] or 0), conf, x])
    return out


def lives_rows(keep, keep_person=lambda r: True):
    """Births and deaths from Pantheon: two rows per person, each where and when it happened."""
    out = []
    for r in tsv('lives.tsv'):
        if not keep_person(r):
            continue
        q = int(r['wikidata']) if r['wikidata'] else 0
        hpi = float(r['hpi'] or 0)
        for k, d, lon, lat, place, other in (('b', r['born'], r['blon'], r['blat'], r['bplace'], r['died']), ('d', r['died'], r['dlon'], r['dlat'], r['dplace'], r['born'])):
            lon, lat = num(lon), num(lat)
            if not d or lon is None or not keep(lon, lat, d):
                continue
            x = {'place': place}
            if other: x['died' if k == 'b' else 'born'] = other
            out.append([k, 'p', r['role'], r['name'], lon, lat, d, '', q, round(hpi, 1), 0 if len(d.lstrip('-')) >= 7 else 1, x])
    return out


_kernel = None
def kernel():
    global _kernel
    if _kernel is None:
        p = os.path.join(REPO, 'dist', 'kernel.json')
        if not os.path.exists(p):
            os.system(f'python3 {os.path.join(REPO, "tools", "build.py")} > /dev/null')
        _kernel = json.load(open(p, encoding='utf-8'))['records']
    return _kernel


FAMK = {'military': 'w', 'law': 'd', 'order': 'u', 'disease': 'x'}
def kernel_rows(keep, skip_q=frozenset()):
    """Events, works, founded places and people (birth and death) from the kernel, skipping Wikidata ids already in."""
    K, out = kernel(), []
    def q_of(r):
        w = r.get('wikidata')
        return int(w[1:]) if w and w[1:].isdigit() else 0
    def conf_of(r, d):
        c = r.get('conf')
        if c in ('attested', 'estimated', 'approximate', 'unknown'): return ['attested', 'estimated', 'approximate', 'unknown'].index(c)
        return 1 if r.get('status') == 'draft' else (0 if d and len(d.lstrip('-')) >= 7 else 1)
    for r in K.get('event', []):
        if r.get('stub') or r.get('lat') is None: continue
        q = q_of(r)
        if q and q in skip_q: continue
        d = r.get('date') or (ystr(r['start']) if r.get('start') else '')
        if not d or not keep(r['lon'], r['lat'], d): continue
        ls = r.get('lenses') or []
        f = r.get('family') and {'war': 'w', 'diplomacy': 'd', 'unrest': 'u', 'disaster': 'x', 'culture': 'c'}.get(r['family']) or FAMK.get(ls[0] if ls else '', 'c')
        x = {k: v for k, v in (('desc', r.get('what') or r.get('why')), ('src', (r.get('sources') or [{}])[0].get('cite'))) if v}
        end = r.get('end_date') or (ystr(r['end']) if r.get('end') and r.get('end') != r.get('start') else '')
        out.append(['e', f, r.get('subtype') or 'event', r['name'], r['lon'], r['lat'], d, end, q or r['id'], r.get('sitelinks', 0), conf_of(r, d), x])
    for r in K.get('work', []):
        if r.get('lat') is None or not r.get('start'): continue
        q = q_of(r)
        if q and q in skip_q: continue
        d = r.get('date') or ystr(r['start'])
        if not keep(r['lon'], r['lat'], d): continue
        x = {k: v for k, v in (('desc', r.get('what') or r.get('why')), ('role', r.get('subtype'))) if v}
        out.append(['w', 'c', r.get('subtype') or 'work', r['name'], r['lon'], r['lat'], d, '', q or r['id'], r.get('sitelinks', 0), conf_of(r, d), x])
    for r in K.get('place', []):
        if r.get('lat') is None or not r.get('start'): continue
        q = q_of(r)
        if q and q in skip_q: continue
        d = ystr(r['start'])
        if keep(r['lon'], r['lat'], d):
            x = {k: v for k, v in (('desc', r.get('what') or r.get('why')),) if v}
            out.append(['f', 'c', r.get('subtype') or 'place', r['name'], r['lon'], r['lat'], d, '', q or r['id'], r.get('sitelinks', 0), conf_of(r, d), x])
        if r.get('end') and keep(r['lon'], r['lat'], ystr(r['end'])):
            out.append(['z', 'x', r.get('subtype') or 'place', r['name'], r['lon'], r['lat'], ystr(r['end']), '', q or r['id'], r.get('sitelinks', 0), conf_of(r, ''), {'desc': (r.get('end_cause') or '')}])
    return out


# ---------- Wikidata, per window ----------

BOX = '''SERVICE wikibase:box { ?%s wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(%s %s)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(%s %s)"^^geo:wktLiteral . }'''

DATED = '''SELECT ?item ?itemLabel ?itemDescription ?coord ?t ?p ?classLabel ?links WHERE {
  %s
  ?item p:%s ?st . ?st psv:%s [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] .
  FILTER(?t >= "%s"^^xsd:dateTime && ?t < "%s"^^xsd:dateTime)
  OPTIONAL { ?item wdt:P31 ?class }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
  ?item wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,zh,ja,ar,fa,hi,ur". }
}'''

PEOPLE = '''SELECT ?item ?itemLabel ?itemDescription ?place ?placeLabel ?coord ?b ?bp ?d ?dp ?s ?e ?occLabel ?links WHERE {
  %s
  ?item p:%s ?st . ?st ps:%s ?place . ?item wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e }
  OPTIONAL { ?item p:P569/psv:P569 [ wikibase:timeValue ?b ; wikibase:timePrecision ?bp ] }
  OPTIONAL { ?item p:P570/psv:P570 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] }
  FILTER(%s)
  OPTIONAL { ?item wdt:P106 ?occ }
  ?item wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,zh,ja,ar,fa,hi,ur". }
}'''


def ts(y):
    # WDQS counts 1 BCE as year 0.
    return (('-%04d' % (-y - 1)) if y < 0 else '%04d' % y) + '-01-01T00:00:00Z'


def wd_slices(t0, t1, n):
    step = max(1, (t1 - t0 + 1) // n + 1)
    return [(a, min(t1 + 1, a + step)) for a in range(t0, t1 + 1, step)]


def run(q, cache):
    try:
        return wdq.sparql(q, cache=cache, tries=3)
    except Exception as e:
        print('  query failed', cache, str(e)[:100], flush=True)
        return []


GENERIC_CLASS = re.compile(r'^(Wikimedia|human|taxon|item|entity|geographic location)', re.I)
def wd_rows(p):
    b, t0, t1, pid = p['bbox'], p['t0'], p['t1'], p['id']
    box = lambda v: BOX % (v, b[0], b[1], b[2], b[3])
    items = {}
    # Dated things: inception and opening -> founded; dissolution -> ended; point in time and start -> event.
    for prop, k in (('P571', 'f'), ('P1619', 'f'), ('P576', 'z'), ('P585', 'e'), ('P580', 'e')):
        for a, z in wd_slices(t0, t1, 1 if t1 - t0 < 60 else 3):
            for r in run(DATED % (box('item'), prop, prop, ts(a), ts(z)), f'{pid}_{prop}_{a}_{z}'):
                d, approx = iso(r['t'], r['p'])
                if not d or not r.get('itemLabel') or re.match(r'^Q\d+$', r['itemLabel']):
                    continue
                q = int(r['item'].rsplit('/Q', 1)[1])
                key = (q, k)
                it = items.get(key)
                lon, lat = wdq.point(r['coord'])
                cls = r.get('classLabel') or ''
                if it is None:
                    it = items[key] = {'k': k, 'q': q, 'name': r['itemLabel'], 'desc': r.get('itemDescription') or '', 'lon': lon, 'lat': lat,
                                       'd': d, 'approx': approx, 'cls': set(), 'links': int(r['links'])}
                elif len(d.lstrip('-')) > len(it['d'].lstrip('-')):
                    it['d'], it['approx'] = d, approx
                if cls and not GENERIC_CLASS.match(cls) and not re.match(r'^Q\d+$', cls):
                    it['cls'].add(cls)
    out = []
    for it in items.values():
        sub = sorted(it['cls'], key=len)[0] if it['cls'] else ('building' if it['k'] == 'f' else 'event')
        f = fam_of_class(sub, it['k'])
        x = {'desc': it['desc']} if it['desc'] else {}
        out.append([it['k'], f, sub, it['name'], round(it['lon'], 4), round(it['lat'], 4), it['d'], '', it['q'], it['links'], 2 if it['approx'] else 0, x])
    # People: born, died, lived or worked in the box during the window.
    ppl = {}
    born = lambda a, z: f'BOUND(?b) && ?b >= "{ts(a)}"^^xsd:dateTime && ?b < "{ts(z)}"^^xsd:dateTime'
    died = lambda a, z: f'BOUND(?d) && ?d >= "{ts(a)}"^^xsd:dateTime && ?d < "{ts(z)}"^^xsd:dateTime'
    for prop, k in (('P19', 'b'), ('P20', 'd'), ('P551', 'r'), ('P937', 'r')):
        for a, z in wd_slices(t0, t1, 1 if t1 - t0 < 60 else 4):
            flt = born(a, z) if k == 'b' else died(a, z) if k == 'd' else f'({born(a - 60, z)}) || ({died(a, z + 60)})'
            for r in run(PEOPLE % (box('place'), prop, prop, flt), f'{pid}_people_{prop}_{a}_{z}'):
                if not r.get('itemLabel') or re.match(r'^Q\d+$', r['itemLabel']):
                    continue
                q = int(r['item'].rsplit('/Q', 1)[1])
                bd = iso(r['b'], r['bp'])[0] if r.get('b') else None
                dd = iso(r['d'], r['dp'])[0] if r.get('d') else None
                if k == 'r':
                    s = iso(r['s'], '9')[0] if r.get('s') else None
                    e = iso(r['e'], '9')[0] if r.get('e') else None
                    d, end, conf = (s, e or '', 0) if s else ((bd and ystr(year_of(bd) + 20)) or ystr(t0), dd or '', 2)
                else:
                    d, end, conf = (bd if k == 'b' else dd), '', 0
                if not d:
                    continue
                lon, lat = wdq.point(r['coord'])
                key = (q, k, r.get('placeLabel'))
                o = ppl.get(key)
                if o is None:
                    x = {'place': r.get('placeLabel') or ''}
                    if r.get('itemDescription'): x['desc'] = r['itemDescription']
                    if bd and k != 'b': x['born'] = bd
                    if dd and k != 'd': x['died'] = dd
                    o = ppl[key] = [k, 'p', '', r['itemLabel'], round(lon, 4), round(lat, 4), d, end, q, int(r['links']), conf, x]
                elif len(d.lstrip('-')) > len(o[6].lstrip('-')):
                    o[6] = d
                occ = r.get('occLabel')
                if occ and not o[2] and not re.match(r'^Q\d+$', occ):
                    o[2] = occ.replace(' ', '_')
    out += list(ppl.values())
    return out


FAMC = [(r'battle|siege|war|campaign|military|fort|castle|garrison|army', 'w'), (r'treaty|law|court|administrative|province|prefecture|fu$|zhou|county|district|circuit|lu$|government|embassy', 'd'),
        (r'revolt|rebellion|riot|uprising|massacre|revolution|coup', 'u'), (r'earthquake|flood|fire|famine|epidemic|plague|eruption|disaster', 'x')]
def fam_of_class(cls, k):
    c = cls.lower()
    for pat, f in FAMC:
        if re.search(pat, c):
            return f
    return 'c'


# ---------- one pack ----------

def assemble(p):
    b, t0, t1 = p['bbox'], p['t0'], p['t1']
    keep = lambda lon, lat, d: inbox(b, lon, lat) and inspan(d, t0, t1)
    rows = chronicle_rows(keep)
    rows += lives_rows(keep)
    have = {r[8] for r in rows if isinstance(r[8], int) and r[8]}
    if p.get('wd', True):
        w = [r for r in wd_rows(p) if inbox(b, r[4], r[5]) and (inspan(r[6], t0, t1) or (r[0] == 'r' and inspan(r[6], t0 - 60, t1)))]
        # Pantheon and the chronicle already have the best-known births, deaths and events: keep theirs.
        w = [r for r in w if not (r[8] in have and r[0] in ('e', 'b', 'd'))]
        rows += w
        have |= {r[8] for r in w if isinstance(r[8], int)}
    rows += kernel_rows(keep, have)
    rows += draft_rows(p)
    # e19 storyline turning points that Wikidata has no event for.
    if p['id'] == 'europe_1789_1914':
        for l in open(os.path.join(REPO, 'data', 'europe-19c', 'story.jsonl'), encoding='utf-8'):
            r = json.loads(l)
            fam = {'war': 'w', 'diplomacy': 'd', 'unrest': 'u', 'disaster': 'x', 'culture': 'c'}.get(r.get('family'), 'c')
            rows.append(['e', fam, r.get('subtype') or 'event', r['name'], r['lon'], r['lat'], r['date'], r.get('end_date', ''),
                         int(r['wikidata'][1:]) if r.get('wikidata') else r['id'], 0, 1, {'desc': r.get('what', ''), 'why': r.get('why', ''), 'src': r['sources'][0]['cite']}])
    rows.sort(key=lambda r: (sortkey(r[6]), -r[9]))
    kinds = {}
    for r in rows: kinds[r[0]] = kinds.get(r[0], 0) + 1
    return {'id': p['id'], 'name': p['name'], 'bbox': b, 't0': t0, 't1': t1, 'built': time.strftime('%Y-%m-%d'), 'n': len(rows), 'kinds': kinds,
            'sources': ['Wikidata (CC0)', 'Pantheon 2025 (CC BY-SA 4.0)', 'Atlas kernel (see each record)'], 'rows': rows}


def draft_rows(p):
    """The pack's AI draft layer (data/deep/packs/drafts/<id>.json), written offline where Wikidata and Pantheon are thin:
    never better than conf 1 (estimated), marked draft, each row naming the article it was written from."""
    f = os.path.join(DEEP, 'packs', 'drafts', p['id'] + '.json')
    if not os.path.exists(f):
        return []
    out = []
    for r in json.load(open(f, encoding='utf-8'))['rows']:
        d = re.sub(r'^(-?)(\d{1,3})(?=$|-)', lambda m: m.group(1) + m.group(2).zfill(4), str(r.get('date') or ''))
        if not d or year_of(d) is None or not isinstance(r.get('lon'), (int, float)) or not isinstance(r.get('lat'), (int, float)):
            continue
        x = {'status': 'draft', 'src': 'AI draft (Claude, 2026-10-25), written from Wikipedia: ' + r['wikipedia'] if r.get('wikipedia') else 'AI draft (Claude, 2026-10-25)'}
        if r.get('desc'): x['desc'] = r['desc']
        if r.get('place'): x['place'] = r['place']
        out.append([r.get('k') or 'e', r.get('f') or 'c', r.get('sub') or '', r['name'], round(r['lon'], 4), round(r['lat'], 4), d, r.get('end') or '',
                    'draft:' + p['id'] + ':' + str(len(out)), 8, max(1, int(r.get('conf') or 1)), x])
    return out


def sortkey(d):
    if not d:
        return (10 ** 9, 0)
    neg = d.startswith('-')
    parts = (d[1:] if neg else d).split('-')
    y = -int(parts[0]) if neg else int(parts[0])
    return (y * 12 + (int(parts[1]) - 1 if len(parts) > 1 else 0), int(parts[2]) if len(parts) > 2 else 0)


if __name__ == '__main__':
    cfg = json.load(open(os.path.join(HERE, 'packs.json'), encoding='utf-8'))['packs']
    want = sys.argv[1:]
    os.makedirs(os.path.join(DEEP, 'packs'), exist_ok=True)
    for p in cfg:
        if want and p['id'] not in want:
            continue
        pk = assemble(p)
        f = os.path.join(DEEP, 'packs', p['id'] + '.json')
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write('{' + ','.join(f'{json.dumps(k)}:{json.dumps(v, ensure_ascii=False)}' for k, v in pk.items() if k != 'rows') + ',"rows":[\n')
            fh.write(',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in pk['rows']))
            fh.write('\n]}\n')
        print(p['id'], pk['n'], pk['kinds'], os.path.getsize(f), flush=True)
