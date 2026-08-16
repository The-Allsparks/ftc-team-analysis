# Attribution and source constraints

This document attributes third-party data sources used by Nevada FTC Team Analysis and records **known operational constraints**. It is **not** legal advice and is **not** a clearance that redistribution of upstream content is permitted under every jurisdiction or license.

Project code and original documentation are MIT-licensed ([LICENSE](../LICENSE)). Upstream team/event facts remain the property of their respective publishers (FIRST®, FTC Events operators, FTCScout, FTC Portfolio Lab, and others). Cite sources when reusing derived snapshots.

## Sources

| Source | Role in this project | Attribution | Constraints and residual risk |
| --- | --- | --- | --- |
| FIRST Team/Event Search | Discovery aid / public team search UI | [FIRST](https://www.firstinspires.org/) | Public HTML/search surfaces only. Terms of use and scraping expectations are set by FIRST; this repo does not assert a license grant from FIRST. |
| FTC Events (region and team pages) | Primary seed: season roster, public team facts, events/awards visible on public pages | [FTC Events](https://ftc-events.firstinspires.org/) | Ingestion reads **public pages**. The official FTC Events API requires credentials and is **not** used. Markup changes can break parsers. Redistribution of scraped page content may be subject to FIRST/FTC Events terms — residual risk, not cleared here. |
| FTC Events API (documented) | Not used | [API info](https://ftc-events.firstinspires.org/services/API) | Credentialed; out of scope for this project’s public-only stance. |
| FTCScout | Optional live quick-stats / events enrichment via allowlisted proxy | [FTCScout](https://ftcscout.org/) / [api.ftcscout.org](https://api.ftcscout.org) | Third-party API; availability, rate limits, and terms are upstream’s. Failures must not be cached as empty success. Schema validated before UI use. OPR and related metrics are **calculated community statistics**, not official FIRST results (see UI labels + `src/data/ftcScoutMeta.ts` catalog `v1`). |

### FTCScout coverage notes (#18)

- **In use (REST via `/ftcscout-proxy`):** `GET /rest/v1/teams/{n}/quick-stats?season=` and `GET /rest/v1/teams/{n}/events/{season}`. Ranking scope is **world-only** for now. Retained fields include season OPR components, world ranks, sample size (`count`), event record/OPR/avg, and optional **score spread** from `dev.totalPoints`.
- **Documented but not used in this app yet:** GraphQL at `https://api.ftcscout.org/graphql`. The production live proxy allows **GET/HEAD only**, and GraphQL requires POST — a follow-up would need a **scoped** POST allowlist for `/ftcscout-proxy/graphql` (not broad proxy POST).
- **Metadata:** Upstream payloads do not expose formula/version fields. Local catalog version `v1` in `src/data/ftcScoutMeta.ts` links definitions to [FTCScout API docs](https://ftcscout.org/api).
| FTC Portfolio Lab | Optional enrichment only (not identity-critical) | [FTC Portfolio Lab](https://www.ftcportfoliolab.org/) | Public `/api/search` for search hits; full catalog fields from public `/portfolio` HTML embedding. **No documented full-catalog API.** HTML/RSC format drift and third-party terms are **residual risks (not a legal clearance)**. |
| FTC Scoring (avatars) | Runtime team avatar CSS/PNGs via allowlisted proxy | [FTC Scoring](https://ftc-scoring.firstinspires.org) | Public composed avatar stylesheet used by FTC Event Web. Avatars are not stored in the generated seed JSON. Availability varies by season. |
| Open Alliance (FTC) | Optional team-declared technical links (code/CAD/build thread/media) | [theopenalliance.org/ftc](https://theopenalliance.org/ftc) / [api.theopenalliance.org](https://api.theopenalliance.org) | Public `GET /teams/ftc` only when `--enrich-open-alliance` is set. Exact team-number match; original URLs preserved. **Not** competitive results. Rate limits / terms are upstream’s — residual risk. See [open-alliance.md](open-alliance.md). |
| Game Manual 0 (gallery) | Optional curated design/CAD/code gallery links | [gm0.org gallery](https://gm0.org/en/latest/docs/appendix/gallery.html) / [gallery.rst](https://github.com/gamemanual0/gm0/blob/main/source/docs/appendix/gallery.rst) | Bounded RST fetch only when `--enrich-gm0` is set. Exact leading team-number match; **link** outbound URLs + gallery page — do not copy copyrighted GM0 prose. Name-only headings rejected. Upstream license/terms are residual risk. See [gm0.md](gm0.md). |
| GitHub (public repos) | Optional verification of already-discovered repo URLs | [GitHub REST docs](https://docs.github.com/en/rest) | Unauthenticated REST only when `--enrich-github` is set; prefer verifying known URLs. Ownership requires evidence beyond team number. Public repos only; no tokens committed. Rate limits / ToS are upstream residual risk. See [github-repos.md](github-repos.md). |
| NCES CCD / EDGE / Census ACS | Deferred aggregate school/community context (#27) | [CCD](https://nces.ed.gov/ccd/) / [EDGE](https://nces.ed.gov/programs/edge/) / [ACS API](https://www.census.gov/programs-surveys/acs/data/data-via-api.html) | **Not fetched yet.** Policy allows institution/geography aggregates only; no student microdata, no paid APIs, no bulk dumps in git. See [school-community-context.md](school-community-context.md). |

## What we claim (and do not)

- We attribute Portfolio Lab and other enrichment sources in the UI/docs where used.
- We do **not** claim ownership of FIRST, FTC Events, FTCScout, or Portfolio Lab content.
- We do **not** claim that scraping or republishing public pages has been reviewed by counsel.
- Inferred team relationships are evidence-backed suggestions, not certified succession — see [team-relationships.md](team-relationships.md).

## Related

- [responsible-crawling.md](responsible-crawling.md)
- [privacy.md](privacy.md)
- [ingestion.md](ingestion.md)
