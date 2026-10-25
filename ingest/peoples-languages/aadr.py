#!/usr/bin/env python3
"""Allen Ancient DNA Resource (AADR v54.1.p1, Poseidon packages) -> dna: records, one per ancient genome.

Usage: python3 ingest/peoples-languages/aadr.py [RAW_DIR]
RAW_DIR (default raw/peoples-languages) holds, from https://github.com/poseidon-framework/aadr-archive:
  aadr_EuropeAncient.janno, aadr_BeyondAncient.janno (AADR_v54_1_p1_1240K_*/*.janno)
  aadr_Europe.bib, aadr_Beyond.bib (the matching .bib files, for the paper behind each sample)
Keeps samples AADR marks PASS that have a place and a date. Writes data/peoples-languages/dna.jsonl.
"""
import csv, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'raw', 'peoples-languages')
OUT = os.path.join(ROOT, 'data', 'peoples-languages', 'dna.jsonl')
AADR = {'cite': 'Mallick and Reich, The Allen Ancient DNA Resource v54.1.p1 (Harvard Dataverse, 2023), via the Poseidon aadr-archive',
        'url': 'https://doi.org/10.7910/DVN/FFIDCW'}

def bib(path):
    out = {}
    for m in re.finditer(r'@\w+\{([^,]+),(.*?)\n\}', open(path, encoding='utf-8').read(), re.S):
        key, body = m.group(1).strip(), m.group(2)
        f = {k.lower(): re.sub(r'[{}]', '', v).strip() for k, v in re.findall(r'(\w+)\s*=\s*[{"]?(.*?)[}"]?,?\s*\n', body + '\n')}
        au = f.get('author', '').split(' and ')[0].split(',')[0].strip()
        n = len(f.get('author', '').split(' and '))
        cite = f"{au}{' et al.' if n > 1 else ''}, \"{f.get('title', key)}\", {f.get('journal', f.get('publisher', ''))} {f.get('year', '')}".strip()
        doi = f.get('doi')
        out[key] = {'cite': re.sub(r'\s+', ' ', cite), **({'url': 'https://doi.org/' + doi} if doi else {})}
    return out

refs = {}
for b in ('aadr_Europe.bib', 'aadr_Beyond.bib'):
    refs.update(bib(os.path.join(RAW, b)))

def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

def yr(x):
    v = num(x)
    if v is None:
        return None
    v = int(round(v))
    return 1 if v == 0 else v

def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')

out, seen = [], set()
for pkg in ('EuropeAncient', 'BeyondAncient'):
    for r in csv.DictReader(open(os.path.join(RAW, f'aadr_{pkg}.janno'), encoding='utf-8'), delimiter='\t'):
        if not r['AADR_Assessment'].startswith('PASS'):
            continue
        lat, lon = num(r['Latitude']), num(r['Longitude'])
        s, e, med = yr(r['Date_BC_AD_Start']), yr(r['Date_BC_AD_Stop']), yr(r['Date_BC_AD_Median'])
        if lat is None or lon is None or (s is None and med is None):
            continue
        if med is None:
            med = yr((s + e) / 2) if e is not None else s
        if med <= -100000 or (s is not None and s <= -100000):
            continue  # the kernel's year range stops at 100,000 BCE (a few Neanderthal and Denisovan genomes)
        # One record per person: .DG/.SG/.AG and _snpAD are other data versions of the same individual.
        rid = 'dna:' + slug(re.sub(r'(_snpAD)?(\.[A-Z]{2,3})+$', '', r['Poseidon_ID']))
        if rid in seen:
            continue
        seen.add(rid)
        pubs = [p for p in r['Publication'].split(';') if p and not p.startswith('AADR')]
        src = [refs[p] for p in pubs if p in refs] + [AADR]
        rec = {'id': rid, 'kind': 'sample', 'name': f"{r['Poseidon_ID']} ({r['Group_Name']})", 'lenses': ['language', 'population'],
               'sources': src, 'status': 'sourced', 'ext': {'aadr': r['Poseidon_ID']},
               'start': med, 'lat': round(lat, 4), 'lon': round(lon, 4), 'group': r['Group_Name'],
               'site': r['Location'] if r['Location'] not in ('', 'n/a') else None,
               'country': r['Country'] if r['Country'] not in ('', 'n/a') else None,
               'dating': r['Date_Type'], 'sex': r['Genetic_Sex'] if r['Genetic_Sex'] in ('M', 'F') else None}
        if s is not None and e is not None and s < e:
            rec['start_range'] = [s, e]
        y, mt = r['Y_Haplogroup'], r['MT_Haplogroup']
        if y and not y.startswith('n/a'):
            rec['y_haplogroup'] = y
        if mt and not mt.startswith('n/a'):
            rec['mt_haplogroup'] = mt
        out.append({k: v for k, v in rec.items() if v is not None})
out.sort(key=lambda r: (r['start'], r['id']))
with open(OUT, 'w', encoding='utf-8') as fh:
    for r in out:
        fh.write(json.dumps(r, ensure_ascii=False) + '\n')
print(OUT, len(out), 'samples;', 'with paper', sum(1 for r in out if len(r['sources']) > 1),
      'oldest', out[0]['start'], 'newest', out[-1]['start'])
