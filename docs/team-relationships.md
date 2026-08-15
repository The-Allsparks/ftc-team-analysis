# Team relationships (lineage)

## Why

Heuristic “lineage” used to present shared-school matches as earlier/later team numbers in language that read like confirmed succession. Multiple concurrent numbers at one school were easy to misread as a single renumbering chain.

## What changed

- Runtime relationships are typed (`same_school`, `sister_team`, `possible_renumbering`, `possible_related`, plus curator `confirmed_predecessor` / `confirmed_successor`, and reserved `shared_organization` / `shared_sponsor`).
- Every heuristic edge is **`unconfirmed`**, carries **evidence** (shared school, season ranges, optional name tokens, source URLs), and a **confidence explanation**.
- Overlapping same-school seasons emit **`sister_team`** (not succession).
- Schools with concurrent multi-number history (or 3+ numbers) never auto-claim **`possible_renumbering`**.
- UI title: **Possible Related Teams**; rejected overrides are hidden.
- Curator file: [`src/data/teamRelationshipOverrides.json`](../src/data/teamRelationshipOverrides.json) (empty by default). Confirm/reject merges at map-build time without bloating the team seed.

## Overrides

```json
{
  "schemaVersion": 1,
  "overrides": [
    {
      "teamNumberA": 1001,
      "teamNumberB": 1002,
      "relationshipType": "confirmed_successor",
      "confirmationState": "confirmed",
      "note": "Optional curator note"
    }
  ]
}
```

- `confirmationState: "rejected"` removes the pair from default UI.
- `confirmed_predecessor` / `confirmed_successor` are oriented chronologically when applied.
- No student PII; public team numbers only.

## Non-goals

- General relationship graph product (#28)
- Canonical school/org IDs (#16)
- Team-submitted confirmation UI (#32)
- Persisting relationship evidence into `nv-ftc-teams.generated.json`
