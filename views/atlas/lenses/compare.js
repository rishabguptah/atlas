// Compare two years (views/atlas/VIZ.md): the map's year against another one.
//   - On the map (pixel basemap): land that changed hands since the other year is hatched in Gules, and the other year's
//     borders are a dotted ink line (PixelGrammar.compare, painted over the sprites).
//   - In the tab: world numbers then and now, the biggest gains and losses of territory (measured on the drawn borders),
//     states that appeared or vanished, the great cities, and a filmstrip of small maps between the two years.
(function () {
  if (typeof AtlasCharts === "undefined") return;
  const C = AtlasCharts, GR = typeof PixelGrammar !== "undefined" ? PixelGrammar : null;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtY = y => y < 0 ? `${-y} BCE` : `${y}`;
  const NOW = 2025, MIN = -3400;
  let api = null, pane = null, other = null, open = false, showMap = true, timer = 0, mapTimer = 0, film = null;
  try { const v = JSON.parse(localStorage.getItem("atlas.compare.v1") || "null"); if (v && isFinite(v.other)) { other = v.other; showMap = v.map !== false; } } catch (err) { /* private mode */ }
  const save = () => { try { localStorage.setItem("atlas.compare.v1", JSON.stringify({ other, map: showMap })); } catch (err) { /* fine */ } };
  const clamp = y => Math.max(MIN, Math.min(NOW, Math.round(y)));

  const STYLE = `
.cmp-head { display: flex; align-items: stretch; gap: 8px; margin: 6px 0 10px; }
.cmp-plate { flex: 1; border: 3px solid #221f1a; box-shadow: 3px 3px 0 #221f1a; padding: 4px 8px 6px; background: var(--card, #fbf8ef); min-width: 0; }
.cmp-plate b { display: block; font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-size: 24px; line-height: 28px; font-weight: 600; }
.cmp-plate input { width: 100%; box-sizing: border-box; font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 22px; line-height: 26px; border: 0; border-bottom: 2px dotted #221f1a; background: transparent; padding: 0; }
.cmp-vs { align-self: center; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; }
.cmp-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; }
.cmp-row button { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 14px; padding: 1px 6px; border: 2px solid #221f1a; background: transparent; cursor: pointer; text-transform: uppercase; }
.cmp-row button[aria-pressed="true"] { background: #221f1a; color: #f6f0dc; }
.cmp-sec { margin: 14px 0 0; border-top: 1px solid var(--rule); padding-top: 6px; }
.cmp-sec h3 { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 16px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 2px; font-weight: 400; }
.cmp-names { font-size: 13.5px; line-height: 1.45; color: var(--ink-soft); margin: 2px 0 0; }
.cmp-names b { color: var(--ink); font-weight: 500; }
.cmp-key { display: flex; gap: 12px; flex-wrap: wrap; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; color: var(--ink-soft); margin: 2px 0 0; }
.cmp-key i { display: inline-block; width: 12px; height: 9px; margin-right: 4px; vertical-align: -1px; border: 2px solid #221f1a; box-sizing: border-box; }
.cmp-key i.hatch { background: repeating-linear-gradient(135deg, #c0392b 0 3px, transparent 3px 6px); }
.cmp-key i.dots { border-style: dotted; background: transparent; }
.cmp-film { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 6px; margin-top: 4px; }
.cmp-film button { all: unset; cursor: pointer; display: block; min-width: 0; }
.cmp-film canvas { display: block; width: 100%; image-rendering: pixelated; border: 2px solid #221f1a; background: #2f5a6e; }
.cmp-film button.on canvas { outline: 3px solid var(--accent, #1d4f6e); outline-offset: 1px; }
.cmp-film span { display: block; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 14px; text-align: center; }
`;

  // ---------- world numbers ----------
  function worldAt(X, y) {
    let big = null; for (const e of X.ENTRIES) { if (!X.alive(e, y)) continue; const p = X.popAt(e, y); if (p && (!big || p > big.p)) big = { e, p }; }
    return { states: X.POLS.filter(p => X.polAlive(p, y)).length, big, battles: X.battlesNear(y, 5).length,
      moving: X.MIGS.filter(m => m.people && y >= m.start && y <= m.end).reduce((s, m) => s + m.people, 0) };
  }
  // Territory by realm (km², drawn borders) in each year; names from the realms themselves.
  function realmDiff(a, b) {
    const A = ATLAS.vizAreas && ATLAS.vizAreas(a), B = ATLAS.vizAreas && ATLAS.vizAreas(b);
    if (!A || !B) return null;
    const name = new Map();
    for (const y of [a, b]) for (const r of ATLAS.borders.realms(y, 1) || []) if (!name.has(r.id)) name.set(r.id, String(r.name || r.id).replace(/^\((.*)\)$/, "$1"));
    const rows = [];
    for (const id of new Set([...A.keys(), ...B.keys()])) rows.push({ id, n: name.get(id) || id, a: A.get(id) || 0, b: B.get(id) || 0 });
    return rows;
  }

  // ---------- filmstrip: small maps between the two years ----------
  function filmYears(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b), out = [];
    for (let i = 0; i < 6; i++) out.push(Math.round(lo + (hi - lo) * i / 5));
    return out;
  }
  function drawThumb(cv, y) {
    const rs = ATLAS.borders && ATLAS.borders.realms(y, 1); if (!rs) return false;
    const W = 120, H = 62, c = cv.getContext("2d"); cv.width = W; cv.height = H;
    const v = api.view(), lonSpan = Math.min(360, v.w * 1.15), latSpan = Math.min(170, v.h * 1.15);
    const proj = d3.geoEquirectangular().fitExtent([[0, 0], [W, H]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[
      [v.lon - lonSpan / 2, v.lat - latSpan / 2], [v.lon + lonSpan / 2, v.lat - latSpan / 2], [v.lon + lonSpan / 2, v.lat + latSpan / 2], [v.lon - lonSpan / 2, v.lat + latSpan / 2], [v.lon - lonSpan / 2, v.lat - latSpan / 2]]] } });
    const path = d3.geoPath(proj, c);
    c.fillStyle = "#2f5a6e"; c.fillRect(0, 0, W, H);
    if (typeof LAND !== "undefined") { c.fillStyle = "#a49c7e"; c.beginPath(); path(topojson.feature(LAND, LAND.objects.land)); c.fill(); }
    for (const r of rs) { c.fillStyle = r.color || "#b0a080"; c.beginPath(); path(r.feature); c.fill(); }
    // Crisp it up: snap to a 4-colour-per-pixel read and draw 1-px ink borders where realms meet.
    const img = c.getImageData(0, 0, W, H), d = img.data, key = new Int32Array(W * H);
    for (let k = 0; k < W * H; k++) key[k] = (d[k * 4] >> 3) << 10 | (d[k * 4 + 1] >> 3) << 5 | (d[k * 4 + 2] >> 3);
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const k = j * W + i, sea = d[k * 4] === 47 && d[k * 4 + 1] === 90;
      if (!sea && (key[k] !== key[k + 1] || key[k] !== key[k + W])) { d[k * 4] = 34; d[k * 4 + 1] = 31; d[k * 4 + 2] = 26; }
    }
    c.putImageData(img, 0, 0);
    return true;
  }
  function renderFilm(a, b) {
    const el = pane && pane.querySelector(".cmp-film"); if (!el) return;
    const ys = filmYears(a, b);
    el.innerHTML = ys.map(y => `<button data-y="${y}" class="${y === api.year ? "on" : ""}" title="Go to ${fmtY(y)}"><canvas width="120" height="62"></canvas><span>${fmtY(y)}</span></button>`).join("");
    let missing = 0;
    [...el.querySelectorAll("canvas")].forEach((cv, i) => { if (!drawThumb(cv, ys[i])) missing++; });
    clearTimeout(film); if (missing) film = setTimeout(() => open && renderFilm(a, b), 700);
  }

  // ---------- the tab ----------
  function render() {
    if (!pane || !api) return;
    const a = api.year, b = other ?? clamp(a - 100), X = ATLAS.vizCtx ? ATLAS.vizCtx() : null;
    if (!X) { pane.innerHTML = "<p>Compare needs the page's records.</p>"; return; }
    const W1 = worldAt(X, b), W2 = worldAt(X, a), diff = realmDiff(b, a);
    const fmtK = v => C.compact(v) + " km²";
    let gains = "", losses = "", born = "", gone = "";
    if (diff) {
      const both = diff.filter(r => r.a > 2e4 && r.b > 2e4);
      gains = C.dumbbell(both.filter(r => r.b > r.a * 1.05).sort((p, q) => (q.b - q.a) - (p.b - p.a)).slice(0, 6), { title: "Grew the most", fmt: fmtK, yearA: b, yearB: a, color: "var(--fam-power)" });
      losses = C.dumbbell(both.filter(r => r.b < r.a * 0.95).sort((p, q) => (p.b - p.a) - (q.b - q.a)).slice(0, 6), { title: "Shrank the most", fmt: fmtK, yearA: b, yearB: a, color: "var(--fam-power)" });
      const nb = diff.filter(r => r.a === 0 && r.b > 1e5).sort((p, q) => q.b - p.b), ng = diff.filter(r => r.b === 0 && r.a > 1e5).sort((p, q) => q.a - p.a);
      born = nb.length ? `<p class="cmp-names"><b>Appeared:</b> ${nb.slice(0, 12).map(r => esc(r.n)).join(", ")}${nb.length > 12 ? ` and ${nb.length - 12} more` : ""}</p>` : "";
      gone = ng.length ? `<p class="cmp-names"><b>Gone:</b> ${ng.slice(0, 12).map(r => esc(r.n)).join(", ")}${ng.length > 12 ? ` and ${ng.length - 12} more` : ""}</p>` : "";
    }
    const cities = X.ENTRIES.map(e => ({ e, a: X.alive(e, b) ? X.popAt(e, b) : null, b: X.alive(e, a) ? X.popAt(e, a) : null })).filter(o => o.a || o.b)
      .sort((p, q) => Math.max(q.a || 0, q.b || 0) - Math.max(p.a || 0, p.b || 0)).slice(0, 8).map(o => ({ n: X.nameAt(o.e, a), a: o.a, b: o.b }));
    pane.innerHTML = `<p class="vz-k">Compare two years</p>
<div class="cmp-head"><label class="cmp-plate"><span class="vz-k">Then</span><input type="number" class="cmp-other" value="${b}" step="1" min="${MIN}" max="${NOW}" aria-label="The other year (negative for BCE)"></label><span class="cmp-vs">vs</span><div class="cmp-plate"><span class="vz-k">The map's year</span><b>${fmtY(a)}</b></div></div>
<div class="cmp-row">${[-500, -100, -50, -25].map(d => `<button data-d="${d}">${d}</button>`).join("")}<button data-d="+100">+100</button><button data-swap>Swap</button><button data-map aria-pressed="${showMap}">Show on map</button></div>
<div class="cmp-key"><span><i class="hatch"></i>changed hands since ${fmtY(b)}</span><span><i class="dots"></i>borders in ${fmtY(b)}</span></div>
${C.dumbbell([
      { n: "States", a: W1.states, b: W2.states },
      { n: "Biggest city", a: W1.big && W1.big.p, b: W2.big && W2.big.p },
      { n: "Battles ±5 yrs", a: W1.battles, b: W2.battles },
      { n: "Counted migrants", a: W1.moving || null, b: W2.moving || null },
    ], { title: "The world, then and now", yearA: b, yearB: a, color: "var(--fam-land)" })}
<div class="cmp-sec"><h3>Territory (measured on the drawn borders)</h3>${diff ? gains + losses + born + gone : `<p class="cmp-names">Loading the borders for ${fmtY(b)}…</p>`}</div>
<div class="cmp-sec">${C.dumbbell(cities, { title: "Great cities", log: true, yearA: b, yearB: a, color: "var(--fam-land)" })}</div>
<div class="cmp-sec"><h3>Filmstrip: ${fmtY(Math.min(a, b))} to ${fmtY(Math.max(a, b))} (tap a frame to go there)</h3><div class="cmp-film"></div></div>`;
    renderFilm(a, b);
    if (!diff) { clearTimeout(timer); timer = setTimeout(() => open && render(), 800); }
    applyMap();
  }
  function applyMap() {
    if (!GR) return;
    const b = other ?? clamp(api.year - 100);
    const on = open && showMap && ATLAS.pixel;
    if (!on) { if (GR.compare) { GR.compare = null; if (ATLAS.pixel) ATLAS.pixel.repaint(); } return; }
    const pm = ATLAS.pixel, t = pm.transform(), rs = ATLAS.borders && ATLAS.borders.realms(b, t ? t.k : 1);
    if (!rs) { clearTimeout(mapTimer); mapTimer = setTimeout(() => open && applyMap(), 600); return; }
    if (!GR.compare || GR.compare.realms !== rs) GR.compare = { year: b, realms: rs, projection: pm.projection(), active: () => open && showMap };
    pm.repaint();
  }

  ATLAS.tab({
    id: "compare", name: "Compare",
    mount(el, a) {
      api = a; pane = el;
      const st = document.createElement("style"); st.textContent = STYLE; document.head.appendChild(st);
      el.addEventListener("click", ev => {
        const d = ev.target.closest("[data-d]"), sw = ev.target.closest("[data-swap]"), mp = ev.target.closest("[data-map]"), fy = ev.target.closest("[data-y]");
        if (d) { other = clamp(api.year + +d.dataset.d); save(); render(); }
        else if (sw) { const b = other ?? clamp(api.year - 100); other = api.year; save(); api.setYear(b); }
        else if (mp) { showMap = !showMap; save(); render(); }
        else if (fy) api.setYear(+fy.dataset.y);
      });
      el.addEventListener("change", ev => { if (ev.target.matches(".cmp-other")) { other = clamp(+ev.target.value); save(); render(); } });
      let t2 = 0;
      api.onYear(() => { if (!open) return; clearTimeout(t2); t2 = setTimeout(render, 160); });
      api.onView(() => { if (open) { applyMap(); const a2 = api.year, b2 = other ?? clamp(a2 - 100); renderFilm(a2, b2); } });
      // Leaving the tab (its pane is hidden) takes the overlay off the map.
      new MutationObserver(() => { if (el.hidden && open) { open = false; applyMap(); } }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
    },
    show() { open = true; render(); },
  });
})();
