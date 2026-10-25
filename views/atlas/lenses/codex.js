// Codex and quests: the game layer. Lost cities and sites, wonders and battles fill a codex as you visit them on
// the map (click near one, or zoom in on it; battles only count in the year they were fought). Quests are built
// from the codex, the guide's tours and the what-if turning points. A daily riddle points at one discovery, and
// an optional fog of war covers each era until you have looked around in it. Progress stays in this browser
// (localStorage). Data: views/atlas/lenses/codex.py.
(function () {
  const D = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.codex) || { sites: [], quests: [], trails: [] };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KIND = { c: ["Lost city or site", "Lost cities & sites", "square"], w: ["Wonder", "Wonders", "diamond"], b: ["Battle", "Battles", "cross"] };
  const R_CLICK = 150, R_BATTLE = 120, BATTLE_YEARS = 10, FALL_YEARS = 30;
  const ERAS = [[-4000, "Bronze Age"], [-1200, "Iron Age"], [-500, "Classical age"], [500, "Early Middle Ages"], [1000, "High and late Middle Ages"],
    [1450, "Early modern age"], [1750, "Long nineteenth century"], [1914, "Modern age"]];
  const era = y => { let i = 0; for (let j = 0; j < ERAS.length; j++) if (y >= ERAS[j][0]) i = j; return i; };
  const CELL = 3, COLS = 360 / CELL, ROWS = 180 / CELL;
  let api = null, el = null, mode = "next", showAll = {};

  // ---------- progress, kept in this browser ----------
  const KEY = "atlas.codex.v1";
  const P = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } })();
  P.f = P.f || {}; P.fog = P.fog || {}; P.tr = P.tr || {}; P.qd = P.qd || {}; P.sk = P.sk || { last: null, n: 0 };
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* private window: progress lasts this visit */ } }, 250); };

  // ---------- helpers ----------
  const fy = y => api ? api.fmtYear(y) : String(y);
  const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const century = y => {
    if (y <= -3000) { const m = Math.ceil(-y / 1000); return `${m}${m === 1 ? "st" : m === 2 ? "nd" : m === 3 ? "rd" : "th"} millennium BCE`; } const n = y < 0 ? Math.ceil(-y / 100) : Math.floor(y / 100) + 1; const sfx = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"; return `${n}${sfx} century${y < 0 ? " BCE" : ""}`; };
  let byId = null;
  const sites = () => { const S = D().sites; if (!byId) byId = new Map(S.map(s => [s.id, s])); return S; };
  const site = id => (sites(), byId.get(id));
  const alive = (s, y) => (s.s == null || y >= s.s) && (s.e == null || y <= s.e);
  // A rough region for a hint, from the coordinates (the clue should not give the answer away).
  const REGIONS = [["the British Isles", -11, 2, 49.5, 61], ["Iberia", -10, 3.5, 35.8, 44], ["western Europe", -5, 16, 42, 56], ["Scandinavia and the Baltic", 4, 32, 54, 71],
    ["Italy", 6.5, 19, 36.5, 47], ["the Balkans and Greece", 13, 30, 34.5, 47], ["eastern Europe", 16, 45, 44, 60], ["Anatolia", 26, 45, 35.8, 42.5],
    ["the Levant", 33.5, 39.5, 29, 37.5], ["Mesopotamia", 39.5, 48.5, 29, 37.5], ["Egypt and the Nile", 24, 37, 15, 31.8], ["North Africa", -17, 24, 20, 37.5],
    ["Arabia", 34, 60, 12, 29], ["Iran", 44, 63, 25, 40], ["Central Asia", 50, 90, 36, 55], ["the Steppe", 30, 120, 45, 56], ["South Asia", 60, 92, 5, 36],
    ["China", 97, 123, 18, 45], ["Korea and Japan", 123, 146, 30, 46], ["Mongolia", 87, 125, 41, 53], ["Southeast Asia", 92, 125, -11, 28],
    ["East Africa", 28, 52, -27, 15], ["West Africa", -18, 16, 4, 20], ["southern Africa", 10, 41, -35, -12], ["Mesoamerica", -118, -82, 7, 24],
    ["North America", -170, -50, 24, 72], ["the Andes and South America", -82, -34, -56, 13], ["Oceania", 110, 180, -48, -9]];
  const region = s => { const r = REGIONS.find(([, w, e, so, n]) => s.lon >= w && s.lon <= e && s.lat >= so && s.lat <= n); return r ? r[0] : `${Math.abs(Math.round(s.lat / 10) * 10)}°${s.lat >= 0 ? "N" : "S"}, ${Math.abs(Math.round(s.lon / 10) * 10)}°${s.lon >= 0 ? "E" : "W"}`; };
  const when = s => s.k === "b" ? fy(s.s) : `${s.s != null ? fy(s.s) : "?"}–${s.e != null ? fy(s.e) : "today"}`;
  const card = s => ({ kind: "lens:codex", c: "var(--y-codex)", kick: `Codex · ${KIND[s.k][0]}`, title: s.n, name: s.n, year: s.s, lon: s.lon, lat: s.lat,
    meta: [when(s), s.t].filter(Boolean).join(" · "), body: s.w || "", why: s.y || "", sources: s.src || [] });
  const found = id => P.f[id];
  const stars = s => { const f = found(s.id); if (!f) return ""; return `<span class="cx-st" title="Found">◆</span>${f.a ? `<span class="cx-st" title="Seen while it stood">★</span>` : ""}${f.d != null && f.d <= FALL_YEARS ? `<span class="cx-st" title="Seen in its last ${FALL_YEARS} years">✝</span>` : ""}`; };

  // ---------- quests ----------
  const qOk = (q, id) => { const f = found(id), s = site(id); if (!f || !s) return false; return q.mode === "alive" ? !!f.a : q.mode === "fall" ? f.d != null && f.d <= (q.win || FALL_YEARS) : true; };
  const qNeed = q => q.need || q.ids.length;
  const qGot = q => q.ids.filter(id => qOk(q, id)).length;
  const trailDone = t => (P.tr[t.id] || []).length;
  const trailNext = t => t.steps.findIndex((_, i) => !(P.tr[t.id] || []).includes(i));

  // ---------- toasts on the map ----------
  const css = document.createElement("style");
  css.textContent = `
.cx-toasts { position: absolute; right: 12px; top: 12px; justify-items: end; display: grid; gap: 8px; z-index: 30; pointer-events: none; max-width: min(340px, calc(100% - 24px)); }
.cx-toast { pointer-events: auto; cursor: pointer; background: var(--card); color: var(--ink); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); padding: 7px 11px 8px; display: grid; gap: 2px; animation: cx-in .25s steps(4) both; }
.cx-toast .k { font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--y-codex); }
.cx-toast b { font-family: var(--fell); font-weight: 400; font-size: 17px; line-height: 1.2; }
.cx-toast span { font-size: 12.5px; color: var(--ink-soft); }
.cx-toast.out { animation: cx-out .3s steps(3) both; }
@keyframes cx-in { from { transform: translateY(-10px); opacity: 0; } }
@keyframes cx-out { to { transform: translateY(-10px); opacity: 0; } }
@media (max-width: 640px) { .cx-toast:nth-last-child(n+3) { display: none; } }
@media (prefers-reduced-motion: reduce) { .cx-toast, .cx-toast.out { animation: none; } }
.cx { display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.cx .seg { display: flex; border: 1px solid var(--rule); border-radius: 999px; overflow: hidden; width: max-content; max-width: 100%; }
.cx .seg button { border: 0; background: transparent; padding: 6px 13px; cursor: pointer; font-family: var(--mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
.cx .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.cx h2 { font-family: var(--fell); font-weight: 400; font-size: 21px; line-height: 1.2; margin: 0; }
.cx h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 6px 0 0; display: flex; gap: 8px; align-items: baseline; }
.cx h3 .n { margin-left: auto; font-variant-numeric: tabular-nums; }
.cx p { margin: 0; }
.cx .lede { font-size: 14.5px; color: var(--ink-soft); }
.cx .note { font-size: 12.5px; color: var(--ink-soft); }
.cx .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cx .stat { border: 1px solid var(--rule); background: var(--card); padding: 8px 10px; display: grid; gap: 2px; }
.cx .stat b { font-family: var(--mono); font-size: 19px; font-weight: 500; font-variant-numeric: tabular-nums; }
.cx .stat span { font-size: 11.5px; color: var(--ink-soft); }
.cx .next { border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); background: var(--card); padding: 11px 13px; display: grid; gap: 6px; }
.cx .next .k { font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--y-codex); }
.cx .next b { font-family: var(--fell); font-weight: 400; font-size: 18px; line-height: 1.25; }
.cx .meter { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; height: 8px; }
.cx .meter i { background: var(--wash); outline: 1px solid var(--rule); outline-offset: -1px; }
.cx .meter i.on { background: var(--y-codex); outline: 0; }
.cx .bar { height: 8px; background: var(--wash); outline: 1px solid var(--rule); outline-offset: -1px; }
.cx .bar i { display: block; height: 100%; background: var(--y-codex); }
.cx ul.ent { list-style: none; margin: 0; padding: 0; display: grid; }
.cx ul.ent li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--rule); }
.cx ul.ent li button.nm { all: unset; cursor: pointer; font-family: var(--fell); font-size: 16px; line-height: 1.25; }
.cx ul.ent li button.nm:focus-visible { outline: 2px solid var(--y-codex); }
.cx ul.ent li .y { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
.cx ul.ent li .sub { grid-column: 1 / -1; font-size: 12.5px; color: var(--ink-soft); }
.cx ul.ent li.lock .nm { color: var(--ink-soft); letter-spacing: .12em; }
.cx .cx-st { color: var(--y-codex); margin-left: 4px; font-size: 12px; }
.cx .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cx .lnk { all: unset; cursor: pointer; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--accent); }
.cx .lnk:focus-visible { outline: 2px solid var(--accent); }
.cx .quest { border: 1px solid var(--rule); border-left: 4px solid var(--y-codex); background: var(--card); padding: 9px 12px; display: grid; gap: 6px; }
.cx .quest.done { border-left-color: var(--ink); }
.cx .quest b { font-family: var(--fell); font-weight: 400; font-size: 16.5px; line-height: 1.25; }
.cx .quest .hd { display: flex; gap: 8px; align-items: baseline; }
.cx .quest .hd span { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
.cx ol.steps { margin: 0; padding-left: 20px; display: grid; gap: 3px; font-size: 13.5px; }
.cx ol.steps li.ok { color: var(--ink-soft); text-decoration: line-through; text-decoration-color: var(--y-codex); }
.cx ol.steps li.cur { font-weight: 600; }
.cx .clues { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14.5px; }
.cx .clues .mask { letter-spacing: .1em; color: var(--y-codex); }
.cx form.guess { display: flex; gap: 6px; }
.cx form.guess input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 5px 9px; border: 1px solid var(--rule); background: var(--card); color: var(--ink); border-radius: 4px; }
.cx .ok-msg { border: 2px solid var(--y-codex); padding: 9px 12px; background: var(--card); }
.cx .bad { color: var(--warn); font-size: 13px; }
.cx .switch { display: flex; gap: 10px; align-items: center; border: 1px solid var(--rule); background: var(--card); padding: 8px 12px; }
.cx .switch input { width: 18px; height: 18px; accent-color: var(--y-codex); }
.cx .switch label { display: grid; gap: 1px; cursor: pointer; }
.cx .switch label span { font-size: 12px; color: var(--ink-soft); }
#svg .cx-fog { pointer-events: none; fill: var(--paper); fill-opacity: .86; shape-rendering: crispEdges; }
`;
  document.head.appendChild(css);
  let toastBox = null;
  function toast(kick, title, sub, onClick) {
    if (!toastBox) { const m = document.getElementById("map"); if (!m) return; toastBox = document.createElement("div"); toastBox.className = "cx-toasts"; toastBox.setAttribute("role", "status"); toastBox.setAttribute("aria-live", "polite"); m.appendChild(toastBox); }
    const t = document.createElement("div"); t.className = "cx-toast";
    t.innerHTML = `<span class="k">${esc(kick)}</span><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
    t.onclick = () => { if (onClick) onClick(); t.remove(); };
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 4800);
  }
  const openCodex = m => { mode = m || mode; if (api) api.setTab("codex"); render(); };

  // ---------- visiting ----------
  // Being near a site in some year finds it; being there while it stood, or in its last years, adds a star.
  function visit(at, y, r) {
    const news = [];
    for (const s of sites()) {
      if (s.k === "b") { if (Math.abs(y - s.s) > BATTLE_YEARS || km(at, s) > Math.min(r, R_BATTLE)) continue; }
      else if (km(at, s) > r) continue;
      const f = P.f[s.id], a = s.k !== "b" && alive(s, y), d = s.e != null && y <= s.e ? s.e - y : null;
      if (!f) { P.f[s.id] = { y, t: Date.now(), a: a ? 1 : 0, ...(d != null ? { d } : {}) }; news.push([s, "new"]); }
      else {
        let up = null;
        if (a && !f.a) { f.a = 1; up = "alive"; }
        if (d != null && (f.d == null || d < f.d)) { const was = f.d != null && f.d <= FALL_YEARS; f.d = d; if (!was && d <= FALL_YEARS) up = "fall"; }
        if (up) news.push([s, up]);
      }
      if (R.target && R.st && R.target.id === s.id && !R.st.ok) solveRiddle(true);
    }
    if (!news.length) return news;
    save();
    for (const [s, why] of news.slice(0, 2)) {
      const total = sites().filter(x => x.k === s.k).length, got = sites().filter(x => x.k === s.k && P.f[x.id]).length;
      const go = () => { openCodex("codex"); if (api) api.select(card(s)); };
      if (why === "new") toast(`Discovered · ${KIND[s.k][0]}`, s.n, `${got} of ${total} ${KIND[s.k][1].toLowerCase()} found`, go);
      else if (why === "alive") toast("Seen while it stood ★", s.n, `You were here in ${fy(y)}, ${s.k === "w" ? "before it was lost" : "while people still lived here"}.`, go);
      else toast("Witness to the end ✝", s.n, `${fy(y)}: ${s.e - y} years before it was ${s.k === "w" ? "lost" : "abandoned or destroyed"}.`, go);
    }
    if (news.length > 2) toast("And more", `${news.length - 2} other finds`, "See them in the Codex tab", () => openCodex("codex"));
    checkQuests();
    if (el && !el.hidden) render();
    badge();
    return news;
  }
  // Other plugins (the Live tab's journeys) can visit places too: what you pass on the road joins the codex.
  window.ATLAS.codex = { visit: (lon, lat, y, r) => visit({ lon, lat }, y, r ?? R_CLICK) };
  function checkQuests() {
    for (const q of D().quests) if (!P.qd[q.id] && qGot(q) >= qNeed(q)) { P.qd[q.id] = Date.now(); toast("Quest complete", q.n, q.d, () => openCodex("quests")); }
    for (const t of D().trails) if (!P.qd[t.id] && trailDone(t) >= t.steps.length) { P.qd[t.id] = Date.now(); toast("Trail complete", t.n, `All ${t.steps.length} stops`, () => openCodex("quests")); }
    save();
  }
  // A trail stop counts when the map is roughly where and when the stop is.
  function checkTrails(v, y) {
    let hit = false;
    // Only the next stop of each trail counts, so a trail is walked in order.
    for (const t of D().trails) {
      const done = P.tr[t.id] || (P.tr[t.id] = []), i = trailNext(t), st = t.steps[i];
      if (!st) continue;
      const span = st.span || 20, near = Math.abs(v.lon - st.lon) <= Math.max(1.5, span * .25) && Math.abs(v.lat - st.lat) <= Math.max(1.5, span * .25);
      if (near && v.w <= span * 2.5 && Math.abs(y - st.year) <= Math.max(10, Math.min(span, 25))) {
        done.push(i); hit = true;
        const n = trailNext(t);
        toast(`${t.n.length > 40 ? "Trail" : t.n} · stop ${i + 1} of ${t.steps.length}`, st.n, n >= 0 ? `Next: ${t.steps[n].n}` : "Last stop", () => openCodex("quests"));
      }
    }
    if (hit) { save(); checkQuests(); if (el && !el.hidden) render(); }
  }

  // ---------- fog of war ----------
  // One bit per 3° cell per era: lifted where you have zoomed in or clicked.
  const fogBits = {};
  function bits(e) {
    if (fogBits[e]) return fogBits[e];
    const b = new Uint8Array(Math.ceil(COLS * ROWS / 8));
    try { const s = atob(P.fog[e] || ""); for (let i = 0; i < s.length && i < b.length; i++) b[i] = s.charCodeAt(i); } catch (err) { /* start fresh */ }
    return fogBits[e] = b;
  }
  const cellOf = (lon, lat) => [Math.max(0, Math.min(COLS - 1, Math.floor((lon + 180) / CELL))), Math.max(0, Math.min(ROWS - 1, Math.floor((90 - lat) / CELL)))];
  const isLit = (b, c, r) => b[(r * COLS + c) >> 3] & (1 << ((r * COLS + c) & 7));
  let fogVer = 0;
  function lift(e, lon0, lon1, lat0, lat1, round) {
    const b = bits(e); let ch = 0;
    const [c0, r1] = cellOf(lon0, lat0), [c1, r0] = cellOf(lon1, lat1);
    const cx = (lon0 + lon1) / 2, cy = (lat0 + lat1) / 2, rx = Math.max(CELL, (lon1 - lon0) / 2), ry = Math.max(CELL, (lat1 - lat0) / 2);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (round) { const x = (c + .5) * CELL - 180, y = 90 - (r + .5) * CELL; if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1.15) continue; }
      const i = r * COLS + c; if (!(b[i >> 3] & (1 << (i & 7)))) { b[i >> 3] |= 1 << (i & 7); ch++; }
    }
    if (!ch) return 0;
    let s = ""; for (const x of b) s += String.fromCharCode(x);
    P.fog[e] = btoa(s); fogVer++; save();
    return ch;
  }
  const litShare = e => { const b = bits(e); let n = 0; for (const x of b) { let v = x; while (v) { n += v & 1; v >>= 1; } } return n / (COLS * ROWS); };
  const fogOn = () => !!(window.ATLAS.isOn && ATLAS.isOn("fog"));
  let fogCache = null;
  function fogPath(projection, e) {
    if (fogCache && fogCache.e === e && fogCache.v === fogVer && fogCache.p === projection) return fogCache.d;
    const b = bits(e), out = [];
    const pt = (lon, lat) => { const p = projection([lon, lat]); return p ? p[0].toFixed(1) + "," + p[1].toFixed(1) : null; };
    for (let r = 0; r < ROWS; r++) {
      const top = 90 - r * CELL, bot = top - CELL;
      for (let c = 0; c < COLS;) {
        if (isLit(b, c, r)) { c++; continue; }
        let c1 = c; while (c1 < COLS && !isLit(b, c1, r)) c1++;
        const ring = [];
        for (let x = c; x <= c1; x++) ring.push(pt(x * CELL - 180, top));
        for (let x = c1; x >= c; x--) ring.push(pt(x * CELL - 180, bot));
        out.push("M" + ring.filter(Boolean).join("L") + "Z");
        c = c1;
      }
    }
    fogCache = { e, v: fogVer, p: projection, d: out.join("") };
    return fogCache.d;
  }

  // ---------- watching the map ----------
  let lookT = 0;
  function look() {
    clearTimeout(lookT);
    lookT = setTimeout(() => {
      if (!api || !api.view) return;
      const v = api.view(); if (!v) return;
      const y = api.year;
      if (v.w <= 100) {
        const e = era(y), hw = v.w * .5, hh = Math.min(v.h, 60) * .5;
        if (lift(e, v.lon - hw, v.lon + hw, Math.max(-89.9, v.lat - hh), Math.min(89.9, v.lat + hh), true) && fogOn()) api.redraw();
      }
      // Zoomed in close enough to see a site near the middle of the map: that counts as a visit.
      if (v.w <= 16) visit({ lon: v.lon, lat: v.lat }, y, Math.min(250, Math.min(v.w * Math.cos(v.lat * Math.PI / 180), v.h) * 111 * .25));
      checkTrails(v, y);
    }, 450);
  }

  // ---------- the daily riddle ----------
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const R = { target: null, st: null };
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(the |battle of |siege of |sack of )/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const names = s => { const out = new Set([norm(s.n)]); for (const m of s.n.match(/\(([^)]+)\)/g) || []) out.add(norm(m)); out.add(norm(s.n.replace(/\([^)]*\)/g, ""))); for (const p of s.n.split(/,| and /)) if (p.trim().length > 3) out.add(norm(p)); out.delete(""); return [...out]; };
  function lev(a, b) { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
  const matches = (s, g) => { g = norm(g); if (g.length < 3) return false; return names(s).some(n => n === g || (g.length >= 5 && (n.includes(g) || g.includes(n))) || (n.length >= 5 && lev(n, g) <= (n.length >= 9 ? 2 : 1))); };
  const STOP = new Set(["the", "of", "and", "at", "in", "on", "battle", "siege", "sack", "temple", "great", "old", "city"]);
  function mask(s, text) {
    if (!text) return "";
    let t = esc(text);
    const words = s.n.replace(/[(),]/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w.toLowerCase()));
    for (const w of words) t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), '<span class="mask">▢▢▢</span>');
    return t;
  }
  function riddleFor(day) {
    const pool = sites().filter(s => s.w && (s.k !== "b" || s.y));
    return pool.length ? pool[hash("atlas-riddle:" + day) % pool.length] : null;
  }
  function setupRiddle() {
    const d = today();
    if (!P.rd || P.rd.d !== d) P.rd = { d, c: 1, ok: 0, g: [] };
    R.st = P.rd; R.target = riddleFor(d);
  }
  function clues(s) {
    const what = s.k === "c" ? "a lost city or site" : s.k === "w" ? "a wonder" : "a battle";
    const c1 = s.k === "b" ? `I am ${what}, fought in the ${century(s.s)}.` : `I am ${what}. ${s.s != null ? `My story starts in the ${century(s.s)}` : "Nobody knows when I began"}${s.e != null ? ` and ends in the ${century(s.e)}.` : ", and I am still here."}`;
    const c2 = s.t && s.k !== "b" ? `Look in ${region(s)}. Today the place is in ${esc(s.t.replace(/\s*\(.*\)/, ""))}.` : `Look in ${region(s)}.`;
    return [esc(c1), c2, mask(s, s.w), mask(s, s.y)].filter(Boolean);
  }
  function solveRiddle(onMap) {
    if (!R.st || R.st.ok) return;
    R.st.ok = 1; R.st.map = onMap ? 1 : 0;
    const d = R.st.d;
    if (P.sk.last !== d) { P.sk.n = P.sk.last === yesterday() ? P.sk.n + 1 : 1; P.sk.last = d; }
    save();
    toast("Riddle solved", R.target.n, `${R.st.c} clue${R.st.c > 1 ? "s" : ""}${onMap ? ", found on the map" : ""} · streak ${P.sk.n} day${P.sk.n > 1 ? "s" : ""}`, () => openCodex("riddle"));
  }

  // ---------- pointing the way, without giving it away ----------
  // A locked site gets a fuzzy view: a few degrees off, zoomed out enough that you still have to look.
  function pointMe(s) {
    const h = hash(s.id), dx = ((h & 255) / 255 - .5) * 6, dy = (((h >> 8) & 255) / 255 - .5) * 4;
    const y = s.k === "b" ? s.s : s.s != null && s.e != null ? Math.round((s.s + s.e) / 2) : s.s ?? api.year;
    api.setYear(y);
    api.fly({ lon: s.lon + dx, lat: s.lat + dy, span: 22 }, 1300);
    toast("Somewhere around here", `${KIND[s.k][0]} · ${region(s)}`, `${fy(y)}. Zoom in on it or click near it to find it.`);
  }
  const nearestLocked = (list, from) => list.filter(s => !found(s.id)).map(s => ({ s, d: km(from, s) })).sort((a, b) => a.d - b.d).map(o => o.s);

  // ---------- the tab ----------
  const badge = () => { const b = document.querySelector('.tab[data-tab="codex"]'); if (b) { const n = Object.keys(P.f).filter(id => site(id)).length; b.textContent = n ? `Codex ${n}` : "Codex"; } };
  const meter = (got, need) => need <= 30 ? `<div class="meter" style="--n:${need}" role="img" aria-label="${got} of ${need}">${Array.from({ length: need }, (_, i) => `<i class="${i < got ? "on" : ""}"></i>`).join("")}</div>`
    : `<div class="bar" role="img" aria-label="${got} of ${need}"><i style="width:${Math.round(100 * got / need)}%"></i></div>`;

  function nextThing() {
    if (R.target && !R.st.ok) return `<div class="next"><span class="k">Today's riddle</span><b>${clues(R.target)[0]}</b><div class="row"><button class="btn primary" data-a="mode" data-m="riddle">Solve it</button><span class="note">${P.sk.n ? `Streak: ${P.sk.n} day${P.sk.n > 1 ? "s" : ""}` : "Start a streak"}</span></div></div>`;
    for (const t of D().trails) { const i = trailNext(t); if (i >= 0 && trailDone(t) > 0) return trailNextHTML(t, i, "Continue your trail"); }
    const v = api && api.view ? api.view() : null, from = v ? v : { lon: 30, lat: 35 };
    const q = D().quests.find(q => !P.qd[q.id] && qGot(q) > 0) || D().quests.find(q => !P.qd[q.id]);
    if (q) { const s = nearestLocked(q.ids.map(site).filter(Boolean), from)[0]; if (s) return `<div class="next"><span class="k">Quest · ${esc(q.n)} · ${qGot(q)} of ${qNeed(q)}</span><b>${esc(KIND[s.k][0])} somewhere in ${esc(region(s))}</b><p class="note">${esc(q.d)}</p><div class="row"><button class="btn primary" data-a="point" data-id="${esc(s.id)}">Point me there</button></div></div>`; }
    const t = D().trails.find(t => trailNext(t) >= 0);
    return t ? trailNextHTML(t, trailNext(t), "Start a trail") : `<div class="next"><span class="k">All done</span><b>Every quest and trail is finished.</b></div>`;
  }
  function trailNextHTML(t, i, kick) {
    const st = t.steps[i];
    return `<div class="next"><span class="k">${esc(kick)} · stop ${i + 1} of ${t.steps.length}</span><b>${esc(st.n)}</b><p class="note">${esc(t.n)} · ${esc(fy(st.year))}</p><div class="row"><button class="btn primary" data-a="stop" data-t="${esc(t.id)}" data-i="${i}">Take me there</button></div></div>`;
  }

  function render() {
    if (!el) return;
    if (!R.st || R.st.d !== today()) setupRiddle();
    const S = sites(), got = S.filter(s => found(s.id)).length;
    const qs = D().quests.length + D().trails.length, qdone = [...D().quests, ...D().trails].filter(q => P.qd[q.id]).length;
    const head = `<div class="seg" role="group" aria-label="Codex view">${[["next", "Next"], ["codex", "Codex"], ["quests", "Quests"], ["riddle", "Riddle"]].map(([m, n]) => `<button data-a="mode" data-m="${m}" aria-pressed="${mode === m}">${n}</button>`).join("")}</div>`;
    const stats = `<div class="stats"><div class="stat"><b>${got}<small style="font-size:12px;color:var(--ink-soft)"> / ${S.length}</small></b><span>discoveries</span></div><div class="stat"><b>${qdone}<small style="font-size:12px;color:var(--ink-soft)"> / ${qs}</small></b><span>quests & trails</span></div><div class="stat"><b>${P.sk.n || 0}</b><span>riddle streak</span></div></div>`;
    let body = "";
    if (mode === "next") body = `${stats}${nextThing()}${fogSwitch()}<p class="note">Lost cities and wonders count in any year; being there while they stood, or in their last ${FALL_YEARS} years, earns a star. Battles only count in the year they were fought. Your progress stays in this browser.</p>`;
    else if (mode === "codex") body = renderCodex();
    else if (mode === "quests") body = renderQuests();
    else body = renderRiddle();
    el.innerHTML = `<div class="cx">${head}${body}</div>`;
  }
  function fogSwitch() {
    const y = api ? api.year : 0, e = era(y);
    return `<div class="switch"><input type="checkbox" id="cx-fog" ${fogOn() ? "checked" : ""}><label for="cx-fog"><b>Fog of war</b><span>${esc(ERAS[e][1])}: ${(p => p > 0 && p < 1 ? p.toFixed(1) : Math.round(p))(litShare(e) * 100)}% of the map explored. Each era has its own fog; zoom in to lift it.</span></label></div>`;
  }
  function renderCodex() {
    const from = api && api.view ? api.view() || { lon: 30, lat: 35 } : { lon: 30, lat: 35 };
    return ["c", "w", "b"].map(k => {
      const list = sites().filter(s => s.k === k), mine = list.filter(s => found(s.id)).sort((a, b) => found(b.id).t - found(a.id).t);
      const locked = nearestLocked(list, from), shown = showAll[k] ? locked : locked.slice(0, 3);
      const fRow = s => `<li><button class="nm" data-a="go" data-id="${esc(s.id)}">${esc(s.n)}${stars(s)}</button><span class="y">${esc(when(s))}</span><span class="sub">${esc(s.t || region(s))} · found in ${esc(fy(found(s.id).y))}</span></li>`;
      const lRow = s => `<li class="lock"><button class="nm" data-a="point" data-id="${esc(s.id)}" title="Point me there">? ? ?</button><span class="y">${esc(s.k === "b" ? century(s.s) : s.s != null ? century(s.s) : "")}</span><span class="sub">${esc(KIND[k][0])} in ${esc(region(s))} · <button class="lnk" data-a="point" data-id="${esc(s.id)}">point me there</button></span></li>`;
      return `<h3>${esc(KIND[k][1])}<span class="n">${mine.length} / ${list.length}</span></h3>${meter(mine.length, list.length)}
        <ul class="ent">${mine.map(fRow).join("")}${shown.map(lRow).join("")}</ul>
        ${locked.length > 3 ? `<div class="row"><button class="lnk" data-a="all" data-k="${k}">${showAll[k] ? "Show fewer" : `Show all ${locked.length} still hidden`}</button></div>` : ""}`;
    }).join("") + `<p class="note">Hidden entries nearest the middle of the map come first. ◆ found · ★ seen while it stood · ✝ seen in its last ${FALL_YEARS} years.</p>`;
  }
  function renderQuests() {
    const qHTML = q => {
      const g = qGot(q), n = qNeed(q), done = !!P.qd[q.id];
      const items = q.ids.length <= 8 ? `<ul class="ent">${q.ids.map(site).filter(Boolean).map(s => qOk(q, s.id) ? `<li><button class="nm" data-a="go" data-id="${esc(s.id)}">${esc(s.n)}${stars(s)}</button><span class="y">${esc(when(s))}</span></li>` : `<li class="lock"><button class="nm" data-a="point" data-id="${esc(s.id)}">${found(s.id) ? esc(s.n) : "? ? ?"}</button><span class="y">${esc(region(s))}</span></li>`).join("")}</ul>` : "";
      return `<div class="quest${done ? " done" : ""}"><div class="hd"><b>${esc(q.n)}</b><span>${done ? "done ✓" : `${Math.min(g, n)} of ${n}`}</span></div><p class="note">${esc(q.d)}</p>${meter(Math.min(g, n), n)}${items}
        ${!done ? `<div class="row"><button class="lnk" data-a="qnext" data-q="${esc(q.id)}">Point me at the nearest</button></div>` : ""}</div>`;
    };
    const tHTML = t => {
      const done = P.tr[t.id] || [], nx = trailNext(t);
      return `<div class="quest${nx < 0 ? " done" : ""}"><div class="hd"><b>${esc(t.n)}</b><span>${done.length} of ${t.steps.length}</span></div><p class="note">${esc(t.d)}</p>${meter(done.length, t.steps.length)}
        <ol class="steps">${t.steps.map((s, i) => `<li class="${done.includes(i) ? "ok" : i === nx ? "cur" : ""}">${esc(s.n)} <span class="note">${esc(fy(s.year))}</span></li>`).join("")}</ol>
        ${nx >= 0 ? `<div class="row"><button class="btn" data-a="stop" data-t="${esc(t.id)}" data-i="${nx}">Take me to stop ${nx + 1}</button></div>` : ""}</div>`;
    };
    return `<p class="lede">Quests fill from your codex. Trails are the guide's tours and the what-if turning points: be roughly where and when each stop is, and it ticks off.</p>
      <h3>Trails</h3>${D().trails.map(tHTML).join("")}<h3>Quests</h3>${D().quests.map(qHTML).join("")}`;
  }
  function renderRiddle() {
    const s = R.target, st = R.st; if (!s) return `<p class="note">No riddle today.</p>`;
    const cl = clues(s), shown = st.ok ? cl.length : Math.min(st.c, cl.length);
    return `<p class="kick">Daily riddle · ${esc(st.d)}</p><h2>Where, and what, am I?</h2>
      <ol class="clues">${cl.slice(0, shown).map(c => `<li>${c}</li>`).join("")}</ol>
      ${st.ok ? `<div class="ok-msg"><b>${esc(s.n)}</b> · ${esc(when(s))}<br><span class="note">${st.ok === -1 ? "Revealed. A new riddle comes tomorrow." : `Solved with ${st.c} clue${st.c > 1 ? "s" : ""}${st.map ? ", by finding it on the map" : ""}. Streak: ${P.sk.n} day${P.sk.n > 1 ? "s" : ""}.`}</span></div>
        <div class="row"><button class="btn primary" data-a="go" data-id="${esc(s.id)}">Show it on the map</button></div>`
      : `<form class="guess" id="cx-guess"><input id="cx-g" autocomplete="off" placeholder="Name it…" aria-label="Your guess"><button class="btn primary" type="submit">Guess</button></form>
        ${st.bad ? `<p class="bad">${esc(st.bad)}</p>` : ""}
        <div class="row">${shown < cl.length ? `<button class="btn" data-a="clue">Another clue (${cl.length - shown} left)</button>` : ""}<button class="lnk" data-a="giveup">Reveal it</button></div>
        <p class="note">You can also solve it by finding the place on the map: click near it or zoom in on it${s.k === "b" ? ", in the year of the battle" : ""}. Fewer clues is better; solving on consecutive days builds a streak.</p>`}`;
  }

  function onClick(ev) {
    const b = ev.target.closest("[data-a]"); if (!b || !el.contains(b)) return;
    const a = b.dataset.a;
    if (a === "mode") { mode = b.dataset.m; render(); }
    else if (a === "go") { const s = site(b.dataset.id); if (s && (found(s.id) || (R.target === s && R.st.ok))) { if (s.k === "b" || s.s != null) api.setYear(s.k === "b" ? s.s : alive(s, api.year) ? api.year : s.s); api.select(card(s)); } }
    else if (a === "point") { const s = site(b.dataset.id); if (s) pointMe(s); }
    else if (a === "qnext") { const q = D().quests.find(q => q.id === b.dataset.q); const v = api.view() || { lon: 30, lat: 35 }; const s = q && (nearestLocked(q.ids.map(site).filter(Boolean), v)[0] || q.ids.map(site).find(s => s && !qOk(q, s.id))); if (s) found(s.id) && q.mode !== "found" ? hintStar(q, s) : pointMe(s); }
    else if (a === "stop") { const t = D().trails.find(t => t.id === b.dataset.t), st = t && t.steps[+b.dataset.i]; if (st) api.scene({ year: st.year, view: { lon: st.lon, lat: st.lat, span: st.span }, title: st.n }); }
    else if (a === "all") { showAll[b.dataset.k] = !showAll[b.dataset.k]; render(); }
    else if (a === "clue") { R.st.c++; R.st.bad = ""; save(); render(); }
    else if (a === "giveup") { R.st.ok = -1; R.st.c = clues(R.target).length; save(); render(); }
  }
  // Found already, but the quest wants a star: send the viewer to the right years.
  function hintStar(q, s) {
    const y = q.mode === "fall" ? s.e - Math.min(q.win || FALL_YEARS, 10) : s.s != null && s.e != null ? Math.round((s.s + s.e) / 2) : s.s;
    api.setYear(y); api.fly({ lon: s.lon, lat: s.lat, span: 10 }, 1200);
    toast(q.mode === "fall" ? "Its last years" : "While it stood", s.n, `${fy(y)}. Zoom in or click on it to earn the star.`);
  }

  // ---------- map layers: your finds, and the fog ----------
  ATLAS.lens({
    id: "codex", name: "Your finds", family: "land", color: "#c08a1e", on: false, guide: [],
    draw(ctx) {
      for (const k of ["c", "w", "b"]) {
        const list = sites().filter(s => s.k === k && found(s.id) && (k !== "b" || Math.abs(ctx.year - s.s) <= 25));
        ctx.pins(list, { key: s => s.id, shape: KIND[k][2], label: s => s.n, title: s => `${s.n} (${KIND[k][0].toLowerCase()}, ${when(s)})`, card: s => card(s) });
      }
    },
    // Clicking a spot is a visit: anything near it joins the codex, and Here says what you found.
    here(ctx, at) {
      const y = ctx.year, news = visit(at, y, R_CLICK);
      if (lift(era(y), at.lon - 5, at.lon + 5, Math.max(-89.9, at.lat - 4), Math.min(89.9, at.lat + 4), true) && fogOn()) setTimeout(() => api && api.redraw(), 0);
      const fresh = new Set(news.map(([s]) => s.id));
      return sites().filter(s => found(s.id) && km(at, s) <= at.r).sort((a, b) => fresh.has(b.id) - fresh.has(a.id) || km(at, a) - km(at, b)).slice(0, 5)
        .map(s => ({ title: s.n, tag: fresh.has(s.id) ? "new find" : KIND[s.k][0].toLowerCase(), year: when(s), why: s.y || s.w || "", card: card(s) }));
    },
  });
  ATLAS.lens({
    id: "fog", name: "Fog of war", family: "land", color: "#7d7a70", on: false, guide: [],
    draw(ctx) {
      const d = fogPath(ctx.projection, era(ctx.year));
      ctx.g.selectAll("path.cx-fog").data([d]).join("path").attr("class", "cx-fog").attr("d", x => x);
    },
  });

  ATLAS.tab({
    id: "codex", name: "Codex",
    mount(pane, a) {
      el = pane; api = a;
      setupRiddle();
      el.addEventListener("click", onClick);
      el.addEventListener("change", ev => { if (ev.target.id === "cx-fog") { api.setOn("fog", ev.target.checked); api.redraw(); render(); } });
      el.addEventListener("submit", ev => {
        if (ev.target.id !== "cx-guess") return; ev.preventDefault();
        const g = el.querySelector("#cx-g").value.trim(); if (!g) return;
        R.st.g.push(g);
        if (matches(R.target, g)) solveRiddle(false);
        else { R.st.bad = `Not “${g}”.${R.st.c < clues(R.target).length ? " Take another clue?" : ""}`; save(); }
        render();
      });
      if (a.onView) a.onView(look);
      a.onYear(() => { look(); clearTimeout(yearT); yearT = setTimeout(() => { if (el && !el.hidden && mode === "next") render(); }, 300); });
      badge();
    },
    show() { render(); },
  });
  let yearT = 0;
})();
