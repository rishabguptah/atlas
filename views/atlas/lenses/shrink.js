// Watch the world shrink: travel-time rings from a great city in the map's year, after Galton's Isochronic Passage
// Chart (1881) and Bartholomew's 1914 isochronic map. The rings come live from the shared router
// (ATLAS.world.reach, views/atlas/world/route.js), worked out once per city and decade after the slider settles, then
// painted into the pixel map under the sprites from a cached per-pixel buffer, so a year step costs nothing extra.
// Also: how fast news travelled (dated arrivals), three wandering centres of the world (cities, trade, ideas), a tab
// with the shrink chart and a check of the router against documented journeys, and ATLAS.sceneSet.shrink for Stories.
// Data: LENS_DATA.shrink (lenses/shrink.py).
(() => {
  const A = window.ATLAS;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LD = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.shrink) || null;
  const R = Math.PI / 180;
  const gc = (a, b) => { const dl = (b[1] - a[1]) * R, dn = (b[0] - a[0]) * R, x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const fy = y => (A.api && A.api.fmtYear ? A.api.fmtYear(y) : y < 0 ? -y + " BCE" : String(y));
  // News lag as written: -1 means the same month with no day recorded; rough ones get a tilde; "by" is a latest date.
  const lagTxt = a => a[3] < 0 ? "within the month" : a[3] === 0 ? "same day" : `${a[5] ? "by day " : a[4] ? "about " : ""}${a[3]} days`;
  const dd = d => !isFinite(d) ? "out of reach" : d < 1.5 ? (d < 0.75 ? "under a day" : "a day") : d < 60 ? Math.round(d) + " days" : d < 400 ? Math.round(d / 30.4) + " months" : "over a year";

  // Bands after Bartholomew's isochronic chart: deep red within a week, rose, ochre within a month, green, blue within a season.
  const BANDS = [[7, "within a week", [178, 46, 38]], [14, "within two weeks", [222, 118, 98]], [30, "within a month", [226, 186, 84]],
    [60, "within two months", [132, 168, 96]], [90, "within a season", [112, 152, 196]]];
  const INK = [40, 30, 24];
  const S = { from: "rome", mode: "rings", custom: null, key: "", res: null, pend: null, anim: 1, px: null, busy: false, area: {}, checks: null, api: null };
  const hubs = () => (LD() || {}).hubs || [];
  const origin = () => S.custom || hubs().find(h => h.id === S.from) || hubs()[0];
  const on = () => !!(A.isOn && A.isOn("shrink"));
  // The rings change with travel technology, not every year: the decade so far (never a later one), the benchmark years exact.
  const snap = y => { const D = LD(); const e = D && D.eras.find(e => Math.abs(e - y) <= 4); return e != null ? e : Math.floor(y / 10) * 10; };
  const keyOf = (o, y) => `${o.lon},${o.lat}:${y}`;

  // ---------- the rings: one reach per city and decade, plus air hops from the 1950s ----------
  function compute(o, y) {
    const W = A.world; if (!W || !W.reach || !W.motionReady || !W.motionReady()) return null;
    const r = W.reach([o.lon, o.lat], y, 95); if (!r) return null;
    const days = r.days, M = W.motion, air = M.modesFor(y).find(m => m.id === "air");
    if (air && typeof ENTRIES !== "undefined") {
      // Fly from the nearest airport to every city on the map, then drive (as route.js's flight(): a day of fuss each way).
      for (const e of ENTRIES) {
        if (!(e.start <= y && (e.end == null || y < e.end))) continue;
        const t = 1 + gc([o.lon, o.lat], [e.lon, e.lat]) / air.kmd; if (t >= 95) continue;
        const c = M.cellOf(e.lon, e.lat), r0 = Math.floor(c / M.COLS), c0 = c % M.COLS;
        for (let dr = -5; dr <= 5; dr++) for (let dc = -5; dc <= 5; dc++) {
          const rr = r0 + dr; if (rr < 0 || rr >= M.ROWS || dr * dr + dc * dc > 26) continue;
          const i = rr * M.COLS + ((c0 + dc + M.COLS) % M.COLS), v = t + Math.sqrt(dr * dr + dc * dc) * 50 / 280;
          if (v < days[i]) days[i] = v;
        }
      }
    }
    return { o, y, days, at: (lon, lat) => days[M.cellOf(lon, lat)], air: !!air };
  }
  // Land within N days, in km², and the share of the world's land (about 149 million km²).
  function landWithin(res, n) {
    const M = A.world.motion; let a = 0;
    for (let i = 0; i < res.days.length; i++) if (res.days[i] <= n && !M.isWater(i)) a += 3091 * Math.cos(M.latOf(i) * R);
    return a;
  }
  function schedule() {
    clearTimeout(S.pend);
    if (!on() || !LD()) return;
    const y = snap(A.api ? A.api.year : 1300), o = origin(), key = keyOf(o, y);
    if (key === S.key) return;
    S.pend = setTimeout(() => {
      const run = () => {
        if (!on()) return;
        if (!A.world || !A.world.motionReady || !A.world.motionReady()) { S.pend = setTimeout(schedule, 800); return; }
        S.busy = true; renderTab();
        const res = compute(o, y);
        S.busy = false;
        if (!res) return;
        S.res = res; S.key = key; S.px = null;
        S.area[key] = landWithin(res, 30);
        animate(); refresh(); renderTab();
      };
      (window.requestIdleCallback || (f => setTimeout(f, 0)))(run, { timeout: 900 });
    }, 380);
  }
  // The rings open out from the city over a second and a half: the world as far as you can get, day by day.
  function animate() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !A.pixel) { S.anim = 1; return; }
    const t0 = performance.now();
    const tick = t => { S.anim = Math.min(1, (t - t0) / 1500); try { A.pixel.repaint(); } catch (err) { console.error(err); } if (S.anim < 1) requestAnimationFrame(tick); };
    S.anim = 0; requestAnimationFrame(tick);
  }
  function refresh() { try { if (A.pixel) A.pixel.repaint(); if (S.api) S.api.redraw(); } catch (err) { console.error(err); } }

  // ---------- painting into the pixel map (under the sprites) ----------
  // Per art pixel: days from the origin. Lon/lat are inverted on a 4-pixel lattice and interpolated, then cached by view.
  function pixDays(g) {
    const P = A.pixel, proj = P && P.projection && P.projection(); if (!proj || !proj.invert || !S.res) return null;
    const k = [g.U0, g.V0, g.k, g.w, g.h, S.key].join();
    if (S.px && S.px.k === k) return S.px.d;
    const { w, h, px } = g, st = 4, cw = Math.ceil(w / st) + 1, ch = Math.ceil(h / st) + 1, LON = new Float32Array(cw * ch).fill(NaN), LAT = new Float32Array(cw * ch).fill(NaN);
    for (let b = 0; b < ch; b++) for (let a = 0; a < cw; a++) {
      const p = proj.invert([((a * st + g.U0 + 0.5) * px) / g.k, ((b * st + g.V0 + 0.5) * px) / g.k]);
      if (p && isFinite(p[0]) && isFinite(p[1])) { LON[b * cw + a] = p[0]; LAT[b * cw + a] = p[1]; }
    }
    const d = new Float32Array(w * h).fill(Infinity), days = S.res.days, M = A.world.motion;
    for (let j = 0; j < h; j++) {
      const b = Math.floor(j / st), fb = (j % st) / st;
      for (let i = 0; i < w; i++) {
        const a = Math.floor(i / st), fa = (i % st) / st, q = b * cw + a;
        const l00 = LON[q], l10 = LON[q + 1], l01 = LON[q + cw], l11 = LON[q + cw + 1];
        let lon, lat;
        if (isFinite(l00) && isFinite(l10) && isFinite(l01) && isFinite(l11) && Math.max(l00, l10, l01, l11) - Math.min(l00, l10, l01, l11) < 90) {
          lon = (l00 * (1 - fa) + l10 * fa) * (1 - fb) + (l01 * (1 - fa) + l11 * fa) * fb;
          lat = (LAT[q] * (1 - fa) + LAT[q + 1] * fa) * (1 - fb) + (LAT[q + cw] * (1 - fa) + LAT[q + cw + 1] * fa) * fb;
        } else if (isFinite(l00)) { lon = l00; lat = LAT[q]; } else continue;
        d[j * w + i] = days[M.cellOf(lon, lat)];
      }
    }
    S.px = { k, d };
    return d;
  }
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  // Like Bartholomew's chart: the land turns to a relief in the band's colour (the terrain's own light and shade kept),
  // the sea takes a lighter wash, contours are inked, and what lies out of reach sinks into a dusk relief.
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const packc = c => (255 << 24 | Math.max(0, Math.min(255, c[2])) << 16 | Math.max(0, Math.min(255, c[1])) << 8 | Math.max(0, Math.min(255, c[0]))) >>> 0;
  const DUSK = [64, 56, 52], LIGHT = [255, 246, 220], DARK = [26, 20, 30];
  function paint(g) {
    if (!on() || !S.res || S.mode !== "rings") return;
    const d = pixDays(g); if (!d) return;
    const { out, w, h, cls } = g, U0 = g.U0 || 0, V0 = g.V0 || 0, s = Math.max(0.02, S.anim), nb = BANDS.length;
    const band = x => { const t = x / s; for (let b = 0; b < nb; b++) if (t <= BANDS[b][0]) return b; return nb; };
    const B = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) B[k] = band(d[k]);
    const ink = packc(INK);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, b = B[k], c = cls ? cls[k] : 9; if (c === 255) continue;
      const th = bayer[((V0 + j) & 3) * 4 + ((U0 + i) & 3)];
      // Contours: solid ink on the week, month and season lines, dotted on the two between.
      const rb = i + 1 < w ? B[k + 1] : b, db = j + 1 < h ? B[k + w] : b;
      if (rb !== b || db !== b) { const lo = Math.min(b, rb, db); if (lo === 0 || lo === 2 || lo === 4 || ((U0 + i + V0 + j) & 1) === 0) { out[k] = ink; continue; } }
      const o = out[k], px = [o & 255, (o >> 8) & 255, (o >> 16) & 255];
      const lum = (px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11) / 255, water = c <= 4;
      const col = b === nb ? DUSK : BANDS[b][2];
      // Sea: a light wash of the band, with every other row a shade lighter, like hatched colour on an engraved chart.
      if (water) { out[k] = packc(b === nb ? mixc(px, DUSK, 0.4) : mixc(mixc(col, LIGHT, (V0 + j) & 1 ? 0.45 : 0.3), px, 0.42)); continue; }
      const shade = 0.78 + (lum - 0.5) * 1.1;
      let q = shade >= 1 ? mixc(col, LIGHT, Math.min(0.55, shade - 1)) : mixc(col, DARK, Math.min(0.6, 1 - shade));
      if (th > 0.88) q = mixc(q, px, 0.5);   // a few of the map's own pixels show through every 4x4
      out[k] = packc(q);
    }
  }
  (A.pixelUnder = A.pixelUnder || []).push(paint);
  // For other plugins: the rings now on the map ({o, y, days, at(lon, lat)} or null) and the city they start from.
  A.shrink = { get rings() { return S.res; }, origin, compute, S };

  // ---------- centres of the world ----------
  const TRACKS = [["cities", "Centre of the cities", "#b0462c", "Where the world's big cities balance on the globe (Reba, Reitsma and Seto 2016 city sizes, weighted by population)."],
    ["trade", "Centre of trade", "#c28a1a", "Midpoint on the globe of the richest trade crossroads of the day, east and west (the trade-hub relays)."],
    ["ideas", "Centre of ideas", "#3a6fb8", "Where thinkers were born and great works were made, within 150 years (Ideas & faith records)."]];
  function trackAt(rows, y) {
    if (!rows.length || y < rows[0][0] - 50) return null;
    let a = rows[0]; for (const r of rows) { if (r[0] <= y) a = r; else { const f = (y - a[0]) / (r[0] - a[0]); if (f > 0 && Math.abs(r[1] - a[1]) < 180) return { r: a, lon: a[1] + (r[1] - a[1]) * f, lat: a[2] + (r[2] - a[2]) * f }; break; } }
    return { r: a, lon: a[1], lat: a[2] };
  }
  // A track as line pieces that never jump across the map edge.
  function pieces(rows, y) {
    const out = []; let cur = [];
    for (const r of rows) { if (r[0] > y) break; const p = [r[1], r[2]]; if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > 180) { if (cur.length > 1) out.push(cur); cur = []; } cur.push(p); }
    const now = trackAt(rows, y); if (now && cur.length && Math.abs(now.lon - cur[cur.length - 1][0]) < 180) cur.push([now.lon, now.lat]);
    if (cur.length > 1) out.push(cur);
    return out;
  }
  function centreCard(t, at, C) {
    const r = at.r, extra = t[0] === "cities" ? `${r[3]} cities on the lists; the largest is ${r[4]} (about ${r[5].toLocaleString()} people).` : t[0] === "trade" ? `Hubs that year: ${r[3]}.` : `${r[3]} records nearby in time, such as ${r[4]}.`;
    return { kick: "Centre of the world", title: `${t[1]}, ${C.fmtYear(r[0])}`, year: r[0], lon: at.lon, lat: at.lat, meta: `${at.lat.toFixed(1)}°, ${at.lon.toFixed(1)}°`,
      body: `${t[3]} ${extra}`, why: "The centre is a balance point on the globe, not a capital: when the weights sit on opposite sides of the earth it slides towards a pole, as McKinsey's economic centre of gravity did in the 20th century.",
      sources: [{ cite: "Reba, Reitsma and Seto (2016), Spatializing 6,000 years of global urbanization, Scientific Data 3" }, { cite: "Dobbs et al. (2012), Urban world: cities and the rise of the consuming class, McKinsey Global Institute (the economic centre of gravity)" }] };
  }

  // ---------- news ----------
  const NEWS_WIN = 12;
  const confLine = c => c === "documented" ? "sure" : c === "likely" ? "likely" : "legend";
  function newsCard(n, a, C) {
    return { kick: "How fast news travelled", title: `${n.n}: news reaches ${a[2]}`, year: n.y, lon: a[0], lat: a[1], line: [[n.o[0], n.o[1]], [a[0], a[1]]],
      meta: `${n.o[2]} to ${a[2]} · about ${Math.round(gc(n.o, a)).toLocaleString()} km · ${lagTxt(a)}`,
      body: [a[6], n.note].filter(Boolean).join(" "), why: S.res && S.res.y === snap(n.y) ? `A traveller from ${origin().n} would need ${dd(S.res.at(a[0], a[1]))} to get there that year.` : "",
      sources: (a[8] || []).map(s => ({ cite: s[0], url: s[1] || undefined })) };
  }

  // ---------- the lens ----------
  A.lens({
    id: "shrink", name: "Travel time", family: "land", color: "#b2462c", on: false,
    guide: ["geography", "economy", "technology"],
    key: [["halo", "Travel-time rings from the chosen city: red within a week, ochre within a month, blue within a season"], ["arrow", "News on its way, with the days it took"], ["diamond", "Wandering centres of the world: cities, trade, ideas"]],
    index: d => "Travel time lens: isochrones from " + d.hubs.map(h => h.n).join(", ") + " by year (7, 30, 90 days); news arrivals: " + d.news.map(n => `${n.n} (${n.y})`).join("; "),
    draw(ctx) {
      const D = ctx.data; if (!D || !D.hubs) return;
      schedule();
      const o = origin(), y = ctx.year;
      if (S.mode === "rings") ctx.pins([{ ...o, lon: o.lon, lat: o.lat }], { key: () => "shrink:o", shape: "diamond", size: 6, always: true, pri: 40, color: "#b2462c",
        label: () => `From ${o.n}${S.busy ? " · measuring…" : ""}`, title: () => `Travel-time rings from ${o.n}`,
        card: () => ({ kick: "Travel time", title: `From ${o.n}, ${ctx.fmtYear(snap(y))}`, lon: o.lon, lat: o.lat, year: y, body: summary(), why: "Worked out by the Atlas's shared router: the fastest way that year by foot, horse, camel, river boat, ship, steamer, rail, road and air, with ports, canals, seasons, empire roads and rest days. Rings are estimates; open the Travel tab to see how the router does against real journeys.", sources: [{ cite: "Francis Galton, On the construction of isochronic passage-charts (1881)" }, { cite: "J. G. Bartholomew, Atlas of the World's Commerce / Isochronic distances (1907, 1914)" }, { cite: "Scheidel and Meeks, ORBIS: The Stanford Geospatial Network Model of the Roman World", url: "https://orbis.stanford.edu/" }] }) });
      // News within a dozen years of the slider, fading with distance in time.
      const near = D.news.filter(n => Math.abs(n.y - y) <= NEWS_WIN);
      for (const conf of ["sure", "likely", "legend"]) {
        const legs = []; for (const n of near) for (const a of n.a) if (confLine(a[7]) === conf) legs.push({ n, a, id: n.id + ":" + a[2], pts: [[n.o[0], n.o[1]], [a[0], a[1]]] });
        if (legs.length) ctx.paths(legs, { key: l => l.id, coords: l => l.pts, conf, arrow: true, color: "#7b3f8f", width: 1.8, alpha: .85, title: l => `${l.n.n}: ${l.a[2]}, ${lagTxt(l.a)}`, card: l => newsCard(l.n, l.a, ctx) });
      }
      const arr = near.flatMap(n => n.a.map(a => ({ n, a, lon: a[0], lat: a[1] })));
      ctx.pins(arr, { key: x => "nw:" + x.n.id + ":" + x.a[2], shape: "circle", size: 3.5, color: "#7b3f8f", pri: 12, fade: x => 1 - Math.abs(x.n.y - y) / (NEWS_WIN + 4),
        label: x => `${x.a[2]} · ${x.a[3] < 0 ? "same month" : x.a[3] === 0 ? "same day" : (x.a[4] ? "~" : "") + x.a[3] + " d"}`, title: x => `${x.n.n} reaches ${x.a[2]}`, card: x => newsCard(x.n, x.a, ctx) });
      ctx.pins(near.filter((n, i, l) => l.findIndex(m => m.o[2] === n.o[2] && m.y === n.y) === i).map(n => ({ n, lon: n.o[0], lat: n.o[1] })), { key: x => "ns:" + x.n.id, shape: "square", size: 4.5, color: "#7b3f8f", pri: 14,
        label: x => x.n.n, title: x => `${x.n.n}, ${ctx.fmtYear(x.n.y)}`, card: x => ({ kick: "News breaks", title: x.n.n, year: x.n.y, lon: x.n.o[0], lat: x.n.o[1], meta: `${x.n.o[2]} · ${x.n.date}`, body: x.n.a.map(a => `${a[2]}: ${lagTxt(a)}`).join(" · ") + (x.n.note ? " " + x.n.note : "") }) });
      // Centres of the world: the trail so far, and where each stands now.
      for (const t of TRACKS) {
        const rows = D.centres[t[0]] || []; const at = trackAt(rows, y); if (!at) continue;
        const F = S.mode === "centres";
        ctx.paths(pieces(rows, y).map((pts, i) => ({ id: t[0] + i, pts })), { key: p => "ct:" + p.id, coords: p => p.pts, conf: F ? "sure" : "likely", color: t[2], width: F ? 3 : 1.4, alpha: F ? .95 : .55, title: () => `${t[1]}: its path since ${ctx.fmtYear(rows[0][0])}` });
        // In focus, a dot every 500 years with its date, so the wander reads as a timeline.
        if (F) ctx.pins(rows.filter(r => r[0] % 500 === 0 && r[0] < y), { key: r => "cd:" + t[0] + r[0], shape: "circle", size: 3, color: t[2], pri: 16, label: r => ctx.fmtYear(r[0]), title: r => `${t[1]}, ${ctx.fmtYear(r[0])}`, card: r => centreCard(t, { r, lon: r[1], lat: r[2] }, ctx) });
        ctx.pins([{ lon: at.lon, lat: at.lat }], { key: () => "cc:" + t[0], shape: "diamond", size: F ? 8 : 5, color: t[2], pri: F ? 45 : 9, always: F, label: () => t[1], title: () => `${t[1]}, ${ctx.fmtYear(y)}`, card: () => centreCard(t, at, ctx) });
      }
    },
    here(ctx, at) {
      const D = ctx.data; if (!D || !D.hubs) return [];
      const rows = [];
      if (S.res) { const d = S.res.at(at.lon, at.lat), o = origin(); rows.push({ title: `${dd(d)} from ${o.n}`, year: S.res.y, why: `The fastest way here from ${o.n} in ${ctx.fmtYear(S.res.y)}, by the Atlas's router${S.res.air ? " (flying where it is quicker)" : ""}.` }); }
      for (const n of D.news) for (const a of n.a) if (ctx.km([at.lon, at.lat], [a[0], a[1]]) < (at.r || 300) * 1.5) rows.push({ title: `${n.n} reaches ${a[2]}: ${lagTxt(a)}`, year: n.y, why: a[6], card: newsCard(n, a, ctx) });
      return rows.slice(0, 8);
    },
    now(ctx) {
      const D = ctx.data; if (!D || !D.news) return [];
      const out = [];
      if (S.res) out.push({ title: summary(), year: S.res.y });
      for (const n of D.news.filter(n => Math.abs(n.y - ctx.year) <= 3)) { const a = n.a[n.a.length - 1]; out.push({ title: `${n.n}: news reached ${a[2]} ${a[3] <= 0 ? lagTxt(a) : "after " + lagTxt(a)}`, year: n.y, card: newsCard(n, a, ctx) }); }
      return out.slice(0, 4);
    },
    strip: d => (d.news || []).map(n => n.y),
  });

  // ---------- words ----------
  function reachOf(res, n) {
    // The farthest living city you can reach within n days.
    if (typeof ENTRIES === "undefined") return null;
    let best = null, bd = 0; const o = [res.o.lon, res.o.lat];
    for (const e of ENTRIES) { if (!(e.start <= res.y && (e.end == null || res.y < e.end))) continue; if (res.at(e.lon, e.lat) > n) continue; const k = gc(o, [e.lon, e.lat]); if (k > bd) { bd = k; best = e; } }
    return best && bd > 80 ? { n: best.name, km: bd } : null;
  }
  function summary() {
    if (!S.res) return "";
    const o = origin(), y = S.res.y, w = reachOf(S.res, 7), m = reachOf(S.res, 30), s = reachOf(S.res, 90), a = S.area[S.key] || 0;
    const bits = [w && `a week gets you to ${w.n}`, m && m.n !== (w && w.n) && `a month to ${m.n}`, s && s.n !== (m && m.n) && s.n !== (w && w.n) && `a season to ${s.n}`].filter(Boolean);
    return `From ${o.n} in ${fy(y)}, ${bits.join(", ") || "you are not going far"}. A month covers ${fmtArea(a)} of land (${Math.round(a / 1.49e6)}% of the world's).`;
  }
  const fmtArea = a => a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + " million km²" : Math.round(a / 1e3).toLocaleString() + ",000 km²";

  // ---------- Stories: a scene can pick the city (scene.set.shrink = {from, lens: true}) ----------
  // solo: true hides the other lenses (cities and borders stay) while a story plays, and gives them back when it closes.
  const SOLO_KEEP = new Set(["shrink", "places", "borders", "terrain", "motion", "stories"]);
  let muted = null;
  function solo(on) {
    const api = A.api; if (!api) return;
    if (on && !muted) {
      const keys = ["people", "money", "disease", "ideas", "war", "order", ...Object.keys(typeof LENS_DATA !== "undefined" ? LENS_DATA : {})];
      muted = [...new Set(keys)].filter(k => !SOLO_KEEP.has(k) && A.isOn(k));
      for (const k of muted) api.setOn(k, false);
    } else if (!on && muted) { for (const k of muted) api.setOn(k, true); muted = null; }
  }
  if (A.world && A.world.director && A.world.director.onLeave) A.world.director.onLeave(() => solo(false));
  (A.sceneSet = A.sceneSet || {}).shrink = v => {
    if (!v) return;
    solo(!!v.solo);
    S.mode = v.mode === "centres" ? "centres" : "rings";
    if (v.from) { if (typeof v.from === "string") { S.from = v.from; S.custom = null; } else S.custom = { id: "custom", n: v.from.n || "here", lon: v.from.lon, lat: v.from.lat }; }
    S.key = ""; S.px = null; schedule(); renderTab(); refresh();
  };

  // ---------- the Travel tab ----------
  let el = null;
  const css = document.createElement("style");
  css.textContent = `
.shk { display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.shk p { margin: 0; font-size: 14px; color: var(--ink-soft); line-height: 1.45; }
.shk .big { font-family: var(--fell); font-size: 17px; color: var(--ink); line-height: 1.35; }
.shk h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 4px 0 0; }
.shk .row { display: flex; flex-wrap: wrap; gap: 6px; }
.shk button.c { all: unset; cursor: pointer; font-size: 13px; padding: 4px 9px; border: 1px solid var(--rule); border-radius: 3px; background: var(--card); }
.shk button.c[aria-pressed="true"] { background: #221f1a; color: #f6f0dc; border-color: #221f1a; }
.shk button.c:focus-visible { outline: 2px solid var(--ink); }
.shk .lg { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px 10px; font-size: 12.5px; color: var(--ink-soft); }
.shk .lg i { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -2px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
.shk .bars { display: grid; gap: 4px; }
.shk .bar { all: unset; cursor: pointer; display: grid; grid-template-columns: 48px minmax(0, 1fr) 92px; gap: 8px; align-items: center; font-size: 12.5px; }
.shk .bar .t { font-family: var(--mono); color: var(--ink-soft); }
.shk .bar .b { height: 12px; background: #e2ba54; box-shadow: inset -2px -2px 0 rgba(0,0,0,.2); min-width: 2px; }
.shk .bar.now .t { color: var(--ink); font-weight: 600; }
.shk .bar .v { text-align: right; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.shk table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.shk td { padding: 3px 4px; border-top: 1px solid var(--rule); vertical-align: top; }
.shk td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }`;
  document.head.appendChild(css);

  function renderTab() {
    if (!el || el.hidden) return;
    const D = LD();
    if (!D) { el.innerHTML = `<div class="shk"><p>Loading the travel data…</p></div>`; return; }
    const o = origin(), y = A.api ? A.api.year : 1300, res = S.res;
    const dests = res ? hubs().filter(h => h !== o).map(h => [h.n, res.at(h.lon, h.lat)]) : [];
    const bars = D.eras.map(e => [e, S.area[keyOf(o, e)]]), mx = Math.max(1, ...bars.map(b => b[1] || 0));
    el.innerHTML = `<div class="shk">
      <p class="big">${res ? esc(summary()) : S.busy ? "Measuring the roads…" : "Turn the slider: the rings show how far you could get from one city in that year."}</p>
      <div class="lg">${BANDS.map(b => `<span><i style="background:rgb(${b[2].join(",")})"></i>${b[1]}</span>`).join("")}<span><i style="background:#342c28"></i>out of reach</span></div>
      <div class="row"><button class="c" data-mode="rings" aria-pressed="${S.mode === "rings"}">Travel-time rings</button><button class="c" data-mode="centres" aria-pressed="${S.mode === "centres"}">Centres of the world</button></div>
      ${S.mode === "centres" ? `<p>Three balance points on the globe, one a century since 3000 BCE: <b style="color:#b0462c">the world's big cities</b> by size, <b style="color:#c28a1a">the richest trade crossroads</b>, and <b style="color:#3a6fb8">where thinkers were born and great works were made</b>. Press Play to watch them wander.</p>` : ""}
      <h3>Start from</h3>
      <div class="row">${hubs().map(h => `<button class="c" data-from="${h.id}" aria-pressed="${!S.custom && S.from === h.id}">${esc(h.n)}</button>`).join("")}<button class="c" data-from="centre" aria-pressed="${!!S.custom}">Map centre</button></div>
      ${o.from > y ? `<p>${esc(o.n)} does not exist yet in ${esc(fy(y))}. ${esc(o.note || "")}</p>` : ""}
      <h3>A month's travel from ${esc(o.n)}</h3>
      <div class="bars">${bars.map(([e, a]) => `<button class="bar${snap(y) === e ? " now" : ""}" data-year="${e}"><span class="t">${esc(fy(e))}</span><span class="b" style="width:${a ? Math.max(1, a / mx * 100) : 0}%"></span><span class="v">${a ? fmtArea(a) : "tap to measure"}</span></button>`).join("")}</div>
      ${dests.length ? `<h3>To the other cities, ${esc(fy(res.y))}</h3><table>${dests.map(([n, d]) => `<tr><td>${esc(n)}</td><td class="n">${esc(dd(d))}</td></tr>`).join("")}</table>` : ""}
      ${D.trips.length ? `<h3>How good is the router?</h3><p>Real journeys with their recorded days, against the Atlas's router for the same trip and year (time under way; its days waiting for a ship are left out, as the records leave them out).</p>
        ${S.checks ? `<table>${S.checks.map(c => `<tr><td>${esc(c.t[0])} → ${esc(c.t[3])}, ${esc(fy(c.t[6]))}<br><small>${esc(c.t[9] || c.t[8])}</small></td><td class="n">${c.t[7]} d recorded<br>${c.m == null ? "…" : isFinite(c.m) ? Math.round(c.m) + " d model" : "no route"}</td></tr>`).join("")}</table><p>${esc(checkLine())}</p>` : `<div class="row"><button class="c" data-a="check">Check ${D.trips.length} journeys</button></div>`}` : ""}
      <p>Rings come from the Atlas's shared router (the same one Live a life uses), worked out for each decade. Click anywhere on the map: Here says how long it took to get there.</p>
    </div>`;
  }
  function checkLine() {
    const done = S.checks.filter(c => c.m != null && isFinite(c.m)); if (!done.length) return "Routing…";
    const r = done.map(c => c.m / c.t[7]).sort((a, b) => a - b), med = r[Math.floor(r.length / 2)], close = done.filter(c => c.m / c.t[7] > 0.67 && c.m / c.t[7] < 1.5).length;
    return `${done.length} of ${S.checks.length} routed: the router is within a factor of 1.5 on ${close}, and its median is ${med >= 1 ? (med).toFixed(1) + "× slower" : (1 / med).toFixed(1) + "× faster"} than the record.`;
  }
  function runChecks() {
    const D = LD(); S.checks = D.trips.map(t => ({ t, m: null })); renderTab();
    let i = 0;
    const step = () => {
      if (i >= S.checks.length) return renderTab();
      const c = S.checks[i++], t = c.t;
      // Records time the passage, so compare the router's time under way (its days waiting in port are left out).
      try { const r = A.world.route([t[1], t[2]], [t[4], t[5]], t[6], { pref: t[8] === "sea" || t[8] === "steam" ? "sea" : "fast" }); c.m = r ? r.legs.filter(l => l.medium !== "port").reduce((a, l) => a + l.days, 0) : NaN; c.all = r ? r.days : NaN; } catch (err) { c.m = NaN; }
      if (i % 4 === 0) renderTab();
      setTimeout(step, 30);
    };
    step();
  }
  // The shrink chart fills itself one benchmark year at a time while the tab is open.
  function fillBars() {
    if (!el || el.hidden || !LD() || !A.world || !A.world.motionReady || !A.world.motionReady()) return;
    const o = origin(), e = LD().eras.find(e => S.area[keyOf(o, e)] == null); if (e == null) return;
    (window.requestIdleCallback || (f => setTimeout(f, 50)))(() => { const r = compute(o, e); if (r) { S.area[keyOf(o, e)] = landWithin(r, 30); renderTab(); setTimeout(fillBars, 120); } }, { timeout: 1500 });
  }

  A.tab({
    id: "shrink", name: "Travel",
    mount(pane, api) {
      el = pane; S.api = api;
      pane.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.mode) { S.mode = b.dataset.mode; api.setOn("shrink", true); refresh(); renderTab(); }
        else if (b.dataset.from) {
          S.mode = "rings";
          if (b.dataset.from === "centre") { const v = api.view(); S.custom = { id: "custom", n: "the map centre", lon: v.lon, lat: v.lat }; } else { S.from = b.dataset.from; S.custom = null; }
          api.setOn("shrink", true); S.key = ""; schedule(); renderTab(); fillBars();
        } else if (b.dataset.year) { api.setOn("shrink", true); api.setYear(+b.dataset.year); }
        else if (b.dataset.a === "check") runChecks();
      });
      api.onYear(() => { clearTimeout(S.tt); S.tt = setTimeout(renderTab, 250); });
      renderTab();
    },
    show() { if (S.api && !on()) S.api.setOn("shrink", true); renderTab(); fillBars(); },
  });
})();
