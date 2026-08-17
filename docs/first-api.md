# FIRST FTC Events API (authenticated)

Issue [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17). Integrate the official **authenticated** [FTC Events API](https://ftc-events.firstinspires.org/services/API) as the **canonical** source for competitive facts when credentials are configured. Public HTML pages remain the default seed path (and the only path in CI) when secrets are absent.

Related: [ingestion.md](ingestion.md), [attribution.md](attribution.md), [architecture.md](architecture.md), [responsible-crawling.md](responsible-crawling.md), [deployment.md](deployment.md), [cloudflare-pages.md](cloudflare-pages.md), [orange-alliance.md](orange-alliance.md).

## Status (credential-optional)

| Layer | State |
| --- | --- |
| Client module + fixtures + merge rules | **In repo** (`src/lib/firstEventsApi.ts`) |
| Opt-in `pull:data --enrich-first-api` | **In repo** (no-op / fail-soft without secrets) |
| CI / scheduled refresh using live API | **Off** — no `FIRST_API_*` secrets required for green CI |
| Production Pages/Worker secret injection for browser live pulls | **Not wired** — still depends on production-safe secret handling ([#2](https://github.com/The-Allsparks/ftc-team-analysis/issues/2) / [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)) |
| Operator-held FIRST username + token | **Required** for live canonical pull |

## Official docs

| Resource | URL |
| --- | --- |
| API information / attribution request | https://ftc-events.firstinspires.org/services/API |
| Register for username + token | https://ftc-events.firstinspires.org/services/API/register |
| OpenAPI / ReDoc | https://ftc-events.firstinspires.org/api-docs/index.html |
| API host (HTTPS) | `https://ftc-api.firstinspires.org` (paths under `/v2.0/...`) |

Do **not** call the HTML site host (`ftc-events.firstinspires.org`) as if it were the JSON API.

## Authentication

HTTP **Basic** auth (OpenAPI `securitySchemes.basic`):

1. Register at the link above; receive a **username** and **authorization token**.
2. Encode `username:token` as Base64 and send `Authorization: Basic …`.
3. Store credentials **only** as server-side environment variables:

| Variable | Purpose |
| --- | --- |
| `FIRST_API_USERNAME` | API username from FIRST registration |
| `FIRST_API_TOKEN` | Authorization token (password slot for Basic auth) |

**Never:**

- Commit credentials (including encoded Basic headers)
- Use `VITE_*` / client-bundle env vars
- Write tokens into generated seed JSON, fixtures, or docs examples as real secrets
- Put secrets in `wrangler.jsonc` or checked-in Cloudflare config

Synthetic fixture values in `src/lib/fixtures/first-api-sample.json` are **not** live credentials.

## Where to place secrets (operators)

| Environment | Placement |
| --- | --- |
| Local maintainer pull | Shell env or gitignored `.env` loaded only by the Node process (repo already ignores `.env`) |
| GitHub Actions (future protected job) | Repository or environment **secrets** `FIRST_API_USERNAME` / `FIRST_API_TOKEN` — not on public PRs from forks |
| Cloudflare Pages / Worker (future) | Encrypted **Environment variables / secrets** (Production + Preview). Inject only into a GET-allowlisted Function that forwards to `ftc-api.firstinspires.org` — never into the SPA |

Today’s public live proxies (`/ftc-proxy`, etc.) forward **unauthenticated** HTML/REST hosts only. They must **not** be pointed at `ftc-api.firstinspires.org` with shared credentials until a dedicated, secret-injected path exists.

## Canonical vs fallback

| Situation | Competitive source of truth |
| --- | --- |
| `--enrich-first-api` **and** both env vars set | **FIRST API wins** for official awards, event ranks / ranking scores, and qualification W–L–T when the API returns those fields |
| Credentials missing, 401/403, or enrichment off | **Public FTC Events HTML** (existing `pull:data` scrape) remains canonical for the seed |
| API omits a field that HTML has | Keep the HTML value (API does not invent empties over good scrape data) |
| FTCScout / future TOA | Never override FIRST competitive facts ([orange-alliance.md](orange-alliance.md)) |

### Conflict rules (summary)

1. **Awards** — non-empty API award list **replaces** scraped awards for that team-season.
2. **Event rank / rankingScore / matchCount** — API ranking row for `(eventCode, teamNumber)` **overwrites** scraped rank fields on that event.
3. **Qualification record** — API ranking `wins` / `losses` / `ties` **overwrite** scraped qualification record when present.
4. **Identity / links / enrichment** — unchanged by this module (still HTML + optional OA/GM0/GitHub/YouTube paths).

## Rate limits, pagination, caching

- Client inserts a short delay between live GETs (`FIRST_API_DEFAULT_DELAY_MS`, default 200ms).
- HTTP **429** → `SourceResult` `rate_limited` (fail-soft; pull continues with HTML seed).
- HTTP **401/403** → `auth_failure`; enrichment stops calling the API for that run.
- `GET /{season}/teams` pagination uses `page` / `pageTotal` (`fetchAllFirstApiTeams`).
- In-memory `FirstApiResponseCache` dedupes identical GETs within a single enrichment run.

## Allowlisted GET paths

Only relative paths under `/v2.0/` matching `FIRST_API_ALLOWED_PATH_PATTERNS` in `src/lib/firstEventsApi.ts` (teams, events, awards, matches, rankings, schedule, leagues). Absolute URLs and `..` segments are rejected.

## How to run (local / operator)

Off by default (CI and scheduled refresh stay public-page-only):

```bash
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-first-api
```

With credentials (PowerShell example — do not commit the values):

```powershell
$env:FIRST_API_USERNAME = "your-username"
$env:FIRST_API_TOKEN = "your-token"
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-first-api
```

Without credentials, `--enrich-first-api` records a fail-soft `sourceChecks` row (`credentials_absent`) and **does not** call the live API; the public-page seed remains unchanged by API merge.

## Attribution and terms

- FIRST asks applications that display API-derived data to link back to the [API information page](https://ftc-events.firstinspires.org/services/API) (also referenced from FRC Events docs). This project already cites FTC Events / API info in README and seed `sources`.
- API data may **not** be used for commercial purposes / financial gain from acquiring a token (per FIRST’s API information page). This project is a non-commercial Nevada directory.
- This document is **not legal advice** and is **not** a clearance that every redistribution of API payloads is permitted. Residual terms risk remains — see [attribution.md](attribution.md).

## Residual operator steps (before #17 can fully close)

1. Obtain FIRST API username + token via registration.
2. Store as GitHub Actions secrets and/or Cloudflare encrypted secrets (never in git).
3. Land production-safe secret injection for any browser-facing path ([#2](https://github.com/The-Allsparks/ftc-team-analysis/issues/2) / [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38)).
4. Optionally add a protected Actions job that runs `--enrich-first-api` with secrets and verifies browser bundles still contain no token material (`npm run check:bundle`).
5. Confirm redistribution/attribution constraints with maintainers against current FIRST API terms.

## Code

| Path | Role |
| --- | --- |
| `src/lib/firstEventsApi.ts` | Basic auth, allowlist, SourceResult fetch, pagination, merge rules, opt-in enrichment |
| `src/lib/firstEventsApi.test.ts` | Missing-key / 401 / 429 / success merge with fixtures |
| `src/lib/fixtures/first-api-sample.json` | Synthetic public-shaped JSON (no secrets) |
| `scripts/pull-public-ftc-data.ts` | `--enrich-first-api` wiring |
| `src/data/pullArgs.ts` | CLI flag |
