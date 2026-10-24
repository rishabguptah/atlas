# Curated disease and climate records for the Atlas kernel (schema v0).
# Every record here was written from the cited works by a model, so it ships as status "draft"
# until the judge workstream checks it against the source.
#
# Run: python3 ingest/disease-climate/records.py
# Writes data/disease-climate/{events,relations,places,routes}.jsonl and geo/black_death_routes.geojson.

import json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'data', 'disease-climate')

# ---- Sources, cited by key ----
SRC = {
    'benedictow': {'cite': 'Benedictow, O. J. (2004). The Black Death 1346-1353: The Complete History. Boydell Press.'},
    'spyrou2022': {'cite': 'Spyrou, M. A. et al. (2022). The source of the Black Death in fourteenth-century central Eurasia. Nature 606, 718-724.', 'url': 'https://doi.org/10.1038/s41586-022-04800-3'},
    'christakos': {'cite': 'Christakos, G. et al. (2005). Interdisciplinary Public Health Reasoning and Epidemic Modelling: The Case of Black Death. Springer.'},
    'dols': {'cite': 'Dols, M. W. (1977). The Black Death in the Middle East. Princeton University Press.'},
    'wheelis': {'cite': 'Wheelis, M. (2002). Biological warfare at the 1346 siege of Caffa. Emerging Infectious Diseases 8(9).', 'url': 'https://doi.org/10.3201/eid0809.010536'},
    'harper': {'cite': 'Harper, K. (2017). The Fate of Rome: Climate, Disease, and the End of an Empire. Princeton University Press.'},
    'thucydides': {'cite': 'Thucydides, History of the Peloponnesian War, 2.47-54.'},
    'mordechai2019': {'cite': 'Mordechai, L. et al. (2019). The Justinianic Plague: An inconsequential pandemic? PNAS 116(51).', 'url': 'https://doi.org/10.1073/pnas.1903797116'},
    'acuna2002': {'cite': 'Acuna-Soto, R. et al. (2002). Megadrought and megadeath in 16th century Mexico. Emerging Infectious Diseases 8(4).', 'url': 'https://doi.org/10.3201/eid0804.010175'},
    'crosby': {'cite': 'Crosby, A. W. (1972). The Columbian Exchange. Greenwood.'},
    'koch2019': {'cite': 'Koch, A. et al. (2019). Earth system impacts of the European arrival and Great Dying in the Americas after 1492. Quaternary Science Reviews 207.', 'url': 'https://doi.org/10.1016/j.quascirev.2018.12.004'},
    'mcneill2010': {'cite': 'McNeill, J. R. (2010). Mosquito Empires: Ecology and War in the Greater Caribbean, 1620-1914. Cambridge University Press.'},
    'spreeuwenberg2018': {'cite': 'Spreeuwenberg, P. et al. (2018). Reassessing the global mortality burden of the 1918 influenza pandemic. American Journal of Epidemiology 187(12).', 'url': 'https://doi.org/10.1093/aje/kwy191'},
    'johnson2002': {'cite': 'Johnson, N. and Mueller, J. (2002). Updating the accounts: global mortality of the 1918-1920 Spanish influenza pandemic. Bulletin of the History of Medicine 76(1).'},
    'faria2014': {'cite': 'Faria, N. R. et al. (2014). The early spread and epidemic ignition of HIV-1 in human populations. Science 346(6205).', 'url': 'https://doi.org/10.1126/science.1256739'},
    'unaids': {'cite': 'UNAIDS Global AIDS Update (2024).', 'url': 'https://www.unaids.org/en/resources/fact-sheet'},
    'who_covid': {'cite': 'WHO COVID-19 dashboard, deaths reported to WHO.', 'url': 'https://data.who.int/dashboards/covid19/deaths'},
    'economist_excess': {'cite': 'The Economist excess-deaths model (2023).', 'url': 'https://www.economist.com/graphic-detail/coronavirus-excess-deaths-estimates'},
    'who_plague': {'cite': 'WHO, Plague fact sheet; Echenberg, M. (2007). Plague Ports. NYU Press.'},
    'jordan1996': {'cite': 'Jordan, W. C. (1996). The Great Famine: Northern Europe in the Early Fourteenth Century. Princeton University Press.'},
    'dewitte2013': {'cite': 'DeWitte, S. and Slavin, P. (2013). Between famine and death: England on the eve of the Black Death. Journal of Interdisciplinary History 44(1).'},
    'davis2001': {'cite': 'Davis, M. (2001). Late Victorian Holocausts: El Nino Famines and the Making of the Third World. Verso.'},
    'grada': {'cite': 'O Grada, C. (2009). Famine: A Short History. Princeton University Press.'},
    'dikotter': {'cite': 'Dikotter, F. (2010). Mao\'s Great Famine. Bloomsbury.'},
    'yang2012': {'cite': 'Yang, J. (2012). Tombstone: The Great Chinese Famine, 1958-1962. Farrar, Straus and Giroux.'},
    'sen1981': {'cite': 'Sen, A. (1981). Poverty and Famines. Oxford University Press.'},
    'conquest': {'cite': 'Applebaum, A. (2017). Red Famine: Stalin\'s War on Ukraine. Doubleday.'},
    'devereux': {'cite': 'de Waal, A. (1991). Evil Days: Thirty Years of War and Famine in Ethiopia. Human Rights Watch.'},
    'verosub2008': {'cite': 'Verosub, K. L. and Lippman, J. (2008). Global impacts of the 1600 eruption of Peru\'s Huaynaputina volcano. Eos 89(15).', 'url': 'https://doi.org/10.1029/2008EO150001'},
    'dunning': {'cite': 'Dunning, C. S. L. (2001). Russia\'s First Civil War: The Time of Troubles and the Founding of the Romanov Dynasty. Penn State Press.'},
    'thordarson2003': {'cite': 'Thordarson, T. and Self, S. (2003). Atmospheric and environmental effects of the 1783-1784 Laki eruption. Journal of Geophysical Research 108(D1).', 'url': 'https://doi.org/10.1029/2001JD002042'},
    'oppenheimer2003': {'cite': 'Oppenheimer, C. (2003). Climatic, environmental and human consequences of the largest known historic eruption: Tambora volcano (Indonesia) 1815. Progress in Physical Geography 27(2).'},
    'oppenheimer2018': {'cite': 'Oppenheimer, C. et al. (2018). The Eldgja eruption: timing, long-range impacts and influence on the Christianisation of Iceland. Climatic Change 147.', 'url': 'https://doi.org/10.1007/s10584-018-2171-9'},
    'lavigne2013': {'cite': 'Lavigne, F. et al. (2013). Source of the great A.D. 1257 mystery eruption unveiled, Samalas volcano, Rinjani Volcanic Complex, Indonesia. PNAS 110(42).', 'url': 'https://doi.org/10.1073/pnas.1307520110'},
    'miller2012': {'cite': 'Miller, G. H. et al. (2012). Abrupt onset of the Little Ice Age triggered by volcanism and sustained by sea-ice/ocean feedbacks. Geophysical Research Letters 39.', 'url': 'https://doi.org/10.1029/2011GL050168'},
    'sigl2015': {'cite': 'Sigl, M. et al. (2015). Timing and climate forcing of volcanic eruptions for the past 2,500 years. Nature 523, 543-549.', 'url': 'https://doi.org/10.1038/nature14565'},
    'buntgen2016': {'cite': 'Buntgen, U. et al. (2016). Cooling and societal change during the Late Antique Little Ice Age from 536 to around 660 AD. Nature Geoscience 9, 231-236.', 'url': 'https://doi.org/10.1038/ngeo2652'},
    'mcconnell2020': {'cite': 'McConnell, J. R. et al. (2020). Extreme climate after massive eruption of Alaska\'s Okmok volcano in 43 BCE and effects on the late Roman Republic and Ptolemaic Kingdom. PNAS 117(27).', 'url': 'https://doi.org/10.1073/pnas.2002722117'},
    'friedrich2006': {'cite': 'Friedrich, W. L. et al. (2006). Santorini eruption radiocarbon dated to 1627-1600 B.C. Science 312(5773).', 'url': 'https://doi.org/10.1126/science.1125087'},
    'pliny': {'cite': 'Pliny the Younger, Letters 6.16 and 6.20.'},
    'simkin': {'cite': 'Simkin, T. and Fiske, R. S. (1983). Krakatau 1883: The Volcanic Eruption and Its Effects. Smithsonian.'},
    'self1996': {'cite': 'Self, S. et al. (1996). The atmospheric impact of the 1991 Mount Pinatubo eruption. In Fire and Mud, USGS / PHIVOLCS.', 'url': 'https://pubs.usgs.gov/pinatubo/self/'},
    'williams2012': {'cite': 'Williams, M. (2012). Did the 73 ka Toba super-eruption have an enduring effect? Quaternary International 269.'},
    'weiss1993': {'cite': 'Weiss, H. et al. (1993). The genesis and collapse of third millennium North Mesopotamian civilization. Science 261(5124).', 'url': 'https://doi.org/10.1126/science.261.5124.995'},
    'kaniewski2013': {'cite': 'Kaniewski, D. et al. (2013). Environmental roots of the Late Bronze Age crisis. PLoS ONE 8(8).', 'url': 'https://doi.org/10.1371/journal.pone.0071004'},
    'cline2014': {'cite': 'Cline, E. H. (2014). 1177 B.C.: The Year Civilization Collapsed. Princeton University Press.'},
    'mccormick2012': {'cite': 'McCormick, M. et al. (2012). Climate change during and after the Roman Empire. Journal of Interdisciplinary History 43(2).'},
    'haug2003': {'cite': 'Haug, G. H. et al. (2003). Climate and the collapse of Maya civilization. Science 299(5613).', 'url': 'https://doi.org/10.1126/science.1080444'},
    'kennett2012': {'cite': 'Kennett, D. J. et al. (2012). Development and disintegration of Maya political systems in response to climate change. Science 338(6108).', 'url': 'https://doi.org/10.1126/science.1226299'},
    'mann2009': {'cite': 'Mann, M. E. et al. (2009). Global signatures and dynamical origins of the Little Ice Age and Medieval Climate Anomaly. Science 326(5957).', 'url': 'https://doi.org/10.1126/science.1177303'},
    'parker2013': {'cite': 'Parker, G. (2013). Global Crisis: War, Climate Change and Catastrophe in the Seventeenth Century. Yale University Press.'},
    'buckley2010': {'cite': 'Buckley, B. M. et al. (2010). Climate as a contributing factor in the demise of Angkor, Cambodia. PNAS 107(15).', 'url': 'https://doi.org/10.1073/pnas.0910827107'},
    'dugmore2012': {'cite': 'Dugmore, A. J. et al. (2012). Cultural adaptation, compounding vulnerabilities and conjunctures in Norse Greenland. PNAS 109(10).', 'url': 'https://doi.org/10.1073/pnas.1115292109'},
    'demenocal2000': {'cite': 'deMenocal, P. et al. (2000). Abrupt onset and termination of the African Humid Period. Quaternary Science Reviews 19.'},
    'worster': {'cite': 'Worster, D. (1979). Dust Bowl: The Southern Plains in the 1930s. Oxford University Press.'},
    'giannini2003': {'cite': 'Giannini, A. et al. (2003). Oceanic forcing of Sahel rainfall on interannual to interdecadal time scales. Science 302(5647).', 'url': 'https://doi.org/10.1126/science.1089357'},
    'ipcc_ar6': {'cite': 'IPCC (2021). Climate Change 2021: The Physical Science Basis, Summary for Policymakers.', 'url': 'https://www.ipcc.ch/report/ar6/wg1/'},
    'shelley': {'cite': 'Shelley, M. (1831). Frankenstein, introduction to the 1831 edition.'},
    'wood2014': {'cite': 'Wood, G. D. (2014). Tambora: The Eruption That Changed the World. Princeton University Press.'},
    'bourke': {'cite': 'Bryce, T. (2005). The Kingdom of the Hittites. Oxford University Press (Plague Prayers of Mursili II).'},
    'porter': {'cite': 'Porter, S. (2009). The Great Plague. Amberley; Bills of Mortality, City of London.'},
    'biraben': {'cite': 'Biraben, J.-N. (1975). Les hommes et la peste en France et dans les pays europeens et mediterraneens. Mouton.'},
    'pollitzer': {'cite': 'Pollitzer, R. (1959). Cholera. World Health Organization Monograph 43.'},
    'valleron2010': {'cite': 'Valleron, A.-J. et al. (2010). Transmissibility and geographic spread of the 1889 influenza pandemic. PNAS 107(19).', 'url': 'https://doi.org/10.1073/pnas.1000886107'},
    'dyer': {'cite': 'Dyer, A. (1978). The influence of bubonic plague in England 1500-1667; Wylie, J. and Collier, L. (1981). The English sweating sickness (Sudor Anglicus): a reappraisal. Journal of the History of Medicine 36(4).'},
    'muroi': {'cite': 'Kikuchi, I. (1997). Kinsei no kikin (Famines of early modern Japan); Jansen, M. (2000). The Making of Modern Japan. Harvard.'},
    'grove': {'cite': 'Grove, R. H. (2007). The Great El Nino of 1789-93 and its global consequences. Medieval History Journal 10(1-2).'},
    'dickson': {'cite': 'Dickson, D. (1997). Arctic Ireland: The Extraordinary Story of the Great Frost and Forgotten Famine of 1740-41. White Row.'},
    'jutikkala': {'cite': 'Jutikkala, E. (1955). The great Finnish famine in 1696-97. Scandinavian Economic History Review 3(1).'},
    'wood_laki': {'cite': 'Wood, C. A. (1992). The climatic effects of the 1783 Laki eruption. In Harington (ed.), The Year Without a Summer?'},
}

def S(*keys):
    return [SRC[k] for k in keys]

# ---- Events: epidemics, famines, eruptions, climate shifts ----
# (slug, subtype, name, start, end, lat, lon, deaths or None, lenses, sources, what, why, extras)
# Note: 'climate_shift' is a new event subtype proposed by this workstream (schema v0 has none for climate periods).
EV = []
def ev(slug, subtype, name, start, end, lat, lon, deaths, lenses, src, what, why, **x):
    EV.append(dict(slug=slug, subtype=subtype, name=name, start=start, end=end, lat=lat, lon=lon,
                   deaths=deaths, lenses=lenses, src=src, what=what, why=why, x=x))

# Epidemics
ev('hittite_plague', 'epidemic', 'Plague of Mursili', -1322, -1300, 40.02, 34.62, None, ['disease', 'religion'], S('bourke'),
   'An epidemic brought home by Egyptian prisoners of war that raged in the Hittite kingdom for some twenty years.',
   'King Mursili II\'s prayers blaming it on his father\'s broken oath are among the oldest written reactions to an epidemic.',
   start_approx=True, end_approx=True)
ev('plague_of_athens', 'epidemic', 'Plague of Athens', -430, -426, 37.97, 23.73, [75000, 100000], ['disease', 'military', 'order'], S('thucydides'),
   'An unidentified epidemic that killed perhaps a quarter of Athens while it sat behind its Long Walls during the Peloponnesian War.',
   'It killed Pericles, and Thucydides, who caught it and lived, described how fear dissolved law and religion in the city.')
ev('antonine_plague', 'epidemic', 'Antonine Plague', 165, 180, 41.9, 12.5, [5000000, 10000000], ['disease', 'order'], S('harper'),
   'Probably smallpox, carried home by legions returning from Mesopotamia; it struck the empire at its height.',
   'The first pandemic in recorded history; Harper reads it as the moment the Roman climate optimum and good luck ran out.')
ev('plague_of_cyprian', 'epidemic', 'Plague of Cyprian', 249, 262, 36.85, 10.32, None, ['disease', 'religion', 'order'], S('harper'),
   'A pandemic, possibly a viral haemorrhagic fever, named for the bishop of Carthage who described it.',
   'It hit during the Crisis of the Third Century, and Christian care for the sick may have helped the church grow.',
   start_approx=True)
ev('plague_of_justinian', 'epidemic', 'Plague of Justinian', 541, 549, 41.01, 28.98, [15000000, 100000000], ['disease', 'order', 'economy'], S('harper', 'mordechai2019'),
   'The first known pandemic of Yersinia pestis, reaching Constantinople in 542 and returning in waves until about 750.',
   'Historians disagree sharply on its toll: Harper sees an empire-breaking catastrophe, Mordechai et al. see far smaller effects.',
   start_range=[541, 542])
ev('black_death', 'epidemic', 'Black Death', 1346, 1353, 45.03, 35.38, [75000000, 200000000], ['disease', 'economy', 'religion', 'order', 'population'],
   S('benedictow', 'spyrou2022', 'dols'),
   'Plague spread from the steppe to the Crimea, then by ship and caravan across the Mediterranean, the Near East and Europe.',
   'It killed something like 30 to 60 percent of Europe and raised wages for the survivors, reshaping labour, faith and power.',
   place='place:kaffa')
ev('sweating_sickness', 'epidemic', 'English sweating sickness', 1485, 1551, 51.51, -0.13, None, ['disease'], S('dyer'),
   'A fast-killing fever of unknown cause that struck England in five waves and then vanished.',
   'It could kill within hours and mostly hit the well-off, then disappeared so completely that its cause is still a mystery.')
ev('smallpox_aztec', 'epidemic', 'Smallpox in the Aztec Empire', 1520, 1521, 19.43, -99.13, [5000000, 8000000], ['disease', 'military', 'population'], S('crosby'),
   'Smallpox reached Tenochtitlan in 1520 with Narvaez\'s expedition and killed the emperor Cuitlahuac among many others.',
   'Without immunity, the epidemic did more than Spanish steel to decide the fall of Tenochtitlan.',
   deaths_approx=True)
ev('cocoliztli_1545', 'epidemic', 'Cocoliztli epidemic', 1545, 1548, 19.43, -99.13, [5000000, 15000000], ['disease', 'population', 'geography'], S('acuna2002'),
   'A haemorrhagic fever that killed perhaps 80 percent of the native population of central Mexico.',
   'Acuna-Soto links its timing to a megadrought in the tree-ring record, an early disease-climate link.')
ev('great_plague_london', 'epidemic', 'Great Plague of London', 1665, 1666, 51.51, -0.13, [75000, 100000], ['disease', 'literature'], S('porter'),
   'The last major outbreak of plague in England, recorded week by week in the Bills of Mortality.',
   'Pepys watched it from the city, and Newton went home to Woolsthorpe to wait it out.')
ev('plague_of_marseille', 'epidemic', 'Great Plague of Marseille', 1720, 1722, 43.3, 5.37, [90000, 126000], ['disease', 'economy'], S('biraben'),
   'Plague arrived on the trading ship Grand-Saint-Antoine from the Levant and killed about half of Marseille.',
   'Merchants pushed to unload the cargo for a fair, and the quarantine wall built afterwards became a model for later plague control.')
ev('yellow_fever_haiti', 'epidemic', 'Yellow fever in Saint-Domingue', 1802, 1803, 18.54, -72.34, [24000, 50000], ['disease', 'military'], S('mcneill2010'),
   'Yellow fever destroyed most of the army Napoleon sent to retake Saint-Domingue.',
   'McNeill argues mosquitoes helped make Haiti independent and pushed Napoleon to sell Louisiana.')
ev('cholera_1817', 'epidemic', 'First cholera pandemic', 1817, 1824, 23.17, 89.21, None, ['disease', 'economy'], S('pollitzer'),
   'Cholera spread out of the Ganges delta along British military and trade routes to Southeast Asia, the Gulf and Russia.',
   'The first of seven cholera pandemics, and the start of modern public health through sewers and clean water.')
ev('third_plague_pandemic', 'epidemic', 'Third plague pandemic', 1855, 1960, 25.04, 102.71, [12000000, 15000000], ['disease', 'economy', 'ideas'], S('who_plague'),
   'Plague moved from Yunnan to Hong Kong in 1894, then by steamship to every inhabited continent.',
   'Yersin identified the plague bacillus in Hong Kong in 1894, and India suffered most of the deaths.',
   end_approx=True)
ev('russian_flu_1889', 'epidemic', '1889-1890 pandemic', 1889, 1890, 59.93, 30.34, [1000000, 1000000], ['disease'], S('valleron2010'),
   'A respiratory pandemic first reported in St Petersburg that circled the world in about four months on railways and steamships.',
   'The first pandemic to spread at the speed of modern transport; its cause, influenza or a coronavirus, is still debated.',
   deaths_approx=True)
ev('influenza_1918', 'epidemic', '1918 influenza pandemic', 1918, 1920, 39.06, -96.79, [17000000, 100000000], ['disease', 'military', 'population'],
   S('spreeuwenberg2018', 'johnson2002'),
   'An H1N1 influenza that spread with troops at the end of the First World War, unusually deadly to young adults.',
   'Where it started is disputed; Kansas, the British camp at Etaples and northern China all have advocates.')
ev('hiv_aids', 'epidemic', 'HIV/AIDS pandemic', 1920, None, -4.32, 15.31, [40000000, 45000000], ['disease', 'population'], S('faria2014', 'unaids'),
   'HIV-1 group M spread from Kinshasa in the 1920s along railways and river routes, then worldwide from the 1970s.',
   'Recognised only in 1981, decades after it began spreading; about 42 million people have died of it.',
   start_approx=True)
ev('covid_19', 'epidemic', 'COVID-19 pandemic', 2019, 2023, 30.59, 114.31, [7000000, 27000000], ['disease', 'economy', 'order'], S('who_covid', 'economist_excess'),
   'A coronavirus first identified in Wuhan that spread worldwide within three months.',
   'About 7 million deaths were reported to WHO; excess-death estimates run three to four times higher.')

# Famines
ev('great_famine_1315', 'famine', 'Great Famine', 1315, 1317, 50.85, 4.35, None, ['geography', 'population', 'order'], S('jordan1996'),
   'Years of cold and endless rain ruined harvests across northern Europe, followed by cattle plague.',
   'It ended the medieval population boom and left a generation weakened thirty years before the Black Death.')
ev('russian_famine_1601', 'famine', 'Russian famine of 1601-1603', 1601, 1603, 55.76, 37.62, [2000000, 2000000], ['geography', 'order', 'population'], S('verosub2008', 'dunning'),
   'Frosts in summer 1601 destroyed three harvests running and killed perhaps a third of Muscovy.',
   'It opened the Time of Troubles, Russia\'s near-collapse before the Romanovs.',
   deaths_approx=True)
ev('finnish_famine_1696', 'famine', 'Great Finnish famine', 1695, 1697, 61.5, 23.76, None, ['geography', 'population'], S('jutikkala'),
   'Cold during the late Maunder Minimum ruined harvests in Finland and Estonia.',
   'Roughly a quarter to a third of Finland died, proportionally one of the worst famines in European history.')
ev('irish_famine_1740', 'famine', 'Irish famine of 1740-1741', 1740, 1741, 53.35, -6.26, [300000, 480000], ['geography', 'population'], S('dickson'),
   'The Great Frost of 1739-40 froze rivers and killed the potato crop in the ground.',
   'Proportionally as deadly as the better-known famine a century later, and nearly forgotten.')
ev('bengal_famine_1770', 'famine', 'Bengal famine of 1770', 1769, 1771, 23.5, 88.5, [1000000, 10000000], ['economy', 'population', 'order'], S('sen1981', 'grada'),
   'Drought and East India Company revenue collection combined to starve Bengal, recently taken over by the Company.',
   'Estimates run from about one to ten million deaths, and the scandal helped bring the Company under Parliament.')
ev('tenmei_famine', 'famine', 'Tenmei famine', 1782, 1788, 39.7, 140.1, None, ['geography', 'order', 'population'], S('muroi'),
   'Cold summers and the Asama eruption ruined rice harvests across northern Japan.',
   'Rice riots followed in Edo and Osaka, and the shogunate answered with the Kansei reforms.')
ev('chalisa_famine', 'famine', 'Chalisa famine', 1783, 1784, 28.6, 77.2, [11000000, 11000000], ['geography', 'population'], S('grove'),
   'A failed monsoon devastated north India in the same years the Laki eruption chilled the northern hemisphere.',
   'Grove ties it to a run of strong El Nino years at the end of the 18th century.',
   deaths_approx=True)
ev('mist_hardships', 'famine', 'Mist Hardships', 1783, 1785, 64.13, -21.9, [9000, 10000], ['geography', 'population'], S('thordarson2003'),
   'Fluorine from the Laki eruption poisoned Iceland\'s grass, killing most of its livestock.',
   'About a fifth of Iceland\'s people died; Denmark briefly considered evacuating the island.')
ev('year_without_summer', 'famine', 'Year Without a Summer', 1816, 1817, 46.95, 7.45, None, ['geography', 'literature', 'population'], S('oppenheimer2003', 'wood2014'),
   'After the Tambora eruption, snow fell in June in New England and harvests failed across Europe and China.',
   'Bread riots and emigration followed, and a wet summer by Lake Geneva produced Frankenstein.')
ev('irish_famine_1845', 'famine', 'Great Irish Famine', 1845, 1852, 53.3, -8.0, [1000000, 1000000], ['population', 'economy', 'order'], S('grada'),
   'Potato blight destroyed the staple crop while food was still exported from Ireland.',
   'A million died and another million emigrated; Ireland\'s population has still not recovered to its 1841 level.',
   deaths_approx=True)
ev('india_famine_1876', 'famine', 'Great Famine of 1876-1878', 1876, 1878, 15.0, 77.0, [5500000, 10300000], ['economy', 'population', 'order', 'geography'], S('davis2001'),
   'Monsoon failure across south and west India while grain was exported and relief kept minimal.',
   'Davis pairs it with the North China famine of the same El Nino years as a lesson in how policy turns drought into famine.')
ev('china_famine_1876', 'famine', 'Northern Chinese Famine of 1876-1879', 1876, 1879, 36.0, 112.0, [9500000, 13000000], ['economy', 'population', 'order', 'geography'], S('davis2001'),
   'Drought across Shanxi, Henan and neighbouring provinces in the same El Nino years that struck India.',
   'One of the deadliest famines in history, in a Qing state already weakened by the Taiping war.')
ev('soviet_famine_1932', 'famine', 'Soviet famine of 1930-1933 (Holodomor)', 1930, 1933, 49.0, 32.0, [5500000, 8700000], ['order', 'economy', 'population'], S('conquest'),
   'Forced collectivisation and grain requisitions starved Ukraine, Kazakhstan and the Volga.',
   'A famine made by policy; in Ukraine it is remembered as the Holodomor.')
ev('bengal_famine_1943', 'famine', 'Bengal famine of 1943', 1943, 1944, 22.57, 88.36, [2100000, 3000000], ['economy', 'military', 'order'], S('sen1981'),
   'Wartime inflation, the loss of Burmese rice and a cyclone left millions unable to buy food.',
   'Sen\'s study of it showed that famine is often about the right to buy food, not the amount of food.')
ev('great_chinese_famine', 'famine', 'Great Chinese Famine', 1959, 1961, 33.0, 113.0, [15000000, 55000000], ['order', 'economy', 'population'], S('dikotter', 'yang2012'),
   'The Great Leap Forward pulled labour off farms while officials reported false harvests and grain was taken.',
   'The deadliest famine in history.')
ev('ethiopia_famine_1983', 'famine', 'Ethiopian famine of 1983-1985', 1983, 1985, 13.5, 39.5, [300000, 1200000], ['order', 'military', 'geography'], S('devereux'),
   'Drought in the north, worsened by the Derg government\'s war against rebels and forced resettlement.',
   'Television images of it led to Live Aid.')

# Eruptions
ev('toba', 'eruption', 'Toba super-eruption', -72000, -72000, 2.68, 98.88, None, ['geography', 'population'], S('williams2012'),
   'The largest known eruption of the last two million years, in Sumatra.',
   'An old theory that it nearly wiped out humanity is now widely doubted; that dispute is itself a good lesson in evidence.',
   start_approx=True, end_approx=True, start_range=[-72500, -71500])
ev('thera', 'eruption', 'Thera (Minoan) eruption', -1610, -1610, 36.4, 25.4, None, ['geography', 'economy'], S('friedrich2006'),
   'A huge eruption that blew out the centre of Santorini and buried the Bronze Age town of Akrotiri.',
   'Its date is fought over between radiocarbon and Egyptian chronology; its role in the Minoan decline is debated.',
   start_approx=True, start_range=[-1630, -1530], end_approx=True)
ev('okmok_43bc', 'eruption', 'Okmok eruption', -43, -43, 53.43, -168.13, None, ['geography', 'order'], S('mcconnell2020'),
   'An Alaskan eruption whose ash sits in Greenland ice from early 43 BCE.',
   'McConnell et al. link the cold, wet years after it to famine and unrest in Rome and Egypt after Caesar\'s murder.')
ev('vesuvius_79', 'eruption', 'Eruption of Vesuvius', 79, 79, 40.82, 14.43, [2000, 16000], ['geography', 'literature'], S('pliny'),
   'Vesuvius buried Pompeii, Herculaneum and Stabiae.',
   'Pliny the Younger\'s letters about it, and his uncle\'s death, are the first eyewitness account of an eruption.')
ev('volcanic_winter_536', 'eruption', 'Volcanic winter of 536', 536, 541, 64.0, -19.0, None, ['geography', 'disease', 'order'], S('sigl2015', 'buntgen2016'),
   'Eruptions in 536 and 540 (probably one in Iceland, one in the tropics) dimmed the sun for over a year.',
   'Byzantine writers saw the sun like the moon; the cold decade led straight into the Plague of Justinian.',
   tags=['source location uncertain'])
ev('eldgja', 'eruption', 'Eldgja eruption', 939, 940, 63.97, -18.6, None, ['geography', 'religion', 'literature'], S('oppenheimer2018'),
   'The largest lava flood in historical times, in southern Iceland.',
   'Oppenheimer et al. suggest memories of it shaped the doomsday poem Voluspa and helped Iceland turn Christian.')
ev('samalas', 'eruption', 'Samalas eruption', 1257, 1257, -8.41, 116.41, None, ['geography'], S('lavigne2013'),
   'One of the largest eruptions of the last few thousand years, on Lombok, found from ice cores before it was found on the ground.',
   'It destroyed the Lombok capital Pamatan and is a candidate trigger for the Little Ice Age.')
ev('huaynaputina', 'eruption', 'Huaynaputina eruption', 1600, 1600, -16.61, -70.85, [1500, 1500], ['geography', 'order'], S('verosub2008'),
   'The largest eruption in South America in recorded history.',
   'The cold summer of 1601 that followed across the northern hemisphere set off the Russian famine.',
   deaths_approx=True)
ev('asama_1783', 'eruption', 'Tenmei eruption of Asama', 1783, 1783, 36.4, 138.52, [1500, 1500], ['geography'], S('muroi'),
   'A large eruption of Mount Asama in central Japan.',
   'Its ash fell on farmland during an already failing run of harvests.',
   deaths_approx=True)
ev('laki', 'eruption', 'Laki eruption', 1783, 1784, 64.06, -18.23, None, ['geography', 'population', 'order'], S('thordarson2003', 'wood_laki'),
   'An eight-month fissure eruption in Iceland that released a sulphur haze over Europe.',
   'It killed about a fifth of Iceland and caused a toxic summer fog and a severe winter in Europe.')
ev('tambora', 'eruption', 'Tambora eruption', 1815, 1815, -8.25, 118.0, [71000, 92000], ['geography', 'population', 'literature'], S('oppenheimer2003'),
   'The largest eruption in recorded history, on Sumbawa.',
   'It caused the Year Without a Summer in 1816.')
ev('krakatoa', 'eruption', 'Krakatoa eruption', 1883, 1883, -6.1, 105.42, [36000, 36417], ['geography', 'ideas'], S('simkin'),
   'An eruption and tsunami in the Sunda Strait whose sound carried thousands of kilometres.',
   'The first eruption followed worldwide by telegraph; its red sunsets were seen across the globe.')
ev('pinatubo', 'eruption', 'Pinatubo eruption', 1991, 1991, 15.14, 120.35, [722, 847], ['geography', 'ideas'], S('self1996'),
   'An eruption in Luzon that put about 15 million tonnes of sulphur dioxide into the stratosphere.',
   'It cooled the planet by about half a degree for a year, the natural experiment that validated climate models.')

# Climate shifts (proposed subtype)
ev('green_sahara_end', 'climate_shift', 'End of the Green Sahara', -3500, -3000, 22.0, 10.0, None, ['geography', 'population'], S('demenocal2000'),
   'The African Humid Period ended and a grassland of lakes and hippos dried into desert.',
   'Herders moved to the Nile and the Sahel just as Egyptian civilisation took shape.',
   start_approx=True, end_approx=True)
ev('event_4_2ka', 'climate_shift', '4.2-kiloyear drought', -2200, -1900, 36.5, 41.0, None, ['geography', 'order'], S('weiss1993'),
   'A centuries-long dry spell from the Mediterranean to the Indus.',
   'Weiss linked it to the collapse of the Akkadian Empire and the abandonment of northern Mesopotamian cities.',
   start_approx=True, end_approx=True)
ev('late_bronze_drought', 'climate_shift', 'Late Bronze Age drought', -1250, -1100, 35.0, 35.0, None, ['geography', 'order'], S('kaniewski2013', 'cline2014'),
   'A dry period in the eastern Mediterranean seen in pollen cores from Cyprus and Syria.',
   'One of the stresses, with earthquakes, invasions and broken trade, behind the Late Bronze Age collapse.',
   start_approx=True, end_approx=True)
ev('roman_climate_optimum', 'climate_shift', 'Roman Climate Optimum', -200, 150, 41.9, 12.5, None, ['geography', 'economy'], S('mccormick2012', 'harper'),
   'A warm, wet and stable period around the Mediterranean.',
   'Harper argues it was a hidden partner in Rome\'s rise.',
   start_approx=True, end_approx=True)
ev('late_antique_lia', 'climate_shift', 'Late Antique Little Ice Age', 536, 660, 48.0, 20.0, None, ['geography', 'disease', 'order', 'population'], S('buntgen2016'),
   'A cold century after the eruptions of 536-547, seen in tree rings across Eurasia.',
   'Buntgen et al. tie it to plague, migrations from the steppe and the upheavals of the seventh century.')
ev('maya_droughts', 'climate_shift', 'Terminal Classic Maya droughts', 800, 950, 18.5, -89.5, None, ['geography', 'order'], S('haug2003', 'kennett2012'),
   'A run of multi-year droughts in the Maya lowlands recorded in lake and cave sediments.',
   'A leading explanation for the Classic Maya collapse, alongside endemic warfare.',
   start_approx=True, end_approx=True)
ev('medieval_climate_anomaly', 'climate_shift', 'Medieval Climate Anomaly', 950, 1250, 64.0, -30.0, None, ['geography', 'population'], S('mann2009'),
   'Warmer conditions around the North Atlantic, though not everywhere at once.',
   'The Norse settled Greenland in it, and Europe\'s population grew fast.',
   start_approx=True, end_approx=True)
ev('angkor_droughts', 'climate_shift', 'Angkor megadroughts', 1340, 1420, 13.41, 103.87, None, ['geography', 'order'], S('buckley2010'),
   'Decades of weak monsoons, broken by violent floods, recorded in Vietnamese cypress tree rings.',
   'They may have wrecked the vast water system Angkor depended on.',
   start_approx=True, end_approx=True)
ev('little_ice_age', 'climate_shift', 'Little Ice Age', 1300, 1850, 60.0, 10.0, None, ['geography', 'order', 'population'], S('mann2009', 'miller2012', 'parker2013'),
   'A long cool period with especially cold phases in the 1600s, when the Thames froze and glaciers advanced.',
   'Parker calls the 17th century a global crisis of war and revolt driven partly by this cold.',
   start_approx=True, end_approx=True, start_range=[1250, 1450])
ev('late_ming_drought', 'climate_shift', 'Late Ming drought', 1627, 1643, 34.0, 109.0, None, ['geography', 'order'], S('parker2013'),
   'The worst drought in north China in five centuries, with locusts and epidemics.',
   'It fed the rebellions that took Beijing in 1644.')
ev('el_nino_1876', 'climate_shift', 'El Nino of 1876-1878', 1876, 1878, 0.0, -140.0, None, ['geography', 'order'], S('davis2001'),
   'One of the strongest El Nino events on record, failing monsoons across Asia, Africa and Brazil.',
   'The common climate cause behind the famines of the late 1870s.')
ev('dust_bowl', 'climate_shift', 'Dust Bowl', 1930, 1936, 36.5, -101.0, None, ['geography', 'population', 'economy', 'literature'], S('worster'),
   'Drought and ploughed-up prairie turned the southern Plains into dust storms.',
   'Two and a half million people left the Plains, the migration in The Grapes of Wrath.')
ev('sahel_drought', 'climate_shift', 'Sahel drought', 1968, 1985, 15.0, 0.0, [100000, 250000], ['geography', 'population', 'order'], S('giannini2003'),
   'Rains across the Sahel failed for nearly two decades.',
   'Giannini et al. trace it to Atlantic and Indian Ocean temperatures rather than local overgrazing.',
   deaths_approx=True)
ev('modern_warming', 'climate_shift', 'Industrial-era warming', 1850, None, 0.0, 0.0, None, ['geography', 'order', 'economy'], S('ipcc_ar6'),
   'Burning fossil fuels has warmed the planet by about 1.1 degrees since the late 19th century.',
   'The fastest climate shift in this whole list, and the one Atlas will be asked about most.')

# Collapses and other events these records point at, kept here as stubs or as events this workstream needs first
ev('late_bronze_age_collapse', 'collapse', 'Late Bronze Age collapse', -1200, -1150, 35.5, 35.8, None, ['order', 'military', 'economy'], S('cline2014'),
   'Palace states from Mycenae to Ugarit fell within a few decades.',
   'Cline\'s case for a "perfect storm" of drought, quakes, raiders and broken trade is a model multi-lens story.',
   start_approx=True, end_approx=True)
ev('classic_maya_collapse', 'collapse', 'Classic Maya collapse', 800, 950, 17.22, -89.62, None, ['order'], S('kennett2012'),
   'The great southern lowland cities such as Tikal were abandoned.',
   'Drought, war and overstretched kings all compete as explanations.',
   start_approx=True, end_approx=True)
ev('norse_greenland_end', 'collapse', 'End of Norse Greenland', 1400, 1450, 61.0, -45.5, None, ['order', 'geography', 'economy'], S('dugmore2012'),
   'The last written record from Norse Greenland is a wedding in 1408; the settlements were empty soon after.',
   'Cold, falling walrus-ivory prices and isolation all played a part.',
   start_approx=True, end_approx=True)

# ---- Stubs for records other workstreams own ----
STUBS = [
    dict(id='polity:akkadian', kind='polity', name='Akkadian Empire', start=-2334, end=-2154, start_approx=True, end_approx=True, lenses=['order'], sources=S('weiss1993')),
    dict(id='polity:roman_republic', kind='polity', name='Roman Republic', start=-509, end=-27, lenses=['order'], sources=S('mcconnell2020')),
    dict(id='polity:aztec', kind='polity', name='Aztec Empire', start=1428, end=1521, lenses=['order'], sources=S('crosby')),
    dict(id='polity:ming', kind='polity', name='Ming dynasty', start=1368, end=1644, lenses=['order'], sources=S('parker2013')),
    dict(id='polity:khmer', kind='polity', name='Khmer Empire', start=802, end=1431, lenses=['order'], sources=S('buckley2010')),
    dict(id='event:peloponnesian_war', kind='event', subtype='war', name='Peloponnesian War', start=-431, end=-404, lenses=['military'], sources=S('thucydides')),
    dict(id='event:crisis_third_century', kind='event', subtype='collapse', name='Crisis of the Third Century', start=235, end=284, lenses=['order'], sources=S('harper')),
    dict(id='event:haitian_revolution', kind='event', subtype='revolt', name='Haitian Revolution', start=1791, end=1804, lenses=['order', 'military'], sources=S('mcneill2010')),
    dict(id='event:french_revolution', kind='event', subtype='revolt', name='French Revolution', start=1789, end=1799, lenses=['order'], sources=S('wood_laki')),
    dict(id='event:time_of_troubles', kind='event', subtype='collapse', name='Time of Troubles', start=1598, end=1613, lenses=['order'], sources=S('dunning')),
    dict(id='work:frankenstein', kind='work', subtype='book', name='Frankenstein', start=1818, lenses=['literature'], sources=S('shelley')),
]

# ---- Causal links: competing explanations carry a view and a confidence ----
REL = []
def rel(frm, typ, to, conf, view, src, note, **x):
    REL.append(dict(frm=frm, typ=typ, to=to, conf=conf, view=view, src=src, note=note, x=x))

rel('event:plague_of_athens', 'contributed_to', 'event:peloponnesian_war', 0.4, 'Thucydides', S('thucydides'), 'Killed Pericles and perhaps a quarter of Athens early in the war.')
rel('event:plague_of_cyprian', 'contributed_to', 'event:crisis_third_century', 0.4, 'Harper 2017', S('harper'), 'Depopulation and army losses in the worst decade of the crisis.')
rel('event:okmok_43bc', 'contributed_to', 'polity:roman_republic', 0.2, 'McConnell et al. 2020', S('mcconnell2020'), 'Cold, wet years and famine during the civil wars that ended the Republic.')
rel('event:volcanic_winter_536', 'caused', 'event:late_antique_lia', 0.7, 'Buntgen et al. 2016', S('buntgen2016', 'sigl2015'), 'Clustered eruptions in 536, 540 and 547 started the cold century.')
rel('event:late_antique_lia', 'contributed_to', 'event:plague_of_justinian', 0.3, 'Buntgen et al. 2016; Harper 2017', S('buntgen2016', 'harper'), 'Cold may have stressed rodent hosts and human hosts alike.')
rel('event:great_famine_1315', 'contributed_to', 'event:black_death', 0.3, 'DeWitte and Slavin 2013', S('dewitte2013'), 'People who were children in the famine died at higher rates in 1348.')
rel('event:samalas', 'contributed_to', 'event:little_ice_age', 0.4, 'Miller et al. 2012', S('miller2012'), 'Eruption cooling locked in by sea-ice feedback.')
rel('event:smallpox_aztec', 'contributed_to', 'polity:aztec', 0.7, 'Crosby 1972', S('crosby'), 'Killed the emperor Cuitlahuac and much of Tenochtitlan during the siege.')
rel('event:smallpox_aztec', 'contributed_to', 'event:little_ice_age', 0.25, 'Koch et al. 2019', S('koch2019'), 'The Great Dying in the Americas let forests regrow and pull down CO2.')
rel('event:huaynaputina', 'caused', 'event:russian_famine_1601', 0.6, 'Verosub and Lippman 2008', S('verosub2008'), 'The summer of 1601 was one of the coldest in 600 years in the tree rings.')
rel('event:russian_famine_1601', 'contributed_to', 'event:time_of_troubles', 0.6, 'Dunning 2001', S('dunning'), 'Famine discredited Tsar Boris Godunov and fed the pretenders.')
rel('event:little_ice_age', 'contributed_to', 'event:norse_greenland_end', 0.4, 'Dugmore et al. 2012', S('dugmore2012'), 'Cold was one of several compounding stresses, with ivory prices and isolation.')
rel('event:late_ming_drought', 'contributed_to', 'polity:ming', 0.5, 'Parker 2013', S('parker2013'), 'Drought and famine fed the rebel armies of Li Zicheng.')
rel('event:angkor_droughts', 'contributed_to', 'polity:khmer', 0.5, 'Buckley et al. 2010', S('buckley2010'), 'Drought then flood damaged the hydraulic system.')
rel('event:maya_droughts', 'contributed_to', 'event:classic_maya_collapse', 0.5, 'Haug et al. 2003', S('haug2003', 'kennett2012'), 'Rival view: endemic warfare between city states was the main driver.')
rel('event:event_4_2ka', 'contributed_to', 'polity:akkadian', 0.5, 'Weiss et al. 1993', S('weiss1993'), 'Tell Leilan was abandoned when the rains failed.')
rel('event:late_bronze_drought', 'contributed_to', 'event:late_bronze_age_collapse', 0.5, 'Kaniewski et al. 2013', S('kaniewski2013'), 'Drought as the root stress.')
rel('event:late_bronze_drought', 'contributed_to', 'event:late_bronze_age_collapse', 0.3, 'Cline 2014', S('cline2014'), 'One strand in a systems collapse, with no single cause.', slug='late_bronze_drought_lbac_cline')
rel('event:laki', 'caused', 'event:mist_hardships', 0.9, 'Thordarson and Self 2003', S('thordarson2003'), 'Fluorine poisoning of grazing land.')
rel('event:laki', 'contributed_to', 'event:french_revolution', 0.1, 'Popular claim (Wood 1992 discusses it)', S('wood_laki'), 'Bad harvests in 1783-84 are real; the line to 1789 is long and weak.')
rel('event:asama_1783', 'contributed_to', 'event:tenmei_famine', 0.5, 'Japanese historiography of the Tenmei era', S('muroi'), 'Ash on fields during already failing harvests.')
rel('event:tambora', 'caused', 'event:year_without_summer', 0.9, 'Oppenheimer 2003', S('oppenheimer2003'), 'Sulphate veil cooled the northern hemisphere in 1816.')
rel('event:year_without_summer', 'contributed_to', 'work:frankenstein', 0.6, 'Mary Shelley, 1831 introduction', S('shelley', 'wood2014'), 'Rain kept the Byron-Shelley party indoors telling ghost stories in June 1816.')
rel('event:el_nino_1876', 'contributed_to', 'event:india_famine_1876', 0.7, 'Davis 2001', S('davis2001'), 'Davis stresses that colonial grain policy decided who died.')
rel('event:el_nino_1876', 'contributed_to', 'event:china_famine_1876', 0.7, 'Davis 2001', S('davis2001'), 'Same El Nino, a different state failure.')
rel('event:yellow_fever_haiti', 'contributed_to', 'event:haitian_revolution', 0.6, 'McNeill 2010', S('mcneill2010'), 'Disease destroyed Leclerc\'s army; Dessalines\' army finished it.')

# ---- Black Death spread: city arrivals with the likely source city and mode ----
# Months are approximate (Benedictow gives seasons for many places). 'via' is the model's reading of
# the trade link that carried it there; these are plausible routes, not proven chains.
# (slug, name, today, lat, lon, year, month, via_slug, mode, note)
BD = [
    ('chu_valley', 'Chu valley (Kara-Djigach)', 'Kyrgyzstan', 42.85, 74.6, 1338, 6, None, None, 'Nestorian gravestones of 1338-39 record deaths from "pestilence"; ancient DNA from them carries the ancestral Black Death strain.'),
    ('sarai', 'Sarai', 'Russia', 47.12, 47.48, 1346, 3, 'chu_valley', 'land', 'Capital of the Golden Horde on the lower Volga.'),
    ('astrakhan', 'Astrakhan', 'Russia', 46.35, 48.03, 1346, 4, 'sarai', 'river', 'Russian chronicles report plague here in 1346.'),
    ('tana', 'Tana (Azov)', 'Russia', 47.1, 39.42, 1346, 6, 'sarai', 'land', 'Venetian and Genoese trading post at the mouth of the Don.'),
    ('kaffa', 'Kaffa', 'Ukraine', 45.03, 35.38, 1346, 9, 'tana', 'land', 'Under siege by Jani Beg\'s army; de Mussis wrote that the besiegers threw plague corpses over the walls.'),
    ('constantinople', 'Constantinople', 'Turkey', 41.01, 28.98, 1347, 7, 'kaffa', 'sea', 'The emperor\'s son Andronikos died; the hub that sent it on to the whole Mediterranean.'),
    ('trebizond', 'Trebizond', 'Turkey', 41.0, 39.72, 1347, 9, 'kaffa', 'sea', 'Black Sea port at the head of the caravan road to Tabriz.'),
    ('rhodes', 'Rhodes', 'Greece', 36.43, 28.22, 1347, 9, 'constantinople', 'sea', 'Base of the Knights Hospitaller.'),
    ('alexandria', 'Alexandria', 'Egypt', 31.2, 29.92, 1347, 10, 'constantinople', 'sea', 'Arrived on a ship from the Black Sea carrying slaves and merchants.'),
    ('messina', 'Messina', 'Italy', 38.19, 15.55, 1347, 10, 'constantinople', 'sea', 'Twelve Genoese galleys came into port; Europe\'s epidemic starts here.'),
    ('famagusta', 'Famagusta', 'Cyprus', 35.12, 33.94, 1347, 10, 'rhodes', 'sea', None),
    ('catania', 'Catania', 'Italy', 37.5, 15.09, 1347, 11, 'messina', 'land', 'Messinans fled here and brought it with them.'),
    ('marseille', 'Marseille', 'France', 43.3, 5.37, 1347, 11, 'messina', 'sea', 'The gateway to France.'),
    ('split', 'Split', 'Croatia', 43.51, 16.44, 1347, 12, 'messina', 'sea', None),
    ('genoa', 'Genoa', 'Italy', 44.41, 8.93, 1348, 1, 'messina', 'sea', 'Infected galleys were driven out of the harbour, too late.'),
    ('venice', 'Venice', 'Italy', 45.44, 12.33, 1348, 1, 'split', 'sea', 'Venice set up isolation of ships and, later, the first quarantine stations.'),
    ('ragusa', 'Ragusa (Dubrovnik)', 'Croatia', 42.65, 18.09, 1348, 1, 'messina', 'sea', 'Ragusa introduced the first formal quarantine (trentino) in 1377.'),
    ('pisa', 'Pisa', 'Italy', 43.72, 10.4, 1348, 1, 'genoa', 'sea', None),
    ('avignon', 'Avignon', 'France', 43.95, 4.81, 1348, 1, 'marseille', 'river', 'Seat of the papacy; Clement VI sat between two great fires and survived.'),
    ('palma', 'Palma (Mallorca)', 'Spain', 39.57, 2.65, 1348, 2, 'marseille', 'sea', None),
    ('montpellier', 'Montpellier', 'France', 43.61, 3.88, 1348, 2, 'marseille', 'land', None),
    ('florence', 'Florence', 'Italy', 43.77, 11.26, 1348, 3, 'pisa', 'land', 'Boccaccio set the Decameron here, among young people fleeing the city.'),
    ('naples', 'Naples', 'Italy', 40.85, 14.27, 1348, 3, 'messina', 'sea', None),
    ('tunis', 'Tunis', 'Tunisia', 36.8, 10.18, 1348, 4, 'messina', 'sea', 'Ibn Khaldun lost both parents and many teachers here.'),
    ('gaza', 'Gaza', 'Palestine', 31.5, 34.47, 1348, 4, 'alexandria', 'land', None),
    ('siena', 'Siena', 'Italy', 43.32, 11.33, 1348, 4, 'florence', 'land', 'Work stopped on the giant new cathedral nave and never resumed.'),
    ('bologna', 'Bologna', 'Italy', 44.49, 11.34, 1348, 4, 'florence', 'land', None),
    ('toulouse', 'Toulouse', 'France', 43.6, 1.44, 1348, 4, 'montpellier', 'land', None),
    ('lyon', 'Lyon', 'France', 45.76, 4.84, 1348, 4, 'avignon', 'river', None),
    ('barcelona', 'Barcelona', 'Spain', 41.39, 2.17, 1348, 5, 'palma', 'sea', None),
    ('valencia', 'Valencia', 'Spain', 39.47, -0.38, 1348, 5, 'barcelona', 'sea', None),
    ('almeria', 'Almeria', 'Spain', 36.84, -2.46, 1348, 6, 'valencia', 'sea', 'Ibn Khatima wrote one of the best plague treatises here.'),
    ('rome', 'Rome', 'Italy', 41.9, 12.5, 1348, 6, 'pisa', 'sea', None),
    ('paris', 'Paris', 'France', 48.86, 2.35, 1348, 6, 'lyon', 'land', 'The medical faculty blamed a conjunction of Saturn, Jupiter and Mars in 1345.'),
    ('weymouth', 'Melcombe (Weymouth)', 'United Kingdom', 50.61, -2.46, 1348, 6, 'bordeaux', 'sea', 'The first English port to be hit, from a ship out of Gascony.'),
    ('damascus', 'Damascus', 'Syria', 33.51, 36.29, 1348, 7, 'gaza', 'land', 'Ibn Battuta saw 2,400 deaths in a day here in July 1348.'),
    ('rouen', 'Rouen', 'France', 49.44, 1.1, 1348, 7, 'paris', 'river', None),
    ('bordeaux', 'Bordeaux', 'France', 44.84, -0.58, 1348, 6, 'toulouse', 'river', 'Princess Joan, on her way to marry Pedro of Castile, died here.'),
    ('bristol', 'Bristol', 'United Kingdom', 51.45, -2.59, 1348, 8, 'weymouth', 'land', None),
    ('dublin', 'Dublin', 'Ireland', 53.35, -6.26, 1348, 8, 'bristol', 'sea', 'Friar John Clyn of Kilkenny left blank parchment "in case anyone should still be alive".'),
    ('cairo', 'Cairo', 'Egypt', 30.04, 31.24, 1348, 9, 'alexandria', 'river', 'The largest city west of China; perhaps a third died.'),
    ('lisbon', 'Lisbon', 'Portugal', 38.72, -9.14, 1348, 9, 'almeria', 'sea', None),
    ('london', 'London', 'United Kingdom', 51.51, -0.13, 1348, 9, 'weymouth', 'land', 'Plague pits at East Smithfield were dug for it.'),
    ('aleppo', 'Aleppo', 'Syria', 36.2, 37.13, 1348, 10, 'damascus', 'land', None),
    ('oslo', 'Oslo', 'Norway', 59.91, 10.75, 1348, 10, 'london', 'sea', 'Benedictow dates the first Norwegian outbreak to autumn 1348.'),
    ('norwich', 'Norwich', 'United Kingdom', 52.63, 1.3, 1349, 3, 'london', 'land', None),
    ('vienna', 'Vienna', 'Austria', 48.21, 16.37, 1349, 4, 'venice', 'land', None),
    ('mecca', 'Mecca', 'Saudi Arabia', 21.42, 39.83, 1349, 4, 'cairo', 'land', 'Pilgrims carried it; some held that plague could not enter the holy city.'),
    ('basel', 'Basel', 'Switzerland', 47.56, 7.59, 1349, 5, 'lyon', 'land', None),
    ('york', 'York', 'United Kingdom', 53.96, -1.08, 1349, 5, 'london', 'land', None),
    ('strasbourg', 'Strasbourg', 'France', 48.58, 7.75, 1349, 7, 'basel', 'river', 'In February, before plague arrived, the city burned hundreds of its Jews, blamed for poisoning wells.'),
    ('frankfurt', 'Frankfurt', 'Germany', 50.11, 8.68, 1349, 7, 'strasbourg', 'river', None),
    ('bergen', 'Bergen', 'Norway', 60.39, 5.32, 1349, 7, 'london', 'sea', 'An English ship brought it; the king\'s son died.'),
    ('cologne', 'Cologne', 'Germany', 50.94, 6.96, 1349, 8, 'frankfurt', 'river', None),
    ('edinburgh', 'Edinburgh', 'United Kingdom', 55.95, -3.19, 1349, 10, 'york', 'land', 'A Scottish army raiding England in 1349 carried it home.'),
    ('hamburg', 'Hamburg', 'Germany', 53.55, 9.99, 1350, 5, 'cologne', 'land', None),
    ('lubeck', 'Lubeck', 'Germany', 53.87, 10.69, 1350, 6, 'hamburg', 'land', 'Head of the Hanseatic League; it carried the plague on through the Baltic.'),
    ('stockholm', 'Stockholm', 'Sweden', 59.33, 18.07, 1350, 7, 'oslo', 'land', None),
    ('pskov', 'Pskov', 'Russia', 57.82, 28.33, 1352, 6, 'lubeck', 'sea', 'Pskov sent for the archbishop of Novgorod to bless the city; he caught it and died.'),
    ('novgorod', 'Novgorod', 'Russia', 58.52, 31.27, 1352, 8, 'pskov', 'land', None),
    ('moscow', 'Moscow', 'Russia', 55.76, 37.62, 1353, 3, 'novgorod', 'land', 'Grand Prince Simeon the Proud died of it in April 1353.'),
]

# Sea links that would otherwise be drawn across land get waypoints [lon, lat].
WAY = {
    ('chu_valley', 'sarai'): [[68.3, 42.9], [60.6, 41.6], [53.0, 46.6]],
    ('constantinople', 'messina'): [[26.3, 40.1], [25.3, 37.4], [22.6, 36.1]],
    ('constantinople', 'alexandria'): [[26.3, 40.1], [26.0, 36.2]],
    ('constantinople', 'rhodes'): [[26.3, 40.1], [26.6, 37.5]],
    ('kaffa', 'constantinople'): [[30.2, 42.0]],
    ('messina', 'genoa'): [[12.0, 40.5], [9.8, 43.6]],
    ('messina', 'marseille'): [[11.5, 39.8], [9.5, 41.3], [6.5, 42.8]],
    ('messina', 'split'): [[16.8, 38.4], [18.8, 40.0], [17.3, 42.3]],
    ('messina', 'ragusa'): [[16.8, 38.4], [18.8, 40.0]],
    ('messina', 'naples'): [[15.0, 39.6]],
    ('messina', 'tunis'): [[12.5, 37.4]],
    ('split', 'venice'): [[14.4, 44.0], [13.1, 44.9]],
    ('genoa', 'pisa'): [[9.6, 43.9]],
    ('pisa', 'rome'): [[11.0, 42.4]],
    ('valencia', 'almeria'): [[0.2, 38.6], [-1.6, 37.1]],
    ('almeria', 'lisbon'): [[-5.6, 35.95], [-8.9, 36.7], [-9.4, 38.3]],
    ('bordeaux', 'weymouth'): [[-1.6, 45.6], [-4.0, 47.0], [-5.6, 48.4], [-3.5, 49.8]],
    ('bristol', 'dublin'): [[-4.0, 51.4], [-5.6, 51.8], [-5.6, 53.0]],
    ('london', 'oslo'): [[1.5, 51.6], [3.5, 54.5], [8.0, 57.6], [10.5, 59.0]],
    ('london', 'bergen'): [[1.5, 51.6], [3.0, 55.5], [4.6, 60.0]],
    ('lubeck', 'pskov'): [[14.0, 55.0], [19.0, 57.0], [22.5, 59.3], [27.5, 59.4]],
    ('kaffa', 'trebizond'): [[36.5, 42.5]],
    ('rhodes', 'famagusta'): [[31.0, 35.9]],
    ('marseille', 'palma'): [[3.5, 41.8]],
    ('palma', 'barcelona'): [],
    ('barcelona', 'valencia'): [[1.0, 40.6]],
}

def slugok(s):
    assert re.fullmatch(r'[a-z0-9_]+', s), s
    return s

def drop_none(d):
    return {k: v for k, v in d.items() if v is not None}

def main():
    os.makedirs(os.path.join(OUT, 'geo'), exist_ok=True)
    events = []
    for e in EV:
        x = dict(e['x'])
        place = x.pop('place', None)
        deaths_approx = x.pop('deaths_approx', None)
        r = {'id': 'event:' + slugok(e['slug']), 'kind': 'event', 'subtype': e['subtype'], 'name': e['name'],
             'lenses': e['lenses'], 'start': e['start'], 'end': e['end'], 'lat': e['lat'], 'lon': e['lon'],
             'place': place, 'deaths': e['deaths'], 'what': e['what'], 'why': e['why'],
             'sources': e['src'], 'status': 'draft'}
        if deaths_approx: r['tags'] = r.get('tags', []) + ['deaths approximate']
        r.update(x)
        # end: null means still ongoing, so keep it
        events.append({k: v for k, v in r.items() if v is not None or k == 'end'})
    stubs = [dict(s, stub=True, status='draft') for s in STUBS]
    events += [s for s in stubs if s['kind'] == 'event']
    others = [s for s in stubs if s['kind'] != 'event']

    rels = []
    for r in REL:
        x = dict(r['x'])
        slug = x.pop('slug', None) or (r['frm'].split(':', 1)[1] + '_' + r['typ'] + '_' + r['to'].split(':', 1)[1])
        rels.append(drop_none({'id': 'rel:' + slugok(slug), 'kind': 'relation', 'type': r['typ'], 'from': r['frm'], 'to': r['to'],
                               'confidence': r['conf'], 'view': r['view'], 'note': r['note'], 'lenses': ['order', 'geography'],
                               'sources': r['src'], 'status': 'draft'}))

    # Black Death places (stubs owned by places-people) and spread relations
    places, feats = [], []
    coords = {b[0]: (b[4], b[3]) for b in BD}
    bd_src = S('benedictow', 'christakos')
    for slug, name, today, lat, lon, y, m, via, mode, note in BD:
        places.append(drop_none({'id': 'place:' + slugok(slug), 'kind': 'place', 'subtype': 'city', 'name': name, 'today': today,
                                 'lat': lat, 'lon': lon, 'lenses': ['geography'], 'sources': bd_src, 'status': 'draft', 'stub': True}))
        src = S('spyrou2022') if slug == 'chu_valley' else S('wheelis') if slug == 'kaffa' else S('dols') if slug in ('alexandria', 'cairo', 'damascus', 'gaza', 'aleppo', 'mecca', 'tunis') else bd_src
        rels.append(drop_none({'id': 'rel:black_death_spread_to_' + slug, 'kind': 'relation', 'type': 'spread_to',
                               'from': 'event:black_death', 'to': 'place:' + slug, 'start': y, 'start_approx': True,
                               'month': m, 'via': 'place:' + via if via else None, 'mode': mode, 'note': note,
                               'lenses': ['disease'], 'sources': src, 'status': 'draft'}))
        if via:
            pts = [list(coords[via])] + WAY.get((via, slug), []) + [list(coords[slug])]
            feats.append({'type': 'Feature', 'properties': {'ref': 'route:black_death_spread', 'from': 'place:' + via, 'to': 'place:' + slug,
                                                            'year': y, 'month': m, 'mode': mode},
                          'geometry': {'type': 'LineString', 'coordinates': pts}})
    routes = [{'id': 'route:black_death_spread', 'kind': 'route', 'subtype': 'epidemic_spread', 'name': 'Spread of the Black Death',
               'start': 1338, 'end': 1353, 'stops': ['place:' + b[0] for b in BD], 'geo': 'geo/black_death_routes.geojson',
               'lenses': ['disease', 'economy', 'geography'], 'sources': S('benedictow', 'spyrou2022', 'christakos'), 'status': 'draft',
               'what': 'The likely path of the Black Death from the Tian Shan to Moscow, city by city.',
               'why': 'It followed the trade network: caravan roads to the Black Sea, galleys to every Mediterranean port, then rivers and roads inland.'}]

    def write(name, rows):
        with open(os.path.join(OUT, name), 'w') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(name, len(rows))
    write('events.jsonl', events)
    write('relations.jsonl', rels)
    write('places.jsonl', places)
    write('stubs.jsonl', others)
    write('routes.jsonl', routes)
    with open(os.path.join(OUT, 'geo', 'black_death_routes.geojson'), 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f, separators=(',', ':'))
    print('geo features', len(feats))

if __name__ == '__main__':
    main()
