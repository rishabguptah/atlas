// Keyboard controls check: builds the one-page Atlas, serves it like tools/perf/perf.js, and drives the keys in Chromium.
// Fails (exit 1) when a key does not do what views/atlas/atlas.src.html (keyboard section) says, or a held-key glide drops frames.
//
//   node tools/keys/keys.js [--no-build] [--shots DIR]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http"), zlib = require("zlib"), os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../.."), FIX = path.join(ROOT, "tools/perf/fixture");
const args = process.argv.slice(2), shotArg = args.indexOf("--shots"), SHOTS = shotArg >= 0 ? args[shotArg + 1] : null;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-keys-"));
let inputs = process.env.ATLAS_DIR || "/mnt/project-files/atlas";
if (!fs.existsSync(path.join(inputs, "entries.js"))) { inputs = path.join(DIR, "inputs"); fs.mkdirSync(inputs); execFileSync("tar", ["xzf", path.join(FIX, "atlas-inputs.tgz"), "-C", inputs]); }
execFileSync("python3", [path.join(ROOT, "views/atlas/build.py"), path.join(DIR, "raw.html"), inputs], { stdio: ["ignore", "ignore", "inherit"] });
fs.writeFileSync(path.join(DIR, "atlas.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + fs.readFileSync(path.join(DIR, "raw.html"), "utf8") + "</body></html>");
const TYPES = { ".html": "text/html", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  if (u.includes("..")) { res.writeHead(400); return res.end(); }
  let file = path.join(DIR, u), gz = false;
  if (u.startsWith("borders-time/")) { file = path.join(FIX, u); if (!fs.existsSync(file) && fs.existsSync(file + ".gz")) { file += ".gz"; gz = true; } }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file); if (gz) body = zlib.gunzipSync(body);
  res.writeHead(200, { "content-type": TYPES[path.extname(file.replace(/\.gz$/, ""))] || "application/octet-stream" }); res.end(body);
});

const fails = [], ok = (cond, what) => { console.log((cond ? "ok   " : "FAIL ") + what); if (!cond) fails.push(what); };
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/atlas.html`, { waitUntil: "load", timeout: 120000 });
  await p.waitForFunction(() => window.ATLAS && ATLAS.api, null, { timeout: 60000 });
  await p.evaluate(() => { ATLAS.api.setYear(1348, false); ATLAS.api.fly({ lon: 15, lat: 45, zoom: 4 }, 0); });
  await p.waitForTimeout(3000);
  // The first visit opens on a story; Esc with the card open closes only the card, then leaves the story.
  if (await p.evaluate(() => ATLAS.world && ATLAS.world.director && ATLAS.world.director.active)) {
    await p.keyboard.press("?"); await p.keyboard.press("Escape");
    ok(await p.evaluate(() => document.querySelector(".cheat").hidden && ATLAS.world.director.active), "Esc closes the card before the story");
    await p.keyboard.press("Escape");
    ok(!(await p.evaluate(() => ATLAS.world.director.active)), "the next Esc leaves the story");
    await p.evaluate(() => { ATLAS.api.setYear(1348, false); ATLAS.api.fly({ lon: 15, lat: 45, zoom: 4 }, 0); }); await p.waitForTimeout(2000);
  }
  await p.mouse.click(5, 450).catch(() => {}); await p.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  const view = () => p.evaluate(() => ATLAS.api.view());
  const tab = () => p.evaluate(() => (document.querySelector('.tab[aria-selected="true"]') || {}).dataset.tab);
  // Frames while a key is held: rAF intervals.
  const hold = async (key, ms) => {
    await p.evaluate(() => { window.__f = []; let last = performance.now(); const tick = t => { window.__f.push(t - last); last = t; if (window.__f.length < 2000) window.__fr = requestAnimationFrame(tick); }; window.__fr = requestAnimationFrame(tick); });
    await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key);
    await p.waitForTimeout(400);
    return p.evaluate(() => { cancelAnimationFrame(window.__fr); const f = window.__f.slice(2).sort((a, b) => a - b); return { n: f.length, median: f[f.length >> 1], p90: f[Math.floor(f.length * 0.9)], max: f[f.length - 1] }; });
  };
  let v0 = await view();
  const fr = await hold("d", 1500);
  let v1 = await view();
  ok(v1.lon > v0.lon + 1, `D pans east (${v0.lon.toFixed(1)} -> ${v1.lon.toFixed(1)})`);
  ok(fr.median < 20 && fr.p90 < 34, `held pan frames median ${fr.median.toFixed(1)} ms, p90 ${fr.p90.toFixed(1)}, max ${fr.max.toFixed(0)}`);
  v0 = v1; await hold("ArrowUp", 600); v1 = await view();
  ok(v1.lat > v0.lat, `Up arrow pans north (${v0.lat.toFixed(1)} -> ${v1.lat.toFixed(1)})`);
  v0 = v1; const fz = await hold("e", 800); v1 = await view();
  ok(v1.k > v0.k * 1.5, `E zooms in (k ${v0.k.toFixed(1)} -> ${v1.k.toFixed(1)}); frames median ${fz.median.toFixed(1)}, p90 ${fz.p90.toFixed(1)}`);
  v0 = v1; await hold("q", 500); v1 = await view();
  ok(v1.k < v0.k, `Q zooms out (k ${v0.k.toFixed(1)} -> ${v1.k.toFixed(1)})`);
  v0 = v1; await hold("Equal", 300); v1 = await view();
  ok(v1.k > v0.k, `= zooms in`);
  ok(!(await p.evaluate(() => document.querySelector("#map, .map").classList.contains("moving"))), "map settles after keys are let go");
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.keyboard.down("a"); await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, "glide.png") }); await p.keyboard.up("a"); await p.waitForTimeout(500); }

  const y0 = await p.evaluate(() => ATLAS.api.year);
  await p.keyboard.press("."); const y1 = await p.evaluate(() => ATLAS.api.year);
  ok(y1 > y0, `. steps forward (${y0} -> ${y1})`);
  await p.keyboard.press(","); ok((await p.evaluate(() => ATLAS.api.year)) < y1, ", steps back");
  await p.keyboard.press(">"); const y2 = await p.evaluate(() => ATLAS.api.year);
  ok(y2 - y0 > (y1 - y0) * 3, `Shift+. jumps further (${y0} -> ${y2})`);

  await p.keyboard.press("?");
  ok(await p.evaluate(() => !document.querySelector(".cheat").hidden), "? opens the controls card");
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "cheat.png") });
  await p.keyboard.press("Escape");
  ok(await p.evaluate(() => document.querySelector(".cheat").hidden), "Esc closes it");

  const t0 = await tab(); await p.keyboard.press("t"); const t1 = await tab();
  ok(t1 && t1 !== t0, `T switches tab (${t0} -> ${t1})`);
  await p.keyboard.press("Shift+T"); ok((await tab()) === t0, "Shift+T goes back");

  // Typing never moves the map or the year.
  v0 = await view(); const yb = await p.evaluate(() => ATLAS.api.year);
  await p.evaluate(() => { const q = document.getElementById("qbox"); q.closest(".askbar") && (q.closest(".app").classList.remove("asking")); q.focus(); });
  await p.keyboard.type("wasd qe ,.?t0");
  v1 = await view();
  ok(Math.abs(v1.lon - v0.lon) < 1e-6 && v1.k === v0.k && (await p.evaluate(() => ATLAS.api.year)) === yb, "typing in the ask box leaves the map alone");
  ok(await p.evaluate(() => document.querySelector(".cheat").hidden), "typing ? does not open the card");
  await p.keyboard.press("Escape");

  await p.keyboard.press("0"); await p.waitForTimeout(1300); v1 = await view();
  ok(v1.k < 1.6, `0 shows the whole world (k ${v1.k.toFixed(2)})`);
  await p.evaluate(() => ATLAS.api.fly({ lon: 12.5, lat: 41.9, zoom: 8 }, 0)); await p.waitForTimeout(800);
  await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  ok((await tab()) === "here", "Enter opens Here at the crosshair");
  await p.keyboard.press("Control+d").catch(() => {});  // a browser shortcut is left alone (no pan)
  ok(!(await p.evaluate(() => document.querySelector(".app").classList.contains("panning"))), "Ctrl+D does not pan");

  ok(!errors.length, "no page errors" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
  await b.close(); server.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
