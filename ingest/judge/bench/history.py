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
