"""Check a week's red-team sample (sample_claims.py) against Wikipedia and write verdicts.jsonl.

    python3 ingest/judge/check_sample.py 2026-W44 [--jobs 2]

For each claim: search English Wikipedia for the record it is about, pull the lead and the sentences that mention
the claim's years, and let Claude judge the claim against those excerpts only (same prompt and verdicts as
source_records.py). Area claims about empires also read "List of largest empires". The verdict file keeps the
fields earlier weeks used, so report_data.py reads it unchanged.
"""
import json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import source_records as S  # noqa: E402

ROOT = S.ROOT


def main():
    a = sys.argv[1:]
    jobs = 2
    if '--jobs' in a:
        i = a.index('--jobs'); jobs = int(a[i + 1]); del a[i:i + 2]
    week = a[0]
    d = os.path.join(ROOT, 'data/judge/reports', week)
    claims = [json.loads(l) for l in open(os.path.join(d, 'sample.jsonl')) if l.strip()]
    kernel = json.load(open(os.path.join(ROOT, 'dist/kernel.json')))['records']
    by = {r['id']: r for v in kernel.values() for r in v}

    def gather(c):
        r = by.get(c['ref'], {})
        place = by.get(r.get('place') or '', {})
        name = r.get('name') or c['ref'].split(':')[-1].replace('_', ' ')
        years = re.findall(r'\b\d{3,4}\b', c['text'])
        q = f"{place.get('name', '')} {name} {years[0] if years and c['type'] == 'event' else ''}".strip()
        ev = S.evidence(q, years, [name])
        if c['type'] == 'polity_peak':
            ev += [e for e in S.evidence('List of largest empires', [name.split()[0]], [], n_articles=1, n_sentences=4)]
        return (c, c['text'], ev)

    with ThreadPoolExecutor(4) as ex:
        items = list(ex.map(gather, claims))
    out = []
    batches = [items[i:i + 10] for i in range(0, len(items), 10)]
    with ThreadPoolExecutor(jobs) as ex:
        for res in ex.map(S.judge_batch, batches):
            for c, o, ev in res:
                art = next((e for e in ev if e['title'] == o.get('article')), None)
                out.append({**c, 'verdict': o.get('verdict', 'unverified'),
                            'evidence': (f"Wikipedia, {art['title']}: '{o['quote']}'" if art and o.get('quote') else o.get('quote') or 'No excerpt settled it.'),
                            'sources': [{'cite': f"Wikipedia, {art['title']}", 'url': art['url']}] if art else [{'cite': 'none found'}],
                            'fix': o.get('fix') or '', 'checked': time.strftime('%Y-%m-%d'), 'checker': 'judge (Claude, Wikipedia excerpts)'})
    out.sort(key=lambda v: v['claim'])
    with open(os.path.join(d, 'verdicts.jsonl'), 'w') as f:
        for v in out:
            f.write(json.dumps(v, ensure_ascii=False) + '\n')
    from collections import Counter
    print(week, Counter(v['verdict'] for v in out))


if __name__ == '__main__':
    main()
