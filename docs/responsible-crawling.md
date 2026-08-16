# Responsible crawling policy

This project refreshes Nevada team data from **public HTTP pages and public APIs** without FIRST API credentials. Operators and contributors should keep traffic modest and avoid hostile scraping patterns.

## Principles

1. **Public only** — no credentialed FTC Events API; no bypass of authentication or robots traps.
2. **Purpose-limited** — crawl to maintain the Nevada directory/historical record and optional enrichments, not to bulk-archive the web.
3. **Modest rate** — prefer scheduled Actions and skip optional work on cron when possible.
4. **Fail soft on enrichment** — Portfolio Lab / FTCScout / avatar failures must not corrupt the identity-critical seed.
5. **No student PII collection** — see [privacy.md](privacy.md).

## Scheduled refresh defaults

`.github/workflows/data-refresh.yml`:

- Weekly `current` and monthly `full` modes refresh from public FTC pages.
- Scheduled runs **skip team-website link enrichment** to reduce outbound crawl volume.
- Successful runs open a PR by default rather than pushing straight to `main`.

Local operators should prefer `--skip-link-enrichment` for routine refreshes unless they intentionally need link discovery.

## Portfolio Lab

Portfolio Lab is **optional enrichment**. Catalog fields come from public HTML embedding plus `/api/search`. There is no documented full-catalog API. Treat upstream HTML/RSC changes and third-party terms as **residual operational and legal risk — not cleared by this document**. See [attribution.md](attribution.md).

## Link enrichment and discovery

Optional team-website crawling (when enabled) should remain bounded (Nevada scope, low concurrency, respectful delays). Discovery may also read same-origin `robots.txt` / `sitemap.xml` and a small allowlist of common paths (About/Sponsors/Robots/Resources/Contact/Links), plus Linktree-style hubs linked from those pages. See [link-discovery.md](link-discovery.md). Broader research (Internet Archive, Onshape, school context beyond declared pages) belongs in dedicated issues and must not introduce student profiling.

## Open Alliance

Open Alliance enrichment is **opt-in** (`--enrich-open-alliance`) and defaults off on scheduled Actions. When enabled it issues a single public list fetch (`GET /teams/ftc`), not per-team crawl storms. See [open-alliance.md](open-alliance.md).

## Game Manual 0 gallery

GM0 gallery enrichment is **opt-in** (`--enrich-gm0`) and defaults off on scheduled Actions. When enabled it issues a single bounded fetch of `gallery.rst` (not the whole GM0 book), matches exact leading team numbers only, and stores outbound resource URLs plus a link to the public gallery page. Copyrighted GM0 prose is not copied into the seed. See [gm0.md](gm0.md).

## GitHub repository verification

GitHub enrichment is **opt-in** (`--enrich-github`) and defaults off on scheduled Actions. When enabled it verifies `github.com/owner/repo` URLs already on team links (website / OA / GM0), optionally fetching public REST metadata. Ownership is never inferred from team number alone. Prefer verifying known URLs over broad search (unauthenticated rate limits). See [github-repos.md](github-repos.md).

## Related

- [ingestion.md](ingestion.md)
- [attribution.md](attribution.md)
- [SECURITY.md](../SECURITY.md)
