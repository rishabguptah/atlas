#!/usr/bin/env python3
"""Validate every record in data/, merge stubs into their owners, and compile dist/.

Usage: python3 tools/build.py [--check]   (--check validates only, writes nothing)
Writes dist/kernel.json (all records by kind), dist/ids.txt and dist/report.txt.
Standard library only, so it runs anywhere.
"""
import json, os, re, sys, glob
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from conf import ORDER, conf_of  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA, DIST = os.path.join(ROOT, 'data'), os.path.join(ROOT, 'dist')

KINDS = {  # kind -> (id prefix, owning workstream folder or None)
    'place': ('place', 'places-people'), 'polity': ('polity', 'states-war'),
    'person': ('person', 'places-people'), 'group': ('group', 'economy-trade'),
    'event': ('event', None), 'idea': ('idea', 'religion-ideas'), 'work': ('work', 'religion-ideas'),
    'route': ('route', 'economy-trade'), 'relation': ('rel', None), 'measure': ('m', None),
    'language': ('lang', 'peoples-languages'), 'script': ('script', 'peoples-languages'),
    'sample': ('dna', 'peoples-languages'),
    'source': ('src', 'scholarship'), 'debate': ('debate', 'scholarship'), 'quote': ('quote', 'scholarship'),
    'chain': ('chain', 'scholarship'),
}
SRC_TYPES = {'book', 'article', 'chapter', 'primary', 'dataset', 'thesis', 'web'}
STANDINGS = {'leading', 'strong', 'contested', 'minority', 'discredited'}
DOI_RE = re.compile(r'^10\.\d{4,9}/\S+$')
LENSES = {'geography', 'military', 'economy', 'population', 'disease', 'religion', 'ideas', 'literature', 'people', 'order', 'art', 'law', 'language'}
REL_TYPES = {'controls', 'capital_of', 'part_of', 'located_in', 'born_in', 'died_in', 'ruled', 'participant_in',
             'fought', 'allied_with', 'trades_with', 'founded', 'destroyed', 'succeeded', 'influenced', 'teacher_of',
             'translated', 'wrote', 'spread_to', 'migrated_to', 'caused', 'contributed_to', 'prevented', 'governed_as', 'derived_from',
             'present_at'}
CONF = {'attested', 'estimated', 'approximate', 'unknown'}
MODES = {'land', 'river', 'sea', 'caravan', 'rail', 'air', 'road', 'foot', 'horse'}
CAUSAL = {'caused', 'contributed_to', 'prevented'}
CAUSES = {'war', 'fire', 'earthquake', 'river', 'sea', 'climate', 'trade', 'capital', 'quarried', 'volcano',
          'silt', 'faith', 'disease', 'unknown'}
STATUS = {'sourced', 'draft'}
ID_RE = re.compile(r'^([a-z]+)(?::[a-z0-9_]+)+$')
DATE_RE = re.compile(r'^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$')


def year(v):
    return isinstance(v, int) and not isinstance(v, bool) and v != 0 and -100000 < v < 2100


def check(r):
    """Return a list of problems with one record (references are checked later)."""
    errs = []
    kind, rid = r.get('kind'), r.get('id')
    if kind not in KINDS:
        return [f'unknown kind {kind!r}']
    m = ID_RE.match(rid or '')
    if not m or m.group(1) != KINDS[kind][0]:
        errs.append(f'id {rid!r} must look like {KINDS[kind][0]}:lowercase_slug')
    if kind not in ('relation', 'measure', 'source') and not r.get('name'):
        errs.append('missing name')
    lenses = r.get('lenses')
    if not lenses or not isinstance(lenses, list) or set(lenses) - LENSES:
        errs.append(f'lenses must be a non-empty list from {sorted(LENSES)}')
    if r.get('status') not in STATUS:
        errs.append('status must be sourced or draft')
    src = r.get('sources')
    if kind != 'source' and not r.get('stub') and (not isinstance(src, list) or not src or not all(isinstance(s, dict) and s.get('cite') for s in src)):
        errs.append('sources must be a non-empty list of {cite, url?}')
    if isinstance(src, list):
        for s in src:
            if isinstance(s, dict) and 'src' in s and not (isinstance(s['src'], str) and s['src'].startswith('src:')):
                errs.append('a sources entry\'s src must be a src: id')
    if kind == 'source':
        if r.get('type') not in SRC_TYPES:
            errs.append(f'source type must be one of {sorted(SRC_TYPES)}')
        if not r.get('title') or not isinstance(r.get('authors'), list):
            errs.append('source needs title and authors (a list; [] for anonymous)')
        if not year(r.get('year')):
            errs.append('source needs year (of the edition cited, or of writing for a primary source)')
        if r.get('doi') and not DOI_RE.match(r['doi']):
            errs.append('doi must look like 10.xxxx/... (no https://doi.org/ prefix)')
    if kind == 'debate':
        pos = r.get('positions')
        if not isinstance(pos, list) or len(pos) < 2:
            errs.append('debate needs at least two positions')
        else:
            for i, p in enumerate(pos):
                if not isinstance(p, dict) or not p.get('school') or not p.get('claim') or not p.get('works'):
                    errs.append(f'position {i} needs school, claim and works (src ids)')
                elif p.get('standing') not in STANDINGS:
                    errs.append(f'position {i} standing must be one of {sorted(STANDINGS)}')
        if not r.get('state'):
            errs.append('debate needs state (where the field stands now)')
    if kind == 'quote':
        if not r.get('text') or not r.get('src') or not r.get('author'):
            errs.append('quote needs text, author and src')
        elif len(r['text']) > 900:
            errs.append('quote text must stay under 900 characters')
    if kind == 'chain':
        if not isinstance(r.get('links'), list) or len(r['links']) < 2:
            errs.append('chain needs at least two links (rel ids, in order)')
    for f in ('start', 'end'):
        if f in r and r[f] is not None and not year(r[f]):
            errs.append(f'{f} must be a non-zero integer year')
        rg = r.get(f + '_range')
        if rg is not None and not (isinstance(rg, list) and len(rg) == 2 and all(year(x) for x in rg) and rg[0] <= rg[1]):
            errs.append(f'{f}_range must be [low, high]')
    if year(r.get('start')) and year(r.get('end')) and r['start'] > r['end']:
        errs.append('start is after end')
    for f, y in (('date', 'start'), ('end_date', 'end')):
        if f in r:
            v = r[f]
            if not (isinstance(v, str) and DATE_RE.match(v)):
                errs.append(f'{f} must be YYYY, YYYY-MM or YYYY-MM-DD')
            elif year(r.get(y)) and int(v[:4]) != r[y]:
                errs.append(f'{f} {v} is not in {y} year {r[y]}')
    if 'lat' in r or 'lon' in r:
        lat, lon = r.get('lat'), r.get('lon')
        if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and -90 <= lat <= 90 and -180 <= lon <= 180):
            errs.append('lat/lon out of range')
    if 'conf' in r and r['conf'] not in CONF:
        errs.append(f'conf must be one of {sorted(CONF)}')
    if kind == 'route' and r.get('subtype') == 'journey':
        legs = r['legs']
        if not isinstance(legs, list) or not legs:
            errs.append('legs must be a non-empty list')
        else:
            for i, g in enumerate(legs):
                if not isinstance(g, dict) or not (g.get('from') or g.get('at')) or not g.get('to'):
                    errs.append(f'leg {i} needs from and to (place ids or [lon, lat])')
                    continue
                for f in ('start_date', 'end_date'):
                    if f in g and not (isinstance(g[f], str) and DATE_RE.match(g[f].lstrip('-'))):
                        errs.append(f'leg {i} {f} must be YYYY, YYYY-MM or YYYY-MM-DD (a leading - for BCE)')
                if 'mode' in g and g['mode'] not in MODES:
                    errs.append(f'leg {i} mode must be one of {sorted(MODES)}')
                if 'conf' in g and g['conf'] not in CONF:
                    errs.append(f'leg {i} conf must be one of {sorted(CONF)}')
    if 'causes' in r and (not isinstance(r['causes'], list) or set(r['causes']) - CAUSES):
        errs.append(f'causes must come from {sorted(CAUSES)}')
    if kind == 'relation':
        if r.get('type') not in REL_TYPES:
            errs.append(f'unknown relation type {r.get("type")!r}')
        if not r.get('from') or not r.get('to'):
            errs.append('relation needs from and to')
        c = r.get('confidence')
        if r.get('type') in CAUSAL and not isinstance(c, (int, float)):
            errs.append('causal relations need a confidence between 0 and 1')
        if c is not None and not (isinstance(c, (int, float)) and 0 <= c <= 1):
            errs.append('confidence must be between 0 and 1')
    if kind == 'measure':
        if not r.get('of') or not r.get('metric') or not r.get('unit'):
            errs.append('measure needs of, metric and unit')
        pts = r.get('points')
        if not isinstance(pts, list) or not pts or not all(isinstance(p, list) and len(p) in (2, 4) and year(p[0]) for p in pts):
            errs.append('points must be [year, value] or [year, value, low, high]')
        elif [p[0] for p in pts] != sorted(p[0] for p in pts):
            errs.append('points must be in year order')
    return errs


def refs(r):
    """Ids this record points at."""
    out = []
    for f in ('place', 'from', 'to', 'of', 'capital', 'author', 'by', 'policy', 'language'):
        if isinstance(r.get(f), str):
            out.append(r[f])
    if r.get('kind') == 'language':  # elsewhere `family` is a plain label (europe-19c event families)
        out += [r[f] for f in ('family', 'branch') if isinstance(r.get(f), str)]
    for f in ('born', 'died'):
        if isinstance(r.get(f), dict) and isinstance(r[f].get('place'), str):
            out.append(r[f]['place'])
    out += [s for s in r.get('stops') or [] if isinstance(s, str)]
    for g in (r.get('legs') or []) if r.get('subtype') == 'journey' else []:
        if isinstance(g, dict):
            out += [g[f] for f in ('from', 'to') if isinstance(g.get(f), str)]
    if isinstance(r.get('carrier'), str) and ':' in r['carrier']:
        out.append(r['carrier'])
    out += [s['src'] for s in r.get('sources') or [] if isinstance(s, dict) and isinstance(s.get('src'), str)]
    if isinstance(r.get('src'), str):
        out.append(r['src'])
    if r.get('kind') in ('debate', 'quote', 'chain'):
        for f in ('links', 'about', 'quotes', 'series', 'debates'):
            out += [x for x in r.get(f) or [] if isinstance(x, str)]
    for p in r.get('positions') or []:
        if isinstance(p, dict):
            out += [x for x in (p.get('works') or []) + (p.get('rels') or []) if isinstance(x, str)]
    return out


def load():
    recs, errors = [], []
    for path in sorted(glob.glob(os.path.join(DATA, '*', '*.jsonl'))):
        ws, rel = os.path.basename(os.path.dirname(path)), os.path.relpath(path, ROOT)
        for n, line in enumerate(open(path, encoding='utf-8'), 1):
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f'{rel}:{n}: bad JSON ({e.msg})')
                continue
            for e in check(r):
                errors.append(f'{rel}:{n}: {r.get("id", "?")}: {e}')
            recs.append((ws, rel, n, r))
    return recs, errors


def merge(recs, errors):
    """One record per id. Stubs fill gaps; the owner's fields win; two full records clash."""
    full, stubs = {}, defaultdict(list)
    for ws, rel, n, r in recs:
        if r.get('stub'):
            stubs[r['id']].append(r)
        elif r.get('id') in full:
            errors.append(f'{rel}:{n}: duplicate id {r["id"]} (first in {full[r["id"]][0]})')
        else:
            full[r['id']] = (rel, r)
    out = {rid: dict(r) for rid, (_, r) in full.items()}
    for rid, ss in stubs.items():
        base = {}
        for s in ss:
            base.update({k: v for k, v in s.items() if k not in base})
        base.update(out.get(rid, {}))
        if rid not in out:
            base['stub'] = True
        else:
            base.pop('stub', None)
        out[rid] = base
    return out


def main():
    only_check = '--check' in sys.argv
    recs, errors = load()
    merged = merge(recs, errors)
    missing = Counter()
    for rid, r in merged.items():
        for t in refs(r):
            if t not in merged:
                missing[t] += 1
                errors.append(f'{rid}: points at {t}, which no record defines (add it, or a stub)')
    # Confidence class on every record (tools/conf.py): its own `conf`, else the workstream mapping.
    origin = {}
    for ws, _, _, r in recs:
        if r.get('stub'):
            origin.setdefault(r.get('id'), ws)
        else:
            origin[r.get('id')] = ws
    for rid, r in merged.items():
        r['conf'] = conf_of(r, origin.get(rid))
    confs = Counter(r['conf'] for r in merged.values())
    kinds = Counter(r['kind'] for r in merged.values() if r.get('kind') in KINDS)
    lenses = Counter(l for r in merged.values() for l in r.get('lenses') or [])
    report = [f'{len(merged)} records from {len(recs)} lines', '',
              'by kind: ' + ', '.join(f'{k} {v}' for k, v in sorted(kinds.items())),
              'by lens: ' + ', '.join(f'{k} {v}' for k, v in sorted(lenses.items())),
              f'stubs without an owner record: {sum(1 for r in merged.values() if r.get("stub"))}',
              f'draft records: {sum(1 for r in merged.values() if r.get("status") == "draft")}',
              'confidence: ' + ', '.join(f'{c} {confs[c]}' for c in ORDER),
              f'errors: {len(errors)}']
    print('\n'.join(report))
    for e in errors[:200]:
        print('  ' + e)
    if errors:
        sys.exit(1)
    if only_check:
        return
    os.makedirs(DIST, exist_ok=True)
    bundle = defaultdict(list)
    for rid in sorted(merged):
        bundle[merged[rid]['kind']].append(merged[rid])
    with open(os.path.join(DIST, 'kernel.json'), 'w', encoding='utf-8') as f:
        json.dump({'schema': 'v0', 'records': bundle}, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(DIST, 'ids.txt'), 'w') as f:
        f.write('\n'.join(sorted(merged)) + '\n')
    with open(os.path.join(DIST, 'report.txt'), 'w') as f:
        f.write('\n'.join(report) + '\n')


if __name__ == '__main__':
    main()
