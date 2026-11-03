// Atlas performance gate: builds the one-page Atlas, serves it with a small border fixture, and times what the
// performance budget (views/atlas/README.md) covers: page size, time to the first painted map, and year steps.
// Fails (exit 1) when a number is over its limit in tools/perf/budget.json, so a regression cannot merge.
//
//   node tools/perf/perf.js [--out report.json] [--fixture]
//
// Needs Python 3 (for build.py) and Playwright with Chromium. Border data comes from tools/perf/fixture (the timeline
// chunks around 1453 and 1796-1845, gzipped); everything else the page asks for beside it is a 404, as on a fresh
// publish without those folders, so lenses that need it are skipped.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http"), zlib = require("zlib"), os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../.."), FIX = path.join(__dirname, "fixture");
const BUDGET = JSON.parse(fs.readFileSync(path.join(__dirname, "budget.json"), "utf8"));
const args = process.argv.slice(2), outArg = args.indexOf("--out"), OUT = outArg >= 0 ? args[outArg + 1] : null;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-perf-"));

// ---- build: the published page is wrapped in a document skeleton, as the artifact host does
// The build reads the Living Atlas files from ATLAS_DIR (the project folder). Where that is missing (CI), it uses the
// snapshot in tools/perf/fixture/atlas-inputs.tgz (tools/perf/refresh-fixture.sh rebuilds it).
let inputs = process.env.ATLAS_DIR || "/mnt/project-files/atlas";
if (args.includes("--fixture") || !fs.existsSync(path.join(inputs, "entries.js"))) {
  inputs = path.join(DIR, "inputs"); fs.mkdirSync(inputs);
  execFileSync("tar", ["xzf", path.join(FIX, "atlas-inputs.tgz"), "-C", inputs]);
}
if (!args.includes("--no-build")) execFileSync("python3", [path.join(ROOT, "views/atlas/build.py"), path.join(DIR, "raw.html"), inputs], { stdio: ["ignore", "ignore", "inherit"] });
// d3 and topojson come from local packages, not the CDN, so network noise stays out of the numbers.
const LIBS = { "lib/d3.min.js": ["https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js", "d3/dist/d3.min.js"],
  "lib/topojson-client.min.js": ["https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js", "topojson-client/dist/topojson-client.min.js"] };
let raw = fs.readFileSync(path.join(DIR, "raw.html"), "utf8");
for (const [local, [cdn, mod]] of Object.entries(LIBS)) {
  const file = [process.cwd(), ROOT].map(d => path.join(d, "node_modules", mod)).find(f => fs.existsSync(f));
  if (file) { fs.mkdirSync(path.join(DIR, "lib"), { recursive: true }); fs.copyFileSync(file, path.join(DIR, local)); raw = raw.split(cdn).join(local); }
}
fs.writeFileSync(path.join(DIR, "atlas.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + raw + "</body></html>");

// ---- serve: the page and atlas-files/ from the build, borders-time/ from the fixture
const TYPES = { ".html": "text/html", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  if (u.includes("..")) { res.writeHead(400); return res.end(); }
  let file = path.join(DIR, u), gz = false;
  if (u.startsWith("borders-time/")) { file = path.join(FIX, u); if (!fs.existsSync(file) && fs.existsSync(file + ".gz")) { file += ".gz"; gz = true; } }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file); if (gz) body = zlib.gunzipSync(body);
  res.writeHead(200, { "content-type": TYPES[path.extname(file.replace(/\.gz$/, ""))] || "application/octet-stream", "content-length": body.length });
  res.end(body);
});

const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const URL0 = `http://127.0.0.1:${server.address().port}/atlas.html`;
  const b = await chromium.launch();
  const errors = [], result = { pageBytes: fs.statSync(path.join(DIR, "atlas.html")).size };

  // Time to the first painted map: the pixel canvas shows terrain at its centre.
  async function load(mbps, rtt) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(), c = await ctx.newCDPSession(p);
    await c.send("Network.enable"); await c.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (mbps) await c.send("Network.emulateNetworkConditions", { offline: false, latency: rtt, downloadThroughput: mbps * 125000, uploadThroughput: 1e6 });
    await p.addInitScript(() => { const t = setInterval(() => { const cv = document.querySelector("canvas.pixelmap"); if (cv && cv.width > 0) { try { const d = cv.getContext("2d").getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data; if (d[3] > 0 && d[0] + d[1] + d[2] > 0) { window.__map = performance.now(); clearInterval(t); } } catch (e) {} } }, 10); });
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(URL0, { waitUntil: "load", timeout: 120000 });
    await p.waitForFunction(() => window.__map, null, { timeout: 120000 });
    const ms = await p.evaluate(() => Math.round(window.__map));
    await ctx.close();
    return ms;
  }
  // Year steps: set the year, wait for the next frame; the time from the call to that frame, per year.
  async function steps(view, y0, n) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(URL0, { waitUntil: "load", timeout: 120000 });
    await p.waitForFunction(() => window.ATLAS && ATLAS.api, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.evaluate(([v, y]) => { ATLAS.api.setYear(y - 1, false); ATLAS.api.fly(v, 0); }, [view, y0]);
    await p.waitForTimeout(3000);
    const t = await p.evaluate(async ([y0, n]) => {
      const frame = () => new Promise(r => requestAnimationFrame(() => r(performance.now())));
      await frame(); const out = [];
      for (let i = 0; i < n; i++) { const s = performance.now(); ATLAS.api.setYear(y0 + i, false); out.push((await frame()) - s); }
      return out;
    }, [y0, n]);
    await p.close();
    return { median: Math.round(median(t) * 10) / 10, p90: Math.round(pct(t, 0.9) * 10) / 10, max: Math.round(Math.max(...t)) };
  }

  result.mapLocal = Math.min(await load(0, 0), await load(0, 0));
  result.map25 = await load(25, 40);
  result.stepsWorld1800s = await steps({ lon: 20, lat: 30, zoom: 1 }, 1801, 40);
  result.stepsEurope1800s = await steps({ lon: 12, lat: 49, zoom: 3 }, 1801, 40);
  result.errors = [...new Set(errors)].slice(0, 10);
  await b.close(); server.close();

  // ---- compare with the limits
  const rows = [], fail = [];
  const check = (name, v, lim, unit) => { const ok = lim == null || v <= lim; rows.push(`| ${name} | ${v}${unit} | ${lim == null ? "" : lim + unit} | ${ok ? "ok" : "**over**"} |`); if (!ok) fail.push(name); };
  const L = BUDGET.limits;
  check("page HTML", Math.round(result.pageBytes / 1e4) / 100, L.pageMB, " MB");
  check("map painted, local", result.mapLocal, L.mapLocalMs, " ms");
  check("map painted, 25 Mbps / 40 ms", result.map25, L.map25Ms, " ms");
  for (const k of ["stepsWorld1800s", "stepsEurope1800s"]) {
    check(`${k} median`, result[k].median, L[k].median, " ms");
    check(`${k} p90`, result[k].p90, L[k].p90, " ms");
  }
  if (result.errors.length) { rows.push(`| page errors | ${result.errors.length} | 0 | **over** |`); fail.push("errors"); }
  const md = ["### Atlas performance", "", "| measure | now | limit | |", "|---|---|---|---|", ...rows, "",
    result.errors.length ? "Errors: " + result.errors.map(e => "`" + e.slice(0, 120) + "`").join(", ") : ""].join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  if (fail.length) { console.error("over budget: " + fail.join(", ")); process.exit(1); }
})().catch(e => { console.error(e); server.close(); process.exit(1); });
