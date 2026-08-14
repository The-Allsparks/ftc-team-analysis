# Nevada FTC Team Analysis

Local React/Vite explorer for Nevada-region FIRST Tech Challenge teams across seasons `2025` through `2019`.

## Setup

Use **Node 24** (see `.nvmrc`) and **npm 11+**. Compatibility floor: Node `^20.19 || >=22.12` (Vite 8). Dependency ranges and upgrade policy: [docs/dependency-policy.md](docs/dependency-policy.md).

Install from the lockfile, then run:

```bash
npm ci
npm test
npm run pull:data
npm run dev
```

Future CI and Cloudflare Pages builds should consume `.nvmrc` and install with `npm ci`.

The app reads `src/data/nv-ftc-teams.generated.json`. A current-season seed file is checked in so the interface has data immediately, and `npm run pull:data` refreshes it from public FTC Events pages. At startup the app validates that snapshot against runtime schema version `1` (`src/data/generatedSeedSchema.ts`). Invalid team records are quarantined with path/team-number diagnostics; a broken envelope (not an object, missing `teams`, empty or all-invalid teams) fails closed instead of showing an empty directory. `npm run validate:data` runs the same check from the CLI. The current seed omits `schemaVersion` and is treated as version 1. `npm test` runs Vitest against local parser fixtures in `src/lib/fixtures/` and does not hit live FTC Events or FIRST. Before overwriting the seed, `pull:data` refuses a candidate that is not an object with a `teams` array, has 0 teams, or drops below 50% of the previous team count when that previous snapshot had at least 10 teams.

## Data Sources

- FIRST Team/Event Search: https://www.firstinspires.org/team-event-search?content=teams&season=2025&country=United+States&state=NV&programs=FIRST+Tech+Challenge&indices=teams_*
- FTC Events Nevada region pages: https://ftc-events.firstinspires.org/2025/region/USNV
- FTC Events public team pages: https://ftc-events.firstinspires.org/2025/team/16158
- FTC Events API information: https://ftc-events.firstinspires.org/services/API

## Public-Only Limitation

The official FTC Events API requires a username and token, so this project does not call it. Organization data is parsed from public sponsor text when available, and detailed event/award data is limited to what public FTC Events team pages expose.

## Team avatars

Official FIRST team avatars (40×40 PNG uploads from [FTC Scoring](https://ftc-scoring.firstinspires.org)) are resolved at runtime from the same public composed stylesheet FTC Event Web uses (`/avatars/composed/{year}.css` on FTC Scoring, proxied in dev). Teams without an approved avatar show initials in the UI. Avatar availability varies by season and is not stored in the generated team JSON.
