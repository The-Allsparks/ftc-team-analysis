# Deployment overview

Operator notes for shipping the SPA + allowlisted live-data proxy. **Cloudflare Pages** is the target hosting path for parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38).

**Full #38 runbook** (free-tier limits, Error 1027, Fail open, `_routes.json`, disable-live, rollback, preview vs production, residual cutover, `source-health.json`): **[cloudflare-pages.md](cloudflare-pages.md)** ([#91](https://github.com/The-Allsparks/ftc-team-analysis/issues/91)).

Edge Cache-Control / throttling: [edge-cache.md](edge-cache.md) (do not duplicate here). License / privacy: [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) docs only — [attribution.md](attribution.md), [privacy.md](privacy.md), `LICENSE`.

## Migration stance

| Path | Role | Status |
| --- | --- | --- |
| **Worker** (`wrangler.jsonc`, `npm run deploy`) | Live production today: static `dist/` + allowlisted proxy (`worker/proxy.ts`) | **Keep using** until Pages is the sole production host |
| **Pages** (Git-connected project) | Target: production builds from `main`, PR preview URLs, free `*.pages.dev`, Functions for live proxies | Stand up project ([#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)); Functions + `_routes.json` are in-repo ([#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)) |

**Mid-cutover:** Worker and Pages Functions share `src/lib/liveProxy.ts`. A Pages hostname serves live prefixes only after the project deploys `functions/` (operator: [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)). Until then, Worker deploy remains the live-proxy host. Do not remove `npm run deploy` / `wrangler.jsonc` until Pages is confirmed. Residual status: [cloudflare-pages.md](cloudflare-pages.md#residual-workers-vs-pages-cutover-85--86).

**Do not enable Workers Paid.** Stay on the Workers Free plan. Free-tier overage must fail with Cloudflare **Error 1027**, not incur billing. Enabling Paid / Standard usage to “remove the limit” is out of scope for this project’s hosting policy.

## Production shape (today) — Cloudflare Worker

The app deploys as a **Cloudflare Worker** with Vite static assets (`dist/`) plus `worker/proxy.ts` (`wrangler.jsonc`).

```bash
npm run deploy   # build + wrangler deploy
```

Local Worker preview: `npm run preview:worker`.

Build always runs `sync:data` (via `npm run build`), then TypeScript + Vite. Output directory: `dist/`. Node version: **24** (see `.nvmrc`).

### Allowlisted browser proxies

| Browser prefix | Upstream |
| --- | --- |
| `/ftc-proxy` | `https://ftc-events.firstinspires.org` |
| `/ftcscout-proxy` | `https://api.ftcscout.org` |
| `/portfolio-lab-proxy` | `https://www.ftcportfoliolab.org` |
| `/ftc-scoring-proxy` | `https://ftc-scoring.firstinspires.org` |

The Worker and Pages Functions accept `GET`/`HEAD` on those prefixes only and never forward arbitrary browser-supplied destinations. Shared implementation: `src/lib/liveProxy.ts`. Static page views stay off the script path (`run_worker_first` / `_routes.json` limited to proxy prefixes). Local Vite (`npm run dev` / `npm run preview`) mirrors the same prefixes.

## Target path — Cloudflare Pages

### Build contract (CI and Pages)

| Setting | Value |
| --- | --- |
| Build command | `npm run build` (includes `sync:data`) |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |
| Node version | **24** — repo `.nvmrc`; also set Pages env `NODE_VERSION=24` if the dashboard does not pick up `.nvmrc` |
| Production branch | `main` |
| Framework preset | None / Vite (optional); command and output above matter more than the preset name |

After a successful production deploy, the free `*.pages.dev` hostname must serve:

- The SPA (`index.html` + hashed `/assets/*`)
- Static seed JSON under `/data/*` (copied into `dist` by `sync:data` during build), including the transitional mega-seed **and** the split snapshot tree (`manifest.json`, `regions/`, `teams/`, `source-health.json`) — see [snapshot-tree.md](snapshot-tree.md)

Client navigation uses hash routes (`#health`, etc.), so deep links do not require a separate SPA rewrite for normal use. Vite still emits a standard SPA `index.html`.

Static response headers for caching live in [`public/_headers`](../public/_headers) (copied into `dist/` by Vite; honored by Pages). Function invocation routes live in [`public/_routes.json`](../public/_routes.json) (also copied into `dist/`). Differentiated TTLs for historical vs current snapshot slices, proxy response headers, and throttling notes: [edge-cache.md](edge-cache.md) ([#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89)). Tree layout TTLs: [snapshot-tree.md](snapshot-tree.md). Functions layout + operator verify steps: [cloudflare-pages.md](cloudflare-pages.md#_routesjson-pages-functions-invocation).

### Operator checklist — create / connect the Pages project

Complete these in the Cloudflare dashboard (requires a Cloudflare login with rights to the account). There is **no** API token in CI for this step. **Live project connection may still be operator-pending** even though this checklist is documented ([#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)).

1. **GitHub App access** — Ensure the [Cloudflare Workers & Pages GitHub App](https://github.com/apps/cloudflare-workers-and-pages) can access **`The-Allsparks/ftc-team-analysis`** (org/repo install, or grant access when connecting the repo).
2. **Create project** — Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → select `The-Allsparks/ftc-team-analysis`.
3. **Build configuration**
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (default)
   - Environment variable (Production + Preview): `NODE_VERSION` = `24` (belt-and-suspenders with `.nvmrc`)
4. **Save and deploy** — Confirm the first production deploy succeeds and open the assigned `*.pages.dev` URL. Verify `/` (SPA), `/data/manifest.json`, `/data/source-health.json`, and mega-seed / observations JSON load.
5. **PR preview deployments** — With Git integration, preview deployments for pull requests are enabled by default. Confirm under the project **Settings** → **Builds & deployments** (or **Deployments**) that non-`main` branches / PRs produce preview URLs. Leave preview deployments **on**. See [cloudflare-pages.md](cloudflare-pages.md#preview-vs-production).
6. **Fail open** — Project **Settings** → **Runtime** → **Fail open / closed** → set **Fail open**. Details: [cloudflare-pages.md](cloudflare-pages.md#fail-open).
7. **Free plan only** — Confirm the account remains on **Workers Free**. Do **not** upgrade to Workers Paid / Standard to lift Functions limits. Overage on free must surface as **Error 1027** (or equivalent free-tier refusal), not a bill.
8. **Live proxies on Pages** — After this repo’s `functions/` + `_routes.json` are on `main`, confirm a Pages deploy serves `/ftc-proxy` (etc.) via Functions and that static `/data/**` does not invoke them. Checklist: [cloudflare-pages.md](cloudflare-pages.md#operator-deploy-verification-after-pages-project-exists). Until the project exists, keep Worker deploy for live enrichments; do not point canonical production solely at Pages without that verification.

### Optional: Wrangler Pages deploy (not required)

Git-connected builds are the preferred path (production + PR previews). Direct `wrangler pages deploy dist` is optional for one-off publishes and does **not** replace connecting the GitHub repo for previews.

## Snapshot publication vs app deploy

Do not conflate refreshing Nevada JSON with shipping a new SPA build:

| Concern | Operator action | Outcome |
| --- | --- | --- |
| **Publish a newer snapshot** | Let data-refresh open a PR (or run `npm run pull:data` locally) → review → merge to `main` | Checked-in mega-seed + observations update. Empty/drop publishes remain blocked by `publishGuard` + `validate:data`. |
| **Deploy the app** | Merge app changes to `main` (Pages) and/or `npm run deploy` (Worker) | Build runs `sync:data`, regenerates `public/data/**` (mega-seed copy **and** snapshot tree including `source-health.json`), then ships `dist/`. |

The data-refresh workflow never deploys Cloudflare. Merging a data PR alone is enough for the **next** production build to serve updated `/data/*`; if Pages auto-builds on `main`, that happens automatically after merge. Tree files are not committed — see [snapshot-tree.md](snapshot-tree.md) and [ingestion.md](ingestion.md). Rollback: [cloudflare-pages.md](cloudflare-pages.md#rollback).

## Related

- [cloudflare-pages.md](cloudflare-pages.md) — **#38 Pages runbook** (#91)
- [architecture.md](architecture.md)
- [snapshot-tree.md](snapshot-tree.md) (publication vs deploy + `source-health.json`)
- [edge-cache.md](edge-cache.md) (static + proxy cache / throttle policy → [#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89))
- [ingestion.md](ingestion.md) (pull + guards + refresh workflow)
- [dependency-policy.md](dependency-policy.md) (Node / `.nvmrc`)
- README “Production” section
- Parent hosting epic [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)
- Pages project + previews [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)
- Pages Functions proxy [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)
