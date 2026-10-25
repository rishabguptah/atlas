#!/usr/bin/env python3
"""Pull the notable people out of the China Biographical Database (CBDB) SQLite into one compact JSON.

Usage: python3 ingest/coverage/extract_cbdb.py RAW_DIR
  RAW_DIR/cbdb/cbdb_*.sqlite3  from https://huggingface.co/datasets/cbdb/cbdb-sqlite (latest.zip)
  RAW_DIR/cbdb_wikidata.json   Wikidata items with a CBDB id (P497) and their sitelink counts (fetch_cbdb_wikidata below)
Writes RAW_DIR/cbdb_people.json: people with a geocoded index place and either a Wikidata item with 2+ sitelinks
or 6+ recorded office postings. Fields: pid, name, chn, by, dy, iy, dyn, f, addr, addr_chn, x, y, posts, office, status, qid, sl.
"""
import glob, json, os, sqlite3, sys
from collections import Counter


def main(raw):
    db = sorted(glob.glob(os.path.join(raw, 'cbdb', 'cbdb_*.sqlite3')))[-1]
    c = sqlite3.connect(db)
    wd = {}
    for r in json.load(open(os.path.join(raw, 'cbdb_wikidata.json'))):
        if not r['cb'].isdigit():
            continue
        pid, sl = int(r['cb']), int(r['sl'])
        q = r['p'].rsplit('/', 1)[-1]
        if pid not in wd or wd[pid][1] < sl:
            wd[pid] = (q, sl)
    posts = Counter(dict(c.execute('select c_personid, count(*) from POSTED_TO_OFFICE_DATA group by c_personid')))
    dyn = {d: n for d, n in c.execute('select c_dy, c_dynasty from DYNASTIES')}
    # the most senior-sounding office is hard to rank; keep the latest posting with an English title
    office = {}
    for pid, t, y in c.execute('''select p.c_personid, o.c_office_trans, p.c_firstyear from POSTED_TO_OFFICE_DATA p
                                   join OFFICE_CODES o on o.c_office_id = p.c_office_id
                                   where o.c_office_trans is not null and o.c_office_trans != '' order by p.c_personid, p.c_firstyear'''):
        office[pid] = t
    status = {}
    for pid, s in c.execute('''select s.c_personid, k.c_status_desc from STATUS_DATA s join STATUS_CODES k on k.c_status_code = s.c_status_code
                               where k.c_status_desc is not null order by s.c_personid, s.c_sequence desc'''):
        status[pid] = s
    out = []
    q = '''select b.c_personid, b.c_name, b.c_name_chn, b.c_birthyear, b.c_deathyear, b.c_index_year, b.c_dy, b.c_female,
                  a.c_name, a.c_name_chn, a.x_coord, a.y_coord
           from BIOG_MAIN b join ADDR_CODES a on a.c_addr_id = b.c_index_addr_id
           where a.x_coord is not null and a.y_coord is not null and a.x_coord != 0'''
    for pid, name, chn, by, dy, iy, d, f, an, ac, x, y in c.execute(q):
        w = wd.get(pid)
        n = posts.get(pid, 0)
        if not ((w and w[1] >= 2) or n >= 6):
            continue
        if not (by or dy or iy):
            continue
        out.append({'pid': pid, 'name': name, 'chn': chn, 'by': by or None, 'dy': dy or None, 'iy': iy or None,
                    'dyn': dyn.get(d), 'f': bool(f), 'addr': an, 'addr_chn': ac, 'x': x, 'y': y, 'posts': n,
                    'office': office.get(pid), 'status': status.get(pid), 'qid': w[0] if w else None, 'sl': w[1] if w else 0})
    json.dump(out, open(os.path.join(raw, 'cbdb_people.json'), 'w'), ensure_ascii=False)
    print(len(out), 'people from', db)


if __name__ == '__main__':
    main(sys.argv[1])
