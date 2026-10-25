#!/usr/bin/env python3
"""SlaveVoyages (Trans-Atlantic and Intra-American databases, May 2023) -> the forced journeys of enslaved people.

Usage: python3 ingest/travels/slave.py   (reads raw/economy-trade/slavevoyages/ and /tmp codebook text, see below)

Writes
  data/travels/voyages/slave.json   every voyage, compact columns: year, ship, captain, flag, where it began, where
                                    captives were taken aboard, where survivors were landed, people embarked and
                                    landed (SlaveVoyages' imputed estimates), revolts. Read by lenses/travels.py.
  data/travels/slave_routes.jsonl   one kernel route per (African region -> American region) with the people carried
                                    and the people who died at sea, by decade.

House rule (PRIORITIES, thread brief): these are people, not cargo. Counts are "people embarked", "people who
died on the crossing", "survivors landed"; never "slaves shipped" or tonnage of humans. The codebook's port codes
are read from SPSS_Codebook_2022.pdf (pdftotext -layout), so poppler-utils must be installed.
"""
import csv, json, os, re, subprocess, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, RAW, Places, slug, write_jsonl

SRC = os.path.join(RAW, 'economy-trade', 'slavevoyages')
CITE = {'cite': 'SlaveVoyages: Trans-Atlantic and Intra-American Slave Trade Databases, May 2023 release '
                '(Eltis, Richardson et al.), www.slavevoyages.org; free for research and education',
        'url': 'https://www.slavevoyages.org/'}
FLAGS = {1: 'Spain', 2: 'Uruguay', 3: 'Spain/Uruguay', 4: 'Portugal', 5: 'Brazil', 6: 'Portugal/Brazil',
         7: 'Great Britain', 8: 'Netherlands', 9: 'U.S.A.', 10: 'France', 11: 'Denmark', 12: 'Hanse towns/Brandenburg',
         13: 'Sweden', 14: 'Norway', 15: 'Denmark/Baltic', 16: 'Argentina', 17: 'Russia', 18: 'Sardinia', 19: 'Mexico',
         24: 'Genoa', 25: 'Courland', 26: 'Prussia', 27: 'Bremen', 28: 'Austria', 30: 'Other'}
RESIST = {1: 'insurrection', 2: 'ship attacked from shore', 3: "ship's boats attacked from shore", 4: '"cut-off"',
          5: 'captives jumped overboard or escaped', 6: 'insurrection planned, thwarted'}

# Specific regions (codebook) -> (name, lon, lat) at the region's main port or centre.
REGIONS = {
    10100: ('Spain', -6.29, 36.53), 10200: ('Portugal', -9.14, 38.71), 10300: ('Great Britain', -2.99, 53.40),
    10400: ('England', -2.99, 53.40), 10500: ('Scotland', -4.25, 55.86), 10600: ('Ireland', -6.26, 53.35),
    10700: ('France', -1.55, 47.22), 10800: ('Netherlands', 3.57, 51.44), 10900: ('Denmark', 12.57, 55.68),
    11000: ('Northern Germany', 9.99, 53.55), 11100: ('Belgium', 4.40, 51.22), 11200: ('Norway', 5.33, 60.39),
    11300: ('Sweden', 11.97, 57.71), 11400: ('Italy', 8.93, 44.41), 11500: ('Russia', 30.31, 59.94), 11700: ('Latvia', 24.11, 56.95),
    20100: ('Rhode Island', -71.31, 41.49), 20200: ('Maine', -69.82, 43.91), 20300: ('New Hampshire', -70.76, 43.07),
    20400: ('Massachusetts', -71.06, 42.36), 20500: ('Connecticut', -72.93, 41.31), 20600: ('New York', -74.01, 40.71),
    20700: ('Delaware', -75.55, 39.74), 20800: ('New Jersey', -74.75, 40.0), 20900: ('Pennsylvania', -75.16, 39.95),
    21000: ('Maryland', -76.49, 38.98), 21100: ('Virginia', -76.3, 37.0), 21200: ('North Carolina', -77.94, 34.23),
    21300: ('South Carolina', -79.93, 32.78), 21400: ('Georgia', -81.09, 32.08), 21500: ('Florida', -81.31, 29.90),
    21600: ('Gulf coast', -90.07, 29.95), 21700: ('Canada', -63.57, 44.65), 21800: ('Kentucky', -85.76, 38.25),
    21900: ('North America', -77.0, 38.0), 22000: ('Tennessee', -86.78, 36.16), 22100: ('Texas', -94.8, 29.3),
    23000: ('California', -122.4, 37.8),
    31100: ('Hispaniola', -69.93, 18.47), 31200: ('Puerto Rico', -66.11, 18.47), 31300: ('Cuba', -82.36, 23.13),
    31400: ('Spanish Caribbean', -75.0, 18.0), 32100: ('Dutch Caribbean', -68.93, 12.11), 32200: ('Dutch Guianas', -55.17, 5.85),
    32300: ('Dutch Americas', -60.0, 10.0), 33200: ('Tortola', -64.62, 18.42), 33300: ('Anguilla', -63.05, 18.22),
    33400: ('Antigua', -61.85, 17.12), 33500: ('St. Kitts', -62.72, 17.30), 33600: ('Nevis', -62.62, 17.14),
    33700: ('Montserrat', -62.19, 16.74), 33800: ('Dominica', -61.39, 15.30), 34100: ('St. Lucia', -60.99, 14.01),
    34200: ('Barbados', -59.62, 13.10), 34300: ('St. Vincent', -61.23, 13.16), 34400: ('Grenada', -61.75, 12.05),
    34500: ('Trinidad', -61.51, 10.66), 34600: ('Tobago', -60.73, 11.18), 35100: ('Jamaica', -76.79, 17.97),
    35200: ('Bahamas', -77.35, 25.06), 35300: ('British Guiana', -58.16, 6.80), 35400: ('British Honduras', -88.20, 17.50),
    35500: ('British Caribbean', -62.0, 15.0), 36100: ('Martinique', -61.18, 14.74), 36200: ('Guadeloupe', -61.73, 15.99),
    36300: ('French Guiana', -52.33, 4.94), 36400: ('Saint-Domingue', -72.20, 19.76), 36500: ('French Caribbean', -62.0, 15.5),
    37000: ('Danish West Indies', -64.93, 18.34), 38100: ('Swedish Caribbean', -62.85, 17.90), 39000: ('Caribbean', -66.0, 16.0),
    39900: ('Caribbean', -66.0, 16.0), 41200: ('Spanish Circum-Caribbean', -75.51, 10.39), 42000: ('Río de la Plata', -58.38, -34.60),
    43000: ('Peru', -77.04, -12.05), 44000: ('Chile', -71.62, -33.05), 45000: ('Ecuador', -79.9, -2.2),
    46000: ('Pacific Central America', -79.52, 8.98),
    50100: ('Amazonia', -44.30, -2.53), 50200: ('Bahia', -38.51, -12.97), 50300: ('Pernambuco', -34.88, -8.05),
    50400: ('Southeast Brazil', -43.17, -22.91), 50500: ('Brazil', -45.0, -15.0),
    60100: ('Senegambia', -16.0, 13.5), 60200: ('Sierra Leone', -13.23, 8.48), 60300: ('Windward Coast', -9.5, 5.5),
    60400: ('Gold Coast', -1.25, 5.10), 60500: ('Bight of Benin', 2.08, 6.36), 60600: ('Bight of Biafra', 7.2, 4.4),
    60700: ('West Central Africa', 13.23, -8.84), 60800: ('Southeast Africa', 40.74, -15.03), 60900: ('Africa', 3.0, 3.0),
    80100: ('East Indies', 106.8, -6.1), 80200: ('the Americas', -60.0, 10.0), 80300: ('Asia and Africa', 40.0, 0.0),
    80400: ('Spanish Americas', -75.0, 10.0), 80500: ('British Americas', -70.0, 20.0), 80600: ('India', 88.36, 22.57),
}
# Ports that carried most people, placed by hand (the codebook gives names only).
PORTS = {
    60734: ('Luanda', 13.23, -8.81), 60502: ('Costa da Mina', 1.5, 6.2), 60605: ('Bonny', 7.17, 4.43), 60515: ('Ouidah (Whydah)', 2.08, 6.36),
    60707: ('Benguela', 13.40, -12.58), 60711: ('Cabinda', 12.20, -5.56), 60608: ('Old Calabar', 8.33, 4.95), 60820: ('Mozambique Island', 40.74, -15.03),
    60725: ('Malembo', 12.15, -5.33), 60408: ('Anomabu', -1.13, 5.17), 60717: ('Congo River', 12.35, -6.0), 60126: ('Cape Verde Islands', -23.51, 14.92),
    60108: ('Gambia', -16.58, 13.45), 60724: ('Loango', 11.82, -4.65), 60412: ('Cape Coast Castle', -1.24, 5.10), 60822: ('Quelimane', 36.89, -17.88),
    60703: ('Ambriz', 13.12, -7.84), 60673: ('São Tomé', 6.73, 0.34), 60517: ('Lagos (Onim)', 3.39, 6.45), 60415: ('Elmina', -1.35, 5.08),
    60716: ('Congo North', 12.0, -5.0), 60622: ('New Calabar', 6.85, 4.55), 60220: ('Sierra Leone estuary', -13.2, 8.5), 60506: ('Allada (Ardra)', 2.2, 6.4),
    60118: ('Saint-Louis', -16.50, 16.03), 60104: ('Bissau', -15.60, 11.86), 60523: ('Porto-Novo', 2.63, 6.50), 60105: ('Cacheu', -16.17, 12.27),
    60210: ('Îles de Los', -13.80, 9.50), 60507: ('Badagry', 2.88, 6.42), 60208: ('Gallinas', -11.4, 7.0), 60306: ('Cape Mount', -11.37, 6.75),
    60501: ('Benin', 5.62, 6.33), 60109: ('Gorée', -17.40, 14.67), 60620: ('Gabon', 9.45, 0.39), 60668: ('Príncipe', 7.41, 1.64),
    60609: ('Cameroons', 9.70, 4.05), 60514: ('Jakin', 2.3, 6.35), 60309: ('Grand-Lahou', -5.02, 5.13), 60811: ('Madagascar', 44.0, -20.0),
    60302: ('Bassa', -10.05, 5.88), 60509: ('Ekpe (Epe)', 2.6, 6.4), 60510: ('Popo', 1.6, 6.23), 60404: ('Accra', -0.20, 5.55),
    60414: ('Christiansborg', -0.18, 5.55), 60202: ('Bunce Island', -13.04, 8.57), 60213: ('Rio Pongo', -14.0, 10.1), 60114: ('Portuguese Guinea', -15.6, 11.9),
    60740: ('St. Helena', -5.72, -15.93), 60207: ('Freetown', -13.23, 8.48), 60803: ('Cape of Good Hope', 18.42, -33.92),
    50299: ('Salvador da Bahia', -38.51, -12.97), 50422: ('Rio de Janeiro', -43.17, -22.91), 50399: ('Recife (Pernambuco)', -34.88, -8.05),
    35114: ('Kingston', -76.79, 17.97), 35199: ('Jamaica', -76.79, 17.97), 34299: ('Bridgetown (Barbados)', -59.62, 13.10),
    36403: ('Cap-Français', -72.20, 19.76), 31312: ('Havana', -82.36, 23.13), 32240: ('Paramaribo (Suriname)', -55.17, 5.85),
    31399: ('Cuba', -80.0, 22.0), 41207: ('Cartagena', -75.51, 10.39), 36199: ('Saint-Pierre (Martinique)', -61.18, 14.74),
    21302: ('Charleston', -79.93, 32.78), 34499: ("St. George's (Grenada)", -61.75, 12.05), 33599: ('Basseterre (St. Kitts)', -62.72, 17.30),
    33401: ("St. John's (Antigua)", -61.85, 17.12), 32110: ('Curaçao', -68.93, 12.11), 36412: ('Port-au-Prince', -72.34, 18.54),
    33899: ('Roseau (Dominica)', -61.39, 15.30), 50102: ('São Luís (Maranhão)', -44.30, -2.53), 36409: ('Léogâne', -72.63, 18.51),
    41203: ('Veracruz', -96.13, 19.20), 35304: ('Demerara', -58.16, 6.80), 41201: ('New Spain', -96.13, 19.20), 42001: ('Buenos Aires', -58.38, -34.60),
    50424: ('Rio de Janeiro', -43.17, -22.91), 36404: ('Les Cayes', -73.75, 18.19), 36201: ('Basse-Terre', -61.73, 15.99),
    34399: ('Kingstown (St. Vincent)', -61.23, 13.16), 31323: ('Santiago de Cuba', -75.82, 20.02), 36414: ('Saint-Marc', -72.70, 19.11),
    50406: ('Campos', -41.32, -21.75), 37020: ('St. Thomas', -64.93, 18.34), 35107: ('Montego Bay', -77.92, 18.47), 50103: ('Belém (Pará)', -48.50, -1.46),
    32150: ('St. Eustatius', -62.98, 17.48), 42002: ('Montevideo', -56.19, -34.90), 50423: ('Rio de Janeiro province', -43.0, -22.7),
    31324: ('Trinidad de Cuba', -79.98, 21.80), 21111: ('York River', -76.5, 37.25), 50430: ('São Sebastião', -45.40, -23.80),
    50416: ('Macaé', -41.79, -22.37), 31299: ('San Juan (Puerto Rico)', -66.11, 18.47), 37010: ('St. Croix', -64.75, 17.73),
    34599: ('Port of Spain (Trinidad)', -61.51, 10.66), 33601: ('Charlestown (Nevis)', -62.62, 17.14), 31306: ('Cárdenas', -81.20, 23.04),
    50412: ('Ilha Grande', -44.23, -23.15), 21199: ('Virginia', -76.3, 37.0), 31316: ('Matanzas', -81.58, 23.05), 36301: ('Cayenne', -52.33, 4.94),
    32230: ('Essequibo', -58.6, 6.9), 33299: ('Road Town (Tortola)', -64.62, 18.42), 21401: ('Savannah', -81.09, 32.08),
    21109: ('Upper James River', -77.4, 37.4), 32250: ('Berbice', -57.5, 6.25), 31301: ('Bahía Honda', -83.17, 22.90),
    21601: ('New Orleans', -90.07, 29.95), 20101: ('Bristol (RI)', -71.27, 41.67), 20601: ('Brookhaven', -72.9, 40.8),
    10432: ('Liverpool', -2.99, 53.40), 10433: ('London', -0.08, 51.51), 10434: ('Bristol', -2.59, 51.45), 10735: ('Nantes', -1.55, 47.22),
    10201: ('Lisbon', -9.14, 38.71), 10731: ('La Rochelle', -1.15, 46.16), 10706: ('Le Havre', 0.11, 49.49), 10728: ('Bordeaux', -0.58, 44.84),
    20402: ('Boston', -71.06, 42.36), 20103: ('Newport', -71.31, 41.49),
}
BROAD_BOX = {1: (-12, 35, 35, 66), 2: (-100, 24, -60, 50), 3: (-90, 9, -55, 28), 4: (-100, -45, -55, 25),
             5: (-55, -35, -34, 2), 6: (-26, -36, 52, 20)}


def codebook():
    txt = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'sv_codebook.txt')
    if not os.path.exists(txt):
        subprocess.run(['pdftotext', '-layout', os.path.join(SRC, 'SPSS_Codebook_2022.pdf'), txt], check=True)
    t = open(txt, encoding='utf-8').read().split('APPENDIX: GEOGRAPHICAL CODES')[-1]
    codes = {}
    for m in re.finditer(r'(?<!\d)(\d{5})\s{2,}([^\d\n][^\n]*?)(?=\s{3,}|\n|$)', t):
        c, n = int(m.group(1)), m.group(2).strip()
        if c not in codes and len(n) > 1:
            codes[c] = n
    return codes


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class Geo:
    def __init__(self, codes, places):
        self.codes, self.places, self.cache = codes, places, {}
        self.by_slug = {}
        for p in places.by_id.values():
            if isinstance(p.get('lon'), (int, float)):
                self.by_slug.setdefault(slug(p.get('name')), []).append(p)

    def __call__(self, code):
        """code -> (name, lon, lat, region code, exact?) or None."""
        if not code or code < 10000 or code >= 99000:
            return None
        if code in self.cache:
            return self.cache[code]
        reg = code // 100 * 100
        r = None
        if code in PORTS:
            n, lo, la = PORTS[code]
            r = (n, lo, la, reg, True)
        else:
            name = self.codes.get(code, '')
            box = BROAD_BOX.get(code // 10000)
            if name and box and 'unspecified' not in name and code % 100 != 99:
                key = slug(re.sub(r'\(.*?\)', '', name))
                for p in self.by_slug.get(key, []):
                    if box[0] <= p['lon'] <= box[2] and box[1] <= p['lat'] <= box[3]:
                        r = (name, p['lon'], p['lat'], reg, True)
                        break
            if not r and reg in REGIONS:
                n, lo, la = REGIONS[reg]
                r = (name if name and code % 100 != 99 else n, lo, la, reg, False)
        self.cache[code] = r
        return r


def main():
    codes = codebook()
    places = Places()
    # Speed up name matching: index kernel places by slug once.
    geo = Geo(codes, places)
    ports, port_ix = [], {}

    def pix(code):
        g = geo(code)
        if not g:
            return -1
        if code not in port_ix:
            port_ix[code] = len(ports)
            ports.append([code, g[0], round(g[1], 2), round(g[2], 2), g[3], 1 if g[4] else 0])
        return port_ix[code]

    cols = {k: [] for k in ('id', 'set', 'y', 'ship', 'captain', 'flag', 'start', 'buy', 'land', 'emb', 'dis', 'resist', 'fate')}
    flows = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))  # (afr reg, am reg) -> decade -> [voyages, emb, dis]
    for fn, ds in (('Voyages-TSTD-May2023.tab', 'T'), ('Voyages-IAm-May2023.tab', 'I')):
        rd = csv.DictReader(open(os.path.join(SRC, fn), encoding='utf-8', errors='replace'), delimiter='\t')
        for r in rd:
            y = num(r.get('YEARAM'))
            if not y:
                continue
            y = int(y)
            buy, land = int(num(r.get('MJBYPTIMP')) or 0), int(num(r.get('MJSLPTIMP')) or 0)
            emb, dis = num(r.get('SLAXIMP')), num(r.get('SLAMIMP'))
            cols['id'].append(int(num(r['VOYAGEID']) or 0))
            cols['set'].append(ds)
            cols['y'].append(y)
            cols['ship'].append((r.get('SHIPNAME') or '').strip()[:40])
            cols['captain'].append((r.get('CAPTAINA') or '').strip()[:40])
            cols['flag'].append(int(num(r.get('NATINIMP')) or 0))
            cols['start'].append(pix(int(num(r.get('PTDEPIMP')) or 0)))
            cols['buy'].append(pix(buy))
            cols['land'].append(pix(land))
            cols['emb'].append(int(round(emb)) if emb else 0)
            cols['dis'].append(int(round(dis)) if dis else 0)
            cols['resist'].append(int(num(r.get('RESISTANCE')) or 0))
            cols['fate'].append(int(num(r.get('FATE2')) or 0))
            gb, gl = geo(buy), geo(land)
            if ds == 'T' and gb and gl and gb[3] // 10000 == 6 and emb:
                f = flows[(gb[3], gl[3])][y // 10 * 10]
                f[0] += 1
                f[1] += emb
                f[2] += dis or 0
    os.makedirs(os.path.join(DATA, 'voyages'), exist_ok=True)
    out = {'source': CITE, 'flags': FLAGS, 'resist': RESIST, 'regions': {k: v[0] for k, v in REGIONS.items()},
           'ports': ports, 'voyages': cols,
           'note': 'emb / dis are SlaveVoyages imputed estimates of people embarked in Africa and landed alive; '
                   'emb - dis died on the crossing. set T = trans-Atlantic, I = intra-American.'}
    with open(os.path.join(DATA, 'voyages', 'slave.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    recs = []
    for (a, b), dec in sorted(flows.items(), key=lambda kv: -sum(x[1] for x in kv[1].values())):
        emb = sum(x[1] for x in dec.values())
        if emb < 2000:
            continue
        dis = sum(x[2] for x in dec.values())
        na, nb = REGIONS[a][0], REGIONS[b][0]
        ys = sorted(dec)
        stops_a = places.resolve(na, REGIONS[a][1], REGIONS[a][2], r_km=60, cite=CITE['cite'], subtype='region')
        stops_b = places.resolve(nb, REGIONS[b][1], REGIONS[b][2], r_km=60, cite=CITE['cite'], subtype='region')
        recs.append({
            'id': f'route:middle_passage:{slug(na)}:{slug(nb)}', 'kind': 'route', 'subtype': 'migration',
            'name': f'Middle Passage: {na} to {nb}', 'lenses': ['economy', 'population'],
            'tags': ['forced', 'slave_trade'], 'start': ys[0], 'end': ys[-1] + 9, 'stops': [stops_a, stops_b],
            'people': {'embarked': int(emb), 'landed': int(dis), 'died_at_sea': int(emb - dis),
                       'voyages': sum(x[0] for x in dec.values())},
            'by_decade': [[d, x[0], int(x[1]), int(x[2])] for d, x in sorted(dec.items())],
            'what': f'About {int(emb):,} people were forced aboard ships in {na} for {nb} '
                    f'({ys[0]}s-{ys[-1]}s); about {int(emb - dis):,} died on the crossing.',
            'conf': 'estimated', 'sources': [CITE], 'status': 'sourced'})
    places.write()
    write_jsonl('slave_routes.jsonl', recs)
    n = len(cols['id'])
    print(f'{n} voyages, {len(ports)} places ({sum(p[5] for p in ports)} exact), {len(recs)} region routes, '
          f'trans-Atlantic: {sum(e for e, s in zip(cols["emb"], cols["set"]) if s == "T"):,} people embarked (imputed), '
          f'{sum(e - d for e, d, s in zip(cols["emb"], cols["dis"], cols["set"]) if s == "T"):,} died at sea')


if __name__ == '__main__':
    main()
