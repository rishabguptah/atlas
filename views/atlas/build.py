# Usage: python3 views/atlas/build.py OUT.html [ATLAS_DIR] [LAYERS_DIR] [--local D3_DIR]
# One page, one map, one year: every workstream's layer on the same map, the guide on top.
# ATLAS_DIR holds the Living Atlas files (entries*.js, empires.js, borders/); default /mnt/project-files/atlas.
# LAYERS_DIR holds people/money/plague/ideas.json from extract_layers.py; default ATLAS_DIR/unified/layers.
# Order and Chaos (data/order-chaos/lab.json) and the guide tours come from this repo.
import sys, json, glob, os

args = sys.argv[1:]
local = None
if '--local' in args:
    i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
out = args[0]
atlas = (args[1] if len(args) > 1 else '/mnt/project-files/atlas').rstrip('/') + '/'
layers = (args[2] if len(args) > 2 else atlas + 'unified/layers').rstrip('/') + '/'
here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.dirname(os.path.dirname(here))
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))

s = open(os.path.join(here, 'atlas.src.html'), encoding='utf-8').read()
ent = '\n'.join(open(atlas + f, encoding='utf-8').read() for f in ['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'])
pol = {}
for f in sorted(glob.glob(atlas + 'borders/world_*.json')):
    y = os.path.basename(f)[6:-5]
    y = -int(y[2:]) if y.startswith('bc') else int(y)
    if y >= -4000: pol[y] = json.load(open(f))
ent += '\nconst POLITIES = ' + J(pol) + ';\n'

lab = json.load(open(os.path.join(repo, 'data/order-chaos/lab.json')))
bt = lab['backtest']
order = {
    'thr': bt['early_warning']['threshold'], 'base': bt['cross_fit']['base_rate'], 'auc': bt['cross_fit']['auc'],
    'polities': [{k: p.get(k) for k in ('id', 'n', 's', 'e', 'pk', 'c', 'b', 'st', 'wiki', 'a', 'f')} for p in lab['polities']],
}
L = {name: json.load(open(layers + name + '.json')) for name in ('people', 'money', 'plague', 'ideas')}

# States & war straight from the kernel records: battles, chokepoints and who held them.
rows = lambda f: [json.loads(l) for l in open(os.path.join(repo, 'data/states-war', f)) if l.strip()]
bat, chk = rows('battles.jsonl'), rows('chokepoints.jsonl')
held = [r for r in chk if r['kind'] == 'relation' and r['type'] == 'controls']
names = {r['id']: r['name'] for r in rows('polities.jsonl') if r.get('name')}
L['war'] = {
    'battles': [{k: e.get(k) for k in ('id', 'name', 'subtype', 'start', 'lat', 'lon', 'sides', 'winner', 'why', 'sources')} for e in bat if e['kind'] == 'event' and e.get('lat') is not None],
    'chokepoints': [{k: e.get(k) for k in ('id', 'name', 'subtype', 'lat', 'lon', 'what', 'why', 'sources')} for e in chk if e['kind'] == 'place'],
    'held': [[r['to'], r['from'], r['start'], r['end']] for r in held],
    'names': {pid: names.get(pid, pid.split(':', 1)[1].replace('_', ' ')) for pid in {r['from'] for r in held}},
}
data = '\n'.join(f'const {k.upper()} = {J(v)};' for k, v in L.items()) + f'\nconst ORDER = {J(order)};\n'

land = J(json.load(open(atlas + 'borders/land-50m.json')))
tours = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(repo, 'data/guide/tours/*.json')))]
s = s.replace('/*__ENTRIES__*/', ent).replace('/*__LAYERS__*/', data).replace('/*__LAND__*/', land).replace('/*__TOURS__*/', J(tours))
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3-7.8.5/package/dist/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client-3.1.0/package/dist/topojson-client.min.js')
    s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + s + '</body></html>'
open(out, 'w', encoding='utf-8').write(s)
print(out, len(s))
