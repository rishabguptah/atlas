#!/usr/bin/env python3
"""Deep time records (300,000 to about 4,000 years ago), written from the papers cited on each record.

Usage: python3 ingest/deep-time/curated.py        writes data/deep-time/*.jsonl
Dates are given here in thousands of years before present (ka, present = 1950) as the papers give them and turned
into kernel years (negative = BCE). Every record is a draft until the judge checks it; `conf` follows WORLD.md
(attested, estimated, approximate, unknown). Ranges and paths are drawn by hand from the cited maps: approximate.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'deep-time')


def yr(ka):
    y = int(round(1950 - ka * 1000))
    return y if y != 0 else -1


def doi(cite, d):
    return {'cite': cite, 'url': 'https://doi.org/' + d}


def rec(**r):
    r.setdefault('status', 'draft')
    return r


# ---------- sites: where the evidence comes from ----------
# id, name, lat, lon, ka (date of the find), ka_range (low, high) or None, kind of find, what, why, sources, extra
SITES = [
    ('jebel_irhoud', 'Jebel Irhoud', 31.855, -8.872, 315, (281, 349), 'fossil', 'homo_sapiens',
     'Skulls and teeth from a cave in Morocco, dated about 315,000 years ago, have a modern face and an older, longer braincase.',
     'The oldest known Homo sapiens: our species was already spread across Africa, not born in one East African valley.',
     [doi('Hublin, J.-J. et al., "New fossils from Jebel Irhoud, Morocco and the pan-African origin of Homo sapiens", Nature 546, 289-292 (2017)', '10.1038/nature22336'),
      doi('Richter, D. et al., "The age of the hominin fossils from Jebel Irhoud, Morocco", Nature 546, 293-296 (2017)', '10.1038/nature22335')]),
    ('kabwe', 'Kabwe (Broken Hill)', -14.45, 28.45, 299, (274, 324), 'fossil', 'homo_heidelbergensis',
     'A heavy-browed skull found in a Zambian mine, redated in 2020 to about 299,000 years ago.',
     'Several kinds of human lived in Africa at once when our species appeared.',
     [doi('Grün, R. et al., "Dating the skull from Broken Hill, Zambia, and its position in human evolution", Nature 580, 372-375 (2020)', '10.1038/s41586-020-2165-4')]),
    ('rising_star', 'Rising Star Cave', -26.016, 27.712, 285, (236, 335), 'fossil', 'homo_naledi',
     'Over 1,500 bones of Homo naledi, a small-brained human, deep in a South African cave system.',
     'A species with a brain a third the size of ours lived alongside early Homo sapiens.',
     [doi('Dirks, P. et al., "The age of Homo naledi and associated sediments in the Rising Star Cave, South Africa", eLife 6, e24231 (2017)', '10.7554/eLife.24231')]),
    ('florisbad', 'Florisbad', -28.767, 26.067, 259, (224, 294), 'fossil', 'homo_sapiens',
     'A partial skull from a spring mound in the Free State, about 259,000 years old.',
     'An early member of our lineage in southern Africa.',
     [doi('Grün, R. et al., "Direct dating of Florisbad hominid", Nature 382, 500-501 (1996)', '10.1038/382500a0')]),
    ('omo_kibish', 'Omo Kibish', 5.4, 35.92, 233, (230, 236), 'fossil', 'homo_sapiens',
     'Omo I, found by Richard Leakey in 1967, lies under ash from a 233,000-year-old eruption.',
     'The oldest Homo sapiens from East Africa, dated by the volcano that buried it.',
     [doi('Vidal, C. M. et al., "Age of the oldest known Homo sapiens from eastern Africa", Nature 601, 579-583 (2022)', '10.1038/s41586-021-04275-8')]),
    ('apidima', 'Apidima Cave', 36.66, 22.38, 210, (170, 250), 'fossil', 'homo_sapiens',
     'A skull fragment from southern Greece read as Homo sapiens, about 210,000 years old; disputed.',
     'If right, modern humans reached Europe 150,000 years before they stayed.',
     [doi('Harvati, K. et al., "Apidima Cave fossils provide earliest evidence of Homo sapiens in Eurasia", Nature 571, 500-504 (2019)', '10.1038/s41586-019-1376-z')], {'conf': 'approximate'}),
    ('misliya', 'Misliya Cave', 32.72, 34.97, 185, (177, 194), 'fossil', 'homo_sapiens',
     'An upper jaw on Mount Carmel, Israel, dated 194,000 to 177,000 years ago.',
     'Modern humans were leaving Africa long before the main dispersal; these early groups left no living descendants we can detect.',
     [doi('Hershkovitz, I. et al., "The earliest modern humans outside Africa", Science 359, 456-459 (2018)', '10.1126/science.aap8369')]),
    ('pinnacle_point', 'Pinnacle Point', -34.2, 22.09, 164, (155, 173), 'site', 'homo_sapiens',
     'Shellfish meals and ground red ochre in a cave above the sea on the South African coast.',
     'The earliest known seafood diet and pigment use: coasts may have been refuges in a harsh glacial stage.',
     [doi('Marean, C. W. et al., "Early human use of marine resources and pigment in South Africa during the Middle Pleistocene", Nature 449, 905-908 (2007)', '10.1038/nature06204')]),
    ('qafzeh', 'Qafzeh and Skhul', 32.69, 35.32, 100, (90, 120), 'burial', 'homo_sapiens',
     'Modern humans buried with ochre and shells in two caves in Israel, 120,000 to 90,000 years ago.',
     'A wave out of Africa during a wet, warm spell; later the Levant was Neanderthal country again.',
     [doi('Valladas, H. et al., "Thermoluminescence dating of Mousterian Proto-Cro-Magnon remains from Israel and the origin of modern man", Nature 331, 614-616 (1988)', '10.1038/331614a0'),
      doi('Grün, R. et al., "U-series and ESR analyses of bones and teeth relating to the human burials from Skhul", Journal of Human Evolution 49, 316-334 (2005)', '10.1016/j.jhevol.2005.04.006')]),
    ('ngandong', 'Ngandong', -7.33, 111.5, 112, (108, 117), 'fossil', 'homo_erectus',
     'A bone bed on the Solo River in Java with the last known Homo erectus, 117,000 to 108,000 years ago.',
     'Homo erectus lasted over a million years; it died out here as the forest closed in.',
     [doi('Rizal, Y. et al., "Last appearance of Homo erectus at Ngandong, Java, 117,000-108,000 years ago", Nature 577, 381-385 (2020)', '10.1038/s41586-019-1863-2')]),
    ('blombos', 'Blombos Cave', -34.41, 21.22, 77, (73, 100), 'art', 'homo_sapiens',
     'Ochre engraved with cross-hatching and a drawing in ochre crayon on a stone flake, about 73,000 years old.',
     'The oldest known drawing: symbolic thinking well before Europe\'s painted caves.',
     [doi('Henshilwood, C. S. et al., "Emergence of modern human behavior: Middle Stone Age engravings from South Africa", Science 295, 1278-1280 (2002)', '10.1126/science.1067575'),
      doi('Henshilwood, C. S. et al., "An abstract drawing from the 73,000-year-old levels at Blombos Cave, South Africa", Nature 562, 115-118 (2018)', '10.1038/s41586-018-0514-3')]),
    ('panga_ya_saidi', 'Panga ya Saidi', -3.68, 39.73, 78, (74, 82), 'burial', 'homo_sapiens',
     'A child of about three, laid on its side in a pit with its head on a pillow: "Mtoto".',
     'The oldest known human burial in Africa.',
     [doi('Martinón-Torres, M. et al., "Earliest known human burial in Africa", Nature 593, 95-100 (2021)', '10.1038/s41586-021-03457-8')]),
    ('shanidar', 'Shanidar Cave', 36.83, 44.22, 65, (55, 75), 'burial', 'neanderthals',
     'Ten Neanderthals in a cave in Iraqi Kurdistan, some buried; one, Shanidar 1, lived for years with crippling injuries.',
     'Neanderthals cared for the injured and may have buried their dead (the "flower burial" pollen is disputed).',
     [doi('Pomeroy, E. et al., "New Neanderthal remains associated with the \'flower burial\' at Shanidar Cave", Antiquity 94, 11-26 (2020)', '10.15184/aqy.2019.207')]),
    ('diepkloof', 'Diepkloof Rock Shelter', -32.38, 18.45, 60, (55, 65), 'art', 'homo_sapiens',
     'Ostrich eggshell water flasks engraved with repeating patterns, 65,000 to 55,000 years ago.',
     'A shared graphic tradition: people marked their belongings the way groups mark identity.',
     [doi('Texier, P.-J. et al., "A Howiesons Poort tradition of engraving ostrich eggshell containers dated to 60,000 years ago at Diepkloof Rock Shelter", PNAS 107, 6180-6185 (2010)', '10.1073/pnas.0913047107')]),
    ('denisova', 'Denisova Cave', 51.397, 84.676, 90, (50, 200), 'fossil', 'denisovans',
     'A cave in the Altai with a finger bone that gave the first Denisovan genome, and "Denny", a girl with a Neanderthal mother and a Denisovan father.',
     'Three kinds of human used this cave; they met and had children.',
     [doi('Reich, D. et al., "Genetic history of an archaic hominin group from Denisova Cave in Siberia", Nature 468, 1053-1060 (2010)', '10.1038/nature09710'),
      doi('Slon, V. et al., "The genome of the offspring of a Neanderthal mother and a Denisovan father", Nature 561, 113-116 (2018)', '10.1038/s41586-018-0455-x'),
      doi('Jacobs, Z. et al., "Timing of archaic hominin occupation of Denisova Cave in southern Siberia", Nature 565, 594-599 (2019)', '10.1038/s41586-018-0843-2')]),
    ('baishiya', 'Baishiya Karst Cave', 35.45, 102.57, 160, (155, 165), 'fossil', 'denisovans',
     'A Denisovan jaw from a monks\' cave 3,280 m up on the Tibetan Plateau, at least 160,000 years old.',
     'Denisovans lived at altitude; Tibetans today carry a Denisovan gene (EPAS1) that helps them breathe thin air.',
     [doi('Chen, F. et al., "A late Middle Pleistocene Denisovan mandible from the Tibetan Plateau", Nature 569, 409-412 (2019)', '10.1038/s41586-019-1139-x')]),
    ('tam_pa_ling', 'Tam Pà Ling', 20.21, 103.41, 77, (68, 86), 'fossil', 'homo_sapiens',
     'A modern human skull and jaw from a cave in northern Laos, 86,000 to 68,000 years old.',
     'Modern humans may have reached mainland Southeast Asia before the main wave out of Africa.',
     [doi('Freidline, S. E. et al., "Early presence of Homo sapiens in Southeast Asia by 86-68 kyr at Tam Pà Ling, Northern Laos", Nature Communications 14, 3193 (2023)', '10.1038/s41467-023-38715-y')], {'conf': 'approximate'}),
    ('liang_bua', 'Liang Bua', -8.53, 120.46, 80, (60, 100), 'fossil', 'homo_floresiensis',
     'Skeletons of Homo floresiensis, the "hobbit", about a metre tall, on the island of Flores.',
     'An island dwarf human that lived until about 60,000 years ago; its stone tools stop about 50,000 years ago, near when modern humans came.',
     [doi('Sutikna, T. et al., "Revised stratigraphy and chronology for Homo floresiensis at Liang Bua in Indonesia", Nature 532, 366-369 (2016)', '10.1038/nature17179')]),
    ('callao', 'Callao Cave', 17.7, 121.82, 58, (50, 67), 'fossil', 'homo_luzonensis',
     'Teeth and bones of a new small human, Homo luzonensis, on Luzon in the Philippines.',
     'Another island human: archaic people crossed the sea to the Philippines long before us.',
     [doi('Détroit, F. et al., "A new species of Homo from the Late Pleistocene of the Philippines", Nature 568, 181-186 (2019)', '10.1038/s41586-019-1067-9')]),
    ('madjedbebe', 'Madjedbebe', -12.5, 132.87, 65, (53, 72), 'site', 'homo_sapiens',
     'Stone axes, grindstones and ochre in a rock shelter in Arnhem Land, dated to about 65,000 years ago.',
     'Either the first Australians arrived 65,000 years ago or about 50,000; the dates are argued over.',
     [doi('Clarkson, C. et al., "Human occupation of northern Australia by 65,000 years ago", Nature 547, 306-310 (2017)', '10.1038/nature22968'),
      doi('O\'Connell, J. F. et al., "When did Homo sapiens first reach Southeast Asia and Sahul?", PNAS 115, 8482-8490 (2018)', '10.1073/pnas.1808385115')],
     {'conf': 'approximate', 'debate': [{'view': 'People arrived by 65,000 years ago', 'by': 'Clarkson et al. 2017'}, {'view': 'Closer to 50,000 years ago; the artefacts may have moved down through the sand', 'by': 'O\'Connell et al. 2018'}]}),
    ('grotte_mandrin', 'Grotte Mandrin', 44.48, 4.78, 54, (51, 56), 'site', 'homo_sapiens',
     'A child\'s tooth and tiny stone points in a Rhône valley rock shelter sandwiched between Neanderthal layers.',
     'Modern humans visited France about 54,000 years ago, 10,000 years before they stayed; then Neanderthals returned.',
     [doi('Slimak, L. et al., "Modern human incursion into Neanderthal territories 54,000 years ago at Mandrin, France", Science Advances 8, eabj9496 (2022)', '10.1126/sciadv.abj9496')]),
    ('leang_karampuang', 'Leang Karampuang', -4.88, 119.6, 51.2, (50, 52), 'art', 'homo_sapiens',
     'A painted scene of three human-like figures with a wild pig, at least 51,200 years old, in a Sulawesi cave.',
     'The oldest known figurative art and the oldest known story told in pictures.',
     [doi('Oktaviana, A. A. et al., "Narrative cave art in Indonesia by 51,200 years ago", Nature 631, 814-818 (2024)', '10.1038/s41586-024-07541-7')]),
    ('ranis', 'Ranis (Ilsenhöhle)', 50.66, 11.56, 47, (45, 49), 'fossil', 'homo_sapiens',
     'Bone scraps under a castle in Thuringia, identified as modern human by DNA, about 47,000 years old.',
     'Small groups of modern humans lived in a cold steppe in central Europe while Neanderthals were still there.',
     [doi('Mylopotamitaki, D. et al., "Homo sapiens reached the higher latitudes of Europe by 45,000 years ago", Nature 626, 341-346 (2024)', '10.1038/s41586-023-06923-7')]),
    ('bacho_kiro', 'Bacho Kiro Cave', 42.95, 25.43, 45, (43, 46), 'fossil', 'homo_sapiens',
     'Modern human bones, pendants of cave-bear teeth and stone blades in a Bulgarian cave, 46,000 to 43,000 years ago.',
     'Some of these people had a Neanderthal ancestor only a few generations back.',
     [doi('Hublin, J.-J. et al., "Initial Upper Palaeolithic Homo sapiens from Bacho Kiro Cave, Bulgaria", Nature 581, 299-302 (2020)', '10.1038/s41586-020-2259-z')]),
    ('ust_ishim', 'Ust\'-Ishim', 57.69, 71.17, 45, (43, 47), 'fossil', 'homo_sapiens',
     'A thigh bone washed out of a riverbank in western Siberia gave the oldest modern human genome.',
     'His DNA dates the Neanderthal mixing to 50,000 to 60,000 years ago.',
     [doi('Fu, Q. et al., "Genome sequence of a 45,000-year-old modern human from western Siberia", Nature 514, 445-449 (2014)', '10.1038/nature13810')]),
    ('oase', 'Peștera cu Oase', 45.03, 21.82, 40, (37, 42), 'fossil', 'homo_sapiens',
     'A jaw in a Romanian cave whose owner had a Neanderthal ancestor four to six generations back.',
     'Direct proof that modern humans and Neanderthals had children in Europe.',
     [doi('Fu, Q. et al., "An early modern human from Romania with a recent Neanderthal ancestor", Nature 524, 216-219 (2015)', '10.1038/nature14558')]),
    ('swabian_jura', 'Hohle Fels and Hohlenstein-Stadel', 48.38, 9.75, 40, (35, 42), 'art', 'homo_sapiens',
     'Caves in the Swabian Jura with the Lion Man, a Venus figurine and bone flutes, about 40,000 years old.',
     'The oldest known figurines and musical instruments.',
     [doi('Conard, N. J., "A female figurine from the basal Aurignacian of Hohle Fels Cave in southwestern Germany", Nature 459, 248-252 (2009)', '10.1038/nature07995')]),
    ('tianyuan', 'Tianyuan Cave', 39.65, 115.88, 40, (39, 42), 'fossil', 'homo_sapiens',
     'A modern human near Beijing about 40,000 years old; his DNA links him to later East Asians and Native Americans.',
     'East Asia\'s population history goes back at least this far.',
     [doi('Fu, Q. et al., "DNA analysis of an early modern human from Tianyuan Cave, China", PNAS 110, 2223-2227 (2013)', '10.1073/pnas.1221359110')]),
    ('gorhams_cave', 'Gorham\'s Cave', 36.12, -5.34, 40, (28, 42), 'site', 'neanderthals',
     'A sea cave on Gibraltar with Neanderthal hearths and an engraved hashtag on the floor.',
     'Among the last Neanderthal refuges; how late they lasted here is argued over.',
     [doi('Finlayson, C. et al., "Late survival of Neanderthals at the southernmost extreme of Europe", Nature 443, 850-853 (2006)', '10.1038/nature05195'),
      doi('Higham, T. et al., "The timing and spatiotemporal patterning of Neanderthal disappearance", Nature 512, 306-309 (2014)', '10.1038/nature13621')],
     {'conf': 'approximate', 'debate': [{'view': 'Neanderthals lasted here until about 28,000 years ago', 'by': 'Finlayson et al. 2006'}, {'view': 'They were gone everywhere by about 40,000 years ago', 'by': 'Higham et al. 2014'}]}),
    ('sungir', 'Sungir', 56.17, 40.5, 34, (33, 35), 'burial', 'homo_sapiens',
     'Graves near Vladimir with two children and a man dressed in thousands of mammoth-ivory beads.',
     'Ice Age foragers lived in small, far-flung networks that avoided marrying close kin.',
     [doi('Sikora, M. et al., "Ancient genomes show social and reproductive behavior of early Upper Paleolithic foragers", Science 358, 659-662 (2017)', '10.1126/science.aao1807')]),
    ('yana', 'Yana Rhinoceros Horn Site', 70.72, 135.42, 32, (31, 33), 'site', 'homo_sapiens',
     'Mammoth hunters camped above the Arctic Circle in Siberia, 32,000 years ago.',
     'People coped with the far north before the Last Glacial Maximum; their kin later reached Beringia.',
     [doi('Pitulko, V. V. et al., "The Yana RHS site: humans in the Arctic before the Last Glacial Maximum", Science 303, 52-56 (2004)', '10.1126/science.1085219')]),
    ('dolni_vestonice', 'Dolní Věstonice', 48.88, 16.65, 29, (26, 31), 'art', 'homo_sapiens',
     'A camp of mammoth hunters in Moravia with the oldest fired-clay figurine, the Venus of Dolní Věstonice.',
     'People fired clay 15,000 years before anyone made pots from it.',
     [doi('Vandiver, P. B. et al., "The origins of ceramic technology at Dolní Věstonice, Czechoslovakia", Science 246, 1002-1008 (1989)', '10.1126/science.246.4933.1002')]),
    ('malta', 'Mal\'ta', 52.83, 103.53, 24, (23, 25), 'burial', 'homo_sapiens',
     'A boy buried near Lake Baikal with ivory birds and a necklace; his genome is a third Native American.',
     'One Siberian population was ancestral both to Europeans and to the first Americans.',
     [doi('Raghavan, M. et al., "Upper Palaeolithic Siberian genome reveals dual ancestry of Native Americans", Nature 505, 87-91 (2014)', '10.1038/nature12736')]),
    ('ohalo', 'Ohalo II', 32.72, 35.57, 23, (22.5, 23.5), 'site', 'homo_sapiens',
     'Brush huts by the Sea of Galilee with wild wheat and barley, sickle blades and weeds of cultivated fields.',
     'Trial cultivation 11,000 years before farming took hold.',
     [doi('Snir, A. et al., "The origin of cultivation and proto-weeds, long before Neolithic farming", PLoS ONE 10, e0131422 (2015)', '10.1371/journal.pone.0131422')]),
    ('white_sands', 'White Sands footprints', 32.8, -106.3, 22, (21, 23), 'site', 'homo_sapiens',
     'Human footprints, many of children, beside a lake in New Mexico, dated 23,000 to 21,000 years ago.',
     'If right, people were in the Americas during the Last Glacial Maximum, thousands of years earlier than once thought.',
     [doi('Bennett, M. R. et al., "Evidence of humans in North America during the Last Glacial Maximum", Science 373, 1528-1531 (2021)', '10.1126/science.abg7586'),
      doi('Pigati, J. S. et al., "Independent age estimates resolve the controversy of ancient human footprints at White Sands", Science 382, 73-75 (2023)', '10.1126/science.adh5007')],
     {'conf': 'approximate'}),
    ('xianrendong', 'Xianrendong Cave', 28.7, 117.17, 20, (19, 21), 'site', 'homo_sapiens',
     'Pottery sherds 20,000 years old in a cave in Jiangxi, China.',
     'Foragers cooked in pots 10,000 years before farming: pottery did not need farmers.',
     [doi('Wu, X. et al., "Early pottery at 20,000 years ago in Xianrendong Cave, China", Science 336, 1696-1700 (2012)', '10.1126/science.1218643')]),
    ('monte_verde', 'Monte Verde', -41.5, -73.2, 14.5, (14.2, 14.8), 'site', 'homo_sapiens',
     'A camp of wooden huts by a creek in southern Chile, preserved in peat, 14,500 years old.',
     'People reached the far south of the Americas before the ice-free corridor opened, so they likely came down the coast.',
     [doi('Dillehay, T. D. et al., "Monte Verde: seaweed, food, medicine, and the peopling of South America", Science 320, 784-786 (2008)', '10.1126/science.1156533')]),
    ('paisley_caves', 'Paisley Caves', 42.75, -120.55, 14.3, (14.1, 14.5), 'site', 'homo_sapiens',
     'Human coprolites with DNA in Oregon caves, 14,300 years old.',
     'Pre-Clovis people in the far west of North America.',
     [doi('Gilbert, M. T. P. et al., "DNA from pre-Clovis human coprolites in Oregon, North America", Science 320, 786-789 (2008)', '10.1126/science.1154116')]),
    ('oberkassel', 'Bonn-Oberkassel', 50.71, 7.16, 14.2, (14.0, 14.4), 'burial', 'homo_sapiens',
     'A man and a woman buried with a young dog that had been nursed through distemper.',
     'The oldest undisputed domestic dog, cared for by its people.',
     [doi('Janssens, L. et al., "A new look at an old dog: Bonn-Oberkassel reconsidered", Journal of Archaeological Science 92, 126-138 (2018)', '10.1016/j.jas.2018.01.004')]),
    ('blackwater_draw', 'Blackwater Draw (Clovis)', 34.28, -103.33, 13.0, (12.9, 13.1), 'site', 'homo_sapiens',
     'Fluted Clovis spear points with mammoth bones near Clovis, New Mexico.',
     'Clovis spread across North America within a few centuries; it is no longer thought to be the first culture there.',
     [doi('Waters, M. R. & Stafford, T. W., "Redefining the age of Clovis: implications for the peopling of the Americas", Science 315, 1122-1126 (2007)', '10.1126/science.1137166')]),
    ('star_carr', 'Star Carr', 54.22, -0.42, 11.0, (10.6, 11.3), 'site', 'homo_sapiens',
     'A lakeside camp in Yorkshire with the oldest known house in Britain and red-deer antler headdresses.',
     'Britain was still joined to Europe by Doggerland when people built here.',
     [doi('Milner, N. et al., Star Carr Volume 1: A Persistent Place in a Changing World (White Rose University Press, 2018)', '10.22599/book1')]),
    ('jiahu', 'Jiahu', 33.6, 113.67, 8.5, (7.5, 9.0), 'site', 'homo_sapiens',
     'A Neolithic village in Henan with rice, bone flutes still playable, and fermented drinks.',
     'Early farming villages in China, with music.',
     [doi('Zhang, J. et al., "Oldest playable musical instruments found at Jiahu early Neolithic site in China", Nature 401, 366-368 (1999)', '10.1038/43865')]),
    ('lepenski_vir', 'Lepenski Vir', 44.56, 22.03, 8.0, (7.5, 11.5), 'site', 'homo_sapiens',
     'Trapezoid houses and fish-faced sandstone heads by the Iron Gates of the Danube.',
     'Foragers met the first farmers here and some took up their ways.',
     [doi('Borić, D., "The Lepenski Vir conundrum: reinterpretation of the Mesolithic and Neolithic sequences in the Danube Gorges", Antiquity 76, 1026-1039 (2002)', '10.1017/S0003598X00091821')]),
    ('nabta_playa', 'Nabta Playa', 22.51, 30.73, 7.0, (6.5, 9.0), 'site', 'homo_sapiens',
     'Cattle burials and a stone circle by a seasonal lake in what is now the Egyptian desert.',
     'Herders of the Green Sahara; when the rains failed they moved toward the Nile.',
     [doi('Malville, J. M. et al., "Megaliths and Neolithic astronomy in southern Egypt", Nature 392, 488-491 (1998)', '10.1038/33131')]),
]

# ---------- groups: the other kinds of human ----------
GROUPS = [
    ('neanderthals', 'Neanderthals', 'Homo neanderthalensis', 400, 40, [44, 22], 'Strong, big-brained people of Ice Age Europe and western Asia; they made tools, used fire, wore ornaments and buried some of their dead.',
     'They vanished about 40,000 years ago, soon after modern humans arrived; 1 to 2% of their DNA lives on in everyone outside Africa.',
     [[-9.5, 37], [-9, 43.5], [-4, 48.5], [3, 51.5], [11, 53.5], [24, 52.5], [40, 55], [56, 56.5], [72, 54.5], [86, 52.5], [88, 49.5], [75, 41], [62, 36], [52, 32.5], [45, 30.5], [36, 30.5], [33, 35.5], [24, 35], [14, 37], [5, 36.5]],
     [doi('Higham, T. et al., "The timing and spatiotemporal patterning of Neanderthal disappearance", Nature 512, 306-309 (2014)', '10.1038/nature13621'),
      doi('Prüfer, K. et al., "The complete genome sequence of a Neanderthal from the Altai Mountains", Nature 505, 43-49 (2014)', '10.1038/nature12886')], 'estimated'),
    ('denisovans', 'Denisovans', 'Denisovans (no species name yet)', 300, 40, [98, 30], 'A sister group of the Neanderthals known mostly from DNA: a finger bone, teeth and two jaws from Siberia, Tibet and Laos.',
     'People of Papua and Aboriginal Australians carry up to 5% Denisovan DNA, so Denisovans must also have lived far to the south-east.',
     [[80, 54], [92, 52], [106, 46], [114, 38], [118, 30], [116, 22], [108, 15], [104, 8], [96, 12], [92, 22], [84, 28], [76, 33], [78, 42], [76, 50]],
     [doi('Reich, D. et al., "Genetic history of an archaic hominin group from Denisova Cave in Siberia", Nature 468, 1053-1060 (2010)', '10.1038/nature09710'),
      doi('Demeter, F. et al., "A Middle Pleistocene Denisovan molar from the Annamite Chain of northern Laos", Nature Communications 13, 2557 (2022)', '10.1038/s41467-022-29923-z'),
      doi('Zhang, D. et al., "Denisovan DNA in Late Pleistocene sediments from Baishiya Karst Cave on the Tibetan Plateau", Science 370, 584-587 (2020)', '10.1126/science.abb6320')], 'approximate'),
    ('homo_floresiensis', 'Homo floresiensis', 'Homo floresiensis ("the hobbit")', 190, 50, [120.5, -8.6], 'A metre-tall human with a chimp-sized brain on the island of Flores.',
     'Isolated on an island for perhaps a million years, its ancestors shrank, like the island\'s dwarf elephants.',
     [[119.8, -8.3], [121.2, -8.2], [123.0, -8.3], [122.9, -8.9], [121.0, -8.95], [119.8, -8.9]],
     [doi('Sutikna, T. et al., "Revised stratigraphy and chronology for Homo floresiensis at Liang Bua in Indonesia", Nature 532, 366-369 (2016)', '10.1038/nature17179')], 'estimated'),
    ('homo_luzonensis', 'Homo luzonensis', 'Homo luzonensis', 67, 50, [121.8, 17.6], 'A small human known from teeth and finger and toe bones in Callao Cave, Luzon.',
     'Archaic humans crossed open sea to the Philippines long before modern humans.',
     [[120.4, 18.6], [122.3, 18.6], [122.3, 15.8], [121.3, 14.3], [120.5, 15.0]],
     [doi('Détroit, F. et al., "A new species of Homo from the Late Pleistocene of the Philippines", Nature 568, 181-186 (2019)', '10.1038/s41586-019-1067-9')], 'approximate'),
    ('homo_naledi', 'Homo naledi', 'Homo naledi', 335, 236, [27.7, -26.0], 'A small-brained human with modern-looking hands and feet, from the Rising Star caves.',
     'Shows that a "primitive" human survived late, alongside early Homo sapiens.',
     [[26.6, -25.3], [28.8, -25.3], [28.8, -26.7], [26.6, -26.7]],
     [doi('Dirks, P. et al., "The age of Homo naledi and associated sediments in the Rising Star Cave, South Africa", eLife 6, e24231 (2017)', '10.7554/eLife.24231')], 'estimated'),
    ('homo_erectus', 'Homo erectus (last)', 'Homo erectus', 1900, 108, [111.5, -7.3], 'The long-lived human species that first left Africa; its last known members lived on Java.',
     'It survived on Java until about 110,000 years ago, when grassland gave way to rainforest.',
     [[105.5, -6.0], [114.5, -6.8], [114.5, -8.6], [106, -7.6]],
     [doi('Rizal, Y. et al., "Last appearance of Homo erectus at Ngandong, Java, 117,000-108,000 years ago", Nature 577, 381-385 (2020)', '10.1038/s41586-019-1863-2')], 'estimated'),
]

# ---------- megafauna ----------
STUART = doi('Stuart, A. J., "Late Quaternary megafaunal extinctions on the continents: a short review", Geological Journal 50, 338-363 (2015)', '10.1002/gj.2633')
OVERKILL = {'view': 'Human hunting tipped them over', 'by': 'overkill school (e.g. Sandom et al. 2014)'}
CLIMATE = {'view': 'Warming shrank their habitat', 'by': 'climate school (e.g. Stuart & Lister 2012)'}
FAUNA = [
    ('woolly_mammoth', 'Woolly mammoth', 'Mammuthus primigenius', 'deep_mammoth', 400, 10.5, [[95, 62], [-150, 66]],
     'Shaggy, small-eared elephants of the mammoth steppe, from Ireland to Alaska.',
     'Gone from the mainland about 10,500 years ago; a dwarfed population survived on Wrangel Island until about 4,000 years ago, when the pyramids already stood.',
     [[-10, 52], [0, 56], [20, 58], [45, 66], [80, 72], [120, 74], [160, 70], [180, 68], [180, 58], [150, 55], [125, 45], [100, 45], [70, 48], [45, 47], [25, 46], [5, 45]],
     [STUART, doi('Vartanyan, S. L. et al., "Holocene dwarf mammoths from Wrangel Island in the Siberian Arctic", Nature 362, 337-340 (1993)', '10.1038/362337a0')],
     {'last_refuge': {'name': 'Wrangel Island', 'lat': 71.2, 'lon': -179.5, 'end': -2000}, 'range2': [[-180, 68], [-160, 71], [-140, 70], [-125, 64], [-110, 56], [-95, 50], [-100, 44], [-125, 50], [-150, 58], [-170, 60], [-180, 62]]}),
    ('woolly_rhino', 'Woolly rhinoceros', 'Coelodonta antiquitatis', 'deep_rhino', 400, 14, [60, 55],
     'A two-horned rhino with a thick coat, grazing the cold steppes of Eurasia.',
     'It held on in north-east Siberia until about 14,000 years ago, then vanished in the warm Bølling-Allerød spell.',
     [[-5, 50], [20, 54], [50, 60], [90, 68], [130, 72], [160, 68], [140, 52], [110, 42], [80, 44], [55, 45], [30, 45], [5, 44]],
     [doi('Stuart, A. J. & Lister, A. M., "Extinction chronology of the woolly rhinoceros Coelodonta antiquitatis in the context of late Quaternary megafaunal extinctions in northern Eurasia", Quaternary Science Reviews 51, 1-17 (2012)', '10.1016/j.quascirev.2012.06.007'),
      doi('Lord, E. et al., "Pre-extinction demographic stability and genomic signatures of adaptation in the woolly rhinoceros", Current Biology 30, 3871-3879 (2020)', '10.1016/j.cub.2020.07.046')], {}),
    ('giant_deer', 'Giant deer', 'Megaloceros giganteus', 'deep_elk', 400, 7.7, [30, 52],
     'The "Irish elk": a deer with antlers up to 3.6 m across.',
     'Its last herds lived in western Siberia until about 7,700 years ago, long after the mammoths left Europe.',
     [[-10, 54], [5, 56], [30, 58], [60, 60], [85, 56], [75, 48], [50, 45], [25, 44], [0, 46]],
     [doi('Stuart, A. J. et al., "Pleistocene to Holocene extinction dynamics in giant deer and woolly mammoth", Nature 431, 684-689 (2004)', '10.1038/nature02890')], {}),
    ('cave_bear', 'Cave bear', 'Ursus spelaeus', 'deep_bear', 400, 24, [14, 46.5],
     'A huge, mostly plant-eating bear that hibernated in caves; Neanderthals and modern humans used the same caves.',
     'It died out about 24,000 years ago, at the coldest time, perhaps squeezed by people taking its caves.',
     [[-8, 43], [-2, 48], [8, 51], [20, 51], [35, 47], [42, 42], [30, 39], [18, 40], [8, 43], [-2, 42]],
     [doi('Pacher, M. & Stuart, A. J., "Extinction chronology and palaeobiology of the cave bear (Ursus spelaeus)", Boreas 38, 189-206 (2009)', '10.1111/j.1502-3885.2008.00071.x')], {}),
    ('smilodon', 'Sabre-toothed cat', 'Smilodon fatalis and S. populator', 'deep_smilodon', 2500, 10, [[-98, 36], [-58, -20]],
     'A heavy cat with 28 cm canines that ambushed large grazers in the Americas.',
     'It vanished with its prey around 12,000 to 10,000 years ago, soon after people spread through the Americas.',
     [[-125, 48], [-100, 49], [-75, 42], [-80, 28], [-95, 18], [-80, 8], [-60, 0], [-40, -10], [-50, -30], [-65, -40], [-72, -20], [-80, -2], [-105, 20], [-120, 32]],
     [STUART], {}),
    ('ground_sloth', 'Giant ground sloth', 'Megatherium americanum', 'deep_sloth', 2000, 12, [-62, -32],
     'A ground sloth as big as an elephant that could rear up to browse trees.',
     'Gone about 12,000 years ago, within a couple of thousand years of people reaching the pampas.',
     [[-72, -18], [-58, -16], [-50, -26], [-56, -38], [-65, -42], [-70, -32]],
     [STUART], {}),
    ('diprotodon', 'Diprotodon', 'Diprotodon optatum', 'deep_diprotodon', 2000, 44, [137, -27],
     'The largest marsupial ever: a three-tonne wombat relative that roamed Australia in herds.',
     'It disappeared around 45,000 years ago, a few thousand years after people arrived.',
     [[114, -22], [122, -17], [132, -13], [142, -11], [146, -18], [152, -26], [150, -36], [140, -38], [130, -32], [116, -33]],
     [doi('Roberts, R. G. et al., "New ages for the last Australian megafauna: continent-wide extinction about 46,000 years ago", Science 292, 1888-1892 (2001)', '10.1126/science.1060264'),
      doi('Wroe, S. et al., "Climate change frames debate over the extinction of megafauna in Sahul", PNAS 110, 8777-8781 (2013)', '10.1073/pnas.1302766110')], {}),
]

# ---------- dispersals: stops are [lon, lat, ka] ----------
DISP = [
    ('early_levant', 'Early forays into the Levant', 'approximate', [[36.0, 9.0, 200], [32.5, 16.0, 196], [31.3, 25.5, 192], [32.6, 30.2, 189], [34.97, 32.72, 185]],
     'Small groups crossed from north-east Africa to the Levant about 190,000 years ago (Misliya), and again about 120,000 years ago (Skhul and Qafzeh).',
     'These early movers did not leave lasting descendants that geneticists can find; the climate turned and the Levant went back to Neanderthals.', ['misliya', 'qafzeh']),
    ('southern_route', 'Out of Africa by the southern route', 'approximate', [[39.0, 9.0, 70], [43.3, 12.6, 66], [48.5, 14.5, 63], [56.5, 21.5, 61], [63.0, 25.0, 59], [70.0, 22.0, 57], [78.0, 15.0, 55], [90.5, 22.0, 53], [98.0, 15.0, 52], [102.0, 3.0, 51], [110.0, -5.5, 50], [118.0, -8.5, 49.5], [125.5, -9.5, 49], [132.87, -12.5, 48]],
     'The ancestors of everyone outside Africa crossed the Bab-el-Mandeb, then moved along the coasts of Arabia and India to Sunda and Sahul.',
     'Genomes put the main dispersal at 60,000 to 50,000 years ago; Madjedbebe in Australia may be older, which is still argued.', ['madjedbebe', 'leang_karampuang']),
    ('into_europe', 'Into Europe', 'approximate', [[35.0, 32.7, 55], [36.5, 36.8, 51], [29.0, 41.0, 48], [25.43, 42.95, 46], [21.82, 45.03, 44], [16.6, 48.5, 43], [9.75, 48.38, 42], [4.0, 45.5, 41], [-3.0, 43.0, 40]],
     'From the Levant through Anatolia and up the Danube: modern humans were across Europe by 42,000 years ago.',
     'They met Neanderthals along the way; within a few thousand years only one kind of human was left.', ['grotte_mandrin', 'bacho_kiro', 'ranis', 'oase', 'swabian_jura']),
    ('into_siberia', 'Into Siberia and the Arctic', 'approximate', [[52.0, 36.5, 50], [62.0, 40.0, 48], [71.17, 57.69, 45], [84.68, 51.4, 44], [103.5, 52.8, 40], [125.0, 62.0, 35], [135.42, 70.72, 32]],
     'North across Central Asia to western Siberia (Ust\'-Ishim), Lake Baikal, and the Arctic coast at Yana.',
     'These northern people later met East Asians; their mixed descendants crossed Beringia.', ['ust_ishim', 'yana', 'malta']),
    ('east_asia', 'Into East Asia and Japan', 'approximate', [[98.0, 15.0, 52], [103.4, 20.2, 48], [108.0, 24.0, 46], [113.0, 30.0, 43], [115.88, 39.65, 40], [127.0, 37.0, 38.5], [131.0, 33.5, 38]],
     'From mainland Southeast Asia north through China; by 38,000 years ago people had crossed to Japan.',
     'Tianyuan shows East Asian ancestry was in place 40,000 years ago.', ['tam_pa_ling', 'tianyuan']),
    ('americas_coast', 'Into the Americas along the coast', 'approximate', [[135.4, 70.7, 30], [160.0, 66.5, 26], [-172.0, 65.0, 23], [-160.0, 59.0, 17.5], [-140.0, 59.0, 17.0], [-131.0, 54.0, 16.6], [-124.0, 44.0, 16.2], [-118.0, 33.0, 15.8], [-106.0, 21.0, 15.4], [-84.0, 9.0, 15.1], [-80.0, -3.0, 14.9], [-71.0, -20.0, 14.7], [-73.2, -41.5, 14.5]],
     'People waited in Beringia during the Last Glacial Maximum, then moved south along a coast of kelp forests as the Cordilleran ice pulled back.',
     'Monte Verde in Chile was lived in 14,500 years ago; White Sands footprints, if their dates hold, mean some came even before the ice peaked.', ['monte_verde', 'paisley_caves', 'white_sands']),
    ('ice_free_corridor', 'Down the ice-free corridor', 'approximate', [[-140.0, 64.0, 14.0], [-125.0, 60.0, 13.7], [-117.0, 55.0, 13.4], [-112.0, 50.0, 13.2], [-106.0, 41.0, 13.05], [-103.33, 34.28, 13.0]],
     'A passage opened between the Laurentide and Cordilleran ice about 13,800 years ago; Clovis hunters spread across the plains soon after.',
     'The corridor came too late to be the first way in, but it linked Alaska and the plains.', ['blackwater_draw']),
    ('tasmania', 'Across the Bassian land bridge to Tasmania', 'approximate', [[145.0, -37.8, 41], [146.0, -39.6, 40], [146.5, -41.8, 39], [146.0, -42.8, 38.5]],
     'With the sea 60 m or more lower, Tasmania was a peninsula; people walked there about 40,000 years ago.',
     'When the strait flooded about 14,000 years ago, Tasmanians were cut off for 10,000 years.', []),
]

# ---------- domestication hearths ----------
LARSON = doi('Larson, G. et al., "Current perspectives and the future of domestication studies", PNAS 111, 6139-6146 (2014)', '10.1073/pnas.1323964111')
HEARTHS = [
    ('fertile_crescent', 'Fertile Crescent', 37.2, 39.5, 11.5, (12.0, 10.0), ['einkorn wheat', 'emmer wheat', 'barley', 'lentil', 'pea', 'chickpea', 'flax'], ['sheep', 'goat', 'cattle', 'pig'],
     'In the hills from the Levant to the Zagros, foragers turned wild wheat, barley and lentils into crops and herded goats, sheep, cattle and pigs.',
     'The first farming and the first villages that grew into towns; farming spread from here to Europe, Egypt and South Asia.',
     [doi('Zeder, M. A., "The origins of agriculture in the Near East", Current Anthropology 52, S221-S235 (2011)', '10.1086/659307'), LARSON], 'estimated', ['idea:crop_wheat']),
    ('yellow_river', 'Yellow River', 35.5, 113.5, 10.0, (10.3, 8.0), ['broomcorn millet', 'foxtail millet'], ['pig', 'chicken (later)'],
     'On the loess plain of north China people grew millet, the grain of the first Chinese villages.',
     'Millet farming fed the Yangshao and later the Shang.',
     [doi('Lu, H. et al., "Earliest domestication of common millet (Panicum miliaceum) in East Asia extended to 10,000 years ago", PNAS 106, 7367-7372 (2009)', '10.1073/pnas.0900158106')], 'estimated', []),
    ('yangtze', 'Lower Yangtze', 30.0, 120.0, 9.0, (10.0, 6.5), ['rice'], ['pig'],
     'Wetland foragers of the lower Yangtze slowly turned wild rice into a crop over several thousand years.',
     'Rice became the staple of half the world.',
     [doi('Fuller, D. Q. et al., "The domestication process and domestication rate in rice: spikelet bases from the Lower Yangtze", Science 323, 1607-1610 (2009)', '10.1126/science.1166605')], 'estimated', ['idea:crop_rice']),
    ('new_guinea', 'New Guinea Highlands', -5.78, 144.33, 7.0, (10.0, 6.5), ['taro', 'banana', 'yam', 'sugarcane'], [],
     'At Kuk Swamp people dug drains and planted mounds of taro and bananas.',
     'An independent invention of farming in the tropics, in an area never touched by the other hearths.',
     [doi('Denham, T. P. et al., "Origins of agriculture at Kuk Swamp in the Highlands of New Guinea", Science 301, 189-193 (2003)', '10.1126/science.1085255')], 'estimated', ['idea:crop_sugarcane']),
    ('mesoamerica', 'Mesoamerica', 18.3, -99.5, 9.0, (10.0, 8.7), ['squash', 'maize', 'beans', 'chilli'], ['turkey (later)'],
     'Squash in the Oaxaca caves by 10,000 years ago; maize from wild teosinte in the Balsas valley by 9,000.',
     'Maize took millennia to become a big-cobbed staple; it went on to feed the Americas and, after 1492, the world.',
     [doi('Smith, B. D., "The initial domestication of Cucurbita pepo in the Americas 10,000 years ago", Science 276, 932-934 (1997)', '10.1126/science.276.5314.932'),
      doi('Piperno, D. R. et al., "Starch grain and phytolith evidence for early ninth millennium B.P. maize from the Central Balsas River Valley, Mexico", PNAS 106, 5019-5024 (2009)', '10.1073/pnas.0812525106')], 'estimated', ['idea:crop_maize']),
    ('amazonia', 'South-western Amazonia', -11.0, -64.0, 10.0, (10.4, 8.0), ['cassava', 'squash', 'peanut'], [],
     'Forest islands in the Llanos de Moxos are full of squash and cassava remains from 10,000 years ago.',
     'Amazonia was a cradle of crops, not an untouched wilderness.',
     [doi('Lombardo, U. et al., "Early Holocene crop cultivation and landscape modification in Amazonia", Nature 581, 190-193 (2020)', '10.1038/s41586-020-2162-7')], 'estimated', ['idea:crop_cassava']),
    ('andes', 'Central Andes', -15.8, -69.5, 8.0, (10.0, 6.0), ['potato', 'quinoa', 'common bean'], ['llama', 'alpaca', 'guinea pig'],
     'Around Lake Titicaca and the high puna, people domesticated potatoes, quinoa, llamas and alpacas.',
     'High-altitude farming and herding, the base of Tiwanaku and the Inca.',
     [LARSON], 'approximate', ['idea:crop_potato']),
    ('indus', 'Western South Asia (Mehrgarh)', 29.4, 67.6, 8.5, (9.0, 7.5), ['barley', 'wheat (from the west)'], ['zebu cattle'],
     'At Mehrgarh, at the foot of the Bolan Pass, villagers herded humped zebu cattle, tamed locally, and grew barley.',
     'The farming roots of the Indus civilisation.',
     [LARSON], 'approximate', []),
    ('sahel', 'Sahel and Sudanic savanna', 13.0, 25.0, 5.0, (6.0, 4.5), ['sorghum', 'pearl millet', 'African rice (later)'], ['cattle herding (from about 8,000 years ago)'],
     'Herders of the Green Sahara kept cattle; as it dried, sorghum and pearl millet were domesticated along its southern edge.',
     'African crops that later spread to India.',
     [LARSON], 'approximate', []),
    ('eastern_north_america', 'Eastern North America', 37.0, -87.0, 5.0, (5.0, 3.8), ['squash', 'sunflower', 'goosefoot', 'marsh elder'], [],
     'River-valley foragers in the Midwest domesticated seed plants long before maize arrived.',
     'One of the world\'s independent hearths, often forgotten.',
     [doi('Smith, B. D., "Eastern North America as an independent center of plant domestication", PNAS 103, 12223-12228 (2006)', '10.1073/pnas.0604335103')], 'estimated', []),
    ('dogs', 'The first dogs', 56.0, 100.0, 23.0, (30.0, 15.0), [], ['dog'],
     'Wolves that followed Ice Age hunters became dogs, perhaps in Siberia around 23,000 years ago.',
     'The first domestic animal, thousands of years before any crop; where and when is still argued.',
     [doi('Perri, A. R. et al., "Dog domestication and the dual dispersal of people and dogs into the Americas", PNAS 118, e2010083118 (2021)', '10.1073/pnas.2010083118'),
      doi('Janssens, L. et al., "A new look at an old dog: Bonn-Oberkassel reconsidered", Journal of Archaeological Science 92, 126-138 (2018)', '10.1016/j.jas.2018.01.004')], 'approximate', []),
]

# ---------- landscape: land bridges show when the sea is low enough; ice sheets when the ice is there ----------
VORIS = doi('Voris, H. K., "Maps of Pleistocene sea levels in Southeast Asia: shorelines, river systems and time durations", Journal of Biogeography 27, 1153-1167 (2000)', '10.1046/j.1365-2699.2000.00489.x')
LAND = [
    ('beringia', 'Beringia', 'landbridge', 65.5, -169.0, 'A land as big as British Columbia between Siberia and Alaska, a cold grassland with mammoths, horses and bison.',
     'People lived here for thousands of years before moving into the Americas; the Bering Strait flooded about 11,000 years ago.',
     [doi('Jakobsson, M. et al., "Post-glacial flooding of the Bering Land Bridge dated to 11 cal ka BP", Climate of the Past 13, 991-1005 (2017)', '10.5194/cp-13-991-2017')]),
    ('doggerland', 'Doggerland', 'landbridge', 54.6, 3.0, 'Rolling plains, rivers and marshes joining Britain to the continent, home to Mesolithic hunters and fishers.',
     'The rising sea drowned it bit by bit; the Storegga tsunami about 8,150 years ago may have swept its last islands.',
     [doi('Weninger, B. et al., "The catastrophic final flooding of Doggerland by the Storegga Slide tsunami", Documenta Praehistorica 35, 1-24 (2008)', '10.4312/dp.35.1')]),
    ('sundaland', 'Sundaland', 'landbridge', 3.5, 108.0, 'Sumatra, Java, Borneo and the Malay Peninsula joined in one subcontinent crossed by great rivers.',
     'Modern humans walked to Java and Borneo; the deep Wallace line still had to be crossed by boat.',
     [VORIS]),
    ('sahul', 'Sahul', 'landbridge', -10.0, 138.0, 'Australia, New Guinea and Tasmania as one continent.',
     'Getting here took at least eight sea crossings, the oldest known open-sea voyages.',
     [VORIS]),
    ('bassian', 'Bassian land bridge', 'landbridge', -39.6, 146.3, 'Dry land joining Tasmania to the mainland.',
     'Flooded as the ice melted; Tasmanians were then isolated until 1642.',
     [doi('Lambeck, K. & Chappell, J., "Sea level change through the last glacial cycle", Science 292, 679-686 (2001)', '10.1126/science.1059549')]),
    ('gulf_oasis', 'Gulf Oasis', 'landbridge', 27.5, 51.0, 'The Persian Gulf basin as a well-watered river valley fed by the Tigris, Euphrates and springs.',
     'A possible refuge for people in Arabia, drowned between 12,000 and 8,000 years ago.',
     [doi('Rose, J. I., "New light on human prehistory in the Arabo-Persian Gulf Oasis", Current Anthropology 51, 849-883 (2010)', '10.1086/657397')]),
    ('palk', 'India–Sri Lanka', 'landbridge', 9.3, 79.5, 'A land link between India and Sri Lanka across the Palk Strait.', 'People and animals walked between them.', [VORIS]),
    ('adriatic_plain', 'Great Adriatic Plain', 'landbridge', 44.0, 13.8, 'The northern Adriatic as a broad river plain of the Po.', 'Hunters followed herds across what is now the sea floor off Venice.',
     [doi('Lambeck, K. & Chappell, J., "Sea level change through the last glacial cycle", Science 292, 679-686 (2001)', '10.1126/science.1059549')]),
]
BATCHELOR = doi('Batchelor, C. L. et al., "The configuration of Northern Hemisphere ice sheets through the Quaternary", Nature Communications 10, 3713 (2019)', '10.1038/s41467-019-11601-2')
ICE = [
    ('laurentide', 'Laurentide Ice Sheet', 59.0, -84.0, 'Ice up to 3 km thick over most of Canada, reaching south of the Great Lakes.'),
    ('cordilleran', 'Cordilleran Ice Sheet', 56.0, -126.0, 'Ice along the Rockies and Coast Mountains from Washington to Alaska.'),
    ('innuitian', 'Innuitian Ice Sheet', 79.0, -82.0, 'Ice over the Canadian Arctic islands, joined to Greenland.'),
    ('fennoscandian', 'Fennoscandian Ice Sheet', 63.5, 18.0, 'Ice over Scandinavia and Finland, reaching into Germany, Poland and Russia.'),
    ('british_irish', 'British-Irish Ice Sheet', 56.5, -4.5, 'Ice over Scotland, Ireland and northern England.'),
    ('barents_kara', 'Barents-Kara Ice Sheet', 77.0, 50.0, 'Marine ice grounded on the shallow Barents and Kara seas.'),
    ('patagonian', 'Patagonian Ice Sheet', -47.0, -72.5, 'Ice along the southern Andes from about 38 S to Cape Horn.'),
]

# ---------- climate events ----------
EVENTS = [
    ('last_interglacial', 'The last interglacial (Eemian)', 'climate_shift', 129, 116, 52.0, 5.0, 'A warm spell a little warmer than today; hippos lived in the Thames and the sea was 6 to 9 m higher.', 'The world as it was before the last ice age.', [doi('Dutton, A. et al., "Sea-level rise due to polar ice-sheet mass loss during past warm periods", Science 349, aaa4019 (2015)', '10.1126/science.aaa4019')]),
    ('neanderthal_mixing', 'Neanderthal-modern human mixing', 'genetic_finding', 60, 45, 34.0, 40.0, 'Modern humans leaving Africa mixed with Neanderthals, most likely in western Asia.', 'Everyone outside Africa carries 1 to 2% Neanderthal DNA from this time.', [doi('Fu, Q. et al., "Genome sequence of a 45,000-year-old modern human from western Siberia", Nature 514, 445-449 (2014)', '10.1038/nature13810')]),
    ('laschamp', 'Laschamps geomagnetic excursion', 'climate_shift', 42.2, 41.5, 45.75, 2.95, 'Earth\'s magnetic field fell to a few percent of today\'s strength and flipped briefly.', 'More cosmic rays reached the ground; some argue it shaped climate and cave use, which is debated.', [doi('Cooper, A. et al., "A global environmental crisis 42,000 years ago", Science 371, 811-818 (2021)', '10.1126/science.abb8677')]),
    ('campanian', 'Campanian Ignimbrite eruption', 'eruption', 39.9, 39.8, 40.83, 14.14, 'The Campi Flegrei volcano near Naples buried southern Italy in ash and threw tephra as far as Russia.', 'The largest eruption in Europe in 200,000 years, as Neanderthals were vanishing.', [doi('Giaccio, B. et al., "High-precision 14C and 40Ar/39Ar dating of the Campanian Ignimbrite (Y-5) reconciles the time-scales of climatic-cultural processes at 40 ka", Scientific Reports 7, 45940 (2017)', '10.1038/srep45940')]),
    ('lgm', 'Last Glacial Maximum', 'climate_shift', 26, 19, 60.0, -80.0, 'Ice reached its greatest extent; the sea stood about 130 m lower than today.', 'The coldest stretch of the last ice age: Europe north of the Alps emptied of people and refuges filled.', [doi('Clark, P. U. et al., "The Last Glacial Maximum", Science 325, 710-714 (2009)', '10.1126/science.1172873')]),
    ('mwp1a', 'Meltwater pulse 1A', 'climate_shift', 14.65, 14.31, -17.5, -149.5, 'The sea rose about 14 to 18 m in roughly 350 years as the ice sheets collapsed.', 'Coasts moved inland by kilometres within a few lifetimes; the record comes from Tahiti\'s drowned reefs.', [doi('Deschamps, P. et al., "Ice-sheet collapse and sea-level rise at the Bølling warming 14,600 years ago", Nature 483, 559-564 (2012)', '10.1038/nature10902')]),
    ('younger_dryas', 'Younger Dryas', 'climate_shift', 12.85, 11.65, 65.0, -40.0, 'A sudden return to near-glacial cold in the north for about 1,200 years.', 'Some argue the cold pushed Natufian foragers toward farming.', [doi('Rasmussen, S. O. et al., "A new Greenland ice core chronology for the last glacial termination", Journal of Geophysical Research 111, D06102 (2006)', '10.1029/2005JD006079')]),
    ('holocene', 'The Holocene begins', 'climate_shift', 11.7, 11.7, 72.6, -38.5, 'The ice age ends; the Greenland ice dates the start to 11,700 years ago.', 'The stable, warm climate in which farming and every civilisation began.', [doi('Walker, M. et al., "Formal definition and dating of the GSSP for the base of the Holocene", Journal of Quaternary Science 24, 3-17 (2009)', '10.1002/jqs.1227')]),
    ('green_sahara', 'The Green Sahara (African Humid Period)', 'climate_shift', 11.0, 5.5, 22.0, 15.0, 'Monsoon rains turned the Sahara into grassland with lakes, hippos and herders; Lake Mega-Chad was as big as the Caspian.', 'When the rains failed, herders moved to the Nile, around the time Egypt began.', [doi('deMenocal, P. et al., "Abrupt onset and termination of the African Humid Period", Quaternary Science Reviews 19, 347-361 (2000)', '10.1016/S0277-3791(99)00081-5')]),
    ('event_8_2', 'The 8.2 kiloyear event', 'climate_shift', 8.2, 8.0, 59.0, -85.0, 'Lake Agassiz drained into the North Atlantic, and the north cooled for about 150 years.', 'A short shock to early farmers in the Near East and Europe.', [doi('Alley, R. B. et al., "Holocene climatic instability: a prominent, widespread event 8200 yr ago", Geology 25, 483-486 (1997)', '10.1130/0091-7613(1997)025<0483:HCIAPW>2.3.CO;2')]),
    ('storegga', 'Storegga Slide tsunami', 'flood', 8.15, 8.15, 64.5, 5.0, 'A submarine landslide off Norway sent a tsunami across the North Sea; run-up reached 20 m in Shetland.', 'It may have drowned the last of Doggerland.', [doi('Weninger, B. et al., "The catastrophic final flooding of Doggerland by the Storegga Slide tsunami", Documenta Praehistorica 35, 1-24 (2008)', '10.4312/dp.35.1')]),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {k: [] for k in ('sites', 'groups', 'fauna', 'dispersals', 'hearths', 'landscape', 'events')}
    for row in SITES:
        sid, name, lat, lon, ka, rg, kind, who, what, why, src = row[:11]
        extra = row[11] if len(row) > 11 else {}
        r = rec(id='place:site_' + sid, kind='place', subtype='site', find=kind, name=name, lat=lat, lon=lon, start=yr(ka), start_approx=True,
                lenses=['population', 'geography'] + (['art'] if kind == 'art' else []), who='group:' + who if who != 'homo_sapiens' else 'group:homo_sapiens',
                what=what, why=why, sources=src, conf=extra.get('conf', 'estimated'))
        if rg: r['start_range'] = [yr(rg[1]), yr(rg[0])]
        if 'debate' in extra: r['debate'] = extra['debate']
        out['sites'].append(r)
    out['groups'].append(rec(id='group:homo_sapiens', kind='group', subtype='human_species', name='Homo sapiens', latin='Homo sapiens', start=yr(315), start_approx=True,
                             lenses=['population'], what='Our own species, first known from Jebel Irhoud in Morocco about 315,000 years ago.',
                             why='Every person alive today descends from African populations of this species.', conf='estimated',
                             sources=SITES[0][10]))
    for gid, name, latin, ka0, ka1, at, what, why, rng, src, conf in GROUPS:
        out['groups'].append(rec(id='group:' + gid, kind='group', subtype='human_species', name=name, latin=latin, start=yr(ka0), end=yr(ka1), start_approx=True, end_approx=True,
                                 lenses=['population'], lon=at[0], lat=at[1], range=rng, what=what, why=why, sources=src, conf=conf))
    for fid, name, latin, sprite, ka0, ka1, at, what, why, rng, src, extra in FAUNA:
        ats = at if isinstance(at[0], list) else [at]
        r = rec(id='group:fauna_' + fid, kind='group', subtype='megafauna', name=name, latin=latin, sprite=sprite, start=yr(ka0), end=yr(ka1), start_approx=True, end_approx=True,
                lenses=['geography'], lon=ats[0][0], lat=ats[0][1], at=ats, range=rng, what=what, why=why, sources=src, conf='estimated',
                debate=[OVERKILL, CLIMATE])
        if 'range2' in extra: r['range2'] = extra['range2']
        if 'last_refuge' in extra: r['last_refuge'] = extra['last_refuge']
        out['fauna'].append(r)
    for did, name, conf, stops, what, why, sites in DISP:
        out['dispersals'].append(rec(id='route:dispersal_' + did, kind='route', subtype='dispersal', name=name, carrier='group:homo_sapiens',
                                     start=yr(stops[0][2]), end=yr(stops[-1][2]), start_approx=True, end_approx=True, lenses=['population', 'geography'],
                                     path=[[s[0], s[1], yr(s[2])] for s in stops], conf=conf, what=what, why=why,
                                     sites=['place:site_' + s for s in sites],
                                     sources=[src for s in sites for src in next(x[10] for x in SITES if x[0] == s)][:3] or [doi('Lambeck, K. & Chappell, J., "Sea level change through the last glacial cycle", Science 292, 679-686 (2001)', '10.1126/science.1059549')]))
    for hid, name, lat, lon, ka, rg, crops, animals, what, why, src, conf, links in HEARTHS:
        r = rec(id='place:hearth_' + hid, kind='place', subtype='domestication_centre', name=name, lat=lat, lon=lon, start=yr(ka), start_approx=True,
                start_range=[yr(rg[0]), yr(rg[1])], crops=crops, animals=animals, lenses=['economy', 'population'], what=what, why=why, sources=src, conf=conf)
        if links: r['links'] = links
        out['hearths'].append(r)
    for lid, name, sub, lat, lon, what, why, src in LAND:
        out['landscape'].append(rec(id='place:' + lid, kind='place', subtype=sub, name=name, lat=lat, lon=lon, lenses=['geography'], what=what, why=why,
                                    sources=src, conf='estimated', shown='when the paleo map shows dry land here'))
    for iid, name, lat, lon, what in ICE:
        out['landscape'].append(rec(id='place:ice_' + iid, kind='place', subtype='ice_sheet', name=name, lat=lat, lon=lon, lenses=['geography'], what=what,
                                    why='Ice sheets locked up so much water that the sea fell, and they pushed plants, animals and people south.',
                                    sources=[BATCHELOR] if iid != 'patagonian' else [doi('Davies, B. J. et al., "The evolution of the Patagonian Ice Sheet from 35 ka to the present day (PATICE)", Earth-Science Reviews 204, 103152 (2020)', '10.1016/j.earscirev.2020.103152')],
                                    conf='estimated', shown='when the paleo map shows ice here'))
    for eid, name, sub, ka0, ka1, lat, lon, what, why, src in EVENTS:
        r = rec(id='event:deep_' + eid, kind='event', subtype=sub, name=name, start=yr(ka0), end=yr(ka1) if ka1 != ka0 else None, start_approx=True,
                lat=lat, lon=lon, lenses=['geography', 'disease'] if sub in ('climate_shift', 'eruption', 'flood') else ['population', 'language'],
                what=what, why=why, sources=src, conf='estimated')
        if r['end'] is None: del r['end']
        out['events'].append(r)
    for k, rows in out.items():
        with open(os.path.join(OUT, k + '.jsonl'), 'w', encoding='utf-8') as f:
            for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(k, len(rows))


if __name__ == '__main__':
    main()
