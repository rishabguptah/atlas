# Atlas Guide

Ask a question and the map answers: it flies, changes year, highlights places and states, and draws
routes, one step per lens, with competing explanations, what-ifs, open questions and sources.

- Curated tours (`data/guide/tours/`) work anywhere.
- Live answers use the artifact `sample` capability, so they only work when the published page is
  opened in Claude. The page sends the question, a rules block and a compact index of the map's
  places and polities, and Claude streams back JSON Lines (answer, steps, views, what-ifs, unknowns).
  The page drops highlight ids it doesn't know and any source URL that isn't en.wikipedia.org, and
  marks every live source "unchecked".

## Build

```sh
python3 views/guide/build.py guide.html /path/to/living-atlas/   # defaults to /mnt/project-files/atlas
```

The map data still comes from the Living Atlas source files (entries, empires, borders). Next step:
read `dist/kernel.json` instead, so every workstream's records show up in the guide automatically.
