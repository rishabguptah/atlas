#!/usr/bin/env python3
"""Build the Atlas of Ideas page (religion, philosophy and literature) from the kernel bundle.

Usage: python3 views/religion-ideas/build_page.py LAND_TOPOJSON OUT.html
Run tools/build.py first so dist/kernel.json is fresh. LAND_TOPOJSON is the land-50m file the
Living Atlas uses (atlas/borders/land-50m.json in the project files).
"""
import glob, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
land_path, out = sys.argv[1], sys.argv[2]
kernel = json.load(open(os.path.join(root, 'dist', 'kernel.json'), encoding='utf-8'))['records']
mine = set()
for f in glob.glob(os.path.join(root, 'data', 'religion-ideas', '*.jsonl')):
    mine |= {json.loads(l)['id'] for l in open(f, encoding='utf-8') if l.strip()}
rec = {r['id']: r for rs in kernel.values() for r in rs}


def src(r):
    s = (r.get('sources') or [{}])[0]
    return {'c': s.get('cite'), 'u': s.get('url')}


def base(r):
    d = {'id': r['id'], 'n': r['name'], 'l': r['lenses'], 's': r.get('start'), 'e': r.get('end'), 'p': r.get('place') or r.get('active_place'),
         'w': r.get('what'), 'src': src(r)}
    for f, k in (('start', 's'), ('end', 'e')):
        if r.get(f + '_approx'):
            d[k + 'a'] = 1
        if r.get(f + '_range'):
            d[k + 'r'] = r[f + '_range']
    return d


people = [dict(base(rec[i]), roles=rec[i].get('roles')) for i in sorted(mine) if i.startswith('person:')]
ideas = [dict(base(rec[i]), sub=rec[i].get('subtype')) for i in sorted(mine) if i.startswith('idea:')]
works = [dict(base(rec[i]), sub=rec[i].get('subtype'), a=rec[i].get('author')) for i in sorted(mine) if i.startswith('work:')]
links = [{'t': r['type'], 'f': r['from'], 'to': r['to'], 'y': r.get('start'), 'note': r.get('note')}
         for i in sorted(mine) if i.startswith('rel:') for r in [rec[i]] if r['type'] in ('teacher_of', 'influenced', 'translated')]
routes = []
for i in [i for i in mine if i.startswith('route:')]:
    r = rec[i]
    steps = sorted((rec[s] for s in mine if s.startswith(f'rel:spread_to:{i[6:]}:')), key=lambda s: s['step'])
    carrier = rec.get(r['carrier'], {})
    routes.append({'id': i[6:], 'n': r['name'], 'what': r['what'], 'why': r['why'], 'l': r['lenses'], 'carrier': r['carrier'],
                   'faith': carrier.get('subtype') == 'religion' or None,
                   'steps': [{'p': s['to'], 'via': s.get('via'), 'y': s['start'], 'ya': s.get('start_approx'), 'text': s['note'], 'src': src(s)} for s in steps]})
order = ['aristotle_road', 'buddha_road', 'euclid_road', 'nonviolence_road', 'mani_road', 'islam_spread', 'christianity_spread',
         'fables_road', 'nights_road', 'east_west_poetry', 'confucius_west', 'neo_confucian_road', 'zen_road', 'reformation_road',
         'zoroaster_road', 'sikh_road', 'marx_road']
routes.sort(key=lambda r: order.index(r['id']) if r['id'] in order else 99)
used = {x for d in people + ideas + works for x in [d['p']] if x} | {s[k] for r in routes for s in r['steps'] for k in ('p', 'via') if s.get(k)}
places = {p: {'n': rec[p]['name'], 'la': rec[p]['lat'], 'lo': rec[p]['lon']} for p in sorted(used)}
data = {'places': places, 'people': people, 'ideas': ideas, 'works': works, 'links': links, 'routes': routes}
land = json.dumps(json.load(open(land_path)), separators=(',', ':'))
page = open(os.path.join(here, 'page.src.html'), encoding='utf-8').read()
page = page.replace('/*__DATA__*/', json.dumps(data, ensure_ascii=False, separators=(',', ':'))).replace('/*__LAND__*/', land)
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page), {k: len(v) for k, v in data.items()})
