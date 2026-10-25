# Life: the Live tab's people and base rates

- `lives/<id>.json`: real lives to play. `{id, name, born, died, role, sprite, intro, sources, chapters, epilogue}`;
  each chapter is a dated place with the real choice (`real: true`) and plausible others (`out`, optional `end`
  with a chance `p`). `via` gives the historical path, drawn as a ghost line beside the route you take.
- `rules.json`: base rates for ordinary lives: Gompertz-Makeham life tables by era, plague, famine and battle
  risk, share of people on the land, roles and their odds, starting wealth in day-wages, and name pools by
  region and era. Each section cites its sources.

Travel numbers live in `data/motion/`.
