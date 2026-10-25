// Pixel HUD for the map: a minimap (where you are in the world), a compass and a scale bar, drawn in the same
// art-pixel style as the map (1 art px = PX CSS px). Sits in the map's right-hand corners, above the SVG, below the caption.
//
//   const hud = PixelHUD(mapEl, projection, { px: 3, tile: dataURI, palette, fly(view) })
//   hud.update(transform)     on zoom end and on zoom frames (cheap: the minimap terrain is drawn once per size)
//   hud.remove()
// tile: the terrain L0 raster (R = terrain class, equirectangular, row 0 = 90N). fly({lon, lat, zoom}) moves the map.
(function (global) {
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const STYLE = `
.pxhud { position: absolute; pointer-events: none; font-family: "Silkscreen", "Pixelify Sans", ui-monospace, monospace; color: #f6f0dc; }
.pxhud canvas { image-rendering: pixelated; display: block; }
.pxhud .hit { pointer-events: auto; cursor: pointer; }
.pxhud-br { right: 10px; bottom: 10px; display: grid; justify-items: end; gap: 6px; }
.pxhud-tr { right: 10px; top: 10px; }
.pxhud .scale { display: grid; justify-items: start; gap: 2px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; text-shadow: 1px 1px 0 #221f1a, -1px 1px 0 #221f1a, 1px -1px 0 #221f1a, -1px -1px 0 #221f1a; }
.pxhud .mini[hidden] { display: none; }
@media (max-width: 640px) { .pxhud .mini { display: none; } .pxhud-tr { transform: scale(.67); transform-origin: top right; } }
`;
  // Compass rose, 15 x 15: k ink, w paper, r red needle, g gold, d shade.
  const ROSE = [
    ".....kkkkk.....", "....kwwrwwk....", "....k.wrw.k....", "...k..rrr..k...", "..k...rrr...k..", ".k...grrrd...k.",
    "kwwgggrkrdddwwk", "k.....kgk.....k", "kwwdddwkwgggwwk", ".k...dwwwg...k.", "..k...www...k..", "...k..www..k...",
    "....k.wdw.k....", "....kwwdwwk....", ".....kkkkk.....",
  ];
  const ROSE_C = { k: "#221f1a", w: "#f6f0dc", r: "#b8382a", g: "#e8c050", d: "#8a6418" };
  // The N above the rose, 5 x 5.
  const N = ["k...k", "kk..k", "k.k.k", "k..kk", "k...k"];

  function PixelHUD(mapEl, projection, opts = {}) {
    const PX = opts.px || 3, PAL = opts.palette || global.PIXEL_PALETTE;
    if (!document.getElementById("pxhud-style")) { const st = document.createElement("style"); st.id = "pxhud-style"; st.textContent = STYLE; document.head.appendChild(st); }
    const br = document.createElement("div"), tr = document.createElement("div");
    br.className = "pxhud pxhud-br"; tr.className = "pxhud pxhud-tr";
    // Right after the SVG, so the guide's caption and other map chrome stay on top of the HUD.
    const svg = mapEl.querySelector(":scope > svg");
    if (svg) svg.after(tr, br); else mapEl.append(tr, br);

    // ---------- compass: click for the whole world ----------
    const cc = document.createElement("canvas"), cw = 19, ch = 25;
    cc.width = cw; cc.height = ch; cc.className = "hit"; Object.assign(cc.style, { width: cw * PX + "px", height: ch * PX + "px" });
    cc.title = "North is up. Click for the whole world"; cc.setAttribute("role", "button"); cc.setAttribute("aria-label", "Compass: show the whole world"); cc.tabIndex = 0;
    {
      const x = cc.getContext("2d");
      // A small dark plate with a light rim, like an RPG window.
      x.fillStyle = "#221f1a"; x.fillRect(1, 0, cw - 2, ch); x.fillRect(0, 1, cw, ch - 2);
      x.fillStyle = "#3a3430"; x.fillRect(2, 2, cw - 4, ch - 4);
      x.fillStyle = "#c8a46a"; x.fillRect(2, 1, cw - 4, 1); x.fillRect(2, ch - 2, cw - 4, 1); x.fillRect(1, 2, 1, ch - 4); x.fillRect(cw - 2, 2, 1, ch - 4);
      N.forEach((r, j) => [...r].forEach((c, i) => { if (c === "k") { x.fillStyle = "#f6f0dc"; x.fillRect(7 + i, 3 + j, 1, 1); } }));
      ROSE.forEach((r, j) => [...r].forEach((c, i) => { if (c !== ".") { x.fillStyle = ROSE_C[c]; x.fillRect(2 + i, 9 + j, 1, 1); } }));
    }
    const world = () => opts.fly && opts.fly({ lon: 10, lat: 20, zoom: 1 });
    cc.addEventListener("click", world);
    cc.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); world(); } });
    tr.append(cc);

    // ---------- minimap ----------
    const MW = 66, MH = 36;
    const mini = document.createElement("canvas"); mini.width = MW; mini.height = MH; mini.className = "mini hit";
    Object.assign(mini.style, { width: MW * PX + "px", height: MH * PX + "px" });
    mini.title = "Minimap: click or drag to move there"; mini.setAttribute("aria-label", "Minimap");
    const mctx = mini.getContext("2d");
    const mp = d3.geoNaturalEarth1().fitExtent([[2, 2], [MW - 2, MH - 2]], { type: "Sphere" });
    let ground = null; // the minimap's terrain, drawn once from the L0 tile
    if (opts.tile) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const src = x.getImageData(0, 0, img.width, img.height).data, sw = img.width, sh = img.height;
        const T = PAL.TERRAIN.map(t => t.map(rgb));
        ground = mctx.createImageData(MW, MH);
        const d = ground.data;
        for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
          const o = (j * MW + i) * 4, ll = mp.invert([i + 0.5, j + 0.5]);
          let col = [34, 31, 26];
          if (ll && isFinite(ll[0]) && Math.abs(ll[0]) <= 180 && Math.abs(ll[1]) <= 90) {
            const back = mp(ll);
            if (back && Math.abs(back[0] - i - 0.5) < 0.6 && Math.abs(back[1] - j - 0.5) < 0.6) {
              const sx = Math.min(sw - 1, Math.floor((ll[0] + 180) / 360 * sw)), sy = Math.min(sh - 1, Math.floor((90 - ll[1]) / 180 * sh));
              const cls = src[(sy * sw + sx) * 4];
              col = (T[cls] || T[10])[cls <= 2 ? 1 : 2];
            }
          }
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
        }
        // Frame: ink with a gold rim.
        for (let i = 0; i < MW; i++) for (const j of [0, MH - 1]) { const o = (j * MW + i) * 4; d[o] = 34; d[o + 1] = 31; d[o + 2] = 26; }
        for (let j = 0; j < MH; j++) for (const i of [0, MW - 1]) { const o = (j * MW + i) * 4; d[o] = 34; d[o + 1] = 31; d[o + 2] = 26; }
        for (let i = 1; i < MW - 1; i++) for (const j of [1, MH - 2]) { const o = (j * MW + i) * 4; d[o] = 200; d[o + 1] = 164; d[o + 2] = 106; }
        for (let j = 1; j < MH - 1; j++) for (const i of [1, MW - 2]) { const o = (j * MW + i) * 4; d[o] = 200; d[o + 1] = 164; d[o + 2] = 106; }
        drawMini();
      };
      img.src = opts.tile;
    }
    let T = null, W = 0, H = 0;
    // The main view's corners in the minimap: both maps are NaturalEarth1, so it is a straight rescale.
    function viewRect() {
      const s = mp.scale() / projection.scale(), [mx, my] = mp.translate(), [px, py] = projection.translate();
      const f = (x, y) => [(x - px) * s + mx, (y - py) * s + my];
      const a = f(-T.x / T.k, -T.y / T.k), b = f((W - T.x) / T.k, (H - T.y) / T.k);
      return [Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1])];
    }
    function drawMini() {
      if (!ground || !T) return;
      mctx.putImageData(ground, 0, 0);
      const [x0, y0, x1, y1] = viewRect();
      const X0 = Math.max(2, x0), Y0 = Math.max(2, y0), X1 = Math.min(MW - 3, Math.max(X0 + 1, x1)), Y1 = Math.min(MH - 3, Math.max(Y0 + 1, y1));
      // The view box: paper with an ink shadow; a dot when it is smaller than two pixels.
      mctx.fillStyle = "#221f1a"; mctx.fillRect(X0 + 1, Y1 + 1, X1 - X0 + 1, 1); mctx.fillRect(X1 + 1, Y0 + 1, 1, Y1 - Y0 + 1);
      mctx.fillStyle = "#f6f0dc";
      if (X1 - X0 < 2 && Y1 - Y0 < 2) { mctx.fillRect(X0 - 1, Y0, 3, 1); mctx.fillRect(X0, Y0 - 1, 1, 3); return; }
      mctx.fillRect(X0, Y0, X1 - X0 + 1, 1); mctx.fillRect(X0, Y1, X1 - X0 + 1, 1); mctx.fillRect(X0, Y0, 1, Y1 - Y0 + 1); mctx.fillRect(X1, Y0, 1, Y1 - Y0 + 1);
    }
    let dragging = false;
    const goMini = ev => {
      const r = mini.getBoundingClientRect(), ll = mp.invert([(ev.clientX - r.left) / PX, (ev.clientY - r.top) / PX]);
      if (ll && isFinite(ll[0]) && opts.fly) opts.fly({ lon: Math.max(-180, Math.min(180, ll[0])), lat: Math.max(-80, Math.min(80, ll[1])), zoom: T ? T.k : 3 }, dragging ? 0 : 500);
    };
    mini.addEventListener("pointerdown", ev => { dragging = false; mini.setPointerCapture(ev.pointerId); goMini(ev); dragging = true; });
    mini.addEventListener("pointermove", ev => { if (dragging) goMini(ev); });
    mini.addEventListener("pointerup", () => { dragging = false; });
    mini.addEventListener("click", ev => ev.stopPropagation());

    // ---------- scale bar ----------
    const scale = document.createElement("div"); scale.className = "scale";
    const sb = document.createElement("canvas"), sl = document.createElement("span");
    scale.append(sb, sl);
    br.append(mini, scale);
    const NICE = [1, 2, 5];
    function drawScale() {
      // Kilometres across 100 screen px at the middle of the view (NaturalEarth1 stretches toward the poles).
      const inv = (x, y) => projection.invert([(x - T.x) / T.k, (y - T.y) / T.k]);
      const a = inv(W / 2 - 50, H / 2), b = inv(W / 2 + 50, H / 2);
      if (!a || !b || !isFinite(a[0]) || !isFinite(b[0])) { scale.hidden = true; return; }
      const kmPx = d3.geoDistance(a, b) * 6371 / 100;
      let km = 1, px = 0;
      for (let e = 0; e < 6 && !px; e++) for (const n of NICE) { const v = n * 10 ** e; if (v / kmPx >= 50) { km = v; px = v / kmPx; break; } }
      if (!px || px > 200) { scale.hidden = true; return; }
      scale.hidden = false;
      const w = Math.max(8, Math.round(px / PX)), seg = w / 4;
      sb.width = w + 2; sb.height = 4; Object.assign(sb.style, { width: (w + 2) * PX + "px", height: 4 * PX + "px" });
      const x = sb.getContext("2d");
      x.fillStyle = "#221f1a"; x.fillRect(0, 0, w + 2, 4);
      for (let i = 0; i < 4; i++) { x.fillStyle = i & 1 ? "#221f1a" : "#f6f0dc"; x.fillRect(1 + Math.round(i * seg), 1, Math.round((i + 1) * seg) - Math.round(i * seg), 2); }
      x.fillStyle = "#f6f0dc"; x.fillRect(1, 1, 1, 2); x.fillRect(w, 1, 1, 2);
      sl.textContent = km >= 1000 ? `${km.toLocaleString("en-US")} km` : `${km} km`;
      sl.title = "Measured across the middle of the map; the projection stretches toward the poles";
    }

    let raf = 0;
    return {
      update(t) {
        T = t; W = mapEl.clientWidth; H = mapEl.clientHeight;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          // The minimap only helps once the world no longer fits on screen.
          mini.hidden = T.k < 1.6;
          if (!mini.hidden) drawMini();
          drawScale();
        });
      },
      remove() { cancelAnimationFrame(raf); br.remove(); tr.remove(); },
    };
  }
  global.PixelHUD = PixelHUD;
})(typeof window !== "undefined" ? window : globalThis);
