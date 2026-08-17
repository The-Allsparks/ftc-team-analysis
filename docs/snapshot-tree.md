# Static snapshot tree

Split static JSON layout for Nevada FTC Team Analysis ([#87](https://github.com/The-Allsparks/ftc-team-analysis/issues/87), parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)).

The **canonical mega-seed** remains `src/data/nv-ftc-teams.generated.json` (served as `/data/nv-ftc-teams.generated.json`). The snapshot tree is **generated alongside** that path during `npm run sync:data` / `npm run generate:snapshots` / successful `pull:data` public sync. The app boots **static-first** from the tree ([#88](https://github.com/The-Allsparks/ftc-team-analysis/issues/88)): manifest + region summaries for the directory, per-team JSON on demand, with mega-seed as a fail-soft fallback when the tree is missing.

## On-disk layout

Generated under `public/data/` (gitignored; produced at sync/build time from the checked-in seed):

```text
public/data/
  nv-ftc-teams.generated.json          # transitional mega-seed (unchanged #12 path)
  nv-ftc-team-observations.generated.json
  manifest.json
  source-health.json
  regions/
    USNV/
      <season>/
        summary.json                   # lightweight team list for one season
  teams/
    <number>/
      index.json                       # current scalars + season path index
      <season>.json                    # full TeamSeason detail
```

## Commands

| Command | Role |
| --- | --- |
| `npm run sync:data` | Copy mega-seed + observations, then write the tree |
| `npm run generate:snapshots` | Tree only (same generator) |
| `npm run validate:data` | Valibot-validate mega-seed, observations, **and** the tree; writes `snapshot-tree-report.md` |
| `npm run pull:data` | Refresh seed + observations, then emit the tree (same generator as sync) |
| `npm run build` / `dev` | Always run `sync:data` first |

## Snapshot publication vs app deploy

These are **different** operator paths:

| Path | What changes | How it ships |
| --- | --- | --- |
| **Snapshot publication** | Canonical mega-seed + observations under `src/data/` | Scheduled/manual [data-refresh](../.github/workflows/data-refresh.yml): `pull:data` → `validate:data` → PR when inputs change. Merge the data PR; do **not** hand-edit `public/data/`. |
| **App deploy** | SPA/Worker/Pages build output | Push/merge to `main` triggers CI + (Pages) production build, or run `npm run deploy` for the Worker. `npm run build` runs `sync:data`, so `/data/*` (mega-seed **and** tree) is regenerated from the checked-in seed at build time. |

Practical rules:

1. Refresh data with Actions (or local `pull:data`); review the data PR (publish guard + `validate:data` already ran).
2. After the data PR merges to `main`, the next app build publishes a fresh tree — no separate “upload JSON to Pages” step.
3. Workflow artifacts include `manifest.json`, `source-health.json`, region summaries, and `snapshot-tree-report.md` for inspection; those tree files are **not** committed (gitignored under `public/data/`).
4. Redeploying the app without a seed change republishes the same logical snapshot (tree regenerated identically from the same seed).

## `manifest.json` schema (v1)

Valibot: `src/data/snapshotTreeSchema.ts` (`SNAPSHOT_TREE_SCHEMA_VERSION = 1`).

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Literal `1` |
| `generatedAt` | Seed `generatedAt` (data freshness) |
| `treeGeneratedAt` | When this tree was emitted |
| `regionCode` / `regionLabel` | Region identity |
| `currentSeason` | `CURRENT_SEASON` from `src/data/seasons.ts` |
| `seasons` | Seasons present in the tree (target ∪ available) |
| `teamCount` / `teams[]` | Team index (`number`, `latestName`, `path`) |
| `paths` | URL templates for mega-seed, observations, summaries, team files |
| `cachePolicy` | Intended TTLs (see below) |

## Region summary / team files

- **Region summary** — per season: `number`, `name`, `location`, `teamType`, `league`, `city`, `active` (small-first directory load).
- **Team index** — latest scalars + `seasons` + `seasonPaths`, plus team-level `links` / `codeRepositories` / `videoResources` when present.
- **Team season** — `{ schemaVersion, number, season, generatedAt, detail }` where `detail` is the seed `TeamSeason` object.
- **source-health.json** — `schemaVersion`, `generatedAt`, `regionCode`, `teamCount`, `seedAgeMs`, `seedStale`, `sourceCheckFailureCount`, and seed `sourceChecks` (static operator/edge slice for [#30](https://github.com/The-Allsparks/ftc-team-analysis/issues/30) / [#91](https://github.com/The-Allsparks/ftc-team-analysis/issues/91); full dashboard coverage stays in-app).

## Intended cache TTLs

Policy and path-specific `Cache-Control` live in [edge-cache.md](edge-cache.md) and [`public/_headers`](../public/_headers) ([#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89)). Classification helpers: `src/lib/edgeCachePolicy.ts`. Values are also embedded in `manifest.cachePolicy`.

| Asset class | Intended `max-age` | Notes |
| --- | ---: | --- |
| Historical season summaries / team-season JSON | **30 days** (`2592000`) | Long immutable headers for closed seasons |
| Current season slices, `manifest.json`, `source-health.json`, team `index.json` | **5 minutes** (`300`) | Align with refresh cadence + SWR |
| Mega-seed + observations (transition) | **5 minutes** (`300`) | Same short class as current |

**Quota reminder:** normal browsing must hit these static files, not cached Functions — see [edge-cache.md](edge-cache.md).

## Publish guard

Tree writes call `assertSafeToPublishGeneratedData` ([#34](https://github.com/The-Allsparks/ftc-team-analysis/issues/34)) before emitting files. Empty or catastrophic team-count drops refuse the tree the same way they refuse mega-seed overwrites. Invalid seed envelopes also fail closed in `sync:data` / `generate:snapshots`.

## Size re-measure

`sync:data` / `generate:snapshots` print a markdown comparison vs the [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) 2026-08-14 baseline table (formatted / minified / gzip mega-seed, region summary gzip, average team-season gzip). Re-record those numbers in PRs that change the seed or tree shape.

Re-measured from the checked-in seed (`generatedAt` `2026-08-16T16:17:01.259Z`, 113 teams):

| Form | #38 baseline (2026-08-14) | This seed |
| --- | ---: | ---: |
| Formatted mega-seed JSON on disk | 1,739,610 bytes (1.66 MiB) | 2,117,868 bytes (2.02 MiB) |
| Minified mega-seed JSON | 1,128,924 bytes (1.08 MiB) | 1,363,996 bytes (1.30 MiB) |
| gzip of minified mega-seed (zlib level 9) | 67,400 bytes (65.82 KiB) | 79,129 bytes (77.27 KiB) |
| Lightweight region summary gzip | 2,716 bytes (2.65 KiB) | 1,520 bytes (1.48 KiB) |
| Average individual team-season gzip | 1,350 bytes (1.32 KiB) | 908 bytes (908 B) |

Tree emit: **474** files (manifest + source-health + 8 region summaries + 113 team indexes + 351 team-season files). Still practical for static hosting.

## App load path (static-first, #88)

| Step | Asset | When |
| --- | --- | --- |
| 1 | `/data/manifest.json` | Directory boot |
| 2 | `/data/regions/{region}/{season}/summary.json` | Directory boot (all seasons listed in the manifest) |
| 3 | `/data/teams/{number}/{season}.json` (+ optional `index.json`) | When a team/season is selected |
| Fallback | `/data/nv-ftc-teams.generated.json` | Tree missing/invalid — fail soft, still no JS-bundled seed |
| Live proxies | `/ftc-proxy` (and Scout/Portfolio/Scoring prefixes) | Explicit Refresh, missing snapshot slice, empty season, or non-seeded region |

Degraded mode keeps a valid directory snapshot on screen and surfaces SourceResult-style failure UX for proxy/upstream errors. The directory remains useful if all live Functions/Worker proxies are unavailable.

## Related

- [architecture.md](architecture.md) — system layout (static-first note)
- [edge-cache.md](edge-cache.md) — static + proxy Cache-Control / throttle policy (#89)
- [ingestion.md](ingestion.md) — pull + guards + data-refresh (#90)
- [deployment.md](deployment.md) — Pages/`/data` serving; snapshot vs app deploy
- [cloudflare-pages.md](cloudflare-pages.md) — Pages runbook + `source-health.json` (#91)
- App loader: #88 (this document)
