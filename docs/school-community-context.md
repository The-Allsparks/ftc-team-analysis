# Aggregate school / community context (research)

Issue [#27](https://github.com/The-Allsparks/ftc-team-analysis/issues/27). Research and policy for optional **institution- and geography-level** context around FTC teams — **without** student profiling.

This issue is **research / policy + schema guardrails**, not a live Census/NCES fetch pipeline. Merging a PR that lands this document is how maintainers **accept** the ethics constraints below.

## Status

| Dependency | State |
| --- | --- |
| [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) privacy / licensing docs | **Done** — base public-data stance |
| [#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16) canonical school / org IDs (NCES) | **Done** on `main` — prerequisite for attaching any school-keyed context |
| ACS / EDGE / CCD **fetch pipeline** | **Deferred** — not in this issue |
| Ranking / analytics UI using these fields | **Out of scope** |

**Blocked → ready:** Once #16 NCES identifiers exist on affiliations (curated match or future enrichment), aggregate context may be keyed by `nces-sch` / `nces-lea` / `nces-pss`. Without a resolved school identity, do not invent school-level demographics.

## Ethics constraints (maintainer acceptance)

By merging work that cites this document, maintainers accept:

1. **Aggregate only.** Context describes schools, districts, or Census geographies — never individual students, mentors, or coaches as demographic subjects.
2. **No student-level data paths.** Do not propose or implement ingestion of student information systems, rosters, gradebooks, individual survey responses, or any record that identifies a minor.
3. **No individual demographic inference.** Do not infer a person’s race, ethnicity, income, disability, or similar attributes from team membership, school name, or ZIP.
4. **No ranking on protected characteristics.** Do not rank, score, or “explain” team competitive performance using race, ethnicity, national origin, religion, sex, disability, or similar protected attributes — even when those attributes appear only as geography aggregates.
5. **Allowed analytical use.** Coverage, access, and outreach analysis (e.g. “which locales lack teams,” broadband/service-area maps) is the intended use.
6. **No paid demographic APIs** and **no bulk Census / EDGE shapefile dumps committed into this repository.** Prefer on-demand public APIs or maintainer-operated caches outside the git tree when a pipeline is built later.
7. **PII ban aligns with** [privacy.md](privacy.md): no personal emails, phones, home addresses, birth dates, student ID numbers, or photos of minors beyond official public avatars.

## Research findings (sources)

| Source | What it offers (aggregate) | Fit for this project |
| --- | --- | --- |
| [NCES CCD](https://nces.ed.gov/ccd/) | Public school / LEA directory: school type, grade span, membership (enrollment totals), district, locale codes | **Primary** institutional attributes once NCES ID is matched (#16) |
| [NCES EDGE](https://nces.ed.gov/programs/edge/) | School / district boundary and locale geography products | **Service-area** geography keys (district, school attendance area) — link by ID, do not store student addresses |
| [Census ACS Data API](https://www.census.gov/programs-surveys/acs/data/data-via-api.html) | Tract / ZCTA / place / county / school-district estimates (income, broadband, educational attainment, etc.) | **Geography aggregates** keyed by GEOID — free API; no student microdata |

**Confirmed:** This repo has no NCES/Census integration today beyond the curated NCES allowlist for identity (#16).

**Confirmed:** School identity is first-class only via optional affiliation identifiers (`nces-sch`, `nces-lea`, `nces-pss`); free-text org strings alone are not enough to attach ACS rows safely.

## Allowed field list (aggregate-only)

All fields below are **institution- or geography-level**. Schema guardrails live in `src/data/aggregateSchoolContext.ts`.

### School / LEA (typically CCD, keyed by NCES ID)

| Field | Classification | Notes |
| --- | --- | --- |
| `ncesSchoolId` / `ncesLeaId` / `ncesPssId` | Identity key | From #16; never invent |
| `schoolType` | Aggregate institutional | e.g. regular / charter / private (as published) |
| `gradeRangeLow` / `gradeRangeHigh` | Aggregate institutional | Published grade span |
| `enrollmentTotal` | Aggregate count | School or LEA membership total — **not** a roster |
| `districtName` | Aggregate institutional | Display name of LEA when known |
| `localeCode` / `localeLabel` | Aggregate institutional | NCES locale (city/suburb/town/rural style codes) |

### Service area / community (EDGE geography + ACS estimates)

| Field | Classification | Notes |
| --- | --- | --- |
| `serviceArea.geographyType` | Geography key | e.g. school-district, ZCTA, county, place, tract |
| `serviceArea.geographyId` | Geography key | Official GEOID / NCES geography id |
| `serviceArea.medianHouseholdIncome` | ACS aggregate | Estimate for the geography, not a household |
| `serviceArea.broadbandSubscriptionRate` | ACS aggregate | Share of households / units as published |
| `serviceArea.educationalAttainmentBachelorsPlusRate` | ACS aggregate | Adult educational attainment share |
| `serviceArea.povertyRate` | ACS aggregate | Geography poverty estimate |

Optional provenance on any row: `source`, `retrievedAt`, `vintage` (ACS year), `evidenceNotes` — same spirit as field-evidence elsewhere.

## Explicit prohibitions

| Prohibited | Why |
| --- | --- |
| Student records, rosters, SIS exports, individual IEP/504 rows | Student-level / PII |
| Personal emails, phones, home addresses, birth dates, student IDs | PII — see [privacy.md](privacy.md) |
| Per-student or per-mentor demographic attributes | Individual profiling |
| Inferring a person’s protected attributes from school or ZIP | Individual demographic inference |
| Storing “team racial composition” or similar member breakdowns | Student-adjacent profiling |
| Ranking / scoring teams by race, ethnicity, or other protected traits | Ethics constraint #4 |
| Committing bulk ACS microdata, EDGE shapefiles, or paid API payloads into git | Scope + repo hygiene |
| Using unresolved free-text school names as ACS join keys without #16 match | False precision / misuse risk |

**No student-level data paths are proposed.** A future fetch job (deferred) would: resolve NCES ID → read CCD row → map EDGE geography → request ACS **aggregate** estimates for that GEOID → validate with `aggregateSchoolContextSchema` → attach only allowlisted fields.

## Schema guardrails (testing)

- TypeScript type `AggregateSchoolContext` and Valibot `aggregateSchoolContextSchema` accept **only** allowlisted keys (`strictObject`).
- `assertNoBannedSchoolContextFields` / parse helpers reject known banned names and student-shaped payloads (e.g. `students[]`, `roster`, `email`).
- Tests live in `src/data/aggregateSchoolContext.test.ts`. **No live Census data** is seeded.

## Architecture / ingestion (one-liners)

- **Architecture:** Aggregate school context is an optional enrichment document keyed by NCES IDs from #16 — not part of the identity-critical FTC Events seed path.
- **Ingestion:** Deferred; when built, pull ACS/CCD on demand (or maintainer cache outside git), validate with the allowlist schema, and never write student-level fields into `nv-ftc-teams.generated.json`.

## Confirmed vs deferred

| Item | Status |
| --- | --- |
| Privacy/ethics constraints documented | **Confirmed** (this doc; acceptance via PR merge) |
| Aggregate-only field classification | **Confirmed** |
| No student-level paths proposed | **Confirmed** |
| Dependency on #16 NCES identity | **Confirmed** (prerequisite satisfied on `main`) |
| Schema + banned-field tests | **Confirmed** (guardrails only) |
| CCD/EDGE/ACS API client | **Deferred** |
| EDGE shapefile / bulk download in repo | **Deferred / out of scope** |
| Coverage-gap maps / ranking UI | **Out of scope** (#27) |

## Related

- [privacy.md](privacy.md)
- [canonical-identifiers.md](canonical-identifiers.md)
- [attribution.md](attribution.md)
- [architecture.md](architecture.md)
- [ingestion.md](ingestion.md)
