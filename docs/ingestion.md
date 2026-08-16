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
- Student PII or private contact databases
- Portfolio Lab as identity-critical input (optional enrichment only; HTML scrape carries residual terms/format risk)

## Tests

`npm test` uses local fixtures under `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Live refresh is for Actions `workflow_dispatch` / cron or intentional local pulls.
