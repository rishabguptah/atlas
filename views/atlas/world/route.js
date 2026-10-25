// The shared motion model (WORLD.md, L2): how people and things got from A to B in any year.
// ATLAS.world.route(a, b, when, opts) runs a time-dependent A* over a half-degree terrain grid (land and water layers)
// with the travel of that year: on foot, horse, camel caravan, river boat, galley, ocean ship, steamer, rail, motor, air;
// ports, straits and canals by opening year; monsoons, winter seas, snow on the passes, mud seasons and desert summers;
// empire roads (Roman, Persian, Inca, the Mongol yam) and working trade routes. Along the way it reports borders,
// war and plague from the Atlas's own data, and a rough risk of dying. ATLAS.world.reach gives an isochrone.
// Data: LENS_DATA.motion (views/atlas/lenses/motion.py: data/motion/rules.json, grid.json, plague outbreaks), which may
// load after the first paint; until then route() returns null and ATLAS.world.motionReady() is false.
// The search itself only touches typed arrays and the rules, so it can move into a worker later.
(function () {
  const M = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.motion) || null;
  const D = M;
  const R = Math.PI / 180;
  const km = (a, b) => { const dl = (b.lat - a.lat) * R, dn = (b.lon - a.lon) * R, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const interp = (rows, y, col = 1) => { if (y <= rows[0][0]) return rows[0][col]; for (let i = 1; i < rows.length; i++) if (y <= rows[i][0]) { const a = rows[i - 1], b = rows[i]; return a[col] + (b[col] - a[col]) * (y - a[0]) / (b[0] - a[0]); } return rows[rows.length - 1][col]; };
  // ---------- the grid ----------
  const COLS = 720, ROWS = 360, N = COLS * ROWS;
  let G = null;
  function grid() {
    if (G) return G;
    G = new Uint8Array(N);
    const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    D().grid.forEach((row, r) => {
      let c = 0;
      for (let i = 0; i < row.length;) {
        const v = AL.indexOf(row[i++]); let n = "";
        while (i < row.length && row[i] >= "0" && row[i] <= "9") n += row[i++];
        const k = n ? +n : 1; G.fill(v, r * COLS + c, r * COLS + c + k); c += k;
      }
    });
    return G;
  }
  const cellOf = (lon, lat) => Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) * 2))) + COLS * Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) * 2)));
  const lonOf = i => (i % COLS) / 2 - 180 + 0.25, latOf = i => 90 - Math.floor(i / COLS) / 2 - 0.25;
  const cls = i => grid()[i] & 15, isWater = i => (grid()[i] & 15) <= 2, hasRiver = i => grid()[i] >= 16;
  // Straits are crossable both ways; canals open to ships in their year.
  function channels(y) {
    const sea = new Set(), ferry = new Set();
    for (const c of D().rules.channels) {
      if (c.at) { const i = cellOf(c.at[0], c.at[1]); for (const d of [0, -1, 1, -COLS, COLS]) { sea.add(i + d); ferry.add(i + d); } }
      else if (c.line && y >= c.from) for (let k = 0; k < c.line.length - 1; k++) {
        const [a, b] = [c.line[k], c.line[k + 1]], n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 4) + 1;
        for (let t = 0; t <= n; t++) sea.add(cellOf(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n));
      }
    }
    return { sea, ferry };
  }
  const inBox = (b, lon, lat) => lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3];

  // ---------- who rules where: a coarse cache, since polityAt is slow ----------
  const polCache = new Map();
  function polity(lon, lat, y) {
    const k = Math.round(lon) + "," + Math.round(lat) + "," + y;
    if (!polCache.has(k)) { let p = null; try { p = window.ATLAS.polityAt ? ATLAS.polityAt(lon, lat, y) : null; } catch { p = null; } polCache.set(k, p ? p.name : null); if (polCache.size > 40000) polCache.clear(); }
    return polCache.get(k);
  }

  // ---------- travel: time-dependent A* over land and water ----------
  function modesFor(y) { return D().rules.modes.filter(m => y >= m.from && (m.to == null || y < m.to)); }
  function tradeCells(y) {
    const s = new Set();
    for (const t of (typeof MONEY !== "undefined" && MONEY.trade) || []) {
      if (!(t.start <= y && (t.end == null || y <= t.end))) continue;
      for (let k = 0; k < t.line.length - 1; k++) {
        const a = t.line[k], b = t.line[k + 1], n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2) + 1;
        for (let q = 0; q <= n; q++) { const i = cellOf(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n); s.add(i); s.add(i + 1); s.add(i - 1); s.add(i + COLS); s.add(i - COLS); }
      }
    }
    return s;
  }
  // Cities alive this year make ports; the start and end of a trip always count as one.
  function ports(y, extra) {
    const s = new Set(), list = [...(typeof ENTRIES !== "undefined" ? ENTRIES.filter(e => e.start <= y && (e.end == null || y < e.end)) : []), ...extra];
    for (const e of list) {
      const c = cellOf(e.lon, e.lat), r0 = Math.floor(c / COLS), c0 = c % COLS, rr = e.always ? 4 : 3;
      for (let dr = -rr; dr <= rr; dr++) for (let dc = -rr; dc <= rr; dc++) { const i = (r0 + dr) * COLS + c0 + dc; if (i >= 0 && i < N && !isWater(i)) s.add(i); }
    }
    return s;
  }
  // Seasons that can apply in a year, split by medium; each is checked against the cell's box and the month.
  function seasonsFor(y) {
    const all = D().rules.seasons.filter(s => y < s.before);
    return { sea: all.filter(s => s.medium === "sea"), land: all.filter(s => s.medium === "land") };
  }
  function seasonX(list, month, i, dlon, dlat, notes) {
    let x = 1;
    if (!list.length) return x;
    const lon = lonOf(i), lat = latOf(i);
    for (const s of list) {
      if (!s.months.includes(month) || !inBox(s.box, lon, lat)) continue;
      if (s.terrain && !s.terrain.includes(cls(i))) continue;
      if (s.heading) {
        const ew = s.heading === "east" || s.heading === "west";
        if (ew ? dlon === 0 : dlat === 0) continue;
        const along = s.heading === "east" ? dlon > 0 : s.heading === "west" ? dlon < 0 : s.heading === "north" ? dlat > 0 : dlat < 0;
        x *= along ? s.x : s.against;
      } else x *= s.x;
      if (notes) notes.add(s.id);
    }
    return x;
  }
  class Heap {
    constructor() { this.k = []; this.v = []; }
    push(k, v) { const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; }
    pop() { const K = this.k, V = this.v, top = V[0], lk = K.pop(), lv = V.pop(); const n = K.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } return top; }
    get size() { return this.k.length; }
  }
  // Distance in km from a cell to each of its 8 neighbours depends only on the row.
  const NB = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DIST = (() => { const d = new Float32Array(ROWS * 8); for (let r = 0; r < ROWS; r++) { const lat = 90 - r / 2 - 0.25; NB.forEach(([dr, dc], k) => { d[r * 8 + k] = km({ lon: 0, lat }, { lon: dc / 2, lat: lat - dr / 2 }); }); } return d; })();
  // Roads that belong to an empire (Roman, Persian, Inca, Mongol): who rules each 3-degree cell, asked once per year.
  const roadCache = new Map();
  function roadAt(roads, lon, lat, y) {
    if (!roads.length) return 1;
    const key = y + ":" + Math.floor(lon / 3) + ":" + Math.floor(lat / 3);
    let v = roadCache.get(key);
    if (v === undefined) { const p = polity(Math.floor(lon / 3) * 3 + 1.5, Math.floor(lat / 3) * 3 + 1.5, y); v = 1; for (const r of roads) if (p && p.includes(r.polity)) v = Math.max(v, r.x); roadCache.set(key, v); if (roadCache.size > 60000) roadCache.clear(); }
    return v;
  }
  // pref: "fast" | "land" | "sea". Returns the path, legs by mode, days, cost in day-wages and what you will meet.
  function route(a, b, y, month, pref = "fast") {
    const rules = D().rules, ms = modesFor(y), T = rules.terrain, pace = rules.pace || { land: 1, sea: 1 };
    const land = ms.filter(m => m.medium === "land"), seaM = ms.filter(m => m.medium === "sea").sort((p, q) => q.kmd - p.kmd), riverM = ms.find(m => m.medium === "river");
    const sea = seaM[0] || null, steam = !!(seaM[0] && seaM[0].id === "steam");
    const ch = channels(y), trade = tradeCells(y), port = ports(y, [{ ...a, always: 1 }, { ...b, always: 1 }]);
    const rails = rules.rail_regions.filter(r => y >= r.from);
    const roads = rules.roads.filter(r => r.polity && y >= r.from && y <= r.to);
    const SS = seasonsFor(y), seaS = steam ? [] : SS.sea, landS = SS.land;
    const water = i => isWater(i) || ch.sea.has(i), dry = i => !isWater(i) || ch.ferry.has(i), onWaterCell = i => water(i);
    const snap = p => { const i = cellOf(p.lon, p.lat); if (dry(i)) return i; let best = i, bd = 1e9; for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) { const j = i + dr * COLS + dc; if (j >= 0 && j < N && dry(j) && dr * dr + dc * dc < bd) { bd = dr * dr + dc * dc; best = j; } } return best; };
    const s0 = snap(a), t0 = snap(b);
    // Best land speed per cell (km per elapsed day, rest days included), worked out once per cell.
    const LV = new Float32Array(N).fill(-1), LM = new Int8Array(N);
    const MODE = ms.map(m => m.id); MODE.push("board");
    const landSpeed = i => {
      if (LV[i] >= 0) return LV[i];
      const c = cls(i), lon = lonOf(i), lat = latOf(i); let best = 0, mode = -1;
      for (const m of land) {
        if (m.rail && !rails.some(r => inBox(r.box, lon, lat))) continue;
        const v = m.kmd * ((T[m.id] || T.foot)[c] ?? 0.5);
        if (v > best) { best = v; mode = MODE.indexOf(m.id); }
      }
      let road = trade.has(i) ? 1.2 : 1;
      if (mode >= 0 && !ms[mode].rail && ms[mode].id !== "motor") road = Math.max(road, roadAt(roads, lon, lat, y));
      LV[i] = best * road * pace.land; LM[i] = mode;
      return LV[i];
    };
    const maxV = Math.max(sea ? sea.kmd * 1.35 * pace.sea : 0, ...land.map(m => m.kmd * 1.3 * pace.land), riverM ? riverM.kmd * pace.land : 0) || 30;
    const tlat = latOf(t0) * R, tlon = lonOf(t0) * R;
    // Heuristic: great-circle km to the target at the top speed, a little inflated (weighted A*) to stay quick.
    const hK = new Float32Array(2 * N).fill(-1), W = pref === "fast" ? 1.2 : pref === "sea" ? 5 : 2.2;
    const heur = i => { if (hK[i] >= 0) return hK[i]; const la = latOf(i) * R, lo = lonOf(i) * R; const x = Math.sin((tlat - la) / 2) ** 2 + Math.cos(la) * Math.cos(tlat) * Math.sin((tlon - lo) / 2) ** 2; return hK[i] = 12742 * Math.asin(Math.min(1, Math.sqrt(x))) / maxV * W; };
    const g = new Float64Array(2 * N).fill(Infinity), from = new Int32Array(2 * N).fill(-1), how = new Int8Array(2 * N);
    const H = new Heap(), BOARD = MODE.length - 1, seaIx = sea ? MODE.indexOf(sea.id) : -1, riverIx = riverM ? MODE.indexOf(riverM.id) : -1;
    const waitPort = steam ? (rules.ports.steam_wait_days || 2) : rules.ports.wait_days;
    g[s0] = 0; H.push(heur(s0), s0);
    const seaPen = pref === "land" ? 4 : 1, landPen = pref === "sea" ? 1.8 : 1;
    let found = -1, n = 0;
    while (H.size && n < (pref === "fast" ? 450000 : 200000)) {
      const s = H.pop(), onW = s >= N, i = onW ? s - N : s, gs = g[s]; n++;
      if (!onW && i === t0) { found = s; break; }
      const r = Math.floor(i / COLS), c = i % COLS;
      const mo = ((month - 1 + Math.floor(gs / 30.4)) % 12) + 1;
      if (sea) {
        if (!onW && dry(i)) {
          let coast = false; for (const [dr, dc] of NB) { const j = (r + dr) * COLS + ((c + dc + COLS) % COLS); if (j >= 0 && j < N && water(j)) { coast = true; break; } }
          if (coast) { const t = gs + (port.has(i) ? waitPort : rules.ports.no_port_days) * seaPen; if (t < g[i + N]) { g[i + N] = t; from[i + N] = s; how[i + N] = BOARD; H.push(t + heur(i), i + N); } }
        }
        if (onW && dry(i)) { const t = gs + 1; if (t < g[i]) { g[i] = t; from[i] = s; how[i] = BOARD; H.push(t + heur(i), i); } }
      }
      for (let k = 0; k < 8; k++) {
        const dr = NB[k][0], dc = NB[k][1], rr = r + dr; if (rr < 0 || rr >= ROWS) continue;
        const j = rr * COLS + ((c + dc + COLS) % COLS), d = DIST[r * 8 + k];
        let t, m, sj = j;
        if (onW) {
          if (!water(j)) {
            // Come ashore on the next cell: a day at a port, a few days landing on an open coast.
            if (!dry(j) || !onWaterCell(i)) continue;
            const v = sea.kmd * pace.sea; t = gs + d / v * seaPen + (port.has(j) ? 1 : 3); m = BOARD; sj = j;
          } else {
            const v = sea.kmd * pace.sea * seaX(seaS, mo, j, dc, -dr); if (v <= 0) continue;
            t = gs + d / v * seaPen; m = seaIx; sj = j + N;
          }
        } else {
          if (!dry(j)) continue;
          let v = landSpeed(j), md = LM[j];
          if (riverM && hasRiver(i) && hasRiver(j) && riverM.kmd * pace.land > v) { v = riverM.kmd * pace.land; md = riverIx; }
          if (md < 0 || v <= 0) continue;
          if (landS.length) v *= seasonX(landS, mo, j, dc, -dr);
          if (cls(j) === 15 && v < 3) continue;
          t = gs + d / v * landPen; m = md;
        }
        if (t < g[sj]) { g[sj] = t; from[sj] = s; how[sj] = m; H.push(t + heur(j), sj); }
      }
    }
    if (found < 0) return null;
    const steps = [];
    for (let s = found; s >= 0; s = from[s]) steps.push(s);
    steps.reverse();
    const pts = [], legs = [], notes = new Set(); let cost = 0;
    for (let k = 0; k < steps.length; k++) {
      const s = steps[k], i = s >= N ? s - N : s, p = [lonOf(i), latOf(i)];
      pts.push(p);
      if (!k) continue;
      const mi = how[s], m = MODE[mi], onSea = mi === seaIx, pen = mi === BOARD ? seaPen : onSea ? seaPen : landPen;
      const dt = (g[s] - g[steps[k - 1]]) / pen, ps = pts[k - 1], dk = km({ lon: ps[0], lat: ps[1] }, { lon: p[0], lat: p[1] });
      const last = legs[legs.length - 1];
      if (last && last.mode === m) { last.km += dk; last.days += dt; last.to = k; } else legs.push({ mode: m, km: dk, days: dt, from: k - 1, to: k });
      const mm = ms.find(x => x.id === m); cost += (mm ? mm.cost : 1) * dt;
      const mo = ((month - 1 + Math.floor(g[s] / 30.4)) % 12) + 1;
      seasonX(s >= N ? seaS : landS, mo, i, p[0] - ps[0], p[1] - ps[1], notes);
    }
    const total = legs.reduce((s, l) => s + l.days, 0);
    pts[0] = [a.lon, a.lat]; pts[pts.length - 1] = [b.lon, b.lat];
    const out = { pts: simplify(pts), raw: pts, legs: legs.filter(l => l.days > 0.01), days: total, cost, notes: [...notes], y, month, pref, n };
    out.meet = meetOn(out, y);
    return out;
  }
  const seaX = (list, mo, j, dc, dr) => list.length ? seasonX(list, mo, j, dc, dr) : 1;
  function simplify(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0.01) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function flight(a, b, y) {
    const air = modesFor(y).find(m => m.id === "air"); if (!air) return null;
    const d = km(a, b), fare = interp(air.fare, y);
    return { pts: [[a.lon, a.lat], [b.lon, b.lat]], legs: [{ mode: "air", km: d, days: 1 + d / air.kmd, from: 0, to: 1 }], days: 1 + d / air.kmd, cost: fare * (0.5 + d / 8000), notes: [], y, pref: "air", meet: meetOn({ pts: [[a.lon, a.lat], [b.lon, b.lat]] }, y, true) };
  }
  // What lies along the way: borders, war, plague, and the risk of the road.
  function meetOn(r, y, air) {
    const H = D().rules.hazards, out = { borders: [], war: [], plague: [], risk: 0 };
    const samp = [];
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [a, b] = [r.pts[k], r.pts[k + 1]], n = Math.max(1, Math.ceil(km({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) / 120));
      for (let q = 0; q < n; q++) samp.push({ lon: a[0] + (b[0] - a[0]) * q / n, lat: a[1] + (b[1] - a[1]) * q / n });
    }
    samp.push({ lon: r.pts[r.pts.length - 1][0], lat: r.pts[r.pts.length - 1][1] });
    if (!air) {
      let last;
      for (const p of samp) { const w = polity(p.lon, p.lat, y); if (w && w !== last) { if (!out.borders.length || out.borders[out.borders.length - 1].n !== w) out.borders.push({ n: w, lon: p.lon, lat: p.lat }); last = w; } }
      const near = (lat, lon, kmMax) => samp.some(p => Math.abs(p.lat - lat) < 4 && km(p, { lon, lat }) < kmMax);
      for (const bt of battles(y, 0)) if (near(bt.lat, bt.lon, H.war_km)) out.war.push(bt);
      const pl = plagueYear(y);
      if (pl.size) for (const p of samp) { const c = cellOf(p.lon, p.lat); if (pl.has(c) || pl.has(c + 1) || pl.has(c - 1) || pl.has(c + COLS) || pl.has(c - COLS)) { out.plague.push(p); } }
    }
    const seaDays = (r.legs || []).filter(l => ["sail", "ocean", "steam"].includes(l.mode)).reduce((s, l) => s + l.days, 0), allDays = (r.legs || []).reduce((s, l) => s + l.days, 0);
    const modern = y >= 1900 ? 0.15 : y >= 1800 ? 0.5 : 1;
    out.risk = air ? 0.0005 : Math.min(0.6, ((allDays - seaDays) / 100 * H.base_per_100_days + seaDays / 100 * H.sea_per_100_days) * modern + Math.min(out.war.length, H.war_max || 3) * H.war_risk * modern + (out.plague.length ? 0.05 : 0));
    out.borderDays = Math.max(0, out.borders.length - 1) * H.border_days; out.toll = Math.max(0, out.borders.length - 1) * H.border_toll;
    return out;
  }

  const plagueCache = {};
  function plagueYear(y) {
    if (plagueCache[y]) return plagueCache[y];
    const s = (D().plague || {})[y]; const set = new Set();
    if (s) for (const t of s.split(".")) set.add(parseInt(t, 36));
    return plagueCache[y] = set;
  }
  function plagueAt(lon, lat, y, kmR = 60) {
    const set = plagueYear(y); if (!set.size) return false;
    const c = cellOf(lon, lat), rr = Math.max(1, Math.round(kmR / 55));
    for (let dr = -rr; dr <= rr; dr++) for (let dc = -rr; dc <= rr; dc++) if (set.has(c + dr * COLS + dc)) return true;
    return false;
  }
  // The Wikidata battles may sit in a late file (atlas-files/battles-wd.json); fetch our own copy once.
  let wdLate = null, wdAsked = false;
  function wdRows(W) {
    if (W.wd) return W.wd;
    if (!wdAsked && typeof LATE_FILES !== "undefined" && LATE_FILES["war:wd"]) {
      wdAsked = true;
      fetch(LATE_FILES["war:wd"]).then(r => r.ok ? r.json() : null).then(v => { wdLate = v; }).catch(() => { /* curated battles only */ });
    }
    return wdLate || [];
  }
  function battles(y, win) {
    const W = typeof WAR !== "undefined" ? WAR : null; if (!W) return [];
    const a = (W.battles || []).filter(b => Math.abs(b.start - y) <= win).map(b => ({ name: b.name, y: b.start, lat: b.lat, lon: b.lon, why: b.why, cur: 1 }));
    const b = wdRows(W).filter(r => Math.abs(r[2] - y) <= win).map(r => ({ name: r[0], y: r[2], lat: r[3], lon: r[4], why: r[7] ? `Part of ${r[7]}` : r[6] || "" }));
    return [...a, ...b];
  }
  // ---------- isochrone: where you can be within so many days ----------
  // Returns {days: Float32Array(720 * 360) (Infinity where out of reach), cols, rows, cell} plus at(lon, lat) -> days.
  function reach(a, y, month, maxDays, opts = {}) {
    if (!M()) return null;
    const rules = D().rules, ms = modesFor(y), T = rules.terrain, pace = rules.pace || { land: 1, sea: 1 };
    const land = ms.filter(m => m.medium === "land"), sea = ms.filter(m => m.medium === "sea").sort((p, q) => q.kmd - p.kmd)[0] || null, riverM = ms.find(m => m.medium === "river");
    const ch = channels(y), trade = tradeCells(y), port = ports(y, [{ ...a, always: 1 }]), rails = rules.rail_regions.filter(r => y >= r.from);
    const roads = rules.roads.filter(r => r.polity && y >= r.from && y <= r.to), SS = seasonsFor(y), seaS = sea && sea.id === "steam" ? [] : SS.sea;
    const water = i => isWater(i) || ch.sea.has(i), dry = i => !isWater(i) || ch.ferry.has(i);
    const LV = new Float32Array(N).fill(-1);
    const landSpeed = i => {
      if (LV[i] >= 0) return LV[i];
      const c = cls(i), lon = lonOf(i), lat = latOf(i); let best = 0, rail = false;
      for (const m of land) { if (m.rail && !rails.some(r => inBox(r.box, lon, lat))) continue; const v = m.kmd * ((T[m.id] || T.foot)[c] ?? 0.5); if (v > best) { best = v; rail = !!m.rail; } }
      const road = Math.max(trade.has(i) ? 1.2 : 1, rail ? 1 : roadAt(roads, lon, lat, y));
      return LV[i] = best * road * pace.land;
    };
    const g = new Float32Array(2 * N).fill(Infinity), H = new Heap(), s0 = cellOf(a.lon, a.lat);
    g[s0] = 0; H.push(0, s0);
    const waitPort = sea && sea.id === "steam" ? (rules.ports.steam_wait_days || 2) : rules.ports.wait_days;
    while (H.size) {
      const s = H.pop(), onW = s >= N, i = onW ? s - N : s, gs = g[s]; if (gs > maxDays) break;
      const r = Math.floor(i / COLS), c = i % COLS, mo = ((month - 1 + Math.floor(gs / 30.4)) % 12) + 1;
      const relax = (j, t) => { if (t < g[j] && t <= maxDays) { g[j] = t; H.push(t, j); } };
      if (sea && !onW && dry(i) && port.has(i)) relax(i + N, gs + waitPort);
      for (let k = 0; k < 8; k++) {
        const rr = r + NB[k][0]; if (rr < 0 || rr >= ROWS) continue;
        const j = rr * COLS + ((c + NB[k][1] + COLS) % COLS), d = DIST[r * 8 + k];
        if (onW) {
          if (water(j)) { const v = sea.kmd * pace.sea * seaX(seaS, mo, j, NB[k][1], -NB[k][0]); if (v > 0) relax(j + N, gs + d / v); }
          else if (dry(j)) relax(j, gs + d / (sea.kmd * pace.sea) + (port.has(j) ? 1 : 3));
        } else if (dry(j)) {
          let v = landSpeed(j); if (riverM && hasRiver(i) && hasRiver(j)) v = Math.max(v, riverM.kmd * pace.land);
          if (SS.land.length) v *= seasonX(SS.land, mo, j, NB[k][1], -NB[k][0]);
          if (v > 0) relax(j, gs + d / v);
        }
      }
    }
    const days = new Float32Array(N);
    for (let i = 0; i < N; i++) days[i] = Math.min(g[i], g[i + N]);
    return { days, cols: COLS, rows: ROWS, cell: 0.5, at: (lon, lat) => days[cellOf(lon, lat)] };
  }

  // ---------- the public face ----------
  const pt = p => Array.isArray(p) ? { lon: +p[0], lat: +p[1] } : p && isFinite(p.lon) ? { lon: +p.lon, lat: +p.lat } : null;
  const when = w => {
    if (typeof w === "number") return { y: Math.round(w), m: 4 };
    if (typeof w === "string") { const m = /^(-?\d+)(?:-(\d\d))?/.exec(w); return m ? { y: +m[1], m: m[2] ? +m[2] : 4 } : { y: 1500, m: 4 }; }
    return { y: Math.round(w.y), m: w.m || 4 };
  };
  const SEA = new Set(["sail", "ocean", "steam"]);
  const MEDIUM = id => id === "board" ? "port" : SEA.has(id) ? "sea" : id === "river" ? "river" : id === "air" ? "air" : "land";
  // Shapes the route the way WORLD.md says, and keeps the extra detail (pts, meet, notes, cost) for richer callers.
  function shape(r) {
    if (!r) return null;
    const risks = [];
    if (r.meet.war.length) risks.push({ kind: "war", p: Math.min(r.meet.war.length, D().rules.hazards.war_max || 3) * D().rules.hazards.war_risk, why: "Fighting near the road: " + r.meet.war.slice(0, 3).map(w => w.name).join(", ") });
    if (r.meet.plague.length) risks.push({ kind: "plague", p: 0.05, why: "Plague outbreaks along the way this year" });
    risks.push({ kind: "road", p: r.meet.risk, why: "All risks of the road together (disease, weather, bandits, shipwreck)" });
    return Object.assign(r, { path: r.pts, risks, conf: "estimated", legs: r.legs.map(l => ({ ...l, medium: MEDIUM(l.mode) })) });
  }
  const W = (window.ATLAS.world = window.ATLAS.world || {});
  W.route = (a, b, t, opts = {}) => {
    if (!M()) return null;
    const A = pt(a), B = pt(b), T = when(t), pref = opts.pref || (opts.mode === "air" ? "air" : opts.mode === "land" ? "land" : opts.mode === "sea" ? "sea" : "fast");
    if (!A || !B) return null;
    return shape(pref === "air" ? flight(A, B, T.y) : route(A, B, T.y, T.m, pref));
  };
  W.reach = (a, t, maxDays, opts) => { const A = pt(a), T = when(t); return A ? reach(A, T.y, T.m, maxDays, opts) : null; };
  W.motionReady = () => !!M();
  // Pieces other plugins (Live a life) reuse: the grid, who rules a spot (cached), plague by year, battles by year.
  W.motion = { cellOf, cls, isWater, lonOf, latOf, COLS, ROWS, modesFor, inBox, polity, plagueAt, battles, rules: () => M() && M().rules, km };
})();
