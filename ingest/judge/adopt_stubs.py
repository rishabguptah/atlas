"""Adopt every stub that has no owner record: write it out as a full record in its owner's folder.

A stub is a placeholder one workstream writes for a thing another workstream owns (a city a trade route passes,
a thinker a book names). When no owner ever wrote the full record, the stub's fields are all the atlas knows.
This merges the stubs for each such id the same way tools/build.py does (the first stub's fields win, sources
are pooled), drops the stub flag and writes data/<owner>/adopted.jsonl, so the judge can sample them and the
owner can improve them in place. Stubs nothing points at yet (Thales, Mansa Musa, the Library of Alexandria)
are adopted too: they are real things a later layer will want.

    python3 ingest/judge/adopt_stubs.py          # rewrite the adopted files
"""
import glob, json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build  # noqa: E402

OUT = 'adopted.jsonl'

def main():
    full, stubs, origin, pointed = set(), defaultdict(list), defaultdict(list), set()
    for path in sorted(glob.glob(os.path.join(build.DATA, '*', '*.jsonl'))):
        if os.path.basename(path) == OUT:
            continue
        ws = os.path.basename(os.path.dirname(path))
        for line in open(path, encoding='utf-8'):
            if not line.strip():
                continue
            r = json.loads(line)
            pointed.update(build.refs(r))
            if r.get('stub'):
                stubs[r['id']].append(r)
                origin[r['id']].append(ws)
            else:
                full.add(r['id'])
    by_owner, unused = defaultdict(list), 0
    for rid in sorted(stubs):
        if rid in full:
            continue
        unused += rid not in pointed
        rec, cites = {}, set()
        for s in stubs[rid]:
            rec.update({k: v for k, v in s.items() if k not in rec})
        rec.pop('stub', None)
        rec['sources'] = [s for st in stubs[rid] for s in st.get('sources') or [] if s.get('cite') not in cites and not cites.add(s.get('cite'))]
        rec['status'] = 'sourced' if all(s.get('status') == 'sourced' for s in stubs[rid]) else 'draft'
        rec['adopted_from'] = sorted(set(origin[rid]))
        owner = build.KINDS[rec['kind']][1] or 'places-people'
        by_owner[owner].append(rec)
    for path in glob.glob(os.path.join(build.DATA, '*', OUT)):
        os.remove(path)
    for owner, recs in sorted(by_owner.items()):
        with open(os.path.join(build.DATA, owner, OUT), 'w', encoding='utf-8') as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(f'data/{owner}/{OUT}: {len(recs)} adopted')
    print(f'{unused} of them nothing points at yet')

if __name__ == '__main__':
    main()
