# Architecture overview

High-level layout of Nevada FTC Team Analysis. Hosting runbooks (Pages vs Workers free-tier limits, cache TTLs, rollback) are deferred to [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38); this page stays structural.

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
| Seed schema | `src/data/*Schema.ts` | Valibot validation for seed, regions, live enrichments |
| Canonical seed | `src/data/nv-ftc-teams.generated.json` | Checked-in Nevada snapshot |
| Public seed copy | `public/data/` | Served as `/data/...` (via `npm run sync:data`) |
| Ingestion | `scripts/pull-public-ftc-data.ts` | Public-page pull, publish guards |
| Worker | `worker/proxy.ts`, `wrangler.jsonc` | Allowlisted live-data proxy + static assets |

## Trust boundaries

- **Identity-critical path:** public FTC Events–backed seed + runtime schema validation; fail closed on broken envelopes.
- **Optional enrichment:** FTCScout, Portfolio Lab, avatars — failures surface as availability states, not empty “success” caches.
- **No credentialed FIRST API** in the current design.

## Related docs

- [ingestion.md](ingestion.md) — pull pipeline and guards
- [deployment.md](deployment.md) — deploy commands and proxy table
- [attribution.md](attribution.md) — sources and residual risks
- [v1-milestone.md](v1-milestone.md) — product scope
