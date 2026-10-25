# Usage: python3 views/atlas/build.py OUT.html [ATLAS_DIR] [LAYERS_DIR] [--local D3_DIR] [--inline]
# Big blobs the first paint does not need go to atlas-files/ next to OUT.html (publish them with the page):
# relief images, the terrain L0 tile, plugin lens data over 40 KB and the Wikidata battles. The old border snapshots
# are not inlined (the page reads borders/l0 beside it). --inline keeps everything in one file (for opening locally).
# One page, one map, one year: every workstream's layer on the same map, the guide on top.
# ATLAS_DIR holds the Living Atlas files (entries*.js, empires.js, borders/); default /mnt/project-files/atlas.
# LAYERS_DIR holds people/money/plague/ideas.json from extract_layers.py; default ATLAS_DIR/unified/layers.
# Order and Chaos (data/order-chaos/lab.json) and the guide tours come from this repo.
import sys, json, glob, os

args = sys.argv[1:]
local = None
inline = '--inline' in args
if inline: args.remove('--inline')
if '--local' in args:
    i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
out = args[0]
atlas = (args[1] if len(args) > 1 else '/mnt/project-files/atlas').rstrip('/') + '/'
layers = (args[2] if len(args) > 2 else atlas + 'unified/layers').rstrip('/') + '/'
here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.dirname(os.path.dirname(here))
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
side_dir = os.path.join(os.path.dirname(os.path.abspath(out)), 'atlas-files')
late = {}  # key -> url, fetched by the page after the first paint
def side(name, data):
    '''Write bytes or a JSON-able object to atlas-files/NAME; return its URL relative to the page.'''
    os.makedirs(side_dir, exist_ok=True)
    with open(os.path.join(side_dir, name), 'wb') as f:
        f.write(data if isinstance(data, bytes) else J(data).encode('utf-8'))
    return 'atlas-files/' + name

s = open(os.path.join(here, 'atlas.src.html'), encoding='utf-8').read()
ent = '\n'.join(open(atlas + f, encoding='utf-8').read() for f in ['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'])
pol = {}
for f in sorted(glob.glob(atlas + 'borders/world_*.json')):
    y = os.path.basename(f)[6:-5]
    y = -int(y[2:]) if y.startswith('bc') else int(y)
    if y >= -4000: pol[y] = json.load(open(f)) if inline else None
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
# Wikidata battles and sieges, compact: [name, subtype, year, lat, lon, wikidata, participants, war].
# Skip the ones the curated list already tells better (same name and year).
cur = {(e['name'].lower(), e['start']) for e in L['war']['battles']}
wd = os.path.join(repo, 'data/states-war/battles-wikidata.jsonl')
if os.path.exists(wd):
    L['war']['wd'] = [[e['name'], e['subtype'], e['start'], round(e['lat'], 3), round(e['lon'], 3), e.get('wikidata'),
                       ' / '.join(p['name'] for p in e.get('participants') or []), (e.get('wars') or [{}])[0].get('name')]
                      for e in rows('battles-wikidata.jsonl') if e['kind'] == 'event' and e.get('lat') is not None
                      and e.get('start') is not None and (e['name'].lower(), e['start']) not in cur]

# Terrain basemap (relief image, labels, rivers) from the terrain workstream, when it is there.
terrain_js, relief, relief_pol = '', '', ''
if os.path.exists(layers + 'terrain.json'):
    import base64
    L['terrain'] = json.load(open(layers + 'terrain.json'))
    terrain_js = open(layers + 'terrain.js', encoding='utf-8').read()
    rb = open(layers + 'terrain-relief.webp', 'rb').read()
    relief = 'data:image/webp;base64,' + base64.b64encode(rb).decode() if inline else side('terrain-relief.webp', rb)
    if os.path.exists(layers + 'terrain-political.webp'):  # the Paradox-style texture that sits under flat realm colours
        rb = open(layers + 'terrain-political.webp', 'rb').read()
        relief_pol = 'data:image/webp;base64,' + base64.b64encode(rb).decode() if inline else side('terrain-political.webp', rb)
if not inline and L['war'].get('wd'):
    late['war:wd'] = side('battles-wd.json', L['war'].pop('wd'))
data = '\n'.join(f'const {k.upper()} = {J(v)};' for k, v in L.items()) + f'\nconst ORDER = {J(order)};\nconst RELIEF = {J(relief)};\nconst RELIEF_POL = {J(relief_pol)};\n'
if 'terrain' not in L: data += 'const TERRAIN = null;\n'

# Plugin lenses: views/atlas/lenses/<id>.py gives the data (build(repo) -> dict), <id>.js draws it.
# Basemaps and sprites are .js only. Each script gets its own tag so one broken lens cannot stop the page.
import importlib.util
sys.dont_write_bytecode = True
lens_dir = os.path.join(here, 'lenses')
lens_data, scripts = {}, []
for f in sorted(glob.glob(os.path.join(lens_dir, '*.py'))):
    lid = os.path.basename(f)[:-3]
    spec = importlib.util.spec_from_file_location('atlas_lens_' + lid.replace('-', '_'), f)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    lens_data[lid] = mod.build(repo)
    print('lens', lid, len(J(lens_data[lid])), 'bytes', file=sys.stderr)
if not inline:
    for lid in list(lens_data):
        if len(J(lens_data[lid])) > 40000: late['lens:' + lid] = side(f'lens-{lid}.json', lens_data.pop(lid))
data += f'const LENS_DATA = {J(lens_data)};\n'
# Pixel map basemap (views/pixel/): renderer and sprites, plus terrain L0 and rivers when the terrain rasters exist.
pixel_dir = os.path.join(repo, 'views/pixel')
pixel_src = atlas + 'pixel/'
if os.path.exists(pixel_src + 'terrain/terrain_l0.png'):
    import base64
    # Keep the inline part small: L0 as lossless WebP, only the great rivers at 0.1 degree (finer rivers come in the tiles).
    try:
        import io
        from PIL import Image
        buf = io.BytesIO(); Image.open(pixel_src + 'terrain/terrain_l0.png').save(buf, 'WEBP', lossless=True, quality=100, method=6)
        tile0 = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode() if inline else side('terrain-l0.webp', buf.getvalue())
    except ImportError:
        tile0 = 'data:image/png;base64,' + base64.b64encode(open(pixel_src + 'terrain/terrain_l0.png', 'rb').read()).decode()
    rv = []
    for r in (json.load(open(pixel_src + 'rivers.json')) if os.path.exists(pixel_src + 'rivers.json') else []):
        pts = []
        for x, y in r['line']:
            q = [round(x, 1), round(y, 1)]
            if not pts or pts[-1] != q: pts.append(q)
        if r['rank'] <= 4 and len(pts) > 1: rv.append({'rank': r['rank'], 'line': pts})
    # City lights for the night sky (ingest/pixel/city_lights.py): beside the page when it has side files, else inline.
    lights = None
    if os.path.exists(pixel_src + 'city-lights.json'):
        lb = open(pixel_src + 'city-lights.json', 'rb').read()
        lights = side('city-lights.json', lb) if 'side' in globals() and not globals().get('inline') else json.loads(lb)
    data += 'const PIXEL = ' + J({'tile0': tile0, 'rivers': rv, 'lights': lights}) + ';\n'
    for f in ('palette.js', 'sprites-library.js', 'sprites.js', 'era.js', 'pixelmap.js', 'borders.js', 'geolabels.js', 'marks.js', 'hud.js', 'detail.js', 'motion.js'):
        if os.path.exists(os.path.join(pixel_dir, f)):
            scripts.append('<script>\n' + open(os.path.join(pixel_dir, f), encoding='utf-8').read().replace('</script', '<\\/script') + '\n</script>')
for f in sorted(glob.glob(os.path.join(here, 'sprites', '*.js'))) + sorted(glob.glob(os.path.join(lens_dir, '*.js'))):
    scripts.append('<script>\n' + open(f, encoding='utf-8').read().replace('</script', '<\\/script') + '\n</script>')

data += f'const LATE_FILES = {J(late)};\n'
land = J(json.load(open(atlas + 'borders/land-50m.json')))
tours = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(repo, 'data/guide/tours/*.json')))]
s = s.replace('/*__ENTRIES__*/', ent).replace('/*__LAYERS__*/', data).replace('/*__LAND__*/', land).replace('/*__TOURS__*/', J(tours)).replace('/*__TERRAIN_JS__*/', terrain_js).replace('<!--__LENS_SCRIPTS__-->', '\n'.join(scripts))
if local:
    s = s.replace('https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'file://' + local + '/d3-7.8.5/package/dist/d3.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'file://' + local + '/topojson-client-3.1.0/package/dist/topojson-client.min.js')
    s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + s + '</body></html>'
open(out, 'w', encoding='utf-8').write(s)
print(out, len(s))
if os.path.isdir(side_dir) and not inline:
    for f in sorted(os.listdir(side_dir)): print('  atlas-files/' + f, os.path.getsize(os.path.join(side_dir, f)))
