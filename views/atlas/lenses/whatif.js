// Simulate & predict: the "What if" tab and its map layer.
// Simulate plays a curated what-if (data/whatif/scenarios/*.json): real history up to the turning point,
// then the branch, each branch step marked speculative with a plausibility score. Live what-ifs use the
// viewer's Claude. Predict stands in a year, shows which states the Order and Chaos model flags as likely
// to break within 50 years, then fast-forwards to score it. Data: views/atlas/lenses/whatif.py + ORDER.
(function () {
  const W = { mode: "sim", sc: null, i: -1, fc: null, playing: false };
  let api = null, el = null;
  const D = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.whatif) || { scenarios: [], bt: null };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100) + "%";
  const fy = y => api ? api.fmtYear(y) : String(y);
  const LAST = 2024;  // Cliopatria's last year: breaks after this are not in the data yet

  const css = document.createElement("style");
  css.textContent = `
.wf { display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.wf .seg { display: flex; gap: 0; border: 1px solid var(--rule); border-radius: 999px; overflow: hidden; width: max-content; }
.wf .seg button { border: 0; background: transparent; padding: 6px 16px; cursor: pointer; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
.wf .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.wf .lede { font-size: 14.5px; margin: 0; color: var(--ink-soft); }
.wf h2 { font-family: var(--fell); font-weight: 400; font-size: 21px; line-height: 1.2; margin: 0; }
.wf h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 4px 0 0; }
.wf .sc { all: unset; box-sizing: border-box; cursor: pointer; border: 1px solid var(--rule); border-left: 4px solid var(--y-whatif); background: var(--card); border-radius: 3px; padding: 9px 12px; display: grid; gap: 4px; }
.wf .sc:hover, .wf .sc:focus-visible { border-color: var(--y-whatif); }
.wf .sc b { font-family: var(--fell); font-weight: 400; font-size: 16.5px; line-height: 1.25; }
.wf .sc .meta { display: flex; gap: 10px; align-items: center; font-family: var(--mono); font-size: 11px; color: var(--ink-soft); }
.wf .pl { display: inline-flex; align-items: center; gap: 6px; }
.wf .pl .bar { width: 60px; height: 6px; border-radius: 3px; background: var(--wash); overflow: hidden; display: inline-block; }
.wf .pl .bar i { display: block; height: 100%; background: var(--y-whatif); }
.wf .tagr, .wf .tagb { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; border-radius: 3px; padding: 1px 6px; }
.wf .tagr { background: var(--wash); color: var(--ink); }
.wf .tagb { border: 1px dashed var(--y-whatif); color: var(--y-whatif); }
.wf .badge2 { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px dashed var(--y-whatif); color: var(--y-whatif); border-radius: 3px; padding: 1px 7px; }
.wf .short { font-size: 15px; margin: 0; }
.wf .note { font-size: 13px; color: var(--ink-soft); margin: 0; }
.wf .player { display: flex; gap: 6px; align-items: center; }
.wf .player .count { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); margin-left: 4px; }
.wf .wst { border: 1px solid var(--rule); border-left: 4px solid var(--ink-soft); background: var(--card); border-radius: 3px; }
.wf .wst.alt { border-left-style: dashed; border-left-color: var(--y-whatif); border-style: dashed; border-left-width: 4px; }
.wf .wst.on { box-shadow: 0 0 0 1.5px var(--ink) inset; }
.wf .wst.alt.on { box-shadow: 0 0 0 1.5px var(--y-whatif) inset; }
.wf .wst > button { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; padding: 8px 11px; display: grid; grid-template-columns: auto 1fr auto; gap: 3px 10px; align-items: baseline; }
.wf .wst .t { font-family: var(--fell); font-size: 15.5px; line-height: 1.25; }
.wf .wst .y { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
.wf .wst .body { display: none; padding: 0 11px 10px; font-size: 14.5px; line-height: 1.45; }
.wf .wst.on .body { display: grid; gap: 6px; }
.wf .wst .body p { margin: 0; }
.wf .src { font-size: 12px; color: var(--ink-soft); margin: 0; padding-left: 16px; }
.wf .fork { display: flex; gap: 8px; align-items: baseline; font-size: 14px; color: var(--y-whatif); border-top: 1px dashed var(--y-whatif); padding-top: 8px; }
.wf .fork b { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; }
.wf .view { border-top: 1px solid var(--rule); padding-top: 7px; display: grid; gap: 2px; font-size: 14px; }
.wf .view .hd { display: flex; gap: 8px; align-items: baseline; }
.wf .view .nm { font-family: var(--fell); font-size: 15px; }
.wf .view .sch { font-size: 12px; color: var(--ink-soft); }
.wf ul { margin: 0; padding-left: 18px; font-size: 14px; }
.wf .chart svg { width: 100%; height: auto; display: block; }
.wf .chart .real { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.wf .chart .alt { fill: none; stroke: var(--y-whatif); stroke-width: 1.8; stroke-dasharray: 5 3; }
.wf .chart .ax { font-family: var(--mono); font-size: 9.5px; fill: var(--ink-soft); }
.wf .chart .thr { stroke: var(--warn); stroke-dasharray: 2 3; stroke-width: 1; }
.wf .chart .shock { stroke: var(--l-disease, #a3321f); stroke-width: 1; opacity: .6; }
.wf .legend { display: flex; gap: 14px; font-size: 12px; color: var(--ink-soft); flex-wrap: wrap; }
.wf .legend i { display: inline-block; width: 18px; height: 0; border-top: 2px solid var(--ink); vertical-align: middle; margin-right: 5px; }
.wf .legend i.a { border-top: 2px dashed var(--y-whatif); }
.wf textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 56px; border: 1.5px solid var(--y-whatif); background: var(--card); padding: 8px 10px; border-radius: 6px; font-size: 15.5px; font-family: var(--fell); }
.wf .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.wf .picks { display: flex; gap: 6px; flex-wrap: wrap; }
.wf .picks button { border: 1px solid var(--rule); background: transparent; border-radius: 999px; padding: 3px 11px; cursor: pointer; font-size: 13px; }
.wf .stat .big, .wf .big { font-family: var(--fell); font-size: 30px; line-height: 1; color: var(--ink); }
.wf .stat .big.v-hit { color: var(--warn); } .wf .stat .big.v-held { color: var(--ink-soft); } .wf .stat .big.v-miss { color: var(--y-money, #9a6f0e); }
.wf .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.wf .stat { border: 1px solid var(--rule); border-radius: 3px; padding: 7px 9px; background: var(--card); display: grid; gap: 3px; }
.wf .stat span { font-size: 12px; color: var(--ink-soft); line-height: 1.3; }
.wf .fl { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 0 10px; padding: 3px 6px; border-radius: 3px; font-size: 14px; }
.wf .fl:hover { background: var(--wash); }
.wf .fl .r { font-family: var(--mono); font-size: 12px; }
.wf .fl small { grid-column: 1 / -1; color: var(--ink-soft); font-size: 12px; }
.wf .v-hit { color: var(--warn); } .wf .v-held { color: var(--ink-soft); } .wf .v-miss { color: var(--y-money, #9a6f0e); }
.wf .err { border: 1px solid var(--warn); color: var(--warn); padding: 7px 10px; border-radius: 3px; font-size: 14px; }
.pt.lp.ghost circle, .pt.lp.ghost rect, .pt.lp.ghost path { fill-opacity: .25; stroke: var(--c); stroke-width: 1.4; stroke-dasharray: 3 2; }
.pt.lp.ghost text { font-style: italic; }
.line.lpath.ghost { stroke-dasharray: 7 5; stroke-width: 2.4px; stroke-opacity: .9; }
.pt.lp.wf-hit path.x { stroke-width: 3; }
`;
  document.head.appendChild(css);

  // ---------- the toy demographic-fiscal model (same as the Order and Chaos lab's) ----------
  function simulate(p, shocks, years) {
    let N = 0.2, E = 0.01, S = 0.5, war = false, warLen = 0, lastWarEnd = -999; const out = [], crises = [];
    for (let t = 0; t <= years; t++) {
      let kmul = 1;
      for (const s of shocks) if (s.type === "climate" && t >= s.t && t < s.t + 50) kmul *= 0.8;
      if (war) kmul *= 0.7;
      const k = kmul * (1 + p.tech * Math.max(S, 0) / (1 + Math.max(S, 0)));
      for (const s of shocks) { if (s.type === "plague" && t === s.t) N *= 0.65; if (s.type === "elites" && t === s.t) E *= 1.6; }
      const press = N / k, emp = E / 0.01, sfd = Math.max(0, -S);
      const psi = Math.min(press, 1.5) * emp * (1 + 2 * sfd);
      if (!war && psi > p.limit) { war = true; warLen = 0; crises.push(t); }
      if (war) {
        N -= 0.022 * N; E -= 0.05 * E; S = Math.max(S, 0) * 0.85; warLen++;
        if (warLen >= 20 && emp < 1.1 && press < 0.9) { war = false; lastWarEnd = t; }
      } else {
        N += p.r * N * (1 - press); E += p.g * E * (press - 0.5);
        S += p.tax * N * (1 - press) - 0.02 * N - 2 * E - 0.03 * Math.max(S, 0);
      }
      E = Math.max(E, 0.003); N = Math.max(N, 0.02);
      out.push({ t, psi: Math.min(psi, 4), war });
    }
    return { out, crises };
  }
  const P0 = { r: 0.02, g: 0.04, tax: 0.3, tech: 1, limit: 2 };
  function modelChart(m) {
    const sh = l => (l || []).map(s => ({ type: s.type, t: s.year - m.start }));
    const a = simulate(P0, sh(m.real), m.years), b = simulate(P0, sh(m.alt), m.years);
    const w = 320, h = 110, L = 34, R = 6, T = 8, B = 18, ym = 3;
    const X = t => L + (w - L - R) * t / m.years, Y = v => T + (h - T - B) * (1 - Math.min(v, ym) / ym);
    const line = r => r.out.map((o, i) => (i ? "L" : "M") + X(o.t).toFixed(1) + " " + Y(o.psi).toFixed(1)).join("");
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(m.years * f / 50) * 50);
    const cr = (r, cls) => r.crises.map(t => `<circle cx="${X(t)}" cy="${Y(P0.limit)}" r="3.2" class="${cls}" style="fill:${cls === "alt" ? "var(--y-whatif)" : "var(--ink)"};stroke:none"/>`).join("");
    const realOnly = (m.real || []).filter(s => !(m.alt || []).some(x => x.type === s.type && x.year === s.year));
    const yrs = r => r.crises.map(t => fy(m.start + t)).join(", ") || "none";
    return `<div class="chart">
      <h3>Toy model · ${esc(m.name)}</h3>
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Instability pressure over time, with and without the shock">
        <line class="thr" x1="${L}" x2="${w - R}" y1="${Y(P0.limit)}" y2="${Y(P0.limit)}"/>
        ${realOnly.map(s => `<line class="shock" x1="${X(s.year - m.start)}" x2="${X(s.year - m.start)}" y1="${T}" y2="${h - B}"/>`).join("")}
        <path class="real" d="${line(a)}"/><path class="alt" d="${line(b)}"/>${cr(a, "real")}${cr(b, "alt")}
        ${ticks.map(t => `<text class="ax" x="${X(t)}" y="${h - 4}" text-anchor="middle">${esc(fy(m.start + t))}</text>`).join("")}
        <text class="ax" x="${L - 4}" y="${Y(P0.limit) + 3}" text-anchor="end">crisis</text>
      </svg>
      <div class="legend"><span><i></i>real shocks: crises ${esc(yrs(a))}</span><span><i class="a"></i>branch: crises ${esc(yrs(b))}</span></div>
      <p class="note">Line: political stress (population pressure × elite numbers × fiscal strain). Red ticks: the shocks the branch removes. ${esc(m.note)}</p>
    </div>`;
  }

  // ---------- predict: the Order and Chaos fragility scores, scored against what happened ----------
  const POLS = () => (typeof ORDER !== "undefined" ? ORDER.polities : []).filter(p => p.c && p.f && p.f.length);
  const at = (pts, y) => { let v = null; for (const q of pts) { if (q[0] <= y) v = q[1]; else break; } return v; };
  function forecast(y0) {
    const bt = D().bt, thr = bt ? bt.thr : ORDER.thr;
    const alive = POLS().filter(p => p.s <= y0 && y0 <= p.e).map(p => ({ p, r: at(p.f, y0) })).filter(o => o.r != null);
    const end = y0 + 50, known = end <= LAST;
    for (const o of alive) { o.broke = !!o.p.b && o.p.e > y0 && o.p.e <= Math.min(end, LAST); o.flag = o.r >= thr; }
    alive.sort((a, b) => b.r - a.r);
    const flagged = alive.filter(o => o.flag), hits = flagged.filter(o => o.broke), missed = alive.filter(o => !o.flag && o.broke);
    return { y0, end, known, thr, alive, flagged, hits, missed, expected: flagged.reduce((s, o) => s + o.r, 0), base: alive.length ? alive.filter(o => o.broke).length / alive.length : 0 };
  }
  const verdict = (F, o, y) => !W.fc || !W.fc.revealed ? null : o.broke && o.p.e <= y ? (o.flag ? "hit" : "miss") : o.flag ? (y >= Math.min(F.end, LAST) ? "held" : null) : null;

  // ---------- the map layer ----------
  ATLAS.lens({
    id: "whatif", name: "Simulate & predict", family: "power", color: "#8a4fc0", on: false, guide: [],
    draw(ctx) {
      if (W.mode === "sim" && W.sc && W.sc.steps[W.i] && W.sc.steps[W.i].branch) {
        const s = W.sc.steps[W.i];
        ctx.pins((s.pins || []).map((p, i) => ({ ...p, id: "g" + i })), { shape: "diamond", cls: "ghost always", label: p => p.name, title: p => "Branch (speculative): " + p.name });
        ctx.paths((s.routes || []).map((r, i) => ({ id: "r" + i, pts: r.points, label: r.label })), { cls: "ghost", title: r => "Branch (speculative): " + (r.label || "") });
        return;
      }
      if (W.mode !== "pred" || !el || el.hidden) return;
      const F = W.fc ? W.fc.F : forecast(Math.round(ctx.year)), y = ctx.year;
      const rows = [...F.flagged, ...F.missed].map(o => ({ o, v: verdict(F, o, y), id: o.p.id, lon: o.p.c[1], lat: o.p.c[0] }))
        .filter(r => r.o.flag || r.v === "miss");
      const lab = r => r.v === "hit" ? `${r.o.p.n}: broke ${ctx.fmtYear(r.o.p.e)}` : r.v === "miss" ? `${r.o.p.n}: missed (broke ${ctx.fmtYear(r.o.p.e)})` : r.v === "held" ? `${r.o.p.n}: held` : `${r.o.p.n} ${pct(r.o.r)}`;
      const card = r => ({ kick: "Forecast from " + ctx.fmtYear(F.y0), title: r.o.p.n, year: F.y0, lon: r.lon, lat: r.lat,
        meta: `${pct(r.o.r)} chance of breaking within 50 years (flag at ${pct(F.thr)})`,
        body: r.o.broke ? `It ended ${ctx.fmtYear(r.o.p.e)} without a successor (${r.o.p.st || "break"}).` : F.known ? `It did not break by ${ctx.fmtYear(F.end)}.` : `Still standing in the data (to ${LAST}).`,
        why: "Out-of-sample score from territory alone (size, share of peak, recent gains or losses, age, era).",
        sources: D().bt ? D().bt.sources : [] });
      for (const kind of ["wait", "hit", "held", "miss"]) {
        const list = rows.filter(r => (r.v || "wait") === kind);
        const sel = ctx.pins(list, { key: r => r.id, shape: kind === "hit" ? "cross" : kind === "miss" ? "triangle" : "circle", cls: (kind === "hit" ? "always " : "") + "wf-" + kind, label: lab, title: lab, card });
        sel.style("--c", kind === "hit" ? "var(--warn)" : kind === "miss" ? "var(--y-money)" : kind === "held" ? "var(--ink-soft)" : "var(--y-whatif)");
      }
    },
  });

  // ---------- the tab ----------
  const scenarios = () => D().scenarios.slice().sort((a, b) => a.divergence.year - b.divergence.year);
  const plBar = v => `<span class="pl"><span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span>${pct(v)}</span>`;
  const srcs = (l, live) => (l || []).length ? `<ul class="src">${l.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite)}</a>` : esc(s.cite)}${live ? " (unchecked)" : ""}</li>`).join("")}</ul>` : "";

  function render() {
    if (!el) return;
    const head = `<div class="seg" role="group" aria-label="Mode"><button data-m="sim" aria-pressed="${W.mode === "sim"}">Simulate</button><button data-m="pred" aria-pressed="${W.mode === "pred"}">Predict</button></div>`;
    el.innerHTML = `<div class="wf">${head}${W.mode === "sim" ? (W.sc ? renderScenario() : renderList()) : renderPredict()}</div>`;
  }
  function renderList() {
    return `<p class="lede">Pick a turning point. The map plays real history up to the moment it changes, then the branch. Branch steps are dashed, marked speculative, and carry a plausibility score; the toy model, where there is one, says which way the pressure would push.</p>
      ${scenarios().map((s, i) => `<button class="sc" data-s="${esc(s.id)}"><b>${esc(s.question)}</b>
        <span class="meta"><span>turns in ${esc(fy(s.divergence.year))}</span>${plBar(s.plausibility)}${s.model ? "<span>+ toy model</span>" : ""}</span></button>`).join("")}
      <h3>Your own what-if</h3>
      <form class="wf-live" id="wf-live"><textarea id="wf-q" rows="2" placeholder="What if the Library of Alexandria never burned?"></textarea>
        <div class="row"><button class="btn primary" type="submit">Simulate it</button><span class="note" id="wf-hint"></span></div></form>
      <p class="note">Live what-ifs are drafted by Claude in the same shape: real history first, then the branch, each step scored. Sources are unchecked.</p>`;
  }
  function renderScenario() {
    const s = W.sc, n = s.steps.length, fork = s.steps.findIndex(x => x.branch);
    return `<div class="row"><button class="btn" data-a="back">◀ All what-ifs</button></div>
      <h2>${esc(s.question)}</h2>
      <div class="row"><span class="badge2">${s.live ? "Live AI draft · sources unchecked" : "Simulation · speculative after " + esc(fy(s.divergence.year))}</span>${s.plausibility != null ? `<span class="note">premise plausibility ${plBar(s.plausibility)}</span>` : ""}</div>
      ${s.short ? `<p class="short">${esc(s.short)}</p>` : ""}
      ${s.plausibility_note ? `<p class="note">${esc(s.plausibility_note)}</p>` : ""}
      ${s.loading ? `<p class="note">${esc(s.loading)}</p>` : ""}${s.error ? `<div class="err">${esc(s.error)}</div>` : ""}
      ${n ? `<div class="player"><button class="btn" data-a="prev" aria-label="Previous step">◀</button><button class="btn primary" data-a="play">${W.playing ? "Pause" : "Play"}</button><button class="btn" data-a="next" aria-label="Next step">▶</button><span class="count">${W.i + 1 || "–"} of ${n}</span></div>` : ""}
      ${s.steps.map((x, i) => `${i === fork ? `<div class="fork"><b>The branch · ${esc(fy(s.divergence.year))}</b><span>${esc(s.divergence.text)}</span></div>` : ""}
        <div class="wst${x.branch ? " alt" : ""}${i === W.i ? " on" : ""}" data-i="${i}"><button aria-expanded="${i === W.i}">
          <span>${x.branch ? `<span class="tagb">branch</span>` : `<span class="tagr">real</span>`}</span><span class="t">${esc(x.title)}</span><span class="y">${x.year != null ? esc(fy(x.year)) : ""}</span></button>
          <div class="body"><p>${esc(x.text)}</p>${x.confidence != null ? `<span class="note">${x.branch ? "plausibility" : "confidence"} ${plBar(+x.confidence)}</span>` : ""}${srcs(x.sources, s.live)}</div></div>`).join("")}
      ${s.model ? modelChart(s.model) : ""}
      ${(s.views || []).length ? `<h3>Competing views</h3>${s.views.map(v => `<div class="view"><div class="hd"><span class="nm">${esc(v.name)}</span><span class="sch">${esc(v.school || "")}</span></div><div>${esc(v.claim)}</div>${v.for ? `<div class="note"><b>For:</b> ${esc(v.for)}</div>` : ""}${v.against ? `<div class="note"><b>Against:</b> ${esc(v.against)}</div>` : ""}</div>`).join("")}` : ""}
      ${(s.unknowns || []).length ? `<h3>What we don't know</h3><ul>${s.unknowns.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
      <p class="note">Rule of the house for simulations: real steps cite sources; branch steps follow what the actors wanted and could do, and say how sure we are. A branch is an argument, not a fact.</p>`;
  }

  const PICKS = [[200, "Han and Parthia"], [1200, "Before the Mongols"], [1450, "Byzantium's last years"], [1750, "Age of revolutions"], [1914, "Eve of the Great War"], [2020, "Today"]];
  function renderPredict() {
    const bt = D().bt, y0 = W.fc ? W.fc.F.y0 : Math.round(api.year), F = W.fc ? W.fc.F : forecast(y0), rev = W.fc && W.fc.revealed;
    const top = F.flagged.slice(0, 14);
    const vcls = o => o.broke ? (o.flag ? "v-hit" : "v-miss") : "v-held";
    const vtxt = o => o.broke ? `broke ${fy(o.p.e)}` : F.known ? "held" : "still standing";
    const st = F.missed.reduce((m, o) => (m[o.p.st || "?"] = (m[o.p.st || "?"] || 0) + 1, m), {});
    return `<p class="lede">Stand in a year. The model flags the states it thinks will break (end with no successor) within 50 years. Then fast-forward and see whether it was right. Scores are out of sample: each state was scored by a model that never saw it.</p>
      <div class="picks">${PICKS.map(([y, n]) => `<button data-y="${y}">${esc(fy(y))} · ${esc(n)}</button>`).join("")}</div>
      <h2>Forecast from ${esc(fy(F.y0))}</h2>
      <p class="note">${F.alive.length} big states alive with a score. The model flags ${F.flagged.length} at ${pct(F.thr)} risk or more, and expects about ${F.expected.toFixed(1)} of those to break by ${esc(fy(F.end))}.</p>
      ${!rev ? `<div class="row">${F.flagged.length ? `<button class="btn primary" data-a="reveal">${F.known ? "Fast-forward 50 years ▶▶" : `Check so far (to ${LAST}) ▶▶`}</button>` : ""}${!W.fc ? `<span class="note">Follows the year slider until you fast-forward.</span>` : ""}</div>` : ""}
      ${!F.known ? `<p class="note"><b>The 50 years aren't over.</b> Breaks after ${LAST} are not in the data yet, so this is a live prediction, open until ${esc(fy(F.end))}. Read it with care: after 1500 the model scores only AUC ${bt ? bt.auc_modern : "0.57"}, and its era term flags many modern states just for being modern.</p>` : ""}
      ${rev ? `<div class="stats">
          <div class="stat"><span class="big v-hit">${F.hits.length}<small style="font-size:15px"> / ${F.flagged.length}</small></span><span>flagged states that broke (expected ${F.expected.toFixed(1)})</span></div>
          <div class="stat"><span class="big v-held">${F.flagged.length - F.hits.length}</span><span>false alarms: flagged, still standing ${F.known ? "50 years on" : "so far"}</span></div>
          <div class="stat"><span class="big v-miss">${F.missed.length}</span><span>missed: broke without a flag${F.missed.length ? ` (${Object.entries(st).map(([k, v]) => `${v} ${esc(k)}`).join(", ")})` : ""}</span></div></div>
        <p class="note">Flagged states broke ${F.flagged.length ? pct(F.hits.length / F.flagged.length) : "–"} of the time, against ${pct(F.base)} for every state alive in ${esc(fy(F.y0))}. ${F.missed.some(o => o.p.st === "snapped") ? "Most misses snapped: they fell from near full size, which borders cannot warn about." : ""}</p>
        <div class="row"><button class="btn" data-a="again">New forecast from ${esc(fy(Math.round(api.year)))}</button></div>` : ""}
      ${top.length ? `<h3>${rev ? "The flags, and what happened" : "Flagged"}</h3>${top.map(o => `<button class="fl" data-p="${esc(o.p.id)}"><span>${esc(o.p.n)}</span><span class="r">${pct(o.r)}${rev ? ` · <span class="${vcls(o)}">${esc(vtxt(o))}</span>` : ""}</span></button>`).join("")}${F.flagged.length > top.length ? `<p class="note">and ${F.flagged.length - top.length} more on the map.</p>` : ""}` : `<p class="note">No state crosses the flag line in ${esc(fy(F.y0))}.</p>`}
      ${rev && F.missed.length ? `<h3>Missed</h3>${F.missed.slice(0, 10).map(o => `<button class="fl" data-p="${esc(o.p.id)}"><span>${esc(o.p.n)}</span><span class="r">${pct(o.r)} · <span class="v-miss">broke ${esc(fy(o.p.e))}</span></span><small>${esc(o.p.st || "")}</small></button>`).join("")}` : ""}
      ${bt ? `<h3>How good is the model?</h3>
        <div class="stats">
          <div class="stat"><span class="big">${bt.auc}</span><span>AUC (0.5 = coin flip); age and era alone: ${bt.auc_base}</span></div>
          <div class="stat"><span class="big">${bt.lift}×</span><span>flagged states broke ${pct(bt.precision)} of the time vs ${pct(bt.base)} base rate</span></div>
          <div class="stat"><span class="big">${pct(bt.warned)}</span><span>of breaks flagged 5 to 40 years ahead</span></div></div>
        <p class="note">The lesson: borders warn about slow deaths, not sudden ones. It flagged ${bt.by_style.withered.flagged} of ${bt.by_style.withered.of} states that withered away, but only ${bt.by_style.snapped.flagged} of ${bt.by_style.snapped.of} that snapped at full size. Trained before 1500 and tested after, it drops to AUC ${bt.auc_modern}. Backtested on ${bt.n.toLocaleString()} state-decades and ${bt.breaks.toLocaleString()} breaks.</p>
        <ul class="note">${bt.caveats.map(c => `<li>${esc(c)}</li>`).join("")}</ul>${srcs(bt.sources)}` : ""}`;
  }

  // ---------- actions ----------
  function setMode(m) {
    stop(); W.mode = m;
    W.fc = null; if (m === "pred") { api.setOn("whatif", true); api.fly({ lon: 50, lat: 30, span: 220 }); }
    api.clearScene(); render();
  }
  function openScenario(s) { stop(); W.sc = s; W.i = -1; render(); if (s.steps.length) go(0); }
  function go(i) {
    const s = W.sc; if (!s || !s.steps[i]) return false;
    W.i = i; const x = s.steps[i];
    api.setOn("whatif", true);
    api.scene({ year: x.year, view: x.view, lens: x.lens, layers: x.layers || [], highlight: x.highlight || [],
      pins: x.branch ? [] : x.pins || [], routes: x.branch ? [] : x.routes || [], title: (x.branch ? "What if · " : "") + x.title });
    api.redraw();
    render();
    const e = el.querySelector(`.wst[data-i="${i}"]`); if (e) e.scrollIntoView({ block: "nearest" });
    return true;
  }
  let timer = 0;
  function stop() { W.playing = false; clearTimeout(timer); }
  function play() {
    W.playing = true;
    const adv = () => { if (!W.playing) return; if (!go(W.i + 1)) { stop(); render(); return; } timer = setTimeout(adv, 9000); };
    if (W.i >= W.sc.steps.length - 1) W.i = -1;
    adv();
  }
  function onClick(ev) {
    const t = ev.target.closest("button"); if (!t || !el.contains(t)) return;
    if (t.dataset.m) return setMode(t.dataset.m);
    if (t.dataset.s) return openScenario(D().scenarios.find(s => s.id === t.dataset.s));
    const st = t.closest(".wst"); if (st) { stop(); const i = +st.dataset.i; if (i === W.i) { W.i = -1; render(); } else go(i); return; }
    if (t.dataset.y) { W.fc = null; api.setYear(+t.dataset.y); return; }
    if (t.dataset.p) {
      const o = W.fc ? [...W.fc.F.alive].find(o => o.p.id === t.dataset.p) : null, p = o ? o.p : POLS().find(p => p.id === t.dataset.p);
      if (p) api.fly({ lon: p.c[1], lat: p.c[0], span: 25 }); return;
    }
    const a = t.dataset.a;
    if (a === "back") { stop(); W.sc = null; W.i = -1; if (live) live.abort(); api.clearScene(); render(); }
    else if (a === "prev") { stop(); go(Math.max(0, W.i - 1)); }
    else if (a === "next") { stop(); go(W.i + 1); }
    else if (a === "play") { W.playing ? (stop(), render()) : play(); }
    else if (a === "reveal") {
      const F = forecast(Math.round(api.year));
      W.fc = { F, revealed: true }; api.setOn("whatif", true);
      api.setYear(Math.min(F.end, LAST), true, 3500); render();
    } else if (a === "again") { W.fc = null; render(); api.redraw(); }
  }
  // The forecast follows the slider until it is locked by fast-forwarding.
  let yt = 0;
  function onYear() {
    if (W.mode !== "pred" || !el || el.hidden) return;
    clearTimeout(yt); yt = setTimeout(render, 160);
  }

  // ---------- live what-ifs ----------
  let sample = null, live = null;
  const ready = (async () => { try { sample = window.claude ? await window.claude.use("sample") : null; } catch { sample = null; } })();
  const RULES = `You are the Atlas simulator. Rishi asks a counterfactual ("what if...") about history. Play it out on a world map: real history up to the turning point, then the branch.
Mix: 55% rigorous, 45% fun. Branch steps must follow what the real actors wanted and could do, with their constraints (geography, money, disease, logistics, rivals). Say plainly when a branch is a long shot. Never present the branch as fact.

OUTPUT: JSON Lines only, one object per line, no prose, no markdown, no code fences, in this order:
1. {"t":"answer","short":"3-4 sentences: the most likely outcome and how sure","divergence":{"year":integer (negative = BCE),"text":"the one change"},"plausibility":0.0-1.0 (how plausible the premise and the main branch are),"plausibility_note":"one sentence why"}
2. 2 to 4 real steps, then 3 to 4 branch steps, in time order:
{"t":"step","branch":false|true,"lens":"geography|military|economy|population|disease|religion|ideas|literature|people|order","title":"short vivid title","year":integer,"view":{"lon":number,"lat":number,"span":degrees of longitude across},"pins":[{"name":"label","lon":number,"lat":number}],"routes":[{"label":"what moved","points":[[lon,lat],...]}],"text":"2-4 sentences, concrete, with numbers and names","confidence":0.0-1.0 (for real steps how sure the facts are; for branch steps how plausible),"sources":[{"cite":"Author, Title (year)","url":"optional"}]}
3. 2 or 3 lines: {"t":"view","name":"historian or school","school":"short label","claim":"one sentence","for":"evidence for","against":"evidence against"}
4. 1 line: {"t":"unknowns","items":["..."]}

MAP RULES: span 300 = whole world, 50 = Mediterranean, 15 = a country, 4 = a city. Points are [lon,lat], longitude first. Use real coordinates.
SOURCE RULES: real steps cite works you are confident exist, or en.wikipedia.org URLs you are confident exist. Branch steps may have no sources. Never invent a URL.`;
  const LENS_OK = ["geography", "military", "economy", "population", "disease", "religion", "ideas", "literature", "people", "order"];
  const ERR = { not_granted: "Live what-ifs are off because Claude access was not allowed for this page.", sampling_disabled: "Claude isn't available for this account here.", rate_limited: "Too many requests at once. Wait a minute and try again.", refused: "Claude declined this one. Try rephrasing it." };
  function normStep(o) {
    const fin = Number.isFinite;
    return { branch: !!o.branch, lens: LENS_OK.includes(o.lens) ? o.lens : "order", title: String(o.title || ""), text: String(o.text || ""),
      year: fin(+o.year) ? Math.max(-4000, Math.min(2025, Math.round(+o.year))) : null,
      view: o.view && fin(+o.view.lon) && fin(+o.view.lat) ? { lon: +o.view.lon, lat: +o.view.lat, span: +o.view.span || 40 } : null,
      pins: (Array.isArray(o.pins) ? o.pins : []).filter(p => p && fin(+p.lon) && fin(+p.lat)).slice(0, 8).map(p => ({ name: String(p.name || ""), lon: +p.lon, lat: +p.lat })),
      routes: (Array.isArray(o.routes) ? o.routes : []).filter(r => r && Array.isArray(r.points)).slice(0, 4).map(r => ({ label: String(r.label || ""), points: r.points.filter(q => Array.isArray(q) && fin(+q[0]) && fin(+q[1])).map(q => [+q[0], +q[1]]) })).filter(r => r.points.length > 1),
      confidence: fin(+o.confidence) ? Math.max(0, Math.min(1, +o.confidence)) : null,
      sources: (Array.isArray(o.sources) ? o.sources : []).filter(s => s && s.cite).map(s => ({ cite: String(s.cite), url: /^https:\/\/en\.wikipedia\.org\//.test(s.url || "") ? s.url : undefined })) };
  }
  async function liveWhatIf(q) {
    const hint = el.querySelector("#wf-hint");
    if (!sample) { if (hint) hint.textContent = "Connecting to Claude…"; await ready; }
    if (!sample) { if (hint) hint.textContent = "Live what-ifs need this page open in Claude. The curated ones work anywhere."; return; }
    stop(); if (live) live.abort();
    const S = { id: "live", live: true, question: q, short: "", divergence: { year: null, text: "" }, plausibility: null, steps: [], views: [], unknowns: [], loading: "Simulating…" };
    W.sc = S; W.i = -1; render();
    const my = live = new AbortController(); let done = 0;
    const eat = line => {
      line = line.trim(); if (!line.startsWith("{")) return;
      let o; try { o = JSON.parse(line); } catch { return; }
      if (o.t === "answer") { S.short = String(o.short || ""); S.divergence = { year: Number.isFinite(+o.divergence?.year) ? +o.divergence.year : null, text: String(o.divergence?.text || "") }; S.plausibility = Number.isFinite(+o.plausibility) ? +o.plausibility : null; S.plausibility_note = String(o.plausibility_note || ""); }
      else if (o.t === "step") { S.steps.push(normStep(o)); if (S.steps.length === 1 && W.sc === S) { go(0); return "first"; } }
      else if (o.t === "view") S.views.push({ name: String(o.name || ""), school: String(o.school || ""), claim: String(o.claim || ""), for: o.for ? String(o.for) : "", against: o.against ? String(o.against) : "" });
      else if (o.t === "unknowns") S.unknowns = (o.items || []).map(String);
    };
    const consume = text => { const ls = text.split("\n"); let ch = false; for (; done < ls.length - 1; done++) { eat(ls[done]); ch = true; } if (ch && W.sc === S) { S.loading = S.steps.length ? `Writing step ${S.steps.length + 1}…` : "Simulating…"; render(); } };
    try {
      const res = await sample([{ role: "user", content: RULES }, { role: "user", content: `Map now: year ${api.year}.\nWHAT IF: ${q}` }], { signal: my.signal, cache: false, onText: ({ text }) => consume(text) });
      consume(res.text + "\n");
      if (!S.steps.length) S.error = "The simulation didn't come back in a shape the map can read. Try again.";
      if (res.truncated) S.error = "The simulation was cut short.";
    } catch (e) {
      if (e && e.text) consume(e.text + "\n");
      if (e?.code !== "cancelled") S.error = ERR[e?.code] || "The connection dropped. Try again.";
      if (e?.code === "not_granted" || e?.code === "sampling_disabled") sample = null;
    } finally {
      if (live === my) live = null;
      S.loading = ""; if (S.divergence.year == null) S.divergence.year = (S.steps.find(x => x.branch) || {}).year ?? api.year;
      if (W.sc === S) { render(); if (W.i < 0 && S.steps.length) go(0); }
    }
  }

  ATLAS.tab({
    id: "whatif", name: "What if",
    mount(pane, a) {
      el = pane; api = a;
      el.addEventListener("click", onClick);
      el.addEventListener("submit", ev => { if (ev.target.id !== "wf-live") return; ev.preventDefault(); const q = el.querySelector("#wf-q").value.trim(); if (q) liveWhatIf(q); });
      el.addEventListener("keydown", ev => { if (ev.target.id === "wf-q" && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); el.querySelector("#wf-live").requestSubmit(); } });
      a.onYear(onYear);
      render();
    },
    show() { render(); api.redraw(); },
  });
})();
