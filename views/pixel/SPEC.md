# Pixel map spec (P0)

The Atlas base map becomes pixel art that stays accurate at every zoom. This file is the contract between
the renderer (views/pixel/), the terrain and borders data (terrain thread) and the sprite library.

## How it renders

- Projection stays `d3.geoNaturalEarth1()` so every vector layer (cities, battles, routes) still lines up.
- The map is drawn on a low-resolution canvas where **one art pixel = 3 CSS px** (`PX`, 2 to 4 allowed),
  then scaled up with `image-rendering: pixelated`. It is never a stretched bitmap: when the zoom settles,
  every art pixel is re-sampled from source data, so detail grows as you zoom in.
- For each art pixel the renderer inverts the projection to lon/lat and samples equirectangular rasters.
  While panning or mid-zoom the last frame is moved with CSS; it re-renders on zoom end.
- Patterns (dither, tree and peak stamps) are anchored to world coordinates, so they do not shimmer on pan.

## Terrain rasters (from the terrain thread)

`/mnt/project-files/atlas/pixel/terrain/`, equirectangular, row 0 = 90N, column 0 = 180W, lossless PNG.

| level | size | cell |
|---|---|---|
| L0 | 2160 x 1080, one file `z0.png` | 10' |
| L1 | 5400 x 2700, one file `z1.png` | 4' |
| L2 | 10800 x 5400 as 30x30 degree tiles `z2_<col>_<row>.png`, 900 x 900 | 2' |

Channels: **R** terrain class id, **G** hillshade 0..255 (sun 315 deg, altitude 45, 128 = flat, 128 at sea),
**B** land `elev_m / 25` or sea `depth_m / 40`, capped at 255.

Class ids:

| id | class | id | class | id | class |
|---|---|---|---|---|---|
| 0 | deep ocean (< -2000 m) | 6 | tundra | 12 | sand desert |
| 1 | sea | 7 | boreal forest | 13 | rock desert |
| 2 | shelf (0 to -200 m) | 8 | temperate forest | 14 | wetland |
| 3 | lake | 9 | tropical forest | 15 | hills |
| 4 | river | 10 | grassland, lowland | 16 | mountains |
| 5 | ice, glacier | 11 | steppe, savanna | 17 | high peaks, snow |

## Borders (from the terrain thread)

`/mnt/project-files/atlas/borders-precise/`: TopoJSON per snapshot and level, each polygon with a stable
`id` and `name`. The renderer rasterises polygons into an id buffer at art-pixel resolution and draws
crisp 1-pixel borders where neighbouring pixels differ, plus a flat realm tint. No anti-aliased lines.

## Palette

Everything on the map uses `PALETTE` in `views/pixel/palette.js` (names below). Each terrain class has three
tones (dark, mid, light) picked by hillshade with a 4x4 Bayer dither. Sprites use the same colours plus
`x` and `X` for the team colour and its shade, swapped at runtime.

## Sprites

Sprites live in `views/pixel/sprites.js` as text grids, one character per pixel, `.` transparent:

```js
SPRITES.ship = { w: 11, h: 9, ax: 5, ay: 8, frames: [[
  "....k......",
  ...
]] };
```

- `ax, ay` is the anchor pixel that sits on the map point (usually the feet or the hull's waterline).
- Most sprites are 7 to 16 px; drawn at the same `PX` scale as the map, so 12 px = 36 CSS px.
- One dark outline (`k`) on the outside, light from the top-left, at most 6 colours per sprite.
- Up to 4 frames; frames play at 3 to 4 fps. Motion respects `prefers-reduced-motion`.
- Character keys come from `palette.js` (`k` ink, `w` paper, `s` skin, `r` red, `b` blue, `g` gold, ...).

## Zoom detail (detail.js)

Past about 5x the map gains authored, dated detail instead of magnified terrain (house rule 4). One art pixel is
about 180 / k km, so even at 20x detail is chosen and symbolised, not traced.

| from | what | source |
|---|---|---|
| 2.5x | long walls (Hadrian's, Antonine, Limes, Gorgan, Great Walls, Danevirke, Berlin...) | hand-traced through known forts, approximate ones dashed |
| 5x | main Roman roads, main railways, fields | Itiner-e; Natural Earth rail dated by Wikidata station openings; HYDE country population over arable terrain, FAO irrigation map in dry lands |
| 16x | windmills (NW Europe 1180-1920), vineyards in the wine lands, two-pixel roads | procedural, era rules in detail.js |
| 6x / 10x | main / all medieval and early modern trade, pilgrim and courier routes (dashed, straight legs) | OWTRAD (Ciolek), attested period ±50 years |
| 6x / 14x / 24x | modern highways / secondary highways / roads | Natural Earth, dated by country |
| 10x | hamlets where farmland is densely peopled | HYDE density, roofs by region and era |
| 12x | castles, forts, lighthouses, ports with jetties | Wikidata (dated only), Pleiades |
| 22x | secondary Roman roads | Itiner-e |
| 24x / 36x | mapped ancient villages / villas and city walls | Pleiades, Wikidata |
| 4x to 24x by rank | province names | Pleiades, AWMC 200 CE, Wikidata (inception to dissolution), Natural Earth admin-1 from 1994 |

Roman roads appear when Rome takes the province (not before 312 BCE) and fade for 400 years after Roman or
Byzantine upkeep ends there. Conjectured routes are dashed, hypothetical ones dotted. Field styles follow place and
time: open-field strips in medieval Europe, paddies in monsoon Asia, survey squares on 19th-century frontiers,
centuriation near Roman colonies. Data: `ingest/pixel/detail.py` writes `detail/d_<col>_<row>.json` (30-degree
tiles), `pop.json` and `countries.png`; `views/pixel/tiles.py` copies them beside the page. Both passes are cached
per view, so a year step replays pixels unless the decade or the set of standing things changed.

## Terrain art (terrain-art.js)

`PixelTerrainArt.paint(S)` paints every terrain pixel from the sampled classes, once per render (zoom end or a pan band),
never on a year step. pixelmap.js marks rivers first (`cls` 4, `riv` 1 river / 2 great river), then calls it.

- Ramps: `PIXEL_PALETTE.RAMPS`, five hue-shifted tones per biome and regional variant (Sahara, Arabia, Gobi, outback,
  savanna, prairie, Mediterranean, monsoon). `TERRAIN` stays as the middle three tones for older callers.
- Zoom tiers by degrees per art pixel: 0 world (> 0.4), 1 (> 0.15), 2 (> 0.06), 3 close. Detail arrives with the tier.
- Mountains: one peak per world-anchored cell at its highest mountain pixel (prominence-gated), sized by height,
  snow by a latitude snowline; slopes wear the local biome below the treeline (a 1 degree climate grid from L0),
  rock or alpine steppe above it, snow above the snowline. Hills are lit domes in the ground's own ramp.
- Water: chamfer distance to the coast; foam, a lit shallow band, two slow tones offshore, a cliff lip under coasts.
- Forests: crowns stamped back to front on a staggered lattice, glades, a cast shadow under the forest edge.
- `pm.art.anim` marks pixels the motion layer may palette-cycle: 1 foam, 2 wave glyph, 3 river, 4 volcano smoke.
- Landmarks (`LANDMARKS`) replace generated peaks near them; green zones (`GREEN`) irrigate deserts at oases and deltas.
- Pans redraw bands with a `SEAM` margin wide enough for the largest anchored piece; keep it if pieces grow.

### Wave glyphs and regional towns (follow-up)
- Wave glyphs are one tone above the water under them, placed per world cell with jitter and thinned by slow noise; at world zoom (tier 0) about a third as many. Era styles with wave strokes (Catalan, al-Idrisi) also drop strokes at random and thin out below 2x.
- `PixelEra.culture(lon, lat, year)` names a city's building tradition (islamic from 650, near_east before, sahel, africa, east_asia, steppe, south_asia/deccan, meso and andes until the conquest; generic European sprites elsewhere). The library has a settlement for each at sizes 3 and 4 (and yurts at 1 and 2); a missing size borrows the nearest local one.
