# Open Alliance enrichment

Optional ingestion of **team-declared** technical resources from [The Open Alliance FTC listing](https://theopenalliance.org/ftc) / public API.

Related: [ingestion.md](ingestion.md), [link-discovery.md](link-discovery.md), [attribution.md](attribution.md), [responsible-crawling.md](responsible-crawling.md).

## Role

Open Alliance data is **enrichment only**:

- Attached as `TeamLink` rows (code / CAD / build thread / media / website)
- Shown in Useful Links with visible `Open Alliance (team-declared)` attribution
- **Not** used as canonical competitive records, awards, ranks, or OPR

OA `NewestAward` / award fields from the API are intentionally ignored.

## Confirmed vs inferred

| Item | Status |
| --- | --- |
| Public UI at `https://theopenalliance.org/ftc` and `/ftc/teams` | **Confirmed** (Nuxt SPA) |
| Frontend `API_URL` = `https://api.theopenalliance.org` | **Confirmed** (embedded Nuxt config) |
| `GET /teams/ftc` returns team list + declared link fields | **Confirmed** (live JSON + [FTCOA-API](https://github.com/FTCOpenAlliance/FTCOA-API) `getTeamList`) |
| Resource fields: `BuildThread`, `CAD`, `Code`, `Photo`, `Video`, `TeamWebsite` | **Confirmed** (`TeamLinks` table / list payload) |
| Exact `TeamNumber` (1–5 digits) + optional `TeamID` = `FTC{n}` | **Confirmed** (API validation + list shape) |
| Per-team HTML scrape of `/ftc/teams` SSR | **Not used** (list is empty without client fetch; API is the bounded source) |
| GitHub org search / deep verification | Declared OA `Code` URLs may be verified via [`--enrich-github`](github-repos.md) ([#22](https://github.com/The-Allsparks/ftc-team-analysis/issues/22)) |

## Matching rule

Association requires an **exact numeric team number** equal to the Nevada seed `team.number`.

Rejected:

- Name-only matches
- Fuzzy suffixes (`16158-B`)
- Prefixed values in `TeamNumber` (`FTC16158`)
- `TeamID` that does not equal `FTC{number}` when present

## How to run

Off by default (CI / scheduled refresh stay light):

```bash
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance
```

Behavior:

1. One public `GET https://api.theopenalliance.org/teams/ftc` (no per-team hammering)
2. Filter to exact matches against pulled Nevada teams
3. Upsert declared URLs into `Team.links` with `ownershipConfidence: high` and evidence citing the OA listing URL
4. Fail soft: OA errors are recorded in `sourceChecks` and do not abort the FTC Events seed

## Privacy / crawling

- Public API only; no OA auth codes or PII tables (`TeamPII` is internal to OA)
- Reuses link privacy filters (`isAllowedPublicTeamLink`) before storage
- See [privacy.md](privacy.md) and [responsible-crawling.md](responsible-crawling.md)

## Code

| Path | Role |
| --- | --- |
| `src/lib/openAlliance.ts` | Parse, exact match, map to `TeamLink`, optional fetch |
| `src/lib/openAlliance.test.ts` | Fixtures for match / non-match / attribution |
| `src/lib/fixtures/open-alliance-ftc-teams.json` | Small synthetic listing (not a full scrape) |
| `scripts/pull-public-ftc-data.ts` | `--enrich-open-alliance` wiring |
