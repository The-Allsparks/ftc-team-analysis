# Ingestion overview

How the Nevada snapshot is built and refreshed from **public** FTC pages. See also [responsible-crawling.md](responsible-crawling.md) and [attribution.md](attribution.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run pull:data` | Refresh `src/data/nv-ftc-teams.generated.json` from public FTC Events pages; updates `nv-ftc-team-observations.generated.json` |
| `npm run sync:data` | Copy canonical seed **and** observations side store into `public/data/` for static serve |
| `npm run validate:data` | CLI check against the generated-seed runtime schema (and observations side store when present) |

Common flags:

```bash
npm run pull:data -- --mode=current --skip-link-enrichment
npm run pull:data -- --mode=full
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-gm0
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-github
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-canonical-ids
npm run pull:data -- --dry-run --candidate-fixture=src/data/fixtures/empty-generated-candidate.json
```

## Publish guards

Before overwriting the seed, `pull:data` refuses a candidate that:

- is not an object with a `teams` array,
- has 0 teams, or
- drops below 50% of the previous team count when the previous snapshot had at least 10 teams.

Scheduled GitHub Actions (`.github/workflows/data-refresh.yml`) run the same pull path, then `validate:data`, write a change report artifact, and open a PR when the seed changes (never force-push to `main`).

## Source checks

Successful refreshes record per-source `sourceChecks` timestamps on the snapshot so operators can see when each upstream was last observed healthy.

## Data health dashboard (#30)

Maintainers can open a secondary **Data health** view from the footer link or `#health`. It aggregates:

- seed `sourceChecks`, snapshot age (stale when `generatedAt` is older than 8 days), and record counts
- coverage gaps (missing website / organization / location) by season
- affiliation confidence, evidence conflicts / unconfirmed rows, and unverified inferred relationships
- season-over-season team-count deltas (highlighted drops ≥20% when the prior season had ≥10 teams)
- optional browser last-seen team count (localStorage) for visit-to-visit deltas
- **session-only** live `SourceResult` statuses already observed in-app (does not probe upstreams on open)

Refresh-to-refresh field observations are stored in the append-only side store `nv-ftc-team-observations.generated.json` (see [#29](https://github.com/The-Allsparks/ftc-team-analysis/issues/29) and [field-evidence.md](field-evidence.md)). Hosting/edge source-health metadata stays with [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38).

## What is not ingested

- Credentialed FTC Events API payloads
- Student PII or private contact databases (link collectors filter personal social/mailto patterns; see [privacy.md](privacy.md) and [link-discovery.md](link-discovery.md))
- Portfolio Lab as identity-critical input (optional enrichment only; HTML scrape carries residual terms/format risk)

## Link enrichment (#24)

When `--skip-link-enrichment` is **not** set, `pull:data` runs bounded public discovery (`src/lib/linkDiscovery.ts`): On The Web URLs, homepage anchors, robots/sitemap, common site paths, and link-hub outs. Links are normalized, privacy-filtered, annotated with ownership confidence/evidence, and optionally checked for liveness.

## Open Alliance enrichment (#19)

Opt-in with `--enrich-open-alliance` (default **off** for CI/scheduled refresh). Performs one public `GET` to `api.theopenalliance.org/teams/ftc`, matches **exact team numbers** only, and attaches declared code/CAD/build-thread/media/website URLs as attributed `TeamLink` enrichment. OA awards/stats are not ingested as competitive results. See [open-alliance.md](open-alliance.md).

## Game Manual 0 gallery enrichment (#20)

Opt-in with `--enrich-gm0` (default **off** for CI/scheduled refresh). Performs one bounded public GET of GM0 `gallery.rst`, matches **exact leading team numbers** only (name-only headings rejected), and attaches curated resource URLs plus a gallery page link as attributed `TeamLink` enrichment. Copyrighted GM0 prose is linked, not copied. See [gm0.md](gm0.md).

## GitHub repository verification (#22)

Opt-in with `--enrich-github` (default **off** for CI/scheduled refresh). Verifies public `github.com/owner/repo` URLs already present on `Team.links` (website / Open Alliance / GM0), stores additive `codeRepositories` with owner, languages, last activity, and evidence. Ownership is never inferred from team number alone. See [github-repos.md](github-repos.md).

## Canonical location / organization identity (#16)

Opt-in with `--enrich-canonical-ids` (default **off** for CI/scheduled refresh). Offline string normalization plus a curated NCES allowlist fills optional `registeredLocation` and affiliation identity fields. Registered postal location stays distinct from event-region membership (`regionCode` / `region`). External IDs are never invented; ambiguous names are quarantined. UI helpers can also derive-on-read without rewriting the seed. See [canonical-identifiers.md](canonical-identifiers.md).

## Tests

`npm test` uses local fixtures under `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Live refresh is for Actions `workflow_dispatch` / cron or intentional local pulls.
