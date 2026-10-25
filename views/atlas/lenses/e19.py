# Europe 1789-1914 up close: the first deep-zoom region of the one-page Atlas (data/europe-19c/).
# build(repo) is LENS_DATA.e19: the dated chronicle (events to the day), the study storylines, provinces and city
# growth. Over 40 KB, so the page build puts it in atlas-files/lens-e19.json, loaded after the first paint.
# sidecar(repo) is the heavy part the page fetches only when a lens needs it: railway stations and track, and lives.
#   python3 views/atlas/lenses/e19.py OUT_DIR    writes OUT_DIR/atlas-files/e19-deep.json, to publish beside the page.
import json, os, re, sys

BOX = (-25, 34, 50, 72)
FAM = {'war': 'w', 'diplomacy': 'd', 'unrest': 'u', 'disaster': 'x', 'culture': 'c'}


def rows(repo, f):
    p = os.path.join(repo, 'data', 'europe-19c', f)
    return [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()] if os.path.exists(p) else []


def fam_of(r):
    if r.get('family'):
        return r['family']
    s = r.get('subtype', '')
    ls = r.get('lenses', [])
    if s in ('battle', 'siege', 'war') or 'military' in ls[:1]: return 'war'
    if 'law' in ls[:1]: return 'diplomacy'
    if 'order' in ls[:1]: return 'unrest'
    if 'disease' in ls[:1]: return 'disaster'
    return 'culture'


def build(repo):
    d = os.path.join(repo, 'data', 'europe-19c')
    if not os.path.exists(os.path.join(d, 'stories.json')):
        return {}
    stories = json.load(open(os.path.join(d, 'stories.json'), encoding='utf-8'))['stories']
    sidx = {s['id']: i for i, s in enumerate(stories)}
    ev = rows(repo, 'events.jsonl') + rows(repo, 'story.jsonl')
    ev.sort(key=lambda r: (r['date'], -r.get('sitelinks', 0)))
    # Chronicle row: [date, end date or "", family, subtype, name, lon, lat, wikidata number or 0, sitelinks, story or -1, part of]
    E, T, idx = [], {}, {}
    for r in ev:
        st = sidx.get(r.get('story'), -1)
        q = int(r['wikidata'][1:]) if r.get('wikidata') else 0
        E.append([r['date'], r.get('end_date', ''), FAM[fam_of(r)], r.get('subtype', 'event'), r['name'], round(r['lon'], 3), round(r['lat'], 3),
                  q, r.get('sitelinks', 0), st, ((r.get('part_of') or [{}])[0]).get('name', '')])
        idx[r['id']] = len(E) - 1
        # Text for cards: what / why / place / study source / date note / status (s = sourced, d = draft).
        t = {k: r[k] for k in ('what', 'why', 'place_name', 'date_note') if r.get(k)}
        # Wikidata's generic descriptions ("1793 battle.") add nothing to the card's kicker and date.
        if re.match(r'^\d{3,4}s? ', t.get('what', '')) and not r.get('why'):
            t.pop('what')
        src = r.get('study_sources') or (r['sources'] if r.get('status') == 'draft' else None)
        if src: t['src'] = src[0]
        if r.get('status') == 'draft' or r.get('study_sources'): t['st'] = 'd'
        if t:
            T[len(E) - 1] = t
    S = [{'id': s['id'], 'title': s['title'], 'start': s['start'], 'end': s['end'], 'blurb': s['blurb'],
          'steps': [idx[i] for i in s['steps'] if i in idx]} for s in stories]
    # Provinces: [name, lon, lat, start, end, kind, of, sitelinks, wikidata number]
    P = [[r['name'], r['lon'], r['lat'], r.get('start'), r.get('end'), r['admin'], r['admin_of'], r.get('sitelinks', 0), int(r['wikidata'][1:])]
         for r in rows(repo, 'provinces.jsonl')]
    return {'region': {'id': 'europe-1789-1914', 'name': 'Europe 1789–1914', 'start': 1789, 'end': 1914, 'view': {'lon': 14, 'lat': 50, 'span': 34}},
            'events': E, 'text': T, 'stories': S, 'provinces': P, 'cities': cities(repo),
            'src': {'wd': 'Wikidata (CC0), queried 2026-10-25', 'reba': 'Reba, Reitsma & Seto 2016 (after Chandler 1987), attribution, non-commercial, share-alike'}}


def cities(repo):
    """City growth 1750-1914: Wikidata census-year populations where a city has two or more, REBA (Chandler) otherwise."""
    places, series = {}, {}
    for f in ('places-people/places.jsonl', 'europe-19c/cities.jsonl'):
        p = os.path.join(repo, 'data', f)
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            if r['kind'] == 'place' and r.get('lat') is not None and r['id'] not in places:
                places[r['id']] = r
    for f, tag in (('places-people/measures.jsonl', 'r'), ('europe-19c/cities.jsonl', 'w')):
        for l in open(os.path.join(repo, 'data', f), encoding='utf-8'):
            r = json.loads(l)
            if r['kind'] != 'measure' or r.get('metric') != 'population' or not (r['id'].endswith(':reba2016') or r['id'].endswith(':wikidata')):
                continue
            pts = [p[:2] for p in r['points'] if 1700 <= p[0] <= 1914]
            if tag == 'w' and len(pts) < 2:
                continue
            if pts and (tag == 'w' or r['of'] not in series):
                series[r['of']] = (tag, pts)
    out = []
    for pid, (tag, pts) in series.items():
        pl = places.get(pid)
        if not pl or not (BOX[0] <= pl['lon'] <= BOX[2] and BOX[1] <= pl['lat'] <= BOX[3]) or max(v for _, v in pts) < 20000:
            continue
        if not any(y >= 1789 for y, _ in pts):
            continue
        out.append([pl['name'], round(pl['lon'], 3), round(pl['lat'], 3), tag, pts])
    out.sort(key=lambda c: -max(v for _, v in c[4]))
    return out


def sidecar(repo):
    rail = os.path.join(repo, 'data', 'europe-19c', 'geo', 'railways.json')
    R = json.load(open(rail, encoding='utf-8')) if os.path.exists(rail) else {'stations': [], 'edges': []}
    # Lives: [name, role, born date, born lon, lat, place, died date, lon, lat, place, fame, wikidata number]
    L = []
    for r in rows(repo, 'people.jsonl'):
        b, dd = r.get('born') or {}, r.get('died') or {}
        L.append([r['name'], (r.get('roles') or [''])[0], b.get('date') or str(b.get('year', '')), b.get('lon'), b.get('lat'), b.get('name', ''),
                  dd.get('date') or (str(dd['year']) if dd.get('year') else ''), dd.get('lon'), dd.get('lat'), dd.get('name', ''), r.get('fame', 0),
                  int(r['wikidata'][1:]) if r.get('wikidata') else 0])
    return {'rail': {'source': R.get('source'), 'note': R.get('note'),
                     'stations': [[s[0], s[1], s[2], s[3], s[4]] for s in R['stations']], 'edges': R['edges']},
            'lives': L, 'lives_source': 'Pantheon 2025 update (Yu et al. 2016, pantheon.world), CC BY-SA 4.0: the 2,000 most famous people born in Europe and alive in 1789-1914'}


if __name__ == '__main__':
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    out = os.path.join(sys.argv[1], 'atlas-files')
    os.makedirs(out, exist_ok=True)
    f = os.path.join(out, 'e19-deep.json')
    json.dump(sidecar(repo), open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f, os.path.getsize(f))
