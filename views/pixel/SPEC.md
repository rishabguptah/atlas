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
| 5x | main Roman roads, main railways, fields | Itiner-e; Natural Earth; HYDE country population over arable terrain |
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
