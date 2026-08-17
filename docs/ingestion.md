# Ingestion overview

How the Nevada snapshot is built and refreshed from **public** FTC pages. See also [responsible-crawling.md](responsible-crawling.md) and [attribution.md](attribution.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run pull:data` | Refresh `src/data/nv-ftc-teams.generated.json` from public FTC Events pages; updates `nv-ftc-team-observations.generated.json` |
| `npm run sync:data` | Copy canonical seed **and** observations into `public/data/`, then generate the split snapshot tree |
| `npm run generate:snapshots` | Regenerate `manifest.json` / region summaries / per-team JSON only |
| `npm run validate:data` | CLI check against the generated-seed runtime schema, observations (when present), and snapshot-tree schemas; writes `snapshot-tree-report.md` |

Common flags:

```bash
npm run pull:data -- --mode=current --skip-link-enrichment
npm run pull:data -- --mode=full
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-gm0
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-github
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-youtube
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-canonical-ids
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-first-api
npm run pull:data -- --dry-run --candidate-fixture=src/data/fixtures/empty-generated-candidate.json
```

## Publish guards

Before overwriting the seed, `pull:data` refuses a candidate that:

- is not an object with a `teams` array,
- has 0 teams, or
- drops below 50% of the previous team count when the previous snapshot had at least 10 teams.

The same empty/drop guard runs before writing the split snapshot tree under `public/data/` (see [snapshot-tree.md](snapshot-tree.md)). Mega-seed publication and tree emission stay aligned during the #12 → #87 transition.

Scheduled GitHub Actions (`.github/workflows/data-refresh.yml`) run the same pull path (which emits the #87 snapshot tree), then `validate:data` (seed + observations + full tree), upload change/tree artifacts (`data-refresh-report.md`, `snapshot-tree-report.md`, `manifest.json`, region summaries), and open a PR when the **checked-in** seed or observations change (never force-push to `main`). The PR commits `src/data/nv-ftc-teams.generated.json` and `nv-ftc-team-observations.generated.json` only — the split tree stays gitignored and is regenerated on `npm run build` / Pages deploy. See [snapshot-tree.md](snapshot-tree.md) for snapshot publication vs app deploy.

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

Refresh-to-refresh field observations are stored in the append-only side store `nv-ftc-team-observations.generated.json` (see [#29](https://github.com/The-Allsparks/ftc-team-analysis/issues/29) and [field-evidence.md](field-evidence.md)). Hosting ops (Fail open, rollback, disable-live) live in [cloudflare-pages.md](cloudflare-pages.md) ([#91](https://github.com/The-Allsparks/ftc-team-analysis/issues/91) / [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)). A static `source-health.json` slice (seed `sourceChecks` + stale/age helpers) is emitted with the snapshot tree ([snapshot-tree.md](snapshot-tree.md)) and validated by `validate:data`.

## What is not ingested

- Live FIRST API payloads in **CI / scheduled refresh** (no secrets required for green builds). Opt-in local/operator `--enrich-first-api` is documented in [first-api.md](first-api.md); production browser secret injection remains blocked on [#2](https://github.com/The-Allsparks/ftc-team-analysis/issues/2)
- The Orange Alliance API payloads (researched in #21; not wired to `pull:data`)
- Internet Archive / Wayback payloads (researched in #25; not wired to `pull:data` or scheduled refresh)
- Onshape Public Documents / CAD binaries (researched in #26; declared CAD URLs may arrive via website / OA / GM0 only — see [onshape.md](onshape.md))
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

## YouTube verification (#23)

Opt-in with `--enrich-youtube` (default **off** for CI/scheduled refresh). Verifies public YouTube channel/video/playlist URLs already present on `Team.links`, stores additive `videoResources` with kind, title, publishedAt, seasonHint, and evidence. Works without `YOUTUBE_API_KEY` (declared-link path); optional Data API metadata uses a server-side key only. Name-only matches are never auto-accepted. See [youtube.md](youtube.md).

## Canonical location / organization identity (#16)

Opt-in with `--enrich-canonical-ids` (default **off** for CI/scheduled refresh). Offline string normalization plus a curated NCES allowlist fills optional `registeredLocation` and affiliation identity fields. Registered postal location stays distinct from event-region membership (`regionCode` / `region`). External IDs are never invented; ambiguous names are quarantined. UI helpers can also derive-on-read without rewriting the seed. See [canonical-identifiers.md](canonical-identifiers.md).

## Authenticated FIRST FTC Events API (#17)

Opt-in with `--enrich-first-api` (default **off** for CI/scheduled refresh). When `FIRST_API_USERNAME` and `FIRST_API_TOKEN` are set **server-side**, the pull prefers API awards, event ranks, and qualification records over public HTML for those fields. Without credentials the client returns a fail-soft `SourceResult` (`credentials_absent`) and does **not** call the live API — public pages stay canonical. Secrets never enter the Vite client. See [first-api.md](first-api.md).

## Aggregate school / community context (#27)

**Not ingested yet.** Policy and allowlisted Valibot types exist for future CCD/EDGE/ACS aggregates keyed by #16 NCES IDs. No student-level paths; no bulk Census downloads in-repo. See [school-community-context.md](school-community-context.md).

## The Orange Alliance (#21)

**Not ingested yet** (research only). Conditional go for future non-canonical corroboration/media enrichment after terms and secrets; competitive corroboration should wait until FIRST API is the configured canonical path in production ([first-api.md](first-api.md) / [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17)). **Do not** treat TOA as canonical where FIRST official data exists. See [orange-alliance.md](orange-alliance.md).

## Internet Archive / Wayback (#25)

**Not ingested yet** (research only). Conditional go for future opt-in reconstruction of known Nevada team website captures via Availability/CDX; facts must be labeled **archived** (never current). **Do not** enable on scheduled data-refresh. See [internet-archive.md](internet-archive.md).

## Onshape CAD (#26)

**Not crawled** (research only). Prefer attaching **declared** Onshape document URLs already found via website / Open Alliance / GM0 as `TeamLink` `cad` rows. **Do not** search or mine Onshape Public Documents via API or scrape (API Terms prohibit automated Public Documents extraction). Matching stub rejects number-only hits — see [onshape.md](onshape.md).

## Tests

`npm test` uses local fixtures under `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Live refresh is for Actions `workflow_dispatch` / cron or intentional local pulls.
