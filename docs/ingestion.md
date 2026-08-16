# Ingestion overview

How the Nevada snapshot is built and refreshed from **public** FTC pages. See also [responsible-crawling.md](responsible-crawling.md) and [attribution.md](attribution.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run pull:data` | Refresh `src/data/nv-ftc-teams.generated.json` from public FTC Events pages |
| `npm run sync:data` | Copy canonical seed into `public/data/` for static serve |
| `npm run validate:data` | CLI check against the generated-seed runtime schema |

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

## What is not ingested

- Credentialed FTC Events API payloads
- Student PII or private contact databases
- Portfolio Lab as identity-critical input (optional enrichment only; HTML scrape carries residual terms/format risk)

## Tests

`npm test` uses local fixtures under `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Live refresh is for Actions `workflow_dispatch` / cron or intentional local pulls.
