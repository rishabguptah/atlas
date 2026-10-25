# Security

The repository is public. Report a problem by opening an issue (leave secrets out of it) or by contacting the owner
on GitHub.

## Security review guidelines

- **No secrets in the repo.** Flag credentials, tokens, API keys, `auth.json` files, cookies, private URLs or personal
  data anywhere in the diff, including test fixtures, notebooks and generated `dist/` files. A pushed secret is
  public at once and must be rotated, not just deleted.
- **Pages render outside text safely.** The Atlas pages show names, quotes and descriptions from Wikidata,
  Wikipedia and model answers. Flag that text reaching `innerHTML`, `eval` or a URL without escaping, and links built
  from record fields that could carry a `javascript:` scheme.
- **Ingest scripts treat downloads as untrusted.** Flag scripts under `ingest/` that execute or unpickle fetched
  content, write outside the repo, or switch off TLS verification.
