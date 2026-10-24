#!/usr/bin/env python3
"""Turn dist/kernel.json back into the Living Atlas data shape (ENTRIES, POP, EVENTS, EMPIRES).

Usage: python3 views/living-atlas/export.py OUT.js
The Living Atlas page can then load OUT.js in place of its hand-written data files, so every
city, wonder or empire added to the kernel shows up on the map without touching the page.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAUSES = {'war': 'War or sack', 'fire': 'Fire', 'earthquake': 'Earthquake', 'river': 'River moved',
          'sea': 'Taken by the sea', 'climate': 'Drought or climate', 'trade': 'Trade moved away',
          'capital': 'Power moved elsewhere', 'quarried': 'Quarried for stone', 'volcano': 'Volcano',
          'silt': 'Harbour silted up', 'faith': 'Religious change', 'disease': 'Epidemic', 'unknown': 'Unknown'}


def bare(i):
    return i.split(':', 1)[1]


def order(r):
    lg = r.get('legacy') or {}
    return (0, lg['order'], '') if 'order' in lg else (1, 0, r.get('name', ''))


def main(out):
    recs = json.load(open(os.path.join(ROOT, 'dist', 'kernel.json'), encoding='utf-8'))['records']
    places = sorted((p for p in recs.get('place', []) if p.get('subtype') in ('city', 'wonder') and 'lat' in p), key=order)
    ids = {p['id'] for p in places}
    entries = []
    for p in places:
        e = {'id': bare(p['id']), 'layer': (p.get('legacy') or {}).get('layer') or ('wonders' if p['subtype'] == 'wonder' else 'cities')}
        if 'seven_wonders' in (p.get('tags') or []):
            e['seven'] = 1
        e['name'] = p['name']
        if p.get('alt_names'):
            e['alt'] = p['alt_names'][0] if len(p['alt_names']) == 1 else p['alt_names']
        e.update(today=p.get('today', ''), lat=p['lat'], lon=p['lon'], start=p.get('start'))
        if p.get('start_approx'):
            e['sa'] = 1
        e['end'] = p.get('end')
        if p.get('end_approx'):
            e['ea'] = 1
        if 'causes' in p:
            e['causes'] = p['causes']
        if 'lost' in p:
            e['lost'] = p['lost']
        e.update(what=p.get('what', ''), why=p.get('why', ''),
                 links=[bare(l) for l in p.get('links') or [] if l in ids])
        entries.append(e)
    pop = {}
    for m in recs.get('measure', []):
        if m.get('metric') == 'population' and m.get('of') in ids:
            pop.setdefault(bare(m['of']), [p[:2] for p in m['points']])
    events = {}
    for ev in sorted(recs.get('event', []), key=lambda r: (r.get('start', 0), order(r))):
        if ev.get('place') in ids and 'start' in ev:
            row = [ev['start'], ev['name']] + ([1] if ev.get('destructive') else [])
            events.setdefault(bare(ev['place']), []).append(row)
    empires = []
    for p in sorted((p for p in recs.get('polity', []) if p.get('peak')), key=order):
        e = {'id': bare(p['id']), 'name': p['name'], 'start': p.get('start')}
        if p.get('start_approx'):
            e['sa'] = 1
        e['end'] = p.get('end')
        if p.get('end_approx'):
            e['ea'] = 1
        e['peak'] = p['peak']
        if p.get('capital_point'):
            c = p['capital_point']
            e.update(cap=[c['lon'], c['lat']], capName=c.get('name'))
        if p.get('capital'):
            e['capital'] = bare(p['capital'])
        e.update(match=(p.get('ext') or {}).get('historical_basemaps_names', []), what=p.get('what', ''), why=p.get('why', ''))
        empires.append(e)
    j = lambda v: json.dumps(v, ensure_ascii=False)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// Generated from dist/kernel.json by views/living-atlas/export.py. Do not edit.\n')
        for name, v in (('CAUSES', CAUSES), ('ENTRIES', entries), ('POP', pop), ('EVENTS', events), ('EMPIRES', empires)):
            f.write(f'const {name} = {j(v)};\n')
    print(f'{out}: {len(entries)} places, {len(pop)} population series, {sum(map(len, events.values()))} events, {len(empires)} empires')


if __name__ == '__main__':
    main(sys.argv[1])
