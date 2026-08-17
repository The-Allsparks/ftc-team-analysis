# Static snapshot tree

Split static JSON layout for Nevada FTC Team Analysis ([#87](https://github.com/The-Allsparks/ftc-team-analysis/issues/87), parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)).

The **canonical mega-seed** remains `src/data/nv-ftc-teams.generated.json` (served as `/data/nv-ftc-teams.generated.json`). The snapshot tree is **generated alongside** that path during `npm run sync:data` / `npm run generate:snapshots` / successful `pull:data` public sync. The app loader still uses the mega-seed today ([#88](https://github.com/The-Allsparks/ftc-team-analysis/issues/88) will consume this tree).

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
| `npm run validate:data` | Valibot-validate mega-seed, observations, **and** the tree |
| `npm run build` / `dev` | Always run `sync:data` first |

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
- **Team index** — latest scalars + `seasons` + `seasonPaths`.
- **Team season** — `{ schemaVersion, number, season, generatedAt, detail }` where `detail` is the seed `TeamSeason` object.
- **source-health.json** — `generatedAt`, `regionCode`, `teamCount`, seed `sourceChecks` (edge/dashboard metadata slice for [#30](https://github.com/The-Allsparks/ftc-team-analysis/issues/30) / #38).

## Intended cache TTLs

Header differentiation may land with [#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89). Until then, `public/_headers` applies a **uniform short** `Cache-Control` to all `/data/*`.

| Asset class | Intended `max-age` | Notes |
| --- | ---: | --- |
| Historical season summaries / team-season JSON | **30 days** (`2592000`) | Treat as immutable after season close |
| Current season slices, `manifest.json`, `source-health.json` | **5 minutes** (`300`) | Align with refresh cadence |
| Mega-seed + observations (transition) | **5 minutes** (`300`) | Matches today's `/data/*` header |

These values are embedded in `manifest.cachePolicy` for consumers and docs; do not assume edge headers already differ by path.

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

## Related

- [architecture.md](architecture.md) — system layout
- [ingestion.md](ingestion.md) — pull + guards
- [deployment.md](deployment.md) — Pages/`/data` serving
- App loader rewrite: #88 (out of scope here)
