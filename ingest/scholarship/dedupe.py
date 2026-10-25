#!/usr/bin/env python3
"""Fold parallel scholarship batches together: one record per source id, and ids the build accepts.

Batches written at the same time cite the same works (Pomeranz, Parker, Reid...), so the same src id can appear
in several sources-*.jsonl files. This keeps the best copy (verified first, then the one with the most fields) and
drops the rest. It also rewrites ids with characters the build rejects (`src:ward-perkins_2005` ->
`src:wardperkins_2005`) everywhere they are referenced in data/scholarship/ and data/guide/.

Usage: python3 ingest/scholarship/dedupe.py [--dry]
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIRS = [os.path.join(ROOT, 'data', d) for d in ('scholarship', 'guide', 'disease-climate', 'tech-food-energy')]
ID_RE = re.compile(r'^([a-z]+)(?::[a-z0-9_]+)+$')
DRY = '--dry' in sys.argv


def fix_id(i):
    if not isinstance(i, str) or ID_RE.match(i) or ':' not in i:
        return i
    head, *rest = i.split(':')
    return ':'.join([head] + [re.sub(r'[^a-z0-9_]+', '', r.lower().replace('-', '')) for r in rest])


def walk(x, ren):
    if isinstance(x, str):
        return ren.get(x, x)
    if isinstance(x, list):
        return [walk(v, ren) for v in x]
    if isinstance(x, dict):
        return {k: walk(v, ren) for k, v in x.items()}
    return x


def score(r):
    v = r.get('verified') or {}
    return (1 if v and not v.get('failed') else 0, len(r))


def main():
    files = sorted(f for d in DIRS for f in glob.glob(os.path.join(d, '*.jsonl')))
    rows = {f: [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] for f in files}
    ren = {}
    for f, rs in rows.items():
        for r in rs:
            n = fix_id(r.get('id'))
            if n != r.get('id'):
                ren[r['id']] = n
    best = {}
    for f, rs in rows.items():
        if '/scholarship/' not in f:
            continue
        for r in rs:
            if r.get('kind') != 'source':
                continue
            i = ren.get(r['id'], r['id'])
            if i not in best or score(r) > score(best[i][1]):
                best[i] = (f, r)
    dropped = 0
    for f, rs in rows.items():
        out = []
        for r in rs:
            i = ren.get(r.get('id'), r.get('id'))
            if r.get('kind') == 'source' and '/scholarship/' in f and best[i][1] is not r:
                dropped += 1
                continue
            out.append(walk(r, ren))
        if not DRY and (out != rs):
            with open(f, 'w', encoding='utf-8') as fh:
                for r in out:
                    fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    tour_dir = os.path.join(ROOT, 'data', 'guide', 'tours')
    for t in glob.glob(os.path.join(tour_dir, '*.json')):
        d = json.load(open(t, encoding='utf-8'))
        n = walk(d, ren)
        if n != d and not DRY:
            json.dump(n, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(ren)} ids renamed, {dropped} duplicate source records dropped')


if __name__ == '__main__':
    main()
