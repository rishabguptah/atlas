// L4 Director: plays any Story (story.js) on the map. The map flies to each scene, a one-line caption types
// itself into a pixel dialog box on the map, Space or → plays the next scene, ← goes back, the strip at the
// bottom scrubs the whole story, one obvious button asks "Why?" (or "Go deeper"), and "How do we know" opens the
// scene's sources and confidence. The panel (and Ask) stays open beside it; Esc leaves the story.
//
// ATLAS.world.director: init(api), play(story | id, {at, auto}), next(), prev(), go(i), leave(), active,
// onEnd(fn). Needs ATLAS.api (scene, setOn, setTab, ask, ...), which the page hands to tabs at mount.
(function () {
  const A = window.ATLAS, world = A.world = A.world || {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtT = (t, date) => {
    if (date && /^\d{4}-\d\d(-\d\d)?$/.test(date)) { const y = +date.slice(0, 4), m = MON[+date.slice(5, 7) - 1], d = date.length >= 10 ? +date.slice(8, 10) + " " : ""; return `${d}${m} ${y}`; }
    return t == null ? "" : api ? api.fmtYear(t) : t < 0 ? -t + " BCE" : String(t);
  };
  const CONF_TEXT = {
    attested: ["Attested", "Written down at the time or shown by hard evidence; historians agree."],
    estimated: ["Estimated", "Inferred from good evidence: numbers and dates are best estimates."],
    approximate: ["Approximate", "Roughly known, or argued over: the path, the date or the reading is disputed."],
    unknown: ["Speculative", "Nobody knows: a reasoned guess, or a branch of history that did not happen."],
  };
  const BY = { geography: "Geography", military: "War", economy: "Trade & money", population: "People & numbers", disease: "Plague & climate", religion: "Faith", ideas: "Ideas", literature: "Books", people: "Lives", order: "Order & chaos" };

  const css = document.createElement("style");
  css.textContent = `
.app.directing #caption, .app.directing .maphint { display: none !important; }
.dr { --dr-ink: #221f1a; --dr-vel: #f6f0dc; --dr-gold: #d8a32c; --dr-soft: #b9b09a; position: absolute; inset: auto 0 0 0; z-index: 30; pointer-events: none;
  display: grid; justify-items: center; gap: 10px; padding: 0 14px 10px; }
.dr[hidden] { display: none; }
.dr * { box-sizing: border-box; }
.dr-box { pointer-events: auto; width: min(680px, 100%); background: var(--dr-ink); color: var(--dr-vel); position: relative;
  box-shadow: 0 0 0 3px var(--dr-vel), 0 0 0 6px var(--dr-ink), 6px 9px 0 3px rgba(34,31,26,.45); padding: 12px 16px 12px; display: grid; gap: 6px;
  transition: opacity .16s ease-out, transform .16s ease-out; }
.dr-box.alt { box-shadow: 0 0 0 3px var(--dr-vel), 0 0 0 6px #6b4a8a, 6px 9px 0 3px rgba(34,31,26,.45);
  background-image: repeating-linear-gradient(135deg, rgba(246,240,220,.035) 0 2px, transparent 2px 6px); }
.dr-box.swap { opacity: 0; transform: translateY(6px); }
.dr-title { font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-size: 16px; color: var(--dr-gold); letter-spacing: .02em; line-height: 1.1; }
.dr-kick { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-size: 12px;
  text-transform: uppercase; letter-spacing: .12em; color: var(--dr-soft); line-height: 1.2; }
.dr-kick .wh { color: var(--dr-gold); }
.dr-kick .alt { color: #c9a6e6; }
.dr-cap { font-family: Spectral, Georgia, serif; font-size: 17px; line-height: 1.4; min-height: 1.4em; margin: 0; }
.dr-cap .ghost { visibility: hidden; }
.dr-more { font-family: Spectral, Georgia, serif; font-size: 15px; line-height: 1.5; color: #e9e1c8; display: grid; gap: 8px; max-height: min(34vh, 300px); overflow: auto; padding-right: 4px; border-top: 2px solid #3a352b; padding-top: 8px; }
.dr-more p { margin: 0; }
.dr-more .who { font-size: 13px; color: var(--dr-soft); }
.dr-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dr-row .sp { flex: 1; }
.dr button { font: inherit; cursor: pointer; }
.dr-btn { font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace !important; font-size: 16px !important; line-height: 1; padding: 7px 12px 6px; border: 0; color: var(--dr-ink); background: var(--dr-gold);
  box-shadow: inset -3px -3px 0 rgba(0,0,0,.25), inset 3px 3px 0 rgba(255,255,255,.3); }
.dr-btn:hover, .dr-btn:focus-visible { background: #f0bf4a; outline: none; }
.dr-btn:active { box-shadow: inset 3px 3px 0 rgba(0,0,0,.25); }
.dr-btn.ghost { background: transparent; color: var(--dr-vel); box-shadow: inset 0 0 0 2px #5a5344; }
.dr-btn.ghost:hover, .dr-btn.ghost:focus-visible { box-shadow: inset 0 0 0 2px var(--dr-gold); color: var(--dr-gold); }
.dr-link { all: unset; cursor: pointer; font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--dr-soft); border-bottom: 2px dotted #5a5344; padding-bottom: 1px; }
.dr-link:hover, .dr-link:focus-visible { color: var(--dr-gold); border-color: var(--dr-gold); }
.dr-cont { font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 12px; color: var(--dr-gold); letter-spacing: .1em; white-space: nowrap; }
.dr-cont i { font-style: normal; display: inline-block; animation: dr-blink 1s steps(2, jump-none) infinite; }
@keyframes dr-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dr-cont i { animation: none; } .dr-box { transition: none; } }
.dr-cf { display: inline-block; width: 16px; height: 9px; vertical-align: -1px; border: 2px solid currentColor; }
.dr-cf.attested { background: currentColor; }
.dr-cf.estimated { background: repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 4px); }
.dr-cf.approximate { border-style: dashed; }
.dr-cf.unknown { border-style: dotted; background: radial-gradient(currentColor 1px, transparent 1.2px) 0 0 / 4px 4px; opacity: .8; }
.dr-src { display: grid; gap: 6px; font-size: 14px; }
.dr-src ul { margin: 0; padding-left: 18px; }
.dr-src a { color: var(--dr-gold); }
.dr-src .cf { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: center; font-size: 13px; color: var(--dr-soft); }
.dr-src .cf b { color: var(--dr-vel); font-weight: 500; }
.dr-src .cf .on { color: var(--dr-gold); }
.dr-strip { pointer-events: auto; width: min(860px, 100%); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center;
  background: rgba(34,31,26,.92); color: var(--dr-vel); padding: 6px 8px; box-shadow: 0 0 0 2px #5a5344; }
.dr-strip .nm { font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--dr-soft); max-width: 220px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dr-segs { display: flex; gap: 3px; height: 18px; align-items: stretch; touch-action: none; cursor: pointer; }
.dr-segs button { all: unset; flex: 1 1 0; min-width: 4px; background: #4a4438; position: relative; cursor: pointer; }
.dr-segs button.done { background: #8d7a4c; }
.dr-segs button.on { background: var(--dr-gold); }
.dr-segs button.alt { background-image: repeating-linear-gradient(135deg, rgba(201,166,230,.6) 0 2px, transparent 2px 4px); }
.dr-segs button.on i { position: absolute; left: 0; bottom: 0; height: 3px; width: var(--p, 0%); background: var(--dr-vel); }
.dr-segs button:focus-visible { outline: 2px solid var(--dr-vel); }
.dr-ctl { display: flex; gap: 4px; }
.dr-ctl button { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 16px; color: var(--dr-vel); box-shadow: inset 0 0 0 2px #5a5344; }
.dr-ctl button:hover, .dr-ctl button:focus-visible { box-shadow: inset 0 0 0 2px var(--dr-gold); color: var(--dr-gold); }
.dr-ctl button[aria-pressed="true"] { background: var(--dr-gold); color: var(--dr-ink); }
.dr-tip { position: absolute; bottom: calc(100% + 8px); transform: translateX(-50%); background: var(--dr-ink); color: var(--dr-vel); font-family: Spectral, Georgia, serif; font-size: 13px;
  padding: 4px 8px; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 0 0 2px #5a5344; pointer-events: none; }
.dr-wait { font-size: 13px; color: var(--dr-soft); }
@media (max-width: 860px) {
  .dr { padding: 0 8px 6px; gap: 6px; }
  .dr-box { padding: 10px 12px; }
  .dr-cap { font-size: 16px; }
  .dr-strip .nm { display: none; }
  .dr-strip { grid-template-columns: minmax(0, 1fr) auto; }
  .dr-more { max-height: 28vh; }
}`;
  document.head.appendChild(css);
  if (!document.querySelector('link[href*="Pixelify"]')) {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&family=Silkscreen&family=Spectral:ital,wght@0,400;0,500;1,400&display=swap";
    document.head.appendChild(l);
  }

  let api = null, root = null, box = null, strip = null;
  const S = { story: null, i: -1, typing: 0, shown: 0, why: false, src: false, auto: false, timer: 0, t0: 0, dur: 0, raf: 0, ended: false, ends: [] };

  function init(a) {
    if (api) return;
    api = a;
    const map = document.getElementById("map") || document.querySelector(".map");
    root = document.createElement("div"); root.className = "dr"; root.hidden = true;
    root.setAttribute("role", "region"); root.setAttribute("aria-label", "Story");
    root.innerHTML = `<div class="dr-box" aria-live="polite"></div><div class="dr-strip"></div>`;
    map.appendChild(root);
    box = root.querySelector(".dr-box"); strip = root.querySelector(".dr-strip");
    box.addEventListener("click", onBox);
    strip.addEventListener("click", onStrip);
    wireScrub();
    document.addEventListener("keydown", onKey, true);
  }

  // ---------- playing ----------
  function play(story, opts = {}) {
    if (!api) return false;
    if (typeof story === "string") story = world.stories.get(story);
    if (!story) return false;
    if (story.sync) story.sync();
    if (!story.scenes || !story.scenes.length) return false;
    const app = document.querySelector(".app");
    stopAuto();
    S.story = story; S.i = -1; S.ended = false; S.auto = !!opts.auto;
    // The panel stays open so Ask is always one tap away; F still gives the map the whole screen.
    app.classList.add("directing");
    root.hidden = false;
    renderStrip();
    go(Math.max(0, Math.min(story.scenes.length - 1, opts.at || 0)));
    return true;
  }
  function go(i) {
    const st = S.story; if (!st) return;
    if (st.sync) st.sync();
    i = Math.max(0, Math.min(st.scenes.length - 1, i));
    const sc = st.scenes[i];
    S.i = i; S.why = false; S.src = false; S.ended = false;
    apply(sc);
    renderBox(true);
    renderStrip();
    if (S.auto) schedule();
  }
  // A scene on the map: the page's own scene player (fly, year, lenses, pins, routes), plus a month for deep regions.
  function apply(sc) {
    // The dialog box covers the bottom of the map, so the scene's subject sits a little above the centre.
    const view = sc.view && isFinite(sc.view.span) ? { ...sc.view, lat: sc.view.lat - sc.view.span * 0.07 } : sc.view;
    api.scene({ year: sc.t, view, lens: sc.lens || sc.by, by: null, layers: sc.lenses || [], highlight: sc.highlight || [],
      pins: sc.pins || [], routes: sc.routes || [], title: sc.caption });
    const e19 = A.e19;
    if (e19 && sc.date && sc.date.length >= 7) {
      const y = +sc.date.slice(0, 4);
      if (y >= 1789 && y <= 1914) { e19.m = y * 12 + +sc.date.slice(5, 7) - 1; if (sc.e19 != null) e19.focus = sc.e19; setTimeout(() => { try { A.pixelRefresh && A.pixelRefresh(); api.redraw(); } catch (err) { console.error(err); } }, 900); }
    }
  }
  function next() {
    if (!S.story) return;
    if (S.typing) return finishTyping();
    if (S.ended) return;
    const st = S.story; if (st.sync) st.sync();
    if (S.i < st.scenes.length - 1) return go(S.i + 1);
    if (st.loading) { renderBox(false, "The panel is still talking. The next scene plays as soon as it arrives."); clearTimeout(S.wait); S.wait = setTimeout(() => S.story === st && next(), 700); return; }
    end();
  }
  function prev() { if (!S.story) return; if (S.ended) return go(S.i); if (S.i > 0) go(S.i - 1); }
  function end() {
    stopAuto();
    S.ended = true;
    const nx = nextStory();
    box.classList.remove("alt");
    box.innerHTML = `<div class="dr-title">${esc(S.story.title)}</div>
      <div class="dr-kick"><span class="wh">The end</span><span>${S.story.scenes.length} scenes</span></div>
      <p class="dr-cap">${nx ? `Up next: <b>${esc(nx.title)}</b>` : "That is the whole story. The map is yours."}</p>
      <div class="dr-row">${nx ? `<button class="dr-btn" data-a="story" data-id="${esc(nx.id)}">▶ Play next</button>` : ""}<button class="dr-btn${nx ? " ghost" : ""}" data-a="leave">Explore from here</button><span class="sp"></span><button class="dr-link" data-a="replay">Replay</button></div>`;
    renderStrip();
    for (const f of S.ends) try { f(S.story); } catch (err) { console.error(err); }
    const b = box.querySelector(".dr-btn"); if (b) b.focus({ preventScroll: true });
  }
  // The one obvious next story: the story's own pick, then one nearby in time from the library.
  function nextStory() {
    const st = S.story, all = world.stories.list().filter(s => s.id !== st.id && s.kind !== "answer");
    if (st.next) { const s = all.find(s => s.id === st.next); if (s) return s; }
    const t = st.scenes[st.scenes.length - 1].t;
    if (t == null) return all[0] || null;
    const seen = (() => { try { return JSON.parse(localStorage.getItem("atlas.stories.v1") || "{}"); } catch { return {}; } })();
    const mid = s => { const ts = s.scenes.map(c => c.t).filter(Number.isFinite); return ts.length ? ts[Math.floor(ts.length / 2)] : 1e9; };
    return all.filter(s => !seen[s.id]).sort((a, b) => Math.abs(mid(a) - t) - Math.abs(mid(b) - t))[0] || all[0] || null;
  }
  function leave() {
    if (!S.story) return;
    stopAuto(); finishTyping(true);
    try { const seen = JSON.parse(localStorage.getItem("atlas.stories.v1") || "{}"); seen[S.story.id] = Date.now(); localStorage.setItem("atlas.stories.v1", JSON.stringify(seen)); } catch { /* progress is a convenience */ }
    S.story = null; S.i = -1; S.ended = false;
    root.hidden = true;
    const app = document.querySelector(".app");
    app.classList.remove("directing");
  }

  // ---------- autoplay ----------
  function schedule() {
    stopAuto(true);
    const sc = S.story.scenes[S.i];
    const words = String(sc.caption || "").split(/\s+/).length;
    S.dur = 1700 + typeMs(sc.caption) + Math.max(3800, words * 300);
    S.t0 = performance.now();
    S.timer = setTimeout(() => { if (S.story && S.auto) { if (S.i >= S.story.scenes.length - 1 && !S.story.loading) end(); else next(); } }, S.dur);
    const tick = now => { const seg = strip.querySelector(".dr-segs .on i"); if (seg) seg.style.setProperty("--p", Math.min(100, (now - S.t0) / S.dur * 100) + "%"); if (S.auto && S.story) S.raf = requestAnimationFrame(tick); };
    S.raf = requestAnimationFrame(tick);
  }
  function stopAuto(keep) { clearTimeout(S.timer); cancelAnimationFrame(S.raf); if (!keep) S.auto = false; }
  function toggleAuto() { S.auto = !S.auto; if (S.auto) { if (S.ended) go(0); else schedule(); } else stopAuto(); renderStrip(); }

  // ---------- the dialog box ----------
  const typeMs = s => reduce() ? 0 : Math.min(2600, String(s || "").length * 16);
  function confBadge(c) { return c && CONF_TEXT[c] ? `<span title="${esc(CONF_TEXT[c][1])}"><i class="dr-cf ${c}" aria-hidden="true"></i> ${esc(CONF_TEXT[c][0])}</span>` : ""; }
  function renderBox(fresh, note) {
    const st = S.story, sc = st.scenes[S.i]; if (!sc) return;
    const alt = !!sc.branch && sc.conf !== "attested";
    const kick = [sc.kick && !/^Stop /.test(sc.kick) ? `<span class="${alt ? "alt" : "wh"}">${esc(sc.kick)}</span>` : "", sc.date || sc.t != null ? `<span class="wh">${esc(fmtT(sc.t, sc.date))}</span>` : "",
      sc.by && BY[sc.by] ? `<span>${esc(BY[sc.by])}</span>` : "", confBadge(sc.conf), `<span>${S.i + 1} / ${st.scenes.length}${st.loading ? "+" : ""}</span>`].filter(Boolean).join("");
    const hasWhy = !!(sc.text && sc.text.trim() && sc.text.trim() !== sc.caption.trim());
    const primary = hasWhy ? `<button class="dr-btn" data-a="why" aria-expanded="${S.why}">${S.why ? "Less" : "Why?"}</button>` : `<button class="dr-btn" data-a="deeper">Go deeper</button>`;
    const more = S.why ? `<div class="dr-more">${String(sc.text).split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}${(sc.actors || []).length ? `<p class="who">With ${esc(sc.actors.map(nameOf).join(", "))}</p>` : ""}
        <div class="dr-row"><button class="dr-btn" data-a="deeper">${esc(deeperLabel(sc))}</button></div></div>` : "";
    const src = S.src ? `<div class="dr-more dr-src">${srcHtml(sc)}</div>` : "";
    box.classList.toggle("alt", alt);
    box.innerHTML = `${S.i === 0 ? `<div class="dr-title">${esc(st.title)}</div>` : ""}<div class="dr-kick">${kick}</div>
      <p class="dr-cap"><span class="vis"></span><span class="ghost"></span></p>${more}${src}
      ${note ? `<p class="dr-wait">${esc(note)}</p>` : ""}
      <div class="dr-row">${primary}<button class="dr-link" data-a="src" aria-expanded="${S.src}">How do we know</button><span class="sp"></span><span class="dr-cont" aria-hidden="true">${S.i < st.scenes.length - 1 || st.loading ? "Space" : "Space · the end"} <i>▼</i></span></div>`;
    if (fresh) {
      if (!reduce()) { box.classList.add("swap"); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove("swap"))); }
      typeCaption(sc.caption);
    } else { box.querySelector(".vis").textContent = sc.caption; }
  }
  // The caption types itself in, like an RPG dialog box; Space shows it all at once.
  function typeCaption(text) {
    finishTyping(true);
    const vis = box.querySelector(".vis"), ghost = box.querySelector(".ghost"), cont = box.querySelector(".dr-cont");
    const ms = typeMs(text);
    if (!ms) { vis.textContent = text; return; }
    const t0 = performance.now(); let n = -1;
    if (cont) cont.style.visibility = "hidden";
    ghost.textContent = text;
    const tick = now => {
      const k = Math.min(text.length, Math.ceil((now - t0) / ms * text.length));
      if (k !== n) { n = k; vis.textContent = text.slice(0, k); ghost.textContent = text.slice(k); }
      if (k < text.length) S.typing = requestAnimationFrame(tick); else { S.typing = 0; if (cont) cont.style.visibility = ""; }
    };
    S.typing = requestAnimationFrame(tick);
  }
  function finishTyping(silent) {
    if (!S.typing) return;
    cancelAnimationFrame(S.typing); S.typing = 0;
    if (silent || !S.story) return;
    const sc = S.story.scenes[S.i], vis = box.querySelector(".vis"), ghost = box.querySelector(".ghost"), cont = box.querySelector(".dr-cont");
    if (vis) vis.textContent = sc.caption; if (ghost) ghost.textContent = ""; if (cont) cont.style.visibility = "";
  }
  const nameOf = id => String(id).replace(/^[a-z]+:/, "").replace(/_q\d+$/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  function deeperLabel(sc) {
    const d = sc.deeper || {};
    if (d.story) { const s = world.stories.get(d.story); return s ? "▶ " + (d.label || s.title) : "Go deeper"; }
    if (d.tab) return d.label || "Study it up close";
    return api.ask ? "Ask the panel" : "Explore from here";
  }
  function deeper() {
    const sc = S.story.scenes[S.i], d = sc.deeper || {};
    if (d.story && world.stories.get(d.story)) return play(d.story);
    if (d.tab) { leave(); api.setTab(d.tab); return; }
    const q = d.q || sc.ask;
    leave();
    if (q && api.ask) api.ask(q);
  }
  function srcHtml(sc) {
    const st = S.story, srcs = (sc.sources || []).filter(s => s && (s.cite || s.url));
    const status = st.live ? "A live AI draft: the sources below are the ones the model believes exist, unchecked." : st.status === "draft" || !st.status ? "A curated draft: sources listed, waiting for the judge." : "";
    return `<div class="cf">${["attested", "estimated", "approximate", "unknown"].map(c => `<i class="dr-cf ${c}${c === sc.conf ? " on" : ""}" aria-hidden="true"></i><span${c === sc.conf ? ' class="on"' : ""}><b>${esc(CONF_TEXT[c][0])}</b> ${esc(CONF_TEXT[c][1])}</span>`).join("")}</div>
      ${sc.conf ? "" : "<p>This scene does not say how sure it is.</p>"}
      ${srcs.length ? `<ul>${srcs.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite || s.url)}</a>` : esc(s.cite)}</li>`).join("")}</ul>` : "<p>No source is named for this scene.</p>"}
      ${sc.debate ? `<p><b>Debated:</b> ${esc(sc.debate)}</p>` : ""}${status ? `<p class="who">${esc(status)}</p>` : ""}`;
  }
  function onBox(ev) {
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "why") { finishTyping(); S.why = !S.why; S.src = false; stopAuto(); renderStrip(); renderBox(false); }
    else if (a === "src") { finishTyping(); S.src = !S.src; S.why = false; stopAuto(); renderStrip(); renderBox(false); }
    else if (a === "deeper") deeper();
    else if (a === "leave") leave();
    else if (a === "replay") go(0);
    else if (a === "story") play(b.dataset.id);
  }

  // ---------- the strip: the story's scenes in a row, a scrubber ----------
  function renderStrip() {
    const st = S.story; if (!st) return;
    const n = st.scenes.length;
    strip.innerHTML = `<span class="nm" title="${esc(st.title)}">${esc((world.stories.KIND_NAME[st.kind] || "Story") + " · " + st.title)}</span>
      <div class="dr-segs" role="group" aria-label="Scenes: tap or drag to jump">${st.scenes.map((c, i) => `<button data-i="${i}" class="${i === S.i && !S.ended ? "on" : i < S.i || S.ended ? "done" : ""}${c.branch ? " alt" : ""}" aria-label="Scene ${i + 1}: ${esc(c.caption)}"${i === S.i ? ' aria-current="step"' : ""}><i></i></button>`).join("")}</div>
      <div class="dr-ctl"><button data-a="prev" title="Back (←)" aria-label="Back">◀</button><button data-a="auto" aria-pressed="${S.auto}" title="Play by itself (P)" aria-label="Play by itself">${S.auto ? "❚❚" : "▶"}</button><button data-a="next" title="Next (Space or →)" aria-label="Next">▶▶</button><button data-a="leave" title="Leave the story (Esc)" aria-label="Leave the story">✕</button></div>`;
    if (n > 40) strip.querySelector(".dr-segs").style.gap = "1px";
  }
  function onStrip(ev) {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.i != null) return;  // segments are handled by the scrubber
    const a = b.dataset.a;
    if (a === "prev") { stopAuto(); renderStrip(); prev(); } else if (a === "next") next(); else if (a === "auto") toggleAuto(); else if (a === "leave") leave();
  }
  function wireScrub() {
    let drag = false, tip = null;
    const at = ev => { const segs = strip.querySelector(".dr-segs"); if (!segs || !S.story) return -1; const r = segs.getBoundingClientRect(); return Math.max(0, Math.min(S.story.scenes.length - 1, Math.floor((ev.clientX - r.left) / r.width * S.story.scenes.length))); };
    const showTip = (ev, i) => {
      if (i < 0) return hideTip();
      const segs = strip.querySelector(".dr-segs"), r = segs.getBoundingClientRect(), rr = root.getBoundingClientRect(), sc = S.story.scenes[i];
      if (!tip) { tip = document.createElement("div"); tip.className = "dr-tip"; root.appendChild(tip); }
      tip.textContent = `${fmtT(sc.t, sc.date)} · ${sc.caption}`;
      tip.style.left = Math.max(120, Math.min(rr.width - 120, r.left - rr.left + (i + 0.5) / S.story.scenes.length * r.width)) + "px";
      tip.style.bottom = (rr.bottom - r.top + 8) + "px";
    };
    const hideTip = () => { if (tip) { tip.remove(); tip = null; } };
    strip.addEventListener("pointerdown", ev => { if (!ev.target.closest(".dr-segs")) return; drag = true; strip.setPointerCapture(ev.pointerId); stopAuto(); const i = at(ev); if (i >= 0 && (i !== S.i || S.ended)) go(i); ev.preventDefault(); });
    strip.addEventListener("pointermove", ev => { const i = ev.target.closest(".dr-segs") || drag ? at(ev) : -1; showTip(ev, i); if (drag && i >= 0 && i !== S.i) go(i); });
    strip.addEventListener("pointerup", () => { drag = false; });
    strip.addEventListener("pointerleave", () => { if (!drag) hideTip(); });
    strip.addEventListener("pointercancel", () => { drag = false; hideTip(); });
  }

  // ---------- keys: they belong to the story while one plays ----------
  function onKey(ev) {
    if (!S.story || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    if (t.closest && t.closest(".dr button") && (ev.key === " " || ev.key === "Enter")) return;  // a focused button presses itself
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (ev.shiftKey && (k === "ArrowLeft" || k === "ArrowRight")) return;  // Shift+arrows still step the year
    if (k === " " || k === "ArrowRight") next();
    else if (k === "ArrowLeft") { stopAuto(); renderStrip(); prev(); }
    else if (k === "Enter") { const b = box.querySelector(".dr-btn"); if (b) b.click(); }
    else if (k === "w" || k === "y") { if (!S.ended) onBox({ target: box.querySelector('[data-a="why"]') || box }); }
    else if (k === "h") { if (!S.ended) onBox({ target: box.querySelector('[data-a="src"]') }); }
    else if (k === "p") toggleAuto();
    else if (k === "Escape") { if (S.why || S.src) { S.why = S.src = false; renderBox(false); } else leave(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(S.story.scenes.length - 1);
    else return;
    ev.preventDefault(); ev.stopPropagation();
  }

  world.director = {
    init, play, go, next, prev, leave,
    get active() { return !!S.story; }, get story() { return S.story; }, get index() { return S.i; },
    onEnd: fn => S.ends.push(fn),
  };
})();
