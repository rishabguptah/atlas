// Travellers in motion: history's people and ships moving on the map, and who was really in the same place at once.
// Data from views/atlas/lenses/travels.py (data/travels/ in the kernel). Three lenses and one tab:
//   Travellers (Peoples)    famous journeys: the traveller walks, rides or sails between dated stops; the trail behind
//                           them follows the confidence grammar (solid attested, dashed estimated, dots approximate)
//   VOC ships (Wealth)      every Dutch East India Company ship at sea that year (Dutch-Asiatic Shipping, 8,157 voyages)
//                           with the people aboard and the people who died on the way
//   Middle Passage (Peoples) the forced crossing of enslaved Africans, by decade, and the ships of that year with the
//                           people forced aboard and the people who died. People, never cargo.
//   Who was there (tab)     the Contemporaries finder: real co-presence from presences (residence, work, study,
//                           office, battles, long stays on a journey), not shared birthplaces.
// Presences and the slave voyages come from atlas-files/travels-deep.json, fetched only when needed.
// ATLAS.travel lets the living-world simulation, the life RPG and the objects lens ask who was where.
(() => {
  const ID = "travels", COLOR = "#a0522d", VOC = "voc", VOC_COLOR = "#c07a1e", MP = "passage", MP_COLOR = "#6e2b2b";
  const CONF = ["attested", "estimated", "approximate", "unknown"];
  const CONF_LINE = ["sure", "likely", "legend", "legend"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtY = y => (window.ATLAS.api && ATLAS.api.fmtYear) ? ATLAS.api.fmtYear(y) : y < 0 ? -y + " BCE" : String(y);
  const num = n => Math.round(n).toLocaleString("en");
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fmtT = t => { if (t == null) return "date unknown"; const y = Math.floor(t), m = Math.floor((t - y) * 12); return `${MONTHS[Math.max(0, Math.min(11, m))]} ${fmtY(y)}`; };
  const LD = () => (typeof LENS_DATA !== "undefined" && LENS_DATA[ID]) || null;

  // ---------- sprites: the pixel library's people, ships and caravans, registered for the canvas marks too ----------
  const ready = new Set();
  function sprite(name) {
    if (!name) return null;
    if (ready.has(name)) return name;
    const S = window.PIXEL_SPRITES && PIXEL_SPRITES[name];
    if (!S || !S.frames) return null;
    try {
      const K = (window.PIXEL_PALETTE && PIXEL_PALETTE.KEYS) || {}, f = S.frames[0], cv = document.createElement("canvas");
      cv.width = S.w; cv.height = S.h; const c = cv.getContext("2d");
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const ch = f[y][x]; if (ch === ".") continue;
        c.fillStyle = ch === "x" ? "#b8382a" : ch === "X" ? "#7c2018" : K[ch] || "#888"; c.fillRect(x, y, 1, 1);
      }
      ATLAS.sprite(name, { w: S.w, h: S.h, ax: S.ax, ay: S.ay, frames: [cv.toDataURL()] });
    } catch (err) { return null; }
    ready.add(name);
    return name;
  }
  const lib = () => window.PIXEL_SPRITE_LIBRARY;
  function moverSprite(mode, y, lon, lat, own) {
    const E = window.PixelEra;
    if (mode === "sea" || mode === "river") return sprite(E ? E.mover(y, lon, lat, true) : "ship_galleon") || sprite("ship_galleon");
    if (mode === "caravan") return sprite("caravan_camel") || sprite(E ? E.mover(y, lon, lat, false) : "caravan_mule");
    if (own === "army") return sprite(E ? E.army(y, lon, lat) : "army_levy") || sprite("person_pilgrim");
    return sprite(own) || sprite("person_pilgrim");
  }

  // ---------- geometry: great-circle legs with lengths, a point some way along ----------
  function line(pts) {
    const seg = []; let len = 0;
    for (let i = 1; i < pts.length; i++) { const d = d3.geoDistance(pts[i - 1], pts[i]); seg.push(d); len += d; }
    return { pts, seg, len };
  }
  function along(L, t) {
    let d = Math.max(0, Math.min(1, t)) * L.len;
    for (let i = 0; i < L.seg.length; i++) { if (d <= L.seg[i] || i === L.seg.length - 1) return d3.geoInterpolate(L.pts[i], L.pts[i + 1])(L.seg[i] ? Math.min(1, d / L.seg[i]) : 1); d -= L.seg[i]; }
    return L.pts[L.pts.length - 1];
  }
  function upto(L, t) {
    if (t >= 1) return L.pts;
    const out = [L.pts[0]]; let d = Math.max(0, t) * L.len;
    for (let i = 0; i < L.seg.length; i++) {
      if (d <= L.seg[i]) { out.push(d3.geoInterpolate(L.pts[i], L.pts[i + 1])(L.seg[i] ? d / L.seg[i] : 1)); break; }
      d -= L.seg[i]; out.push(L.pts[i + 1]);
    }
    if (out.length < 2) out.push(out[0]);
    return out;
  }
  // Densify a two-point leg so it draws as a great circle on the flat map.
  const arc = (a, b) => { const n = Math.max(2, Math.ceil(d3.geoDistance(a, b) / 0.05)), f = d3.geoInterpolate(a, b); return Array.from({ length: n + 1 }, (_, i) => f(i / n)); };

  // ---------- the data ----------
  let M = null;
  function prep() {
    const D = LD(); if (!D) return null;
    if (M && M.D === D) return M;
    const P = D.P, pt = i => [P[i][1], P[i][2]], src = i => ({ cite: D.src[i][0], url: D.src[i][1] || undefined });
    const J = D.J.map(j => {
      const legs = j.legs.map(([a, b, t0, t1, mode, conf, note], i) => ({ i, a, b, t0, t1, mode: D.modes[mode], conf, note, pa: P[a], pb: P[b] }));
      // Fill unknown times from the neighbours: a leg starts when the last one ended, and ends when the next one starts.
      for (let i = 0; i < legs.length; i++) {
        const g = legs[i];
        if (g.t0 == null) g.t0 = i ? legs[i - 1].t1 : g.t1;
        if (g.t1 == null) { const nx = legs.slice(i + 1).find(x => x.t0 != null); g.t1 = nx ? nx.t0 : g.t0 + 0.2; }
        if (g.t0 == null) g.t0 = g.t1;
        if (g.t1 < g.t0) g.t1 = g.t0;
        g.L = line(arc(pt(g.a), pt(g.b)));
      }
      return { ...j, legs, t0: legs[0].t0, t1: legs[legs.length - 1].t1, sources: j.s.map(src) };
    });
    const byJ = Object.fromEntries(J.map(j => [j.id, j]));
    // VOC voyages: a path (lane) shared by many ships; position by time, with the Cape call splitting the time.
    const V = D.V, lanes = D.lanes.map(line);
    const n = V.t0.length, voyages = [];
    for (let i = 0; i < n; i++) {
      const lost = !!V.lost[i], t0 = V.t0[i], t1 = V.t1[i] || (t0 + (lost ? 0.6 : 0.7));
      voyages.push({ i, t0, t1, tc: V.tc[i] || null, a: V.a[i], c: V.c[i], b: V.b[i], ship: D.ships[V.ship[i]], master: V.master[i], on: V.on[i], died: V.died[i], arr: V.arr[i],
        out: !!V.out[i], lost, das: V.das[i], L: lanes[V.lane[i]] });
    }
    const vByYear = new Map();
    for (const v of voyages) for (let y = Math.floor(v.t0); y <= Math.floor(v.t1); y++) { if (!vByYear.has(y)) vByYear.set(y, []); vByYear.get(y).push(v); }
    return M = { D, P, pt, src, J, byJ, voyages, vByYear };
  }
  // Where a journey's traveller is at time t: {lon, lat, leg, moving} or null outside the journey.
  function posJ(j, t) {
    if (t < j.t0 - 0.05 || t > j.t1 + 0.6) return null;
    let last = null;
    for (const g of j.legs) {
      if (t < g.t0) break;
      if (t <= g.t1) { const f = g.t1 > g.t0 ? (t - g.t0) / (g.t1 - g.t0) : 1, p = along(g.L, f); return { lon: p[0], lat: p[1], leg: g, f, moving: f < 1 }; }
      last = g;
    }
    const g = last || j.legs[0], at = last ? g.pb : g.pa;
    return { lon: at[1], lat: at[2], leg: g, f: last ? 1 : 0, moving: false, at: last ? g.b : g.a, done: t > j.t1 };
  }
  // Where a VOC ship is at time t: before the Cape call the first part of the lane, after it the rest.
  function posV(v, t) {
    if (t < v.t0 || t > v.t1) return null;
    let f;
    if (v.tc && v.c >= 0) {
      const share = capeShare(v);
      f = t <= v.tc ? share * (t - v.t0) / Math.max(1e-3, v.tc - v.t0) : share + (1 - share) * (t - v.tc) / Math.max(1e-3, v.t1 - v.tc);
    } else f = (t - v.t0) / Math.max(1e-3, v.t1 - v.t0);
    const p = along(v.L, f);
    return { lon: p[0], lat: p[1], f };
  }
  const CAPE = [18.42, -33.92];
  function capeShare(v) {  // how far along the lane the Cape is (cached per lane)
    if (v.L.cape != null) return v.L.cape;
    let best = 0, bd = 9, acc = 0;
    for (let i = 0; i < v.L.pts.length; i++) { const d = d3.geoDistance(v.L.pts[i], CAPE); if (d < bd) { bd = d; best = acc; } if (i < v.L.seg.length) acc += v.L.seg[i]; }
    return v.L.cape = v.L.len ? best / v.L.len : 0.5;
  }

  // ---------- the deep file: presences and slave voyages ----------
  const DEEP = { p: null, data: null, err: null, waiting: [] };
  function deep() {
    if (!DEEP.p) {
      DEEP.p = fetch("atlas-files/travels-deep.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
        DEEP.data = prepDeep(j);
        try { ATLAS.api && ATLAS.api.redraw(); } catch (err) {}
        for (const fn of DEEP.waiting.splice(0)) try { fn(); } catch (err) { console.error(err); }
        return DEEP.data;
      }).catch(err => { DEEP.err = err; throw err; });
      DEEP.p.catch(() => {});
    }
    return DEEP.p;
  }
  function prepDeep(j) {
    const H = j.H, n = H.p.length, byPlace = new Map(), byWho = new Map();
    for (let i = 0; i < n; i++) {
      if (!byPlace.has(H.at[i])) byPlace.set(H.at[i], []); byPlace.get(H.at[i]).push(i);
      if (!byWho.has(H.p[i])) byWho.set(H.p[i], []); byWho.get(H.p[i]).push(i);
    }
    const whoIx = new Map(j.who.map((w, i) => [w[0], i]));
    // Slave voyages by year, for the Middle Passage ships.
    const svByYear = new Map(), SV = j.SV;
    for (let i = 0; i < SV.y.length; i++) { const y = SV.y[i]; if (!svByYear.has(y)) svByYear.set(y, []); svByYear.get(y).push(i); }
    for (const l of svByYear.values()) l.sort((a, b) => SV.emb[b] - SV.emb[a]);
    return { ...j, n, byPlace, byWho, whoIx, svByYear };
  }

  // ---------- co-presence ----------
  // Everyone present within r km of a point in year y (or a window), strongest evidence and most famous first.
  function presentAt(lon, lat, r, y0, y1 = y0) {
    const Dd = DEEP.data; if (!Dd) return [];
    const out = [], H = Dd.H;
    Dd.P.forEach((p, pi) => {
      if (d3.geoDistance([lon, lat], [p[1], p[2]]) * 6371 > r) return;
      for (const i of Dd.byPlace.get(pi) || []) if (H.y0[i] <= y1 && H.y1[i] >= y0) out.push(row(i));
    });
    // One row per person: keep their best-evidenced presence.
    const best = new Map();
    for (const o of out) { const b = best.get(o.pid); if (!b || o.conf < b.conf || (o.conf === b.conf && o.span < b.span)) best.set(o.pid, o); }
    return [...best.values()].sort((a, b) => a.conf - b.conf || b.fame - a.fame);
  }
  function row(i) {
    const Dd = DEEP.data, H = Dd.H, w = Dd.who[H.p[i]], p = Dd.P[H.at[i]];
    return { i, pid: w[0], name: w[1], born: w[2], died: w[3], fame: w[4], place: p[0], lon: p[1], lat: p[2], y0: H.y0[i], y1: H.y1[i], span: H.y1[i] - H.y0[i],
      role: Dd.roles[H.r[i]], conf: H.c[i], draft: !!H.v[i], at: H.at[i] };
  }
  // Everyone whose presence overlapped this person's at the same place (within r km), by how much they overlapped.
  function contemporaries(pid, r = 25) {
    const Dd = DEEP.data; if (!Dd) return [];
    const wi = Dd.whoIx.get(pid); if (wi == null) return [];
    const H = Dd.H, out = new Map();
    for (const i of Dd.byWho.get(wi) || []) {
      const me = row(i);
      Dd.P.forEach((p, pi) => {
        if (pi !== me.at && d3.geoDistance([me.lon, me.lat], [p[1], p[2]]) * 6371 > r) return;
        for (const k of Dd.byPlace.get(pi) || []) {
          if (H.p[k] === wi) continue;
          const a = Math.max(H.y0[k], me.y0), b = Math.min(H.y1[k], me.y1);
          if (a > b) continue;
          const o = row(k), key = o.pid + "@" + me.place, conf = Math.max(o.conf, me.conf);
          const prev = out.get(key);
          if (!prev || conf < prev.conf) out.set(key, { ...o, me, from: a, to: b, conf });
        }
      });
    }
    return [...out.values()].sort((a, b) => a.conf - b.conf || b.fame - a.fame || (b.to - b.from) - (a.to - a.from));
  }
  function lifeline(pid) {
    const C = prep(), Dd = DEEP.data, out = [];
    if (Dd) { const wi = Dd.whoIx.get(pid); for (const i of (wi != null && Dd.byWho.get(wi)) || []) { const o = row(i); out.push({ kind: "presence", t0: o.y0, t1: o.y1, place: o.place, lon: o.lon, lat: o.lat, role: o.role, conf: CONF[o.conf], draft: o.draft }); } }
    if (C) for (const j of C.J) if (j.who === pid) for (const g of j.legs) out.push({ kind: "leg", journey: j.id, t0: g.t0, t1: g.t1, from: g.pa[0], to: g.pb[0], lon: g.pb[1], lat: g.pb[2], mode: g.mode, conf: CONF[g.conf], note: g.note });
    return out.sort((a, b) => a.t0 - b.t0);
  }

  // ---------- cards ----------
  function legCard(C, j, g) {
    return { kick: "Travellers · " + j.wn, title: `${g.pa[0]} → ${g.pb[0]}`, year: Math.floor(g.t1), lon: g.pb[1], lat: g.pb[2], line: g.L.pts,
      meta: `${fmtT(g.t0)} to ${fmtT(g.t1)} · by ${g.mode} · ${CONF[g.conf]}${j.st === "draft" ? " · draft for the judge" : ""}`,
      body: g.note || j.w, why: j.n + ": " + j.w, sources: j.sources };
  }
  function voyCard(C, v) {
    const from = C.P[v.a][0], to = v.b >= 0 ? C.P[v.b][0] : "never arrived";
    const toll = v.on ? `${num(v.on)} people sailed${v.died ? `; ${num(v.died)} died on the way` : ""}${v.arr ? `; ${num(v.arr)} arrived` : ""}.` : "No muster roll survives for this voyage.";
    return { kick: "VOC ships", title: `The ${v.ship}: ${from} → ${to}`, year: Math.floor(v.t0),
      meta: `${fmtT(v.t0)}${v.t1 && !v.lost ? " to " + fmtT(v.t1) : ""} · ${v.out ? "outward to Asia" : "homeward to Europe"}${v.master ? " · master " + v.master : ""}`,
      body: toll + (v.lost ? " The ship did not arrive: lost at sea, wrecked, captured or never recorded. Its route after the last port is unknown." : "") + " The sea path is the usual VOC lane, not the ship's own track.",
      line: v.L.pts, sources: [{ cite: C.D.src[C.D.das_src[0]][0], url: `http://resources.huygens.knaw.nl/das/detailVoyage/${v.das}` }] };
  }
  function presCard(o) {
    return { kick: "Who was there", title: `${o.name} in ${o.place}`, year: o.y0, lon: o.lon, lat: o.lat,
      meta: `${o.y0 === o.y1 ? fmtY(o.y0) : fmtY(o.y0) + " to " + fmtY(o.y1)} · ${o.role} · ${CONF[o.conf]}${o.draft ? " · draft" : ""}`,
      body: `${o.name}${o.born ? ` (${fmtY(o.born)}${o.died ? "–" + fmtY(o.died) : ""})` : ""} was in ${o.place}: ${o.role}.`,
      why: CONF[o.conf] === "attested" ? "Dated by the source." : "The years are inferred, not dated by the source.",
      sources: [{ cite: o.draft ? "Hand-entered from a cited biography (data/travels/presences_travels.jsonl)" : "Wikidata (CC0) statement", url: o.draft ? undefined : `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(o.name)}` }] };
  }

  // ---------- Travellers lens ----------
  let cursor = null;  // fractional time while the tab plays a journey; null = the slider's year (mid-year)
  let followId = null;
  const tNow = y => cursor != null ? cursor : y + 0.5;
  function drawTravellers(ctx) {
    const C = prep(); if (!C) return;
    const t = tNow(ctx.year), trails = [[], [], []], movers = [], stops = [];
    for (const j of followId ? [C.byJ[followId]] : C.J) {
      const w = j && posJ(j, t); if (!w) continue;
      for (const g of j.legs) {
        if (g.t0 > t) break;
        const done = g.t1 <= t, pts = done ? g.L.pts : upto(g.L, (t - g.t0) / Math.max(1e-3, g.t1 - g.t0));
        trails[Math.min(2, g.conf)].push({ j, g, pts, fresh: t - g.t1 < 1.5 });
        if (done && (followId || t - g.t1 < 3)) stops.push({ j, g, lon: g.pb[1], lat: g.pb[2] });
      }
      movers.push({ j, w, lon: w.lon, lat: w.lat, sprite: moverSprite(w.moving ? w.leg.mode : "foot", Math.floor(t), w.lon, w.lat, j.sp) });
    }
    trails.forEach((list, c) => {
      for (const fresh of [true, false]) {
        const l = list.filter(x => x.fresh === fresh); if (!l.length) continue;
        ctx.paths(l, { key: x => x.j.id + ":" + x.g.i, coords: x => x.pts, conf: CONF_LINE[c], alpha: fresh ? .9 : .45, width: fresh ? 2.4 : 1.6,
          title: x => `${x.j.wn}: ${x.g.pa[0]} → ${x.g.pb[0]}, ${fmtT(x.g.t1)} (${CONF[x.g.conf]})`, card: x => legCard(C, x.j, x.g) });
      }
    });
    ctx.pins(stops, { key: s => s.j.id + ":s" + s.g.i, shape: "circle", size: 2.6, fade: .8, label: s => followId ? s.g.pb[0] : null,
      title: s => `${s.j.wn} reached ${s.g.pb[0]}, ${fmtT(s.g.t1)}`, card: s => legCard(C, s.j, s.g) });
    ctx.pins(movers, { key: m => "tr:" + m.j.id, shape: m => m.sprite || "diamond", always: true, hi: m => !!followId, pri: 8,
      label: m => m.w.moving ? `${m.j.wn} → ${m.w.leg.pb[0]}` : `${m.j.wn} · ${C.P[m.w.at ?? m.w.leg.b][0]}`,
      title: m => `${m.j.wn}, ${fmtT(t)}: ${m.w.moving ? "on the way from " + m.w.leg.pa[0] + " to " + m.w.leg.pb[0] + " by " + m.w.leg.mode : "in " + C.P[m.w.at ?? m.w.leg.b][0]}`,
      card: m => legCard(C, m.j, m.w.leg) });
  }
  let lastAt = null;
  function hereTravellers(ctx, at) {
    lastAt = { lon: at.lon, lat: at.lat, year: ctx.year };
    if (pane && pane.offsetParent && TAB.mode === "place") { TAB.where = { n: "Here", ...lastAt }; deep().then(renderTab, renderTab); }
    const C = prep(), y = ctx.year, out = [], r = Math.max(at.r || 300, 200);
    if (C) for (const j of C.J) for (const g of j.legs) {
      if (ctx.km([at.lon, at.lat], [g.pb[1], g.pb[2]]) > r) continue;
      const dy = Math.abs(Math.floor(g.t1) - y);
      out.push({ title: `${j.wn} ${g.t1 < y + 0.5 ? "came" : "will come"} to ${g.pb[0]}`, year: Math.floor(g.t1), why: g.note || j.n, dim: dy > 30, tag: CONF[g.conf] === "attested" ? null : CONF[g.conf], card: legCard(C, j, g), _d: dy });
    }
    const rows = out.sort((a, b) => a._d - b._d).slice(0, 4);
    // Who was really here this year: presences within 30 km.
    if (!DEEP.data) { deep(); if (!DEEP.err) rows.push({ title: "Who was here: loading", why: "Residences, posts, studies and battles of 3,400 people", year: y }); }
    else for (const o of presentAt(at.lon, at.lat, 30, y).slice(0, 6)) rows.push({ title: `${o.name} was here`, year: y, why: `${o.place}: ${o.role} (${fmtY(o.y0)}–${fmtY(o.y1)})`, tag: o.conf ? CONF[o.conf] : null, card: presCard(o) });
    return rows;
  }
  function nowTravellers(ctx) {
    const C = prep(); if (!C) return [];
    const t = ctx.year + 0.5;
    return C.J.map(j => ({ j, w: posJ(j, t) })).filter(x => x.w && !x.w.done).slice(0, 4).map(({ j, w }) => ({
      title: w.moving ? `${j.wn} is travelling to ${w.leg.pb[0]}` : `${j.wn} is in ${C.P[w.at ?? w.leg.b][0]}`, year: ctx.year,
      why: w.leg.note || j.w, card: legCard(C, j, w.leg) }));
  }
  ATLAS.lens({
    id: ID, name: "Travellers", family: "peoples", color: COLOR, on: false, guide: ["people", "geography"],
    desc: "Famous journeys moving across the map, and who was really where",
    key: [["sprite", "A traveller where they were this year: walking, riding, with a caravan or aboard ship"],
      ["line", "Their trail: solid = dated by the source, dashed = estimated, dots = route or date uncertain"],
      ["small", "Places they had just reached"]],
    index: D => (D.J || []).map(j => `${j.n} (${j.wn}): ${j.legs.map(g => `${D.P[g[1]][0]} ${g[3] ? Math.floor(g[3]) : "?"}`).join(", ")}`).join("\n"),
    draw: drawTravellers, here: hereTravellers, now: nowTravellers,
    strip: D => (D.J || []).flatMap(j => j.legs.filter(g => g[3]).map(g => Math.floor(g[3]))),
  });

  // ---------- VOC ships lens ----------
  function drawVoc(ctx) {
    const C = prep(); if (!C) return;
    const t = ctx.year + 0.5, list = C.vByYear.get(ctx.year) || [], ships = [], lanes = new Map();
    for (const v of list) {
      const p = posV(v, t); if (!p) continue;
      ships.push({ v, lon: p.lon, lat: p.lat });
      if (!lanes.has(v.L)) lanes.set(v.L, v);
    }
    ctx.paths([...lanes.values()], { key: v => "lane:" + v.i, coords: v => v.L.pts, conf: "likely", alpha: .22, width: 1.2, color: VOC_COLOR,
      title: v => `VOC lane: ${C.P[v.a][0]} → ${v.b >= 0 ? C.P[v.b][0] : "?"} (the usual route, drawn approximately)` });
    const sp = sprite(window.PixelEra ? PixelEra.mover(ctx.year, 60, -30, true) : "ship_galleon") || "diamond";
    ctx.pins(ships, { key: s => "voc:" + s.v.i, shape: sp, color: VOC_COLOR, ghost: s => s.v.lost, pri: 2, size: 3,
      label: s => ctx.k >= 3 ? s.v.ship : null,
      title: s => `The ${s.v.ship}, ${s.v.out ? "outward" : "homeward"}${s.v.on ? ` · ${num(s.v.on)} aboard` : ""}${s.v.died ? ` · ${num(s.v.died)} died` : ""}${s.v.lost ? " · never arrived" : ""}`,
      card: s => voyCard(C, s.v) });
  }
  function vocYear(C, y) {
    const sail = C.voyages.filter(v => Math.floor(v.t0) === y);
    return { sail, out: sail.filter(v => v.out).length, home: sail.filter(v => !v.out).length, on: sail.reduce((a, v) => a + v.on, 0), died: sail.reduce((a, v) => a + v.died, 0), lost: sail.filter(v => v.lost).length };
  }
  ATLAS.lens({
    id: VOC, name: "VOC ships", family: "wealth", color: VOC_COLOR, on: false, guide: ["economy"],
    desc: "Every Dutch East India Company ship at sea, 1595-1795",
    key: [["sprite", "A VOC ship at sea this year (Dutch-Asiatic Shipping); faded = it never arrived"], ["line", "The usual lane round the Cape (approximate)"]],
    draw: drawVoc,
    here(ctx, at) {
      const C = prep(); if (!C) return [];
      const y = ctx.year, near = i => i >= 0 && ctx.km([at.lon, at.lat], [C.P[i][1], C.P[i][2]]) <= Math.max(at.r || 200, 120);
      const l = C.voyages.filter(v => Math.abs(Math.floor(v.t0) - y) <= 2 && (near(v.a) || near(v.b) || near(v.c)));
      return l.slice(0, 6).map(v => ({ title: `The ${v.ship}: ${C.P[v.a][0]} → ${v.b >= 0 ? C.P[v.b][0] : "never arrived"}`, year: Math.floor(v.t0),
        why: v.on ? `${num(v.on)} aboard${v.died ? `, ${num(v.died)} died on the way` : ""}` : "", card: voyCard(C, v) }));
    },
    now(ctx) {
      const C = prep(); if (!C) return [];
      const s = vocYear(C, ctx.year); if (!s.sail.length) return [];
      return [{ title: `${s.sail.length} VOC ships set sail (${s.out} to Asia, ${s.home} home)`, year: ctx.year,
        why: s.on ? `${num(s.on)} people aboard; ${num(s.died)} of them died on the way${s.lost ? `; ${s.lost} ships never arrived` : ""}.` : "" }];
    },
    strip: () => [],
  });

  // ---------- Middle Passage lens ----------
  // Flows by decade (the kernel's region routes) and, once the deep file is in, the ships of the year.
  function svPos(Dd, i, y) {
    const SV = Dd.SV, a = Dd.ports[SV.buy[i]], b = Dd.ports[SV.land[i]];
    if (!a || !b) return null;
    // The crossing took about two months; spread the year's ships along it by a fixed hash of the voyage id.
    const f = ((SV.id[i] * 2654435761) % 1000) / 1000;
    const p = d3.geoInterpolate([a[1], a[2]], [b[1], b[2]])(f);
    return { lon: p[0], lat: p[1], a, b };
  }
  function drawPassage(ctx) {
    const C = prep(); if (!C) return;
    const dec = Math.floor(ctx.year / 10) * 10, flows = [];
    for (const m of C.D.MP) {
      const d = m.d.find(x => x[0] === dec); if (!d) continue;
      flows.push({ m, d, pts: arc(C.pt(m.a), C.pt(m.b)) });
    }
    const max = Math.max(1, ...flows.map(f => f.d[2]));
    ctx.paths(flows, { key: f => f.m.id, coords: f => f.pts, color: MP_COLOR, alpha: .55, arrow: true, conf: "likely",
      title: f => `${f.m.n}, ${dec}s: ${num(f.d[2])} people forced aboard; ${num(f.d[2] - f.d[3])} died on the crossing`,
      card: f => ({ kick: "Middle Passage", title: f.m.n, year: dec,
        meta: `${dec}s · ${f.d[1]} documented voyages · estimate from SlaveVoyages`,
        body: `In the ${dec}s about ${num(f.d[2])} African people were forced aboard ships here for ${C.P[f.m.b][0]}; about ${num(f.d[2] - f.d[3])} died on the crossing and ${num(f.d[3])} survived to be sold. Over the whole trade on this route: ${num(f.m.p.embarked)} people, ${num(f.m.p.died_at_sea)} dead at sea.`,
        why: "Counts are SlaveVoyages' imputed estimates for documented voyages only; the full trade (about 12.5 million people forced aboard, 1501-1866) was larger.",
        sources: [C.src(C.D.mp_src[0])] }) })
      .style("stroke-width", r => 1 + 7 * Math.sqrt(r.x.d[2] / max));
    const Dd = DEEP.data;
    if (!Dd) { deep(); return; }
    // The year's largest crossings only (they are sorted by people aboard): the flows already carry the total.
    const list = (Dd.svByYear.get(ctx.year) || []).slice(0, ctx.k >= 4 ? 120 : ctx.k >= 2 ? 40 : 12), ships = [];
    for (const i of list) { const p = svPos(Dd, i, ctx.year); if (p) ships.push({ i, ...p }); }
    const SV = Dd.SV, sp = sprite(window.PixelEra ? PixelEra.mover(ctx.year, -30, 5, true) : "ship_galleon") || "diamond";
    ctx.pins(ships, { key: s => "sv:" + SV.id[s.i], shape: sp, color: MP_COLOR, pri: 2, size: 3,
      title: s => `${SV.ship[s.i] || "A ship"}: ${num(SV.emb[s.i])} people forced aboard at ${s.a[0]}; ${num(SV.dis[s.i])} survived to ${s.b[0]}`,
      card: s => ({ kick: "Middle Passage · a voyage", title: `${SV.ship[s.i] || "Unnamed ship"}: ${s.a[0]} → ${s.b[0]}`, year: ctx.year, lon: s.lon, lat: s.lat,
        meta: `${ctx.year} · flag ${Dd.flags[SV.flag[s.i]] || "unknown"}${SV.captain[s.i] ? " · captain " + SV.captain[s.i] : ""} · voyage ${SV.id[s.i]}`,
        body: `${num(SV.emb[s.i])} people were forced aboard at ${s.a[0]}. ${num(SV.dis[s.i])} survived the crossing to ${s.b[0]}; ${num(Math.max(0, SV.emb[s.i] - SV.dis[s.i]))} died on the way.${SV.resist[s.i] ? ` They resisted: ${Dd.resist[SV.resist[s.i]]}.` : ""}${s.a[3] ? "" : " (The place is known only as a region; the dot sits at its main port.)"}`,
        why: "Each of them was a person with a name, a language and a home. The African Names Database at slavevoyages.org holds 91,000 of their names.",
        sources: [{ cite: Dd.sv_src.cite, url: `https://www.slavevoyages.org/voyage/${SV.id[s.i]}/variables` }] }) });
  }
  ATLAS.lens({
    id: MP, name: "Middle Passage", family: "peoples", color: MP_COLOR, on: false, guide: ["economy", "population"],
    desc: "The forced crossing of 12.5 million Africans, by decade, with the ships of each year and the human toll",
    key: [["arrow", "People forced aboard ships from an African region to an American one in this decade (width = how many)"],
      ["sprite", "A slave ship that crossed this year; open it for the people aboard and how many died"]],
    draw: drawPassage,
    here(ctx, at) {
      const C = prep(); if (!C) return [];
      const dec = Math.floor(ctx.year / 10) * 10, r = Math.max(at.r || 300, 400), out = [];
      for (const m of C.D.MP) {
        const na = ctx.km([at.lon, at.lat], C.pt(m.a)) <= r, nb = ctx.km([at.lon, at.lat], C.pt(m.b)) <= r; if (!na && !nb) continue;
        const d = m.d.find(x => x[0] === dec);
        out.push({ title: m.n, year: dec + "s", why: d ? `${num(d[2])} people forced aboard this decade; ${num(d[2] - d[3])} died at sea` : `${num(m.p.embarked)} people over the whole trade`, dim: !d, _n: d ? d[2] : 0 });
      }
      return out.sort((a, b) => b._n - a._n).slice(0, 5);
    },
    now(ctx) {
      const C = prep(); if (!C) return [];
      const dec = Math.floor(ctx.year / 10) * 10; let e = 0, s = 0;
      for (const m of C.D.MP) { const d = m.d.find(x => x[0] === dec); if (d) { e += d[2]; s += d[3]; } }
      if (!e) return [];
      return [{ title: `${num(e / 10)} people a year forced across the Atlantic`, year: dec + "s", why: `In the ${dec}s about ${num(e)} Africans were forced aboard slave ships; about ${num(e - s)} died on the crossing (documented voyages).` }];
    },
  });

  // ---------- Who was there: the Contemporaries finder ----------
  const PRESETS = [
    { n: "Vienna, 1913", lon: 16.37, lat: 48.21, y: 1913, why: "Hitler, Trotsky, Stalin, Freud and Tito within a few miles" },
    { n: "Zurich, 1916", lon: 8.54, lat: 47.37, y: 1916, why: "Lenin, Joyce and the Dada crowd in one old town" },
    { n: "Florence, 1504", lon: 11.26, lat: 43.77, y: 1504, why: "Leonardo and Michelangelo paint rival battles for the same hall" },
    { n: "Paris, 1925", lon: 2.35, lat: 48.86, y: 1925, why: "Hemingway, Fitzgerald, Joyce and Picasso" },
    { n: "Weimar, 1800", lon: 11.33, lat: 50.98, y: 1800, why: "Goethe and Schiller" },
    { n: "Delhi, 1335", lon: 77.21, lat: 28.61, y: 1335, why: "Ibn Battuta, qadi at the sultan's court" },
    { n: "Cairo, 1324", lon: 31.24, lat: 30.04, y: 1324, why: "Mansa Musa's gold floods the city" },
    { n: "Nalanda, 638", lon: 85.44, lat: 25.14, y: 638, why: "Xuanzang studies at the great monastery" },
  ];
  const TAB = { mode: "place", where: null, who: null, q: "" };
  let pane = null, api = null;
  const STYLE = `
.trv { display: grid; gap: 10px; }
.trv .lede { margin: 0; color: var(--ink-soft); }
.trv .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.trv .tabs button, .trv .chip { font: 600 12.5px/1 inherit; padding: 7px 10px; border-radius: 6px; border: 1px solid ${COLOR}; background: none; color: ${COLOR}; cursor: pointer; }
.trv .tabs button[aria-pressed="true"] { background: ${COLOR}; color: #fff; }
.trv .chips { display: flex; gap: 6px; flex-wrap: wrap; }
.trv .chip { font-weight: 500; border-color: var(--rule, #ccc); color: inherit; }
.trv .grp { font: 600 11px/1.2 var(--mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); margin: 6px 0 0; }
.trv .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 6px 4px; border-top: 1px solid var(--rule, #ddd); cursor: pointer; background: none; border-left: 0; border-right: 0; border-bottom: 0; text-align: left; color: inherit; font: inherit; width: 100%; }
.trv .row:hover, .trv .row:focus-visible { background: color-mix(in srgb, ${COLOR} 10%, transparent); }
.trv .row b { display: block; } .trv .row span { color: var(--ink-soft); font-size: 12.5px; }
.trv .row .c { font-size: 11.5px; white-space: nowrap; color: var(--ink-soft); }
.trv .row .c.c0 { color: ${COLOR}; }
.trv input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--rule, #ccc); border-radius: 6px; font: inherit; background: var(--paper, #fff); color: inherit; }
.trv .note { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
.trv .go { font: 600 13px/1 inherit; padding: 8px 12px; border-radius: 6px; border: 1px solid ${COLOR}; background: ${COLOR}; color: #fff; cursor: pointer; }
.trv .go.ghost { background: none; color: ${COLOR}; }
`;
  const confTag = c => `<span class="c c${c}">${CONF[c]}</span>`;
  function placeView() {
    const w = TAB.where;
    if (!w) return `<p class="note">Click anywhere on the map (or pick one of these) to see who was really there in the year on the slider.</p>`;
    if (!DEEP.data) return `<p class="note">${DEEP.err ? "Presences could not load (atlas-files/travels-deep.json is not beside this page)." : "Loading presences…"}</p>`;
    const y = api ? api.year : w.y, now = presentAt(w.lon, w.lat, 30, y), near = presentAt(w.lon, w.lat, 30, y - 5, y + 5).filter(o => !now.some(n => n.pid === o.pid));
    const rows = l => l.slice(0, 40).map(o => `<button type="button" class="row" data-pres="${o.i}"><div><b>${esc(o.name)}</b><span>${esc(o.place)} · ${esc(o.role)} · ${esc(fmtY(o.y0))}${o.y1 !== o.y0 ? "–" + esc(fmtY(o.y1)) : ""}</span></div>${confTag(o.conf)}</button>`).join("");
    const met = (window.ATLAS.world && typeof ATLAS.world.meetings === "function") ? (() => { try { return ATLAS.world.meetings(y, [w.lon - 1, w.lat - 1, w.lon + 1, w.lat + 1]) || []; } catch (err) { return []; } })() : [];
    return `<p class="grp">${esc(w.n || "Here")} in ${esc(fmtY(y))}: ${now.length} ${now.length === 1 ? "person" : "people"}</p>
      ${met.length ? `<p class="grp">Documented meetings</p>${met.slice(0, 8).map(m => `<div class="row"><div><b>${esc(m.title || m.name || (m.who || []).join(" and "))}</b><span>${esc(m.place || "")} ${esc(m.date || "")}</span></div></div>`).join("")}` : ""}
      ${rows(now) || `<p class="note">Nobody in our presences was within 30 km that year. Try the years around it below, or a bigger city.</p>`}
      ${near.length ? `<p class="grp">Within five years either side</p>${rows(near)}` : ""}
      <p class="note">Presence means a dated stay: residence, work, study, office, a battle, or a long stop on a journey (Wikidata and cited biographies). "estimated" years are inferred. Shared birthplaces don't count.</p>`;
  }
  function personView() {
    const Dd = DEEP.data;
    if (!Dd) return `<p class="note">${DEEP.err ? "Presences could not load." : "Loading presences…"}</p>`;
    let html = `<input type="search" placeholder="Search a person: Freud, Ibn Battuta, Newton…" value="${esc(TAB.q)}" data-q>`;
    if (TAB.q && !TAB.who) {
      const q = TAB.q.toLowerCase(), hits = Dd.who.filter(w => w[1].toLowerCase().includes(q)).sort((a, b) => b[4] - a[4]).slice(0, 12);
      html += hits.map(w => `<button type="button" class="row" data-who="${esc(w[0])}"><div><b>${esc(w[1])}</b><span>${w[2] != null ? esc(fmtY(w[2])) : "?"}–${w[3] != null ? esc(fmtY(w[3])) : ""}</span></div></button>`).join("") || `<p class="note">No one by that name has presences yet.</p>`;
    }
    if (TAB.who) {
      const wi = Dd.whoIx.get(TAB.who), w = Dd.who[wi], life = lifeline(TAB.who).filter(x => x.kind === "presence"), cs = contemporaries(TAB.who);
      html += `<p class="grp">${esc(w[1])}: where they were</p>${life.slice(0, 30).map(x => `<div class="row"><div><b>${esc(x.place)}</b><span>${esc(fmtY(x.t0))}${x.t1 !== x.t0 ? "–" + esc(fmtY(x.t1)) : ""} · ${esc(x.role)}</span></div>${confTag(CONF.indexOf(x.conf))}</div>`).join("")}
        <p class="grp">Crossed paths with (${cs.length})</p>${cs.slice(0, 40).map(o => `<button type="button" class="row" data-pres="${o.i}" data-y="${o.from}"><div><b>${esc(o.name)}</b><span>${esc(o.me.place)} · ${esc(fmtY(o.from))}${o.to !== o.from ? "–" + esc(fmtY(o.to)) : ""} · they: ${esc(o.role)}; ${esc(w[1].split(" ").slice(-1)[0])}: ${esc(o.me.role)}</span></div>${confTag(o.conf)}</button>`).join("") || `<p class="note">No overlapping presences found.</p>`}
        <p class="note">Same place (within 25 km), overlapping years. Overlap is not proof they met; it says they could have.</p>`;
    }
    return html;
  }
  function journeysView() {
    const C = prep(); if (!C) return `<p class="note">Loading journeys…</p>`;
    return C.J.map(j => `<button type="button" class="row" data-follow="${esc(j.id)}"><div><b>${esc(j.n)}</b><span>${esc(j.w)}</span></div><span class="c">${esc(fmtY(Math.floor(j.t0)))}–${esc(fmtY(Math.floor(j.t1)))}</span></button>`).join("")
      + `<p class="note">Hand-entered from the cited accounts; drafts waiting for the judge. Paths between stops are straight great circles until the shared router lands.</p>`;
  }
  function renderTab() {
    if (!pane) return;
    const b = (m, n) => `<button type="button" data-mode="${m}" aria-pressed="${TAB.mode === m}">${n}</button>`;
    pane.innerHTML = `<div class="trv"><p class="lede">Who was really in the same place at the same time, and the great journeys that crossed the world.</p>
      <div class="tabs">${b("place", "Here and now")}${b("person", "A person")}${b("journeys", "Follow a journey")}</div>
      ${followId ? `<div class="chips"><button type="button" class="go" data-act="stop">✕ Stop following</button></div>` : ""}
      ${TAB.mode === "place" ? `<div class="chips">${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}" title="${esc(p.why)}">${esc(p.n)}</button>`).join("")}</div>${placeView()}`
        : TAB.mode === "person" ? personView() : journeysView()}</div>`;
  }

  // Follow a journey: time runs by the month along each leg; the camera frames the leg; stops get a caption.
  let run = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function viewOf(g) {
    const pts = g.L.pts, [[w, s], [e, n]] = d3.geoBounds({ type: "LineString", coordinates: pts }), dl = ((e - w) % 360 + 360) % 360;
    const lon = w + dl / 2;
    return { lon: lon > 180 ? lon - 360 : lon, lat: (s + n) / 2, span: Math.max(14, Math.min(120, Math.max(dl * 1.6, (n - s) * 2.6))) };
  }
  async function follow(id) {
    const C = prep(), j = C && C.byJ[id]; if (!j || !api) return;
    const my = ++run; followId = id; api.setOn(ID, true); api.clearScene(); renderTab();
    for (const g of j.legs) {
      if (my !== run) return;
      api.fly(viewOf(g), 900);
      const ms = reduce() ? 0 : Math.min(3200, 900 + 2400 * Math.sqrt(g.L.len / Math.PI)), t0 = performance.now();
      await new Promise(done => {
        const tick = now => {
          if (my !== run) return done();
          const f = ms ? Math.min(1, (now - t0) / ms) : 1;
          cursor = g.t0 + (g.t1 - g.t0) * f;
          const y = Math.floor(cursor); if (api.year !== y) api.setYear(y, false);
          api.redraw();
          if (f < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      if (my !== run) return;
      api.scene({ lens: "Travellers", title: `${j.wn} · ${g.pb[0]}, ${fmtT(g.t1)}${g.note ? ". " + g.note : ""}`.slice(0, 220) });
      await wait(reduce() ? 900 : g.note ? 2600 : 1100);
    }
    if (my === run) { await wait(1500); stopFollow(false); }
  }
  function stopFollow(clear = true) { run++; followId = null; cursor = null; if (api) { if (clear) api.clearScene(); api.redraw(); } renderTab(); }

  ATLAS.tab({
    id: ID, name: "Who was there",
    mount(el, a) {
      pane = el; api = a;
      if (!document.getElementById("travels-style")) { const st = document.createElement("style"); st.id = "travels-style"; st.textContent = STYLE; document.head.appendChild(st); }
      el.addEventListener("click", ev => {
        const t = ev.target;
        const m = t.closest("[data-mode]"); if (m) { TAB.mode = m.dataset.mode; if (TAB.mode !== "journeys") deep(); return renderTab(); }
        if (t.closest("[data-act=stop]")) return stopFollow();
        const p = t.closest("[data-preset]");
        if (p) { const s = PRESETS[+p.dataset.preset]; TAB.where = s; api.setYear(s.y, true, 900); api.fly({ lon: s.lon, lat: s.lat, span: 6 }, 1200); deep().then(renderTab, renderTab); return renderTab(); }
        const r = t.closest("[data-pres]");
        if (r && DEEP.data) { const o = row(+r.dataset.pres); if (r.dataset.y) api.setYear(+r.dataset.y, true, 700); else if (o.y0 > api.year || o.y1 < api.year) api.setYear(o.y0, true, 700); return api.select(presCard(o)); }
        const w = t.closest("[data-who]"); if (w) { TAB.who = w.dataset.who; return renderTab(); }
        const f = t.closest("[data-follow]"); if (f) return follow(f.dataset.follow);
      });
      el.addEventListener("input", ev => { if (ev.target.matches("[data-q]")) { TAB.q = ev.target.value; TAB.who = null; const pos = ev.target.selectionStart; renderTab(); const i = pane.querySelector("[data-q]"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
      document.addEventListener("keydown", ev => { if (ev.key === "Escape" && followId) stopFollow(); });
      a.onYear(() => { if (TAB.mode === "place" && TAB.where && pane && pane.offsetParent) { clearTimeout(TAB.tm); TAB.tm = setTimeout(renderTab, 250); } });
      DEEP.waiting.push(renderTab);
      renderTab();
    },
    show() { if (!TAB.where && lastAt) TAB.where = { n: "Here", ...lastAt }; deep().then(renderTab, renderTab); renderTab(); },
  });

  // ---------- for other plugins: the living world, the life RPG, objects ----------
  const toWorldLegs = j => j.legs.map(g => ({ place: g.pb[0], lon: g.pb[1], lat: g.pb[2], t0: g.t0, t1: g.t1, mode: g.mode, conf: CONF[g.conf], from: g.pa[0], path: g.L.pts, note: g.note, src: "travels" }));
  ATLAS.travel = {
    journeys: () => { const C = prep(); return C ? C.J.map(j => ({ id: j.id, name: j.n, who: j.who, whoName: j.wn, what: j.w, from: j.t0, to: j.t1, sprite: sprite(j.sp) })) : []; },
    // One journey in the shared itinerary format (ATLAS.world agents): {id, name, kind, legs: [{place, lon, lat, t0, t1, mode, conf, ...}]}.
    journey: id => { const C = prep(), j = C && C.byJ[id]; return j ? { id: j.id, name: j.n, kind: "person", who: j.who, legs: toWorldLegs(j), sources: j.sources } : null; },
    positionAt: (id, t) => { const C = prep(), j = C && C.byJ[id]; const w = j && posJ(j, t); return w ? { lon: w.lon, lat: w.lat, moving: w.moving, from: w.leg.pa[0], to: w.leg.pb[0], mode: w.leg.mode, conf: CONF[w.leg.conf] } : null; },
    travellers: t => { const C = prep(); if (!C) return []; return C.J.map(j => ({ j, w: posJ(j, t) })).filter(x => x.w && !x.w.done).map(({ j, w }) => ({ id: j.id, who: j.who, name: j.wn, lon: w.lon, lat: w.lat, moving: w.moving, mode: w.leg.mode, conf: CONF[w.leg.conf] })); },
    ships: t => { const C = prep(); if (!C) return []; return (C.vByYear.get(Math.floor(t)) || []).map(v => ({ v, p: posV(v, t) })).filter(x => x.p).map(({ v, p }) => ({ id: "das_" + v.das, name: v.ship, lon: p.lon, lat: p.lat, aboard: v.on, died: v.died, outward: v.out, lost: v.lost })); },
    ready: () => deep(),
    presentAt: (lon, lat, km = 30, y0, y1) => deep().then(() => presentAt(lon, lat, km, y0, y1 ?? y0)),
    contemporaries: (pid, km = 25) => deep().then(() => contemporaries(pid, km)),
    lifeline: pid => deep().then(() => lifeline(pid), () => lifeline(pid)),
    follow: id => { if (api) { api.setTab(ID); follow(id); } },
    stop: () => stopFollow(),
  };
})();
