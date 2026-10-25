// Guess the past: a calibration game. The map flies to a moment and asks for a number the kernel holds (a city's
// size, a continent's people, a share of world GDP, an empire at its peak, kilometres of railway, days for news to
// travel). You answer with a range you are 80% sure of; the reveal plays as a short Director scene (the answer, a
// comparison, your calibration) with "Why?" and "How do we know" one tap away. The tab keeps score: hits, points
// for tight ranges, and calibration ("you said 80%, you were right 64%"). A daily five, streaks, an endless mode,
// questions about wherever the map is, and finds. Reveals also visit the spot for the Codex.
// Data: views/atlas/lenses/guess.py (sourced measures read at a year they give). Progress: localStorage atlas.guess.v1.
(function () {
  const A = window.ATLAS;
  const D = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.guess) || null;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KIND = { city: "Cities", region: "Continents", gdpshare: "Share of world GDP", gdppc: "Income per person", area: "Empires at their height", rail: "Railways", news: "News travels" };
  const DAILY_N = 5, TARGET = 0.8;
  let api = null, el = null;

  // ---------- progress, kept in this browser ----------
  const KEY = "atlas.guess.v1";
  const P = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } })();
  P.h = P.h || []; P.day = P.day || {}; P.st = P.st || { last: null, n: 0, best: 0 }; P.f = P.f || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* private window: progress lasts this visit */ } };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayBefore = s => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const answered = id => P.h.find(h => h.id === id);

  // ---------- numbers ----------
  const sig = (v, n = 3) => +v.toPrecision(n);
  const big = v => v >= 1e9 ? `${sig(v / 1e9)} billion` : v >= 1e6 ? `${sig(v / 1e6)} million` : v >= 1e4 ? Math.round(sig(v, 3)).toLocaleString("en") : Math.round(v).toLocaleString("en");
  const U = {
    people_city: { f: v => `${big(v)} people`, s: v => big(v), unit: "people" },
    people_region: { f: v => `${big(v)} people`, s: v => big(v), unit: "people" },
    share: { f: v => `${sig(v * 100, v < 0.01 ? 2 : 3)}%`, s: v => `${sig(v * 100, 2)}%`, unit: "% of the world", pct: true },
    usd: { f: v => `$${Math.round(sig(v, 3)).toLocaleString("en")}`, s: v => `$${big(v)}`, unit: "dollars a year" },
    mkm2: { f: v => `${sig(v, v < 10 ? 2 : 3)} million km²`, s: v => `${sig(v, 2)}`, unit: "million km²" },
    km: { f: v => `${Math.round(sig(v, 3)).toLocaleString("en")} km`, s: v => big(v), unit: "km" },
    days: { f: v => v < 1 ? `${sig(v * 24, 2)} hours` : `${sig(v, 3)} days`, s: v => v < 1 ? `${sig(v * 24, 2)}h` : `${sig(v, 2)}`, unit: "days" },
  };
  // "50k", "1.2m", "2 billion", "30%", "$1,500" all read as numbers; a share is typed in percent.
  function parse(str, u) {
    let s = String(str || "").trim().toLowerCase().replace(/[$,\s]/g, "").replace(/people|km²|km2|km|days?|%$/g, "");
    const m = /^(\d*\.?\d+)(k|thousand|m|mn|million|b|bn|billion)?$/.exec(s); if (!m) return null;
    let v = +m[1]; const x = m[2] || "";
    if (/^k|^thousand/.test(x)) v *= 1e3; else if (/^b/.test(x)) v *= 1e9; else if (/^m/.test(x)) v *= u === "mkm2" ? 1 : 1e6;
    if (U[u].pct) v /= 100;
    return v > 0 ? v : null;
  }
  const dom = q => (D().dom || {})[q.u] || [1, 1e6];
  const toT = (q, v) => { const [a, b] = dom(q); return Math.max(0, Math.min(1, Math.log(v / a) / Math.log(b / a))); };
  const fromT = (q, t) => { const [a, b] = dom(q); return a * Math.pow(b / a, t); };
  const tidy = (q, v) => { const [a, b] = dom(q); return Math.max(a, Math.min(b, sig(v, 2))); };

  // ---------- questions ----------
  const Q = () => (D() || {}).q || [];
  const byId = id => Q().find(q => q.id === id);
  const fy = y => api ? api.fmtYear(y) : String(y);
  function rng(seed) { let a = 0; for (const c of seed) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) >>> 0); return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // The daily five: the same five for a given date, five different kinds of question.
  function daily(date) {
    const r = rng("guess:" + date), kinds = [...new Set(Q().map(q => q.k))].sort();
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    return kinds.slice(0, DAILY_N).map(k => { const list = Q().filter(q => q.k === k); return list[Math.floor(r() * list.length)].id; });
  }
  // Endless: something you have not answered, of a kind you have seen least lately.
  function endless() {
    const left = Q().filter(q => !answered(q.id)); if (!left.length) return Q()[Math.floor(Math.random() * Q().length)];
    const recent = P.h.slice(-6).map(h => (byId(h.id) || {}).k);
    const fresh = left.filter(q => !recent.includes(q.k));
    const pool = fresh.length ? fresh : left;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // About here: the unanswered question closest to where the map is looking, in place and in time.
  function aboutHere() {
    const v = api.view ? api.view() : null, y = api.year;
    if (!v) return endless();
    const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
    const score = q => km(v, q) / 800 + Math.abs(q.y - y) / 120 + (answered(q.id) ? 50 : 0);
    return Q().slice().sort((a, b) => score(a) - score(b))[Math.floor(Math.random() * 3)];
  }

  // ---------- scoring ----------
  const pointsFor = (lo, hi) => Math.max(10, Math.round(100 * (1 - Math.log10(hi / lo) / 2.5)));
  function judge(q, lo, hi) {
    const v = q.v, hit = v >= lo * 0.995 && v <= hi * 1.005;
    const off = hit ? 1 : v < lo ? lo / v : v / hi;
    return { hit, off, pts: hit ? pointsFor(lo, hi) : 0, side: hit ? "" : v < lo ? "high" : "low" };
  }
  const calib = (list = P.h) => ({ n: list.length, hit: list.filter(h => h.hit).length, r: list.length ? list.filter(h => h.hit).length / list.length : null });
  function verdict(c) {
    if (c.n < 5) return `Answer ${5 - c.n} more to see how your 80% ranges hold up.`;
    if (c.r < 0.6) return "Much too sure: the true number lands outside your range far more than one time in five. Widen your ranges.";
    if (c.r < 0.72) return "A little too sure. Most people are: stretch both ends of the range.";
    if (c.r <= 0.88) return "Well calibrated. When you say 80%, you mean it.";
    if (c.r <= 0.95) return "A little timid: you could tighten your ranges and score more.";
    return "Too timid: your ranges almost never miss. Narrow them; a miss now and then is the price of a sharp guess.";
  }

  // ---------- finds ----------
  const FINDS = [
    ["first", "First guess", "Answered a question about the past."],
    ["bull", "Bullseye", "A hit with a range no wider than ×1.5."],
    ["five", "Five in a row", "Five hits running."],
    ["daily", "Daily five", "Finished a daily five."],
    ["week", "Seven-day streak", "A daily five seven days running."],
    ["cal", "Calibrated", "Twenty answers, right between 72% and 88% of the time."],
    ["all", "All the lenses", "Answered every kind of question."],
    ["deep", "Deep time", "Answered a question set before 1 CE."],
    ["swing", "Swing for the fences", "Hit five ranges no wider than ×2."],
  ];
  function checkFinds(q, res, lo, hi) {
    const got = [], give = id => { if (!P.f[id]) { P.f[id] = today(); got.push(id); } };
    give("first");
    if (res.hit && hi / lo <= 1.5) give("bull");
    let run = 0; for (let i = P.h.length - 1; i >= 0 && P.h[i].hit; i--) run++;
    if (run >= 5) give("five");
    if (P.st.n >= 7) give("week");
    const c = calib(); if (c.n >= 20 && c.r >= 0.72 && c.r <= 0.88) give("cal");
    const kinds = new Set(P.h.map(h => (byId(h.id) || {}).k)); if (Object.keys(KIND).every(k => kinds.has(k))) give("all");
    if (q.y < 1) give("deep");
    if (P.h.filter(h => h.hit && h.hi / h.lo <= 2).length >= 5) give("swing");
    return got;
  }

  // ---------- state ----------
  const S = { mode: "daily", q: null, lo: null, hi: null, stage: "ask", res: null, finds: [], story: null, dayIdx: 0 };
  function dailyState() {
    const d = today(), ids = daily(d), done = P.day[d] || [];
    return { d, ids, done, next: ids.find(id => !done.includes(id)) || null };
  }
  function pick(mode) {
    S.mode = mode || S.mode;
    S.stage = "ask"; S.res = null; S.finds = [];
    if (S.mode === "daily") { const ds = dailyState(); S.q = ds.next ? byId(ds.next) : null; if (!S.q) { S.stage = "dailydone"; render(); return; } }
    else if (S.mode === "here") S.q = aboutHere();
    else if (S.mode === "endless") S.q = endless();
    if (!S.q) { render(); return; }
    startRange(S.q);
    stage();
    render();
  }
  // A narrow starting range at a spot picked from the question's id, so the start gives nothing away and locking in
  // without moving it is a shot in the dark rather than a free hit.
  function startRange(q) {
    const r = rng("start:" + q.id), t = 0.15 + 0.7 * r(), m = fromT(q, t);
    S.lo = tidy(q, m / 1.8); S.hi = tidy(q, m * 1.8);
  }
  // The question on the map: fly there, set the year, mark the place. No lens is switched on: what is already on the
  // map is fair game, but the game does not hand over the answer.
  function stage() {
    const q = S.q; if (!q || !api) return;
    try {
      api.scene({ year: q.y, view: { lon: q.lon, lat: q.lat, span: q.span || 10 }, layers: [], highlight: [], title: q.p,
        pins: q.k === "city" || q.k === "news" ? [{ name: q.k === "city" ? q.n : "", lon: q.lon, lat: q.lat }] : [],
        routes: q.route ? [{ label: "", points: q.route }] : [] });
    } catch (err) { console.error("guess stage", err); }
  }

  // ---------- the reveal: a Story for the Director ----------
  function storyFor(q, lo, hi, res) {
    const u = U[q.u], d = D(), srcs = (q.s || []).map(i => d.src[i]).filter(Boolean);
    const view = { lon: q.lon, lat: q.lat, span: q.span || 10 };
    const verdictLine = res.hit ? `Inside your range of ${u.f(lo)} to ${u.f(hi)}. +${res.pts}` :
      `Outside your range of ${u.f(lo)} to ${u.f(hi)}: you were too ${res.side} by ×${sig(res.off, 2)}.`;
    const scenes = [{
      id: "reveal", t: q.y, view, lenses: q.layers || [], lens: q.lens, kick: res.hit ? "Inside your range" : "Outside your range",
      pins: q.k === "news" && q.route ? [] : [{ name: q.n, lon: q.lon, lat: q.lat }], routes: q.route ? [{ label: q.n, points: q.route }] : [],
      caption: `${u.f(q.v)}. ${verdictLine}`,
      text: [q.what, ...(q.ctx || []).filter(Boolean), d.why[q.k]].filter(Boolean).join("\n"),
      conf: q.conf, sources: srcs, ask: q.ask, deeper: { q: q.ask },
    }];
    if (q.cmp) {
      const c = q.cmp, r = c.v / q.v;
      scenes.push({ id: "compare", t: q.y, view: { lon: c.lon, lat: c.lat, span: 14 }, lenses: ["places"], kick: "Meanwhile",
        pins: [{ name: c.n, lon: c.lon, lat: c.lat }], caption: `${c.c} in ${fy(q.y)}: ${c.n}, with ${u.f(c.v)}.`,
        text: r >= 1 ? `${c.n} was ${sig(r, 2)} times the size of ${q.n}.` : `${q.n} was ${sig(1 / r, 2)} times the size of ${c.n}.`,
        conf: q.conf, sources: srcs, ask: `Why was ${c.n} the biggest city in ${fy(q.y)}?` });
    }
    // News: ask the Atlas's own motion model to make the same trip in that year, and see how close the model comes.
    if (q.k === "news" && q.route && A.world && A.world.route && A.world.motionReady && A.world.motionReady()) {
      try {
        const r = A.world.route(q.route[0], q.route[1], q.y);
        if (r && r.path && isFinite(r.days)) scenes.push({ id: "model", t: q.y, view, lenses: [], kick: "The Atlas's motion model",
          routes: [{ label: "the model's route", points: r.path }], pins: [],
          caption: `Our motion model, sending a traveller the same way in ${fy(q.y)}, says ${Math.round(r.days)} days. The record says ${sig(q.v, 3)}.`,
          text: `The model knows roads, winds, ships and rail by year, not one rider's hurry. ${(r.notes || []).slice(0, 3).join(" ")}`.trim(),
          conf: "estimated", sources: [{ cite: "Atlas motion model, views/atlas/world/route.js and data/motion/rules.json" }] });
      } catch (err) { console.error("guess route", err); }
    }
    const c = calib(), dy = S.mode === "daily" ? dailyState() : null;
    scenes.push({ id: "score", t: q.y, view: null, kick: res.hit ? `+${res.pts} points` : "No points this time",
      caption: c.n >= 5 ? `You said 80%. You have been right ${Math.round(c.r * 100)}% of the time (${c.hit} of ${c.n}).` : `${c.hit} of ${c.n} inside your range so far.`,
      text: verdict(c) + (dy ? `\nDaily five: ${dy.done.length} of ${DAILY_N} done.` : ""), conf: null, sources: [] });
    return { id: "guess:" + q.id, title: q.p, kind: "quest", blurb: "Guess the past", status: "draft", scenes };
  }

  function lockIn() {
    const q = S.q; if (!q || S.stage !== "ask") return;
    let lo = Math.min(S.lo, S.hi), hi = Math.max(S.lo, S.hi); if (hi <= lo) hi = lo * 1.0001;
    const res = judge(q, lo, hi);
    P.h.push({ id: q.id, lo, hi, v: q.v, hit: res.hit, p: res.pts, d: today() });
    if (S.mode === "daily") {
      const ds = dailyState();
      if (ds.ids.includes(q.id) && !ds.done.includes(q.id)) {
        P.day[ds.d] = [...ds.done, q.id];
        if (P.day[ds.d].length === DAILY_N) {
          P.st.n = P.st.last === dayBefore(ds.d) ? P.st.n + 1 : P.st.last === ds.d ? P.st.n : 1;
          P.st.last = ds.d; P.st.best = Math.max(P.st.best || 0, P.st.n);
          if (!P.f.daily) P.f.daily = ds.d;
        }
      }
    }
    S.finds = checkFinds(q, res, lo, hi);
    if (S.mode === "daily" && (P.day[today()] || []).length === DAILY_N && P.f.daily === today() && !S.finds.includes("daily")) S.finds.push("daily");
    save();
    S.res = { ...res, lo, hi }; S.stage = "reveal";
    render();
    try { if (A.codex && A.codex.visit) A.codex.visit(q.lon, q.lat, q.y); } catch (err) { /* the Codex is optional */ }
    playReveal();
  }
  function playReveal() {
    const q = S.q, r = S.res; if (!q || !r) return;
    S.story = storyFor(q, r.lo, r.hi, r);
    const dir = A.world && A.world.director;
    if (dir && dir.play(S.story)) return;
    api.scene({ year: q.y, view: { lon: q.lon, lat: q.lat, span: q.span || 10 }, layers: q.layers || [], pins: [{ name: q.n, lon: q.lon, lat: q.lat }], title: S.story.scenes[0].caption });
  }

  // ---------- rendering ----------
  const css = document.createElement("style");
  css.textContent = `
.gp { --gp: #b4542f; display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.gp p { margin: 0; }
.gp .seg { display: flex; border: 1px solid var(--rule); border-radius: 999px; overflow: hidden; width: max-content; max-width: 100%; }
.gp .seg button { border: 0; background: transparent; padding: 6px 12px; cursor: pointer; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
.gp .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.gp .gp-top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.gp .stat { border: 1px solid var(--rule); background: var(--card); padding: 7px 10px; display: grid; gap: 1px; }
.gp .stat b { font-family: var(--mono); font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; }
.gp .stat span { font-size: 11.5px; color: var(--ink-soft); line-height: 1.3; }
.gp .card { border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); background: var(--card); padding: 12px 14px; display: grid; gap: 10px; }
.gp .k { font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--gp); display: flex; gap: 10px; }
.gp .k span:last-child { margin-left: auto; color: var(--ink-soft); }
.gp .qq { font-family: var(--fell); font-weight: 400; font-size: 21px; line-height: 1.25; margin: 0; }
.gp .hint { font-size: 13px; color: var(--ink-soft); }
.gp .dual { position: relative; height: 44px; margin: 0 9px; touch-action: none; cursor: pointer; }
.gp .dual .tr { position: absolute; left: 0; right: 0; top: 19px; height: 6px; background: var(--wash); outline: 1px solid var(--rule); }
.gp .dual .rg { position: absolute; top: 17px; height: 10px; background: var(--gp); opacity: .85; }
.gp .dual .tk { position: absolute; top: 31px; font-family: var(--mono); font-size: 9.5px; color: var(--ink-soft); transform: translateX(-50%); white-space: nowrap; }
.gp .dual .tk::before { content: ""; position: absolute; left: 50%; top: -6px; height: 4px; border-left: 1px solid var(--rule); }
.gp .dual .h { position: absolute; top: 10px; width: 18px; height: 24px; margin-left: -9px; background: var(--card); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); cursor: grab; display: grid; place-items: center; font-size: 9px; font-family: var(--mono); }
.gp .dual .h:focus-visible { outline: 3px solid var(--gp); outline-offset: 1px; }
.gp .dual .truth { position: absolute; top: 4px; height: 36px; border-left: 3px solid var(--ink); }
.gp .dual .truth::after { content: "▼"; position: absolute; top: -12px; left: -7px; font-size: 11px; color: var(--ink); }
.gp .ins { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; align-items: end; }
.gp .ins label { display: grid; gap: 2px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
.gp .ins input { font: inherit; font-family: var(--mono); font-size: 15px; padding: 6px 8px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); width: 100%; box-sizing: border-box; text-transform: none; letter-spacing: 0; }
.gp .ins input:focus { outline: 2px solid var(--gp); }
.gp .ins .to { padding-bottom: 8px; color: var(--ink-soft); font-size: 13px; }
.gp .wide { font-family: var(--mono); font-size: 11.5px; color: var(--ink-soft); }
.gp .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.gp .btn { border: 2px solid var(--ink); background: var(--card); color: var(--ink); padding: 7px 14px; cursor: pointer; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; box-shadow: 2px 2px 0 var(--ink); }
.gp .btn.pri { background: var(--ink); color: var(--paper); }
.gp .btn:active { transform: translate(2px, 2px); box-shadow: none; }
.gp .lnk { all: unset; cursor: pointer; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--accent); }
.gp .lnk:focus-visible, .gp .btn:focus-visible { outline: 2px solid var(--gp); outline-offset: 2px; }
.gp .big { font-family: var(--fell); font-size: 28px; line-height: 1.15; }
.gp .res.hit .k { color: #3f7d3a; } .gp .res.miss .k { color: var(--gp); }
.gp ul.ctx { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 14px; }
.gp .src { font-size: 12px; color: var(--ink-soft); }
.gp .src a { color: inherit; }
.gp .finds { display: flex; flex-wrap: wrap; gap: 6px; }
.gp .find { border: 1px solid var(--gp); color: var(--gp); padding: 3px 8px; font-family: var(--mono); font-size: 11px; letter-spacing: .04em; }
.gp .find.lock { border-color: var(--rule); color: var(--ink-soft); opacity: .7; }
.gp .dots { display: flex; gap: 6px; }
.gp .dots i { width: 22px; height: 22px; display: grid; place-items: center; font-style: normal; font-family: var(--mono); font-size: 12px; border: 2px solid var(--ink); background: var(--wash); }
.gp .dots i.hit { background: #3f7d3a; color: #fff; border-color: #2c5a29; }
.gp .dots i.miss { background: var(--gp); color: #fff; }
.gp .dots i.cur { box-shadow: 0 0 0 2px var(--gp); }
.gp .cal { position: relative; height: 14px; background: var(--wash); outline: 1px solid var(--rule); }
.gp .cal i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--gp); }
.gp .cal b { position: absolute; top: -4px; bottom: -4px; border-left: 2px dashed var(--ink); }
.gp h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 6px 0 0; display: flex; }
.gp h3 span:last-child { margin-left: auto; }
.gp table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.gp td { padding: 4px 0; border-bottom: 1px solid var(--rule); }
.gp td.n { text-align: right; font-family: var(--mono); font-size: 12px; white-space: nowrap; }
.gp ul.hist { list-style: none; margin: 0; padding: 0; display: grid; }
.gp ul.hist li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 8px; padding: 5px 0; border-bottom: 1px solid var(--rule); font-size: 13.5px; }
.gp ul.hist li .m { grid-column: 2; font-family: var(--mono); font-size: 11px; color: var(--ink-soft); }
.gp ul.hist button { all: unset; cursor: pointer; }
.gp ul.hist button:hover { text-decoration: underline; }
@media (max-width: 640px) { .gp .qq { font-size: 19px; } .gp .gp-top { grid-template-columns: repeat(3, minmax(0, 1fr)); } }`;
  document.head.appendChild(css);

  const MODES = [["daily", "Daily five"], ["endless", "Endless"], ["here", "About here"], ["record", "Record"]];
  function head() {
    const c = calib(), pts = P.h.reduce((s, h) => s + (h.p || 0), 0);
    return `<div class="seg" role="group" aria-label="Mode">${MODES.map(([m, n]) => `<button data-a="mode" data-m="${m}" aria-pressed="${S.mode === m}">${n}</button>`).join("")}</div>
      <div class="gp-top">
        <div class="stat"><b>${c.n >= 1 ? Math.round(c.r * 100) + "%" : "–"}</b><span>inside your 80% ranges${c.n ? ` (${c.hit}/${c.n})` : ""}</span></div>
        <div class="stat"><b>${P.st.last === today() || P.st.last === dayBefore(today()) ? P.st.n : 0}</b><span>day streak${P.st.best ? ` · best ${P.st.best}` : ""}</span></div>
        <div class="stat"><b>${pts.toLocaleString("en")}</b><span>points</span></div>
      </div>`;
  }
  function dots() {
    const ds = dailyState();
    return `<div class="dots" aria-label="Daily five">${ds.ids.map((id, i) => { const h = ds.done.includes(id) && P.h.slice().reverse().find(x => x.id === id); return `<i class="${h ? (h.hit ? "hit" : "miss") : ""}${S.q && S.q.id === id && S.stage === "ask" ? " cur" : ""}" title="${esc(KIND[(byId(id) || {}).k] || "")}">${h ? (h.hit ? "✓" : "✗") : i + 1}</i>`; }).join("")}</div>`;
  }
  function ticks(q) {
    const [a, b] = dom(q), out = [];
    for (let e = Math.ceil(Math.log10(a)); e <= Math.floor(Math.log10(b)); e++) out.push(Math.pow(10, e));
    const step = Math.ceil(out.length / 6);
    return out.filter((_, i) => i % step === 0).map(v => `<span class="tk" style="left:${toT(q, v) * 100}%">${esc(U[q.u].s(v))}</span>`).join("");
  }
  function dual(q, truth) {
    const a = toT(q, Math.min(S.lo, S.hi)), b = toT(q, Math.max(S.lo, S.hi));
    return `<div class="dual" data-dual>
      <div class="tr"></div><div class="rg" style="left:${a * 100}%;width:${(b - a) * 100}%"></div>${ticks(q)}
      ${truth ? `<div class="truth" style="left:${toT(q, q.v) * 100}%" title="The answer"></div>` : `
      <div class="h" data-h="lo" role="slider" tabindex="0" aria-label="Low end" aria-valuetext="${esc(U[q.u].f(S.lo))}" style="left:${toT(q, S.lo) * 100}%">◀</div>
      <div class="h" data-h="hi" role="slider" tabindex="0" aria-label="High end" aria-valuetext="${esc(U[q.u].f(S.hi))}" style="left:${toT(q, S.hi) * 100}%">▶</div>`}
    </div>`;
  }
  const shown = (q, v) => U[q.u].pct ? String(sig(v * 100, 3)) : v >= 1e6 && q.u !== "mkm2" ? big(v).replace(" million", "m").replace(" billion", "b") : String(sig(v, 3));
  function askHtml() {
    const q = S.q, u = U[q.u], hi = Math.max(S.lo, S.hi), lo = Math.min(S.lo, S.hi);
    const ds = S.mode === "daily" ? dailyState() : null;
    return `${ds ? dots() : ""}<form class="card" id="gp-form" autocomplete="off">
      <div class="k"><span>${esc(KIND[q.k])}</span><span>${esc(fy(q.y))}</span></div>
      <p class="qq">${esc(q.p)}</p>
      <p class="hint">Give a range you are 80% sure holds the true number. Drag the ends, tap the bar or type (50k, 1.2m${u.pct ? ", 30 for 30%" : ""}). The map is fair game.</p>
      ${dual(q)}
      <div class="ins"><label>Low<input id="gp-lo" inputmode="decimal" value="${esc(shown(q, lo))}"></label><span class="to">to</span><label>High<input id="gp-hi" inputmode="decimal" value="${esc(shown(q, hi))}"></label></div>
      <p class="wide" id="gp-wide">${esc(u.f(lo))} to ${esc(u.f(hi))} · ×${sig(hi / lo, 2)} wide · a hit scores ${pointsFor(lo, hi)}</p>
      <div class="row"><button class="btn pri" type="submit">Lock it in</button>${S.mode !== "daily" ? `<button class="lnk" type="button" data-a="skip">Skip</button>` : ""}</div>
    </form>`;
  }
  function revealHtml() {
    const q = S.q, r = S.res, u = U[q.u], d = D();
    const srcs = (q.s || []).map(i => d.src[i]).filter(Boolean);
    const more = S.mode === "daily" ? (dailyState().next ? "Next question" : "See today's five") : "Next question";
    return `${S.mode === "daily" ? dots() : ""}<div class="card res ${r.hit ? "hit" : "miss"}">
      <div class="k"><span>${r.hit ? `Inside your range · +${r.pts}` : `Outside · too ${r.side} by ×${sig(r.off, 2)}`}</span><span>${esc(fy(q.y))}</span></div>
      <p class="hint">${esc(q.p)}</p>
      <p class="big">${esc(u.f(q.v))}</p>
      ${dual(q, true)}
      <p class="wide">You said ${esc(u.f(r.lo))} to ${esc(u.f(r.hi))}</p>
      ${(q.ctx || []).filter(Boolean).length ? `<ul class="ctx">${q.ctx.filter(Boolean).map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${S.finds.length ? `<div class="finds">${S.finds.map(id => { const f = FINDS.find(x => x[0] === id); return f ? `<span class="find" title="${esc(f[2])}">★ ${esc(f[1])}</span>` : ""; }).join("")}</div>` : ""}
      <p class="src">${srcs.map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite)}</a>` : esc(s.cite)).join(" · ")} · ${esc(q.conf || "")}</p>
      <div class="row"><button class="btn pri" data-a="next">${more}</button><button class="btn" data-a="replay">▶ Replay</button><button class="lnk" data-a="why">Ask the panel why</button></div>
    </div>`;
  }
  function shareText(ds) {
    const marks = ds.ids.map(id => { const h = P.h.slice().reverse().find(x => x.id === id); return h ? (h.hit ? "🟩" : "🟥") : "⬜"; }).join("");
    const hits = ds.ids.filter(id => (P.h.slice().reverse().find(x => x.id === id) || {}).hit).length;
    return `Guess the past ${ds.d}\n${marks} ${hits}/${DAILY_N} inside my 80% ranges`;
  }
  function dailyDoneHtml() {
    const ds = dailyState(), list = ds.ids.map(id => [byId(id), P.h.slice().reverse().find(x => x.id === id)]);
    const hits = list.filter(x => x[1] && x[1].hit).length;
    return `${dots()}<div class="card"><div class="k"><span>Today's five, done</span><span>${esc(ds.d)}</span></div>
      <p class="big">${hits} of ${DAILY_N} inside your ranges</p>
      <p class="hint">${hits === 4 ? "Four of five is exactly what a calibrated 80% looks like." : hits === 5 ? "Five of five: perfect, or your ranges were wide. Check the points." : "Over many days, a calibrated player lands four in five."} Streak: ${P.st.n} day${P.st.n === 1 ? "" : "s"}. A new five arrives tomorrow.</p>
      <ul class="hist">${list.map(([q, h]) => q && h ? `<li><span>${h.hit ? "✓" : "✗"}</span><button data-a="look" data-id="${esc(q.id)}">${esc(q.p)}</button><span class="m">${esc(U[q.u].f(q.v))} · you said ${esc(U[q.u].f(h.lo))}–${esc(U[q.u].f(h.hi))}</span></li>` : "").join("")}</ul>
      <div class="row"><button class="btn pri" data-a="mode" data-m="endless">Keep playing</button><button class="btn" data-a="mode" data-m="here">About here</button><button class="lnk" data-a="share">Copy result</button></div>
    </div>`;
  }
  function recordHtml() {
    const c = calib(), rows = Object.entries(KIND).map(([k, n]) => [n, calib(P.h.filter(h => (byId(h.id) || {}).k === k))]).filter(x => x[1].n);
    const last = calib(P.h.slice(-20));
    return `<div class="card"><div class="k"><span>Calibration</span><span>${c.n} answers</span></div>
      <p class="big">${c.n ? `You said 80%. You were right ${Math.round(c.r * 100)}%.` : "No answers yet."}</p>
      ${c.n ? `<div class="cal" title="Your hit rate; the dashed line is 80%"><i style="width:${c.r * 100}%"></i><b style="left:${TARGET * 100}%"></b></div>` : ""}
      <p class="hint">${esc(verdict(c))}${c.n > 20 ? ` Your last 20: ${Math.round(last.r * 100)}%.` : ""}</p>
      ${rows.length ? `<table>${rows.map(([n, x]) => `<tr><td>${esc(n)}</td><td class="n">${x.hit}/${x.n} · ${Math.round(x.r * 100)}%</td></tr>`).join("")}</table>` : ""}
    </div>
    <h3><span>Finds</span><span>${Object.keys(P.f).length}/${FINDS.length}</span></h3>
    <div class="finds">${FINDS.map(([id, n, t]) => `<span class="find${P.f[id] ? "" : " lock"}" title="${esc(t)}">${P.f[id] ? "★" : "☆"} ${esc(n)}</span>`).join("")}</div>
    <h3><span>Recent answers</span><span>${P.h.length}</span></h3>
    <ul class="hist">${P.h.slice(-15).reverse().map(h => { const q = byId(h.id); return q ? `<li><span>${h.hit ? "✓" : "✗"}</span><button data-a="look" data-id="${esc(q.id)}">${esc(q.p)}</button><span class="m">${esc(U[q.u].f(q.v))} · you said ${esc(U[q.u].f(h.lo))}–${esc(U[q.u].f(h.hi))}</span></li>` : ""; }).join("")}</ul>
    <p class="hint">${Q().length} questions, every answer read from a sourced measure at a year it gives. Progress stays in this browser.</p>`;
  }
  function render() {
    if (!el || el.hidden) return;
    if (!D()) { el.innerHTML = `<div class="gp"><p class="hint">The questions are still loading…</p></div>`; setTimeout(() => { if (D() && !S.q && S.mode !== "record") pick(S.mode); else render(); }, 600); return; }
    const body = S.mode === "record" ? recordHtml() : S.stage === "dailydone" ? dailyDoneHtml() : !S.q ? "" : S.stage === "reveal" ? revealHtml() : askHtml();
    el.innerHTML = `<div class="gp">${head()}${body}</div>`;
    if (S.stage === "ask" && S.q && S.mode !== "record") wireDual();
  }
  // Only the range parts change while dragging: no full re-render per pointer move.
  function paintRange() {
    const q = S.q, u = U[q.u], lo = Math.min(S.lo, S.hi), hi = Math.max(S.lo, S.hi), rg = el.querySelector(".dual .rg");
    if (!rg) return;
    rg.style.left = toT(q, lo) * 100 + "%"; rg.style.width = (toT(q, hi) - toT(q, lo)) * 100 + "%";
    for (const h of el.querySelectorAll(".dual .h")) { const v = h.dataset.h === "lo" ? S.lo : S.hi; h.style.left = toT(q, v) * 100 + "%"; h.setAttribute("aria-valuetext", u.f(v)); }
    const w = el.querySelector("#gp-wide"); if (w) w.textContent = `${u.f(lo)} to ${u.f(hi)} · ×${sig(hi / lo, 2)} wide · a hit scores ${pointsFor(lo, hi)}`;
  }
  function syncInputs() { const lo = el.querySelector("#gp-lo"), hi = el.querySelector("#gp-hi"); if (lo && document.activeElement !== lo) lo.value = shown(S.q, Math.min(S.lo, S.hi)); if (hi && document.activeElement !== hi) hi.value = shown(S.q, Math.max(S.lo, S.hi)); }
  function wireDual() {
    const box = el.querySelector("[data-dual]"); if (!box) return;
    let drag = null;
    const tAt = ev => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); };
    box.addEventListener("pointerdown", ev => {
      const t = tAt(ev), q = S.q;
      drag = ev.target.dataset && ev.target.dataset.h ? ev.target.dataset.h : Math.abs(t - toT(q, S.lo)) <= Math.abs(t - toT(q, S.hi)) ? "lo" : "hi";
      S[drag] = tidy(q, fromT(q, t)); paintRange(); syncInputs();
      box.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    box.addEventListener("pointermove", ev => { if (!drag) return; S[drag] = tidy(S.q, fromT(S.q, tAt(ev))); paintRange(); syncInputs(); });
    const up = () => { if (!drag) return; drag = null; if (S.lo > S.hi) [S.lo, S.hi] = [S.hi, S.lo]; paintRange(); syncInputs(); };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    box.addEventListener("keydown", ev => {
      const h = ev.target.dataset && ev.target.dataset.h; if (!h) return;
      const f = ev.shiftKey ? 1.5 : 1.12, k = ev.key;
      if (k === "ArrowRight" || k === "ArrowUp") S[h] = tidy(S.q, S[h] * f); else if (k === "ArrowLeft" || k === "ArrowDown") S[h] = tidy(S.q, S[h] / f); else return;
      ev.preventDefault(); ev.stopPropagation(); paintRange(); syncInputs();
    });
    for (const id of ["lo", "hi"]) {
      const inp = el.querySelector("#gp-" + id);
      inp.addEventListener("input", () => { const v = parse(inp.value, S.q.u); if (v) { const [a, b] = dom(S.q); S[id] = Math.max(a, Math.min(b, v)); paintRange(); } });
      inp.addEventListener("keydown", ev => ev.stopPropagation());   // typing never steps the year or plays a story
      inp.addEventListener("blur", () => { if (S.lo > S.hi) [S.lo, S.hi] = [S.hi, S.lo]; syncInputs(); paintRange(); });
    }
  }
  function onClick(ev) {
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "mode") { if (b.dataset.m === "record") { S.mode = "record"; render(); } else pick(b.dataset.m); }
    else if (a === "next") pick(S.mode);
    else if (a === "skip") pick(S.mode);
    else if (a === "replay") playReveal();
    else if (a === "why") { if (S.q && api.ask) api.ask(S.q.ask); }
    else if (a === "share") { const t = shareText(dailyState()); try { navigator.clipboard.writeText(t); b.textContent = "Copied"; } catch (e) { b.textContent = t; } }
    else if (a === "look") {
      const q = byId(b.dataset.id); if (!q) return;
      const h = P.h.slice().reverse().find(x => x.id === q.id);
      S.q = q; S.res = h ? { ...judge(q, h.lo, h.hi), lo: h.lo, hi: h.hi } : null; S.finds = [];
      if (S.res) { S.stage = "reveal"; if (S.mode === "record") S.mode = "endless"; render(); playReveal(); }
    }
  }

  ATLAS.tab({
    id: "guess", name: "Guess",
    mount(pane, a) {
      el = pane; api = a;
      el.addEventListener("click", onClick);
      el.addEventListener("submit", ev => { if (ev.target.id === "gp-form") { ev.preventDefault(); lockIn(); } });
      // When a reveal story ends, hand the panel back on the result instead of the Director's "up next" card.
      const dir = A.world && A.world.director;
      if (dir && dir.onEnd) dir.onEnd(st => { if (st && String(st.id).startsWith("guess:")) { dir.leave(); api.setTab("guess"); } });
    },
    show() {
      if (!S.q && S.mode !== "record" && S.stage !== "dailydone" && D()) pick(S.mode);
      else { render(); if (S.stage === "ask") stage(); }
    },
  });
  A.guess = { list: Q, daily: () => daily(today()), calibration: () => calib(), play: id => { const q = byId(id); if (!q) return false; S.q = q; S.stage = "ask"; S.mode = "endless"; startRange(q); api.setTab("guess"); return true; } };
})();
