// Technology, food & energy: how inventions, crops and energy sources spread, and how fast news travelled.
// Data from views/atlas/lenses/tech.py (records in data/tech-food-energy/). One pin per diffusion step.
(() => {
  const CAT = { tech: ["Technology", "diamond"], war: ["War technology", "cross"], comms: ["Communication", "square"], energy: ["Energy", "triangle"], food: ["Food & farming", "circle"] };
  const ENAME = { traditional_biomass: "wood and other biomass", coal: "coal", oil: "oil", gas: "gas", hydro: "hydro", nuclear: "nuclear", wind: "wind", solar: "solar", biofuels: "biofuels", other_renewables: "other renewables" };
  const FRESH = 40;   // a step counts as news on the map for this many years
  const pct = x => Math.round(x * 100) + "%";
  const days = d => d === 0 ? "same day" : d === 1 ? "1 day" : `${d} days`;
  const valAt = (series, y) => { let v = null; for (const p of series || []) { if (p[0] <= y) v = p[1]; else break; } return v; };

  let cache = null;
  function prep(D) {
    if (cache && cache.D === D) return cache;
    const src = i => ({ cite: D.src[i][0], url: D.src[i][1] || undefined });
    const steps = D.steps.map(([i, y, lon, lat, place, approx, note, s], k) => ({ k, i, y, lon, lat, place, approx, note, s, it: D.items[i] }));
    const byItem = {};
    for (const s of steps) (byItem[s.i] = byItem[s.i] || []).push(s);
    for (const i in byItem) byItem[i].forEach((s, n, a) => { s.n = n; s.of = a.length; s.prev = n ? a[n - 1] : null; });
    return cache = { D, src, steps, byItem };
  }

  function linkText(it, C) {
    return (it.l || []).map(l => (l.dir === "from" ? `${it.n} ${l.type} ${l.other}` : `${l.other} ${l.type} ${it.n}`) + (l.note ? `: ${l.note}` : "") +
      (l.conf != null ? ` (confidence ${pct(l.conf)}${l.view ? ", " + l.view : ""})` : "")).join(" ");
  }
  function stepCard(s, C) {
    const it = s.it, links = linkText(it, C);
    return { kick: `${(CAT[it.c] || CAT.tech)[0]} · step ${s.n + 1} of ${s.of}`, title: `${it.n} → ${s.place}`, year: s.y, lon: s.lon, lat: s.lat,
      meta: `${s.place}, ${s.approx ? "about " : ""}${C.fmtYear(s.y)}`, body: s.note, why: it.y + (links ? " " + links : ""),
      line: s.prev && C.km([s.prev.lon, s.prev.lat], [s.lon, s.lat]) < 2500 ? [[s.prev.lon, s.prev.lat], [s.lon, s.lat]] : undefined,
      sources: (s.s || it.s).map(C.src) };
  }
  function newsCard(n, C) {
    return { kick: "How fast news travelled", title: n.n, year: n.y, lon: n.t[0], lat: n.t[1], line: [[n.o[0], n.o[1]], [n.t[0], n.t[1]]],
      meta: `${n.o[2]} to ${n.t[2]} · about ${n.km.toLocaleString()} km · ${days(n.d)}${n.dr ? ` (${n.dr[0]}-${n.dr[1]})` : ""} · ${C.fmtYear(n.y)}`,
      body: n.w, sources: n.s.map(C.src) };
  }
  function energyMix(D, y) {
    const rows = D.energy.rows; if (!rows.length || y < rows[0][0]) return null;
    let r = rows[0]; for (const x of rows) if (x[0] <= y) r = x;
    const tot = r.slice(1).reduce((a, b) => a + b, 0);
    const parts = D.energy.keys.map((k, i) => [k, r[i + 1] / tot]).filter(p => p[1] >= 0.01).sort((a, b) => b[1] - a[1]);
    return { year: r[0], tot, parts };
  }

  ATLAS.lens({
    id: "tech",
    name: "Technology, food & energy",
    family: "wealth",
    color: "#6b7f2a",
    on: false,
    guide: ["technology"],
    index: D => D.items.map((it, i) => {
      const s = D.steps.filter(x => x[0] === i);
      return `${it.n} (${(CAT[it.c] || CAT.tech)[0]}): ${s.map(x => `${x[4]} ${x[1]}`).join(", ")}`;
    }).join("\n") + "\nNews journeys: " + D.news.map(n => `${n.n} ${n.y}: ${n.d} days`).join("; "),

    draw(ctx) {
      const C = { ...ctx, ...prep(ctx.data) }, y = ctx.year;
      // Everywhere each item had reached by this year: old steps small and faint, fresh ones labelled with an arrow in.
      const reached = C.steps.filter(s => s.y <= y);
      const fresh = reached.filter(s => y - s.y <= FRESH);
      const old = reached.filter(s => y - s.y > FRESH);
      // Arrow only from a previous step within ~2,500 km: farther jumps are separate inventions or sea leaps, not a route.
      ctx.paths(fresh.filter(s => s.prev && ctx.km([s.prev.lon, s.prev.lat], [s.lon, s.lat]) < 2500), { key: s => "a" + s.k, coords: s => [[s.prev.lon, s.prev.lat], [s.lon, s.lat]], cls: "fresh",
        title: s => `${s.it.n}: ${s.prev.place} → ${s.place}`, card: s => stepCard(s, C) }).attr("marker-end", "url(#arrow)");
      for (const c in CAT) {
        ctx.pins(old.filter(s => s.it.c === c), { key: s => s.k, shape: CAT[c][1], title: s => `${s.it.n} · ${s.place} by ${ctx.fmtYear(s.y)}`, card: s => stepCard(s, C) })
          .style("opacity", 0.45).attr("data-old", 1);
        ctx.pins(fresh.filter(s => s.it.c === c), { key: s => s.k, shape: CAT[c][1], always: true, label: s => `${s.it.n} · ${s.place}`,
          title: s => `${s.it.n} → ${s.place}, ${ctx.fmtYear(s.y)}: ${s.note}`, card: s => stepCard(s, C) });
      }
      // News journeys near their year, labelled with how long the news took.
      const nw = ctx.data.news.filter(n => Math.abs(n.y - y) <= 20);
      ctx.paths(nw, { key: n => n.n, coords: n => [[n.o[0], n.o[1]], [n.t[0], n.t[1]]], cls: "news", title: n => `${n.n}: ${days(n.d)}`, card: n => newsCard(n, C) })
        .style("stroke-dasharray", "4 3").attr("marker-end", "url(#arrow)");
      ctx.pins(nw.map(n => ({ ...n, lon: n.t[0], lat: n.t[1] })), { key: n => "n" + n.n, shape: "square", always: true, label: n => `${days(n.d)} from ${n.o[2]}`,
        title: n => n.n, card: n => newsCard(n, C) });
    },

    here(ctx, at) {
      const C = { ...ctx, ...prep(ctx.data) }, y = ctx.year, out = [];
      const near = ctx.near(C.steps, { ...at, r: Math.max(at.r || 300, 400) }).sort((a, b) => (a.y > y) - (b.y > y) || Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 6);
      for (const s of near) out.push({ title: `${s.it.n} → ${s.place}`, year: s.y, why: s.note, dim: s.y > y, tag: s.y > y ? "not yet" : null, card: stepCard(s, C) });
      for (const n of ctx.data.news) {
        if (ctx.km([at.lon, at.lat], [n.t[0], n.t[1]]) < 400 || ctx.km([at.lon, at.lat], [n.o[0], n.o[1]]) < 400)
          out.push({ title: n.n, year: n.y, why: `${days(n.d)}, about ${n.km.toLocaleString()} km`, dim: Math.abs(n.y - y) > 60, card: newsCard(n, C) });
      }
      // Railways, phones and cars in the nearest HCCTA country.
      const c = ctx.data.countries.map(c => ({ c, d: ctx.km([at.lon, at.lat], c.at) })).sort((a, b) => a.d - b.d)[0];
      if (c && c.d < 600) {
        const r = valAt(c.c.railway_km, y), p = valAt(c.c.telephones, y), car = valAt(c.c.private_cars, y);
        const bits = [r ? `${Math.round(r).toLocaleString()} km of railway` : null, p ? `${Math.round(p * 1000).toLocaleString()} telephones` : null, car ? `${Math.round(car * 1000).toLocaleString()} private cars` : null].filter(Boolean);
        if (bits.length) out.push({ title: `${c.c.n}: ${bits.join(", ")}`, year: "HCCTA", why: "Comin & Hobijn, from Mitchell's International Historical Statistics (figure for the nearest year on record)",
          card: { kick: "Technology adoption", title: c.c.n, meta: bits.join(" · ") + ` · ${ctx.fmtYear(y)}`, year: y, lon: c.c.at[0], lat: c.c.at[1], sources: c.c.s.map(C.src) } });
      }
      return out;
    },

    now(ctx) {
      const C = { ...ctx, ...prep(ctx.data) }, D = ctx.data, y = ctx.year, out = [];
      const moving = C.steps.filter(s => Math.abs(s.y - y) <= 25).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 4);
      for (const s of moving) out.push({ title: `${s.it.n} → ${s.place}`, year: s.y, why: s.note, dim: s.y > y, card: stepCard(s, C) });
      const m = energyMix(D, y);
      if (m) out.push({ title: `World energy: ${m.parts.slice(0, 4).map(([k, v]) => `${pct(v)} ${ENAME[k]}`).join(", ")}`, year: m.year,
        why: `${Math.round(m.tot).toLocaleString()} TWh of primary energy that year (Smil; Energy Institute)`,
        card: { kick: "Energy mix", title: `World primary energy, ${m.year}`, year: m.year, meta: `${Math.round(m.tot).toLocaleString()} TWh`,
          body: m.parts.map(([k, v]) => `${ENAME[k]} ${pct(v)}`).join(" · "), sources: D.energy.s.map(C.src) } });
      const w = valAt(D.wheat, y);
      if (w != null) out.push({ title: `English wheat harvest: ${w.toFixed(2)} tonnes per hectare`, year: D.wheat.filter(p => p[0] <= y).pop()[0],
        why: "Broadberry et al. (2015) before 1850, then FAO; a measure of how much food one field gave",
        card: { kick: "Harvests", title: "Wheat yield in England and the UK", year: y, meta: `${w.toFixed(2)} t/ha`, body: `From ${D.wheat[0][1].toFixed(2)} t/ha in ${D.wheat[0][0]} to ${D.wheat[D.wheat.length - 1][1].toFixed(2)} t/ha in ${D.wheat[D.wheat.length - 1][0]}.`, sources: D.wheat_s.map(C.src) } });
      const n = D.news.filter(n => n.y <= y).sort((a, b) => b.y - a.y)[0];
      if (n) out.push({ title: `Latest news journey on record: ${n.n}`, year: n.y, why: `${days(n.d)} for about ${n.km.toLocaleString()} km`, dim: y - n.y > 150, card: newsCard(n, C) });
      return out;
    },

    strip: D => D.steps.map(s => s[1]).concat(D.news.map(n => n.y)),
  });
})();
