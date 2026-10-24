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
