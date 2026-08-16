# Evidence-backed relationship graph

## Why

Teams, schools/sponsors, events, awards, links, and repositories were connected only through nested seed fields or special-case maps (`teamLineage`, `TeamLink[]`, season `events`/`awards`). Cross-entity questions need a single graph vocabulary where **every edge carries evidence**.

## Storage approach (document / derived view)

| Choice | Rationale |
| --- | --- |
| **Keep mega seed as source of truth** | Existing pull pipeline, publish guards, and UI already depend on `GeneratedData`. |
| **Graph is a derived TypeScript + JSON view** | Pure adapters project seed → `{ nodes, edges }` without mutating seed format. |
| **No graph database** | Avoids paid infra and migration risk; Valibot validates the document shape. |
| **Optional side JSON later** | A future `*.relationship-graph.json` artifact can be written by a script; this PR does not require emitting it from `pull:data`. |

Field-level fact provenance (#5) and organization affiliations (#4) stay as they are; the graph **projects** affiliation / lineage / link / repo evidence onto edges rather than replacing those models. Organization nodes may carry optional canonical identity refs from [#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16) (`slug`, curated NCES ids) when enrichment matches — see [canonical-identifiers.md](canonical-identifiers.md).

## Node types

| Type | Meaning | Typical id |
| --- | --- | --- |
| `team` | FTC team number | `team:16158` |
| `team_season` | One season row for a team | `team_season:16158:2025` |
| `organization` | School, sponsor, host, etc. | `organization:school:…` |
| `event` | Competition / meet | `event:2025:USNVNNLT` |
| `award` | Award instance for a team-season | `award:16158:2025:inspire-award:…` |
| `artifact` | Website / social / CAD / docs link | `artifact:…` |
| `repository` | Verified GitHub repo (#22) | `repository:owner/name` |
| `robot` | Season robot name (when present) | `robot:…` |
| `video` / `channel` | Placeholders for future media (#23) | reserved |

Declared Onshape CAD URLs on `Team.links` (`type: 'cad'`) project as `artifact` nodes via `links_to` — no separate Onshape crawl ([onshape.md](onshape.md), [#26](https://github.com/The-Allsparks/ftc-team-analysis/issues/26)).

## Edge types

| Type | From → To | Source projection |
| --- | --- | --- |
| `has_season` | team → team_season | `Team.seasons` |
| `affiliated_with` | team_season → organization | `TeamAffiliation` / `affiliationsForSeason` |
| `participates_in` | team_season → event | `TeamSeason.events` |
| `awarded` | team_season → award | `TeamSeason.awards` |
| `award_at_event` | award → event | award event code/name |
| `links_to` | team → artifact (or season → robot) | `Team.links` / robot name |
| `has_repository` | team → repository | `Team.codeRepositories` |
| `related_to` | team → team | lineage map (`teamLineage`) |
| `alliance_with` / `opponent_of` | reserved | when match-level data exists |

## Required edge evidence

Every `GraphEdge` must include:

| Field | Required | Meaning |
| --- | --- | --- |
| `source` | yes | Provenance label |
| `retrievedAt` | yes (nullable) | ISO time or `null` for offline/derived |
| `confidence` | yes | `high` \| `medium` \| `low` |
| `confirmationState` | yes | `unconfirmed` \| `confirmed` \| `rejected` |
| `notes` / `url` / `kind` / `detail` / `validFrom` / `validTo` | optional | Lossless extras from lineage / links |

Valibot schemas in `src/data/relationshipGraph.ts` reject edges missing evidence.

## Code map

| Piece | Path |
| --- | --- |
| Types + Valibot + id helpers | `src/data/relationshipGraph.ts` |
| Seed / lineage adapters | `src/lib/relationshipGraphAdapters.ts` |
| Schema + evidence tests | `src/data/relationshipGraph.test.ts` |
| Adapter + round-trip tests | `src/lib/relationshipGraphAdapters.test.ts` |

Example:

```ts
import { buildTeamLineageMap } from '../teamLineage';
import { buildRelationshipGraph } from '../lib/relationshipGraphAdapters';
import { roundTripRelationshipGraph } from '../data/relationshipGraph';

const lineageMap = buildTeamLineageMap(teams);
const graph = buildRelationshipGraph({ teams, lineageMap, label: 'USNV' });
const parsed = roundTripRelationshipGraph(graph);
```

## Lossless mapping notes

- **Affiliations:** `sourceText`, `entityType`, season, confidence, and confirmation copy onto the edge; organization node keeps the display name.
- **Lineage:** `relationshipType`, `matchReason`, `seasonRange`, and full `evidence[]` rows land in edge `props` / evidence `detail`.
- **Links / repos:** ownership confidence, confirmation, evidence kind/text, and URLs are preserved.
- **Events / awards:** codes, ranks, URLs, and award types are kept on nodes/`props`.

## Non-goals (this issue)

- Full graph visualization UI / explorer product
- Migrating the mega seed into graph-native storage
- YouTube / channel ingestion (#23), FIRST API matches (#17), Pages hosting (#38)
- Team-submitted corrections (#32)
- Emitting alliance/opponent edges without match data

## Related

- [organization-affiliations.md](organization-affiliations.md) (#4)
- [field-evidence.md](field-evidence.md) (#5)
- [team-relationships.md](team-relationships.md) (#6)
- [github-repos.md](github-repos.md) (#22)
- [youtube.md](youtube.md) (#23)
- [architecture.md](architecture.md)
