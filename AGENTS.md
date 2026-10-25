# Notes for coding agents

Start with `README.md` (layout, build) and `schema/SCHEMA.md` (record format). `python3 tools/build.py` must pass
before a merge; CI runs it on every pull request. The repository is public.

## Code Review Rules

### Secrets and safety
- Never commit credentials, tokens, API keys, `auth.json` files or private URLs. The repository is public, so a leaked
  secret is exposed at once. Flag any string that looks like one.

### The one-page Atlas stays fast
- Changes under `views/atlas/` keep the performance budget in `views/atlas/README.md`: page HTML at most 4 MB (large
  data goes to `atlas-files/` and loads after first paint), a year step under 16 ms median, and no DOM node per map
  mark (draw into the canvas mark layer). Flag work on every year step that grows with the whole dataset instead of
  what is visible, and timers that keep running when nothing moves.

### Records stay sourced
- New or changed records under `data/` follow `schema/SCHEMA.md`: each one names a source, and dates are plausible
  for the place and period. Flag a curated record that a bulk import overwrites without keeping the old value.
