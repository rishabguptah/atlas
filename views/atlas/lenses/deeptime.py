# Deep time: 300,000 years ago to the first cities. Records from data/deep-time/*.jsonl (ingest/deep-time/curated.py);
# the ice-age world rasters (paleo-sea.png, paleo-ice.png) and sea-level curve from ingest/deep-time/paleo.py.
# The rasters go beside the page as atlas-files/ (build.py `_files`); the pixel map draws coasts, ice and biomes from them.
import json, os


def rows(repo, f):
    p = os.path.join(repo, 'data', 'deep-time', f)
    return [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()] if os.path.exists(p) else []


def src(r):
    return [[s['cite'], s.get('url', '')] for s in r.get('sources', [])]


def build(repo):
    d = os.path.join(repo, 'data', 'deep-time')
    if not os.path.exists(os.path.join(d, 'sealevel.json')):
        return {}
    sl = json.load(open(os.path.join(d, 'sealevel.json')))
    keep = lambda r, *ks: {k: r[k] for k in ks if k in r}
    out = {
        'sea': sl['sea'], 'slices': sl['slices'], 'sheets': sl['sheets'], 'retreat': sl['retreat'], 'paleo_sources': [[s['cite'], s.get('url', '')] for s in sl['sources']],
        'sites': [dict(keep(r, 'id', 'name', 'lat', 'lon', 'start', 'start_range', 'find', 'who', 'what', 'why', 'conf', 'debate'), src=src(r)) for r in rows(repo, 'sites.jsonl')],
        'groups': [dict(keep(r, 'id', 'name', 'latin', 'lat', 'lon', 'start', 'end', 'range', 'what', 'why', 'conf'), src=src(r)) for r in rows(repo, 'groups.jsonl')],
        'fauna': [dict(keep(r, 'id', 'name', 'latin', 'sprite', 'start', 'end', 'at', 'range', 'range2', 'last_refuge', 'what', 'why', 'debate'), src=src(r)) for r in rows(repo, 'fauna.jsonl')],
        'routes': [dict(keep(r, 'id', 'name', 'path', 'conf', 'what', 'why', 'sites'), src=src(r)) for r in rows(repo, 'dispersals.jsonl')],
        'hearths': [dict(keep(r, 'id', 'name', 'lat', 'lon', 'start', 'start_range', 'crops', 'animals', 'what', 'why', 'conf', 'links'), src=src(r)) for r in rows(repo, 'hearths.jsonl')],
        'land': [dict(keep(r, 'id', 'name', 'subtype', 'lat', 'lon', 'what', 'why'), src=src(r)) for r in rows(repo, 'landscape.jsonl')],
        'events': [dict(keep(r, 'id', 'name', 'subtype', 'lat', 'lon', 'start', 'end', 'what', 'why'), src=src(r)) for r in rows(repo, 'events.jsonl')],
        '_files': {n: open(os.path.join(d, n), 'rb').read() for n in ('paleo-sea.png', 'paleo-ice.png')},
    }
    return out
