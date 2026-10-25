// The Atlas chrome: dresses the page's own markup in the chronicle style (icons, the year cartouche's era line,
// the lens rail, ribbon tabs) and adds what the HUD needs: the one next thing, a foldable panel (the page owns the phone sheet),
// era names under the slider, and ATLAS.chromeRects() so the label engine can keep map labels out from under the HUD.
// Runs after the page script. Icons come from views/pixel/icons.js (PIXEL_ICONS), colours from the kit (chrome/kit.py).
(function () {
  const A = window.ATLAS, I = window.PIXEL_ICONS;
  if (!A || !A.api || !I) return;
  const api = A.api, app = document.querySelector(".app"), root = document.documentElement;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ico = (n, cls) => I.svg(n, cls);
  const phone = matchMedia("(max-width: 700px)");
  let rectT = 0;

  // ---------- icons on the existing controls ----------
  const TAB_ICON = { now: "year", here: "here", guide: "ask", codex: "codex", whatif: "whatif", stories: "stories", objects: "objects", upclose: "lens", compare: "compare", life: "life", travels: "travels", guess: "guess" };
  const TAB_SHORT = { now: "Year", upclose: "Close", travels: "Who" };
  function dressTab(b) {
    if (b.querySelector(".ico")) return;
    const name = b.textContent.replace(/\s+\d+$/, "").trim();
    b.innerHTML = ico(TAB_ICON[b.dataset.tab] || "seal") + `<span class="nm"></span>`;
    b.querySelector(".nm").textContent = TAB_SHORT[b.dataset.tab] || TAB_SHORT[name] || name;
    b.title = name;
  }
  $$(".tab").forEach(dressTab);
  // More than eight ribbons: only the open one keeps its name (the rest say theirs on hover).
  const countTabs = () => $(".tabs").classList.toggle("many", $$(".tab").length > 8);
  countTabs(); new MutationObserver(countTabs).observe($(".tabs"), { childList: true });
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains("tab")) dressTab(n); }).observe($(".tabs"), { childList: true });
  // A plugin that rewrites a tab's text (an old badge) gets its icon back.
  new MutationObserver(ms => { for (const m of ms) { const b = m.target.closest && m.target.closest(".tab") || m.target; if (b.classList && b.classList.contains("tab") && !b.querySelector(".ico")) dressTab(b); } }).observe($(".tabs"), { childList: true, subtree: true, characterData: true });

  function dressFamilies() {
    $$("#layers .chip.fam").forEach(b => {
      if (b.querySelector(".ico")) return;
      const name = b.textContent.trim();
      b.insertAdjacentHTML("afterbegin", ico(I.FAMILY[b.dataset.k] || "seal"));
      for (const n of [...b.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement("span"); s.className = "nm"; s.textContent = n.textContent.trim(); n.replaceWith(s); }
      b.setAttribute("aria-label", name); b.title = b.title || name;
    });
  }
  dressFamilies();
  const ctlIcon = { surprise: "die", keybtn: "key", focusbtn: "focus" };
  for (const [id, n] of Object.entries(ctlIcon)) {
    const b = document.getElementById(id); if (!b || b.querySelector(".ico")) continue;
    for (const t of [...b.childNodes]) if (t.nodeType === 3 && t.textContent.trim()) { const s = document.createElement("span"); s.className = "lb"; s.textContent = t.textContent.trim(); t.replaceWith(s); }
    b.insertAdjacentHTML("afterbegin", ico(n));
  }
  const ask = $("#ask"); if (ask && !ask.querySelector(".ico")) ask.insertAdjacentHTML("afterbegin", ico("ask"));
  // Play: the page writes ▶ or ❚❚ into the button; show the matching pixel glyph instead.
  const play = $("#playyear");
  if (play) {
    const dress = () => { const paused = /pause/i.test(play.getAttribute("aria-label") || ""); const want = paused ? "pause" : "play"; if (play.dataset.ico !== want || !play.querySelector(".ico")) { play.dataset.ico = want; play.innerHTML = ico(want); } };
    new MutationObserver(dress).observe(play, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
    dress();
  }

  // ---------- the year cartouche's era line, and era names under the slider ----------
  // Year steps must stay inside one frame, so this only touches the DOM when the era changes, and measures
  // the era buttons once per resize. The era-styles thread owns data-era and the --era-* accents on the root.
  const ypEra = $("#ypera");
  let eraIdx = -2, eraW = null;
  function syncEraNames(force) {
    const bs = $$("#eras button"), i = bs.findIndex(b => b.getAttribute("aria-current") === "true");
    if (i === eraIdx && !force) return;
    eraIdx = i;
    if (!eraW || force) eraW = bs.map(b => b.getBoundingClientRect().width);
    bs.forEach((b, j) => {
      if (!b.dataset.full) b.dataset.full = b.textContent;
      const full = b.dataset.full, w = eraW[j] || 0;
      const short = full.split(/[\s-]+/).filter(Boolean).map(s => /^\d/.test(s) ? s : s[0]).join("").toUpperCase();
      // Full names near you where they fit, initials elsewhere; the name is always in the tooltip.
      const t = Math.abs(j - i) <= 1 && w >= full.length * 6.4 ? full : w >= short.length * 7 + 6 ? short : "";
      if (b.textContent !== t) b.textContent = t;
    });
    if (ypEra) ypEra.textContent = i >= 0 ? bs[i].dataset.full : "";
  }
  api.onYear(() => syncEraNames());
  syncEraNames(true);
  let rsT = 0;
  addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { syncEraNames(true); emitRects(); }, 150); });

  // The map's era style (views/pixel/eras.js), picked on the cartouche: "By year" follows the year, the rest pin one look.
  if (A.eraStyles && A.setEraStyle && ypEra) {
    const sel = document.createElement("select");
    sel.className = "yp-style"; sel.title = "Map style"; sel.setAttribute("aria-label", "Map style");
    sel.innerHTML = A.eraStyles.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
    sel.value = (A.eraStyle && A.eraStyle().choice) || "auto";
    sel.addEventListener("change", () => A.setEraStyle(sel.value));
    ypEra.parentNode.appendChild(sel);
  }

  // ---------- the one next thing ----------
  // Providers say what you could do next; the highest priority with something to say wins. A plugin adds one with
  // ATLAS.nextThing({ id, pri, get() -> { kick, title, go } | null }).
  // Plugins that loaded before this script queued theirs on ATLAS.nexts.
  const nexts = [];
  let current = null, nextT = 0;
  A.nextThing = d => { if (d && typeof d.get === "function") { nexts.push(d); nexts.sort((a, b) => (b.pri || 0) - (a.pri || 0)); scheduleNext(); } };
  for (const d of A.nexts || []) A.nextThing(d);
  let toured = false; try { toured = !!localStorage.getItem("atlas.toured.v1"); } catch (e) {}
  A.nextThing({ id: "tour-step", pri: 100, get() {
    const nb = document.getElementById("next"), steps = $$("#answer .step");
    if (!nb || !nb.isConnected || !steps.length) return null;
    const on = steps.findIndex(s => s.classList.contains("on")), nx = steps[on + 1];
    if (!nx) return null;
    const t = nx.querySelector(".t");
    return { kick: `Next step · ${on + 2} of ${steps.length}`, title: t ? t.textContent : "The next step", go: () => nb.click() };
  } });
  A.nextThing({ id: "first-tour", pri: 30, get() {
    if (toured) return null;
    const ex = $$("#examples .ex").find(b => b.querySelector(".tg.cur"));
    if (!ex) return null;
    return { kick: "Start here · a guided tour", title: ex.firstChild.textContent.trim(), go: () => { toured = true; try { localStorage.setItem("atlas.toured.v1", "1"); } catch (e) {} api.setTab("guide"); ex.click(); } };
  } });
  A.nextThing({ id: "surprise", pri: 0, get: () => ({ kick: "Next · press S", title: "Surprise me: a moment worth seeing", go: () => { const b = document.getElementById("surprise"); if (b) b.click(); } }) });

  const map = $("#map");
  let card = document.getElementById("nextcard");
  if (!card) { card = document.createElement("button"); card.type = "button"; card.id = "nextcard"; card.className = "nextcard"; map.appendChild(card); }
  function renderNext() {
    nextT = 0;
    let got = null;
    for (const d of nexts) { try { got = d.get(); } catch (err) { console.error("next " + d.id, err); } if (got && got.title) break; }
    current = got;
    if (!got) { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = ico("next") + `<span class="kick"></span><b></b>`;
    card.querySelector(".kick").textContent = got.kick || "Next";
    card.querySelector("b").textContent = got.title;
    card.title = got.title;
  }
  function scheduleNext() { if (!nextT) nextT = setTimeout(renderNext, 250); }
  card.addEventListener("click", () => { if (current && current.go) { current.go(); setTimeout(renderNext, 600); } });
  api.onYear(() => { clearTimeout(nextT); nextT = 0; nextT = setTimeout(renderNext, 700); });
  document.addEventListener("click", ev => { if (ev.target.closest(".panel, #map")) scheduleNext(); }, true);
  new MutationObserver(scheduleNext).observe($("#answer") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  // ---------- the panel folds to its ribbons (P, or tap the open ribbon) ----------
  const panel = $("#panel");
  function setFold(v) {
    app.classList.toggle("panel-min", v);
    try { localStorage.setItem("atlas.panelmin.v1", v ? "1" : ""); } catch (e) {}
    emitRects();
  }
  $(".tabs").addEventListener("click", ev => {
    const b = ev.target.closest(".tab"); if (!b || phone.matches) return;
    // The page switched the tab already (its own handler ran first); a tap on the tab that was open folds the panel.
    if (b.dataset.wasOpen === "1" && !app.classList.contains("panel-min") ) setFold(true);
    else if (app.classList.contains("panel-min") ) setFold(false);
  });
  $(".tabs").addEventListener("pointerdown", ev => { $$(".tab").forEach(t => t.dataset.wasOpen = t.getAttribute("aria-selected") === "true" ? "1" : ""); }, true);
  $(".tabs").addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") $$(".tab").forEach(t => t.dataset.wasOpen = t.getAttribute("aria-selected") === "true" ? "1" : ""); }, true);
  document.addEventListener("keydown", ev => {
    if (ev.target.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.key === "p" || ev.key === "P") && !phone.matches && !app.classList.contains("directing")) { ev.preventDefault(); setFold(!app.classList.contains("panel-min") ); }
  });
  // Anything that writes into Here (a click on the map) opens the panel again.
  new MutationObserver(() => { if (app.classList.contains("panel-min") ) { if ($$(".tab").some(t => t.dataset.tab !== "guide" && t.getAttribute("aria-selected") === "true" && t.dataset.tab === "here")) setFold(false); } })
    .observe($("#pane-here"), { childList: true });
  // Map first: the panel starts folded to its ribbons and opens when something is asked of it.
  let wantMin = true; try { const v = localStorage.getItem("atlas.panelmin.v1"); if (v !== null) wantMin = !!v; } catch (e) {}
  if (wantMin && !phone.matches) setFold(true);
  const curTab = () => { const t = $$(".tab").find(t => t.getAttribute("aria-selected") === "true"); return t ? t.dataset.tab : null; };
  let lastTab = curTab();
  new MutationObserver(() => { if (app.classList.contains("panel-min") && !phone.matches) setFold(false); }).observe($("#answer") || panel, { childList: true });

  // The grip at the foot of the panel: about 60% of the height by default, the full height on demand.
  const grip = document.createElement("button");
  grip.type = "button"; grip.className = "grip";
  const syncGrip = () => { const tall = app.classList.contains("panel-tall"); grip.textContent = tall ? "Shorter" : "Taller"; grip.setAttribute("aria-label", tall ? "Make the panel shorter" : "Make the panel taller"); };
  grip.addEventListener("click", () => { app.classList.toggle("panel-tall"); syncGrip(); try { localStorage.setItem("atlas.paneltall.v1", app.classList.contains("panel-tall") ? "1" : ""); } catch (e) {} emitRects(); });
  try { if (localStorage.getItem("atlas.paneltall.v1")) app.classList.add("panel-tall"); } catch (e) {}
  panel.appendChild(grip); syncGrip();
  // Plugin panes added later still sit above the grip.
  new MutationObserver(() => { if (panel.lastElementChild !== grip) panel.appendChild(grip); }).observe(panel, { childList: true });

  // ---------- show or hide the interface: the eye (H). Panning fades it; hovering brings it back ----------
  const eye = document.createElement("button");
  eye.type = "button"; eye.className = "btn eyebtn"; eye.innerHTML = ico("focus") + `<span class="nm">Hide</span>`;
  const mapctl = $(".mapctl"); if (mapctl) mapctl.appendChild(eye);
  function setHidden(v) {
    const was = app.classList.contains("ui-hidden");
    app.classList.toggle("ui-hidden", v); root.classList.toggle("ui-bare", v);
    if (was !== v && A.pixelRefresh) A.pixelRefresh();
    if (v && !was) { let seen = false; try { seen = !!localStorage.getItem("atlas.uihint.v1"); localStorage.setItem("atlas.uihint.v1", "1"); } catch (e) {}
      if (!seen) { const t = document.createElement("div"); t.className = "uihint"; t.textContent = "Press H or the eye to bring it back"; map.appendChild(t); setTimeout(() => t.remove(), 2200); } }
    eye.setAttribute("aria-pressed", v); eye.title = v ? "Show the interface (H)" : "Hide the interface: just the map (H)";
    eye.querySelector(".nm").textContent = v ? "Show" : "Hide";
    try { localStorage.setItem("atlas.uihidden.v1", v ? "1" : ""); } catch (e) {}
    emitRects();
  }
  eye.addEventListener("click", () => setHidden(!app.classList.contains("ui-hidden")));
  document.addEventListener("keydown", ev => {
    if (ev.target.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "h" || ev.key === "H") { ev.preventDefault(); setHidden(!app.classList.contains("ui-hidden")); }
  });
  let hid = false; try { hid = !!localStorage.getItem("atlas.uihidden.v1"); } catch (e) {}
  setHidden(hid);
  // While you drag the map the interface steps back to a ghost, so the place you are looking for is not under it.
  let panT = 0, down = null;
  map.addEventListener("pointerdown", ev => { if (ev.target.closest("button, a, input, select, .panel, .dr")) return; down = [ev.clientX, ev.clientY]; }, { passive: true });
  addEventListener("pointermove", ev => {
    if (!down || app.classList.contains("panning")) return;
    if (Math.abs(ev.clientX - down[0]) + Math.abs(ev.clientY - down[1]) > 6) { clearTimeout(panT); app.classList.add("panning"); }
  }, { passive: true });
  addEventListener("pointerup", () => { down = null; clearTimeout(panT); panT = setTimeout(() => app.classList.remove("panning"), 300); }, { passive: true });

  // ---------- games and modes: one way in, one way out ----------
  // Opening a game or mode remembers the year, view, lenses and tab you came from; "Back to map" (or Esc) puts them back
  // and folds the panel, so the map is where you left it.
  const MODES = { codex: "Codex", guess: "Guess the past", life: "Live a life", whatif: "What if", stories: "Stories", travels: "Who was there", objects: "Objects", compare: "Compare", upclose: "Up close" };
  let home = null;
  const plate = document.createElement("div");
  plate.className = "modeplate"; plate.hidden = true;
  plate.innerHTML = `<button type="button" class="mp-back">${ico("next")}<span>Back to map</span><kbd>Esc</kbd></button><span class="mp-nm"></span>
    <button type="button" class="mp-peek" title="Fold the panel to look at the map (P)"></button>`;
  map.appendChild(plate);
  const syncPeek = () => { plate.querySelector(".mp-peek").textContent = app.classList.contains("panel-min") ? "Show panel" : "Look at the map"; };
  plate.querySelector(".mp-peek").addEventListener("click", () => { setFold(!app.classList.contains("panel-min")); syncPeek(); });
  plate.querySelector(".mp-back").addEventListener("click", () => exitMode());
  function syncMode() {
    const t = curTab();
    if (t === lastTab) return;
    if (MODES[t] && !home) {
      const v = api.view();
      home = { tab: MODES[lastTab] ? "here" : lastTab || "guide", year: api.year, view: v, lenses: api.lenses ? api.lenses() : null };
    }
    if (!MODES[t]) home = null;
    if (lastTab !== null && app.classList.contains("panel-min") && !phone.matches) setFold(false);
    lastTab = t;
    plate.hidden = !home;
    app.classList.toggle("in-mode", !!home);
    if (home) plate.querySelector(".mp-nm").textContent = MODES[t];
    syncPeek(); emitRects();
  }
  function exitMode() {
    const h = home; if (!h) return;
    home = null; lastTab = h.tab;
    api.setTab(h.tab);
    if (h.lenses && api.lenses) {
      const now = api.lenses();
      for (const k of now) if (!h.lenses.includes(k)) api.setOn(k, false);
      for (const k of h.lenses) if (!now.includes(k)) api.setOn(k, true);
    }
    // Whatever the mode drew on the map (pins, routes, a caption) goes with it.
    if (api.clearScene) api.clearScene();
    if (A.motion && A.motion.pulse) A.motion.pulse(null, { all: true });
    if (h.year !== api.year) api.setYear(h.year, true, 600);
    if (h.view) api.fly({ lon: h.view.lon, lat: h.view.lat, zoom: h.view.k }, 900);
    plate.hidden = true; app.classList.remove("in-mode");
    if (!phone.matches) setFold(true);
    syncPeek(); emitRects();
  }
  A.exitMode = exitMode;
  new MutationObserver(syncMode).observe($(".tabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  new MutationObserver(syncPeek).observe(app, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape" || !home || app.classList.contains("directing") || ev.target.closest("input, textarea, select")) return;
    const key = $(".keycard"); if (key && !key.hidden) return;
    exitMode();
  });

  // A story on the map: views/atlas/world/director.js draws the dialog box and puts the page in focus mode;
  // atlas.css dresses the box in the chronicle's frames.

  // ---------- what the HUD covers, for the label engine ----------
  // ATLAS.chromeRects() -> [[x0, y0, x1, y1], ...] in map pixels (the label queue keeps labels out of them);
  // "atlas:chrome" fires on the document when they change.
  const HUD = [".modeplate", ".dr-box", ".dr-strip", ".yearplate", "#nextcard", "#layers", "#sublayers", ".askbar", ".mapctl", ".time", ".panel", ".caption", ".keycard", ".maphint"];
  A.chromeRects = () => {
    const m = map.getBoundingClientRect(), out = [];
    for (const s of HUD) for (const el of document.querySelectorAll(s)) {
      if (el.hidden || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      out.push([r.left - m.left, r.top - m.top, r.right - m.left, r.bottom - m.top]);
    }
    return out;
  };
  function emitRects() { clearTimeout(rectT); rectT = setTimeout(() => document.dispatchEvent(new CustomEvent("atlas:chrome", { detail: A.chromeRects() })), 60); }
  new MutationObserver(emitRects).observe(app, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(emitRects).observe($("#sublayers"), { childList: true });

  // A family's lenses fly out beside the rail and fold away when you click anywhere else.
  document.addEventListener("pointerdown", ev => { app.classList.toggle("sub-shut", !ev.target.closest("#layers, #sublayers")); }, true);

  // The family chips get their icons back if the page rebuilds them; lenses that open or close move the rail.
  new MutationObserver(dressFamilies).observe($("#layers"), { childList: true });
  renderNext();
  emitRects();
})();
