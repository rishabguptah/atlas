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

The page stays small (about 3.3 MB): build.py writes what the first paint does not need to `atlas-files/` next to the
page (relief images, the terrain L0 tile, plugin lens data over 40 KB, the Wikidata battles), and the page fetches it
once the map has painted. **Publish `atlas-files/*` with the page**, beside `tiles/`, `borders/` and `borders-time/`.
`--inline` puts everything back in one file for opening locally.

## Performance budget

Every change to the page keeps these (headless Chromium, 1440x900; measure before you merge):

- Page HTML at most 4 MB. Anything else loads from a file beside the page, after the first paint.
- Map painted within 1.5 s with no network throttling, and within 3 s at 25 Mbps.
- A year step (slider or play) under 16 ms at the median and under 33 ms at p90. No DOM node per map mark: draw
  into the canvas mark layer (`ctx.pins`/`ctx.paths`, or records via `ATLAS.marks()`), not SVG.
- Work on every year step stays O(what is visible); cache anything keyed by border frame or view.
- Idle (nothing moving) under 10% of one core; animation timers pause when the tab is hidden.
- Zoom or pan settling under 100 ms.


Order & chaos reads `data/order-chaos/lab.json`, War & chokepoints reads `data/states-war/` (curated plus Wikidata battles); Terrain reads terrain.json, terrain.js and terrain-relief.webp from LAYERS_DIR when present; tours come from `data/guide/tours/`. Next step: read
`dist/kernel.json` for every layer once each workstream's records are merged.

## Flow (keyboard, key, focus, resume)

Keys: ←/→ step the year (Shift for bigger steps), Space plays time, / jumps to the question box, 1–6 switch lens families,
S is Surprise me (a random curated battle, shock, idea journey or city event, flown to and captioned, with Here filled in),
F is focus (map only), K or ? opens the key, P folds the panel, Esc closes. The key lists exactly the marks drawn for the lenses that are on;
a plugin lens can describe its own marks with `key: [[glyph, text], ...]` (glyphs: dot, small, line, arrow, diamond, square,
halo, ring, cross, battle, hourglass, border, sprite). Eras sit under the slider and jump on tap. Here and This year lead with
rows from the current time; rows from other centuries fold under "from other times". The page reopens on the last year,
view and lenses (localStorage `atlas.resume.v1`, this browser only). The header question box steps aside while the Ask tab is open.
Roadmap and critique: https://claude.ai/artifact/6saKUD2YsaVezRGC9M3z6o

## Up close: any place, any period

The Up close tab studies whatever the map shows, by the month: pan or zoom anywhere, pick a span (a dense pack's
window, a decade, a lifetime, a century, five centuries, or a storyline's), and scrub or play (1 month, a year or ten
years per second; `[` and `]` step a month). It reads the world index (`views/atlas/world/`, see WORLD.md L1):
what happened here this month (widening to the year, five years, a generation when that is thin), wars under way,
who was born, died, lived or worked here, a "how deep" meter with the dense pack that covers the view, and the
study storylines that pass through (75 of them, from Sumer to 1991, each with a Next button and the journeys of the
people it names drawn on the map). Where the data is thin, "Fill in with Claude" adds draft rows (dashed on the map,
marked draft, kept in this browser) and "Write a storyline for here and now" drafts a storyline. Its lenses:
Chronicle (Power) and Lives (Peoples); Europe 1789-1914 adds Provinces, Growing cities and railway numbers
(`lenses/e19.*`). Everything loads after the first paint from `atlas-files/world/` and `atlas-files/packs/`, which
`build.py` writes beside the page: publish them with it (about 20 MB, fetched a slice or pack at a time).

## City scale

The map zooms to about 0.2 degrees across (`K_MAX` in atlas.src.html), enough to stand inside the walls of
Constantinople in 1453. Around the 18 story cities in `data/cities/cities.json` the pixel map switches to 45 m terrain
(one patch per city, all packed into `tiles/l3.png`, OpenStreetMap water through Overture Maps plus Terrarium elevation), and the
city layer (`views/pixel/city.js`, beside the page as `atlas-files/city.js`, loaded the first time you zoom past about
3 degrees) draws walls, gates, towers, harbours, built-up areas and landmark buildings as they stood in the year, from
`atlas-files/world/cities.json`. Walls come from OpenStreetMap, landmarks with their dates from Wikidata, and what
neither has (lost walls, old shorelines, built-up areas by period, names by period) from Claude's drafts, marked as
drafts. See `data/cities/README.md` to add a city.

## Travellers in motion

Lenses Journeys and Middle Passage (Peoples) and VOC ships (Wealth), and the Who was there tab: famous journeys move
along dated legs, every Dutch East India Company ship at sea, the forced crossing of enslaved Africans with the human
toll, and real co-presence (who was in Vienna in 1913). Data: `data/travels/`. Presences and the slave voyages load
only when needed, from a sidecar to publish beside the page:

```sh
python3 views/atlas/lenses/travels.py pub      # writes pub/atlas-files/travels-deep.json (about 2.7 MB)
```

## The chronicle interface (chrome)

The page's interface is a skin over the markup above, art direction v0 (`/mnt/project-files/atlas/art-direction/DIRECTION.md`):
an illuminated 16-bit chronicle floating over the map like a HUD. `chrome/kit.py` makes the colour tokens (from
`views/pixel/palette.js`, lens tinctures from `PIXEL_PALETTE.LENS`), the 9-slice pixel frames (tiny PNGs, `--f-panel`,
`--f-card`, `--f-hud`, ...) and the night theme; `chrome/chrome.css` holds the components and `chrome/atlas.css` the layout;
`chrome/chrome.js` dresses the existing controls. Icons are 12x12 grids in `views/pixel/icons.js` (`PIXEL_ICONS.svg(name)`,
also drawn on canvas with `PIXEL_ICONS.draw`); the six family emblems live there and nowhere else. Fonts: Pixelify Sans
(headings, the year), Silkscreen at 8 or 16 px (`--f-tiny`: kickers, tabs, chips, numbers), Spectral (prose).

- The year cartouche sits top left with the era name and a map style picker (`ATLAS.setEraStyle`).
- The **Next card** under it always says one thing to do now. Plugins add a provider with
  `ATLAS.nextThing({ id, pri, get() -> { kick, title, go } | null })`; the highest priority with something to say wins.
- The lens families are an emblem rail on the left (44 px squares that open on hover or focus; a family's lenses fly out beside it).
- The panel floats right at about 60% of the height ("Taller" at its foot for full height); **P** or a tap on the open tab folds
  it to its ribbons. On a phone it is the bottom sheet.
- `ATLAS.chromeRects()` returns the boxes the interface covers, `[[x0, y0, x1, y1], ...]` in map pixels, and
  `atlas:chrome` fires on the document when they change, so labels can stay out from under it.
- The Director's dialog box is dressed in the same frames; the Director draws it.
- Preview of the three directions considered: https://claude.ai/artifact/4wm6AUUts9hzFK2trCmmq2

## Deep time (300,000 years ago to 4000 BCE)

The slider runs from 300,000 years ago. Its first fifth is deep time on a log scale of years ago (eras: First modern
humans, Out of Africa, Ice Age, First farmers); the rest is history on the old curve. Deep years snap to a grain that
grows with age (1,000 years before 100,000 years ago) and read as "45,000 years ago". Before 4000 BCE there are no states
or chokepoints. The pixel map redraws the ice-age world from sea level: exposed shelves and land bridges, ice sheets,
glacial tundra and steppe, the Green Sahara (`views/pixel/paleo.js`, `ATLAS.paleo`; rasters `atlas-files/paleo-*.png`
from `data/deep-time/`, about 0.7 MB, fetched only when the year goes before 5500 BCE). A new sea level or ice extent
redraws all the terrain, so while the year moves it swaps at most every 400 ms. The Deep time lens (Peoples) adds the
other kinds of human and their ranges, Ice Age animals, sites, dispersal fronts that walk with the year, farming
hearths, land-bridge and ice-sheet names, and climate shocks. Sources and rebuild: `ingest/deep-time/README.md`.

## The whole world (People lens)

People outside Europe come from `data/coverage/` (Pantheon, Wikidata, CBDB; see its README) and load after the first
paint from `atlas-files/people-world.json` (about 2.3 MB, publish it beside the page). Every person carries a region,
and the map and This year pick the most remembered person of each region in turn, so a world view at 1200 shows
Genghis Khan, Zhu Xi, Jayavarman VII and a Zagwe king next to Fibonacci instead of Europe's top 450.
`views/atlas/world_people.py` builds the rows.

## Lens families and plugins

The chip bar shows six families (Land, Power, Wealth, Peoples, Mind, Shocks); tapping one opens its lenses
in a second row. New lenses plug in from `views/atlas/lenses/<id>.py` (data) and `<id>.js` (drawing,
Here and This year rows), a basemap and sprites register the same way; see [LENSES.md](LENSES.md).
Zoom frames only move the map: labels hide while the scale changes and thinning runs when it settles.

## Stories and the Director

Every story-like thing plays on the map through one Director (`world/director.js`, WORLD.md L4): the map flies, a
one-line caption types into a pixel dialog box, Space or → is the next scene, ← goes back, the strip scrubs the story,
**Why?** (Enter) unfolds the reason, "How do we know" (H) shows sources and the confidence class, P plays by itself, Esc
leaves the story. The panel, with Ask, stays open beside the story; the cold open waits until the map has painted. `world/story.js` holds the Scene/Story format, the registry (`ATLAS.world.stories.add/list/get/check`)
and converters for guide tours, panel answers (live ones keep streaming in), What-ifs (a fork scene, then dashed branch
scenes), Up close storylines (by the month) and Codex trails. Authored Stories live in `data/stories/*.json`; the Stories
tab (`lenses/stories.*`) lists them all. The Atlas opens on a cold open (Constantinople 1453) on a first visit or after
twelve hours away; `#story=<id>` plays any story on load and `#nostory` skips it. Other threads emit Stories and register
them with `ATLAS.world.stories.add(story)` or a provider `{kind, list()}`; `ATLAS.world.director.play(story, {at, auto})`
plays one.

## Guess the past

The Guess tab (`lenses/guess.*`) is a calibration game. The map flies to a moment and asks for a number the kernel
holds: a city's size (Reba et al., after Chandler and Modelski), a continent's people (HYDE), a share of world GDP and
income per head (Maddison Project 2020), an empire's land at its height (Cliopatria), railway kilometres (CHAT) or the
days news took to travel. Every answer is read from a sourced measure or record at a year it actually gives, never
interpolated. You give a range you are 80% sure of; the reveal plays as a Director story (the answer, a comparison or
the motion model's own estimate for the same trip, then your calibration) with Why? and How do we know. The tab keeps
calibration ("you said 80%, you were right 64%"), points for tight hits, a daily five with streaks and a copyable
result, Endless and About here modes, and finds; each reveal also visits the spot for the Codex. Progress stays in
localStorage `atlas.guess.v1`. `ATLAS.guess` exposes `list`, `daily`, `calibration` and `play(id)`.

## Travel time: watch the world shrink

The Travel time lens (Land family, `lenses/shrink.*`) paints travel-time rings from a city into the pixel map, after
Galton's isochronic passage chart (1881) and Bartholomew's 1914 one: red within a week, rose two weeks, ochre a month,
green two months, blue a season, dusk beyond. The rings are worked out live by the shared router (`ATLAS.world.reach`,
plus flights from the 1950s), once per city and decade after the slider settles (30 to 160 ms, on idle), then cached per
view, so a year step pays only a cheap repaint. The lens also draws news on its way (dated arrivals from
`data/world/news.json` and `data/tech-food-energy/news.jsonl`) and three wandering centres of the world (cities, trade,
ideas, one point a century since 3000 BCE). The Travel tab picks the city (seven hubs or the map centre), shows a month's
reach for the seven benchmark years, the days to the other hubs, and checks the router against documented journeys
(`data/world/speeds.json`). The Story `story:world_shrinks` plays it all in eleven scenes.

Hooks it added for everyone: `ATLAS.pixelUnder` (functions painting into the pixel frame under the sprites, after the
choropleth), a Scene's `set: {<plugin>: value}` (handed to `ATLAS.sceneSet[plugin]` when the scene plays),
`ATLAS.world.director.onLeave(fn)`, and `ATLAS.shrink` (`rings`, `origin()`, `compute(o, y)`).
