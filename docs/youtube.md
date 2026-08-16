# YouTube channel and video verification

Optional verification and metadata enrichment for **public** team YouTube channels, videos, and playlists already discovered via website crawl, Open Alliance, or Game Manual 0.

Related: [ingestion.md](ingestion.md), [link-discovery.md](link-discovery.md), [open-alliance.md](open-alliance.md), [gm0.md](gm0.md), [github-repos.md](github-repos.md), [privacy.md](privacy.md), [responsible-crawling.md](responsible-crawling.md), [deployment.md](deployment.md).

## Role

YouTube enrichment is **verification-first**:

- Collects candidate YouTube URLs from existing `Team.links`
- Stores additive `Team.videoResources` with URL, kind (`channel` / `video` / `playlist`), title, publishedAt, seasonHint, and **evidence**
- Shown in the team detail **Video resources** panel with attribution
- **Not** used as competitive records

## API key handling (critical)

| Rule | Detail |
| --- | --- |
| Never commit keys | No `YOUTUBE_API_KEY` in git, fixtures, or docs examples as real secrets |
| Server-side only | Set `YOUTUBE_API_KEY` in the pull process environment (local shell or GitHub Actions secret) |
| CI default | Works **without** a key — declared-link verification / offline ownership rules only |
| Browser / Worker | Enrichment runs in `pull:data` (Node). Do **not** expose the key to the SPA. If a future browser path needs YouTube, extend the Cloudflare Worker allowlist and keep the key in Worker secrets — not in client bundles |

Optional Data API metadata (`channels.list` / `videos.list` / `playlists.list`) runs only when `YOUTUBE_API_KEY` is present. Without a key, declared URLs are still stored with ownership evidence.

## Ownership rule (critical)

**Never auto-accept name-only matches.** Common team names collide across regions and fan channels.

| Evidence path | Result |
| --- | --- |
| URL declared on team website / On The Web / OA / GM0 | Accepted (high trust) |
| Search hit with team number **and** team-name token corroboration | Accepted (medium; opt-in search only) |
| Channel/video titled only with a shared name (e.g. “Sparks”) | **Rejected** |
| Title/description mentions only the team number | **Rejected** |

## Quota and caching

YouTube Data API v3 uses a daily unit quota (default free tier **10,000 units/day** — confirm in Google Cloud Console).

| Method | Typical cost |
| --- | --- |
| `search.list` | **100** units |
| `channels.list` / `videos.list` / `playlists.list` | **1** unit each |

Strategy implemented in code:

1. Prefer verifying URLs already on `Team.links` (no search)
2. In-memory `YoutubeResponseCache` (default 24h TTL) keyed by resource id/handle
3. Fail-soft on quota / rate limits: HTTP **403** (quota) and **429** map to `SourceResult` `rate_limited`; pull records a failed `sourceChecks` row and still keeps declared-link resources without metadata
4. Broad `search.list` is **not** run by scheduled refresh

## How to run

Off by default (CI / scheduled refresh stay light):

```bash
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-open-alliance --enrich-gm0 --enrich-youtube
```

With optional metadata (local or Actions secret):

```powershell
$env:YOUTUBE_API_KEY = "your-server-side-key"
npm run pull:data -- --mode=current --skip-link-enrichment --enrich-youtube
```

Typical order: discover links (or OA/GM0) first, then `--enrich-youtube` to verify.

Behavior:

1. Scan each team’s `links` for public YouTube channel / video / playlist URLs
2. Record evidence kind (`declared-link` / `open-alliance` / `gm0-gallery`)
3. If `YOUTUBE_API_KEY` is set, optionally fetch snippet metadata (cached)
4. Fail soft: YouTube errors are recorded in `sourceChecks` and do not abort the FTC Events seed

## Proxy note

Production live proxies today cover FTC Events, FTCScout, Portfolio Lab, and FTC Scoring ([deployment.md](deployment.md)). YouTube Data API calls for enrichment are intended for **server-side** `pull:data` (Actions / maintainer machine). Extending the Cloudflare Worker allowlist for browser-safe YouTube would be a separate change and must still keep the API key out of the client.

## Privacy

- Public channels / videos / playlists only
- Reuses link privacy filters where applicable
- See [privacy.md](privacy.md)

## Schema

Optional additive field on `Team`:

```ts
videoResources?: TeamVideoResource[]
```

Older seeds without the field remain valid (Valibot `optional`).

## Code

| Path | Role |
| --- | --- |
| `src/lib/youtubeVideos.ts` | Parse URLs, ownership gate, cache, Data API fetch, apply enrichment |
| `src/lib/youtubeVideos.test.ts` | Name-only rejection, declared positive paths, quota → SourceResult |
| `scripts/pull-public-ftc-data.ts` | `--enrich-youtube` wiring |
