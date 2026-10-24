# Usage: python3 ingest/economy-trade/owid.py
# Downloads long-run economic and population series from Our World in Data's GitHub mirror
# (owid/owid-datasets) into raw/economy-trade/owid/ and writes data/economy-trade/owid.jsonl:
# one measure per (place, metric, dataset), plus stub places for territories and regions.
import csv, json, os, re, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'economy-trade', 'owid')
OUT = os.path.join(ROOT, 'data', 'economy-trade', 'owid.jsonl')
BASE = 'https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/'

# Each dataset: folder name, short source key, citation, licence note, then the columns to keep as
# (column, metric, unit, lens). `place` maps an OWID entity to a place id; `regions` marks entities
# that are world regions in that dataset rather than today's countries.
HYDE_POP = 'Global Population by Region with projections - HYDE (2016) & UN (2017)'
DATASETS = [
    dict(name=HYDE_POP, key='hyde', region_prefix='region_',
         cite='Klein Goldewijk et al., HYDE 3.2 (2016), regional totals compiled by Our World in Data, with UN WPP 2017 after 2015',
         url='https://themasites.pbl.nl/tridion/en/themasites/hyde/',
         cols=[('Global Population by Region (HYDE (2016) and UN (2017))', 'population', 'people', 'population')]),
    dict(name='Historical urban fraction estimates and total computed urban areas - HYDE 3.1 (2010)', key='hyde31', region_prefix='region_hyde_',
         cite='Klein Goldewijk, Beusen and Janssen (2010), "Long term dynamic modeling of global population and built-up area", HYDE 3.1, The Holocene 20(4)',
         url='https://doi.org/10.1177/0959683609356587', scale={'urban_share': 0.01},
         cols=[('Historical urban fraction estimate per region (HYDE 3.1 (2010))', 'urban_share', 'share', 'population'),
               ('Total urban area per world region (HYDE 3.1 (2010))', 'urban_area', 'km2', 'geography')]),
    dict(name='Levels of Urbanization and per capita GNP in Various Regions - Bairoch (1988)', key='bairoch', region_prefix='region_bairoch_',
         cite='Paul Bairoch, Cities and Economic Development: From the Dawn of History to the Present (1988)', scale={'urban_share': 0.01},
         cols=[('Urban population share (Bairoch (1988))', 'urban_share', 'share', 'population'),
               ('Per capita Gross National Product (Bairoch (1988))', 'gnp_per_capita', '1960 US$', 'economy')]),
    dict(name='Population by country, 1800 to 2100 (Gapminder & UN)', key='gapminder',
         cite='Gapminder population v5 (to 1949) and UN World Population Prospects 2017 (1950 on), compiled by Our World in Data',
         url='https://www.gapminder.org/data/documentation/gd003/', max_year=2019,
         cols=[('Population by country, 1800 to 2015 (Gapminder & UN)', 'population', 'people', 'population')]),
    dict(name='Population (Clio-infra (2016)), with Island of Ireland (Rep. + Northern)', key='clioinfra',
         cite='Clio-Infra (2016) total population, with NISRA census figures for Northern Ireland', url='https://www.clio-infra.eu/',
         cols=[('Population (Clio-infra (2016)) with Island of Ireland figures', 'population', 'people', 'population')]),
    dict(name='Total value of exports by country to world (%GDP) (OWID calculations based on Fouquin and Hugot (CEP', key='tradhist', scale={'trade_share_gdp': 0.01},
         cite='Michel Fouquin and Jules Hugot (2016), "Two Centuries of Bilateral Trade and Gravity Data: 1827-2014", CEPII Working Paper 2016-14 (TRADHIST)',
         url='http://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=32',
         cols=[('Total merchandise trade as share of GDP - Fouquin and Hugot (CEPII 2016, Dyadic data)', 'trade_share_gdp', 'share', 'economy')]),
    dict(name='Value of global merchandise imports and exports - (Fouquin and Hugot (CEPII 2016) National data)', key='tradhist_nat', scale={'imports_share_gdp': 0.01, 'exports_share_gdp': 0.01},
         cite='Michel Fouquin and Jules Hugot (2016), TRADHIST national trade data, CEPII Working Paper 2016-14',
         url='http://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=32',
         cols=[('Value of global merchandise imports as a share of GDP (Fouquin and Hugot; CEPII 2016; National data)', 'imports_share_gdp', 'share', 'economy'),
               ('Value of global merchandise exports as a share of GDP (Fouquin and Hugot; CEPII 2016; National data)', 'exports_share_gdp', 'share', 'economy')]),
    dict(name='Globalization over 5 centuries - PWT 9.0, Klasing & Milionis (2014), and Estevadeordal, Frantz, and ', key='pwt90', scale={'trade_share_gdp': 0.01},
         cite='Feenstra, Inklaar and Timmer (2015), "The Next Generation of the Penn World Table", American Economic Review 105(10)', url='https://www.ggdc.net/pwt',
         cols=[('World trade (% of GDP) (PWT 9.0)', 'trade_share_gdp', 'share', 'economy')]),
    dict(name='Intercontinental Trade - Costa, Palma and Reis (2015)', key='cpr2015', region_prefix='region_',
         only_regions={'Austria, Hungary and Czechoslovakia', 'England and Wales', 'Holland'},
         cite='Leonor Costa, Nuno Palma and Jaime Reis (2015), "The great escape? The contribution of the empire to Portugal\'s economic growth, 1500-1800", European Review of Economic History 19(1)',
         url='https://doi.org/10.1093/ereh/heu019',
         cols=[('Intercontinental trade, 1500-1800 (Costa, Palma and Reis (2015))', 'intercontinental_trade_per_capita', '1700 GBP per person', 'economy')]),
    dict(name='International Historical Statistics! European trade - Brian Mitchell (2015)', key='mitchell',
         cite='Brian R. Mitchell, International Historical Statistics: Europe 1750-2010 (Palgrave, 2013 ed.)',
         cols=[('Historical European trade (Brian Mitchell (2015))', 'trade_value', 'million current US$', 'economy')]),
    # OWID's notes say every metal is in thousand tonnes, but the silver, gold and iron ore values only make sense
    # as tonnes, tonnes and million tonnes (world silver 2014 = 26,800, iron ore 2014 = 2,330), so we use those units.
    dict(name='Metal production - Clio Infra & USGS', key='clioinfra_usgs',
         cite='Clio-Infra mine production series (to 2012) and US Geological Survey Mineral Commodity Summaries (2013 on)', url='https://www.clio-infra.eu/',
         cols=[(m + ' Production (Clio-Infra & USGS)', 'production_' + m.lower().replace(' ', '_'), {'Gold': 'tonnes', 'Silver': 'tonnes', 'Iron Ore': 'million tonnes'}.get(m, 'thousand tonnes'), 'economy')
               for m in ['Silver', 'Gold', 'Copper', 'Tin', 'Lead', 'Zinc', 'Iron Ore', 'Bauxite', 'Aluminium', 'Nickel', 'Manganese', 'Tungsten']]),
    dict(name='Real Commodity Price Index since 1850 - Jacks (2016)', key='jacks', world_only=True,
         cite='David S. Jacks (2019), "From Boom to Bust: A Typology of Real Commodity Prices in the Long Run", Cliometrica 13(2), 202-220',
         url='http://www.sfu.ca/~djacks/data/boombust/index.html',
         cols=[(c, 'real_price_' + c.lower().replace(' ', '_'), 'index, 1900=100', 'economy') for c in
               ['Wheat', 'Rice', 'Corn', 'Barley', 'Rye', 'Sugar', 'Coffee', 'Tea', 'Cocoa', 'Cotton', 'Wool', 'Rubber', 'Tobacco', 'Palm oil',
                'Beef', 'Coal', 'Petroleum', 'Natural gas', 'Copper', 'Tin', 'Iron ore', 'Steel', 'Gold', 'Silver']]),
    dict(name='Gold prices - Laurence & Williamson (2017)', key='officer_williamson', world_only=True,
         cite='Lawrence H. Officer and Samuel H. Williamson, "The Price of Gold, 1257-Present", MeasuringWorth (2017), New York market price',
         url='https://www.measuringworth.com/datasets/gold/',
         cols=[('Gold (New York Market Price) (Laurence & Williamson (2017))', 'gold_price', 'current US$ per fine ounce', 'economy')]),
    dict(name='Relative wages of craftsmen to labourers, 1200-2000 - Clark (2005)', key='clark2005', fixed_place='place:region_england',
         cite='Gregory Clark (2005), "The Condition of the Working Class in England, 1209-2004", Journal of Political Economy 113(6)',
         url='https://doi.org/10.1086/498123',
         cols=[('Relative wages of craftsmen to labourers, 1200-2000 (Clark (2005))', 'skill_premium', 'ratio', 'economy')]),
    dict(name='Real GDP per capita, London and Delhi - OWID', key='owid_cities', city=True,
         cite='Our World in Data estimate from the Maddison Project (to 1990) and World Bank (after), for London and Delhi',
         cols=[('Real GDP per capita (OWID)', 'gdp_per_capita', '2011 int$', 'economy')]),
]
# Spell countries the way the Maddison file does, so every source lands on one place id.
ALIASES = {'Czech Republic': 'Czechia', 'Congo, DRC': 'Democratic Republic of Congo', 'Swaziland': 'Eswatini',
           'Macedonia': 'North Macedonia', 'Micronesia (country)': 'Micronesia'}
# Aggregates some datasets mix in with countries.
AGGREGATES = {'Africa', 'America', 'Asia', 'Europe', 'Eastern Europe', 'Western Europe', 'Oceania', 'Micronesia',
              'High income', 'Low income', 'Lower-middle income', 'Upper-middle income'}


def slug(s):
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', s.lower())).strip('_')


def fetch(name):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, slug(name)[:80] + '.csv')
    if not os.path.exists(path):
        q = urllib.parse.quote(name)
        urllib.request.urlretrieve(BASE + q + '/' + q + '.csv', path)
    return list(csv.DictReader(open(path, encoding='utf-8')))


def main():
    gap = {r['Entity'] for r in fetch(DATASETS[3]['name'])}  # Gapminder's list of today's countries
    places, out = {}, []

    def place(entity, ds):
        if ds.get('fixed_place'):
            pid, name, region = ds['fixed_place'], 'England', True
        elif entity == 'World':
            pid, name, region = 'place:world', 'World', True
        elif ds.get('city'):
            pid, name, region = 'place:' + slug(entity), entity, False
        elif 'region_prefix' in ds and entity in ds.get('only_regions', {entity}):
            pid, name, region = 'place:' + ds['region_prefix'] + slug(entity), entity, True
        elif entity in AGGREGATES:
            pid, name, region = 'place:region_' + ds['key'] + '_' + slug(entity), entity, True
        else:
            pid, name, region = 'place:country_' + slug(entity), entity, False
        if pid not in places:
            rec = {'id': pid, 'kind': 'place', 'name': name, 'stub': True, 'lenses': ['economy', 'population'],
                   'sources': [{'cite': ds['cite']}], 'status': 'sourced'}
            if ds.get('city'):
                rec['subtype'] = 'city'
            else:
                rec['subtype'] = 'region'
                rec['what'] = (('A world region as grouped in ' + ds['cite'].split(',')[0] + '.') if region and pid != 'place:world'
                               else 'The whole world.' if pid == 'place:world'
                               else "The territory inside today's borders of " + name + '.')
                if not region:
                    rec['today'] = name
            places[pid] = rec
        return pid

    for ds in DATASETS:
        rows = fetch(ds['name'])
        src = [{'cite': ds['cite'], **({'url': ds['url']} if ds.get('url') else {})},
               {'cite': 'Our World in Data mirror', 'url': BASE + urllib.parse.quote(ds['name'])}]
        series = {}
        for r in rows:
            if r['Entity'] == 'Micronesia (country)' or r['Entity'] not in AGGREGATES:
                r['Entity'] = ALIASES.get(r['Entity'], r['Entity'])
            if ds.get('world_only') and r['Entity'] != 'World':
                continue
            y = int(r['Year'])
            y = y or 1  # HYDE writes 1 CE as year 0; the kernel has no year 0
            if y > ds.get('max_year', 9999):
                continue
            for col, metric, unit, lens in ds['cols']:
                v = r.get(col, '')
                if v in ('', None):
                    continue
                v = float(v) * ds.get('scale', {}).get(metric, 1)
                v = int(round(v)) if abs(v) >= 1000 else round(v, 4)
                series.setdefault((r['Entity'], metric, unit, lens), []).append([y, v])
        for (entity, metric, unit, lens), pts in sorted(series.items()):
            pid = 'place:world' if ds.get('world_only') else place(entity, ds)
            if pid == 'place:world':
                place('World', ds)
            pts.sort()
            out.append({'id': 'm:%s:%s:%s' % (metric, pid.split(':', 1)[1], ds['key']), 'kind': 'measure', 'of': pid,
                        'metric': metric, 'unit': unit, 'points': pts, 'lenses': [lens], 'sources': src, 'status': 'sourced'})
    with open(OUT, 'w', encoding='utf-8') as f:
        for rec in list(places.values()) + out:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    print(OUT, len(places), 'places', len(out), 'measures')


if __name__ == '__main__':
    main()
