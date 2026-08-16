# Canonical identifiers for locations, schools, and organizations

Issue [#16](https://github.com/The-Allsparks/ftc-team-analysis/issues/16). Identity resolution for free-text location and organization fields — **fail-soft**, no invented external IDs, no paid geocoding APIs, no student PII.

## Research conclusion (needs-research)

| Topic | Status | Choice |
| --- | --- | --- |
| Country / subdivision codes | **Confirmed** | [ISO 3166-1](https://www.iso.org/iso-3166-country-codes.html) alpha-2 for country; [ISO 3166-2](https://www.iso.org/iso-3166-country-codes.html) for subdivision (e.g. `US-NV`). Parsed offline from city/state/country strings when confident. |
| USPS state abbreviation | **Confirmed** | Stored on `NormalizedLocation.stateCode` as postal state (e.g. `NV`). **Not** event-region membership. |
| Public U.S. schools / districts | **Confirmed** | [NCES CCD](https://nces.ed.gov/ccd/ccddata.asp) school ID (`nces-sch`, NCESSCH) and LEA/district ID (`nces-lea`) when a curated catalog match is unique and evidenced. |
| Private U.S. schools | **Confirmed** | [NCES PSS](https://nces.ed.gov/surveys/pss/) school ID (`nces-pss`) when uniquely matched with evidence. |
| Internal org key | **Confirmed** | Stable `internal-slug` + `normalizedName` derived from display name (always safe; never requires network). |
| Aliases / historical names | **Confirmed** | Representable via `NameAlias` on affiliations (`alias` \| `historical` \| `normalized`). |
| Registered location vs region | **Confirmed** | `TeamSeason.registeredLocation` / city–state–country are **postal/registered** location. Envelope `regionCode` and season `region` / `league` are **event-region membership**. Cross-state Nevada league teams keep postal `stateCode` (e.g. `CA`) while `regionCode` stays `USNV`. |
| OSM / Nominatim place IDs | **Deferred** | Namespace `osm` reserved; no live Nominatim bulk geocode in CI. Optional future cache with explicit evidence. |
| Lat/long | **Deferred** | `geo` stubs exist (`lat`/`lon`/`osmId`/`precision`) but stay empty unless confidently sourced later. |
| Automated NCES bulk match | **Deferred** | Full CCD download + fuzzy matcher needs human review queue; quarantine path exists for ambiguous hits. |
| Paid Places / geocoders | **Out of scope** | Never. |

**Privacy:** Organization and school identifiers refer to **institutions**, not students. Do not store student ID numbers, home addresses, or other PII (see [privacy.md](privacy.md)).

## Schema (additive, v1)

Optional fields — older seeds without them still validate.

### `NormalizedLocation` (`TeamSeason.registeredLocation`)

| Field | Meaning |
| --- | --- |
| `normalizedName` | Casefolded / whitespace-collapsed display string |
| `city` / `stateCode` / `countryCode` / `subdivisionCode` | Structured postal parts when parsed |
| `rawLocation` | Original free-text location |
| `geo` | Optional stubs only (never invented) |
| `identifiers` | Optional `CanonicalIdentifier[]` (ISO, etc.) |

### `TeamAffiliation` identity fields

| Field | Meaning |
| --- | --- |
| `normalizedName` | Normalization of `name` |
| `slug` | Stable internal slug |
| `identifiers` | External IDs **only when matched** (`nces-sch`, `nces-lea`, `nces-pss`, …) |
| `aliases` | Alias / historical / normalized name rows |
| `identityMatchStatus` | `unmatched` \| `matched` \| `ambiguous` \| `quarantined` |

### `CanonicalIdentifier`

`idNamespace` + `canonicalId`, plus optional `confidence`, `evidence`, `source`.

## Runtime behavior

1. **Derive-on-read:** `enrichSeasonCanonicalIdentity` / `affiliationsWithCanonicalIdentity` fill normalized fields from existing seed strings without rewriting JSON.
2. **Opt-in persist:** `npm run pull:data -- --enrich-canonical-ids` writes enriched `registeredLocation` and affiliation identity fields into the snapshot (still fail-soft; unmatched rows get slug/normalizedName only).
3. **Catalog:** Small curated allowlist in `src/data/ncesSchoolCatalog.ts`. Ambiguous multi-hits → `quarantined` / `ambiguous` with **no** external ID.
4. **Relationship graph:** Organization nodes may carry `slug` / NCES refs when present; node ids remain name-slug based.

## Non-goals

- Live Nominatim bulk geocoding of all Nevada teams in CI
- Paid Google Places
- Rewriting seed JSON with guessed IDs
- Student profiling (#27 remains blocked until aggregate context is designed carefully)
