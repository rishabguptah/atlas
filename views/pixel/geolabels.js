// Geographic names for the pixel map: seas, rivers, ranges, deserts, lakes, straits and peaks, lettered along their
// label lines in the pixel font, like the place names on a classic RPG world map. Data: TERRAIN.labels / .points
// (views/terrain/export.py: {name, t, tier, line, water} and {name, t, tier, at}); tiers say from which zoom a name shows.
// Placement and drawing belong to the one label engine (labels.js); this file turns the terrain names into its items.
//   PixelGeoLabels.items(TERRAIN)  -> label items for ATLAS.labels.add (cached per data object)
//   const G = PixelGeoLabels(container, projection, TERRAIN)   standalone, for pages without the shared engine:
//   G.render(transform, W, H)   on zoom end: places names for this view, thinned by tier, budget and collisions
//   G.move(transform)           on every zoom frame: shifts the last layout with CSS until the next render
//   G.clear()                   hide all names (e.g. when the terrain toggle is off)
//   G.setMood(m)                day | dusk | night | winter | chronicle
(function (global) {
  const TIER_K = { 1: 1, 2: 1.6, 3: 2.5, 4: 4, 5: 6, 6: 9 };
  const SIZE = { 1: 16, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12 };
  // Bigger, older names win: tier 1 seas and ranges sit just under realm names, tier 6 creeks at the bottom.
  const PRI = { 1: 64, 2: 56, 3: 47, 4: 40, 5: 33, 6: 27 };
  const WATER = new Set(["ocean", "sea", "gulf", "bay", "strait", "channel", "sound", "fjord", "lake", "river"]);
  const HIGH = new Set(["mountain_range", "plateau", "peak", "gorge", "valley"]);
  const cache = new WeakMap();

  function styleOf(d) {
    if (d.kind === "point") return "peak";
    if (d.t === "river") return "river";
    if (WATER.has(d.t)) return d.t === "ocean" || (d.t === "sea" && d.tier <= 2) ? "ocean" : "sea";
    return HIGH.has(d.t) ? "high" : "land";
  }
  function items(data) {
    if (!data) return [];
    if (cache.has(data)) return cache.get(data);
    const out = [];
    const add = (d, kind) => {
      const style = styleOf({ ...d, kind });
      let size = SIZE[d.tier] || 12;
      if (d.t === "ocean") size = 16; else if (d.t === "river") size = 12;
      const it = { text: d.name, style, size, minK: TIER_K[d.tier] || 9, pri: (PRI[d.tier] || 25) + (d.t === "ocean" ? 6 : WATER.has(d.t) && d.t !== "river" ? 2 : d.t === "river" ? -3 : 0) };
      if (style === "ocean") it.spacing = 0.5;
      // Lakes keep their mixed case, like rivers.
      if (d.t === "lake") { it.style = "river"; it.size = size; }
      if (kind === "point") it.at = d.at; else it.line = d.line;
      out.push(it);
    };
    for (const l of data.labels || []) if (l.name && l.line && l.line.length > 1) add(l, "line");
    for (const p of data.points || []) if (p.name && p.at) add(p, "point");
    cache.set(data, out);
    return out;
  }

  function PixelGeoLabels(container, projection, data) {
    const L = global.MapLabels(container, projection, { before: container.querySelector(":scope > svg") });
    L.add("geo", () => items(data));
    return {
      render(t, W, H) { L.layout(t, W, H); },
      move: L.move, clear: L.clear, setMood: L.setMood, remove: L.remove,
    };
  }
  PixelGeoLabels.items = items;
  global.PixelGeoLabels = PixelGeoLabels;
})(typeof window !== "undefined" ? window : globalThis);
