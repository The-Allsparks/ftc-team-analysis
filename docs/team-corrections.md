# Team-submitted corrections and verification (#32)

## Purpose

Teams and mentors can suggest corrections (links, school/org text, sister teams, historical notes) and **confirm or reject inferred relationships**. Submissions create **reviewable moderation records**. They must **never** silently overwrite sourced seed (`nv-ftc-teams.generated.json`) or observations (`nv-ftc-team-observations.generated.json`).

## Non-overwrite rule (hard)

| Action | Effect |
| --- | --- |
| Submit | Creates a `pending` `ModerationRecord` (browser-local MVP queue) |
| Approve | Sets `approved` and attaches a `SeedPatchProposal` with **`autoApply: false`** |
| Reject | Sets `rejected`; no patch |
| `applyApproved` | Returns the same patch proposal shape — **does not write disk or mutate live seed** |

Maintainers apply approved proposals manually (for example editing `src/data/teamRelationshipOverrides.json`, fixing parsers, or a future curated PR). Live `confirmationState` on lineage links in the UI does **not** flip until a curator path is updated after moderation.

## Verification standards

Approve a change only when **at least one** of the following holds:

1. **Public FIRST / FTC Events** page or official region listing corroborates the fact.
2. **Team-declared public page** (website / social / GitHub / YouTube / CAD link already attributable to the team) clearly shows the claim.
3. **Curator-known public evidence** already documented in-repo (field evidence, relationship evidence ids).

Do **not** approve from:

- Private documents, screenshots of student contact lists, or school SIS extracts
- Student personal emails, phones, or social accounts
- “Trust me” claims without a public URL

Lineage confirm/reject must reference a stable **`relationshipEvidenceId`** (graph edge id via `relatedEdgeId`). Confirming does not invent succession; use relationship types already defined in [team-relationships.md](team-relationships.md).

## Moderation process (MVP)

1. Submitter opens **Suggest a correction** on a team detail panel (or uses confirm/reject on a related-team card).
2. Record is stored in **browser `localStorage`** under `ftc-team-analysis:moderation-queue`.
3. Maintainer opens `#corrections` (footer **Corrections queue**).
4. Review evidence → **Approve (proposal only)** or **Reject**.
5. **Download JSON** or **Copy GitHub issue** markdown for durable review outside the browser.
6. Manually apply verified overrides / seed fixes in a normal PR — never from an auto-merge path in this MVP.

There is **no** paid auth SaaS and **no** persistent server store in this MVP. Clearing site data loses the local queue; exports are the durable artifact.

## Privacy

- Do not collect or store **student PII** (personal email, phone, home address, birth date, student IDs, private photos).
- Optional submitter contact is for **adult roles** (mentor, coach, alumni) or a GitHub handle — treat as optional and avoid publishing it unnecessarily.
- Aligns with [privacy.md](privacy.md) and [SECURITY.md](../SECURITY.md).

## Spam / abuse controls (security notes)

| Control | Behavior | Limitation |
| --- | --- | --- |
| Honeypot (`companyUrl`) | Hidden field; non-empty → reject | Deterministic bots that skip hidden fields may still pass |
| Client validation | Valibot + URL/team-number checks | Client-only; not a substitute for server auth |
| Soft rate tip | ~60s between local submits advised in UI | Not server-enforced; per-browser only |
| No auto-apply | Approvals never write generated seed | Reduces blast radius of spam approvals |
| Export / GitHub issue | Human review path | Relies on maintainer process |

**Residual risks:** Without a backend, spam can fill one browser’s queue; shared machines can see prior local submissions; clipboard/export may include optional contact text. Future hardening (issue CAPTCHA, email intake, or authenticated captain claims) is out of scope for this MVP.

## Schema sketch

- `CorrectionSubmission` / `ModerationRecord` — states `pending | approved | rejected`
- Proposed change kinds: `link`, `school_org_text`, `lineage_confirm`, `lineage_reject`, `sister_team`, `historical_note`, `other`
- Implementation: `src/data/teamCorrectionsSchema.ts`, `src/lib/teamCorrections.ts`

## Related docs

- [privacy.md](privacy.md) — public-data stance and PII
- [team-relationships.md](team-relationships.md) — lineage types and curator overrides
- [field-evidence.md](field-evidence.md) — sourced observations model
- [attribution.md](attribution.md) — source hierarchy
