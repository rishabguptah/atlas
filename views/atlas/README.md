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

## Up close: Europe 1789-1914

The Up close tab studies one region by the month: a month scrubber (1 month, 3 months or a year per second; `[` and
`]` step a month), ten storylines with a Next button, what happened this month, wars under way, who was born and died.
Its lenses: Chronicle (3,600 dated events, Power), Railways (26,000 stations by opening date, Wealth), Provinces
(Land), Growing cities (Wealth), Lives (Peoples). Data: `data/europe-19c/`. The chronicle loads after the first paint
like other big lens data; railways and lives load only when needed, from `atlas-files/e19-deep.json`, which has to be
published beside the page:

```sh
python3 views/atlas/lenses/e19.py pub          # writes pub/atlas-files/e19-deep.json (about 2 MB)
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
