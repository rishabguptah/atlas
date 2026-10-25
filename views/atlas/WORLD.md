# The world engine: shared contracts (v0, 2026-10-25)

Every Atlas experience (map, Ask, Up close, Live a life, Living world, Objects, What if, Codex) is a view on
one engine. This file fixes the names and shapes so threads build one engine instead of five. It is a
contract, not an implementation: each section names the thread that owns the code. Change a shape by PR to
this file and tell the other owners. Vision and reasons: see PRIORITIES.md.

```
L4  Stories   one Scene format, one Director that plays scenes on the map
L3  Agents    real people, ships and generated lives stepping through time; causes; what-if deltas
L2  Motion    route(a, b, when, how) on an era-aware cost surface
L1  World     space-time index: what is true at a place and moment, dense packs per window
L0  Claims    the kernel (schema/SCHEMA.md): every fact a sourced claim with confidence
```

All code lives in `views/atlas/world/` (one file per layer) and hangs off `ATLAS.world`. Pages and plugins
call `ATLAS.world.*`; nobody reaches into another layer's internals.

## L0 Claims (schema editor: "Bring scholar-level depth to the atlas", via PRs to schema/SCHEMA.md)

Schema v0.5 adds `source`, `debate`, `quote` and `chain` (scholar-depth thread) and these three shapes the
engine needs for movement (data from "Set history's travellers in motion"):

- **Presence**: someone or something was somewhere for a while. Relation type `present_at`:
  `{"kind":"relation","type":"present_at","from":"person:ibn_battuta","to":"place:delhi","start":1334,"end":1341,"date":"1334-06","role":"qadi","conf":"attested"}`.
  Wikidata residence (P551), work location (P937), educated at (P69), position held with a seat, and
  battles fought all become presences. Births and deaths are presences of zero length.
- **Journey**: an ordered trip. `route` record with `subtype: "journey"` and `legs`:
  `[{"from":"place:tangier","to":"place:alexandria","start_date":"1325-06","end_date":"1326-04","mode":"land|river|sea|caravan|rail|air","conf":"attested|estimated|approximate|unknown","via":[[lon,lat],...]}]`.
  `carrier` is who or what moved (person, ship, object, idea, disease). Objects, voyages (Dutch-Asiatic
  Shipping, SlaveVoyages), pilgrimages and campaigns all use this one shape.
- **Confidence class** on any record or leg: `conf` = `attested` (solid) · `estimated` (hatched) ·
  `approximate` (dashed: path or date roughly known, or disputed) · `unknown` (fog). This is the data side of
  art direction D10; views never invent their own scale.

Causal claims stay `caused` / `contributed_to` / `prevented` with required `confidence` and an optional
`view` (whose explanation). Competing explanations are separate relations.

## L1 World index (owner: "Let any place and period go deep")

Compiled from `dist/kernel.json` plus late packs. Built by `views/atlas/world/build_index.py`, loaded by
`views/atlas/world/world.js`.

```js
ATLAS.world.at(t, bbox, {kinds, lenses, limit, minConf})  // records true at time t (year, or {y, m}) inside bbox [w,s,e,n], ranked
ATLAS.world.near(lon, lat, rKm, t, opts)                 // same, around a point (Here tab, RPG surroundings, panel digests)
ATLAS.world.thing(id)                                     // one record, with links resolved lazily
ATLAS.world.lifeline(id)                                  // presences and journeys of a person or object, in time order
ATLAS.world.ruler(lon, lat, t)                            // polity under a point (wraps ATLAS.polityAt / realms)
ATLAS.world.measure(id, metric, t)                        // interpolated value with low/high
ATLAS.world.density(t, bbox)                              // how much we know here: records per cell, for fog and "go deeper" hints
ATLAS.world.pack(bbox, [t0, t1])                          // Promise: load or request a dense pack for a window
```

Packs: `atlas-files/packs/<region>_<t0>_<t1>.json`, any window, compiled by one generic assembler (kernel,
Wikidata, Pantheon, Cliopatria, raw/), never hand-built per region. Europe 1789-1914 (`e19`) becomes the first
pack. A window with no pack can be filled by a live AI draft (marked `status: draft`, `conf: estimated` or
worse), cached, and queued for the judge.

Implemented (v1): `views/atlas/world/world.js`, `build_index.py` (time slices of the whole world plus packs, written by
`views/atlas/build.py` beside the page), `assemble.py` and `packs.json` (one line per pack). Every record is one row
`[k, f, sub, name, lon, lat, date, end, ref, rank, conf, extra]` (see assemble.py); the API returns them as
`{k, f, sub, name, lon, lat, d, e, m, me, ref, rank, conf, x, id, src}` with `m` the month index. `t` is a year,
`{y, m}` or `{m0, m1}` (month indexes). Extra hooks: `onLoad(fn)`, `load(t, bbox)`, `packs()`, `stories()` (study
storylines; `asStory(s)` gives the L4 Story shape), `draft(rows, {key})` for live AI rows, `addLifeline(fn)` for
presences and journeys from the travellers layer, `addMeasure(fn)` for measure providers. Consumers so far: the
Up close tab (`lenses/deep.js`) and the Here tab's "born here" list.

## L2 Motion (owner: "Build a live-a-life history RPG", extracted from its router)

```js
ATLAS.world.route(a, b, when, {mode, carrier, avoid, season})
// a, b: place id or [lon, lat]; when: year or ISO date
// -> {path: [[lon,lat],...], days, legs: [{mode, days, from, to}], risks: [{kind, p, why}], conf}
ATLAS.world.reach(a, when, days, opts)   // isochrone: where you can get within N days (the "world shrinks" view)
```

The cost surface knows terrain and elevation, rivers, coasts and sea lanes, seasonal winds and monsoons,
roads by era (Roman roads, post roads, railways by opening date), borders and war, plague in that year,
and technology (galley, junk, carrack, steam, rail, air). Every consumer uses this one router: Live a life,
Living world, Objects (unknown legs), trade, news, plague and idea diffusion. Target: < 300 ms for a
continental route, worker-friendly.

Shipped in `views/atlas/world/route.js` (data: `data/motion/`, lens data `motion`, which may load late, so check
`ATLAS.world.motionReady()`). `a`, `b` are `[lon, lat]` or `{lon, lat}` for now; `when` is a year, `"YYYY-MM"` or
`{y, m}`; `opts.pref` is `fast | land | sea`. The result also has `pts` (simplified path), `cost` (day-wages),
`notes` (seasons, canals, roads used) and `meet` (borders, battles and plague on the way). `ATLAS.world.reach`
returns `{days: Float32Array(720 * 360), at(lon, lat)}`. A continental route takes about 0.1 to 0.6 s warm.
`ATLAS.world.motion` exposes the grid helpers (`cellOf`, `cls`, `isWater`, `polity`, `plagueAt`, `battles`, `rules()`).
Open ocean is closed until a crossing became a route (`rules.open_ocean`: the Atlantic until 1492, the South Atlantic
until 1488, the open Pacific until 1565), so nobody sails from Rome to New York. Empire roads test only the realms named
for a road-building empire that year, so a reach through Mongol lands takes about 0.1 s instead of 2 s. The Travel time
lens (`lenses/shrink.js`) draws `reach` as isochrones and checks `route` against documented journeys.
Speeds that changed within a mode's life are curves (`kmd_by`: steamers 330 to 800 km a day from 1838 to 1950, clippers,
railways 350 to 1,200); `regions` limits a mode to boxes (stagecoaches on Britain's turnpikes from 1750, the continent
from 1780); sea seasons include the North Atlantic westerlies, the trade winds and the etesians. `route` falls back to
the fastest way when a sea or land preference finds nothing (`fallback: "fast"`), and an island the grid draws as sea
can be reached by ship. Against 55 documented journeys (time under way) the median ratio is about 1.0, 22 within 1.5×.

## L3 Agents and causes (agents: "Simulate people meeting and traveling"; `why`: "Bring scholar-level depth to the atlas")

```js
ATLAS.world.agents(t, bbox)          // who is moving where at t: real (from journeys/presences) and generated
ATLAS.world.meetings(t, bbox, opts)  // co-presence: same place, overlapping dates (not just birthplaces)
ATLAS.world.step(state, dt)          // advance a simulation state; deterministic given a seed
ATLAS.world.why(id, {depth, view})   // causal chain into and out of an event, with confidence and views
ATLAS.world.fork(deltas)             // what-if: a world with changed claims; agents re-run on it
```

Generated people come from base rates in the kernel (city size, occupations, life tables, travel speeds);
they are always labelled generated. Real people only do what a presence or journey says; anything between
known points is `approximate`.

## L4 Stories (owner: new thread "Play every story as map scenes")

A **Scene** extends the guide step that `ATLAS.api.scene` already plays:

```json
{"id":"...","t":1453,"date":"1453-05-29","view":{"lon":28.97,"lat":41.01,"span":6},
 "lenses":["war"],"highlight":["place:istanbul"],"pins":[],"routes":[],"actors":["person:mehmed_ii"],
 "caption":"One line on the map.","text":"Optional longer text for the panel.",
 "by":"military","conf":"attested","sources":[{"cite":"..."}],
 "branch":null,"next":["scene id", "..."],"ask":"Why?"}
```

A **Story** is `{id, title, kind: tour|answer|life|simulation|object|storyline|whatif|quest, scenes: [...]}`.
Guide tours, panel answers, What-if scenarios, Up close storylines, Codex trails, RPG chronicles, object
follows and simulation stories all emit Stories. One Director plays them: on-map caption, Space for next,
one obvious "Why?" or "Go deeper", the panel collapses to a story strip.

Built (2026-10-25): `views/atlas/world/story.js` (format, registry, converters) and `world/director.js` (player).
Extra optional Scene fields the Director reads: `lens` (the guide lens, when `by` names a specialist), `kick` (a
short label over the caption), `debate` (one line on what is argued over, shown under "How do we know") and
`deeper` (`{story, label}`, `{tab}` or `{q}`: where "Go deeper" goes; otherwise it asks the panel `ask`). A Story may
name `next` (the story offered at its end), `status` (`draft`, `live`) and a `sync()` that refreshes `scenes` while
it streams. Register with `ATLAS.world.stories.add(story)` or `add({kind, list})`; play with
`ATLAS.world.director.play(story, {at, auto})`. Authored stories: `data/stories/*.json`.

## Rules for every owner

- Ship behind the existing hooks (`ATLAS.lens`, `ATLAS.tab`, `ATLAS.api`, `ATLAS.marks`); don't fork the page.
- Respect views/atlas/README.md's performance budget and art-direction/DIRECTION.md.
- If your thread already has its own version of a layer above, keep it working, then switch to the shared one
  as soon as it lands. Don't wait on it to ship something fun.
