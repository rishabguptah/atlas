# Security

The repository is public. Report a vulnerability privately through GitHub's private vulnerability reporting
(the repository's **Security** tab, then **Report a vulnerability**). Do not put an unpatched vulnerability or exploit
details in a public issue, pull request or comment. Public issues are for problems that are safe to disclose.

## Security review guidelines

- **No secrets in the repo.** Flag credentials, tokens, API keys, `auth.json` files, cookies, private URLs or personal
  data anywhere in the diff, including test fixtures, notebooks and generated `dist/` files. A pushed secret is
  public at once and must be rotated, not just deleted.
- **Pages render outside text safely.** The Atlas pages show names, quotes and descriptions from Wikidata,
  Wikipedia and model answers. Flag that text reaching `innerHTML`, `eval` or a URL without escaping, and links built
  from record fields that could carry a `javascript:` scheme.
- **Ingest scripts treat downloads as untrusted.** Flag scripts under `ingest/` that execute or unpickle fetched
  content, write outside the repo, or switch off TLS verification.
