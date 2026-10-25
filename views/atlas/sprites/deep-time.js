// Deep-time sprites for the pixel map: ice-age animals, hunter-gatherer bands, archaic humans, cave art, first
// monuments and farms. Same grid rules as views/pixel/sprites-library.js: fills only, "." transparent, the dark outline
// ("k") is baked onto every transparent pixel touching a filled one, digits are bare pixels mapped by meta.map.
(function (global) {
  const reg = (global.PIXEL_SPRITES = global.PIXEL_SPRITES || {});
  function bake(frame, map) {
    const h = frame.length + 2, w = frame[0].length + 2;
    const g = [".".repeat(w)].concat(frame.map(r => "." + r + "."), [".".repeat(w)]).map(r => r.split(""));
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== "." && !/[0-9]/.test(g[y][x]);
    return g.map((r, y) => r.map((c, x) => /[0-9]/.test(c) ? map[c] : c === "." && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ? "k" : c).join(""));
  }
  function def(name, meta, frames) {
    const baked = frames.map(f => bake(f, meta.map || {}));
    const h = baked[0].length, w = baked[0][0].length;
    if (!(name in reg)) reg[name] = Object.assign({ regions: ["any"], fps: 3 }, meta, { w, h, ax: w >> 1, ay: h - 1, frames: baked });
  }
  const step = (f, rows) => f.map((r, i) => (i in rows ? rows[i] : r));

  // Woolly mammoth, facing right: high domed head, sloping back, curled tusks, shaggy legs.
  const MAMMOTH = [
    "...........NNN....",
    "......NNNNNnnnN...",
    "...NNNnnnnnnnnnN..",
    ".NNnnnnnnnnnnnknN.",
    "NnnnnnnnnnnnnnnnN.",
    "NnnnnnnnnnnnnnnnnN",
    "NnnnnnnnnnnnnNNnnN",
    "NNnnnnnnnnnnNWWNnN",
    ".NNNnnnnnnnNNW.WnN",
    ".NnN.NnN.NnN.WW.nN",
    ".NnN.NnN.NnN....N.",
    ".NNN.NNN.NNN......",
  ];
  def("deep_mammoth", { kind: "animal", label: "Woolly mammoth", era: [-400000, -2000] }, [MAMMOTH, step(MAMMOTH, { 9: ".NnN.NnN..NnN.WWnN", 10: ".NnN..NnN.NnN...N.", 11: ".NNN..NNN.NNN....." })]);

  // Woolly rhinoceros: long low body, two horns on the snout.
  const RHINO = [
    ".....NNNNNN.......",
    "...NNnnnnnnNN.....",
    ".NNnnnnnnnnnnNN.w.",
    "NnnnnnnnnnnnnnnNww",
    "NnnnnnnnnnnnnknnNw",
    "NnnnnnnnnnnnnnnnnN",
    ".NnnnnnnnnnnnNNNN.",
    ".NnN.NnN.NnN.NnN..",
    ".NNN.NNN.NNN.NNN..",
  ];
  def("deep_rhino", { kind: "animal", label: "Woolly rhinoceros", era: [-400000, -12000] }, [RHINO]);

  // Giant deer ("Irish elk"): palmate antlers wider than the body.
  const ELK = [
    "tt.t.....t.t.tt.",
    ".tttt...tttt....",
    "...ttt.ttt......",
    ".....tnnt.......",
    ".....nknnn......",
    "....nnnnN.......",
    ".nnnnnnnN.......",
    "nnnnnnnnN.......",
    "NnnnnnnnN.......",
    ".nN..nN.........",
    ".nN..nN.........",
  ];
  def("deep_elk", { kind: "animal", label: "Giant deer", era: [-400000, -5700] }, [ELK]);

  // Cave bear, heavy and hump-shouldered.
  const BEAR = [
    "...NNNNN........",
    ".NNKKKKKNN..NN..",
    "NKKKKKKKKKNNKKN.",
    "NKKKKKKKKKKKKkKN",
    "NKKKKKKKKKKKKKKK",
    "NKKKKKKKKKKKNKN.",
    ".NKKN.NKKN.NKN..",
    ".NNN..NNN..NNN..",
  ];
  def("deep_bear", { kind: "animal", label: "Cave bear", era: [-400000, -22000] }, [BEAR]);

  // Sabre-toothed cat (Smilodon).
  const SMILO = [
    "..........ttt...",
    "t........ttktt..",
    ".t.......ttttnn.",
    "..tttttttttttw..",
    ".ttttttttttttw..",
    ".tnttttttttn....",
    ".tn.tn...tn.tn..",
    ".nn.nn...nn.nn..",
  ];
  def("deep_smilodon", { kind: "animal", label: "Sabre-toothed cat", era: [-2500000, -8000] }, [SMILO]);

  // Giant ground sloth (Megatherium), reared up on its hind legs.
  const SLOTH = [
    ".....nnn....",
    "....nnknn...",
    "....nnnn....",
    "...nnnnnn.t.",
    "..nnnnnnnnt.",
    "..nnnnnnnn..",
    ".NnnnnnnnN..",
    ".NnnnnnnnN..",
    "NNnnnnnnnN..",
    "N.NnnnnnN...",
    "...NnN.NnN..",
    "..ttNN.tNN..",
  ];
  def("deep_sloth", { kind: "animal", label: "Giant ground sloth", era: [-2000000, -8000] }, [SLOTH]);

  // Diprotodon: a rhino-sized wombat of Ice Age Australia.
  const DIPRO = [
    "....mmmmmmm.....",
    "..mmMMMMMMMmm...",
    ".mMMMMMMMMMMMmm.",
    "mMMMMMMMMMMMMkMm",
    "mMMMMMMMMMMMMMMm",
    ".MMMMMMMMMMMMMt.",
    ".MMm.MMm.MMm.Mm.",
    ".mm..mm..mm..mm.",
  ];
  def("deep_diprotodon", { kind: "animal", label: "Diprotodon", era: [-2000000, -40000] }, [DIPRO]);

  // A band of hunter-gatherers on the move: two walking poses.
  const BAND = [
    "1....1.....1",
    "1.ss.1..ss.1",
    "1.ss.1..ss.1",
    "1nnnns.nnnns",
    ".nnnn..nnnn.",
    ".nnnn..nnnn.",
    ".n..n..n..n.",
    ".s..s..s..s.",
  ];
  def("deep_band", { kind: "person", label: "Hunter-gatherer band", era: [-300000, -4000], map: { 1: "K" }, fps: 4 },
    [BAND, step(BAND, { 6: "..nn....nn..", 7: "..ss....ss.." })]);

  // Archaic people (Neanderthals, Denisovans, the small hominins): fur cloaks, a hand axe.
  const ARCH = [
    "..NNN...",
    ".NsssN..",
    ".SsksS..",
    ".SsssS..",
    "NNNNNNN.",
    "NnnnnnNm",
    "NnnnnnNm",
    ".nnnnn..",
    ".S...S..",
    ".SS..SS.",
  ];
  def("deep_archaic", { kind: "person", label: "Archaic humans", era: [-400000, -30000] }, [ARCH]);

  // Painted cave: a dark cave mouth with red ochre hands and an animal on the rock.
  const CAVE = [
    "....mmmmmmmm....",
    "..mmmmmmmmmmmm..",
    ".mmrmmmmmmmrmmm.",
    "mmrrrmmmmmrrrmmm",
    "mmmrmmKKKmmrmmmm",
    "mmmmmKdddKmmmmmm",
    "mmmmKddddddKmmMm",
    "mmMmKdddddddKmMm",
    "MMMMKdddddddKMMM",
  ];
  def("deep_cave", { kind: "wonder", label: "Painted cave", era: [-60000, 2100] }, [CAVE]);

  // T-shaped pillars of Göbekli Tepe in their stone ring.
  const TPILLAR = [
    ".wwwww....wwwww.",
    ".wWWWW....wWWWW.",
    "...wW......wW...",
    "...wW......wW...",
    "...wW......wW...",
    "..mwWmmmmmmwWm..",
    ".mmwWmmmmmmwWmm.",
    "mmmmmmmmmmmmmmmm",
  ];
  def("deep_pillars", { kind: "wonder", label: "Stone pillars", era: [-9600, 2100] }, [TPILLAR]);

  // Camp: hide tent and a fire that flickers.
  const CAMP = [
    "...n.......",
    "..nnn......",
    ".nttnn.....",
    ".ttttnn.2..",
    "tttdttn.o2.",
    "tttdttnoyo.",
    "nnnnnnnnnn.",
  ];
  def("deep_camp", { kind: "city", label: "Camp", size: 1, era: [-300000, -4000], map: { 2: "y" }, fps: 4 },
    [CAMP, step(CAMP, { 3: ".ttttnn..2.", 4: "tttdttn.yo.", 5: "tttdttnoyy." })]);

  // First farms: a wheat sheaf by a mud-brick hut.
  const FARM = [
    "..y.y.......",
    ".yyyyy..nn..",
    "..yyy..nnnn.",
    "..lyl.tttttt",
    "..lyl.ttdttt",
    ".lllll.tdtt.",
    "lllllllllll.",
  ];
  def("deep_farm", { kind: "city", label: "First farm", size: 1, era: [-11000, 2100] }, [FARM]);

  // Nothing at all: a pin that is only its label (names of land bridges and ice sheets).
  def("deep_label", { kind: "event", label: "Name only", era: [-400000, 2100] }, [["."]]);
})(typeof window !== "undefined" ? window : globalThis);
