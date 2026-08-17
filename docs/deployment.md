# Deployment overview

Operator notes for shipping the SPA + allowlisted live-data proxy. **Cloudflare Pages** is the target hosting path for parent [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38). The current **Worker + static assets** deploy remains supported during cutover until Pages Functions land ([#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)).

## Migration stance

| Path | Role | Status |
| --- | --- | --- |
| **Worker** (`wrangler.jsonc`, `npm run deploy`) | Live production today: static `dist/` + allowlisted proxy (`worker/proxy.ts`) | **Keep using** until cutover is complete |
| **Pages** (Git-connected project) | Target: production builds from `main`, PR preview URLs, free `*.pages.dev` | Stand up project + static SPA/`/data` first ([#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)); proxy via Pages Functions later ([#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)) |

**Mid-cutover:** the Worker may still be the only host that serves live `/ftc-proxy` (and sibling) prefixes. A Pages production hostname can serve the SPA and static `/data/*` while proxies continue to hit the Worker (or fail until #86). Do not remove or silently abandon `npm run deploy` / `wrangler.jsonc` until the Pages path fully replaces it.

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

The Worker accepts `GET`/`HEAD` on those prefixes only and never forwards arbitrary browser-supplied destinations. Static page views stay on the asset path (`run_worker_first` limited to proxy prefixes). Local Vite (`npm run dev` / `npm run preview`) mirrors the same prefixes.

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
- Static seed JSON under `/data/*` (copied into `dist` by `sync:data` during build), including the transitional mega-seed **and** the split snapshot tree (`manifest.json`, `regions/`, `teams/`) — see [snapshot-tree.md](snapshot-tree.md)

Client navigation uses hash routes (`#health`, etc.), so deep links do not require a separate SPA rewrite for normal use. Vite still emits a standard SPA `index.html`.

Static response headers for caching basics live in [`public/_headers`](../public/_headers) (copied into `dist/` by Vite; honored by Pages). Intended differentiated TTLs for historical vs current snapshot slices are documented in [snapshot-tree.md](snapshot-tree.md); path-specific header wiring may land with [#89](https://github.com/The-Allsparks/ftc-team-analysis/issues/89).

### Operator checklist — create / connect the Pages project

Complete these in the Cloudflare dashboard (requires a Cloudflare login with rights to the account). There is **no** API token in CI for this step.

1. **GitHub App access** — Ensure the [Cloudflare Workers & Pages GitHub App](https://github.com/apps/cloudflare-workers-and-pages) can access **`The-Allsparks/ftc-team-analysis`** (org/repo install, or grant access when connecting the repo).
2. **Create project** — Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → select `The-Allsparks/ftc-team-analysis`.
3. **Build configuration**
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (default)
   - Environment variable (Production + Preview): `NODE_VERSION` = `24` (belt-and-suspenders with `.nvmrc`)
4. **Save and deploy** — Confirm the first production deploy succeeds and open the assigned `*.pages.dev` URL. Verify `/` (SPA) and `/data/nv-ftc-teams.generated.json` (and observations JSON) load.
5. **PR preview deployments** — With Git integration, preview deployments for pull requests are enabled by default. Confirm under the project **Settings** → **Builds & deployments** (or **Deployments**) that non-`main` branches / PRs produce preview URLs. Leave preview deployments **on**.
6. **Fail open** — Project **Settings** → **Runtime** → **Fail open / closed** → set **Fail open**.  
   - Meaning: when Pages Functions daily free-tier request quota is exhausted, Cloudflare stops invoking Functions and continues serving **static assets**.  
   - Prefer this for a directory SPA: static UI + `/data` remain available even if Functions (#86) are over quota.  
   - **Fail closed** would return an error page instead of static assets — do **not** use that for this project unless requirements change.  
   - Documented now so the setting is correct before Functions land; pure-static Pages still benefits from an explicit check.
7. **Free plan only** — Confirm the account remains on **Workers Free**. Do **not** upgrade to Workers Paid / Standard to lift Functions limits. Overage on free must surface as **Error 1027** (or equivalent free-tier refusal), not a bill.
8. **Mid-cutover traffic** — Until [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86), treat Pages as static-capable. Live enrichments that need `/ftc-proxy` (etc.) still depend on the Worker deploy (or local Vite proxies). Do not point canonical production solely at Pages until proxies are migrated or an explicit dual-host plan is accepted.

### Optional: Wrangler Pages deploy (not required)

Git-connected builds are the preferred path (production + PR previews). Direct `wrangler pages deploy dist` is optional for one-off publishes and does **not** replace connecting the GitHub repo for previews.

## Fail open — quick reference

| Setting | Dashboard path | Required value |
| --- | --- | --- |
| Fail open / closed | Pages project → **Settings** → **Runtime** → **Fail open / closed** | **Fail open** |

When Functions exist and free quota is exhausted: static assets continue; Functions are bypassed. When Functions do not exist yet: static hosting is unaffected; still set Fail open so cutover to #86 inherits the right default.

## Related

- [architecture.md](architecture.md)
- [dependency-policy.md](dependency-policy.md) (Node / `.nvmrc`)
- README “Production” section
- Parent hosting epic [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)
- Pages project + previews [#85](https://github.com/The-Allsparks/ftc-team-analysis/issues/85)
- Pages Functions proxy [#86](https://github.com/The-Allsparks/ftc-team-analysis/issues/86)
