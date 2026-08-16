# Link discovery

How Nevada FTC Team Analysis finds, normalizes, and scores **public** team websites and resource links during `npm run pull:data` (when link enrichment is enabled).

Related: [privacy.md](privacy.md), [responsible-crawling.md](responsible-crawling.md), [ingestion.md](ingestion.md), [open-alliance.md](open-alliance.md), [gm0.md](gm0.md).

## Sources (bounded)

1. **FTC Events “On The Web”** URLs on public team season pages (highest trust).
2. **Team website homepage** HTML anchors.
3. **robots.txt / sitemap.xml** when present (same-origin `loc` entries only; capped).
4. **Common paths** on the same origin: `/about`, `/sponsors`, `/robots`, `/resources`, `/contact`, `/links`, `/linktree`, and similar hubs.
5. **Linktree-style hubs** (`linktr.ee`, `beacons.ai`, …): outbound public links extracted when the hub is the declared site or linked from it.
6. **Open Alliance (opt-in)** team-declared resources via public API — separate from website crawl; see [open-alliance.md](open-alliance.md).
7. **Game Manual 0 gallery (opt-in)** curated design links via bounded `gallery.rst` fetch — exact team number only; see [gm0.md](gm0.md).
8. **GitHub verification (opt-in)** of `github.com/owner/repo` URLs already on `Team.links` — see [github-repos.md](github-repos.md).

Scheduled Actions continue to prefer `--skip-link-enrichment` and leave `--enrich-open-alliance` / `--enrich-gm0` / `--enrich-github` unset (see [responsible-crawling.md](responsible-crawling.md)).

## Normalization

URLs are normalized before storage:

- `mailto:` / `tel:` / `javascript:` rejected
- `http` upgraded to `https`
- fragments and credentials stripped
- common tracking params removed (`utm_*`, `fbclid`, `gclid`, …)
- trailing slashes normalized

## Ownership confidence

Stored on each `TeamLink` (optional fields; older seeds remain valid):

| Confidence | Typical evidence |
| --- | --- |
| `high` | Declared On The Web URL, or same host as the declared team website |
| `medium` | Linked from a team-related site with team number / robotics corroboration |
| `low` | Linked from a crawled public page without strong corroboration |

`confirmationState` defaults to `unconfirmed` (team claim workflow is [#32](https://github.com/The-Allsparks/ftc-team-analysis/issues/32)).

## Dead-link detection

When enrichment runs with liveness checks enabled, each kept URL is probed (`HEAD`, then `GET` fallback) and annotated with `liveness` (`alive` \| `dead` \| `unknown`), `httpStatus`, and `lastCheckedAt`. **Dead On The Web URLs are retained** with status flags rather than dropped, so operators can see stale declarations.

## Privacy enforcement (collectors)

Collectors **must not** store personal student accounts or personal contact info. Enforced in `src/lib/linkDiscovery.ts`:

- Reject `mailto:` and non-http(s) schemes
- Reject LinkedIn `/in/` personal profiles and Facebook `profile.php` URLs
- Reject social handles that look like personal names (`first.last`, `FirstLast`, common given-name-only handles) **unless** the path/handle includes the team number or robotics/FTC signals

See [privacy.md](privacy.md) for the broader public-data stance (#31).

## Coverage

Measurable coverage of teams with ≥1 verified public link improves when operators run `pull:data` **without** `--skip-link-enrichment`. Fixture tests under `src/lib/linkDiscovery.test.ts` demonstrate additional extractions links from sitemap + hub pages without a full Nevada live re-crawl in CI.

## Out of scope here

- YouTube Data API deep discovery ([#23](https://github.com/The-Allsparks/ftc-team-analysis/issues/23))
- Onshape Public Documents crawling ([#26](https://github.com/The-Allsparks/ftc-team-analysis/issues/26)) — declared Onshape URLs from websites / OA / GM0 are in scope for collectors; mining Public Documents is not (see [onshape.md](onshape.md))
- Team-submitted link corrections ([#32](https://github.com/The-Allsparks/ftc-team-analysis/issues/32))
- Full `Team.links` observation history (deferred; see [field-evidence.md](field-evidence.md))

GitHub repo **verification** of already-discovered URLs is covered in [github-repos.md](github-repos.md) (`--enrich-github`).
