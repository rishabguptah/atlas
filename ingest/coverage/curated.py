#!/usr/bin/env python3
"""Hand-written rows for places the datasets miss or only stub: writes ingest/coverage/curated.jsonl.

Every row is status "draft" (written by a model from the cited works, waiting for the judge) with conf "estimated"
unless the date is a recorded one. Places the Living Atlas only stubbed are adopted here as full records
(same id; the stub's fields fill whatever these rows leave out).
"""
import json, os

S = {  # short source keys
    'swahili': {'cite': 'Horton, M. and Middleton, J. 2000. The Swahili: The Social Landscape of a Mercantile Society. Oxford: Blackwell'},
    'chittick': {'cite': 'Chittick, N. 1974. Kilwa: An Islamic Trading City on the East African Coast. Nairobi: British Institute in Eastern Africa'},
    'zim': {'cite': 'Pikirayi, I. 2001. The Zimbabwe Culture: Origins and Decline of Southern Zambezian States. Walnut Creek: AltaMira'},
    'huffman': {'cite': 'Huffman, T. N. 2007. Handbook to the Iron Age. Pietermaritzburg: University of KwaZulu-Natal Press'},
    'vij': {'cite': 'Fritz, J. M. and Michell, G. 2011. Hampi Vijayanagara. Mumbai: Jaico'},
    'eaton': {'cite': 'Eaton, R. M. 2005. A Social History of the Deccan, 1300-1761. Cambridge University Press'},
    'sri': {'cite': 'Wolters, O. W. 1967. Early Indonesian Commerce: A Study of the Origins of Srivijaya. Ithaca: Cornell University Press'},
    'coedes': {'cite': 'Coedès, G. 1968. The Indianized States of Southeast Asia. Honolulu: East-West Center Press'},
    'coe': {'cite': 'Coe, M. D. 2003. Angkor and the Khmer Civilization. London: Thames & Hudson'},
    'zhou': {'cite': 'Zhou Daguan, A Record of Cambodia: The Land and Its People, trans. P. Harris. 2007. Chiang Mai: Silkworm'},
    'cah': {'cite': 'Pauketat, T. R. 2009. Cahokia: Ancient America’s Great City on the Mississippi. New York: Viking'},
    'tiw': {'cite': 'Janusek, J. W. 2008. Ancient Tiwanaku. Cambridge University Press'},
    'kolata': {'cite': 'Kolata, A. L. 1993. The Tiwanaku: Portrait of an Andean Civilization. Oxford: Blackwell'},
    'kanem': {'cite': 'Lange, D. 2004. Ancient Kingdoms of West Africa. Dettelbach: Röll'},
    'unesco4': {'cite': 'Niane, D. T. (ed.) 1984. General History of Africa IV: Africa from the Twelfth to the Sixteenth Century. UNESCO (chapters on Kanem-Bornu and the East African coast)'},
    'levtzion': {'cite': 'Levtzion, N. and Hopkins, J. F. P. (eds) 1981. Corpus of Early Arabic Sources for West African History. Cambridge University Press'},
    'dreyer': {'cite': 'Dreyer, E. L. 2007. Zheng He: China and the Oceans in the Early Ming Dynasty, 1405-1433. New York: Pearson Longman'},
    'subrah': {'cite': 'Subrahmanyam, S. 1997. The Career and Legend of Vasco da Gama. Cambridge University Press'},
}


def src(*k):
    return [S[x] for x in k]


R = []


def place(id, name, lat, lon, start, end, what, why, sources, **kw):
    r = {'id': id, 'kind': 'place', 'subtype': kw.pop('subtype', 'city'), 'name': name, 'lat': lat, 'lon': lon,
         'lenses': kw.pop('lenses', ['geography', 'population', 'order']), 'what': what, 'why': why,
         'sources': sources, 'status': 'draft', 'conf': kw.pop('conf', 'estimated')}
    if start is not None:
        r['start'] = start; r['start_approx'] = kw.pop('start_approx', True)
    if end is not None:
        r['end'] = end; r['end_approx'] = kw.pop('end_approx', True)
    r.update(kw)
    R.append(r)


def event(id, name, start, what, sources, lenses, subtype, at=None, end=None, date=None, approx=True, conf=None, **kw):
    r = {'id': id, 'kind': 'event', 'subtype': subtype, 'name': name, 'start': start, 'lenses': lenses, 'what': what,
         'sources': sources, 'status': 'draft', 'conf': conf or ('estimated' if approx else 'attested')}
    if approx:
        r['start_approx'] = True
    if end is not None:
        r['end'] = end
    if date:
        r['date'] = date
    if isinstance(at, str):
        r['place'] = at
    elif at:
        r['lat'], r['lon'] = at
    r.update(kw)
    R.append(r)


# ---- Swahili coast
place('place:kilwa', 'Kilwa Kisiwani', -8.957, 39.512, 900, 1840, 'Island port off southern Tanzania, the richest Swahili city-state, minting its own copper coins.',
      'It controlled the Sofala gold trade from the Zimbabwe plateau to the Indian Ocean.', src('chittick', 'swahili'))
place('place:mombasa', 'Mombasa', -4.043, 39.668, 900, None, 'Swahili port on an island off the Kenyan coast; Fort Jesus (1593) made it the Portuguese base on the coast.',
      'Rival of Malindi and the key harbour for the monsoon trade with Arabia and India.', src('swahili'))
event('event:husuni_kubwa_built', 'Husuni Kubwa palace built at Kilwa', 1310, 'Sultan al-Hasan ibn Sulaiman builds a palace with a bathing pool and warehouses on the cliff above the harbour, the largest building south of the Sahara in its day.',
      src('chittick'), ['art', 'economy'], 'founding', at=(-8.9367, 39.5167), end=1333)
event('event:zheng_he_east_africa', 'Zheng He’s fleet on the Swahili coast', 1418, 'Ships of the fifth Ming treasure voyage (1417-1419) call at Mogadishu, Barawa and Malindi and return with envoys and a giraffe.',
      src('dreyer'), ['economy', 'geography'], 'expedition', at='place:malindi', end=1419)
event('event:vasco_da_gama_malindi', 'Vasco da Gama finds a pilot at Malindi', 1498, 'Rebuffed at Mombasa, da Gama is welcomed by the ruler of Malindi, who gives him a Gujarati pilot for the crossing to Calicut.',
      src('subrah'), ['economy', 'geography'], 'expedition', at='place:malindi', date='1498-04', approx=False)
event('event:sack_of_mombasa_1505', 'Portuguese sack of Mombasa', 1505, 'Francisco de Almeida’s fleet storms and burns Mombasa weeks after taking Kilwa.',
      src('swahili'), ['military', 'order'], 'sack', at='place:mombasa', date='1505-08', approx=False, destructive=True)
event('event:gedi_abandoned', 'Gedi abandoned', 1600, 'The stone town of Gedi, with its palace and great mosque, is abandoned, probably after Oromo raids and a falling water table.',
      src('swahili'), ['order'], 'collapse', at='place:ruins_of_gedi')

# ---- Great Zimbabwe and its forerunner
place('place:mapungubwe', 'Mapungubwe', -22.1925, 29.2389, 1075, 1290, 'Hilltop capital at the Limpopo-Shashe confluence, the first state on the southern African plateau; famous for its gold rhinoceros.',
      'Its rise and fall (perhaps with a drier climate) passed the gold trade north to Great Zimbabwe.', src('huffman', 'zim'), wikidata='Q98085401')
place('place:great_zimbabwe', 'Great Zimbabwe', -20.27, 30.934, 1100, 1450, 'Stone-walled capital on the Zimbabwe plateau, with the Hill Complex and the Great Enclosure, home to perhaps 10,000-18,000 people at its height.',
      'It grew rich on cattle and on gold sent down to Sofala and Kilwa; Chinese celadon and Persian glass reached it.', src('zim', 'huffman'))
event('event:great_enclosure_built', 'Great Enclosure walls raised at Great Zimbabwe', 1300, 'The largest dry-stone enclosure in sub-Saharan Africa, with its conical tower, goes up over about a century.',
      src('zim'), ['art'], 'founding', at='place:great_zimbabwe', end=1400)
event('event:great_zimbabwe_declines', 'Great Zimbabwe declines', 1450, 'The capital empties as power moves north to Mutapa and south-west to Khami; overgrazing, drought and shifting gold routes are the usual explanations.',
      src('zim'), ['order'], 'collapse', at='place:great_zimbabwe')
event('event:mutapa_founded', 'Kingdom of Mutapa founded', 1430, 'Nyatsimba Mutota leads a move north to the Zambezi valley and founds the Mutapa state, which the Portuguese later knew as Monomotapa.',
      src('zim', 'unesco4'), ['law', 'order'], 'founding', at=(-16.5, 31.5))

# ---- Vijayanagara
place('place:vijayanagara', 'Vijayanagara (Hampi)', 15.335, 76.46, 1336, 1565, 'Capital of the Vijayanagara Empire on the Tungabhadra, one of the largest cities in the world around 1500.',
      'For two centuries it held the south Indian Hindu kingdoms together against the Deccan sultanates.', src('vij', 'eaton'), end_approx=False, start_approx=False)
event('event:vijayanagara_founded', 'Vijayanagara founded', 1336, 'The brothers Harihara and Bukka of the Sangama family found a new capital on the Tungabhadra, by tradition on the advice of the sage Vidyaranya.',
      src('eaton'), ['law', 'order'], 'founding', at='place:vijayanagara')
event('event:abdur_razzaq_vijayanagara', 'Abdur Razzaq visits Vijayanagara', 1443, 'The Timurid envoy from Herat describes seven rings of walls and a city “such that the pupil of the eye has never seen a place like it”.',
      src('eaton'), ['people', 'economy'], 'expedition', at='place:vijayanagara', approx=False)
event('event:sack_of_vijayanagara', 'Sack of Vijayanagara', 1565, 'After the defeat at Talikota the capital is looted for months by the sultanates’ armies and never reoccupied as a capital.',
      src('vij', 'eaton'), ['military', 'order'], 'sack', at='place:vijayanagara', approx=False, destructive=True, links=['event:talikota'])

# ---- Srivijaya
event('event:kedukan_bukit_inscription', 'Kedukan Bukit inscription', 683, 'The oldest dated Old Malay text records a victorious expedition (siddhayatra) by the Srivijayan ruler, near Palembang.',
      src('coedes', 'sri'), ['literature', 'law'], 'founding', at='place:palembang', approx=False)
event('event:yijing_srivijaya', 'Yijing studies at Srivijaya', 671, 'The Chinese monk stops six months in Srivijaya to learn Sanskrit on the way to Nalanda, and later spends years there copying texts (687-695).',
      src('coedes'), ['religion', 'ideas'], 'expedition', at='place:palembang', end=695, approx=False)
event('event:chola_raid_srivijaya', 'Chola raid on Srivijaya', 1025, 'Rajendra I’s fleet sacks Srivijaya’s ports on Sumatra and the Malay peninsula and captures its king, breaking its hold on the Straits.',
      src('coedes', 'sri'), ['military', 'economy'], 'raid', at='place:palembang', approx=False, destructive=True)
event('event:pamalayu_expedition', 'Pamalayu expedition', 1275, 'Kertanegara of Singhasari sends a Javanese expedition to Malayu (Jambi), a sign that Srivijaya’s power has passed to Java.',
      src('coedes'), ['military', 'order'], 'expedition', at=(-1.6, 103.6), conf='approximate', approx=False)

# ---- Khmer
place('place:angkor', 'Angkor', 13.412, 103.867, 802, 1431, 'Capital of the Khmer Empire north of the Tonle Sap, a low-density city of temples, reservoirs and canals spread over 1,000 km².',
      'The largest pre-industrial urban complex known; its water network is the classic case of a city undone by climate swings.', src('coe'))
event('event:angkor_wat_begun', 'Angkor Wat begun', 1113, 'Suryavarman II starts the temple-mausoleum dedicated to Vishnu; work goes on for about 35 years.',
      src('coe'), ['art', 'religion'], 'founding', at='place:angkor_wat', end=1150)
event('event:bayon_built', 'Bayon built at Angkor Thom', 1190, 'Jayavarman VII, the Buddhist king who retook Angkor from the Cham, builds the Bayon with its many stone faces at the heart of his new walled city.',
      src('coe'), ['art', 'religion'], 'founding', at=(13.4413, 103.8587), end=1218)
event('event:zhou_daguan_angkor', 'Zhou Daguan at Angkor', 1296, 'A Yuan envoy spends a year in Angkor and writes the only eyewitness account of daily life in the Khmer capital.',
      src('zhou', 'coe'), ['people', 'economy'], 'expedition', at='place:angkor', end=1297, approx=False)

# ---- Cahokia
place('place:cahokia', 'Cahokia', 38.655, -90.062, 1050, 1350, 'The largest city north of Mexico before 1800, around Monks Mound in the Mississippi floodplain opposite St. Louis.',
      'It shows a planned city with tens of thousands of people under a Mississippian chiefdom, then a near-total abandonment.', src('cah'))
event('event:monks_mound_begun', 'Monks Mound begun', 950, 'The first stages of the largest earthen mound in the Americas (30 m high) go up at Cahokia.',
      src('cah'), ['art'], 'founding', at=(38.6607, -90.062), end=1200)
event('event:cahokia_palisade', 'Cahokia’s palisade built', 1175, 'A wooden stockade with bastions, rebuilt four times, encloses the central precinct: a sign of rising conflict.',
      src('cah'), ['military', 'order'], 'founding', at='place:cahokia')
event('event:cahokia_abandoned', 'Cahokia abandoned', 1350, 'The city has emptied; floods, drought, soil exhaustion and political breakdown are all proposed.',
      src('cah'), ['order'], 'collapse', at='place:cahokia')

# ---- Tiwanaku
place('place:tiwanaku', 'Tiwanaku', -16.555, -68.673, 200, 1000, 'Ceremonial city near Lake Titicaca at 3,850 m, capital of a state whose influence reached the Pacific coast and the Bolivian lowlands.',
      'Raised-field farming around the lake fed it; a long drought after about 1000 is the usual explanation for its end.', src('tiw', 'kolata'))
event('event:akapana_built', 'Akapana platform built at Tiwanaku', 600, 'The great terraced platform-mound with its sunken court is raised at the heart of the city.',
      src('tiw'), ['art', 'religion'], 'founding', at=(-16.556, -68.6728), end=700)
event('event:tiwanaku_collapse', 'Tiwanaku state collapses', 1000, 'Building stops, the raised fields are abandoned and the colonies break away during a long dry period.',
      src('kolata', 'tiw'), ['order'], 'collapse', at='place:tiwanaku', end=1100)

# ---- Kanem-Bornu
event('event:hummay_converts', 'Mai Hummay of Kanem embraces Islam', 1085, 'The Girgam chronicle of the Sayfawa dynasty dates the ruler’s conversion to the late eleventh century.',
      src('kanem', 'levtzion'), ['religion', 'law'], 'founding', at=(14.1, 15.3), conf='approximate')
event('event:dunama_dabbalemi', 'Kanem at its height under Dunama Dabbalemi', 1221, 'Kanem expands north to the Fezzan and keeps a hostel for its pilgrims in Cairo; the ruler is said to have opened the sacred mune.',
      src('kanem', 'unesco4'), ['law', 'religion'], 'founding', at=(14.1, 15.3), end=1259, conf='approximate')
event('event:sayfawa_move_to_bornu', 'Sayfawa court moves west of Lake Chad to Bornu', 1380, 'Driven out of Kanem by the Bulala, the dynasty re-founds itself in Bornu.',
      src('unesco4', 'kanem'), ['order', 'population'], 'migration', at=(13.0, 11.6), end=1390, conf='approximate')
event('event:idris_alooma', 'Idris Alooma rules Bornu', 1564, 'The mai buys Ottoman muskets, campaigns against the Bulala and the Hausa, and is described by his imam Ibn Furtu.',
      src('kanem', 'unesco4'), ['military', 'law'], 'founding', at=(13.0, 11.6), end=1596, conf='approximate')

for r in R:
    if 'lat' in r and isinstance(r['lat'], (list, tuple)):
        raise SystemExit('bad lat ' + r['id'])
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'curated.jsonl')
with open(out, 'w', encoding='utf-8') as f:
    for r in R:
        f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
print(out, len(R))
