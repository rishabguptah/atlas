// Border changes: the dated moments behind the border timeline. A realm rises, ends, gains or loses land,
// pinned where the change happened, naming who the land came from or went to. Data from views/atlas/lenses/changes.py.
(() => {
  const KIND = { r: ["Rises", "triangle"], f: ["Ends", "cross"], g: ["Gains land", "diamond"], l: ["Loses land", "square"] };
  const RECENT = 12;   // a change stays on the map this many years
  const km2 = n => n >= 1e6 ? (n / 1e6).toFixed(1) + " million km\u00b2" : (n >= 1000 ? Math.round(n / 1000) * 1000 : n).toLocaleString() + " km\u00b2";

  let cache = null;
  function prep(D) {
    if (cache && cache.D === D) return cache;
    // Cliopatria writes a realm's core with brackets, "(Kingdom of France)"; the reader just needs the name.
    const nm = i => i >= 0 ? D.names[i].replace(/^\((.*)\)$/, "$1") : null;
    const list = D.rows.map(([y, k, r, o, a, p, lon, lat], i) => ({ i, y, k, r: nm(r), o: nm(o), a, p, lon, lat, wiki: D.wiki[r] }));
    const years = [...new Set(list.map(c => c.y))];
    return cache = { D, list, years };
  }
  // The rows of years [y0, y1], from the sorted list.
  function span(C, y0, y1) {
    let lo = 0, hi = C.list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (C.list[m].y < y0) lo = m + 1; else hi = m; }
    const out = [];
    for (let i = lo; i < C.list.length && C.list[i].y <= y1; i++) out.push(C.list[i]);
    return out;
  }
  function text(c) {
    if (c.k === "r") return c.o ? `${c.r} rises, in land ${c.o} held` : `${c.r} appears on the map`;
    if (c.k === "f") return c.o ? `${c.r} ends; its heartland passes to ${c.o}` : `${c.r} ends`;
    if (c.k === "g") return `${c.r} gains ${km2(c.a)}${c.o ? ` from ${c.o}` : ""}`;
    return `${c.r} loses ${km2(c.a)}${c.o ? ` to ${c.o}` : ""}`;
  }
  function card(c, ctx, D) {
    const how = c.k === "g" || c.k === "l" ? `${c.p}% of its land the year before.` : c.k === "r" ? `${km2(c.a)} at its start.` : `${km2(c.a)} just before it ended.`;
    return { kick: `Border change · ${KIND[c.k][0]}`, title: text(c), year: c.y, lon: c.lon, lat: c.lat,
      meta: `${ctx.fmtYear(c.y)} · near ${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°`,
      body: `${how} The pin marks the largest piece of land that changed hands; the year is the first one the new border holds.`,
      why: "Computed from the Cliopatria border polygons: the land a realm held in this frame compared with the frame before, and who held that land on the other side.",
      sources: [{ cite: D.source || "Seshat Cliopatria, CC BY 4.0", url: "https://github.com/Seshat-Global-History-Databank/cliopatria" },
        ...(c.wiki ? [{ cite: "Wikipedia: " + c.wiki, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(c.wiki.replace(/ /g, "_")) }] : [])] };
  }
  const big = (a, b) => b.a - a.a;

  ATLAS.lens({
    id: "changes",
    name: "Border changes",
    family: "power",
    color: "#a0527a",
    on: false,
    guide: ["borders", "political", "military"],
    index: D => {
      const C = prep(D);
      return "Biggest border changes (Cliopatria): " + C.list.filter(c => c.k !== "f" || c.a > 3e5).slice().sort(big).slice(0, 160)
        .sort((a, b) => a.y - b.y).map(c => `${c.y}: ${text(c)}`).join("; ");
    },

    draw(ctx) {
      const C = prep(ctx.data), y = ctx.year;
      // What changed in the last few years, biggest first; more show as you zoom in.
      const keep = Math.round(12 * Math.min(6, ctx.k));
      const recent = span(C, y - RECENT, y).sort(big).slice(0, keep);
      for (const k in KIND) {
        ctx.pins(recent.filter(c => c.k === k), { key: c => c.i, shape: KIND[k][1], always: true,
          label: c => c.y === y || recent.indexOf(c) < 8 ? `${c.r}${c.k === "g" ? " +" : c.k === "l" ? " \u2212" : c.k === "r" ? " rises" : " ends"}` : null,
          title: c => `${ctx.fmtYear(c.y)}: ${text(c)}`, card: c => card(c, ctx, ctx.data) }).style("opacity", c => 1 - 0.6 * (y - c.y) / RECENT);
      }
    },

    here(ctx, at) {
      const C = prep(ctx.data), y = ctx.year;
      return ctx.near(span(C, y - 60, y + 60), { ...at, r: Math.max(at.r || 300, 500) })
        .sort((a, b) => (a.y > y) - (b.y > y) || Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 8)
        .map(c => ({ title: text(c), year: c.y, why: KIND[c.k][0], dim: c.y > y, tag: c.y > y ? "not yet" : null, card: card(c, ctx, ctx.data) }));
    },

    now(ctx) {
      const C = prep(ctx.data), y = ctx.year;
      const rows = span(C, y - 10, y).sort((a, b) => (b.y === y) - (a.y === y) || big(a, b)).slice(0, 7);
      const n = span(C, y - 10, y).length;
      const out = rows.map(c => ({ title: text(c), year: c.y, why: KIND[c.k][0], card: card(c, ctx, ctx.data) }));
      if (n > rows.length) out.push({ title: `${n} border changes in the ten years to ${ctx.fmtYear(y)}`, year: "Cliopatria", why: "Switch on Border changes to see them all on the map" });
      return out;
    },

    strip: D => prep(D).years,
  });
})();
