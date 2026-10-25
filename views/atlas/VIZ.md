# VIZ: how the Atlas draws data

The data grammar for the map and the side panel. It sits under `views/pixel/DIRECTION.md` (art direction wins where
the two differ) and is implemented by `views/pixel/grammar.js` (map), `views/pixel/charts.js` (panel charts),
`views/atlas/lenses/viz.js` (choropleth lens, card charts), `views/atlas/lenses/compare.js` (Compare tab) and
`views/atlas/lenses/flows.py` (flow data).

## Colour

- Six family tinctures (D4): Land Vert `#3f8f5e`, Power Gules `#c0392b`, Wealth Or `#d8a32c`, Peoples Tenné
  `#d2742c`, Mind Azure `#3a6fb8`, Shocks Purpure `#903f85`. `PIXEL_PALETTE.LENS` / `LENS_DARK` and CSS
  `--fam-<family>` carry them. Plugin lenses take their family's tincture automatically (`ownColor: true` opts out).
- The six fail colour-blind checks as a set, so **glyph shape is the required second channel**: every kind of mark
  has its own silhouette, and colour is never the only difference.
- Colour sits on the glyph, never on label text. Labels are ink.
- Sequential and diverging ramps (`PIXEL_PALETTE.RAMP`), five steps, checked with the dataviz validator:
  - `risk` (fragility) `#e09a46` → `#621e16`
  - `age` (how long a state has stood) `#88b05d` → `#0f3f2e`
  - `change` (diverging, purple to orange so it never reads as sea) `#4f2f7f #8f7bbd #d6cfbf #d99045 #9a4a08`
  - `mono` relief under a choropleth `#4c4436` … `#e2d8bc`

## Confidence (D10)

One language for every mark, line, ribbon and chart:

| conf | names accepted in data | map | chart |
|---|---|---|---|
| 0 | attested, solid, sure | solid fill, solid line | solid line |
| 1 | estimated, hatched | 2 px diagonal hatch | hatched band (low to high) |
| 2 | approximate, disputed, dashed, likely | dashed line, broken outline | dashed line |
| 3 | unknown, fog, legend, speculative | Bayer fog stipple | fog |

`PixelGrammar.conf(r)` reads an explicit `conf` first (number or name). Without one: ghost records are 3, disputed
2, a low/high range wider than 1.5x or an approximate date 1.

## Flows (Minard ribbons)

- Width is one art pixel per tenfold of people: 10 thousand = 1 px, 100 thousand = 2, 1 million = 3, 10 million =
  4, 100 million = 5. No count in the sources means a hairline, never a guessed width.
- Ink outline, vellum highlight on the lit edge, chevrons show direction (ink chevrons for forced migration).
- The ribbon grows along its line through its span; the part not yet reached is a dotted trace. It fades for 40
  years after it ends.
- Data: `lenses/flows.py` builds `LENS_DATA.flows` from `data/economy-trade/routes.jsonl` (`p` = [low, high]
  people, `f` forced, `ap` approximate dates).

## Cities

Five population tiers (`PixelGrammar.tier`): under 15k, 15–80k, 80–400k, 400k–1M, over 1M, drawn as `city1`…`city5`.
A city that is growing gets a small tick. Below 2x zoom, crowded marks fold into count badges.

## Choropleth ("Colour states by")

- Lens `thematic` (Power family). Metrics: fragility (Order and Chaos data), growing or shrinking (territory change
  over 25 years, measured on the drawn borders), age.
- The land under it turns to mono relief so terrain still shows. Each state is washed with its step (dithered, at
  most five steps), states with no data get fog, and borders are inked.
- The legend card sits bottom left: tap a step to pick out just those states.

## Charts in the panel (`AtlasCharts`)

Pixel charts built from SVG runs: Silkscreen for numbers, Spectral for prose, 1 art px ink lines, direct labels, no
gridlines, one shared tooltip.

- `lifeline` (log scale): a city's population or a state's territory over time, with a hatched low/high band, a
  "now" marker and event ticks.
- `tenure`: who held a chokepoint, as a strip.
- `rangebar`: low to high estimates against comparable records.
- `dumbbell`: then vs now (Compare tab).
- `tiles`: small stat tiles in "This year".
- `multiples`: small multiples of one chart.

Hooks: `ATLAS.cardViz` (charts in a record's card) and `ATLAS.nowViz` (tiles in "This year"). Each is an array of
functions that return chart HTML or nothing.

## Compare two years

The Compare tab pairs the map's year with another one. It shows the world in both years as dumbbells, the states
that grew and shrank most, which states appeared and which were gone, the great cities, and a filmstrip. "Show on map" draws the
other year's borders as dotted ink and stripes land that changed hands. A state that only changed name (each is the
other's largest overlap and they share at least half) is not counted as changed.

## Hooks on the pixel map

`pm.underlay(fn)` paints before sprites (the choropleth), `pm.overlay(fn)` after (compare, marks). Both get the
frame `{out, w, h, px, cls, ids, realms, U0, V0, k}`.

## Budget (measured 2026-10-25)

Page 3.65 MB. Year step with the choropleth on: 8.5 ms median, 13 ms p90 (budget 16 / 33).
