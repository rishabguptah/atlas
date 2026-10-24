#!/usr/bin/env python3
"""Hand-curated decisive battles and sieges -> data/states-war/battles.jsonl (+ participant_in relations).

Usage: python3 ingest/states-war/battles.py   (run cliopatria.py first: sides are resolved to its polity ids)

These are written from general knowledge, so every record is status "draft" and cites the Wikipedia
article to check it against. The plan is to replace or confirm them with a Wikidata pull
(battles with coordinates, dates and participants) once query.wikidata.org is reachable.
Sides are Cliopatria polity names where one fits; anything else is kept as plain text.
Each row: slug, name, year, lat, lon, subtype, Wikipedia title, side A, side B, winner ('A', 'B' or None), why.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'states-war')

B = 'battle'
S = 'siege'
K = 'sack'
BATTLES = [
    ('megiddo_bc1457', 'Battle of Megiddo', -1457, 32.585, 35.185, B, 'Battle_of_Megiddo_(15th_century_BC)', ['New Kingdom of Egypt'], ['Canaanite coalition'], 'A', 'The first battle recorded in any detail; it opened the Levant to Egyptian empire.'),
    ('kadesh', 'Battle of Kadesh', -1274, 34.557, 36.519, B, 'Battle_of_Kadesh', ['New Kingdom of Egypt'], ['Hittites'], None, 'A draw between superpowers that led to the oldest surviving peace treaty.'),
    ('qarqar', 'Battle of Qarqar', -853, 35.6, 36.4, B, 'Battle_of_Qarqar', ['Neo-Assyrian Empire'], ['Levantine coalition', 'Kingdom of Israel'], None, 'A coalition of small kingdoms briefly checked the Assyrian war machine.'),
    ('fall_of_nineveh', 'Fall of Nineveh', -612, 36.36, 43.15, S, 'Battle_of_Nineveh_(612_BC)', ['Neo-Babylonian Empire', 'Median Kingdom'], ['Neo-Assyrian Empire'], 'A', 'The capital of the first great iron-age empire fell, and Assyria vanished within a few years.'),
    ('fall_of_babylon', 'Fall of Babylon', -539, 32.54, 44.42, S, 'Fall_of_Babylon', ['Achaemenid Empire'], ['Neo-Babylonian Empire'], 'A', 'Cyrus took Mesopotamia almost without a fight and Persia became the largest empire yet.'),
    ('marathon', 'Battle of Marathon', -490, 38.118, 23.978, B, 'Battle_of_Marathon', ['Greek City-States'], ['Achaemenid Empire'], 'A', 'Athens beat a Persian landing force and gained the confidence that shaped its golden age.'),
    ('thermopylae', 'Battle of Thermopylae', -480, 38.796, 22.536, B, 'Battle_of_Thermopylae', ['Greek City-States'], ['Achaemenid Empire'], 'B', 'A narrow coastal pass let a small force hold a huge army for three days.'),
    ('salamis', 'Battle of Salamis', -480, 37.95, 23.55, B, 'Battle_of_Salamis', ['Greek City-States'], ['Achaemenid Empire'], 'A', 'In a cramped strait the Greek fleet broke the Persian navy and ended the invasion\'s momentum.'),
    ('plataea', 'Battle of Plataea', -479, 38.2, 23.27, B, 'Battle_of_Plataea', ['Greek City-States'], ['Achaemenid Empire'], 'A', 'The last Persian army in Greece was destroyed.'),
    ('siege_of_syracuse_bc413', 'Siege of Syracuse', -413, 37.07, 15.28, S, 'Sicilian_Expedition', ['Peloponnesian League'], ['Athens'], 'A', 'Athens lost its whole expeditionary fleet in Sicily, the turning point of the Peloponnesian War.'),
    ('aegospotami', 'Battle of Aegospotami', -405, 40.33, 26.53, B, 'Battle_of_Aegospotami', ['Peloponnesian League'], ['Athens'], 'A', 'Sparta cut Athens off from its Black Sea grain at the Dardanelles and Athens surrendered.'),
    ('issus', 'Battle of Issus', -333, 36.84, 36.2, B, 'Battle_of_Issus', ['Macedonian Empire'], ['Achaemenid Empire'], 'A', 'Alexander beat Darius III in person and opened the road to Syria and Egypt.'),
    ('siege_of_tyre', 'Siege of Tyre', -332, 33.27, 35.2, S, 'Siege_of_Tyre_(332_BC)', ['Macedonian Empire'], ['Tyre'], 'A', 'Alexander built a causeway to an island city, ending Phoenician naval power.'),
    ('gaugamela', 'Battle of Gaugamela', -331, 36.57, 43.43, B, 'Battle_of_Gaugamela', ['Macedonian Empire'], ['Achaemenid Empire'], 'A', 'The decisive defeat of the Persian Empire.'),
    ('hydaspes', 'Battle of the Hydaspes', -326, 32.9, 73.7, B, 'Battle_of_the_Hydaspes', ['Macedonian Empire'], ['Paurava kingdom'], 'A', 'Alexander\'s last great battle; soon after, his army refused to go further east.'),
    ('ipsus', 'Battle of Ipsus', -301, 38.9, 31.0, B, 'Battle_of_Ipsus', ['Seleucid Empire', 'Kingdom of Lysimachus'], ['Antigonid Dynasty'], 'A', 'It ended any hope of reuniting Alexander\'s empire.'),
    ('changping', 'Battle of Changping', -260, 35.8, 112.9, B, 'Battle_of_Changping', ['Qin'], ['Zhao'], 'A', 'Qin crushed its strongest rival, a step toward the first unified Chinese empire.'),
    ('kalinga_war', 'Kalinga War', -261, 20.27, 85.84, B, 'Kalinga_War', ['Maurya Empire'], ['Kalinga'], 'A', 'The slaughter turned Ashoka toward Buddhism and his edicts of dhamma.'),
    ('cannae', 'Battle of Cannae', -216, 41.306, 16.132, B, 'Battle_of_Cannae', ['Carthage'], ['Roman Republic'], 'A', 'Hannibal\'s double envelopment destroyed a Roman army, yet Rome refused to make peace.'),
    ('zama', 'Battle of Zama', -202, 36.3, 9.45, B, 'Battle_of_Zama', ['Roman Republic'], ['Carthage'], 'A', 'Rome won the Second Punic War and became master of the western Mediterranean.'),
    ('gaixia', 'Battle of Gaixia', -202, 33.3, 117.4, B, 'Battle_of_Gaixia', ['Han Dynasty'], ['Western Chu'], 'A', 'Liu Bang beat Xiang Yu and founded the Han dynasty.'),
    ('pydna', 'Battle of Pydna', -168, 40.37, 22.6, B, 'Battle_of_Pydna', ['Roman Republic'], ['Antigonid Macedonia'], 'A', 'The legion beat the phalanx and the Macedonian kingdom ended.'),
    ('destruction_of_carthage_bc146', 'Destruction of Carthage', -146, 36.85, 10.32, K, 'Siege_of_Carthage_(Third_Punic_War)', ['Roman Republic'], ['Carthage'], 'A', 'Rome razed its old rival and made Africa a province.'),
    ('arausio', 'Battle of Arausio', -105, 44.14, 4.81, B, 'Battle_of_Arausio', ['Cimbri and Teutones'], ['Roman Republic'], 'A', 'Rome\'s worst defeat since Cannae, which led to Marius\'s army reforms.'),
    ('alesia', 'Siege of Alesia', -52, 47.537, 4.5, S, 'Battle_of_Alesia', ['Roman Republic'], ['Gallic tribes'], 'A', 'Caesar\'s double ring of walls ended Gallic independence.'),
    ('carrhae', 'Battle of Carrhae', -53, 36.87, 39.03, B, 'Battle_of_Carrhae', ['Parthian Empire'], ['Roman Republic'], 'A', 'Parthian horse archers destroyed Crassus\'s army and fixed Rome\'s eastern frontier for centuries.'),
    ('pharsalus', 'Battle of Pharsalus', -48, 39.3, 22.38, B, 'Battle_of_Pharsalus', ['Caesarians'], ['Optimates'], 'A', 'Caesar beat Pompey and the Roman Republic slid toward one-man rule.'),
    ('actium', 'Battle of Actium', -31, 38.95, 20.74, B, 'Battle_of_Actium', ['Roman Republic'], ['Ptolemaic Kingdom'], 'A', 'Octavian beat Antony and Cleopatra; Egypt became Roman and Augustus founded the empire.'),
    ('teutoburg', 'Battle of the Teutoburg Forest', 9, 52.41, 8.13, B, 'Battle_of_the_Teutoburg_Forest', ['Germanic tribes'], ['Roman Empire'], 'A', 'Three legions were lost and Rome gave up conquering Germany beyond the Rhine.'),
    ('siege_of_jerusalem_70', 'Siege of Jerusalem', 70, 31.778, 35.235, S, 'Siege_of_Jerusalem_(70_CE)', ['Roman Empire'], ['Judean rebels'], 'A', 'The Temple was destroyed, reshaping Judaism and early Christianity.'),
    ('red_cliffs', 'Battle of Red Cliffs', 208, 29.87, 113.62, B, 'Battle_of_Red_Cliffs', ['Sun Quan', 'Liu Bei'], ['Cao Cao'], 'A', 'It stopped the north from reuniting China and led to the Three Kingdoms.'),
    ('edessa_260', 'Battle of Edessa', 260, 37.16, 38.79, B, 'Battle_of_Edessa', ['Sasanian Empire'], ['Roman Empire'], 'A', 'The emperor Valerian was captured, the low point of Rome\'s third-century crisis.'),
    ('milvian_bridge', 'Battle of the Milvian Bridge', 312, 41.936, 12.467, B, 'Battle_of_the_Milvian_Bridge', ['Constantine'], ['Maxentius'], 'A', 'Constantine won Rome, and his patronage set Christianity on the way to dominance.'),
    ('adrianople', 'Battle of Adrianople', 378, 41.68, 26.56, B, 'Battle_of_Adrianople', ['Goths (Thervingi and Greuthungi)'], ['Roman Empire'], 'A', 'Gothic cavalry killed the emperor Valens; barbarian groups now lived inside the empire on their own terms.'),
    ('fei_river', 'Battle of Fei River', 383, 32.6, 116.8, B, 'Battle_of_Fei_River', ['Eastern Jin'], ['Former Qin'], 'A', 'A small southern army routed the north and kept China divided for two more centuries.'),
    ('sack_of_rome_410', 'Sack of Rome', 410, 41.9, 12.5, K, 'Sack_of_Rome_(410)', ['Visigoths'], ['Western Roman Empire'], 'A', 'The first fall of the city in 800 years; Augustine wrote The City of God in reply.'),
    ('catalaunian_plains', 'Battle of the Catalaunian Plains', 451, 48.9, 4.4, B, 'Battle_of_the_Catalaunian_Plains', ['Western Roman Empire', 'Visigoths'], ['Hunnic Empire'], 'A', 'Rome and the Goths stopped Attila in Gaul.'),
    ('badr', 'Battle of Badr', 624, 23.73, 38.77, B, 'Battle_of_Badr', ['Early Muslims of Medina'], ['Quraysh of Mecca'], 'A', 'Muhammad\'s first major victory, which made the Muslim community a power in Arabia.'),
    ('yarmuk', 'Battle of the Yarmuk', 636, 32.8, 35.95, B, 'Battle_of_the_Yarmuk', ['Rashidun Caliphate'], ['Byzantine Empire'], 'A', 'Syria and Palestine were lost to Byzantium for good.'),
    ('qadisiyyah', 'Battle of al-Qadisiyyah', 636, 31.86, 44.43, B, 'Battle_of_al-Qadisiyyah', ['Rashidun Caliphate'], ['Sasanian Empire'], 'A', 'Iraq fell to the Arabs and the Sasanian capital Ctesiphon followed.'),
    ('nahavand', 'Battle of Nahavand', 642, 34.19, 48.37, B, 'Battle_of_Nahavand', ['Rashidun Caliphate'], ['Sasanian Empire'], 'A', 'The "victory of victories" that ended the Sasanian Empire as a state.'),
    ('baekgang', 'Battle of Baekgang', 663, 36.0, 126.7, B, 'Battle_of_Baekgang', ['Tang Dynasty', 'Silla'], ['Baekje', 'Yamato Japan'], 'A', 'Japan withdrew from Korea and turned to building a Chinese-style state at home.'),
    ('guadalete', 'Battle of Guadalete', 711, 36.6, -5.9, B, 'Battle_of_Guadalete', ['Umayyad Caliphate'], ['Visigothic Kingdom'], 'A', 'The Visigothic kingdom collapsed and most of Iberia became al-Andalus.'),
    ('constantinople_717', 'Siege of Constantinople', 717, 41.01, 28.98, S, 'Siege_of_Constantinople_(717%E2%80%93718)', ['Byzantine Empire'], ['Umayyad Caliphate'], 'A', 'Greek fire and the city walls held, and the caliphate stopped trying to take the city.'),
    ('tours', 'Battle of Tours', 732, 46.73, 0.4, B, 'Battle_of_Tours', ['Kingdom of the Franks'], ['Umayyad Caliphate'], 'A', 'Charles Martel stopped a raid into Gaul and his family rose to become the Carolingians.'),
    ('talas', 'Battle of Talas', 751, 42.52, 72.23, B, 'Battle_of_Talas', ['Abbasid Caliphate'], ['Tang Dynasty'], 'A', 'Marked the western limit of Tang power in Central Asia; legend says papermaking reached the Islamic world through it.'),
    ('bach_dang_938', 'Battle of Bach Dang', 938, 20.9, 106.8, B, 'Battle_of_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(938)', ['Vietnamese under Ngo Quyen'], ['Southern Han'], 'A', 'Stakes in the river wrecked the Chinese fleet and ended a thousand years of Chinese rule in Vietnam.'),
    ('lechfeld', 'Battle of Lechfeld', 955, 48.3, 10.9, B, 'Battle_of_Lechfeld', ['Kingdom of Germany'], ['Hungarians'], 'A', 'It ended Magyar raids on the West; the Hungarians settled and became a Christian kingdom.'),
    ('hastings', 'Battle of Hastings', 1066, 50.912, 0.487, B, 'Battle_of_Hastings', ['Duchy of Normandy'], ['Kingdom of England'], 'A', 'The Norman Conquest of England.'),
    ('manzikert', 'Battle of Manzikert', 1071, 39.15, 42.53, B, 'Battle_of_Manzikert', ['Great Seljuk Empire'], ['Byzantine Empire'], 'A', 'Anatolia opened to Turkish settlement and Byzantium called for help, which became the Crusades.'),
    ('siege_of_antioch_1098', 'Siege of Antioch', 1098, 36.2, 36.16, S, 'Siege_of_Antioch', ['First Crusade'], ['Seljuk Turks'], 'A', 'The Crusade survived its hardest moment and went on to Jerusalem.'),
    ('siege_of_jerusalem_1099', 'Siege of Jerusalem', 1099, 31.778, 35.235, S, 'Siege_of_Jerusalem_(1099)', ['First Crusade'], ['Fatimid Caliphate'], 'A', 'The Crusaders took the city and founded the Kingdom of Jerusalem.'),
    ('dan_no_ura', 'Battle of Dan-no-ura', 1185, 33.96, 130.95, B, 'Battle_of_Dan-no-ura', ['Minamoto clan'], ['Taira clan'], 'A', 'The Minamoto won the Genpei War and set up Japan\'s first shogunate.'),
    ('hattin', 'Battle of Hattin', 1187, 32.8, 35.45, B, 'Battle_of_Hattin', ['Ayyubid Sultanate'], ['Kingdom of Jerusalem'], 'A', 'Saladin destroyed the crusader army and retook Jerusalem.'),
    ('tarain_1192', 'Second Battle of Tarain', 1192, 29.8, 76.9, B, 'Second_Battle_of_Tarain', ['Ghurid Dynasty'], ['Chauhan Dynasty'], 'A', 'Opened north India to Turkic rule and the Delhi Sultanate.'),
    ('constantinople_1204', 'Sack of Constantinople', 1204, 41.01, 28.98, K, 'Sack_of_Constantinople', ['Fourth Crusade', 'Republic of Venice'], ['Byzantine Empire'], 'A', 'Christians sacked the greatest Christian city; Byzantium never fully recovered.'),
    ('las_navas_de_tolosa', 'Battle of Las Navas de Tolosa', 1212, 38.3, -3.6, B, 'Battle_of_Las_Navas_de_Tolosa', ['Kingdom of Castile', 'Crown of Aragon', 'Kingdom of Navarre'], ['Almohad Caliphate'], 'A', 'The turning point of the Reconquista.'),
    ('bouvines', 'Battle of Bouvines', 1214, 50.58, 3.22, B, 'Battle_of_Bouvines', ['Kingdom of France'], ['Holy Roman Empire', 'Kingdom of England'], 'A', 'It made the French monarchy dominant and helped force Magna Carta in England.'),
    ('siege_of_samarkand_1220', 'Siege of Samarkand', 1220, 39.65, 66.96, S, 'Siege_of_Samarkand_(1220)', ['Mongol Empire'], ['Khwarezmid Empire'], 'A', 'The Mongol conquest of Central Asia, one of history\'s deadliest campaigns.'),
    ('kirina', 'Battle of Kirina', 1235, 12.0, -8.2, B, 'Battle_of_Kirina', ['Mali Empire'], ['Sosso Empire'], 'A', 'Sundiata Keita founded the Mali Empire, remembered in the Epic of Sundiata.'),
    ('kiev_1240', 'Siege of Kiev', 1240, 50.45, 30.52, S, 'Siege_of_Kiev_(1240)', ['Mongol Empire'], ["Kievan Rus'"], 'A', 'Kiev was destroyed and Russia lived under the Golden Horde for two centuries.'),
    ('mohi', 'Battle of Mohi', 1241, 47.95, 20.97, B, 'Battle_of_Mohi', ['Mongol Empire'], ['Kingdom of Hungary'], 'A', 'Hungary was devastated; the Mongols turned back when the Great Khan died.'),
    ('siege_of_baghdad_1258', 'Siege of Baghdad', 1258, 33.31, 44.36, S, 'Siege_of_Baghdad_(1258)', ['Mongol Empire'], ['Abbasid Caliphate'], 'A', 'The Abbasid capital and its House of Wisdom were destroyed.'),
    ('ain_jalut', 'Battle of Ain Jalut', 1260, 32.55, 35.36, B, 'Battle_of_Ain_Jalut', ['Mamluk Sultanate'], ['Mongol Empire'], 'A', 'The first lasting Mongol defeat; Egypt and the holy cities of Islam were saved.'),
    ('xiangyang', 'Siege of Xiangyang', 1273, 32.0, 112.12, S, 'Battle_of_Xiangyang', ['Yuan Dynasty'], ['Southern Song'], 'A', 'Persian counterweight trebuchets broke a six-year siege and opened the Yangtze to the Mongols.'),
    ('yamen', 'Battle of Yamen', 1279, 22.2, 113.1, B, 'Battle_of_Yamen', ['Yuan Dynasty'], ['Southern Song'], 'A', 'The end of the Song dynasty; all of China came under Mongol rule.'),
    ('koan', 'Mongol invasion of Japan (Koan)', 1281, 33.6, 130.4, B, 'Mongol_invasions_of_Japan', ['Kamakura Shogunate'], ['Yuan Dynasty'], 'A', 'A typhoon, the "kamikaze", wrecked the invasion fleet.'),
    ('bach_dang_1288', 'Battle of Bach Dang', 1288, 20.85, 106.75, B, 'Battle_of_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(1288)', ['Dai Viet'], ['Yuan Dynasty'], 'A', 'Vietnam repeated its river-stake trick and drove off the Mongols.'),
    ('bannockburn', 'Battle of Bannockburn', 1314, 56.09, -3.92, B, 'Battle_of_Bannockburn', ['Kingdom of Scotland'], ['Kingdom of England'], 'A', 'It secured Scottish independence for three centuries.'),
    ('crecy', 'Battle of Crecy', 1346, 50.25, 1.88, B, 'Battle_of_Cr%C3%A9cy', ['Kingdom of England'], ['Kingdom of France'], 'A', 'The longbow beat mounted knights early in the Hundred Years\' War.'),
    ('kulikovo', 'Battle of Kulikovo', 1380, 53.67, 38.65, B, 'Battle_of_Kulikovo', ['Grand Principality of Moscow'], ['Golden Horde'], 'A', 'Moscow first beat the Horde in the open field and gained prestige as leader of the Russians.'),
    ('kosovo_1389', 'Battle of Kosovo', 1389, 42.7, 21.1, B, 'Battle_of_Kosovo', ['Ottoman Empire'], ['Serbian Despots'], 'A', 'Both rulers died; the Ottomans went on to absorb Serbia.'),
    ('sack_of_delhi_1398', 'Sack of Delhi', 1398, 28.65, 77.23, K, 'Siege_of_Delhi_(1398)', ['Timurid Empire'], ['Tughlaq Dynasty'], 'A', 'Timur wrecked the Delhi Sultanate, which never regained its old reach.'),
    ('ankara', 'Battle of Ankara', 1402, 40.1, 32.9, B, 'Battle_of_Ankara', ['Timurid Empire'], ['Ottoman Empire'], 'A', 'Sultan Bayezid was captured and Ottoman expansion paused for a generation, giving Byzantium 50 more years.'),
    ('grunwald', 'Battle of Grunwald', 1410, 53.48, 20.1, B, 'Battle_of_Grunwald', ['(Polish-Lithuania Kingdom)'], ['Teutonic Order'], 'A', 'Poland-Lithuania broke the Teutonic Knights and became the great power of eastern Europe.'),
    ('agincourt', 'Battle of Agincourt', 1415, 50.46, 2.14, B, 'Battle_of_Agincourt', ['Kingdom of England'], ['Kingdom of France'], 'A', 'English archers on muddy ground destroyed a much larger French army.'),
    ('orleans_1429', 'Siege of Orleans', 1429, 47.9, 1.9, S, 'Siege_of_Orl%C3%A9ans', ['Kingdom of France'], ['Kingdom of England'], 'A', 'Joan of Arc lifted the siege and the war turned France\'s way.'),
    ('fall_of_constantinople', 'Fall of Constantinople', 1453, 41.01, 28.98, S, 'Fall_of_Constantinople', ['Ottoman Empire'], ['Byzantine Empire'], 'A', 'The end of the Roman Empire in the east; the Ottomans now held the Bosporus.'),
    ('castillon', 'Battle of Castillon', 1453, 44.86, -0.04, B, 'Battle_of_Castillon', ['Kingdom of France'], ['Kingdom of England'], 'A', 'Cannon decided the last battle of the Hundred Years\' War.'),
    ('bosworth', 'Battle of Bosworth Field', 1485, 52.59, -1.41, B, 'Battle_of_Bosworth_Field', ['House of Tudor'], ['House of York'], 'A', 'Henry Tudor killed Richard III and ended the Wars of the Roses.'),
    ('fall_of_granada_1492', 'Fall of Granada', 1492, 37.18, -3.6, S, 'Granada_War', ['Crown of Castile', 'Crown of Aragon'], ['Emirate of Granada'], 'A', 'The last Muslim state in Iberia fell, the same year Columbus sailed.'),
    ('diu_1509', 'Battle of Diu', 1509, 20.71, 70.98, B, 'Battle_of_Diu_(1509)', ['Kingdom of Portugal'], ['Mamluk Sultanate', 'Sultanate of Gujarat'], 'A', 'Portugal won control of Indian Ocean sea lanes for a century.'),
    ('capture_of_malacca_1511', 'Capture of Malacca', 1511, 2.19, 102.25, S, 'Capture_of_Malacca_(1511)', ['Kingdom of Portugal'], ['Sultanate of Malacca'], 'A', 'Portugal seized the strait that carried the spice trade between India and China.'),
    ('chaldiran', 'Battle of Chaldiran', 1514, 39.1, 44.3, B, 'Battle_of_Chaldiran', ['Ottoman Empire'], ['Safavid Dynasty'], 'A', 'Ottoman guns beat Safavid cavalry and fixed the Sunni-Shia border roughly where it lies today.'),
    ('tenochtitlan', 'Fall of Tenochtitlan', 1521, 19.43, -99.13, S, 'Fall_of_Tenochtitlan', ['Spanish Empire', 'Tlaxcala'], ['Aztec Triple Alliance'], 'A', 'Smallpox, native allies and Spanish steel ended the Aztec state.'),
    ('panipat_1526', 'First Battle of Panipat', 1526, 29.39, 76.97, B, 'First_battle_of_Panipat', ['Mughal Empire'], ['Lodi Dynasty'], 'A', 'Babur\'s guns founded the Mughal Empire.'),
    ('mohacs', 'Battle of Mohacs', 1526, 45.99, 18.68, B, 'Battle_of_Moh%C3%A1cs', ['Ottoman Empire'], ['Kingdom of Hungary'], 'A', 'The Hungarian king died and Hungary was split between Ottomans and Habsburgs.'),
    ('siege_of_vienna_1529', 'Siege of Vienna', 1529, 48.21, 16.37, S, 'Siege_of_Vienna_(1529)', ['Habsburg Monarchy'], ['Ottoman Empire'], 'A', 'The high-water mark of Ottoman expansion into central Europe, at the end of a long supply line.'),
    ('cajamarca', 'Battle of Cajamarca', 1532, -7.16, -78.51, B, 'Battle_of_Cajamarca', ['Spanish Empire'], ['Inca Empire'], 'A', 'Pizarro captured Atahualpa; an empire already torn by civil war and smallpox fell.'),
    ('talikota', 'Battle of Talikota', 1565, 16.47, 76.31, B, 'Battle_of_Talikota', ['Deccan sultanates'], ['Vijayanagara Empire'], 'A', 'The capital Vijayanagara (Hampi) was sacked and abandoned.'),
    ('malta_1565', 'Great Siege of Malta', 1565, 35.89, 14.51, S, 'Great_Siege_of_Malta', ['Knights Hospitaller'], ['Ottoman Empire'], 'A', 'The island between the eastern and western Mediterranean held.'),
    ('lepanto', 'Battle of Lepanto', 1571, 38.25, 21.2, B, 'Battle_of_Lepanto', ['Holy League', 'Spanish Empire', 'Republic of Venice'], ['Ottoman Empire'], 'A', 'The last great battle of oared galleys; Ottoman naval prestige was broken in the west.'),
    ('alcacer_quibir', 'Battle of Alcacer Quibir', 1578, 35.0, -5.9, B, 'Battle_of_Alc%C3%A1cer_Quibir', ['Saadi Sultanate'], ['Kingdom of Portugal'], 'A', 'The Portuguese king died without an heir and Portugal fell to Spain.'),
    ('gravelines', 'Spanish Armada (Gravelines)', 1588, 51.0, 2.1, B, 'Spanish_Armada', ['Kingdom of England', 'Dutch Republic'], ['Spanish Empire'], 'A', 'Fireships and storms ruined the Armada and England stayed Protestant.'),
    ('tondibi', 'Battle of Tondibi', 1591, 16.5, 0.2, B, 'Battle_of_Tondibi', ['Saadi Sultanate'], ['Songhai Empire'], 'A', 'Moroccan musketeers crossed the Sahara and ended the Songhai Empire.'),
    ('hansan', 'Battle of Hansan Island', 1592, 34.75, 128.48, B, 'Battle_of_Hansan_Island', ['Joseon'], ['Warring States Japan'], 'A', 'Admiral Yi Sun-sin cut Japan\'s sea supply lines in the Imjin War.'),
    ('sekigahara', 'Battle of Sekigahara', 1600, 35.37, 136.46, B, 'Battle_of_Sekigahara', ['Eastern Army (Tokugawa)'], ['Western Army'], 'A', 'Tokugawa Ieyasu won Japan; his shogunate kept the peace for 250 years.'),
    ('white_mountain', 'Battle of White Mountain', 1620, 50.08, 14.32, B, 'Battle_of_White_Mountain', ['Holy Roman Empire'], ['Bohemian Estates'], 'A', 'Bohemia was re-Catholicised, an early stage of the Thirty Years\' War.'),
    ('breitenfeld', 'Battle of Breitenfeld', 1631, 51.4, 12.4, B, 'Battle_of_Breitenfeld_(1631)', ['Kingdom of Sweden', 'Electorate of Saxony'], ['Holy Roman Empire'], 'A', 'Gustavus Adolphus saved the Protestant cause with mobile firepower.'),
    ('rocroi', 'Battle of Rocroi', 1643, 49.93, 4.52, B, 'Battle_of_Rocroi', ['Kingdom of France'], ['Spanish Empire'], 'A', 'The Spanish infantry lost its aura; France became Europe\'s leading land power.'),
    ('shanhai_pass', 'Battle of Shanhai Pass', 1644, 40.0, 119.75, B, 'Battle_of_Shanhai_Pass', ['Qing Dynasty', 'Wu Sangui'], ['Shun dynasty (Li Zicheng)'], 'A', 'A Ming general opened the Great Wall\'s gate to the Manchus, who took Beijing.'),
    ('naseby', 'Battle of Naseby', 1645, 52.4, -0.99, B, 'Battle_of_Naseby', ['Parliament (New Model Army)'], ['Royalists'], 'A', 'The decisive battle of the English Civil War.'),
    ('battle_of_vienna_1683', 'Battle of Vienna', 1683, 48.26, 16.33, B, 'Battle_of_Vienna', ['Habsburg Monarchy', 'Polish-Lithuanian Commonwealth'], ['Ottoman Empire'], 'A', 'The great Polish cavalry charge; the Ottomans began two centuries of retreat in Europe.'),
    ('boyne', 'Battle of the Boyne', 1690, 53.72, -6.42, B, 'Battle_of_the_Boyne', ['William III'], ['James II'], 'A', 'Secured Protestant rule in Ireland and the Glorious Revolution.'),
    ('zenta', 'Battle of Zenta', 1697, 45.93, 20.08, B, 'Battle_of_Zenta', ['Habsburg Monarchy'], ['Ottoman Empire'], 'A', 'Led to the Treaty of Karlowitz, the first big Ottoman loss of territory.'),
    ('narva_1700', 'Battle of Narva', 1700, 59.38, 28.19, B, 'Battle_of_Narva_(1700)', ['Kingdom of Sweden'], ['Tsardom of Russia'], 'A', 'Defeat pushed Peter the Great to rebuild Russia\'s army on western lines.'),
    ('blenheim', 'Battle of Blenheim', 1704, 48.64, 10.6, B, 'Battle_of_Blenheim', ['Grand Alliance (Britain, Austria)'], ['Kingdom of France', 'Duchy of Bavaria'], 'A', 'Marlborough saved Vienna and broke Louis XIV\'s bid for mastery of Europe.'),
    ('poltava', 'Battle of Poltava', 1709, 49.59, 34.55, B, 'Battle_of_Poltava', ['Tsardom of Russia'], ['Kingdom of Sweden'], 'A', 'Sweden\'s empire ended and Russia became a European great power.'),
    ('karnal', 'Battle of Karnal', 1739, 29.69, 76.98, B, 'Battle_of_Karnal', ['Afsharid Iran'], ['Mughal Empire'], 'A', 'Nader Shah sacked Delhi and carried off the Peacock Throne; Mughal power never recovered.'),
    ('plassey', 'Battle of Plassey', 1757, 23.8, 88.25, B, 'Battle_of_Plassey', ['British East India Company'], ['Nawabs of Bengal', 'Kingdom of France'], 'A', 'The Company won Bengal, the richest province of India, and the base of the Raj.'),
    ('leuthen', 'Battle of Leuthen', 1757, 51.1, 16.8, B, 'Battle_of_Leuthen', ['Kingdom of Prussia'], ['Habsburg Monarchy'], 'A', 'Frederick the Great\'s oblique attack kept Prussia alive.'),
    ('plains_of_abraham_1759', 'Battle of the Plains of Abraham', 1759, 46.8, -71.22, B, 'Battle_of_the_Plains_of_Abraham', ['Kingdom of Great Britain'], ['Kingdom of France'], 'A', 'Britain took Quebec and with it Canada.'),
    ('panipat_1761', 'Third Battle of Panipat', 1761, 29.39, 76.97, B, 'Third_Battle_of_Panipat', ['Durrani Empire'], ['Maratha Empire'], 'A', 'One of the largest battles of the century; it checked Maratha expansion and opened the way for the British.'),
    ('buxar', 'Battle of Buxar', 1764, 25.57, 83.98, B, 'Battle_of_Buxar', ['British East India Company'], ['Mughal Empire', 'Nawabs of Bengal'], 'A', 'The Company gained the right to collect taxes in Bengal, Bihar and Orissa.'),
    ('chesma', 'Battle of Chesma', 1770, 38.3, 26.3, B, 'Battle_of_Chesma', ['Russian Empire'], ['Ottoman Empire'], 'A', 'A Russian fleet from the Baltic destroyed the Ottoman navy in the Aegean.'),
    ('saratoga', 'Battles of Saratoga', 1777, 43.0, -73.64, B, 'Battles_of_Saratoga', ['United States of America'], ['Kingdom of Great Britain'], 'A', 'A British army surrendered and France joined the American war.'),
    ('yorktown', 'Siege of Yorktown', 1781, 37.24, -76.51, S, 'Siege_of_Yorktown', ['United States of America', 'Kingdom of France'], ['Kingdom of Great Britain'], 'A', 'A French fleet trapped Cornwallis and American independence was won.'),
    ('valmy', 'Battle of Valmy', 1792, 49.08, 4.77, B, 'Battle_of_Valmy', ['French First Republic'], ['Kingdom of Prussia'], 'A', 'Goethe: "from this place and day begins a new era in the history of the world."'),
    ('pyramids', 'Battle of the Pyramids', 1798, 30.05, 31.2, B, 'Battle_of_the_Pyramids', ['French Directory'], ['Mamluks of Egypt'], 'A', 'Napoleon took Egypt, beginning modern European intervention in the Middle East.'),
    ('nile_1798', 'Battle of the Nile', 1798, 31.32, 30.07, B, 'Battle_of_the_Nile', ['Kingdom of Great Britain'], ['French Directory'], 'A', 'Nelson destroyed the French fleet and stranded Napoleon\'s army in Egypt.'),
    ('seringapatam', 'Siege of Seringapatam', 1799, 12.42, 76.69, S, 'Siege_of_Seringapatam_(1799)', ['British East India Company'], ['Kingdom of Mysore'], 'A', 'Tipu Sultan died and the strongest rival to British India fell.'),
    ('trafalgar', 'Battle of Trafalgar', 1805, 36.2, -6.03, B, 'Battle_of_Trafalgar', ['Kingdom of Great Britain'], ['First French Empire', 'Kingdom of Spain'], 'A', 'Britain ruled the seas for a century.'),
    ('austerlitz', 'Battle of Austerlitz', 1805, 49.13, 16.76, B, 'Battle_of_Austerlitz', ['First French Empire'], ['Austrian Empire', 'Russian Empire'], 'A', 'Napoleon\'s masterpiece; the Holy Roman Empire was dissolved the next year.'),
    ('jena', 'Battle of Jena-Auerstedt', 1806, 50.93, 11.59, B, 'Battle_of_Jena%E2%80%93Auerstedt', ['First French Empire'], ['Kingdom of Prussia'], 'A', 'Prussia collapsed in weeks, which drove its great military and civil reforms.'),
    ('borodino', 'Battle of Borodino', 1812, 55.52, 35.82, B, 'Battle_of_Borodino', ['First French Empire'], ['Russian Empire'], None, 'The bloodiest day of the Napoleonic wars; Napoleon took Moscow but lost his army in the retreat.'),
    ('leipzig', 'Battle of Leipzig', 1813, 51.31, 12.42, B, 'Battle_of_Leipzig', ['Russian Empire', 'Kingdom of Prussia', 'Austrian Empire', 'Kingdom of Sweden'], ['First French Empire'], 'A', 'The Battle of the Nations, the largest in Europe before 1914.'),
    ('waterloo', 'Battle of Waterloo', 1815, 50.68, 4.41, B, 'Battle_of_Waterloo', ['(British Empire)', 'Kingdom of Prussia'], ['First French Empire'], 'A', 'The end of Napoleon and the start of a century without a general European war.'),
    ('ayacucho', 'Battle of Ayacucho', 1824, -13.05, -74.13, B, 'Battle_of_Ayacucho', ['Gran Colombia', 'Peruvian patriots'], ['Spanish Empire'], 'A', 'Ended Spanish rule in South America.'),
    ('navarino', 'Battle of Navarino', 1827, 36.92, 21.68, B, 'Battle_of_Navarino', ['(British Empire)', 'Bourbon Kingdom of France', 'Russian Empire'], ['Ottoman Empire', 'Egypt (Muhammad Ali)'], 'A', 'Secured Greek independence; the last major battle fought entirely with sailing ships.'),
    ('san_jacinto', 'Battle of San Jacinto', 1836, 29.75, -95.08, B, 'Battle_of_San_Jacinto', ['Republic of Texas'], ['Centralist Mexico'], 'A', 'Texas won independence from Mexico.'),
    ('blood_river', 'Battle of Blood River', 1838, -28.1, 30.55, B, 'Battle_of_Blood_River', ['Voortrekkers'], ['Zululand'], 'A', 'Boer settlers beat the Zulu army, a founding story of Afrikaner nationalism.'),
    ('chapultepec', 'Battle of Chapultepec', 1847, 19.42, -99.18, B, 'Battle_of_Chapultepec', ['United States of America'], ['Federated Republic of Mexico'], 'A', 'Mexico City fell and Mexico lost half its territory to the United States.'),
    ('sevastopol', 'Siege of Sevastopol', 1855, 44.6, 33.52, S, 'Siege_of_Sevastopol_(1854%E2%80%931855)', ['(British Empire)', 'Second French Empire', 'Ottoman Empire'], ['Russian Empire'], 'A', 'Russia\'s defeat in the Crimean War pushed it to free the serfs.'),
    ('gettysburg', 'Battle of Gettysburg', 1863, 39.81, -77.23, B, 'Battle_of_Gettysburg', ['United States of America'], ['Confederate States of America'], 'A', 'The Confederacy\'s invasion of the North failed.'),
    ('vicksburg', 'Siege of Vicksburg', 1863, 32.35, -90.88, S, 'Siege_of_Vicksburg', ['United States of America'], ['Confederate States of America'], 'A', 'The Union won the Mississippi River and split the Confederacy in two.'),
    ('nanking_1864', 'Third Battle of Nanking', 1864, 32.06, 118.79, S, 'Third_Battle_of_Nanking', ['Qing Dynasty'], ['Taiping Heavenly Kingdom'], 'A', 'The end of the Taiping Rebellion, the deadliest civil war of the century.'),
    ('koniggratz', 'Battle of Koniggratz', 1866, 50.29, 15.83, B, 'Battle_of_K%C3%B6niggr%C3%A4tz', ['Kingdom of Prussia'], ['Austrian Empire'], 'A', 'Railways and breech-loading rifles; Prussia, not Austria, would unite Germany.'),
    ('sedan', 'Battle of Sedan', 1870, 49.7, 4.94, B, 'Battle_of_Sedan_(1870)', ['North German Confederation'], ['Second French Empire'], 'A', 'Napoleon III was captured, the German Empire was proclaimed, and France sought revenge for 40 years.'),
    ('little_bighorn', 'Battle of the Little Bighorn', 1876, 45.57, -107.43, B, 'Battle_of_the_Little_Bighorn', ['Lakota, Cheyenne and Arapaho'], ['United States of America'], 'A', 'The greatest Plains Indian victory, followed by the loss of the Black Hills.'),
    ('shiroyama', 'Battle of Shiroyama', 1877, 31.6, 130.55, B, 'Battle_of_Shiroyama', ['Empire of Japan'], ['Satsuma rebels'], 'A', 'The last samurai revolt; a conscript army beat the old warrior class.'),
    ('isandlwana', 'Battle of Isandlwana', 1879, -28.36, 30.65, B, 'Battle_of_Isandlwana', ['Zululand'], ['(British Empire)'], 'A', 'The worst British defeat by an indigenous army in the colonial era.'),
    ('yalu_1894', 'Battle of the Yalu River', 1894, 39.5, 123.6, B, 'Battle_of_the_Yalu_River_(1894)', ['Empire of Japan'], ['Qing Dynasty'], 'A', 'Japan replaced China as the leading power in East Asia.'),
    ('adwa', 'Battle of Adwa', 1896, 14.17, 38.9, B, 'Battle_of_Adwa', ['Ethiopian Empire'], ['Kingdom of Italy'], 'A', 'Ethiopia kept its independence through the Scramble for Africa.'),
    ('omdurman', 'Battle of Omdurman', 1898, 15.65, 32.48, B, 'Battle_of_Omdurman', ['(British Empire)', 'Khedivate of Egypt'], ['Mahdist State'], 'A', 'Machine guns against massed infantry; Britain took Sudan.'),
    ('tsushima', 'Battle of Tsushima', 1905, 34.5, 129.8, B, 'Battle_of_Tsushima', ['Empire of Japan'], ['Russian Empire'], 'A', 'An Asian power beat a European one at sea; Russia slid into revolution.'),
    ('marne_1914', 'First Battle of the Marne', 1914, 48.95, 3.3, B, 'First_Battle_of_the_Marne', ['French Third Republic', '(British Empire)'], ['German Empire'], 'A', 'Germany\'s plan for a quick war failed and the trenches began.'),
    ('tannenberg_1914', 'Battle of Tannenberg', 1914, 53.5, 20.1, B, 'Battle_of_Tannenberg', ['German Empire'], ['Russian Empire'], 'A', 'A Russian army was encircled and destroyed in East Prussia.'),
    ('gallipoli', 'Gallipoli campaign', 1915, 40.23, 26.28, B, 'Gallipoli_campaign', ['Ottoman Empire'], ['(British Empire)', 'French Third Republic'], 'A', 'The Allies failed to force the Dardanelles; Mustafa Kemal made his name.'),
    ('verdun', 'Battle of Verdun', 1916, 49.2, 5.4, B, 'Battle_of_Verdun', ['French Third Republic'], ['German Empire'], 'A', 'Ten months of attrition that came to stand for the whole war in France.'),
    ('somme', 'Battle of the Somme', 1916, 50.0, 2.7, B, 'Battle_of_the_Somme', ['(British Empire)', 'French Third Republic'], ['German Empire'], None, 'A million casualties for a few miles of ground.'),
    ('caporetto', 'Battle of Caporetto', 1917, 46.25, 13.58, B, 'Battle_of_Caporetto', ['Austria-Hungary', 'German Empire'], ['Kingdom of Italy'], 'A', 'Infiltration tactics broke the Italian front.'),
    ('warsaw_1920', 'Battle of Warsaw', 1920, 52.23, 21.0, B, 'Battle_of_Warsaw_(1920)', ['Republic of Poland'], ['Soviet Russia'], 'A', 'The Red Army\'s march west was stopped.'),
    ('battle_of_britain', 'Battle of Britain', 1940, 51.3, 0.5, B, 'Battle_of_Britain', ['(British Empire)'], ['Nazi Germany'], 'A', 'The first defeat of Hitler\'s forces; the invasion of Britain was called off.'),
    ('moscow_1941', 'Battle of Moscow', 1941, 55.75, 37.6, B, 'Battle_of_Moscow', ['Union of Soviet Socialist Republics'], ['Nazi Germany'], 'A', 'The German blitzkrieg stalled in the winter before Moscow.'),
    ('leningrad', 'Siege of Leningrad', 1941, 59.94, 30.31, S, 'Siege_of_Leningrad', ['Union of Soviet Socialist Republics'], ['Nazi Germany'], 'A', 'A siege of 872 days in which about a million civilians died.'),
    ('pearl_harbor', 'Attack on Pearl Harbor', 1941, 21.36, -157.95, B, 'Attack_on_Pearl_Harbor', ['Empire of Japan'], ['United States of America'], 'A', 'Brought the United States into the Second World War.'),
    ('fall_of_singapore_1942', 'Fall of Singapore', 1942, 1.35, 103.82, S, 'Fall_of_Singapore', ['Empire of Japan'], ['(British Empire)'], 'A', 'The largest British surrender in history, at the gate of the Malacca Strait.'),
    ('midway', 'Battle of Midway', 1942, 28.2, -177.37, B, 'Battle_of_Midway', ['United States of America'], ['Empire of Japan'], 'A', 'Four Japanese carriers sunk; the Pacific war turned.'),
    ('el_alamein', 'Second Battle of El Alamein', 1942, 30.83, 28.95, B, 'Second_Battle_of_El_Alamein', ['(British Empire)'], ['Nazi Germany', 'Kingdom of Italy'], 'A', 'Suez was saved and the Axis was driven out of Egypt.'),
    ('stalingrad', 'Battle of Stalingrad', 1942, 48.7, 44.5, B, 'Battle_of_Stalingrad', ['Union of Soviet Socialist Republics'], ['Nazi Germany'], 'A', 'A German army was destroyed on the Volga, the turning point in Europe.'),
    ('kursk', 'Battle of Kursk', 1943, 51.73, 36.19, B, 'Battle_of_Kursk', ['Union of Soviet Socialist Republics'], ['Nazi Germany'], 'A', 'The last German offensive in the east; the initiative passed to the Soviets for good.'),
    ('normandy', 'Normandy landings', 1944, 49.34, -0.6, B, 'Normandy_landings', ['United States of America', '(British Empire)', 'Free French'], ['Nazi Germany'], 'A', 'The largest seaborne invasion in history opened the western front.'),
    ('leyte_gulf', 'Battle of Leyte Gulf', 1944, 10.4, 125.5, B, 'Battle_of_Leyte_Gulf', ['United States of America'], ['Empire of Japan'], 'A', 'Probably the largest naval battle ever; the Japanese navy ceased to be a fighting force.'),
    ('battle_of_berlin_1945', 'Battle of Berlin', 1945, 52.52, 13.4, B, 'Battle_of_Berlin', ['Union of Soviet Socialist Republics'], ['Nazi Germany'], 'A', 'Hitler died and the war in Europe ended.'),
    ('okinawa', 'Battle of Okinawa', 1945, 26.5, 127.9, B, 'Battle_of_Okinawa', ['United States of America'], ['Empire of Japan'], 'A', 'The cost of Okinawa shaped the decision to use the atomic bomb.'),
    ('huaihai', 'Huaihai campaign', 1948, 34.2, 117.2, B, 'Huaihai_campaign', ['Communist Party of China'], ['Republic of China'], 'A', 'The Communists destroyed the Nationalist field armies and won the Chinese Civil War.'),
    ('inchon', 'Battle of Inchon', 1950, 37.47, 126.6, B, 'Battle_of_Inchon', ['United States of America', 'Republic of Korea'], ["Democratic People's Republic of Korea"], 'A', 'A landing behind the lines reversed the Korean War.'),
    ('dien_bien_phu', 'Battle of Dien Bien Phu', 1954, 21.39, 103.02, S, 'Battle_of_Dien_Bien_Phu', ['Democratic Republic of Vietnam'], ['French Fourth Republic'], 'A', 'The end of French Indochina and a signal to colonised peoples everywhere.'),
    ('tet', 'Tet Offensive (Hue)', 1968, 16.47, 107.59, B, 'Tet_Offensive', ['Republic of Vietnam', 'United States of America'], ['Democratic Republic of Vietnam'], None, 'A military defeat for the North that still turned American opinion against the war.'),
]


def main():
    polities = {}
    for line in open(os.path.join(OUT, 'polities.jsonl')):
        r = json.loads(line)
        polities[r['ext']['cliopatria']] = r
    events, rels, loose = [], [], []
    for (slug, name, year, lat, lon, sub, wiki, a, b, win, why) in BATTLES:
        url = 'https://en.wikipedia.org/wiki/' + wiki
        sides = []
        for k, side in enumerate((a, b)):
            out = []
            for n in side:
                p = polities.get(n)
                if p:
                    if not (p['start'] - 50 <= year <= (p['end'] or 2024) + 50):
                        print(f'warning: {slug}: {n} exists {p["start"]}..{p["end"]}, not in {year}')
                    out.append({'name': p['name'], 'polity': p['id']})
                    rels.append({'id': f'rel:{p["id"][7:]}_in_{slug}', 'kind': 'relation', 'type': 'participant_in',
                                 'from': p['id'], 'to': f'event:{slug}', 'start': year, 'end': year,
                                 'note': ('won' if win == 'AB'[k] else 'lost' if win else 'inconclusive'),
                                 'lenses': ['military'], 'sources': [{'cite': f'Wikipedia: {name}', 'url': url}],
                                 'status': 'draft'})
                else:
                    loose.append(n)
                    out.append({'name': n})
            sides.append(out)
        events.append({'id': f'event:{slug}', 'kind': 'event', 'subtype': sub, 'name': name,
                       'lenses': ['military'], 'start': year, 'end': year, 'start_approx': year < 0,
                       'lat': lat, 'lon': lon, 'sides': sides, 'winner': {'A': 0, 'B': 1}.get(win), 'why': why,
                       'sources': [{'cite': f'Wikipedia: {name} (written from general knowledge; check date, place and sides)', 'url': url}],
                       'status': 'draft'})
    with open(os.path.join(OUT, 'battles.jsonl'), 'w', encoding='utf-8') as f:
        for r in events + rels:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(events)} battles, {len(rels)} links to polities; sides kept as text: {len(set(loose))}')


if __name__ == '__main__':
    main()
