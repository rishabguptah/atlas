// One plain completion through the local `claude` CLI: no tools, no MCP, no session files, a neutral system prompt.
// This stands in for the page's `sample` capability when the panel runs headless.
import { spawn } from "node:child_process";

const SYSTEM = "You are a helpful assistant. Follow the user's output format exactly.";

// Hitting the plan's usage limit stops the whole run: later questions would all fail and score 0.
const LIMIT = /hit your (session|usage|weekly) limit|usage limit reached|rate limit/i;
export let limitHit = false;
export const stopped = () => limitHit;

export function complete(prompt, { model, effort, timeoutMs = 300000 } = {}) {
  const args = ["-p", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--setting-sources", "",
    "--system-prompt", SYSTEM, "--output-format", "text"];
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  if (limitHit) return Promise.reject(Object.assign(new Error("usage limit"), { code: "rate_limited", limit: true }));
  return new Promise((resolve, reject) => {
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], cwd: "/tmp" });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(Object.assign(new Error("timeout"), { code: "upstream_error" })); }, timeoutMs);
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("close", code => {
      clearTimeout(t);
      if ((code !== 0 || out.length < 300) && (LIMIT.test(out) || LIMIT.test(err))) { limitHit = true; reject(Object.assign(new Error("usage limit: " + (out || err).trim().slice(0, 120)), { code: "rate_limited", limit: true })); }
      else if (code === 0 && out.trim()) resolve(out);
      else reject(Object.assign(new Error(`claude exited ${code}: ${err.slice(0, 300)}`), { code: out.trim() ? "upstream_error" : "empty_completion", text: out }));
    });
    p.stdin.end(prompt);
  });
}

// Run fn over items, at most n at a time.
export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !limitHit) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
