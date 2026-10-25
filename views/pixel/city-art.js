// City art for the pixel map's city layer (city.js): buildings, walls, streets and built-up texture drawn in the
// building tradition of the place and year (PixelEra.culture). Loaded right after city.js; replaces entries of
// PixelCity.ART and sizes PixelCity.STAMPS so the layer's spacing check matches the art.
//
//   ART[kind](put, i, j, f, year)                 a building, bottom centre on (i, j)
//   ART["line:" + kind](put, i, j, f, year, n, o)  walls, roads, canals and chains, per pixel along the line
//   ART["area:extent"](put, i, j, u, v, f, year, sparse)   roofs and lanes of the built-up area, per pixel
//
// Stamps are fills only; bake() adds the ink outline (as the sprite library does), so every building reads on a busy
// roofscape. Keys: see COL. A building is about one city block at full zoom: icons, not to scale.
(function (global) {
  const PC = global.PixelCity;
  if (!PC) return;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = s => { const [r, g, b] = hex(s); return (255 << 24 | b << 16 | g << 8 | r) >>> 0; };
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const COL = {
    k: "#221f1a", l: "#ece4d2", s: "#c8bfae", S: "#8a8070",   // ink, limestone light, stone, stone shade
    r: "#b8583a", R: "#7e3a26", q: "#5a6270", Q: "#3e4450",   // terracotta and its shade, slate and its shade
    g: "#e0b040", e: "#8c96a0", E: "#586068",                 // gold, lead (Ottoman domes, spires), lead shade
    c: "#4aa0a0", C: "#2e6e74", w: "#f2eee4", W: "#cfc6b4",   // turquoise tile, white plaster
    t: "#d8bc8c", T: "#a88a5c", n: "#8a5a32", N: "#5e3a1e",   // mudbrick, wood
    p: "#5a8a4a", y: "#6a7480", Y: "#48505a", o: "#c86e4a",   // garden, grey roof tile, red sandstone
    O: "#8e4630", b: "#3a6a9a",                               // sandstone shade, banner blue
  };
  const PK = {}; for (const ch in COL) PK[ch] = P(COL[ch]);

  // Pad by one pixel and ink every empty pixel that touches a filled one.
  function bake(rows) {
    const h = rows.length + 2, w = rows[0].length + 2;
    const g = [".".repeat(w)].concat(rows.map(r => "." + r + "."), [".".repeat(w)]);
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== ".";
    return g.map((row, y) => [...row].map((ch, x) => ch !== "." ? ch : solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ? "k" : ".").join(""));
  }

  // ------------------------------------------------------------------ buildings, by tradition
  const ST = {
    // Churches: a Byzantine dome over a cross plan, a Romanesque basilica with its bell tower, a Gothic spire.
    church_byz: ["....g....", "...eee...", "..eeeeE..", ".lleeeEE.", "lllllllSS", "lnllnllnS", "lllllllSS", "lnnllnnSS"],
    church_rom: [".r.......", "rrR......", "lsS..rrR.", "lsSrrrrRR", "lsSlslslS", "lnSlnlnlS", "lsSlslslS"],
    church_got: ["..g.......", "..q.......", ".qqQ......", ".qqQ......", ".lsS......", ".lsSqqqqQ.", ".lsqqqqqQQ", ".lsSlslslS", ".lnSlnlnlS", ".lsSlslslS"],
    // Mosques: Ottoman lead domes and pencil minarets, a Persian turquoise dome and iwan, an Arab white dome, Mughal.
    mosque_ott: ["l.........l", "l....g....l", "l...eee...l", "l..eeeeE..l", "l.eeeeeEE.l", "lsseeeeeESl", "lllllllllSl", "lnllnllnlSl", "lllllllllSl"],
    mosque_per: ["....g.....", "...ccC....", "..cccCC...", "..cccCC.tt", ".ttttttT.t", "ttcccttTTt", "ttcnnttTTt", "tttttttTTt"],
    mosque_arab: ["t.....g...", "t....wwW..", "tT..wwwwW.", "tT.wwwwwWW", "tTtttttttT", "tTtnttnttT", "tTtttttttT"],
    mosque_mug: ["w....g....w", "w...www...w", "w..wwwwW..w", "w.wwwwwWW.w", "w.ooooooO.w", "woooooooooO", "wonoonoonoO", "woooooooooO"],
    // Temples: classical (Greek and Roman), East Asian hall and pagoda, a Hindu spire, a Mesoamerican pyramid.
    temple_cls: ["....l....", "..lllll..", ".lllllllS", "SSSSSSSSS", "l.l.l.l.l", "l.l.l.l.l", "lllllllll", "SSSSSSSSS"],
    temple_eas: ["...g...", "y.yyy.y", "yyyyyyy", ".rwwwr.", "y.....y", "yyyyyyy", ".YyyyY.", ".rwnwr.", "lllllll"],
    temple_sas: ["...g...", "..ooO..", "..ooO..", ".oooOO.", ".OOOOO.", "ooooOOO", "oonnoOO", "OOOOOOO"],
    temple_meso: ["...rR...", "...nn...", "..lllS..", "..SSSS..", ".lllllS.", ".SSSSSS.", "llllllSS", "SSSSSSSS"],
    // Palaces.
    palace_eur: [".r.......r.", "rrR.....rrR", "lsSrrrrrlsS", "lsSrrrrRlsS", "lnSlnlnlnnS", "lsSlslslslS"],
    palace_isl: ["..c.....c..", ".cCw...wcC.", ".wWw...wWw.", "tttttttttTT", "tnntnntnnTT", "tttttttttTT", "pp.......pp"],
    palace_eas: ["g.........g", "yyyyyyyyyyy", ".YyyyyyyyY.", "..r.r.r.r..", "y.r.r.r.r.y", "yyyyyyyyyyy", ".YyyyyyyyY.", "..rnrnrnr..", "lllllllllll"],
    palace_sas: ["..w.....w..", ".wwW...wwW.", ".oOo...oOo.", "ooooooooooO", "onnoonoonnO", "ooooooooooO"],
    palace_meso: ["...........", "wwwwwwwwwwW", "wnwwnwwnwwW", "wwwwwwwwwwW", "SSSSSSSSSSS"],
    // Defences and works.
    fort: ["s.s...s.s", "sSs.s.sSs", "sSsssssSs", "sSsnnnsSs", "SSSSSSSSS"],
    tower: ["s.s", "sss", "sSs", "sSs", "sns", "sSs"],
    gate: ["l.l.l.l.l", "lsSlllssS", "lsSlslsSS", "lsSsnnsSS", "lsSnnnnSS"],
    gate_eas: ["y.......y", "yyyyyyyyy", ".YyyyyyY.", "..rwrwr..", "sssssssss", "sssnnnsss", "ssnnnnnss"],
    column: [".g.", ".l.", ".s.", ".s.", ".s.", ".s.", "lsS"],
    aqueduct: ["lllllllll", "lSlSlSlSl", "l.l.l.l.l", "l.l.l.l.l"],
    forum: ["l.l.l.l.l", "lllllllll", "wwwwwwwww", "wWwwWwwWw"],
    market: ["rwrwr.cwcwc", "rwrwR.cwcwC", "n...n.n...n"],
    tomb_med: ["..g..", ".lll.", "lllsS", "lnlsS", "lllSS"],
    tomb_isl: ["...g...", "..ccC..", ".cccCC.", ".tttTT.", ".tnnTT.", ".tttTT."],
    tomb_mug: ["w...g...w", "w..www..w", "w.wwwwW.w", "w.wwwwW.w", "wwwwwwwWw", "wwwnnwwWw", "lllllllll"],
    tomb_eas: ["..p..", ".ppp.", "ppppP", "sssss"],
    harbour: ["nnnnnnn", "n.n.n.n"],
    school_isl: ["...c...", "..cCC..", "ttttttT", "tnppntT", "ttttttT"],
    school_eur: [".q...", "qqQ..", "lsSrR", "lnSrR", "lsSlS"],
    house_med: [".rR.", "rrRR", "lnsS"],
    house_eur: [".qQ.", "qqQQ", "lnsS"],
    house_isl: ["tttT", "tnpT", "tttT"],
    house_eas: ["y..y", "yyyy", "rwwr"],
    house_sas: ["w..w", "oooO", "onoO"],
    house_meso: ["wwwW", "wnwW"],
    bridge: ["lllllll", "S.S.S.S"],
  };
  const BAKED = {}; for (const n in ST) BAKED[n] = bake(ST[n]);

  // Tradition of a place in a year, from PixelEra.culture: west, med, byz, ott, isl, per, eas, sas, meso.
  function style(lon, lat, year) {
    const c = global.PixelEra ? PixelEra.culture(lon, lat, year) : "europe";
    if (c === "islamic" || c === "near_east" || c === "sahel") {
      if (c === "islamic" && lat > 36 && lat < 43 && lon > 19 && lon < 45 && year >= 1300) return "ott";
      if (c === "islamic" && lon >= 44) return "per";
      return year < 650 && c === "near_east" ? "near" : "isl";
    }
    if (c === "east_asia" || c === "southeast_asia" || c === "steppe") return "eas";
    if (c === "south_asia" || c === "deccan") return "sas";
    if (c === "meso" || c === "andes") return "meso";
    if (c === "mediterranean" && lon > 19 && year >= 330 && year < 1453) return "byz";
    return lat >= 45 ? "west" : "med";
  }
  const PICK = {
    church: { byz: "church_byz", ott: "church_byz", west: st => st.y >= 1150 ? "church_got" : "church_rom", med: st => st.y >= 1200 && st.lat > 43 ? "church_got" : "church_rom", _: "church_rom" },
    mosque: { ott: "mosque_ott", per: "mosque_per", sas: "mosque_mug", _: "mosque_arab" },
    temple: { eas: "temple_eas", sas: "temple_sas", meso: "temple_meso", _: "temple_cls" },
    palace: { eas: "palace_eas", isl: "palace_isl", ott: "palace_isl", per: "palace_isl", sas: "palace_sas", meso: "palace_meso", _: "palace_eur" },
    tomb: { isl: "tomb_isl", ott: "tomb_isl", per: "tomb_isl", sas: "tomb_mug", eas: "tomb_eas", _: "tomb_med" },
    school: { isl: "school_isl", ott: "school_isl", per: "school_isl", _: "school_eur" },
    house: { west: "house_eur", isl: "house_isl", ott: "house_isl", per: "house_isl", near: "house_isl", eas: "house_eas", sas: "house_sas", meso: "house_meso", _: "house_med" },
    gate: { eas: "gate_eas", _: "gate" },
    fort: { _: "fort" }, tower: { _: "tower" }, column: { _: "column" }, aqueduct: { _: "aqueduct" }, forum: { _: "forum" },
    market: { _: "market" }, harbour: { _: "harbour" }, bridge: { _: "bridge" },
  };
  // Walls of mudbrick in the Islamic world and the Near East, grey brick in China, red sandstone in India; the
  // Byzantine land walls in courses of limestone and brick.
  const WALL = {
    _: [PK.l, PK.S, PK.s], isl: [PK.t, PK.T, PK.t], near: [PK.t, PK.T, PK.t], per: [PK.t, PK.T, PK.t],
    eas: [P("#a8a49a"), P("#5e5c56"), P("#c8c4b8")], sas: [PK.o, PK.O, P("#d88a62")], meso: [PK.w, PK.W, PK.w],
  };

  function stampAt(put, i, j, rows) {
    const hh = rows.length, ww = rows[0].length, x0 = i - (ww >> 1), y0 = j - hh + 2;
    for (let y = 0; y < hh; y++) { const row = rows[y]; for (let x = 0; x < ww; x++) { const ch = row[x]; if (ch !== ".") put(x0 + x, y0 + y, PK[ch]); } }
  }
  const sOf = (f, year) => { const a = f.at || (f.line && f.line[0]) || (f.area && f.area[0]) || [0, 0]; return { s: style(a[0], a[1], year), y: year, lat: a[1] }; };
  function chooser(kind) {
    const m = PICK[kind];
    return (put, i, j, f, year) => {
      const st = sOf(f, year); let n = m[st.s] || m._;
      if (typeof n === "function") n = n(st);
      stampAt(put, i, j, BAKED[n]);
    };
  }
  for (const kind in PICK) {
    PC.ART[kind] = chooser(kind);
    // The spacing check reads the stamp's size: give it the largest variant.
    let ww = 0, hh = 0;
    for (const s in PICK[kind]) { const n = PICK[kind][s]; for (const name of typeof n === "function" ? ["church_got", "church_rom", "church_byz"] : [n]) { ww = Math.max(ww, BAKED[name][0].length); hh = Math.max(hh, BAKED[name].length - 1); } }
    PC.STAMPS[kind] = Array.from({ length: hh }, () => ".".repeat(ww));
  }

  // ------------------------------------------------------------------ lines
  PC.ART["line:wall"] = (put, i, j, f, year, n, o) => {
    const st = sOf(f, year).s, [top, shade, lit] = WALL[st] || WALL._;
    if (o.faint) { if (n & 1) put(i, j, lit); return; }
    // Byzantine courses: a band of brick every few stones.
    put(i, j, st === "byz" && n % 5 === 0 ? PK.r : top); put(i, j + 1, shade);
    if (o.k >= 180 && n % 2 === 0) put(i, j - 1, top);                        // crenels
    if (o.k >= 260 && n % 11 === 0) {                                         // towers
      put(i - 1, j - 2, lit); put(i, j - 2, lit); put(i + 1, j - 2, top);
      put(i - 1, j - 1, lit); put(i + 1, j - 1, shade); put(i - 1, j, top); put(i + 1, j, shade);
      put(i - 1, j + 1, shade); put(i + 1, j + 1, shade); put(i, j + 2, PK.k);
    }
  };
  PC.ART["line:road"] = (put, i, j, f, year, n) => {
    if ((f.conf || 0) >= 2 && n % 4 === 3) return;
    put(i, j, P("#efe4c4")); put(i, j + 1, P("#c8b48c"));
  };
  PC.ART["line:canal"] = (put, i, j, f, year, n) => { put(i, j, P("#4e8a98")); if (n % 7 === 0) put(i, j, P("#7ab0bc")); put(i, j + 1, P("#c8b48c")); };
  PC.ART["line:chain"] = (put, i, j, f, year, n) => { if (n % 3 !== 2) put(i, j, n % 3 ? P("#4a4038") : P("#221f1a")); if (n % 12 === 0) { put(i, j - 1, PK.n); put(i + 1, j - 1, PK.N); } };

  // ------------------------------------------------------------------ built-up texture
  // Blocks of houses on a staggered world-anchored grid (no lattice: each block row is offset and widths vary), each
  // lit on its upper edge and shaded below, split into two or three houses, with lanes between and the odd courtyard,
  // garden or square. Roofs follow the tradition: terracotta, slate and red in the north, flat mudbrick with
  // courtyards in the Islamic world, grey tile in East Asia, plaster and gardens in Mesoamerica.
  const ROOFS = {
    med: [P("#b8704e"), P("#a86048"), P("#d49272"), P("#7e4a36")], byz: [P("#b8745a"), P("#c8a888"), P("#dcaa8a"), P("#80503c")],
    west: [P("#a85a40"), P("#6a707a"), P("#c07050"), P("#4e5058")],
    isl: [P("#e0cca4"), P("#d4bc90"), P("#ece0c4"), P("#a88a62")], near: [P("#d8c098"), P("#ccb088"), P("#e6d6b4"), P("#a08460")],
    ott: [P("#b8745a"), P("#d4c0a0"), P("#dc9a7c"), P("#84583e")], per: [P("#dcc8a0"), P("#ceb48c"), P("#eadcc0"), P("#a48662")],
    eas: [P("#7a8290"), P("#6a7280"), P("#9aa2ac"), P("#4a505c")], sas: [P("#d8a878"), P("#ece4d4"), P("#e6c4a0"), P("#a07050")],
    meso: [P("#ece6d8"), P("#e0d8c6"), P("#f6f2e8"), P("#b4aa96")],
  };
  const LANE = { _: P("#e8dcbc"), isl: P("#ecdcb4"), near: P("#ecdcb4"), per: P("#ecdcb4"), eas: P("#d6d0c2"), meso: P("#d8e0c8") };
  const GREEN = P("#6a9a52"), GREEND = P("#4a7a3e"), SQUARE = P("#f2e8cc"), COURT = P("#8a7656");
  PC.ART["area:extent"] = (put, i, j, u, v, f, year, sparse) => {
    if (f._cy !== year) { f._cy = year; f._cs = sOf(f, year).s; }
    const s = f._cs, R = ROOFS[s] || ROOFS.med, lane = LANE[s] || LANE._;
    // Districts 23 px wide shift their block rows, so cross streets meet in T-junctions instead of a grid.
    const bh = 5, vv = v + ((hash(Math.floor(u / 23), 9) * 5) | 0), r = Math.floor(vv / bh), lv = vv - r * bh;
    const bw = 5 + ((hash(r, 5) * 3) | 0), uu = u + ((hash(r, 17) * 11) | 0), c = Math.floor(uu / bw), lu = uu - c * bw;
    if (lv === 0) return put(i, j, lane);
    // About a third of the alleys between blocks are built over, so blocks run on irregularly.
    if (lu === 0 && hash(c, r * 5 + 1) > 0.3) return put(i, j, lane);
    const hb = hash(c * 3 + 1, r * 7 + 2);
    if (sparse && hb > 0.7) return;
    if (hb < 0.045) return put(i, j, (u + v) % 3 ? GREEN : GREEND);                          // garden
    if (hb < 0.07) return put(i, j, SQUARE);                                                 // square
    const flat = s === "isl" || s === "near" || s === "per" || s === "meso" || s === "sas";
    if (flat && lv === 2 && lu === 2 && hb < 0.55) return put(i, j, COURT);                  // courtyard
    const split = 1 + ((hash(c, r * 3) * (bw - 1)) | 0), house = lu < split ? 0 : 1;
    const tone = (hash(c * 2 + house, r * 11) * 3) | 0;                                     // three roof tones
    if (lv === 1) return put(i, j, flat ? R[2] : R[tone === 2 ? 0 : 2]);                     // lit upper edge
    if (lv === bh - 1) return put(i, j, R[3]);                                              // shaded lower edge
    if (!flat && lu === split && lv === 2) return put(i, j, R[3]);                          // a gable between houses
    put(i, j, s === "eas" && lv === 3 ? R[3] : R[tone === 2 ? 1 : tone]);
  };
  // A quarter is drawn like the built-up area around it.
  PC.ART["area:district"] = PC.ART["area:extent"];
  // Water that is land today (Lake Texcoco, a filled harbour): the map's quiet sea tones, a sparse ripple, no hatching.
  const LAKE = [P("#4e7e94"), P("#5a8aa0"), P("#7aa6b8")];
  const NW = global.PixelTerrainArt ? PixelTerrainArt.noiseTile(23, 13, 4, 57) : (u, v) => hash(u >> 3, v >> 2);
  PC.ART["area:water"] = (put, i, j, u, v) => {
    const n = NW(u, v);
    put(i, j, (v % 6 === 0 && (u + (v >> 1)) % 9 < 2 && n < 0.5) ? LAKE[2] : LAKE[n < 0.5 ? 0 : 1]);
  };
  PC.ART.style = style;
})(typeof window !== "undefined" ? window : globalThis);
