// Pixel map palette: one set of colours for terrain, borders and sprites. See SPEC.md.
(function (global) {
  // Sprite keys: one character per colour. 'x'/'X' are the team colour and its shade, set per sprite instance.
  const KEYS = {
    k: "#221f1a", K: "#4a4035", w: "#f6f0dc", W: "#d9cfb2", s: "#e0a878", S: "#b07850",
    r: "#b8382a", R: "#7c2018", o: "#d8782c", y: "#e8c050", g: "#c89a2a", G: "#8a6418",
    l: "#7fae4a", L: "#4f7a32", e: "#2f5a2e", b: "#3a6a9a", B: "#25466a", c: "#7fc0d0",
    n: "#8a5a32", N: "#5e3a1e", t: "#c8a46a", m: "#9aa0a2", M: "#62686c", p: "#7a4a8a", P: "#4e2c5c",
    v: "#e8e4dc", d: "#3a3430", z: "#c8c8b0",
  };
  // Terrain classes (ids from SPEC.md): [dark, mid, light].
  const TERRAIN = [
    ["#203c50", "#264658", "#2c4e62"], // 0 deep ocean
    ["#2f5a6e", "#356478", "#3c6c80"], // 1 sea
    ["#4a8088", "#558e94", "#64a0a0"], // 2 shelf
    ["#3f7690", "#4a84a0", "#5894ac"], // 3 lake
    ["#3f7690", "#4a84a0", "#5894ac"], // 4 river
    ["#c8d4d8", "#e4eaea", "#f8f8f4"], // 5 ice
    ["#8a8e72", "#a0a484", "#b4b896"], // 6 tundra
    ["#2e4a36", "#3a5a40", "#48684a"], // 7 boreal forest
    ["#3c6630", "#4a783a", "#5a8a44"], // 8 temperate forest
    ["#22582c", "#2c6834", "#387a3e"], // 9 tropical forest
    ["#7a9a46", "#8eae54", "#a2c064"], // 10 grassland
    ["#a8a058", "#bcb468", "#cec67a"], // 11 steppe, savanna
    ["#d2b06a", "#e2c682", "#efd99c"], // 12 sand desert
    ["#a8825a", "#bc966a", "#ccaa80"], // 13 rock desert
    ["#5a7a5a", "#688a66", "#7a9a74"], // 14 wetland
    ["#8e8a50", "#a49c5e", "#b8ae70"], // 15 hills
    ["#6e5a48", "#86705a", "#a08a72"], // 16 mountains
    ["#b8b4ac", "#dcd8d0", "#f4f2ec"], // 17 high peaks
  ];
  const UI = { ink: "#221f1a", paper: "#f6f0dc", coast: "#e8e0c0", foam: "#a8d0cc", border: "#2a2018", grid: "#ffffff" };
  // Realm tints: muted heraldic colours that read on any terrain.
  const REALM = ["#c0504a", "#d89a3a", "#6a9a4a", "#4a7ab0", "#8a62a8", "#c87848", "#4a9a94", "#a8a040",
                 "#d47a6a", "#a85a88", "#6a80c8", "#b89058", "#7a5a3a", "#5a6a7a", "#b0486a", "#3a7a5a"];
  global.PIXEL_PALETTE = { KEYS, TERRAIN, UI, REALM };
})(typeof window !== "undefined" ? window : globalThis);
