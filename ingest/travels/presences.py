#!/usr/bin/env python3
"""Wikidata stays and battles -> present_at relations (data/travels/presences_wikidata.jsonl).

Usage: python3 ingest/travels/presences.py   (after fetch_wikidata.py and tools/build.py)

Residence (P551) -> role "lived", work location (P937) -> "worked", educated at (P69) -> "studied at X",
employer (P108) -> "worked for X", position held (P39) -> "office: X" at the office's location or the capital of its
jurisdiction, battles (P607 with their own coordinates, under two years long) -> "battle: X".
conf: attested when Wikidata dates the stay; estimated when we infer the years (study at 15-25, battles dated by the
battle); approximate when only the person's adult life bounds it. An institution sits at the town it is in, with
`venue` naming it. Burials (P119) are left out: the dead don't meet anyone.
"""
import json, os, re, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Places, iso, kernel, slug, write_jsonl

RAW = '/mnt/project-files/atlas/raw/travels'
CITE = 'Wikidata (CC0), statement on'
PT = re.compile(r'Point\(([-\d.]+) ([-\d.]+)\)')


def pt(v):
    m = PT.match(v or '')
    return (float(m.group(1)), float(m.group(2))) if m else None


def q(v):
    return v.rsplit('/', 1)[-1] if v else None


def main():
    recs = kernel()
    people = {}
    for p in sorted(recs['person'], key=lambda p: (bool(p.get('stub')), -(p.get('fame') or 0))):
        if p.get('wikidata'):
            people.setdefault(p['wikidata'], p)
    places = Places(recs)
    countries = {p['today'] for p in recs['place'] if p.get('today')} | {p['name'] for p in recs['polity']}
    coords = json.load(open(os.path.join(RAW, 'wd_coords.json')))
    stays = json.load(open(os.path.join(RAW, 'wd_stays.json')))
    battles = json.load(open(os.path.join(RAW, 'wd_battles.json')))

    def where(item, *extra):
        for it in (item,) + extra:
            c = coords.get(q(it) or '', {})
            for f in ('c', 'hq', 'lo', 'in', 'cap'):
                p = pt(c.get(f))
                if p:
                    return p, f, c.get('label')
        return None, None, None

    # How often the kernel mentions a place: the town an institution or a palace belongs to is the busiest one nearby.
    weight = defaultdict(int)
    for kind in ('person', 'event', 'relation', 'work'):
        for r in recs.get(kind, []):
            if r.get('type') == 'present_at':
                continue
            for f in ('place', 'to'):
                if isinstance(r.get(f), str) and r[f].startswith('place:'):
                    weight[r[f]] += 1
            for f in ('born', 'died'):
                if isinstance(r.get(f), dict) and r[f].get('place'):
                    weight[r[f]['place']] += 1

    def snap(lonlat, year):
        best = None
        for d, x in places.near(lonlat[0], lonlat[1], 15):
            if x.get('subtype') not in ('city', 'site', None):
                continue
            if (year or 0) > 700 and (x['id'].endswith('_ancient') or 'roman' in x['id']):
                continue
            score = (weight.get(x['id'], 0) + 1) / (1 + d / 3)
            if not best or score > best[0]:
                best = (score, x['id'])
        return best[1] if best else None

    out, seen, n = [], set(), defaultdict(int)
    skipped = defaultdict(int)

    def add(p, prop, item, label, lonlat, how, s, e, pit, role, kind):
        if not lonlat:
            skipped['no place'] += 1
            return
        if not (-180 <= lonlat[0] <= 180 and -90 <= lonlat[1] <= 90):
            return
        born, died = p.get('start'), p.get('end')
        y0, d0 = iso(s or pit)
        y1, d1 = iso(e or pit)
        conf = 'attested'
        if y0 is None and y1 is None:
            if born is None:
                skipped['undated'] += 1
                return
            if kind == 'study':
                y0, y1, conf = born + 15, born + 25, 'estimated'
            else:
                y0, y1, conf = born + 18, died if died else born + 70, 'unknown'
            d0 = d1 = None
        elif y0 is None:
            y0, d0, conf = y1, None, 'estimated'
        elif y1 is None:
            y1, d1 = (died, None) if died and kind != 'battle' else (y0, d0)
            if kind != 'battle':
                conf = 'estimated'
        if y1 < y0:
            y0, y1 = y1, y0
            d0, d1 = d1, d0
        if born and died and (y1 < born or y0 > died + 1):
            skipped['outside life'] += 1
            return
        name = label or (coords.get(q(item), {}).get('label')) or 'unnamed place'
        is_place = prop in ('P551', 'P937')
        if name in countries:
            skipped['a whole country'] += 1
            return
        pid = places.by_wd[q(item)]['id'] if is_place and q(item) in places.by_wd else None
        if pid and weight.get(pid, 0) < 3:  # a palace, bunker or suburb: say the town, keep the building as venue
            snapped = snap(lonlat, y0)
            if snapped and snapped != pid:
                r_venue = places.by_id[pid]['name']
                pid = snapped
                label = label or r_venue
                is_place = False
        if not pid and not is_place:
            pid = snap(lonlat, y0)
        pid = pid or places.resolve(name, lonlat[0], lonlat[1], wd=q(item), r_km=25, cite='Wikidata (CC0)')
        if not pid:
            return
        key = (p['id'], pid, y0, role)
        if key in seen:
            return
        seen.add(key)
        ps = p['id'].split(':', 1)[1]
        n[ps] += 1
        r = {'id': f'rel:present:{ps}:wd{n[ps]}', 'kind': 'relation', 'type': 'present_at', 'from': p['id'], 'to': pid,
             **({'start': y0, 'end': y1} if conf != 'unknown' else {'window': [y0, y1]}), 'role': role, 'conf': conf, 'lenses': ['people'],
             'sources': [{'cite': f'{CITE} {p.get("wikidata")} {prop}', 'url': f'https://www.wikidata.org/wiki/{p.get("wikidata")}#{prop}'}],
             'status': 'sourced', 'wd_prop': prop}
        if d0 and y0 > 0 and len(d0) > 4:
            r['date'] = d0
        if d1 and y1 > 0 and len(d1) > 4:
            r['end_date'] = d1
        if not is_place and label:
            r['venue'] = label[:80]
        if how not in ('c', None):
            r['placed_by'] = {'hq': 'headquarters', 'lo': 'location', 'in': 'located in', 'cap': 'capital of jurisdiction'}[how]
        out.append(r)

    for s in stays:
        p = people.get(q(s['p']))
        prop = s['prop']
        if not p or prop == 'P119':
            continue
        label = s.get('xl')
        if prop == 'P39':
            lonlat, how, _ = where(s.get('loc'), s.get('x'), s.get('jur'))
            if not lonlat:
                skipped['office without seat'] += 1
                continue
            add(p, prop, s.get('loc') or s['x'], label, lonlat, how, s.get('s'), s.get('e'), s.get('pit'),
                f'office: {label}' if label else 'office', 'office')
            continue
        lonlat, how, _ = where(s['x'])
        role = {'P551': 'lived', 'P937': 'worked', 'P69': f'studied at {label}' if label else 'studied',
                'P108': f'worked for {label}' if label else 'employed'}[prop]
        add(p, prop, s['x'], label, lonlat, how, s.get('s'), s.get('e'), s.get('pit'), role[:90],
            'study' if prop == 'P69' else 'stay')
    for b in battles:
        p = people.get(q(b['p']))
        if not p:
            continue
        c = coords.get(q(b['b']), {})
        lonlat = pt(c.get('c'))
        ys, ye = iso(b.get('d') or b.get('s'))[0], iso(b.get('e') or b.get('d') or b.get('s'))[0]
        if not lonlat or ys is None or (ye or ys) - ys > 2:
            skipped['war, not a battle'] += 1
            continue
        add(p, 'P607', b['b'], b.get('bl'), lonlat, 'c', b.get('d') or b.get('s'), b.get('e') or b.get('d') or b.get('s'),
            None, f'battle: {b.get("bl") or "battle"}'[:90], 'battle')
    out.sort(key=lambda r: r['id'])
    places.write()
    write_jsonl('presences_wikidata.jsonl', out)
    from collections import Counter
    print(f'{len(out)} presences for {len(n)} people; by source {dict(Counter(r["wd_prop"] for r in out))}; '
          f'conf {dict(Counter(r["conf"] for r in out))}; skipped {dict(skipped)}; {len(places.stubs)} stub places')


if __name__ == '__main__':
    main()
