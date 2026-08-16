import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataChangeReport, formatDataChangeReportMarkdown } from '../src/data/dataChangeReport';
import { assertSafeToPublishGeneratedData } from '../src/data/publishGuard';
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
    url: `${BASE_URL}/services/API`,
    note: 'The authenticated API remains the better source for complete structured data, but this project is public-only for now.',
  },
  {
    label: 'Open Alliance (FTC team-declared resources)',
    url: 'https://theopenalliance.org/ftc',
    note: 'Optional enrichment via public GET /teams/ftc. Exact team-number match only; original resource URLs preserved. Not used as official competitive results. Enabled with --enrich-open-alliance.',
  },
];

const DEFAULT_LIMITATIONS: string[] = [
  'FIRST Team/Event Search is used as a registration seed when FTC Events Nevada region pages are unavailable for a season.',
  'Organization is parsed from the public season sponsor line when available because the authenticated team API is not being used.',
  'Organization strings are also split into typed affiliations (school, sponsors, community/host) with confidence flags; the raw organization text is retained. Ambiguous parses stay unconfirmed/low confidence.',
  'Core season facts support optional per-field evidence. Cross-refresh history is stored in nv-ftc-team-observations.generated.json (append-only side store); the checked-in mega seed omits evidence arrays and the UI derives or joins provenance on read. Organization affiliations remain a parallel model. Social/resource Team.links history is not yet tracked.',
  'Match-level details are limited to what appears on public team pages. The script stores event participation, ranks, records, playoff summaries, awards, per-event points, and official league RS/rank where visible.',
  'External team links are discovered from public FTC On The Web URLs plus a bounded crawl of each team website (homepage, robots/sitemap when present, and common About/Sponsors/Robots/Resources/Contact/Links paths, including Linktree-style hubs). URLs are normalized, checked for liveness, and stored with ownership confidence + evidence. Private student social accounts and personal contact info are filtered out (see docs/privacy.md and docs/link-discovery.md).',
  'Open Alliance FTC team-declared resources (code, CAD, build threads, media, website) can be attached with --enrich-open-alliance via a single public GET to api.theopenalliance.org/teams/ftc. Matching requires an exact team number; OA awards/stats are not ingested as competitive results (see docs/open-alliance.md). Scheduled refreshes leave this off by default.',
];

async function syncPublicAssets(): Promise<void> {
  await mkdir(dirname(PUBLIC_SEED_PATH), { recursive: true });
  await copyFile(GENERATED_PATH, PUBLIC_SEED_PATH);
  console.log(`Synced public seed to ${PUBLIC_SEED_PATH}`);
  await copyFile(OBSERVATIONS_PATH, PUBLIC_OBSERVATIONS_PATH);
  console.log(`Synced public observations to ${PUBLIC_OBSERVATIONS_PATH}`);
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

  const generatedAt = new Date().toISOString();

  if (mode === 'full') {
    const previous = await loadPrevious();
    const teams = previous
      ? mergePriorEvidenceIntoTeams(previous, pulled.teams)
      : pulled.teams;

    return {
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
  }

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

  return {
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
  } else {
    data = await buildFromNetwork(args.mode, args.skipLinkEnrichment, args.enrichOpenAlliance);
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
