#!/usr/bin/env python3
"""Wikidata battles and sieges -> data/states-war/battles-wikidata.jsonl (+ participant_in relations).

Usage: python3 ingest/states-war/wikidata_battles.py [RAW_DIR]
  RAW_DIR holds battles.json and participants.json, the results of battles.rq and participants.rq
  (default raw/states-war/wikidata/). Run cliopatria.py and battles.py first.

Every battle or siege with coordinates and a date becomes a sourced event. Participants are linked to
polities and people by their Wikidata ids; the rest are kept as names. The hand-curated battles in
battles.jsonl keep their records (they carry sides, winner and a why), gain their Wikidata id here, and are
left out of this file so nothing is drawn twice.
"""
import json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'states-war')
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'raw', 'states-war', 'wikidata')
WD = 'http://www.wikidata.org/entity/'
CITE = 'Wikidata (CC0), query of 2026-10-24: battles and sieges with coordinates'


def v(r, k):
    return r[k]['value'] if k in r else None


def year(s):
    """xsd:dateTime from WDQS uses astronomical years (-0479 is 480 BCE); the kernel has no year 0."""
    if not s:
        return None
    m = re.match(r'(-?)(\d+)-', s)
    if not m:  # an "unknown value" blank node
        return None
    y = int(m.group(2)) * (-1 if m.group(1) else 1)
    return y - 1 if y <= 0 else y


def slug(s):
    s = s.lower()
    for a, b in (('á', 'a'), ('à', 'a'), ('â', 'a'), ('ä', 'a'), ('ã', 'a'), ('é', 'e'), ('è', 'e'), ('ê', 'e'),
                 ('ë', 'e'), ('í', 'i'), ('î', 'i'), ('ó', 'o'), ('ô', 'o'), ('ö', 'o'), ('ú', 'u'), ('ü', 'u'),
                 ('ç', 'c'), ('ñ', 'n'), ('ß', 'ss'), ('ł', 'l'), ('ø', 'o'), ('å', 'a')):
        s = s.replace(a, b)
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', s)).strip('_')[:60].strip('_')


def jl(path):
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()] if os.path.exists(path) else []


def main():
    rows = json.load(open(os.path.join(RAW, 'battles.json')))['results']['bindings']
    parts = json.load(open(os.path.join(RAW, 'participants.json')))['results']['bindings']

    by_q = {}
    for r in rows:
        q = v(r, 'b')[len(WD):]
        b = by_q.setdefault(q, {'q': q, 'wars': {}, 'dates': set(), 'ends': set()})
        b['name'] = b.get('name') or v(r, 'bLabel')
        b['article'] = b.get('article') or v(r, 'article')
        m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)$', v(r, 'coord') or '')  # a globe prefix means not Earth
        if m and 'lon' not in b:
            lon, lat = map(float, m.groups())
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                b['lon'], b['lat'] = round(lon, 4), round(lat, 4)
        for k in ('date', 'start'):
            if year(v(r, k)):
                b['dates'].add(year(v(r, k)))
        if year(v(r, 'end')):
            b['ends'].add(year(v(r, 'end')))
        if v(r, 'war'):
            b['wars'][v(r, 'war')[len(WD):]] = v(r, 'warLabel')

    # who links to what: polities and people by Wikidata id
    known = {}
    for path in (os.path.join(OUT, 'polities.jsonl'), os.path.join(ROOT, 'data', 'places-people', 'people.jsonl')):
        for rec in jl(path):
            if rec.get('wikidata'):
                known.setdefault(rec['wikidata'], rec['id'])
    who = defaultdict(list)
    for r in parts:
        who[v(r, 'b')[len(WD):]].append((v(r, 'p')[len(WD):], v(r, 'pLabel')))

    # curated battles: attach Wikidata ids by their Wikipedia article and skip those items here
    curated_path = os.path.join(OUT, 'battles.jsonl')
    curated = jl(curated_path)
    by_article = {b['article'].split('/wiki/')[-1].lower(): q for q, b in by_q.items() if b.get('article')}
    skip = set()
    for rec in curated:
        if rec['kind'] == 'event':
            url = rec['sources'][0]['url'].split('/wiki/')[-1]
            q = by_article.get(requote(url).lower())
            if q:
                rec['wikidata'] = q
                skip.add(q)
    with open(curated_path, 'w', encoding='utf-8') as f:
        for rec in curated:
            f.write(json.dumps(rec, ensure_ascii=False, separators=(',', ':')) + '\n')

    taken = {r['id'] for r in curated}
    events, rels, dropped = [], [], 0
    for q, b in sorted(by_q.items(), key=lambda kv: int(kv[0][1:])):
        if q in skip:
            continue
        if not b['dates'] or 'lat' not in b or not b.get('name'):
            dropped += 1
            continue
        start = min(b['dates'])
        end = max(b['ends'] | b['dates'])
        if end < start or end - start > 30:  # a stray end date belongs to a different claim
            end = start
        eid = f'event:{slug(b["name"]) or "battle"}_{q.lower()}'
        if eid in taken:
            continue
        taken.add(eid)
        sub = 'siege' if re.search(r'\bsiege\b', b['name'], re.I) else 'battle'
        sources = [{'cite': f'{CITE} ({q})', 'url': f'https://www.wikidata.org/wiki/{q}'}]
        if b.get('article'):
            sources.append({'cite': 'English Wikipedia', 'url': b['article']})
        rec = {'id': eid, 'kind': 'event', 'subtype': sub, 'name': b['name'], 'lenses': ['military'],
               'start': start, 'end': end, 'lat': b['lat'], 'lon': b['lon'], 'wikidata': q}
        if b['wars']:
            rec['wars'] = [{'name': n or w, 'wikidata': w} for w, n in sorted(b['wars'].items())]
        ps = []
        for pq, pn in who.get(q, []):
            ref = known.get(pq)
            ps.append({'name': pn or pq, 'wikidata': pq, **({'ref': ref} if ref else {})})
            if ref:
                rels.append({'id': f'rel:{ref.split(":", 1)[1]}_in_{eid[6:]}', 'kind': 'relation', 'type': 'participant_in',
                             'from': ref, 'to': eid, 'start': start, 'end': end, 'lenses': ['military'],
                             'sources': sources[:1], 'status': 'sourced'})
        if ps:
            rec['participants'] = ps
        rec['sources'] = sources
        rec['status'] = 'sourced'
        events.append(rec)
    seen, out_rels = set(), []
    for r in rels:
        if r['id'] not in seen:
            seen.add(r['id'])
            out_rels.append(r)
    with open(os.path.join(OUT, 'battles-wikidata.jsonl'), 'w', encoding='utf-8') as f:
        for r in events + out_rels:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(events)} Wikidata battles, {len(out_rels)} participant links, {len(skip)} matched to curated battles, '
          f'{dropped} dropped (no date, coordinates or English name)')


def requote(s):
    from urllib.parse import unquote, quote
    return quote(unquote(s), safe="()_,'!-.:*&+$;=@~")


if __name__ == '__main__':
    main()
