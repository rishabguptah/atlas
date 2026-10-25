# Motion: how fast people and goods moved

One set of travel numbers for every part of the Atlas that moves things (the Live tab, travellers, objects,
trade, news). Read by `views/atlas/world/route.js` through the `motion` lens data (`views/atlas/lenses/motion.py`).

- `rules.json`: travel modes by era (km a day, when they start and stop), terrain multipliers per mode, seasons
  (monsoons, Mediterranean closed sea, mountain passes, rasputitsa), channels and canals by opening year, ports,
  rail regions, empire roads, pace (rest days) and hazards on the road. Each section cites its sources.
- `grid.json`: the world on a 0.5 degree grid (720 x 360), run-length coded rows, one letter per cell
  (`A`-`f` = 0-31): terrain class 0-15, plus 16 where a river runs through. Built from the pixel map's terrain
  by `ingest/motion/grid.py`.

Plague outbreaks (Biraben points) are packed per year by `motion.py` from the disease data, not stored here.
