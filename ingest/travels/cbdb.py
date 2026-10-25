#!/usr/bin/env python3
"""Dated office postings from the China Biographical Database (CBDB) -> present_at relations.

Usage: python3 ingest/travels/cbdb.py [CBDB_SQLITE] [CBDB_WIKIDATA_JSON]   (run tools/build.py first)
  defaults: /mnt/project-files/atlas/raw/coverage/cbdb/cbdb_*.sqlite3 (unzip latest.zip there or pass a path) and
  /mnt/project-files/atlas/raw/coverage/cbdb_wikidata.json (Wikidata items with a CBDB id, P497).

A kernel person is matched by ext.cbdb, else by its Wikidata id. Each posting (POSTED_TO_OFFICE_DATA) with a geocoded
place (POSTED_TO_ADDR_DATA -> ADDR_CODES x/y) becomes one presence with role = the office's English title. Both years
given: attested; one year: estimated, a single year; neither: skipped (CBDB postings without years are too many to
place in a life). Writes data/travels/presences_cbdb.jsonl; new places go to data/travels/places.jsonl as stubs.
"""
import glob, json, os, sqlite3, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Places, kernel, write_jsonl

RAW = '/mnt/project-files/atlas/raw/coverage'
CITE = 'China Biographical Database (CBDB), Harvard/Academia Sinica/Peking University, SQLite of 2026-10-24 (CC BY-NC-SA 4.0), person'


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else (sorted(glob.glob(os.path.join(RAW, 'cbdb', 'cbdb_*.sqlite3'))) or [None])[-1]
    if not db or not os.path.exists(db):
        sys.exit('CBDB sqlite not found: unzip raw/coverage/cbdb/latest.zip and pass its path')
    wdj = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAW, 'cbdb_wikidata.json')
    recs = kernel()
    by_q = {}
    for r in json.load(open(wdj)):
        if r['cb'].isdigit():
            by_q.setdefault(r['p'].rsplit('/', 1)[-1], int(r['cb']))
    people = {}
    for p in recs['person']:
        cb = (p.get('ext') or {}).get('cbdb')
        cb = int(cb) if cb and str(cb).isdigit() else by_q.get(p.get('wikidata'))
        if cb:
            people.setdefault(cb, p)
    places = Places(recs)
    c = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    ids = ','.join(str(i) for i in people)
    rows = c.execute(f'''select o.c_personid, o.c_posting_id, o.c_firstyear, o.c_lastyear, k.c_office_trans, k.c_office_pinyin,
                                a.c_addr_id, a.c_name, a.x_coord, a.y_coord
                         from POSTED_TO_OFFICE_DATA o
                         join POSTED_TO_ADDR_DATA pa on pa.c_posting_id = o.c_posting_id and pa.c_office_id = o.c_office_id
                         join ADDR_CODES a on a.c_addr_id = pa.c_addr_id
                         left join OFFICE_CODES k on k.c_office_id = o.c_office_id
                         where o.c_personid in ({ids}) and a.x_coord is not null and a.x_coord != 0
                         order by o.c_personid, o.c_firstyear''').fetchall()
    addr = {}
    out, seen, n, skipped = [], set(), defaultdict(int), defaultdict(int)
    for cb, post, fy, ly, title, pinyin, aid, aname, x, y in rows:
        p = people[cb]
        fy, ly = fy or None, ly or None
        if not fy and not ly:
            skipped['undated'] += 1
            continue
        conf = 'attested' if fy and ly else 'estimated'
        y0, y1 = fy or ly, ly or fy
        if y1 < y0:
            y0, y1 = y1, y0
        born, died = p.get('start'), p.get('end')
        if born is not None and died is not None and (y1 < born or y0 > died + 1):
            skipped['outside life'] += 1
            continue
        if aid not in addr:
            addr[aid] = places.resolve(aname, x, y, r_km=12, cite=f'{CITE[:-7]}, address {aid}')
        pid = addr[aid]
        role = (title if title and 'Not Yet' not in title else pinyin or 'office').strip()
        key = (p['id'], pid, y0, role)
        if key in seen:
            continue
        seen.add(key)
        ps = p['id'].split(':', 1)[1]
        n[ps] += 1
        out.append({'id': f'rel:present:{ps}:cbdb{n[ps]}', 'kind': 'relation', 'type': 'present_at', 'from': p['id'], 'to': pid,
                    'start': y0, 'end': y1, 'role': f'posted as {role}'[:80], 'conf': conf, 'lenses': ['people', 'law'],
                    'sources': [{'cite': f'{CITE} {cb}, posting {post}',
                                 'url': f'https://cbdb.fas.harvard.edu/cbdbapi/person.php?id={cb}'}],
                    'status': 'sourced'})
    places.write()
    write_jsonl('presences_cbdb.jsonl', out)
    print(f'{len(people)} kernel people in CBDB, {len(out)} postings as presences for {len(n)} of them;',
          ', '.join(f'{v} {k}' for k, v in skipped.items()))


if __name__ == '__main__':
    main()
