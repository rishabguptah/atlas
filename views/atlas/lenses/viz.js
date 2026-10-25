// The data grammar's page side (views/atlas/VIZ.md): a choropleth lens, chart cards and the This year strip.
//   - "Colour states by" (Power): fragility, growing or shrinking, or age, dithered into a monochrome relief (PixelGrammar.thematic)
//   - ATLAS.cardViz: a city's population lifeline and rank, a state's size and fragility lifelines, who held a chokepoint,
//     a migration's size against the others, a shock's toll against the others
//   - ATLAS.nowViz: four stat tiles with lifelines through all of history, the current year marked
// The Compare tab lives in compare.js. Charts come from views/pixel/charts.js (AtlasCharts).
(function () {
  if (typeof AtlasCharts === "undefined") return;
  const C = AtlasCharts, GR = typeof PixelGrammar !== "undefined" ? PixelGrammar : null;
  const fam = f => `var(--fam-${f})`;
  const stepAt = (s, y) => { if (!s || !s.length || y < s[0][0]) return null; let v = null; for (const [yy, x] of s) { if (yy <= y) v = x; else break; } return v; };
  const nearestGap = (s, y) => { if (!s || !s.length) return Infinity; let d = Infinity; for (const [yy] of s) d = Math.min(d, Math.abs(yy - y)); return d; };
  const pct = v => Math.round(v * 100) + "%";

  // ---------- realms -> Order & chaos records ----------
  // Cliopatria realm ids are longer than the lab's ("ottoman_empire" vs "ottoman"): match on id, Wikipedia title, then a bare name.
  let BY_ID = null, BY_NAME = null, BY_WIKI = null;
  const bare = s => String(s || "").toLowerCase().replace(/[()]/g, "").replace(/^(the|kingdom of|empire of|sultanate of|khanate of|principality of|grand duchy of|duchy of)\s+/, "")
    .replace(/\s+(empire|dynasty|sultanate|khanate|kingdom|caliphate|state|states|confederation|period|realm)$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  function index() {
    if (BY_ID || typeof ORDER === "undefined") return;
    BY_ID = new Map(); BY_NAME = new Map(); BY_WIKI = new Map();
    for (const p of ORDER.polities) {
      BY_ID.set(String(p.id).replace(/^polity:/, ""), p);
      if (!BY_NAME.has(bare(p.n))) BY_NAME.set(bare(p.n), p);
      if (p.wiki) BY_WIKI.set(String(p.wiki).toLowerCase().replace(/_/g, " "), p);
    }
  }
  const memo = new WeakMap();
  function polityOf(r) {
    index(); if (!BY_ID || !r) return null;
    if (memo.has(r)) return memo.get(r);
    const id = String(r.id || ""), p = BY_ID.get(id) || (r.wiki && BY_WIKI.get(String(r.wiki).toLowerCase().replace(/_/g, " "))) || BY_NAME.get(bare(r.name))
      || BY_ID.get(id.replace(/_(empire|dynasty|sultanate|khanate|kingdom|caliphate)$/, "")) || BY_NAME.get(bare(id.replace(/_/g, " "))) || null;
    memo.set(r, p);
    return p;
  }

  // ---------- the three choropleths ----------
  const METRICS = {
    risk: {
      name: "Fragility", ramp: "risk", about: "Risk of breaking apart within 25 years, from the Order & chaos lab (territory alone).",
      labels: () => { const t = ORDER.thr; return [`< ${pct(t * 0.5)}`, pct(t * 0.5), pct(t), pct(t * 1.6), `> ${pct(t * 2.4)}`]; },
      ends: ["calm", "about to break"],
      value: (p, y) => stepAt(p.f, y),
      step(p, y) { const f = stepAt(p.f, y), t = ORDER.thr; if (f == null) return -1; return f < t * 0.5 ? 0 : f < t ? 1 : f < t * 1.6 ? 2 : f < t * 2.4 ? 3 : 4; },
      conf: (p, y) => nearestGap(p.f, y) > 30 ? 1 : 0,
      fmt: v => pct(v),
    },
    change: {
      name: "Growing or shrinking", ramp: "change", about: "Change in territory over the last 25 years, measured on the drawn borders (Seshat Cliopatria). New within 25 years counts as growing.",
      // Every realm on the map, measured from its own border geometry; the lab's area series when the earlier frame is not loaded.
      realm(r, y) {
        const now = areas(y), then = areas(y - 25);
        if (now && then && r.id != null && now.has(r.id)) { const a = now.get(r.id), b = then.get(r.id); return b ? a / b - 1 : Infinity; }
        const p = polityOf(r); return p ? this.value(p, y) : null;
      },
      labels: () => ["−30% or more", "−5 to −30%", "steady", "+5 to +30%", "+30% or more"],
      ends: ["shrinking", "growing"],
      value: (p, y) => { const a = stepAt(p.a, y), b = stepAt(p.a, y - 25); return a == null ? null : b == null || !(b > 0) ? Infinity : a / b - 1; },
      step(p, y) { const c = this.value(p, y); if (c == null) return -1; return c <= -0.3 ? 0 : c <= -0.05 ? 1 : c < 0.05 ? 2 : c < 0.3 ? 3 : 4; },
      conf: () => 0,
      fmt: v => v === Infinity ? "new" : `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`,
    },
    age: {
      name: "Age", ramp: "age", about: "Years since the state first appears in Seshat Cliopatria.",
      labels: () => ["< 50 years", "50–150", "150–300", "300–600", "600+"],
      ends: ["young", "ancient"],
      value: (p, y) => y >= p.s ? y - p.s : null,
      step(p, y) { const a = this.value(p, y); if (a == null) return -1; return a < 50 ? 0 : a < 150 ? 1 : a < 300 ? 2 : a < 600 ? 3 : 4; },
      conf: p => p.s < -2500 ? 1 : 0,
      fmt: v => `${Math.round(v)} years`,
    },
  };
  // Area (km²) of every realm in the border frame for a year, by realm id, from the geometry itself; null until that chunk loads.
  const AREA = new WeakMap(), featArea = new WeakMap();
  function areas(y) {
    const B = ATLAS.borders, rs = B && B.realms ? B.realms(y, 1) : null; if (!rs || !rs.length) return null;
    let m = AREA.get(rs); if (m) return m;
    m = new Map();
    for (const r of rs) {
      let a = featArea.get(r.feature); if (a == null) { a = d3.geoArea(r.feature) * 6371 * 6371; if (a > 2.5e8) a = 0; featArea.set(r.feature, a); }
      m.set(r.id, (m.get(r.id) || 0) + a);
    }
    AREA.set(rs, m); return m;
  }
  ATLAS.vizAreas = areas;
  let metric = "change", hi = null, year = 2000, legend = null;
  try { const m = localStorage.getItem("atlas.thematic.v1"); if (METRICS[m]) metric = m; } catch (err) { /* private mode */ }
  function setThematic() {
    if (!GR) return;
    const M = METRICS[metric];
    GR.thematic = {
      key: metric + ":" + year, ramp: GR.RAMP[M.ramp], hi,
      active: () => !window.ATLAS.isOn || ATLAS.isOn("thematic"),
      step: r => {
        if (M.realm) { const c = M.realm(r, year); if (c == null) return -1; return c <= -0.3 ? 0 : c <= -0.05 ? 1 : c < 0.05 ? 2 : c < 0.3 ? 3 : 4; }
        const p = polityOf(r); if (!p) return -1; return M.step(p, year);
      },
      conf: r => { const p = polityOf(r); return p ? M.conf(p, year) : 0; },
    };
  }
  const repaint = () => { if (ATLAS.pixel && ATLAS.pixel.repaint) ATLAS.pixel.repaint(); };

  // ---------- the legend card on the map ----------
  const STYLE = `
.vz-legend { position: absolute; left: 12px; bottom: 12px; z-index: 6; background: var(--card, #fbf8ef); border: 3px solid #221f1a; box-shadow: 3px 3px 0 #221f1a; padding: 6px 8px 7px; max-width: 300px; }
.vz-legend[hidden] { display: none; }
.vz-legend .vz-k { margin-bottom: 2px; }
.vz-legend .tabs { display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }
.vz-legend .tabs button { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 14px; padding: 1px 5px; border: 2px solid #221f1a; background: transparent; cursor: pointer; text-transform: uppercase; }
.vz-legend .tabs button[aria-pressed="true"] { background: #221f1a; color: #f6f0dc; }
.vz-legend .ramp { display: grid; grid-template-columns: repeat(5, 1fr) 12px 1fr; gap: 2px; align-items: end; }
.vz-legend .sw { height: 15px; border: 2px solid #221f1a; cursor: pointer; image-rendering: pixelated; }
.vz-legend .sw.fog { background: repeating-conic-gradient(#b9ad92 0 25%, #f6f0dc 0 50%) 0 0 / 6px 6px; }
.vz-legend .sw:hover, .vz-legend .sw.on { outline: 2px solid var(--accent, #1d4f6e); outline-offset: 1px; }
.vz-legend .lab { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 9px; color: var(--ink-soft); text-align: center; overflow-wrap: anywhere; }
.vz-legend .ends { display: flex; justify-content: space-between; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; color: var(--ink); margin-top: 3px; grid-column: 1 / 6; }
.vz-legend p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.35; color: var(--ink-soft); }
`;
  function buildLegend() {
    if (legend) return legend;
    const map = document.querySelector(".map"); if (!map) return null;
    const st = document.createElement("style"); st.textContent = STYLE; document.head.appendChild(st);
    legend = document.createElement("div"); legend.className = "vz-legend"; legend.hidden = true;
    legend.addEventListener("click", ev => {
      const b = ev.target.closest("[data-m]"); if (b) { metric = b.dataset.m; hi = null; try { localStorage.setItem("atlas.thematic.v1", metric); } catch (err) { /* fine */ } setThematic(); renderLegend(); repaint(); return; }
      const s = ev.target.closest("[data-s]"); if (s) { const v = +s.dataset.s; hi = hi === v ? null : v; setThematic(); renderLegend(); repaint(); }
    });
    map.appendChild(legend);
    return legend;
  }
  function renderLegend() {
    const el = buildLegend(); if (!el) return;
    const M = METRICS[metric], ramp = GR.RAMP[M.ramp], labs = M.labels();
    el.innerHTML = `<span class="vz-k">Colour states by</span>
<div class="tabs">${Object.entries(METRICS).map(([k, m]) => `<button data-m="${k}" aria-pressed="${k === metric}">${m.name}</button>`).join("")}</div>
<div class="ramp">${ramp.map((c, i) => `<span class="sw${hi === i ? " on" : ""}" data-s="${i}" title="${labs[i]}" style="background:${c}"></span>`).join("")}<span></span><span class="sw fog" title="No record for this state"></span>
${labs.map(l => `<span class="lab">${l}</span>`).join("")}<span></span><span class="lab">no data</span>
<span class="ends"><span>◀ ${M.ends[0]}</span><span>${M.ends[1]} ▶</span></span></div>
<p>${M.about}${hi != null ? " Showing one step; tap it again for all." : " Tap a colour to pick out those states."}</p>`;
  }

  ATLAS.lens({
    id: "thematic", name: "Colour states by", family: "power", on: false, guide: ["order"],
    key: [["square", "Each state washed with one of five steps; fog stipple = no record"]],
    draw(ctx) {
      year = ctx.year;
      if (!GR || !ATLAS.pixel) { if (legend) legend.hidden = true; return; }
      setThematic();
      if (!legend || legend.hidden) { renderLegend(); legend.hidden = false; }
    },
    here(ctx, at) {
      index(); const p = at.polity && BY_NAME && BY_NAME.get(bare(at.polity)); if (!p) return [];
      return Object.values(METRICS).map(M => { const v = M.value(p, ctx.year); return v == null ? null : { title: `${p.n}: ${M.name.toLowerCase()} ${M.fmt(v)}`, why: M.about }; }).filter(Boolean);
    },
    now(ctx) {
      if (typeof ORDER === "undefined") return [];
      const y = ctx.year, M = METRICS.change;
      const list = ORDER.polities.filter(p => y >= p.s && y <= p.e).map(p => ({ p, c: M.value(p, y), a: stepAt(p.a, y) || 0 })).filter(o => o.c != null && o.c !== Infinity && o.a > 0.05);
      const up = list.filter(o => o.c > 0.05).sort((a, b) => b.c * b.a - a.c * a.a).slice(0, 3), down = list.filter(o => o.c < -0.05).sort((a, b) => a.c * a.a - b.c * b.a).slice(0, 3);
      return [...up.map(o => ({ title: `${o.p.n} growing`, tag: M.fmt(o.c), year: y, why: "Territory over the last 25 years" })),
        ...down.map(o => ({ title: `${o.p.n} shrinking`, tag: M.fmt(o.c), year: y, why: "Territory over the last 25 years" }))];
    },
  });
  // Off: clear the choropleth and hide the legend (the page only calls draw while the lens is on).
  const watchOff = () => { if (legend && window.ATLAS.isOn && !ATLAS.isOn("thematic") && !legend.hidden) { legend.hidden = true; repaint(); } };
  setInterval(watchOff, 400);

  // ---------- chart cards ----------
  ATLAS.cardViz = ATLAS.cardViz || [];
  // A city: its population through time (log scale), its rank among the cities of the same year, and when it lost or gained a tier.
  ATLAS.cardViz.push((c, X) => {
    const e = c.entry; if (!e || !X.POP[e.id]) return "";
    const s = X.POP[e.id], y = X.year, p = X.popAt(e, y);
    let rank = "";
    if (p) { const r = X.ENTRIES.filter(o => X.alive(o, y) && (X.popAt(o, y) || 0) > p).length + 1; rank = `#${r} of the cities on the map in ${X.fmtYear(y)}`; }
    const tierName = GR && p ? GR.TIER_NAME[GR.tier(p)] : "";
    return C.lifeline(s, { title: `Population${rank ? " · " + rank : ""}`, now: y, color: fam("land"), log: s.some(q => q[1] > 0) && Math.max(...s.map(q => q[1])) / Math.max(1, Math.min(...s.map(q => q[1]).filter(v => v > 0))) > 30,
      from: Math.min(s[0][0], e.start ?? s[0][0]), to: Math.max(s[s.length - 1][0], Math.min(2025, e.end ?? 2025)), alive: [e.start, e.end ?? 2025], fmt: C.compact, label: "people",
      marks: (X.EVENTS[e.id] || []).map(q => [q[0], q[1]]) }) + (tierName ? `<p class="vz-note">Size tier on the map: ${tierName}</p>` : "");
  });
  // A state: territory and fragility, both through its whole life.
  ATLAS.cardViz.push((c, X) => {
    const p = c.polity; if (!p) return "";
    let h = "";
    if (p.a && p.a.length > 1) h += C.lifeline(p.a, { title: "Territory, million km²", now: X.year, step: true, color: fam("power"), from: p.s, to: p.e, fmt: v => v.toFixed(2), unit: "M km²" });
    if (p.f && p.f.length > 1) h += C.lifeline(p.f, { title: `Fragility · ${X.fmtYear(X.year)}: ${X.band(X.fragAt(p, X.year))}`, now: X.year, color: fam("power"), from: p.s, to: p.e, fmt: pct, ymax: 2.2 * ORDER.thr,
      marks: [[p.e, "end"]] });
    return h;
  });
  // A chokepoint: who held it, as one strip.
  ATLAS.cardViz.push((c, X) => {
    if (c.kind !== "choke" || !c.holders || !c.holders.length) return "";
    return C.tenure(c.holders, { title: "Who held it", now: X.year, color: fam("power") });
  });
  // A migration: its size against every migration with a count (log scale), and how far it had got.
  ATLAS.cardViz.push((c, X) => {
    const m = c.flow; if (!m || c.kind !== "mig") return "";
    const others = X.MIGS.filter(o => o.low).sort((a, b) => b.high - a.high);
    let h = "";
    if (m.low) {
      const near = others.filter(o => o !== m).slice(0, 5).concat([m]).sort((a, b) => b.high - a.high);
      h += C.rangebar(near.map(o => ({ n: o.name, lo: o.low, hi: o.high, me: o === m })), { title: "People moved, against the largest others (log scale)", color: fam("peoples") });
      if (GR) h += `<p class="vz-note">On the map: ${GR.flowWidth(m.high || m.people)} px wide (one pixel per tenfold) · ${GR.CONF_NAME[m.high / m.low > 1.5 ? 1 : 0]}</p>`;
    } else h += `<p class="vz-note">No count in the sources: drawn as a thin ${m.start < -3000 ? "fog-dotted" : "dashed"} thread, not a ribbon.</p>`;
    return h;
  });
  // A plague, famine or eruption: its toll against the deadliest others.
  ATLAS.cardViz.push((c, X) => {
    const e = c.shock; if (!e || !e.deaths) return "";
    const list = X.SHOCKS.filter(o => o.deaths && o.deaths[0] > 0).sort((a, b) => b.deaths[1] - a.deaths[1]);
    const rows = list.filter(o => o !== e).slice(0, 5).concat([e]).sort((a, b) => b.deaths[1] - a.deaths[1]);
    return C.rangebar(rows.map(o => ({ n: o.name, lo: o.deaths[0], hi: o.deaths[1], me: o === e })), { title: "Deaths, against the deadliest others (log scale)", color: fam("shocks") });
  });

  // ---------- This year: a strip of stat tiles ----------
  let SER = null;
  function series(X) {
    if (SER) return SER;
    const years = []; for (let y = -3000; y <= 2025; y += 25) years.push(y);
    const states = years.map(y => [y, X.POLS.filter(p => X.polAlive(p, y)).length]);
    const top = years.map(y => { let best = 0; for (const e of X.ENTRIES) { if (!X.alive(e, y)) continue; const p = X.popAt(e, y); if (p > best) best = p; } return [y, best]; }).filter(q => q[1] > 0);
    const dec = []; for (let y = -1000; y <= 2020; y += 10) dec.push([y, X.battlesNear(y + 5, 5).length]);
    const moving = years.filter(y => y >= -1000).map(y => [y, X.MIGS.filter(m => m.people && y >= m.start && y <= m.end).reduce((s, m) => s + m.people / Math.max(1, (m.end - m.start) / 25), 0)]);
    return SER = { states, top, dec, moving };
  }
  ATLAS.nowViz = ATLAS.nowViz || [];
  ATLAS.nowViz.push(X => {
    const S = series(X), y = X.year;
    const nStates = X.POLS.filter(p => X.polAlive(p, y)).length;
    let big = null; for (const e of X.ENTRIES) { if (!X.alive(e, y)) continue; const p = X.popAt(e, y); if (p && (!big || p > big.p)) big = { e, p }; }
    const b10 = X.battlesNear(y, 5).length;
    const mv = X.MIGS.filter(m => m.people && y >= m.start && y <= m.end);
    return C.tiles([
      { label: "States", value: String(nStates), note: "Order & chaos lab", spark: S.states, now: y, color: fam("power"), step: true },
      big && { label: "Biggest city", value: C.compact(big.p), note: X.nameAt(big.e, y), spark: S.top, now: y, color: fam("land"), log: true },
      { label: "Battles ±5 yrs", value: String(b10), note: "curated + Wikidata", spark: S.dec.filter(q => q[0] >= -1000), now: y >= -1000 ? y : null, color: fam("power") },
      { label: "On the move", value: mv.length ? C.compact(mv.reduce((s, m) => s + m.people, 0)) : "–", note: mv.length ? `${mv.length} counted migration${mv.length > 1 ? "s" : ""}` : "no counted migration", spark: S.moving, now: y >= -1000 ? y : null, color: fam("peoples") },
    ]);
  });
})();
