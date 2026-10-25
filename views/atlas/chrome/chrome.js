// The Atlas chrome: dresses the page's own markup in the chronicle style (icons, the year cartouche's era line,
// the lens rail, ribbon tabs) and adds what the HUD needs: the one next thing, a foldable panel, a phone sheet,
// era names under the slider, and ATLAS.chromeRects() so the label engine can keep map labels out from under the HUD.
// Runs after the page script. Icons come from views/pixel/icons.js (PIXEL_ICONS), colours from the kit (chrome/kit.py).
(function () {
  const A = window.ATLAS, I = window.PIXEL_ICONS;
  if (!A || !A.api || !I) return;
  const api = A.api, app = document.querySelector(".app"), root = document.documentElement;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ico = (n, cls) => I.svg(n, cls);
  const phone = matchMedia("(max-width: 860px)");
  let rectT = 0;

  // ---------- icons on the existing controls ----------
  const TAB_ICON = { now: "year", here: "here", guide: "ask", codex: "codex", whatif: "whatif" };
  const TAB_SHORT = { now: "Year", "Up close": "Close" };
  function dressTab(b) {
    if (b.querySelector(".ico")) return;
    const name = b.textContent.replace(/\s+\d+$/, "").trim();
    b.innerHTML = ico(TAB_ICON[b.dataset.tab] || "seal") + `<span class="nm"></span>`;
    b.querySelector(".nm").textContent = TAB_SHORT[b.dataset.tab] || TAB_SHORT[name] || name;
    b.title = name;
  }
  $$(".tab").forEach(dressTab);
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

  // ---------- the year cartouche: era line, era accent hook ----------
  // Eras as the art direction names them (D9). The era-styles thread owns the grade; the chrome only swaps its accent.
  const ACCENT = [
    [-99999, -500, "antiquity", "Antiquity"], [-500, 500, "antiquity", "Classical antiquity"], [500, 1000, "medieval", "Early Middle Ages"], [1000, 1450, "medieval", "High and late Middle Ages"],
    [1450, 1789, "early-modern", "Early modern"], [1789, 1914, "long-19th", "The long 19th century"], [1914, 1991, "20th", "The 20th century"], [1991, 99999, "now", "Now"],
  ];
  const ypEra = $("#ypera");
  function syncEra(y) {
    const a = ACCENT.find(e => y >= e[0] && y < e[1]) || ACCENT[ACCENT.length - 1];
    if (root.dataset.era !== a[2]) root.dataset.era = a[2];
    const cur = $("#eras button[aria-current='true']");
    if (ypEra) ypEra.textContent = cur ? (cur.dataset.full || cur.title.split(",")[0]) : a[3];
  }

  // ---------- eras under the slider: the current one and its neighbours by name, the rest by initials ----------
  function syncEraNames() {
    const bs = $$("#eras button"), i = bs.findIndex(b => b.getAttribute("aria-current") === "true");
    bs.forEach((b, j) => {
      if (!b.dataset.full) b.dataset.full = b.textContent;
      const full = b.dataset.full, w = b.getBoundingClientRect().width;
      const short = full.split(/[\s-]+/).filter(Boolean).map(s => /^\d/.test(s) ? s : s[0]).join("").toUpperCase();
      // Full names where they fit near you, initials elsewhere; the name is always in the tooltip.
      b.textContent = Math.abs(j - i) <= 1 && w >= full.length * 6.4 ? full : w >= short.length * 7 + 6 ? short : "";
    });
  }

  api.onYear(y => { syncEra(y); syncEraNames(); });
  syncEra(api.year); syncEraNames();
  addEventListener("resize", () => { syncEraNames(); emitRects(); });

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
    if (phone.matches) app.classList.toggle("sheet-min", v);
    try { localStorage.setItem("atlas.panelmin.v1", v ? "1" : ""); } catch (e) {}
    emitRects();
  }
  $(".tabs").addEventListener("click", ev => {
    const b = ev.target.closest(".tab"); if (!b) return;
    // The page switched the tab already (its own handler ran first); a tap on the tab that was open folds the panel.
    if (b.dataset.wasOpen === "1" && !app.classList.contains("panel-min") && !app.classList.contains("sheet-min")) setFold(true);
    else if (app.classList.contains("panel-min") || app.classList.contains("sheet-min")) setFold(false);
  });
  $(".tabs").addEventListener("pointerdown", ev => { $$(".tab").forEach(t => t.dataset.wasOpen = t.getAttribute("aria-selected") === "true" ? "1" : ""); }, true);
  $(".tabs").addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") $$(".tab").forEach(t => t.dataset.wasOpen = t.getAttribute("aria-selected") === "true" ? "1" : ""); }, true);
  document.addEventListener("keydown", ev => {
    if (ev.target.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "p" || ev.key === "P") { ev.preventDefault(); setFold(!app.classList.contains("panel-min") && !app.classList.contains("sheet-min")); }
  });
  // Anything that writes into Here (a click on the map) opens the panel again.
  new MutationObserver(() => { if (app.classList.contains("panel-min") || app.classList.contains("sheet-min")) { if ($$(".tab").some(t => t.dataset.tab !== "guide" && t.getAttribute("aria-selected") === "true" && t.dataset.tab === "here")) setFold(false); } })
    .observe($("#pane-here"), { childList: true });
  let wantMin = false; try { wantMin = !!localStorage.getItem("atlas.panelmin.v1"); } catch (e) {}
  // On a phone the sheet starts folded so the map gets most of the screen.
  if (phone.matches || wantMin) setFold(true);

  // The grip at the foot of the panel: about 60% of the height by default, the full height on demand.
  const grip = document.createElement("button");
  grip.type = "button"; grip.className = "grip";
  const syncGrip = () => { const tall = app.classList.contains("panel-tall"); grip.textContent = tall ? "Shorter" : "Taller"; grip.setAttribute("aria-label", tall ? "Make the panel shorter" : "Make the panel taller"); };
  grip.addEventListener("click", () => { app.classList.toggle("panel-tall"); syncGrip(); try { localStorage.setItem("atlas.paneltall.v1", app.classList.contains("panel-tall") ? "1" : ""); } catch (e) {} emitRects(); });
  try { if (localStorage.getItem("atlas.paneltall.v1")) app.classList.add("panel-tall"); } catch (e) {}
  panel.appendChild(grip); syncGrip();
  // Plugin panes added later still sit above the grip.
  new MutationObserver(() => { if (panel.lastElementChild !== grip) panel.appendChild(grip); }).observe(panel, { childList: true });

  // ---------- phone: drag the sheet by its ribbons ----------
  (function sheetDrag() {
    const tabs = $(".tabs");
    let y0 = 0, h0 = 0, drag = false, moved = false;
    tabs.addEventListener("pointerdown", ev => { if (!phone.matches) return; drag = true; moved = false; y0 = ev.clientY; h0 = panel.getBoundingClientRect().height; });
    addEventListener("pointermove", ev => {
      if (!drag) return;
      const dy = ev.clientY - y0; if (Math.abs(dy) > 6) moved = true; if (!moved) return;
      app.classList.remove("sheet-min");
      panel.style.height = Math.max(60, Math.min(innerHeight * .86, h0 - dy)) + "px";
    });
    addEventListener("pointerup", () => {
      if (!drag) return; drag = false; if (!moved) return;
      const h = panel.getBoundingClientRect().height, vh = innerHeight;
      panel.style.height = "";
      // Snap to folded, half or tall.
      if (h < vh * .22) setFold(true); else { setFold(false); app.classList.toggle("sheet-tall", h > vh * .6); }
      tabs.addEventListener("click", e => e.stopPropagation(), { capture: true, once: true });
    });
  })();

  // ---------- what the HUD covers, for the label engine ----------
  // ATLAS.chromeRects() -> [{x, y, w, h}] in map pixels; "atlas:chrome" fires on the document when they change.
  const HUD = [".yearplate", "#nextcard", "#layers", "#sublayers", ".askbar", ".mapctl", ".time", ".panel", ".caption", ".keycard", ".maphint"];
  A.chromeRects = () => {
    const m = map.getBoundingClientRect(), out = [];
    for (const s of HUD) for (const el of document.querySelectorAll(s)) {
      if (el.hidden || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      out.push({ x: r.left - m.left, y: r.top - m.top, w: r.width, h: r.height, el: s });
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
