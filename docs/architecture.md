# Architecture overview

High-level layout of Nevada FTC Team Analysis. Hosting runbooks (Worker today, Pages target, free-tier / Fail open) live in [deployment.md](deployment.md) under parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38); this page stays structural.

## Components

```text
Browser (React/Vite SPA)
    │  static assets + /data/*.json
    │  /ftc-proxy, /ftcscout-proxy, /portfolio-lab-proxy, /ftc-scoring-proxy
    ▼
Cloudflare Worker (worker/proxy.ts)     Local Vite dev proxies (same prefixes)
    │  GET/HEAD only, fixed upstream hosts
    ▼
FTC Events / FTCScout / Portfolio Lab / FTC Scoring (public HTTP)
```

| Piece | Location | Role |
| --- | --- | --- |
| UI | `src/` | Directory, season history, qualified Scout/lineage previews |
| Season model | `src/data/seasons.ts` | `SUPPORTED_SEASONS` (validate/name), explicit `CURRENT_SEASON`, `availableSeasons` from seed |
| Seed schema | `src/data/*Schema.ts` | Valibot validation for seed, regions, live enrichments |
| Canonical seed | `src/data/nv-ftc-teams.generated.json` | Checked-in Nevada snapshot (current scalars) |
| Observations side store | `src/data/nv-ftc-team-observations.generated.json` | Append-only field change history (#29) |
| Relationship graph | `src/data/relationshipGraph.ts`, `src/lib/relationshipGraphAdapters.ts` | Derived evidence-backed node/edge view over seed + lineage (#28); not a graph DB |
| Canonical identity | `src/lib/canonicalNormalization.ts`, `src/lib/canonicalIdentity.ts`, `src/data/ncesSchoolCatalog.ts` | Optional registered-location + org/school IDs (#16); derive-on-read or `--enrich-canonical-ids` |
| Aggregate school context | `src/data/aggregateSchoolContext.ts` | Allowlisted institution/geography fields only (#27); no live Census seed; fetch pipeline deferred |
| Public data copy | `public/data/` | Served as `/data/...` (via `npm run sync:data`) — mega-seed **and** split snapshot tree (#87) |
| Snapshot tree | `docs/snapshot-tree.md`, `src/data/snapshotTree*.ts` | `manifest.json`, region summaries, per-team JSON (generated at sync) |
| Ingestion | `scripts/pull-public-ftc-data.ts` | Public-page pull, publish guards |
| Worker | `worker/proxy.ts`, `wrangler.jsonc` | Allowlisted live-data proxy + static assets |

## Trust boundaries

- **Identity-critical path:** public FTC Events–backed seed + runtime schema validation; fail closed on broken envelopes.
- **Optional enrichment:** FTCScout, Portfolio Lab, avatars — failures surface as availability states, not empty “success” caches.
- **No credentialed FIRST API** in the current design (season discovery stays config + ingested data; see #14 / #17).
- **The Orange Alliance:** researched only (#21); **not** wired. Future role is non-canonical corroboration/enrichment; **FIRST remains canonical** for official results. See [orange-alliance.md](orange-alliance.md) and source hierarchy in [attribution.md](attribution.md).
- **Internet Archive / Wayback:** researched only (#25); **not** wired. Future role is optional reconstruction of **archived** public team website facts; never treated as current live truth. See [internet-archive.md](internet-archive.md).
- **Onshape:** researched only (#26); **not** wired as a crawler. CAD appears only as outbound `TeamLink` `cad` URLs when teams declare them (website / OA / GM0). Public Documents mining is **NO-GO**. See [onshape.md](onshape.md).

## Season model

| Layer | Source of truth | Role |
| --- | --- | --- |
| Supported | `SUPPORTED_SEASONS` + `SEASON_NAMES` | Years the app can validate and label |
| Current | `CURRENT_SEASON` (explicit constant) | Pull `--mode=current`, UI “current” tag, cache TTL “latest” |
| Available | Seed `targetSeasons` ∪ team season keys | Directory filter options (unsupported years hidden) |

When FTC Events has not published the current region page, the UI selects the last available season and shows a persistent fallback banner—never a silent empty “success” for the unpublished year.

## Related docs

- [ingestion.md](ingestion.md) — pull pipeline and guards
- [snapshot-tree.md](snapshot-tree.md) — static manifest / region / team JSON layout (#87)
- [link-discovery.md](link-discovery.md) — website/social link discovery, confidence, dead-link checks
- [open-alliance.md](open-alliance.md) — optional Open Alliance team-declared resource enrichment
- [gm0.md](gm0.md) — optional Game Manual 0 gallery resource enrichment
- [orange-alliance.md](orange-alliance.md) — TOA research: corroboration only; FIRST stays canonical (#21)
- [internet-archive.md](internet-archive.md) — Wayback research: archived website reconstruction only (#25)
- [onshape.md](onshape.md) — Onshape research: declared CAD links only; no Public Documents crawl (#26)
- [deployment.md](deployment.md) — deploy commands and proxy table
- [attribution.md](attribution.md) — sources, hierarchy, and residual risks
- [relationship-graph.md](relationship-graph.md) — evidence-backed team relationship graph model (#28)
- [canonical-identifiers.md](canonical-identifiers.md) — location/school/org canonical IDs (#16)
- [school-community-context.md](school-community-context.md) — aggregate school/community context policy (#27)
- [v1-milestone.md](v1-milestone.md) — product scope
