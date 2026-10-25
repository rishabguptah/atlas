#!/usr/bin/env python3
"""The living-world thread's researched journeys (data/world/journeys/*.json) -> kernel journeys.

Usage: python3 ingest/travels/world_journeys.py [JOURNEYS_DIR]   (default data/world/journeys; run tools/build.py first)

Their format (data/world/README.md): stops with place, lon, lat, date, until, mode (how the traveller reached the stop),
note, conf documented | likely | guess. Mapped to WORLD.md: documented -> attested, likely -> estimated,
guess -> approximate. Journeys this workstream already writes by hand (itineraries.py) are skipped. Stays of 60 days or
more by a person with a kernel record also become present_at relations.
Writes data/travels/journeys_world.jsonl and data/travels/presences_world.jsonl.
"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, Places, iso, kernel, slug, write_jsonl
from itineraries import TRAVELS, days

CONF = {'documented': 'attested', 'likely': 'estimated', 'guess': 'approximate'}
SKIP = {'faxian', 'evliya_celebi', 'humboldt_americas'} | {t['id'] for t in TRAVELS}
MODES = {'land', 'river', 'sea', 'caravan', 'rail', 'air', 'road', 'foot', 'horse'}
LENSES = {'army': ['people', 'military'], 'merchant': ['people', 'economy'], 'missionary': ['people', 'religion'],
          'pilgrim': ['people', 'religion'], 'scholar': ['people', 'ideas'], 'naturalist': ['people', 'ideas']}


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'world', 'journeys')
    recs = kernel()
    persons = {p['id'] for p in recs['person']}
    places = Places(recs)
    journeys, pres = [], []
    for f in sorted(glob.glob(os.path.join(d, '*.json'))):
        o = json.load(open(f, encoding='utf-8'))
        if o['id'] in SKIP:
            continue
        who = o.get('person') if o.get('person') in persons else None
        legs, prev = [], None
        for s in o['stops']:
            pid = places.resolve(s['place'], s['lon'], s['lat'], r_km=15, cite=o['sources'][0]['cite'] if o.get('sources') else 'data/world')
            arr, left = iso(s.get('date'))[1], iso(s.get('until') or s.get('date'))[1]
            conf = CONF.get(s.get('conf'), 'estimated')
            if prev:
                g = {'from': prev[0], 'to': pid, 'mode': s['mode'] if s.get('mode') in MODES else 'land', 'conf': conf}
                if prev[1]:
                    g['start_date'] = prev[1]
                if arr:
                    g['end_date'] = arr
                if s.get('note'):
                    g['note'] = s['note']
                legs.append(g)
            prev = (pid, left or arr)
            if who and arr and left and days(arr, left) >= 60:
                y0, y1 = iso(arr)[0], iso(left)[0]
                pres.append({'id': f'rel:present:{who.split(":")[1]}:{slug(s["place"])}_{y0}'.replace('-', 'm'), 'kind': 'relation',
                             'type': 'present_at', 'from': who, 'to': pid, 'start': y0, 'end': y1,
                             **({'date': arr} if y0 > 0 else {}), **({'end_date': left} if y1 > 0 else {}),
                             'role': (s.get('note') or o['kind'])[:80], 'conf': conf, 'lenses': ['people'],
                             'sources': o['sources'][:1], 'status': 'draft', 'via': f'route:journey:{o["id"]}'})
        if not legs:
            continue
        rec = {'id': f'route:journey:{o["id"]}', 'kind': 'route', 'subtype': 'journey', 'name': o['name'],
               'carrier': who or o['name'], 'lenses': LENSES.get(o['kind'], ['people', 'geography']),
               'start': o['start'], 'end': o['end'], 'what': o['summary'], 'legs': legs, 'tags': [o['kind']],
               'sources': o['sources'], 'status': o.get('status', 'draft'),
               'conf': 'attested' if sum(g['conf'] == 'attested' for g in legs) * 2 >= len(legs) else 'estimated'}
        journeys.append(rec)
    seen = set()
    pres = [p for p in pres if not (p['id'] in seen or seen.add(p['id']))]
    places.write()
    write_jsonl('journeys_world.jsonl', journeys)
    write_jsonl('presences_world.jsonl', pres)
    print(f'{len(journeys)} journeys, {sum(len(j["legs"]) for j in journeys)} legs, {len(pres)} presences')


if __name__ == '__main__':
    main()
