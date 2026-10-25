#!/usr/bin/env python3
"""Glottolog 5 (CLDF) -> lang: records for every language and top-level family.

Usage: python3 ingest/peoples-languages/glottolog.py [RAW_DIR]
RAW_DIR (default raw/peoples-languages) holds glottolog_languages.csv and glottolog_values.csv from
https://github.com/glottolog/glottolog-cldf (cldf/languages.csv, cldf/values.csv).
Writes data/peoples-languages/languages.jsonl. Curated family stories (homelands, spread) live in
curated.py and are merged onto the same family ids.
"""
import csv, json, os, sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'raw', 'peoples-languages')
OUT = os.path.join(ROOT, 'data', 'peoples-languages', 'languages.jsonl')
SRC = {'cite': 'Hammarström, Forkel, Haspelmath and Bank, Glottolog 5 (Max Planck Institute for Evolutionary Anthropology), CC BY 4.0',
       'url': 'https://glottolog.org'}
AES = {'1': 'not endangered', '2': 'threatened', '3': 'shifting', '4': 'moribund', '5': 'nearly extinct', '6': 'extinct'}
SKIP_FAM = {'book1242', 'arti1236', 'unat1236', 'sign1238', 'pidg1258', 'mixe1287', 'spee1234'}

rows = list(csv.DictReader(open(os.path.join(RAW, 'glottolog_languages.csv'), encoding='utf-8')))
byid = {r['ID']: r for r in rows}
aes, cls = {}, {}
for v in csv.DictReader(open(os.path.join(RAW, 'glottolog_values.csv'), encoding='utf-8')):
    if v['Parameter_ID'] == 'aes':
        aes[v['Language_ID']] = AES.get(v['Value'])
    elif v['Parameter_ID'] == 'classification':
        cls[v['Language_ID']] = v['Value'].split('/') if v['Value'] else []

def num(x):
    return round(float(x), 3) if x not in ('', None) else None

def yr(x):
    if not x:
        return None
    y = int(x)
    return -1 if y == 0 else y

langs = [r for r in rows if r['Level'] == 'language' and r['Family_ID'] not in SKIP_FAM]
size = Counter(r['Family_ID'] or r['ID'] for r in langs)
out = []
# Top-level families with at least two languages; isolates are languages with no family.
for fid, n in sorted(size.items(), key=lambda kv: -kv[1]):
    f = byid.get(fid)
    if not f or f['Level'] != 'family' or n < 2 or fid == 'uncl1493':
        continue
    rec = {'id': 'lang:' + fid, 'kind': 'language', 'subtype': 'family', 'name': f['Name'], 'lenses': ['language'],
           'sources': [SRC], 'status': 'sourced', 'ext': {'glottolog': fid}, 'macroarea': f['Macroarea'] or None,
           'n_languages': n}
    if f['Latitude']:
        rec['lat'], rec['lon'] = num(f['Latitude']), num(f['Longitude'])
    out.append(rec)
fams = {r['id'][5:] for r in out}
# First-level branches of the families, so a map can colour Germanic apart from Indic.
branch_n = Counter()
for r in langs:
    path = cls.get(r['ID']) or []
    if len(path) >= 2 and path[0] in fams:
        branch_n[path[1]] += 1
for bid, n in branch_n.items():
    b = byid.get(bid)
    if not b or b['Level'] != 'family':
        continue
    out.append({'id': 'lang:' + bid, 'kind': 'language', 'subtype': 'branch', 'name': b['Name'], 'lenses': ['language'],
                'sources': [SRC], 'status': 'sourced', 'ext': {'glottolog': bid}, 'family': 'lang:' + cls[bid][0] if cls.get(bid) else None,
                'n_languages': n, **({'lat': num(b['Latitude']), 'lon': num(b['Longitude'])} if b['Latitude'] else {})})
branches = {r['id'][5:] for r in out if r['subtype'] == 'branch'}
for r in langs:
    path = cls.get(r['ID']) or []
    rec = {'id': 'lang:' + r['ID'], 'kind': 'language', 'subtype': 'language', 'name': r['Name'], 'lenses': ['language'],
           'sources': [SRC], 'status': 'sourced', 'ext': {'glottolog': r['ID'], **({'iso639_3': r['ISO639P3code']} if r['ISO639P3code'] else {})}}
    if r['Latitude']:
        rec['lat'], rec['lon'] = num(r['Latitude']), num(r['Longitude'])
    if path and path[0] in fams:
        rec['family'] = 'lang:' + path[0]
        if len(path) >= 2 and path[1] in branches:
            rec['branch'] = 'lang:' + path[1]
    elif r['Family_ID'] == 'uncl1493':
        rec['unclassified'] = True
    elif r['Is_Isolate'] == 'True' or not r['Family_ID']:
        rec['isolate'] = True
    rec['macroarea'] = r['Macroarea'] or None
    if aes.get(r['ID']):
        rec['endangerment'] = aes[r['ID']]
    s, e = yr(r['First_Year_Of_Documentation']), yr(r['Last_Year_Of_Documentation'])
    if s or e:
        rec['attested'] = [s, e]
    if r['Countries']:
        rec['countries'] = r['Countries'].split(';')
    out.append(rec)
for r in out:
    if r.get('family') is None:
        r.pop('family', None)
with open(OUT, 'w', encoding='utf-8') as fh:
    for r in out:
        fh.write(json.dumps({k: v for k, v in r.items() if v is not None}, ensure_ascii=False) + '\n')
c = Counter(r['subtype'] for r in out)
print(OUT, dict(c), 'extinct', sum(1 for r in out if r.get('endangerment') == 'extinct'))
