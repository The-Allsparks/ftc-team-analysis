# Field-level evidence model

## Why

Document-level `GeneratedData.sources` and a single `TeamSeason.sourceUrl` are not enough to audit individual facts (name, location, organization, website, records). Derived profile fields (`Team.latest*`) were also easy to confuse with immutable observations.

## What changed (schema v1, additive)

- **Kept:** All existing season scalars, document `sources`, and #4 `affiliations`.
- **Added (optional):** `TeamSeason.evidence?: FieldEvidence[]` — one or more observations per core field (runtime / live refresh).
- **Added (#29):** Append-only side store `src/data/nv-ftc-team-observations.generated.json` (synced to `public/data/`) for cross-refresh history. The mega seed keeps **current season scalars only** and omits full history.
- **Schema version:** remains **1**. Older seeds without `evidence` still validate.
- **Checked-in seed:** omits `evidence` arrays to avoid bundle/asset bloat. The UI loads the observations side store and joins history on read (`attachObservationsToData`); when no store rows exist it still **derive-on-reads** via `evidenceForSeason`.

### `FieldEvidence` fields

| Field | Meaning |
| --- | --- |
| `id` | Stable within a season for supersede/conflict links |
| `field` | Fact key (`name`, `location`, `organization`, `website`, `record`, `qualificationRecord`, `playoffRecord`, `rookieYear`, `league`, `region`, `robot`, `teamType`, `active`) |
| `value` | Normalized display/compare string |
| `kind` | `observed` (scraped/indexed) or `derived` (e.g. `teamType` heuristic) |
| `sourceType` | e.g. `ftc-events-team-page`, `first-search`, `derived`, `offline-synthesize`, `refresh-presence` |
| `sourceUrl` | Page or document URL when known |
| `retrievedAt` | ISO timestamp when known; `null` for offline synthesize / derive-on-read |
| `observedSeason` | Season id of the observation |
| `extractionMethod` | e.g. `html-field`, `html-title`, `search-index`, `heuristic`, `offline-synthesize`, `presence-drop` |
| `confidence` | `high` \| `medium` \| `low` |
| `confirmationState` | `unconfirmed` \| `confirmed` \| `rejected` |
| `status` | `current` \| `conflicting` \| `superseded` |
| `rawValue` | Raw snippet when useful (e.g. full organization line) |
| `supersedesId` | Prior observation id this row replaces (when status is current after supersede) |

### Change-tracked fields (#29)

Side-store history covers: **name**, **location**, **organization** (school/sponsors via the public org line), **website**, **league**, **region**, **robot**, **active** (season flag + presence vs dropped on refresh).

**Deferred:** social/resource `Team.links` observation history (follow-up).

### Derived vs observed

- Season facts from FTC Events / FIRST Search → `kind: observed`.
- `teamType` → `kind: derived`.
- `Team.latest*` remain convenience projections from the newest present supported season (not stored as evidence rows on `Team`).

### Affiliations (#4) stay parallel

Organization segment roles (`TeamAffiliation`) keep their own `source` / `confidence` / `sourceText`. Season-level `organization` also gets a `FieldEvidence` row (stored or derived). The UI shows both.

### Competitive facts in scope

Season `record`, and `qualificationRecord` / `playoffRecord` when present (evidence model). Per-event and per-award field evidence is out of scope. Competitive records are not required in the #29 change-tracking side store.

## Ingestion and display

- `parseTeamSeason` writes evidence with `retrievedAt` on live/pull.
- `seasonFromSeed` writes evidence for search/region placeholders.
- Live refresh merges prior evidence via `mergeSeasonEvidence` (supersede on value change).
- `mergeSeasonRefresh` and full pull merge prior season evidence before writing.
- `pull:data` syncs the **observations side store** (`syncObservationsFromPull`): baseline synthesize on first touch (`retrievedAt: null` / `offline-synthesize`), append/supersede on changes, record `active=false` when a team is dropped from a refreshed season, then **strips** `evidence` from the mega seed.
- **UI:** loads observations JSON, attaches history onto seasons, and labels **Current** / **Observed this season** / **Previously observed**.
- Optional maintainer script `scripts/migrate-team-observations.ts` migrates any embedded seed evidence into the side store offline.

## Non-goals

- Canonical location/school/org IDs (#16)
- Relationship graph product / explorer (model landed in #28; visualization deferred)
- Internet Archive reconstruction pipeline (#25 research landed in [internet-archive.md](internet-archive.md); not wired into seed/observations yet)
- Cloudflare static snapshot tree / hosting (#38) — layout + generator in [snapshot-tree.md](snapshot-tree.md) (#87)
- Team-submitted correction workflow (#32)
- Paid services, secrets, or student PII
- Persisting full observation history inside the mega seed
- Social/resource `Team.links` change history (deferred follow-up)
