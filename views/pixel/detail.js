// Zoom detail for the pixel map: as you zoom in, the world gains roads, walls, fields, villages, ports, castles and
// province names, like the overworld of a classic RPG, instead of magnified terrain pixels. Everything is dated, so it
// changes with the year: Roman roads appear as Rome takes each province and fade after it falls, forests give way to
// fields as population grows, railways arrive country by country. Data: ingest/pixel/detail.py (tiles beside the page).
//
//   const D = PixelDetail({ base: "detail/", onLoad })
//   pm.setDetail((G, phase) => D.draw(G, phase, year))   G is the pixel map's grid (pixelmap.js detail())
//   D.names(view)                                         province names for the label engine (ATLAS.labels source)
//
// Zoom tiers (k = zoom factor; one art pixel is about 180 / k km): long walls from 2.5x; main roads, railways and
// fields from 5x; ports from 12x; hamlets from 10x; castles, forts and lighthouses from 12x; secondary roads from 12-22x;
// mapped ancient villages from 24x; villas and city walls from 36x. Lines whose route or date is estimated are dashed
// (rule 5: every mark shows how sure we are).
(function (global) {
  // At k the map shows about 180 / k km per art pixel, so "past 6x" is still 30 km a pixel: detail is chosen, not traced.
  const T0 = { rr: 5, hw: 6, rd: 24, rw: 5, wl: 2.5 }, T1 = { rr: 22, hw: 14, rd: 24, rw: 12, wl: 2.5 };
  const OLD_ROAD = 400;  // years a Roman road stays visible (faded) after Roman upkeep ended there
  // Arable weight per terrain class (SPEC.md ids): how readily land of that kind is farmed.
  const ARABLE = new Float32Array(18); Object.assign(ARABLE, { 4: 1, 6: 0.15, 7: 0.35, 8: 0.8, 9: 0.45, 10: 1, 11: 0.6, 14: 0.5, 15: 0.7 });
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = s => { const [r, g, b] = hex(s); return (255 << 24 | b << 16 | g << 8 | r) >>> 0; };
  const C = {
    road: P("#efe0b4"), roadS: P("#5e4c38"), old: P("#c8b890"), hw: P("#f6f0e0"), hwS: P("#3e3830"), rd: P("#e2d4ac"),
    rail: P("#2a2420"), tie: P("#d8ccb4"), wall: P("#ece2cc"), wallS: P("#4a4038"), bridge: P("#8a5a32"),
    pier: P("#8a5a32"), pierD: P("#5e3a1e"), sail: P("#f6f0dc"), hull: P("#5e3a1e"),
    stone: P("#b4aca0"), stoneL: P("#d8d0c4"), stoneD: P("#6e665c"), ink: P("#221f1a"), flag: P("#b8382a"),
    light: P("#ffe08a"), white: P("#f2eee4"), red: P("#b8382a"),
  };
  // Crops: [fill, furrow] pairs; paddies are wet green with a water edge.
  const CROPS = [["#d8c262", "#8e8a3c"], ["#c4b452", "#7e7a34"], ["#a8c45a", "#6a8a38"], ["#90b44e", "#5a7c30"], ["#bccc6a", "#7a8e40"], ["#ccb46c", "#8a7a44"]].map(p => p.map(P));
  const PADDY = [["#9cc884", "#5e9aa4"], ["#86ba78", "#5e9aa4"], ["#b4cc80", "#6aa0a8"]].map(p => p.map(P));
  const ROOF = { terracotta: P("#b8583a"), thatch: P("#8a6a3a"), slate: P("#5a6270"), red: P("#a84a38"), mud: P("#8a5a34"), tile: P("#4a5a6a"), palm: P("#9a7a40") };
  const WALLC = { light: P("#efe6d2"), mud: P("#dcc49a"), wood: P("#a07a4a") };

  function PixelDetail(opts) {
    const base = (opts && opts.base) || "detail/", onLoad = (opts && opts.onLoad) || (() => {});
    const tiles = {};
    let loaded = 0;
    let pop = null, grid = null, GW = 0, GH = 0, densY = null, dens = null, projKey = "", wantSoon = 0;
    fetch(base + "pop.json").then(r => r.ok ? r.json() : null).then(j => { pop = j; densY = null; ping(); }).catch(() => {});
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = GW = img.width; c.height = GH = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, GW, GH).data; grid = new Uint8Array(GW * GH);
      for (let i = 0; i < grid.length; i++) grid[i] = d[i * 4];
      ping();
    };
    img.src = base + "countries.png";
    function ping() { clearTimeout(wantSoon); wantSoon = setTimeout(onLoad, 80); }

    function tile(c, r) {
      const key = c + "_" + r;
      if (tiles[key]) return tiles[key].ready ? tiles[key] : null;
      const t = tiles[key] = { ready: false };
      fetch(base + "d_" + key + ".json").then(res => res.ok ? res.json() : { lines: [], pts: [], names: [] }).then(j => {
        t.lines = j.lines.map(([kind, a, b, f, xy]) => {
          const ll = new Float64Array(xy.length); let x = 0, y = 0;
          for (let i = 0; i < xy.length; i += 2) { x += xy[i]; y += xy[i + 1]; ll[i] = x / 1000; ll[i + 1] = y / 1000; }
          let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
          for (let i = 0; i < ll.length; i += 2) { x0 = Math.min(x0, ll[i]); x1 = Math.max(x1, ll[i]); y0 = Math.min(y0, ll[i + 1]); y1 = Math.max(y1, ll[i + 1]); }
          return { kind, a, b, main: f & 1, cert: (f >> 1) & 3, ll, bb: [x0, y0, x1, y1], pp: null };
        });
        t.pts = j.pts.map(([kind, x, y, a, b]) => ({ kind, lon: x / 1000, lat: y / 1000, a, b }));
        t.names = j.names.map(([name, x, y, a, b, rank]) => ({ name, lon: x / 1000, lat: y / 1000, a, b, rank }));
        t.ready = true; loaded++; ping();
      }).catch(() => { t.ready = true; t.lines = []; t.pts = []; t.names = []; });
      return null;
    }
    // Tiles covering the lon/lat box of the current view.
    function inView(G) {
      let x0 = 181, x1 = -181, y0 = 91, y1 = -91;
      const { w, h, lonA, latA, cls } = G, step = Math.max(1, (Math.min(w, h) / 24) | 0);
      for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) {
        const k = j * w + i; if (cls[k] === 255) continue;
        const lo = lonA[k], la = latA[k]; if (lo < x0) x0 = lo; if (lo > x1) x1 = lo; if (la < y0) y0 = la; if (la > y1) y1 = la;
      }
      if (x0 > x1) return { box: null, list: [] };
      const box = [x0 - 1, y0 - 1, x1 + 1, y1 + 1], list = [];
      for (let c = Math.max(0, Math.floor((box[0] + 180) / 30)); c <= Math.min(11, Math.floor((box[2] + 180) / 30)); c++)
        for (let r = Math.max(0, Math.floor((90 - box[3]) / 30)); r <= Math.min(5, Math.floor((90 - box[1]) / 30)); r++) { const t = tile(c, r); if (t) list.push(t); }
      return { box, list };
    }

    // People per km2 of farmland, per country, for this year (HYDE country totals over arable land).
    function density(year) {
      if (!pop) return null;
      if (densY === year && dens) return dens;
      const E = pop.epochs; let i = 1; while (i < E.length - 1 && E[i] < year) i++;
      const f = Math.max(0, Math.min(1, (year - E[i - 1]) / (E[i] - E[i - 1])));
      dens = new Float32Array(pop.countries.length + 1);
      pop.countries.forEach((c, n) => { if (c.pop && c.km2 > 0) dens[n + 1] = (c.pop[i - 1] + (c.pop[i] - c.pop[i - 1]) * f) / c.km2; });
      densY = year; return dens;
    }
    const densAt = (D, lon, lat) => { if (!grid || !D) return 0; const x = Math.min(GW - 1, Math.max(0, ((lon + 180) * GW / 360) | 0)), y = Math.min(GH - 1, Math.max(0, ((90 - lat) * GH / 180) | 0)); return D[grid[y * GW + x]] || 0; };

    // Farm styles by place and time: open-field strips in medieval Europe, rice paddies in monsoon Asia, square
    // survey sections on 19th-century frontiers, centuriation grids near Roman colonies, small irregular plots elsewhere.
    function styleOf(lon, lat, year, cent) {
      if (cent) return 3;
      if (year >= 1790 && ((lon < -60 && lat > 25 && lat < 55) || (lon > 112 && lat < -25) || (lon < -55 && lat < -25 && lat > -40))) return 3;
      if (year >= -1000 && lat < 36 && lat > -10 && ((lon > 98 && lon < 125) || (lon > 85 && lon < 92 && lat < 27) || (lon > 74 && lon < 81 && lat < 14))) return 2;
      if (year >= 700 && year < 1850 && lat > 44 && lat < 60 && lon > -6 && lon < 40) return 1;
      return 0;
    }

    function fields(G, year) {
      const D = density(year); if (!D) return;
      const { w, h, U0, V0, cls, lonA, latA, lowNoise, base: B, hash } = G;
      // Centuriation (Roman land survey grids) active this year, within ~25 km.
      const cent = [];
      for (const t of last.list) for (const p of t.pts) if (p.kind === "z" && p.a <= year && year <= p.b) cent.push(p);
      // Desert farmland only where a river or wetland is close (the Nile, the Tigris and Euphrates, the Indus).
      let wet = null;
      for (let k = 0; k < w * h; k++) if (cls[k] === 12 || cls[k] === 13 || cls[k] === 11) { wet = new Uint8Array(w * h); break; }
      if (wet) {
        for (let k = 0; k < w * h; k++) if (cls[k] === 4 || cls[k] === 14 || cls[k] === 3) wet[k] = 4;
        for (let pass = 0; pass < 3; pass++) for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
          const k = j * w + i; if (wet[k]) continue;
          const m = Math.max(wet[k - 1], wet[k + 1], wet[k - w], wet[k + w]); if (m > 1) wet[k] = m - 1;
        }
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k];
        if (c === 255 || c <= 4) continue;
        let a = ARABLE[c];
        const oasis = (c === 12 || c === 13 || c === 11) && wet && wet[k];
        if (oasis) a = 1;
        if (!a) continue;
        const lon = lonA[k], lat = latA[k];
        let d = densAt(D, lon, lat);
        if (d < 0.5) continue;
        // Irrigated valleys in dry lands (the Nile, Mesopotamia, the Indus) are farmed wall to wall wherever people live.
        if (oasis) d = Math.max(d, 120);
        const near = cent.length && cent.some(p => Math.abs(p.lon - lon) < 0.25 && Math.abs(p.lat - lat) < 0.2);
        const st = styleOf(lon, lat, year, near);
        const u = U0 + i, v = V0 + j;
        // Parcel grid anchored to the world so fields do not shimmer on pan; rows are staggered.
        const PW = st === 1 ? 7 : st === 3 ? 5 : 4, PH = st === 1 ? 2 : st === 3 ? 5 : 3;
        const pv = Math.floor(v / PH), off = st === 3 ? 0 : Math.floor(hash(pv, 17) * PW), pu = Math.floor((u + off) / PW);
        const p = (1 - Math.exp(-d / 40)) * a * (0.45 + 0.45 * lowNoise[k]);
        const r = hash(pu * 3 + 1, pv * 7 + 2);
        if (r > p) continue;
        const lx = (u + off) - pu * PW, ly = v - pv * PH;
        const pal = st === 2 ? PADDY[(r * 997 | 0) % PADDY.length] : CROPS[(r * 991 | 0) % CROPS.length];
        const edge = st === 1 ? ly === PH - 1 && lx % 3 === 0 : lx === PW - 1 || ly === PH - 1;
        B[k] = edge ? pal[1] : pal[0];
      }
    }

    // ---------- lines: roads, railways, walls
    function stroke(G, pp, kind, cert, main, old, year) {
      const { w, h, U0, V0, PX, k: K, cls, base: B } = G;
      let n = 0, pi = null, pj = null;
      const wide = K >= 30;
      const put = (i, j) => {
        n++;
        if (i < 0 || j < 0 || i >= w || j >= h) return;
        const q = j * w + i, c = cls[q];
        occ[q] = 1;
        if (c === 255 || c <= 2 || (c === 3 && kind !== "wl")) return;
        // Estimated routes are dashed; hypothetical ones dotted.
        if (cert === 1 && n % 5 === 4) return;
        if (cert === 2 && (kind === "wl" ? n % 6 === 5 : n % 3 !== 0)) return;
        if (c === 4) { if (kind !== "wl") B[q] = C.bridge; return; }
        if (kind === "rr") {
          if (old) { if (n & 1) B[q] = C.old; return; }
          B[q] = C.road; if ((main || wide) && j + 1 < h && cls[q + w] > 4 && cls[q + w] !== 255 && !occ[q + w]) B[q + w] = C.roadS;
        } else if (kind === "hw") {
          B[q] = C.hw; if ((main || wide) && j + 1 < h && cls[q + w] > 4 && cls[q + w] !== 255 && !occ[q + w]) B[q + w] = C.hwS;
        } else if (kind === "rd") B[q] = C.rd;
        else if (kind === "rw") B[q] = n & 1 ? C.rail : C.tie;
        else if (kind === "wl") {
          B[q] = C.wall;
          if (j + 1 < h) B[q + w] = C.wallS;
          if (n % 5 === 0 && j > 0) B[q - w] = C.wall;  // towers
        }
      };
      for (let s = 0; s < pp.length; s += 2) {
        const i = Math.floor((pp[s] * K) / PX) - U0, j = Math.floor((pp[s + 1] * K) / PX) - V0;
        if (pp[s] !== pp[s]) { pi = null; continue; }
        if (pi !== null && !(Math.max(i, pi) < 0 || Math.min(i, pi) >= w || Math.max(j, pj) < 0 || Math.min(j, pj) >= h)) {
          let x0 = pi, y0 = pj; const dx = Math.abs(i - x0), dy = -Math.abs(j - y0), sx = x0 < i ? 1 : -1, sy = y0 < j ? 1 : -1;
          let e = dx + dy, guard = 0;
          for (;;) { put(x0, y0); if ((x0 === i && y0 === j) || ++guard > 6000) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
        }
        pi = i; pj = j;
      }
    }
    function lines(G, year, proj) {
      const K = G.k, box = last.box; if (!box) return;
      const list = [];
      for (const t of last.list) for (const L of t.lines) {
        const old = L.kind === "rr" && year > L.b;
        if (year < L.a || year > L.b + (L.kind === "rr" ? OLD_ROAD : 0)) continue;
        if (K < (L.main ? T0 : T1)[L.kind] || (old && K < 8)) continue;
        if (L.bb[2] < box[0] || L.bb[0] > box[2] || L.bb[3] < box[1] || L.bb[1] > box[3]) continue;
        if (!L.pp || L.pk !== projKey) {
          const pp = new Float64Array(L.ll.length);
          for (let i = 0; i < L.ll.length; i += 2) { const p = proj([L.ll[i], L.ll[i + 1]]) || [NaN, NaN]; pp[i] = p[0]; pp[i + 1] = p[1]; }
          L.pp = pp; L.pk = projKey;
        }
        list.push([L, old]);
      }
      // Lesser lines first so walls, main roads and railways sit on top.
      const ord = { rd: 0, rr: 1, hw: 2, rw: 3, wl: 4 };
      list.sort((a, b) => (ord[a[0].kind] - ord[b[0].kind]) || (a[0].main - b[0].main) || (b[1] - a[1]));
      for (const [L, old] of list) stroke(G, L.pp, L.kind, old ? 0 : L.cert, L.main, old, year);
    }

    // ---------- little buildings stamped into the grid
    // Buildings keep a one-pixel gap from each other and from roads, so a dense region reads as scattered hamlets.
    let occ = null;
    function free(G, i, j, rows) {
      const { w, h } = G, hh = rows.length, ww = rows[0].length, x0 = i - (ww >> 1) - 1, y0 = j - hh;
      for (let y = y0; y <= j + 1; y++) for (let x = x0; x <= x0 + ww + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x]) return false;
      return true;
    }
    function stamp(G, i, j, rows, pal, force) {
      const { w, h, cls, base: B } = G, hh = rows.length, ww = rows[0].length;
      if (!force && !free(G, i, j, rows)) return false;
      for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
        const ch = rows[y][x]; if (ch === ".") continue;
        const ii = i + x - (ww >> 1), jj = j + y - hh + 1;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const q = jj * w + ii; if (cls[q] === 255 || cls[q] <= 3) continue;
        const c = pal[ch]; if (c != null) { B[q] = c; occ[q] = 1; }
      }
      return true;
    }
    const HOUSE = [".r.", "rrr", "wdw"], HUT = [".r.", "rwr"], YURT = [".w.", "wwd"];
    const CASTLE = ["s.s.s", "sssss", "sLsDs", "sLdDs"], FORT = ["w.w.w", "w...w", "wwdww"], TOWER = [".y.", ".s.", ".s.", "sDs"];
    const VILLA = ["rrrr", "wwww", "wddw"];
    function roofOf(lon, lat, year) {
      const R = global.PixelEra ? PixelEra.region(lon, lat) : "europe";
      if (R === "steppe") return year < 1900 ? "yurt" : "slate";
      if (R === "mediterranean") return "terracotta";
      if (R === "middle_east" || R === "africa") return "mud";
      if (R === "east_asia") return "tile";
      if (R === "southeast_asia" || R === "oceania") return "palm";
      if (R === "south_asia") return "red";
      if (R === "americas") return year < 1550 ? "palm" : "red";
      return year < 1650 ? "thatch" : lat > 52 ? "slate" : "red";
    }
    function village(G, i, j, lon, lat, year, n, r) {
      const roof = roofOf(lon, lat, year);
      if (roof === "yurt") { if (stamp(G, i, j, YURT, { w: C.white, d: C.stoneD }) && n > 1) stamp(G, i + 3, j + 1, YURT, { w: C.white, d: C.stoneD }, true); return; }
      const pal = { r: ROOF[roof], w: roof === "mud" ? WALLC.mud : roof === "palm" ? WALLC.wood : WALLC.light, d: C.ink };
      const S = roof === "palm" ? HUT : HOUSE;
      if (!stamp(G, i, j, S, pal)) return;
      if (n > 1) stamp(G, i + 3 + (r > 0.5 ? 1 : 0), j + 1, S, pal);
      if (n > 2) stamp(G, i + 1, j - 3, S, pal);
    }
    // Ports: a jetty from the town into the nearest water, and a moored boat.
    function port(G, i, j) {
      const { w, h, cls, base: B } = G;
      let best = null;
      for (let r = 1; r <= 4 && !best; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
        const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (cls[y * w + x] <= 2) { best = [Math.sign(dx), Math.sign(dy), r]; break; }
      }
      if (!best) return;
      const [sx, sy] = best; let x = i, y = j;
      for (let s = 0; s < best[2] + 2; s++) { x += sx; y += sy; if (x < 0 || y < 0 || x >= w || y >= h) return; const q = y * w + x; if (cls[q] === 255) return; B[q] = s % 2 ? C.pier : C.pierD; }
      const bx = x + (sy ? 2 : 0), by = y + (sx ? 2 : 0);
      if (bx > 0 && by > 1 && bx < w - 1 && by < h && cls[by * w + bx] <= 2) { B[by * w + bx] = C.hull; B[by * w + bx - 1] = C.hull; B[(by - 1) * w + bx] = C.sail; }
    }
    function wallRing(G, i, j, rad, pal) {
      const { w, h, cls, base: B } = G;
      for (let a = 0; a < 48; a++) {
        if (a % 12 === 3) continue;  // gates
        const t = a / 48 * Math.PI * 2, x = Math.round(i + Math.cos(t) * rad), y = Math.round(j - 2 + Math.sin(t) * rad * 0.8);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const q = y * w + x; if (cls[q] === 255 || cls[q] <= 3) continue;
        B[q] = a % 4 === 0 ? pal : C.stone;
      }
    }

    function places(G, year) {
      const K = G.k, D = density(year), { w, h, U0, V0, cls, lonA, latA, hash } = G;
      // Procedural hamlets where the farmland is densely peopled: one candidate per world-anchored cell.
      if (K >= 10 && D) {
        const VW = 13, VH = 9;
        const c0 = Math.floor(U0 / VW), c1 = Math.ceil((U0 + w) / VW), r0 = Math.floor(V0 / VH), r1 = Math.ceil((V0 + h) / VH) + 1;
        for (let cv = r0; cv < r1; cv++) for (let cu = c0; cu < c1; cu++) {
          const r = hash(cu * 11 + 5, cv * 3 + 9), r2 = hash(cv * 13 + 1, cu * 7 + 3);
          const i = cu * VW + Math.floor(r * (VW - 4)) + 2 - U0, j = cv * VH + Math.floor(r2 * (VH - 3)) + 2 - V0;
          if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue;
          const k = j * w + i, c = cls[k]; if (c === 255 || c <= 4 || !ARABLE[c]) continue;
          const d = densAt(D, lonA[k], latA[k]);
          const p = Math.min(0.3, Math.max(0, (d - 6) / 160)) * ARABLE[c];
          if (hash(cu, cv) > p) continue;
          village(G, i, j, lonA[k], latA[k], year, 1 + ((r * 3) | 0), r2);
        }
      }
      const rows = [];
      for (const t of last.list) for (const p of t.pts) if (p.a <= year && year <= p.b) rows.push(p);
      // Order: villages, villas, then fortifications and ports on top.
      const ORD = { v: 0, x: 1, z: 9, w: 2, f: 3, c: 4, l: 5, p: 6 };
      rows.sort((a, b) => ORD[a.kind] - ORD[b.kind] || b.lat - a.lat);
      for (const p of rows) {
        const need = p.kind === "p" ? 12 : p.kind === "v" ? 24 : p.kind === "x" || p.kind === "w" ? 36 : p.kind === "z" ? 99 : 12;
        if (K < need) continue;
        const q = G.toPixel(p.lon, p.lat); if (!q) continue;
        const [i, j] = q; if (i < 0 || j < 0 || i >= w || j >= h) continue;
        if (p.kind === "v") village(G, i, j, p.lon, p.lat, year, 2, hash(i + U0, j + V0));
        else if (p.kind === "c" || p.kind === "f") { if (!stamp(G, i, j, p.kind === "c" ? CASTLE : FORT, p.kind === "c" ? { s: C.stone, L: C.stoneL, D: C.stoneD, d: C.ink } : { w: year < 1500 && p.lat > 45 ? WALLC.wood : C.stone, d: C.ink })) continue; }
        else if (p.kind === "x") stamp(G, i, j, VILLA, { r: ROOF.terracotta, w: WALLC.light, d: C.ink });
        else if (p.kind === "l") stamp(G, i, j, TOWER, { y: C.light, s: C.white, D: C.red });
        else if (p.kind === "w") wallRing(G, i, j, K >= 14 ? 7 : 5, C.stoneL);
        else if (p.kind === "p") port(G, i, j);
      }
    }

    // Scrubbing must stay inside a frame (16 ms), so both passes are cached for the view: fields per 10-year step of
    // the population curve, roads and places per set of things standing that year. A year that changes neither just
    // replays the cached pixels.
    let last = { box: null, list: [] }, grid0 = null, view = "", underKey = "", under = null, overKey = "", over = null;
    const bucket = y => Math.floor(y / 10) * 10;
    function standing(year) {
      let h = 0;
      for (const t of last.list) {
        for (let i = 0; i < t.lines.length; i++) { const L = t.lines[i]; if (L.a <= year && year <= L.b + (L.kind === "rr" ? OLD_ROAD : 0)) h = (h * 31 + i * 2 + (year > L.b ? 1 : 0)) | 0; }
        for (let i = 0; i < t.pts.length; i++) { const p = t.pts[i]; if (p.a <= year && year <= p.b) h = (h * 17 + i) | 0; }
      }
      return h;
    }
    // phase "key": names what the under pass would draw, so the pixel map can cache it with the realm raster.
    function draw(G, phase, year, proj) {
      if (G.k < 2.5 || year == null) return;
      const B = G.base;
      if (phase === "key") return G.k < 5 ? "" : bucket(year) + ":" + loaded + ":" + !!pop + !!grid;
      if (phase === "under") {
        // A new render (zoom, pan, resize, mood) makes a new grid; a tile arriving changes what is in view.
        const v = loaded + ":" + [G.k, G.U0, G.V0, G.w, G.h].join();
        if (v !== view || B !== grid0) { view = v; grid0 = B; underKey = overKey = ""; last = inView(G); }
        projKey = proj ? proj.scale() + "," + proj.translate().join(",") : "";
        if (G.k < 5) return;
        const key = bucket(year) + ":" + last.list.length + ":" + !!pop + !!grid;
        if (key === underKey && under && under.length === B.length) { B.set(under); return; }
        fields(G, year);
        under = B.slice(); underKey = key;
        return;
      }
      const key = bucket(year) + ":" + standing(year) + ":" + last.list.length;
      if (key === overKey && over) { for (let i = 0; i < over.length; i += 2) B[over[i]] = over[i + 1]; return; }
      const before = B.slice();
      occ = new Uint8Array(G.w * G.h);
      if (proj) lines(G, year, proj);
      places(G, year);
      const diff = [];
      for (let i = 0; i < B.length; i++) if (B[i] !== before[i]) diff.push(i, B[i]);
      over = new Uint32Array(diff); overKey = key;
    }

    // Province names in view for the year, for the label engine: rank 1 from 4x, 2 from 8x, 3 from 14x, 4 from 24x.
    const RANK_K = [0, 4, 8, 14, 24];
    function names(view) {
      const out = [], seen = new Set();
      if (!view || view.k < 4) return out;
      for (const key in tiles) {
        const t = tiles[key]; if (!t.ready) continue;
        for (const n of t.names) {
          if (n.a > view.year || n.b < view.year || view.k < RANK_K[n.rank]) continue;
          if (seen.has(n.name)) continue;
          const p = view.project(n.lon, n.lat); if (!p || p[0] < -40 || p[1] < -20 || p[0] > view.W + 40 || p[1] > view.H + 20) continue;
          seen.add(n.name);
          out.push({ text: n.name, at: [n.lon, n.lat], pri: 58 - n.rank * 2, style: "province", minK: RANK_K[n.rank], size: n.rank <= 1 ? 12 : n.rank === 2 ? 11 : 10 });
        }
      }
      return out;
    }

    return { draw, names, get ready() { return !!(pop && grid); } };
  }
  global.PixelDetail = PixelDetail;
})(typeof window !== "undefined" ? window : globalThis);
