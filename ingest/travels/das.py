#!/usr/bin/env python3
"""Dutch-Asiatic Shipping 1595-1795 -> journey records (data/travels/voyages_das.jsonl).

Usage: python3 ingest/travels/das.py   (run tools/build.py first; reads raw/economy-trade/dutch-asiatic-shipping/)

One route (subtype journey) per voyage: departure -> Cape of Good Hope (when the ship called there) -> arrival,
with the dates DAS gives, the ship, its master, and the people on board: how many sailed, how many died on the way
and how many arrived. Sea paths between ports follow the usual VOC lanes and are marked approximate.
"""
import csv, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Places, RAW, iso, write_jsonl

SRC = os.path.join(RAW, 'economy-trade', 'dutch-asiatic-shipping')
CITE = {'cite': 'Dutch-Asiatic Shipping 1595-1795, enriched edition (Petram et al., Huygens Institute / GLOBALISE), '
                'after Bruijn, Gaastra & Schöffer; CC BY 4.0', 'url': 'https://doi.org/10.34894/RJ7UEA'}

# DAS place id -> (name, lon, lat). Roadsteads and estuaries sit at their anchorage.
GEO = {
    'DAS_pl001': ('Ambon', 128.18, -3.70), 'DAS_pl002': ('Amelander Gat', 5.65, 53.47),
    'DAS_pl003': ('Amsterdam', 4.90, 52.37), 'DAS_pl004': ('Aceh', 95.32, 5.55), 'DAS_pl005': ('Bali', 115.2, -8.65),
    'DAS_pl006': ('Banten', 106.15, -6.03), 'DAS_pl007': ('Batavia', 106.81, -6.13), 'DAS_pl008': ('Batticaloa', 81.70, 7.72),
    'DAS_pl009': ('Bengal (Hooghly)', 88.40, 22.90), 'DAS_pl010': ('Bergen', 5.33, 60.39), 'DAS_pl011': ('Bergen', 5.33, 60.39),
    'DAS_pl012': ('Cádiz', -6.29, 36.53), 'DAS_pl013': ('Cambodia', 104.92, 11.56), 'DAS_pl014': ('Ceylon (Galle)', 80.22, 6.03),
    'DAS_pl015': ('Ceylon (Galle)', 80.22, 6.03), 'DAS_pl016': ('Canton', 113.25, 23.12), 'DAS_pl017': ('Cochin', 76.26, 9.94),
    'DAS_pl018': ('Colombo', 79.85, 6.93), 'DAS_pl019': ('Cork', -8.47, 51.90), 'DAS_pl020': ('Coromandel (Nagapattinam)', 79.84, 10.77),
    'DAS_pl021': ('Gresik', 112.66, -7.15), 'DAS_pl022': ('Ems estuary', 6.95, 53.45), 'DAS_pl023': ('Elbe estuary', 8.7, 53.9),
    'DAS_pl024': ('Enggano', 102.25, -5.35), 'DAS_pl025': ('Enkhuizen', 5.29, 52.70), 'DAS_pl026': ('Galle', 80.22, 6.03),
    'DAS_pl027': ('Bandar Abbas (Gamron)', 56.27, 27.18), 'DAS_pl028': ('Glückstadt', 9.42, 53.79), 'DAS_pl029': ('Goa', 73.83, 15.50),
    'DAS_pl030': ('Goeree roads', 3.95, 51.83), 'DAS_pl031': ('Grevelingen', 3.95, 51.75), 'DAS_pl032': ('Hellevoetsluis', 4.13, 51.82),
    'DAS_pl033': ('Batavia', 106.81, -6.13), 'DAS_pl034': ('Johor', 103.76, 1.46), 'DAS_pl035': ('La Rochelle', -1.15, 46.16),
    'DAS_pl036': ('Lisbon', -9.14, 38.71), 'DAS_pl037': ('Lorient', -3.37, 47.75), 'DAS_pl038': ('Maas mouth (Brielle)', 4.16, 51.90),
    'DAS_pl039': ('Makassar', 119.41, -5.13), 'DAS_pl040': ('Madagascar (St Augustine Bay)', 43.75, -23.55),
    'DAS_pl041': ('Malabar (Cochin)', 76.26, 9.94), 'DAS_pl042': ('Masulipatnam', 81.13, 16.17), 'DAS_pl043': ('Mauritius', 57.50, -20.16),
    'DAS_pl044': ('Middelburg', 3.61, 51.50), 'DAS_pl045': ('Mocha', 43.25, 13.32), 'DAS_pl046': ('Nagapattinam', 79.84, 10.77),
    'DAS_pl047': ('Negombo', 79.84, 7.21), 'DAS_pl048': ('Norway (coast)', 5.5, 59.0), 'DAS_pl049': ('Ems estuary', 6.95, 53.45),
    'DAS_pl050': ('Texel', 4.78, 53.05), 'DAS_pl051': ('Persia (Bandar Abbas)', 56.27, 27.18),
    'DAS_pl052': ('Plymouth', -4.14, 50.37), 'DAS_pl053': ('Pondicherry', 79.83, 11.93), 'DAS_pl054': ('Portsmouth', -1.09, 50.81),
    'DAS_pl055': ('Pulicat', 80.32, 13.42), 'DAS_pl056': ('Rammekens (Flushing roads)', 3.65, 51.45), 'DAS_pl057': ('Riga', 24.11, 56.95),
    'DAS_pl058': ('Rochefort', -0.96, 45.94), 'DAS_pl059': ('Rotterdam', 4.48, 51.92), 'DAS_pl060': ('Setúbal', -8.89, 38.52),
    'DAS_pl061': ('Surat', 72.83, 21.20), 'DAS_pl062': ('Tegnapatam', 79.78, 11.75), 'DAS_pl063': ('Ternate', 127.38, 0.79),
    'DAS_pl064': ('Terschelling', 5.22, 53.40), 'DAS_pl065': ('Texel', 4.78, 53.05), 'DAS_pl066': ('Cape of Good Hope', 18.42, -33.92),
    'DAS_pl067': ('Tidore', 127.40, 0.68), 'DAS_pl068': ('Trondheim', 10.40, 63.43), 'DAS_pl069': ('Tuticorin', 78.13, 8.77),
    'DAS_pl070': ('Veere', 3.67, 51.55), 'DAS_pl071': ('Vlieland', 4.98, 53.30), 'DAS_pl072': ('Vlissingen', 3.57, 51.44),
    'DAS_pl073': ('Wielingen', 3.40, 51.40), 'DAS_pl074': ('Zeeland (Flushing roads)', 3.57, 51.44),
}
CAPE = 'DAS_pl066'
# DAS keeps a few places twice; resolve the second to the first.
ALIAS = {'DAS_pl011': 'DAS_pl010', 'DAS_pl015': 'DAS_pl014', 'DAS_pl033': 'DAS_pl007', 'DAS_pl049': 'DAS_pl022',
         'DAS_pl050': 'DAS_pl065', 'DAS_pl074': 'DAS_pl072', 'DAS_pl041': 'DAS_pl017', 'DAS_pl051': 'DAS_pl027',
         'DAS_pl046': 'DAS_pl020'}
# Rough sea-lane waypoints (lon, lat), drawn dashed. North Sea -> Channel (or north-about) -> Cape Verde -> Brazil
# bulge -> Cape -> roaring forties -> Sunda Strait.
OUT_ATL = [[-5.5, 49.5], [-17.0, 28.0], [-24.0, 15.0], [-28.0, 0.0], [-25.0, -20.0], [-5.0, -35.0]]
OUT_IND = [[40.0, -38.0], [85.0, -38.0], [104.0, -10.0], [105.8, -6.0]]
HOME_IND = [[105.8, -6.0], [95.0, -12.0], [60.0, -25.0], [30.0, -35.0]]
HOME_ATL = [[-5.7, -16.0], [-14.4, -7.9], [-25.0, 10.0], [-35.0, 35.0], [-15.0, 55.0], [-2.0, 59.5]]


def nint(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def lanes(a, b, outward):
    """Waypoints between two DAS ports for the long legs; empty for short hops."""
    (_, lo1, la1), (_, lo2, la2) = GEO[a], GEO[b]
    europe1, europe2 = la1 > 35 and lo1 < 30, la2 > 35 and lo2 < 30
    cape1, cape2 = a == CAPE, b == CAPE
    if europe1 and cape2:
        return OUT_ATL
    if cape1 and lo2 > 60:
        return OUT_IND if lo2 > 95 else OUT_IND[:2]
    if lo1 > 60 and cape2:
        return HOME_IND if lo1 > 95 else HOME_IND[2:]
    if cape1 and europe2:
        return HOME_ATL
    if europe1 and lo2 > 60:
        return OUT_ATL + [[18.4, -34.5]] + OUT_IND
    if lo1 > 60 and europe2:
        return HOME_IND + [[18.4, -34.5]] + HOME_ATL
    return []


def main():
    places = Places()
    pid = {}
    for k, (name, lon, lat) in GEO.items():
        if k not in ALIAS:
            pid[k] = places.resolve(name.split(' (')[0], lon, lat, r_km=20, cite=CITE['cite'], subtype='site')
    for k, to in ALIAS.items():
        pid[k] = pid[to]
    names = {}
    for r in csv.DictReader(open(os.path.join(SRC, 'das_shipNameVariant.csv'), encoding='utf-8')):
        names[r['shipNameVariantID']] = r['shipNameVariant']
    ships = {r['shipID']: r for r in csv.DictReader(open(os.path.join(SRC, 'das_ship.csv'), encoding='utf-8'))}
    masters = {}
    for r in csv.DictReader(open(os.path.join(SRC, 'das_master.csv'), encoding='utf-8')):
        masters[r['voyMasterID']] = ' '.join(x for x in (r['voyMasterFirstName'], r['voyMasterFamilyNamePrefix'], r['voyMasterLastName']) if x)
    onb = defaultdict(dict)
    for r in csv.DictReader(open(os.path.join(SRC, 'das_onboard.csv'), encoding='utf-8')):
        cat = r['onbCategory']
        if cat in ('Total', 'Seafarers', 'Soldiers', 'Passengers', 'Craftsmen', 'Impotenten'):
            onb[r['onbVoyageId']][cat] = [nint(r[f]) for f in ('onbI', 'onbII', 'onbIII', 'onbIV', 'onbV', 'onbVI')]
    out = []
    for v in csv.DictReader(open(os.path.join(SRC, 'das_voyage.csv'), encoding='utf-8')):
        vid, outward = v['voyId'], v['heenreis'] == '1'
        dep, arr = v['voyDeparturePlaceID'], v['voyArrivalPlaceID']
        y0, d0 = iso(v['voyDepartureEDTF'])
        y1, d1 = iso(v['voyArrivalDateEDTF'])
        if dep not in GEO or not y0:
            continue
        stops = [(dep, d0, None)]
        cy0, cd0 = iso(v['voyCapeArrivalEDTF'])
        cy1, cd1 = iso(v['voyCapeDepartureEDTF'])
        if (cd0 or cd1) and dep != CAPE and arr != CAPE:
            stops.append((CAPE, cd0, cd1))
        lost = not arr or arr not in GEO
        if not lost:
            stops.append((arr, d1, None))
        legs = []
        for (a, _, a_left), (b, b_at, _) in zip(stops, stops[1:]):
            start = a_left or (d0 if a == dep else None)
            g = {'from': pid[a], 'to': pid[b], 'mode': 'sea', 'conf': 'attested' if start and b_at else 'estimated'}
            if start:
                g['start_date'] = start
            if b_at:
                g['end_date'] = b_at
            via = lanes(a, b, outward)
            if via:
                g['via'], g['via_conf'] = via, 'approximate'
            legs.append(g)
        if lost:  # the ship never arrived: one leg into the unknown, ending where DAS last knew it
            last = stops[-1][0]
            to = ([90.0, -25.0] if outward else [-20.0, 5.0]) if last == CAPE else [18.4, -34.5]
            legs.append({'from': pid[last], 'to': to, 'mode': 'sea', 'conf': 'unknown',
                         'note': 'did not arrive (lost, captured or fate unrecorded); DAS last knew it here'})
        ship = ships.get(v['shipID'], {})
        sname = names.get(v['shipName']) or 'unnamed ship'
        toll = onb.get(vid, {})
        tot = toll.get('Total')
        if not tot and toll:  # sum the categories when DAS has no Total row
            tot = [sum(c[i] or 0 for c in toll.values()) or None for i in range(6)]
        rec = {
            'id': f'route:voyage:das_{vid}', 'kind': 'route', 'subtype': 'journey',
            'name': f'The {sname}: {GEO[dep][0].split(" (")[0]} to {GEO[arr][0].split(" (")[0] if not lost else "(never arrived)"}, {y0}',
            'carrier': f'VOC ship {sname}', 'lenses': ['economy'], 'start': y0,
            'legs': legs, 'conf': 'attested', 'sources': [dict(CITE, url=v['url'])], 'status': 'sourced',
            'vessel': {k: x for k, x in (('name', sname), ('das', v['shipID']), ('tons', nint(ship.get('voyTonnageMin'))),
                                         ('built', nint(ship.get('voyBuiltY'))), ('master', masters.get(v['voyMasterID'])))
                       if x},
            'tags': ['voc', 'outward' if outward else 'homeward'] + (['lost'] if lost else []),
            'ext': {'das': v['voyNumberDAS']},
        }
        if y1 and y1 >= y0:
            rec['end'] = y1
        if tot:
            rec['people'] = {k: x for k, x in zip(('aboard', 'died_to_cape', 'left_at_cape', 'joined_at_cape', 'died', 'arrived'), tot)
                             if x is not None}
        if v['voyParticulars']:
            rec['what'] = v['voyParticulars'][:400]
        out.append(rec)
    places.write()
    write_jsonl('voyages_das.jsonl', out)
    died = sum(r.get('people', {}).get('died', 0) for r in out)
    print(f'{len(out)} DAS voyages, {sum("lost" in r["tags"] for r in out)} never arrived, {died} deaths recorded on board')


if __name__ == '__main__':
    main()
