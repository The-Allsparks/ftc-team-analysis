# Nevada FTC Team Analysis

Local React/Vite explorer for Nevada-region FIRST Tech Challenge teams across seasons `2025` through `2019`.

## Setup

Install Node.js, then run:

```bash
npm install
npm run pull:data
npm run dev
```

The app reads `src/data/nv-ftc-teams.generated.json`. A current-season seed file is checked in so the interface has data immediately, and `npm run pull:data` refreshes it from public FTC Events pages.

## Data Sources

- FIRST Team/Event Search: https://www.firstinspires.org/team-event-search?content=teams&season=2025&country=United+States&state=NV&programs=FIRST+Tech+Challenge&indices=teams_*
- FTC Events Nevada region pages: https://ftc-events.firstinspires.org/2025/region/USNV
- FTC Events public team pages: https://ftc-events.firstinspires.org/2025/team/16158
- FTC Events API information: https://ftc-events.firstinspires.org/services/API

## Public-Only Limitation

The official FTC Events API requires a username and token, so this project does not call it. Organization data is parsed from public sponsor text when available, and detailed event/award data is limited to what public FTC Events team pages expose.

## Team avatars

Official FIRST team avatars (40×40 PNG uploads from [FTC Scoring](https://ftc-scoring.firstinspires.org)) are resolved at runtime from the same public composed stylesheet FTC Event Web uses (`/avatars/composed/{year}.css` on FTC Scoring, proxied in dev). Teams without an approved avatar show initials in the UI. Avatar availability varies by season and is not stored in the generated team JSON.
