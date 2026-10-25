// Panel charts on the same pixel grid as the map (views/atlas/VIZ.md): 1 art px = 3 CSS px, ink lines one art pixel wide,
// the lens tincture only on marks, numbers in Silkscreen, direct labels instead of legends, one faint baseline, no gridlines.
// Every chart returns an HTML string (cards are built as strings) and gets a hover readout from one shared listener.
//
//   AtlasCharts.lifeline(series, o)   a value through time: [[year, v], ...]; o = {now, from, to, low, high, log, color, fmt, label,
//                                     marks: [[year, text]], conf, cols, rows, alive: [s, e], unit}
//   AtlasCharts.tenure(rows, o)       who held something when: [{n, s, e, c?}] as one strip, with o.now
//   AtlasCharts.dumbbell(rows, o)     year A against year B: [{n, a, b}] with o.fmt, o.yearA, o.yearB
//   AtlasCharts.rangebar(rows, o)     low-high estimates on a log axis: [{n, lo, hi, me?}]
//   AtlasCharts.tiles(list)           stat tiles: [{label, value, note?, spark?: series, now?, color?}]
//   AtlasCharts.multiples(list, o)    small multiples of lifelines on one shared scale: [{n, series, sub?}]
(function (global) {
  const PX = 3, INK = "#221f1a";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtYear = y => y < 0 ? `${-y} BCE` : y === 0 ? "1 CE" : `${y}`;
  const fmtShortYear = y => y < 0 ? `${-y}BC` : `${y}`;
  const compact = n => n == null || !isFinite(n) ? "–" : Math.abs(n) >= 1e9 ? +(n / 1e9).toFixed(1) + "B" : Math.abs(n) >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + "K" : Math.abs(n) >= 1e3 ? +(n / 1e3).toFixed(1) + "K" : Math.abs(n) >= 10 ? String(Math.round(n)) : String(+n.toFixed(2));
  let uid = 0;
  const REG = new Map();
  // Charts are rebuilt with every panel render; keep the readouts of the last few hundred.
  const reg = () => { if (REG.size > 300) REG.delete(REG.keys().next().value); return "vz" + (++uid); };

  // A grid of art pixels, emitted as merged horizontal runs per paint key.
  function Grid(W, H) {
    const cells = new Map();
    return {
      W, H,
      set(x, y, key) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; cells.set(y * W + x, key); },
      get(x, y) { return cells.get(y * W + x); },
      vline(x, y0, y1, key) { const a = Math.min(y0, y1), b = Math.max(y0, y1); for (let y = Math.round(a); y <= Math.round(b); y++) this.set(x, y, key); },
      hline(x0, x1, y, key) { for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, key); },
      rect(x0, y0, x1, y1, key) { for (let y = Math.round(y0); y <= Math.round(y1); y++) this.hline(x0, x1, y, key); },
      svg(paint, extra = "", cls = "") {
        const runs = {};
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) {
            const k = cells.get(y * W + x); if (k == null) { x++; continue; }
            let e = x + 1; while (e < W && cells.get(y * W + e) === k) e++;
            (runs[k] = runs[k] || []).push(`M${x} ${y}h${e - x}v1h${x - e}z`);
            x = e;
          }
        }
        const id = "vzp" + (++uid);
        const defs = `<defs><pattern id="${id}c" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="var(--vz-c)"/><rect x="1" y="1" width="1" height="1" fill="var(--vz-c)"/></pattern>
<pattern id="${id}h" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h1v1h-1zM1 0h1v1h-1zM0 3h1v1h-1zM3 1h1v1h-1zM2 2h1v1h-1zM3 2h1v1h-1zM1 3h1v1h-1zM2 1h1v1h-1z" fill="var(--vz-c)" opacity=".75"/></pattern>
<pattern id="${id}f" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="var(--vz-c)"/><rect x="2" y="2" width="1" height="1" fill="var(--vz-c)"/></pattern></defs>`;
        const fills = { dither: `url(#${id}c)`, hatch: `url(#${id}h)`, fog: `url(#${id}f)` };
        const body = Object.entries(runs).map(([k, d]) => `<path d="${d.join("")}" fill="${fills[k] || paint[k] || k}"${k === "dither" || k === "hatch" || k === "fog" ? "" : ""}/>`).join("");
        return `<svg class="vz-svg ${cls}" viewBox="0 0 ${W} ${H}" width="${W * PX}" height="${H * PX}" shape-rendering="crispEdges" aria-hidden="true">${defs}${body}${extra}</svg>`;
      },
    };
  }
  // The family tincture (or any colour) for the --vz-c custom property.
  const tint = c => c || "var(--vz-default, #3f8f5e)";

  // ---------- lifeline ----------
  function lifeline(series, o = {}) {
    series = (series || []).filter(p => p && isFinite(p[0]) && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
    if (series.length < 2) return "";
    const cols = o.cols || 124, rows = o.rows || 18, top = 3, bottom = rows - 2;
    const x0 = o.from ?? series[0][0], x1 = o.to ?? series[series.length - 1][0];
    if (!(x1 > x0)) return "";
    const lo = o.low || null, hi = o.high || null;
    const vals = series.map(p => p[1]).concat(hi ? hi.map(p => p[1]) : []);
    const log = !!o.log && vals.every(v => v > 0);
    const f = v => log ? Math.log10(Math.max(1e-9, v)) : v;
    let vmin = o.zero === false || log ? Math.min(...vals.map(f)) : Math.min(0, ...vals.map(f)), vmax = Math.max(...vals.map(f));
    if (o.ymax != null) vmax = Math.max(vmax, f(o.ymax));
    if (vmax === vmin) vmax = vmin + 1;
    const X = yr => Math.round((yr - x0) / (x1 - x0) * (cols - 1)), Y = v => Math.round(bottom - (f(v) - vmin) / (vmax - vmin) * (bottom - top));
    const at = (s, yr) => { if (!s || yr < s[0][0] || yr > s[s.length - 1][0]) return null; for (let i = 1; i < s.length; i++) if (yr <= s[i][0]) { const [a, va] = s[i - 1], [b, vb] = s[i]; return o.step ? va : va + (vb - va) * (yr - a) / (b - a || 1); } return s[s.length - 1][1]; };
    const g = Grid(cols, rows), yrOf = x => x0 + (x1 - x0) * x / (cols - 1);
    // Baseline: one faint rule.
    g.hline(0, cols - 1, rows - 1, "rule");
    // The years it existed, when given, as a faint band under the line.
    if (o.alive) for (let x = Math.max(0, X(o.alive[0])); x <= Math.min(cols - 1, X(o.alive[1] ?? x1)); x++) g.set(x, rows - 1, "alive");
    // Range (low..high): hatched, the grammar's "estimated".
    if (lo && hi) for (let x = 0; x < cols; x++) { const a = at(lo, yrOf(x)), b = at(hi, yrOf(x)); if (a != null && b != null && Y(b) < Y(a)) g.vline(x, Y(b), Y(a), "hatch"); }
    // Area under the line: a 50% dither of the tincture; the line itself in ink.
    let prev = null;
    const cf = o.conf || 0, pts = [];
    for (let x = 0; x < cols; x++) {
      const v = at(series, yrOf(x)); if (v == null) { prev = null; continue; }
      const y = Y(v); pts.push([x, y, v]);
      if (!(lo && hi)) for (let yy = y + 1; yy < rows - 1; yy++) if (!g.get(x, yy)) g.set(x, yy, cf === 3 ? "fog" : "dither");
      // Dashed (approximate): the ink line breaks every other two columns.
      if (!(cf === 2 && (x % 4) >= 2)) { if (prev != null) g.vline(x, prev, y, "ink"); else g.set(x, y, "ink"); }
      prev = y;
    }
    // Event ticks along the baseline.
    for (const [yr] of o.marks || []) if (yr >= x0 && yr <= x1) { g.set(X(yr), rows - 2, "ink"); g.set(X(yr), rows - 1, "ink"); }
    // Now: a dotted ink rule and a tincture dot with an ink ring.
    let nowLab = "";
    const now = o.now;
    if (now != null && now >= x0 && now <= x1) {
      const nx = X(now); for (let y = 0; y < rows - 1; y += 2) if (!g.get(nx, y) || g.get(nx, y) === "dither") g.set(nx, y, "ink");
      const v = at(series, now);
      if (v != null) {
        const ny = Y(v);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = Math.abs(dx) + Math.abs(dy); if (q <= 3) g.set(nx + dx, ny + dy, Math.abs(dx) === 2 || Math.abs(dy) === 2 || q === 3 ? "ink" : dx === -1 && dy === -1 ? "lite" : "c"); }
        nowLab = `<span class="vz-v vz-now" style="left:${(nx / cols * 100).toFixed(1)}%;top:${Math.max(0, ny - 6) * PX}px">${esc((o.fmt || compact)(v))}${o.unit ? " " + esc(o.unit) : ""}</span>`;
      }
    }
    // Direct labels: the peak (if it is not where now is) and the ends of the time axis.
    const peak = pts.reduce((m, p) => !m || p[1] < m[1] ? p : m, null);
    let peakLab = "";
    if (peak && (now == null || Math.abs(X(now) - peak[0]) > 18)) peakLab = `<span class="vz-v vz-peak" style="left:${(peak[0] / cols * 100).toFixed(1)}%;top:${Math.max(0, peak[1] - 6) * PX}px">${esc((o.fmt || compact)(peak[2]))}</span>`;
    const id = reg();
    REG.set(id, { kind: "line", x0, x1, cols, series, low: lo, high: hi, at, fmt: o.fmt || compact, unit: o.unit || "", label: o.label || "" });
    const paint = { ink: INK, rule: "var(--rule, #d6ccb4)", alive: "var(--vz-c)", c: "var(--vz-c)", lite: "#f6f0dc" };
    return `<figure class="vz vz-line" data-vz="${id}" style="--vz-c:${tint(o.color)}">${o.title ? `<figcaption class="vz-k">${esc(o.title)}</figcaption>` : ""}
<div class="vz-plot">${g.svg(paint)}${nowLab}${peakLab}<i class="vz-hover" hidden></i></div>
<div class="vz-axis"><span>${esc(fmtShortYear(x0))}</span>${log ? `<span class="vz-note">log scale</span>` : ""}<span>${esc(fmtShortYear(x1))}</span></div></figure>`;
  }

  // ---------- tenure strip ----------
  function tenure(rows, o = {}) {
    rows = (rows || []).filter(r => r && isFinite(r.s)).sort((a, b) => a.s - b.s);
    if (!rows.length) return "";
    const cols = o.cols || 124, H = 7, x0 = o.from ?? rows[0].s, x1 = o.to ?? Math.max(...rows.map(r => r.e ?? r.s));
    if (!(x1 > x0)) return "";
    const X = y => Math.max(0, Math.min(cols - 1, Math.round((y - x0) / (x1 - x0) * (cols - 1))));
    const g = Grid(cols, H), keys = {};
    rows.forEach((r, i) => {
      const a = X(r.s), b = X(r.e ?? x1), k = "h" + (i % 2);
      keys[k] = 1;
      // Each holder a block with a one-pixel surface gap before the next (no stroke round the mark).
      for (let x = a; x <= Math.max(a, b - 1); x++) for (let y = 1; y < H - 1; y++) g.set(x, y, y === 1 ? "lite" + (i % 2) : k);
      g.set(a, 0, "ink"); g.set(a, H - 1, "ink");
    });
    if (o.now != null && o.now >= x0 && o.now <= x1) { const nx = X(o.now); for (let y = 0; y < H; y++) g.set(nx, y, y % 2 ? "ink" : "paper"); }
    // Direct labels for the longest holds that fit.
    const lab = rows.map(r => ({ r, a: X(r.s), b: X(r.e ?? x1) })).filter(q => q.b - q.a >= 20).sort((p, q) => (q.b - q.a) - (p.b - p.a)).slice(0, 4)
      .map(q => `<span class="vz-tl" style="left:${(q.a / cols * 100).toFixed(1)}%;width:${((q.b - q.a) / cols * 100).toFixed(1)}%">${esc(q.r.n)}</span>`).join("");
    const id = reg();
    REG.set(id, { kind: "strip", x0, x1, cols, rows });
    return `<figure class="vz vz-strip" data-vz="${id}" style="--vz-c:${tint(o.color)}">${o.title ? `<figcaption class="vz-k">${esc(o.title)}</figcaption>` : ""}
<div class="vz-plot">${g.svg({ h0: "var(--vz-c)", h1: "color-mix(in srgb, var(--vz-c) 62%, #2a2040)", lite0: "color-mix(in srgb, var(--vz-c) 60%, #fff0b0)", lite1: "color-mix(in srgb, var(--vz-c) 70%, #c8b890)", ink: INK, paper: "#f6f0dc" })}<i class="vz-hover" hidden></i></div>
<div class="vz-labs">${lab}</div><div class="vz-axis"><span>${esc(fmtShortYear(x0))}</span><span>${esc(fmtShortYear(x1))}</span></div></figure>`;
  }

  // ---------- dumbbell: year A against year B ----------
  function dumbbell(rows, o = {}) {
    rows = (rows || []).filter(r => r && (r.a != null || r.b != null));
    if (!rows.length) return "";
    const cols = o.cols || 72, fmt = o.fmt || compact;
    const vals = rows.flatMap(r => [r.a, r.b]).filter(v => v != null && isFinite(v));
    const log = !!o.log && vals.every(v => v > 0);
    const f = v => log ? Math.log10(v) : v;
    const vmax = Math.max(...vals.map(f)), vmin = log ? Math.min(...vals.map(f)) : Math.min(0, ...vals.map(f));
    const X = v => Math.round((f(v) - vmin) / ((vmax - vmin) || 1) * (cols - 4)) + 2;
    const body = rows.map(r => {
      const g = Grid(cols, 5);
      g.hline(0, cols - 1, 4, "rule");
      const a = r.a != null ? X(r.a) : null, b = r.b != null ? X(r.b) : null;
      if (a != null && b != null) g.hline(Math.min(a, b), Math.max(a, b), 2, "ink");
      // A: a hollow ring (then). B: a filled tincture dot (now).
      if (a != null) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) g.set(a + dx, 2 + dy, "ink");
      if (a != null) g.set(a, 2, "paper");
      if (b != null) { for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) g.set(b + dx, 2 + dy, "ink"); g.set(b, 2, "c"); }
      const ch = r.a && r.b ? (r.b / r.a - 1) : null;
      const delta = ch == null ? (r.a == null ? "new" : "gone") : `${ch >= 0 ? "+" : "−"}${Math.abs(ch) >= 10 ? Math.round(Math.abs(ch)) + "×" : Math.round(Math.abs(ch) * 100) + "%"}`;
      return `<div class="vz-db-row"><span class="vz-db-n" title="${esc(r.n)}">${esc(r.n)}</span>${g.svg({ ink: INK, rule: "var(--rule, #d6ccb4)", paper: "#f6f0dc", c: "var(--vz-c)" })}<span class="vz-db-v">${esc(r.b != null ? fmt(r.b) : "–")}</span><span class="vz-db-d ${ch == null ? "" : ch >= 0 ? "up" : "down"}">${esc(delta)}</span></div>`;
    }).join("");
    return `<figure class="vz vz-db" style="--vz-c:${tint(o.color)}">${o.title ? `<figcaption class="vz-k">${esc(o.title)}</figcaption>` : ""}
${o.yearA != null ? `<div class="vz-db-key"><span><i class="ring"></i>${esc(fmtYear(o.yearA))}</span><span><i class="dot"></i>${esc(fmtYear(o.yearB))}</span>${log ? `<span class="vz-note">log scale</span>` : ""}</div>` : ""}${body}</figure>`;
  }

  // ---------- range bar on a log axis ----------
  function rangebar(rows, o = {}) {
    rows = (rows || []).filter(r => r && r.lo > 0);
    if (!rows.length) return "";
    const cols = o.cols || 84, all = rows.flatMap(r => [r.lo, r.hi || r.lo]);
    const a = Math.floor(Math.log10(Math.min(...all))), b = Math.ceil(Math.log10(Math.max(...all)));
    const X = v => Math.round((Math.log10(v) - a) / ((b - a) || 1) * (cols - 3)) + 1;
    const body = rows.map(r => {
      const g = Grid(cols, 5);
      for (let d = a; d <= b; d++) g.set(X(10 ** d), 4, "rule");
      const p = X(r.lo), q = X(r.hi || r.lo);
      // Low to high: an estimate, so hatched (the grammar), ink capped.
      for (let x = p; x <= q; x++) for (let y = 1; y <= 3; y++) g.set(x, y, r.me ? "c" : "hatch");
      g.vline(p, 1, 3, "ink"); g.vline(q, 1, 3, "ink");
      return `<div class="vz-db-row${r.me ? " me" : ""}"><span class="vz-db-n" title="${esc(r.n)}">${esc(r.n)}</span>${g.svg({ ink: INK, rule: "var(--rule, #d6ccb4)", c: "var(--vz-c)" })}<span class="vz-db-v">${esc(compact(r.lo))}${r.hi && r.hi !== r.lo ? "–" + esc(compact(r.hi)) : ""}</span></div>`;
    }).join("");
    const ticks = []; for (let d = a; d <= b; d++) ticks.push(`<span style="left:${(X(10 ** d) / cols * 100).toFixed(1)}%">${compact(10 ** d)}</span>`);
    return `<figure class="vz vz-db vz-range" style="--vz-c:${tint(o.color)}">${o.title ? `<figcaption class="vz-k">${esc(o.title)}</figcaption>` : ""}${body}<div class="vz-ticks">${ticks.join("")}</div></figure>`;
  }

  // ---------- stat tiles ----------
  function tiles(list) {
    list = (list || []).filter(Boolean);
    if (!list.length) return "";
    return `<div class="vz-tiles">${list.map(t => `<div class="vz-tile" style="--vz-c:${tint(t.color)}"><span class="vz-k">${esc(t.label)}</span><b class="vz-big">${esc(t.value)}</b>${t.note ? `<span class="vz-note">${esc(t.note)}</span>` : ""}${t.spark ? lifeline(t.spark, { cols: 56, rows: 10, now: t.now, from: t.from, to: t.to, color: t.color, fmt: t.fmt, log: t.log, step: t.step }) : ""}</div>`).join("")}</div>`;
  }

  // ---------- small multiples ----------
  function multiples(list, o = {}) {
    list = (list || []).filter(m => m && m.series && m.series.length > 1);
    if (!list.length) return "";
    const all = list.flatMap(m => m.series), from = o.from ?? Math.min(...all.map(p => p[0])), to = o.to ?? Math.max(...all.map(p => p[0]));
    const ymax = Math.max(...all.map(p => p[1]));
    return `<div class="vz-multi">${o.title ? `<p class="vz-k">${esc(o.title)}</p>` : ""}<div class="vz-multi-grid">${list.map(m => `<div class="vz-mcell${m.on ? " on" : ""}"${m.act != null ? ` data-a="${m.act}"` : ""}><span class="vz-mn">${esc(m.n)}</span>${lifeline(m.series, { cols: 38, rows: 12, from, to, ymax, now: o.now, color: m.color || o.color, log: o.log, fmt: o.fmt, zero: o.log ? false : undefined })}${m.sub ? `<span class="vz-note">${esc(m.sub)}</span>` : ""}</div>`).join("")}</div></div>`;
  }

  // ---------- hover readout (one listener for every chart) ----------
  const tip = typeof document !== "undefined" ? document.createElement("div") : null;
  let lastHv = null;
  function onMove(ev) {
    const fig = ev.target.closest && ev.target.closest("[data-vz]");
    if (!fig) { if (lastHv) { tip.hidden = true; lastHv.hidden = true; lastHv = null; } return; }
    const R = REG.get(fig.dataset.vz), plot = fig.querySelector(".vz-plot"); if (!R || !plot) return;
    const r = plot.getBoundingClientRect(), u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const yr = Math.round(R.x0 + (R.x1 - R.x0) * u), hv = plot.querySelector(".vz-hover");
    if (lastHv && lastHv !== hv) lastHv.hidden = true;
    if (hv) { hv.hidden = false; hv.style.left = (Math.round(u * (R.cols - 1)) * PX) + "px"; lastHv = hv; }
    let text = "";
    if (R.kind === "line") {
      const v = R.at(R.series, yr), a = R.low && R.at(R.low, yr), b = R.high && R.at(R.high, yr);
      text = `${fmtYear(yr)}  ${v == null ? "no data" : R.fmt(v) + (R.unit ? " " + R.unit : "")}${a != null && b != null ? `  (${R.fmt(a)}–${R.fmt(b)})` : ""}`;
    } else if (R.kind === "strip") {
      const h = R.rows.find(q => yr >= q.s && yr <= (q.e ?? R.x1));
      text = `${fmtYear(yr)}  ${h ? h.n : "no holder recorded"}`;
    }
    tip.textContent = text; tip.hidden = false;
    tip.style.left = Math.min(innerWidth - 180, ev.clientX + 12) + "px"; tip.style.top = (ev.clientY - 30) + "px";
  }
  const CSS = `
.vz { margin: 10px 0 4px; position: relative; }
.vz-k { display: block; font-family: "Silkscreen", "Pixelify Sans", ui-monospace, monospace; font-size: 8px; line-height: 16px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft, #625e51); margin: 0; }
.vz-plot { position: relative; width: max-content; max-width: 100%; }
.vz-svg { display: block; image-rendering: pixelated; max-width: 100%; height: auto; overflow: visible; }
.vz-v { position: absolute; transform: translate(-50%, -100%); font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 8px; color: var(--ink, #221f1a); background: var(--card, #fbf8ef); padding: 1px 2px; white-space: nowrap; pointer-events: none; }
.vz-now { box-shadow: 0 0 0 1px var(--ink, #221f1a); }
.vz-axis, .vz-ticks { display: flex; justify-content: space-between; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 12px; color: var(--ink-soft, #625e51); max-width: 372px; }
.vz-ticks { position: relative; height: 12px; margin-left: 96px; max-width: 252px; }
.vz-ticks span { position: absolute; transform: translateX(-50%); }
.vz-note { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; color: var(--ink-soft, #625e51); }
.vz-hover { position: absolute; top: 0; bottom: 0; width: 3px; background: var(--ink, #221f1a); opacity: .35; pointer-events: none; }
.vz-labs { position: relative; height: 14px; max-width: 372px; }
.vz-tl { position: absolute; top: 1px; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 10px; color: var(--ink, #221f1a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; border-left: 3px solid var(--ink, #221f1a); }
.vz-db-row { display: grid; grid-template-columns: 92px auto 44px 40px; gap: 4px; align-items: center; min-height: 18px; }
.vz-db-row.me .vz-db-n { font-weight: 600; color: var(--ink); }
.vz-db-n { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-soft, #625e51); }
.vz-db-v, .vz-db-d { font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; text-align: right; color: var(--ink, #221f1a); }
.vz-db-d.up::before { content: "▲ "; } .vz-db-d.down::before { content: "▼ "; }
.vz-db-key { display: flex; gap: 14px; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; color: var(--ink-soft); margin-bottom: 2px; }
.vz-db-key i { display: inline-block; width: 7px; height: 7px; margin-right: 4px; vertical-align: -1px; box-sizing: border-box; border: 2px solid var(--ink, #221f1a); }
.vz-db-key i.dot { background: var(--vz-c); }
.vz-db-key i.ring { background: #f6f0dc; }
.vz-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin: 10px 3px 12px 0; }
.vz-tile { border: 3px solid var(--ink, #221f1a); background: var(--card, #fbf8ef); box-shadow: 3px 3px 0 var(--ink, #221f1a); padding: 4px 6px 2px; min-width: 0; }
.vz-tile .vz { margin: 2px 0 0; } .vz-tile .vz-axis, .vz-tile .vz-v { display: none; } .vz-tile .vz-note { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-big { display: block; font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-size: 24px; line-height: 26px; font-weight: 600; color: var(--ink, #221f1a); }
.vz-multi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 8px; }
.vz-mcell { min-width: 0; cursor: default; } .vz-mcell[data-a] { cursor: pointer; } .vz-mcell.on .vz-mn { color: var(--ink); font-weight: 600; }
.vz-mcell .vz { margin: 0; } .vz-mcell .vz-axis { display: none; }
.vz-mn { display: block; font-size: 12.5px; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-soft, #625e51); }
.vz-tip { position: fixed; z-index: 50; pointer-events: none; font-family: "Silkscreen", ui-monospace, monospace; font-size: 8px; line-height: 12px; padding: 3px 6px; background: var(--ink, #221f1a); color: #f6f0dc; white-space: nowrap; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .vz-svg { filter: none; } }
`;
  function install() {
    if (typeof document === "undefined" || document.getElementById("vz-style")) return;
    const st = document.createElement("style"); st.id = "vz-style"; st.textContent = CSS; (document.head || document.documentElement).appendChild(st);
    tip.className = "vz-tip"; tip.hidden = true;
    const add = () => { document.body.appendChild(tip); document.addEventListener("mousemove", onMove, { passive: true }); };
    if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
  }
  install();
  global.AtlasCharts = { lifeline, tenure, dumbbell, rangebar, tiles, multiples, compact, Grid, registry: REG, clear: () => REG.clear() };
})(typeof window !== "undefined" ? window : globalThis);
