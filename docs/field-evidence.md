# Field-level evidence model

## Why

Document-level `GeneratedData.sources` and a single `TeamSeason.sourceUrl` are not enough to audit individual facts (name, location, organization, website, records). Derived profile fields (`Team.latest*`) were also easy to confuse with immutable observations.

## What changed (schema v1, additive)

- **Kept:** All existing season scalars, document `sources`, and #4 `affiliations`.
- **Added (optional):** `TeamSeason.evidence?: FieldEvidence[]` — one or more observations per core field.
- **Schema version:** remains **1**. Older seeds without `evidence` still validate.

### `FieldEvidence` fields

| Field | Meaning |
| --- | --- |
| `id` | Stable within a season for supersede/conflict links |
| `field` | Fact key (`name`, `location`, `organization`, `website`, `record`, `qualificationRecord`, `playoffRecord`, `rookieYear`, `league`, `region`, `robot`, `teamType`) |
| `value` | Normalized display/compare string |
| `kind` | `observed` (scraped/indexed) or `derived` (e.g. `teamType` heuristic) |
| `sourceType` | e.g. `ftc-events-team-page`, `first-search`, `derived`, `offline-synthesize` |
| `sourceUrl` | Page or document URL when known |
| `retrievedAt` | ISO timestamp when known; `null` for offline synthesize |
| `observedSeason` | Season id of the observation |
| `extractionMethod` | e.g. `html-field`, `html-title`, `search-index`, `heuristic`, `offline-synthesize` |
| `confidence` | `high` \| `medium` \| `low` |
| `confirmationState` | `unconfirmed` \| `confirmed` \| `rejected` |
| `status` | `current` \| `conflicting` \| `superseded` |
| `rawValue` | Raw snippet when useful (e.g. full organization line) |
| `supersedesId` | Prior observation id this row replaces (when status is current after supersede) |

### Derived vs observed

- Season facts from FTC Events / FIRST Search → `kind: observed`.
- `teamType` → `kind: derived`.
- `Team.latest*` remain convenience projections from the newest present `TARGET_SEASONS` season (not stored as evidence rows on `Team`).

### Affiliations (#4) stay parallel

Organization segment roles (`TeamAffiliation`) keep their own `source` / `confidence` / `sourceText`. Season-level `organization` also gets a `FieldEvidence` row. The UI shows both.

### Competitive facts in scope

Season `record`, and `qualificationRecord` / `playoffRecord` when present. Per-event and per-award field evidence is out of scope (event/award rows already carry useful URLs).

## Ingestion

- `parseTeamSeason` writes evidence with `retrievedAt` on live/pull.
- `seasonFromSeed` writes evidence for search/region placeholders.
- Live refresh merges prior evidence via `mergeSeasonEvidence` (supersede on value change).
- Offline `scripts/backfill-field-evidence.ts` synthesizes evidence from existing scalars + `sourceUrl` without network access.

## Non-goals

- Canonical location/school/org IDs (#16)
- Relationship graph (#28)
- Lineage evidence rewrite (#6)
- Full historical snapshot product (#29)
- Team-submitted correction workflow (#32)
- Paid services, secrets, or student PII
