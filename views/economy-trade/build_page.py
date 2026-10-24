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
    m = {r['id']: r for r in jsonl('maddison.jsonl') if r['kind'] == 'measure'}
    econ = {}
    for key, slug in (('india', 'country_india'), ('uk', 'country_united_kingdom')):
        econ[key] = {metric: m['m:%s:%s:mpd2020' % (metric, slug)]['points']
                     for metric in ('gdp_per_capita', 'gdp', 'population')}
    blob = {'relays': relays, 'trade': trade, 'migs': migs, 'econ': econ, 'now': YEAR_NOW,
            'mpdCite': m['m:gdp:country_india:mpd2020']['sources'][0]['cite'], 'land': land()}
    s = open(os.path.join(HERE, 'page.src.html'), encoding='utf-8').read()
    s = s.replace('/*__DATA__*/', 'const DATA = ' + json.dumps(blob, separators=(',', ':'), ensure_ascii=False) + ';')
    open(out, 'w', encoding='utf-8').write(s)
    print(out, len(s))


if __name__ == '__main__':
    main()
