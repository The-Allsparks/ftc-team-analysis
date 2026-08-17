# v1 product milestone

## Milestone

> **A trustworthy, source-backed Nevada FTC team directory and historical record.**

Until the readiness checklist below is met, this project prioritizes identity, provenance, ingestion safety, and auditable directory/history features—not predictive or comparative analytics that would over-claim on unresolved foundations.

Parent epic: [#1](https://github.com/The-Allsparks/ftc-team-analysis/issues/1).

## In scope for v1

- Nevada team directory backed by public (and, when ready, official) sources
- Season history and change-aware records where foundations exist
- Typed organization affiliations, field-level evidence, and qualified related-team suggestions
- Existing FTCScout / lineage UI treated as a **qualified preview** (labeled and evidence-aware where implemented)—not as finished intelligence products

## Deferred until readiness

Do **not** ship new predictive or comparative analytics that depend on unresolved identity, provenance, or competitive completeness. Explicitly deferred examples:

- Retention and continuity analysis
- Performance or ranking trajectories
- Sponsor / affiliation network graphs as analytic products
- Coverage-gap scoring beyond source-health reporting
- Alliance network analytics
- Mechanism prevalence analysis
- Peer comparisons and similar comparative products

Enrichment and research issues (for example technical resources, social discovery, or corroborating sources) may proceed when they improve the directory/record without presenting those deferred analytic claims.

## Existing Scout / lineage UI

Scout stats, filters, lineage, and related surfaces already in the app are a **qualified preview** until full readiness. They should remain clearly bounded (evidence, confidence, failure states)—not expanded into new predictive/comparative products before the checklist is satisfied.

## Readiness checklist

Checkmarks reflect whether the corresponding foundation issue is closed. Open items still block declaring v1 readiness for analytics.

| Criterion | Status | Issue(s) |
| --- | --- | --- |
| Reliable ingestion (scheduled refresh + publication gates) | Done | [#3](https://github.com/The-Allsparks/ftc-team-analysis/issues/3) (proxy: [#2](https://github.com/The-Allsparks/ftc-team-analysis/issues/2)) |
| Field-level provenance / evidence model | Done | [#5](https://github.com/The-Allsparks/ftc-team-analysis/issues/5) |
| Organization affiliations (school vs sponsors, etc.) | Done — **v1 bar** | [#4](https://github.com/The-Allsparks/ftc-team-analysis/issues/4) |
| Canonical location / school / org identifiers | Stretch (not a hard v1 blocker) | [#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16) |
| Complete official competitive records | Remaining | [#17](https://github.com/The-Allsparks/ftc-team-analysis/issues/17) |
| Source-health and coverage reporting | Remaining | [#30](https://github.com/The-Allsparks/ftc-team-analysis/issues/30) |
| Automated tests | Done | [#9](https://github.com/The-Allsparks/ftc-team-analysis/issues/9) |
| CI workflow on PRs / `main` | Done | [#46](https://github.com/The-Allsparks/ftc-team-analysis/issues/46) |
| Required checks / branch protection on `main` | Done | [#10](https://github.com/The-Allsparks/ftc-team-analysis/issues/10) |
| Qualified relationship inference (not implied succession) | Done | [#6](https://github.com/The-Allsparks/ftc-team-analysis/issues/6) |
| Historical snapshots and change tracking | Remaining | [#29](https://github.com/The-Allsparks/ftc-team-analysis/issues/29) |

Related trust foundations already landed (supporting, not separate checklist rows): [#7](https://github.com/The-Allsparks/ftc-team-analysis/issues/7), [#8](https://github.com/The-Allsparks/ftc-team-analysis/issues/8), [#11](https://github.com/The-Allsparks/ftc-team-analysis/issues/11), [#12](https://github.com/The-Allsparks/ftc-team-analysis/issues/12), [#15](https://github.com/The-Allsparks/ftc-team-analysis/issues/15).

## Review policy: analytics PRs

Until the **Remaining** checklist rows above are satisfied (stretch [#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16) excepted), maintainers **may reject or request deferral** of pull requests that add new predictive or comparative analytics—especially retention, continuity, trajectories, sponsor networks, coverage-gap products, alliance networks, mechanism prevalence, or peer comparisons.

Directory, provenance, ingestion, schema, CI, and qualified-preview hardening work remains welcome.

Contributor docs may later absorb this policy ([#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31)); this file is the source of truth until then.
