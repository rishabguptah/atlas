// The world index (L1 of the world engine, views/atlas/WORLD.md): what is true at a place and moment, for any place
// and period. One row shape for everything (see assemble.py): dated events, births, deaths, people living or
// working somewhere, things founded or ended, works made. Rows come from
//   atlas-files/world/index.json          the table of contents (small; fetched at start)
//   atlas-files/world/base-<i>.json       the whole world, sliced by time (global chronicle, Pantheon, kernel)
//   atlas-files/packs/<id>.json           dense packs for one window, from the generic assembler
//   AI drafts                             rows a live answer added (status draft, conf estimated or worse)
// Everything loads lazily: a call answers with what is loaded now and asks for the rest; ATLAS.world.onLoad(fn)
// runs when more arrives, so a view can redraw.
(function () {
  const W = window.ATLAS.world = window.ATLAS.world || {};
  const BASE = "atlas-files/world/", PACKS = "atlas-files/packs/";
  const FAM = { w: "war", d: "diplomacy & law", u: "unrest", x: "disaster", c: "culture, trade & faith", p: "people" };
  const KIND = { e: "event", b: "birth", d: "death", r: "lived or worked here", f: "founded or built", z: "ended", w: "work made", s: "storyline step" };
  const CONF = ["attested", "estimated", "approximate", "unknown"];
  W.FAM = FAM; W.KIND = KIND; W.CONF = CONF;

  // ---------- dates: month index = year * 12 + month - 1 (BCE years negative, "-0480-09") ----------
  const mOf = s => { if (!s) return null; const neg = s[0] === "-", p = (neg ? s.slice(1) : s).split("-"), y = neg ? -+p[0] : +p[0]; return y * 12 + (p.length > 1 ? +p[1] - 1 : 0); };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fy = y => y < 0 ? `${-y} BCE` : String(y);
  const fmtDate = s => { if (!s) return ""; const neg = s[0] === "-", p = (neg ? s.slice(1) : s).split("-"), y = fy(neg ? -+p[0] : +p[0]);
    return p.length > 2 ? `${+p[2]} ${MONTHS[+p[1] - 1]} ${y}` : p.length > 1 ? `${MONTHS[+p[1] - 1]} ${y}` : y; };
  const fmtM = m => `${MONTHS[((m % 12) + 12) % 12]} ${fy(Math.floor(m / 12))}`;
  W.mOf = mOf; W.fmtDate = fmtDate; W.fmtM = fmtM; W.fmtYear = fy;

  // ---------- rows ----------
  // [k, f, sub, name, lon, lat, date, end, ref, rank, conf, extra] -> a record object, made once per row.
  function rec(a, src) {
    const m = mOf(a[6]), me = a[7] ? mOf(a[7]) : null, len = a[6] ? a[6].replace(/^-/, "").length : 0;
    return { k: a[0], f: a[1], sub: a[2], name: a[3], lon: a[4], lat: a[5], d: a[6], e: a[7], ref: a[8], rank: a[9] || 0, conf: a[10] || 0, x: a[11] || {},
      m, me: me != null && me > m ? me : null, prec: len >= 10 ? "d" : len >= 7 ? "m" : "y", src,
      id: (typeof a[8] === "number" && a[8] ? "Q" + a[8] : a[8] || a[3]) + ":" + a[0] };
  }
  // A sorted list of records (by month), with binary search for a month range.
  function store(rows, src) {
    const R = rows.map(a => rec(a, src)).filter(r => r.m != null).sort((a, b) => a.m - b.m);
    return { R, src, from(m0, m1) { let lo = 0, hi = R.length; while (lo < hi) { const k = (lo + hi) >> 1; if (R[k].m < m0) lo = k + 1; else hi = k; }
      const out = []; for (let i = lo; i < R.length && R[i].m <= m1; i++) out.push(R[i]); return out; } };
  }

  // ---------- loading ----------
  const S = { index: null, base: {}, packs: {}, ai: null, listeners: [], err: null };
  W.state = S;
  const json = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  W.ready = json(BASE + "index.json").then(ix => { S.index = ix; fire(); return ix; }).catch(e => { S.err = String(e); console.warn("world index", e); return null; });
  let fireT = 0;
  function fire() { if (fireT) return; fireT = setTimeout(() => { fireT = 0; for (const fn of S.listeners) try { fn(); } catch (e) { console.error(e); } }, 30); }
  W.onLoad = fn => { S.listeners.push(fn); };
  function loadBase(i) {
    if (S.base[i]) return S.base[i].p;
    const c = S.index.base[i], o = S.base[i] = { st: null };
    o.p = json(BASE + c.f).then(rows => { o.st = store(rows, "base"); fire(); return o.st; }).catch(e => { o.err = String(e); console.warn(e); });
    return o.p;
  }
  function loadPack(id) {
    if (S.packs[id]) return S.packs[id].p;
    const meta = S.index.packs.find(p => p.id === id), o = S.packs[id] = { meta, st: null };
    o.p = json(PACKS + meta.f).then(pk => { o.st = store(pk.rows, "pack:" + id); fire(); return o.st; }).catch(e => { o.err = String(e); console.warn(e); });
    return o.p;
  }
  const overlaps = (b, c) => b[0] <= c[2] && c[0] <= b[2] && b[1] <= c[3] && c[1] <= b[3];
  // Stores that may hold rows for months m0..m1 inside bbox; asks for the missing ones (packs only once the view is
  // inside or near them, so a world view never pulls city packs).
  function stores(m0, m1, bbox, want = true) {
    const ix = S.index, out = [];
    if (!ix) return out;
    ix.base.forEach((c, i) => { if (c.t0 * 12 <= m1 && (c.t1 + 1) * 12 > m0) { const o = S.base[i]; if (o && o.st) out.push(o.st); else if (want) loadBase(i); } });
    const area = bbox ? (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) : 1e9;
    for (const p of ix.packs) {
      if (p.t0 * 12 > m1 || (p.t1 + 1) * 12 <= m0 || (bbox && !overlaps(bbox, p.bbox))) continue;
      const pa = (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]);
      const o = S.packs[p.id];
      if (o && o.st) out.push(o.st); else if (want && area < pa * 12) loadPack(p.id);
    }
    if (aiStore()) out.push(S.ai);
    return out;
  }

  // ---------- time ----------
  // t: a year, {y, m} (month index m, or month 0-11 of year y), or {m0, m1} (an explicit month range).
  function span(t) {
    if (t == null) return null;
    if (typeof t === "number") return [t * 12, t * 12 + 11];
    if (t.m0 != null) return [t.m0, t.m1];
    if (t.m != null && t.y == null) return [t.m, t.m];
    if (t.y != null) return t.m != null ? [t.y * 12 + t.m, t.y * 12 + t.m] : [t.y * 12, t.y * 12 + 11];
    return null;
  }
  W.span = span;

  // ---------- the queries ----------
  // Records true at time t inside bbox [w, s, e, n], best known first. Long events (wars, reigns) count while they run.
  // opts: kinds ("ebd..." or array), fams, limit, minConf (0-3: the least certain allowed), long (include running).
  W.at = function (t, bbox, opts = {}) {
    const sp = span(t); if (!sp) return [];
    const [m0, m1] = sp, kinds = opts.kinds ? new Set(opts.kinds) : null, fams = opts.fams ? new Set(opts.fams) : null;
    const maxConf = opts.minConf != null ? opts.minConf : 3, seen = new Set(), out = [];
    const inB = r => !bbox || (r.lon >= bbox[0] && r.lon <= bbox[2] && r.lat >= bbox[1] && r.lat <= bbox[3]);
    const take = r => { if (seen.has(r.id) || (kinds && !kinds.has(r.k)) || (fams && !fams.has(r.f)) || r.conf > maxConf || !inB(r)) return; seen.add(r.id); out.push(r); };
    // Packs first: their rows are the denser, better-placed copy of the same thing.
    const ss = stores(m0, m1, bbox, opts.load !== false).sort((a, b) => (a.src === "base") - (b.src === "base"));
    for (const st of ss) for (const r of st.from(m0, m1)) take(r);
    if (opts.long) for (const st of ss) for (const r of st.from(m0 - 12 * (opts.long === true ? 30 : opts.long), m0 - 1)) if (r.me != null && r.me >= m0) take(r);
    out.sort((a, b) => b.rank - a.rank);
    return opts.limit ? out.slice(0, opts.limit) : out;
  };
  const km = (a, b, c, d) => { const R = Math.PI / 180, x = (c - a) * R * Math.cos((b + d) / 2 * R), y = (d - b) * R; return Math.sqrt(x * x + y * y) * 6371; };
  W.km = km;
  // Around a point: rows within rKm, nearest and best known first.
  W.near = function (lon, lat, rKm, t, opts = {}) {
    const dLat = rKm / 111, dLon = rKm / (111 * Math.max(0.15, Math.cos(lat * Math.PI / 180)));
    const list = W.at(t, [lon - dLon, lat - dLat, lon + dLon, lat + dLat], { ...opts, limit: 0 })
      .map(r => ({ r, km: km(lon, lat, r.lon, r.lat) })).filter(o => o.km <= rKm);
    list.sort((a, b) => (b.r.rank + 20) / (1 + b.km / 25) - (a.r.rank + 20) / (1 + a.km / 25));
    return (opts.limit ? list.slice(0, opts.limit) : list).map(o => Object.assign(o.r, { dist: o.km }));
  };
  // One record by id ("Q42:b", "Q42", a kernel id) among everything loaded.
  W.thing = function (id) {
    const all = [...Object.values(S.base), ...Object.values(S.packs)].map(o => o.st).filter(Boolean).concat(aiStore() ? [S.ai] : []);
    for (const st of all) for (const r of st.R) if (r.id === id || ("Q" + r.ref) === id || r.ref === id) return r;
    return null;
  };
  // Presences and journeys of a person, in time order: births, deaths, places lived (loaded rows), storyline steps
  // naming them, and whatever the travellers layer registers with ATLAS.world.addLifeline(fn(id, name) -> rows).
  const lifeSources = [];
  W.addLifeline = fn => lifeSources.push(fn);
  W.lifeline = function (id, name) {
    const out = [], q = typeof id === "string" && /^Q\d+$/.test(id) ? +id.slice(1) : id;
    const all = [...Object.values(S.base), ...Object.values(S.packs)].map(o => o.st).filter(Boolean);
    const seen = new Set();
    for (const st of all) for (const r of st.R) if ((r.ref === q || (name && r.name === name && "bdr".includes(r.k))) && !seen.has(r.id + r.d)) { seen.add(r.id + r.d); out.push(r); }
    if (name && STORIES.list) for (const s of STORIES.list) for (const st of s.steps) if ((st.who || []).includes(name)) out.push({ k: "s", f: "p", name: st.name, lon: st.lon, lat: st.lat, d: st.date, m: mOf(st.date), x: { story: s.title, what: st.what }, conf: st.date_note ? 2 : 0 });
    for (const fn of lifeSources) try { out.push(...(fn(id, name) || [])); } catch (e) { console.error(e); }
    return out.sort((a, b) => a.m - b.m);
  };
  // The polity under a point at time t (wraps the border timeline the map draws).
  W.ruler = (lon, lat, t) => { const y = typeof t === "number" ? t : t && t.y != null ? t.y : t && t.m != null ? Math.floor(t.m / 12) : null; return ATLAS.polityAt ? ATLAS.polityAt(lon, lat, y) : null; };
  // An interpolated value: providers register with ATLAS.world.addMeasure(fn(id, metric, year) -> {v, lo, hi, src}).
  const measures = [];
  W.addMeasure = fn => measures.push(fn);
  W.measure = (id, metric, t) => { const y = typeof t === "number" ? t : t && t.y != null ? t.y : Math.floor(span(t)[0] / 12); for (const fn of measures) { const v = fn(id, metric, y); if (v) return v; } return null; };
  // How much we know here and now: counts by kind, how many are well dated, the packs that cover it, a level for fog
  // and "go deeper" hints, and a static coverage grid when one is published (atlas-files/world/density.json).
  W.density = function (t, bbox) {
    const rows = W.at(t, bbox, { load: false }), by = {};
    for (const r of rows) by[r.k] = (by[r.k] || 0) + 1;
    const sp = span(t), packs = S.index ? S.index.packs.filter(p => (!bbox || overlaps(bbox, p.bbox)) && p.t0 * 12 <= sp[1] && (p.t1 + 1) * 12 > sp[0]) : [];
    const precise = rows.filter(r => r.prec !== "y").length, n = rows.length;
    const months = Math.max(1, sp[1] - sp[0] + 1), perYear = n / months * 12;
    return { n, by, precise, packs: packs.map(p => ({ id: p.id, name: p.name, loaded: !!(S.packs[p.id] && S.packs[p.id].st) })), perYear,
      level: perYear >= 40 ? "rich" : perYear >= 8 ? "some" : perYear >= 1 ? "thin" : "empty", grid: grid(bbox, sp) };
  };
  let G = null;
  function grid(bbox, sp) {
    if (G === null && S.index && S.index.density) { G = false; json(BASE + S.index.density).then(g => { G = g; fire(); }).catch(() => {}); }
    if (!G || !bbox) return null;
    const c = G.cell_deg, y = Math.floor((sp[0] + sp[1]) / 24), bi = G.t_bins.findIndex(([a, b]) => y >= a && y < b);
    if (bi < 0) return null;
    let n = 0;
    for (let col = Math.floor((bbox[0] + 180) / c); col <= Math.floor((bbox[2] + 180) / c); col++)
      for (let row = Math.floor((bbox[1] + 90) / c); row <= Math.floor((bbox[3] + 90) / c); row++)
        for (const [b, counts] of G.cells[col + "," + row] || []) if (b === bi) n += counts.reduce((s, v) => s + v, 0);
    return { n, bin: G.t_bins[bi] };
  }
  // Load or find a dense pack for a window. Resolves to {id, name, bbox, t0, t1, n} once its rows are in, or null
  // when no pack covers it (a view can then offer a live AI draft: ATLAS.world.draft).
  W.pack = async function (bbox, [t0, t1]) {
    await W.ready; if (!S.index) return null;
    const c = S.index.packs.filter(p => overlaps(bbox, p.bbox) && p.t0 <= t1 && p.t1 >= t0)
      .sort((a, b) => ((a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1])) - ((b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1])));
    if (!c.length) return null;
    await loadPack(c[0].id);
    return c[0];
  };
  W.packs = () => (S.index ? S.index.packs : []);
  // Make sure the time slices for a window are coming (for views that want to wait).
  W.load = async function (t, bbox) { await W.ready; const sp = span(t); stores(sp[0], sp[1], bbox, true);
    await Promise.all([...Object.values(S.base), ...Object.values(S.packs)].map(o => o.p)); };

  // ---------- AI drafts ----------
  // Rows a live answer wrote for a thin window. Never better than "estimated"; kept in this browser only and listed
  // under "draft" everywhere they show, waiting for the judge.
  const AIKEY = "atlas.world.ai.v1";
  function aiStore() {
    if (S.ai === null) { let rows = []; try { rows = JSON.parse(localStorage.getItem(AIKEY) || "[]"); } catch { rows = []; } S.ai = rows.length ? store(rows, "ai") : false; S.aiRows = rows; }
    return S.ai || null;
  }
  W.draft = function (rows, meta = {}) {
    aiStore();
    const clean = rows.filter(a => Array.isArray(a) && a.length >= 7 && isFinite(a[4]) && isFinite(a[5]) && mOf(a[6]) != null)
      .map(a => { const b = a.slice(0, 12); while (b.length < 12) b.push(b.length === 11 ? {} : b.length === 10 ? 1 : ""); b[10] = Math.max(1, +b[10] || 1); b[11] = { ...(b[11] || {}), ai: meta.key || 1, status: "draft" }; return b; });
    S.aiRows = (S.aiRows || []).concat(clean).slice(-3000);
    try { localStorage.setItem(AIKEY, JSON.stringify(S.aiRows)); } catch { /* storage full or blocked: keep them for this visit */ }
    S.ai = store(S.aiRows, "ai"); fire();
    return clean.length;
  };
  W.clearDrafts = key => { aiStore(); S.aiRows = (S.aiRows || []).filter(a => key && a[11] && a[11].ai !== key); try { localStorage.setItem(AIKEY, JSON.stringify(S.aiRows)); } catch { } S.ai = S.aiRows.length ? store(S.aiRows, "ai") : false; fire(); };

  // ---------- storylines (served to Up close and, as Stories, to the Director) ----------
  // Named storylines() so it never clobbers the Story registry ATLAS.world.stories (story.js).
  const STORIES = { list: null, p: null };
  // The file (~600 KB) waits for the page's load event and an idle moment so it never competes with first paint.
  const afterPaint = () => new Promise(r => { const go = () => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 6000 }) : setTimeout(r, 1500)); if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true }); });
  W.storylines = function () {
    if (!STORIES.p) STORIES.p = W.ready.then(ix => ix ? afterPaint().then(() => json(BASE + ix.stories_file)) : { stories: [] }).then(d => { STORIES.list = d.stories; fire(); return d.stories; })
      .catch(e => { console.warn("storylines", e); STORIES.list = []; return []; });
    return STORIES.p;
  };
  W.storylineIndex = () => (S.index ? S.index.stories : []);
  // The same storylines in the Story / Scene shape of WORLD.md (L4), id storyline:deep:<id>.
  W.asStory = s => {
    const R = W.stories && W.stories.from, step = R ? R.steps : (x => x);
    const scenes = s.steps.map((st, i) => step({ id: "s" + i, title: st.name, year: Math.floor(mOf(st.date) / 12), date: st.date,
      view: { lon: st.lon, lat: st.lat, span: 10 }, actors: st.who || [], text: [st.what, st.why].filter(Boolean).join(" "),
      kick: st.place_name || null, layers: ["deep"], pins: [{ name: st.name, lon: st.lon, lat: st.lat }], deeper: { tab: "upclose" },
      ask: `Why did ${st.name} happen, and what did it lead to?`,
      sources: [st.wikipedia ? { cite: "Wikipedia: " + st.wikipedia + " (study text written from it; draft)", url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(st.wikipedia.replace(/ /g, "_")) } : null, st.wikidata ? { cite: "Wikidata " + st.wikidata, url: "https://www.wikidata.org/wiki/" + st.wikidata } : null].filter(Boolean) },
      i, { conf: st.date_note ? "approximate" : "estimated" }));
    return { id: "storyline:deep:" + s.id, title: s.title, kind: "storyline", blurb: s.blurb || "", status: "draft", scenes };
  };
  // Register them with the Director's registry; the list fills once stories.json arrives.
  if (W.stories && W.stories.add) {
    W.stories.add({ kind: "storyline", list: () => (STORIES.list || []).map(W.asStory) });
    W.ready.then(() => W.storylines());
  }
})();
