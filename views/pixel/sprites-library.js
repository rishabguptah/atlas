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
  def("army_knight", { kind: "army", label: "Mounted knights", era: [950, 1500], regions: ["europe", "middle_east", "mediterranean"], map: { 1: "w" } },
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

  // Levy spearman: the fallback army for any region and era without a more specific sprite.
  const levy = [
    "...mmmm...2",
    "..mmmmmM..1",
    "..sssss...1",
    "..sksks...1",
    "..sssss...1",
    ".xxxxxxx.s1",
    "xxxxxxxxXs1",
    "xxxxXxxXX.1",
    "xxxxxxxXX.1",
    ".xxxxxXX..1",
    "..ss..ss...",
    "..MM..MM...",
  ];
  def("army_levy", { kind: "army", label: "Levy spearmen", era: [-3000, 1700], regions: ANY, map: { 1: "M", 2: "m" } },
    [levy, edit(levy, { 10: "..ss...ss..", 11: "..MM...MM.." })]);

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

  // ---------------------------------------------------------------- caravans (face right, anchor = feet)
  const camel = [
    "..............tt",
    ".....xx......tkt",
    "....xXXx.....tt.",
    "...txXXxt...tt..",
    "..ttttttttt.t...",
    ".tttttttttttt...",
    "ntttttttttttt...",
    "n.ntttttttttn...",
    "...t.t...t.t....",
    "...t.t...t.t....",
    "...t.t...t.t....",
    "...n.n...n.n....",
  ];
  def("caravan_camel", { kind: "caravan", label: "Camel caravan", era: [-1000, 1950], regions: ["middle_east", "africa", "steppe", "south_asia"] },
    [camel, edit(camel, { 8: "...t..t.t...t...", 9: "..t...t.t....t..", 10: "..t...t.t....t..", 11: "..n....nn....n.." })]);

  const mule = [
    "..........m.m.",
    "...nnnn...mm..",
    "..nNnnNn.mmmm.",
    "..nnnnnn.mkmmm",
    ".xxxxxxxxmm..M",
    "MmmmmmmmmmM...",
    "M.mmmmmmmmM...",
    "..MmmmmmmM....",
    "..m.m...m.m...",
    "..m.m...m.m...",
    "..M.M...M.M...",
  ];
  def("caravan_mule", { kind: "caravan", label: "Mule train", era: [-3000, 1950], regions: ANY },
    [mule, edit(mule, { 8: "..m..m.m...m..", 9: ".m...m.m....m.", 10: ".M....MM....M." })]);

  const cart = [
    "..wwwwww....",
    ".wwwwwwww...",
    "wwwwwwwwwW..",
    "wWWwWWwWWW..",
    "nnnnnnnnnnnn",
    "NNNNNNNNNN..",
    ".NNN..NNN...",
    ".NkN..NkN...",
    ".NNN..NNN...",
  ];
  const wagon = (h, turn) => over(over(blank(26, 11), h, 10, 1), turn ? edit(cart, { 7: ".kNN..kNN..." }) : cart, 0, 2);
  def("caravan_wagon", { kind: "caravan", label: "Wagon train", era: [-1500, 1920], regions: ["europe", "steppe", "americas", "east_asia", "south_asia"], ax: 13 },
    [wagon(HORSE, false), wagon(HORSE_STEP, true)]);

  // ---------------------------------------------------------------- settlements (anchor = ground centre)
  const village = [
    "...g.........",
    "..ygg........",
    ".yyggG...g...",
    "yyyggGG.ygg..",
    ".nnnnn.yyggG.",
    ".nkknnyyyggGG",
    ".nkknn.nnnnn.",
    ".......nnkkn.",
  ];
  def("city_village", { kind: "city", label: "Village", size: 1, era: [-10000, 2100], regions: ANY, map: { 1: "m" } },
    [village,
     edit(village, { 0: "...g.....1...", 1: "..ygg.....1.." }),
     edit(village, { 0: "...g....1....", 1: "..ygg....1..." })]);

  const town = [
    "........r.......",
    ".......rrR......",
    "..r...rrrRR.....",
    ".rrR..wwwWW..r..",
    "rrrRR.wkwkW.rrR.",
    "wwwWW.wwwWWrrrRR",
    "wkwkW.wwkWWwwwWW",
    "wwwWWrrrRRRwkwkW",
    "wwkWrrrrrRRRwwkW",
    ".....wwwwWWW....",
    ".....wkwwkWW....",
    ".....wwwkkWW....",
  ];
  def("city_town", { kind: "city", label: "Town", size: 2, era: [-3000, 2100], regions: ["europe", "mediterranean", "americas", "oceania"] }, [town]);

  const adobe = [
    ".......WWWW......",
    ".......ttttn.....",
    ".......tkktn.....",
    ".WWWW..ttttn.WWW.",
    ".ttttn.ttttn.tttn",
    ".tkktnWWWWWWWtkkn",
    ".ttttntttttttnttn",
    ".ttkknttkktkktnkn",
    ".ttkkntttttttnttn",
    "NNNNNNNNNNNNNNNNN",
  ];
  def("city_town_adobe", { kind: "city", label: "Mudbrick town", size: 2, era: [-4000, 2100], regions: ["middle_east", "africa", "south_asia", "steppe", "americas", "islamic", "near_east", "sahel", "meso", "andes", "deccan"] }, [adobe]);

  const asianTown = [
    "L.........L.....",
    "LeeeeeeeeeL.....",
    ".eeeeeeeee......",
    ".wrwwwwwrw......",
    ".wrwkL........L.",
    ".wrwkLeeeeeeeeL.",
    ".wrww.eeeeeeee..",
    "......wrwwkkwrw.",
    "......wrwwkkwrw.",
    "......wrwwkkwrw.",
  ];
  def("city_town_asian", { kind: "city", label: "Town (East Asia)", size: 2, era: [-1000, 2100], regions: ["east_asia", "southeast_asia"] }, [asianTown]);

  const walled = [
    "........1x........",
    "........1xx.......",
    "........1.........",
    ".rr....rrrr....rr.",
    "rrrR..rrrrRR..rrrR",
    "mmmM..mmmmMM..mmmM",
    "mkmM..mkmkMM..mkmM",
    "mmmM..mmmmMM..mmmM",
    "mmmM..mmmmMM..mmmM",
    "mmmMm.m.m.m.m.mmmM",
    "mmmMmmmmmmmmmmmmmM",
    "mmmMmmmmmmmmmmmmmM",
    "mmmMmmmmkkmmmmmmmM",
    "mmmMmmmkkkkmmmmmmM",
    "MMMMMMMkkkkMMMMMMM",
  ];
  def("city_walled", { kind: "city", label: "Walled city", size: 3, era: [-3000, 1850], regions: ANY, map: { 1: "M" } },
    [walled, edit(walled, { 0: "........1.........", 1: "........1xx.......", 2: "........1.x......." })]);

  const metropolis = [
    ".........g..........",
    "........ggG.........",
    "...w...gggGG....w...",
    "..wwW..gggGG...wwW..",
    "..wkW.gggggGG..wkW..",
    "..wwW.wwwwwWW..wwW..",
    ".rrwWrwkwkwkWrrwwWr.",
    "rrrwWrwwwwwwWrrwwWrr",
    "wwwwwwwwkkwwwwwwwwww",
    "W.W.W.W.W.W.W.W.W.W.",
    "WWWWWWWWWWWWWWWWWWWW",
    "WWkWWWWWWkkWWWWWkWWW",
    "WWWWWWWWkkkkWWWWWWWW",
    "WWWWWWWWkkkkWWWWWWWW",
  ];
  def("city_metropolis", { kind: "city", label: "Great city", size: 4, era: [-700, 1900], regions: ANY }, [metropolis]);

  // ---------------------------------------------------------------- regional settlements
  // Cities look like where they are: PixelEra.culture() names the building tradition, and these carry it as a region.
  // Islamic world (after 650): mudbrick walls, a tiled dome and a minaret.
  const islamicCity = [
    ".............w....",
    "............www...",
    ".............w....",
    ".....cc......w....",
    "....ccccb....w....",
    "...ccccccb...w....",
    "...cccccbb...w....",
    "..wwwwwwwww..w....",
    "..wkwwkwwkw.www...",
    "t.t.t.t.t.t.t.t.tn",
    "tttttttttttttttttn",
    "ttkttttttttttktttn",
    "tttttttkkttttttttn",
    "ttttttkkkkttttttnn",
    "nnnnnnkkkknnnnnnnn",
  ];
  def("city_islamic", { kind: "city", label: "City (Islamic world)", size: 3, era: [650, 2100], regions: ["islamic"] }, [islamicCity]);

  const islamicGreat = [
    "..w..............w..",
    "..w......cc......w..",
    ".www....ccccb...www.",
    "..w....ccccccb...w..",
    "..w...cccccccbb..w..",
    "..w...ccccccbbb..w..",
    "..w..wwwwwwwwwWW.w..",
    "..w..wkwwkwwkwWW.w..",
    "wwwWwwwwwwwwwwwWwwwW",
    "wkwWwkkwwwwwwkkWwkwW",
    "t.t.t.t.t.t.t.t.t.t.",
    "tttttttttttttttttttt",
    "ttkttttttkkttttttktt",
    "ttttttttkkkktttttttt",
    "ttttttttkkkktttttttt",
  ];
  def("city_islamic_great", { kind: "city", label: "Great city (Islamic world)", size: 4, era: [650, 2100], regions: ["islamic"] }, [islamicGreat]);

  // Near East before Islam: flat-roofed mudbrick and a stepped temple platform.
  const nearEastCity = [
    ".......WWWW.......",
    ".......tttn.......",
    ".....WWtttnWW.....",
    ".....ttttttnn.....",
    "...WWttkkttnnWW...",
    "...tttttttttnnn...",
    "WW..ttkkttkknn..WW",
    "tn.t.t.t.t.t.t.ttn",
    "tntttttttttttttttn",
    "kntttttttttttttktn",
    "tnttttttttkktttttn",
    "tntttttttkkkkttttn",
    "NNNNNNNNNkkkkNNNNN",
  ];
  def("city_near_east", { kind: "city", label: "City (ancient Near East)", size: 3, era: [-3500, 650], regions: ["near_east"] }, [nearEastCity]);

  const nearEastGreat = [
    "........WWWW........",
    "........tttn........",
    "......WWtttnWW......",
    "......NNNNNNNN......",
    "....WWttttttnnWW....",
    "....NNNNNNNNNNNN....",
    "..WWttttttttnnnnWW..",
    "..ttttkkttttkknnnn..",
    "WW.tttttttttnnnnn.WW",
    "tnt.t.t.t.t.t.t.t.tn",
    "tnttttttttttttttttNn",
    "kntttttttttttttttkNn",
    "tnttttttttkkttttttNn",
    "tntttttttkkkktttttNn",
    "NNNNNNNNNkkkkNNNNNNN",
  ];
  def("city_near_east_great", { kind: "city", label: "Great city (ancient Near East)", size: 4, era: [-3000, 650], regions: ["near_east"] }, [nearEastGreat]);

  // East Asia: a grey wall and a gate tower under curved, upturned tile roofs.
  const asianCity = [
    ".....e.......e....",
    ".....eeeeeeeee....",
    "......eeeeeee.....",
    ".......rwrwr......",
    "...e...rwrwr...e..",
    "...eeeeeeeeeeeee..",
    "....eeeeeeeeeee...",
    ".....rwrrrrrwr....",
    "m.m.mrwrrkrrwrm.m.",
    "mmmmmmmmmmmmmmmmmM",
    "mmkmmmmmmmmmmmkmmM",
    "mmmmmmmkkkmmmmmmmM",
    "mmmmmmkkkkkmmmmmmM",
    "MMMMMMkkkkkMMMMMMM",
  ];
  def("city_asian", { kind: "city", label: "Walled city (East Asia)", size: 3, era: [-1000, 1911], regions: ["east_asia", "southeast_asia"] }, [asianCity]);

  const asianGreat = [
    "......g.......g.....",
    "......ggggggggg.....",
    ".......GGGGGGG......",
    "........rkrkr.......",
    "....g...rrrrr...g...",
    "....ggggggggggggg...",
    ".g...GGGGGGGGGGG..g.",
    ".ggg..rkrrkrrkr..ggg",
    ".GGG..rrrrrrrrr..GGG",
    ".rkr.............rkr",
    "rrrrrrrrrrrrrrrrrrrR",
    "rrkrrrrrrrrrrrrrrkrR",
    "rrrrrrrrkkkkrrrrrrrR",
    "rrrrrrrkkkkkkrrrrrrR",
    "RRRRRRRkkkkkkRRRRRRR",
  ];
  def("city_asian_great", { kind: "city", label: "Imperial city (East Asia)", size: 4, era: [-221, 1911], regions: ["east_asia"] }, [asianGreat]);

  // Steppe: felt yurts, and a khan's golden tent under a horse-tail standard.
  const yurts = [
    "......1x.....",
    "......1xx....",
    "..www.1......",
    ".wwwwW1..ww..",
    "wwwwwwW.wwwW.",
    "nnnnnnN.nnnN.",
    "wwkkwwW.wkwW.",
  ];
  def("city_yurts", { kind: "city", label: "Yurt camp", size: 1, era: [-3000, 2100], regions: ["steppe"], map: { 1: "N" } }, [yurts]);

  const yurtTown = [
    ".........1......",
    ".........1x.....",
    "...www...1xx....",
    "..wwwwW..1..www.",
    ".wwwwwwW.1.wwwwW",
    ".nnnnnnN.1.nnnnN",
    ".wwkkwwW...wkkwW",
    "www....www......",
    "wwwW..wwwwW.....",
    "nnnN..nnnnN.....",
    "wkwW..wwkkW.....",
  ];
  def("city_yurt_town", { kind: "city", label: "Yurt town", size: 2, era: [-3000, 2100], regions: ["steppe"], map: { 1: "N" } }, [yurtTown]);

  const ordu = [
    "........1.........",
    ".......1xx........",
    "........1.........",
    ".......ggg........",
    ".....gggggG.......",
    "...gggggggGGG.....",
    "..ggggggggGGGG....",
    "..nnnnnnnnnnnn....",
    "..ggggkkkgGGGG....",
    "..ggggkkkgGGGG.ww.",
    ".www..........wwww",
    "wwwww..www....nnnn",
    "nnnnn.wwwww...wkww",
    "wkkww.nnnnn.......",
    "......wwkkw.......",
  ];
  def("city_ordu", { kind: "city", label: "Khan's camp", size: 3, era: [-1000, 1800], regions: ["steppe"], map: { 1: "n" } }, [ordu]);

  // Africa south of the Sahara: round mud houses under conical thatch, inside a mud wall.
  const africaCity = [
    "........g.........",
    ".......ggG........",
    "......gggGG.......",
    ".....gggggGG......",
    "....gggggggGG.....",
    "..g...tttnn...g...",
    ".ggG..tkknn..ggG..",
    "gggGG.tkknn.gggGG.",
    ".ttn........ttn...",
    "nt.t.t.t.t.t.t.t.n",
    "ttttttttttttttttnn",
    "ttttttttkkttttttnn",
    "tttttttkkkkttttttn",
    "NNNNNNNkkkkNNNNNNN",
  ];
  def("city_africa", { kind: "city", label: "Walled town (Africa)", size: 3, era: [-1000, 2100], regions: ["africa", "sahel"] }, [africaCity]);

  // The Sahel after 1000: a Djenne-style mud mosque, its towers bristling with palm-wood spikes.
  const sahelCity = [
    "...w......w......w...",
    "..ttn....ttn....ttn..",
    "1.ttn1..1ttn1..1ttn1.",
    "..ttn....ttn....ttn..",
    "1.ttn1..1ttn1..1ttn1.",
    "..ttntttttttnttttttn.",
    "..ttntkktttkkttkkttn.",
    "..ttntttttttnttttttn.",
    "..ttntkktttkkttkkttn.",
    "..ttntttttttnttttttn.",
    "nnnnnnnnnnnnnnnnnnnnN",
  ];
  def("city_sahel", { kind: "city", label: "Mud mosque city (Sahel)", size: 3, era: [1000, 2100], regions: ["sahel"], map: { 1: "N" } }, [sahelCity]);

  // South Asia: a temple spire (shikhara) over the walls; Mughal domes and minarets after 1500.
  const indianCity = [
    "........o.........",
    ".......nnn........",
    ".......ttn........",
    "......tttnn.......",
    "......NNNNN.......",
    ".....ttttnnn......",
    ".....NNNNNNN......",
    "....tttttnnnn.....",
    "....ttkktnkkn.....",
    "t.t.t.t.t.t.t.t.tn",
    "tttttttttttttttttn",
    "ttkttttttttttktttn",
    "tttttttkkkktttttnn",
    "NNNNNNNkkkkNNNNNNN",
  ];
  def("city_india", { kind: "city", label: "Temple city (South Asia)", size: 3, era: [-500, 2100], regions: ["south_asia", "deccan"] }, [indianCity]);

  const indianGreat = [
    ".........o..........",
    "........nnn.........",
    "........ttn.........",
    "...o...tttnn....o...",
    "..nnn..NNNNN...nnn..",
    "..ttn.ttttnnn..ttn..",
    ".tttnnNNNNNNN.tttnn.",
    ".NNNNtttttnnnnNNNNN.",
    ".ttkntttkktnnnttkkn.",
    "t.t.t.t.t.t.t.t.t.tn",
    "ttttttttttttttttttnn",
    "ttkttttttttttttkttnn",
    "tttttttttkkktttttttn",
    "ttttttttkkkkkttttttn",
    "NNNNNNNNkkkkkNNNNNNN",
  ];
  def("city_india_great", { kind: "city", label: "Great temple city (South Asia)", size: 4, era: [-600, 2100], regions: ["south_asia", "deccan"] }, [indianGreat]);

  const mughal = [
    ".g........g........g",
    ".w.......www.......w",
    "www....wwwwwW.....ww",
    ".w....wwwwwwWW.....w",
    ".w...wwwwwwwWWW....w",
    ".w...wwwwwwwWWW....w",
    ".w..g.wwwwwWWW.g...w",
    ".w.wwW.SSSSSS.wwW..w",
    ".wSSSSSSSSSSSSSSSS.w",
    ".wSsSSsSSkkSSsSSsS.w",
    ".wSsSSsSkkkkSsSSsS.w",
    "SSSSSSSSkkkkSSSSSSSS",
    "SSSSSSSSSSSSSSSSSSSS",
  ];
  def("city_mughal", { kind: "city", label: "Mughal city", size: 4, era: [1500, 1900], regions: ["south_asia"] }, [mughal]);

  // Mesoamerica before 1550: a stepped pyramid with a temple on top among white plastered houses.
  const mesoCity = [
    "........rrR.......",
    ".......rkkR.......",
    "......MMMMMM......",
    "......mmwmmM......",
    ".....MMMwMMMM.....",
    ".....mmmwmmmM.....",
    "....MMMMwMMMMM....",
    "....mmmmwmmmmM....",
    ".ww.MMMMwMMMMMww..",
    "wwwwmmmmwmmmmMwww.",
    "wkwwMMMMwMMMMMwkw.",
    "MMMMMMMMMMMMMMMMMM",
  ];
  def("city_meso", { kind: "city", label: "Pyramid city (Mesoamerica)", size: 3, era: [-1500, 1550], regions: ["meso"] }, [mesoCity]);

  const mesoGreat = [
    ".........rrR.........",
    "........rkkR.........",
    ".......MMMMMM........",
    ".......mmwmmM........",
    "......MMMwMMMM.......",
    "......mmmwmmmM.......",
    ".rR..MMMMwMMMMM......",
    ".mM..mmmmwmmmmM......",
    "MMMMMMMMMwMMMMMM.ww..",
    "mmmmmmmmmwmmmmmMwwww.",
    "mMwmMMMMMwMMMMMMwwkw.",
    "MMMMMMMMMMMMMMMMMMMMM",
  ];
  def("city_meso_great", { kind: "city", label: "Great pyramid city (Mesoamerica)", size: 4, era: [-1500, 1550], regions: ["meso"] }, [mesoGreat]);

  // The Andes before 1560: fitted grey stone terraces and thatched halls.
  const andesCity = [
    "......ggg.........",
    ".....gggGG........",
    "....gggggGG.......",
    "....mmkmmmM..ggg..",
    "....mmmmmmM.gggGG.",
    "..MMMMMMMMMMMmkmM.",
    "..mmmmmmmmmmmmmmM.",
    "MMMMMMMMMMMMMMMMMM",
    "mmmmmmmmmmmmmmmmmM",
    "mMmmMmmmMmmmMmmMmM",
    "MMMMMMMMMMMMMMMMMM",
  ];
  def("city_andes", { kind: "city", label: "Stone city (Andes)", size: 3, era: [600, 1560], regions: ["andes"] }, [andesCity]);

  const industrial = [
    "..3.....3...........",
    ".3.3...3.3..........",
    "..3.....3...........",
    "..MM....MM..........",
    "..MM....MM.....rrR..",
    "..MM....MM....rrrRR.",
    "rrMMrrrrMMrr..rwwRR.",
    "rRRRRRRRRRRRR.rwwRR.",
    "rwwrwwrwwrwwR.rrrRR.",
    "rrrrrrrrrrrrRrrrrrRR",
    "rwwrwwrkkrwwRrwwrwwR",
    "rrrrrrrkkrrrRrrrrrrR",
  ];
  def("city_industrial", { kind: "city", label: "Industrial city", size: 4, era: [1780, 1970], regions: ANY, map: { 3: "m" }, fps: 3 },
    [industrial,
     edit(industrial, { 0: ".3.....3............", 1: "..3.3...3.3.........", 2: ".3.....3............" }),
     edit(industrial, { 0: "...3.....3..........", 1: ".3.....3............", 2: "..3.3...3.3........." })]);

  const modern = [
    "......c.............",
    "......B.............",
    ".....bbB......bbB...",
    ".....bcB......bcB...",
    ".....bbB..bB..bbB...",
    "..mM.bcB..bB..bcB...",
    "..mM.bbBbbbB..bbBmM.",
    "..mM.bcBbcbBmMbcBmM.",
    "mMmM.bbBbbbBmMbbBmM.",
    "mMmMbbbBbcbBmMbcBmMM",
    "mMmMbcbBbbbBmMbbBmMM",
    "MMMMMMMMMMMMMMMMMMMM",
  ];
  def("city_modern", { kind: "city", label: "Modern metropolis", size: 5, era: [1900, 2100], regions: ANY },
    [modern, edit(modern, { 0: "......B............." })]);

  // ---------------------------------------------------------------- landmarks (regional icons for a city)
  const pagoda = [
    "......g......",
    "......g......",
    "....L.g.L....",
    "....LeeeL....",
    ".....rrR.....",
    "...L.....L...",
    "...LeeeeeL...",
    "....rrkrR....",
    "..L.......L..",
    "..LeeeeeeeL..",
    "...rrrkrrR...",
    ".L.........L.",
    ".LeeeeeeeeeL.",
    "..rrrrkrrrR..",
    "..rrrkkkrrR..",
    ".RRRRRRRRRRR.",
  ];
  def("city_pagoda", { kind: "city", label: "Pagoda", landmark: true, era: [500, 2100], regions: ["east_asia", "southeast_asia"] }, [pagoda]);

  const mosque = [
    "..g.............",
    "..w.............",
    ".wwW......g.....",
    ".wwW......g.....",
    ".wWW....cccc....",
    "wwwWW..ccccbb...",
    ".wwW..ccccccbb..",
    ".wwW..cccccbbb..",
    ".wwW.wwwwwwWWWW.",
    ".wwW.wkwwkwwkWW.",
    ".wwWwwwwwwwwwWWW",
    ".wwWwkkwwkkwwkkW",
    ".wwWwkkwwkkwwkkW",
    "WWWWWWWWWWWWWWWW",
  ];
  def("city_minaret", { kind: "city", label: "Mosque and minaret", landmark: true, era: [622, 2100], regions: ["middle_east", "africa", "south_asia", "southeast_asia", "steppe"] }, [mosque]);

  const cathedral = [
    "..M.........M..",
    "..M.........M..",
    ".MMM.......MMM.",
    ".MMM...M...MMM.",
    "MMMMM.MMM.MMMMM",
    "ttttnMMMMMttttn",
    "tkktnttttntkktn",
    "tkktntcccntkktn",
    "ttttntcbcnttttn",
    "tkktntcccntkktn",
    "tkktnttttntkktn",
    "ttttntkkkntttTn",
    "ttttnkkkkkntttn",
    "nnnnnkkkkknnnnn",
  ];
  def("city_cathedral", { kind: "city", label: "Cathedral", landmark: true, era: [1000, 2100], regions: ["europe", "americas"] },
    [cathedral.map((r) => r.replace("T", "t"))]);

  const ziggurat = [
    "........ww........",
    ".......wwwW.......",
    ".......wkkW.......",
    ".....tttNNnnn.....",
    ".....tttNNnnn.....",
    "...tttttNNnnnnn...",
    "...NNNNNNNNNNNN...",
    "...tttttNNnnnnn...",
    ".tttttttNNnnnnnnn.",
    ".NNNNNNNNNNNNNNNN.",
    ".tttttttNNnnnnnnn.",
    "nnnnnnnnNNnnnnnnnn",
  ];
  def("city_ziggurat", { kind: "city", label: "Ziggurat", landmark: true, era: [-3000, -300], regions: ["middle_east"] }, [ziggurat]);

  const hinduTemple = [
    ".......go......",
    "......nnn......",
    "......ttn......",
    ".....tttnn.....",
    ".....NNNNN.....",
    ".....tttnn.....",
    "....ttttnnn....",
    "....NNNNNNN....",
    "....ttttnnn....",
    "..t.ttttnnn.n..",
    ".tttNNNNNNNnnn.",
    "ttttttkkkttnnnn",
    "ttttttkkkttnnnn",
    "NNNNNNNNNNNNNNN",
  ];
  def("city_temple_hindu", { kind: "city", label: "Hindu temple", landmark: true, era: [400, 2100], regions: ["south_asia", "southeast_asia"] }, [hinduTemple]);

  const mesoPyramid = [
    "......rrrr......",
    "......wkkw......",
    ".....mmmmmm.....",
    ".....mmNNmM.....",
    "....mmmNNmMM....",
    "....MMMNNMMM....",
    "...mmmmNNmmMM...",
    "...MMMMNNMMMM...",
    "..mmmmmNNmmmMM..",
    "..MMMMMNNMMMMM..",
    ".mmmmmmNNmmmmMM.",
    "MMMMMMMNNMMMMMMM",
  ];
  def("city_temple_meso", { kind: "city", label: "Temple pyramid", landmark: true, era: [-1000, 1600], regions: ["americas"] }, [mesoPyramid]);

  // ---------------------------------------------------------------- wonders (anchor = ground centre)
  // era = [built, lost or 2100]; lost wonders carry the year they were lost and where they stood.
  const W_PYRAMIDS = [
    ".........g................",
    "........ygG...............",
    ".......yygGG......g.......",
    "......yyygGGG....ygG......",
    ".....yyyygGGGG..yygGG.....",
    "....yyyyygGGGGGyyygGGG....",
    "...yyyyyygGGGGGGyygGGGk...",
    "..yyyyyyygGGGGGGGygGGkgG..",
    ".yyyyyyyygGGGGGGGGgGkygGG.",
    "yyyyyyyyygGGGGGGGGGkyygGGG",
    "yyyyyyyyygGGGGGGGGkyyygGGG",
    "nttnttnttnttnttnttnttnttnt",
  ];
  def("wonder_pyramids", { kind: "wonder", label: "Pyramids of Giza", era: [-2560, 2100], regions: ["africa",  "middle_east"], place: [29.979, 31.134], lost: null, note: "Last ancient wonder still standing" },
    [W_PYRAMIDS]);

  const W_GARDENS = [
    "........lLl.........",
    ".......lllLL........",
    "........nnn.........",
    "......lllllLL.......",
    "......ttkttnn.......",
    "....llllllllLLL.....",
    "....tLttkttnLnn.....",
    "....tLttkttnLnn.....",
    "..llllllllllllLLL...",
    "..tLttkttkttkLnnn...",
    "..tLttkttkttkLnnn...",
    "lllllllllllllllllLLL",
    "tLttkttkttkttkttLnnn",
    "tLttkttkttkttkttLnnn",
    "tttttttttttttttttnnn",
    "nnnnnnnnnnnnnnnnnnnn",
  ];
  def("wonder_gardens", { kind: "wonder", label: "Hanging Gardens of Babylon", era: [-600, -100], regions: ["middle_east"], place: [32.536, 44.421], lost: -100, note: "Existence still debated; no trace found" },
    [W_GARDENS]);

  const W_ARTEMIS = [
    "..........ww..........",
    "........wwwwWW........",
    "......wwwwgwwwWW......",
    "....wwwwwwwwwwwwWW....",
    "..wwwwwwwwwwwwwwwwWW..",
    "WWWWWWWWWWWWWWWWWWWWWW",
    ".wwwwwwwwwwwwwwwwwwwW.",
    ".wwkwwkwwkwwkwwkwwkwW.",
    ".wwkwwkwwkwwkwwkwwkwW.",
    ".wwkwwkwwkwwkwwkwwkwW.",
    ".wwkwwkwwkwwkwwkwwkwW.",
    ".wwkwwkwwkwwkwwkwwkwW.",
    "WWWWWWWWWWWWWWWWWWWWWW",
    "tttttttttttttttttttttt",
  ];
  def("wonder_artemis", { kind: "wonder", label: "Temple of Artemis", era: [-550, 401], regions: ["mediterranean"], place: [37.95, 27.364], lost: 401, note: "Burned 356 BC, rebuilt, finally destroyed 401" },
    [W_ARTEMIS]);

  const W_ZEUS = [
    ".......ww.......",
    ".....wwwwWW.....",
    "...wwwwwwwwWW...",
    ".wwwwwwwwwwwwWW.",
    "WWWWWWWWWWWWWWWW",
    "wwkkkkkggkkkkkWW",
    "wwkkkkkwwkkgkkWW",
    "wwkkkkwwwwkgkkWW",
    "wwkkkgggggggkkWW",
    "wwkkwgggggGgkkWW",
    "wwkkGkgggGkgkkWW",
    "wwkkGggggGGgkkWW",
    "wwkkGgGGgGGkkkWW",
    "WWWWWWWWWWWWWWWW",
  ];
  def("wonder_zeus", { kind: "wonder", label: "Statue of Zeus at Olympia", era: [-435, 475], regions: ["mediterranean"], place: [37.638, 21.63], lost: 475, note: "Lost, probably to fire in Constantinople" },
    [W_ZEUS]);

  const W_MAUSOLEUM = [
    ".......gg.......",
    "......gggg......",
    ".......tn.......",
    "......ttnn......",
    ".....tttnnn.....",
    "....ttttnnnn....",
    "...tttttnnnnn...",
    "..ttttttnnnnnn..",
    ".WWWWWWWWWWWWWW.",
    ".wkwkwkwkwkwkwk.",
    ".wkwkwkwkwkwkwk.",
    ".wkwkwkwkwkwkwk.",
    "WWWWWWWWWWWWWWWW",
    "wwwwwwwwwwwwwwWW",
    "wwwwwwwwwwwwwwWW",
    "wwwwwwwwwwwwwwWW",
    "wwwwwwwwwwwwwwWW",
    "wwwwwwwwwwwwwwWW",
    "WWWWWWWWWWWWWWWW",
  ];
  def("wonder_mausoleum", { kind: "wonder", label: "Mausoleum at Halicarnassus", era: [-351, 1494], regions: ["mediterranean"], place: [37.038, 27.424], lost: 1494, note: "Felled by earthquakes, stones reused by 1494" },
    [W_MAUSOLEUM]);

  const W_COLOSSUS = [
    ".........o..",
    "........owo.",
    ".........G..",
    "....ggg..g..",
    "...ggggG.g..",
    "...gggGG.g..",
    "....gGG.gg..",
    "..gggggggG..",
    ".gggggggG...",
    ".g.ggggGG...",
    ".g.ggggGG...",
    "...ggGgGG...",
    "...gG..gG...",
    "...gG..gG...",
    "...gG..gG...",
    "..ggG..gGG..",
    ".wwwwwwwwWW.",
    "..wwwwwwWW..",
    "..wkwwwkWW..",
    "..wwwwwwWW..",
    ".wwwwwwwwWW.",
    "WWWWWWWWWWWW",
  ];
  def("wonder_colossus", { kind: "wonder", label: "Colossus of Rhodes", era: [-280, -226], regions: ["mediterranean"], place: [36.451, 28.226], lost: -226, note: "Toppled by an earthquake after 54 years", fps: 4 },
    [W_COLOSSUS, edit(W_COLOSSUS, { 0: "........o...", 1: ".........wo." })]);

  const W_PHAROS = [
    "......y......",
    ".....yoy.....",
    ".....oro.....",
    ".....wwW.....",
    "....wwwwW....",
    ".....wkW.....",
    "....wwwWW....",
    "....wwwWW....",
    "....wkwWW....",
    "....wwwWW....",
    "....wkwWW....",
    "...wwwwwWW...",
    "..wwwwwwwWW..",
    "..wwkwwkwWW..",
    "..wwwwwwwWW..",
    "..wwkwwkwWW..",
    "..wwwwwwwWW..",
    "..wwkwwkwWW..",
    "..wwwwwwwWW..",
    ".wwwwwwwwwWW.",
    ".wwwwkkkwwWW.",
    "WWWWWWWWWWWWW",
  ];
  def("wonder_pharos", { kind: "wonder", label: "Lighthouse of Alexandria", era: [-280, 1480], regions: ["africa",  "mediterranean"], place: [31.214, 29.885], lost: 1480, note: "Earthquakes 956-1323; stones went into Qaitbay fort", fps: 4 },
    [W_PHAROS, edit(W_PHAROS, { 0: ".....y.y.....", 1: "......yo.....", 2: ".....ooo....." }), edit(W_PHAROS, { 0: ".............", 1: ".....oyo.....", 2: "....oyroo...." })]);

  const W_GREAT_WALL = [
    "...............m.m.M........",
    "...............mmmMM........",
    "...............mkmMM........",
    "...............mmmMMm.......",
    "..............mmmmMMm.m.....",
    "......m.m...m.mMMLLMMmm.m...",
    "....mmmmm.m.mmMllLLLLMMmm.m.",
    "..m.mMMMMmmmMMlLLLLLLLLMMmm.",
    "mmmmMllllMMMllLLLeeLLLLLLMMm",
    "mMMMlLLLLlllLLLeeeeeeLLLLLLM",
    "MlllLLLLLLLLLLeeeeeeeeeLLLLL",
    "lLLLLeeeeLLLeeeeeeeeeeeeeLLL",
    "LLLLeeeeeeeeeeeeeeeeeeeeeeeL",
  ];
  def("wonder_great_wall", { kind: "wonder", label: "Great Wall", era: [-220, 2100], regions: ["east_asia"], place: [40.431, 116.57], lost: null, note: "Built and rebuilt for two thousand years" },
    [W_GREAT_WALL]);

  const W_COLOSSEUM = [
    "...ttttttttttttt......",
    "..ttkttkttkttkttt.....",
    ".tttttttttttttttttt...",
    "tkktkktkktkktkktkkt...",
    "tkktkktkktkktkktkkttn.",
    "tttttttttttttttttttnn.",
    "tkktkktkktkktkktkktnn.",
    "tkktkktkktkktkktkktnn.",
    "ttttttttttttttttttttnn",
    "tkktkktkktkktkktkktnnn",
    "tkktkktkktkktkktkktnnn",
    "nnnnnnnnnnnnnnnnnnnnnn",
  ];
  def("wonder_colosseum", { kind: "wonder", label: "Colosseum", era: [80, 2100], regions: ["mediterranean",  "europe"], place: [41.89, 12.492], lost: null, note: "Arena of Rome; quarried after the 1349 earthquake" },
    [W_COLOSSEUM]);

  const W_STONEHENGE = [
    "...mmmmM.....mmmmM..",
    "...mM.mM..m..mM.mM..",
    ".m.mM.mM.mM..mM.mM.m",
    ".mMmM.mM.mM..mM.mMmM",
    ".mMmM.mM.mM..mM.mMmM",
    "lllllllllllllllllllL",
    ".LLLLLLLLLLLLLLLLLL.",
  ];
  def("wonder_stonehenge", { kind: "wonder", label: "Stonehenge", era: [-2500, 2100], regions: ["europe"], place: [51.179, -1.826], lost: null, note: "Sarsen circle raised around 2500 BC" },
    [W_STONEHENGE]);

  const W_ANGKOR = [
    "............m............",
    "...........mmM...........",
    "...........mmM...........",
    "......M...mmmMM...M......",
    ".....MMK..kkkkk..MMK.....",
    ".....MMK..mmmMM..MMK.....",
    "..m..kKK.mmmmMMM.kKK..m..",
    ".mmM.MMK.kkkkkkk.MMK.mmM.",
    ".mmM.MMK.mmmmmMM.MMK.mmM.",
    "mmmMMMMKmmmmmmMMMMMKmmmMM",
    "MMMMMMMMMMMMMMMMMMMMMMMMM",
    "mkmmkmmkmmkmkkkmkmmkmmkmM",
    "mmmmmmmmmmmkkkkmmmmmmmmmM",
    "bcccbcccbcccbcccbcccbcccb",
    "bbbbbbbbbbbbbbbbbbbbbbbbb",
  ];
  def("wonder_angkor", { kind: "wonder", label: "Angkor Wat", era: [1150, 2100], regions: ["southeast_asia"], place: [13.412, 103.867], lost: null, note: "Largest religious monument on Earth" },
    [W_ANGKOR]);

  const W_TAJ = [
    "..........g..........",
    "..........w..........",
    ".........wWW.........",
    "..w.....wwwWW.....w..",
    ".www...wwwwwWW...www.",
    "..w...wwwwwwwWW...w..",
    "..w...wwwwwwwWW...w..",
    "..w....wwwwwWW....w..",
    "..w..wwwwwwwwwWW..w..",
    "..w.wwwwwwwwwwwWW.w..",
    "..w.wwkwwwkwwwkWW.w..",
    "..w.wwkwwkkkwwkWW.w..",
    "..w.wwwwwkkkwwwWW.w..",
    "WWWWWWWWWWWWWWWWWWWWW",
    "cccbcccbcccccbcccbccc",
  ];
  def("wonder_taj", { kind: "wonder", label: "Taj Mahal", era: [1653, 2100], regions: ["south_asia"], place: [27.175, 78.042], lost: null, note: "Mughal tomb finished 1653" },
    [W_TAJ]);

  const W_HAGIA_SOPHIA = [
    "..........MM..........",
    "..t.....mmmmMM.....t..",
    "..t...mmmmmmmMMM...t..",
    ".ttt.mmmmmmmmMMMM.ttt.",
    "..t..tttttttttttn..t..",
    "..t.mmMtkttkttkMMM.t..",
    "..t.tttttttttttttn.t..",
    "..ttttkttkttkttkttnt..",
    "..ttttttttttttttttnt..",
    "..tttkkttkkkttkkttnt..",
    "..tttkkttkkkttkkttnt..",
    "nnnnnnnnnnnnnnnnnnnnnn",
  ];
  def("wonder_hagia_sophia", { kind: "wonder", label: "Hagia Sophia", era: [537, 2100], regions: ["mediterranean",  "middle_east",  "europe"], place: [41.009, 28.98], lost: null, note: "Largest dome in the world for nearly a thousand years" },
    [W_HAGIA_SOPHIA]);

  const W_DJENNE = [
    "...t.......t.......t...",
    "..ttn.....ttn.....ttn..",
    "..ttn.....ttn.....ttn..",
    ".NttnN...NttnN...NttnN.",
    "..ttn.....ttn.....ttn..",
    ".NttnNtttNttnNtttNttnN.",
    "..ttntttttttnttttttnn..",
    ".NttnttkttttnttkttnnN..",
    "..ttntttttttnttttttnn..",
    "ttttttttttttttttttttnnn",
    "tttttttttkkktttttttnnnn",
    "ttttttttkkkkkttttttnnnn",
    "nnnnnnnnnnnnnnnnnnnnnnn",
  ];
  def("wonder_djenne", { kind: "wonder", label: "Great Mosque of Djenne", era: [1240, 2100], regions: ["africa"], place: [13.905, -4.555], lost: null, note: "Mudbrick, replastered every year; current building 1907" },
    [W_DJENNE]);

  const W_MACHU_PICCHU = [
    "...............e......",
    "..............eeL.....",
    ".............eeeLL....",
    "............eeeeLLL...",
    "...........eeeeeLLLL..",
    "..........eeeeeeeLLLL.",
    "..mm.mm...eeeeeeeeLLLL",
    ".mmmMmmM.eeeeeeeeeeLLL",
    "MmkMmmkMlllllllllLLLLL",
    "lllllllllLLLLLLLLLLLLL",
    "mmmmmmmmmmmmmmmmmmmMMM",
    "lllllllllllllllllLLLLL",
    "mmmmmmmmmmmmmmmmmmMMMM",
    "lllllllllllllllLLLLLLL",
  ];
  def("wonder_machu_picchu", { kind: "wonder", label: "Machu Picchu", era: [1450, 2100], regions: ["americas"], place: [-13.163, -72.545], lost: null, note: "Inca estate the Spanish never found" },
    [W_MACHU_PICCHU]);

  const W_EIFFEL = [
    "......n......",
    "......n......",
    ".....nN......",
    ".....nN......",
    ".....nN......",
    ".....nNN.....",
    "....nnNN.....",
    "....nkkN.....",
    "....nNnN.....",
    "...nnNNNN....",
    "...nkkkkN....",
    "..nnNNNNNN...",
    "..nN.k.NN....",
    "..nN...nN....",
    ".nnN...nNN...",
    ".nN.....nN...",
    "nnN.....nNN..",
    "nN.......nN..",
    "NN.......NN..",
  ];
  def("wonder_eiffel", { kind: "wonder", label: "Eiffel Tower", era: [1889, 2100], regions: ["europe"], place: [48.858, 2.294], lost: null, note: "Tallest structure in the world until 1930" },
    [W_EIFFEL]);

  // ---------------------------------------------------------------- ruins (anchor = ground centre)
  const ruinColumns = [
    ".ww...........",
    "wwwW..........",
    ".wW...ww......",
    ".wW..wwwW.....",
    ".wW...wW...w..",
    ".wW...wW..wwW.",
    ".wW.l.wW...wW.",
    ".wWlLlwW.ttwW.",
    "wwwWWwwwWWwwwW",
    "WWWWWWWWWWWWWW",
  ];
  def("ruin_columns", { kind: "ruin", label: "Classical ruins", era: [-500, 2100], regions: ["mediterranean", "middle_east", "europe", "africa"] }, [ruinColumns]);

  const ruinTell = [
    "......nn..n.......",
    "......tn.tn.......",
    ".....ttnttnnn.....",
    "...ttttttttnnnn...",
    "..tttNNtttttnnnn..",
    ".ttttttttNNttnnnn.",
    "tttttttttttttnnnnn",
    "NNNNNNNNNNNNNNNNNN",
  ];
  def("ruin_tell", { kind: "ruin", label: "Buried city mound", era: [-4000, 2100], regions: ["middle_east", "south_asia", "africa", "steppe"] }, [ruinTell]);

  const ruinJungle = [
    "...........ll...",
    "..........lllL..",
    "....mmmM..llLL..",
    "....mkkM...nL...",
    "...mmmmmM..nL...",
    "...MlMMMM..n....",
    "..mmmlmmmMMnM...",
    "..MMMLMMMMMMM...",
    ".mmmmlmmmmmmmM..",
    ".MMMMLMMMMMMMMl.",
    "lmmmmmmmmmmmmmLl",
    "LLLLLLLLLLLLLLLL",
  ];
  def("ruin_jungle", { kind: "ruin", label: "Overgrown temple", era: [800, 2100], regions: ["americas", "southeast_asia", "south_asia", "africa"] }, [ruinJungle]);

  const ruinCastle = [
    "...m.m........",
    "..mmmmM.......",
    "..mkmmM.m.....",
    "..mmmmM.mM....",
    "..mmLmMmmM....",
    "..mmLLMmmmm.m.",
    "..mLLmMmkmmmM.",
    "..mmLmMmmmmmM.",
    ".mmmmmMmmmmmM.",
    "mmmmkkmmmmLmMM",
    "MMMMkkMMMMLLMM",
    "lllllllllLLLLl",
  ];
  def("ruin_castle", { kind: "ruin", label: "Ruined castle", era: [1300, 2100], regions: ["europe", "middle_east"] }, [ruinCastle]);

  // ---------------------------------------------------------------- people (face the viewer, anchor = feet)
  // glance: the eyes slide one pixel to the side, a small idle beat that keeps the face readable.
  function glance(frame, row) { return edit(frame, { [row]: frame[row].replace(/ks/g, "sk") }); }

  const ruler = [
    "..g.g.g...",
    "..ggggg..2",
    "..sssss..1",
    "..sksks..1",
    "..sssss..1",
    ".wwwwwww.1",
    "xxxxgxxxs1",
    "xxxxgxxXX1",
    "xxxxgxxXX.",
    "xxxxgxxXX.",
    "xxxxgxxXX.",
    "wwwwwwwww.",
  ];
  def("person_ruler", { kind: "person", label: "Ruler", era: [-3000, 2100], regions: ANY, map: { 1: "g", 2: "g" }, fps: 2 },
    [ruler, ruler, ruler, glance(ruler, 3)]);

  const priest = [
    "...wwW....",
    "...wgW...2",
    "..wwwwW.2.",
    "..sssss.21",
    "..sksks..1",
    "..sssss..1",
    ".wwwwwwws1",
    ".wwxwwxWW1",
    ".wwxwwxWW1",
    ".wwxwwxWW1",
    ".wwxwwxWW1",
    ".WWWWWWWW.",
  ];
  def("person_priest", { kind: "person", label: "Priest or bishop", era: [300, 2100], regions: ["europe", "mediterranean", "americas", "africa"], map: { 1: "g", 2: "g" }, fps: 2 },
    [priest, priest, priest, glance(priest, 4)]);

  const monk = [
    "...ssss...",
    "..ssssss..",
    "..sksksS..",
    "..ssssSS..",
    "...ssss...",
    ".ooorooo..",
    "oooorroor.",
    "ooosnnsor.",
    "oooonnoor.",
    "ooooroorr.",
    "ooooroorr.",
    ".oooorrrr.",
    "..rr..rr..",
  ];
  def("person_monk", { kind: "person", label: "Buddhist monk", era: [-500, 2100], regions: ["south_asia", "east_asia", "southeast_asia"], fps: 2 },
    [monk, monk, monk, glance(monk, 2)]);

  const merchant = [
    "...wwww...",
    "..wwwwww..",
    "..wwwwww..",
    "..sssss...",
    "..sksks...",
    "..sssss...",
    ".xxxxxxx..",
    "xxxgxxxxsg",
    "xxxgxxxxgg",
    "xxxgxxxxgG",
    "xxxxxxxxx.",
    ".kk...kk..",
  ];
  def("person_merchant", { kind: "person", label: "Merchant", era: [-3000, 2100], regions: ANY, fps: 2 },
    [merchant, merchant, edit(merchant, { 7: "xxxgxxxsgg", 8: "xxxgxxxxgG", 9: "xxxgxxxxG." }), glance(merchant, 4)]);

  const scholar = [
    "..kkkkk...",
    "..kkkkk...",
    "..sssss...",
    "..sksks...",
    "..sssss...",
    ".bbbbbbb..",
    "bbbbbbbbB.",
    "bswwwwwsB.",
    "bbwWwWwbB.",
    "bbbbbbbBB.",
    "bbbbbbbBB.",
    ".bbbbbbB..",
    "..kk.kk...",
  ];
  def("person_scholar", { kind: "person", label: "Scholar", era: [-1000, 2100], regions: ANY, fps: 2 },
    [scholar, scholar, scholar, glance(scholar, 3)]);

  const philosopher = [
    "..WWWWW...",
    "..Wssss...",
    "..sksks...",
    "..sssss...",
    "..WWWWW...",
    "..WWWWw...",
    ".wwwwwwwW.",
    "wwswwwwWs.",
    "wwwwwwWWW.",
    ".wwwwwWWW.",
    ".wwwwwWWW.",
    ".wwwwWWWW.",
    "..nn..nn..",
  ];
  def("person_philosopher", { kind: "person", label: "Philosopher", era: [-600, 600], regions: ["mediterranean", "middle_east"], fps: 2 },
    [philosopher, philosopher, philosopher, glance(philosopher, 2)]);

  const farmer = [
    "...yyyy..2",
    ".yyyyyyyy2",
    "..sssss..1",
    "..sksks..1",
    "..sssss..1",
    ".lllllll.1",
    "lllllllls1",
    "lllllllLL1",
    "lllllllLL1",
    "lllllllLL.",
    ".nnnnnnn..",
    ".ss...ss..",
  ];
  def("person_farmer", { kind: "person", label: "Farmer", era: [-9000, 2100], regions: ANY, map: { 1: "n", 2: "k" }, fps: 2 },
    [farmer, farmer, edit(farmer, { 0: "...yyyy...", 1: ".yyyyyyyy.", 2: "..sssss.22", 3: "..sksks.1.", 4: "..sssss1..", 5: ".lllllll1.", 6: "lllllllsl." , 7: "lllllllLL.", 8: "lllllllLL." }), glance(farmer, 3)]);

  const sailor = [
    "..bbbbb...",
    ".bbbbbbb..",
    "..sssss...",
    "..sksks...",
    "..sssss...",
    ".wwwwwww..",
    "wbbbbbbbw.",
    "wwwwwwwww.",
    "sbbbbbbbs.",
    ".wwwwwww..",
    ".BBBBBBB..",
    ".BB...BB..",
    ".kk...kk..",
  ];
  def("person_sailor", { kind: "person", label: "Sailor", era: [-1500, 2100], regions: ANY, fps: 2 },
    [sailor, sailor, sailor, glance(sailor, 3)]);

  const explorer = [
    "...tttt....",
    "..tttttt...",
    ".tttttttt..",
    "..sssss....",
    "..skssggg..",
    "..ssssss...",
    ".nnnnnns...",
    "nnnnnnnnN..",
    "nngnnnnNN..",
    "nnnnnnnNN..",
    ".nnnnnnNN..",
    ".tt...tt...",
    ".NN...NN...",
  ];
  def("person_explorer", { kind: "person", label: "Explorer", era: [1400, 1950], regions: ANY, fps: 2 },
    [explorer, explorer, edit(explorer, { 4: "..sksssggg." }), explorer]);

  const pilgrim = [
    "...nnn...2",
    "..nnnnn..1",
    ".nnsssnn.1",
    ".nsksksn.1",
    ".nnsssnn.1",
    ".nnnnnnns1",
    "nnnwnnnNs1",
    "nnwwwnnNN1",
    "nnnwnnnNN1",
    "nnnnnnnNN1",
    ".nnnnnnN..",
    "..NN.NN...",
  ];
  def("person_pilgrim", { kind: "person", label: "Pilgrim", era: [-500, 2100], regions: ANY, map: { 1: "N", 2: "w" }, fps: 2 },
    [pilgrim, pilgrim, pilgrim, glance(pilgrim, 3)]);

  const plagueDoctor = [
    "..ddddd...",
    ".ddddddd..",
    "..WWWW....",
    "..WkWkwww.",
    "..WWWWwW..",
    "..WWWW....",
    ".ddddddd.1",
    "ddddddddW1",
    "ddddddddd1",
    "ddddddddd1",
    "ddddddddd1",
    ".ddddddd..",
    "..nn.nn...",
  ];
  def("person_plague_doctor", { kind: "person", label: "Plague doctor", era: [1619, 1720], regions: ["europe"], map: { 1: "n" }, fps: 2 },
    [plagueDoctor, plagueDoctor, plagueDoctor, edit(plagueDoctor, { 3: "..WWWWwww." })]);

  // ---------------------------------------------------------------- events (anchor = ground centre)
  const rat = [
    "......m.m...",
    "....mmmmmm..",
    "...mmmmmmrmm",
    "s.mmmmmmmmms",
    ".sMMMMMMMM..",
    "..sM.M..M.M.",
  ];
  def("event_plague", { kind: "event", label: "Plague", era: [-3000, 2100], regions: ANY, fps: 4 },
    [rat, edit(rat, { 3: ".smmmmmmmmms", 4: "s.MMMMMMMM..", 5: "...M.M.M.M.." })]);

  const famine = [
    "..2.....2...",
    "..21...21.2.",
    "...1...1.21.",
    "...1...1..1.",
    "...1...1..1.",
    "..1...1...1.",
    "nnnnnnnnnnnn",
    "nkNnnNknnNkn",
    "NnkNnkNnkNnN",
  ];
  def("event_famine", { kind: "event", label: "Famine", era: [-3000, 2100], regions: ANY, map: { 1: "G", 2: "y" }, fps: 2 },
    [famine, edit(famine, { 0: "...2.....2..", 1: "...1....21.2", 2: "...1...1..21" })]);

  const volcano = [
    "......3..3......",
    ".....3.33.3.....",
    "......3333......",
    ".......33.......",
    "......yoyo......",
    ".....NrorrN.....",
    ".....NNroNNK....",
    "....NNNrNNNKK...",
    "...NNNNroNNNKK..",
    "...NNNNNrNNNKKK.",
    "..NNNNNNoNNNNKKK",
    ".NNNNNNNrNNNNNKK",
    "NNNNNNNNNNNNNNKK",
  ];
  def("event_volcano", { kind: "event", label: "Eruption", era: [-10000, 2100], regions: ANY, map: { 3: "K" }, fps: 4 },
    [volcano,
     edit(volcano, { 0: ".....3..3.3.....", 1: "......33.33.....", 2: ".......333......", 4: "......oyoy......", 5: ".....NorroN.....", 7: "....NNNoNNNKK...", 8: "...NNNNrrNNNKK.." }),
     edit(volcano, { 0: "....3.3...3.3...", 1: ".....3.3333.....", 2: "......33.33.....", 3: "......y33y......", 6: ".....NNorNNK....", 9: "...NNNNNoNNNKKK.", 10: "..NNNNNNrNNNNKKK" })]);

  const fire = [
    "....o.....",
    "....oo....",
    "...ooy..o.",
    "..oyyo.oo.",
    "..oywyooo.",
    ".ooywwyoo.",
    ".oyywwyyo.",
    ".roywwyor.",
    "rroyyyyorr",
    ".rrooooorr",
    "..RrrrrrR.",
    "..R.RR.R..",
  ];
  def("event_fire", { kind: "event", label: "Fire", era: [-10000, 2100], regions: ANY, fps: 4 },
    [fire,
     edit(fire, { 0: ".....o....", 1: "....oo..o.", 2: "...oyo..o.", 3: "..ooyy.oo." }),
     edit(fire, { 0: "...o......", 1: "...oo.....", 2: "..oooy.o..", 3: "..oyyooo.." }),
     edit(fire, { 0: "......o...", 1: "....o.oo..", 2: "...ooyoo..", 3: "..oyyyoo.." })]);

  const battle = [
    "w..........w",
    "mw........wm",
    ".mw......wm.",
    "..mw....wm..",
    "...mw..wm...",
    "....mwwm....",
    "....wmmw....",
    "..gwm..mwg..",
    "..ggm..mgg..",
    ".G..g..g..G.",
    "G..........G",
  ];
  def("event_battle", { kind: "event", label: "Battle", era: [-3000, 2100], regions: ANY, fps: 3 },
    [battle, edit(battle, { 4: "...mw.ymm...", 5: "....mwym....", 6: "...ywmmwy...", 7: "..gwmy.mwg.." })]);

  const flood = [
    ".....rrR......",
    "....rrrRR.....",
    "....rrkRR.....",
    "bc.cbbbbbc.cb.",
    "bbcbbbcbbbcbbb",
    "BbbbbbbbbbbbbB",
  ];
  def("event_flood", { kind: "event", label: "Flood", era: [-10000, 2100], regions: ANY, fps: 2 },
    [flood, edit(flood, { 3: ".cb.cbbbbbc.c.", 4: "bbbcbbbbcbbbcb" })]);

  const quake = [
    "...m......M...",
    "..mmM....mmM..",
    "nnnnnnk.nnnnnn",
    "nnnnnkk..knnnn",
    "nnnnnnkk.knnnn",
    "NNNNNNNk.kNNNN",
  ];
  def("event_earthquake", { kind: "event", label: "Earthquake", era: [-10000, 2100], regions: ANY, fps: 6 },
    [quake, edit(quake, { 0: "....m.....M...", 1: "...mmM...mmM.." })]);

  // ---------------------------------------------------------------- lookup and checks
  const KINDS = ["army", "ship", "caravan", "city", "ruin", "wonder", "person", "event"];

  // pick: the sprite of this kind whose era covers the year, preferring the region; falls back to the nearest era.
  // where narrows by exact meta values, e.g. pick("city", 1200, "europe", { size: 3 }) or { landmark: true }.
  function pick(kind, year, region, where) {
    let best = null, bestScore = Infinity;
    for (const name in S) {
      const s = S[name];
      if (s.kind !== kind) continue;
      if (where && Object.keys(where).some((k) => (s[k] == null ? false : s[k]) !== where[k])) continue;
      const gap = year < s.era[0] ? s.era[0] - year : year > s.era[1] ? year - s.era[1] : 0;
      const fit = !region || s.regions.includes(region) ? 0 : s.regions.includes("any") ? 1 : 2;
      const score = gap * 100 + fit * 1000 + (s.era[1] - s.era[0]) / 1e4;
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

  // Join the shared registry in place; a sprite already registered there (the starter set) keeps its name.
  const shared = (global.PIXEL_SPRITES = global.PIXEL_SPRITES || {});
  for (const name in S) if (!(name in shared)) shared[name] = S[name];
  global.PIXEL_SPRITE_LIBRARY = { sprites: S, kinds: KINDS, pick, validate };
})(typeof window !== "undefined" ? window : globalThis);
