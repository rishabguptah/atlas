#!/usr/bin/env python3
"""City lights for the pixel map's night sky: Reba et al. historical urban population -> compact series.

Usage: python3 ingest/pixel/city_lights.py historical_urban_population.csv OUT.json
OUT: {"src": cite, "c": [[lat, lon, y0, k0, y1, k1, ...], ...]} with population in thousands at each recorded year.
views/pixel/motion.js lights a city from its first record on; between records the population is interpolated and
after the last record it is held (Chandler and Modelski list only the largest cities of each date, so dropping off
the list does not mean the city died). Source: Reba, Reitsma & Seto 2016, doi:10.1038/sdata.2016.34 (attribution,
non-commercial, share-alike: see /mnt/project-files/atlas/raw/reba/README.md).
"""
import csv, json, sys
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
series = defaultdict(dict)
where = {}
for r in csv.DictReader(open(src, encoding='latin-1')):
    try:
        lat, lon, y, p = float(r['Latitude']), float(r['Longitude']), int(r['year']), float(r['pop'])
    except ValueError:
        continue
    if int(r['Certainty'] or 3) > 2 and p < 100000:
        continue  # a guessed location for a small town would put a light in the wrong place
    k = r['cityid']
    where[k] = (round(lat, 2), round(lon, 2))
    series[k][y] = max(series[k].get(y, 0), round(p / 1000, 1))
rows = []
for k, s in series.items():
    row = list(where[k])
    for y in sorted(s):
        row += [y, s[y] if s[y] % 1 else int(s[y])]
    rows.append(row)
rows.sort(key=lambda r: -max(r[3::2]))
json.dump({'src': 'Reba, Reitsma & Seto 2016, Historical Urban Population 3700 BC - AD 2000 (doi:10.1038/sdata.2016.34)', 'c': rows},
          open(out, 'w'), separators=(',', ':'))
print(out, len(rows), 'cities')
