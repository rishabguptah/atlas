# Usage: python3 views/economy-trade/build_page.py OUT.html
# Builds the economy-trade page (trade-hub relay, India vs Britain, migrations) from data/economy-trade/
# and the land outline from world-atlas@2.0.2 (fetched into raw/economy-trade/ if missing).
import json, os, sys, tarfile, io, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'economy-trade')
RAW = os.path.join(ROOT, 'raw', 'economy-trade')
HERE = os.path.dirname(os.path.abspath(__file__))
YEAR_NOW = 2025


def jsonl(name):
    return [json.loads(l) for l in open(os.path.join(DATA, name), encoding='utf-8')]


def land():
    p = os.path.join(RAW, 'package', 'land-110m.json')
    if not os.path.exists(p):
        os.makedirs(RAW, exist_ok=True)
        tgz = urllib.request.urlopen('https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz').read()
        tarfile.open(fileobj=io.BytesIO(tgz)).extractall(RAW)
    return json.load(open(p))


# world-atlas country names that differ from the kernel's country slugs
WA_ALIAS = {'United States of America': 'united_states', 'Bosnia and Herz.': 'bosnia_and_herzegovina',
            'Central African Rep.': 'central_african_republic', "C\u00f4te d'Ivoire": 'cote_d_ivoire',
            'Dem. Rep. Congo': 'democratic_republic_of_congo', 'Dominican Rep.': 'dominican_republic',
            'Eq. Guinea': 'equatorial_guinea', 'Macedonia': 'north_macedonia', 'S. Sudan': 'south_sudan',
            'Solomon Is.': 'solomon_islands', 'eSwatini': 'eswatini', 'Timor-Leste': 'timor', 'N. Cyprus': 'cyprus',
            'Somaliland': 'somalia'}
# Maddison counts some of today's countries only inside a former state before they split off.
FORMER = {'former_ussr': ['russia', 'ukraine', 'belarus', 'kazakhstan', 'uzbekistan', 'turkmenistan', 'kyrgyzstan',
                          'tajikistan', 'georgia', 'armenia', 'azerbaijan', 'moldova', 'lithuania', 'latvia', 'estonia'],
          'former_yugoslavia': ['serbia', 'croatia', 'slovenia', 'bosnia_and_herzegovina', 'montenegro', 'north_macedonia', 'kosovo'],
          'czechoslovakia': ['czechia', 'slovakia']}
SLIM = lambda pts, step: [p for p in pts if p[0] >= 1950 or p[0] % step == 0 or p[0] < 1800]


def slug(s):
    import re
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', s.lower())).strip('_')


def more(m):
    topo = json.load(open(os.path.join(RAW, 'package', 'countries-110m.json')))
    get = lambda metric, thing, src: m.get('m:%s:%s:%s' % (metric, thing, src), {}).get('points')
    wealth = {'gdppc': {}, 'pop': {}, 'trade': {}, 'parent': {}}
    for g in topo['objects']['countries']['geometries']:
        n = g['properties']['name']
        c = 'country_' + WA_ALIAS.get(n, slug(n))
        g['id'] = n
        if get('gdp_per_capita', c, 'mpd2020'):
            wealth['gdppc'][n] = get('gdp_per_capita', c, 'mpd2020')
        pop = (get('population', c, 'clioinfra') or [])
        gap = get('population', c, 'gapminder') or []
        pop = [p for p in pop if p[0] < 1800] + SLIM(gap, 5)
        if pop:
            wealth['pop'][n] = pop
        if get('trade_share_gdp', c, 'tradhist'):
            wealth['trade'][n] = SLIM(get('trade_share_gdp', c, 'tradhist'), 1)
        for parent, kids in FORMER.items():
            if c[8:] in kids:
                wealth['parent'][n] = parent
    wealth['parents'] = {p: get('gdp_per_capita', 'country_' + p, 'mpd2020') for p in FORMER}
    wealth['names'] = {'former_ussr': 'Former USSR', 'former_yugoslavia': 'Former Yugoslavia', 'czechoslovakia': 'Czechoslovakia'}
    hyde = {r: get('population', 'region_' + slug(r), 'hyde') for r in
            ['Asia', 'Africa', 'Europe', 'North and Central America', 'South America', 'Oceania']}
    silver = {n: get('production_silver', 'country_' + slug(n), 'clioinfra_usgs') for n in
              ['Mexico', 'Peru', 'Bolivia', 'United States', 'Canada', 'Australia', 'China', 'Chile']}
    prices = {c: get('real_price_' + slug(c), 'world', 'jacks') for c in
              ['Wheat', 'Rice', 'Corn', 'Sugar', 'Coffee', 'Tea', 'Cocoa', 'Tobacco', 'Cotton', 'Wool', 'Rubber', 'Palm oil',
               'Coal', 'Petroleum', 'Natural gas', 'Copper', 'Tin', 'Iron ore', 'Steel', 'Gold', 'Silver', 'Beef']}
    ex, im = get('exports_share_gdp', 'world', 'tradhist_nat'), get('imports_share_gdp', 'world', 'tradhist_nat')
    imd = dict(map(tuple, im))
    ic = {}
    for r in m.values():
        if r['metric'] == 'intercontinental_trade_per_capita':
            ic[r['of'].split(':')[1].replace('country_', '').replace('region_', '').replace('_', ' ').title().replace(' And ', ' and ')] = r['points']
    return {'countries': topo, 'wealth': wealth, 'hyde': hyde,
            'urban': get('urban_share', 'world', 'hyde31'),
            'worldTrade': {'tradhist': [[y, round(v + imd[y], 4)] for y, v in ex if y in imd],
                           'pwt': get('trade_share_gdp', 'world', 'pwt90')},
            'ic': ic, 'silver': silver, 'silverWorld': get('production_silver', 'world', 'clioinfra_usgs'),
            'prices': prices, 'londonDelhi': {'London': get('gdp_per_capita', 'london', 'owid_cities'),
                                              'Delhi': get('gdp_per_capita', 'delhi', 'owid_cities')}}


def cites(srcs):
    return [s['cite'] for s in srcs]


def main():
    out = sys.argv[1]
    places = {r['id']: r for r in jsonl('places.jsonl')}
    routes = jsonl('routes.jsonl')
    pt = lambda pid: [places[pid]['lon'], places[pid]['lat']]
    relays, trade, migs = [], [], []
    for r in routes:
        if 'relay' in r.get('tags', []):
            relays.append({'id': r['id'], 'name': r['name'], 'what': r['what'], 'legs': [
                {'name': places[l['place']]['name'], 'at': pt(l['place']), 'start': l['start'],
                 'end': l['end'], 'why': l['why'], 'lost': l.get('lost'), 'cause': l.get('cause'),
                 'src': cites(l['sources'])} for l in r['legs']]})
        elif r['subtype'] == 'trade':
            trade.append({'name': r['name'], 'start': r['start'], 'end': r['end'], 'goods': r['goods'],
                          'line': [pt(s) for s in r['stops']], 'why': r['why'], 'src': cites(r['sources'])})
        else:
            migs.append({'name': r['name'], 'start': r['start'], 'end': r['end'], 'approx': r.get('start_approx', False),
                         'people': r.get('people'), 'forced': r.get('forced', False),
                         'line': [pt(s) for s in r['stops']], 'stops': [places[s]['name'] for s in r['stops']],
                         'why': r['why'], 'src': cites(r['sources'])})
    m = {r['id']: r for f in ('maddison.jsonl', 'owid.jsonl') for r in jsonl(f) if r['kind'] == 'measure'}
    econ = {}
    for key, slug in (('india', 'country_india'), ('uk', 'country_united_kingdom')):
        econ[key] = {metric: m['m:%s:%s:mpd2020' % (metric, slug)]['points']
                     for metric in ('gdp_per_capita', 'gdp', 'population')}
    blob_more = more(m)
    blob = {**blob_more, 'relays': relays, 'trade': trade, 'migs': migs, 'econ': econ, 'now': YEAR_NOW,
            'mpdCite': m['m:gdp:country_india:mpd2020']['sources'][0]['cite'], 'land': land()}
    s = open(os.path.join(HERE, 'page.src.html'), encoding='utf-8').read()
    s = s.replace('/*__DATA__*/', 'const DATA = ' + json.dumps(blob, separators=(',', ':'), ensure_ascii=False) + ';')
    open(out, 'w', encoding='utf-8').write(s)
    print(out, len(s))


if __name__ == '__main__':
    main()
