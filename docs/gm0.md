# Game Manual 0 gallery enrichment

Optional linking of Nevada teams to curated [Game Manual 0](https://gm0.org/) gallery resources (CAD, code, portfolios, videos).

Related: [ingestion.md](ingestion.md), [link-discovery.md](link-discovery.md), [attribution.md](attribution.md), [responsible-crawling.md](responsible-crawling.md).

## Role

GM0 gallery data is **enrichment only**:

- Attached as `TeamLink` rows pointing at **external resource URLs** plus the public gallery page
- Shown in Useful Links with visible `Game Manual 0 (gallery)` attribution
- **Copyrighted GM0 prose is linked, not copied** into the seed
- **Not** used as canonical competitive records, awards, ranks, or OPR

## Confirmed vs inferred

| Item | Status |
| --- | --- |
| Gallery RST at `gamemanual0/gm0` `source/docs/appendix/gallery.rst` | **Confirmed** |
| Rendered page at [gm0.org gallery](https://gm0.org/en/latest/docs/appendix/gallery.html) | **Confirmed** |
| Headings typically `NNNNN Team Name` with outbound Sphinx links | **Confirmed** |
| Exact leading team number is reliable identity evidence | **Confirmed** (parser + fixture tests) |
| Name-only headings are safe to auto-match | **Rejected** (ambiguous; false-match tests) |
| GitHub org search / deep verification of linked repos | Declared gallery GitHub URLs may be verified via [`--enrich-github`](github-repos.md) ([#22](https://github.com/The-Allsparks/ftc-team-analysis/issues/22)) |
| YouTube search / deep verification of linked media | Declared gallery YouTube URLs may be verified via [`--enrich-youtube`](youtube.md) ([#23](https://github.com/The-Allsparks/ftc-team-analysis/issues/23)) |

## Matching rule

Association requires an **exact numeric team number** at the start of the gallery heading, equal to the Nevada seed `team.number`.

Rejected:

- Name-only headings (`Royal Ghostbusters`, shared nicknames)
- Prefixed tokens (`FTC16158 …`)
- Fuzzy suffixes (`16158-B …`)
- Any fuzzy / string-similarity name match without a number

`ownershipConfidence` is `high` when the heading number matches exactly.

## How to run

Off by default (CI / scheduled refresh stay light):

```bash
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-gm0
```

Behavior:

1. One public GET of the gallery RST from GitHub raw (`gallery.rst` only — not the whole GM0 book)
2. Parse season / team headings + resource URLs; skip ambiguous headings
3. Upsert links for exact Nevada team-number matches with GM0 attribution + evidence
4. Fail soft: GM0 errors are recorded in `sourceChecks` and do not abort the FTC Events seed

## Privacy / copyright / crawling

- Bounded single-file fetch; no GM0 book mirror
- Store outbound URLs + gallery page link; do not ingest long copyrighted tutorial prose
- Reuses link privacy filters (`isAllowedPublicTeamLink`) before storage
- See [privacy.md](privacy.md), [attribution.md](attribution.md), and [responsible-crawling.md](responsible-crawling.md)

## Code

| Path | Role |
| --- | --- |
| `src/lib/gm0Gallery.ts` | Parse RST/HTML, exact match, map to `TeamLink`, optional fetch |
| `src/lib/gm0Gallery.test.ts` | Fixture + false-match / attribution tests |
| `src/lib/fixtures/gm0-gallery.rst` | Small synthetic RST excerpt |
| `src/lib/fixtures/gm0-gallery.html` | Small Sphinx-like HTML fragment |
| `scripts/pull-public-ftc-data.ts` | `--enrich-gm0` wiring |
