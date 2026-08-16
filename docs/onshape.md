# Onshape CAD discovery (research)

Issue [#26](https://github.com/The-Allsparks/ftc-team-analysis/issues/26). Research for discovering **public Onshape CAD** associated with Nevada FTC teams — APIs, auth, terms, attribution, false-match avoidance, and link-vs-copy policy.

This issue is **research + matching rules + a tiny ownership gate stub**. Do **not** implement a production Onshape crawler, do **not** download CAD binaries/geometry into the seed, and do **not** wire `pull:data` / scheduled refresh to Onshape search APIs.

## Status

| Dependency | State |
| --- | --- |
| [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) licensing / attribution / privacy docs | **Done** |
| Onshape research / go-no-go / matching rules | **This document** |
| Onshape Public Documents search or scrape in `pull:data` | **Out of scope / NO-GO** (#26) |
| Dedicated CAD graph product beyond existing `artifact` projection | Deferred with [#28](https://github.com/The-Allsparks/ftc-team-analysis/issues/28) |

## Confirmed vs inferred

| Item | Status | Notes |
| --- | --- | --- |
| Glassworks API Explorer at [cad.onshape.com/glassworks/explorer/](https://cad.onshape.com/glassworks/explorer/) | **Confirmed** | Interactive docs for REST endpoints; also mirrored in [onshape-public docs](https://onshape-public.github.io/docs/api-intro/explorer/) |
| All Onshape API calls require authentication | **Confirmed** | API Keys and/or OAuth2; unauthenticated requests return `403` ([auth docs](https://onshape-public.github.io/docs/auth/)) |
| Document search / list endpoints exist (`GET /api/.../documents`, `POST .../documents/search`) | **Confirmed** | Documented in Glassworks + [Documents guide](https://onshape-public.github.io/docs/api-adv/documents/) |
| Public document browser URLs follow `/documents/{did}/…` | **Confirmed** | Typical: `https://cad.onshape.com/documents/{did}/w/{wid}/e/{eid}` |
| Schema already has unused dedicated Onshape pipeline; `TeamLink.type` includes `'cad'` | **Confirmed** | `classifyTeamLink` already labels `onshape.com` as CAD |
| Open Alliance / GM0 already surface declared Onshape URLs as `cad` links | **Confirmed** | OA `CAD` field + GM0 CAD labels; fixtures include `cad.onshape.com` URLs |
| API Terms prohibit automated mining of Onshape Public Documents | **Confirmed** | [API Limits / Terms](https://onshape-public.github.io/docs/auth/limits/) — robots/spiders/scrapers for data mining/gathering/extraction from Public Documents are prohibited |
| Onshape staff reiterated no automated extraction even for public docs | **Confirmed** (forum) | [Forum thread](https://forum.onshape.com/discussion/23477/using-onshape-api-to-get-all-the-public-documents) cites Terms §4 |
| Annual / rate API quotas apply to key-based private apps | **Confirmed** | EDU/Free tiers low (e.g. 2,500 calls/year class); `429` / `402` possible |
| “Public” always means anonymously viewable without an Onshape account | **Inferred** | Historical forum notes that some “public” visibility still expected login; treat outbound links as human-openable, not as a scrape target |
| Searching public docs by FTC team number alone would produce many false positives | **Inferred** | Numbers collide across FRC/FTC/templates/forks; same stance as [github-repos.md](github-repos.md) |

## Public APIs / Glassworks (preferred surfaces)

| Surface | Auth | Role for this project |
| --- | --- | --- |
| Glassworks explorer | Session / API key / OAuth | Human research only — browse endpoint shapes |
| REST `GET /documents/{did}` | Required | Optional future **verification** of an already-declared document ID — not discovery |
| REST `GET /documents?q=` / `POST /documents/search` | Required | **Do not** use to crawl or mine Public Documents for team CAD |
| Browser document URL | None for linking | Prefer storing the **outbound URL** teams already publish |

**Do not** prefer HTML scraping of Onshape UI search over the API — both are out of bounds for Public Documents mining under the API Terms summary above.

### URL shape (for parsing declared links)

```text
https://cad.onshape.com/documents/{did}
https://cad.onshape.com/documents/{did}/w/{wid}
https://cad.onshape.com/documents/{did}/w/{wid}/e/{eid}
https://cad.onshape.com/documents/{did}/v/{vid}/e/{eid}
```

Normalize with existing link helpers (`https`, strip tracking params). Keep the full path when present so humans open the intended workspace/element.

## Authentication needs

| Method | When appropriate | Project stance |
| --- | --- | --- |
| API Keys (access + secret) | Personal automation / non–App Store tools | **Never commit.** Not needed for link-only discovery. |
| OAuth2 | Apps distributed via Onshape App Store | Out of scope for this directory |
| Browser session (Glassworks) | Interactive research | Fine for maintainers reading docs; not a CI secret |

Any future verification call (declared `did` only) would need an operator-supplied key via environment / secret store — same pattern as other credentialed sources — and must remain opt-in, fail-soft, and off scheduled refresh.

## Terms and attribution (summary)

This is **not legal advice** and is **not** a clearance to redistribute Onshape-hosted geometry or metadata.

1. **Onshape Terms of Use** and **Onshape API Terms of Use** govern API use ([limits + terms summary](https://onshape-public.github.io/docs/auth/limits/)).
2. **Prohibited:** using robots, spiders, scrapers, or other automated means for data mining, gathering, or extraction from **Onshape Public Documents**. Violation may suspend/terminate API access.
3. **Acceptable framing (project):** enhance directory usefulness by **linking** to CAD URLs teams already declare on public FTC-related surfaces — not by harvesting Public Documents catalogs.
4. **Attribution:** where Onshape-derived links appear, attribute **Onshape** (`https://www.onshape.com/` / `https://cad.onshape.com/`) and the upstream discovery source (Open Alliance, GM0, team website, etc.). Do not claim ownership of team CAD.
5. **Document ownership:** CAD remains the team’s / author’s; this project stores URLs + evidence, not copies.
6. Residual ToS / redistribution risk is **uncleared** — same stance as other third-party sources in [attribution.md](attribution.md).

## Link-vs-copy policy

| Action | Allowed? |
| --- | --- |
| Store outbound Onshape document URLs on `TeamLink` with `type: 'cad'` | **Yes** (preferred) |
| Discover those URLs from team websites / On The Web / OA / GM0 | **Yes** (already partially done) |
| Download Part Studios, assemblies, STL/STEP, thumbnails, or full document JSON into git | **No** |
| Bulk-search or paginate Onshape Public Documents for team numbers | **No** (terms + false positives) |
| Use Glassworks / authenticated `getDocument` to verify a **declared** `did` | **Maybe later** (opt-in, secrets, fail-soft) — not part of #26 |

Prefer linking unless a future explicit license grant (team-declared open CAD license) says otherwise. Even then, prefer outbound links over binary copies.

## Matching rules (false-positive avoidance)

Same spirit as GitHub ownership ([github-repos.md](github-repos.md)): **team number alone is never enough**.

| Evidence path | Result | Confidence |
| --- | --- | --- |
| Onshape URL declared on FTC Events On The Web, team website, Open Alliance `CAD`, or GM0 gallery for that exact team number | **Accept** | `high` (declared) / `medium` (gallery) per existing collectors |
| Search / Public Documents hit whose only signal is the team number in title/description | **Reject** | — |
| Document named only `16158` / `FTC 16158` without team-name token or declared link | **Reject** | — |
| Maintainer-confirmed URL via future claim workflow ([#32](https://github.com/The-Allsparks/ftc-team-analysis/issues/32)) | **Accept** | per confirmation state |

Additional rules:

1. Require a parseable `cad.onshape.com` (or enterprise `*.onshape.com`) `/documents/{did}` URL before storing.
2. Prefer declared links from websites / Open Alliance / GM0 over any Onshape-side search.
3. Do not merge CAD links across teams because document IDs look similar.
4. Reuse `isAllowedPublicTeamLink` privacy filters — no personal student account scraping.

Stub implementation: `src/lib/onshapeCad.ts` (+ tests) encodes accept-declared / reject-number-only only. **Not** wired to `pull:data`.

## Relationship to `cad` TeamLink and #28 graph

| Layer | Today | Onshape role |
| --- | --- | --- |
| `TeamLink.type === 'cad'` | Schema + classifiers; OA/GM0/website may already attach Onshape URLs | Primary storage for outbound CAD links |
| Relationship graph (#28) | `artifact` nodes + `links_to` edges from `Team.links` | Declared Onshape URLs already project as CAD-capable artifacts — no separate Onshape crawl required |
| Dedicated CAD node kind | Not required | Optional future specialization; do not invent without evidence |

**Do not** add a parallel Onshape-specific seed blob. Keep CAD on `Team.links` (and graph projection), with clear `source` / `evidence`.

## Go / no-go recommendation

### Verdict: **Conditional GO for link-only; NO-GO for Public Documents crawling**

| Decision | Scope |
| --- | --- |
| **GO (present)** | Continue attaching **declared** Onshape URLs via existing website / Open Alliance / GM0 enrichment as `TeamLink` `cad` rows; attribute Onshape + upstream source |
| **GO (deferred, optional)** | Opt-in verification of an already-known document ID (authenticated `getDocument`) with secrets outside git, fail-soft `sourceChecks`, never scheduled by default |
| **NO-GO** | Production crawler or API search that mines Onshape Public Documents for team numbers / keywords; downloading CAD binaries or full document exports into the repo; default scheduled Onshape traffic |

### Terms constraints (must hold if anything is implemented later)

1. No automated Public Documents mining/scraping.
2. Prefer link over copy; never commit API keys.
3. Attribute Onshape and the declaring source; residual ToS risk uncleared.
4. Ownership gate: reject number-only matches.
5. Fail soft; identity-critical FTC Events seed must not depend on Onshape.
6. Privacy: public team CAD links only; no student PII from document metadata.

## Code (stub only)

| Path | Role |
| --- | --- |
| `src/lib/onshapeCad.ts` | Parse document URLs; evaluate declared vs number-only match |
| `src/lib/onshapeCad.test.ts` | Reject number-only / accept declared URL |

## Architecture / ingestion (one-liners)

- **Architecture:** Onshape is not on the identity-critical path and is not proxied. CAD appears only as outbound links / graph artifacts when teams declare them elsewhere.
- **Ingestion:** Not wired. Do not add `--enrich-onshape` that searches Public Documents. Existing OA/GM0/website paths remain the discovery mechanism.

## Related

- [attribution.md](attribution.md)
- [architecture.md](architecture.md)
- [ingestion.md](ingestion.md)
- [privacy.md](privacy.md)
- [link-discovery.md](link-discovery.md)
- [open-alliance.md](open-alliance.md)
- [gm0.md](gm0.md)
- [github-repos.md](github-repos.md) — same ownership gate pattern
- [relationship-graph.md](relationship-graph.md) — `artifact` / `links_to` for CAD URLs (#28)
- [responsible-crawling.md](responsible-crawling.md)
- Parent epic [#1](https://github.com/The-Allsparks/ftc-team-analysis/issues/1)
