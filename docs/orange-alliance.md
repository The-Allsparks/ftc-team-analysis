# The Orange Alliance (research)

Issue [#21](https://github.com/The-Allsparks/ftc-team-analysis/issues/21). Research for using [The Orange Alliance](https://theorangealliance.org/) as a **corroborating / enrichment** source — **not** as a replacement for official FIRST competitive results.

This issue is **research + conflict rules**, not a live TOA ingestion pipeline. Do **not** wire `pull:data` or browser proxies to TOA in the same change that lands this document.

## Status

| Dependency | State |
| --- | --- |
| [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17) authenticated FIRST FTC Events API (canonical competitive) | **Client + docs landed** (credential-optional); live production secret path still needs operator secrets + [#2](https://github.com/The-Allsparks/ftc-team-analysis/issues/2) — see [first-api.md](first-api.md) |
| TOA research / go-no-go / conflict rules | **This document** |
| Live TOA fetch in `pull:data` or Worker proxy | **Out of scope** (#21) |

**Blocked → ready for competitive corroboration:** After FIRST API credentials are configured in production so FIRST remains the sole authority for official scores, awards, and rankings ([first-api.md](first-api.md)), a follow-up may optionally call TOA for soft corroboration and non-competitive enrichment. Media/stream enrichment could be designed earlier, but still needs secrets handling and is **not** part of #21.

## Source hierarchy (explicit)

1. **FIRST / FTC Events (official)** — canonical for official match scores, awards, rankings, alliance results, and other competitive outcomes. Remains canonical from public pages by default, or from the authenticated API when configured ([first-api.md](first-api.md) / #17).
2. **This project’s Nevada seed** — identity-critical roster/history derived from public FTC Events pages (publish-guarded).
3. **FTCScout** — optional live **community-calculated** stats (OPR, etc.); never official FIRST results.
4. **The Orange Alliance** — optional **non-canonical** corroboration and enrichment only (media, livestreams, soft cross-checks). **Never overrides FIRST.**
5. **Other enrichments** (Open Alliance, GM0, Portfolio Lab, GitHub) — links/resources only.

**FIRST remains canonical for official results.** TOA must not be treated as an authoritative competitive source where FIRST data exists.

## Confirmed vs inferred

| Item | Status | Notes |
| --- | --- | --- |
| Public UI at `https://theorangealliance.org/` (teams, events, live, insights) | **Confirmed** | e.g. team page `/teams/{number}` renders roster/history without API key |
| REST base URL `https://theorangealliance.org/api` | **Confirmed** | OpenAPI `servers` + official Node client `api_endpoint` |
| Auth headers `X-TOA-Key` + `X-Application-Origin` | **Confirmed** | OpenAPI `securitySchemes`; Node client `headers()` |
| API key from myTOA account dashboard | **Confirmed** | [account](https://theorangealliance.org/account); docs in [`@the-orange-alliance/api`](https://www.npmjs.com/package/@the-orange-alliance/api) |
| Unauthenticated / missing-key `GET /api/` returns HTTP 400 | **Confirmed** | Bounded probe during research (no valid key used) |
| OpenAPI surface for teams, events, matches, awards, rankings, media, streams, leagues, historical TIMS teams | **Confirmed** | [TOA-Docs](https://github.com/the-orange-alliance/TOA-Docs) `openapi/openapi.yml` (spec last updated ~2022; treat as **best available**, may lag live API) |
| Hosted Swagger UI `orange-alliance.github.io/TOA-Docs` and in-app `/apidocs` | **Inferred / degraded** | Research fetches returned 404; prefer GitHub OpenAPI + Node wrapper README |
| Season keys like `2526`, `2425`, `1920` (startYY+endYY) | **Inferred** | Used throughout client game-specific modules and community docs; `/seasons` returns authoritative list when authenticated |
| Event keys `{season}-{region}-{code}` (e.g. `2122-FIM-MOLM1`) | **Confirmed** | OpenAPI examples + Node README |
| Match `video_url` field on match payloads | **Confirmed** | OpenAPI example match objects include nullable `video_url` |
| Team/event media types (GitHub, CAD, notebook, robot reveal/image, logo; pit/schedule/venue/photo) | **Confirmed** | Node `MediaType.ts` |
| Event livestream associations (`/streams`, `/event/{key}/streams`) | **Confirmed** | OpenAPI + client |
| Historical team snapshots via `/team/history/{seasonKey}` (“as they were in TIMS”) | **Confirmed** (API description) | Coverage completeness **not** independently audited here |
| Legal notices (privacy + terms) at `/legal` | **Confirmed** | Site privacy policy (edited 2019-06-08); **no** clear API redistribution / bulk-republish license grant found |
| TOA unaffiliated with FIRST / The Blue Alliance | **Confirmed** | [About](https://theorangealliance.org/about) disclaimer |

## Public surface vs API

| Surface | Auth | Role for this project |
| --- | --- | --- |
| Public HTML team/event pages | None | Human browsing / manual spot-checks; **not** a preferred scrape target (SPA/HTML drift; API is documented) |
| `GET https://theorangealliance.org/api/...` | **Required** myTOA API key + application origin header | Only viable programmatic surface for a future enrichment job |
| `api.theorangealliance.org` | N/A | **Not found** (404 on probe); do not assume a separate host |

Unlike Open Alliance’s public `GET /teams/ftc`, TOA’s JSON API is **account-gated**. Any future integration needs secret storage (GitHub Actions secrets / local env), never committed keys, and fails soft like other enrichments.

## Historical coverage notes

- Live site advertises large match/team counts and current-season leaderboards (e.g. 2025/26 DECODE) — **confirmed** as UI claims, not audited completeness.
- OpenAPI exposes season-scoped matches, team results, awards, media, and `/team/history/{seasonKey}` TIMS-shaped snapshots — suitable **in principle** for seasons overlapping this project’s `2019`–`2025` window.
- Game-specific detail/insights models in the Node package span multiple past seasons (e.g. folders for `1920` … `2526`) — **inferred** support depth varies by season.
- **Residual risk:** volunteer/scorekeeper sync gaps; some events/matches may be missing or delayed vs FIRST. That is exactly why TOA must not become canonical.

## Overlap vs FIRST and FTCScout

| Domain | FIRST / FTC Events | FTCScout (in-repo today) | TOA |
| --- | --- | --- | --- |
| Official scores / awards / ranks | **Canonical** | Not official | Community DB — **corroborate only** |
| Calculated OPR / insights | Not the official record | World-scope quick-stats / events (validated) | Insights / OPR-style figures on UI — **community**, not official |
| Team identity (number, name, city, region) | Seed source (public pages) | Team keyed by number | Team keyed by `team_key` / number; website field |
| Media (GitHub, CAD, robot reveal, logos) | Limited / avatars via Scoring | Not primary | **Differentiator** (`/team/.../media`, `/event/.../media`) |
| Livestream / watch links | Not in our seed | Not primary | **Differentiator** (`/streams`, event streams; match `video_url`) |
| Auth model | Public pages default; optional API credentials ([first-api.md](first-api.md)) | Public REST (proxied) | myTOA API key required |

**Practical niche if we proceed later:** attributed media and stream/video links, plus soft “TOA also shows X” corroboration after #17 — not a second competitive warehouse.

## Terms / attribution

- Attribute **The Orange Alliance** (`https://theorangealliance.org/`) wherever TOA-derived fields appear.
- Respect [Legal Notices](https://theorangealliance.org/legal) (privacy + terms). This research is **not legal advice** and is **not** a clearance to redistribute TOA database contents.
- Upstream rate limits, key revocation, and ToS changes are residual operational risk.
- FIRST® / FTC trademarks: TOA’s own about page states FIRST is not overseeing or responsible for TOA; we likewise must not imply FIRST endorsement of TOA data.
- Node wrapper package is MIT-licensed; that license applies to the **client library**, not to TOA’s data.

## Video / media associations

| Mechanism | What it provides | Corroboration use |
| --- | --- | --- |
| Match `video_url` | Optional per-match video link | Enrichment link with evidence; never invent |
| `/event/{eventKey}/streams`, `/streams` | Livestream channel/url metadata | Watch links; verify URL allowlisting/privacy filters |
| `/team/{teamKey}/media/{seasonKey}` | Typed media (`Github`, `CAD`, `RobotReveal`, images, logo, notebook) | Similar spirit to Open Alliance / GM0 link enrichment |
| `/event/{eventKey}/media` | Event photos / maps / schedule media | Optional event enrichment |

Prefer storing **outbound URLs + attribution + evidence**, not copying binary media into git.

## Go / no-go recommendation

### Verdict: **Conditional GO** (future corroboration only)

| Decision | Scope |
| --- | --- |
| **GO (deferred)** | Optional TOA enrichment for **media / livestream / video links**, and soft competitive **corroboration** (flag disagreements), **after** secrets + conflict rules are implemented in a follow-up issue |
| **NO-GO** | TOA as canonical competitive source; TOA wired into `pull:data` or production proxies in #21; scraping HTML as the primary integration path |
| **Blocked** | Any competitive corroboration **implementation** until [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17) provides authenticated FIRST as the official competitive baseline |

### Terms constraints (must hold if implemented later)

1. myTOA API key required; never commit secrets; document rotation.
2. Attribute TOA; no claim of FIRST endorsement or ownership of TOA content.
3. Residual ToS / redistribution risk remains uncleared — same stance as other third-party sources in [attribution.md](attribution.md).
4. Fail soft: TOA outages must not corrupt the identity-critical seed.
5. Bound traffic (Nevada / known team keys; modest concurrency); do not bulk-archive the TOA database into git.

## Conflict-resolution rules (draft for future implementation)

Apply when TOA is eventually consulted:

1. **Never override FIRST official scores, awards, rankings, alliance results, or WLT** with TOA values. FIRST wins whenever present.
2. **TOA is enrichment / corroboration only.** Allowed writes are attributed optional fields (media URLs, stream links, “also observed on TOA” notes) — not silent replacement of seed competitive facts.
3. **Evidence required.** Any persisted TOA-derived field must cite TOA URL or API path, retrieval time, and team/event key. Exact numeric team-number match only (no name-only association).
4. **Disagreement handling.** If TOA and FIRST disagree on a competitive fact: keep FIRST; optionally record a conflict / observation for operators; do not auto-merge.
5. **FTCScout vs TOA calculated stats.** Neither is official. Prefer FIRST for outcomes; label community metrics; do not pick TOA OPR over FTCScout (or vice versa) without explicit product rules and UI labeling.
6. **Missing FIRST data.** Absence of a FIRST value is **not** license to promote TOA to canonical. May show TOA as unverified community data with clear labeling until FIRST confirms.
7. **Privacy.** Reuse link privacy filters before storing media/stream URLs; no student PII collection ([privacy.md](privacy.md)).

## Fixtures

Synthetic sample shapes (not live API captures) live in `src/lib/fixtures/orange-alliance-sample.json` for future parser tests. They are **labeled synthetic** and must not be treated as production TOA payloads.

## Architecture / ingestion (one-liners)

- **Architecture:** TOA is a future optional corroboration/enrichment source behind the source hierarchy above — not on the identity-critical path and not proxied today.
- **Ingestion:** Not wired. When built later, prefer authenticated REST with fail-soft `sourceChecks`, never HTML scrape-as-primary, and never enable on scheduled refresh by default.

## Related

- [attribution.md](attribution.md)
- [architecture.md](architecture.md)
- [ingestion.md](ingestion.md)
- [responsible-crawling.md](responsible-crawling.md)
- [open-alliance.md](open-alliance.md) — contrast: OA list API is public; TOA JSON API is key-gated
- Parent epic [#1](https://github.com/The-Allsparks/ftc-team-analysis/issues/1)
- Canonical competitive source [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17)
