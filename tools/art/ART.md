# Atlas art direction (binding for the visual threads)

Owner: thread "Art-direct the atlas visual design". The full visual bible (references, mood boards, specimens): https://claude.ai/artifact/JZG1YwDwz6T3wJ5aUwyFWe; these are the decisions it rests on. If a decision blocks you, message the art-direction thread rather than diverging.

## The idea in one line
**An illuminated 16-bit chronicle.** The map is a living 16-bit RPG overworld. Everything around it is the chronicle that describes that world: vellum, ink, gold leaf and heraldic colour, drawn on the same pixel grid.

## D1. Two materials, one grid
- The map is pixel art at a fixed 1 art px = 3 CSS px (integer scaling, `image-rendering: pixelated`). No anti-aliased vector shapes on the map except the active selection.
- The chrome (panels, chips, slider, cards) is the chronicle: vellum fill, a 2-art-px ink frame made as a 9-slice pixel border, small corner studs. Shadows are hard one-step offsets, never blurred. No 6 px rounded web cards.

## D2. Three typefaces, no more
- **Pixelify Sans**: map labels, headings, year plate. Sizes 12/16/24/32/48 only.
- **Silkscreen**: kickers, tabs, chips, numbers and HUD. 8 or 16 px only (its grid).
- **Spectral**: anything you read as prose (panel text, captions, answers). 15 to 17 px.
- Retire Cinzel, IM Fell English (and SC), IBM Plex Mono, VT323 and Atkinson in the Atlas.

## D3. One palette, hue-shifted ramps
- `views/pixel/palette.js` is the single source of truth; CSS tokens are generated from it.
- Every ramp shifts hue: shadows lean blue-violet, highlights lean warm yellow (never just darker/lighter of one hue).
- Terrain stays at or under about 45% saturation. Saturated colour is reserved for meaning: lens marks, selection, danger.
- Ink `#221f1a`, vellum `#f6f0dc`, gold leaf `#d8a32c`.

## D4. Six lens colours, as heraldic tinctures
One hue per lens family (not one per lens). Sub-lenses vary by glyph shape, not hue.
| Family | Tincture | Hex |
|---|---|---|
| Land | Vert | `#3f8f5e` |
| Power (states, war) | Gules | `#c0392b` |
| Wealth | Or | `#d8a32c` |
| Peoples | Tenné | `#d2742c` |
| Mind | Azure | `#3a6fb8` |
| Shocks | Purpure | `#903f85` (re-stepped for colour-blind contrast with Azure) |
Every mark gets a 1-art-px ink outline and a 1-px vellum highlight so it reads on any terrain.

## D5. Labels: colour lives on the glyph, never on the text
Tiers (one label engine, owned by "Fix map labels and realm names"):
1. Realms: Pixelify caps, letterspaced, ink with a soft vellum halo, size by area, follow the realm's long axis.
2. Water: pale aqua, wide letterspacing, deep-water stroke.
3. Land features (ranges, deserts): sepia caps.
4. Settlements: vellum text on an ink stroke.
5. Lens annotations: ink text; the lens colour appears only on the glyph beside it. At most one annotation per roughly 120 px cell.
No red, blue or orange label text on the map, except the selected item.

## D6. Calm first
- At world zoom on a 1440x900 screen: about 40 labels and 15 sprites at most.
- At least two thirds of the map's pixels should be quiet terrain.
- Anything you add must take clutter away somewhere else.

## D7. Water is quiet
Deep ocean: almost flat, a low-frequency two-tone dither. Then a lighter shelf band, then a 1-px foam line on coasts. Sparse wave glyphs on a world-anchored grid. Shimmer by palette cycling, not by redrawing.

## D8. Motion
- Pixel art animates in steps at 8 to 12 fps and is never tweened. UI eases in 120 to 180 ms.
- Ambient motion stops while scrubbing, zooming or panning, and respects `prefers-reduced-motion`.
- Animate by palette cycling or on a small overlay canvas, never by repainting the whole map.

## D9. Eras are a grade, a frame and an accent, not a new renderer
One colour matrix or LUT applied once to the cached raster per border frame, plus a swap of chrome ornament and accent colour. Crossfade about 400 ms, only when crossing an era boundary.
- Antiquity: terracotta and papyrus.
- Medieval: illuminated manuscript (lapis, vermilion, gold leaf).
- Early modern: copperplate sepia, engraved sea.
- Long 19th century: Bartholomew / Belle Epoque pastels.
- 20th century: flat offset print.
- Now: clean contemporary.

## D10. Confidence grammar
Solid = attested. Pixel-hatched (2 px diagonal) = estimated. Dashed = approximate path or disputed. Fog dither = unknown extent.

## D11. Performance budget (binding, views/atlas/README.md)
Page HTML at most 4 MB, the rest late-loaded side files. First paint under 1.5 s (3 s at 25 Mbps). Year step under 16 ms median, 33 ms p90. No DOM node per map mark. Idle CPU under 10%. Zoom/pan settles under 100 ms. Every visual PR states its measured step time and page size.

## Who owns what
- Pixel world: terrain ramps, water, coasts, trees, sprites, palette.js.
- Interface: chrome, panels, chips, slider, type tokens (D1, D2).
- Motion: ambient life, transitions (D8).
- Era styles: grades, frames, accents (D9).
- Data marks: glyph grammar, lens colours, confidence (D4, D10).
- Labels: the label engine (D5).
