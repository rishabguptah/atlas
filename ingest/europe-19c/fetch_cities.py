# Fetch dated city populations 1789-1914 from Wikidata (P1082 with a point-in-time qualifier), one query per
# modern country so none times out. Raw bindings go to /mnt/project-files/atlas/raw/europe-19c/pop_<cc>.json.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wdq import sparql
from fetch_rail import COUNTRIES

Q = """
SELECT ?c ?cLabel ?coord ?pop ?t ?links WHERE {
  ?c wdt:P17 wd:%s ; wdt:P625 ?coord ; p:P1082 ?st .
  ?st ps:P1082 ?pop ; pq:P585 ?t .
  FILTER(?t >= "1780-01-01T00:00:00Z"^^xsd:dateTime && ?t < "1915-01-01T00:00:00Z"^^xsd:dateTime && ?pop >= 10000)
  ?c wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,it,es,pl,ru,sv,nl,cs,hu". }
}"""
if __name__ == '__main__':
    for cc, q in COUNTRIES.items():
        try:
            print(cc, len(sparql(Q % q, cache='pop_' + cc)), flush=True)
        except Exception as e:
            print(cc, 'FAILED', e, flush=True)


def settlements():
    """Which of the fetched items are towns or cities (P17 also matches countries and regions)."""
    import glob, json
    from wdq import RAW, qid
    qs = sorted({qid(r['c']) for f in glob.glob(os.path.join(RAW, 'pop_*.json')) if 'settle' not in f for r in json.load(open(f))})
    keep = []
    for i in range(0, len(qs), 300):
        vals = ' '.join('wd:' + q for q in qs[i:i + 300])
        keep += [qid(r['c']) for r in sparql('SELECT DISTINCT ?c WHERE { VALUES ?c { %s } ?c wdt:P31/wdt:P279* wd:Q486972 . }' % vals, cache=f'pop_settle_{i}')]
    return set(keep)


if __name__ == '__main__':
    print('settlements', len(settlements()))
