# Fetch dated events everywhere and in every period from Wikidata: one query per event class and time window
# (the class with its subclasses). Raw bindings go to /mnt/project-files/atlas/raw/deep/ev_<class>_<window>.json
# (cached; delete a file to refetch). Usage: python3 fetch_events.py [class ...]  (about an hour, three at a time)
import sys, os
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'europe-19c'))
os.environ.setdefault('ATLAS_RAW', '/mnt/project-files/atlas/raw')
import wdq
wdq.RAW = os.environ['ATLAS_RAW'] + '/deep'
from wdq import sparql

CLASSES = {  # name -> Wikidata class (with subclasses)
    'battle': 'Q178561', 'siege': 'Q188055', 'war': 'Q198', 'campaign': 'Q831663', 'invasion': 'Q467011', 'conquest': 'Q2001676',
    'expedition': 'Q2401485', 'mutiny': 'Q511866', 'revolution': 'Q10931', 'rebellion': 'Q124734',
    'coup': 'Q45382', 'assassination': 'Q3882219', 'massacre': 'Q3199915', 'genocide': 'Q41397', 'pogrom': 'Q177716',
    'riot': 'Q124757', 'strike': 'Q49776', 'protest': 'Q273120', 'treaty': 'Q131569', 'peace_conference': 'Q7157512',
    'conference': 'Q1072326', 'congress': 'Q2761147', 'council': 'Q51645', 'synod': 'Q111161', 'independence': 'Q1464916',
    'coronation': 'Q209715', 'referendum': 'Q43109', 'election': 'Q40231', 'worlds_fair': 'Q172754', 'epidemic': 'Q44512',
    'famine': 'Q168247', 'earthquake': 'Q7944', 'eruption': 'Q7692360', 'flood': 'Q8068', 'tsunami': 'Q8070', 'fire': 'Q3196',
    'shipwreck': 'Q906512', 'disaster': 'Q3839081',
}
# Time windows sized so a busy class stays under the public endpoint's timeout.
W = [(-5000, -500), (-500, 1), (1, 500), (500, 1000), (1000, 1300), (1300, 1500), (1500, 1600), (1600, 1700), (1700, 1789),
     (1789, 1850), (1850, 1900), (1900, 1925), (1925, 1950), (1950, 1975), (1975, 2000), (2000, 2027)]
Q = """
SELECT ?item ?itemLabel ?itemDescription ?t ?p ?e ?ep ?coord ?lcoord ?locLabel ?countryLabel ?partLabel ?part ?links WHERE {
  ?item wdt:P31/wdt:P279* wd:%s .
  { ?item p:P585/psv:P585 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] } UNION
  { ?item p:P580/psv:P580 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] } UNION
  { ?item p:P571/psv:P571 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] }
  FILTER(?t >= "%s"^^xsd:dateTime && ?t < "%s"^^xsd:dateTime)
  OPTIONAL { ?item p:P582/psv:P582 [ wikibase:timeValue ?e ; wikibase:timePrecision ?ep ] }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?lcoord }
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P361 ?part }
  ?item wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""


def ts(y):
    return ('-%04d' % -y if y < 0 else '%04d' % y) + '-01-01T00:00:00Z'


def job(a):
    name, (y0, y1) = a
    try:
        rows = sparql(Q % (CLASSES[name], ts(y0), ts(y1)), cache='ev_%s_%s_%s' % (name, y0, y1), tries=4)
        return '%s %s..%s %d' % (name, y0, y1, len(rows))
    except Exception as e:
        return '%s %s..%s FAILED %s' % (name, y0, y1, e)


if __name__ == '__main__':
    jobs = [(n, w) for n in (sys.argv[1:] or CLASSES) for w in W]
    with ThreadPoolExecutor(3) as ex:
        for msg in ex.map(job, jobs):
            print(msg, flush=True)
