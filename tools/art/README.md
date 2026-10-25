# Art direction tools

`ART.md` holds the binding visual rules (D1 to D11). The full visual bible with references, palette, type,
glyphs, textures, era boards and a screen-by-screen critique: https://claude.ai/artifact/JZG1YwDwz6T3wJ5aUwyFWe

## Judge a visual change on the same frames

```sh
sh tools/art/serve.sh /tmp/before &           # build and serve main
node tools/art/shots.js /tmp/before-shots      # 14 canonical views + year-step timing -> report.json
# switch to your branch, stop the server, then:
sh tools/art/serve.sh /tmp/after & node tools/art/shots.js /tmp/after-shots
python3 tools/art/gallery.py /tmp/before-shots /tmp/after-shots /tmp/compare.html
```

Every visual PR states the `step` numbers from `report.json` and links or attaches the compare page. `frame` is
the time from setYear to the next painted frame: the page does its year work in requestAnimationFrame, so a median
near 16.7 ms means the step fits in one frame and the p90 must stay under 33 ms (two frames). `sync` is only the
setYear call itself. Playwright is preinstalled in the cloud containers (`require('playwright')`).

## Studies

`studies/` renders palette and era studies from the real terrain rasters, so proposals are judged on real data:

```sh
python3 tools/art/studies/study.py OUT_DIR     # needs OUT_DIR/cur_palette.json (PIXEL_PALETTE.TERRAIN as JSON)
python3 tools/art/studies/eras.py OUT_DIR med  # six era grades of the same crop
python3 tools/art/studies/target.py OUT_DIR med 1300   # proposed palette + realm tints + pixel borders for a year
```

`studies/ramps.py` builds the proposed five-tone, hue-shifted terrain ramps in OKLCH (shadows toward violet,
highlights toward warm yellow).
