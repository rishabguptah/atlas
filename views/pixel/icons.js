// Pixel icons shared by every thread: the chrome (chips, tabs, buttons), the map key, panel headings, labels and marks.
// 12 x 12 art px text grids. x = the icon's tint (a lens tincture or currentColor), X = its shade, k ink, w vellum,
// W vellum shade, y gold highlight, g gold, G gold shadow, '.' clear. The six lens family emblems are land (a mountain),
// power (a crown), wealth (a holed coin), peoples (two figures), mind (an open book) and shocks (a bolt).
//
//   PIXEL_ICONS.svg(name, cls)                     -> inline <svg class="ico ...">; tint with CSS: .ico { --t: colour }
//   PIXEL_ICONS.draw(ctx, name, x, y, px, colours)  -> paint on a canvas; colours = { x, X, k, w, ... } (defaults below)
(function (global) {
  const GRIDS = {
    play: ["............", "..kk........", "..kwk.......", "..kxxk......", "..kxxxk.....", "..kxxxxk....", "..kxxxxk....", "..kxxxk.....", "..kxxk......", "..kXk.......", "..kk........", "............"],
    pause: ["............", "..kkk..kkk..", "..kwk..kwk..", "..kxk..kxk..", "..kxk..kxk..", "..kxk..kxk..", "..kxk..kxk..", "..kxk..kxk..", "..kxk..kxk..", "..kXk..kXk..", "..kkk..kkk..", "............"],
    back: ["............", ".kk.....kk..", ".kxk...kxk..", ".kxxk.kxxk..", ".kxxxkxxxk..", ".kxxxxxxxk..", ".kxxxxxxxk..", ".kxxxkxxxk..", ".kxxk.kxxk..", ".kXk...kXk..", ".kk.....kk..", "............"],
    land: ["............", ".....kk.....", "....kwwk....", "...kwwxXk...", "...kxxxXk.k.", "..kxxxxXXkwk", "..kxxxXXXkxk", ".kxxxxXXXXXk", ".kxxxXXXXXXk", "kxxxXXXXXXXk", "kkkkkkkkkkkk", "............"],
    power: ["............", ".k...kk...k.", "kyk.kyyk.kyk", "kxk.kxxk.kxk", "kxxkxxxxkxxk", "kxxxxxxxxxxk", "kxxxxxxxxxxk", "kxyxxyyxxyxk", "kxxxxxxxxxxk", "kXXXXXXXXXXk", "kkkkkkkkkkkk", "............"],
    wealth: ["....kkkk....", "..kkyyyykk..", ".kyyxxxxxXk.", ".kyxxxxxxXk.", "kyxxxkkxxxXk", "kyxxk..kxxXk", "kyxxk..kxxXk", "kyxxxkkxxxXk", ".kxxxxxxxXk.", ".kXxxxxxXXk.", "..kkXXXXkk..", "....kkkk...."],
    peoples: ["............", "..kk....kk..", ".kwxk..kwxk.", ".kxxk..kxxk.", "..kk....kk..", ".kxxk..kxxk.", "kxxxxkkxxxxk", "kxxxxkkxxxxk", "kxXXxkkxXXxk", ".kXk....kXk.", ".kXk....kXk.", ".kk......kk."],
    mind: ["............", "............", ".kkkk..kkkk.", "kwwwwkkwwwwk", "kwkkwxxwkkwk", "kwwwwxxwwwwk", "kwkkwxxwkkwk", "kwwwwxxwwwwk", "kxxxxxxxxxxk", "kXXXXkkXXXXk", ".kkkk..kkkk.", "............"],
    shocks: ["......kkkk..", ".....kyxk...", "....kyxk....", "...kyxk.....", "..kyxxkkkk..", ".kxxxxxxk...", ".kkkkxxk....", "....kxk.....", "...kxk......", "..kXk.......", "..kk........", "............"],
    ask: [".........kk.", "........kwk.", ".......kwxk.", "......kwxk..", ".....kwxk...", "....kwxk....", "...kwxk.....", "...kxk......", "..kkk.......", ".kk.........", "kk..kkkkkk..", "............"],
    year: [".kkkkkkkkkk.", ".kggggggggk.", "..kwwwwwwk..", "...kxxxxk...", "....kxxk....", ".....kk.....", ".....kk.....", "....kwxk....", "...kwxxxk...", "..kxxxxxxk..", ".kggggggggk.", ".kkkkkkkkkk."],
    here: ["..kk........", "..kgkkkkk...", "..kgkxxxxk..", "..kgkxwxxxk.", "..kgkxxxxk..", "..kgkXXXk...", "..kgkkkk....", "..kgk.......", "..kgk.......", "..kgk.......", ".kkkkk......", "............"],
    codex: ["............", ".kkkkkkkkk..", ".kxxxxxxxkk.", ".kxyyyyyxkwk", ".kxyxxxyxkwk", ".kxyyyyyxkwk", ".kxxxxxxxkgk", ".kxxxxxxxkwk", ".kxxxxxxxkwk", ".kXXXXXXXkwk", ".kkkkkkkkkk.", "............"],
    whatif: [".kk......kk.", "kxxk....kxxk", ".kxxk..kxxk.", "..kxxkkxxk..", "...kxxxxk...", "....kxxk....", "....kxxk....", "....kxxk....", "....kxxk....", "....kXXk....", "....kXXk....", "....kkkk...."],
    die: ["............", ".kkkkkkkkkk.", ".kwwwwwwwwk.", ".kwkkwwwwwk.", ".kwkkwwwwwk.", ".kwwwkkwwwk.", ".kwwwkkwwwk.", ".kwwwwwkkwk.", ".kwwwwwkkwk.", ".kWWWWWWWWk.", ".kkkkkkkkkk.", "............"],
    key: ["............", ".kkkk.......", "kyyyyk......", "kykkyk......", "kykkykkkkkk.", "kyyyyyyyyyyk", ".kkkkkkykyk.", "......kykyk.", ".......k.k..", "............", "............", "............"],
    focus: ["............", "............", "...kkkkkk...", ".kkwwwwwwkk.", "kwwwkkkkwwwk", "kwwkxxwkkwwk", "kwwkxxkkkwwk", "kwwwkkkkwwwk", ".kkwwwwwwkk.", "...kkkkkk...", "............", "............"],
    close: ["............", ".kk......kk.", "kxxk....kxxk", ".kxxk..kxxk.", "..kxxkkxxk..", "...kxxxxk...", "...kxxxxk...", "..kxxkkxxk..", ".kxxk..kxxk.", "kXXk....kXXk", ".kk......kk.", "............"],
    star: [".....kk.....", "....kyyk....", "....kyyk....", "kkkkkyykkkkk", "kyyyyyyyyyyk", ".kyyyyyyyyk.", "..kyyyyyyk..", "..kyygGyyk..", ".kyyGkkGyyk.", ".kyGk..kGyk.", "kkkk....kkkk", "............"],
    next: ["............", "....kk......", "....kxk.....", "....kxxk....", "kkkkkxxxk...", "kwwwwxxxxk..", "kxxxxxxxxxk.", "kXXXXxxxxk..", "kkkkkxxxk...", "....kxxk....", "....kXk.....", "....kk......"],
    seal: ["....kkkk....", "..kkxxxxkk..", ".kxxyxxyxxk.", ".kxxxyyxxxk.", "kxxyyxxyyxxk", "kxxxyyyyxxxk", "kxxyyxxyyxxk", ".kxxxyyxxxk.", ".kxxyxxyxxk.", "..kkxxxxkk..", "...kXkkXk...", "...kk..kk..."],
    stories: ["............", ".kkkkkkkkk..", "kyGkwwwwwwk.", "kGGkwkkkwwk.", ".kkkwwwwwwk.", "...kwkkkkwk.", "...kwwwwwwk.", "...kwkkkwwk.", "...kwwwwwwk.", "..kkkkkkkkkk", "..kwwwwwwkyk", "...kkkkkkkk."],
    objects: ["...kkkkkk...", "....kxxk....", ".kk.kxxk.kk.", "k..kxxxxk..k", "k.kxyxxxXk.k", ".kkxyxxxXkk.", "..kxyxxxXk..", "..kxxxxxXk..", "...kxxxXk...", "....kxXk....", "....kxXk....", "...kkkkkk..."],
    lens: ["...kkkk.....", "..kwwwWk....", ".kwyywwWk...", ".kwywwwWk...", ".kwwwwwWk...", ".kwwwwWWk...", "..kWWWWk....", "...kkkkGk...", ".......kGk..", "........kGk.", ".........kGk", "..........k."],
    compare: [".....kk.....", ".....kk.....", "kkkkkkkkkkkk", "k....kk....k", "k....kk....k", "kk...kk...kk", "xxk..kk..kxx", "kxk..kk..kxk", ".k...kk...k.", ".....kk.....", "...kkkkkk...", "..kxxxxxxk.."],
    life: ["....kkkk....", "...kwwwwk...", "...kwkwkk...", "...kwwwwk...", "....kkkk....", "..kkxxxxkk..", ".kxxxxxxxxk.", ".kxkxxxxkxk.", ".kxkxxxxkxk.", "..kkxXXxkk..", "...kxkkxk...", "...kkk.kkk.."],
    compass: [".....kk.....", "....kyyk....", "....kyyk....", "...kkyykk...", ".kkwkyykwkk.", "kwwwwkkxxxxk", "kwwwwkkxxxxk", ".kkwkXXkwkk.", "...kkXXkk...", "....kXXk....", "....kXXk....", ".....kk....."],
  };
  const DEFAULT = { k: "#221f1a", w: "#f6f0dc", W: "#d9cfb2", y: "#e8c050", g: "#d8a32c", G: "#8a6418", x: "#4a4035", X: "#2c2620" };
  // One rect per horizontal run, classed by key so CSS can recolour it.
  const cache = {};
  function svg(name, cls) {
    const rows = GRIDS[name]; if (!rows) return "";
    let body = cache[name];
    if (!body) {
      body = "";
      rows.forEach((r, y) => { for (let x = 0; x < r.length;) { const ch = r[x]; if (ch === ".") { x++; continue; } let x2 = x; while (x2 < r.length && r[x2] === ch) x2++; body += `<rect class="${ch}" x="${x}" y="${y}" width="${x2 - x}" height="1"/>`; x = x2; } });
      cache[name] = body;
    }
    return `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
  }
  function draw(ctx, name, x0, y0, px = 1, colours = {}) {
    const rows = GRIDS[name]; if (!rows) return;
    const C = Object.assign({}, DEFAULT, colours);
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch === ".") continue; ctx.fillStyle = C[ch] || C.x; ctx.fillRect(x0 + x * px, y0 + y * px, px, px); } });
  }
  // The family emblem for a lens family id.
  const FAMILY = { land: "land", power: "power", wealth: "wealth", peoples: "peoples", mind: "mind", shocks: "shocks" };
  global.PIXEL_ICONS = { GRIDS, svg, draw, FAMILY, names: Object.keys(GRIDS) };
})(typeof window !== "undefined" ? window : globalThis);
