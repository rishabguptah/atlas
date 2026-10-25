// Ask the Atlas's live panel every benchmark question, headless, and save what it answered.
//
//   node ingest/judge/bench/run.mjs ATLAS.html OUT_DIR [--only id,id] [--jobs 4] [--model M] [--limit N]
//
// The page is the real built Atlas (views/atlas/build.py). Its `sample` capability is swapped for the local
// `claude` CLI, so the chair, the specialists and the closing run exactly the prompts a reader's question runs.
// Writes OUT_DIR/answers.jsonl (one line per question: the panel's answer as the page holds it, plus every
// call's timing; full prompts and replies in calls.jsonl) for grade.mjs to score.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { complete, pool, stopped } from "./claude_cli.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = path.dirname(new URL(import.meta.url).pathname);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv.splice(i, 2)[1]; };
const only = opt("only", ""), jobs = +opt("jobs", 4), model = opt("model", ""), limit = +opt("limit", 0);
const qfile = opt("questions", path.join(HERE, "../../../data/judge/bench/questions.jsonl"));
const [html, out] = argv;
if (!html || !out) { console.error("usage: run.mjs ATLAS.html OUT_DIR [--only ids] [--jobs N] [--model M]"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

let qs = fs.readFileSync(qfile, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
if (only) { const want = new Set(only.split(",")); qs = qs.filter(q => want.has(q.id)); }
if (limit) qs = qs.slice(0, limit);
const done = new Set();
const ansPath = path.join(out, "answers.jsonl");
if (fs.existsSync(ansPath)) for (const l of fs.readFileSync(ansPath, "utf8").split("\n")) if (l.trim()) { const a = JSON.parse(l); if (!a.error) done.add(a.id); }
qs = qs.filter(q => !done.has(q.id));

// The page loads d3 and topojson from a CDN; fetch them once with curl (it trusts the proxy's CA) and serve locally.
const CDN = path.join(out, ".cdn");
fs.mkdirSync(CDN, { recursive: true });
const cdnFile = url => {
  const f = path.join(CDN, url.replace(/[^a-z0-9.]+/gi, "_"));
  if (!fs.existsSync(f)) execFileSync("curl", ["-sSfL", "-o", f, url]);
  return f;
};

const browser = await chromium.launch();
const pageUrl = "file://" + path.resolve(html);

async function runOne(q) {
  const t0 = Date.now(), calls = [];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)\//, async r => {
    try { await r.fulfill({ path: cdnFile(r.request().url()), contentType: "application/javascript" }); } catch { await r.abort(); }
  });
  await ctx.route(/^https?:\/\/(?!cdn\.jsdelivr|cdnjs|unpkg)/, r => r.abort());
  const page = await ctx.newPage();
  page.on("pageerror", e => calls.push({ pageerror: String(e).slice(0, 300) }));
  await page.exposeFunction("__benchSample", async prompt => {
    const c = { role: /You are the CHAIR closing/.test(prompt) ? "close" : /You are the CHAIR/.test(prompt) ? "chair" : (prompt.match(/You are the panel's ([A-Z ,]+)\./) || [, "speaker"])[1].toLowerCase(), chars: prompt.length };
    const s = Date.now();
    try { c.reply = await complete(prompt, { model }); }
    catch (e) { c.error = e.message; c.reply = e.text || ""; }
    c.ms = Date.now() - s; c.prompt = prompt; calls.push(c);
    return c.error ? { error: c.error, text: c.reply } : { text: c.reply };
  });
  await page.addInitScript(() => {
    const sample = async (messages, opts = {}) => {
      const r = await window.__benchSample(messages.map(m => m.content).join("\n\n"));
      if (r.error) throw Object.assign(new Error(r.error), { code: "upstream_error", text: r.text });
      opts.onText && opts.onText({ text: r.text });
      return { text: r.text };
    };
    window.claude = { use: async name => { if (name === "sample") return sample; throw Object.assign(new Error("no"), { code: "not_granted" }); } };
  });
  let answer = null, error = null;
  try {
    await page.goto(pageUrl, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.ATLAS && ATLAS.api && ATLAS.api.askLive, null, { timeout: 120000 });
    await page.evaluate(q => { ATLAS.api.askLive(q); }, q.q);
    await page.waitForFunction(() => { const A = ATLAS.api.answer; return A && A.live && !A.loading && (A.short || A.error || (A.steps.length && A.unknowns.length) || Object.values(A.status).every(s => s === "done" || s === "missed" || s === "skipped") && A.views.length); }, null, { timeout: 900000, polling: 1000 });
    await page.waitForTimeout(500);
    answer = await page.evaluate(() => {
      const A = ATLAS.api.answer;
      return JSON.parse(JSON.stringify({ short: A.short, frame: A.frame, plan: A.plan, panel: A.panel, status: A.status, steps: A.steps, links: A.links, views: A.views, whatifs: A.whatifs, unknowns: A.unknowns, lenses: A.lenses, passes: A.passes, error: A.error || null }));
    });
  } catch (e) { error = String(e.message || e).slice(0, 500); }
  await ctx.close();
  if (stopped()) { console.log(`${q.id}: not saved, the usage limit was hit; rerun later to resume`); return null; }
  // Full prompts and replies go to calls.jsonl (large, not committed); answers.jsonl keeps timings only.
  fs.appendFileSync(path.join(out, "calls.jsonl"), JSON.stringify({ id: q.id, calls }) + "\n");
  const row = { id: q.id, q: q.q, model: model || "default", ms: Date.now() - t0, answer, error, calls: calls.map(({ prompt, reply, ...c }) => c) };
  fs.appendFileSync(ansPath, JSON.stringify(row) + "\n");
  console.log(`${q.id}: ${error ? "ERROR " + error : `${answer.steps.length} steps, ${answer.panel.join("+")}`} (${Math.round(row.ms / 1000)} s)`);
  return row;
}

await pool(qs, jobs, runOne);
await browser.close();
if (stopped()) { console.error("Stopped: the Claude usage limit was hit. Rerun the same command after it resets; finished questions are kept."); process.exit(3); }
