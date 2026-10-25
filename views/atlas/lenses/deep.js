// Up close, for any place and period. The map view is the region: pan or zoom anywhere and pick a span, and the tab
// assembles what happened there by the month from the world index (views/atlas/world/world.js: the global Wikidata
// chronicle, Pantheon lives, the kernel, dense packs), with the study storylines that pass through and a live AI
// draft for windows the data leaves thin. Lenses: Chronicle (dated events, things founded and ended, works made)
// and Lives (births, deaths, people living or working here). The month cursor is shared on ATLAS.deep.m
// (year * 12 + month - 1): lenses, the pixel map's zoom detail and the travellers layer read it while the page's
// year is that month's year, and fall back to the whole year when the main slider moves.
(function () {
  const W = window.ATLAS.world;
  if (!W || !W.at) { console.warn("Up close needs views/atlas/world/world.js"); return; }
  const DS = window.ATLAS.deep = Object.assign(window.ATLAS.deep || {}, { m: null, story: null, focus: null });
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { mOf, fmtDate, fmtM, fmtYear } = W;
  const FAM = { w: ["War", "cross", "#a3321f"], d: ["Diplomacy & law", "square", "#1d4f6e"], u: ["Revolt & unrest", "triangle", "#b8641c"],
    x: ["Disaster", "diamond", "#5f6b2a"], c: ["Culture, trade & faith", "circle", "#6a4c93"], p: ["People", "circle", "#a24b6e"] };
  const VERB = { e: "", b: "born", d: "died", r: "lived or worked here", f: "founded or built", z: "ended", w: "made", s: "" };
  const nice = s => String(s || "").replace(/_/g, " ");

  // ---------- where and when ----------
  // The view's box, a little larger than the screen so marks do not pop at the edges.
  function viewBox(grow = 1.15) {
    const v = ATLAS.api && ATLAS.api.view && ATLAS.api.view();
    if (!v) return null;
    const w = Math.min(360, v.w * grow), h = Math.min(170, v.h * grow);
    return [Math.max(-180, v.lon - w / 2), Math.max(-85, v.lat - h / 2), Math.min(180, v.lon + w / 2), Math.min(85, v.lat + h / 2)];
  }
  // The window a lens shows: the month on the cursor and the two before it, or the whole year.
  const cursor = y => DS.m != null && Math.floor(DS.m / 12) === y ? { m: DS.m, m0: DS.m - 2, m1: DS.m, month: true } : { m: y * 12, m0: y * 12, m1: y * 12 + 11, month: false };
  const fade = (r, c) => !c.month ? 1 : r.prec === "y" ? 0.45 : Math.max(0.3, 1 - 0.25 * (c.m - r.m));
  const wdSrc = r => typeof r.ref === "number" && r.ref ? { cite: `Wikidata Q${r.ref} (CC0)`, url: `https://www.wikidata.org/wiki/Q${r.ref}` } : null;
  const SRC = { base: "the world index (Wikidata, Pantheon, the kernel)", ai: "a live AI draft (not checked)" };
  function card(r) {
    const when = fmtDate(r.d) + (r.e && r.e !== r.d ? ` to ${fmtDate(r.e)}` : "");
    const what = r.k === "e" ? nice(r.sub) : `${r.k === "b" || r.k === "d" || r.k === "r" ? nice(r.sub) || "Person" : nice(r.sub)} · ${VERB[r.k]}`;
    const meta = [when, r.x.place, r.x.part ? "part of " + r.x.part : null, r.x.born && r.k !== "b" ? "born " + fmtDate(r.x.born) : null,
      r.x.died && r.k !== "d" ? "died " + fmtDate(r.x.died) : null, r.conf ? W.CONF[r.conf] : null, r.x.pin ? "pinned at its location" : null].filter(Boolean).join(" · ");
    const pk = r.src && r.src.startsWith("pack:") ? W.packs().find(p => "pack:" + p.id === r.src) : null;
    return { kick: `${what} · ${FAM[r.f] ? FAM[r.f][0] : ""}`, title: r.name, year: Math.floor(r.m / 12), lon: r.lon, lat: r.lat, meta,
      body: [r.x.desc, r.x.why].filter(Boolean).join(" "), why: "",
      sources: [wdSrc(r), r.x.src ? { cite: r.x.src } : null, { cite: "Up close: " + (pk ? "dense pack " + pk.name : SRC[r.src] || SRC.base) + (r.x.status === "draft" ? " · draft" : "") }].filter(Boolean) };
  }
  const shapeOf = r => r.k === "b" ? "triangle" : r.k === "d" ? "cross" : r.k === "r" ? "circle" : r.k === "f" ? "square" : r.k === "z" ? "cross" : r.k === "w" ? "diamond" : FAM[r.f] ? FAM[r.f][1] : "circle";
  const colorOf = r => (FAM[r.f] || FAM.c)[2];

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
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
.uc .seg { display: inline-flex; flex-wrap: wrap; }
.uc .ctl .seg { margin-left: auto; }
.uc .seg button { border-radius: 0; margin-left: -1px; }
.uc .seg button:first-child { border-radius: 4px 0 0 4px; } .uc .seg button:last-child { border-radius: 0 4px 4px 0; }
.uc .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.uc input[type=range] { width: 100%; accent-color: var(--y-deep); }
.uc .chips { display: flex; flex-wrap: wrap; gap: 5px; }
.uc .chips button { border: 1px solid var(--rule); background: transparent; border-radius: 999px; padding: 3px 10px; cursor: pointer; font-size: 13px; color: var(--ink); text-align: left; }
.uc .chips button small { color: var(--ink-soft); font-size: 11.5px; margin-left: 4px; }
.uc .chips button[aria-pressed="true"] { border-color: var(--y-deep); background: color-mix(in srgb, var(--y-deep) 14%, transparent); }
.uc .next { all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 2px; border: 1.5px solid var(--y-deep); border-radius: 6px; padding: 9px 12px; background: var(--card); }
.uc .next b { font-family: var(--fell); font-weight: 400; font-size: 17px; line-height: 1.25; }
.uc .next span { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .08em; }
.uc .next small { font-size: 13px; color: var(--ink-soft); }
.uc .next:hover, .uc .next:focus-visible { background: color-mix(in srgb, var(--y-deep) 10%, var(--card)); }
.uc .steps { display: grid; gap: 1px; max-height: 280px; overflow: auto; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.uc .row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 7.4em 1fr; gap: 0 10px; padding: 4px 6px; border-radius: 3px; font-size: 14px; line-height: 1.35; }
.uc .row:hover, .uc .row:focus-visible { background: var(--wash); }
.uc .row.on { background: color-mix(in srgb, var(--y-deep) 14%, transparent); }
.uc .row.past { color: var(--ink-soft); }
.uc .row.draft { font-style: italic; }
.uc .row .d { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); padding-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uc .row i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; background: var(--fc); vertical-align: 1px; }
.uc .row i.triangle { clip-path: polygon(50% 0, 100% 100%, 0 100%); } .uc .row i.diamond { transform: rotate(45deg) scale(.85); } .uc .row i.circle { border-radius: 50%; }
.uc .row i.cross { background: none; position: relative; } .uc .row i.cross::before { content: "\\00d7"; position: absolute; left: -1px; top: -6px; color: var(--fc); font-size: 13px; font-weight: 700; }
.uc .row small { display: block; color: var(--ink-soft); font-size: 12.5px; }
.uc .tagd { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; border: 1px dashed var(--ink-soft); border-radius: 3px; padding: 0 3px; margin-left: 4px; color: var(--ink-soft); font-style: normal; }
.uc .quiet { all: unset; cursor: pointer; font-size: 12.5px; color: var(--accent); text-decoration: underline; }
.uc .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.uc .stat { border: 1px solid var(--rule); border-radius: 3px; padding: 6px 8px; background: var(--card); display: grid; gap: 2px; }
.uc .stat b { font-family: var(--fell); font-weight: 400; font-size: 20px; line-height: 1.1; overflow-wrap: anywhere; }
.uc .stat span { font-size: 11.5px; color: var(--ink-soft); line-height: 1.3; }
.uc .depth { display: grid; gap: 4px; border: 1px solid var(--rule); border-radius: 4px; padding: 8px 10px; background: var(--card); }
.uc .depth .bar { height: 6px; border-radius: 3px; background: var(--wash); overflow: hidden; }
.uc .depth .bar i { display: block; height: 100%; background: var(--y-deep); }
.uc .depth p { margin: 0; font-size: 13px; color: var(--ink-soft); }
.uc .depth .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.uc .depth .acts button { border: 1px solid var(--y-deep); background: transparent; color: var(--ink); border-radius: 4px; padding: 4px 9px; cursor: pointer; font-size: 13px; }
.uc .note { font-size: 12px; color: var(--ink-soft); margin: 0; }
.uc .empty { font-size: 13.5px; color: var(--ink-soft); margin: 0; font-style: italic; }
.uc details summary { cursor: pointer; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); }
.uc .era { margin: 8px 0 3px; font-size: 12px; color: var(--ink-soft); }
`;
  document.head.appendChild(css);

  // ---------- storylines ----------
  let STORIES = [];
  W.storylines().then(s => { STORIES = s.map((st, i) => ({ ...st, i, steps: st.steps.map((p, j) => ({ ...p, j, m: mOf(p.date) })) })); renderSoon(); if (DS.story != null) redraw(); });
  const story = () => DS.story != null ? STORIES.find(s => s.id === DS.story) : null;
  // Journeys: a storyline's steps that name the same person, in order.
  function journeys(s) {
    const by = {};
    for (const st of s.steps) for (const w of st.who || []) (by[w] || (by[w] = [])).push(st);
    return Object.entries(by).filter(([, a]) => a.length >= 2).map(([who, a]) => ({ id: s.id + ":" + who, who, pts: a.map(st => [st.lon, st.lat]), steps: a }));
  }

  // ---------- lens: Chronicle ----------
  function visible(ctx, kinds) {
    const c = cursor(ctx.year), bbox = viewBox(1.3);
    const list = W.at({ m0: c.m0, m1: c.m1 }, bbox, { kinds });
    const cap = Math.round(30 * Math.pow(Math.max(1, ctx.k), 1.2));
    return { c, list: list.slice(0, cap) };
  }
  const redraw = () => { if (ATLAS.api) ATLAS.api.redraw(); };
  W.onLoad(() => { redraw(); renderSoon(); });
  ATLAS.lens({
    id: "deep", name: "Chronicle", family: "power", color: "#b8442c", on: false,
    guide: ["military", "order", "law"],
    key: [["cross", "War"], ["square", "Diplomacy & law; square outline: founded or built"], ["triangle", "Revolt & unrest"], ["diamond", "Disaster; work made"], ["dot", "Culture, trade & faith"], ["line", "Storyline and the journeys of its people"]],
    index: () => STORIES.length ? "Study storylines (Up close tab): " + STORIES.map(s => `${s.title} (${s.region}, ${fmtYear(s.start)}-${fmtYear(s.end)})`).join("; ") : "",
    draw(ctx) {
      const { c, list } = visible(ctx, "efzw");
      for (const f in FAM) {
        const L = list.filter(r => r.f === f || (f === "c" && !FAM[r.f]));
        if (!L.length) continue;
        ctx.pins(L, { key: r => r.id, shape: shapeOf, color: colorOf, ghost: r => r.conf >= 2 || r.src === "ai",
          label: r => r.rank >= 25 || ctx.k >= 6 || r.id === DS.focus ? r.name.replace(/^(Battle|Siege) of /, "") : null,
          title: r => `${fmtDate(r.d)} · ${r.name}`, card, fill: r => r.k === "f" ? 0.15 : 0.85,
          always: r => r.id === DS.focus || (c.month && r.m === c.m && r.rank >= 15), hi: r => r.id === DS.focus,
          fade: r => fade(r, c), size: r => 3.2 + Math.min(2.5, Math.sqrt(r.rank) / 3), pri: r => (r.id === DS.focus ? 60 : 3) + Math.min(5, r.rank / 20) });
      }
      // The storyline under way: its path, the journeys of the people it names, and its steps.
      const s = story();
      if (s) {
        const y = ctx.year;
        ctx.paths([{ id: s.id, pts: s.steps.map(st => [st.lon, st.lat]) }], { color: "#6a4c93", conf: "likely", width: 1.4, alpha: 0.55, title: () => s.title });
        ctx.paths(journeys(s), { color: "#a24b6e", width: 2.2, alpha: 0.8, arrow: true, title: j => `${j.who}: ${j.steps.length} stops in this storyline`,
          card: j => ({ kick: "Journey in " + s.title, title: j.who, body: j.steps.map(st => `${fmtDate(st.date)} ${st.place_name || st.name}`).join(" → "), sources: [] }) });
        ctx.pins(s.steps, { key: st => s.id + st.j, shape: st => FAM[(st.family || "c")[0]] ? FAM[st.family[0]][1] : "circle", color: st => FAM[(st.family || "c")[0]] ? FAM[st.family[0]][2] : FAM.c[2],
          label: st => Math.abs(Math.floor(st.m / 12) - y) <= 3 || ctx.k >= 4 ? st.name : null, always: st => st.j === DS.step,
          hi: st => st.j === DS.step, fade: st => Math.abs(Math.floor(st.m / 12) - y) <= 1 ? 1 : 0.45, size: 5.5, pri: st => st.j === DS.step ? 70 : 20,
          title: st => `${fmtDate(st.date)} · ${st.name}`, card: st => stepCard(s, st) });
      }
    },
    here(ctx, at) {
      const c = cursor(ctx.year);
      return W.near(at.lon, at.lat, Math.max(at.r || 300, 150), { m0: c.m - 120, m1: c.m + 120 }, { kinds: "efzw", limit: 40 })
        .sort((a, b) => Math.abs(a.m - c.m) - Math.abs(b.m - c.m) || b.rank - a.rank).slice(0, 8)
        .map(r => ({ title: r.name, year: fmtDate(r.d), why: r.x.desc || nice(r.sub), tag: r.src === "ai" ? "draft" : null, dim: Math.abs(r.m - c.m) > 24, card: card(r) }));
    },
    now(ctx) {
      const c = cursor(ctx.year);
      return W.at({ m0: c.m0, m1: c.m1 }, null, { kinds: "e", limit: 6 }).map(r => ({ title: r.name, year: fmtDate(r.d), why: r.x.desc || nice(r.sub), card: card(r) }));
    },
  });
  function stepCard(s, st) {
    return { kick: `Storyline · ${s.title}`, title: st.name, year: Math.floor(st.m / 12), lon: st.lon, lat: st.lat,
      meta: [fmtDate(st.date) + (st.end_date ? ` to ${fmtDate(st.end_date)}` : ""), st.place_name, st.date_note, (st.who || []).join(", "), "study text: draft, waiting for the judge"].filter(Boolean).join(" · "),
      body: st.what || "", why: st.why || "",
      sources: [st.wikipedia ? { cite: "Wikipedia: " + st.wikipedia, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(st.wikipedia.replace(/ /g, "_")) } : null,
        st.wikidata ? { cite: `Wikidata ${st.wikidata}`, url: `https://www.wikidata.org/wiki/${st.wikidata}` } : null, ...(st.sources || [])].filter(Boolean) };
  }

  // ---------- lens: Lives ----------
  ATLAS.lens({
    id: "deeplives", name: "Lives", family: "peoples", color: "#a24b6e", on: false,
    guide: ["people"],
    key: [["triangle", "Born here this month or year"], ["cross", "Died here"], ["ring", "Lived, worked or held office here"]],
    draw(ctx) {
      const c = cursor(ctx.year), bbox = viewBox(1.3), cap = Math.round(18 * Math.pow(Math.max(1, ctx.k), 1.2));
      const list = W.at({ m0: c.m0, m1: c.m1 }, bbox, { kinds: "bd" }).slice(0, cap);
      // People living or working here: anyone whose stay overlaps this year, fewer of them.
      const live = W.at({ m0: c.m - 12 * 40, m1: c.m1 }, bbox, { kinds: "r" }).filter(r => r.me == null ? c.m - r.m < 12 * 25 : r.me >= c.m0).slice(0, Math.round(cap / 2));
      ctx.pins([...list, ...live], { key: r => r.id + r.d, shape: shapeOf, color: "#a24b6e", ghost: r => r.conf >= 2 || r.src === "ai", fill: r => r.k === "r" ? 0.2 : 0.85,
        label: r => r.k === "d" ? `† ${r.name}` : r.name, title: r => `${r.name} ${VERB[r.k]} · ${fmtDate(r.d)}${r.x.place ? " · " + r.x.place : ""}`, card,
        fade: r => r.k === "r" ? 0.7 : fade(r, c), pri: r => 2 + r.rank / 30, size: r => 3 + Math.min(2.5, Math.sqrt(r.rank) / 4) });
    },
    here(ctx, at) {
      const y = ctx.year;
      return W.near(at.lon, at.lat, 80, { m0: (y - 90) * 12, m1: (y + 30) * 12 }, { kinds: "bdr", limit: 30 }).slice(0, 6)
        .map(r => ({ title: `${r.name} ${VERB[r.k]}`, year: fmtDate(r.d), why: nice(r.sub), dim: Math.abs(Math.floor(r.m / 12) - y) > 40, card: card(r) }));
    },
  });

  // ---------- tab: Up close ----------
  const T = { el: null, api: null, playing: 0, speed: 1, last: 0, span: "auto", quieted: null, busy: false, msg: "", sample: undefined, allOpen: false };
  const QUIET = ["people", "war", "ideas", "money", "disease"];
  const SPANS = [["decade", "Decade", 10], ["life", "A lifetime", 70], ["century", "Century", 100], ["era", "Five centuries", 500]];
  // The span the scrubber covers: the storyline's, a dense pack's when the view sits in one, or one around the year.
  function spanNow() {
    const y = T.api ? T.api.year : 1800, s = story();
    if (T.span === "story" && s) return { m0: mOf(s.steps[0].date), m1: mOf(s.steps[s.steps.length - 1].date) + 11, name: s.title };
    if (T.span === "auto" || T.span === "pack") {
      const pk = packHere(y);
      if (pk) return { m0: pk.t0 * 12, m1: pk.t1 * 12 + 11, name: pk.name, pack: pk };
    }
    const n = (SPANS.find(a => a[0] === T.span) || SPANS[2])[2], a = n >= 100 ? Math.floor(y / n) * n : y - Math.floor(n / 2);
    return { m0: a * 12, m1: (a + n) * 12 - 1, name: `${fmtYear(a)}–${fmtYear(a + n - 1)}` };
  }
  function packHere(y) {
    const b = viewBox(1), v = ATLAS.api && ATLAS.api.view();
    if (!b || !v) return null;
    return W.packs().filter(p => y >= p.t0 && y <= p.t1 && v.lon >= p.bbox[0] && v.lon <= p.bbox[2] && v.lat >= p.bbox[1] && v.lat <= p.bbox[3])
      .sort((a, c) => (a.bbox[2] - a.bbox[0]) - (c.bbox[2] - c.bbox[0]))[0] || null;
  }
  function setMonth(m, opts = {}) {
    const sp = spanNow();
    m = Math.max(sp.m0, Math.min(sp.m1, Math.round(m)));
    const y = Math.floor(m / 12), changed = T.api.year !== y;
    DS.m = m;
    if (changed) T.api.setYear(y, false); else T.api.redraw();
    if (ATLAS.pixelRefresh) try { ATLAS.pixelRefresh(); } catch (err) { console.error(err); }
    renderSoon(opts.now);
  }
  let rt = 0;
  function renderSoon(now) { if (!T.el) return; if (now) { cancelAnimationFrame(rt); rt = 0; render(); } else if (!rt) rt = requestAnimationFrame(() => { rt = 0; render(); }); }
  function stop() { if (T.playing) { cancelAnimationFrame(T.playing); T.playing = 0; renderSoon(true); } }
  function play() {
    if (T.playing) return stop();
    const sp = spanNow();
    if (DS.m == null || DS.m >= sp.m1) DS.m = sp.m0;
    T.last = performance.now(); let acc = 0;
    const tick = now => { acc += (now - T.last) / 1000 * T.speed; T.last = now; if (acc >= 1) { const n = Math.floor(acc); acc -= n; setMonth(DS.m + n); if (DS.m >= spanNow().m1) return stop(); } T.playing = requestAnimationFrame(tick); };
    T.playing = requestAnimationFrame(tick);
    renderSoon(true);
  }
  function goStep(s, st, fly = true) {
    stop();
    DS.story = s.id; DS.step = st.j; DS.focus = null;
    if (!ATLAS.isOn("deep")) T.api.setOn("deep", true);
    if (T.span !== "story") T.span = "story";
    if (fly) T.api.fly({ lon: st.lon, lat: st.lat, span: Math.max(6, Math.min(30, (s.view && s.view.span || 20) / 2.5)) }, 900);
    setMonth(st.m, { now: true });
  }
  function goRow(r) {
    stop(); DS.focus = r.id;
    T.api.fly({ lon: r.lon, lat: r.lat, span: Math.max(3, (ATLAS.api.view() || { w: 20 }).w / 1.6) }, 800);
    setMonth(r.m, { now: true });
    T.api.select(card(r));
  }
  // Rows here and now, widening the window until there is enough to read: this month, this year, five years, a generation.
  function hereNow(m, bbox) {
    const tries = [[m, m, "this month"], [Math.floor(m / 12) * 12, Math.floor(m / 12) * 12 + 11, "this year"], [m - 60, m + 60, "within five years"], [m - 300, m + 300, "within a generation"], [m - 1200, m + 1200, "within a century"]];
    for (const [a, b, label] of tries) {
      const rows = W.at({ m0: a, m1: b }, bbox, { kinds: "efzw" });
      if (rows.length >= 6 || label === "within a century") return { rows, label };
    }
  }
  const icon = r => `<i class="${shapeOf(r)}" style="--fc:${colorOf(r)}"></i>`;
  const rowHtml = (r, extra = "") => `<button class="row${extra}${r.src === "ai" ? " draft" : ""}" data-row="${esc(r.id)}"><span class="d">${esc(fmtDate(r.d))}</span><span>${icon(r)}${esc(r.name)}${r.src === "ai" ? '<span class="tagd">draft</span>' : ""}${r.x.desc || r.k !== "e" ? `<small>${esc([r.k !== "e" ? nice(r.sub) + (VERB[r.k] ? " · " + VERB[r.k] : "") : "", r.x.desc].filter(Boolean).join(" · "))}</small>` : ""}</span></button>`;
  let ROWS = {};
  function render() {
    const el = T.el; if (!el || el.hidden) return;
    const bbox = viewBox(1), v = ATLAS.api.view();
    if (!W.state.index) { el.innerHTML = `<div class="uc"><h2>Up close</h2><p class="empty">${W.state.err ? "The world index is not beside this page (atlas-files/world/). " + esc(W.state.err) : "Loading the world index…"}</p></div>`; return; }
    const sp = spanNow(), m = DS.m != null && DS.m >= sp.m0 && DS.m <= sp.m1 ? DS.m : (T.api.year * 12 >= sp.m0 && T.api.year * 12 <= sp.m1 ? T.api.year * 12 : sp.m0), y = Math.floor(m / 12);
    const rb = v ? W.ruler(v.lon, v.lat, y) : null, pk = packHere(y), s = story();
    const place = pk ? pk.name : rb ? rb.name : "This part of the world";
    const hn = hereNow(m, bbox), ong = W.at({ m0: m, m1: m }, bbox, { kinds: "e", long: 60 }).filter(r => r.me != null && r.m < m && r.me >= m).slice(0, 6);
    const lives = W.at({ m0: m - 2, m1: m }, bbox, { kinds: "bd" }).slice(0, 8);
    const livedHere = W.at({ m0: m - 12 * 30, m1: m }, bbox, { kinds: "r" }).filter(r => r.me == null ? m - r.m < 12 * 25 : r.me >= m).slice(0, 6);
    const dens = W.density(Math.floor(m / 12), bbox);
    const stats = (ATLAS.deepStats || []).flatMap(fn => { try { return fn(y, bbox) || []; } catch (err) { console.error(err); return []; } });
    ROWS = {};
    for (const r of [...hn.rows, ...ong, ...lives, ...livedHere]) ROWS[r.id] = r;
    const here = STORIES.filter(st => st.steps.some(p => p.lon >= bbox[0] && p.lon <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3]) && st.start <= y + 50 && st.end >= y - 50)
      .sort((a, b) => Math.abs((a.start + a.end) / 2 - y) - Math.abs((b.start + b.end) / 2 - y)).slice(0, 8);
    const next = s ? s.steps.find(p => p.m > m) || null : null;
    const isOn = k => ATLAS.isOn && ATLAS.isOn(k);
    const lens = (k, n) => `<button data-lens="${k}" aria-pressed="${isOn(k)}">${n}</button>`;
    const depthPct = { empty: 3, thin: 25, some: 60, rich: 100 }[dens.level];
    const eras = [[-5000, -500, "Before 500 BCE"], [-500, 500, "Classical"], [500, 1450, "500–1450"], [1450, 1800, "1450–1800"], [1800, 1914, "1800–1914"], [1914, 2100, "Since 1914"]];
    el.innerHTML = `<div class="uc">
      <div><h2>${esc(place)}, up close</h2><p class="lede">The map view is the region: pan or zoom anywhere. Time runs by the month; pick a span, a storyline, or play.</p></div>
      <div class="when">${esc(fmtM(m))}<small>${esc(sp.name)}${pk && sp.pack ? " · dense pack" : ""}</small></div>
      <input type="range" min="${sp.m0}" max="${sp.m1}" value="${m}" aria-label="Month">
      <div class="ctl"><button data-a="-12" title="Back a year">«</button><button data-a="-1" title="Back a month">‹</button>
        <button class="play" data-a="play" aria-label="${T.playing ? "Pause" : "Play"}">${T.playing ? "❚❚" : "▶"}</button>
        <button data-a="1" title="Forward a month">›</button><button data-a="12" title="Forward a year">»</button>
        <span class="seg" role="group" aria-label="Speed">${[[1, "1 mo/s"], [12, "1 yr/s"], [120, "10 yr/s"]].map(([v, l]) => `<button data-speed="${v}" aria-pressed="${T.speed === v}">${l}</button>`).join("")}</span></div>
      <div class="seg" role="group" aria-label="Span">${[...(pk ? [["pack", "This pack"]] : []), ...(s ? [["story", "Storyline"]] : []), ...SPANS.map(a => a.slice(0, 2))].map(([k, n]) => `<button data-span="${k}" aria-pressed="${T.span === k || (T.span === "auto" && (k === "pack" && pk || !pk && k === "century"))}">${n}</button>`).join("")}</div>
      <div class="chips">${lens("deep", "Chronicle")}${lens("deeplives", "Lives")}${(ATLAS.lenses || []).length ? "" : ""}</div>
      ${T.quieted && T.quieted.length ? `<p class="note">${T.quieted.length} world-scale lenses are quiet while you study up close. <button class="quiet" data-a="restore">Bring them back</button></p>` : ""}
      <div class="depth"><div class="bar"><i style="width:${depthPct}%"></i></div>
        <p><b>How deep:</b> ${dens.level === "rich" ? "rich" : dens.level === "some" ? "some" : dens.level === "thin" ? "thin" : "almost nothing"} for ${esc(fmtYear(y))} in this view: ${dens.n.toLocaleString()} dated records (${Object.entries(dens.by).map(([k, n]) => `${n} ${W.KIND[k]}`).join(", ") || "none loaded"}).
        ${dens.packs.length ? "Dense pack: " + dens.packs.map(p => esc(p.name)).join(", ") + "." : "No dense pack covers this window yet."}${dens.grid ? ` The coverage grid counts ${dens.grid.n.toLocaleString()} kernel records here for ${esc(fmtYear(dens.grid.bin[0]))}–${esc(fmtYear(dens.grid.bin[1]))}.` : ""}</p>
        <div class="acts"><button data-a="fill">${T.busy === "fill" ? "Asking Claude…" : "Fill in with Claude"}</button><button data-a="tell">${T.busy === "tell" ? "Writing…" : "Write a storyline for here and now"}</button></div>
        ${T.msg ? `<p>${esc(T.msg)}</p>` : ""}</div>
      ${stats.length ? `<div class="stats">${stats.map(o => `<div class="stat"><b>${esc(o.v)}</b><span>${esc(o.t)}</span></div>`).join("")}</div>` : ""}
      <h3>Storylines${s ? "" : " here"}</h3>
      ${s ? `<div class="chips"><button aria-pressed="true" data-story="${esc(s.id)}">${esc(s.title)}<small>${esc(s.region || "")}</small></button>${W.director ? `<button data-a="direct" title="Play this storyline scene by scene on the map">▶ Play on the map</button>` : ""}<button data-a="unstory">Close</button></div>
        <p class="lede">${esc(s.blurb)} <span class="note">(${esc(fmtYear(s.start))}–${esc(fmtYear(s.end))}, ${s.steps.length} steps${journeys(s).length ? ", journeys of " + journeys(s).map(j => esc(j.who)).join(", ") : ""})</span></p>
        ${(() => { const st = next || s.steps[0]; return `<button class="next" data-step="${st.j}"><span>${next ? "Next" : "Start"} · ${esc(fmtDate(st.date))}${st.place_name ? " · " + esc(st.place_name) : ""}</span><b>${esc(st.name)}</b>${st.what ? `<small>${esc(st.what)}</small>` : ""}</button>`; })()}
        <div class="steps">${s.steps.map(st => `<button class="row${st.j === DS.step ? " on" : st.m < m ? " past" : ""}" data-step="${st.j}"><span class="d">${esc(fmtDate(st.date))}</span><span><i class="${FAM[(st.family || "c")[0]] ? FAM[st.family[0]][1] : "circle"}" style="--fc:${FAM[(st.family || "c")[0]] ? FAM[st.family[0]][2] : FAM.c[2]}"></i>${esc(st.name)}${st.why ? `<small>${esc(st.why)}</small>` : ""}</span></button>`).join("")}</div>`
      : here.length ? `<div class="chips">${here.map(st => `<button data-story="${esc(st.id)}">${esc(st.title)}<small>${esc(fmtYear(st.start))}–${esc(fmtYear(st.end))}</small></button>`).join("")}</div>` : `<p class="empty">No storyline passes through this view near ${esc(fmtYear(y))}. Ask Claude to write one, or pick from all of them below.</p>`}
      <details${T.allOpen ? " open" : ""} data-all="1"><summary>All ${STORIES.length} storylines</summary>
        ${eras.map(([a, b, n]) => { const L = STORIES.filter(st => st.start >= a && st.start < b); return L.length ? `<p class="era">${n}</p><div class="chips">${L.map(st => `<button data-story="${esc(st.id)}" aria-pressed="${st.id === DS.story}">${esc(st.title)}<small>${esc(st.region || "")}</small></button>`).join("")}</div>` : ""; }).join("")}</details>
      <h3>Here, ${esc(hn.label)}<span class="n">${hn.rows.length}</span></h3>
      ${hn.rows.length ? `<div class="steps">${hn.rows.slice(0, 50).sort((a, b) => a.m - b.m || b.rank - a.rank).map(r => rowHtml(r, r.m === m ? " on" : "")).join("")}</div>` : `<p class="empty">Nothing dated here within a century. The sources are thin for this place and time: try Fill in with Claude.</p>`}
      ${ong.length ? `<h3>Under way</h3><div>${ong.map(r => `<button class="row" data-row="${esc(r.id)}"><span class="d">since ${esc(fmtDate(r.d))}</span><span>${icon(r)}${esc(r.name)}</span></button>`).join("")}</div>` : ""}
      ${lives.length ? `<h3>Born and died here these months</h3><div>${lives.map(r => rowHtml(r)).join("")}</div>` : ""}
      ${livedHere.length ? `<h3>Living or working here</h3><div>${livedHere.map(r => rowHtml(r)).join("")}</div>` : ""}
      <p class="note">Sources: dated events from Wikidata (CC0), to the day where it knows; births and deaths from Pantheon (CC BY-SA 4.0) and, in dense packs, Wikidata people born, living or working in the box; the Atlas kernel; storyline text written from the Wikipedia article named on each step (draft, waiting for the judge). Rows marked draft come from a live AI answer and are not checked.</p>
    </div>`;
  }

  // ---------- live AI: fill a thin window, or write a storyline for it ----------
  async function getSample() {
    if (T.sample !== undefined) return T.sample;
    try { T.sample = window.claude ? await window.claude.use("sample") : null; } catch { T.sample = null; }
    return T.sample;
  }
  const parse = line => { const s = line.trim().replace(/^```\w*|```$/g, ""); if (!s.startsWith("{") && !s.startsWith("[")) return null; try { return JSON.parse(s); } catch { return null; } };
  async function aiFill(kind) {
    const sample = await getSample();
    if (!sample) { T.msg = "Live drafts need this page open in Claude."; return renderSoon(true); }
    const bbox = viewBox(1), v = ATLAS.api.view(), sp = spanNow(), m = DS.m ?? sp.m0, y = Math.floor(m / 12);
    const rb = W.ruler(v.lon, v.lat, y), have = W.at({ m0: m - 120, m1: m + 120 }, bbox, { kinds: "efzwbd", limit: 40 });
    const where = `the box lon ${bbox[0].toFixed(1)} to ${bbox[2].toFixed(1)}, lat ${bbox[1].toFixed(1)} to ${bbox[3].toFixed(1)} (centre ${v.lon.toFixed(2)}, ${v.lat.toFixed(2)}${rb ? ", ruled by " + rb.name : ""})`;
    const known = have.map(r => `${r.d} ${r.name}`).join("; ") || "nothing";
    T.busy = kind; T.msg = ""; renderSoon(true);
    const key = `${kind}:${v.lon.toFixed(1)},${v.lat.toFixed(1)}:${y}`;
    try {
      if (kind === "fill") {
        const prompt = `You are a careful historian filling gaps in an interactive history map. Place: ${where}. Time: ${fmtYear(y - 10)} to ${fmtYear(y + 10)}.
The map already has: ${known}.
List 12 to 20 other well-documented things that happened in this box in this window: events, buildings or institutions founded, works made, notable people born, died or active there. Only things a good encyclopedia would confirm. No inventions.
Answer with JSON lines only, one object per line, no prose:
{"k":"e|f|z|w|b|d|r","f":"w|d|u|x|c|p","sub":"battle|treaty|founding|book|scholar|...","name":"...","lon":0.0,"lat":0.0,"date":"YYYY or YYYY-MM or YYYY-MM-DD (BCE as -YYYY)","conf":1,"desc":"one plain sentence","wikipedia":"English Wikipedia article title"}
conf: 1 when you are confident of the date, 2 when it is approximate or disputed.`;
        const rows = [];
        let res;
        try { res = await sample([{ role: "user", content: prompt }], { cache: false }); } catch (e) { throw e; }
        for (const line of String(res.text || "").split("\n")) { const o = parse(line); if (o && o.name && isFinite(o.lon) && isFinite(o.lat) && o.date) rows.push([o.k || "e", o.f || "c", o.sub || "event", String(o.name), +o.lon, +o.lat, String(o.date).replace(/^(-?)(\d{1,3})(?=$|-)/, (_, s, d) => s + d.padStart(4, "0")), "", 0, 1, Math.max(1, +o.conf || 1), { desc: o.desc || "", src: o.wikipedia ? "Wikipedia: " + o.wikipedia + " (named by the AI draft; check)" : "" }]); }
        const n = W.draft(rows, { key });
        T.msg = n ? `Claude added ${n} draft rows here (dashed on the map, marked draft in lists). They stay in this browser until the judge checks them.` : "Claude did not return anything usable this time.";
        if (!ATLAS.isOn("deep")) T.api.setOn("deep", true);
      } else {
        const prompt = `You write short study storylines for an interactive history map. Place: ${where}. Around ${fmtYear(y)} (span ${sp.name}).
The map already has: ${known}.
Write one storyline of 8 to 12 steps that explains what mattered here then, moving across the place, mixing politics, economy, everyday life and ideas. Only well-documented facts; use year precision when unsure.
Answer with JSON only, one object: {"title":"...","blurb":"one sentence question it answers","steps":[{"date":"YYYY or YYYY-MM or YYYY-MM-DD (BCE as -YYYY)","name":"...","place_name":"...","lat":0.0,"lon":0.0,"family":"war|diplomacy|unrest|disaster|culture","who":["..."],"what":"one sentence","why":"one sentence","wikipedia":"English Wikipedia title"}]}`;
        const res = await sample([{ role: "user", content: prompt }], { cache: false });
        const txt = String(res.text || ""), j = parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
        if (!j || !Array.isArray(j.steps) || !j.steps.length) throw new Error("no storyline came back");
        const steps = j.steps.filter(p => isFinite(p.lat) && isFinite(p.lon) && mOf(String(p.date || "").replace(/^(-?)(\d{1,3})(?=$|-)/, (_, s, d) => s + d.padStart(4, "0"))) != null)
          .map(p => ({ ...p, date: String(p.date).replace(/^(-?)(\d{1,3})(?=$|-)/, (_, s, d) => s + d.padStart(4, "0")), date_note: "AI draft" }));
        steps.sort((a, b) => mOf(a.date) - mOf(b.date));
        const st = { id: "ai_" + Date.now().toString(36), title: (j.title || "Storyline") + " (draft)", region: rb ? rb.name : "", start: Math.floor(mOf(steps[0].date) / 12), end: Math.floor(mOf(steps[steps.length - 1].date) / 12),
          view: { lon: v.lon, lat: v.lat, span: v.w }, blurb: j.blurb || "", status: "draft", ai: true };
        STORIES.push({ ...st, i: STORIES.length, steps: steps.map((p, k) => ({ ...p, j: k, m: mOf(p.date) })) });
        try { const saved = JSON.parse(localStorage.getItem("atlas.deep.aistories.v1") || "[]"); saved.push({ ...st, steps }); localStorage.setItem("atlas.deep.aistories.v1", JSON.stringify(saved.slice(-20))); } catch { /* storage blocked */ }
        DS.story = st.id; T.span = "story"; T.msg = "Claude wrote a draft storyline (not checked). It stays in this browser.";
        goStep(STORIES[STORIES.length - 1], STORIES[STORIES.length - 1].steps[0]);
      }
    } catch (e) {
      T.msg = e && (e.code === "not_granted" || e.code === "sampling_disabled") ? "Live drafts are switched off for this page." : "That did not work: " + (e && e.message || e);
    } finally { T.busy = false; redraw(); renderSoon(true); }
  }
  // AI storylines written in this browser come back on the next visit.
  W.storylines().then(() => { try { for (const st of JSON.parse(localStorage.getItem("atlas.deep.aistories.v1") || "[]")) if (!STORIES.some(s => s.id === st.id)) STORIES.push({ ...st, i: STORIES.length, steps: st.steps.map((p, k) => ({ ...p, j: k, m: mOf(p.date) })) }); } catch { /* none */ } });

  ATLAS.tab({
    id: "upclose", name: "Up close",
    mount(el, api) {
      T.el = el; T.api = api;
      el.addEventListener("input", ev => { if (ev.target.type === "range") { stop(); setMonth(+ev.target.value); } });
      el.addEventListener("toggle", ev => { if (ev.target.dataset && ev.target.dataset.all) T.allOpen = ev.target.open; }, true);
      el.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        const a = b.dataset.a;
        if (a === "play") return play();
        if (a === "restore") { for (const k of T.quieted || []) api.setOn(k, true); T.quieted = []; return renderSoon(true); }
        if (a === "fill" || a === "tell") { if (!T.busy) aiFill(a); return; }
        if (a === "direct") { const s = story(); if (s && W.director) W.director.play(W.asStory(s)); return; }
        if (a === "unstory") { DS.story = null; DS.step = null; if (T.span === "story") T.span = "auto"; redraw(); return renderSoon(true); }
        if (a) { stop(); return setMonth((DS.m ?? spanNow().m0) + +a, { now: true }); }
        if (b.dataset.speed) { T.speed = +b.dataset.speed; return renderSoon(true); }
        if (b.dataset.span) { T.span = b.dataset.span; const sp = spanNow(); return setMonth(Math.max(sp.m0, Math.min(sp.m1, DS.m ?? sp.m0)), { now: true }); }
        if (b.dataset.lens) { api.setOn(b.dataset.lens, !ATLAS.isOn(b.dataset.lens)); return renderSoon(true); }
        if (b.dataset.story) { const s = STORIES.find(x => x.id === b.dataset.story); if (s) { T.allOpen = false; goStep(s, s.steps[0]); } return; }
        if (b.dataset.step) { const s = story(); if (s) goStep(s, s.steps[+b.dataset.step]); return; }
        if (b.dataset.row) { const r = ROWS[b.dataset.row]; if (r) goRow(r); }
      });
      api.onYear(y => { if (DS.m != null && Math.floor(DS.m / 12) !== y) DS.m = y * 12; if (!el.hidden) renderSoon(); });
      if (api.onView) api.onView(() => { if (!el.hidden) { renderSoon(); } redraw(); });
      render();
    },
    show() {
      if (DS.m == null) {
        // First visit: the chronicle and lives on, the world-scale lenses that repeat them quiet, the cursor on this year.
        for (const k of ["deep", "deeplives"]) T.api.setOn(k, true);
        T.quieted = QUIET.filter(k => ATLAS.isOn(k));
        for (const k of T.quieted) T.api.setOn(k, false);
        DS.m = T.api.year * 12;
        setMonth(DS.m, { now: true });
      } else renderSoon(true);
    },
  });
  // Keyboard: [ and ] step a month while the Up close tab is open (the page keeps arrows for years).
  document.addEventListener("keydown", ev => {
    if (!T.el || T.el.hidden || ev.target.closest("input, textarea, select") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "[" || ev.key === "]") { ev.preventDefault(); stop(); setMonth((DS.m ?? spanNow().m0) + (ev.key === "]" ? 1 : -1)); }
  });
})();
