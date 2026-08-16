# Privacy and data corrections

## Public-data stance

Nevada FTC Team Analysis is a **public team directory**. It is intended to show facts that already appear on public FTC / FIRST-related pages (team numbers, names, cities, organizations/sponsors as published, public event/award lines, and optional public enrichments).

**Do not gather, store, or contribute student personally identifiable information (PII)** — for example personal emails, phone numbers, home addresses, birth dates, school ID numbers, or photos of minors beyond what an official public team avatar already exposes via FIRST systems.

If you discover student PII in the checked-in seed or UI that should not be retained, open a correction or security report (see below and [SECURITY.md](../SECURITY.md)).

## What this project stores

| Kind | Typical content | Notes |
| --- | --- | --- |
| Checked-in Nevada seed | Public team/season snapshot JSON | Refreshed from public FTC Events pages via `pull:data` / scheduled Actions |
| Runtime enrichments | FTCScout stats, Portfolio Lab hits, avatars | Fetched live through allowlisted proxies; not all fields are persisted in the seed |
| Browser/local behavior | Standard web hosting/CDN logs as operated by the host | No project-operated student profile database |

This project does **not** operate a login, team account system, or student profile store today.

## Link discovery privacy rules

Website and social-link collectors (`src/lib/linkDiscovery.ts`) enforce:

- **No personal emails / phones** — `mailto:` and `tel:` are rejected during normalization.
- **No personal/student social accounts** — handles that look like personal names (for example `first.last`, LinkedIn `/in/…`, Facebook `profile.php`) are filtered unless the URL clearly includes a team number or robotics/FTC signal.
- **Public team pages only** — discovery stays on declared On The Web URLs and bounded crawls of public team/school robotics pages and link hubs.
- **Public GitHub repos only** — `--enrich-github` verifies `owner/repo` URLs already discovered; private repos and profile-only URLs are skipped (see [github-repos.md](github-repos.md)).

Details: [link-discovery.md](link-discovery.md). Broader contributor expectations remain in [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) docs. Aggregate school/community context: [school-community-context.md](school-community-context.md).

Future Internet Archive enrichment ([internet-archive.md](internet-archive.md), [#25](https://github.com/The-Allsparks/ftc-team-analysis/issues/25)) must apply the same PII filters: do not retain personal emails, phones, or student social accounts found only in archived page captures.

Onshape CAD ([onshape.md](onshape.md), [#26](https://github.com/The-Allsparks/ftc-team-analysis/issues/26)) is link-only: store public document URLs teams declare, never scrape student accounts or copy CAD binaries from Public Documents.

## Corrections and team claims (process only)

There is no in-app claim/correction product yet (tracked in [#32](https://github.com/The-Allsparks/ftc-team-analysis/issues/32)). Until then:

1. Open a GitHub issue on [The-Allsparks/ftc-team-analysis](https://github.com/The-Allsparks/ftc-team-analysis/issues).
2. Include the **team number**, the incorrect or claimed field(s), and **public evidence links** (for example FTC Events team pages).
3. Do not attach private documents or student PII.

Maintainers may update the seed, fix parsers, or decline changes that cannot be verified from public sources.

## Inferred relationships

Related-team suggestions are typed and evidence-backed, and remain unconfirmed by default. They are not implied legal succession or coaching claims. Details: [team-relationships.md](team-relationships.md).

## Aggregate school / community context

Optional future school and Census geography context is **aggregate-only** (school type, enrollment totals, locale, district, service-area ACS estimates such as broadband or educational attainment). It must never introduce student records, individual demographic inference, PII, or ranking teams on protected characteristics. Policy, allowlisted fields, and schema guardrails: [school-community-context.md](school-community-context.md) ([#27](https://github.com/The-Allsparks/ftc-team-analysis/issues/27)). Depends on school identity from [canonical-identifiers.md](canonical-identifiers.md) ([#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16)).

## Contact for privacy concerns

Use a GitHub issue as above for directory corrections. For suspected sensitive-data exposure, prefer the channels in [SECURITY.md](../SECURITY.md).
