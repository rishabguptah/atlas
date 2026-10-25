// Europe 1789-1914: what this region adds on top of the world index. Its chronicle, lives and storylines now come
// through views/atlas/world/ like any other place and period (the Up close tab in deep.js); this file keeps the
// region's own lenses, Provinces and Growing cities, and gives Up close its railway and city numbers.
// Data: views/atlas/lenses/e19.py (LENS_DATA.e19, which the page may load after the first paint).
(function () {
  const R = { id: "europe-1789-1914", name: "Europe 1789–1914", start: 1789, end: 1914, box: [-25, 34, 50, 72] };
  let D = null, PROV = [], CITY = [];
  function prep() {
    const d = typeof LENS_DATA !== "undefined" && LENS_DATA.e19;
    if (!d || !d.provinces) return false;
    D = d;
    PROV = D.provinces.map(([n, lon, lat, s, e, kind, of, w, q], i) => ({ i, n, lon, lat, s, e, kind, of, w, q }));
    CITY = D.cities.map(([n, lon, lat, src, pts], i) => ({ i, n, lon, lat, src, pts }));
    return true;
  }
  const ok = () => !!D || prep();
  const wd = q => q ? { cite: `Wikidata Q${q} (CC0)`, url: `https://www.wikidata.org/wiki/Q${q}` } : null;

  // ---------- lens: Provinces ----------
  const provName = p => p._n || (p._n = p.n.replace(/ (Governorate|Province|County|Vilayet|Department|Sanjak|Canton|District)$/i, "").replace(/^(Province|Governorate|County|Canton|Department|Vilayet|Sanjak) of /, "").replace(/ \(.*\)$/, ""));
  const provAlive = (p, y) => (p.s == null || p.s <= y) && (p.e == null || p.e >= y);
  ATLAS.lens({
    id: "e19prov", name: "Provinces 1789–1914", family: "land", color: "#6b5b3e", on: false,
    draw(ctx) {
      const y = ctx.year;
      if (!ok() || y < R.start || y > R.end || ctx.k < 2.4) { ctx.pins([], {}); return; }
      // Province names appear as you zoom: the best-known first, all of them from about 5x.
      // Greedy declutter in screen space: best-known first, skip any name that would overlap one already placed.
      const k = ctx.k, boxes = [], list = [];
      for (const p of PROV.filter(p => provAlive(p, y)).sort((a, b) => b.w - a.w)) {
        const q = ctx.projection([p.lon, p.lat]); if (!q) continue;
        const w = provName(p).length * 6.6 + 6, x = q[0] * k - w / 2, yy = q[1] * k - 7, h = 14;
        if (boxes.some(b => x < b[0] + b[2] && b[0] < x + w && yy < b[1] + b[3] && b[1] < yy + h)) continue;
        boxes.push([x, yy, w, h]); list.push(p);
        if (list.length >= 400) break;
      }
      ctx.pins(list, { key: p => p.i, always: true, size: 0.1, fill: 0, stroke: false, fontPx: 10, lblColor: "var(--ink-soft)", pri: -5,
        lblAt: p => [-provName(p).length * 2.9, 4], label: provName,
        title: p => `${p.n} · ${p.kind} of ${p.of}${p.s ? " · from " + p.s : ""}${p.e ? " to " + p.e : ""}`,
        card: p => ({ kick: `Province · ${p.kind} of ${p.of}`, title: p.n, year: y, lon: p.lon, lat: p.lat, meta: `${p.s ? "from " + p.s : "dates not in Wikidata"}${p.e ? ", ended " + p.e : ""}`,
          body: "Named at its centre: Wikidata has no historical outline for most nineteenth-century provinces, so the map names them instead of drawing borders it cannot source.", why: "", sources: [wd(p.q)] }) });
    },
    here(ctx, at) {
      const y = ctx.year;
      if (!ok() || y < R.start || y > R.end) return [];
      const p = ctx.near(PROV.filter(p => provAlive(p, y)), { ...at, r: 150 })[0];
      return p ? [{ title: p.n, year: p.s ? `from ${p.s}` : "", why: `${p.kind} of ${p.of}`, card: { kick: `Province · ${p.kind} of ${p.of}`, title: p.n, lon: p.lon, lat: p.lat, sources: [wd(p.q)] } }] : [];
    },
  });

  // ---------- lens: Growing cities ----------
  // Population at year y, growing geometrically between known points; null outside the series.
  const popAt = (c, y) => {
    const p = c.pts; if (y < p[0][0] || y > p[p.length - 1][0] + 5) return null;
    for (let k = 1; k < p.length; k++) if (y <= p[k][0]) { const [a, va] = p[k - 1], [b, vb] = p[k]; return va * Math.pow(vb / va, (y - a) / (b - a || 1)); }
    return p[p.length - 1][1];
  };
  const growth = (c, y) => { const a = popAt(c, y - 50), b = popAt(c, y); return a && b ? b / a : null; };
  const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : Math.round(n / 1000) + ",000";
  function cityCard(c, y) {
    const v = popAt(c, y), g = growth(c, y);
    return { kick: "Growing cities", title: c.n, year: y, lon: c.lon, lat: c.lat, meta: v ? `about ${fmtN(v)} people in ${y}` : "",
      body: "Known counts: " + c.pts.filter(p => p[0] >= 1750).map(p => `${p[0]}: ${fmtN(p[1])}`).join(", ") + ". Years between are interpolated.",
      why: g ? `${g >= 2 ? "Grew " + g.toFixed(1) + "×" : g < 1 ? "Shrank" : "Grew " + Math.round((g - 1) * 100) + "%"} in the fifty years to ${y}.` : "",
      sources: [{ cite: c.src === "w" ? D.src.wd + ": dated population statements" : D.src.reba }] };
  }
  ATLAS.lens({
    id: "e19cities", name: "Growing cities", family: "wealth", color: "#8a4b14", on: false,
    guide: ["population", "economy"],
    draw(ctx) {
      const y = ctx.year;
      if (!ok() || y < R.start - 39 || y > R.end) { ctx.pins([], {}); return; }
      const list = CITY.map(c => ({ c, v: popAt(c, y), g: growth(c, y) })).filter(o => o.v).sort((a, b) => b.v - a.v).slice(0, Math.round(40 * Math.max(1, ctx.k)));
      ctx.pins(list.map(o => ({ ...o, lon: o.c.lon, lat: o.c.lat, id: o.c.i })), { key: o => o.c.i,
        label: o => o.v > 400000 || ctx.k >= 5 ? o.c.n : null, title: o => `${o.c.n} · about ${fmtN(o.v)}${o.g ? ` · ${o.g.toFixed(1)}× in 50 years` : ""}`, card: o => cityCard(o.c, y),
        size: o => Math.min(16, 2 + Math.sqrt(o.v) / 110), fill: o => o.g >= 3 ? 0.75 : 0.3, always: o => o.v > 1e6 });
    },
    here(ctx, at) {
      const y = ctx.year;
      if (!ok()) return [];
      return ctx.near(CITY.filter(c => popAt(c, y)), { ...at, r: 120 }).slice(0, 3).map(c => ({ title: `${c.n}: about ${fmtN(popAt(c, y))}`, year: y, why: (cityCard(c, y).why || ""), card: cityCard(c, y) }));
    },
    now(ctx) {
      const y = ctx.year;
      if (!ok() || y < R.start || y > R.end) return [];
      const g = CITY.map(c => ({ c, g: growth(c, y), v: popAt(c, y) })).filter(o => o.g && o.v > 50000).sort((a, b) => b.g - a.g).slice(0, 3);
      return g.map(o => ({ title: `${o.c.n} boom: ${o.g.toFixed(1)}× in 50 years`, year: y, why: `about ${fmtN(o.v)} people`, card: cityCard(o.c, y) }));
    },
  });

  // ---------- pixel map: booming industrial cities as sprites ----------
  (ATLAS.pixelSprites || (ATLAS.pixelSprites = [])).push((y, k) => {
    const out = [], on = window.ATLAS.isOn;
    if (!ok() || !(on && on("e19cities")) || k < 1.6) return out;
    for (const cty of CITY) { const g = growth(cty, y), v = popAt(cty, y); if (g >= 3 && v > 60000) out.push({ lon: cty.lon, lat: cty.lat, sprite: "city_industrial", pri: 3.5 }); }
    return out;
  });

  // ---------- numbers for the Up close tab while the view is in the region ----------
  (ATLAS.deepStats || (ATLAS.deepStats = [])).push((y, bbox) => {
    if (!ok() || y < R.start || y > R.end || !bbox || bbox[0] > R.box[2] || bbox[2] < R.box[0] || bbox[1] > R.box[3] || bbox[3] < R.box[1]) return [];
    const out = [], r = D.rail && D.rail.years.find(a => a[0] === y);
    if (r && r[1]) out.push({ v: r[1].toLocaleString(), t: `railway stations open in Europe (${r[3].toLocaleString()} opened this year)`, src: D.rail.note },
      { v: r[2].toLocaleString() + " km", t: "of track between stations Wikidata lists as neighbours", src: D.rail.source });
    const big = CITY.map(c => ({ c, v: popAt(c, y) })).filter(o => o.v && o.c.lon >= bbox[0] && o.c.lon <= bbox[2] && o.c.lat >= bbox[1] && o.c.lat <= bbox[3]).sort((a, b) => b.v - a.v)[0];
    if (big) out.push({ v: big.c.n, t: `largest city in view, about ${fmtN(big.v)}` });
    return out;
  });
})();
