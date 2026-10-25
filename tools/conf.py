"""Confidence class for every kernel record: the data behind the map's confidence grammar (art direction D10).

conf = attested (solid) · estimated (hatched) · approximate (dashed) · unknown (fog). See schema/SCHEMA.md (v0.6)
and views/atlas/WORLD.md, L0.

A record that sets `conf` itself keeps it. Otherwise `conf_of` derives one from the record and the workstream
folder it came from: first the workstream's own rules, then the general ones. Change a rule here, not in the
views; every view reads the same class. tools/build.py writes the result into dist/kernel.json.
"""

ORDER = ('attested', 'estimated', 'approximate', 'unknown')  # solid to fog; tools/build.py validates the set

def _approx(r):
    return any(r.get(k) for k in ('start_approx', 'end_approx', 'start_range', 'end_range', 'date_note'))

def _unchecked(r):
    src = r.get('sources') or []
    return bool(src) and all('not yet checked' in (s.get('cite') or '') for s in src)

def _causal(r):
    c = r.get('confidence')
    if not isinstance(c, (int, float)):
        return 'approximate'
    return 'estimated' if c >= 0.75 else 'approximate' if c >= 0.45 else 'unknown'

def _census(r):
    return any('census' in (s.get('cite') or '').lower() for s in r.get('sources') or [])

# Workstream rules: (folder, test, conf), tried in order before the general rules. A test returns True to apply.
WORKSTREAM = [
    # Diffusion steps (a crop, a technique, a faith reaching a place) are dated to a generation at best.
    ('tech-food-energy', lambda r: r.get('type') == 'spread_to', 'approximate'),
    ('religion-ideas', lambda r: r.get('type') in ('spread_to', 'influenced'), 'approximate'),
    ('art-architecture', lambda r: r.get('type') == 'influenced', 'approximate'),
    # Migrations and peoples: sizes and dates are reconstructions.
    ('economy-trade', lambda r: r['kind'] == 'group', 'estimated'),
    # Ancient DNA samples: dated by radiocarbon or context, a measured range rather than a rough guess.
    ('peoples-languages', lambda r: r['kind'] == 'sample', 'estimated'),
    # Fragility forecasts and backtests are model outputs.
    ('order-chaos', lambda r: r['kind'] == 'measure', 'estimated'),
    # Wikidata battles and the Europe 1789-1914 chronicle are dated to the day by their sources.
    ('states-war', lambda r: r['kind'] == 'event' and r.get('status') == 'sourced' and not _approx(r), 'attested'),
    ('europe-19c', lambda r: r.get('status') == 'sourced' and not _approx(r), 'attested'),
]

def conf_of(r, ws=None):
    if r.get('conf') in ORDER:
        return r['conf']
    for folder, test, c in WORKSTREAM:
        if folder == ws and test(r):
            return c
    kind = r.get('kind')
    if kind == 'relation' and r.get('type') in ('caused', 'contributed_to', 'prevented'):
        return _causal(r)
    if kind == 'measure':
        return 'attested' if _census(r) and r.get('status') == 'sourced' else 'estimated'
    if kind == 'route':
        return 'approximate'
    if kind in ('event', 'person') and r.get('start') is None and not r.get('date') and not r.get('born'):
        return 'unknown'
    if _approx(r) or r.get('status') == 'draft' or _unchecked(r):
        return 'approximate'
    return 'attested'
