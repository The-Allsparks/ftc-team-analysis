# Organization affiliations migration

## Why

Public FIRST sponsor lines concatenate sponsors and a host organization into one string (often sponsors joined with `/`, host after `&`). The app historically stored that as a single `organization` field on each team season, which blocked reliable school vs sponsor analysis.

## What changed (schema v1, additive)

- **Kept:** `TeamSeason.organization` and `Team.latestOrganization` — the raw public sponsor line is never discarded.
- **Added (optional):** `TeamSeason.affiliations?: TeamAffiliation[]` — season-scoped typed relationships derived from that string.
- **Schema version:** remains **1**. Older seeds without `affiliations` still validate. The UI and lineage helpers derive affiliations on read when the array is missing.

### `TeamAffiliation` fields

| Field | Meaning |
| --- | --- |
| `entityType` | Role enum (see below) |
| `name` | Trimmed segment display name |
| `season` | Season id (same as parent season) |
| `source` | `ftc-events-sponsors`, `first-search`, or `organization-backfill` |
| `retrievedAt` | ISO timestamp when known; usually `null` for offline backfill |
| `confidence` | `high` \| `medium` \| `low` |
| `confirmationState` | `unconfirmed` \| `confirmed` \| `rejected` (review queue = filter these flags; no admin product) |
| `sourceText` | Full original `organization` string for that season |

### Entity types

Auto-filled from public strings:

- `sponsor` — left side of `&`, split on `/`
- `school` — schoolish host (or sole segment)
- `community_organization` — host matching **4-H** or **Boys & Girls Clubs**
- `team_affiliation` — host matching **Family/Community** or **Home School**
- `host_organization` — other host when not school/community/affiliation

Schema-supported but **not** auto-filled in this release (no invented NLP/IDs):

- `school_district`, `program_operator`, `funder`, `fiscal_sponsor`

Canonical NCES / org IDs are out of scope (see issue #16). Full field-level provenance is out of scope (see issue #5).

## How prior records map

| Prior `organization` shape | Affiliations |
| --- | --- |
| `SponsorA/SponsorB&School Name` | sponsors + school |
| `Tesla&Helen C Cannon Middle School` | sponsor Tesla + school |
| `&The Meadows School` | school only |
| `Galena High School` | school only |
| `…&Family/Community` or `…&Home School` | sponsors + `team_affiliation` |
| `…&4-H…` or `…&Boys & Girls Clubs…` | sponsors + `community_organization` |
| `Family/Community` alone | one `team_affiliation` |
| Multi-host (`&4-H&Family/Community`) | multiple hosts at **low** confidence, `unconfirmed` |
| Names with embedded `&` (`Boys & Girls`, `Mario C & Joanne`, `V & T`, `C&F`) | protected; last *delimiter* `&` still used |

Offline backfill walks the checked-in Nevada seed and sets `affiliations` from each existing `organization` string without network access. Live parse and `pull:data` write the same structure going forward.

## Non-goals

- Do not remove or rewrite historical raw `organization` text.
- Do not call paid NLP/AI services.
- Do not gather student PII.
- Do not implement canonical org IDs (#16), full provenance (#5), or a general relationship graph (#28).
