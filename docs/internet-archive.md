# Internet Archive / Wayback (research)

Issue [#25](https://github.com/The-Allsparks/ftc-team-analysis/issues/25). Research for using the [Internet Archive](https://archive.org/) / [Wayback Machine](https://web.archive.org/) to recover **historical public team website content** (sponsors, former names, robot pages, portfolios) when live pages change or disappear.

This issue is **research + schema proposal + bounded pilot notes**, not a production Wayback crawler. Do **not** wire `pull:data`, scheduled data-refresh, or Worker proxies to Internet Archive in the same change that lands this document.

## Status

| Dependency | State |
| --- | --- |
| [#29](https://github.com/The-Allsparks/ftc-team-analysis/issues/29) historical observations side store | **Done** — current vs previously observed live facts |
| [#31](https://github.com/The-Allsparks/ftc-team-analysis/issues/31) licensing / attribution / privacy docs | **Done** — attribution + privacy stance |
| IA research / go-no-go / archive timestamp fields | **This document** |
| Live IA fetch in `pull:data` or scheduled refresh | **Out of scope** (#25) |

## Confirmed vs inferred

| Item | Status | Notes |
| --- | --- | --- |
| Public Availability API `GET https://archive.org/wayback/available?url=` | **Confirmed** | Returns closest snapshot metadata when present |
| Public CDX API `GET https://web.archive.org/cdx/search/cdx` | **Confirmed** | Capture index; `output=json`, `limit`, `fl`, filters — see [CDX server README](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md) |
| Wayback playback URLs `https://web.archive.org/web/{timestamp}/{original}` | **Confirmed** | From Availability `closest.url` and CDX `timestamp` + `original` |
| Descriptive `User-Agent` required for automated access | **Confirmed** | [Bots / LLMs guide](https://archive.org/developers/bots.html) |
| Honor HTTP `429` + `Retry-After`; add delays for bulk work | **Confirmed** | Same bots guide — no hard numeric quota published there |
| Community-reported CDX throttle ~60 req/min; ignore-429 → temporary IP block | **Inferred** | Third-party writeups post-2024 outage; treat as operational caution, not an IA SLA |
| Terms of use at [archive.org/about/terms.php](https://archive.org/about/terms.php) | **Confirmed** (page exists) | This research is **not legal advice** and is **not** a clearance to bulk-republish archived page bodies |
| No IA client or archive timestamp fields in this repo before #25 | **Confirmed** | Issue evidence + codebase review |

## API / tools (preferred surfaces)

| Surface | Auth | Role for this project |
| --- | --- | --- |
| Availability API | None | Cheap “is there a capture?” probe for a known URL |
| CDX search API | None (public fields) | Enumerate timestamps / status / MIME for a known URL; keep `limit` tiny |
| Wayback playback HTML | None | Human review or future bounded fetch of a **single** capture — not bulk WARC download |
| `ia` CLI / `internetarchive` Python | Optional account | Not needed for research; if used later, follow User-Agent suffix rules |

**Do not** prefer HTML scraping of `web.archive.org` calendar UI over Availability/CDX. Prefer storing **outbound archive URLs + timestamps + attribution**, not copying full page HTML into git.

### Minimal query shapes (research)

```text
GET https://archive.org/wayback/available?url={urlencoded}
GET https://web.archive.org/cdx/search/cdx?url={host-or-url}&output=json&limit=3&fl=timestamp,original,statuscode,mimetype
```

Always send a descriptive User-Agent identifying this project and purpose (see pilot notes).

## Rate limits and responsible use

1. **Identify** — descriptive User-Agent with project URL / issue reference ([bots guide](https://archive.org/developers/bots.html)).
2. **Bound** — Nevada known team URLs only; tiny `limit`; no domain-wide pagination sweeps.
3. **Pace** — multi-second delay between automated requests in any future job; cache responses.
4. **Backoff** — on `429`, honor `Retry-After`; fail soft; never rotate proxies to evade blocks.
5. **Purpose-limited** — recover declared / previously observed public team site history; do not bulk-archive the web into this repo ([responsible-crawling.md](responsible-crawling.md)).

Scheduled `data-refresh` must **not** enable IA enrichment by default (same pattern as Open Alliance / GM0 / GitHub).

## Terms / attribution

- Attribute **Internet Archive / Wayback Machine** (`https://archive.org/`, `https://web.archive.org/`) wherever IA-derived fields appear.
- Respect [Terms of Use](https://archive.org/about/terms.php) and automated-access guidance. Residual redistribution / ToS risk is **uncleared** — same stance as other third-party sources in [attribution.md](attribution.md).
- Archived pages may themselves reproduce FIRST / team / school content; do not claim ownership of that content.
- Prefer linking to Wayback playback URLs over embedding copyrighted HTML/CSS/media in the seed.

## Relation to #29 observations (archived vs current)

[#29](https://github.com/The-Allsparks/ftc-team-analysis/issues/29) stores **refresh-to-refresh observations of live FTC Events (and related) facts** in `nv-ftc-team-observations.generated.json`. Those rows describe what was **current on a public FIRST-related surface at retrieve time**.

Internet Archive facts are different:

| Concept | Live observations (#29) | Archive reconstruction (#25 proposal) |
| --- | --- | --- |
| What is true “now” on FTC Events / declared website | `status: current` observation / season scalar | Never inferred from Wayback alone |
| What was published on a team site in the past | Not covered (links history deferred) | `factCurrency: archived` + capture timestamp |
| Source type | e.g. `ftc-events-team-page`, `offline-synthesize` | `internet-archive-cdx` / `internet-archive-availability` |
| Timestamps | `retrievedAt` (when we scraped live) | `captureTimestamp` (when IA crawled) + `archivedAt` (when we queried IA) |
| Liveness of original URL | Link `liveness` on `Team.links` (#24) | Separate from archive availability; a dead live URL may still have captures |

**Rule:** An archived capture may support an **archived** observation (former sponsor list, former robot page URL, historical website contents) with clear UI labeling (**Archived capture**, not **Current**). It must **not** silently overwrite `TeamSeason.website`, `Team.latest*`, or current observation values. Promoting archive-derived text to current requires a separate live confirmation or maintainer confirmation workflow ([#32](https://github.com/The-Allsparks/ftc-team-analysis/issues/32)).

Proposed TypeScript / Valibot shapes: `src/data/internetArchiveSchema.ts` (not wired into the mega seed).

## Pilot notes (Nevada)

### Search method for known-dead sites

1. Inspected checked-in seed `src/data/nv-ftc-teams.generated.json` (113 Nevada teams).
2. Counted `latestWebsite`: **8 non-null**, **105 null**.
3. Inspected `Team.links` for `liveness === 'dead'`: **0** (scheduled refresh skips website link enrichment, so dead-link annotations are usually absent from the checked-in snapshot).
4. Inspected observations side store website rows: **14** rows covering the **same 8** declared URLs — no superseded former websites.
5. Bounded live HEAD (`curl -I`, descriptive User-Agent, ~2s spacing) of the 7 non-Facebook declared sites: all returned **200** or **301** (alive). Facebook group URL skipped as low-value for site reconstruction.

### Dead-site identification result

**Negative:** No known-dead Nevada team website URLs were identifiable from the seed, observations, or this bounded live check. Null website ≠ proven former site; inventing candidate domains for inactive teams was out of scope.

### Bounded Wayback probes (not a crawl)

With User-Agent `FTC-Team-Analysis-Research/0.1 (+https://github.com/The-Allsparks/ftc-team-analysis; issue-25 pilot)` and multi-second delays:

| Team | Original URL | Availability closest | Notes |
| --- | --- | --- | --- |
| 16091 | `https://twcarobotics.com/` | `20250406175221` (200) | Live site still up |
| 16158 | `https://www.vcsilvercircuits.com/` | `20250912225335` (200) | Live site still up |
| 22774 | `https://ursamajorftc.org/` | `20250914081853` (200) | Live site still up |

CDX `limit=3` for `twcarobotics.com` returned captures from **2020-11-01** onward (earliest in the tiny window: `20201101133314`), confirming multi-year index coverage for at least one Nevada team domain without fetching playback HTML.

**Implication:** IA is useful for **historical depth even when the live site is up**, and would likely help when dead URLs become known (e.g. after link enrichment marks `liveness: dead`). The blocker for a dead-site pilot is **missing former URLs in our data**, not IA API availability.

## Go / no-go recommendation

### Verdict: **Conditional GO** (future optional enrichment only)

| Decision | Scope |
| --- | --- |
| **GO (deferred)** | Optional, opt-in job to resolve Wayback captures for **known** Nevada team URLs (especially `liveness: dead` or superseded website observations), store archive provenance fields, label facts as archived |
| **NO-GO** | Full historical backfill of all teams; scheduled default IA traffic; treating archive text as current FTC Events truth; bulk downloading WARCs into git |
| **Prerequisite** | Prefer running after link enrichment / website observations expose former or dead URLs; keep privacy filters ([privacy.md](privacy.md)) |

### Terms constraints (must hold if implemented later)

1. Descriptive User-Agent; bound concurrency; honor `429`.
2. Attribute Internet Archive / Wayback; no claim of ownership of archived third-party pages.
3. Residual ToS / redistribution risk remains uncleared.
4. Fail soft: IA outages must not corrupt the identity-critical seed.
5. Never enable on scheduled data-refresh by default.
6. Do not store student PII found in archived pages; apply the same link/PII filters as live discovery.

## Fixtures

Synthetic Availability + CDX shapes live in `src/lib/fixtures/internet-archive-sample.json` with a small parser stub (`src/lib/internetArchive.ts`) and tests. Fixtures are **labeled synthetic** and must not be treated as production IA payloads.

## Architecture / ingestion (one-liners)

- **Architecture:** IA is a future optional historical enrichment source for public team websites — not on the identity-critical path and not proxied today.
- **Ingestion:** Not wired. When built later, opt-in only, Availability/CDX first, fail-soft `sourceChecks`, never scheduled by default.

## Related

- [field-evidence.md](field-evidence.md) — live observation model (#29); IA remains non-goal for seed history rewrite
- [attribution.md](attribution.md)
- [architecture.md](architecture.md)
- [ingestion.md](ingestion.md)
- [responsible-crawling.md](responsible-crawling.md)
- [privacy.md](privacy.md)
- [link-discovery.md](link-discovery.md) — live `liveness` flags feed future dead-URL queues
- Parent epic [#1](https://github.com/The-Allsparks/ftc-team-analysis/issues/1)
