# Fetch the named provinces of 19th-century Europe from Wikidata: first-level divisions of each state
# (French departments, Prussian provinces, Austrian crown lands, Russian governorates, Ottoman vilayets, ...),
# with their dates. Wikidata has no historical shapes for most of them, so the map names them at their centre.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wdq import sparql

CLASSES = {  # name -> (class, extra triple pattern or '')
    'fr_department': ('Q6465', ''), 'ru_governorate': ('Q47530375', ''), 'ru_oblast': ('Q7075127', ''),
    'it_province': ('Q15089', ''), 'gr_prefecture': ('Q202595', ''), 'es_province': ('Q162620', ''),
    'at_crown_land': ('Q681026', ''), 'ot_vilayet': ('Q1462047', ''), 'ot_sanjak': ('Q330425', ''),
    'de_regbez': ('Q22721', ''), 'en_county': ('Q1138494', ''), 'ie_county': ('Q179872', ''), 'ch_canton': ('Q23058', ''),
    'se_county': ('Q200547', ''), 'pt_district': ('Q3032141', ''), 'no_county': ('Q192299', ''), 'dk_county': ('Q2996700', ''),
    'dk_amt': ('Q876730', ''), 'nl_province': ('Q134390', ''), 'be_province': ('Q83116', ''), 'pr_province': ('Q574299', ''),
    'de_conf_state': ('Q113136497', ''), 'ro_county': ('Q1776764', ''), 'ru_uezd': ('Q1364324', ''),
    'hu_county': ('Q852231', '?item wdt:P17|wdt:P131 wd:Q171150 .'),
    'de_empire_state': ('Q107390', '?item wdt:P361|wdt:P131|wdt:P17 wd:Q43287 .'),
}
Q = """
SELECT ?item ?itemLabel ?coord ?inc ?dis ?parentLabel ?links WHERE {
  ?item wdt:P31 wd:%s ; wdt:P625 ?coord .
  %s
  OPTIONAL { ?item wdt:P571 ?inc } OPTIONAL { ?item wdt:P576 ?dis }
  OPTIONAL { ?item wdt:P131 ?parent }
  ?item wikibase:sitelinks ?links .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,it,es,ru,hu,pl,sv". }
}"""
for name, (c, extra) in CLASSES.items():
    try:
        print(name, len(sparql(Q % (c, extra), cache='prov_' + name)), flush=True)
    except Exception as e:
        print(name, 'FAILED', e, flush=True)
