// Starter pixel sprites for the Atlas map (format in SPEC.md). Keys come from palette.js KEYS;
// x / X are the team colour and its shade. The sprite library thread adds more under the same global.
(function (global) {
  const S = global.PIXEL_SPRITES = global.PIXEL_SPRITES || {};
  const add = (name, ax, ay, ...frames) => { if (!S[name]) S[name] = { w: frames[0][0].length, h: frames[0].length, ax, ay, frames }; };

  // ---- settlements, by size ----
  add("city_village", 4, 6, [
    "....k....",
    "...kRk...",
    "..kRrrk..",
    ".kRrrrrk.",
    "..kwwWk..",
    "..kwNWk..",
    "..kkkkk..",
  ]);
  add("city_town", 6, 9, [
    "....kk.......",
    "....kxk......",
    "....k........",
    "...kmmk......",
    "...kmMk..k...",
    ".k.kmMk.kRk..",
    "kRkkmMkkRrrk.",
    "kwWkmMkkwwWk.",
    "kNWkmNkkwNWk.",
    "kkkkkkkkkkkk.",
  ]);
  add("city_city", 7, 11, [
    "......kk.......",
    "......kxxk.....",
    "......kk.......",
    ".k.k.kmmk.k.k..",
    ".kmmmkmmMkmmMk.",
    ".kmMMkmMMkmMMk.",
    ".kmmMkmmMkmmMk.",
    "kRkmMkmkMkmMkRk",
    "kwkmMkmNMkmMkwk",
    "kwkmMkmNMkmMkwk",
    "kkkkkkkkkkkkkkk",
  ]);
  add("city_metropolis", 8, 12, [
    ".......kk.......",
    "......kggk......",
    ".....kgyygk.....",
    "....kgyyggGk....",
    "....kgggGGGk....",
    ".k..kwwWwwWk..k.",
    "kmk.kwkWwkWk.kmk",
    "kmMkkwkWwkWkkmMk",
    "kmMkwwwWwwWWkmMk",
    "kmMkkkkWwkkkkmMk",
    "kmMkmmmNNmmMkmMk",
    "kkkkkkkkkkkkkkkk",
  ]);
  add("ruin", 5, 7, [
    "..k.........",
    ".kzk....k...",
    ".kzk...kzk..",
    ".kzWk..kzk..",
    ".kzWk..kWk..",
    "kkzWkk.kWkk.",
    "kzzzWWkkzzWk",
    "kkkkkkkkkkkk",
  ]);
  add("wonder_pyramid", 7, 8, [
    "......k.......",
    ".....kyk......",
    "....kytGk.....",
    "...kyttGGk....",
    "..kytttGGGk...",
    ".kyttttGGGGk..",
    "kyyttttGGGGGk.",
    "kkkkkkkkkkkkk.",
  ]);
  add("wonder_temple", 6, 9, [
    "...kkkkkk...",
    "..kwwwwwWk..",
    ".kwwwwwwWWk.",
    "kkkkkkkkkkkk",
    ".kwk.kw.kwk.",
    ".kWk.kW.kWk.",
    ".kWk.kW.kWk.",
    "kkkkkkkkkkkk",
    "kwwwwwwwwWWk",
    "kkkkkkkkkkkk",
  ]);

  // ---- war: two soldiers in team colours trading blows ----
  const soldier = [
    [
      "...m..",
      "..kmk.",
      ".kmmMk",
      ".ksSk.",
      "kxxXk.",
      "kxxXkm",
      ".kxXkm",
      ".kNkNk",
      ".k..k.",
    ], [
      "......",
      "..kmk.",
      ".kmmMk",
      ".ksSkm",
      "kxxXkm",
      "kxxXk.",
      ".kxXk.",
      ".kNkNk",
      ".k..k.",
    ],
  ];
  add("army", 2, 8, soldier[0], soldier[1]);
  add("army_flip", 3, 8, soldier[0].map(r => [...r].reverse().join("")), soldier[1].map(r => [...r].reverse().join("")));
  add("clash", 2, 2, [".y.", "yvy", ".y."], ["v.v", ".y.", "v.v"]);
  add("banner", 1, 9, [
    "kkkkk",
    "kxxxk",
    "kxXxk",
    "kxxXk",
    "kkxkk",
    "k.k..",
    "k....",
    "k....",
    "k....",
    "k....",
  ]);
  add("fort", 6, 8, [
    "k.k.k..k.k.k",
    "kmkmk..kmkmk",
    "kmmMkkkkmmMk",
    "kmmMmmmMmmMk",
    "kmmMmmmMmmMk",
    "kmmMmkkMmmMk",
    "kmmMkNNkmmMk",
    "kkkkkkkkkkkk",
  ]);

  // ---- trade and travel ----
  add("ship", 5, 8, [
    ".....k.....",
    "....kwk....",
    "...kwwWk...",
    "..kwwwWWk..",
    ".....n.....",
    "knnnnnnnnNk",
    ".kNnnnnnNk.",
    "..kkkkkkk..",
    "...........",
  ], [
    ".....k.....",
    "....kwk....",
    "...kwwWk...",
    "..kwwwWWk..",
    ".....n.....",
    "knnnnnnnnNk",
    ".kNnnnnnNk.",
    "..kkkkkkk..",
    ".c.....c...",
  ]);
  add("caravan", 5, 7, [
    "........kk.",
    "..kkk..ktk.",
    ".ktttk.kk..",
    "kttttttk...",
    ".kttttk....",
    ".kk..kk....",
    ".k...k.....",
  ], [
    "........kk.",
    "..kkk..ktk.",
    ".ktttk.kk..",
    "kttttttk...",
    ".kttttk....",
    "..kkkk.....",
    "..k.k......",
  ]);
  add("market", 5, 7, [
    "kkkkkkkkk",
    "krwrwrwrk",
    "kkkkkkkkk",
    ".k.....k.",
    ".k.gyg.k.",
    ".knnnnnk.",
    ".kkkkkkk.",
  ]);

  // ---- plague, famine, fire, volcano ----
  add("plague", 4, 4, [
    ".kkk....k",
    "kMmmk..k.",
    "kmmmMkkk.",
    ".kMMMk...",
    "..k.k....",
  ], [
    ".kkk.....",
    "kMmmk..kk",
    "kmmmMkk..",
    ".kMMMk...",
    ".k...k...",
  ]);
  add("skull", 3, 6, [
    ".kkkkk.",
    "kvvvvzk",
    "kvkvkzk",
    "kvvvvzk",
    ".kvkvk.",
    ".kkkkk.",
  ]);
  add("volcano", 6, 8, [
    "....y.y.....",
    ".....ro.....",
    "....krRk....",
    "...knrRNk...",
    "..knnnNNNk..",
    ".knnnnnNNNk.",
    "knnnnnnNNNNk",
    "kkkkkkkkkkkk",
  ], [
    "...y...y....",
    "....oyr.....",
    "....krRk....",
    "...knrRNk...",
    "..knnnNNNk..",
    ".knnnnnNNNk.",
    "knnnnnnNNNNk",
    "kkkkkkkkkkkk",
  ]);
  add("fire", 3, 6, ["...y...", "..yoy..", ".yoroy.", ".orRro.", "korRrok", ".kkkkk."], ["..y....", "..yoy..", ".yoroy.", "yorRro.", "korRrok", ".kkkkk."]);

  // ---- ideas and people ----
  add("scroll", 4, 5, [
    ".kkkkkkk.",
    "kWwwwwwWk",
    ".kwkkkwk.",
    ".kwwwwwk.",
    "kWwwwwwWk",
    ".kkkkkkk.",
  ]);
  add("shrine", 4, 8, [
    "....k....",
    "...kgk...",
    "..kgggk..",
    ".kkkkkkk.",
    ".kwkwkwk.",
    ".kwkwkwk.",
    "kkkkkkkkk",
    "kwwwwwwWk",
    "kkkkkkkkk",
  ]);
  add("person", 2, 7, [
    ".kk..",
    "ksSk.",
    ".kk..",
    "kxxXk",
    "kxxXk",
    ".kXk.",
    ".k.k.",
    ".....",
  ]);
  add("ruler", 2, 7, [
    "kgyk.",
    "ksSk.",
    ".kk..",
    "kxxXk",
    "kxgXk",
    ".kXk.",
    ".k.k.",
    ".....",
  ]);
})(typeof window !== "undefined" ? window : globalThis);
