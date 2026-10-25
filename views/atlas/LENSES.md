# Adding a lens to the one-page Atlas

Every new lens plugs into `views/atlas/` as two files. Do not edit `atlas.src.html` or `build.py`;
the page loads every lens in `views/atlas/lenses/` on its own.

```
data/<workstream>/*.jsonl          kernel records, checked by tools/build.py as usual
views/atlas/lenses/<id>.py         def build(repo) -> dict   (JSON-able, small: compact rows, rounded coords)
views/atlas/lenses/<id>.js         ATLAS.lens({...})          (draws the layer and answers Here / This year)
```

`build(repo)` gets the repo root path and returns the data the page needs; it lands in the page as
`ctx.data`. Keep it under about 1 MB; drop fields the map never shows.

## Families

The chip bar shows six families. Each family has its lenses inside it, so the bar never grows past six.
Pick the one your lens belongs to:

| family    | lenses                                                       |
|-----------|--------------------------------------------------------------|
| `land`    | Terrain, Cities, Borders                                     |
| `power`   | Rule & law, War & chokepoints, Order & chaos                 |
| `wealth`  | Trade & migration, Technology, food & energy                 |
| `peoples` | People, Peoples & languages                                  |
| `mind`    | Ideas & faith, Art & architecture                            |
| `shocks`  | Plague & climate                                             |

A lens is precise (one question, one kind of record); a family is a group you switch on together.

## The lens object

```js
ATLAS.lens({
  id: "law",                       // same as the file name
  name: "Rule & law",              // chip label
  family: "power",
  color: "#b0744f",                // one hue; the page derives light/dark variants
  on: false,                       // on by default?
  guide: ["law", "government"],    // kernel lens names the AI guide may use to switch this lens on
  index: d => "...",               // optional: a few-KB text index of your records for the guide prompt

  // Draw what is true in ctx.year. Called on year change and when a zoom settles.
  draw(ctx) {
    ctx.pins(ctx.data.events.filter(e => Math.abs(e.y - ctx.year) <= 10), {
      key: e => e.id, shape: "square", label: e => e.name, title: e => e.name,
      card: e => ({ kick: "Law", title: e.name, year: e.y, meta: e.by, body: e.what, why: e.why, sources: e.sources }),
    });
    // ctx.paths(list, {key, coords, card, cls}) for lines; ctx.g, ctx.d3, ctx.projection, ctx.path for anything custom.
  },

  // Items for the Here tab: what this lens knows within r km of the clicked point in ctx.year.
  here(ctx, at) {   // at = {lon, lat, r, polity}   polity = name of the state drawn under the click
    return ctx.near(ctx.data.events, at).map(e => ({ title: e.name, year: e.y, why: e.effect, card: { /* as above */ } }));
  },

  // Lines for the This year tab (a world digest). Return the few that matter most.
  now(ctx) { return []; },

  // Optional: years worth a tick on the time strip.
  strip: d => d.events.map(e => e.y),
});
```

A **card** is `{kick, title, meta, body, why, year, lon, lat, sources: [{cite, url}], line?: [[lon,lat],...]}`.
Records without coordinates can still appear in Here and This year; give the card the polity's
capital or leave lon/lat out.

`ctx` gives: `data, year, k (zoom), g, d3, projection, path, pins, paths, near(list, at), km(a,b), fmtYear,
fmtSpan, select(card), ruledBy(lon, lat, year)`. Records passed to `ctx.pins` need `lon` and `lat`.

`ctx.pins` options beyond `key, shape, label, title, card, cls, always`: `color`, `size` (radius in px), `fade` (0 to 1),
`always` (label always shown), `hi`, `pri` (label priority), `ghost`, `fill` (fill opacity), `stroke` (false for none),
`fontPx`, `lblColor` and `lblAt` (`[dx, dy]` of the label),
each a value or a function of the record. Marks are records on one canvas, so the returned selection only takes
`style("--c", ...)` and `classed("ghost", ...)`; use these options for anything else.

`shape` is one of `circle | square | diamond | cross | triangle`, or a sprite name once the art-style
work adds them (`army`, `temple`, `ship`, ...); unknown sprite names fall back to a circle.

## Precision

The guide and the Here tab quote your cards, so make each card say exactly what the record says, with
its year and source. Prefer one record per real event or span over a summary record.

## Basemap and sprites

`ATLAS.basemap({id, name, mount(el, projection), render(transform, year), move(transform), unmount(), keepTerrain?})`
draws under the SVG. `render` runs on zoom end, year change, resize and lens toggles; `move` on every zoom frame.
`ATLAS.polityAt(lon, lat, year)` gives `{name, color}` and `ATLAS.isOn(k)` says whether a lens (or `borders`,
`terrain`) is on. `ATLAS.sprite(name, {w, h, ax, ay, href | frames: [dataURI]})` registers a sprite for pins.

`ATLAS.realms(year, k)` returns the realms for that year at the detail zoom `k` needs, as
`[{id, n, name, subject_of, color, feature, level}]`: the border timeline from `borders-time/` (a frame for every year a
border changed, Cliopatria, `level: "time"`) once its chunk has loaded; before that, or where it is not published, the precise borders (`l0` 5 km, `l1` 1.5 km from zoom 3)
once they have loaded from `borders/` beside the page, the inline historical-basemaps snapshot until then.
The page calls the basemap's `render` again when a precise level arrives.

## Tabs

A plugin can add its own tab to the right column (after Here) with `ATLAS.tab`. The What if tab
(`lenses/whatif.js`) is the example.

```js
ATLAS.tab({
  id: "whatif", name: "What if",
  mount(el, api) { /* el is the empty pane; runs once when the page is up */ },
  show() { /* the tab was opened */ },
});
```

`api` gives: `year`, `k`, `setYear(y, animate = true, ms)`, `scene({year, view: {lon, lat, span}, lens, layers,
highlight, pins, routes, title})` (the guide's own scene: flies, sets the year, draws pins and routes, shows a
caption), `clearScene()`, `fly(view, ms)`, `setOn(lensId, on = true)`, `redraw()`, `setTab(id)`, `fmtYear`,
`onYear(fn)` (called on every year change, so debounce anything heavy), `view()` (`{lon, lat, k, w, h}`: the map's
centre, zoom and about how many degrees fit across and down), `onView(fn)` (called when a pan or zoom settles) and
`select(card)` (opens a card in Here, panning to it if it is off screen).

The Codex tab (`lenses/codex.js`) is the example of a plugin that keeps the viewer's progress: it uses `localStorage`
(wrapped in try/catch, so the page works without it) and never sends it anywhere.

## Pixel sprites from a lens

A lens can put its marks into the pixel grid (house rule: one world, one grid). Push a function onto
`ATLAS.pixelSprites`; the pixel basemap calls it with `(year, k)` whenever it collects sprites and draws what it
returns, `[{lon, lat, sprite, pri, grp, dy, team}]`, decluttered with everything else. Call `ATLAS.pixelRefresh()`
when your marks change without a year change (a month cursor). `lenses/e19.js` is the example.

## Deep regions (time by the month)

`lenses/e19.*` is the first deep-zoom region, Europe 1789-1914. The pattern for the next one:

- Records with `date` / `end_date` (ISO, as precise as the source) in their own workstream folder.
- A `<id>.py` whose `build(repo)` returns `region: {id, name, start, end, view}`, the dated rows, and storylines;
  heavy parts (railway stations, lives) go in a sidecar file written by `python3 views/atlas/lenses/<id>.py OUT_DIR`
  to `OUT_DIR/deep/<id>.json`, published beside the page and fetched only when a lens needs it.
- A month cursor shared on `ATLAS.<id>.m` (year * 12 + month - 1). Lenses use it while the page's year is that
  month's year and fall back to the whole year when the main slider moves. An `ATLAS.tab` holds the scrubber.
