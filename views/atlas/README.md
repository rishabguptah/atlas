# Atlas (one page)

Every workstream on one map with one year. Lenses (Cities, People, Trade & migration, Plague & climate,
Ideas & faith, Order & chaos, War & chokepoints, Borders, Terrain) toggle layers on the same map; the slider and Play move them all.
Click anywhere and the "Here" column gathers every lens for that spot and year. "This year" is the
world digest. The guide's question box sits on top and switches on the lenses its steps use.

## The panel (live answers)

A live question goes to a panel of specialists instead of one guide. The chair (one short call) picks 3 or 4 of
Geographer, Military historian, Economic historian, Demographer, Epidemiologist and climate historian,
Historian of faith and ideas, Biographer and Political scientist, plus the years and region the question needs.
All the specialists then speak at the same time, one call each, with only its own records inside that window (cities and terrain; battles and
who held each chokepoint; trade routes, hubs, GDP and the tech lens; city populations and migrations; shocks and
their links; schools, books, thinkers and idea journeys plus the art lens; famous people; states with fragility plus
the law lens) and teaches 2 or 3 steps; each knows its colleagues' angles and names them where the evidence meets. Steps stream in as they arrive and the tour keeps panel order. The chair closes with the short answer,
"How the lenses connect" links between steps (tap one to see both on the map), competing views, what-ifs and
unknowns. After an answer, "Hear from another specialist" adds one more voice. A plugin lens joins the specialist
whose lenses it shares (`guide` names), or gets a specialist of its own.

Published: https://claude.ai/artifact/WycnvWHmbGsVRrsWC628p5 (declares `sample` for live answers).

## Build

```sh
# Workstreams not yet merged into main: pull their data out of their published pages.
python3 views/atlas/extract_layers.py /mnt/project-files/atlas/unified/layers \
  people=who-could-have-met.html money=where-the-money-moved.html plague=plague-and-climate.html ideas=atlas-of-ideas.html
python3 views/atlas/build.py atlas.html                 # ATLAS_DIR defaults to /mnt/project-files/atlas
```

Order & chaos reads `data/order-chaos/lab.json`, War & chokepoints reads `data/states-war/` (curated plus Wikidata battles); Terrain reads terrain.json, terrain.js and terrain-relief.webp from LAYERS_DIR when present; tours come from `data/guide/tours/`. Next step: read
`dist/kernel.json` for every layer once each workstream's records are merged.

## Lens families and plugins

The chip bar shows six families (Land, Power, Wealth, Peoples, Mind, Shocks); tapping one opens its lenses
in a second row. New lenses plug in from `views/atlas/lenses/<id>.py` (data) and `<id>.js` (drawing,
Here and This year rows), a basemap and sprites register the same way; see [LENSES.md](LENSES.md).
Zoom frames only move the map: labels hide while the scale changes and thinning runs when it settles.
