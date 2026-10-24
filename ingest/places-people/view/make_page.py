#!/usr/bin/env python3
"""Build the "Who Could Have Met" page from data/places-people/ records.

Usage: python3 ingest/places-people/view/make_page.py LAND_TOPOJSON OUT.html
LAND_TOPOJSON is a world land TopoJSON (the Living Atlas uses Natural Earth land-50m).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
DATA = os.path.join(ROOT, 'data')

# Pantheon role -> colour group on the map.
GROUPS = {'ruler_or_politician': 'power', 'noble': 'power', 'consort_or_companion': 'power', 'diplomat': 'power',
          'official': 'power', 'activist': 'power', 'extremist': 'power', 'lawyer': 'power', 'judge': 'power',
          'general': 'war', 'pirate': 'war', 'religious_figure': 'faith', 'occultist': 'faith',
          'writer': 'words', 'journalist': 'words', 'historian': 'words',
          'painter': 'arts', 'composer': 'arts', 'sculptor': 'arts', 'musician': 'arts', 'singer': 'arts',
          'actor': 'arts', 'film_director': 'arts', 'architect': 'arts', 'dancer': 'arts', 'designer': 'arts',
          'artist': 'arts', 'fashion_designer': 'arts', 'conductor': 'arts', 'comedian': 'arts', 'producer': 'arts',
          'photographer': 'arts'}


def rows(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]


def main(land_path, out_path):
    places = {r['id']: r for r in rows(os.path.join(DATA, 'living-atlas', 'places.jsonl'))}
    places.update({r['id']: r for r in rows(os.path.join(DATA, 'places-people', 'places.jsonl'))})
    people = rows(os.path.join(DATA, 'places-people', 'people.jsonl'))
    measures = rows(os.path.join(DATA, 'places-people', 'measures.jsonl'))

    pidx, P = {}, []

    def place(pid):
        if pid not in pidx:
            r = places[pid]
            pidx[pid] = len(P)
            P.append([r['name'], round(r['lat'], 3), round(r['lon'], 3), r.get('today') or ''])
        return pidx[pid]

    H = []
    for r in people:
        role = r['roles'][0]
        ideas = 'ideas' in r['lenses'] and role not in GROUPS
        H.append([r['name'], r['born']['year'], r.get('died', {}).get('year'), place(r['born']['place']),
                  place(r['died']['place']) if r.get('died', {}).get('place') else -1,
                  role.replace('_', ' '), GROUPS.get(role, 'ideas' if ideas else 'other'), r['fame'],
                  r['ext']['wikipedia']])

    cities = []  # [place index, [year, people, year, people, ...]] from Reba et al. 2016
    for m in measures:
        if m['id'].endswith(':reba2016'):
            cities.append([place(m['of']), [v for pt in m['points'] for v in pt[:2]]])

    data = json.dumps({'people': H, 'places': P, 'cities': cities}, ensure_ascii=False, separators=(',', ':'))
    land = open(land_path, encoding='utf-8').read()
    html = open(os.path.join(HERE, 'page.html'), encoding='utf-8').read()
    html = html.replace('/*DATA*/null', data).replace('/*LAND*/null', land)
    open(out_path, 'w', encoding='utf-8').write(html)
    print(f'{out_path}: {len(html) // 1024} KB, {len(H)} people, {len(P)} places, {len(cities)} city series')


if __name__ == '__main__':
    main(*sys.argv[1:3])
