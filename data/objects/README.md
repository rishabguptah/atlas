# Object journeys

Where things went: famous single objects (Koh-i-Noor, Codex Sinaiticus, the Parthenon sculptures...) and kinds of
things (porcelain, the silver peso, pepper, the stirrup, paper, the potato). Drawn by the Object journeys lens and the
Objects tab of the one-page Atlas (`views/atlas/lenses/objects.{py,js}`). One file per object in `journeys/`.

| field | what |
| --- | --- |
| `id`, `name` | slug and display name |
| `type` | `single` (one object, in one place at a time) or `kind` (a kind of thing that spreads; every place it reached stays on the map) |
| `sprite` | pixel sprite for the object (`obj_gem`, `obj_codex`, `obj_marble`, `obj_stele`, `obj_ark`, `obj_relic`, `obj_bronze`, `obj_vase`, `obj_coin`, `obj_sack`, `obj_stirrup`, `obj_paper`, `obj_potato`; drawn in `objects.js`) |
| `what`, `why`, `now`, `dispute` | what it is; why its path matters; where it is today; who claims it |
| `tech` | optional: a Technology lens idea id (`idea:tech_paper`). Its `spread_to` steps in `data/tech-food-energy/` become stops, so both lenses tell the same story |
| `sources`, `status` | works the journey is written from; `draft` until the judge checks it |
| `stops` | the journey, in any order (sorted by year when built) |

A stop: `{y, approx?, at: [lon, lat], place, owner?, by, conf, note, meet?, via?, path?, from?, gap?, end?, copy?, split?, sources?}`

- `by`: how it got there (made, traded, sold, gift, looted, seized, tribute, carried, taken, found, recut, displayed, lost, returned...). Looted, seized and tribute legs are carried by an army sprite, `via: "sea"` legs by a ship of the era, others by a caravan.
- `conf`: `sure` (documented), `likely` (good evidence, not certain) or `legend` (tradition, scripture or a later story). The trail is solid, dashed or dotted to match.
- `meet`: who could have seen it there, for the life RPG and story modes ("a courtier at Ranjit Singh's darbar in Lahore").
- `path`: waypoints `[[lon, lat], ...]` for the leg that arrives here (sea lanes round the Cape, the Manila galleon route); otherwise a straight leg.
- `from`: index (in this file) of the stop the leg starts from; `-1` for none. Default: the previous stop for a single object, the nearest place already reached for a kind.
- `gap: true`: how it got here is unknown (dotted, "route unknown"). `end: true`: lost here; the object fades out until a later stop.
- `copy: true` (copies or casts travelled) or `split: true` (part of it left, the rest stayed): a branch; the object itself stays put.

Every journey here is a draft written by Claude from the cited works, waiting for the judge. Routes between stops are
likely paths, not tracks.

## On the page

- A leg with no `path` is drawn straight and flagged for the shared router (`ATLAS.world.route`, views/atlas/world/route.js):
  once the router is on the page it replaces the straight line with a likely route when the journey is opened.
- `ATLAS.objects.journey(id)` returns the journey in the shared shape from views/atlas/WORLD.md (a `route` record,
  `subtype: "journey"`, legs with `mode`, `start_date`, `end_date`, `conf`). `conf` maps to the shared classes:
  sure → attested, likely → estimated, legend → unknown; a straight leg between two known places is at best approximate.
- `ATLAS.objects.story(id)` returns a Story of Scenes (`kind: "object"`) for the shared Director.
- The Objects tab can trace any object live with Claude (same stop format, streamed); those journeys are marked
  "AI draft, unchecked" and kept only in the viewer's browser. Good ones should be written up here as files.
