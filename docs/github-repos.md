# GitHub repository verification

Optional verification and metadata enrichment for **public** team GitHub repositories already discovered via website crawl, Open Alliance, or Game Manual 0.

Related: [ingestion.md](ingestion.md), [link-discovery.md](link-discovery.md), [open-alliance.md](open-alliance.md), [gm0.md](gm0.md), [privacy.md](privacy.md), [responsible-crawling.md](responsible-crawling.md).

## Role

GitHub enrichment is **verification-first**:

- Collects candidate `github.com/owner/repo` URLs from existing `Team.links`
- Optionally fetches public REST metadata (description, languages, `pushed_at`)
- Stores additive `Team.codeRepositories` with URL, owner, seasons (if known), robot/controller hint (if known), languages, last activity, and **evidence**
- Shown in the team detail **Code repositories** panel with attribution
- **Not** used as competitive records

## Ownership rule (critical)

**Never infer ownership from team number alone.**

| Evidence path | Result |
| --- | --- |
| URL declared on team website / On The Web / OA / GM0 | Accepted (high trust) |
| Search hit with team number **and** team-name token corroboration | Accepted (medium; opt-in search only) |
| Repo named `12345` / description mentions only the number | **Rejected** (false-positive tests) |

## Rate limits / API stance

- Prefer verifying URLs already discovered — avoids burning unauthenticated GitHub REST quotas
- Unauthenticated `api.github.com` is allowed with fail-soft handling; never commit tokens
- Broad GitHub search is **not** run by scheduled refresh; operators may pass corroborated hits in tests/tools

## How to run

Off by default (CI / scheduled refresh stay light):

```bash
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance --enrich-gm0 --enrich-github
```

Typical order: discover links (or OA/GM0) first, then `--enrich-github` to verify.

Behavior:

1. Scan each team’s `links` for public `github.com/owner/repo` URLs (profiles alone are ignored)
2. Record evidence kind (`declared-link` / `open-alliance` / `gm0-gallery`)
3. Optionally `GET /repos/{owner}/{repo}` (+ languages); skip private repos
4. Fail soft: GitHub errors are recorded in `sourceChecks` and do not abort the FTC Events seed

## Privacy

- Public repositories only; private repos are skipped
- No scraping of personal student GitHub profiles (owner/repo required; profile-only URLs dropped)
- Reuses link privacy filters where applicable
- See [privacy.md](privacy.md)

## Schema

Optional additive field on `Team`:

```ts
codeRepositories?: TeamCodeRepository[]
```

Older seeds without the field remain valid (Valibot `optional`).

## Code

| Path | Role |
| --- | --- |
| `src/lib/githubRepos.ts` | Parse URLs, ownership gate, metadata fetch, apply enrichment |
| `src/lib/githubRepos.test.ts` | Number-only rejection + OA/GM0/declared positive paths |
| `src/lib/fixtures/github-repo-metadata.json` | Mocked REST payload |
| `scripts/pull-public-ftc-data.ts` | `--enrich-github` wiring |
