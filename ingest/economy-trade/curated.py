# Usage: python3 ingest/economy-trade/curated.py
# Writes the hand-curated economy-trade records: the trade-hub relays, major trade routes and
# major migrations, plus stub places and groups they need, and their route lines as GeoJSON.
# Every claim here is model-written from standard works, so every record is status "draft"
# until the judge checks it against the cited source.
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'economy-trade')

# ---- Places: id slug -> (name, lat, lon, subtype). Slugs match the Living Atlas ids where they exist.
PLACES = {
    'dilmun': ('Dilmun (Qal\'at al-Bahrain)', 26.233, 50.520, 'city'),
    'ur': ('Ur', 30.962, 46.103, 'city'),
    'ugarit': ('Ugarit', 35.602, 35.782, 'city'),
    'tyre': ('Tyre', 33.271, 35.196, 'city'),
    'carthage': ('Carthage', 36.853, 10.323, 'city'),
    'alexandria': ('Alexandria', 31.200, 29.918, 'city'),
    'istanbul': ('Constantinople', 41.008, 28.978, 'city'),
    'baghdad': ('Baghdad', 33.315, 44.366, 'city'),
    'venice': ('Venice', 45.438, 12.335, 'city'),
    'genoa': ('Genoa', 44.405, 8.946, 'city'),
    'bruges': ('Bruges', 51.209, 3.224, 'city'),
    'antwerp': ('Antwerp', 51.219, 4.402, 'city'),
    'amsterdam': ('Amsterdam', 52.370, 4.895, 'city'),
    'london': ('London', 51.507, -0.128, 'city'),
    'new_york': ('New York', 40.713, -74.006, 'city'),
    'lothal': ('Lothal', 22.522, 72.249, 'site'),
    'muziris': ('Muziris (Pattanam)', 10.155, 76.207, 'site'),
    'oc_eo': ('Oc Eo', 10.250, 105.150, 'site'),
    'palembang': ('Palembang (Srivijaya)', -2.990, 104.756, 'city'),
    'guangzhou': ('Guangzhou (Canton)', 23.129, 113.264, 'city'),
    'quanzhou': ('Quanzhou (Zaitun)', 24.874, 118.676, 'city'),
    'calicut': ('Calicut (Kozhikode)', 11.258, 75.780, 'city'),
    'malacca': ('Malacca', 2.195, 102.249, 'city'),
    'manila': ('Manila', 14.599, 120.984, 'city'),
    'shanghai': ('Shanghai', 31.230, 121.474, 'city'),
    'singapore': ('Singapore', 1.290, 103.852, 'city'),
    'hong_kong': ('Hong Kong', 22.302, 114.177, 'city'),
    # route stops
    'xian': ('Chang\'an (Xi\'an)', 34.341, 108.940, 'city'),
    'dunhuang': ('Dunhuang', 40.142, 94.662, 'city'),
    'kashgar': ('Kashgar', 39.470, 75.990, 'city'),
    'samarkand': ('Samarkand', 39.654, 66.976, 'city'),
    'merv': ('Merv', 37.663, 62.190, 'city'),
    'ctesiphon': ('Ctesiphon', 33.094, 44.581, 'city'),
    'antioch': ('Antioch', 36.202, 36.160, 'city'),
    'aden': ('Aden', 12.786, 45.019, 'city'),
    'qana': ('Qana (Bir Ali)', 14.005, 48.333, 'site'),
    'petra': ('Petra', 30.329, 35.444, 'city'),
    'gaza': ('Gaza', 31.502, 34.467, 'city'),
    'berenice': ('Berenice Troglodytica', 23.910, 35.473, 'site'),
    'kilwa': ('Kilwa Kisiwani', -8.957, 39.512, 'city'),
    'mombasa': ('Mombasa', -4.043, 39.668, 'city'),
    'hormuz': ('Hormuz', 27.064, 56.459, 'city'),
    'timbuktu': ('Timbuktu', 16.766, -3.003, 'city'),
    'sijilmasa': ('Sijilmasa', 31.282, -4.268, 'site'),
    'taghaza': ('Taghaza', 23.600, -5.000, 'site'),
    'fez': ('Fez', 34.033, -5.000, 'city'),
    'gao': ('Gao', 16.272, -0.044, 'city'),
    'lubeck': ('Lubeck', 53.866, 10.686, 'city'),
    'novgorod': ('Novgorod', 58.522, 31.270, 'city'),
    'bergen': ('Bergen', 60.393, 5.324, 'city'),
    'visby': ('Visby', 57.639, 18.296, 'city'),
    'kyiv': ('Kyiv', 50.450, 30.523, 'city'),
    'acapulco': ('Acapulco', 16.853, -99.823, 'city'),
    'mexico_city': ('Mexico City', 19.433, -99.133, 'city'),
    'veracruz': ('Veracruz', 19.173, -96.134, 'city'),
    'seville': ('Seville', 37.389, -5.984, 'city'),
    'potosi': ('Potosi', -19.589, -65.753, 'city'),
    'lisbon': ('Lisbon', 38.722, -9.139, 'city'),
    'cape_town': ('Cape of Good Hope', -34.357, 18.474, 'region'),
    'batavia': ('Batavia (Jakarta)', -6.135, 106.813, 'city'),
    'goa': ('Goa', 15.499, 73.828, 'city'),
    'elmina': ('Elmina', 5.083, -1.350, 'city'),
    'luanda': ('Luanda', -8.839, 13.289, 'city'),
    'salvador': ('Salvador da Bahia', -12.977, -38.501, 'city'),
    'kingston': ('Kingston, Jamaica', 17.971, -76.793, 'city'),
    'liverpool': ('Liverpool', 53.408, -2.991, 'city'),
    'aquileia': ('Aquileia', 45.769, 13.367, 'site'),
    'gdansk': ('Gdansk', 54.352, 18.646, 'city'),
    'carnuntum': ('Carnuntum', 48.113, 16.863, 'site'),
    'lhasa': ('Lhasa', 29.652, 91.172, 'city'),
    'kangding': ('Dartsedo (Kangding)', 30.050, 101.960, 'city'),
    'yaan': ('Ya\'an', 29.981, 103.013, 'city'),
    'sardis': ('Sardis', 38.488, 28.040, 'city'),
    'susa': ('Susa', 32.189, 48.258, 'city'),
    'nineveh': ('Nineveh', 36.359, 43.153, 'city'),
    # migration regions
    'region_east_africa': ('East African Rift', 4.0, 36.0, 'region'),
    'region_arabia': ('Southern Arabia', 15.0, 46.0, 'region'),
    'region_south_asia': ('South Asia', 22.0, 79.0, 'region'),
    'region_sahul': ('Sahul (Australia and New Guinea)', -22.0, 134.0, 'region'),
    'region_europe': ('Europe', 48.0, 12.0, 'region'),
    'region_east_asia': ('East Asia', 35.0, 110.0, 'region'),
    'region_beringia': ('Beringia', 65.5, -168.0, 'region'),
    'region_north_america': ('North America', 40.0, -100.0, 'region'),
    'region_south_america': ('South America', -15.0, -60.0, 'region'),
    'region_monte_verde': ('Monte Verde', -41.5, -73.2, 'site'),
    'region_taiwan': ('Taiwan', 23.7, 121.0, 'region'),
    'region_philippines': ('Philippines', 12.0, 122.0, 'region'),
    'region_borneo': ('Borneo', 0.5, 114.0, 'region'),
    'region_madagascar': ('Madagascar', -19.0, 46.7, 'region'),
    'region_bismarck': ('Bismarck Archipelago', -4.0, 151.0, 'region'),
    'region_samoa': ('Samoa and Tonga', -14.0, -172.0, 'region'),
    'region_hawaii': ('Hawaii', 20.8, -156.3, 'region'),
    'region_rapa_nui': ('Rapa Nui (Easter Island)', -27.1, -109.4, 'region'),
    'region_aotearoa': ('Aotearoa (New Zealand)', -41.0, 174.0, 'region'),
    'region_bantu_homeland': ('Nigeria-Cameroon borderlands', 6.0, 10.5, 'region'),
    'region_great_lakes': ('African Great Lakes', -2.0, 31.0, 'region'),
    'region_congo': ('Congo rainforest', -2.0, 21.0, 'region'),
    'region_southern_africa': ('Southern Africa', -26.0, 29.0, 'region'),
    'region_pontic_steppe': ('Pontic-Caspian steppe', 48.0, 42.0, 'region'),
    'region_central_europe': ('Central Europe', 51.0, 14.0, 'region'),
    'region_punjab': ('Punjab', 31.0, 74.0, 'region'),
    'region_scandinavia': ('Scandinavia', 60.0, 15.0, 'region'),
    'region_iberia': ('Iberia', 40.0, -4.0, 'region'),
    'region_north_africa': ('North Africa', 34.0, 9.0, 'region'),
    'region_italy': ('Italy', 43.0, 12.0, 'region'),
    'region_britain': ('Britain', 53.0, -1.5, 'region'),
    'region_iceland': ('Iceland', 64.9, -18.6, 'region'),
    'region_greenland': ('Greenland (Eastern Settlement)', 61.0, -45.5, 'region'),
    'region_vinland': ('L\'Anse aux Meadows', 51.59, -55.53, 'site'),
    'region_carpathian': ('Carpathian Basin', 47.2, 19.5, 'region'),
    'region_balkans': ('Balkans', 43.0, 21.0, 'region'),
    'region_pripyat': ('Pripyat marshes', 51.8, 27.0, 'region'),
    'region_baltic': ('Southern Baltic coast', 54.0, 18.0, 'region'),
    'region_mongolia': ('Mongolian plateau', 47.5, 105.0, 'region'),
    'region_central_asia': ('Central Asia', 41.0, 64.0, 'region'),
    'region_anatolia': ('Anatolia', 39.0, 33.0, 'region'),
    'region_west_central_africa': ('West Central Africa', -8.0, 14.0, 'region'),
    'region_bight_of_benin': ('Bight of Benin', 6.3, 2.4, 'region'),
    'region_brazil': ('Brazil', -12.0, -42.0, 'region'),
    'region_caribbean': ('Caribbean', 18.0, -72.0, 'region'),
    'region_us_south': ('American South', 32.5, -88.0, 'region'),
    'region_us_north': ('Northern and Western US cities', 41.9, -87.6, 'region'),
    'region_ireland': ('Ireland', 53.4, -8.0, 'region'),
    'region_southern_china': ('Southern China (Fujian, Guangdong)', 24.0, 115.0, 'region'),
    'region_southeast_asia': ('Southeast Asia', 5.0, 105.0, 'region'),
    'region_north_china': ('North China Plain', 36.0, 116.0, 'region'),
    'region_manchuria': ('Manchuria', 45.0, 126.0, 'region'),
    'region_india_south': ('South India and Bengal', 15.0, 80.0, 'region'),
    'region_west_punjab': ('West Punjab and Sindh', 30.5, 71.0, 'region'),
    'region_east_punjab': ('East Punjab and Delhi', 30.0, 76.5, 'region'),
    'region_bengal_east': ('East Bengal', 23.7, 90.4, 'region'),
    'region_bengal_west': ('West Bengal', 22.9, 88.0, 'region'),
}

# Common sources, cited by short key.
SRC = {
    'beaujard': {'cite': 'Philippe Beaujard, The Worlds of the Indian Ocean: A Global History (Cambridge UP, 2019)'},
    'abulughod': {'cite': 'Janet Abu-Lughod, Before European Hegemony: The World System A.D. 1250-1350 (Oxford UP, 1989)'},
    'braudel': {'cite': 'Fernand Braudel, Civilization and Capitalism, 15th-18th Century, vol. 3: The Perspective of the World (1979)'},
    'arrighi': {'cite': 'Giovanni Arrighi, The Long Twentieth Century (Verso, 1994)'},
    'abulafia': {'cite': 'David Abulafia, The Great Sea: A Human History of the Mediterranean (2011)'},
    'frankopan': {'cite': 'Peter Frankopan, The Silk Roads: A New History of the World (2015)'},
    'hansen': {'cite': 'Valerie Hansen, The Silk Road: A New History (Oxford UP, 2012)'},
    'crawford': {'cite': 'Harriet Crawford, Dilmun and its Gulf Neighbours (Cambridge UP, 1998)'},
    'casson': {'cite': 'Lionel Casson, The Periplus Maris Erythraei (Princeton UP, 1989)'},
    'chaudhuri': {'cite': 'K. N. Chaudhuri, Trade and Civilisation in the Indian Ocean (Cambridge UP, 1985)'},
    'reid': {'cite': 'Anthony Reid, Southeast Asia in the Age of Commerce, 1450-1680 (Yale UP, 1988-93)'},
    'flynn': {'cite': 'Dennis Flynn and Arturo Giraldez, "Born with a Silver Spoon: The Origin of World Trade in 1571", Journal of World History 6(2), 1995'},
    'levine': {'cite': 'Marc Levinson, The Box (Princeton UP, 2006)'},
    'dollinger': {'cite': 'Philippe Dollinger, The German Hansa (1970)'},
    'austen': {'cite': 'Ralph Austen, Trans-Saharan Africa in World History (Oxford UP, 2010)'},
    'slavevoyages': {'cite': 'Trans-Atlantic Slave Trade Database, SlaveVoyages (estimates page)', 'url': 'https://www.slavevoyages.org/assessment/estimates'},
    'mckeown': {'cite': 'Adam McKeown, "Global Migration, 1846-1940", Journal of World History 15(2), 2004, pp. 155-189'},
    'hatton': {'cite': 'Timothy Hatton and Jeffrey Williamson, The Age of Mass Migration (Oxford UP, 1998)'},
    'reich': {'cite': 'David Reich, Who We Are and How We Got Here (2018)'},
    'anthony': {'cite': 'David Anthony, The Horse, the Wheel, and Language (Princeton UP, 2007)'},
    'bellwood': {'cite': 'Peter Bellwood, First Migrants: Ancient Migration in Global Perspective (2013)'},
    'kirch': {'cite': 'Patrick Kirch, On the Road of the Winds (Univ. of California Press, 2017 ed.)'},
    'wilmshurst': {'cite': 'Janet Wilmshurst et al., "High-precision radiocarbon dating shows recent and rapid initial human colonization of East Polynesia", PNAS 108(5), 2011'},
    'grollemund': {'cite': 'Rebecca Grollemund et al., "Bantu expansion shows that habitat alters the route and pace of human dispersals", PNAS 112(43), 2015'},
    'halsall': {'cite': 'Guy Halsall, Barbarian Migrations and the Roman West, 376-568 (Cambridge UP, 2007)'},
    'barford': {'cite': 'Paul Barford, The Early Slavs (2001)'},
    'brink': {'cite': 'Stefan Brink and Neil Price (eds), The Viking World (Routledge, 2008)'},
    'peacock': {'cite': 'A. C. S. Peacock, The Great Seljuk Empire (Edinburgh UP, 2015)'},
    'golden': {'cite': 'Peter Golden, Central Asia in World History (Oxford UP, 2011)'},
    'wilkerson': {'cite': 'Isabel Wilkerson, The Warmth of Other Suns (2010)'},
    'gregory': {'cite': 'James Gregory, The Southern Diaspora (UNC Press, 2005)'},
    'kinealy': {'cite': 'Christine Kinealy, This Great Calamity: The Irish Famine 1845-52 (1994)'},
    'bharadwaj': {'cite': 'Prashant Bharadwaj, Asim Khwaja and Atif Mian, "The Big March: Migratory Flows after the Partition of India", Economic and Political Weekly 43(35), 2008'},
    'goebel': {'cite': 'Ted Goebel, Michael Waters and Dennis O\'Rourke, "The Late Pleistocene Dispersal of Modern Humans in the Americas", Science 319, 2008'},
    'clarkson': {'cite': 'Chris Clarkson et al., "Human occupation of northern Australia by 65,000 years ago", Nature 547, 2017'},
    'gosden': {'cite': 'Jared Diamond and Peter Bellwood, "Farmers and Their Languages: The First Expansions", Science 300, 2003'},
    'forbes': {'cite': 'Andrew Forbes and David Henley, China\'s Ancient Tea Horse Road (2011)'},
    'shaffer': {'cite': 'Lynda Shaffer, Maritime Southeast Asia to 1500 (1996)'},
    'kennedy': {'cite': 'Hugh Kennedy, When Baghdad Ruled the Muslim World (2005)'},
    'israel': {'cite': 'Jonathan Israel, Dutch Primacy in World Trade, 1585-1740 (Oxford UP, 1989)'},
    'lane': {'cite': 'Frederic Lane, Venice: A Maritime Republic (Johns Hopkins UP, 1973)'},
    'murray': {'cite': 'James Murray, Bruges, Cradle of Capitalism, 1280-1390 (Cambridge UP, 2005)'},
    'vandewee': {'cite': 'Herman Van der Wee, The Growth of the Antwerp Market and the European Economy (1963)'},
    'heichelheim': {'cite': 'Marc Van De Mieroop, A History of the Ancient Near East (3rd ed., 2016)'},
    'aubet': {'cite': 'Maria Eugenia Aubet, The Phoenicians and the West (2nd ed., Cambridge UP, 2001)'},
    'miles': {'cite': 'Richard Miles, Carthage Must Be Destroyed (2010)'},
    'harris': {'cite': 'W. V. Harris and Giovanni Ruffini (eds), Ancient Alexandria between Egypt and Greece (2004)'},
    'laiou': {'cite': 'Angeliki Laiou and Cecile Morrisson, The Byzantine Economy (Cambridge UP, 2007)'},
    'possehl': {'cite': 'Gregory Possehl, The Indus Civilization: A Contemporary Perspective (2002)'},
    'cherian': {'cite': 'P. J. Cherian, Pattanam excavation reports, Kerala Council for Historical Research (2007-2015)'},
    'manguin': {'cite': 'Pierre-Yves Manguin, "The Archaeology of Early Maritime Polities of Southeast Asia", in Southeast Asia from Prehistory to History (2004)'},
    'wolters': {'cite': 'O. W. Wolters, Early Indonesian Commerce (Cornell UP, 1967)'},
    'clark': {'cite': 'Hugh Clark, Community, Trade, and Networks: Southern Fujian from the 3rd to the 13th Century (Cambridge UP, 1991)'},
    'van_dyke': {'cite': 'Paul Van Dyke, The Canton Trade: Life and Enterprise on the China Coast, 1700-1845 (2005)'},
    'bergere': {'cite': 'Marie-Claire Bergere, Shanghai: China\'s Gateway to Modernity (Stanford UP, 2009)'},
    'turnbull': {'cite': 'C. M. Turnbull, A History of Modern Singapore, 1819-2005 (NUS Press, 2009)'},
    'kynaston': {'cite': 'David Kynaston, The City of London, vol. 1-2 (1994-95)'},
    'cassis': {'cite': 'Youssef Cassis, Capitals of Capital: A History of International Financial Centres, 1780-2005 (Cambridge UP, 2006)'},
    'pearson': {'cite': 'Michael Pearson, The Indian Ocean (Routledge, 2003)'},
    'schurz': {'cite': 'William Lytle Schurz, The Manila Galleon (1939)'},
    'boxer': {'cite': 'C. R. Boxer, The Portuguese Seaborne Empire, 1415-1825 (1969)'},
    'franklin': {'cite': 'Simon Franklin and Jonathan Shepard, The Emergence of Rus, 750-1200 (1996)'},
    'cunliffe': {'cite': 'Barry Cunliffe, By Steppe, Desert, and Ocean (Oxford UP, 2015)'},
    'briant': {'cite': 'Pierre Briant, From Cyrus to Alexander: A History of the Persian Empire (2002)'},
    'herodotus': {'cite': 'Herodotus, Histories 5.52-54 (the Royal Road)'},
}


def S(*keys):
    return [SRC[k] for k in keys]


# ---- The two relays. Each leg: (place slug, start, end, approx, why it led, why it lost the lead, cause, sources)
RELAYS = {
    'west': ('Western trade-hub relay: Dilmun to New York', 'The richest crossroads of the western Old World and then the Atlantic, handed on from city to city for 4,500 years.', [
        ('dilmun', -2200, -1700, True, 'Middleman between Mesopotamia, Magan (Oman copper) and Meluhha (the Indus); Ur\'s merchants bought copper here.', 'Indus trade collapsed and Gulf trade shrank after about 1750 BCE.', 'trade', ('crawford',)),
        ('ugarit', -1450, -1185, True, 'Port of the Late Bronze Age system linking Egypt, the Hittites, Cyprus copper and the Aegean; its archives list merchants from all of them.', 'Destroyed around 1185 BCE in the Late Bronze Age collapse.', 'war', ('heichelheim',)),
        ('tyre', -1000, -332, True, 'Phoenician hub for purple dye, cedar and silver, founding colonies from Cyprus to Gades.', 'Taken by Alexander after a seven-month siege in 332 BCE.', 'war', ('aubet',)),
        ('carthage', -550, -146, True, 'Tyre\'s colony became the hub of the western Mediterranean, controlling Spanish silver and Sardinian grain.', 'Razed by Rome in 146 BCE at the end of the Third Punic War.', 'war', ('miles', 'abulafia')),
        ('alexandria', -300, 400, True, 'Egypt\'s grain and the Red Sea route to India met the Mediterranean here; the Periplus describes the India trade it fed.', 'Lost the lead as the western empire broke up and Constantinople grew.', 'capital', ('harris', 'casson')),
        ('istanbul', 400, 1204, True, 'Capital on the Bosporus between the Black Sea and the Mediterranean and between Europe and Asia.', 'Sacked by the Fourth Crusade in 1204, and its trade passed to Venice.', 'war', ('laiou',)),
        ('baghdad', 800, 1000, True, 'Abbasid capital where Gulf shipping and Silk Road caravans met; the hub of the Islamic world economy.', 'Abbasid decline moved the trade toward Fatimid Cairo and the Red Sea.', 'capital', ('kennedy',)),
        ('venice', 1204, 1500, True, 'Held the spice trade from Alexandria and the Levant into Europe through its state-run galley convoys.', 'Da Gama\'s sea route to India (1498) moved the pepper trade to the Atlantic.', 'trade', ('lane', 'abulughod')),
        ('bruges', 1280, 1490, True, 'Northern counterpart to Venice, where Italian galleys met the Hansa; an early home of the bourse.', 'The Zwin channel silted up and trade moved to Antwerp.', 'silt', ('murray',)),
        ('antwerp', 1500, 1585, True, 'Portuguese spices, south German silver and English cloth met here; the centre of the world economy in the early 1500s.', 'Spanish sack (1576), siege (1585) and the Dutch closing of the Scheldt.', 'war', ('vandewee', 'braudel')),
        ('amsterdam', 1585, 1795, True, 'The VOC (1602), the Bank of Amsterdam (1609) and the Baltic grain trade made it the world\'s warehouse and money market.', 'Lost out to London over the 1700s and fell to French invasion in 1795.', 'war', ('israel', 'braudel')),
        ('london', 1795, 1914, True, 'Empire, the industrial revolution and sterling made the City the world\'s banker and its docks the busiest port.', 'The First World War turned Britain into a debtor and moved the money centre to New York.', 'war', ('kynaston', 'cassis')),
        ('new_york', 1914, None, True, 'Wall Street financed the Allies in 1914 to 1918 and the dollar replaced sterling; the container was invented for its harbour in 1956.', None, None, ('cassis', 'arrighi', 'levine')),
    ]),
    'east': ('Eastern trade-hub relay: Lothal to Shanghai', 'The same baton race on the monsoon seas, from the Indus dockyard to the world\'s busiest container port.', [
        ('lothal', -2400, -1900, True, 'Harappan port with a brick basin often read as a dockyard, trading beads and cotton toward the Gulf.', 'The Indus cities declined after about 1900 BCE.', 'climate', ('possehl',)),
        ('muziris', -100, 400, True, 'Malabar pepper port; the Muziris papyrus records one Roman cargo worth enough to buy a large estate.', 'Its harbour silted and Roman demand faded.', 'silt', ('casson', 'cherian')),
        ('oc_eo', 100, 600, True, 'Funan\'s port where Indian and Chinese shipping met; Roman coins and Han mirrors have been dug up there.', 'Ships began sailing straight through the Malacca Strait instead of crossing the isthmus.', 'trade', ('manguin',)),
        ('palembang', 680, 1025, True, 'Capital of Srivijaya, which controlled the Malacca and Sunda straits between India and China.', 'Raided by the Chola navy in 1025.', 'war', ('wolters', 'shaffer')),
        ('guangzhou', 700, 879, True, 'Tang China\'s main foreign port, home to large Arab and Persian merchant communities.', 'Huang Chao\'s rebels massacred its foreign merchants in 878 or 879.', 'war', ('clark',)),
        ('quanzhou', 1000, 1400, True, 'Zaitun of Marco Polo and Ibn Battuta, the great port of Song and Yuan China, with a maritime trade office from 1087.', 'Ming bans on private sea trade (from 1371) and the silting of its river.', 'trade', ('clark', 'abulughod')),
        ('calicut', 1300, 1500, True, 'Malabar pepper hub open to all traders under the Zamorin; Zheng He and Vasco da Gama both landed here.', 'Portuguese bombardment and blockade from 1500.', 'war', ('chaudhuri', 'pearson')),
        ('malacca', 1400, 1511, True, 'The sultanate at the strait, where Tome Pires said whoever was lord of Malacca had his hand on Venice\'s throat.', 'Taken by the Portuguese in 1511, and its traders scattered.', 'war', ('reid',)),
        ('manila', 1571, 1815, True, 'Where Mexican and Peruvian silver met Chinese silk and porcelain on the galleons, joining the world economy into one.', 'The last galleon sailed in 1815.', 'trade', ('flynn', 'schurz')),
        ('guangzhou', 1757, 1842, True, 'Under the Canton System the only Chinese port open to Western ships; tea for silver, then for opium.', 'The Treaty of Nanking (1842) opened other ports and ceded Hong Kong.', 'war', ('van_dyke',)),
        ('singapore', 1819, None, True, 'Raffles\' free port at the Malacca Strait, now one of the busiest transshipment ports in the world.', None, None, ('turnbull',)),
        ('shanghai', 1842, 1949, True, 'Treaty port on the Yangtze mouth that became Asia\'s biggest financial centre by the 1930s.', 'Foreign firms left after the 1949 revolution.', 'capital', ('bergere',)),
        ('hong_kong', 1949, 1990, True, 'Took Shanghai\'s capital and refugees after 1949 and became the gateway to China during the closed decades.', 'Mainland ports took the cargo once China reopened.', 'trade', ('bergere',)),
        ('shanghai', 2010, None, True, 'Busiest container port in the world every year since 2010.', None, None, ('levine',)),
    ]),
}

# Which earlier hub each hub took over from, where it is not simply the previous one in the list.
# None means it ran alongside the others rather than replacing one.
AFTER = {('west', 'baghdad'): None, ('west', 'venice'): 'istanbul', ('west', 'bruges'): None, ('west', 'antwerp'): 'bruges',
         ('east', 'guangzhou', 1757): None, ('east', 'singapore'): None, ('east', 'shanghai', 1842): 'guangzhou'}

# ---- Trade routes: (slug, name, start, end, goods, stops, why, sources)
ROUTES = [
    ('silk_road', 'Silk Roads', -130, 1450, ['silk', 'horses', 'silver', 'glass', 'paper', 'spices'],
     ['xian', 'dunhuang', 'kashgar', 'samarkand', 'merv', 'ctesiphon', 'antioch'],
     'Overland chains of caravan cities between China and the Mediterranean; few merchants went the whole way.', ('hansen', 'frankopan')),
    ('royal_road', 'Persian Royal Road', -500, -330, ['tribute', 'messages'],
     ['sardis', 'nineveh', 'susa'],
     'Herodotus says royal couriers covered its 2,500 km in about a week.', ('herodotus', 'briant')),
    ('incense_route', 'Incense Route', -700, 300, ['frankincense', 'myrrh', 'spices'],
     ['qana', 'petra', 'gaza'],
     'Camel caravans carried South Arabian incense north to the Mediterranean; Petra grew rich taxing it.', ('cunliffe',)),
    ('amber_road', 'Amber Road', -500, 400, ['amber', 'furs', 'slaves'],
     ['gdansk', 'carnuntum', 'aquileia'],
     'Baltic amber went south to Roman workshops at Aquileia.', ('cunliffe',)),
    ('monsoon_route', 'Indian Ocean monsoon route', -100, 1500, ['pepper', 'textiles', 'gold', 'ivory', 'horses'],
     ['berenice', 'aden', 'muziris', 'calicut', 'malacca', 'quanzhou'],
     'Ships rode the summer monsoon east and the winter monsoon home, so the timing of trade followed the winds.', ('casson', 'chaudhuri', 'beaujard')),
    ('swahili_coast', 'Swahili coast and Gulf route', 800, 1500, ['gold', 'ivory', 'slaves', 'porcelain', 'beads'],
     ['kilwa', 'mombasa', 'aden', 'hormuz'],
     'Zimbabwe gold shipped from Kilwa paid for Persian and Chinese goods.', ('pearson', 'beaujard')),
    ('trans_saharan', 'Trans-Saharan gold and salt route', 700, 1600, ['gold', 'salt', 'slaves', 'books'],
     ['fez', 'sijilmasa', 'taghaza', 'timbuktu', 'gao'],
     'Camel caravans swapped Saharan salt and North African goods for West African gold.', ('austen',)),
    ('rus_route', 'Route from the Varangians to the Greeks', 800, 1100, ['furs', 'slaves', 'silver', 'silk'],
     ['novgorod', 'kyiv', 'istanbul'],
     'Norse traders rowed down the Russian rivers to Constantinople.', ('franklin',)),
    ('hansa', 'Hanseatic League routes', 1250, 1600, ['grain', 'timber', 'fish', 'furs', 'cloth'],
     ['bruges', 'london', 'bergen', 'lubeck', 'visby', 'novgorod'],
     'A league of German merchant towns ran the North Sea and Baltic trade.', ('dollinger',)),
    ('tea_horse_road', 'Tea Horse Road', 700, 1950, ['tea', 'horses'],
     ['yaan', 'kangding', 'lhasa'],
     'Porters and mule trains carried Sichuan tea to Tibet in exchange for horses.', ('forbes',)),
    ('cape_route', 'Cape Route (Carreira da India)', 1498, 1869, ['pepper', 'cloves', 'textiles', 'silver'],
     ['lisbon', 'cape_town', 'goa', 'malacca', 'batavia'],
     'Da Gama\'s route round Africa took spices off the Venice monopoly until the Suez Canal opened.', ('boxer', 'israel')),
    ('manila_galleon', 'Manila galleon', 1565, 1815, ['silver', 'silk', 'porcelain'],
     ['manila', 'acapulco', 'mexico_city', 'veracruz', 'seville'],
     'Spanish silver from Potosi and Mexico crossed the Pacific to buy Chinese goods.', ('flynn', 'schurz')),
    ('triangular_trade', 'Atlantic triangular trade', 1640, 1807, ['enslaved people', 'sugar', 'cotton', 'textiles', 'guns'],
     ['liverpool', 'elmina', 'kingston', 'liverpool'],
     'British goods to West Africa, enslaved Africans to the Caribbean, sugar and cotton back to Britain.', ('slavevoyages',)),
]

# ---- Migrations: (slug, name, group slug, group name, start, end, approx, people[low,high] or None, forced, stops, why, sources)
MIGRATIONS = [
    ('out_of_africa', 'Out of Africa', 'early_modern_humans', 'Early modern humans', -70000, -50000, True, None, False,
     ['region_east_africa', 'region_arabia', 'region_south_asia', 'region_sahul'],
     'Every population outside Africa descends mainly from a small group that left roughly 50,000 to 70,000 years ago.', ('reich', 'clarkson')),
    ('peopling_europe_asia', 'Spread into Europe and East Asia', 'early_modern_humans', 'Early modern humans', -50000, -40000, True, None, False,
     ['region_arabia', 'region_europe'],
     'Modern humans reached Europe by about 45,000 years ago and met Neanderthals there.', ('reich',)),
    ('peopling_americas', 'Peopling of the Americas', 'first_americans', 'First Americans', -16000, -14500, True, None, False,
     ['region_east_asia', 'region_beringia', 'region_north_america', 'region_monte_verde'],
     'People crossed from Siberia through Beringia and reached southern Chile (Monte Verde) by about 14,500 years ago.', ('goebel',)),
    ('austronesian', 'Austronesian expansion', 'austronesians', 'Austronesian speakers', -3000, 500, True, None, False,
     ['region_taiwan', 'region_philippines', 'region_borneo', 'region_madagascar'],
     'Seafarers from Taiwan spread over half the globe, from Madagascar to Easter Island.', ('bellwood', 'gosden')),
    ('polynesian', 'Polynesian voyaging', 'polynesians', 'Polynesians', -1000, 1300, True, None, False,
     ['region_bismarck', 'region_samoa', 'region_hawaii', 'region_rapa_nui', 'region_aotearoa'],
     'Lapita voyagers reached Samoa by about 800 BCE; East Polynesia, Hawaii and New Zealand were settled quickly between about 1000 and 1300 CE.', ('kirch', 'wilmshurst')),
    ('bantu', 'Bantu expansion', 'bantu_speakers', 'Bantu speakers', -3000, 500, True, None, False,
     ['region_bantu_homeland', 'region_congo', 'region_great_lakes', 'region_southern_africa'],
     'Farmers from the Nigeria-Cameroon borderlands spread Bantu languages over most of sub-Saharan Africa.', ('grollemund', 'gosden')),
    ('yamnaya', 'Steppe migration into Europe', 'yamnaya', 'Yamnaya herders', -3000, -2500, True, None, False,
     ['region_pontic_steppe', 'region_central_europe', 'region_britain'],
     'Ancient DNA shows steppe herders replacing much of Europe\'s ancestry within a few centuries; most scholars link them to Indo-European languages.', ('reich', 'anthony')),
    ('indo_aryan', 'Indo-Aryan migration', 'indo_aryans', 'Indo-Aryan speakers', -2000, -1500, True, None, False,
     ['region_pontic_steppe', 'region_central_asia', 'region_punjab'],
     'Steppe ancestry arrived in South Asia in the second millennium BCE, the likely route of Sanskrit\'s ancestor.', ('reich', 'anthony')),
    ('migration_period', 'Germanic migrations', 'germanic_peoples', 'Germanic peoples (Goths, Vandals, Franks, Lombards)', 376, 568, False, None, False,
     ['region_pontic_steppe', 'region_balkans', 'region_italy', 'region_iberia', 'region_north_africa'],
     'From the Gothic crossing of the Danube in 376 to the Lombard invasion of Italy in 568, these movements remade the western Roman world.', ('halsall',)),
    ('slavic', 'Slavic expansion', 'slavs', 'Slavs', 500, 700, True, None, False,
     ['region_pripyat', 'region_baltic', 'region_balkans'],
     'Slavic speakers spread from eastern Europe to the Baltic, the Elbe and the Balkans in about two centuries.', ('barford',)),
    ('magyar', 'Magyar settlement', 'magyars', 'Magyars', 862, 896, True, None, False,
     ['region_pontic_steppe', 'region_carpathian'],
     'Steppe horsemen settled the Carpathian Basin, founding Hungary.', ('golden',)),
    ('norse', 'Norse expansion', 'norse', 'Norse (Vikings)', 793, 1000, False, None, False,
     ['region_scandinavia', 'region_britain', 'region_iceland', 'region_greenland', 'region_vinland'],
     'Raiders and settlers from Scandinavia reached Iceland (874), Greenland (985) and Newfoundland (about 1000).', ('brink',)),
    ('turkic_anatolia', 'Turkic migration into Anatolia', 'oghuz_turks', 'Oghuz Turks', 1040, 1300, True, None, False,
     ['region_central_asia', 'region_anatolia'],
     'After Manzikert (1071) Turkmen herders moved into Anatolia, turning Byzantine land into Turkey.', ('peacock',)),
    ('mongol', 'Mongol expansion', 'mongols', 'Mongols', 1206, 1300, False, None, False,
     ['region_mongolia', 'region_central_asia', 'region_pontic_steppe'],
     'The largest contiguous land empire moved armies, artisans and whole peoples across Eurasia.', ('golden',)),
    ('atlantic_slave_trade', 'Transatlantic slave trade', 'enslaved_africans', 'Enslaved Africans', 1501, 1866, False, [10700000, 12500000], True,
     ['region_west_central_africa', 'region_bight_of_benin', 'region_brazil', 'region_caribbean', 'region_us_south'],
     'About 12.5 million people were forced onto ships and about 10.7 million survived the crossing; the largest forced migration in history.', ('slavevoyages',)),
    ('irish_famine', 'Irish famine emigration', 'irish', 'Irish emigrants', 1845, 1855, False, [1500000, 2100000], False,
     ['region_ireland', 'liverpool', 'new_york'],
     'The potato famine killed about a million people and drove one to two million to emigrate within a decade.', ('kinealy',)),
    ('european_mass_migration', 'European mass migration', 'european_emigrants', 'European emigrants', 1846, 1940, False, [55000000, 58000000], False,
     ['region_europe', 'new_york', 'region_south_america'],
     'Steamships and cheap land drew tens of millions of Europeans to the Americas and Australasia.', ('mckeown', 'hatton')),
    ('asian_mass_migration', 'Indian and southern Chinese migration', 'asian_emigrants', 'Indian and southern Chinese emigrants', 1846, 1940, False, [48000000, 52000000], False,
     ['region_southern_china', 'region_india_south', 'region_southeast_asia'],
     'A second mass migration, of similar size to the Atlantic one, went from India and southern China to Southeast Asia and the Indian Ocean rim.', ('mckeown',)),
    ('north_asian_migration', 'Migration to Manchuria and Siberia', 'north_asian_migrants', 'Chinese, Russian and Korean migrants', 1846, 1940, False, [46000000, 51000000], False,
     ['region_north_china', 'region_manchuria'],
     'The third great migration of the era, mostly northern Chinese moving to Manchuria, often overlooked.', ('mckeown',)),
    ('great_migration_us', 'Great Migration (United States)', 'african_americans', 'African Americans', 1910, 1970, False, [6000000, 6000000], False,
     ['region_us_south', 'region_us_north'],
     'About six million Black Southerners moved to northern and western cities, escaping Jim Crow.', ('wilkerson', 'gregory')),
    ('partition_india', 'Partition of India', 'partition_refugees', 'Partition refugees', 1947, 1951, False, [14500000, 17900000], True,
     ['region_west_punjab', 'region_east_punjab', 'region_bengal_east', 'region_bengal_west'],
     'Census data suggest about 14.5 million people crossed the new borders and millions more went missing.', ('bharadwaj',)),
]

# ---- Second batch (2026-10-24): more routes and migrations.
PLACES.update({
    'bolghar': ('Bolghar', 54.98, 49.06, 'city'), 'itil': ('Itil (Khazar capital, approximate)', 46.4, 48.0, 'site'),
    'rayy': ('Rayy', 35.58, 51.43, 'city'), 'troyes': ('Troyes', 48.30, 4.08, 'city'), 'cornwall': ('Cornwall', 50.30, -5.05, 'region'),
    'marseille': ('Marseille (Massalia)', 43.296, 5.37, 'city'), 'helsingor': ('Helsingor (the Sound)', 56.03, 12.61, 'city'),
    'banda': ('Banda Islands', -4.52, 129.90, 'region'), 'ternate': ('Ternate', 0.79, 127.38, 'city'),
    'moscow': ('Moscow', 55.756, 37.617, 'city'), 'irkutsk': ('Irkutsk', 52.29, 104.28, 'city'), 'vladivostok': ('Vladivostok', 43.12, 131.89, 'city'),
    'port_said': ('Port Said', 31.26, 32.30, 'city'), 'mumbai': ('Bombay (Mumbai)', 18.94, 72.84, 'city'),
    'colon': ('Colon, Panama', 9.36, -79.90, 'city'), 'panama_city': ('Panama City', 8.98, -79.52, 'city'),
    'san_francisco': ('San Francisco', 37.77, -122.42, 'city'), 'york_factory': ('York Factory', 57.00, -92.30, 'site'),
    'kolkata': ('Calcutta (Kolkata)', 22.57, 88.36, 'city'), 'new_orleans': ('New Orleans', 29.95, -90.07, 'city'),
    'manchester': ('Manchester', 53.48, -2.24, 'city'), 'ostia': ('Ostia', 41.75, 12.29, 'site'), 'rome': ('Rome', 41.90, 12.50, 'city'),
    'rotterdam': ('Rotterdam', 51.95, 4.14, 'city'), 'yangzhou': ('Yangzhou', 32.39, 119.42, 'city'), 'hangzhou': ('Hangzhou', 30.27, 120.15, 'city'),
    'kaifeng': ('Kaifeng', 34.80, 114.31, 'city'), 'beijing': ('Beijing', 39.90, 116.40, 'city'), 'luoyang': ('Luoyang', 34.62, 112.45, 'city'),
    'cadiz': ('Gades (Cadiz)', 36.53, -6.29, 'city'), 'thessaloniki': ('Thessaloniki', 40.64, 22.94, 'city'),
    'region_aegean': ('Aegean Greece', 38.0, 23.8, 'region'), 'region_magna_graecia': ('Sicily and southern Italy', 38.0, 15.5, 'region'),
    'region_black_sea': ('Black Sea coast', 44.5, 33.5, 'region'), 'region_north_india': ('Northern India', 28.0, 77.0, 'region'),
    'region_persia': ('Persia', 32.0, 53.0, 'region'), 'region_arabia_hejaz': ('Hejaz', 23.0, 40.0, 'region'),
    'region_egypt': ('Egypt', 27.0, 31.0, 'region'), 'region_maghreb': ('Maghreb', 33.0, 2.0, 'region'),
    'region_yellow_river': ('Yellow River plain', 35.0, 113.0, 'region'), 'region_yangtze_south': ('Yangtze valley and the south', 28.0, 115.0, 'region'),
    'region_pannonia': ('Pannonia', 47.0, 18.5, 'region'), 'region_north_germany': ('Jutland and northern Germany', 54.5, 9.5, 'region'),
    'region_cape': ('Cape Colony', -33.9, 19.0, 'region'), 'region_highveld': ('Highveld (Transvaal and Orange Free State)', -27.0, 27.0, 'region'),
    'region_urals': ('Urals', 58.0, 60.0, 'region'), 'region_siberia': ('Siberia', 60.0, 95.0, 'region'), 'region_okhotsk': ('Okhotsk coast', 59.4, 143.2, 'region'),
    'region_southeast_us': ('Southeastern US (Cherokee, Creek, Choctaw lands)', 34.0, -85.0, 'region'), 'region_indian_territory': ('Indian Territory (Oklahoma)', 35.5, -97.5, 'region'),
    'region_california': ('California goldfields', 38.6, -121.0, 'region'), 'region_eastern_us': ('Eastern United States', 39.5, -77.0, 'region'),
    'region_bihar': ('Bihar and the Ganges plain', 25.6, 85.1, 'region'), 'region_mauritius': ('Mauritius', -20.2, 57.5, 'region'),
    'region_trinidad': ('Trinidad and Guyana', 8.5, -60.5, 'region'), 'region_fiji': ('Fiji', -17.8, 178.0, 'region'),
    'region_japan': ('Japan', 35.0, 136.0, 'region'), 'region_sao_paulo': ('Sao Paulo', -23.55, -46.63, 'region'),
    'region_greece': ('Greece', 39.0, 22.0, 'region'), 'region_east_prussia_silesia': ('East Prussia, Silesia and the Sudetenland', 52.0, 18.0, 'region'),
    'region_germany': ('Occupied Germany', 51.0, 10.0, 'region'), 'region_palestine': ('Palestine', 31.9, 35.0, 'region'),
    'region_jordan_lebanon': ('Jordan, Lebanon and Gaza', 32.0, 36.0, 'region'), 'region_east_pakistan': ('East Pakistan (Bangladesh)', 23.7, 90.4, 'region'),
    'region_india_east': ('West Bengal, Assam and Tripura', 23.5, 89.0, 'region'), 'region_syria': ('Syria', 35.0, 38.5, 'region'),
    'region_turkey': ('Turkey', 39.0, 35.0, 'region'), 'region_china_inland': ('Inland China (Sichuan, Henan, Anhui)', 31.0, 108.0, 'region'),
    'region_china_coast': ('Coastal China (Guangdong, Zhejiang, Jiangsu)', 26.5, 116.5, 'region'), 'region_acadia': ('Acadia (Nova Scotia)', 45.0, -64.0, 'region'),
    'region_louisiana': ('Louisiana', 30.5, -92.0, 'region'), 'region_east_anglia': ('East Anglia', 52.4, 1.0, 'region'),
    'region_new_england': ('New England', 42.4, -71.5, 'region'), 'region_france': ('France', 46.5, 2.5, 'region'),
    'region_netherlands_prussia': ('Netherlands, Prussia, England and the Cape', 52.0, 7.0, 'region'), 'region_anatolia_west': ('Western Anatolia and Pontus', 39.0, 30.0, 'region'),
})
SRC.update({
    'elvin': {'cite': 'Mark Elvin, The Pattern of the Chinese Past (Stanford UP, 1973)'},
    'elvin2004': {'cite': 'Mark Elvin, The Retreat of the Elephants: An Environmental History of China (Yale UP, 2004)'},
    'noonan': {'cite': 'Thomas Noonan, The Islamic World, Russia and the Vikings, 750-900: The Numismatic Evidence (1998)'},
    'edwards': {'cite': 'Jeremy Edwards and Sheilagh Ogilvie, "What lessons for economic development can we draw from the Champagne fairs?", Explorations in Economic History 49(2), 2012'},
    'cunliffe_ocean': {'cite': 'Barry Cunliffe, Facing the Ocean: The Atlantic and Its Peoples (Oxford UP, 2001)'},
    'soundtoll': {'cite': 'Sound Toll Registers Online (Tresoar, Leeuwarden)', 'url': 'https://www.soundtoll.nl/'},
    'marks': {'cite': 'Steven Marks, Road to Power: The Trans-Siberian Railroad and the Colonization of Asian Russia (Cornell UP, 1991)'},
    'huber': {'cite': 'Valeska Huber, Channelling Mobilities: Migration and Globalisation in the Suez Canal Region (Cambridge UP, 2013)'},
    'mccullough': {'cite': 'David McCullough, The Path Between the Seas: The Creation of the Panama Canal (1977)'},
    'innis': {'cite': 'Harold Innis, The Fur Trade in Canada (1930)'},
    'trocki': {'cite': 'Carl Trocki, Opium, Empire and the Global Political Economy (Routledge, 1999)'},
    'beckert': {'cite': 'Sven Beckert, Empire of Cotton: A Global History (2014)'},
    'rickman': {'cite': 'Geoffrey Rickman, The Corn Supply of Ancient Rome (Oxford UP, 1980)'},
    'boardman': {'cite': 'John Boardman, The Greeks Overseas (4th ed., Thames and Hudson, 1999)'},
    'gerber': {'cite': 'Jane Gerber, The Jews of Spain: A History of the Sephardic Experience (1992)'},
    'mendizabal': {'cite': 'Isabel Mendizabal et al., "Reconstructing the Population History of European Romani from Genome-wide Data", Current Biology 22(24), 2012'},
    'kennedy2007': {'cite': 'Hugh Kennedy, The Great Arab Conquests (2007)'},
    'heather': {'cite': 'Peter Heather, The Fall of the Roman Empire: A New History (2005)'},
    'gretzinger': {'cite': 'Joscha Gretzinger et al., "The Anglo-Saxon migration and the formation of the early English gene pool", Nature 610, 2022'},
    'giliomee': {'cite': 'Hermann Giliomee, The Afrikaners: Biography of a People (2003)'},
    'treadgold': {'cite': 'Donald Treadgold, The Great Siberian Migration (Princeton UP, 1957)'},
    'saunt': {'cite': 'Claudio Saunt, Unworthy Republic: The Dispossession of Native Americans and the Road to Indian Territory (2020)'},
    'brands': {'cite': 'H. W. Brands, The Age of Gold: The California Gold Rush and the New American Dream (2002)'},
    'tinker': {'cite': 'Hugh Tinker, A New System of Slavery: The Export of Indian Labour Overseas, 1830-1920 (1974)'},
    'lesser': {'cite': 'Jeffrey Lesser, Negotiating National Identity: Immigrants, Minorities, and the Struggle for Ethnicity in Brazil (Duke UP, 1999)'},
    'hirschon': {'cite': 'Renee Hirschon (ed.), Crossing the Aegean: The 1923 Greek-Turkish Population Exchange (Berghahn, 2003)'},
    'douglas': {'cite': 'R. M. Douglas, Orderly and Humane: The Expulsion of the Germans after the Second World War (Yale UP, 2012)'},
    'morris': {'cite': 'Benny Morris, The Birth of the Palestinian Refugee Problem Revisited (Cambridge UP, 2004)'},
    'raghavan': {'cite': 'Srinath Raghavan, 1971: A Global History of the Creation of Bangladesh (Harvard UP, 2013)'},
    'unhcr': {'cite': 'UNHCR, Global Trends: Forced Displacement in 2023 (2024)', 'url': 'https://www.unhcr.org/global-trends'},
    'nbs': {'cite': 'National Bureau of Statistics of China, Migrant Workers Monitoring Survey Report 2019 (2020)'},
    'faragher': {'cite': 'John Mack Faragher, A Great and Noble Scheme: The Expulsion of the French Acadians (2005)'},
    'anderson': {'cite': 'Virginia DeJohn Anderson, New England\'s Generation: The Great Migration and the Formation of Society and Culture (Cambridge UP, 1991)'},
    'gwynn': {'cite': 'Robin Gwynn, Huguenot Heritage: The History and Contribution of the Huguenots in Britain (1985)'},
    'levinson2': {'cite': 'Marc Levinson, Outside the Box: How Globalization Changed from Moving Stuff to Spreading Ideas (2020)'},
})
ROUTES += [
    ('meluhha', 'Gulf trade with the Indus (Meluhha)', -2500, -1900, ['carnelian', 'copper', 'timber', 'ivory', 'textiles'],
     ['lothal', 'dilmun', 'ur'], 'Mesopotamian tablets name ships from Meluhha docking at Akkad; Dilmun was the middle stop.', ('possehl', 'crawford')),
    ('tin_route', 'Atlantic tin route', -1000, -100, ['tin', 'copper', 'gold'],
     ['cornwall', 'marseille'], 'Bronze needs tin, and Cornish tin reached the Mediterranean by sea and along the French rivers.', ('cunliffe_ocean',)),
    ('roman_grain', 'Roman grain fleet (annona)', -30, 400, ['wheat', 'oil', 'wine'],
     ['alexandria', 'ostia', 'rome'], 'Egyptian wheat fed the city of Rome, a million mouths far beyond what Italy could grow.', ('rickman', 'casson')),
    ('grand_canal', 'Grand Canal', 609, 1855, ['rice', 'grain tax', 'salt'],
     ['hangzhou', 'yangzhou', 'kaifeng', 'luoyang', 'beijing'], 'The Sui joined the rice-growing south to the political north; capitals in the north lived on southern grain.', ('elvin',)),
    ('volga_route', 'Volga trade route', 750, 1050, ['silver dirhams', 'furs', 'slaves', 'amber'],
     ['visby', 'novgorod', 'bolghar', 'itil', 'rayy', 'baghdad'], 'Over a hundred thousand Abbasid silver coins have been dug up in Scandinavia, mostly on Gotland.', ('noonan', 'franklin')),
    ('champagne_fairs', 'Champagne fairs', 1150, 1320, ['cloth', 'spices', 'credit'],
     ['bruges', 'troyes', 'genoa'], 'Flemish cloth met Italian merchants and bankers at a cycle of six fairs a year.', ('edwards', 'abulughod')),
    ('baltic_grain', 'Baltic grain trade (the mother trade)', 1450, 1800, ['rye', 'wheat', 'timber', 'tar'],
     ['gdansk', 'helsingor', 'amsterdam'], 'Dutch ships carried Polish grain through the Sound; the toll records count nearly two million passages.', ('israel', 'soundtoll')),
    ('spice_islands', 'Spice Islands route', 1000, 1800, ['cloves', 'nutmeg', 'mace'],
     ['banda', 'ternate', 'malacca'], 'Until the 1700s cloves grew only in a few Moluccan islands and nutmeg only in the Bandas.', ('reid',)),
    ('fur_trade', 'Hudson\'s Bay fur trade', 1670, 1870, ['beaver pelts', 'guns', 'cloth', 'kettles'],
     ['york_factory', 'london'], 'Beaver felt hats in Europe paid for a trade network over half a continent.', ('innis',)),
    ('opium_route', 'Opium trade', 1773, 1917, ['opium', 'tea', 'silver'],
     ['kolkata', 'singapore', 'guangzhou'], 'Bengal opium paid for British tea, reversing the flow of silver and leading to two wars.', ('trocki',)),
    ('cotton_route', 'Cotton route', 1800, 1861, ['raw cotton', 'cloth'],
     ['new_orleans', 'liverpool', 'manchester'], 'Slave-grown American cotton fed Lancashire mills, the engine of the industrial revolution.', ('beckert',)),
    ('suez_route', 'Suez route to India', 1869, None, ['mail', 'textiles', 'tea', 'oil'],
     ['london', 'port_said', 'aden', 'mumbai', 'singapore'], 'The canal cut the London to Bombay voyage by about 40 percent.', ('huber',)),
    ('trans_siberian', 'Trans-Siberian Railway', 1904, None, ['grain', 'settlers', 'troops', 'containers'],
     ['moscow', 'irkutsk', 'vladivostok'], 'The longest railway in the world tied Russia\'s Pacific coast to Moscow.', ('marks',)),
    ('panama_route', 'Panama Canal route', 1914, None, ['grain', 'oil', 'containers'],
     ['new_york', 'colon', 'panama_city', 'san_francisco'], 'Cut about 13,000 km off the voyage between the American coasts.', ('mccullough',)),
    ('container_route', 'Asia to Europe container lane', 1966, None, ['containers', 'electronics', 'clothing'],
     ['shanghai', 'singapore', 'port_said', 'rotterdam'], 'The busiest long-haul shipping lane of the container age.', ('levine', 'levinson2')),
]
MIGRATIONS += [
    ('phoenician_colonies', 'Phoenician colonisation', 'phoenicians', 'Phoenicians', -1000, -600, True, None, False,
     ['tyre', 'carthage', 'cadiz'], 'Tyrian traders planted colonies across the Mediterranean to the Atlantic.', ('aubet',)),
    ('greek_colonies', 'Greek colonisation', 'greeks', 'Archaic Greeks', -750, -550, True, None, False,
     ['region_aegean', 'region_magna_graecia', 'marseille'], 'Greek cities founded hundreds of colonies from Spain to the Black Sea.', ('boardman',)),
    ('greek_black_sea', 'Greek colonies on the Black Sea', 'greeks', 'Archaic Greeks', -650, -500, True, None, False,
     ['region_aegean', 'istanbul', 'region_black_sea'], 'Milesian colonies around the Black Sea shipped grain back to the Aegean.', ('boardman',)),
    ('huns', 'Hunnic migration', 'huns', 'Huns', 370, 453, True, None, False,
     ['region_central_asia', 'region_pontic_steppe', 'region_pannonia'], 'The Huns\' arrival on the steppe pushed the Goths across the Danube.', ('heather',)),
    ('anglo_saxon', 'Anglo-Saxon migration', 'anglo_saxons', 'Angles, Saxons and Jutes', 450, 600, True, None, False,
     ['region_north_germany', 'region_britain'], 'Ancient DNA shows a large movement of people from northern Germany and Denmark into eastern England.', ('gretzinger', 'halsall')),
    ('arab_conquests', 'Arab conquests and settlement', 'arabs', 'Arabs', 632, 750, False, None, False,
     ['region_arabia_hejaz', 'region_egypt', 'region_maghreb', 'region_iberia'], 'Arab armies and settlers spread from Arabia to Spain and Central Asia within a century.', ('kennedy2007',)),
    ('han_south', 'Han migration to the south', 'han_chinese', 'Han Chinese', 311, 1279, True, None, False,
     ['region_yellow_river', 'region_yangtze_south'], 'Waves of refugees from the north (311, 755, 1127) moved China\'s centre of population to the Yangtze and beyond.', ('elvin2004',)),
    ('romani', 'Romani migration', 'romani', 'Romani', 500, 1400, True, None, False,
     ['region_north_india', 'region_persia', 'region_balkans', 'region_europe'], 'Genomes trace the Romani to a single group that left northwest India about 1,500 years ago.', ('mendizabal',)),
    ('sephardic', 'Expulsion of the Jews from Spain', 'sephardic_jews', 'Sephardic Jews', 1492, 1497, False, [40000, 200000], True,
     ['region_iberia', 'thessaloniki', 'istanbul'], 'Expelled in 1492, many settled in the Ottoman Empire, where Salonica became a largely Jewish city.', ('gerber',)),
    ('puritan_migration', 'Puritan Great Migration', 'english_puritans', 'English Puritans', 1630, 1640, False, [20000, 21000], False,
     ['region_east_anglia', 'region_new_england'], 'About 20,000 English Puritans crossed to New England in one decade.', ('anderson',)),
    ('huguenots', 'Huguenot exodus', 'huguenots', 'Huguenots', 1685, 1700, False, [150000, 200000], True,
     ['region_france', 'region_netherlands_prussia'], 'After Louis XIV revoked the Edict of Nantes, Protestant artisans fled to the Netherlands, Prussia, England and the Cape.', ('gwynn',)),
    ('acadians', 'Expulsion of the Acadians', 'acadians', 'Acadians', 1755, 1764, False, [10000, 11500], True,
     ['region_acadia', 'region_louisiana'], 'The British deported the French-speaking Acadians; many ended up in Louisiana as Cajuns.', ('faragher',)),
    ('siberia', 'Russian settlement of Siberia', 'russian_settlers', 'Russian settlers', 1582, 1914, False, None, False,
     ['region_urals', 'region_siberia', 'region_okhotsk'], 'Cossacks reached the Pacific by 1639, and millions of peasants followed the railway after 1890.', ('treadgold', 'marks')),
    ('trail_of_tears', 'Indian Removal (Trail of Tears)', 'southeastern_nations', 'Cherokee, Creek, Choctaw, Chickasaw and Seminole peoples', 1830, 1850, False, [60000, 100000], True,
     ['region_southeast_us', 'region_indian_territory'], 'The US forced the southeastern nations west of the Mississippi; thousands died on the way.', ('saunt',)),
    ('great_trek', 'Great Trek', 'voortrekkers', 'Voortrekkers', 1835, 1846, False, [12000, 15000], False,
     ['region_cape', 'region_highveld'], 'Boer families left the British Cape for the interior, founding the Boer republics.', ('giliomee',)),
    ('gold_rush', 'California Gold Rush', 'forty_niners', 'Forty-niners', 1848, 1855, False, [300000, 300000], False,
     ['region_eastern_us', 'region_california'], 'About 300,000 people rushed to California from the US, Latin America, Europe and China.', ('brands',)),
    ('indian_indenture', 'Indian indentured labour', 'indian_indentured', 'Indian indentured labourers', 1834, 1917, False, [1100000, 1500000], False,
     ['region_bihar', 'region_mauritius', 'region_trinidad', 'region_fiji'], 'After slavery ended, plantation colonies shipped over a million Indian workers on five-year contracts.', ('tinker',)),
    ('japanese_brazil', 'Japanese migration to Brazil', 'japanese_brazilians', 'Japanese emigrants', 1908, 1941, False, [180000, 190000], False,
     ['region_japan', 'region_sao_paulo'], 'Brazil now has the largest population of Japanese descent outside Japan.', ('lesser',)),
    ('greek_turkish_exchange', 'Greek-Turkish population exchange', 'exchange_refugees', 'Anatolian Greeks and Balkan Muslims', 1923, 1923, False, [1600000, 1600000], True,
     ['region_anatolia_west', 'region_greece'], 'The Lausanne treaty swapped about 1.2 million Orthodox Christians and 400,000 Muslims by religion.', ('hirschon',)),
    ('german_expulsions', 'Expulsion of Germans from eastern Europe', 'expelled_germans', 'Ethnic Germans', 1944, 1950, False, [12000000, 14000000], True,
     ['region_east_prussia_silesia', 'region_germany'], 'The largest forced population movement in European history.', ('douglas',)),
    ('nakba', 'Palestinian exodus (Nakba)', 'palestinian_refugees', 'Palestinian refugees', 1947, 1949, False, [700000, 750000], True,
     ['region_palestine', 'region_jordan_lebanon'], 'About 700,000 Palestinians fled or were driven out during the 1947-49 war.', ('morris',)),
    ('bangladesh_1971', 'Bangladesh Liberation War refugees', 'bengali_refugees', 'Bengali refugees', 1971, 1972, False, [10000000, 10000000], True,
     ['region_east_pakistan', 'region_india_east'], 'About ten million people fled into India, which went to war in December 1971.', ('raghavan',)),
    ('china_internal', 'China\'s rural-to-urban migration', 'chinese_migrant_workers', 'Chinese migrant workers', 1980, None, False, [280000000, 300000000], False,
     ['region_china_inland', 'region_china_coast'], 'Around 290 million migrant workers, the largest migration in human history, built the factories of the coast.', ('nbs',)),
    ('syria_refugees', 'Syrian refugee crisis', 'syrian_refugees', 'Syrian refugees', 2011, None, False, [6400000, 6800000], True,
     ['region_syria', 'region_turkey', 'region_europe'], 'More than six million Syrians fled abroad, most to Turkey, Lebanon and Jordan.', ('unhcr',)),
]


def slug(s):
    return re.sub(r'[^a-z0-9_]', '_', s.lower())


def line(stops):
    return [[PLACES[s][2], PLACES[s][1]] for s in stops]


def main():
    places, routes, rels, groups, feats = {}, [], [], {}, []

    def need(s, lens):
        if s not in places:
            n, lat, lon, sub = PLACES[s]
            places[s] = {'id': 'place:' + s, 'kind': 'place', 'name': n, 'stub': True, 'subtype': sub,
                         'lat': lat, 'lon': lon, 'lenses': [], 'sources': [{'cite': 'Coordinates from standard gazetteers; stub for places-people'}],
                         'status': 'draft'}
        if lens not in places[s]['lenses']:
            places[s]['lenses'].append(lens)

    for key, (name, why, legs) in RELAYS.items():
        rid = 'route:trade_hub_relay_' + key
        out_legs = []
        for i, (p, st, en, approx, why_led, why_lost, cause, srcs) in enumerate(legs):
            need(p, 'economy')
            leg = {'place': 'place:' + p, 'start': st, 'end': en, 'approx': approx, 'why': why_led,
                   'sources': S(*srcs)}
            if why_lost:
                leg['lost'] = why_lost
                leg['cause'] = cause
            out_legs.append(leg)
            prev = legs[i - 1][0] if i else None
            for k in ((key, p, st), (key, p)):
                if k in AFTER:
                    prev = AFTER[k]
                    break
            if prev and prev != p:
                rels.append({'id': 'rel:hub_' + key + '_%02d_' % i + p + '_after_' + prev, 'kind': 'relation',
                             'type': 'succeeded', 'from': 'place:' + p, 'to': 'place:' + prev, 'start': st,
                             'lenses': ['economy'], 'note': 'Took over as leading trade hub (' + name.split(':')[0] + ').',
                             'view': 'Braudel and Arrighi style succession of world-economy centres',
                             'sources': S(*srcs), 'status': 'draft'})
        stops = [l[0] for l in legs]
        routes.append({'id': rid, 'kind': 'route', 'subtype': 'trade', 'name': name.split(': ')[0], 'what': why,
                       'why': 'Shows that the centre of trade keeps moving, and that wars, silt and new sea routes move it.',
                       'start': legs[0][1], 'start_approx': True, 'end': None, 'stops': ['place:' + s for s in stops],
                       'legs': out_legs, 'geo': 'geo/routes.geojson', 'lenses': ['economy', 'geography'],
                       'tags': ['relay'], 'view': 'A model-curated chain in the Braudel and Arrighi tradition; the order is a judgement',
                       'sources': S('braudel', 'arrighi', 'abulughod', 'beaujard'), 'status': 'draft'})
        feats.append({'type': 'Feature', 'properties': {'ref': rid},
                      'geometry': {'type': 'LineString', 'coordinates': line(stops)}})

    for slug_, name, st, en, goods, stops, why, srcs in ROUTES:
        rid = 'route:' + slug_
        for s in stops:
            need(s, 'economy')
        routes.append({'id': rid, 'kind': 'route', 'subtype': 'trade', 'name': name, 'start': st, 'end': en,
                       'start_approx': True, 'end_approx': True, 'goods': goods, 'stops': ['place:' + s for s in stops],
                       'why': why, 'geo': 'geo/routes.geojson', 'lenses': ['economy', 'geography'],
                       'sources': S(*srcs), 'status': 'draft'})
        feats.append({'type': 'Feature', 'properties': {'ref': rid},
                      'geometry': {'type': 'LineString', 'coordinates': line(stops)}})

    for (slug_, name, g, gname, st, en, approx, people, forced, stops, why, srcs) in MIGRATIONS:
        rid = 'route:migration_' + slug_
        for s in stops:
            need(s, 'population')
        if g not in groups:
            groups[g] = {'id': 'group:' + g, 'kind': 'group', 'name': gname, 'lenses': ['population'],
                         'sources': S(*srcs), 'status': 'draft'}
        rec = {'id': rid, 'kind': 'route', 'subtype': 'migration', 'name': name, 'group': 'group:' + g,
               'start': st, 'end': en, 'stops': ['place:' + s for s in stops], 'why': why,
               'geo': 'geo/routes.geojson', 'lenses': ['population'], 'sources': S(*srcs), 'status': 'draft'}
        if approx:
            rec['start_approx'] = rec['end_approx'] = True
        if people:
            rec['people'] = people
        if forced:
            rec['forced'] = True
            rec['tags'] = ['forced']
        routes.append(rec)
        rels.append({'id': 'rel:migrated_' + slug_, 'kind': 'relation', 'type': 'migrated_to', 'from': 'group:' + g,
                     'to': 'place:' + stops[-1], 'start': st, 'end': en, 'lenses': ['population'],
                     **({'weight': people[1]} if people else {}), 'sources': S(*srcs), 'status': 'draft'})
        feats.append({'type': 'Feature', 'properties': {'ref': rid},
                      'geometry': {'type': 'LineString', 'coordinates': line(stops)}})

    def dump(name, recs):
        with open(os.path.join(DATA, name), 'w', encoding='utf-8') as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(name, len(recs))

    os.makedirs(os.path.join(DATA, 'geo'), exist_ok=True)
    dump('places.jsonl', list(places.values()))
    dump('groups.jsonl', list(groups.values()))
    dump('routes.jsonl', routes)
    dump('relations.jsonl', rels)
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(os.path.join(DATA, 'geo', 'routes.geojson'), 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
