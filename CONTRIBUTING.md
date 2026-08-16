# Contributing

Thanks for helping improve Nevada FTC Team Analysis. This project is a trust-first public team directory maintained by [The Allsparks](https://www.theallsparks.org/).

## Before you start

1. Read the [v1 milestone](docs/v1-milestone.md). New predictive or comparative analytics that over-claim on unresolved identity or provenance may be rejected until readiness criteria are met.
2. Review [attribution](docs/attribution.md), [privacy](docs/privacy.md), and [responsible crawling](docs/responsible-crawling.md). We use **public team data only** — do not gather, store, or submit student PII.
3. Security reports: see [SECURITY.md](SECURITY.md).

## Development setup

Use Node 24 (`.nvmrc`) and npm 11+. From a clean checkout:

```bash
npm ci
npm test
npm run pull:data
npm run dev
```

Dependency ranges and upgrade policy: [docs/dependency-policy.md](docs/dependency-policy.md). Architecture, ingestion, and deployment overviews: [docs/architecture.md](docs/architecture.md), [docs/ingestion.md](docs/ingestion.md), [docs/deployment.md](docs/deployment.md).

## Pull requests

- Prefer small, focused PRs that reference an issue when one exists.
- Run `npm test`, `npm run build`, and `npm run validate:data` before requesting review when your change touches code or the seed.
- Do not commit secrets, FIRST API credentials, or private contact data.
- Data refreshes that change the checked-in seed should keep publish-guard behavior intact (empty/drop refusals).
- Documentation PRs should keep residual risks honest (especially Portfolio Lab scrape/terms and public FTC HTML) and must not claim legal clearance of upstream terms.

## Data corrections

To correct a public team fact or claim ownership of a listing, open a GitHub issue with the team number and public evidence links. See [docs/privacy.md](docs/privacy.md). A dedicated in-app correction product is tracked separately (#32).

## License

By contributing, you agree that your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
