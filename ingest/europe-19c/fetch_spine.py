# Resolve the study spine's Wikipedia articles to Wikidata ids (raw/europe-19c/spine_qids.json).
import sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wdq import sparql
from spine import STORIES

titles = sorted({s[7] for st in STORIES for s in st[5]})
vals = ' '.join('<https://en.wikipedia.org/wiki/%s>' % urllib.parse.quote(t.replace(' ', '_'), safe="(),'_") for t in titles)
rows = sparql('SELECT ?a ?i WHERE { VALUES ?a { %s } ?a schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> . }' % vals, cache='spine_qids')
print(len(titles), 'titles', len(rows), 'resolved')
