# Cloudflare Pages runbook

Operator runbook for parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) ([#91](https://github.com/The-Allsparks/ftc-team-analysis/issues/91)). Covers free-tier limits, Fail open, Error 1027, preview vs production, `_routes.json` (for [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)), how to disable live Functions, and rollback.

**Do not duplicate** cache TTL / throttle details here — see [edge-cache.md](edge-cache.md). Deploy command overview and Worker proxy table: [deployment.md](deployment.md). License / privacy stay in [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) docs ([attribution.md](attribution.md), [privacy.md](privacy.md), `LICENSE`) — this runbook does not fork them.

## Residual Workers vs Pages cutover (#85 / #86)

| Slice | Issue | Status (as of this runbook) |
| --- | --- | --- |
| Docs + build contract + operator checklist | [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85) | **Closed in-repo** (checklist in [deployment.md](deployment.md)). **Live Pages project** may still be **operator-pending** (GitHub App + dashboard connect). Do not invent a production `*.pages.dev` URL until the project exists. |
| Pages Functions + `_routes.json` | [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86) | **In-repo:** `functions/` + `public/_routes.json` share `src/lib/liveProxy.ts` with the Worker. **Live verification** needs a Pages project that deploys Functions ([#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)). |
| Static snapshot tree / loader / edge policy | #87–#90 | **Landed** in-repo; tree regenerates on `sync:data` / build. |
| This runbook + `source-health.json` | #91 | This document + static health artifact. |

**Mid-cutover rule:** keep `npm run deploy` / `worker/proxy.ts` working. Once a Pages project deploys this repo, the same allowlisted prefixes are served by **Pages Functions** (`functions/`) with `_routes.json` limiting invocation to those prefixes. Until the Pages project exists, Worker deploy remains the live-proxy host. Do not remove the Worker path until Pages is confirmed as the sole production host.

## Free-tier limits (Workers Free — do not enable Paid)

Stay on **Workers Free**. Enabling Workers Paid / Standard to “remove the limit” is out of scope and creates billing.

| Limit | Workers Free (shared with Pages Functions) | Notes |
| --- | --- | --- |
| Requests / day | **100,000** (reset 00:00 UTC) | Function / Worker invocations only. **Static assets that never invoke Functions are unlimited.** |
| CPU time / request | **10 ms** (wall-clock I/O wait on `fetch` does not count) | Keep live handlers as thin allowlisted forwarders; heavy HTML parse belongs in `pull:data`, not on the live path. Sustained overage → **Error 1102**. |
| Static files / site | **20,000** | Snapshot tree (~hundreds of files) is fine. |
| Individual static file | **25 MiB** | Mega-seed and team JSON are well under. |

Quota reminder: Workers Caching HITs still count as Function **requests**. The only documented unlimited browsing path is **static SPA + `/data/**`** that never hit Functions. Details: [edge-cache.md](edge-cache.md).

## Error 1027

When the Free daily request quota is exhausted, Cloudflare returns **Error 1027** for further Worker / Pages Function invocations. That is the required failure mode — **fail, do not bill**.

- Docs: [Workers limits — daily requests](https://developers.cloudflare.com/workers/platform/limits/#daily-requests), [Workers errors](https://developers.cloudflare.com/workers/observability/errors/).
- With **Fail open** (below), static assets continue; only Function invocations are refused / bypassed.

## Fail open

| Setting | Dashboard path | Required value |
| --- | --- | --- |
| Fail open / closed | Pages project → **Settings** → **Runtime** → **Fail open / closed** | **Fail open** |

**Fail open:** when Pages Functions daily free-tier quota is exhausted, Cloudflare stops invoking Functions and continues serving **static assets**. Prefer this for a directory SPA.

**Fail closed:** returns an error page instead of static assets — do **not** use for this project unless requirements change.

Set Fail open as soon as the Pages project exists (even before #86), so cutover inherits the right default. Docs: [Pages Functions routing — Fail open / closed](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed).

## Preview vs production

| Environment | Branch / trigger | Hostname | Use |
| --- | --- | --- | --- |
| **Production** | `main` (Git-connected Pages) | Assigned `*.pages.dev` (and any custom domain later) | Canonical static SPA + `/data/*` once the project is live |
| **Preview** | Non-`main` branches / PRs | Per-deployment preview URL | Validate build, `_headers`, snapshot tree, and (after #86) Functions before merge |

Preferred path: **Git-connected** Pages (production + PR previews). Direct `wrangler pages deploy dist` is optional for one-offs and does **not** replace Git previews.

Build contract (both envs): `npm run build` → `dist`, Node **24** (`.nvmrc` and/or `NODE_VERSION=24`). Full checklist: [deployment.md](deployment.md).

Until the Pages project deploys Functions, preview/production Pages hosts may lack live proxies; local Vite / Worker preview (`npm run preview:worker`) remains a live-proxy test path. After #86 lands on a connected project, PR previews should exercise the same prefixes.

## `_routes.json` (Pages Functions invocation)

Adding a `functions/` directory makes **all** requests invoke Functions by default unless `_routes.json` limits them. Without a tight include list, directory browsing burns the 100k/day quota.

This repo ships `public/_routes.json` (copied into `dist/` by Vite). **Include only** the public live-data prefixes plus `/ftc-api-proxy`. Do **not** use `"exclude": ["/*"]` — exclude always wins over include and would disable Functions entirely.

```json
{
  "version": 1,
  "include": [
    "/ftc-proxy",
    "/ftc-proxy/*",
    "/ftcscout-proxy",
    "/ftcscout-proxy/*",
    "/portfolio-lab-proxy",
    "/portfolio-lab-proxy/*",
    "/ftc-scoring-proxy",
    "/ftc-scoring-proxy/*",
    "/ftc-api-proxy",
    "/ftc-api-proxy/*"
  ],
  "exclude": []
}
```

Static `/`, `/assets/*`, and `/data/**` are outside that include list and never invoke Functions. Worker equivalent: `assets.run_worker_first` in `wrangler.jsonc` (same prefixes). Docs: [Functions invocation routes](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes).

### Pages Functions layout

| Path | Role |
| --- | --- |
| `functions/<prefix>.ts` + `functions/<prefix>/[[path]].ts` | Exact prefix + nested paths for public proxies and `/ftc-api-proxy` |
| `functions/_lib/handleLiveProxy.ts` | Thin `onRequest` → shared `handleLiveProxyRequest` |
| `functions/_lib/handleFirstApiProxy.ts` | Thin `onRequest` → `handleFirstApiProxyRequest` (env Basic auth) |
| `src/lib/liveProxy.ts` | Public-host allowlist, path rewrite, GET/HEAD forward |
| `src/lib/firstApiProxy.ts` | FIRST API path allowlist + secret injection |

Handlers stay thin: no large HTML parse on the live path (parsing belongs in `pull:data`).

### Operator deploy verification (after Pages project exists)

On a production or preview URL from the Git-connected Pages project:

1. Confirm deploy logs mention uploading Functions and that `dist/_routes.json` matches the include list above (not a catch-all `/*` include).
2. `GET /ftc-proxy/<year>/region/USNV` (and one Scout / Portfolio / Scoring prefix) returns upstream content, not SPA `index.html`.
3. `GET /data/manifest.json` and `/` remain static (no Function invocation needed).
4. `POST` to a proxy prefix returns **405**.

Until [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85) connects the live project, parity is proven in-repo by unit tests + the Worker path (`npm run preview:worker` / `npm run deploy`).

### Secrets (server-side only)

Authenticated FIRST API credentials ([#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17)) must live in **Pages Environment variables / secrets** (Production + Preview) or Worker secrets — never in the SPA bundle or `public/`. Names: `FIRST_API_USERNAME` / `FIRST_API_TOKEN` ([first-api.md](first-api.md)). `/ftc-api-proxy` injects Basic auth toward `ftc-api.firstinspires.org` for allowlisted `/v2.0` paths only; without secrets it returns **503** and does not call FIRST. Public HTML/REST prefixes stay unauthenticated.

## Disable live Functions (static-only)

Use when free-tier pressure, upstream outages, or cutover risk require **directory-only** mode. The SPA is static-first ([snapshot-tree.md](snapshot-tree.md)); live proxies are optional enrichment.

| Host | How to disable live |
| --- | --- |
| **Worker** | Stop deploying the Worker script for that hostname, or clear `run_worker_first` so only assets serve; or point DNS / bookmarks at a static-only Pages deploy. Client already degrades when proxies fail (#7 / #88). |
| **Pages + Functions** | Remove or rename the `functions/` directory and redeploy; **or** temporarily replace `_routes.json` `include` with a non-proxy path you do not use (Pages requires at least one include rule — prefer removing `functions/` instead); **or** delete Function routes in the dashboard. Confirm Fail open remains on. |
| **App behavior** | No separate client “kill switch” is required for ops: missing proxies surface as SourceResult / health messaging; `#health` and `/data/source-health.json` remain available from the static snapshot. |

Do **not** enable Workers Paid to keep live proxies under load.

## Rollback

| Failure | Rollback |
| --- | --- |
| Bad **app** deploy on Pages | Cloudflare Pages → **Deployments** → promote / rollback to the last known-good production deployment (or revert the git commit on `main` and let the next production build ship). |
| Bad **Worker** deploy | Redeploy the previous Worker version (`wrangler deployments` / dashboard) or `git revert` + `npm run deploy` from a good commit. |
| Bad **data** snapshot | Revert / close the data-refresh PR, or revert the merge on `main` that changed `src/data/nv-ftc-teams.generated.json` (and observations). Next app build regenerates `public/data/**` via `sync:data`. Publish guards + `validate:data` should have blocked empty/drop publishes. |
| Live proxy breakage only | Disable live (above) and leave static SPA + `/data` up; fix Functions / Worker separately. |

Data-refresh **never** deploys Cloudflare. Snapshot publication vs app deploy: [snapshot-tree.md](snapshot-tree.md), [ingestion.md](ingestion.md).

## `source-health.json` artifact

Emitted with the snapshot tree at `/data/source-health.json` (`schemaVersion` 1). Built from seed `sourceChecks` plus age helpers shared with the [#30](https://github.com/The-Allsparks/ftc-team-analysis/issues/30) dashboard (`STALE_SEED_MAX_AGE_MS` in `src/lib/sourceHealthReport.ts`).

| Field | Meaning |
| --- | --- |
| `generatedAt` / `regionCode` / `teamCount` | Seed envelope slice |
| `seedAgeMs` / `seedStale` | Age vs build/validate time; stale when older than 8 days |
| `sourceCheckFailureCount` | Count of `sourceChecks` with `ok: false` |
| `sourceChecks[]` | Per-upstream label, URL, `checkedAt`, `ok`, optional `detail` |

Validated by `npm run validate:data` (`parseSnapshotSourceHealth`). Not a substitute for the full in-app Data health view (coverage gaps, session live statuses). Schema: `src/data/snapshotTreeSchema.ts`. Layout: [snapshot-tree.md](snapshot-tree.md).

## Related

- [deployment.md](deployment.md) — Worker today, Pages checklist, proxy table
- [edge-cache.md](edge-cache.md) — Cache-Control + throttle policy (#89)
- [snapshot-tree.md](snapshot-tree.md) — static tree + publication vs deploy
- [architecture.md](architecture.md) — static-first layout
- [ingestion.md](ingestion.md) — pull, guards, health dashboard
- Parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)
