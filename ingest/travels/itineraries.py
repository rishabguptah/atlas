#!/usr/bin/env python3
"""Famous travellers' itineraries -> journey records + presences at their long stays.

Usage: python3 ingest/travels/itineraries.py   (run tools/build.py first)

Each itinerary below is a list of stops: (place name, lon, lat, arrived, left, mode of the leg INTO this stop, conf, note).
Dates are ISO strings as precise as the cited work allows ('-0399' style for BCE is not needed here: all CE).
conf follows WORLD.md: attested (the traveller's own account or a firm source dates it), estimated (scholars infer it),
approximate (route or date disputed or only roughly known). Stays of 60 days or more also become present_at relations.
All records are status draft: hand-entered from the cited works, waiting for the judge.

Writes data/travels/journeys.jsonl and data/travels/presences_travels.jsonl; stub places go to data/travels/places.jsonl.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Places, iso, slug, write_jsonl, kernel

A, E, P = 'attested', 'estimated', 'approximate'

TRAVELS = [
  {'id': 'ibn_battuta', 'carrier': 'person:ibn_battuta', 'name': "Ibn Battuta's travels",
   'what': 'Twenty-nine years and about 117,000 km across the Islamic world, India, China and West Africa (1325-1354).',
   'sources': [{'cite': 'Ibn Battuta, Rihla, tr. H. A. R. Gibb and C. F. Beckingham, The Travels of Ibn Battuta (Hakluyt Society, 1958-2000)'},
               {'cite': 'Ross E. Dunn, The Adventures of Ibn Battuta (University of California Press, 1986; rev. 2012)'}],
   'stops': [
    ('Tangier', -5.81, 35.77, None, '1325-06-14', None, A, 'leaves home for the hajj, aged 21'),
    ('Tlemcen', -1.32, 34.88, '1325-07', '1325-07', 'caravan', E, None),
    ('Bejaia', 5.08, 36.75, '1325-08', '1325-08', 'caravan', E, 'falls ill with fever'),
    ('Tunis', 10.17, 36.80, '1325-09', '1325-11', 'caravan', A, 'two months; joins the pilgrim caravan as its qadi'),
    ('Tripoli', 13.19, 32.89, '1326-01', '1326-02', 'caravan', E, 'marries for the first time on the road'),
    ('Alexandria', 29.92, 31.20, '1326-04-05', '1326-04', 'caravan', A, 'sees the Pharos lighthouse, partly ruined'),
    ('Cairo', 31.24, 30.04, '1326-05', '1326-06', 'land', A, 'the "mother of cities"; about a month'),
    ('Aydhab', 35.55, 22.33, '1326-07', '1326-07', 'river', E, 'war on the Red Sea coast blocks the crossing; turns back'),
    ('Damascus', 36.29, 33.51, '1326-08-09', '1326-09-01', 'land', A, 'Ramadan in Damascus; studies with its scholars'),
    ('Medina', 39.61, 24.47, '1326-10', '1326-10', 'caravan', A, None),
    ('Mecca', 39.83, 21.42, '1326-10-22', '1326-11-17', 'caravan', A, 'first hajj'),
    ('Najaf', 44.33, 32.03, '1326-12', '1327-01', 'caravan', E, 'with the Iraqi pilgrim caravan'),
    ('Basra', 47.78, 30.51, '1327-01', '1327-02', 'land', E, None),
    ('Isfahan', 51.67, 32.65, '1327-03', '1327-03', 'land', E, None),
    ('Shiraz', 52.53, 29.59, '1327-04', '1327-04', 'land', E, 'meets the scholar Majd al-Din'),
    ('Baghdad', 44.36, 33.31, '1327-06', '1327-06', 'land', A, 'joins the camp of the Ilkhan Abu Said'),
    ('Tabriz', 46.29, 38.08, '1327-06', '1327-07', 'horse', A, 'ten days with the Ilkhan\'s court'),
    ('Mosul', 43.13, 36.34, '1327-08', '1327-08', 'land', E, None),
    ('Mecca', 39.83, 21.42, '1327-11', '1330-09', 'caravan', E, 'about three years in Mecca, studying (Dunn puts it at one year, to 1328)'),
    ('Aden', 45.03, 12.79, '1331-01', '1331-01', 'sea', E, None),
    ('Mogadishu', 45.34, 2.04, '1331-02', '1331-02', 'sea', A, 'a Swahili sultan\'s hospitality'),
    ('Mombasa', 39.67, -4.05, '1331-02', '1331-02', 'sea', A, None),
    ('Kilwa', 39.51, -8.96, '1331-03', '1331-04', 'sea', A, '"one of the finest and best-built towns"'),
    ('Zafar', 54.09, 17.02, '1331-06', '1331-06', 'sea', E, 'on the monsoon'),
    ('Hormuz', 56.46, 27.10, '1331-09', '1331-09', 'sea', E, None),
    ('Mecca', 39.83, 21.42, '1332-02', '1332-03', 'caravan', E, 'another hajj; resolves to seek service in India'),
    ('Alanya', 32.00, 36.54, '1332-05', '1332-05', 'sea', E, 'Anatolia: guest of the akhi brotherhoods'),
    ('Konya', 32.48, 37.87, '1332-06', '1332-06', 'land', E, None),
    ('Sinop', 35.15, 42.03, '1332-08', '1332-08', 'land', E, None),
    ('Kaffa', 35.38, 45.03, '1332-09', '1332-09', 'sea', A, 'Genoese Kaffa in the Crimea'),
    ('New Sarai', 45.0, 48.6, '1332-10', '1332-10', 'horse', E, 'Golden Horde, camp of Ozbeg Khan'),
    ('Constantinople', 28.98, 41.01, '1332-11', '1332-12', 'horse', P, 'escorts the khatun Bayalun home; only Muslim account of the Byzantine city (dates disputed)'),
    ('Bukhara', 64.42, 39.77, '1333-03', '1333-03', 'caravan', E, 'still half-ruined from the Mongol sack'),
    ('Samarkand', 66.97, 39.65, '1333-04', '1333-04', 'caravan', E, None),
    ('Balkh', 66.90, 36.76, '1333-05', '1333-05', 'caravan', E, None),
    ('Herat', 62.20, 34.35, '1333-06', '1333-06', 'caravan', E, None),
    ('Indus crossing', 68.36, 25.40, '1333-09-12', '1333-09-12', 'horse', A, 'reaches the Indus; India begins'),
    ('Delhi', 77.21, 28.61, '1334-06', '1341-07', 'horse', A, 'qadi of Delhi under Muhammad bin Tughluq, seven years'),
    ('Calicut', 75.78, 11.25, '1342-01', '1342-01', 'land', A, 'the junks for China sink in a storm; he loses everything'),
    ('Malé', 73.51, 4.18, '1343-01', '1344-08', 'sea', A, 'qadi of the Maldives, marries four times'),
    ("Adam's Peak", 80.50, 6.81, '1344-09', '1344-09', 'sea', A, 'climbs the peak in Sri Lanka'),
    ('Sylhet', 91.87, 24.89, '1345-07', '1345-08', 'sea', E, 'Bengal: visits the Sufi Shah Jalal'),
    ('Samudra Pasai', 97.10, 5.16, '1345-11', '1345-12', 'sea', E, 'Sumatra'),
    ('Quanzhou', 118.59, 24.91, '1346-06', '1346-07', 'sea', A, 'Zaytun, "the biggest port in the world"'),
    ('Guangzhou', 113.25, 23.12, '1346-07', '1346-07', 'sea', E, None),
    ('Khanbaliq', 116.40, 39.90, '1346-08', '1346-08', 'river', P, 'his visit to the Yuan capital is doubted by many scholars'),
    ('Calicut', 75.78, 11.25, '1347-04', '1347-04', 'sea', E, None),
    ('Hormuz', 56.46, 27.10, '1347-06', '1347-06', 'sea', E, None),
    ('Baghdad', 44.36, 33.31, '1348-01', '1348-01', 'caravan', E, None),
    ('Damascus', 36.29, 33.51, '1348-06', '1348-07', 'caravan', A, 'the Black Death: 2,400 dead a day, he writes'),
    ('Cairo', 31.24, 30.04, '1348-09', '1348-09', 'land', A, 'the plague in Cairo'),
    ('Mecca', 39.83, 21.42, '1348-11', '1348-11', 'caravan', A, 'last hajj'),
    ('Tunis', 10.17, 36.80, '1349-06', '1349-06', 'sea', E, None),
    ('Fez', -5.00, 34.03, '1349-11-08', '1350-02', 'land', A, 'home after 24 years; his mother had died of the plague'),
    ('Granada', -3.60, 37.18, '1350-04', '1350-05', 'land', A, 'Nasrid Granada'),
    ('Sijilmasa', -4.27, 31.28, '1351-10', '1352-02', 'caravan', A, 'joins the salt caravan south'),
    ('Taghaza', -4.80, 23.60, '1352-03', '1352-03', 'caravan', A, 'houses built of salt blocks'),
    ('Walata', -7.03, 17.28, '1352-04', '1352-06', 'caravan', A, 'first town of Mali'),
    ('Mali (capital)', -8.40, 11.40, '1352-06-28', '1353-02-27', 'horse', P, 'court of Mansa Sulayman; the capital\'s site is unknown (Niani is one guess)'),
    ('Timbuktu', -3.00, 16.77, '1353-03', '1353-03', 'river', A, None),
    ('Gao', -0.04, 16.27, '1353-04', '1353-05', 'river', A, None),
    ('Takedda', 7.25, 17.30, '1353-06', '1353-09', 'caravan', E, 'copper town; recalled by the sultan of Morocco'),
    ('Sijilmasa', -4.27, 31.28, '1353-12', '1353-12', 'caravan', A, None),
    ('Fez', -5.00, 34.03, '1354-01', None, 'caravan', A, 'dictates the Rihla to Ibn Juzayy (1355)'),
   ]},
  {'id': 'xuanzang', 'carrier': 'person:xuanzang', 'name': "Xuanzang's pilgrimage to India",
   'what': 'Sixteen years (629-645) on foot and horseback from Chang\'an to India and back, bringing 657 Buddhist texts.',
   'sources': [{'cite': 'Xuanzang, Da Tang Xiyu ji (Great Tang Records on the Western Regions, 646), tr. Li Rongxi (BDK, 1996)'},
               {'cite': 'Sally Hovey Wriggins, The Silk Road Journey with Xuanzang (Westview, 2004)'}],
   'stops': [
    ("Chang'an", 108.94, 34.26, None, '629-08', None, E, 'leaves secretly, defying the emperor\'s travel ban'),
    ('Liangzhou', 102.64, 37.93, '629-09', '629-10', 'horse', E, None),
    ('Guazhou', 95.78, 40.52, '629-11', '629-12', 'horse', E, None),
    ('Hami', 93.51, 42.83, '630-01', '630-01', 'horse', E, 'crosses the Gobi alone, nearly dies of thirst'),
    ('Gaochang', 89.53, 42.85, '630-02', '630-03', 'horse', A, 'the king of Turfan begs him to stay; he fasts until released'),
    ('Kucha', 82.96, 41.72, '630-04', '630-05', 'horse', A, None),
    ('Bedel Pass', 78.4, 41.4, '630-05', '630-05', 'foot', E, 'a third of his party dies crossing the Tian Shan'),
    ('Suyab', 75.20, 42.80, '630-06', '630-06', 'horse', A, 'meets the Western Turkic khagan'),
    ('Tashkent', 69.28, 41.31, '630-07', '630-07', 'horse', E, None),
    ('Samarkand', 66.97, 39.65, '630-08', '630-08', 'horse', A, None),
    ('Termez', 67.28, 37.22, '630-10', '630-10', 'horse', E, None),
    ('Balkh', 66.90, 36.76, '630-11', '630-12', 'horse', A, '"little Rajagriha", full of monasteries'),
    ('Bamiyan', 67.83, 34.82, '631-01', '631-01', 'horse', A, 'sees the great standing Buddhas'),
    ('Kapisa', 69.20, 34.95, '631-02', '631-04', 'horse', A, None),
    ('Peshawar', 71.58, 34.01, '631-05', '631-06', 'horse', A, 'Kanishka\'s great stupa'),
    ('Taxila', 72.82, 33.75, '631-07', '631-07', 'foot', A, None),
    ('Srinagar', 74.80, 34.08, '631-09', '633-09', 'foot', A, 'two years studying in Kashmir'),
    ('Mathura', 77.67, 27.49, '634-06', '634-07', 'foot', E, None),
    ('Kannauj', 79.92, 27.05, '636-01', '636-04', 'foot', E, None),
    ('Shravasti', 82.05, 27.52, '636-07', '636-07', 'foot', E, None),
    ('Kapilavastu', 83.05, 27.54, '636-08', '636-08', 'foot', E, 'the Buddha\'s home town, in ruins'),
    ('Kushinagar', 83.89, 26.74, '636-09', '636-09', 'foot', E, None),
    ('Sarnath', 83.02, 25.38, '636-10', '636-10', 'foot', E, None),
    ('Bodh Gaya', 84.99, 24.70, '637-01', '637-01', 'foot', A, None),
    ('Nalanda', 85.44, 25.14, '637-02', '642-01', 'foot', A, 'five years at the great monastery-university under Shilabhadra'),
    ('Kanchipuram', 79.70, 12.83, '640-06', '640-08', 'foot', P, 'tour of south India; order and dates disputed'),
    ('Kannauj', 79.92, 27.05, '643-01', '643-02', 'foot', A, 'King Harsha\'s great assembly honours him'),
    ('Prayag', 81.85, 25.43, '643-03', '643-04', 'foot', A, 'Harsha\'s quinquennial giving festival'),
    ('Tashkurgan', 75.23, 37.77, '644-03', '644-03', 'horse', E, 'over the Pamirs, losing an elephant and texts in a river'),
    ('Kashgar', 75.99, 39.47, '644-04', '644-04', 'horse', E, None),
    ('Khotan', 79.92, 37.11, '644-05', '644-12', 'horse', A, 'writes to the emperor asking forgiveness'),
    ('Dunhuang', 94.66, 40.14, '645-01', '645-01', 'horse', E, None),
    ("Chang'an", 108.94, 34.26, '645-02-05', None, 'horse', A, 'welcomed by crowds; translates for the rest of his life'),
   ]},
  {'id': 'marco_polo', 'carrier': 'person:marco_polo', 'name': "Marco Polo's journey to Kublai Khan",
   'what': 'With his father Niccolò and uncle Maffeo: Venice to the Mongol court and back by sea (1271-1295).',
   'sources': [{'cite': 'Marco Polo and Rustichello da Pisa, Le Devisement du monde (c.1300), tr. Sharon Kinoshita (Hackett, 2016)'},
               {'cite': 'Hans Ulrich Vogel, Marco Polo Was in China (Brill, 2013)'}],
   'stops': [
    ('Venice', 12.33, 45.44, None, '1271', None, A, None),
    ('Acre', 35.08, 32.93, '1271', '1271-11', 'sea', A, 'carries a letter from the new pope, Gregory X'),
    ('Ayas', 35.78, 36.77, '1271-12', '1271-12', 'sea', E, 'Laiazzo in Cilician Armenia'),
    ('Tabriz', 46.29, 38.08, '1272-03', '1272-03', 'caravan', E, None),
    ('Kerman', 57.08, 30.28, '1272-06', '1272-06', 'caravan', E, None),
    ('Hormuz', 56.46, 27.10, '1272-08', '1272-08', 'caravan', E, 'the ships look unsafe; they turn north overland'),
    ('Balkh', 66.90, 36.76, '1273-01', '1273-01', 'caravan', E, None),
    ('Badakhshan', 70.58, 37.12, '1273-02', '1274-01', 'horse', E, 'a year in the mountains recovering from illness'),
    ('Kashgar', 75.99, 39.47, '1274-04', '1274-04', 'horse', E, 'over the Pamirs'),
    ('Khotan', 79.92, 37.11, '1274-06', '1274-06', 'caravan', E, None),
    ('Dunhuang', 94.66, 40.14, '1274-10', '1274-10', 'caravan', E, 'Shazhou, after the Lop desert'),
    ('Zhangye', 100.45, 38.93, '1274-11', '1275-03', 'caravan', P, 'Ganzhou; he says they stayed a year'),
    ('Shangdu', 116.18, 42.36, '1275-05', '1275-08', 'horse', A, 'Xanadu, Kublai\'s summer capital'),
    ('Khanbaliq', 116.40, 39.90, '1275-09', '1290-12', 'horse', A, 'seventeen years in Kublai Khan\'s service'),
    ('Kunming', 102.71, 25.04, '1280', '1280', 'horse', P, 'mission to Yunnan (Carajan); date uncertain'),
    ('Hangzhou', 120.16, 30.27, '1285', '1285', 'river', P, 'Quinsai, "the finest city in the world"'),
    ('Quanzhou', 118.59, 24.91, '1291-01', '1291-01', 'river', E, 'sails with 14 ships escorting the princess Kököchin to Persia'),
    ('Samudra Pasai', 97.10, 5.16, '1291-04', '1291-09', 'sea', A, 'five months on Sumatra waiting for the monsoon'),
    ('Sri Lanka', 79.85, 6.93, '1291-11', '1291-11', 'sea', E, None),
    ('Hormuz', 56.46, 27.10, '1293-02', '1293-02', 'sea', E, 'of 600 passengers, 18 survive the voyage'),
    ('Tabriz', 46.29, 38.08, '1293-05', '1294-01', 'horse', E, 'nine months at the Ilkhan\'s court'),
    ('Trebizond', 39.72, 41.00, '1294-04', '1294-04', 'horse', E, 'robbed of much of their fortune'),
    ('Constantinople', 28.98, 41.01, '1295-01', '1295-01', 'sea', E, None),
    ('Venice', 12.33, 45.44, '1295', None, 'sea', A, 'home after 24 years; later a prisoner in Genoa (1298-99), where he tells the tale'),
   ]},
  {'id': 'mansa_musa', 'carrier': 'person:musa_i_of_mali', 'name': "Mansa Musa's hajj",
   'what': 'The ruler of Mali crosses the Sahara with a vast caravan and gives away so much gold in Cairo that its price falls for years (1324-1325).',
   'sources': [{'cite': 'al-Umari, Masalik al-absar (c.1340), in N. Levtzion and J. F. P. Hopkins, Corpus of Early Arabic Sources for West African History (CUP, 1981)'},
               {'cite': 'Michael A. Gomez, African Dominion (Princeton, 2018), ch. 6-7'}],
   'stops': [
    ('Mali (capital)', -8.40, 11.40, None, '1324-01', None, P, 'capital site unknown; sets out with thousands of people and camels laden with gold'),
    ('Walata', -7.03, 17.28, '1324-03', '1324-03', 'caravan', P, None),
    ('Tuat', 0.25, 27.87, '1324-04', '1324-04', 'caravan', P, 'oasis route; some say via Ghadames'),
    ('Cairo', 31.24, 30.04, '1324-07', '1324-10', 'caravan', A, 'refuses to bow to the Mamluk sultan; floods Cairo with gold'),
    ('Mecca', 39.83, 21.42, '1324-11', '1324-12', 'caravan', A, 'performs the hajj'),
    ('Cairo', 31.24, 30.04, '1325-02', '1325-03', 'caravan', A, 'returns having borrowed money: his gold ran out'),
    ('Timbuktu', -3.00, 16.77, '1325-08', '1325-08', 'caravan', E, 'commissions the Djinguereber mosque, with the poet-architect al-Sahili'),
    ('Gao', -0.04, 16.27, '1325-09', '1325-09', 'river', E, None),
   ]},
  {'id': 'faxian', 'carrier': 'person:faxian', 'name': "Faxian's pilgrimage to India",
   'what': 'A Chinese monk walks to India for monastic rules and sails home via Sri Lanka and Java (399-414).',
   'sources': [{'cite': 'Faxian, Foguo ji (Record of Buddhist Kingdoms, 416), tr. James Legge (Oxford, 1886)'},
               {'cite': 'Max Deeg, Das Gaoseng-Faxian-Zhuan als religionsgeschichtliche Quelle (Harrassowitz, 2005)'}],
   'stops': [
    ("Chang'an", 108.94, 34.26, None, '399', None, A, 'aged about 60, with four companions'),
    ('Dunhuang', 94.66, 40.14, '400', '400', 'foot', E, '"no birds above, no beasts below" in the desert'),
    ('Shanshan', 88.15, 39.03, '400', '400', 'foot', E, None),
    ('Khotan', 79.92, 37.11, '401', '401', 'foot', A, 'watches the great image procession'),
    ('Swat', 72.36, 34.77, '402', '402', 'foot', E, 'Udyana, over the Pamirs and the Indus gorges'),
    ('Peshawar', 71.58, 34.01, '402', '403', 'foot', E, None),
    ('Mathura', 77.67, 27.49, '403', '404', 'foot', E, None),
    ('Shravasti', 82.05, 27.52, '404', '404', 'foot', E, None),
    ('Pataliputra', 85.14, 25.61, '405', '408', 'foot', A, 'three years learning Sanskrit and copying the Vinaya'),
    ('Tamralipti', 87.92, 22.29, '408', '410', 'foot', A, 'two years copying sutras'),
    ('Anuradhapura', 80.40, 8.31, '410', '412', 'sea', A, 'weeps at a Chinese silk fan offered at a shrine'),
    ('Java', 110.4, -7.0, '412', '413', 'sea', P, 'Yepoti: Java or Borneo; a storm drives the ship off course'),
    ('Laoshan', 120.62, 36.17, '413', '413', 'sea', A, 'lands on the Shandong coast, far north of his goal'),
    ('Jiankang', 118.78, 32.06, '414', None, 'land', A, 'Nanjing; writes his record and translates'),
   ]},
  {'id': 'zheng_he_1405', 'carrier': 'person:zheng_he', 'name': "Zheng He's first treasure voyage",
   'what': 'About 27,800 men in some 250 ships sail from the Ming court to Calicut and back (1405-1407).',
   'sources': [{'cite': 'Ma Huan, Yingya Shenglan (1433), tr. J. V. G. Mills (Hakluyt Society, 1970)'},
               {'cite': 'Edward L. Dreyer, Zheng He: China and the Oceans in the Early Ming Dynasty (Pearson, 2007)'}],
   'stops': [
    ('Nanjing', 118.78, 32.06, None, '1405-07', None, A, None),
    ('Liujiagang', 121.25, 31.60, '1405-07', '1405-10', 'river', A, 'the fleet gathers at the Yangzi mouth'),
    ('Qui Nhon', 109.22, 13.77, '1406-01', '1406-01', 'sea', E, 'Champa'),
    ('Surabaya', 112.75, -7.25, '1406-03', '1406-03', 'sea', E, 'Majapahit Java; 170 of his men killed in a civil war'),
    ('Palembang', 104.75, -2.98, '1406-05', '1406-05', 'sea', E, None),
    ('Malacca', 102.25, 2.20, '1406-06', '1406-06', 'sea', E, None),
    ('Samudra Pasai', 97.10, 5.16, '1406-08', '1406-08', 'sea', E, None),
    ('Galle', 80.22, 6.03, '1406-11', '1406-11', 'sea', E, None),
    ('Calicut', 75.78, 11.25, '1406-12', '1407-04', 'sea', A, 'turnaround; erects a stele'),
    ('Palembang', 104.75, -2.98, '1407-06', '1407-06', 'sea', A, 'defeats the pirate Chen Zuyi'),
    ('Nanjing', 118.78, 32.06, '1407-10-02', None, 'sea', A, 'presents Chen Zuyi for execution'),
   ]},
  {'id': 'zheng_he_1417', 'carrier': 'person:zheng_he', 'name': "Zheng He's fifth voyage, to Africa",
   'what': 'The treasure fleet reaches Arabia and the Swahili coast and brings a giraffe to the Ming court (1417-1419).',
   'sources': [{'cite': 'Edward L. Dreyer, Zheng He: China and the Oceans in the Early Ming Dynasty (Pearson, 2007)'},
               {'cite': 'Liujiagang and Changle steles of 1431, tr. in Dreyer 2007, appendix'}],
   'stops': [
    ('Nanjing', 118.78, 32.06, None, '1417-05', None, E, None),
    ('Quanzhou', 118.59, 24.91, '1417-06', '1417-06', 'sea', A, 'prays at the Muslim tombs'),
    ('Qui Nhon', 109.22, 13.77, '1417-12', '1417-12', 'sea', E, None),
    ('Malacca', 102.25, 2.20, '1418-01', '1418-01', 'sea', E, None),
    ('Calicut', 75.78, 11.25, '1418-03', '1418-03', 'sea', E, None),
    ('Hormuz', 56.46, 27.10, '1418-04', '1418-04', 'sea', A, None),
    ('Aden', 45.03, 12.79, '1418-05', '1418-05', 'sea', A, None),
    ('Mogadishu', 45.34, 2.04, '1418-08', '1418-08', 'sea', A, None),
    ('Malindi', 40.12, -3.22, '1418-09', '1418-10', 'sea', A, 'envoys with giraffes (the qilin) join the fleet'),
    ('Nanjing', 118.78, 32.06, '1419-08-08', None, 'sea', A, None),
   ]},
  {'id': 'zheng_he_1431', 'carrier': 'person:zheng_he', 'name': "Zheng He's seventh and last voyage",
   'what': 'The last treasure fleet; a squadron reaches Mecca; Zheng He dies on the way home (1431-1433).',
   'sources': [{'cite': 'Edward L. Dreyer, Zheng He: China and the Oceans in the Early Ming Dynasty (Pearson, 2007)'},
               {'cite': 'Ma Huan, Yingya Shenglan (1433), tr. J. V. G. Mills (Hakluyt Society, 1970)'}],
   'stops': [
    ('Nanjing', 118.78, 32.06, None, '1431-01-19', None, A, None),
    ('Changle', 119.52, 25.96, '1431-04', '1431-12', 'sea', A, 'carves the stele that lists all seven voyages'),
    ('Qui Nhon', 109.22, 13.77, '1432-01', '1432-01', 'sea', A, None),
    ('Surabaya', 112.75, -7.25, '1432-03', '1432-07', 'sea', A, None),
    ('Malacca', 102.25, 2.20, '1432-07', '1432-08', 'sea', A, None),
    ('Calicut', 75.78, 11.25, '1432-12', '1432-12', 'sea', A, 'Ma Huan\'s squadron goes on to Jeddah and Mecca'),
    ('Hormuz', 56.46, 27.10, '1433-01', '1433-03', 'sea', A, None),
    ('Calicut', 75.78, 11.25, '1433-04', '1433-04', 'sea', P, 'Zheng He probably dies here or at sea, spring 1433'),
    ('Nanjing', 118.78, 32.06, '1433-07-22', None, 'sea', A, 'the fleet returns; the voyages end'),
   ]},
  {'id': 'evliya_celebi', 'carrier': 'person:evliya_celebi', 'name': "Evliya Çelebi's travels",
   'what': 'Forty years across the Ottoman world and beyond, written up in the ten-volume Seyahatname (1640-1682).',
   'sources': [{'cite': 'Evliya Çelebi, Seyahatname, selections tr. Robert Dankoff and Sooyong Kim, An Ottoman Traveller (Eland, 2010)'},
               {'cite': 'Robert Dankoff, An Ottoman Mentality: The World of Evliya Çelebi (Brill, 2004)'}],
   'stops': [
    ('Istanbul', 28.98, 41.01, None, '1640', None, A, 'dreams the Prophet tells him to travel'),
    ('Bursa', 29.06, 40.19, '1640', '1640', 'land', A, None),
    ('Trabzon', 39.72, 41.00, '1640', '1641', 'sea', A, None),
    ('Bakhchysarai', 33.86, 44.75, '1641', '1641', 'sea', E, 'the Crimean Khan\'s court'),
    ('Istanbul', 28.98, 41.01, '1642', '1645', 'sea', E, None),
    ('Erzurum', 41.27, 39.90, '1646', '1648', 'horse', A, 'in the governor\'s service'),
    ('Tabriz', 46.29, 38.08, '1647', '1647', 'horse', A, 'embassy to Safavid Persia'),
    ('Damascus', 36.29, 33.51, '1648', '1650', 'horse', A, None),
    ('Sarajevo', 18.41, 43.86, '1660', '1660', 'horse', E, None),
    ('Vienna', 16.37, 48.21, '1665', '1665', 'horse', A, 'with the Ottoman embassy of Kara Mehmed Pasha'),
    ('Candia', 25.13, 35.34, '1667', '1669', 'sea', A, 'at the siege of Candia, Crete'),
    ('Mecca', 39.83, 21.42, '1671', '1672', 'caravan', A, 'the hajj'),
    ('Cairo', 31.24, 30.04, '1672', None, 'caravan', A, 'settles in Cairo; travels up the Nile to Sudan (1672-73) and dies c.1682'),
   ]},
  {'id': 'humboldt', 'carrier': 'person:alexander_von_humboldt', 'name': "Humboldt and Bonpland in the Americas",
   'what': 'Five years of measuring everything from the Orinoco to the Andes; the voyage that founded modern geography (1799-1804).',
   'sources': [{'cite': 'Alexander von Humboldt and Aimé Bonpland, Personal Narrative of Travels to the Equinoctial Regions of America (1814-1829)'},
               {'cite': 'Andrea Wulf, The Invention of Nature (Knopf, 2015)'}],
   'stops': [
    ('A Coruña', -8.41, 43.36, None, '1799-06-05', None, A, 'sails on the Pizarro'),
    ('Santa Cruz de Tenerife', -16.25, 28.47, '1799-06-19', '1799-06-25', 'sea', A, 'climbs the Teide'),
    ('Cumaná', -64.18, 10.46, '1799-07-16', '1799-11-16', 'sea', A, None),
    ('Caracas', -66.90, 10.49, '1799-11-21', '1800-02-07', 'sea', A, None),
    ('Casiquiare', -66.5, 2.9, '1800-05-10', '1800-05-20', 'river', A, 'proves the Orinoco and Amazon are joined'),
    ('Angostura', -63.55, 8.12, '1800-06-13', '1800-07-10', 'river', A, None),
    ('Havana', -82.36, 23.13, '1800-12-19', '1801-03-09', 'sea', A, None),
    ('Cartagena', -75.51, 10.39, '1801-03-30', '1801-04-19', 'sea', A, None),
    ('Bogotá', -74.07, 4.71, '1801-07-06', '1801-09-08', 'river', A, 'with the botanist Mutis'),
    ('Quito', -78.47, -0.18, '1802-01-06', '1802-06-09', 'horse', A, None),
    ('Chimborazo', -78.82, -1.47, '1802-06-23', '1802-06-23', 'foot', A, 'climbs to about 5,900 m, then a world record'),
    ('Lima', -77.04, -12.05, '1802-10-23', '1802-12-24', 'horse', A, 'observes the transit of Mercury; the Humboldt Current'),
    ('Guayaquil', -79.89, -2.19, '1803-01-04', '1803-02-17', 'sea', A, None),
    ('Acapulco', -99.88, 16.85, '1803-03-23', '1803-03-28', 'sea', A, None),
    ('Mexico City', -99.13, 19.43, '1803-04-12', '1804-01-20', 'horse', A, None),
    ('Veracruz', -96.13, 19.20, '1804-02-19', '1804-03-07', 'horse', A, None),
    ('Philadelphia', -75.16, 39.95, '1804-05-24', '1804-05-29', 'sea', A, None),
    ('Washington', -77.04, 38.90, '1804-06-01', '1804-06-13', 'land', A, 'three weeks with President Jefferson'),
    ('Bordeaux', -0.58, 44.84, '1804-08-03', None, 'sea', A, 'home with 60,000 plant specimens'),
   ]},
]

# Short stays worth a presence of their own, for co-presence clusters people ask about.
# (person, place name, lon, lat, start, end, role, conf, cite)
STAYS = [
    ('person:adolf_hitler', 'Vienna', 16.37, 48.21, '1907-09', '1913-05-24', 'failed art student, lived in a men\'s hostel', A, 'Ian Kershaw, Hitler 1889-1936: Hubris (1998), ch. 2-3'),
    ('person:leon_trotsky', 'Vienna', 16.37, 48.21, '1907-10', '1914-08-03', 'exile, edited Pravda', A, 'Isaac Deutscher, The Prophet Armed (1954), ch. 7'),
    ('person:joseph_stalin', 'Vienna', 16.37, 48.21, '1913-01', '1913-02', 'wrote "Marxism and the National Question"', A, 'Simon Sebag Montefiore, Young Stalin (2007), ch. 26'),
    ('person:sigmund_freud', 'Vienna', 16.37, 48.21, '1860', '1938-06-04', 'physician; Berggasse 19 from 1891', A, 'Peter Gay, Freud: A Life for Our Time (1988)'),
    ('person:josip_broz_tito', 'Wiener Neustadt', 16.25, 47.81, '1912', '1913', 'mechanic at the Daimler works, near Vienna', E, 'Jasper Ridley, Tito (1994), ch. 4'),
    ('person:gustav_klimt', 'Vienna', 16.37, 48.21, '1862', '1918-02-06', 'painter', A, 'Wikidata / standard biography'),
    ('person:egon_schiele', 'Vienna', 16.37, 48.21, '1906', '1918-10-31', 'painter', A, 'Jane Kallir, Egon Schiele: The Complete Works (1990)'),
    ('person:ludwig_wittgenstein', 'Vienna', 16.37, 48.21, '1913-06', '1913-09', 'home from Cambridge for the summer', E, 'Ray Monk, Ludwig Wittgenstein: The Duty of Genius (1990), ch. 4'),
    ('person:arnold_schoenberg', 'Vienna', 16.37, 48.21, '1874', '1911-08', 'composer, until the move to Berlin', A, 'standard biography'),
    ('person:stefan_zweig', 'Vienna', 16.37, 48.21, '1881', '1919', 'writer', A, 'Stefan Zweig, The World of Yesterday (1942)'),
    ('person:vladimir_lenin', 'Zurich', 8.54, 47.37, '1916-02', '1917-04-09', 'exile at Spiegelgasse 14', A, 'Robert Service, Lenin: A Biography (2000), ch. 12'),
    ('person:james_joyce', 'Zurich', 8.54, 47.37, '1915-06', '1919-10', 'writing Ulysses', A, 'Richard Ellmann, James Joyce (1959; rev. 1982)'),
    ('person:tristan_tzara', 'Zurich', 8.54, 47.37, '1915-10', '1919-12', 'founds Dada at the Cabaret Voltaire', A, 'Hans Richter, Dada: Art and Anti-Art (1965)'),
    ('person:leonardo_da_vinci', 'Florence', 11.26, 43.77, '1500-04', '1506-05', 'paints the Mona Lisa and the Battle of Anghiari', A, 'Martin Kemp, Leonardo (2004)'),
    ('person:michelangelo', 'Florence', 11.26, 43.77, '1501', '1505-03', 'carves the David', A, 'William Wallace, Michelangelo: The Artist, the Man (2010)'),
    ('person:raphael', 'Florence', 11.26, 43.77, '1504', '1508', 'studies Leonardo and Michelangelo', A, 'standard biography'),
    ('person:ernest_hemingway', 'Paris', 2.35, 48.86, '1921-12', '1928-03', 'foreign correspondent and writer', A, 'Ernest Hemingway, A Moveable Feast (1964)'),
    ('person:f_scott_fitzgerald', 'Paris', 2.35, 48.86, '1924-04', '1926-12', 'writer', E, 'Matthew J. Bruccoli, Some Sort of Epic Grandeur (1981)'),
    ('person:pablo_picasso', 'Paris', 2.35, 48.86, '1904-04', '1946', 'painter', A, 'John Richardson, A Life of Picasso (1991-2021)'),
    ('person:james_joyce', 'Paris', 2.35, 48.86, '1920-07', '1939-12', 'publishes Ulysses (1922)', A, 'Richard Ellmann, James Joyce (1959; rev. 1982)'),
    ('person:johann_wolfgang_von_goethe', 'Weimar', 11.33, 50.98, '1775-11', '1832-03-22', 'minister and poet', A, 'Nicholas Boyle, Goethe: The Poet and the Age (1991-2000)'),
    ('person:friedrich_schiller', 'Weimar', 11.33, 50.98, '1799-12', '1805-05-09', 'poet', A, 'Nicholas Boyle, Goethe: The Poet and the Age (1991-2000)'),
]
PERSON_STUBS = [
    {'id': 'person:leon_trotsky', 'name': 'Leon Trotsky', 'wikidata': 'Q33391', 'start': 1879, 'end': 1940, 'roles': ['revolutionary']},
    {'id': 'person:evliya_celebi', 'name': 'Evliya Çelebi', 'wikidata': 'Q233426', 'start': 1611, 'end': 1682, 'end_approx': True, 'roles': ['writer', 'traveller']},
]


def days(a, b):
    ya, yb = iso(a)[0], iso(b)[0]
    if ya is None or yb is None:
        return 0
    def frac(s):
        p = s.lstrip('-').split('-')
        return (int(p[1]) - 1) / 12 if len(p) > 1 else 0
    return ((yb + frac(b)) - (ya + frac(a))) * 365


def main():
    places = Places()
    persons = {p['id'] for p in kernel()['person']}
    journeys, pres = [], []
    for t in TRAVELS:
        legs, prev = [], None
        for i, (name, lon, lat, arr, left, mode, conf, note) in enumerate(t['stops']):
            pid = places.resolve(name, lon, lat, r_km=15, cite=t['sources'][0]['cite'])
            if prev:
                g = {'from': prev[0], 'to': pid, 'mode': mode or 'land', 'conf': conf}
                if prev[1]:
                    g['start_date'] = iso(prev[1])[1]
                if arr:
                    g['end_date'] = iso(arr)[1]
                if note:
                    g['note'] = note
                legs.append(g)
            elif note:
                t.setdefault('start_note', note)
            prev = (pid, left or arr)
            if arr and left and days(arr, left) >= 60 and t['carrier'].startswith('person:'):
                y0, y1 = iso(arr)[0], iso(left)[0]
                pres.append({'id': f'rel:present:{t["carrier"].split(":")[1]}:{slug(name)}_{y0}', 'kind': 'relation',
                             'type': 'present_at', 'from': t['carrier'], 'to': pid, 'start': y0, 'end': y1,
                             **({'date': iso(arr)[1]} if y0 > 0 else {}), **({'end_date': iso(left)[1]} if y1 > 0 else {}),
                             'role': (note or 'traveller')[:80], 'conf': conf, 'lenses': ['people'],
                             'sources': t['sources'][:1], 'status': 'draft', 'via': f'route:journey:{t["id"]}'})
        ys = [iso(x)[0] for s in t['stops'] for x in (s[3], s[4]) if x]
        journeys.append({'id': f'route:journey:{t["id"]}', 'kind': 'route', 'subtype': 'journey', 'name': t['name'],
                         'carrier': t['carrier'], 'lenses': ['people', 'geography'], 'start': min(ys), 'end': max(ys),
                         'what': t['what'], 'legs': legs, 'sources': t['sources'], 'status': 'draft',
                         'conf': 'attested' if sum(g['conf'] == A for g in legs) * 2 >= len(legs) else 'estimated'})
    seen = {}
    for who, name, lon, lat, s, e, role, conf, cite in STAYS:
        pid = places.resolve(name, lon, lat, r_km=15, cite=cite)
        y0, y1 = iso(s)[0], iso(e)[0]
        rid = f'rel:present:{who.split(":")[1]}:{slug(name)}_{y0}'
        pres.append({'id': rid, 'kind': 'relation', 'type': 'present_at', 'from': who, 'to': pid, 'start': y0, 'end': y1,
                     'date': iso(s)[1], 'end_date': iso(e)[1], 'role': role, 'conf': conf, 'lenses': ['people'],
                     'sources': [{'cite': cite}], 'status': 'draft'})
    stubs = [dict(p, kind='person', stub=True, lenses=['people'], status='sourced',
                  sources=[{'cite': 'Wikidata (CC0)', 'url': f'https://www.wikidata.org/wiki/{p["wikidata"]}'}])
             for p in PERSON_STUBS if p['id'] not in persons or True]
    places.write()
    write_jsonl('journeys.jsonl', journeys)
    write_jsonl('presences_travels.jsonl', pres)
    write_jsonl('people.jsonl', stubs)
    print(f'{len(journeys)} itineraries with {sum(len(j["legs"]) for j in journeys)} legs, {len(pres)} presences')


if __name__ == '__main__':
    main()
