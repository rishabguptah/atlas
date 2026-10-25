# Fetch European railway stations and lines with opening dates up to 1914 from Wikidata (one query per country,
# so none times out). Raw bindings go to /mnt/project-files/atlas/raw/europe-19c/rail_*.json.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wdq import sparql

# Modern countries the 1914 European network lies in (Wikidata ids).
COUNTRIES = {'gb': 'Q145', 'ie': 'Q27', 'fr': 'Q142', 'be': 'Q31', 'nl': 'Q55', 'lu': 'Q32', 'de': 'Q183', 'ch': 'Q39',
             'at': 'Q40', 'it': 'Q38', 'es': 'Q29', 'pt': 'Q45', 'dk': 'Q35', 'se': 'Q34', 'no': 'Q20', 'fi': 'Q33',
             'pl': 'Q36', 'cz': 'Q213', 'sk': 'Q214', 'hu': 'Q28', 'si': 'Q215', 'hr': 'Q224', 'ba': 'Q225', 'rs': 'Q403',
             'ro': 'Q218', 'bg': 'Q219', 'gr': 'Q41', 'tr': 'Q43', 'ru': 'Q159', 'ua': 'Q212', 'by': 'Q184', 'lt': 'Q37',
             'lv': 'Q211', 'ee': 'Q191', 'md': 'Q217', 'mk': 'Q221', 'me': 'Q236', 'al': 'Q222'}
STATIONS = """
SELECT ?s ?sLabel ?t ?p ?coord ?adj ?line WHERE {
  ?s wdt:P31/wdt:P279* wd:Q55488 ; wdt:P17 wd:%s ; wdt:P625 ?coord .
  ?s p:P1619/psv:P1619 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] .
  FILTER(?t < "1915-01-01T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?s wdt:P197 ?adj }
  OPTIONAL { ?s wdt:P81 ?line }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,it,es,pl,ru,sv,nl,cs,hu". }
}"""
LINES = """
SELECT ?l ?lLabel ?t ?p ?term ?tcoord ?links WHERE {
  ?l wdt:P31/wdt:P279* wd:Q728937 ; wdt:P17 wd:%s .
  ?l p:P1619/psv:P1619 [ wikibase:timeValue ?t ; wikibase:timePrecision ?p ] .
  FILTER(?t < "1915-01-01T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?l wdt:P559 ?term . ?term wdt:P625 ?tcoord }
  ?l wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,it,es,pl,ru,sv,nl,cs,hu". }
}"""
if __name__ == '__main__':
  for cc, q in COUNTRIES.items():
    for kind, tpl in (('st', STATIONS), ('ln', LINES)):
        try:
            print(cc, kind, len(sparql(tpl % q, cache=f'rail_{kind}_{cc}')), flush=True)
        except Exception as e:
            print(cc, kind, 'FAILED', e, flush=True)
