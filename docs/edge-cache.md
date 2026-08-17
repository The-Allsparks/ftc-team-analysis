# Edge cache and throttling policy

Cache / throttle rules for static snapshot assets and live proxy Functions ([#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89), parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)).

Browser `localStorage` (`src/lib/ftcCache.ts`) is **not** edge cache. This document covers Cloudflare **static** headers and **proxy response** `Cache-Control`.

## Non-negotiable (from #38 Cloudflare behavior check, 2026-08-14)

1. **Normal browsing must not depend on cached Functions for Free-tier quota safety.** The only documented unlimited path is **static assets that never invoke Functions** (SPA + `/data/**` with `_routes.json` excludes once Functions exist — [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)).
2. **Workers Caching HITs still count as Function requests** toward the Free 100k/day quota. Cache API `put`/`match` also runs the Function. Edge cache can reduce **upstream** load and **CPU**; it does **not** make Function traffic free.
3. **`stale-while-revalidate` is fine on static CDN `Cache-Control`.** It is **not** supported on Cache API `cache.put` / `cache.match`. Do not combine SWR with Cache API, and do not rely on Workers Caching + SWR for Pages until a preview proves `Cf-Cache-Status: HIT` without extra Function-cost assumptions.
4. Prefer **response `Cache-Control` headers** on proxies over Cache API + SWR. Stay on **Workers Free**; do not enable Workers Paid.

## Static snapshot TTLs

Aligned with `SNAPSHOT_CACHE_TTL` in `src/data/snapshotTreeSchema.ts` and path classification in `src/lib/edgeCachePolicy.ts`. Wired in [`public/_headers`](../public/_headers) (copied into `dist/` by Vite; honored by Pages).

| Asset class | Paths (examples) | `Cache-Control` | `max-age` |
| --- | --- | --- | ---: |
| Hashed app assets | `/assets/*` | `public, max-age=31536000, immutable` | 1 year |
| App shell | `/`, `/index.html` | `public, max-age=0, must-revalidate` | 0 |
| Current / volatile data | `manifest.json`, `source-health.json`, mega-seed + observations, `teams/*/index.json`, **current-season** region/team JSON | `public, max-age=300, stale-while-revalidate=86400` | **5 min** |
| Historical season data | `regions/*/{2019–2025}/summary.json`, `teams/*/{2019–2025}.json` | `public, max-age=2592000, immutable` | **30 days** |

When `CURRENT_SEASON` rolls forward in `src/data/seasons.ts`, move the previous year from the short-TTL current block into the historical `_headers` entries. `edgeCachePolicy.test.ts` fails if a historical season is missing from `_headers`.

## Proxy upstream TTLs

Set on **successful** Worker / future Pages Function responses in `proxyLiveUpstream` (`src/lib/liveProxy.ts`). Errors use `Cache-Control: no-store`.

| Upstream class | Browser prefix | Successful `Cache-Control` | Rationale |
| --- | --- | --- | --- |
| FTC Events (current season or unknown year) | `/ftc-proxy` | `public, max-age=60` | Live roster/pages change often; stay short |
| FTC Events (historical season in path) | `/ftc-proxy/{year}/…` | `public, max-age=3600` | Closed seasons change rarely; still conservative |
| FTCScout | `/ftcscout-proxy` | `public, max-age=120` | Stats can move during events |
| Portfolio Lab | `/portfolio-lab-proxy` | `public, max-age=300` | Catalog enrichment; optional |
| FTC Scoring (avatars) | `/ftc-scoring-proxy` | `public, max-age=600` | Composed CSS changes infrequently |

No `stale-while-revalidate` on proxy responses. Do **not** assume these headers collapse Function request quota via Workers Caching.

## Throttling and coalescing (client)

| Guard | Where | Behavior |
| --- | --- | --- |
| In-flight coalesce | `src/lib/liveRefreshGuard.ts` → `fetchFtcHtml` / `fetchFtcOk` | Identical concurrent proxy GETs/HEADs share one network call |
| Soft min-interval helper | `isRefreshThrottled` / `markRefreshAttempt` (5s default) | Available for automatic retries; **force / explicit Refresh bypasses** |
| UI session guards | `AppDirectory` refresh keys | Avoid repeat auto team/Scout pulls for the same selection |
| Browser localStorage TTL | `ftcCache.ts` | Client-only; unrelated to edge quota |

Live refresh remains **opt-in / degraded-mode** relative to static-first loading ([snapshot-tree.md](snapshot-tree.md) #88). Directory browsing uses `/data/**` only.

## Pages verification (operator — may be later)

Live Pages project may still be pending ([#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)). Do **not** invent `Cf-Cache-Status` evidence. When a preview exists:

1. Confirm Fail open is set ([cloudflare-pages.md](cloudflare-pages.md#fail-open)).
2. Load SPA + `/data/manifest.json` and a historical team-season JSON; confirm response `Cache-Control` matches the table above (DevTools → Network).
3. Hit an allowlisted proxy once Functions (#86) or the Worker is in front; confirm successful responses include the proxy `Cache-Control` values.
4. Optionally inspect `Cf-Cache-Status`. Treat **HIT** as interesting for upstream savings only — **do not** treat HIT as “this request was free of Function quota” unless Cloudflare docs for that host prove otherwise (still open for Pages Functions + Workers Caching).
5. Confirm `_routes.json` (when present) excludes static `/data` and `/assets` from Function invocation so normal browsing stays on the unlimited static path.

## Related

- [snapshot-tree.md](snapshot-tree.md) — tree layout + TTL cross-link
- [deployment.md](deployment.md) — Worker today / Pages target
- [cloudflare-pages.md](cloudflare-pages.md) — Pages runbook (#91)
- [architecture.md](architecture.md) — static-first data path
- Parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) behavior comment
