# Stories: authored Stories in the one Scene format (views/atlas/WORLD.md L4), from data/stories/*.json.
# The Director (views/atlas/world/director.js) plays them; the Stories tab (stories.js) lists every Story the
# Atlas can tell. Tours, What-ifs, storylines and trails are converted on the page, so only authored ones travel here.
import glob, json, os


def build(repo):
    out = []
    for f in sorted(glob.glob(os.path.join(repo, 'data', 'stories', '*.json'))):
        s = json.load(open(f, encoding='utf-8'))
        assert s.get('id') and s.get('scenes'), f
        out.append(s)
    return {'stories': out}
