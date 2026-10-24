#!/usr/bin/env python3
"""Build the "Borders and Battles" page from data/states-war/.

Usage: python3 views/states-war/build_page.py LAND_TOPOJSON OUT.html
  LAND_TOPOJSON: a world-atlas land file (e.g. land-50m.json from the world-atlas npm package).
Needs npx mapshaper to turn the border GeoJSON into compact TopoJSON.
"""
import glob, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'states-war')
HERE = os.path.dirname(os.path.abspath(__file__))


def jl(name):
    return [json.loads(l) for l in open(os.path.join(DATA, name), encoding='utf-8') if l.strip()]


def main(land_path, out):
    geo_path = os.path.join(DATA, 'geo', 'borders.geojson')
    years = json.load(open(geo_path))['years']
    with tempfile.TemporaryDirectory() as tmp:
        topo_path = os.path.join(tmp, 'borders.json')
        subprocess.run(['npx', '--yes', 'mapshaper@0.6.102', geo_path, '-o', 'format=topojson', 'quantization=20000',
                        topo_path], check=True, capture_output=True)
        topo = json.load(open(topo_path))
    topo['years'] = years

    polities = {r['id']: r for r in jl('polities.jsonl')}
    battles = [r for r in jl('battles.jsonl') if r['kind'] == 'event']
    choke = jl('chokepoints.jsonl')
    places = [r for r in choke if r['kind'] == 'place']
    held = {}
    for r in choke:
        if r['kind'] == 'relation' and r['type'] == 'controls':
            held.setdefault(r['to'], []).append([r['from'], r['start'], r['end']])

    used = set()
    for g in topo['objects']['borders']['geometries']:
        used.add(g['properties']['ref'])
        if g['properties'].get('group'):
            used.add(g['properties']['group'])
    bat = []
    for b in sorted(battles, key=lambda b: b['start']):
        sides = [[{'n': x['name'], **({'p': x['polity']} if x.get('polity') else {})} for x in side] for side in b['sides']]
        used.update(x['p'] for side in sides for x in side if 'p' in x)
        bat.append({'id': b['id'], 'name': b['name'], 'y': b['start'], 'lat': b['lat'], 'lon': b['lon'], 't': b['subtype'],
                    's': sides, 'w': b['winner'], 'why': b['why'], 'u': b['sources'][0]['url'], 'k': 1,
                    **({'q': b['wikidata']} if b.get('wikidata') else {})})
    for b in jl('battles-wikidata.jsonl'):
        if b['kind'] != 'event':
            continue
        pr = [{'n': x['name'], **({'p': x['ref']} if x.get('ref', '').startswith('polity:') else {})} for x in b.get('participants', [])]
        used.update(x['p'] for x in pr if 'p' in x)
        rec = {'id': b['id'], 'name': b['name'], 'y': b['start'], 'lat': b['lat'], 'lon': b['lon'], 't': b['subtype'], 'q': b['wikidata']}
        if pr:
            rec['pr'] = pr
        if b.get('wars'):
            rec['war'] = b['wars'][0]['name']
        if len(b['sources']) > 1:
            rec['u'] = b['sources'][1]['url']
        bat.append(rec)
    bat.sort(key=lambda b: b['y'])
    ch = []
    for p in places:
        h = sorted(held.get(p['id'], []), key=lambda z: z[1])
        used.update(z[0] for z in h)
        ch.append({'id': p['id'], 'name': p['name'], 'sub': p['subtype'], 'lat': p['lat'], 'lon': p['lon'], 'what': p['what'],
                   'why': p['why'], 'u': p['sources'][0]['url'], 'start': p.get('start'), 'h': h})
    pol = {}
    for pid in used:
        r = polities.get(pid)
        if not r:
            continue
        pol[pid] = [r['name'], r.get('start'), r.get('end'), r.get('subtype'), r.get('wikidata'),
                    r.get('ext', {}).get('wikipedia'), *(r.get('peak') or [None, None])]
    area = {}
    # Cliopatria area series, ours plus the ones order-chaos already published
    for path in glob.glob(os.path.join(ROOT, 'data', '*', '*.jsonl')):
        for line in open(path, encoding='utf-8'):
            if '"m:area:' not in line:
                continue
            m = json.loads(line)
            if m.get('metric') == 'area' and m['id'].endswith(':cliopatria') and m['of'] in pol:
                area[m['of']] = m['points']
    summary = f'{len(polities):,} states, {len(bat)} battles and {len(ch)} chokepoints'
    land = json.load(open(land_path))
    data = ('const TOPO = ' + json.dumps(topo, separators=(',', ':')) + ';\n' +
            'const LAND = ' + json.dumps(land, separators=(',', ':')) + ';\n' +
            'const POL = ' + json.dumps(pol, ensure_ascii=False, separators=(',', ':')) + ';\n' +
            'const AREA = ' + json.dumps(area, separators=(',', ':')) + ';\n' +
            'const BAT = ' + json.dumps(bat, ensure_ascii=False, separators=(',', ':')) + ';\n' +
            'const CHOKE = ' + json.dumps(ch, ensure_ascii=False, separators=(',', ':')) + ';\n' +
            'const SUMMARY = ' + json.dumps(summary) + ';\n')
    page = open(os.path.join(HERE, 'page.html'), encoding='utf-8').read().replace('/*__DATA__*/', data)
    open(out, 'w', encoding='utf-8').write(page)
    print(out, f'{len(page) / 1e6:.1f} MB', summary)


if __name__ == '__main__':
    main(*sys.argv[1:3])
