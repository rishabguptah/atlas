# Atlas priorities (2026-10-25)

Every thread reads this before starting and again before merging. Full vision: the "Atlas Master Vision"
artifact (link in the project memory, atlas-master-vision). Contracts: [WORLD.md](WORLD.md).

## The bar

Things nobody thought were possible: **the polish of a top app, the detail of top academics, the
flexibility of AI, and the storytelling and fun of games**, interdisciplinary as hell. The mix is 55% fun,
45% accurate, and 100% awesome. Every PR should say which of the four it moves and what it adds to the
experience someone actually feels.

## What matters most, in order

1. **One world, many stories.** Everything plugs into one engine (WORLD.md): claims, a world index, a motion
   model, agents and causes, and scenes. No new private route finder, story format or space-time query.
2. **Any place, any time.** Deep zoom must work for Song China or Mughal Delhi without anyone hand-building
   them. Europe is 59% of what we know today and 80% of our people; South Asia has 58 people. Fix that.
3. **Things move.** People, ships, objects, news, plague and ideas travel on the map along real routes at
   real speeds. Today people only have a birth and a death.
4. **Every answer says why.** The kernel has 53 causal links. The guide's whole promise is explanation;
   build the why graph with competing views.
5. **The map is a stage.** Answers, lives, simulations, tours and what-ifs all play as scenes on the map
   with one obvious next thing.
6. **Fun you can trust.** Anything playful has a "how do we know" one tap away, and every mark shows its
   confidence (solid, hatched, dashed, fog).
7. **Fast and calm.** The performance budget in README.md and the art direction in DIRECTION.md still bind.
   Bend other rules if the experience gets better; say so in the PR.

## Who owns what

| Layer / area | Owner thread | Builds |
| --- | --- | --- |
| L0 schema v0.5 (source, debate, quote, chain, presence, journey, conf) | Bring scholar-level depth to the atlas (schema editor) | one v0.5 PR |
| L0 movement data | Set history's travellers in motion (new) | itineraries, voyages, Contemporaries finder |
| L1 world index and dense packs | Let any place and period go deep | `world.at/near/ruler/density/pack`, generic packs, AI gap fill |
| L2 motion model | Build a live-a-life history RPG | extract its router to `world/route.js`: `route`, `reach` |
| L3 agents, meetings | Simulate people meeting and traveling | `agents`, `meetings`, `step`, living-world stories |
| L3 causes and scholarship | Bring scholar-level depth to the atlas | why chains, debates, verified sources, quotes, `world.why`, Historiographer |
| L3 forks | Fork the timeline (later) | `world.fork`, branch maps |
| L4 scenes and Director | Play every story as map scenes (new) | Scene spec, Director player, converts tours/answers/what-ifs |
| Coverage | Put the whole world in the atlas (new) | non-European people, places, events, ideas |
| Rigor | Score the guide and the facts (new) | benchmark questions, weekly judge, conf on every record |
| Objects | Follow objects through history | object journeys in the journey shape, Follow as a Story |
| Look | Art-direct + pixel world, interface, motion, era styles, data visuals, labels, zoom detail | DIRECTION.md |
| Speed | Make year scrubbing instant | budget, phone layout |

## Integration order

`views/atlas/atlas.src.html` is the shared hotspot. Merge small and often, rebase on main, rerun
`python3 tools/build.py` and the Atlas build before merging.

1. Open PRs first: #51 (load budget), #53 (zoom detail), #28 (peoples and languages), #37.
2. Contracts: this file and WORLD.md (schema v0.5 from the scholar-depth thread).
3. Engine layers as they land: route.js (L2), world index (L1), Scene + Director (L4), agents (L3).
   Each lands with at least one existing feature switched over to prove it.
4. Experiences on top: Live a life, Living world, Objects, Up close packs, What-if forks.
5. Visual threads merge any time, but never add DOM per mark and always state step time and page size.

## Not now

New stand-alone pages, new lens families, more hand-built regions, or a second question box. Make a
room inside the house instead.
