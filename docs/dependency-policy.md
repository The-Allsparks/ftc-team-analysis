# Dependency update policy

The lockfile (`package-lock.json`) is the source of truth for installs. Use `npm ci` for a lockfile-faithful install. Do not use the literal `latest` range in `package.json`.

## Toolchain

- Intended Node version: `.nvmrc` (`24`). Local development was verified on Node 24.17.0 with npm 11.13.0.
- Compatibility floor: `package.json` `engines` (`node`: `^20.19.0 || >=22.12.0`, matching Vite 8; `npm`: `>=11`).
- CI (`.github/workflows/ci.yml`) consumes `.nvmrc` rather than an unpinned image or an ad-hoc `NODE_VERSION`, and installs with `npm ci`. Future Cloudflare Pages builds should do the same.

## Dependabot

Dependabot opens weekly npm PRs. Minor and patch updates are grouped (production vs development). Major updates are ungrouped so each major can be reviewed on its own.

## Major upgrades

A major-version bump requires:

1. Review of the upstream changelog and breaking changes.
2. `npm test` and `npm run build` passing on the updated lockfile.
3. Lockfile updates produced by npm (`npm install` / Dependabot), not hand-edits.
4. Human review. Do not auto-merge majors.

Do not silently accept a major upgrade because a caret range would allow it; the lockfile pins the installed tree until an explicit update PR lands.
