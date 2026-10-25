// Peoples & languages: who spoke what, where, and how we know.
// Language dots (Glottolog) coloured by family; family spreads with their competing homeland theories;
// scripts and the script they came from; first writings, last speakers, script reforms;
// ancient genomes (AADR) near the year; and what ancient DNA showed about who moved where.
(function () {
  const AES = ["not endangered", "threatened", "shifting", "moribund", "nearly extinct", "extinct"];
  const NOW = 2026, OTHER = "#9a9286";
  let prep = null;
  // Index the compact rows once.
  function setup(D) {
    if (prep) return prep;
    const fams = (D.fams || []).map(([id, name, n, color]) => ({ id, name, n, color: color || OTHER }));
    const langs = (D.langs || []).map(([lon, lat, f, b, aes, s, e, name, code]) => ({ lon, lat, f, b, aes, s, e, name, code }));
    const famById = Object.fromEntries(fams.map(f => [f.id, f]));
    const scripts = D.scripts || [], byScript = Object.fromEntries(scripts.map(s => [s.id, s]));
    const dna = (D.dna || []).map(([lon, lat, y, g, p]) => ({ lon, lat, y, g, p }));
    dna.sort((a, b) => a.y - b.y);
    return prep = { fams, langs, famById, scripts, byScript, dna, spread: D.spread || [], events: D.events || [], findings: D.findings || [] };
  }
  const src = s => (s || []).map(x => ({ cite: x.cite, url: x.url }));
  // A language is on the map when it is written that year, or (for living languages and the recently dead)
  // after 1500, when Glottolog's "where it is spoken" locations start to mean something.
  function langOn(l, y) {
    if (l.s != null) return y >= l.s && y <= (l.e ?? NOW) + 50;
    if (l.aes === 5) return l.e != null ? y >= 1500 && y <= l.e : false;
    return y >= 1500;
  }
  // DNA samples are thin in time, so look wider the further back we go.
  const dnaWindow = y => Math.max(100, Math.min(3000, Math.round(Math.abs(NOW - y) * 0.06)));
  function dnaNear(P, y) {
    const w = dnaWindow(y), lo = y - w, hi = y + w, out = [];
    let a = 0, b = P.dna.length;
    while (a < b) { const m = (a + b) >> 1; if (P.dna[m].y < lo) a = m + 1; else b = m; }
    for (let i = a; i < P.dna.length && P.dna[i].y <= hi; i++) out.push(P.dna[i]);
    return out;
  }
  const stagesBy = (sp, y) => (sp.stages || []).filter(s => s.year <= y).sort((a, b) => a.year - b.year);
  const spreadOn = (sp, y) => y >= sp.start && y <= (sp.end ?? NOW) + 300;
  const famColor = (P, id) => (P.famById[id] || {}).color || OTHER;
  const scriptOn = (s, y) => y >= s.start && y <= (s.end ?? NOW);
  const findingOn = (f, y) => y >= f.start - 100 && y <= (f.end ?? f.start) + 150;
  const eventOn = (e, y) => e.subtype === "attestation" ? y >= e.start && y <= (e.end ?? NOW) && y - e.start < 300 : Math.abs(y - e.start) <= 15;
  const EV_KICK = { attestation: "First written", language_death: "Last speaker", script_reform: "Script change" };

  const spreadCard = (sp, P, y) => {
    const reached = stagesBy(sp, y), last = reached[reached.length - 1];
    const hyp = (sp.hypotheses || []).map(h => `${h.view} (${h.strength}): ${h.claim} For: ${h.for}${h.against ? " Against: " + h.against : ""}`).join("\n\n");
    return {
      kick: "Language family", title: sp.name, year: sp.start, lon: (last || sp).lon, lat: (last || sp).lat,
      meta: `${fmt(sp.start)} onward${last ? ` · by ${fmt(y)} reached ${last.name}` : ""}`,
      body: `${sp.what}${last && last.note ? "\n\n" + fmt(last.year) + ": " + last.note : ""}\n\nWhere it began, competing views:\n\n${hyp}`,
      why: sp.why, sources: src(sp.sources), line: reached.length ? [[sp.lon, sp.lat], ...reached.map(s => [s.lon, s.lat])] : undefined,
    };
  };
  const scriptCard = (s, P) => {
    const p = s.parent && P.byScript[s.parent];
    return { kick: "Script", title: s.name, year: s.start, lon: s.lon, lat: s.lat,
      meta: `${fmt(s.start)}–${s.end == null ? "in use today" : fmt(s.end)} · ${s.origin}${p ? ` · from ${p.name}` : " · invented independently"}${s.iso ? " · ISO " + s.iso : ""}`,
      body: s.what, why: s.why, sources: src(s.sources), line: p ? [[p.lon, p.lat], [s.lon, s.lat]] : undefined };
  };
  const eventCard = e => ({ kick: EV_KICK[e.subtype] || "Language", title: e.name, year: e.start, lon: e.lon, lat: e.lat,
    meta: e.subtype === "attestation" ? `written ${fmt(e.start)}–${e.end == null ? "today" : fmt(e.end)}` : fmt(e.start), body: e.what, why: e.why, sources: src(e.sources) });
  const findingCard = f => ({ kick: "Ancient DNA", title: f.name, year: f.start, lon: f.lon, lat: f.lat,
    meta: `${fmt(f.start)}${f.end != null && f.end !== f.start ? "–" + fmt(f.end) : ""}${f.ancestry_share ? ` · ancestry share ${f.ancestry_share[0] === f.ancestry_share[1] ? "about " + f.ancestry_share[0] : f.ancestry_share[0] + "–" + f.ancestry_share[1]}%` : ""}`,
    body: f.what, why: f.why, sources: src(f.sources) });
  const langCard = (l, P) => {
    const f = P.fams[l.f];
    return { kick: "Language", title: l.name, lon: l.lon, lat: l.lat,
      meta: `${f ? f.name : "isolate or unclassified"}${l.aes >= 0 ? " · " + AES[l.aes] : ""}${l.s != null ? ` · written ${fmt(l.s)}–${l.e == null ? "today" : fmt(l.e)}` : l.e != null ? ` · last recorded ${fmt(l.e)}` : ""}`,
      body: `Glottolog ${l.code}. The point marks where it is (or was last) spoken.`,
      sources: [{ cite: "Glottolog 5 (Hammarström, Forkel, Haspelmath and Bank), CC BY 4.0", url: "https://glottolog.org/resource/languoid/id/" + l.code }] };
  };
  let fmt = y => String(y);

  ATLAS.lens({
    id: "peoples",
    name: "Peoples & languages",
    family: "peoples",
    color: "#3f9c8f",
    on: false,
    guide: ["language"],
    index: D => {
      const P = setup(D);
      return [
        "Language family spreads (event ids; each has competing homeland views and dated stages): " + P.spread.map(s => `${s.id} ${s.name} from ${s.start}`).join("; "),
        "Ancient DNA findings: " + P.findings.map(f => `${f.id} ${f.name} (${f.start})`).join("; "),
        "Scripts (origin year, parent): " + P.scripts.map(s => `${s.name} ${s.start}${s.parent ? " < " + (P.byScript[s.parent] || {}).name : ""}`).join("; "),
        "First writings, last speakers, script reforms: " + P.events.map(e => `${e.name} ${e.start}`).join("; "),
        `Also on the map: ${P.langs.length} languages (Glottolog) coloured by family, ${P.dna.length} dated ancient genomes (AADR v54.1).`,
      ].join("\n");
    },

    draw(ctx) {
      fmt = ctx.fmtYear;
      const P = setup(ctx.data), y = ctx.year, k = ctx.k, proj = ctx.projection;
      // Dense dots: one path per colour, so 8,000 languages cost about twenty DOM nodes.
      let dots = ctx.g.select("g.pl-dots");
      if (dots.empty()) dots = ctx.g.insert("g", ":first-child").attr("class", "pl-dots").style("pointer-events", "none");
      const r = 1.6 / Math.pow(k, 0.75), byColor = new Map();
      const circle = (p, rr) => `M${(p[0] - rr).toFixed(2)},${p[1].toFixed(2)}a${rr},${rr} 0 1,0 ${2 * rr},0a${rr},${rr} 0 1,0 ${-2 * rr},0`;
      for (const l of P.langs) {
        if (!langOn(l, y)) continue;
        const p = proj([l.lon, l.lat]); if (!p) continue;
        const c = l.aes === 5 ? "dead" : (P.fams[l.f] || {}).color || OTHER;
        (byColor.get(c) || byColor.set(c, []).get(c)).push(circle(p, (l.s != null ? 2 : 1.15) * r));
      }
      const dd = [...byColor].map(([c, ds]) => ({ c, d: ds.join("") }));
      dots.selectAll("path.pl-lang").data(dd, d => d.c).join("path").attr("class", "pl-lang").attr("d", d => d.d)
        .attr("fill", d => d.c === "dead" ? "none" : d.c).attr("stroke", d => d.c === "dead" ? "#7a6f63" : "none")
        .attr("stroke-width", r * 0.6).attr("opacity", y >= 1500 ? Math.min(0.85, 0.35 + (y - 1500) / 600) : 0.9);
      // Ancient genomes near this year: small dark rings, brighter the closer in time.
      const dn = dnaNear(P, y), w = dnaWindow(y), rd = r * 1.4;
      const near = dn.filter(s => Math.abs(s.y - y) <= w / 2), far = dn.filter(s => Math.abs(s.y - y) > w / 2);
      dots.selectAll("path.pl-dna").data([{ id: "far", s: far, o: 0.35 }, { id: "near", s: near, o: 0.9 }], d => d.id).join("path").attr("class", "pl-dna")
        .attr("d", d => d.s.map(s => { const p = proj([s.lon, s.lat]); return p ? circle(p, rd) : ""; }).join(""))
        .attr("fill", "none").attr("stroke", "#1f5f73").attr("stroke-width", rd * 0.7).attr("opacity", d => d.o);

      // Family spreads: homeland, then each stage reached by this year.
      // After 1500 the language dots show where families ended up, so only draw a spread while it is still moving.
      const sps = P.spread.filter(s => spreadOn(s, y) && (y < 1500 || stagesBy(s, y).some(st => y - st.year < 300)));
      ctx.paths(sps.map(sp => ({ sp, pts: [[sp.lon, sp.lat], ...stagesBy(sp, y).map(s => [s.lon, s.lat])] })), {
        key: o => o.sp.id, coords: o => o.pts, cls: "pl-spread", title: o => o.sp.name, card: o => spreadCard(o.sp, P, y) })
        .style("--c", r => famColor(P, r.x.sp.language));
      const fronts = sps.map(sp => { const st = stagesBy(sp, y), last = st[st.length - 1]; return { sp, id: sp.id, lon: (last || sp).lon, lat: (last || sp).lat, fresh: last && y - last.year < 150 }; });
      ctx.pins(fronts, { key: o => o.id, shape: "circle", always: true, label: o => o.sp.name.replace(/ spread$/, ""), cls: "pl-front",
        title: o => `${o.sp.name}: ${stagesBy(o.sp, y).map(s => s.name).pop() || "homeland"}`, card: o => spreadCard(o.sp, P, y) })
        .style("--c", o => famColor(P, o.sp.language)).classed("fresh", o => o.fresh);

      // Scripts in use, and the line back to the script each came from (for a century after its birth).
      const sc = P.scripts.filter(s => scriptOn(s, y));
      ctx.paths(sc.filter(s => s.parent && P.byScript[s.parent] && y - s.start < 150).map(s => ({ s, p: P.byScript[s.parent] })), {
        key: o => o.s.id, coords: o => [[o.p.lon, o.p.lat], [o.s.lon, o.s.lat]], cls: "pl-script-line", title: o => `${o.s.name} from ${o.p.name}`, card: o => scriptCard(o.s, P) });
      ctx.pins(sc, { key: s => s.id, shape: "diamond", label: s => s.name, title: s => `${s.name} · ${fmt(s.start)} · ${s.origin}`, card: s => scriptCard(s, P) });

      ctx.pins(P.events.filter(e => eventOn(e, y)), { key: e => e.id, shape: "square", label: e => e.name,
        title: e => `${e.name} · ${fmt(e.start)}`, card: eventCard });
      ctx.pins(P.findings.filter(f => findingOn(f, y)), { key: f => f.id, shape: "triangle", always: true, label: f => f.name,
        title: f => `${f.name} · ${fmt(f.start)}`, card: findingCard });
    },

    here(ctx, at) {
      fmt = ctx.fmtYear;
      const P = setup(ctx.data), y = ctx.year, rows = [];
      for (const f of ctx.near(P.findings.filter(f => findingOn(f, y) || Math.abs(f.start - y) < 500), at, Math.max(at.r, 800)))
        rows.push({ title: f.name, tag: "ancient DNA", year: f.start, why: f.what, card: findingCard(f) });
      for (const sp of P.spread.filter(s => spreadOn(s, y))) {
        const pts = [{ lon: sp.lon, lat: sp.lat, name: "homeland" }, ...stagesBy(sp, y)];
        const hit = ctx.near(pts, at, Math.max(at.r, 600))[0];
        if (hit) rows.push({ title: sp.name, tag: "family", year: hit.year ?? sp.start, why: hit.note || sp.what, card: spreadCard(sp, P, y) });
      }
      for (const s of ctx.near(P.scripts.filter(s => scriptOn(s, y)), at)) rows.push({ title: s.name, tag: "script", year: s.start, why: s.what, card: scriptCard(s, P) });
      for (const e of ctx.near(P.events.filter(e => Math.abs(e.start - y) < 200 || eventOn(e, y)), at)) rows.push({ title: e.name, tag: EV_KICK[e.subtype], year: e.start, why: e.what, card: eventCard(e) });
      // Ancient genomes nearby, grouped by the archaeologists' group label.
      const dn = ctx.near(dnaNear(P, y), at), groups = new Map();
      for (const s of dn) { const g = groups.get(s.g) || groups.set(s.g, { n: 0, y0: s.y, y1: s.y, p: new Set(), s }).get(s.g); g.n++; g.y0 = Math.min(g.y0, s.y); g.y1 = Math.max(g.y1, s.y); g.p.add(s.p); }
      for (const [gi, g] of [...groups].sort((a, b) => b[1].n - a[1].n).slice(0, 3)) {
        const name = ctx.data.groups[gi], papers = [...g.p].map(i => ctx.data.pubs[i]).map(([cite, url]) => ({ cite, url }));
        rows.push({ title: `${g.n} ancient genome${g.n > 1 ? "s" : ""}: ${name.replace(/_/g, " ")}`, tag: "AADR", year: g.y0, dim: true,
          why: `Dated ${fmt(g.y0)}${g.y1 !== g.y0 ? "–" + fmt(g.y1) : ""}.`,
          card: { kick: "Ancient genomes", title: name.replace(/_/g, " "), year: g.y0, lon: g.s.lon, lat: g.s.lat, meta: `${g.n} individuals within ${at.r} km, dated ${fmt(g.y0)}–${fmt(g.y1)}`,
            body: "Group labels are the AADR's: country, period and culture. The genomes themselves are in the papers below.", sources: [...papers, { cite: "Mallick and Reich, Allen Ancient DNA Resource v54.1.p1 (2023)", url: "https://doi.org/10.7910/DVN/FFIDCW" }] } });
      }
      const ls = ctx.near(P.langs.filter(l => langOn(l, y)), at).slice(0, 4);
      for (const l of ls) rows.push({ title: l.name, tag: (P.fams[l.f] || {}).name || "isolate", year: l.s ?? undefined, why: l.aes >= 0 ? AES[l.aes] : "", card: langCard(l, P), dim: true });
      return rows;
    },

    now(ctx) {
      fmt = ctx.fmtYear;
      const P = setup(ctx.data), y = ctx.year, rows = [];
      for (const f of P.findings.filter(f => findingOn(f, y))) rows.push({ title: f.name, tag: "ancient DNA", year: f.start, why: f.why, card: findingCard(f) });
      for (const sp of P.spread.filter(s => spreadOn(s, y))) {
        const st = stagesBy(sp, y), last = st[st.length - 1];
        if (last && y - last.year < 300) rows.push({ title: `${sp.name.replace(/ spread$/, "")} reaches ${last.name}`, tag: "family", year: last.year, why: last.note || sp.why, card: spreadCard(sp, P, y) });
      }
      for (const e of P.events.filter(e => Math.abs(e.start - y) <= 25)) rows.push({ title: e.name, tag: EV_KICK[e.subtype], year: e.start, why: e.what, card: eventCard(e) });
      for (const s of P.scripts.filter(s => s.start <= y && y - s.start < 60)) rows.push({ title: `New script: ${s.name}`, tag: "script", year: s.start, why: s.why, card: scriptCard(s, P) });
      return rows;
    },

    strip: D => [...(D.findings || []).map(f => f.start), ...(D.events || []).map(e => e.start), ...(D.scripts || []).map(s => s.start), ...(D.spread || []).map(s => s.start)],
  });
})();
