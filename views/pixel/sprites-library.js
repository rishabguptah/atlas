// Pixel sprite library: era- and region-aware sprites for the pixel map. Format and palette: SPEC.md, palette.js.
// One character per pixel, "." transparent, keys from PIXEL_PALETTE.KEYS, "x"/"X" = team colour and its shade.
// Every sprite carries kind, label, era [from, to] (negative = BC) and regions; pick(kind, year, region) chooses one.
//
// Authoring: grids below are fills only. def() pads one pixel all round and bakes the dark outline ("k") onto
// every transparent pixel that touches a filled one, so the stored frames are final SPEC.md grids. Digits are
// "bare" pixels (spear shafts, smoke, sparks) that get no outline; meta.map says which palette key each digit is.
(function (global) {
  const S = {};
  const ANY = ["any"];

  function bake(frame, map, outline) {
    const h = frame.length + 2, w = frame[0].length + 2;
    const g = [".".repeat(w)].concat(frame.map((r) => "." + r + "."), [".".repeat(w)]).map((r) => r.split(""));
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== "." && !/[0-9]/.test(g[y][x]);
    const out = g.map((r) => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = g[y][x];
      if (/[0-9]/.test(c)) out[y][x] = map[c];
      else if (c === "." && outline && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out[y][x] = "k";
    }
    return out.map((r) => r.join(""));
  }

  // def: w, h come from the rows; the anchor (in authoring coordinates) defaults to bottom centre.
  function def(name, meta, frames) {
    const map = meta.map || {}, outline = meta.outline !== false;
    const baked = frames.map((f) => bake(f, map, outline));
    const h = baked[0].length, w = baked[0][0].length;
    const ax = meta.ax == null ? w >> 1 : meta.ax + 1, ay = meta.ay == null ? h - 1 : meta.ay + 1;
    const m = Object.assign({ regions: ANY, fps: 3 }, meta);
    delete m.map; delete m.outline;
    S[name] = Object.assign(m, { w, h, ax, ay, frames: baked });
  }
  // edit: copy a frame and replace rows by index, so animation frames only list what moves.
  function edit(frame, rows) {
    return frame.map((r, i) => (i in rows ? rows[i] : r));
  }

  // over: paste a layer onto a copy of base at (dx, dy); "." in the layer keeps the base pixel.
  function over(base, layer, dx, dy) {
    const out = base.map((r) => r.split(""));
    layer.forEach((r, y) => r.split("").forEach((c, x) => {
      if (c !== "." && out[y + dy] && x + dx < out[0].length && x + dx >= 0) out[y + dy][x + dx] = c;
    }));
    return out.map((r) => r.join(""));
  }
  function blank(w, h) { return Array.from({ length: h }, () => ".".repeat(w)); }
  // recolour: swap keys, e.g. { n: "x", N: "X" } turns a bay horse into a caparisoned one.
  function recolour(frame, swap) { return frame.map((r) => r.replace(/./g, (c) => (c in swap ? swap[c] : c))); }

  // bob: shift a frame down one pixel (its last row must be empty), for ships riding the swell.
  function bob(frame) { return [".".repeat(frame[0].length)].concat(frame.slice(0, -1)); }

  // A horse facing right, 16 x 10, and its second walking pose. Riders, carts and chariots are pasted onto it.
  const HORSE = [
    "..........NN....",
    ".........Nnnnn..",
    "........Nnnknnnn",
    "........Nnnn..nN",
    "NN.nnnnnnnnn....",
    "N.nnnnnnnnnn....",
    "N..NnnnnnnNN....",
    "...n.n...n.n....",
    "...n.n...n.n....",
    "...N.N...N.N....",
  ];
  const HORSE_STEP = edit(HORSE, { 7: "...n..n.n...n...", 8: "..n...n.n....n..", 9: "..N....NN....N.." });

  // ---------------------------------------------------------------- armies (face right, anchor = feet)
  const hoplite = [
    "...xxx.....2",
    "..xxXXx....2",
    "..ggggGG...1",
    ".gggggGGG..1",
    ".gkkgkGGG..1",
    ".ggkkGGGG..1",
    "..GgggGG..s1",
    ".ggggg.xxss1",
    "gxxxxXgxXX.1",
    "gxxxXXgxXX.1",
    "gxxXXXgxXX.1",
    "gXXXXXgss..1",
    ".gGGGg.ss..1",
    "...gg..gg...",
  ];
  def("army_hoplite", { kind: "army", label: "Hoplite phalanx", era: [-750, -150], regions: ["mediterranean"], map: { 1: "G", 2: "g" } },
    [hoplite, edit(hoplite, { 12: ".gGGGg.ss..1", 13: "..gg....gg.." })]);

  const legion = [
    "...xxxx....2",
    "..mmmmmM...2",
    ".mmmmmmMM..1",
    ".mmsssMMM..1",
    ".mmskssMM..1",
    ".mMsssMMM..1",
    "..MmmmM...s1",
    "xxxxxxxmmMs1",
    "xxxxxXXmMM.1",
    "xxXmXXXmMM.1",
    "xxxxxXXxxX.1",
    "xxxxxXXss..1",
    "XXXXXXX.ss.1",
    "...MM...MM..",
  ];
  def("army_legion", { kind: "army", label: "Roman legion", era: [-300, 450], regions: ["mediterranean", "europe"], map: { 1: "M", 2: "m" } },
    [legion, edit(legion, { 12: "XXXXXXX.ss.1", 13: "..MM....MM.." })]);

  // Knight: caparisoned horse in the team colour, steel chanfron, raised lance with a pennant.
  const knightRider = [
    "...........xx..",
    "...........1Xxx",
    "....mm.....1...",
    "...mmmM....1...",
    "...mkkM....1...",
    "...mmMM....1...",
    "..xxxXXmmmm1...",
    "..xxXXX....1...",
    "...xXX.........",
  ];
  const chanfron = ["..........mm....", ".........mmmmm..", ".........mmkmmmm", ".........mmm..mM"];
  const barded = (h, legs) => over(over(recolour(h, { n: "x", N: "X" }), chanfron, 0, 0), legs, 0, 7);
  const knightA = over(over(blank(16, 14), barded(HORSE, ["...w.w...w.w....", "...w.w...w.w....", "...M.M...M.M...."]), 0, 4), knightRider, 1, 0);
  const knightB = over(over(blank(16, 14), barded(HORSE_STEP, ["...w..w.w...w...", "..w...w.w....w..", "..M....MM....M.."]), 0, 4),
    edit(knightRider, { 0: "...........x...", 1: "...........1xXx" }), 1, 0);
  def("army_knight", { kind: "army", label: "Mounted knights", era: [950, 1500], regions: ["europe", "middle_east"], map: { 1: "w" } },
    [knightA, knightB]);

  // Horse archer: bay steppe horse, fur hat, composite bow drawn forward.
  const archer = [
    "...NN....",
    "..NNNN.1.",
    "..ssks..1",
    ".xxssssx1",
    ".xxxX...1",
    ".xXXX..1.",
    "..xX.....",
  ];
  def("army_horse_archer", { kind: "army", label: "Horse archers", era: [-900, 1700], regions: ["steppe", "middle_east", "east_asia"], map: { 1: "N" }, fps: 4 },
    [over(over(blank(16, 14), HORSE, 0, 4), archer, 1, 0), over(over(blank(16, 14), HORSE_STEP, 0, 4), archer, 1, 1)]);

  const musket = [
    "..........2.",
    "..kkkkk...2.",
    ".kkkkkkk..1.",
    "..ssssk...1.",
    "..ssks....1.",
    "..sssss...1.",
    ".xxwwxxx.s1.",
    "xxxwwxxxxs1.",
    "xxwxxwxxX.1.",
    "xwxxxxwXX.1.",
    "xxxxxxxXX.1.",
    ".wwwwwww..1.",
    "..ww..ww....",
    "..kk..kk....",
  ];
  def("army_musket", { kind: "army", label: "Musket line", era: [1600, 1860], regions: ANY, map: { 1: "n", 2: "w" } },
    [musket, edit(musket, { 12: "..ww...ww...", 13: "..kk...kk..." })]);

  const rifleman = [
    "..........2.",
    "...MMMM...2.",
    ".MMMMMMMM.1.",
    "..sssss...1.",
    "..ssks....1.",
    "..sssss...1.",
    "nnxxxxxx.s1.",
    "nnxxxxxxxs1.",
    "nnxxxXxxX.1.",
    "nnxxxxxXX.1.",
    ".xxxxxxXX.1.",
    "..xxxXXX..1.",
    "..xX..xX....",
    "..nn..nn....",
  ];
  def("army_rifleman", { kind: "army", label: "Rifle infantry", era: [1855, 1950], regions: ANY, map: { 1: "n", 2: "M" } },
    [rifleman, edit(rifleman, { 12: "..xX...xX...", 13: "..nn...nn..." })]);

  const cannon = [
    "x1..................",
    "xx1.................",
    "..1.................",
    "..1..gggggggggg.....",
    "..1.ggggggggggg.....",
    "..1.GGGGGGGGGGG.....",
    "....nn.nnn..........",
    "...nn.nGnGn.........",
    "..nn..nnGnn.........",
    ".nn...nGnGn.........",
    ".......nnn..........",
  ];
  def("army_cannon", { kind: "army", label: "Artillery", era: [1350, 1900], regions: ANY, ax: 7, ay: 10, map: { 1: "n", 3: "w", 4: "w" }, fps: 4 },
    [cannon,
     edit(cannon, { 3: "..1..gggggggggg4....", 4: "..1.ggggggggggg44...", 5: "..1.GGGGGGGGGGG4...." }),
     edit(cannon, { 2: "..1............3.3..", 3: "..1..gggggggggg33333", 4: "..1.ggggggggggg.3333", 5: "..1.GGGGGGGGGGG..3.." }),
     edit(cannon, { 1: "xx1.............3.3.", 2: "..1.............333.", 3: "..1..gggggggggg...3." })]);

  const tank = [
    "....................",
    ".....xxxxx..........",
    "...xxxxxxxXMMMMMMMM.",
    "...xXXXXXXX.........",
    ".xxxxxxxxxxxxxx.....",
    "xxxxxxxxxxxxxxxX....",
    "XXXXXXXXXXXXXXXX....",
    "MMMMMMMMMMMMMMMM....",
    "MmMMmMMmMMmMMmMM....",
    ".MMMMMMMMMMMMMM.....",
  ];
  def("army_tank", { kind: "army", label: "Armour", era: [1916, 2100], regions: ANY, ax: 8, fps: 4 },
    [tank, edit(tank, { 8: "MMmMMmMMmMMmMMmM...." })]);

  const elephant = [
    ".....xxxxx......",
    ".....x...x......",
    ".....xxsxx......",
    "....mmmmmmmm....",
    "..mmmmmmmmmmmm..",
    ".mmmmmmmmmmMmmm.",
    "mmmmmmmmmmMMmkm.",
    "mmmmmmmmmmMMmmmm",
    "MmmmmmmmmmMMmwmm",
    ".MmmmmmmmmmM.wMm",
    "..mm.mm.mM.mM.Mm",
    "..mM.mM.mM.mM..m",
  ];
  def("army_elephant", { kind: "army", label: "War elephants", era: [-500, 1750], regions: ["south_asia", "southeast_asia"], ax: 7 },
    [elephant, edit(elephant, { 9: ".MmmmmmmmmmM.wmM", 10: "..mm.mm.mM.mM.m.", 11: "..mM.mM.mM.mM.m." })]);

  const samurai = [
    "...g...g....",
    "....g.g.....",
    "..xxxxxx....",
    ".xxxxxxxX...",
    "..sssssX....",
    "..sksss....2",
    "..sssss...2.",
    ".xxxxxxx.s..",
    "xxxXxxXxxs..",
    "xXxXxxXxXX..",
    "xxxXxxXxXX..",
    ".kkkkkkkk...",
    "..kk..kk....",
    "..ss..ss....",
  ];
  def("army_samurai", { kind: "army", label: "Samurai", era: [1050, 1870], regions: ["east_asia"], map: { 2: "m" } },
    [samurai, edit(samurai, { 12: "..kk...kk...", 13: "..ss...ss..." })]);

  // Chariot: two-wheeled car behind a horse, driver with the reins and an archer's bow.
  const car = [
    "...xx.....",
    "..sss.....",
    "..sks1....",
    ".xxxx.1...",
    ".xxXXx.1..",
    "nnnnnnn...",
    "nnnnnnNnnn",
    ".NkkkN....",
    ".kNnNk....",
    ".kNkNk....",
    "..kkk.....",
  ];
  const chariot = (h, spin) => over(over(blank(24, 15), h, 8, 5), spin ? edit(car, { 8: ".kNNNk....", 9: ".knkNk...." }) : car, 0, 4);
  def("army_chariot", { kind: "army", label: "War chariots", era: [-2000, -400], regions: ["middle_east", "mediterranean", "east_asia", "south_asia"], ax: 12, map: { 1: "N" }, fps: 4 },
    [chariot(HORSE, false), chariot(HORSE_STEP, true)]);

  const jaguar = [
    "..yyyyyy....",
    ".yykyykyy..2",
    "yyyyyyyyy.21",
    "yyssssyky.1.",
    "yyskssyy..1.",
    "..sssssy.s1.",
    ".xxxxxxxxs..",
    "xxwwwwwxx...",
    "xwxwxwxwxX..",
    "xxwwwwwxXX..",
    ".xxxxxxXX...",
    "..yyyyyy....",
    "..ss..ss....",
    "..yy..yy....",
  ];
  def("army_jaguar", { kind: "army", label: "Jaguar warriors", era: [1200, 1525], regions: ["americas"], map: { 1: "y", 2: "k" } },
    [jaguar, edit(jaguar, { 12: "..ss...ss...", 13: "..yy...yy..." })]);

  // ---------------------------------------------------------------- ships (face right, anchor = waterline)
  const galley = [
    ".........1..........",
    "......wwwwwww.......",
    "......wxxxxxw.......",
    "......wwwwwww.......",
    "......wxxxxxw.......",
    "......WWWWWWW.......",
    "n........1..........",
    "nn.......1..........",
    ".nnnnnnnnnnnnnnnnnn.",
    "..NNNNNNNNNNNNNNNNNN",
    "...2.2.2.2.2.2.2....",
    "..2.2.2.2.2.2.2.....",
    "....................",
  ];
  def("ship_galley", { kind: "ship", label: "Galley", era: [-1500, 1650], regions: ["mediterranean", "middle_east"], ay: 9, map: { 1: "N", 2: "N" } },
    [galley, bob(edit(galley, { 2: "......wwxxxxxw......", 3: "......wwwwwww.......", 4: "......wwxxxxxw......", 10: "...2.2.2.2.2.2.2....", 11: "...2.2.2.2.2.2.2...." }))]);

  const dhow = [
    "..x.............",
    "..wx............",
    "..www...........",
    "..wwwww.........",
    "...wwwww........",
    "...wwwwwww......",
    "...wwwwwwwww....",
    "...wwwwwwwwwW...",
    "....WWWWWWWWWWW.",
    "nn......1.......",
    "nnnnnnnnnnnnnnnn",
    ".nnnnnnnnnnnnnN.",
    "..NNNNNNNNNNNN..",
    "................",
  ];
  def("ship_dhow", { kind: "ship", label: "Dhow", era: [500, 1950], regions: ["middle_east", "africa", "south_asia"], ay: 11, map: { 1: "N" } },
    [dhow, bob(edit(dhow, { 0: "..xx............", 1: "..w.............", 6: "...wwwwwwwwwW...", 7: "...wwwwwwwwwwW.." }))]);

  const junk = [
    "....x...........",
    "....rrrr...x....",
    "....RRRR..rrr...",
    "...rrrrr..RRR...",
    "...RRRRR.rrrr...",
    "...rrrrr.RRRR...",
    "...RRRRR.rrrr...",
    "...rrrrr.RRRR...",
    "nn..1.....1.....",
    "nnn.1.....1....n",
    "nnnnnnnnnnnnnnnn",
    "NnnnnnnnnnnnnnN.",
    ".NNNNNNNNNNNNN..",
    "................",
  ];
  def("ship_junk", { kind: "ship", label: "Junk", era: [900, 1900], regions: ["east_asia", "southeast_asia"], ay: 11, map: { 1: "N" } },
    [junk, bob(edit(junk, { 0: ".....x..........", 1: "....rrrr....x...", 2: "....RRRR..rrr..." }))]);

  const cog = [
    "......x.......",
    "......1.......",
    "...wwwwwwww...",
    "...wwwxxwww...",
    "...wxxxxxxw...",
    "...wwwxxwww...",
    "...wwwxxwww...",
    "...WWWWWWWW...",
    "nnn...1...nnnn",
    "nNn...1...nNNn",
    "nnnnnnnnnnnnnn",
    ".nnnnnnnnnnnn.",
    "..NNNNNNNNNN..",
    "..............",
  ];
  def("ship_cog", { kind: "ship", label: "Cog", era: [1100, 1450], regions: ["europe"], ay: 11, map: { 1: "N" } },
    [cog, bob(edit(cog, { 0: "......xx......", 3: "...wwwxxwwww..", 4: "...wxxxxxxwW..", 5: "...wwwxxwwww.." }))]);

  const galleon = [
    "..........x...........",
    "....x.....1xx...x.....",
    "....1....wwwww..1x....",
    "....1....wwwww..1.....",
    "...ww....WWWWW.wwww...",
    "..www.....1....wwww...",
    ".wwww...wwwwwww.WWW...",
    ".wwwW...wwwwwww..1....",
    "nnnnn...wwwwwww..1....",
    "nNNNn...WWWWWWW..nnn..",
    "nnnnnnnnnnnnnnnnnnnn11",
    "nNkNNkNNkNNkNNkNNkNn..",
    "nnnnnnnnnnnnnnnnnnn...",
    ".NNNNNNNNNNNNNNNNN....",
    "......................",
  ];
  def("ship_galleon", { kind: "ship", label: "Galleon", era: [1500, 1780], regions: ANY, ay: 12, map: { 1: "N" } },
    [galleon, bob(edit(galleon, { 0: "..........xx..........", 1: "....xx....1x....xx....", 2: "....1....wwwww..1.....", 6: ".wwww...wwwwwwww.WWW..", 7: ".wwwW...wwwwwwww.1....", 8: "nnnnn...wwwwwwww.1...." }))]);

  const steamer = [
    "........33..........",
    ".......3............",
    "........xx..........",
    "....1...xx.....1....",
    "....1..wwwww...1....",
    "...wwwwwwwwwwwww....",
    "MMMMMMMMMMMMMMMMMMMM",
    ".MwMMwMMwMMwMMwMMwM.",
    "..rrrrrrrrrrrrrrrrr.",
    "....................",
  ];
  def("ship_steamer", { kind: "ship", label: "Steamship", era: [1815, 1960], regions: ANY, ay: 8, map: { 1: "M", 3: "m" }, fps: 4 },
    [steamer,
     edit(steamer, { 0: "......333...........", 1: "........3..........." }),
     bob(edit(steamer, { 0: ".....33.............", 1: ".......33..........." })),
     bob(edit(steamer, { 0: "....3...33..........", 1: "......33............" }))]);

  const liner = [
    "........3...3.......",
    ".......3...3........",
    ".......xx..xx.......",
    "......wwwwwwwww.....",
    "....wwwwwwwwwwwww...",
    "MMMMMMMMMMMMMMMMMMMM",
    ".MwwMwwMwwMwwMwwMwM.",
    "..rrrrrrrrrrrrrrrrr.",
    "....................",
  ];
  def("ship_modern", { kind: "ship", label: "Ocean liner / warship", era: [1900, 2100], regions: ANY, ay: 7, map: { 3: "m" }, fps: 4 },
    [liner, bob(edit(liner, { 0: ".......3...3........", 1: "........3...3......." }))]);

  // ---------------------------------------------------------------- lookup and checks
  const KINDS = ["army", "ship", "caravan", "city", "ruin", "wonder", "person", "event"];

  // pick: the sprite of this kind whose era covers the year, preferring the region; falls back to the nearest era.
  function pick(kind, year, region) {
    let best = null, bestScore = Infinity;
    for (const name in S) {
      const s = S[name];
      if (s.kind !== kind) continue;
      const gap = year < s.era[0] ? s.era[0] - year : year > s.era[1] ? year - s.era[1] : 0;
      const fit = !region || s.regions.includes(region) ? 0 : s.regions.includes("any") ? 1 : 2;
      const score = gap * 10 + fit * 1000 + (s.era[1] - s.era[0]) / 1e4;
      if (score < bestScore) { bestScore = score; best = name; }
    }
    return best;
  }

  // validate: row widths, frame sizes, known keys, anchor inside, at most 6 colours per sprite (SPEC.md).
  function validate(keys) {
    const out = [];
    for (const name in S) {
      const s = S[name], used = new Set();
      if (!KINDS.includes(s.kind)) out.push(`${name}: unknown kind ${s.kind}`);
      if (!Array.isArray(s.era) || s.era[0] > s.era[1]) out.push(`${name}: bad era`);
      if (s.frames.length > 4) out.push(`${name}: more than 4 frames`);
      if (s.ax < 0 || s.ax >= s.w || s.ay < 0 || s.ay >= s.h) out.push(`${name}: anchor outside`);
      s.frames.forEach((f, i) => {
        if (f.length !== s.h) out.push(`${name}[${i}]: ${f.length} rows, expected ${s.h}`);
        f.forEach((row, y) => {
          if (row.length !== s.w) out.push(`${name}[${i}] row ${y}: width ${row.length}, expected ${s.w}`);
          for (const c of row) if (c !== ".") {
            used.add(c);
            if (keys && !(c in keys) && c !== "x" && c !== "X") out.push(`${name}[${i}] row ${y}: unknown key ${c}`);
          }
        });
      });
      if (used.size > 6) out.push(`${name}: ${used.size} colours (${[...used].join("")}), max 6`);
    }
    return out;
  }

  global.PIXEL_SPRITES = Object.assign({}, S, global.PIXEL_SPRITES || {});
  global.PIXEL_SPRITE_LIBRARY = { sprites: S, kinds: KINDS, pick, validate };
})(typeof window !== "undefined" ? window : globalThis);
