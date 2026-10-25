#!/usr/bin/env python3
"""Turn the Wikidata lookup of our cited articles into wikidata_ids.json and a check report.

Usage: python3 ingest/religion-ideas/resolve_wikidata.py RAW.json
RAW.json is the lookup made by the dataset-fetch thread (record id -> title, qid, P569/P570/P571/P577/P625),
kept outside git in raw/. Writes ingest/religion-ideas/wikidata_ids.json (QIDs and the final titles of redirected citations, read by build.py) and
data/religion-ideas/wikidata-check.md. Run build.py first so data/religion-ideas holds the drafts.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(ROOT, 'data', 'religion-ideas')
# The cited article is about something else (a person, a castle, a temple, the whole Bible),
# or the title redirects to a page that may be another work.
NOT_THE_THING = {'work:gita_wilkins', 'place:eisenach', 'place:ningbo', 'idea:neoplatonic_athens', 'work:diary_madman'}
# What we decided about each disagreement, shown in the report.
VERDICTS = {
    'idea:islam': 'kept 610 (first revelation); Wikidata dates the religion item to 631',
    'idea:sikhism': 'kept 1499 (Nanak begins preaching); 1469 is his birth',
    'idea:neoplatonic_athens': 'no id; the cited article is Neoplatonism as a whole',
    'idea:paris_univ': 'kept 1150; Wikidata prefers the 1896 refounding but also lists 1150',
    'work:republic': 'kept c. 375 BCE; Wikidata\'s 1963 is a modern edition',
    'work:elements_print': 'no id; the item is the Elements itself (c. 300 BCE)',
    'work:jihe_yuanben': 'no id; the item is the Elements itself (c. 300 BCE)',
    'work:rubaiyat_fitzgerald': 'no id; the item is Khayyam\'s Rubaiyat',
    'work:prince': 'kept 1513 (written); printed 1532, now said in the text',
    'work:luther_bible': 'kept 1522 (New Testament); 1534 is the complete Bible',
    'work:west_eastern_divan': 'kept 1819 (published); begun 1814, now said in the text',
    'work:war_and_peace': 'kept 1869 (finished); begun 1863, now said in the text',
    'work:metamorphosis': 'kept 1915 (published); written 1912, now said in the text',
    'person:parmenides': 'kept c. 450 BCE; Plato has him visit Athens around then, so 469 looks wrong',
    'place:khwarazm': 'kept: Khwarazm is a region; our point is Khiva, Wikidata\'s is the region centre',
    'place:zou': 'kept: our point is Zoucheng city centre; for a judge to look at',
}
PRECISION_SLACK = {9: 1, 8: 10, 7: 100, 6: 1000}

raw = json.load(open(sys.argv[1], encoding='utf-8'))
recs = {}
for kind in ('ideas', 'works', 'people', 'places'):  # earlier kinds win a shared QID
    for line in open(os.path.join(DATA, kind + '.jsonl'), encoding='utf-8'):
        r = json.loads(line)
        recs[r['id']] = r

ids, titles, seen, rows = {}, {}, set(), {'missing': [], 'skipped': [], 'dates': [], 'coords': []}
for rid, r in recs.items():
    w = raw.get(rid)
    if not w or not w.get('exists') or not w.get('qid'):
        rows['missing'].append(f'`{rid}`: no article "{(w or {}).get("title")}"')
        continue
    q = w['qid']
    if w.get('redirected') and rid != 'work:diary_madman':
        titles[rid] = w['final_title']
    if rid in NOT_THE_THING:
        rows['skipped'].append(f'`{rid}`: cited article "{w["final_title"]}" ({q}) is not the record itself')
    elif q in seen:
        rows['skipped'].append(f'`{rid}`: shares {q} ("{w["final_title"]}") with another record, so it gets no id of its own')
    else:
        ids[rid] = q
        seen.add(q)
    if r['kind'] == 'place':
        cs = [c for c in w.get('P625') or [] if c.get('lat') is not None]
        if cs:
            c = cs[0]
            km = math.hypot(c['lat'] - r['lat'], (c['lon'] - r['lon']) * math.cos(math.radians(r['lat']))) * 111
            if km > 30:
                rows['coords'].append(f'`{rid}`: {km:.0f} km from Wikidata ({c["lat"]:.2f}, {c["lon"]:.2f})')
        continue
    pairs = [('start', 'P569'), ('end', 'P570')] if r['kind'] == 'person' else [('start', 'P571'), ('start', 'P577')]
    for field, prop in pairs:
        vals = [v for v in w.get(prop) or [] if v.get('year') is not None]
        pref = [v for v in vals if v.get('rank') == 'PreferredRank'] or vals
        if not pref or r.get(field) is None:
            continue
        lo, hi = r.get(field + '_range', [r[field], r[field]])
        slack = lambda v: max(2, PRECISION_SLACK.get(v.get('precision', 9), 1))
        if not any(lo - slack(v) <= v['year'] <= hi + slack(v) for v in pref):
            got = ', '.join(str(v['year']) for v in pref)
            rows['dates'].append(f'`{rid}` {field}: ours {r[field]} (range {lo} to {hi}), Wikidata {prop} {got}')

json.dump({'qid': dict(sorted(ids.items())), 'title': dict(sorted(titles.items()))}, open(os.path.join(HERE, 'wikidata_ids.json'), 'w'), indent=0, ensure_ascii=False)
with open(os.path.join(DATA, 'wikidata-check.md'), 'w', encoding='utf-8') as f:
    f.write(f'# Wikidata check\n\nLookup: {raw["_meta"]["made"]}. {len(ids)} of {len(recs)} records got a Wikidata id.\n'
            'Disagreements are listed with what was decided; a judge can overrule any of them.\n')
    for title, key in (('No article found', 'missing'), ('No id given', 'skipped'), ('Dates that disagree', 'dates'),
                       ('Coordinates more than 30 km apart', 'coords')):
        f.write(f'\n## {title}\n\n' + ''.join(f'- {x}' + (f'. Decision: {VERDICTS[x[1:x.index("`", 1)]]}' if x[1:x.index("`", 1)] in VERDICTS else '') + '\n' for x in rows[key]))
print(len(ids), {k: len(v) for k, v in rows.items()})
