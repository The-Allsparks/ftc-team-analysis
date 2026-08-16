# Security policy

## Reporting a vulnerability

Prefer **GitHub Security Advisories** / private vulnerability reporting for this repository when available:

1. Open the repository on GitHub → **Security** → **Advisories** (or **Report a vulnerability**).
2. Include steps to reproduce, affected paths, and impact. Do not include secrets or student PII in the report body if avoidable; describe them abstractly.

If private reporting is unavailable, open a GitHub issue and apply (or request) a `security` label. Avoid posting exploit details that would put users at immediate risk; maintainers may convert the issue to a private advisory.

Please do not open public issues that paste live credentials, tokens, or private contact data.

## Scope notes

- This project does **not** call the credentialed FTC Events API. Do not add FIRST API usernames/tokens to the repo, Actions secrets for that purpose, or client-side code that expects them, unless a future issue explicitly redesigns that boundary.
- The production Worker proxy is allowlisted (`GET`/`HEAD` only) to known upstream hosts. Changes that widen proxy destinations need careful review.
- Checked-in data is a public Nevada team snapshot. Treat unexpected inclusion of personal contact data or student identifiers as a data incident: open a security report or correction issue and do not expand that data in PRs.
- Team correction submissions (#32) are browser-local moderation records with honeypot + soft rate tips only — not a hardened anti-abuse backend. Approvals never auto-write generated seed. See [docs/team-corrections.md](docs/team-corrections.md).

## Supported versions

Security fixes are applied on the default branch (`main`). There are no long-lived release branches today.
