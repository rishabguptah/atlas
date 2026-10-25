// Score the panel's answers (run.mjs) against each question's rubric. Out of 100:
//   content 40   rubric points made, weighted (grader)
//   accuracy 20  minus 6 per serious error or rubric myth repeated, minus 2 per minor slip (grader)
//   why 15       causal chain, competing views weighed, honest uncertainty, premise checked (grader, 0-5 each)
//   map 15       stops inside the question's years and region, and each stop marking something (computed)
//   sources 10   share of stops citing something (computed) and whether the citations look real (grader)
//
//   node ingest/judge/bench/grade.mjs RUN_DIR [--model M] [--jobs 4]
// Writes RUN_DIR/grades.jsonl and RUN_DIR/summary.json.
import fs from "node:fs";
import path from "node:path";
import { complete, pool, stopped } from "./claude_cli.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv.splice(i, 2)[1]; };
const model = opt("model", ""), jobs = +opt("jobs", 4);
const qfile = opt("questions", path.join(HERE, "../../../data/judge/bench/questions.jsonl"));
const [dir] = argv;
const rows = f => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l)) : [];
const Q = Object.fromEntries(rows(qfile).map(q => [q.id, q]));
const answers = new Map(); for (const a of rows(path.join(dir, "answers.jsonl"))) if (Q[a.id] && (!answers.has(a.id) || !a.error)) answers.set(a.id, a);
const gpath = path.join(dir, "grades.jsonl");
const graded = new Map(rows(gpath).map(g => [g.id, g]));

const fy = y => y == null ? "-" : y < 0 ? `${-y} BCE` : `${y}`;
function transcript(A) {
  const L = [];
  if (A.frame) L.push(`FRAME: ${A.frame}`);
  if (A.short) L.push(`SHORT ANSWER: ${A.short}`);
  A.steps.forEach((s, i) => L.push(`STEP ${i + 1} [${s.by || s.lens}, ${fy(s.year)}] ${s.title}: ${s.text}${s.sources.length ? `\n  sources: ${s.sources.map(x => x.cite + (x.url ? ` <${x.url}>` : "")).join("; ")}` : ""}`));
  A.links.forEach(l => L.push(`LINK step ${l.a + 1} -> step ${l.b + 1}: ${l.why}`));
  A.views.forEach(v => L.push(`VIEW ${v.name} (${v.school}, ${v.strength}): ${v.claim} For: ${v.for} Against: ${v.against}${(v.sources || []).length ? ` [${v.sources.map(s => s.cite).join("; ")}]` : ""}`));
  A.whatifs.forEach(w => L.push(`WHAT IF: ${w.q} ${w.a}`));
  if (A.unknowns.length) L.push(`UNKNOWNS: ${A.unknowns.join(" | ")}`);
  return L.join("\n");
}
const GRADER = (q, A) => `You grade answers from an AI history panel against a rubric written by a historian. Be strict, fair and specific. Judge only what the answer says.

QUESTION: ${q.q}
QUESTION TYPE: ${q.kind}${q.kind === "premise" ? " (the question contains a false premise; a good answer corrects it)" : q.kind === "unknown" ? " (the honest answer is uncertain; a good answer says what is and is not known)" : ""}

RUBRIC POINTS a strong answer makes (numbered):
${q.must.map((m, i) => `${i + 1}. ${m.pt}`).join("\n")}
MYTHS OR ERRORS TO PENALISE:
${q.avoid.length ? q.avoid.map((m, i) => `${i + 1}. ${m}`).join("\n") : "(none listed; still flag any factual error)"}
SCHOLARS OR SCHOOLS a strong answer might weigh: ${q.views.join("; ") || "(none listed)"}

THE ANSWER:
${transcript(A)}

Reply with exactly one JSON object and nothing else:
{"points":[{"n":rubric number,"score":1 if made clearly, 0.5 if partly or vaguely, 0 if missing,"where":"step number or 'short' or 'view', or null"}],
 "errors":[{"claim":"the wrong statement, quoted or closely paraphrased","fix":"what is correct","serious":true if a reader would be misled on something that matters}],
 "myths":[rubric myth numbers the answer repeats or endorses],
 "why":{"chain":0-5 how well it explains causes (mechanisms, not lists),"views":0-5 whether competing explanations are named and weighed fairly,"honesty":0-5 whether confidence matches the evidence and unknowns are named,"premise":0-5 whether it checks the question's assumptions (5 if there is nothing to check and it does not invent one)},
 "sources":0-5 how many citations look like real works or real Wikipedia pages (0 = invented, 5 = all real and apt),
 "best":"one sentence: the strongest thing in the answer","worst":"one sentence: the most important thing to fix"}
List every rubric point exactly once. Put a statement in errors only if you are confident it is wrong: never list one and then call it correct or 'broadly right', and small rounding or a defensible simplification is not an error.`;

const jsonOf = t => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON in grader reply"); return JSON.parse(m[0]); };
const inBox = (v, b) => {
  if (!b || !v) return true;
  const pad = 6, [W, S, E, N] = b, lon = v.lon, lat = v.lat;
  if (lat < S - pad || lat > N + pad) return false;
  return W <= E ? lon >= W - pad && lon <= E + pad : lon >= W - pad || lon <= E + pad;
};

function computed(q, A) {
  const st = A.steps, n = st.length || 1;
  const [f, t] = q.window, slack = Math.max(25, (t - f) * 0.1);
  const inYears = st.filter(s => s.year != null && s.year >= f - slack && s.year <= t + slack).length / n;
  const inRegion = st.filter(s => s.view && inBox(s.view, q.bbox)).length / n;
  const marks = st.filter(s => s.highlight.length || s.pins.length || s.routes.length).length / n;
  const cited = st.filter(s => s.sources.length).length / n;
  const wanted = new Set(q.panel), got = A.panel || [];
  return { steps: st.length, links: A.links.length, views: A.views.length, inYears, inRegion, marks, cited,
    panelHit: got.filter(id => wanted.has(id)).length / Math.max(1, Math.min(wanted.size, got.length)) };
}

function score(q, A, g, c) {
  const W = q.must.reduce((s, m) => s + m.w, 0);
  const got = q.must.reduce((s, m, i) => { const p = (g.points || []).find(p => +p.n === i + 1); return s + m.w * Math.max(0, Math.min(1, +(p?.score) || 0)); }, 0);
  const serious = (g.errors || []).filter(e => e.serious).length, minor = (g.errors || []).length - serious, myths = (g.myths || []).length;
  const why = g.why || {}, w5 = k => Math.max(0, Math.min(5, +why[k] || 0));
  const parts = {
    content: 40 * got / W,
    accuracy: Math.max(0, 20 - 6 * (serious + myths) - 2 * minor),
    why: 15 * (w5("chain") + w5("views") + w5("honesty") + w5("premise")) / 20,
    map: 15 * (c.inYears + c.inRegion + c.marks) / 3,
    sources: 5 * c.cited + Math.max(0, Math.min(5, +g.sources || 0)),
  };
  for (const k in parts) parts[k] = Math.round(parts[k] * 10) / 10;
  return { parts, total: Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10 };
}

const todo = [...answers.values()].filter(a => !graded.has(a.id) || graded.get(a.id).gradeError);
await pool(todo, jobs, async a => {
  const q = Q[a.id];
  let out;
  if (a.error || !a.answer || !a.answer.steps.length) out = { id: a.id, total: 0, parts: { content: 0, accuracy: 0, why: 0, map: 0, sources: 0 }, failed: a.error || a.answer?.error || "no steps" };
  else {
    const c = computed(q, a.answer);
    let g = null, gradeError = null;
    for (let i = 0; i < 2 && !g; i++) { try { g = jsonOf(await complete(GRADER(q, a.answer), { model })); } catch (e) { gradeError = e.message; } }
    if (!g && stopped()) return;
    out = g ? { id: a.id, ...score(q, a.answer, g, c), computed: c, grade: g } : { id: a.id, gradeError, computed: c };
  }
  graded.set(a.id, out);
  fs.writeFileSync(gpath, [...graded.values()].map(x => JSON.stringify(x)).join("\n") + "\n");
  console.log(`${a.id}: ${out.total ?? "grade failed"}`);
});

if (stopped()) { console.error("Stopped: the Claude usage limit was hit. Rerun after it resets."); process.exit(3); }
// Summary: overall, by part, by region, kind and lens, plus the answer model and how long it took.
const G = [...graded.values()].filter(g => Q[g.id] && g.total != null);
const mean = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
const by = key => { const m = {}; for (const g of G) for (const k of [].concat(Q[g.id][key])) (m[k] = m[k] || []).push(g.total); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { n: v.length, score: mean(v) }]).sort((a, b) => a[1].score - b[1].score)); };
const A = [...answers.values()];
const summary = {
  run: path.basename(path.resolve(dir)), answered: A.filter(a => !a.error).length, graded: G.length, of: Object.keys(Q).length,
  answerModel: A[0]?.model || null, graderModel: model || "default",
  score: mean(G.map(g => g.total)),
  parts: Object.fromEntries(["content", "accuracy", "why", "map", "sources"].map(k => [k, mean(G.map(g => g.parts[k]))])),
  errors: { serious: G.reduce((s, g) => s + (g.grade?.errors || []).filter(e => e.serious).length, 0), minor: G.reduce((s, g) => s + (g.grade?.errors || []).filter(e => !e.serious).length, 0), myths: G.reduce((s, g) => s + (g.grade?.myths || []).length, 0) },
  medianSeconds: (() => { const t = A.map(a => a.ms / 1000).sort((a, b) => a - b); return t.length ? Math.round(t[t.length >> 1]) : null; })(),
  byRegion: by("region"), byKind: by("kind"), byLens: by("lenses"),
  questions: G.map(g => ({ id: g.id, total: g.total, parts: g.parts, failed: g.failed || null, best: g.grade?.best, worst: g.grade?.worst })).sort((a, b) => a.total - b.total),
};
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 1));
console.log(`score ${summary.score} over ${G.length} questions`, summary.parts);
