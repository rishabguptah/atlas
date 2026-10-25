# Fetch dated European events 1789-1914 from Wikidata, one query per event class (with subclasses).
# Writes the raw bindings to /mnt/project-files/atlas/raw/europe-19c/ev_<name>.json. Usage: python3 fetch_events.py [name ...]
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wdq import sparql

CLASSES = {  # name -> Wikidata class
    'treaty': 'Q131569', 'revolution': 'Q10931', 'rebellion': 'Q124734', 'coup': 'Q45382',
    'assassination': 'Q3882219', 'massacre': 'Q3199915', 'pogrom': 'Q177716', 'riot': 'Q124757', 'strike': 'Q49776',
    'worlds_fair': 'Q172754', 'peace_conference': 'Q7157512', 'conference': 'Q1072326', 'independence': 'Q1464916',
    'coronation': 'Q209715', 'campaign': 'Q831663', 'war': 'Q198', 'epidemic': 'Q44512', 'famine': 'Q168247',
    'earthquake': 'Q7944', 'fire': 'Q3196', 'shipwreck': 'Q906512', 'disaster': 'Q3839081',
    'referendum': 'Q43109', 'battle': 'Q178561', 'siege': 'Q188055', 'congress': 'Q2761147', 'expedition': 'Q2401485', 'mutiny': 'Q211364', 'protest': 'Q273120',
}
Q = """
SELECT ?item ?itemLabel ?itemDescription ?t ?p ?e ?ep ?coord ?lcoord ?locLabel ?countryLabel ?partLabel ?part ?links WHERE {
  ?item wdt:P31/wdt:P279* wd:%s .
  { ?item p:P585/psv:P585 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] } UNION
  { ?item p:P580/psv:P580 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] } UNION
  { ?item p:P571/psv:P571 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] }
  FILTER(?t >= "1789-01-01T00:00:00Z"^^xsd:dateTime && ?t < "1915-01-01T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?item p:P582/psv:P582 [ wikibase:timeValue ?e ; wikibase:timePrecision ?ep ] }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?lcoord }
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P361 ?part }
  ?item wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""

for name in sys.argv[1:] or CLASSES:
    try:
        rows = sparql(Q % CLASSES[name], cache='ev_' + name)
        print(name, len(rows), flush=True)
    except Exception as e:
        print(name, 'FAILED', e, flush=True)
