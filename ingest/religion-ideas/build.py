#!/usr/bin/env python3
"""Compile the curated religion, philosophy and literature tables into data/religion-ideas/*.jsonl.

Usage: python3 ingest/religion-ideas/build.py
Every record is status "draft": written from general knowledge and cited to the Wikipedia
article that covers it, waiting for the judge to check. Places and people are stubs, since
places-people owns those kinds.
"""
import json, os, sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from curated_places import PLACES
from curated_people import PEOPLE
from curated_ideas import IDEAS, WORKS
from curated_links import LINKS
from curated_journeys import JOURNEYS

OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'data', 'religion-ideas')
NOTE = 'Religion and ideas workstream draft, written from general knowledge; check against this article'


def src(title):
    return [{'cite': f'Wikipedia: {title}', 'url': 'https://en.wikipedia.org/wiki/' + quote(title.replace(' ', '_'), safe="(),'_–-"), 'note': NOTE}]


def when(r, field, v):
    """Set start/end from an int or a (best, low, high) tuple."""
    if v is None:
        return
    if isinstance(v, tuple):
        r[field], r[field + '_approx'], r[field + '_range'] = v[0], True, [v[1], v[2]]
    else:
        r[field] = v


def yr(v):
    return v[0] if isinstance(v, tuple) else v


def place_id(slug):
    assert slug in PLACES, f'unknown place {slug}'
    return 'place:' + slug


def records():
    out = {k: [] for k in ('places', 'people', 'ideas', 'works', 'relations', 'routes')}
    used = set()

    def P(slug):
        used.add(slug)
        return place_id(slug)

    people = {p[0] for p in PEOPLE}
    for slug, name, born, died, bplace, active, roles, lenses, wiki, what in PEOPLE:
        r = {'id': 'person:' + slug, 'kind': 'person', 'stub': True, 'name': name, 'lenses': lenses + ['people'],
             'roles': roles, 'what': what}
        when(r, 'start', born)
        when(r, 'end', died)
        r['born'] = {'year': yr(born)} if born is not None else {}
        if bplace:
            r['born']['place'] = P(bplace)
        if died is not None:
            r['died'] = {'year': yr(died)}
        r['active_place'] = P(active)
        r.update(sources=src(wiki), status='draft')
        out['people'].append(r)

    for slug, name, sub, start, end, origin, founder, lenses, wiki, what in IDEAS:
        r = {'id': 'idea:' + slug, 'kind': 'idea', 'name': name, 'subtype': sub, 'lenses': lenses, 'place': P(origin), 'what': what}
        when(r, 'start', start)
        if end is None:
            r['end'] = None  # still exists
        else:
            when(r, 'end', end)
        r.update(sources=src(wiki), status='draft')
        out['ideas'].append(r)
        if founder:
            assert founder in people, founder
            out['relations'].append({'id': f'rel:founded:{founder}:{slug}', 'kind': 'relation', 'type': 'founded',
                                     'from': 'person:' + founder, 'to': 'idea:' + slug, 'start': yr(start),
                                     'lenses': lenses, 'sources': src(wiki), 'status': 'draft'})

    for slug, name, sub, author, year, place, lenses, wiki, what in WORKS:
        r = {'id': 'work:' + slug, 'kind': 'work', 'name': name, 'subtype': sub, 'lenses': lenses, 'place': P(place), 'what': what}
        if author:
            assert author in people, author
            r['author'] = 'person:' + author
        when(r, 'start', year)
        r.update(sources=src(wiki), status='draft')
        out['works'].append(r)

    seen = set()
    for typ, frm, to, year, note, wiki in LINKS:
        rid = f'rel:{typ}:{frm.split(":")[1]}:{to.split(":")[1]}'
        assert rid not in seen, rid
        seen.add(rid)
        lens = 'literature' if 'work:' in to else 'ideas'
        r = {'id': rid, 'kind': 'relation', 'type': typ, 'from': frm, 'to': to, 'lenses': [lens, 'people'], 'note': note}
        if year is not None:
            r['start'] = year
        r.update(sources=src(wiki), status='draft')
        out['relations'].append(r)

    for j in JOURNEYS:
        stops, prev = [], None
        for n, (place, year, text, wiki, frm) in enumerate(j['steps'], 1):
            via = prev if frm is None else (frm or None)
            r = {'id': f'rel:spread_to:{j["id"]}:{n:02d}', 'kind': 'relation', 'type': 'spread_to',
                 'from': j['carrier'], 'to': P(place), 'route': 'route:' + j['id'], 'step': n}
            when(r, 'start', year)
            if via:
                r['via'] = P(via)
            r.update(lenses=j['lenses'], note=text, sources=src(wiki), status='draft')
            out['relations'].append(r)
            stops.append('place:' + place)
            prev = place
        out['routes'].append({'id': 'route:' + j['id'], 'kind': 'route', 'subtype': 'idea_spread', 'name': j['name'],
                              'carrier': j['carrier'], 'lenses': j['lenses'], 'stops': stops,
                              'start': yr(j['steps'][0][1]), 'end': yr(j['steps'][-1][1]),
                              'what': j['what'], 'why': j['why'],
                              'sources': [s for st in j['steps'][:1] for s in src(st[3])], 'status': 'draft'})

    for slug in sorted(used):
        name, lat, lon, wiki, today = PLACES[slug]
        out['places'].append({'id': 'place:' + slug, 'kind': 'place', 'stub': True, 'name': name, 'subtype': 'city',
                              'lenses': ['geography'], 'lat': lat, 'lon': lon, 'today': today,
                              'sources': src(wiki), 'status': 'draft'})
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, recs in records().items():
        with open(os.path.join(OUT, name + '.jsonl'), 'w', encoding='utf-8') as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(f'{name}: {len(recs)}')


if __name__ == '__main__':
    main()
