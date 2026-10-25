// Epidemics: plague coming back again and again after the Black Death (every place with a recorded outbreak, 1347-1900),
// cholera and smallpox moving city by city, and the Wikidata epidemics. On the map: this year's outbreaks bright and the
// last few years fading, each spread's legs up to this year (dashed: the from-where is a reading, not a record), and the
// epidemics running this year sized by deaths.
(() => {
  const ERA = [1347, 1900], FADE = 4, MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MODE = { sea: "by sea", river: "by river", land: "overland" };
  let D = null, SRC, OB, BY_Y, AT, SP, EPI, PEAK, OB_SRC;
  const prep = d => {
    if (D === d) return; D = d;
    SRC = (d.src || []).map(([cite, url]) => (url ? { cite, url } : { cite }));
    OB_SRC = (d.obsrc || []).map(([cite, url]) => ({ cite, url }));
    OB = (d.ob || []).map(([lon, lat, y, n, s]) => ({ lon, lat, y, name: d.names[n], s }));
    BY_Y = new Map(); AT = new Map();
    for (const o of OB) {
      (BY_Y.get(o.y) || BY_Y.set(o.y, []).get(o.y)).push(o);
      (AT.get(o.name) || AT.set(o.name, []).get(o.name)).push(o.y);
    }
    const counts = [...BY_Y].map(([y, l]) => [y, l.length]);
    PEAK = counts.filter(([, c]) => c >= 60).map(([y]) => y);
    SP = (d.spreads || []).map(sp => {
      const stops = sp.stops.map(([name, lon, lat, y, m, mode, via, note, src], i) => ({ i, name, lon, lat, y, m, mode, via, note, sources: src.map(j => SRC[j]) }));
      for (const s of stops) s.from = s.via >= 0 ? stops[s.via] : null;
      return { ...sp, sources: sp.src.map(j => SRC[j]), stops, legs: sp.legs.map(([to, pts]) => ({ to: stops[to], pts })) };
    });
    for (const sp of SP) for (const s of sp.stops) s.sp = sp;
    EPI = (d.epi || []).map(([name, s, e, lat, lon, dl, dh, wd, src]) => ({ id: wd || name, name, s, e, lat, lon, dl, dh, wd, sources: [SRC[src]] }));
  };
  const big = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " million" : n >= 1e3 ? Math.round(n / 1e3) + ",000" : String(n);
  const deaths = e => e.dl == null ? "" : e.dl === e.dh ? `about ${big(e.dl)} deaths` : `${big(e.dl)} to ${big(e.dh)} deaths`;
  const short = sp => { const n = sp.n.split(",")[0].replace(/^Spread of /, "").replace(/ in the Americas$/, ""); return n[0].toUpperCase() + n.slice(1); };
  const when = (ctx, s) => (s.m ? MON[s.m] + " " : "") + ctx.fmtYear(s.y);

  function obCard(ctx, o) {
    const ys = AT.get(o.name) || [o.y], n = (BY_Y.get(o.y) || []).length;
    const list = ys.length > 14 ? ys.slice(0, 6).join(", ") + ", ... " + ys.slice(-6).join(", ") : ys.join(", ");
    return {
      kick: "Plague outbreak", title: `Plague in ${o.name}, ${ctx.fmtYear(o.y)}`, year: o.y, lon: o.lon, lat: o.lat,
      meta: `${ys.length} recorded ${ys.length === 1 ? "outbreak" : "outbreaks"} here: ${list} · ${n} ${n === 1 ? "place" : "places"} with plague in ${ctx.fmtYear(o.y)}`,
      body: `${o.name} is one of the places with a recorded plague outbreak in ${ctx.fmtYear(o.y)} in ${o.s ? "Sticker's (1908)" : "Biraben's (1975)"} catalogue, geocoded by Krauer and Schmid (2022). Coverage is mostly Europe and the Mediterranean, where the archives were read.`,
      why: "After the Black Death plague did not leave: it came back every few years for more than three centuries, usually along the same roads and sea lanes, until it faded from western Europe after 1720 and from the Ottoman lands in the 1800s.",
      sources: [OB_SRC[o.s]],
    };
  }
  function stopCard(ctx, s) {
    const sp = s.sp, from = s.from;
    return {
      kick: sp.n, title: `${short(sp)} reaches ${s.name}`, year: s.y, lon: s.lon, lat: s.lat,
      meta: `${when(ctx, s)}${from ? ` · from ${from.name}${MODE[s.mode] ? " " + MODE[s.mode] : ""} (the from-where is a reading of the routes, not a record)` : " · where it starts"} · stop ${s.i + 1} of ${sp.stops.length}`,
      body: [s.note, sp.what].filter(Boolean).join(" "), why: sp.why,
      sources: s.sources.length ? s.sources : sp.sources,
      line: s.from ? (sp.legs.find(l => l.to === s) || {}).pts : undefined,
    };
  }
  function epiCard(ctx, e) {
    return {
      kick: "Epidemic", title: e.name, year: e.s, lon: e.lon, lat: e.lat,
      meta: `${ctx.fmtSpan(e.s, e.e)}${deaths(e) ? " · " + deaths(e) : ""}`,
      body: `${e.name}, ${ctx.fmtSpan(e.s, e.e)}${deaths(e) ? `, with ${deaths(e)} on Wikidata` : ""}. The pin sits at the place Wikidata gives, which is sometimes a country's centre.`,
      why: "", sources: e.sources.concat(e.wd ? [{ cite: "Wikidata " + e.wd, url: "https://www.wikidata.org/wiki/" + e.wd }] : []),
    };
  }

  ATLAS.lens({
    id: "plague", name: "Epidemics", family: "shocks", color: "#9b3b3b", on: false,
    guide: ["disease"],
    key: [["small", "Plague outbreak: bright this year, fading over four years (1347-1900)"], ["dot", "City cholera (1826-32) or smallpox (1518-28) reached, labelled with the month"],
      ["arrow", "How it got there; dashed because the from-where is a reading of the routes"], ["cross", "Epidemic on Wikidata, bigger with more deaths"]],
    index: d => {
      prep(d);
      return [`Plague outbreaks: ${OB.length} place-years 1347-1900 (Biraben, Sticker); peak years ${PEAK.slice(0, 20).join(", ")}`,
        ...SP.map(sp => `${sp.n}: ${sp.stops.map(s => `${s.name} ${s.y}`).join(", ")}`),
        ...EPI.filter(e => e.dl).sort((a, b) => b.dl - a.dl).slice(0, 40).map(e => `${e.name} ${e.s}-${e.e} ${deaths(e)}`)].join("\n");
    },

    draw(ctx) {
      prep(ctx.data);
      const y = ctx.year, k = ctx.k || 1;
      // Plague: this year's outbreaks bright, the last few years fading.
      if (y >= ERA[0] - 1 && y <= ERA[1] + FADE) {
        const list = [];
        for (let a = 0; a <= FADE; a++) for (const o of BY_Y.get(y - a) || []) list.push(o);
        ctx.pins(list, { key: o => o.name + ":" + o.y, shape: "circle", cls: "plague-ob",
          size: o => o.y === y ? 3 : 2.2, fade: o => 1 - (y - o.y) / (FADE + 1), fill: o => o.y === y ? 0.9 : 0.5, stroke: false,
          label: o => o.y === y && (k >= 3 || (AT.get(o.name) || []).length >= 15) ? o.name : null, pri: o => o.y === y ? 2 : 0,
          title: o => `Plague in ${o.name}, ${ctx.fmtYear(o.y)}`, card: o => obCard(ctx, o) });
      }
      // Spreads: legs up to this year; the newest are bold, with an arrow.
      for (const sp of SP) {
        if (y < sp.s - 1 || y > sp.e + 3) continue;
        const legs = sp.legs.filter(l => l.to.y <= y);
        for (const fresh of [true, false]) {
          const list = legs.filter(l => (y - l.to.y <= 1) === fresh); if (!list.length) continue;
          ctx.paths(list, { key: l => sp.id + ">" + l.to.i, coords: l => l.pts, conf: "likely", arrow: fresh, width: fresh ? 2.4 : 1.4, alpha: fresh ? .9 : .45,
            title: l => `${l.to.from ? l.to.from.name + " → " : ""}${l.to.name}, ${when(ctx, l.to)}`, card: l => stopCard(ctx, l.to) });
        }
        ctx.pins(sp.stops.filter(s => s.y <= y), { key: s => sp.id + ":" + s.i, shape: "circle", size: s => y - s.y <= 1 ? 5 : 3.5,
          always: s => y - s.y <= 1, label: s => `${s.name} ${when(ctx, s)}`, pri: s => y - s.y <= 1 ? 8 : 4,
          title: s => `${sp.n}: ${s.name}, ${when(ctx, s)}`, card: s => stopCard(ctx, s) });
      }
      // Wikidata epidemics running this year (or ended in the last two), sized by deaths.
      const epi = EPI.filter(e => y >= e.s && y <= e.e + 2);
      ctx.pins(epi, { key: e => e.id, shape: "cross", size: e => e.dl ? Math.min(9, 3 + Math.log10(e.dl) - 2) : 3.5, fade: e => y > e.e ? .5 : 1,
        label: e => e.name, pri: e => e.dl ? Math.min(7, Math.log10(e.dl)) : 3, always: e => e.dl >= 1e6 && y <= e.e,
        title: e => `${e.name} · ${ctx.fmtSpan(e.s, e.e)}`, card: e => epiCard(ctx, e) });
    },

    here(ctx, at) {
      prep(ctx.data);
      const y = ctx.year, out = [];
      // Plague: one row per place nearby, its outbreak nearest this year.
      const byName = new Map();
      for (const o of ctx.near(OB, at)) {
        const b = byName.get(o.name);
        if (!b || Math.abs(o.y - y) < Math.abs(b.y - y)) byName.set(o.name, o);
      }
      const places = [...byName.values()].sort((a, b) => (AT.get(b.name).length - AT.get(a.name).length)).slice(0, 4);
      for (const o of places) {
        const n = AT.get(o.name).length;
        out.push({ title: `${o.name}: plague ${n} ${n === 1 ? "time" : "times"} recorded`, year: o.y, why: `${ctx.fmtYear(AT.get(o.name)[0])} to ${ctx.fmtYear(AT.get(o.name).at(-1))}`, card: obCard(ctx, o) });
      }
      for (const sp of SP) for (const s of ctx.near(sp.stops, at)) out.push({ title: `${short(sp)} reaches ${s.name}`, year: s.y, why: s.note || sp.what, card: stopCard(ctx, s) });
      for (const e of ctx.near(EPI, at).sort((a, b) => Math.abs(a.s - y) - Math.abs(b.s - y)).slice(0, 3)) out.push({ title: e.name, year: e.s, why: deaths(e), card: epiCard(ctx, e) });
      return out;
    },

    now(ctx) {
      prep(ctx.data);
      const y = ctx.year, out = [];
      const ob = BY_Y.get(y) || [];
      if (ob.length) {
        const top = ob.slice().sort((a, b) => AT.get(b.name).length - AT.get(a.name).length);
        out.push({ title: `Plague in ${ob.length} ${ob.length === 1 ? "place" : "places"} this year`, year: y,
          why: top.slice(0, 6).map(o => o.name).join(", ") + (ob.length > 6 ? " and more" : ""), card: obCard(ctx, top[0]) });
      }
      for (const sp of SP) for (const s of sp.stops.filter(s => s.y === y)) out.push({ title: `${short(sp)} reaches ${s.name}`, year: s.y, why: s.note || sp.what, card: stopCard(ctx, s) });
      for (const e of EPI.filter(e => y >= e.s && y <= e.e).sort((a, b) => (b.dl || 0) - (a.dl || 0)).slice(0, 4)) out.push({ title: e.name, year: e.s, why: deaths(e), card: epiCard(ctx, e) });
      return out;
    },

    strip: d => { prep(d); return PEAK.concat(SP.flatMap(sp => sp.stops.map(s => s.y)), EPI.filter(e => e.dl >= 1e5).map(e => e.s)); },
  });
})();
