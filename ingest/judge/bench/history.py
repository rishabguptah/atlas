"""Collect every benchmark run's summary into data/judge/bench/history.json (the score over time).

    python3 ingest/judge/bench/history.py
One row per run folder in data/judge/bench/runs/ that has a summary.json: date, models, overall score, the five
parts, error counts and the commit the page was built from. The accuracy report page charts it.
"""
import glob, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
B = os.path.join(ROOT, 'data/judge/bench')

rows = []
for f in sorted(glob.glob(os.path.join(B, 'runs', '*', 'summary.json'))):
    s = json.load(open(f))
    run = os.path.basename(os.path.dirname(f))
    meta = os.path.join(os.path.dirname(f), 'meta.json')
    m = json.load(open(meta)) if os.path.exists(meta) else {}
    if not m.get('commit'):
        m['commit'] = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        json.dump(m, open(meta, 'w'))
    rows.append({'run': run, 'commit': m['commit'], 'answered': s['answered'], 'graded': s['graded'], 'of': s['of'],
                 'answerModel': s['answerModel'], 'graderModel': s['graderModel'], 'score': s['score'], **s['parts'],
                 'serious': s['errors']['serious'], 'minor': s['errors']['minor'], 'myths': s['errors']['myths'],
                 'medianSeconds': s['medianSeconds']})
json.dump(rows, open(os.path.join(B, 'history.json'), 'w'), indent=1)
print(f'{len(rows)} runs; latest score {rows[-1]["score"] if rows else None}')

# Tables for the accuracy report page: the latest run question by question, and conf classes by kind.
D = os.path.join(B, 'dash')
os.makedirs(D, exist_ok=True)
json.dump(rows, open(os.path.join(D, 'bench_history.json'), 'w'), indent=1)
if rows:
    Q = {json.loads(l)['id']: json.loads(l) for l in open(os.path.join(B, 'questions.jsonl')) if l.strip()}
    G = [json.loads(l) for l in open(os.path.join(B, 'runs', rows[-1]['run'], 'grades.jsonl')) if l.strip()]
    latest = [{'id': g['id'], 'question': Q[g['id']]['q'], 'region': Q[g['id']]['region'], 'kind': Q[g['id']]['kind'],
               'total': g.get('total'), **(g.get('parts') or {}), 'errors': len((g.get('grade') or {}).get('errors') or []),
               'best': (g.get('grade') or {}).get('best', ''), 'worst': (g.get('grade') or {}).get('worst', '')}
              for g in G if g['id'] in Q]
    json.dump(sorted(latest, key=lambda r: r['total'] or 0), open(os.path.join(D, 'bench_latest.json'), 'w'), indent=1)
k = os.path.join(ROOT, 'dist/kernel.json')
if os.path.exists(k):
    from collections import Counter
    recs = json.load(open(k))['records']
    conf = [{'kind': kind, **{c: n for c, n in Counter(r.get('conf') for r in v).items() if c}} for kind, v in sorted(recs.items())]
    for r in conf:
        for c in ('attested', 'estimated', 'approximate', 'unknown'):
            r.setdefault(c, 0)
    json.dump(conf, open(os.path.join(D, 'conf.json'), 'w'), indent=1)
print('dash tables in data/judge/bench/dash/')
