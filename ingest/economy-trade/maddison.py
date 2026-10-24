# Usage: python3 ingest/economy-trade/maddison.py
# Downloads the Maddison Project Database 2020 (via Our World in Data's mirror on GitHub)
# into raw/economy-trade/ and writes data/economy-trade/maddison.jsonl:
# one measure per (territory, metric) plus a stub place for each territory.
import csv, json, os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'economy-trade')
OUT = os.path.join(ROOT, 'data', 'economy-trade', 'maddison.jsonl')
NAME = 'Maddison Project Database 2020 (Bolt and van Zanden (2020))'
URL = ('https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/'
       + urllib.request.quote(NAME) + '/' + urllib.request.quote(NAME) + '.csv')
CITE = ('Bolt, Jutta and Jan Luiten van Zanden (2020), "Maddison style estimates of the evolution of '
        'the world economy. A new 2020 update", Maddison Project Database, version 2020')
HOME = 'https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2020'
REGIONS = {'World', 'East Asia', 'Eastern Europe', 'Latin America', 'South and South-East Asia',
           'Sub-Sahara Africa', 'Western Europe'}
METRICS = [('GDP per capita', 'gdp_per_capita', '2011 int$'),
           ('Population', 'population', 'people'),
           ('GDP', 'gdp', '2011 int$')]


def slug(s):
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', s.lower())).strip('_')


def place_id(entity):
    if entity == 'World':
        return 'place:world'
    return ('place:region_' if entity in REGIONS else 'place:country_') + slug(entity)


def num(v):
    if v == '':
        return None
    f = float(v)
    return int(round(f)) if f >= 100 else round(f, 2)


def main():
    os.makedirs(RAW, exist_ok=True)
    raw = os.path.join(RAW, 'mpd2020.csv')
    if not os.path.exists(raw):
        urllib.request.urlretrieve(URL, raw)
    series = {}
    for r in csv.DictReader(open(raw, encoding='utf-8')):
        y = int(r['Year'])
        for col, metric, _ in METRICS:
            v = num(r[col])
            if v is not None:
                series.setdefault((r['Entity'], metric), []).append([y, v])
    src = [{'cite': CITE, 'url': HOME},
           {'cite': 'Our World in Data mirror of MPD 2020', 'url': URL}]
    out = []
    for entity in sorted({e for e, _ in series}):
        region = entity in REGIONS
        out.append({'id': place_id(entity), 'kind': 'place', 'name': entity, 'stub': True,
                    'subtype': 'region', 'today': None if region else entity,
                    'what': ('A world region as grouped by the Maddison Project.' if region else
                             'The territory inside today\'s borders of ' + entity + ', as the Maddison Project counts it.'),
                    'lenses': ['economy', 'population'], 'sources': src[:1], 'status': 'sourced'})
        for _, metric, unit in METRICS:
            pts = sorted(series.get((entity, metric), []))
            if not pts:
                continue
            out.append({'id': 'm:' + metric + ':' + place_id(entity).split(':', 1)[1] + ':mpd2020',
                        'kind': 'measure', 'of': place_id(entity), 'metric': metric, 'unit': unit,
                        'points': pts, 'lenses': ['economy'] if metric != 'population' else ['population'],
                        'sources': src, 'status': 'sourced'})
    with open(OUT, 'w', encoding='utf-8') as f:
        for rec in out:
            f.write(json.dumps({k: v for k, v in rec.items() if v is not None}, ensure_ascii=False) + '\n')
    print(OUT, len(out), 'records')


if __name__ == '__main__':
    main()
