// Art & architecture: styles are born somewhere and spread; each monument is one record with a year, a place and a source.
// On the map: monuments standing in ctx.year (curated ones always, Wikidata ones thinned by zoom), the birthplace of each
// living style, and lines from that birthplace to the style's key monuments built in the last two centuries.
(() => {
  const NOW = 2025;
  let D = null, S, F, MONS, BY_STYLE, INFL_IN, INFL_OUT;
  const prep = d => {
    if (D === d) return; D = d;
    F = d.families.map(([k, n, c]) => ({ k, n, c }));
    S = d.styles.map((s, i) => ({ ...s, i, fam: F[s.f] }));
    MONS = d.mons.map(([id, name, st, s, e, lat, lon, art, cur, what, sl, from, src, causes]) => ({
      id, name, st: st.map(i => S[i]), s, e, lat, lon, art: !!art, cur: !!cur, what, sl: sl || 0, from: from ?? s, causes,
      sources: Array.isArray(src) ? src.map(([cite, url]) => ({ cite, url })) : src ? [{ cite: "Wikidata " + src, url: "https://www.wikidata.org/wiki/" + src }] : [],
    }));
    BY_STYLE = S.map(() => []);
    for (const m of MONS) for (const s of m.st) BY_STYLE[s.i].push(m);
    for (const l of BY_STYLE) l.sort((a, b) => a.from - b.from || b.cur - a.cur || b.sl - a.sl);
    INFL_IN = S.map(() => []); INFL_OUT = S.map(() => []);
    for (const [a, b, c, note] of d.infl) { INFL_IN[b].push({ s: S[a], c, note }); INFL_OUT[a].push({ s: S[b], c, note }); }
  };
  const live = (s, y) => y >= s.s && y <= (s.e ?? NOW);
  const standing = (m, y) => y >= m.from && (m.e == null || y < m.e);
  const styleNames = m => m.st.map(s => s.n).join(" · ");

  function styleCard(ctx, s) {
    const key = BY_STYLE[s.i].filter(m => m.cur).slice(0, 8).map(m => `${m.name} (${ctx.fmtYear(m.s)})`).join("; ");
    const inn = INFL_IN[s.i].map(o => o.s.n), out = INFL_OUT[s.i].map(o => o.s.n);
    return {
      kick: `Style · ${s.fam.n}`, title: s.n, year: s.s, lon: s.lon, lat: s.lat,
      meta: `${ctx.fmtSpan(s.s, s.e)}${s.a ? " (start approximate)" : ""} · began in ${s.o} · ${BY_STYLE[s.i].length} buildings and works on the map`,
      body: `${s.w} How it spread: ${s.sp}${key ? ` Key works: ${key}.` : ""}`,
      why: `${s.y}${inn.length ? ` Shaped by ${inn.join(", ")}.` : ""}${out.length ? ` Went on to shape ${out.join(", ")}.` : ""}`,
      sources: s.src.map(([cite, url]) => ({ cite, url })),
      line: BY_STYLE[s.i].filter(m => m.cur).map(m => [m.lon, m.lat]),
    };
  }
  function monCard(ctx, m) {
    const y = ctx.year, kind = m.art ? "Work of art" : "Building";
    const life = m.e != null ? `${m.art ? "made" : "built"} ${ctx.fmtYear(m.s)}, gone ${ctx.fmtYear(m.e)}${m.causes ? ` (${m.causes.join(", ")})` : ""}` : `${m.art ? "made" : "built"} ${ctx.fmtYear(m.s)}, still ${m.art ? "survives" : "standing"}`;
    const st = m.st[0];
    return {
      kick: `${kind} · ${styleNames(m)}`, title: m.name, year: m.from, lon: m.lon, lat: m.lat,
      meta: `${life}${m.from !== m.s ? ` · in this style from about ${ctx.fmtYear(m.from)}` : ""}${!m.cur && m.what ? " · " + m.what : ""}`,
      body: m.cur ? m.what : `Tagged ${styleNames(m)} on Wikidata (${m.sl} language editions).`,
      why: st ? `${st.n}: ${st.w}` : "",
      sources: m.sources,
    };
  }

  ATLAS.lens({
    id: "art", name: "Art & architecture", family: "mind", color: "#a8577a", on: false,
    guide: ["art", "architecture"],
    index: d => { prep(d); return S.map(s => `${s.id} ${s.n} (${s.fam.n}) ${s.s} to ${s.e ?? "now"}, from ${s.o}`).join("\n"); },

    draw(ctx) {
      prep(ctx.data);
      const y = ctx.year, k = ctx.k || 1;
      const famC = m => m.st[0] ? m.st[0].fam.c : "#a8577a";
      // Spread: from a style's birthplace to each key monument built in the last 200 years; the newest lines are bold.
      const born = S.filter(s => live(s, y)), legs = [];
      for (const s of born.concat(S.filter(s => !live(s, y) && s.e != null && y - s.e < 150)))
        for (const m of BY_STYLE[s.i]) if (m.cur && m.from <= y && y - m.from < 200 && (Math.abs(m.lon - s.lon) > 0.05 || Math.abs(m.lat - s.lat) > 0.05))
          legs.push({ id: s.id + ">" + m.id, s, m, age: y - m.from });
      ctx.paths(legs, { key: l => l.id, coords: l => [[l.s.lon, l.s.lat], [l.m.lon, l.m.lat]], cls: "art-spread",
        title: l => `${l.s.n}: ${l.s.o} to ${l.m.name}, ${ctx.fmtYear(l.m.from)}`, card: l => monCard(ctx, l.m) })
        .style("--c", l => l.x.s.fam.c).style("stroke-width", l => l.x.age < 40 ? "1.8px" : "1px")
        .style("stroke-opacity", l => Math.max(0.15, 0.8 - l.x.age / 250)).style("stroke-dasharray", l => l.x.age < 40 ? null : "3 3");
      // Monuments standing now: every curated one, plus the best-known Wikidata buildings for this zoom (new ones first).
      const cap = Math.round(25 * Math.pow(k, 1.4));
      const cur = MONS.filter(m => m.cur && standing(m, y));
      const wd = MONS.filter(m => !m.cur && standing(m, y)).sort((a, b) => ((y - b.from < 50) - (y - a.from < 50)) || b.sl - a.sl).slice(0, cap);
      const mon = (list, shape) => ctx.pins(list, { key: m => m.id, shape, cls: "art-mon", label: m => m.name,
        title: m => `${m.name} · ${styleNames(m)} · ${ctx.fmtYear(m.s)}`, card: m => monCard(ctx, m) })
        .style("--c", famC).classed("always", m => m.cur && y - m.from < 40).style("opacity", m => m.cur ? 1 : 0.7);
      mon(wd, "circle");
      mon(cur.filter(m => !m.art), "triangle");
      mon(cur.filter(m => m.art), "square");
      // Birthplaces of the styles alive this year, labelled.
      ctx.pins(born, { key: s => "style:" + s.id, shape: "diamond", cls: "art-style", always: true, label: s => s.n.split(" (")[0],
        title: s => `${s.n} · ${s.fam.n} · ${ctx.fmtSpan(s.s, s.e)}`, card: s => styleCard(ctx, s) }).style("--c", s => s.fam.c);
    },

    here(ctx, at) {
      prep(ctx.data);
      const y = ctx.year;
      const ms = ctx.near(MONS, at).sort((a, b) => (standing(b, y) - standing(a, y)) || (b.cur - a.cur) || b.sl - a.sl).slice(0, 8);
      const ss = ctx.near(S, at).slice(0, 2);
      return [
        ...ss.map(s => ({ title: `${s.n} begins here`, year: s.s, why: s.w, card: styleCard(ctx, s) })),
        ...ms.map(m => ({ title: m.name + (standing(m, y) ? "" : m.from > y ? " (not built yet)" : " (gone)"), year: m.s, why: styleNames(m), card: monCard(ctx, m) })),
      ];
    },

    now(ctx) {
      prep(ctx.data);
      const y = ctx.year;
      const born = S.filter(s => Math.abs(s.s - y) <= 30).map(s => ({ title: `${s.n} begins in ${s.o}`, year: s.s, why: s.w, card: styleCard(ctx, s) }));
      const rising = MONS.filter(m => Math.abs(m.from - y) <= 15).sort((a, b) => (b.cur - a.cur) || b.sl - a.sl || Math.abs(a.from - y) - Math.abs(b.from - y)).slice(0, 5)
        .map(m => ({ title: m.from !== m.s ? `${m.name} is rebuilt as ${styleNames(m)}` : `${m.name} ${m.art ? "is made" : "is begun"}`, year: m.from, why: styleNames(m), card: monCard(ctx, m) }));
      const lost = MONS.filter(m => m.e != null && Math.abs(m.e - y) <= 15 && m.e < NOW).sort((a, b) => (b.cur - a.cur) || b.sl - a.sl).slice(0, 2)
        .map(m => ({ title: `${m.name} is lost`, year: m.e, why: m.causes ? m.causes.join(", ") : styleNames(m), card: monCard(ctx, m) }));
      const living = S.filter(s => live(s, y)).length;
      return [...born, ...rising, ...lost, ...(living ? [{ title: `${living} ${living === 1 ? "style" : "styles"} alive`, year: y, why: S.filter(s => live(s, y)).map(s => s.n).join(", ") }] : [])].slice(0, 9);
    },

    strip: d => { prep(d); return S.map(s => s.s).concat(MONS.filter(m => m.cur).map(m => m.s)); },
  });
})();
