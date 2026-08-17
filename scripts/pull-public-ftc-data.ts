import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataChangeReport, formatDataChangeReportMarkdown } from '../src/data/dataChangeReport';
import { assertSafeToPublishGeneratedData } from '../src/data/publishGuard';
import { parseGeneratedSeed } from '../src/data/generatedSeedSchema';
import { writeSnapshotTree } from './snapshotTreeWrite';
import { parsePullArgs, PULL_DATA_HELP } from '../src/data/pullArgs';
import {
  GeneratedData,
  RegionEvent,
  SeasonId,
  SourceCheck,
  CURRENT_SEASON,
  SUPPORTED_SEASONS,
  Team,
  TeamLink,
  TeamObservationsData,
  TeamSeason,
} from '../src/data/schema';
import { mergePriorEvidenceIntoTeams, mergeSeasonRefresh } from '../src/data/seasonMerge';
import { parseTeamObservations } from '../src/data/teamObservationsSchema';
import { enrichGeneratedDataCanonicalIdentity } from '../src/lib/canonicalIdentity';
import {
  emptyTeamObservations,
  stripSeasonEvidence,
  syncObservationsFromPull,
} from '../src/lib/teamObservations';
import {
  applyLeagueRankings,
  BASE_URL,
  fetchFirstSearchTeams,
  fetchHtml,
  LeagueRanking,
  LeagueSeed,
  linkPriority,
  mapLimit,
  mergeSeason,
  normalizeExternalUrl,
  parseLeagueRankings,
  parseRegionPage,
  parseTeamSeason,
  refreshLatestFields,
  RegionTeamSeed,
  REGION_CODE,
  seasonFromSeed,
  sleep,
} from '../src/lib/ftcParsers';
import { discoverLinksForWebsite } from '../src/lib/linkDiscovery';
import {
  OPEN_ALLIANCE_API_BASE,
  OPEN_ALLIANCE_FTC_LISTING_URL,
  OPEN_ALLIANCE_SOURCE,
  applyOpenAllianceEnrichment,
  fetchOpenAllianceFtcTeamList,
} from '../src/lib/openAlliance';
import {
  GM0_GALLERY_PAGE_URL,
  GM0_GALLERY_RST_URL,
  GM0_SOURCE,
  applyGm0GalleryEnrichment,
  fetchGm0GalleryRst,
} from '../src/lib/gm0Gallery';
import {
  GITHUB_API_BASE,
  GITHUB_SOURCE,
  applyGithubRepoEnrichment,
} from '../src/lib/githubRepos';
import {
  YOUTUBE_API_BASE,
  YOUTUBE_SOURCE,
  applyYoutubeVideoEnrichment,
  readYoutubeApiKey,
} from '../src/lib/youtubeVideos';
import {
  FIRST_API_BASE_URL,
  FIRST_API_INFO_URL,
  FIRST_API_SOURCE,
  applyFirstApiCompetitiveEnrichment,
  readFirstApiCredentials,
} from '../src/lib/firstEventsApi';

const TEAM_SEARCH_URL = `https://www.firstinspires.org/team-event-search?content=teams&season=${CURRENT_SEASON}&country=United+States&state=NV&programs=FIRST+Tech+Challenge&indices=teams_*`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_PATH = resolve(ROOT, 'src/data/nv-ftc-teams.generated.json');
const OBSERVATIONS_PATH = resolve(ROOT, 'src/data/nv-ftc-team-observations.generated.json');
const PUBLIC_SEED_PATH = resolve(ROOT, 'public/data/nv-ftc-teams.generated.json');
const PUBLIC_OBSERVATIONS_PATH = resolve(ROOT, 'public/data/nv-ftc-team-observations.generated.json');
const REPORT_PATH = resolve(ROOT, 'data-refresh-report.md');

const DEFAULT_SOURCES: GeneratedData['sources'] = [
  {
    label: 'FIRST Team/Event Search',
    url: TEAM_SEARCH_URL,
    note: 'Public search index used as a registration seed when FTC Events Nevada region pages are not yet published for a season.',
  },
  {
    label: 'FTC Events Nevada Region Pages',
    url: `${BASE_URL}/2025/region/${REGION_CODE}`,
    note: 'Public region pages provide team numbers, names, locations, rookie years, and Nevada event lists by season.',
  },
  {
    label: 'FTC Events Public Team Pages',
    url: `${BASE_URL}/2025/team/16158`,
    note: 'Public team pages provide event participation, records visible on the page, sponsors/organization text, and awards.',
  },
  {
    label: 'FTC Events API Information',
    url: FIRST_API_INFO_URL,
    note: 'Authenticated FIRST FTC Events API (Basic auth). Opt-in via --enrich-first-api when FIRST_API_USERNAME + FIRST_API_TOKEN are set server-side; API wins for awards/ranks/records when present. Public HTML remains the default/CI canonical path without secrets. See docs/first-api.md.',
  },
  {
    label: 'Open Alliance (FTC team-declared resources)',
    url: 'https://theopenalliance.org/ftc',
    note: 'Optional enrichment via public GET /teams/ftc. Exact team-number match only; original resource URLs preserved. Not used as official competitive results. Enabled with --enrich-open-alliance.',
  },
  {
    label: 'Game Manual 0 (gallery)',
    url: GM0_GALLERY_PAGE_URL,
    note: 'Optional enrichment via bounded gallery.rst fetch. Exact leading team-number match only; resource URLs and gallery page linked (prose not copied). Enabled with --enrich-gm0.',
  },
  {
    label: 'GitHub (verified public repos)',
    url: 'https://docs.github.com/en/rest',
    note: 'Optional verification of GitHub URLs already discovered (website / Open Alliance / GM0). Stores owner, languages, last activity, and evidence. Ownership never inferred from team number alone. Enabled with --enrich-github. Uses unauthenticated GitHub REST with strict rate limits — prefer verifying known URLs over broad search.',
  },
  {
    label: 'YouTube (verified public media)',
    url: 'https://developers.google.com/youtube/v3',
    note: 'Optional verification of YouTube URLs already discovered (website / Open Alliance / GM0). Stores channel/video/playlist evidence with ownership confidence. Name-only matches are never auto-accepted. Enabled with --enrich-youtube. Declared-link verification works without an API key; optional Data API metadata uses server-side YOUTUBE_API_KEY (never committed). Quota failures surface as source-check failures.',
  },
];

const DEFAULT_LIMITATIONS: string[] = [
  'FIRST Team/Event Search is used as a registration seed when FTC Events Nevada region pages are unavailable for a season.',
  'Organization is parsed from the public season sponsor line when available; --enrich-first-api can overlay competitive awards/ranks/records from the authenticated API when credentials are configured (see docs/first-api.md).',
  'Organization strings are also split into typed affiliations (school, sponsors, community/host) with confidence flags; the raw organization text is retained. Ambiguous parses stay unconfirmed/low confidence.',
  'Core season facts support optional per-field evidence. Cross-refresh history is stored in nv-ftc-team-observations.generated.json (append-only side store); the checked-in mega seed omits evidence arrays and the UI derives or joins provenance on read. Organization affiliations remain a parallel model. Social/resource Team.links history is not yet tracked.',
  'Match-level details default to what appears on public team pages. With --enrich-first-api and server-side FIRST_API_USERNAME/FIRST_API_TOKEN, official awards, event ranks, and qualification records from the FIRST API replace scraped values when present. Scheduled refreshes leave API enrichment off by default.',
  'External team links are discovered from public FTC On The Web URLs plus a bounded crawl of each team website (homepage, robots/sitemap when present, and common About/Sponsors/Robots/Resources/Contact/Links paths, including Linktree-style hubs). URLs are normalized, checked for liveness, and stored with ownership confidence + evidence. Private student social accounts and personal contact info are filtered out (see docs/privacy.md and docs/link-discovery.md).',
  'Open Alliance FTC team-declared resources (code, CAD, build threads, media, website) can be attached with --enrich-open-alliance via a single public GET to api.theopenalliance.org/teams/ftc. Matching requires an exact team number; OA awards/stats are not ingested as competitive results (see docs/open-alliance.md). Scheduled refreshes leave this off by default.',
  'Game Manual 0 gallery resources can be attached with --enrich-gm0 via a single bounded fetch of gallery.rst. Matching requires an exact leading team number on the gallery heading; name-only headings are rejected. Copyrighted GM0 prose is linked (gallery page + outbound URLs), not copied (see docs/gm0.md). Scheduled refreshes leave this off by default.',
  'Public GitHub repositories can be verified with --enrich-github from URLs already present on Team.links (website discovery, Open Alliance, GM0). Metadata (owner, languages, pushed_at, description hints) is fetched fail-soft via unauthenticated GitHub REST when available. Ownership requires evidence beyond the team number alone — number-only search hits are rejected (see docs/github-repos.md). Scheduled refreshes leave this off by default. Public org/team repos only; no private student-account scraping.',
  'Public YouTube channels, videos, and playlists can be verified with --enrich-youtube from URLs already present on Team.links (website discovery, Open Alliance, GM0). Declared-link verification works without YOUTUBE_API_KEY; optional Data API metadata uses a server-side key only (env / Actions secret — never committed). Ownership requires evidence beyond team name alone — name-only search hits are rejected. Quota exhaustion is recorded as a failed source check (see docs/youtube.md). Scheduled refreshes leave this off by default.',
  'Canonical location/organization identity fields (ISO country/subdivision, internal slugs, curated NCES IDs when uniquely matched) can be attached with --enrich-canonical-ids. Offline normalize + allowlist only — no paid geocoders, no invented external IDs, no student PII (see docs/canonical-identifiers.md). Scheduled refreshes leave this off by default; UI can still derive-on-read.',
  'Authenticated FIRST FTC Events API competitive enrichment is opt-in with --enrich-first-api. Credentials (FIRST_API_USERNAME / FIRST_API_TOKEN) stay server-side only — never VITE_*, never committed, never in generated JSON. Without credentials the pull records a fail-soft source check and keeps public HTML canonical (see docs/first-api.md).',
];

async function syncPublicAssets(): Promise<void> {
  await mkdir(dirname(PUBLIC_SEED_PATH), { recursive: true });
  await copyFile(GENERATED_PATH, PUBLIC_SEED_PATH);
  console.log(`Synced public seed to ${PUBLIC_SEED_PATH}`);
  await copyFile(OBSERVATIONS_PATH, PUBLIC_OBSERVATIONS_PATH);
  console.log(`Synced public observations to ${PUBLIC_OBSERVATIONS_PATH}`);

  const raw = JSON.parse(await readFile(GENERATED_PATH, 'utf8')) as unknown;
  const parsed = parseGeneratedSeed(raw);
  if (!parsed.ok) {
    throw new Error(
      `Refusing snapshot tree sync: invalid mega-seed (${parsed.issues.map((i) => i.message).join('; ')})`,
    );
  }
  const built = await writeSnapshotTree(dirname(PUBLIC_SEED_PATH), parsed.data, { previous: raw });
  console.log(
    `Wrote snapshot tree (${built.fileCount} files) for ${built.manifest.teamCount} teams.`,
  );
}

async function loadPreviousObservations(regionCode: string): Promise<TeamObservationsData> {
  try {
    const raw = JSON.parse(await readFile(OBSERVATIONS_PATH, 'utf8')) as unknown;
    const parsed = parseTeamObservations(raw);
    if (parsed.ok) {
      return parsed.data;
    }
    console.warn('Previous observations failed validation; starting a fresh side store.');
  } catch {
    // Missing file is expected on first run.
  }
  return emptyTeamObservations(regionCode);
}

async function enrichTeamLinks(teams: Team[]): Promise<void> {
  await mapLimit(teams, 4, async (team) => {
    const websites = [
      ...new Set(
        (Object.values(team.seasons) as TeamSeason[])
          .map((season) => normalizeExternalUrl(season.website))
          .filter((url): url is string => Boolean(url)),
      ),
    ];
    const links = new Map<string, TeamLink>();

    for (const website of websites) {
      const discoveredLinks = await discoverLinksForWebsite(website, team, { checkLiveness: true });

      for (const link of discoveredLinks) {
        links.set(link.url, link);
      }
    }

    team.links = [...links.values()].sort(
      (a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label),
    );
  });
}

async function enrichOpenAllianceLinks(teams: Team[]): Promise<SourceCheck> {
  const checkedAt = new Date().toISOString();
  const listUrl = `${OPEN_ALLIANCE_API_BASE}/teams/ftc`;

  try {
    const { listings, skippedNonExact } = await fetchOpenAllianceFtcTeamList();
    const result = applyOpenAllianceEnrichment(teams, listings, { retrievedAt: checkedAt });
    console.log(
      `Open Alliance: matched ${result.matchedTeams} teams, added ${result.linksAdded} links` +
        (skippedNonExact ? ` (skipped ${skippedNonExact} non-exact listing rows)` : ''),
    );
    return {
      label: OPEN_ALLIANCE_SOURCE,
      url: listUrl,
      checkedAt,
      ok: true,
      detail: `matched=${result.matchedTeams}; linksAdded=${result.linksAdded}; skippedNonExact=${skippedNonExact}; listing=${OPEN_ALLIANCE_FTC_LISTING_URL}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Open Alliance enrichment failed (continuing without OA links): ${detail}`);
    return {
      label: OPEN_ALLIANCE_SOURCE,
      url: listUrl,
      checkedAt,
      ok: false,
      detail,
    };
  }
}

async function enrichGm0GalleryLinks(teams: Team[]): Promise<SourceCheck> {
  const checkedAt = new Date().toISOString();

  try {
    const { entries, skippedAmbiguous } = await fetchGm0GalleryRst();
    const result = applyGm0GalleryEnrichment(teams, entries, { retrievedAt: checkedAt });
    console.log(
      `GM0 gallery: matched ${result.matchedTeams} teams, added ${result.linksAdded} links` +
        (skippedAmbiguous ? ` (skipped ${skippedAmbiguous} ambiguous headings)` : ''),
    );
    return {
      label: GM0_SOURCE,
      url: GM0_GALLERY_RST_URL,
      checkedAt,
      ok: true,
      detail: `matched=${result.matchedTeams}; linksAdded=${result.linksAdded}; skippedAmbiguous=${skippedAmbiguous}; gallery=${GM0_GALLERY_PAGE_URL}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`GM0 gallery enrichment failed (continuing without GM0 links): ${detail}`);
    return {
      label: GM0_SOURCE,
      url: GM0_GALLERY_RST_URL,
      checkedAt,
      ok: false,
      detail,
    };
  }
}

async function enrichGithubRepos(teams: Team[]): Promise<SourceCheck> {
  const checkedAt = new Date().toISOString();

  try {
    const result = await applyGithubRepoEnrichment(teams, { retrievedAt: checkedAt });
    console.log(
      `GitHub repos: matched ${result.matchedTeams} teams, added ${result.reposAdded} repos` +
        ` (candidates=${result.candidatesSeen}; rejectedNumberOnly=${result.rejectedNumberOnly}; skipped=${result.skippedPrivateOrInvalid})`,
    );
    return {
      label: GITHUB_SOURCE,
      url: GITHUB_API_BASE,
      checkedAt,
      ok: true,
      detail: `matched=${result.matchedTeams}; reposAdded=${result.reposAdded}; candidates=${result.candidatesSeen}; rejectedNumberOnly=${result.rejectedNumberOnly}; skippedPrivateOrInvalid=${result.skippedPrivateOrInvalid}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`GitHub repo enrichment failed (continuing without verified repos): ${detail}`);
    return {
      label: GITHUB_SOURCE,
      url: GITHUB_API_BASE,
      checkedAt,
      ok: false,
      detail,
    };
  }
}

async function enrichYoutubeVideos(teams: Team[]): Promise<SourceCheck> {
  const checkedAt = new Date().toISOString();
  const apiKey = readYoutubeApiKey(process.env);

  try {
    const result = await applyYoutubeVideoEnrichment(teams, {
      retrievedAt: checkedAt,
      apiKey,
    });
    console.log(
      `YouTube media: matched ${result.matchedTeams} teams, added ${result.resourcesAdded} resources` +
        ` (candidates=${result.candidatesSeen}; rejectedNameOnly=${result.rejectedNameOnly}; apiCalls=${result.apiCalls}; cacheHits=${result.cacheHits}` +
        `; key=${apiKey ? 'present' : 'absent'})`,
    );

    if (result.apiFailure && !result.apiFailure.ok) {
      return {
        label: YOUTUBE_SOURCE,
        url: YOUTUBE_API_BASE,
        checkedAt,
        ok: false,
        detail: `state=${result.apiFailure.state}; ${result.apiFailure.diagnostics}; matched=${result.matchedTeams}; resourcesAdded=${result.resourcesAdded}; rejectedNameOnly=${result.rejectedNameOnly}`,
      };
    }

    return {
      label: YOUTUBE_SOURCE,
      url: YOUTUBE_API_BASE,
      checkedAt,
      ok: true,
      detail: `matched=${result.matchedTeams}; resourcesAdded=${result.resourcesAdded}; candidates=${result.candidatesSeen}; rejectedNameOnly=${result.rejectedNameOnly}; apiCalls=${result.apiCalls}; cacheHits=${result.cacheHits}; apiKey=${apiKey ? 'present' : 'absent'}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`YouTube enrichment failed (continuing without verified video resources): ${detail}`);
    return {
      label: YOUTUBE_SOURCE,
      url: YOUTUBE_API_BASE,
      checkedAt,
      ok: false,
      detail,
    };
  }
}

async function enrichFirstApiCompetitive(teams: Team[]): Promise<SourceCheck> {
  const checkedAt = new Date().toISOString();
  const credentials = readFirstApiCredentials(process.env);

  try {
    const result = await applyFirstApiCompetitiveEnrichment(teams, {
      credentials,
      delayMs: credentials ? undefined : 0,
    });
    const credsLabel = credentials ? 'present' : 'absent';
    console.log(
      `FIRST API: seasonsTouched=${result.seasonsTouched}; awardsReplaced=${result.awardsReplaced};` +
        ` ranksUpdated=${result.eventsRankUpdated}; recordsUpdated=${result.recordsUpdated};` +
        ` apiCalls=${result.apiCalls}; credentials=${credsLabel}`,
    );

    if (!result.result.ok) {
      return {
        label: FIRST_API_SOURCE,
        url: FIRST_API_BASE_URL,
        checkedAt,
        ok: false,
        detail: `state=${result.result.state}; ${result.result.diagnostics}; awardsReplaced=${result.awardsReplaced}; ranksUpdated=${result.eventsRankUpdated}; apiCalls=${result.apiCalls}; credentials=${credsLabel}`,
      };
    }

    return {
      label: FIRST_API_SOURCE,
      url: FIRST_API_BASE_URL,
      checkedAt,
      ok: true,
      detail: `enrichedTeams=${result.result.data.enrichedTeams}; awardsReplaced=${result.awardsReplaced}; ranksUpdated=${result.eventsRankUpdated}; recordsUpdated=${result.recordsUpdated}; apiCalls=${result.apiCalls}; credentials=${credsLabel}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`FIRST API enrichment failed (continuing with public HTML competitive facts): ${detail}`);
    return {
      label: FIRST_API_SOURCE,
      url: FIRST_API_BASE_URL,
      checkedAt,
      ok: false,
      detail,
    };
  }
}

type SeasonPullResult = {
  seasonsPulled: SeasonId[];
  seeds: RegionTeamSeed[];
  regionEvents: Map<string, RegionEvent>;
  leagueSeeds: Map<string, LeagueSeed>;
  sourceChecks: SourceCheck[];
};

async function pullSeasonCatalog(seasons: readonly SeasonId[]): Promise<SeasonPullResult> {
  const regionEvents = new Map<string, RegionEvent>();
  const leagueSeeds = new Map<string, LeagueSeed>();
  const seeds: RegionTeamSeed[] = [];
  const seasonsPulled: SeasonId[] = [];
  const sourceChecks: SourceCheck[] = [];

  for (const season of seasons) {
    const url = `${BASE_URL}/${season}/region/${REGION_CODE}`;
    console.log(`Pulling ${url}`);
    const checkedAt = new Date().toISOString();

    try {
      const html = await fetchHtml(url);
      const parsed = parseRegionPage(season, html, REGION_CODE);
      seasonsPulled.push(season);
      seeds.push(...parsed.teams);

      for (const event of parsed.events) {
        regionEvents.set(`${season}:${event.code}`, event);
      }

      for (const league of parsed.leagues) {
        leagueSeeds.set(`${league.season}:${league.name}`, league);
      }

      sourceChecks.push({
        label: `FTC Events region ${REGION_CODE} ${season}`,
        url,
        checkedAt,
        ok: true,
        detail: `${parsed.teams.length} teams, ${parsed.events.length} events, ${parsed.leagues.length} leagues`,
      });
      console.log(`  ${parsed.teams.length} teams, ${parsed.events.length} Nevada events, ${parsed.leagues.length} leagues`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  FTC Events region unavailable for ${season}: ${message}`);

      try {
        console.log(`  Trying FIRST Team Search for ${season}`);
        const searchCheckedAt = new Date().toISOString();
        const searchTeams = await fetchFirstSearchTeams(season, REGION_CODE.slice(2));

        if (searchTeams.length === 0) {
          sourceChecks.push({
            label: `FIRST Team Search ${season}`,
            url: TEAM_SEARCH_URL.replace(`season=${CURRENT_SEASON}`, `season=${season}`),
            checkedAt: searchCheckedAt,
            ok: false,
            detail: `Region failed (${message}); search returned 0 Nevada teams`,
          });
          console.warn(`  no Nevada FTC teams found in FIRST Team Search for ${season}`);
          continue;
        }

        seasonsPulled.push(season);
        seeds.push(...searchTeams);
        sourceChecks.push({
          label: `FIRST Team Search ${season}`,
          url: TEAM_SEARCH_URL.replace(`season=${CURRENT_SEASON}`, `season=${season}`),
          checkedAt: searchCheckedAt,
          ok: true,
          detail: `${searchTeams.length} teams (region fallback after: ${message})`,
        });
        console.log(`  ${searchTeams.length} teams from FIRST Team Search`);
      } catch (searchError) {
        const searchMessage = searchError instanceof Error ? searchError.message : String(searchError);
        sourceChecks.push({
          label: `FTC Events / FIRST Search ${season}`,
          url,
          checkedAt,
          ok: false,
          detail: `Region: ${message}; Search: ${searchMessage}`,
        });
        console.warn(`  FIRST Team Search failed for ${season}: ${searchMessage}`);
      }
    }
  }

  return { seasonsPulled, seeds, regionEvents, leagueSeeds, sourceChecks };
}

async function pullTeamSeasons(
  seeds: RegionTeamSeed[],
  regionEvents: Map<string, RegionEvent>,
  leagueSeeds: Map<string, LeagueSeed>,
): Promise<{ teams: Team[]; sourceChecks: SourceCheck[] }> {
  const leagueRankings = new Map<string, LeagueRanking>();
  const sourceChecks: SourceCheck[] = [];

  for (const league of leagueSeeds.values()) {
    console.log(`Pulling ${league.sourceUrl}#rankings`);
    const checkedAt = new Date().toISOString();
    let rankings: LeagueRanking[] = [];

    try {
      const html = await fetchHtml(league.sourceUrl);
      rankings = parseLeagueRankings(league.season, league.name, html);
      sourceChecks.push({
        label: `League rankings ${league.season} ${league.name}`,
        url: league.sourceUrl,
        checkedAt,
        ok: true,
        detail: `${rankings.length} rankings`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceChecks.push({
        label: `League rankings ${league.season} ${league.name}`,
        url: league.sourceUrl,
        checkedAt,
        ok: false,
        detail: message,
      });
      console.warn(`  skipped league rankings: ${message}`);
    }

    for (const ranking of rankings) {
      leagueRankings.set(`${ranking.season}:${ranking.league}:${ranking.teamNumber}`, ranking);
    }

    console.log(`  ${rankings.length} official league rankings`);
  }

  const teamMap = new Map<number, Team>();
  let teamPageFailures = 0;

  await mapLimit(seeds, 5, async (seed, index) => {
    await sleep(index % 5 === 0 ? 250 : 0);

    try {
      const html = await fetchHtml(seed.sourceUrl);
      const season = parseTeamSeason(seed, html, regionEvents);
      mergeSeason(teamMap, seed.number, season);
    } catch (error) {
      teamPageFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      mergeSeason(teamMap, seed.number, seasonFromSeed(seed, `Could not pull public team page: ${message}`, 'Nevada'));
    }
  });

  sourceChecks.push({
    label: 'FTC Events public team pages',
    url: `${BASE_URL}/${CURRENT_SEASON}/team/16158`,
    checkedAt: new Date().toISOString(),
    ok: teamPageFailures === 0,
    detail:
      teamPageFailures === 0
        ? `Fetched ${seeds.length} team pages`
        : `${teamPageFailures}/${seeds.length} team pages fell back to seed-only rows`,
  });

  const teams = [...teamMap.values()].map(refreshLatestFields).sort((a, b) => a.number - b.number);
  applyLeagueRankings(teams, regionEvents, leagueRankings);
  return { teams, sourceChecks };
}

function seasonsWithData(teams: Team[]): SeasonId[] {
  return [
    ...new Set(teams.flatMap((team) => Object.keys(team.seasons).map((season) => Number(season) as SeasonId))),
  ].sort((a, b) => b - a);
}

async function loadPrevious(): Promise<GeneratedData | null> {
  try {
    const previous = JSON.parse(await readFile(GENERATED_PATH, 'utf8')) as GeneratedData;
    if (!previous || !Array.isArray(previous.teams)) {
      return null;
    }
    return previous;
  } catch {
    return null;
  }
}

async function buildFromNetwork(
  mode: 'current' | 'full',
  skipLinkEnrichment: boolean,
  enrichOpenAlliance: boolean,
  enrichGm0: boolean,
  enrichGithub: boolean,
  enrichYoutube: boolean,
  enrichCanonicalIds: boolean,
  enrichFirstApi: boolean,
): Promise<GeneratedData> {
  const seasonsToPull: readonly SeasonId[] = mode === 'current' ? [CURRENT_SEASON] : SUPPORTED_SEASONS;
  const catalog = await pullSeasonCatalog(seasonsToPull);

  if (catalog.seasonsPulled.length === 0) {
    throw new Error('No public FTC Events region pages were available for the configured seasons.');
  }

  if (mode === 'current' && !catalog.seasonsPulled.includes(CURRENT_SEASON)) {
    throw new Error(
      `Current-season refresh failed: ${CURRENT_SEASON} was not available from FTC Events or FIRST Team Search.`,
    );
  }

  const pulled = await pullTeamSeasons(catalog.seeds, catalog.regionEvents, catalog.leagueSeeds);

  if (!skipLinkEnrichment) {
    console.log('Discovering team website and social/code links');
    await enrichTeamLinks(pulled.teams);
  } else {
    console.log('Skipping team website link enrichment');
  }

  const sourceChecks = [...catalog.sourceChecks, ...pulled.sourceChecks];

  if (enrichOpenAlliance) {
    console.log('Enriching with Open Alliance team-declared resources (exact team number only)');
    sourceChecks.push(await enrichOpenAllianceLinks(pulled.teams));
  } else {
    console.log('Skipping Open Alliance enrichment (pass --enrich-open-alliance to enable)');
  }

  if (enrichGm0) {
    console.log('Enriching with Game Manual 0 gallery resources (exact team number only)');
    sourceChecks.push(await enrichGm0GalleryLinks(pulled.teams));
  } else {
    console.log('Skipping GM0 gallery enrichment (pass --enrich-gm0 to enable)');
  }

  if (enrichGithub) {
    console.log(
      'Verifying public GitHub repos from declared links (ownership requires evidence beyond team number)',
    );
    sourceChecks.push(await enrichGithubRepos(pulled.teams));
  } else {
    console.log('Skipping GitHub repo verification (pass --enrich-github to enable)');
  }

  if (enrichYoutube) {
    console.log(
      'Verifying public YouTube resources from declared links (ownership requires evidence beyond team name alone)',
    );
    sourceChecks.push(await enrichYoutubeVideos(pulled.teams));
  } else {
    console.log('Skipping YouTube verification (pass --enrich-youtube to enable)');
  }

  if (enrichFirstApi) {
    console.log(
      'Enriching competitive awards/ranks/records from authenticated FIRST FTC Events API (HTML remains when API omits fields)',
    );
    sourceChecks.push(await enrichFirstApiCompetitive(pulled.teams));
  } else {
    console.log('Skipping FIRST API enrichment (pass --enrich-first-api to enable; requires server-side credentials)');
  }

  const generatedAt = new Date().toISOString();

  let data: GeneratedData;

  if (mode === 'full') {
    const previous = await loadPrevious();
    const teams = previous
      ? mergePriorEvidenceIntoTeams(previous, pulled.teams)
      : pulled.teams;

    data = {
      generatedAt,
      targetSeasons: seasonsWithData(teams),
      regionCode: REGION_CODE,
      teams,
      regionEvents: [...catalog.regionEvents.values()].sort(
        (a, b) => b.season - a.season || a.code.localeCompare(b.code),
      ),
      sources: DEFAULT_SOURCES,
      limitations: DEFAULT_LIMITATIONS,
      sourceChecks,
    };
  } else {
    const previous = await loadPrevious();
    if (!previous) {
      throw new Error('Current-season merge requires an existing seed at src/data/nv-ftc-teams.generated.json');
    }

    const currentSeason = CURRENT_SEASON;
    const merged = mergeSeasonRefresh(
      previous,
      currentSeason,
      pulled.teams.map(refreshLatestFields),
      [...catalog.regionEvents.values()],
    );

    const teams = merged.teams.map(refreshLatestFields).sort((a, b) => a.number - b.number);

    data = {
      generatedAt,
      targetSeasons: merged.targetSeasons,
      regionCode: previous.regionCode || REGION_CODE,
      regionLabel: previous.regionLabel,
      schemaVersion: previous.schemaVersion,
      teams,
      regionEvents: merged.regionEvents,
      sources: previous.sources?.length ? previous.sources : DEFAULT_SOURCES,
      limitations: previous.limitations?.length ? previous.limitations : DEFAULT_LIMITATIONS,
      sourceChecks,
    };
  }

  if (enrichCanonicalIds) {
    console.log(
      'Enriching registered locations and affiliation identity fields (curated NCES allowlist; no invented IDs)',
    );
    data = enrichGeneratedDataCanonicalIdentity(data);
  } else {
    console.log('Skipping canonical ID enrichment (pass --enrich-canonical-ids to enable)');
  }

  return data;
}

async function main() {
  const args = parsePullArgs(process.argv.slice(2));
  if (args.help) {
    console.log(PULL_DATA_HELP);
    return;
  }

  let previous: GeneratedData | null = null;
  try {
    previous = JSON.parse(await readFile(GENERATED_PATH, 'utf8')) as GeneratedData;
  } catch {
    previous = null;
  }

  let data: GeneratedData;

  if (args.candidateFixture) {
    const fixturePath = resolve(ROOT, args.candidateFixture);
    data = JSON.parse(await readFile(fixturePath, 'utf8')) as GeneratedData;
    if (!data.generatedAt) {
      data.generatedAt = new Date().toISOString();
    }
    console.log(`Loaded candidate fixture from ${fixturePath}`);
    if (args.enrichCanonicalIds) {
      data = enrichGeneratedDataCanonicalIdentity(data);
    }
  } else {
    data = await buildFromNetwork(
      args.mode,
      args.skipLinkEnrichment,
      args.enrichOpenAlliance,
      args.enrichGm0,
      args.enrichGithub,
      args.enrichYoutube,
      args.enrichCanonicalIds,
      args.enrichFirstApi,
    );
  }

  assertSafeToPublishGeneratedData(previous, data);

  const previousStore = await loadPreviousObservations(data.regionCode || REGION_CODE);
  const observations = syncObservationsFromPull({
    previous,
    previousStore,
    candidate: data,
    refreshedSeason: args.candidateFixture ? null : args.mode === 'current' ? CURRENT_SEASON : null,
    retrievedAt: data.generatedAt,
  });
  data = stripSeasonEvidence(data);

  const report = buildDataChangeReport(previous, data);
  const reportMarkdown = formatDataChangeReportMarkdown(report);
  console.log(report.summaryLines.join('\n'));
  console.log(`Observations: ${observations.observations.length} rows in side store`);

  if (args.dryRun) {
    console.log('Dry run: skipped writing seed, observations, and public sync');
    await writeFile(REPORT_PATH, reportMarkdown, 'utf8');
    console.log(`Wrote change report to ${REPORT_PATH}`);
    return;
  }

  await mkdir(dirname(GENERATED_PATH), { recursive: true });
  await writeFile(GENERATED_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await writeFile(OBSERVATIONS_PATH, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_PATH, reportMarkdown, 'utf8');
  console.log(`Wrote ${data.teams.length} teams to ${GENERATED_PATH}`);
  console.log(`Wrote observations to ${OBSERVATIONS_PATH}`);
  console.log(`Wrote change report to ${REPORT_PATH}`);
  await syncPublicAssets();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
