// Deep time: the world from 300,000 years ago to the first cities. The other kinds of human and their ranges, Ice Age
// animals, the sites the evidence comes from, our species walking out of Africa (the front moves with the year), the
// first farms, and the ice-age world itself: the pixel map redraws coasts, land bridges, ice sheets and glacial
// biomes from sea level (views/pixel/paleo.js, rasters from ingest/deep-time/paleo.py). Data: views/atlas/lenses/deeptime.py.
(function () {
  const NOW = 2025, HIST = -4000;
  const data = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.deeptime) || null;
  // The ice-age world for the pixel map. The rasters load the first time the year goes before about 5500 BCE.
  const P = typeof PixelPaleo === "function" ? PixelPaleo({
    files: () => { const d = data(); return d && d.files ? { sea: d.files["paleo-sea.png"], ice: d.files["paleo-ice.png"], curve: d.sea, slices: d.slices, sheets: d.sheets, retreat: d.retreat } : null; },
    onReady: () => { if (ATLAS.pixelRerender) ATLAS.pixelRerender(); if (ATLAS.api) ATLAS.api.redraw(); },
  }) : null;
  ATLAS.paleo = P;
  // The lens data arrives after the first paint; start the rasters then if the page opened in deep time.
  let tries = 0;
  const kick = setInterval(() => {
    if (++tries > 120) return clearInterval(kick);
    if (!data() || !ATLAS.api) return;
    clearInterval(kick);
    if (P && ATLAS.api.year < -5500) P.load();
    ATLAS.api.onYear(y => { if (P && y < -5500 && !P.ready()) P.load(); });
  }, 500);

  const ago = y => NOW - y;
  // How far from its date a record stays on the map: wider the deeper in time (36,000 years at 300,000 years ago).
  const win = y => Math.max(300, ago(y) * 0.12);
  const near = (y, a, b = a) => y >= a - win(y) && y <= b + win(y) * 0.6;
  const fadeOf = (y, a, b = a) => y < a ? 1 - (a - y) / win(y) : y > b ? 1 - (y - b) / (win(y) * 0.6) : 1;
  const inPoly = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const closed = r => r.concat([r[0]]);
  const src = r => (r.src || []).map(([cite, url]) => ({ cite, url }));
  const DASH = { attested: "sure", estimated: "likely", approximate: "legend", unknown: "legend" };
  const FIND = { fossil: "Fossil", burial: "Burial", art: "Art", site: "Camp and tools" };
  const SPRITE = { art: "deep_cave", site: "deep_camp" };
  const grp = id => (data().groups || []).find(g => g.id === id);

  // Where the front of a dispersal is in year y: [lon, lat] and the stops already passed.
  function front(r, y) {
    const p = r.path; if (y < p[0][2]) return null;
    if (y >= p[p.length - 1][2]) return { at: p[p.length - 1], done: true, pts: p.map(q => [q[0], q[1]]) };
    for (let i = 1; i < p.length; i++) if (y <= p[i][2]) {
      const t = (y - p[i - 1][2]) / ((p[i][2] - p[i - 1][2]) || 1), at = d3.geoInterpolate(p[i - 1], p[i])(t);
      return { at, done: false, pts: p.slice(0, i).map(q => [q[0], q[1]]).concat([at]) };
    }
    return null;
  }
  function seaLine(y) {
    if (!P || y >= -5500) return null;
    const s = P.sea(y);
    return s < -1 ? `The sea stood about ${Math.round(-s / 5) * 5} m lower than today` : s > 1 ? `The sea stood about ${Math.round(s)} m higher than today` : "The sea stood about where it is today";
  }

  const siteCard = (ctx, s) => ({ kick: "Deep time · " + (FIND[s.find] || "Site"), title: s.name, year: s.start, lon: s.lon, lat: s.lat,
    meta: [s.start_range ? `${ctx.fmtYear(s.start_range[0])} to ${ctx.fmtYear(s.start_range[1])}` : "", grp(s.who) ? grp(s.who).name : "", s.conf && s.conf !== "attested" ? s.conf : ""].filter(Boolean).join(" · "),
    body: s.what + (s.debate ? " Two views: " + s.debate.map(v => `${v.view} (${v.by})`).join("; ") + "." : ""), why: s.why, sources: src(s) });
  const groupCard = (ctx, g) => ({ kick: "Deep time · Human species", title: g.name, year: g.start, lon: g.lon, lat: g.lat,
    meta: `${g.latin || ""} · ${ctx.fmtYear(g.start)} to ${g.end ? ctx.fmtYear(g.end) : "today"} · range ${g.conf || "estimated"}`, body: g.what, why: g.why, sources: src(g) });
  const faunaCard = (ctx, f) => ({ kick: "Deep time · Ice Age animal", title: f.name, year: f.end, lon: f.at[0][0], lat: f.at[0][1],
    meta: `${f.latin} · gone by ${ctx.fmtYear(f.end)}${f.last_refuge ? ` (last on ${f.last_refuge.name}, ${ctx.fmtYear(f.last_refuge.end)})` : ""}`,
    body: f.what + (f.debate ? " Why they vanished is argued: " + f.debate.map(v => v.view.toLowerCase()).join(", or ") + "." : ""), why: f.why, sources: src(f) });
  const routeCard = (ctx, r) => ({ kick: "Deep time · Dispersal", title: r.name, year: r.path[0][2], meta: `${ctx.fmtYear(r.path[0][2])} to ${ctx.fmtYear(r.path[r.path.length - 1][2])} · path ${r.conf}`,
    body: r.what, why: r.why, sources: src(r) });
  const hearthCard = (ctx, h) => ({ kick: "Deep time · Where farming began", title: h.name, year: h.start, lon: h.lon, lat: h.lat,
    meta: [h.crops && h.crops.length ? "Crops: " + h.crops.join(", ") : "", h.animals && h.animals.length ? "Animals: " + h.animals.join(", ") : ""].filter(Boolean).join(" · "),
    body: h.what, why: h.why, sources: src(h) });
  const landCard = (ctx, l, y) => ({ kick: l.subtype === "ice_sheet" ? "Deep time · Ice sheet" : "Deep time · Land bridge", title: l.name, year: y, lon: l.lon, lat: l.lat,
    meta: seaLine(y) || "", body: l.what, why: l.why, sources: src(l).concat((data().paleo_sources || []).slice(0, 3).map(([cite, url]) => ({ cite, url }))) });
  const eventCard = (ctx, e) => ({ kick: "Deep time · " + (e.subtype || "event").replace(/_/g, " "), title: e.name, year: e.start, lon: e.lon, lat: e.lat,
    meta: e.end ? `${ctx.fmtYear(e.start)} to ${ctx.fmtYear(e.end)}` : ctx.fmtYear(e.start), body: e.what, why: e.why, sources: src(e) });

  const alive = (r, y) => y >= r.start && (r.end == null || y <= r.end);
  const landShown = (l, y) => !!P && P.ready() && y < -5500 && (l.subtype === "ice_sheet" ? P.iceAt(l.lon, l.lat, y) : P.landAt(l.lon, l.lat, y) && !P.iceAt(l.lon, l.lat, y));

  ATLAS.lens({
    id: "deeptime", name: "Deep time", family: "peoples", color: "#b8612e", on: true, guide: ["population", "geography"],
    key: [["arrow", "Our species on the move: the band walks with the year (dotted: approximate)"], ["line", "Where another kind of human lived"],
      ["diamond", "Fossil or burial"], ["square", "Climate shock"], ["sprite", "Ice Age animals, camps, painted caves and first farms"]],
    index: d => "Deep time lens (300,000 years ago to 4000 BCE): sea level and ice sheets by year, human species "
      + d.groups.map(g => g.name).join(", ") + "; sites " + d.sites.map(s => `${s.name} (${s.start})`).join(", ")
      + "; megafauna " + d.fauna.map(f => `${f.name} (gone ${f.end})`).join(", ") + "; dispersals " + d.routes.map(r => r.name).join(", ")
      + "; farming hearths " + d.hearths.map(h => `${h.name} (${h.start})`).join(", "),

    draw(ctx) {
      const d = ctx.data, y = ctx.year;
      if (!d.sites || y > 0) return;
      // Other kinds of human: their range, dashed by how sure it is, and one figure with the name.
      const gs = d.groups.filter(g => g.range && alive(g, y));
      for (const conf of ["estimated", "approximate"])
        ctx.paths(gs.filter(g => (g.conf || "estimated") === conf), { key: g => g.id, coords: g => closed(g.range), conf: DASH[conf], alpha: .55, width: 1.6, card: g => groupCard(ctx, g), title: g => g.name });
      ctx.pins(gs, { key: g => "g:" + g.id, shape: "deep_archaic", label: g => g.name, always: ctx.k >= 1.5, pri: 6, card: g => groupCard(ctx, g), title: g => `${g.name}: ${g.what}` });
      // Ice Age animals where they roamed; the last mammoths on Wrangel Island.
      const fs = [];
      for (const f of d.fauna) {
        if (alive(f, y)) for (const [i, at] of f.at.entries()) fs.push({ f, i, lon: at[0], lat: at[1] });
        else if (f.last_refuge && y > f.end && y <= f.last_refuge.end) fs.push({ f, i: "r", lon: f.last_refuge.lon, lat: f.last_refuge.lat, refuge: true });
      }
      ctx.pins(fs, { key: o => o.f.id + ":" + o.i, shape: o => o.f.sprite, label: o => ctx.k >= 2.2 || o.refuge ? (o.refuge ? `Last ${o.f.name.toLowerCase()}s` : o.f.name) : null, pri: 2,
        card: o => faunaCard(ctx, o.f), title: o => o.f.name });
      // Just gone: a cross where they were last seen.
      const gone = d.fauna.filter(f => y > (f.last_refuge ? f.last_refuge.end : f.end) && y - (f.last_refuge ? f.last_refuge.end : f.end) < win(y) * 0.5)
        .map(f => ({ f, lon: f.last_refuge ? f.last_refuge.lon : f.at[0][0], lat: f.last_refuge ? f.last_refuge.lat : f.at[0][1] }));
      ctx.pins(gone, { key: o => "x:" + o.f.id, shape: "cross", label: o => `${o.f.name} extinct`, ghost: true, card: o => faunaCard(ctx, o.f), title: o => `${o.f.name}: extinct about ${ctx.fmtYear(o.f.end)}` });
      // Our species on the move: the travelled part of each route, and a band of walkers at the front.
      const fr = d.routes.map(r => ({ r, f: front(r, y) })).filter(o => o.f && !(o.f.done && y - o.r.path[o.r.path.length - 1][2] > win(y)));
      ctx.paths(fr, { key: o => o.r.id, coords: o => o.f.pts, conf: "likely", arrow: true, alpha: .85, width: 2.2,
        card: o => routeCard(ctx, o.r), title: o => o.r.name });
      ctx.pins(fr.filter(o => !o.f.done).map(o => ({ ...o, lon: o.f.at[0], lat: o.f.at[1] })), { key: o => "band:" + o.r.id, shape: "deep_band", label: o => o.r.name, always: true, pri: 8,
        card: o => routeCard(ctx, o.r), title: o => o.r.name });
      // Sites near their date.
      const ss = d.sites.filter(s => near(y, s.start));
      ctx.pins(ss, { key: s => s.id, shape: s => SPRITE[s.find] || "diamond", label: s => s.name, pri: s => 4 + fadeOf(y, s.start) * 2, fade: s => Math.max(.35, fadeOf(y, s.start)),
        ghost: s => s.conf === "approximate", card: s => siteCard(ctx, s), title: s => `${s.name} · ${ctx.fmtYear(s.start)}` });
      // Where farming began, for a few thousand years after it did.
      const hs = d.hearths.filter(h => y >= h.start - win(y) * 0.3 && y <= h.start + Math.max(3000, win(y)));
      ctx.pins(hs, { key: h => h.id, shape: h => h.animals && h.animals[0] === "dog" ? "deep_camp" : "deep_farm", label: h => h.name, always: true, pri: 7,
        fade: h => y < h.start ? .5 : 1, card: h => hearthCard(ctx, h), title: h => `${h.name}: ${[...(h.crops || []), ...(h.animals || [])].slice(0, 4).join(", ")}` });
      // Land bridges and ice sheets, named where the paleo map shows them.
      const ls = d.land.filter(l => (l.subtype === "ice_sheet" || ctx.k >= 1.6) && landShown(l, y));
      ctx.pins(ls, { key: l => l.id, shape: "deep_label", size: 0.1, fill: 0, stroke: false, always: true, fontPx: 11, pri: 9, lblColor: l => l.subtype === "ice_sheet" ? "#3d5a6e" : "#6b5233",
        label: l => l.name.toUpperCase(), card: l => landCard(ctx, l, y), title: l => l.name });
      // Climate shocks while they last.
      const es = d.events.filter(e => near(y, e.start, e.end || e.start) && Math.abs(y - e.start) < Math.max(2000, win(y) * 0.4) + ((e.end || e.start) - e.start));
      ctx.pins(es, { key: e => e.id, shape: "square", label: e => e.name, pri: 5, card: e => eventCard(ctx, e), title: e => e.name });
    },

    here(ctx, at) {
      const d = ctx.data, y = ctx.year, rows = [], pt = [at.lon, at.lat];
      if (!d.sites || y > 0) return rows;
      if (P && P.ready() && y < -5500) {
        const ice = P.iceAt(at.lon, at.lat, y), land = P.landAt(at.lon, at.lat, y), today = P.landAt(at.lon, at.lat, NOW);
        const what = ice ? "Under an ice sheet" : land && !today ? "Dry land, now under the sea" : !land && today ? "Under water" : land ? "Dry land" : "Sea";
        rows.push({ title: what, tag: "Ice Age world", why: seaLine(y) + ". Coasts from ETOPO depths and the sea-level curve; ice from dated reconstructions (Batchelor et al. 2019), shrinking by rank after 19,000 years ago.",
          card: { kick: "Deep time · The ice-age world", title: what, year: y, lon: at.lon, lat: at.lat, body: seaLine(y) + ".", why: "Sea level and ice change together: the water locked in the ice sheets came out of the ocean.", sources: (d.paleo_sources || []).map(([cite, url]) => ({ cite, url })) } });
      }
      for (const g of d.groups.filter(g => g.range && alive(g, y) && inPoly(pt, g.range)))
        rows.push({ title: `${g.name} lived here`, tag: "Human species", year: g.start, why: g.what, card: groupCard(ctx, g) });
      for (const f of d.fauna.filter(f => alive(f, y) && ((f.range && inPoly(pt, f.range)) || (f.range2 && inPoly(pt, f.range2)))))
        rows.push({ title: `${f.name}s roamed here`, tag: "Ice Age animal", year: f.end, why: f.why, card: faunaCard(ctx, f) });
      for (const o of d.routes.map(r => ({ r, f: front(r, y) })).filter(o => o.f && !o.f.done && ctx.km([o.f.at[0], o.f.at[1]], pt) < 1500))
        rows.push({ title: `${o.r.name}: the front is nearby`, tag: "Dispersal", why: o.r.what, card: routeCard(ctx, o.r) });
      for (const s of ctx.near(d.sites, at, Math.max(at.r || 0, 700)).sort((a, b) => Math.abs(a.start - y) - Math.abs(b.start - y)).slice(0, 5))
        rows.push({ title: s.name, tag: FIND[s.find] || "Site", year: s.start, why: s.why, card: siteCard(ctx, s) });
      for (const h of ctx.near(d.hearths, at, Math.max(at.r || 0, 1200)).slice(0, 2))
        rows.push({ title: h.name, tag: "Farming hearth", year: h.start, why: h.what, card: hearthCard(ctx, h) });
      return rows;
    },

    now(ctx) {
      const d = ctx.data, y = ctx.year, rows = [];
      if (!d.sites || y > HIST) return rows;
      const sea = seaLine(y);
      if (sea) {
        const bridges = d.land.filter(l => l.subtype !== "ice_sheet" && landShown(l, y)).map(l => l.name), ice = d.land.filter(l => l.subtype === "ice_sheet" && landShown(l, y)).map(l => l.name.replace(" Ice Sheet", ""));
        rows.push({ title: sea, tag: "Ice Age world", year: y, why: [bridges.length ? "Dry land: " + bridges.join(", ") + "." : "", ice.length ? "Ice sheets: " + ice.join(", ") + "." : ""].filter(Boolean).join(" ") });
      }
      const gs = d.groups.filter(g => alive(g, y));
      if (gs.length) rows.push({ title: gs.length === 1 ? "One kind of human left: us" : `${gs.length} kinds of human alive`, tag: "Human species", why: gs.map(g => g.name).join(", ") + "." });
      for (const o of d.routes.map(r => ({ r, f: front(r, y) })).filter(o => o.f && !o.f.done)) rows.push({ title: o.r.name, tag: "Dispersal", why: o.r.what, card: routeCard(ctx, o.r) });
      const fs = d.fauna.filter(f => alive(f, y));
      if (fs.length) rows.push({ title: `${fs.length} giant animals still about`, tag: "Ice Age animals", why: fs.map(f => f.name).join(", ") + "." });
      for (const e of d.events.filter(e => y >= e.start - 300 && y <= (e.end || e.start) + 300)) rows.push({ title: e.name, tag: "Climate", year: e.start, why: e.what, card: eventCard(ctx, e) });
      for (const h of d.hearths.filter(h => Math.abs(h.start - y) < 1500)) rows.push({ title: `Farming begins: ${h.name}`, tag: "Hearth", year: h.start, why: h.what, card: hearthCard(ctx, h) });
      return rows;
    },

    strip: d => (d.sites || []).map(s => s.start).concat((d.hearths || []).map(h => h.start), (d.events || []).map(e => e.start)),
  });
})();
