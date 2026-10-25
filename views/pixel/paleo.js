// Ice-age world for the pixel map: sea level, ice sheets and glacial biomes for any year back to 300,000 years ago.
//
//   const P = PixelPaleo({ files: () => ({sea, ice, curve, slices}), onReady })
//   P.at(year)            -> null when the world looks as it does today, else {key, sea, ice, glacial, green, cls}
//                            (pass it to pm.setPaleo; key changes only when the picture would change)
//   P.sea(year)           sea level in metres relative to today (Lambeck 2014 for the last 29 ka, Spratt & Lisiecki 2016 before)
//   P.iceAt(lon, lat, y)  is this point under an ice sheet in that year
//   P.landAt(lon, lat, y) is this point dry land (today's land or exposed shelf, not ice-covered sea)
//
// Rasters (ingest/deep-time/paleo.py), equirectangular, row 0 = 90N: paleo-sea.png (0 land, else depth in m, 255 deeper),
// paleo-ice.png (R, G: one bit per dated ice-sheet slice; B: deglaciation rank inside the LGM ice).
(function (global) {
  const DEEP = -5500;  // after this the sea is within a few metres of today: draw today's world
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // Green Sahara periods (ka before present): the African Humid Period and older insolation peaks (Larrasoaña et al. 2013).
  const GREEN = [[5.5, 14.5], [76, 84], [96, 104], [120, 130], [172, 180], [194, 202], [214, 222], [238, 246]];

  function PixelPaleo(opts) {
    let st = 0, W = 0, H = 0, cell = 0, SEA = null, BITS = null, RANK = null, SHEET = null, curve = null, slices = null, sheets = null, retreat = null;
    const ka = y => (1950 - y) / 1000;
    function interp(k) {
      if (!curve) return 0;
      if (k <= curve[0][0]) return curve[0][1];
      for (let i = 1; i < curve.length; i++) if (k <= curve[i][0]) { const [a, va] = curve[i - 1], [b, vb] = curve[i]; return va + (vb - va) * (k - a) / (b - a || 1); }
      return curve[curve.length - 1][1];
    }
    function decode(url) {
      return new Promise((ok, bad) => {
        const img = new Image();
        img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); ok(x.getImageData(0, 0, c.width, c.height)); };
        img.onerror = bad; img.src = url;
      });
    }
    function load() {
      if (st) return; const f = opts.files && opts.files(); if (!f || !f.sea || !f.ice) return;
      st = 1; curve = f.curve; slices = f.slices || []; sheets = f.sheets || []; retreat = f.retreat || {};
      Promise.all([decode(f.sea), decode(f.ice)]).then(([a, b]) => {
        W = a.width; H = a.height; cell = 360 / W;
        const n = W * H; SEA = new Uint8Array(n); BITS = new Uint16Array(n); RANK = new Uint8Array(n); SHEET = new Uint8Array(n);
        for (let i = 0, o = 0; i < n; i++, o += 4) { SEA[i] = a.data[o]; BITS[i] = b.data[o] | ((b.data[o + 1] & 15) << 8); SHEET[i] = b.data[o + 1] >> 4; RANK[i] = b.data[o + 2]; }
        st = 2; if (opts.onReady) opts.onReady();
      }).catch(err => { console.error("paleo rasters", err); st = 3; });
    }
    const idx = (lon, lat) => Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / cell))) * W + Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / cell)));

    // Which ice the year shows: the dated slice nearest in time (Batchelor et al. 2019) while the sea is low; after 19 ka
    // each LGM ice sheet shrinks toward its centre on its own timetable (share of its area left, by ka); today's ice
    // alone in warm spells (sea above -40 m).
    const share = (pts, k) => { if (!pts) return 0; if (k <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (k - a) / (b - a); } return pts[pts.length - 1][1]; };
    function iceRule(k, sea) {
      if (k < 19) {
        const thr = sheets.map(n => { const a = Math.round(share(retreat[n], k) * 64) / 64; return a <= 0 ? 255 : Math.round(254 * (1 - a)); });
        return thr.every(t => t === 255) ? null : { thr, key: thr.join(".") };
      }
      if (sea > -40 || !slices || !slices.length) return null;
      let best = 0; for (let i = 1; i < slices.length; i++) if (Math.abs(slices[i].ka - k) < Math.abs(slices[best].ka - k)) best = i;
      return { bit: 1 << best, label: slices[best].label, ka: slices[best].ka };
    }
    const iceOf = (i, rule) => !!rule && (rule.thr ? RANK[i] > 0 && RANK[i] >= Math.max(1, rule.thr[SHEET[i]]) : (BITS[i] & rule.bit) !== 0);

    function at(y) {
      if (y >= DEEP || !opts.files) return null;
      if (st < 2) { load(); return null; }
      const k = ka(y), sea = Math.round(interp(k) / 2) * 2, rule = iceRule(k, sea);
      // How glacial the climate is: 0 in warm spells, 1 at a glacial maximum.
      const g = Math.round(Math.max(0, Math.min(1, (-sea - 25) / 95)) * 20) / 20;
      const green = GREEN.some(([a, b]) => k >= a && k <= b);
      const tl = 71 - 23 * g, sl = tl - 16 * g;  // tundra line and the edge of the mammoth steppe (absolute latitude)
      const key = [sea, rule ? (rule.key || "b" + rule.bit) : "-", g, green ? 1 : 0].join();
      return {
        key, sea, ice: rule, glacial: g, green, year: y,
        cls(lon, lat, c, isLand, band, u, v) {
          const i = idx(lon, lat), d = SEA[i], al = Math.abs(lat), r = hash(u >> 1, v >> 1) - 0.5;
          if (iceOf(i, rule)) return 5;
          if (!isLand && c <= 2 && d > 0) {
            if (d < -sea) {
              // Dry shelf: tundra by the ice, mammoth steppe south of it, grass and forest toward the tropics.
              if (al > tl + r * 3) return 6;
              if (al > sl + r * 4 || (al > 30 && g > 0.3)) return 11;
              if (al < 12) return r < 0.1 ? 9 : 11;
              return 10;
            }
            return d < -sea + 70 ? 2 : c;
          }
          if (c < 6 || c === 15 || c === 16 || c === 17) return c;
          // Glacial biomes on today's land: forests give way to tundra and steppe; rainforest breaks into savanna.
          if (g > 0) {
            if (al > tl + r * 3 && c <= 11) return 6;
            if (al > sl + r * 4 && (c === 7 || c === 8)) return 11;
            if (c === 9 && g > 0.5 && hash(u >> 2, v >> 2) < 0.4 * g) return 11;
          }
          // Green Sahara: grass and savanna over the desert; Lake Mega-Chad fills the basin below about 330 m.
          if (green && (c === 12 || c === 13) && lat > 10 && lat < 33 && lon > -18 && lon < 40) {
            if (lon > 12 && lon < 24 && lat < 19.5 && band <= 13 && k < 12 && k > 5.5) return 3;
            return lat < 21 + r * 3 ? 10 : 11;
          }
          return c;
        },
      };
    }
    return {
      at, sea: y => interp(ka(y)), ready: () => st === 2, load,
      iceAt(lon, lat, y) { if (st < 2 || y >= DEEP) return false; const k = ka(y); return iceOf(idx(lon, lat), iceRule(k, Math.round(interp(k) / 2) * 2)); },
      landAt(lon, lat, y) { if (st < 2) return null; const d = SEA[idx(lon, lat)]; return d === 0 || (y < DEEP && d < -interp(ka(y))); },
      slices: () => slices,
    };
  }
  global.PixelPaleo = PixelPaleo;
})(typeof window !== "undefined" ? window : globalThis);
