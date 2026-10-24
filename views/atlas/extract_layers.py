# Usage: python3 views/atlas/extract_layers.py OUT_DIR PAGE=FILE.html ...
# Pulls the data block out of a workstream's published page, for workstreams whose records are not on main yet.
#   people=who-could-have-met.html (DATA)   money=where-the-money-moved.html (DATA)
#   plague=plague-and-climate.html (DC)      ideas=atlas-of-ideas.html (DATA)
# Once each workstream's data/<name>/*.jsonl is merged, build.py should read the kernel instead.
import json, re, sys, os

CONST = {'people': 'DATA', 'money': 'DATA', 'plague': 'DC', 'ideas': 'DATA'}
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for arg in sys.argv[2:]:
    name, f = arg.split('=', 1)
    s = open(f, encoding='utf-8').read()
    m = re.search(r'^\s*const\s+' + CONST[name] + r'\s*=\s*', s, re.M)
    o, _ = json.JSONDecoder().raw_decode(s[m.end():])
    o.pop('land', None)
    json.dump(o, open(os.path.join(out, name + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(name, os.path.getsize(os.path.join(out, name + '.json')))
