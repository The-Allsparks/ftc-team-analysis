# Nevada FTC Team Analysis

Trust-first Nevada-region FIRST Tech Challenge team directory and historical record (seasons `2025` through `2019`), with a local React/Vite UI.

Built and maintained by [The Allsparks](https://www.theallsparks.org/). Licensed under the [MIT License](LICENSE).

## License, privacy, and contributing

| Doc | Purpose |
| --- | --- |
| [LICENSE](LICENSE) | MIT license (Copyright (c) 2026 The Allsparks) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [docs/attribution.md](docs/attribution.md) | Data-source attribution and residual terms/scrape risk |
| [docs/privacy.md](docs/privacy.md) | Public-data stance; correction/claim via GitHub issues |
| [docs/school-community-context.md](docs/school-community-context.md) | Aggregate school/community context policy (#27; no student profiling) |
| [docs/architecture.md](docs/architecture.md) | System layout |
| [docs/ingestion.md](docs/ingestion.md) | Seed pull and publish guards |
| [docs/snapshot-tree.md](docs/snapshot-tree.md) | Static manifest / region / team snapshot tree (#87) |
| [docs/edge-cache.md](docs/edge-cache.md) | Edge Cache-Control + live-refresh throttle policy (#89) |
| [docs/deployment.md](docs/deployment.md) | Deploy overview (Worker today; Pages target + operator checklist → [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) / [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)) |
| [docs/responsible-crawling.md](docs/responsible-crawling.md) | Crawling / refresh traffic policy |
| [docs/link-discovery.md](docs/link-discovery.md) | Website/social link discovery, ownership confidence, privacy filters |
| [docs/github-repos.md](docs/github-repos.md) | Public GitHub repo verification + ownership evidence (#22) |
| [docs/relationship-graph.md](docs/relationship-graph.md) | Evidence-backed team relationship graph model (#28; derived view, not a graph DB) |
| [docs/canonical-identifiers.md](docs/canonical-identifiers.md) | Location/school/org canonical IDs (#16; ISO + curated NCES, fail-soft) |
| [docs/orange-alliance.md](docs/orange-alliance.md) | The Orange Alliance research (#21; corroboration only; FIRST stays canonical) |
| [docs/internet-archive.md](docs/internet-archive.md) | Internet Archive / Wayback research (#25; archived website reconstruction only) |
| [docs/onshape.md](docs/onshape.md) | Onshape CAD research (#26; declared links only; no Public Documents crawl) |
| [docs/team-corrections.md](docs/team-corrections.md) | Team-submitted corrections + moderation (#32; never auto-overwrite seed) |

## Product milestone

Immediate objective: **a trustworthy, source-backed Nevada FTC team directory and historical record.** Predictive and comparative analytics that depend on unresolved identity or provenance are deferred until readiness criteria are met. Existing Scout and lineage surfaces are a qualified preview. Maintainers may reject new analytics PRs until then — see [docs/v1-milestone.md](docs/v1-milestone.md).

## Setup

Use **Node 24** (see `.nvmrc`) and **npm 11+**. Compatibility floor: Node `^20.19 || >=22.12` (Vite 8). Dependency ranges and upgrade policy: [docs/dependency-policy.md](docs/dependency-policy.md).

Install from the lockfile, then run:

```bash
npm ci
npm test
npm run pull:data
npm run dev
```

The app boots **static-first** from the snapshot tree (`/data/manifest.json` + region summaries), then loads per-team JSON on demand; it falls soft to `public/data/nv-ftc-teams.generated.json` (served as `/data/nv-ftc-teams.generated.json`) when the tree is missing. The canonical checked-in seed remains `src/data/nv-ftc-teams.generated.json`; `npm run sync:data` (also run by `dev`, `build`, and `pull:data`) copies it into `public/data/` **and** generates the split snapshot tree (`manifest.json`, `regions/`, `teams/`) alongside it — see [docs/snapshot-tree.md](docs/snapshot-tree.md). A current-season seed file is checked in so the interface has data immediately, and `npm run pull:data` refreshes it from public FTC Events pages. At startup the app validates snapshot assets against runtime schema version `1` (`src/data/generatedSeedSchema.ts` / `snapshotTreeSchema.ts`). Invalid team records are quarantined with path/team-number diagnostics; a broken envelope (not an object, missing `teams`, empty or all-invalid teams) fails closed instead of showing an empty directory. Network/offline failures show a dedicated error state instead of an empty directory. `npm run validate:data` runs the same check from the CLI (plus Valibot validation of the snapshot tree). The current seed omits `schemaVersion` and is treated as version 1. Public sponsor/organization lines are kept as raw `organization` text and optionally split into typed `affiliations` (school vs sponsors, etc.); see [docs/organization-affiliations.md](docs/organization-affiliations.md). Core season facts support optional per-field `evidence`; the checked-in seed omits it and the UI derives display provenance on read or joins the append-only observations side store (`nv-ftc-team-observations.generated.json`) — see [docs/field-evidence.md](docs/field-evidence.md). Related-team suggestions are typed, evidence-backed, and unconfirmed by default (not implied succession); see [docs/team-relationships.md](docs/team-relationships.md). The region picker catalog (`src/data/regions.generated.json`) is validated the same way against schema version `1` (`src/data/regionCatalogSchema.ts`): invalid region rows are quarantined with path/code diagnostics, and a broken envelope (missing `regions`, empty, or all-invalid) fails closed instead of showing an empty region list. Maintainers can open a secondary **Data health** view via the footer **Data health** link or `#health` (seed `sourceChecks`, coverage gaps, session `SourceResult` statuses — see [docs/ingestion.md](docs/ingestion.md)). `npm test` runs Vitest against local parser fixtures in `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Before overwriting the seed, `pull:data` refuses a candidate that is not an object with a `teams` array, has 0 teams, or drops below 50% of the previous team count when that previous snapshot had at least 10 teams (the same guard applies before publishing snapshot trees).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on pull requests to `main` and on pushes to `main`. The job uses Node from `.nvmrc` (24) and then:

```bash
npm ci
npm test
npm run build
npm run check:bundle
npm run validate:data
```

`check:bundle` enforces primary JS size budgets and confirms the Nevada seed is served as a static `/data/` asset rather than embedded in the main chunk.

These checks are not yet required on `main` (branch protection remains a follow-up of [#10](https://github.com/The-Allsparks/ftc-team-analysis/issues/10)).

## Scheduled data refresh

GitHub Actions (`.github/workflows/data-refresh.yml`) refreshes the checked-in Nevada snapshot from public FTC pages (no FIRST API secrets):

| Trigger | Mode | Notes |
| --- | --- | --- |
| Cron Monday 16:00 UTC | `current` | Merges `CURRENT_SEASON` into the existing seed |
| Cron 1st of month 16:00 UTC | `full` | Rebuilds all configured seasons |
| `workflow_dispatch` | `current` or `full` | Manual; link enrichment optional |

Scheduled runs skip team-website link crawling to keep traffic modest. Open Alliance, Game Manual 0 gallery, GitHub, and YouTube verification enrichment are also off unless you pass `--enrich-open-alliance` / `--enrich-gm0` / `--enrich-github` / `--enrich-youtube` (see [docs/open-alliance.md](docs/open-alliance.md), [docs/gm0.md](docs/gm0.md), [docs/github-repos.md](docs/github-repos.md), and [docs/youtube.md](docs/youtube.md)). Before writing, `pull:data` reuses the empty/drop `publishGuard` and emits the snapshot tree; the workflow then runs `validate:data` (seed + observations + tree). Artifacts include the change report, `snapshot-tree-report.md`, `manifest.json` / `source-health.json`, and region summaries. When the checked-in seed or observations change, the workflow opens a PR by default (commits those `src/data/` files only — the tree stays gitignored and regenerates on build; never pushes directly to `main`, never auto-merges). Snapshot publication vs app deploy: [docs/snapshot-tree.md](docs/snapshot-tree.md). Set repository variable `DATA_REFRESH_OPEN_PR=false` to disable PR creation (artifacts still upload). **Required repo setting:** Actions → General → Workflow permissions → enable **Allow GitHub Actions to create and approve pull requests**; without that, the refresh still writes artifacts and pushes `data-refresh/*` but PR creation fails. Local flags:

```bash
npm run pull:data -- --mode=current --skip-link-enrichment
npm run pull:data -- --mode=full
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-gm0
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-github
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-youtube
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-canonical-ids
npm run pull:data -- --dry-run --candidate-fixture=src/data/fixtures/empty-generated-candidate.json
```

The empty-fixture dry-run is for gate testing only; it must exit non-zero against the real seed. Live upstream refresh is intended via Actions `workflow_dispatch` after this pipeline lands—not via unit tests.

## Production (Cloudflare)

**Today (supported):** Cloudflare **Worker** with Vite static assets plus a small allowlisted live-data proxy (`worker/proxy.ts`, `wrangler.jsonc`). Deploy with `npm run deploy` (`build` + `wrangler deploy`). Local Worker preview: `npm run preview:worker`.

**Target ([#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) / [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)):** Cloudflare **Pages** connected to this GitHub repo — build `npm run build` (includes `sync:data`), output `dist`, Node **24** (`.nvmrc`), production branch `main`, PR preview deployments on, **Fail open** under Settings → Runtime. Stay on **Workers Free** (no Paid); free-tier overage must fail (Error 1027), not bill.

**Mid-cutover:** keep `npm run deploy` working. Pages may serve the SPA + `/data/*` on `*.pages.dev` while live proxies still depend on the Worker until Pages Functions ([#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)). Full operator checklist: [docs/deployment.md](docs/deployment.md).

| Browser prefix | Upstream |
| --- | --- |
| `/ftc-proxy` | `https://ftc-events.firstinspires.org` |
| `/ftcscout-proxy` | `https://api.ftcscout.org` |
| `/portfolio-lab-proxy` | `https://www.ftcportfoliolab.org` |
| `/ftc-scoring-proxy` | `https://ftc-scoring.firstinspires.org` |

Local Vite (`npm run dev` / `npm run preview`) provides the same prefixes. The Worker only accepts `GET`/`HEAD` on those prefixes and never forwards arbitrary browser-supplied destinations. Static page views do not invoke the proxy Worker (`run_worker_first` is limited to the proxy paths).

## Data Sources

Full attribution, source hierarchy, and residual constraints: [docs/attribution.md](docs/attribution.md). Privacy and corrections: [docs/privacy.md](docs/privacy.md). Official competitive results remain **FIRST / FTC Events**–canonical; community sources (FTCScout, future TOA corroboration) never override them — see [docs/orange-alliance.md](docs/orange-alliance.md).

- FIRST Team/Event Search: https://www.firstinspires.org/team-event-search?content=teams&season=2025&country=United+States&state=NV&programs=FIRST+Tech+Challenge&indices=teams_*
- FTC Events Nevada region pages: https://ftc-events.firstinspires.org/2025/region/USNV
- FTC Events public team pages: https://ftc-events.firstinspires.org/2025/team/16158
- FTC Events API information: https://ftc-events.firstinspires.org/services/API
- FTC Portfolio Lab (optional enrichment): https://www.ftcportfoliolab.org/portfolio — rated public portfolio catalog; attribute [FTC Portfolio Lab](https://www.ftcportfoliolab.org/). The only known public JSON surface used here is `/api/search` (search hits). Full catalog fields are read from the public `/portfolio` HTML embedding. There is no documented full-catalog API; upstream HTML/RSC format changes and third-party terms are residual risks (not a legal clearance).
- The Orange Alliance (research only, #21): https://theorangealliance.org/ — account-gated API researched for future non-canonical corroboration/media enrichment; **not** wired to `pull:data`.
- Internet Archive / Wayback (research only, #25): https://archive.org/ / https://web.archive.org/ — Availability/CDX researched for future archived team-site reconstruction; **not** wired to `pull:data` or scheduled refresh.

## Public-Only Limitation

The official FTC Events API requires a username and token, so this project does not call it. Organization data is parsed from public sponsor text when available, and detailed event/award data is limited to what public FTC Events team pages expose. Do not gather student PII.

Live enrichments (FTC Events refresh, FTCScout, Portfolio Lab, team avatars) use a shared source-result model so proxy/network/rate-limit failures are not stored as empty successful data. Portfolio Lab is **optional enrichment only** (not identity-critical): catalog HTML extraction is string-aware, entries and `/api/search` hits are validated with Valibot (`src/data/portfolioLabSchema.ts`), invalid catalog rows are quarantined, and extract/schema failures map to `parse_failure`. FTCScout quick-stats and event payloads are validated with Valibot (`src/data/ftcScoutSchema.ts`) before normalize/cache/UI: invalid event rows are quarantined with path diagnostics, and envelope or quick-stats schema failures map to `parse_failure`. Retained FTCScout fields include world-scope season OPR, sample size, event OPR/avg, and optional score spread (`dev.totalPoints`), with calculated-vs-official labeling and a local metadata catalog (`src/data/ftcScoutMeta.ts`, `v1`). The UI shows calm availability messages for everyday use, with optional **Technical details** for diagnostics.

## Team avatars

Official FIRST team avatars (40×40 PNG uploads from [FTC Scoring](https://ftc-scoring.firstinspires.org)) are resolved at runtime from the same public composed stylesheet FTC Event Web uses (`/avatars/composed/{year}.css` on FTC Scoring, proxied in dev). Teams without an approved avatar show initials in the UI. Avatar availability varies by season and is not stored in the generated team JSON.
