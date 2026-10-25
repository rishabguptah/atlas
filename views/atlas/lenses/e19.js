// Europe 1789-1914 up close: the first deep-zoom region. Time runs by the month here, not the year.
// Five precise lenses (Chronicle, Railways, Provinces, Growing cities, Lives) and an "Up close" tab with a month
// scrubber, the ten study storylines and what is happening this month. Data: views/atlas/lenses/e19.py
// (chronicle, storylines, provinces, cities: LENS_DATA.e19, which the page may load after the first paint) and
// atlas-files/e19-deep.json beside the page (railways, lives), fetched when a lens or the tab needs it.
// Other deep regions can reuse this file's pattern: a region block, dated rows, a month cursor shared on ATLAS.e19.
(function () {
  // The region's frame is fixed here so the lenses and the tab can register before their data has arrived.
  const R = { id: "europe-1789-1914", name: "Europe 1789–1914", start: 1789, end: 1914, view: { lon: 14, lat: 50, span: 34 } }, M0 = R.start * 12, M1 = R.end * 12 + 11;
  // D and everything built from it are filled by prep() once LENS_DATA.e19 is there; until then every lens draws nothing.
  let D = null, EV = [], LONG = [], PROV = [], CITY = [];
  function prep() {
    const d = typeof LENS_DATA !== "undefined" && LENS_DATA.e19;
    if (!d || !d.events || !d.events.length) return false;
    D = d;
    EV = D.events.map(([d, e, f, s, n, lon, lat, q, w, st, part], i) => ({
      i, d, e, f, s, n, lon, lat, q, w, st, part, m: mOf(d), me: e ? mOf(e) : null, prec: d.length >= 10 ? "d" : d.length >= 7 ? "m" : "y", t: D.text[i] || {},
      pri: (st >= 0 ? 1000 : 0) + w }));
    LONG = EV.filter(e => e.me != null && e.me > e.m && (e.f === "w" && (e.s === "war" || e.s === "campaign") || e.s === "revolution" || e.s === "revolt" || e.s === "epidemic" || e.s === "famine"));
    PROV = D.provinces.map(([n, lon, lat, s, e, kind, of, w, q], i) => ({ i, n, lon, lat, s, e, kind, of, w, q }));
    CITY = D.cities.map(([n, lon, lat, src, pts], i) => ({ i, n, lon, lat, src, pts }));
    return true;
  }
  const ok = () => !!D || prep();
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BOX = [-25, 34, 50, 72];
  const inBox = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];

  // ---------- dates and the month cursor ----------
  // A date string is "YYYY", "YYYY-MM" or "YYYY-MM-DD"; its month index is year * 12 + month - 1.
  const mOf = s => { const y = +s.slice(0, 4); return s.length >= 7 ? y * 12 + +s.slice(5, 7) - 1 : y * 12; };
  const fmtDate = s => !s ? "" : s.length >= 10 ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : s.length >= 7 ? `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : s.slice(0, 4);
  const fmtM = m => `${MONTHS[((m % 12) + 12) % 12]} ${Math.floor(m / 12)}`;
  // ES.m is the month the Up close tab is on. Lenses use it while the page's year is that month's year;
  // otherwise (the main slider moved) they show the whole year.
  const ES = window.ATLAS.e19 = { m: null, side: null, sideErr: null, listeners: [] };
  const cursor = y => ES.m != null && Math.floor(ES.m / 12) === y ? { m: ES.m, month: true } : { m: y * 12, month: false };
  const inWin = (e, c) => c.month ? (e.prec === "y" ? Math.floor(e.m / 12) === Math.floor(c.m / 12) : e.m <= c.m && e.m > c.m - 4) : Math.floor(e.m / 12) === Math.floor(c.m / 12);
  // How bright a mark is: this month full, fading over the three months before; year-only dates stay faint.
  const fade = (e, c) => !c.month ? 1 : e.prec === "y" ? 0.45 : 1 - 0.22 * (c.m - e.m);

  // ---------- the chronicle ----------
  const FAM = { w: ["War", "cross", "#a3321f"], d: ["Diplomacy & law", "square", "#1d4f6e"], u: ["Revolt & unrest", "triangle", "#b8641c"], x: ["Disaster", "diamond", "#5f6b2a"], c: ["Culture & industry", "circle", "#6a4c93"] };
  const SUB = { battle: "Battle", siege: "Siege", war: "War", campaign: "Campaign", expedition: "Expedition", revolution: "Revolution", revolt: "Revolt", coup: "Coup",
    mutiny: "Mutiny", riot: "Riot", protest: "Protest", strike: "Strike", massacre: "Massacre", pogrom: "Pogrom", assassination: "Assassination", treaty: "Treaty",
    congress: "Congress", independence: "Independence", referendum: "Referendum", coronation: "Coronation", exhibition: "Exhibition", epidemic: "Epidemic",
    famine: "Famine", earthquake: "Earthquake", fire: "Fire", shipwreck: "Shipwreck", disaster: "Disaster", event: "Turning point" };
  // Sorted by month already (e19.py sorts by date); binary search for a month range.
  const firstAt = m => { let lo = 0, hi = EV.length; while (lo < hi) { const k = (lo + hi) >> 1; if (EV[k].m < m) lo = k + 1; else hi = k; } return lo; };
  const between = (a, b) => { const out = []; for (let i = firstAt(a); i < EV.length && EV[i].m <= b; i++) out.push(EV[i]); return out; };
  // Wars and long events in progress at month m (started before, not yet ended).
  const ongoing = m => LONG.filter(e => e.m <= m && e.me >= m).sort((a, b) => b.pri - a.pri);
  const wd = q => q ? { cite: `Wikidata Q${q} (CC0)`, url: `https://www.wikidata.org/wiki/Q${q}` } : null;
  function evCard(e) {
    const t = e.t, story = e.st >= 0 ? D.stories[e.st] : null;
    const meta = [fmtDate(e.d) + (e.e && e.e !== e.d ? ` to ${fmtDate(e.e)}` : ""), t.place_name, e.part ? `part of ${e.part}` : null, t.st === "d" ? "study text: draft, waiting for the judge" : null].filter(Boolean).join(" · ");
    return { kick: `${SUB[e.s] || e.s} · ${FAM[e.f][0]}`, title: e.n, year: Math.floor(e.m / 12), lon: e.lon, lat: e.lat, meta,
      body: [t.what, t.date_note ? `Date: ${t.date_note}.` : null, story ? `Storyline: ${story.title}.` : null].filter(Boolean).join(" "),
      why: t.why || "", sources: [wd(e.q), t.src].filter(Boolean) };
  }
  const evRow = (e, c) => ({ title: e.n, year: fmtDate(e.d), why: (e.t.why || e.t.what || SUB[e.s] || ""), tag: e.st >= 0 ? "story" : null, dim: c && e.m > c.m, card: evCard(e) });

  // ---------- sidecar: railways and lives, fetched beside the page ----------
  function side() {
    if (!ES.side) ES.side = fetch("atlas-files/e19-deep.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
      const st = j.rail.stations.map(([lon, lat, d, n, q], i) => ({ i, lon, lat, d, n, q, m: mOf(d), y: +d.slice(0, 4) }));
      const km = (a, b) => d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]) * 6371;
      const edges = j.rail.edges.map(([a, b]) => ({ a: st[a], b: st[b], m: Math.max(st[a].m, st[b].m), km: km(st[a], st[b]) })).sort((x, y) => x.m - y.m);
      const lives = j.lives.map(([n, role, bd, blon, blat, bp, dd, dlon, dlat, dp, fame, q]) => ({ n, role, bd, blon, blat, bp, dd, dlon, dlat, dp, fame, q,
        bm: bd ? mOf(bd) : null, dm: dd ? mOf(dd) : null, bprec: bd.length >= 10 ? "d" : "y", dprec: dd.length >= 10 ? "d" : "y" }));
      const out = { st, edges, lives, rsrc: j.rail.source, rnote: j.rail.note, lsrc: j.lives_source };
      ES.data = out;
      for (const fn of ES.listeners) try { fn(); } catch (err) { console.error(err); }
      return out;
    }).catch(err => { ES.sideErr = String(err); console.warn("e19 sidecar", err); return null; });
    return ES.side;
  }
  const whenSide = fn => { if (ES.data) return true; ES.listeners.push(fn); side(); return false; };

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
.basemap-on .e19rail path { fill: none; vector-effect: non-scaling-stroke; pointer-events: none; }
.e19rail .cas { stroke: #2b2419; stroke-width: 3.2px; stroke-linecap: butt; opacity: .75; }
.e19rail .trk { stroke: #f4e6bf; stroke-width: 1.4px; stroke-dasharray: 3 3; stroke-linecap: butt; shape-rendering: crispEdges; }
.e19rail .stn { stroke: #2b2419; stroke-width: 3px; stroke-linecap: square; shape-rendering: crispEdges; opacity: .85; }
.e19rail .new { stroke: #ffb92e; opacity: 1; }
.e19rail .new0 { stroke: #2b2419; stroke-width: 4.4px; opacity: .9; }
.e19rail .stn.new { stroke-width: 4px; }
.e19rail .trk.new { stroke-width: 2.4px; stroke-dasharray: none; }
.uc { display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.uc h2 { font-family: var(--fell); font-weight: 400; font-size: 21px; line-height: 1.2; margin: 0; }
.uc h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 6px 0 0; display: flex; gap: 8px; align-items: baseline; }
.uc h3 .n { margin-left: auto; letter-spacing: 0; }
.uc .lede { font-size: 14px; margin: 0; color: var(--ink-soft); }
.uc .when { font-family: "Pixelify Sans", "Silkscreen", var(--mono); font-size: 26px; line-height: 1.1; letter-spacing: .02em; }
.uc .when small { display: block; font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: .08em; text-transform: uppercase; }
.uc .ctl { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.uc .ctl button, .uc .seg button { border: 1px solid var(--rule); background: var(--card); color: var(--ink); border-radius: 4px; padding: 4px 9px; cursor: pointer; font-family: var(--mono); font-size: 12px; min-width: 32px; }
.uc .ctl button.play { background: var(--ink); color: var(--paper); border-color: var(--ink); min-width: 44px; }
.uc .seg { display: inline-flex; margin-left: auto; }
.uc .seg button { border-radius: 0; margin-left: -1px; }
.uc .seg button:first-child { border-radius: 4px 0 0 4px; } .uc .seg button:last-child { border-radius: 0 4px 4px 0; }
.uc .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.uc input[type=range] { width: 100%; accent-color: var(--y-e19); }
.uc .ticks { position: relative; height: 12px; font-family: var(--mono); font-size: 9.5px; color: var(--ink-soft); }
.uc .ticks span { position: absolute; transform: translateX(-50%); }
.uc .stories { display: flex; flex-wrap: wrap; gap: 5px; }
.uc .stories button { border: 1px solid var(--rule); background: transparent; border-radius: 999px; padding: 3px 10px; cursor: pointer; font-size: 13px; color: var(--ink); }
.uc .stories button[aria-pressed="true"] { border-color: var(--y-e19); background: color-mix(in srgb, var(--y-e19) 14%, transparent); }
.uc .next { all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 2px; border: 1.5px solid var(--y-e19); border-radius: 6px; padding: 9px 12px; background: var(--card); }
.uc .next b { font-family: var(--fell); font-weight: 400; font-size: 17px; line-height: 1.25; }
.uc .next span { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .08em; }
.uc .next:hover, .uc .next:focus-visible { background: color-mix(in srgb, var(--y-e19) 10%, var(--card)); }
.uc .steps { display: grid; gap: 1px; max-height: 260px; overflow: auto; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.uc .row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 7.2em 1fr; gap: 0 10px; padding: 4px 6px; border-radius: 3px; font-size: 14px; line-height: 1.35; }
.uc .row:hover, .uc .row:focus-visible { background: var(--wash); }
.uc .row.on { background: color-mix(in srgb, var(--y-e19) 14%, transparent); }
.uc .row.past { color: var(--ink-soft); }
.uc .row .d { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); padding-top: 2px; white-space: nowrap; }
.uc .row i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; background: var(--fc); vertical-align: 1px; }
.uc .row i.t { clip-path: polygon(50% 0, 100% 100%, 0 100%); } .uc .row i.dm { transform: rotate(45deg) scale(.85); } .uc .row i.o { border-radius: 50%; }
.uc .row i.x { background: none; border: 0; position: relative; } .uc .row i.x::before { content: "\\00d7"; position: absolute; left: -1px; top: -6px; color: var(--fc); font-size: 13px; font-weight: 700; }
.uc .row small { display: block; color: var(--ink-soft); font-size: 12.5px; }
.uc .quiet { all: unset; cursor: pointer; font-size: 12.5px; color: var(--accent); text-decoration: underline; }
.uc .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.uc .stat { border: 1px solid var(--rule); border-radius: 3px; padding: 6px 8px; background: var(--card); display: grid; gap: 2px; }
.uc .stat b { font-family: var(--fell); font-weight: 400; font-size: 21px; line-height: 1.1; }
.uc .stat span { font-size: 11.5px; color: var(--ink-soft); line-height: 1.3; }
.uc .note { font-size: 12px; color: var(--ink-soft); margin: 0; }
.uc .lenses { display: flex; flex-wrap: wrap; gap: 5px; }
.uc .lenses button { border: 1px solid var(--rule); background: transparent; border-radius: 999px; padding: 2px 9px; cursor: pointer; font-size: 12.5px; color: var(--ink-soft); display: inline-flex; gap: 5px; align-items: center; }
.uc .lenses button i { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--c); box-sizing: border-box; }
.uc .lenses button[aria-pressed="true"] { color: var(--ink); border-color: var(--c); }
.uc .lenses button[aria-pressed="true"] i { background: var(--c); }
.uc .empty { font-size: 13.5px; color: var(--ink-soft); margin: 0; font-style: italic; }
`;
  document.head.appendChild(css);

  // ---------- lens: Chronicle ----------
  const famOn = { w: true, d: true, u: true, x: true, c: true };
  function visibleEvents(ctx) {
    const c = cursor(ctx.year);
    if (!ok() || Math.floor(c.m / 12) < R.start || Math.floor(c.m / 12) > R.end) return { c, list: [] };
    const list = between(c.month ? c.m - 3 : c.m, c.month ? c.m : c.m + 11).filter(e => inWin(e, c) && famOn[e.f]);
    // The step the Up close tab just went to always shows, whatever the cap.
    const f = ES.focus != null ? EV[ES.focus] : null;
    if (f && !list.includes(f) && Math.abs(f.m - c.m) <= 3) list.push(f);
    // A few dozen marks zoomed out, more as you come in; storyline steps and well-known events first.
    const cap = Math.round(28 * Math.pow(Math.max(1, ctx.k), 1.25));
    list.sort((a, b) => (b.i === ES.focus) - (a.i === ES.focus) || (b.m === c.m) - (a.m === c.m) || b.pri - a.pri);
    return { c, list: list.slice(0, cap) };
  }
  ATLAS.lens({
    id: "e19", name: "Chronicle 1789–1914", family: "power", color: "#b8442c", on: false,
    guide: ["military", "order", "law"],
    index: () => !ok() ? "" : "Europe 1789-1914 study storylines (dated steps): " + D.stories.map(s => `${s.title}: ` + s.steps.map(i => `${EV[i].d} ${EV[i].n}`).join("; ")).join(" | "),
    draw(ctx) {
      const { c, list } = visibleEvents(ctx);
      for (const f in FAM) {
        ctx.pins(list.filter(e => e.f === f), { key: e => e.i, shape: FAM[f][1], color: FAM[f][2],
          label: e => e.st >= 0 || e.w >= 25 || ctx.k >= 6 ? e.n.replace(/^(Battle|Siege) of /, "") : null,
          title: e => `${fmtDate(e.d)} · ${e.n}${e.part ? " · " + e.part : ""}`, card: evCard,
          always: e => e.i === ES.focus || e.st >= 0 || (c.month && e.m === c.m && e.w >= 15), hi: e => e.i === ES.focus,
          fade: e => Math.max(0.3, fade(e, c)), size: e => e.st >= 0 ? 5.5 : 4, pri: e => (e.i === ES.focus ? 60 : e.st >= 0 ? 12 : 3) + Math.min(5, e.w / 20) });
      }
    },
    here(ctx, at) {
      if (!ok()) return [];
      const c = cursor(ctx.year);
      const near = ctx.near(between(c.m - 60, c.m + 60), { ...at, r: Math.max(at.r || 300, 200) });
      return near.sort((a, b) => Math.abs(a.m - c.m) - Math.abs(b.m - c.m) || b.pri - a.pri).slice(0, 8).map(e => evRow(e, c));
    },
    now(ctx) {
      const c = cursor(ctx.year), y = Math.floor(c.m / 12);
      if (!ok() || y < R.start || y > R.end) return [];
      const list = between(c.month ? c.m : y * 12, c.month ? c.m : y * 12 + 11).sort((a, b) => b.pri - a.pri).slice(0, 6).map(e => evRow(e));
      const on = ongoing(c.m).slice(0, 2).map(e => ({ title: `Ongoing: ${e.n}`, year: `${fmtDate(e.d)}–${fmtDate(e.e)}`, why: SUB[e.s], card: evCard(e) }));
      return [...list, ...on];
    },
    strip: () => !ok() ? [] : EV.filter(e => e.st >= 0).map(e => Math.floor(e.m / 12)),
  });

  // ---------- lens: Railways ----------
  // One path per year of opening (stations as square dots, track as pixel dashes), cached per projection,
  // so a year step only adds or removes a few paths.
  let railKey = "", railCache = {};
  function railPaths(ctx, S) {
    const pr = ctx.projection, key = pr.scale() + "," + pr.translate().join(",");
    if (key !== railKey) { railKey = key; railCache = {}; }
    if (railCache.byYear) return railCache;
    const byYear = {};
    const P = s => s._p || (s._p = pr([s.lon, s.lat]));
    for (const s of S.st) { s._p = null; }
    for (const s of S.st) { const p = P(s); if (!p) continue; (byYear[s.y] || (byYear[s.y] = { y: s.y, stn: [], trk: [] })).stn.push(`M${p[0].toFixed(1)},${p[1].toFixed(1)}h0`); }
    for (const e of S.edges) { const a = P(e.a), b = P(e.b), y = Math.floor(e.m / 12); if (!a || !b) continue; (byYear[y] || (byYear[y] = { y, stn: [], trk: [] })).trk.push(`M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`); }
    railCache = { byYear: Object.values(byYear).map(o => ({ y: o.y, stn: o.stn.join(""), trk: o.trk.join("") })).sort((a, b) => a.y - b.y) };
    return railCache;
  }
  function railStats(S, m) {
    let n = 0, km = 0, nNew = 0;
    for (const s of S.st) if (s.m <= m) { n++; if (s.m > m - 12) nNew++; }
    for (const e of S.edges) if (e.m <= m) km += e.km;
    return { n, km, nNew };
  }
  ATLAS.lens({
    id: "e19rail", name: "Railways 1825–1914", family: "wealth", color: "#5a4632", on: false,
    guide: ["economy"],
    draw(ctx) {
      const c = cursor(ctx.year);
      let g = ctx.g.select("g.e19rail");
      if (g.empty()) g = ctx.g.append("g").attr("class", "e19rail");
      if (!whenSide(() => ATLAS.api && ATLAS.api.redraw()) || Math.floor(c.m / 12) < 1800 || Math.floor(c.m / 12) > R.end) { g.selectAll("*").remove(); return; }
      const S = ES.data, y = Math.floor(c.m / 12), C = railPaths(ctx, S);
      // Everything opened before this year; this year's openings (to the month on the cursor) drawn bright.
      const old = C.byYear.filter(o => o.y < y);
      // The classic railway symbol: dark casing, light dashes inside (pixel dashes on the pixel map).
      g.selectAll("path.cas.y").data(old, o => o.y).join("path").attr("class", "cas y").attr("d", o => o.trk || null);
      g.selectAll("path.trk.y").data(old, o => o.y).join("path").attr("class", "trk y").attr("d", o => o.trk || null);
      g.selectAll("path.stn.y").data(old, o => o.y).join("path").attr("class", "stn y").attr("d", o => o.stn || null);
      const cut = c.month ? c.m : y * 12 + 11, pr = ctx.projection;
      const fresh = S.st.filter(s => s.y === y && s.m <= cut), fe = S.edges.filter(e => Math.floor(e.m / 12) === y && e.m <= cut);
      const pt = s => s._p || (s._p = pr([s.lon, s.lat]));
      const dt = fe.map(e => { const a = pt(e.a), b = pt(e.b); return a && b ? `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}` : ""; }).join("");
      const ds = fresh.map(s => { const p = pt(s); return p ? `M${p[0].toFixed(1)},${p[1].toFixed(1)}h0` : ""; }).join("");
      g.selectAll("path.nw").data([0, 1, 2]).join("path").attr("class", i => ["cas nw new0", "trk nw new", "stn nw new"][i]).attr("d", i => (i === 2 ? ds : dt) || null).raise();
    },
    here(ctx, at) {
      if (!ES.data) { side(); return [{ title: "Railway stations load when you switch this on", year: "" }]; }
      const c = cursor(ctx.year);
      const near = ctx.near(ES.data.st, { ...at, r: Math.min(at.r || 300, 120) }).sort((a, b) => a.m - b.m);
      const open = near.filter(s => s.m <= c.m), soon = near.filter(s => s.m > c.m);
      const card = s => ({ kick: "Railways · station opens", title: s.n || "Station", year: s.y, lon: s.lon, lat: s.lat, meta: fmtDate(s.d),
        body: "Opening date of the station as recorded in Wikidata (P1619).", why: "", sources: [wd(s.q), { cite: ES.data.rsrc }].filter(Boolean) });
      const rows = open.slice(0, 4).map(s => ({ title: `${s.n || "Station"} opens`, year: fmtDate(s.d), why: "First trains here", card: card(s) }));
      if (soon.length) rows.push({ title: `${soon[0].n || "Station"} opens`, year: fmtDate(soon[0].d), why: "Next railway to open nearby", tag: "not yet", dim: true, card: card(soon[0]) });
      if (!near.length) rows.push({ title: "No station with an opening date nearby", year: "", why: "Wikidata coverage is thin in places; see the Up close tab" });
      return rows;
    },
    now(ctx) {
      if (!ES.data) return [];
      const c = cursor(ctx.year), y = Math.floor(c.m / 12);
      if (y < 1825 || y > R.end) return [];
      const s = railStats(ES.data, c.month ? c.m : y * 12 + 11);
      return [{ title: `${s.n.toLocaleString()} stations open, ${Math.round(s.km).toLocaleString()} km of linked track`, year: y, why: `${s.nNew.toLocaleString()} stations opened in the last twelve months (Wikidata)` }];
    },
  });

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

  // ---------- lens: Lives ----------
  function lifeCard(p, what) {
    const born = `born ${fmtDate(p.bd)}${p.bp ? " in " + p.bp : ""}`, died = p.dd ? `died ${fmtDate(p.dd)}${p.dp ? " in " + p.dp : ""}` : "";
    return { kick: `Lives · ${p.role.replace(/_/g, " ")}`, title: p.n, year: what === "d" ? Math.floor(p.dm / 12) : Math.floor(p.bm / 12),
      lon: what === "d" ? p.dlon : p.blon, lat: what === "d" ? p.dlat : p.blat, meta: [born, died].filter(Boolean).join(" · "), body: "", why: "",
      sources: [wd(p.q), { cite: ES.data.lsrc, url: "https://pantheon.world" }].filter(Boolean) };
  }
  function livesIn(c) {
    const S = ES.data, out = [];
    for (const p of S.lives) {
      if (p.bm != null && p.blon != null && (c.month ? p.bprec === "d" && p.bm <= c.m && p.bm > c.m - 3 : Math.floor(p.bm / 12) === Math.floor(c.m / 12))) out.push({ p, k: "b", lon: p.blon, lat: p.blat, m: p.bm });
      if (p.dm != null && p.dlon != null && (c.month ? p.dprec === "d" && p.dm <= c.m && p.dm > c.m - 3 : Math.floor(p.dm / 12) === Math.floor(c.m / 12))) out.push({ p, k: "d", lon: p.dlon, lat: p.dlat, m: p.dm });
    }
    return out.sort((a, b) => b.p.fame - a.p.fame);
  }
  ATLAS.lens({
    id: "e19lives", name: "Lives 1789–1914", family: "peoples", color: "#a24b6e", on: false,
    guide: ["people"],
    draw(ctx) {
      const c = cursor(ctx.year), y = Math.floor(c.m / 12);
      if (y < R.start || y > R.end || !whenSide(() => ATLAS.api && ATLAS.api.redraw())) { ctx.pins([], {}); ctx.pins([], {}); return; }
      const list = livesIn(c).slice(0, Math.round(16 * Math.max(1, ctx.k)));
      const fd = o => Math.max(0.3, fade({ m: o.m, prec: "d" }, c));
      ctx.pins(list.filter(o => o.k === "b"), { key: o => "b" + o.p.n, shape: "triangle", label: o => o.p.n, title: o => `${o.p.n} born ${fmtDate(o.p.bd)}`, card: o => lifeCard(o.p, "b") , fade: fd, pri: o => 2 + o.p.fame / 30 });
      ctx.pins(list.filter(o => o.k === "d"), { key: o => "d" + o.p.n, shape: "cross", label: o => `† ${o.p.n}`, title: o => `${o.p.n} died ${fmtDate(o.p.dd)}`, card: o => lifeCard(o.p, "d") , fade: fd, pri: o => 2 + o.p.fame / 30 });
    },
    here(ctx, at) {
      if (!ES.data) { side(); return []; }
      const y = ctx.year;
      const near = ctx.near(ES.data.lives.filter(p => p.blon != null).map(p => ({ p, lon: p.blon, lat: p.blat })), { ...at, r: 60 });
      return near.filter(o => Math.abs(Math.floor(o.p.bm / 12) - y) < 80).sort((a, b) => b.p.fame - a.p.fame).slice(0, 4)
        .map(o => ({ title: `${o.p.n} born here`, year: fmtDate(o.p.bd), why: o.p.role.replace(/_/g, " "), card: lifeCard(o.p, "b") }));
    },
    now(ctx) {
      if (!ES.data) return [];
      const c = cursor(ctx.year), y = Math.floor(c.m / 12);
      if (y < R.start || y > R.end) return [];
      return livesIn(c).slice(0, 4).map(o => ({ title: `${o.p.n} ${o.k === "b" ? "is born" : "dies"}`, year: fmtDate(o.k === "b" ? o.p.bd : o.p.dd), why: o.p.role.replace(/_/g, " "), card: lifeCard(o.p, o.k) }));
    },
  });

  // ---------- pixel map: the chronicle as sprites in the pixel grid ----------
  const ERA = typeof PixelEra !== "undefined" ? PixelEra : null;
  const SPR = { epidemic: "event_plague", famine: "event_famine", earthquake: "event_earthquake", fire: "event_fire", shipwreck: "ship_steamer", disaster: "event_flood" };
  (ATLAS.pixelSprites || (ATLAS.pixelSprites = [])).push((y, k) => {
    const out = [], on = window.ATLAS.isOn;
    if (!ok()) return out;
    if (on && on("e19")) {
      const { c, list } = visibleEvents({ year: y, k });
      for (const e of list.slice(0, Math.round(10 * k))) {
        if (fade(e, c) < 0.5) continue;
        const sp = e.f === "w" ? (ERA && ERA.army ? ERA.army(Math.floor(e.m / 12), e.lon, e.lat) : "army_musket") : e.f === "u" ? "event_fire" : e.f === "x" ? (SPR[e.s] || "event_fire") : e.f === "d" ? "person_ruler" : "person_scholar";
        out.push({ lon: e.lon, lat: e.lat, sprite: sp, dy: -2, pri: e.st >= 0 ? 6 : 4 + Math.min(1.5, e.w / 40), grp: "e19:" + e.i });
      }
    }
    if (on && on("e19cities") && k >= 1.6) {
      for (const cty of CITY) { const g = growth(cty, y), v = popAt(cty, y); if (g >= 3 && v > 60000) out.push({ lon: cty.lon, lat: cty.lat, sprite: "city_industrial", pri: 3.5 }); }
    }
    return out;
  });
  const pixelRefresh = () => { if (ATLAS.pixelRefresh) try { ATLAS.pixelRefresh(); } catch (err) { console.error(err); } };

  // ---------- tab: Up close ----------
  const T = { el: null, api: null, story: 0, step: -1, playing: 0, speed: 1, last: 0 };
  const QUIET = ["people", "money", "ideas", "disease", "war"];
  const LENSES = [["e19", "Chronicle"], ["e19rail", "Railways"], ["e19prov", "Provinces"], ["e19cities", "Cities"], ["e19lives", "Lives"]];
  function setMonth(m, opts = {}) {
    m = Math.max(M0, Math.min(M1, Math.round(m)));
    const y = Math.floor(m / 12), changed = T.api.year !== y;
    ES.m = m;
    if (changed) T.api.setYear(y, false); else T.api.redraw();
    pixelRefresh();
    renderSoon(opts.now);
  }
  let rt = 0;
  function renderSoon(now) { if (now) { cancelAnimationFrame(rt); rt = 0; render(); } else if (!rt) rt = requestAnimationFrame(() => { rt = 0; render(); }); }
  const icon = e => `<i class="${({ triangle: "t", diamond: "dm", circle: "o", cross: "x", square: "" })[FAM[e.f][1]]}" style="--fc:${FAM[e.f][2]}"></i>`;
  function go(e, fly = true) {
    stop();
    if (!ATLAS.isOn("e19")) T.api.setOn("e19", true);
    setMonth(e.m, { now: true });
    ES.focus = e.i;
    if (fly) T.api.fly({ lon: e.lon, lat: e.lat, span: 12 }, 900);
    T.api.redraw();
  }
  function stop() { if (T.playing) { cancelAnimationFrame(T.playing); T.playing = 0; renderSoon(true); } }
  function play() {
    if (T.playing) return stop();
    if (ES.m == null || ES.m >= M1) ES.m = M0;
    T.last = performance.now(); let acc = 0;
    // Speed in months per second: 1, 3 or 12.
    const tick = now => { acc += (now - T.last) / 1000 * T.speed; T.last = now; if (acc >= 1) { const n = Math.floor(acc); acc -= n; setMonth(ES.m + n); if (ES.m >= M1) return stop(); } T.playing = requestAnimationFrame(tick); };
    T.playing = requestAnimationFrame(tick);
    renderSoon(true);
  }
  function render() {
    const el = T.el; if (!el || el.hidden) return;
    // The chronicle may still be loading beside the page: say so and look again shortly.
    if (!ok()) { el.innerHTML = `<div class="uc"><h2>${esc(R.name)} up close</h2><p class="empty">Loading the chronicle…</p></div>`; clearTimeout(T.wait); T.wait = setTimeout(() => renderSoon(), 300); return; }
    const m = ES.m ?? M0, c = { m, month: true }, y = Math.floor(m / 12), S = D.stories[T.story];
    const thisMonth = between(m, m).sort((a, b) => a.d.localeCompare(b.d) || b.pri - a.pri);
    const ong = ongoing(m).slice(0, 6);
    const nextStep = S.steps.map(i => EV[i]).find(e => e.m > m) || null;
    const isOn = k => ATLAS.isOn && ATLAS.isOn(k);
    let rail = "";
    if (ES.data) { const s = railStats(ES.data, m); rail = `<div class="stat"><b>${s.n.toLocaleString()}</b><span>stations open (${s.nNew.toLocaleString()} in the last year)</span></div><div class="stat"><b>${Math.round(s.km).toLocaleString()} km</b><span>of track between listed neighbours</span></div>`; }
    const big = CITY.map(cc => ({ cc, v: popAt(cc, y) })).filter(o => o.v).sort((a, b) => b.v - a.v)[0];
    const cityStat = big ? `<div class="stat"><b>${esc(big.cc.n)}</b><span>largest city, about ${fmtN(big.v)}</span></div>` : "";
    const lives = ES.data ? livesIn({ m, month: true }).filter(o => o.m === m).slice(0, 6) : [];
    const row = (e, extra = "") => `<button class="row${extra}" data-ev="${e.i}"><span class="d">${esc(fmtDate(e.d).replace(/ \d{4}$/, "") || e.d)}</span><span>${icon(e)}${esc(e.n)}${e.t.why ? `<small>${esc(e.t.why)}</small>` : ""}</span></button>`;
    el.innerHTML = `<div class="uc">
      <div><h2>${esc(R.name)} up close</h2><p class="lede">Time runs by the month here. Pick a storyline and press Next, or scrub and play.</p></div>
      <div class="when">${esc(fmtM(m))}<small>${y < R.start || y > R.end ? "outside this region's years" : "month " + (m - M0 + 1) + " of " + (M1 - M0 + 1)}</small></div>
      <input type="range" min="${M0}" max="${M1}" value="${m}" aria-label="Month">
      <div class="ticks">${[1789, 1815, 1848, 1871, 1914].map(t => `<span style="left:${((t * 12 - M0) / (M1 - M0) * 100).toFixed(2)}%">${t}</span>`).join("")}</div>
      <div class="ctl"><button data-a="-12" title="Back a year">«</button><button data-a="-1" title="Back a month">‹</button>
        <button class="play" data-a="play" aria-label="${T.playing ? "Pause" : "Play"}">${T.playing ? "❚❚" : "▶"}</button>
        <button data-a="1" title="Forward a month">›</button><button data-a="12" title="Forward a year">»</button>
        <span class="seg" role="group" aria-label="Speed">${[[1, "1 mo/s"], [3, "3 mo/s"], [12, "1 yr/s"]].map(([v, l]) => `<button data-speed="${v}" aria-pressed="${T.speed === v}">${l}</button>`).join("")}</span></div>
      <div class="lenses">${LENSES.map(([k, n]) => `<button data-lens="${k}" aria-pressed="${isOn(k)}" style="--c:var(--y-${k})"><i></i>${n}</button>`).join("")}</div>
      ${T.quieted && T.quieted.length ? `<p class="note">${T.quieted.length} world-scale lenses are quiet while you study up close. <button class="quiet" data-a="restore">Bring them back</button></p>` : ""}
      <h3>Storylines</h3>
      <div class="stories">${D.stories.map((s, i) => `<button data-story="${i}" aria-pressed="${i === T.story}">${esc(s.title)}</button>`).join("")}</div>
      <p class="lede">${esc(S.blurb)} <span class="note">(${S.start}–${S.end}, ${S.steps.length} steps)</span>${ATLAS.world && ATLAS.world.director ? ` <button class="btn" data-play="${esc(S.id)}">▶ Play on the map</button>` : ""}</p>
      ${nextStep ? `<button class="next" data-ev="${nextStep.i}" data-next="1"><span>Next in ${esc(S.title)} · ${esc(fmtDate(nextStep.d))}</span><b>${esc(nextStep.n)}</b></button>` : `<button class="next" data-ev="${EV[S.steps[0]].i}" data-next="1"><span>Start ${esc(S.title)} · ${esc(fmtDate(EV[S.steps[0]].d))}</span><b>${esc(EV[S.steps[0]].n)}</b></button>`}
      <div class="steps">${S.steps.map(i => EV[i]).map(e => row(e, e.m === m ? " on" : e.m < m ? " past" : "")).join("")}</div>
      <h3>This month<span class="n">${thisMonth.length}</span></h3>
      ${thisMonth.length ? `<div class="steps">${thisMonth.slice(0, 40).map(e => row(e)).join("")}</div>` : `<p class="empty">Nothing dated to this month in the chronicle.</p>`}
      ${ong.length ? `<h3>Under way</h3><div>${ong.map(e => `<button class="row" data-ev="${e.i}"><span class="d">since ${esc(e.d.slice(0, 7))}</span><span>${icon(e)}${esc(e.n)}</span></button>`).join("")}</div>` : ""}
      ${lives.length ? `<h3>Born and died this month</h3><div>${lives.map(o => `<div class="row" style="cursor:default"><span class="d">${esc(fmtDate(o.k === "b" ? o.p.bd : o.p.dd).replace(/ \d{4}$/, ""))}</span><span>${o.k === "b" ? "▲" : "†"} ${esc(o.p.n)}<small>${esc(o.p.role.replace(/_/g, " "))}${o.k === "b" && o.p.bp ? ", " + esc(o.p.bp) : o.k === "d" && o.p.dp ? ", " + esc(o.p.dp) : ""}</small></span></div>`).join("")}</div>` : ""}
      <h3>The year in numbers</h3>
      <div class="stats">${rail}${cityStat}</div>
      <p class="note">${ES.data ? esc(ES.data.rnote) : ES.sideErr ? "Railways and lives could not load (atlas-files/e19-deep.json is not beside this page)." : "Loading railways and lives…"}</p>
      <p class="note">Sources: ${esc(D.events.length.toLocaleString())} dated events from Wikidata (CC0) with day, month or year precision; storyline text written from the Wikipedia article named on each step (draft, waiting for the judge); provinces from Wikidata, named at their centre; cities from Wikidata census years and Reba et al. 2016; lives from Pantheon.</p>
    </div>`;
  }
  ATLAS.tab({
    id: "upclose", name: "Up close",
    mount(el, api) {
      T.el = el; T.api = api;
      el.addEventListener("input", ev => { if (ev.target.type === "range") { stop(); setMonth(+ev.target.value); } });
      el.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.a === "play") return play();
        if (b.dataset.a === "restore") { for (const k of T.quieted || []) api.setOn(k, true); T.quieted = []; return renderSoon(true); }
        if (b.dataset.a) { stop(); return setMonth((ES.m ?? M0) + +b.dataset.a, { now: true }); }
        if (b.dataset.speed) { T.speed = +b.dataset.speed; return renderSoon(true); }
        if (b.dataset.lens) { api.setOn(b.dataset.lens, !ATLAS.isOn(b.dataset.lens)); pixelRefresh(); return renderSoon(true); }
        if (!ok()) return;
        if (b.dataset.play) { stop(); return ATLAS.world.director.play("storyline:e19:" + b.dataset.play); }
        if (b.dataset.story) { T.story = +b.dataset.story; const s = D.stories[T.story]; stop(); return go(EV[s.steps[0]]); }
        if (b.dataset.ev) return go(EV[+b.dataset.ev]);
      });
      api.onYear(y => { if (ES.m != null && Math.floor(ES.m / 12) !== y) ES.m = y >= R.start && y <= R.end ? y * 12 : ES.m; if (!el.hidden) renderSoon(); });
      ES.listeners.push(() => renderSoon());
      render();
    },
    show() {
      const first = ES.m == null;
      if (first) {
        // First visit: switch on the chronicle, railways and provinces, and go to Europe in the region's first year.
        for (const k of ["e19", "e19rail", "e19prov"]) T.api.setOn(k, true);
        // The deep layers replace the world-scale ones here (the Chronicle has the battles, Lives the people), so those go quiet.
        T.quieted = QUIET.filter(k => ATLAS.isOn(k));
        for (const k of T.quieted) T.api.setOn(k, false);
        side();
        const y = T.api.year;
        ES.m = y >= R.start && y <= R.end ? y * 12 : M0;
        T.api.fly(R.view, 1000);
        setMonth(ES.m, { now: true });
      } else renderSoon(true);
    },
  });
  // Keyboard: [ and ] step a month while the Up close tab is open (the page keeps arrows for years).
  document.addEventListener("keydown", ev => {
    if (!T.el || T.el.hidden || ev.target.closest("input, textarea, select") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "[" || ev.key === "]") { ev.preventDefault(); stop(); setMonth((ES.m ?? M0) + (ev.key === "]" ? 1 : -1)); }
  });
})();
